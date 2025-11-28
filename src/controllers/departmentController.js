const Department = require('../models/Department');
const User = require('../models/User'); // Employees

// @desc    Get all departments
// @route   GET /api/departments
// @access  Private
exports.getAllDepartments = async (req, res) => {
  try {
    const { isActive } = req.query;

    const query = {};

    // Default: fetch only active departments
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    } else {
      query.isActive = true;
    }

    const departments = await Department.find(query)
      .populate('head', 'firstName lastName email employeeId')
      .sort({ name: 1 });

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
    res.status(500).json({ success: false, message: error.message });
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
// @desc    Create department
// @route   POST /api/departments
// @access  Private (HR, Admin, Superadmin)
exports.createDepartment = async (req, res) => {
  try {
    const { name, code, description, head } = req.body;

    console.log("📥 [CREATE-DEPARTMENT] Incoming request:", {
      name,
      code,
      description,
      head: head || "No head provided"
    });

    // Check duplicates
    const existingDept = await Department.findOne({
      $or: [{ name }, { code }]
    });

    if (existingDept) {
      console.log("⚠️ [CREATE-DEPARTMENT] Duplicate found:", existingDept.name);
      return res.status(400).json({
        success: false,
        message: 'Department name or code already exists'
      });
    }

    // Payload setup
    const payload = { name, code, description };

    if (head) {
      console.log("👤 [CREATE-DEPARTMENT] Assigning department head:", head);
      payload.head = head;
    } else {
      console.log("ℹ️ [CREATE-DEPARTMENT] No head assigned during creation.");
    }

    // Create department
    const department = await Department.create(payload);
    console.log("✅ [CREATE-DEPARTMENT] Department created:", department._id);

    await department.populate('head', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      department
    });

  } catch (error) {
    console.error("❌ [CREATE-DEPARTMENT] Error:", error.message);
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
        message: 'Department not found',
      });
    }

    // 🔍 Check if any users are assigned to this department
    const employeeCount = await User.countDocuments({
      department: req.params.id, // no isActive filter → counts all users
    });

    if (employeeCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete department. There are ${employeeCount} user(s) assigned to this department.`,
      });
    }

    // ❌ Delete the department
    await Department.deleteOne({ _id: req.params.id });

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully',
    });
  } catch (error) {
    console.error("❌ [DELETE-DEPARTMENT] Error:", error.message);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


exports.toggleDepartmentStatus = async (req, res) => {
  try {
    const department = await Department.findById(req.params.id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: "Department not found"
      });
    }

    // Prevent inactivating a department with employees
    if (!department.isActive) {
      // Reactivating is allowed always
      department.isActive = true;
    } else {
      // Deactivating → must have 0 employees
      const employeeCount = await User.countDocuments({
        department: req.params.id,
        isActive: true
      });

      if (employeeCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot deactivate department with ${employeeCount} active employees`
        });
      }

      department.isActive = false;
    }

    await department.save();

    res.status(200).json({
      success: true,
      message: `Department ${department.isActive ? 'activated' : 'deactivated'}`,
      department
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
