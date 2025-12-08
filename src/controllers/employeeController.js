const User = require('../models/User');
const Department = require('../models/Department');

// @desc    Get all employees
// @route   GET /api/employees
// @access  Private (HR, Manager, Admin)
exports.getAllEmployees = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      department, 
      isActive,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;
    
    // ✅ Build query to include both employee and manager
    const query = { role: { $in: ['employee', 'manager'] } };

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Sort object
    const sort = {};
    sort[sortBy] = order === 'asc' ? 1 : -1;

    // Execute query with pagination
    const employees = await User.find(query)
      .populate('department', 'name code')
      .populate('reportingManager', 'firstName lastName email employeeId')
      .sort(sort)
      .limit(Number(limit))
      .skip((page - 1) * limit)
      .select('-password');

    // Get total count
    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: employees.length,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      totalEmployees: count,
      employees
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};



exports.getEmployeeLastSeen = async (req, res) => {
  try {
    const { id } = req.params;
    const employee = await User.findById(id).select('firstName lastName lastSeen');

    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    res.status(200).json({
      success: true,
      data: {
        id: employee._id,
        name: `${employee.firstName} ${employee.lastName}`,
        lastSeen: employee.lastSeen || 'Never',
      },
    });
  } catch (error) {
    console.error('Error fetching last seen:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

exports.getAllHRs = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      search, 
      department, 
      isActive,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;
    
    // ✅ Only HR employees
    const query = { role: 'hr' };

    if (search) {
      query.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { employeeId: { $regex: search, $options: 'i' } }
      ];
    }

    if (department) query.department = department;
    if (isActive !== undefined) query.isActive = isActive === 'true';

    // Sorting logic
    const sort = {};
    sort[sortBy] = order === 'asc' ? 1 : -1;

    // Fetch HRs
    const hrs = await User.find(query)
      .populate('department', 'name code')
      .populate('reportingManager', 'firstName lastName email employeeId')
      .sort(sort)
      .limit(Number(limit))
      .skip((page - 1) * limit)
      .select('-password');

    // Count total
    const count = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      count: hrs.length,
      totalPages: Math.ceil(count / limit),
      currentPage: Number(page),
      totalHRs: count,
      hrs
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};


// @desc    Get single employee
// @route   GET /api/employees/:id
// @access  Private
exports.getEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id)
      .populate('department', 'name code description head')
      .populate('reportingManager', 'firstName lastName email employeeId profilePicture designation')
      .select('-password');
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Check if user has permission to view this employee
    if (req.user.role === 'employee' && req.user.id !== employee.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this employee'
      });
    }
    
    res.status(200).json({
      success: true,
      employee
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Create employee
// @route   POST /api/employees
// @access  Private (HR, Admin)
exports.createEmployee = async (req, res) => {
  try {
    const employeeData = req.body;
    
    // Check if email or employeeId already exists
    const existingEmployee = await User.findOne({
      $or: [
        { email: employeeData.email },
        { employeeId: employeeData.employeeId }
      ]
    });
    
    if (existingEmployee) {
      return res.status(400).json({
        success: false,
        message: 'Email or Employee ID already exists'
      });
    }
    
    // Create employee
    const employee = await User.create(employeeData);
    
    // Update department employee count
    if (employee.department) {
      await Department.findByIdAndUpdate(
        employee.department,
        { $inc: { employeeCount: 1 } }
      );
    }
    
    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      employee
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update employee
// @route   PUT /api/employees/:id
// @access  Private (HR, Admin)
exports.updateEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Don't allow updating password through this route
    if (req.body.password) {
      delete req.body.password;
    }
    
    // Handle department change
    const oldDepartment = employee.department;
    const newDepartment = req.body.department;
    
    // Update employee
    const updatedEmployee = await User.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('department reportingManager');
    
    // Update department counts if department changed
    if (oldDepartment && newDepartment && oldDepartment.toString() !== newDepartment.toString()) {
      await Department.findByIdAndUpdate(oldDepartment, { $inc: { employeeCount: -1 } });
      await Department.findByIdAndUpdate(newDepartment, { $inc: { employeeCount: 1 } });
    }
    
    res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      employee: updatedEmployee
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Delete employee (soft delete)
// @route   DELETE /api/employees/:id
// @access  Private (Admin only)
exports.deleteEmployee = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Soft delete - deactivate account
    employee.isActive = false;
    employee.dateOfLeaving = Date.now();
    await employee.save();
    
    // Update department count
    if (employee.department) {
      await Department.findByIdAndUpdate(
        employee.department,
        { $inc: { employeeCount: -1 } }
      );
    }
    
    res.status(200).json({
      success: true,
      message: 'Employee deactivated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Upload employee document
// @route   POST /api/employees/:id/documents
// @access  Private
exports.uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload a file'
      });
    }
    
    const employee = await User.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Add document to employee
    employee.documents.push({
      type: req.body.type || 'other',
      fileName: req.file.originalname,
      fileUrl: `/uploads/${req.file.filename}`
    });
    
    await employee.save();
    
    res.status(200).json({
      success: true,
      message: 'Document uploaded successfully',
      document: employee.documents[employee.documents.length - 1]
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update profile picture
// @route   PUT /api/employees/:id/profile-picture
// @access  Private
exports.updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image'
      });
    }
    
    const employee = await User.findById(req.params.id);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Update profile picture
    employee.profilePicture = `/uploads/${req.file.filename}`;
    await employee.save();
    
    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      profilePicture: employee.profilePicture
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};
