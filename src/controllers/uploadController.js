// controllers/uploadController.js
const cloudinary = require('cloudinary').v2;
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');
const Message = require('../models/Message');
const User = require('../models/User');

// Upload single file
exports.uploadFile = async (req, res) => {
  try {
    console.log('📥 Incoming upload request...');

    if (!req.file) {
      console.log('⚠️ No file found in request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { type, messageId, userId } = req.body;

    console.log('📤 File details:', {
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      uploadType: type,
      messageId,
      userId,
    });

    // Upload to Cloudinary using buffer from memory storage
    console.log('☁️ Uploading to Cloudinary...');
    const cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
      folder: type === 'profile' ? 'profiles' : 'chat_attachments',
      resource_type: 'auto',
    });

    console.log('☁️ Cloudinary upload result:', {
      url: cloudinaryResult.url,
      publicId: cloudinaryResult.publicId,
      width: cloudinaryResult.width,
      height: cloudinaryResult.height,
    });

    // Update chat message attachment
    if (type === 'chat' && messageId) {
      console.log(`💬 Updating message attachment for messageId: ${messageId}`);
      const message = await Message.findById(messageId);

      if (!message) {
        console.log('⚠️ No message found for this messageId');
      } else {
        message.attachment = {
          type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
          url: cloudinaryResult.url,
          filename: req.file.originalname,
          size: req.file.size,
          publicId: cloudinaryResult.publicId,
          mimeType: req.file.mimetype,
          uploadedAt: new Date(),
        };
        await message.save();
        console.log('✅ Message updated successfully');
      }
    }

    // Update user profile picture
    if (type === 'profile' && userId) {
      console.log(`🧑 Updating profile picture for userId: ${userId}`);
      const user = await User.findById(userId);

      if (!user) {
        console.log('⚠️ User not found');
      } else {
        if (user.profilePicture?.publicId) {
          console.log('🗑 Deleting old profile picture:', user.profilePicture.publicId);
          try {
            await deleteFromCloudinary(user.profilePicture.publicId);
            console.log('✅ Old profile picture deleted');
          } catch (err) {
            console.error('❌ Failed to delete old profile picture:', err);
          }
        }

        user.profilePicture = {
          url: cloudinaryResult.url,
          publicId: cloudinaryResult.publicId,
          uploadedAt: new Date(),
        };
        await user.save();

        console.log('✅ Profile picture updated successfully');
      }
    }

    console.log('🎉 Upload successful, sending response...');

    res.json({
      success: true,
      message: 'File uploaded successfully',
      file: {
        url: cloudinaryResult.url,
        publicId: cloudinaryResult.publicId,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
        type: req.file.mimetype.startsWith('image/') ? 'image' : 'file',
        dimensions: cloudinaryResult.width && cloudinaryResult.height
          ? {
            width: cloudinaryResult.width,
            height: cloudinaryResult.height,
          }
          : null,
      },
    });

  } catch (error) {
    console.error('❌ Upload error occurred:', error);

    res.status(500).json({
      success: false,
      error: error.message || 'File upload failed',
    });
  }
};

// Upload multiple files
exports.uploadMultipleFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No files uploaded' });
    }

    const uploadResults = [];

    for (const file of req.files) {
      try {
        const cloudinaryResult = await uploadToCloudinary(file.buffer, {
          folder: 'chat_attachments',
          resource_type: 'auto',
        });

        uploadResults.push({
          success: true,
          file: {
            url: cloudinaryResult.url,
            publicId: cloudinaryResult.publicId,
            originalName: file.originalname,
            size: file.size,
            mimeType: file.mimetype,
            type: file.mimetype.startsWith('image/') ? 'image' : 'file',
          },
        });
      } catch (fileError) {
        console.error(`Error uploading ${file.originalname}:`, fileError);
        uploadResults.push({
          success: false,
          originalName: file.originalname,
          error: fileError.message,
        });
      }
    }

    res.json({
      success: true,
      message: `${uploadResults.filter(r => r.success).length} files uploaded successfully`,
      results: uploadResults,
    });

  } catch (error) {
    console.error('❌ Multiple upload error:', error);
    res.status(500).json({ success: false, error: error.message || 'File upload failed' });
  }
};

// Delete a file
exports.deleteFile = async (req, res) => {
  try {
    const { publicId } = req.params;
    const result = await deleteFromCloudinary(publicId);

    res.json({
      success: result.result === 'ok',
      message: result.result === 'ok' ? 'File deleted successfully' : 'File deletion failed',
    });

  } catch (error) {
    console.error('❌ Delete error:', error);
    res.status(500).json({ success: false, error: error.message || 'File deletion failed' });
  }
};

// Get signed URL for direct Cloudinary uploads
exports.getSignedUploadUrl = async (req, res) => {
  try {
    const timestamp = Math.round(Date.now() / 1000);
    const params = { timestamp, folder: 'chat_attachments' };
    const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET);

    res.json({
      signature,
      timestamp,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      folder: 'chat_attachments',
    });

  } catch (error) {
    console.error('❌ Sign upload error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to generate upload signature' });
  }
};

// router.post('/mark-read', async (req, res) => {
//     try {
//         const { employeeId, messageIds } = req.body;
        
//         await Message.updateMany(
//             { 
//                 _id: { $in: messageIds },
//                 to: employeeId,
//                 readAt: { $exists: false }
//             },
//             { $set: { readAt: new Date() } }
//         );
        
//         res.json({ success: true });
//     } catch (error) {
//         res.status(500).json({ error: error.message });
//     }
// });