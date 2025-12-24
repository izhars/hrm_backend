// middleware/upload.js
const multer = require('multer');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Use memory storage instead of disk storage (stores files as buffers)
const storage = multer.memoryStorage();

// File filter based on upload type
const fileFilter = (req, file, cb) => {
  const fileExt = path.extname(file.originalname).toLowerCase();
  const uploadType = req.body.type || 'general';

  let allowedExtensions = [];
  let allowedMimeTypes = [];

  switch (uploadType) {
    case 'profile':
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
      allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      break;

    case 'chat':
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.pdf', '.doc', '.docx', '.txt', '.mp4', '.mp3', '.mov', '.wav'];
      allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'video/mp4', 'video/quicktime', 'audio/mpeg', 'audio/wav'
      ];
      break;

    default:
      allowedExtensions = ['.jpg', '.jpeg', '.png', '.pdf', '.doc', '.docx', '.txt'];
      allowedMimeTypes = [
        'image/jpeg', 'image/jpg', 'image/png',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain'
      ];
  }

  console.log('📁 Upload Attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    extension: fileExt,
    type: uploadType,
  });

  if (allowedExtensions.includes(fileExt) && allowedMimeTypes.includes(file.mimetype)) {
    console.log('✅ File type accepted');
    cb(null, true);
  } else {
    console.error('❌ Invalid file type:', { mimetype: file.mimetype, extension: fileExt });
    cb(new Error(`Invalid file type for "${uploadType}" upload. Allowed extensions: ${allowedExtensions.join(', ')}`));
  }
};

// Multer instance
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB for chat files (videos/audio)
  },
  fileFilter: fileFilter,
});

// Upload buffer to Cloudinary
const uploadToCloudinary = async (buffer, options = {}) => {
  try {
    if (!Buffer.isBuffer(buffer)) {
      throw new Error('Expected a Buffer, received: ' + typeof buffer);
    }

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: options.folder || 'chat_attachments',
          resource_type: options.resource_type || 'auto',
          transformation: options.resource_type === 'image'
            ? [{ quality: 'auto', fetch_format: 'auto' }]
            : [],
          ...options,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );

      uploadStream.end(buffer);
    });

    console.log('✅ Cloudinary upload successful:', {
      url: result.secure_url,
      public_id: result.public_id,
      bytes: result.bytes,
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      bytes: result.bytes,
      width: result.width || undefined,
      height: result.height || undefined,
    };
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    throw new Error(`Failed to upload to Cloudinary: ${error.message}`);
  }
};

// Upload base64 string to Cloudinary (used in Socket.IO chat)
const uploadBase64ToCloudinary = async (base64String, options = {}) => {
  try {
    const base64Data = base64String.replace(/^data:\w+\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    return await uploadToCloudinary(buffer, options);
  } catch (error) {
    console.error('❌ Base64 upload error:', error);
    throw error;
  }
};

// Delete file from Cloudinary
const deleteFromCloudinary = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    console.log('🗑️ Cloudinary delete result:', result);
    return result;
  } catch (error) {
    console.error('❌ Cloudinary delete error:', error);
    throw error;
  }
};

module.exports = {
  upload,                    // Multer instance → use { upload } in routes
  uploadToCloudinary,
  uploadBase64ToCloudinary,
  deleteFromCloudinary,
};