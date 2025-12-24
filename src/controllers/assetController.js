const Asset = require('../models/Asset');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { notifyAssetAssigned, notifyAssetReturned, notifyAssetStatusChanged } = require('../utils/assetNotifications');

// @desc    Get all assets
// @route   GET /api/assets
// @access  Private (HR, Admin)
exports.getAllAssets = catchAsync(async (req, res, next) => {
  const { category, status, assignedTo } = req.query;
  const query = {};
  if (category) query.category = category;
  if (status) query.status = status;
  if (assignedTo) query.assignedTo = assignedTo;

  const assets = await Asset.find(query)
    .populate('assignedTo', 'firstName lastName employeeId email')
    .sort({ createdAt: -1 });

  res.status(200).json({ success: true, count: assets.length, assets });
});

// @desc    Get my assets
// @route   GET /api/assets/my-assets
// @access  Private
exports.getMyAssets = catchAsync(async (req, res, next) => {
  const assets = await Asset.find({ assignedTo: req.user.id, status: 'assigned' });
  res.status(200).json({ success: true, count: assets.length, assets });
});

// @desc    Get single asset
// @route   GET /api/assets/:id
// @access  Private
exports.getAsset = catchAsync(async (req, res, next) => {
  const asset = await Asset.findById(req.params.id)
    .populate('assignedTo', 'firstName lastName employeeId email profilePicture')
    .populate('assignmentHistory.employee', 'firstName lastName employeeId');

  if (!asset) return next(new AppError('Asset not found', 404));

  res.status(200).json({ success: true, asset });
});

// @desc    Create asset
// @route   POST /api/assets
// @access  Private (HR, Admin)
exports.createAsset = catchAsync(async (req, res, next) => {
  const asset = await Asset.create(req.body);
  res.status(201).json({ success: true, message: 'Asset created successfully', asset });
});

// @desc    Update asset
// @route   PUT /api/assets/:id
// @access  Private (HR, Admin)
exports.updateAsset = catchAsync(async (req, res, next) => {
  let asset = await Asset.findById(req.params.id);
  if (!asset) return next(new AppError('Asset not found', 404));

  asset = await Asset.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  res.status(200).json({ success: true, message: 'Asset updated successfully', asset });
});

// @desc    Assign asset to employee
// @route   PUT /api/assets/:id/assign
// @access  Private (HR, Admin)
exports.assignAsset = catchAsync(async (req, res, next) => {
  const { employeeId } = req.body;

  const asset = await Asset.findById(req.params.id);
  if (!asset) return next(new AppError('Asset not found', 404));
  if (asset.status === 'assigned') return next(new AppError('Asset is already assigned', 400));

  const employee = await User.findById(employeeId);
  if (!employee) return next(new AppError('Employee not found', 404));

  asset.assignedTo = employeeId;
  asset.assignedDate = Date.now();
  asset.status = 'assigned';
  await asset.save();
  await asset.populate('assignedTo', 'firstName lastName employeeId email');
  await notifyAssetAssigned(asset.assignedTo._id, asset); // 🔥 One-liner
  res.status(200).json({ success: true, message: 'Asset assigned successfully', asset });
});

// @desc    Return asset from employee
// @route   PUT /api/assets/:id/return
// @access  Private (HR, Admin)
exports.returnAsset = catchAsync(async (req, res, next) => {
  const { condition, remarks } = req.body;

  const asset = await Asset.findById(req.params.id);
  if (!asset) return next(new AppError('Asset not found', 404));
  if (asset.status !== 'assigned') return next(new AppError('Asset is not assigned', 400));

  asset.assignmentHistory.push({
    employee: asset.assignedTo,
    assignedDate: asset.assignedDate,
    returnedDate: Date.now(),
    condition: condition || asset.condition,
    remarks
  });
  await asset.save();

  asset.assignedTo = undefined;
  asset.assignedDate = undefined;
  asset.status = 'available';
  asset.condition = condition || asset.condition;
  await asset.save();
  await notifyAssetReturned(asset.assignmentHistory.slice(-1)[0].employee, asset); // One-liner

  res.status(200).json({ success: true, message: 'Asset returned successfully', asset });
});

// @desc    Delete asset
// @route   DELETE /api/assets/:id
// @access  Private (Admin only)
exports.deleteAsset = catchAsync(async (req, res, next) => {
  const { id } = req.params;
  const asset = await Asset.findById(id);
  if (!asset) {
    return next(new AppError('Asset not found', 404));
  }
  // Check if assigned
  if (asset.status === 'assigned') {
    return next(new AppError('Cannot delete assigned asset', 400));
  }
  await Asset.findByIdAndDelete(id);
  res.status(200).json({
    success: true,
    message: 'Asset deleted successfully'
  });
});

// @desc    Change asset status (maintenance, retired, available, etc.)
// @route   PUT /api/assets/:id/status
// @access  Private (HR, Admin)
exports.changeAssetStatus = catchAsync(async (req, res, next) => {
  const { status, remarks } = req.body;

  const validStatuses = ['available', 'assigned', 'under-maintenance', 'retired'];
  if (!validStatuses.includes(status)) {
    return next(new AppError('Invalid status value', 400));
  }

  const asset = await Asset.findById(req.params.id);
  if (!asset) return next(new AppError('Asset not found', 404));

  if (asset.status === 'assigned' && status !== 'assigned') {
    return next(new AppError('Cannot change status of an assigned asset. Return it first.', 400));
  }

  asset.status = status;
  if (remarks) asset.remarks = remarks;

  await asset.save();
  if (asset.assignedTo) await notifyAssetStatusChanged(asset.assignedTo, asset); // Only if assigned

  res.status(200).json({
    success: true,
    message: `Asset status updated to '${status}'`,
    asset
  });
});
