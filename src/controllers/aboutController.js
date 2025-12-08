// controllers/aboutController.js
const About = require('../models/About');
const TeamMember = require('../models/TeamMember');
const cloudinary = require('cloudinary').v2;
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync'); // create this helper

// ---------- HELPER ----------
// catchAsync.js
// module.exports = fn => (req, res, next) => fn(req, res, next).catch(next);

// Get Public About Page Data
exports.getAboutInfo = catchAsync(async (req, res, next) => {
  const [about, team] = await Promise.all([
    About.findOne(),
    TeamMember.find({ isActive: true })
  ]);

  res.status(200).json({
    success: true,
    data: {
      ...about?.toObject(),
      team,
      stats: about?.stats || [],
      timeline: about?.timeline || [],
      achievements: about?.achievements || []
    }
  });
});

// ADMIN: Create About Content
exports.createAboutContent = catchAsync(async (req, res, next) => {
  const exists = await About.findOne();
  if (exists) return next(new AppError("About content already exists. Use PUT to update.", 400));

  const about = await About.create(req.body);
  res.status(201).json({ success: true, data: about });
});

// ADMIN: Update About Content
exports.updateAboutContent = catchAsync(async (req, res, next) => {
  const about = await About.findOneAndUpdate(
    {},
    { ...req.body, updatedAt: Date.now() },
    { new: true, runValidators: true }
  );

  if (!about) return next(new AppError("About content not found. Create it first with POST.", 404));

  res.json({ success: true, data: about });
});

// ADMIN: Add Team Member + Upload Photo
exports.addTeamMember = catchAsync(async (req, res, next) => {
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
});

// ADMIN: Update Team Member
exports.updateTeamMember = catchAsync(async (req, res, next) => {
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

  const member = await TeamMember.findByIdAndUpdate(req.params.id, updates, { new: true });
  if (!member) return next(new AppError("Member not found", 404));

  res.json({ success: true, data: member });
});

// ADMIN: Delete Team Member
exports.deleteTeamMember = catchAsync(async (req, res, next) => {
  const member = await TeamMember.findById(req.params.id);
  if (!member) return next(new AppError("Member not found", 404));

  if (member.imageUrl && member.imageUrl.includes('cloudinary')) {
    const publicId = member.imageUrl.split('/').pop().split('.')[0];
    await cloudinary.uploader.destroy(`team/${publicId}`);
  }

  await member.deleteOne();
  res.json({ success: true, message: "Member deleted" });
});

// Update Timeline Item
exports.updateTimelineItem = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { title, description, year } = req.body;

  const about = await About.findOne();
  if (!about) return next(new AppError('About not found', 404));

  const itemIndex = about.timeline.findIndex(t => t._id.toString() === id);
  if (itemIndex === -1) return next(new AppError('Timeline item not found', 404));

  if (title) about.timeline[itemIndex].title = title;
  if (description) about.timeline[itemIndex].description = description;
  if (year) about.timeline[itemIndex].year = year;

  await about.save();
  res.json({ success: true, data: about.timeline[itemIndex] });
});

// Update Stat Item
exports.updateStatItem = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const { label, value, suffix } = req.body;

  const about = await About.findOne();
  if (!about) return next(new AppError('About content not found', 404));

  const statIndex = about.stats.findIndex(s => s._id.toString() === id);
  if (statIndex === -1) return next(new AppError('Stat not found', 404));

  if (label !== undefined) about.stats[statIndex].label = label;
  if (value !== undefined) about.stats[statIndex].value = value;
  if (suffix !== undefined) about.stats[statIndex].suffix = suffix;

  await about.save();
  res.json({ success: true, data: about.stats[statIndex] });
});
