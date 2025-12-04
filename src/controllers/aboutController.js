// controllers/aboutController.js
const About = require('../models/About');
const TeamMember = require('../models/TeamMember');
const cloudinary = require('cloudinary').v2;

// Get Public About Page Data
// Get Public About Page Data
exports.getAboutInfo = async (req, res) => {
  try {
    const [about, team] = await Promise.all([
      About.findOne(),
      TeamMember.find({ isActive: true })
    ]);

    res.status(200).json({
      success: true,
      data: {
        ...about?.toObject(), // Spread all about data including achievements
        team,
        stats: about?.stats || [],
        timeline: about?.timeline || [],
        achievements: about?.achievements || [] // Explicitly include achievements
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// ADMIN: Create About Content (First Time Only)
exports.createAboutContent = async (req, res) => {
  try {
    const exists = await About.findOne();
    if (exists) {
      return res.status(400).json({
        success: false,
        message: "About content already exists. Use PUT to update."
      });
    }

    const about = await About.create(req.body);
    res.status(201).json({
      success: true,
      data: about
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ADMIN: Update About Content (Anytime)
exports.updateAboutContent = async (req, res) => {
  try {
    const about = await About.findOneAndUpdate(
      {},
      { ...req.body, updatedAt: Date.now() },
      { new: true, runValidators: true }
    );

    if (!about) {
      return res.status(404).json({
        success: false,
        message: "About content not found. Create it first with POST."
      });
    }

    res.json({ success: true, data: about });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ADMIN: Add Team Member + Upload Photo
exports.addTeamMember = async (req, res) => {
  try {
    let imageUrl = null;
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "team",
        width: 400,
        height: 400,
        crop: "fill"
      });
      imageUrl = result.secure_url;
    }

    const member = await TeamMember.create({
      ...req.body,
      imageUrl: imageUrl || req.body.imageUrl
    });

    res.status(201).json({ success: true, data: member });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ADMIN: Update Team Member
exports.updateTeamMember = async (req, res) => {
  try {
    const updates = { ...req.body };

    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: "team",
        width: 400,
        height: 400,
        crop: "fill"
      });
      updates.imageUrl = result.secure_url;
    }

    const member = await TeamMember.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true }
    );

    if (!member) return res.status(404).json({ success: false, msg: "Member not found" });

    res.json({ success: true, data: member });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

// ADMIN: Delete Team Member
exports.deleteTeamMember = async (req, res) => {
  try {
    const member = await TeamMember.findById(req.params.id);
    if (!member) return res.status(404).json({ success: false });

    // Optional: delete image from Cloudinary
    if (member.imageUrl && member.imageUrl.includes('cloudinary')) {
      const publicId = member.imageUrl.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`team/${publicId}`);
    }

    await member.deleteOne();
    res.json({ success: true, msg: "Member deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};


exports.updateTimelineItem = async (req, res) => {
  const { id } = req.params;
  const { title, description, year } = req.body;

  const about = await About.findOne();
  if (!about) return res.status(404).json({ success: false, message: 'About not found' });

  const itemIndex = about.timeline.findIndex(t => t._id.toString() === id);
  if (itemIndex === -1) return res.status(404).json({ success: false, message: 'Timeline item not found' });

  if (title) about.timeline[itemIndex].title = title;
  if (description) about.timeline[itemIndex].description = description;
  if (year) about.timeline[itemIndex].year = year;

  await about.save();
  res.json({ success: true, data: about.timeline[itemIndex] });
};


// controllers/aboutController.js
exports.updateStatItem = async (req, res) => {
  try {
    const { id } = req.params; // stat _id
    const { label, value, suffix } = req.body;

    const about = await About.findOne();
    if (!about) return res.status(404).json({ success: false, message: 'About content not found' });

    const statIndex = about.stats.findIndex(s => s._id.toString() === id);
    if (statIndex === -1) return res.status(404).json({ success: false, message: 'Stat not found' });

    if (label !== undefined) about.stats[statIndex].label = label;
    if (value !== undefined) about.stats[statIndex].value = value;
    if (suffix !== undefined) about.stats[statIndex].suffix = suffix;

    await about.save();

    res.json({ success: true, data: about.stats[statIndex] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
