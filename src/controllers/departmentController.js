const Department = require('../models/Department');
const User = require('../models/User'); // Employees

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getAllDepartments = async (req, res) => {
  try {
    const { isActive } = req.query;

    const query = {};
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Fetch departments
    const departments = await Department.find(query)
      .populate('head', 'firstName lastName email employeeId')
      .sort({ name: 1 });

    // Count employees for each department
    const departmentsWithCount = await Promise.all(
      departments.map(async (dept) => {
        const employeeCount = await User.countDocuments({ department: dept._id });
        return {
          ...dept.toObject(),
          employeeCount
        };
      })
    );

    res.status(200).json({
      success: true,
      count: departmentsWithCount.length,
      departments: departmentsWithCount
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get single department
// @route   GET /api/departments/:id
// @access  Private
exports.getDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id)
      .populate('head', 'firstName lastName email employeeId profilePicture');
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Get department employees
    const employees = await User.find({ 
      department: req.params.id, 
      isActive: true 
    }).select('firstName lastName employeeId email profilePicture designation');
    
    res.status(200).json({
      success: true,
      department,
      employees
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Create department
// @route   POST /api/departments
// @access  Private (HR, Admin)
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, description, head } = req.body;
    
    // Check if department already exists
    const existingDept = await Department.findOne({
      $or: [{ name }, { code }]
    });
    
    if (existingDept) {
      return res.status(400).json({
        success: false,
        message: 'Department name or code already exists'
      });
    }
    
    const department = await Department.create({
      name,
      code,
      description,
      head
    });
    
    await department.populate('head', 'firstName lastName email');
    
    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update department
// @route   PUT /api/departments/:id
// @access  Private (HR, Admin)
exports.updateDepartment = async (req, res) => {
  try {
    let department = await Department.findById(req.params.id);
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    department = await Department.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('head', 'firstName lastName email');
    
    res.status(200).json({
      success: true,
      message: 'Department updated successfully',
      department
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete department
// @route   DELETE /api/departments/:id
// @access  Private (Admin only)
exports.deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);
    
    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }
    
    // Check if department has employees
    const employeeCount = await User.countDocuments({ 
      department: req.params.id, 
      isActive: true 
    });
    
    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department with ${employeeCount} active employees`
      });
    }
    
    await department.remove();
    
    res.status(200).json({
      success: true,
      message: 'Department deleted successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};