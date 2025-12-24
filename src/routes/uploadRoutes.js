const express = require('express');
const router = express.Router();
const { upload } = require('../middleware/upload'); // Multer
const { protect } = require('../middleware/auth');  // ✅ your JWT middleware
const uploadController = require('../controllers/uploadController');

// Single file
router.post('/upload', protect, upload.single('file'), uploadController.uploadFile);

// Multiple files
router.post('/upload-multiple', protect, upload.array('files', 10), uploadController.uploadMultipleFiles);

// Delete file
router.delete('/delete/:publicId', protect, uploadController.deleteFile);

// Get signed URL
router.get('/sign-upload', protect, uploadController.getSignedUploadUrl);

module.exports = router;
