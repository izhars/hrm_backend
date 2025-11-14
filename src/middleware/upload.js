const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Create uploads directory if it doesn't exist
const uploadsDir = 'uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  },
});

// File filter for images only
const fileFilter = (req, file, cb) => {
  const fileExt = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
  const allowedMimeTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
  ];

  // Log for debugging
  console.log('📸 Upload Attempt:', {
    originalname: file.originalname,
    mimetype: file.mimetype,
    extension: fileExt,
  });

  const isExtensionValid = allowedExtensions.includes(fileExt);
  const isMimeTypeValid = allowedMimeTypes.includes(file.mimetype);

  if (isExtensionValid && isMimeTypeValid) {
    console.log('✅ File type accepted');
    cb(null, true);
  } else {
    console.error('❌ Invalid file type:', file.mimetype, fileExt);
    cb(new Error(`Invalid file type. Only ${allowedExtensions.join(', ')} are allowed.`));
  }
};

// Multer upload configuration
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size for profile pictures
  },
  fileFilter: fileFilter,
});

module.exports = upload;
