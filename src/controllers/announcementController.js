const Announcement = require('../models/Announcement');
const User = require('../models/User');

// @desc    Get all announcements
// @route   GET /api/announcements
// @access  Private
exports.getAllAnnouncements = async (req, res) => {
  try {
    const { type, priority } = req.query;
    
    const query = { isActive: true };
    
    // Filter by type and priority
    if (type) query.type = type;
    if (priority) query.priority = priority;
    
    // Check if announcement is targeted to user
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
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get single announcement
// @route   GET /api/announcements/:id
// @access  Private
exports.getAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id)
      .populate('createdBy', 'firstName lastName email profilePicture')
      .populate('targetAudience.departments', 'name')
      .populate('targetAudience.employees', 'firstName lastName email');
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    // Mark as read
    const hasRead = announcement.readBy.some(
      r => r.user.toString() === req.user.id
    );
    
    if (!hasRead) {
      announcement.readBy.push({ user: req.user.id });
      await announcement.save();
    }
    
    res.status(200).json({
      success: true,
      announcement
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Create announcement
// @route   POST /api/announcements
// @access  Private (HR, Admin)
exports.createAnnouncement = async (req, res) => {
  try {
    const announcementData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const announcement = await Announcement.create(announcementData);
    await announcement.populate('createdBy', 'firstName lastName email');
    
    res.status(201).json({
      success: true,
      message: 'Announcement created successfully',
      announcement
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update announcement
// @route   PUT /api/announcements/:id
// @access  Private (HR, Admin)
exports.updateAnnouncement = async (req, res) => {
  try {
    let announcement = await Announcement.findById(req.params.id);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
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
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete announcement
// @route   DELETE /api/announcements/:id
// @access  Private (HR, Admin)
exports.deleteAnnouncement = async (req, res) => {
  try {
    const announcement = await Announcement.findById(req.params.id);
    
    if (!announcement) {
      return res.status(404).json({
        success: false,
        message: 'Announcement not found'
      });
    }
    
    // Soft delete
    announcement.isActive = false;
    await announcement.save();
    
    res.status(200).json({
      success: true,
      message: 'Announcement deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};