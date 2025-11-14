const Award = require('../models/Award');
const User = require('../models/User');
const ErrorResponse = require('../utils/errorResponse');

// @desc      Create new award
// @route     POST /api/v1/awards
// @access    Private (HR & above)
exports.createAward = async (req, res) => {
  try {
    const { name, description, awardedTo, badgeUrl } = req.body;

    // Check if awardedTo user exists
    const recipient = await User.findById(awardedTo);
    if (!recipient) {
      return res.status(404).json({ message: 'Recipient user not found' });
    }

    const award = await Award.create({
      name,
      description,
      awardedTo,
      awardedBy: req.user.id, // assuming you're using auth middleware
      badgeUrl,
    });

    res.status(201).json({
      success: true,
      message: 'Award created successfully',
      data: award,
    });
  } catch (error) {
    console.error('Error creating award:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc      Get all awards
// @route     GET /api/v1/awards
// @access    Private (HR & above)
exports.getAwards = async (req, res, next) => {
  try {
    let query = {};

    // Filter by employee (optional)
    if (req.query.awardedTo) {
      query.awardedTo = req.query.awardedTo;
    }

    // Filter by date range
    if (req.query.startDate || req.query.endDate) {
      query.dateAwarded = {};
      if (req.query.startDate) query.dateAwarded.$gte = req.query.startDate;
      if (req.query.endDate) query.dateAwarded.$lte = req.query.endDate;
    }

    const awards = await Award.find(query).sort('-dateAwarded');

    res.status(200).json({
      success: true,
      count: awards.length,
      data: awards,
    });
  } catch (error) {
    next(error);
  }
};

// @desc      Get single award
// @route     GET /api/v1/awards/:id
// @access    Private (HR & above)
exports.getAward = async (req, res, next) => {
  try {
    const award = await Award.findById(req.params.id);

    if (!award) {
      return next(new ErrorResponse(`Award not found with id: ${req.params.id}`, 404));
    }

    res.status(200).json({
      success: true,
      data: award,
    });
  } catch (error) {
    next(error);
  }
};

// @desc      Update award
// @route     PUT /api/v1/awards/:id
// @access    Private (HR & above)
exports.updateAward = async (req, res, next) => {
  try {
    let award = await Award.findById(req.params.id);

    if (!award) {
      return next(new ErrorResponse(`Award not found with id: ${req.params.id}`, 404));
    }

    // Only allow updating certain fields
    const allowedFields = ['name', 'description', 'badgeUrl', 'isActive'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    award = await Award.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: award,
    });
  } catch (error) {
    next(error);
  }
};

// @desc      Delete award
// @route     DELETE /api/v1/awards/:id
// @access    Private (Superadmin only)
exports.deleteAward = async (req, res, next) => {
  try {
    const award = await Award.findById(req.params.id);

    if (!award) {
      return next(new ErrorResponse(`Award not found with id: ${req.params.id}`, 404));
    }

    await award.remove();

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

// @desc      Get awards for current user (employee view)
// @route     GET /api/v1/awards/me
// @access    Private (All authenticated users)
exports.getMyAwards = async (req, res, next) => {
  try {
    const awards = await Award.find({ awardedTo: req.user.id }).sort('-dateAwarded');

    res.status(200).json({
      success: true,
      count: awards.length,
      data: awards,
    });
  } catch (error) {
    next(error);
  }
};
