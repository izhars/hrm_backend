const About = require('../models/About');
const TeamMember = require('../models/TeamMember');
const cloudinary = require('cloudinary').v2;
const fs = require('fs').promises; // To delete temp files
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

// ======================
// PUBLIC
// ======================
exports.getAboutInfo = catchAsync(async (req, res, next) => {
  const [about, team] = await Promise.all([
    About.findOne(),
    TeamMember.find({ isActive: true }).sort({ order: 1, createdAt: -1 })
  ]);

  // If no About document yet, return empty but valid structure
  if (!about) {
    return res.status(200).json({
      success: true,
      data: {
        companyName: 'Your Company',
        description: '',
        slogan: '',
        mission: '',
        vision: '',
        values: [],
        stats: [],
        timeline: [],
        achievements: [],
        team: team || []
      }
    });
  }

  res.status(200).json({
    success: true,
    data: {
      ...about.toObject(),
      team: team || []
    }
  });
});

// ======================
// ADMIN: MAIN CONTENT
// ======================
exports.createOrUpdateAbout = catchAsync(async (req, res, next) => {
  const updatedAbout = await About.findOneAndUpdate(
    {}, // Match the single document
    { ...req.body, updatedAt: Date.now() },
    {
      new: true,
      upsert: true,              // Create if doesn't exist
      runValidators: true,
      setDefaultsOnInsert: true
    }
  );

  res.status(200).json({
    success: true,
    data: updatedAbout
  });
});

// ======================
// TIMELINE CRUD
// ======================
exports.addTimelineItem = catchAsync(async (req, res, next) => {
  const about = await About.findOne();
  if (!about) return next(new AppError('Create main about content first', 400));

  about.timeline.push(req.body);
  await about.save();

  const newItem = about.timeline[about.timeline.length - 1];

  res.status(201).json({
    success: true,
    data: newItem
  });
});

exports.updateTimelineItem = catchAsync(async (req, res, next) => {
  const about = await About.findOne();
  if (!about) return next(new AppError('About content not found', 404));

  const item = about.timeline.id(req.params.id);
  if (!item) return next(new AppError('Timeline item not found', 404));

  // Update only provided fields
  Object.assign(item, req.body);
  await about.save();

  res.status(200).json({
    success: true,
    data: item
  });
});

exports.deleteTimelineItem = catchAsync(async (req, res, next) => {
  const about = await About.findOne();
  if (!about) return next(new AppError('About content not found', 404));

  const item = about.timeline.id(req.params.id);
  if (!item) return next(new AppError('Timeline item not found', 404));

  item.remove();
  await about.save();

  res.status(200).json({
    success: true,
    message: 'Timeline item deleted successfully'
  });
});

// ======================
// STATS CRUD
// ======================
exports.addStatItem = catchAsync(async (req, res, next) => {
  const about = await About.findOne();
  if (!about) return next(new AppError('Create main about content first', 400));

  about.stats.push(req.body);
  await about.save();

  const newStat = about.stats[about.stats.length - 1];

  res.status(201).json({
    success: true,
    data: newStat
  });
});

exports.updateStatItem = catchAsync(async (req, res, next) => {
  const about = await About.findOne();
  if (!about) return next(new AppError('About content not found', 404));

  const stat = about.stats.id(req.params.id);
  if (!stat) return next(new AppError('Stat item not found', 404));

  Object.assign(stat, req.body);
  await about.save();

  res.status(200).json({
    success: true,
    data: stat
  });
});

exports.deleteStatItem = catchAsync(async (req, res, next) => {
  const about = await About.findOne();
  if (!about) return next(new AppError('About content not found', 404));

  const stat = about.stats.id(req.params.id);
  if (!stat) return next(new AppError('Stat item not found', 404));

  stat.remove();
  await about.save();

  res.status(200).json({
    success: true,
    message: 'Stat item deleted successfully'
  });
});

// ======================
// TEAM MEMBERS
// ======================
exports.addTeamMember = catchAsync(async (req, res, next) => {
  let imageUrl = req.body.imageUrl || null;

  if (req.file) {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'team',
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'face' // Better for portraits
    });
    imageUrl = result.secure_url;

    // Delete temp file
    await fs.unlink(req.file.path).catch(() => {});
  }

  const member = await TeamMember.create({
    ...req.body,
    imageUrl
  });

  res.status(201).json({
    success: true,
    data: member
  });
});

exports.updateTeamMember = catchAsync(async (req, res, next) => {
  const updates = { ...req.body };

  if (req.file) {
    // Upload new image
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'team',
      width: 400,
      height: 400,
      crop: 'fill',
      gravity: 'face'
    });
    updates.imageUrl = result.secure_url;
    await fs.unlink(req.file.path).catch(() => {});
  }

  const member = await TeamMember.findByIdAndUpdate(
    req.params.id,
    updates,
    { new: true, runValidators: true }
  );

  if (!member) return next(new AppError('Team member not found', 404));

  res.status(200).json({
    success: true,
    data: member
  });
});

exports.deleteTeamMember = catchAsync(async (req, res, next) => {
  const member = await TeamMember.findById(req.params.id);
  if (!member) return next(new AppError('Team member not found', 404));

  // Delete image from Cloudinary if exists
  if (member.imageUrl && member.imageUrl.includes('cloudinary')) {
    const publicId = member.imageUrl.split('/').slice(-2).join('/').split('.')[0]; // team/abc123
    await cloudinary.uploader.destroy(publicId).catch(() => {});
  }

  await member.deleteOne();

  res.status(200).json({
    success: true,
    message: 'Team member deleted successfully'
  });
});