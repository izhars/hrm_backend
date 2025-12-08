const Badge = require('../models/Badge');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const path = require('path');

// ✅ Create Badge (Upload to Cloudinary)
exports.createBadge = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a badge image' });
    }

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, { folder: 'badges' });

    // Save to DB
    const badge = await Badge.create({
      name,
      description,
      imageUrl: result.secure_url,
      cloudinaryId: result.public_id,
    });

    // Delete local file after upload
    fs.unlinkSync(req.file.path);

    res.status(201).json({ success: true, data: badge });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server Error', error: err.message });
  }
};

// ✅ Get all badges
exports.getBadges = async (req, res) => {
  try {
    const badges = await Badge.find().sort({ createdAt: -1 });
    res.json({ success: true, count: badges.length, data: badges });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};

// ✅ Delete badge
exports.deleteBadge = async (req, res) => {
  try {
    const badge = await Badge.findById(req.params.id);
    if (!badge) return res.status(404).json({ success: false, message: 'Badge not found' });

    // Delete image from Cloudinary
    await cloudinary.uploader.destroy(badge.cloudinaryId);

    // Remove from DB
    await badge.deleteOne();

    res.json({ success: true, message: 'Badge deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server Error' });
  }
};
