// middleware/upload.js
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const AppError = require('../utils/appError');

// --------------------
// Cloudinary Config
// --------------------
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// --------------------
// Upload Configs
// --------------------
const uploadConfigs = {
  profile: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
    maxSize: 5 * 1024 * 1024, // 5MB
    folder: 'profile_picture',
    resourceType: 'image'
  },

  badge: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'],
    mimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
    maxSize: 2 * 1024 * 1024, // 2MB
    folder: 'badges',
    resourceType: 'image'
  },

  expense: {
    extensions: ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.txt'],
    mimeTypes: [
      'image/jpeg', 'image/jpg', 'image/png',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ],
    maxSize: 10 * 1024 * 1024, // 10MB
    folder: 'expenses',
    resourceType: 'auto'
  },

  chat: {
    extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.mp4', '.mp3', '.mov', '.wav'],
    mimeTypes: [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
      'application/pdf',
      'video/mp4', 'video/quicktime',
      'audio/mpeg', 'audio/wav'
    ],
    maxSize: 25 * 1024 * 1024, // 25MB
    folder: 'chat_attachments',
    resourceType: 'auto'
  },

  bulk: {
    extensions: ['.csv', '.json', '.xlsx', '.xls'],
    mimeTypes: [
      'text/csv',
      'application/json',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel'
    ],
    maxSize: 15 * 1024 * 1024, // 15MB
    folder: 'bulk_imports',
    resourceType: 'raw'
  }
};

// --------------------
// Multer Setup
// --------------------
const storage = multer.memoryStorage();

// General file filter (default)
const fileFilter = (req, file, cb) => {
  const uploadType = req.body.type || 'expense';
  const config = uploadConfigs[uploadType];

  console.log(`[UPLOAD] Incoming file: ${file.originalname}, type: ${file.mimetype}, uploadType: ${uploadType}`);

  if (!config) {
    console.log('[UPLOAD] Invalid upload type:', uploadType);
    return cb(new AppError('Invalid upload type', 400));
  }

  const fileExt = path.extname(file.originalname).toLowerCase();

  // Check file extension first
  if (!config.extensions.includes(fileExt)) {
    console.log('[UPLOAD] Invalid file extension:', fileExt);
    return cb(
      new AppError(
        `Invalid file type for ${uploadType}. Allowed: ${config.extensions.join(', ')}`,
        400
      )
    );
  }

  const allowedMimeTypes = [...config.mimeTypes, 'application/octet-stream'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    console.log('[UPLOAD] File accepted');
    cb(null, true);
  } else {
    console.log('[UPLOAD] Invalid MIME type:', file.mimetype);
    cb(
      new AppError(
        `Invalid file type for ${uploadType}. Allowed: ${config.extensions.join(', ')}`,
        400
      )
    );
  }
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // max cap, per-type enforced logically
  }
});

// --------------------
// Specialized Upload Functions
// --------------------

// 1. General upload function with options
const uploadToCloudinary = async (buffer, uploadType = 'expense', options = {}) => {
  console.log(`[CLOUDINARY] Uploading file, type: ${uploadType}`);
  const config = uploadConfigs[uploadType];

  if (!config) {
    throw new Error(`Invalid upload type: ${uploadType}`);
  }

  if (!Buffer.isBuffer(buffer)) {
    console.log('[CLOUDINARY] Invalid buffer');
    throw new Error('Invalid file buffer');
  }

  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: options.folder || config.folder,
        resource_type: options.resource_type || config.resourceType,
        transformation:
          (options.resource_type === 'image' || config.resourceType === 'image')
            ? [{ quality: 'auto', fetch_format: 'auto' }]
            : []
      },
      (error, result) => {
        if (error) {
          console.log('[CLOUDINARY] Upload error:', error);
          return reject(error);
        }

        console.log('[CLOUDINARY] Upload successful:', result.secure_url);
        console.log('[CLOUDINARY] Stored in folder:', options.folder || config.folder);
        
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          resourceType: result.resource_type
        });
      }
    ).end(buffer);
  });
};

// 2. Specialized Expense Upload
const uploadExpenseFile = async (buffer, options = {}) => {
  return uploadToCloudinary(buffer, 'expense', {
    folder: options.folder || 'expenses',
    resource_type: options.resource_type || 'auto',
    ...options
  });
};

// 3. Specialized Chat Upload
const uploadChatAttachment = async (buffer, fileType = 'auto', options = {}) => {
  // Determine resource type based on fileType
  let resourceType = 'auto';
  if (fileType) {
    if (fileType.startsWith('image/')) {
      resourceType = 'image';
    } else if (fileType.startsWith('video/')) {
      resourceType = 'video';
    } else if (fileType.startsWith('audio/')) {
      resourceType = 'video'; // Cloudinary uses 'video' for audio
    } else if (fileType.includes('pdf')) {
      resourceType = 'raw';
    }
  }

  return uploadToCloudinary(buffer, 'chat', {
    folder: 'chat_attachments',
    resource_type: resourceType,
    ...options
  });
};

// 4. Base64 Upload Function (for chat)
const uploadBase64ToCloudinary = async (base64String, options = {}) => {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload(
      base64String,
      {
        folder: options.folder || 'chat_attachments',
        resource_type: options.resource_type || 'auto',
        transformation:
          options.resource_type === 'image' ? [{ quality: 'auto', fetch_format: 'auto' }] : []
      },
      (error, result) => {
        if (error) {
          console.log('[CLOUDINARY] Base64 upload error:', error);
          return reject(error);
        }
        console.log('[CLOUDINARY] Base64 upload successful:', result.secure_url);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          format: result.format,
          bytes: result.bytes,
          width: result.width,
          height: result.height,
          resourceType: result.resource_type
        });
      }
    );
  });
};

// 5. Profile Picture Upload
const uploadProfilePicture = async (buffer, options = {}) => {
  return uploadToCloudinary(buffer, 'profile', {
    folder: 'profile_picture',
    resource_type: 'image',
    ...options
  });
};

// 6. Badge Image Upload
const uploadBadgeImage = async (buffer, options = {}) => {
  return uploadToCloudinary(buffer, 'badge', {
    folder: 'badges',
    resource_type: 'image',
    ...options
  });
};

// 7. Bulk Import Upload
const uploadBulkFile = async (buffer, options = {}) => {
  return uploadToCloudinary(buffer, 'bulk', {
    folder: 'bulk_imports',
    resource_type: 'raw',
    ...options
  });
};

// --------------------
// Helpers
// --------------------
const deleteFromCloudinary = async (publicId) => {
  console.log('[CLOUDINARY] Deleting file:', publicId);
  return cloudinary.uploader.destroy(publicId);
};

// --------------------
// Export
// --------------------
module.exports = {
  // Multer instances
  upload,               // general multer instance
  profileUpload: multer({
    storage,
    fileFilter: createFileFilter('profile'),
    limits: { fileSize: uploadConfigs.profile.maxSize }
  }),
  badgeUpload: multer({
    storage,
    fileFilter: createFileFilter('badge'),
    limits: { fileSize: uploadConfigs.badge.maxSize }
  }),
  chatUpload: multer({
    storage,
    fileFilter: createFileFilter('chat'),
    limits: { fileSize: uploadConfigs.chat.maxSize }
  }),
  expenseUpload: multer({
    storage,
    fileFilter: createFileFilter('expense'),
    limits: { fileSize: uploadConfigs.expense.maxSize }
  }),
  bulkUpload: multer({
    storage,
    fileFilter: createFileFilter('bulk'),
    limits: { fileSize: uploadConfigs.bulk.maxSize }
  }),

  // Upload functions
  uploadToCloudinary,
  uploadExpenseFile,
  uploadChatAttachment,
  uploadBase64ToCloudinary,
  uploadProfilePicture,
  uploadBadgeImage,
  uploadBulkFile,
  
  // Helper
  deleteFromCloudinary,
  
  // Config
  uploadConfigs
};

// Helper function to create file filters for specialized uploads
function createFileFilter(uploadType) {
  return (req, file, cb) => {
    const config = uploadConfigs[uploadType];
    
    console.log(`[UPLOAD ${uploadType.toUpperCase()}] File: ${file.originalname}, type: ${file.mimetype}`);
    
    if (!config) {
      return cb(new AppError(`Invalid upload type: ${uploadType}`, 400));
    }

    const fileExt = path.extname(file.originalname).toLowerCase();
    
    if (!config.extensions.includes(fileExt)) {
      console.log(`[UPLOAD] Invalid file extension for ${uploadType}:`, fileExt);
      return cb(
        new AppError(
          `Invalid file type for ${uploadType}. Allowed: ${config.extensions.join(', ')}`,
          400
        )
      );
    }

    const allowedMimeTypes = [...config.mimeTypes, 'application/octet-stream'];
    
    if (allowedMimeTypes.includes(file.mimetype)) {
      console.log(`[UPLOAD] ${uploadType} file accepted`);
      cb(null, true);
    } else {
      console.log(`[UPLOAD] Invalid MIME type for ${uploadType}:`, file.mimetype);
      cb(
        new AppError(
          `Invalid file type for ${uploadType}. Allowed: ${config.extensions.join(', ')}`,
          400
        )
      );
    }
  };
}