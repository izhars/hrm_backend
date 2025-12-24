const Announcement = require('../models/Announcement');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync'); // helper to catch async errors
const { notifyAnnouncementToAudience } = require('../utils/announcementNotifications');

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Private
exports.getAllAnnouncements = catchAsync(async (req, res, next) => {
  const { type, priority } = req.query;

  const query = { isActive: true };

  if (type) query.type = type;
  if (priority) query.priority = priority;

  query.$or = [
    { 'targetAudience.type': 'all' },
    { 'targetAudience.employees': req.user.id },
    { 'targetAudience.departments': req.user.department }
  ];

  const announcements = await Announcement.find(query)
    .populate('createdBy', 'firstName lastName email profilePicture')
    .sort({ priority: -1, publishDate: -1 });

  res.status(200).json({
    success: true,
    count: announcements.length,
    announcements
  });
});

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Private
exports.getAnnouncement = catchAsync(async (req, res, next) => {
  const announcement = await Announcement.findById(req.params.id)
    .populate('createdBy', 'firstName lastName email profilePicture')
    .populate('targetAudience.departments', 'name')
    .populate('targetAudience.employees', 'firstName lastName email');

  if (!announcement) return next(new AppError('Announcement not found', 404));

  const hasRead = announcement.readBy.some(
    r => r.user.toString() === req.user.id
  );

  if (!hasRead) {
    announcement.readBy.push({ user: req.user.id });
    await announcement.save();
  }

  res.status(200).json({ success: true, announcement });
});

// @desc    Create announcement
// @route   POST /api/announcements
// @access  Private (HR, Admin)
exports.createAnnouncement = catchAsync(async (req, res, next) => {
  const announcementData = { ...req.body, createdBy: req.user.id };

  const announcement = await Announcement.create(announcementData);
  await announcement.populate('createdBy', 'firstName lastName email');
  await notifyAnnouncementToAudience(announcement);
  res.status(201).json({
    success: true,
    message: 'Announcement created successfully',
    announcement
  });
});

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private (HR, Admin)
exports.updateAnnouncement = catchAsync(async (req, res, next) => {
  let announcement = await Announcement.findById(req.params.id);
  if (!announcement) return next(new AppError('Announcement not found', 404));

  announcement = await Announcement.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('createdBy');

  res.status(200).json({
    success: true,
    message: 'Announcement updated successfully',
    announcement
  });
});

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private (HR, Admin)
exports.deleteAnnouncement = catchAsync(async (req, res, next) => {
  const announcement = await Announcement.findById(req.params.id);
  if (!announcement) return next(new AppError('Announcement not found', 404));

  // Soft delete
  announcement.isActive = false;
  await announcement.save();

  res.status(200).json({
    success: true,
    message: 'Announcement deleted successfully'
  });
});
