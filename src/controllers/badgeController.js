const Badge = require('../models/Badge');
const { uploadToCloudinary, deleteFromCloudinary } = require('../middleware/upload');

// ✅ Create Badge (Upload to Cloudinary)
exports.createBadge = async (req, res) => {
  try {
    const { name, description } = req.body;

    console.log('Request body:', req.body);
    console.log('Request file exists:', !!req.file);

    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'Please upload a badge image' 
      });
    }

    // Log file details
    console.log('File details:', {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      hasBuffer: !!req.file.buffer,
      bufferLength: req.file.buffer ? req.file.buffer.length : 0
    });

    // Upload buffer to Cloudinary
    let cloudinaryResult;
    try {
      cloudinaryResult = await uploadToCloudinary(req.file.buffer, {
        folder: 'badges',
        resource_type: 'image'
      });
      console.log('Cloudinary upload successful:', cloudinaryResult);
    } catch (cloudinaryError) {
      console.error('Cloudinary upload error:', cloudinaryError);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to upload image to Cloudinary',
        error: cloudinaryError.message 
      });
    }

    // Save to DB
    const badge = await Badge.create({
      name,
      description,
      imageUrl: cloudinaryResult.url,
      cloudinaryId: cloudinaryResult.publicId,
    });

    res.status(201).json({ 
      success: true, 
      message: 'Badge created successfully',
      data: badge 
    });

  } catch (err) {
    console.error('Create badge error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Server Error', 
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Get all badges
exports.getBadges = async (req, res) => {
  try {
    const badges = await Badge.find().sort({ createdAt: -1 });
    res.json({ 
      success: true, 
      count: badges.length, 
      data: badges 
    });
  } catch (err) {
    console.error('Get badges error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch badges',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};

// ✅ Delete badge
exports.deleteBadge = async (req, res) => {
  try {
    const badge = await Badge.findById(req.params.id);
    
    if (!badge) {
      return res.status(404).json({ 
        success: false, 
        message: 'Badge not found' 
      });
    }

    // Delete image from Cloudinary
    if (badge.cloudinaryId) {
      try {
        await deleteFromCloudinary(badge.cloudinaryId);
        console.log('Deleted from Cloudinary:', badge.cloudinaryId);
      } catch (cloudinaryError) {
        console.error('Failed to delete from Cloudinary:', cloudinaryError);
        // Continue with DB deletion even if Cloudinary fails
      }
    }

    // Remove from DB
    await badge.deleteOne();

    res.json({ 
      success: true, 
      message: 'Badge deleted successfully' 
    });

  } catch (err) {
    console.error('Delete badge error:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to delete badge',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
};