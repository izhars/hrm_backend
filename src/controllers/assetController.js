const Asset = require('../models/Asset');

// @desc    Get all assets
// @route   GET /api/assets
// @access  Private (HR, Admin)
exports.getAllAssets = async (req, res) => {
  try {
    const { category, status, assignedTo } = req.query;
    
    const query = {};
    if (category) query.category = category;
    if (status) query.status = status;
    if (assignedTo) query.assignedTo = assignedTo;
    
    const assets = await Asset.find(query)
      .populate('assignedTo', 'firstName lastName employeeId email')
      .sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: assets.length,
      assets
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get my assets
// @route   GET /api/assets/my-assets
// @access  Private
exports.getMyAssets = async (req, res) => {
  try {
    const assets = await Asset.find({ 
      assignedTo: req.user.id,
      status: 'assigned'
    });
    
    res.status(200).json({
      success: true,
      count: assets.length,
      assets
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get single asset
// @route   GET /api/assets/:id
// @access  Private
exports.getAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id)
      .populate('assignedTo', 'firstName lastName employeeId email profilePicture')
      .populate('assignmentHistory.employee', 'firstName lastName employeeId');
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    res.status(200).json({
      success: true,
      asset
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Create asset
// @route   POST /api/assets
// @access  Private (HR, Admin)
exports.createAsset = async (req, res) => {
  try {
    const asset = await Asset.create(req.body);
    
    res.status(201).json({
      success: true,
      message: 'Asset created successfully',
      asset
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update asset
// @route   PUT /api/assets/:id
// @access  Private (HR, Admin)
exports.updateAsset = async (req, res) => {
  try {
    let asset = await Asset.findById(req.params.id);
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    asset = await Asset.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Asset updated successfully',
      asset
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Assign asset to employee
// @route   PUT /api/assets/:id/assign
// @access  Private (HR, Admin)
exports.assignAsset = async (req, res) => {
  try {
    const { employeeId } = req.body;
    
    const asset = await Asset.findById(req.params.id);
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    if (asset.status === 'assigned') {
      return res.status(400).json({
        success: false,
        message: 'Asset is already assigned. Please return it first.'
      });
    }
    
    // Check if employee exists
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    asset.assignedTo = employeeId;
    asset.assignedDate = Date.now();
    asset.status = 'assigned';
    await asset.save();
    
    await asset.populate('assignedTo', 'firstName lastName employeeId email');
    
    res.status(200).json({
      success: true,
      message: 'Asset assigned successfully',
      asset
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Return asset from employee
// @route   PUT /api/assets/:id/return
// @access  Private (HR, Admin)
exports.returnAsset = async (req, res) => {
  try {
    const { condition, remarks } = req.body;
    
    const asset = await Asset.findById(req.params.id);
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    if (asset.status !== 'assigned') {
      return res.status(400).json({
        success: false,
        message: 'Asset is not assigned to anyone'
      });
    }
    
    // Add to assignment history
    asset.assignmentHistory.push({
      employee: asset.assignedTo,
      assignedDate: asset.assignedDate,
      returnedDate: Date.now(),
      condition: condition || asset.condition,
      remarks
    });
    
    asset.assignedTo = undefined;
    asset.assignedDate = undefined;
    asset.status = 'available';
    asset.condition = condition || asset.condition;
    await asset.save();
    
    res.status(200).json({
      success: true,
      message: 'Asset returned successfully',
      asset
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete asset
// @route   DELETE /api/assets/:id
// @access  Private (Admin only)
exports.deleteAsset = async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    
    if (!asset) {
      return res.status(404).json({
        success: false,
        message: 'Asset not found'
      });
    }
    
    if (asset.status === 'assigned') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete assigned asset'
      });
    }
    
    await asset.remove();
    
    res.status(200).json({
      success: true,
      message: 'Asset deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};
