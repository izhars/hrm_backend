const User = require('../models/User');
const Department = require('../models/Department');
const mongoose = require('mongoose');
const cloudinary = require('../config/cloudinary');
const fs = require('fs');
const emailService = require('../utils/emailService'); // adjust path if needed
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5000';
const { generateForgotPasswordEmail } = require('../email/forgotPasswordEmail');

// Generate JWT Token
const generateToken = (id, role, employeeId) => {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { id, role, employeeId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};
// @desc    Register new user
// @route   POST /api/auth/register
// @access  Private
exports.register = async (req, res) => {
  try {
    console.log('=== Registration Attempt ===');
    console.log('Performed by:', req.user?.role, req.user?._id);
    console.log('Role input:', req.body.role);
    console.log('Reporting Manager input:', req.body.reportingManager);

    const {
      employeeId, email, password, firstName, lastName, role, department,
      designation, dateOfJoining, employmentType, reportingManager,
      salary, bankDetails, phone, gender, dateOfBirth, maritalStatus,
      marriageAnniversary, spouseDetails, bloodGroup, address,
      emergencyContact, panNumber, pfNumber, uanNumber, documents,
      profilePicture, weekendType // ✅ added
    } = req.body;

    // Input validation
    if (!employeeId || !email || !password || !firstName || !lastName || !department) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, email, password, names, and department are required'
      });
    }

    // Role-based restrictions
    const allowedRoles = {
      superadmin: ['hr', 'manager', 'employee'],
      hr: ['employee', 'manager'], // HR can create managers too
      manager: ['employee'],
      employee: []
    };

    const userRole = req.user?.role;
    const assignedRole = role || 'employee';

    if (!userRole) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
    }

    if (!allowedRoles[userRole]?.includes(assignedRole)) {
      return res.status(403).json({
        success: false,
        message: `${userRole.charAt(0).toUpperCase() + userRole.slice(1)} can only create ${allowedRoles[userRole]?.join(', ') || 'no roles'} accounts`
      });
    }

    // Check for existing user
    const existingUser = await User.findOne({
      $or: [{ email }, { employeeId }]
    }).select('email employeeId');

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: existingUser.email === email
          ? 'Email already registered'
          : 'Employee ID already exists'
      });
    }

    // Department handling (your existing logic)
    let departmentId = null;
    let departmentName = null;

    let deptDoc = null;
    try {
      deptDoc = await Department.findOne({
        name: { $regex: new RegExp(`^${department.trim()}$`, 'i') }
      });

      if (!deptDoc) {
        const code = department
          .split(' ')
          .map(word => word[0])
          .join('')
          .toUpperCase()
          .substring(0, 4);

        deptDoc = new Department({
          name: department.trim(),
          code,
          head: req.user._id
        });

        await deptDoc.save();
      }

      if (deptDoc && deptDoc._id) {
        departmentId = deptDoc._id;

        if (!mongoose.Types.ObjectId.isValid(departmentId)) {
          return res.status(500).json({
            success: false,
            message: 'Department ObjectId validation failed'
          });
        }

        departmentName = deptDoc.name;
      } else {
        throw new Error('Department document missing _id');
      }

    } catch (deptError) {
      console.error('Department processing error:', deptError);
      return res.status(500).json({
        success: false,
        message: `Department processing failed: ${deptError.message}`
      });
    }

    // **UPDATED REPORTING MANAGER LOGIC** 
    let reportingManagerId = null;

    console.log('Processing reporting manager for role:', assignedRole);
    console.log('Raw reportingManager input:', reportingManager);

    // **Business Logic: Managers don't have reporting managers by default**
    if (assignedRole === 'manager') {
      console.log('Role is manager - setting reportingManager to null');
      reportingManagerId = null;
    }
    // **Only process reporting manager for employees**
    else if (assignedRole === 'employee' && reportingManager) {
      const trimmedManagerId = reportingManager.trim();

      // Skip if explicitly set to "NA" or empty
      if (trimmedManagerId === 'NA' || trimmedManagerId === '') {
        console.log('Reporting manager set to NA or empty - using null');
        reportingManagerId = null;
      }
      // Process valid manager ID
      else if (mongoose.Types.ObjectId.isValid(trimmedManagerId)) {
        try {
          const objectId = new mongoose.Types.ObjectId(trimmedManagerId);

          // Verify the manager exists and has appropriate role
          const manager = await User.findOne({
            _id: objectId,
            isActive: true,
            role: { $in: ['superadmin', 'hr', 'manager'] }
          });

          if (manager) {
            reportingManagerId = objectId;
            console.log('Valid reporting manager assigned:', reportingManagerId);
          } else {
            console.warn('Manager not found or inactive, setting to null');
            reportingManagerId = null;
          }
        } catch (managerError) {
          console.error('Reporting manager validation error:', managerError);
          reportingManagerId = null;
        }
      }
      // Try to find by employee ID if not ObjectId format
      else {
        try {
          const manager = await User.findOne({
            employeeId: trimmedManagerId,
            isActive: true,
            role: { $in: ['superadmin', 'hr', 'manager'] }
          });

          if (manager) {
            reportingManagerId = manager._id;
            console.log('Manager found by employeeId:', reportingManagerId);
          } else {
            console.warn('Manager not found by employeeId, setting to null');
            reportingManagerId = null;
          }
        } catch (error) {
          console.error('Manager lookup by employeeId failed:', error);
          reportingManagerId = null;
        }
      }
    } else {
      console.log('No reporting manager processing needed - using null');
      reportingManagerId = null;
    }

    // Prepare other data
    const salaryData = salary || { basic: 0, hra: 0, transport: 0, allowances: 0, deductions: 0 };
    const finalMaritalStatus = maritalStatus || 'single';
    const finalMarriageAnniversary = finalMaritalStatus === 'married' ? marriageAnniversary : undefined;
    const finalSpouseDetails = finalMaritalStatus === 'married' ? (spouseDetails || {}) : {};

    // Final validation
    console.log('Final assignment:');
    console.log('- Role:', assignedRole);
    console.log('- departmentId:', departmentId, 'Valid:', mongoose.Types.ObjectId.isValid(departmentId));
    console.log('- reportingManagerId:', reportingManagerId, 'Valid:', reportingManagerId ? mongoose.Types.ObjectId.isValid(reportingManagerId) : 'null (as expected)');

    // Probation Logic
    const probationStart = dateOfJoining ? new Date(dateOfJoining) : new Date();
    const probationEnd = new Date(probationStart);
    probationEnd.setMonth(probationEnd.getMonth() + 6);

    // Create user data object
    const userData = {
      employeeId: employeeId.trim().toUpperCase(),
      email: email.toLowerCase().trim(),
      password,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      role: assignedRole,
      department: departmentId,
      designation: designation ? designation.trim() : '',
      dateOfJoining: dateOfJoining ? new Date(dateOfJoining) : new Date(),
      employmentType: employmentType || 'full-time',
      reportingManager: reportingManagerId, // null for managers, null/ObjectId for employees
      salary: salaryData,
      bankDetails: bankDetails || {},
      phone: phone ? phone.trim() : '',
      gender,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      maritalStatus: finalMaritalStatus,
      marriageAnniversary: finalMarriageAnniversary,
      spouseDetails: finalSpouseDetails,
      bloodGroup: bloodGroup || null,
      address: address || {},
      emergencyContact: emergencyContact || {},
      panNumber: panNumber ? panNumber.toUpperCase().trim() : '',
      pfNumber: pfNumber ? pfNumber.trim() : '',
      uanNumber: uanNumber ? uanNumber.trim() : '',
      documents: documents || [],
      profilePicture: profilePicture || '',
      createdBy: req.user._id,
      isVerified: userRole === 'superadmin',
      weekendType: weekendType || 'sunday',
      // 🔥 Probation Fields Added Here
      probationStartDate: probationStart,
      probationEndDate: probationEnd,
      isProbationCompleted: false,
      // 🔥 Force ZERO Paid Leaves During Probation
      leaveBalance: {
        casual: 0,
        sick: 0,
        earned: 0,
        unpaid: 0
      }
    };

    console.log('Creating user with role-based reporting logic...');

    // Create and save user
    const user = new User(userData);
    await user.save();

    console.log('User successfully created:', user._id, user.employeeId, 'Role:', user.role, 'ReportingManager:', user.reportingManager);

    // 🔥 NEW: Send welcome email with login credentials
    try {
      if (['hr', 'superadmin'].includes(userRole)) {
        await emailService.sendWelcomeEmail(user, password);
        console.log('Welcome email sent successfully to:', user.email);
      }
    } catch (emailError) {
      console.error('Failed to send welcome email:', emailError);
      // Don't fail the registration if email fails, just log it
    }

    // Calculate net salary
    try {
      if (typeof user.calculateNetSalary === 'function') {
        user.calculateNetSalary();
        await user.save();
      }
    } catch (salaryError) {
      console.error('Salary calculation error:', salaryError);
    }

    const token = generateToken(user._id, user.role, user.employeeId);

    // Get populated user data for response
    const populatedUser = await User.findById(user._id)
      .populate('department', 'name')
      .populate('reportingManager', 'firstName lastName employeeId')
      .lean();

    res.status(201).json({
      success: true,
      message: `${assignedRole.charAt(0).toUpperCase() + assignedRole.slice(1)} account created successfully`,
      token,
      user: {
        id: user._id,
        employeeId: user.employeeId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        department: populatedUser.department?.name || departmentName,
        designation: user.designation,
        employmentType: user.employmentType,
        reportingManager: populatedUser.reportingManager ?
          `${populatedUser.reportingManager.firstName} ${populatedUser.reportingManager.lastName} (${populatedUser.reportingManager.employeeId})` :
          null,
        phone: user.phone,
        profilePicture: user.profilePicture,
        dateOfJoining: user.dateOfJoining,
        salary: user.salary?.netSalary || 0,
        isActive: user.isActive,
        weekendType: user.weekendType // ✅ added
      }
    });

  } catch (error) {
    console.error('=== REGISTRATION ERROR ===', error);

    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    if (error.name === 'MongoError' && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Duplicate entry: Email or Employee ID already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed: ' + (error.message || 'Unknown server error')
    });
  }
};

// controllers/userController.js
exports.resetDevice = async (req, res) => {
  try {
    const { userId } = req.params;

    // Only HR or superadmin should be allowed
    if (!['hr', 'superadmin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.deviceId = null;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: `Device reset for ${user.firstName} ${user.lastName} (${user.employeeId}).`
    });
  } catch (error) {
    console.error('Device reset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};


// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password, deviceId, fcmToken } = req.body;

    console.log("🟦 Login Attempt:", { email, password, deviceId, fcmToken });

    if (!email || !password) {
      console.log("🟨 Missing credentials");
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email })
      .select('+password')
      .populate('department', 'name code')
      .populate('reportingManager', 'firstName lastName email');

    if (!user) {
      console.log("🔴 User not found:", email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    console.log("🟦 User found:", { userId: user._id, deviceId: user.deviceId });

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      console.log("🔴 Wrong password entered for:", email);
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      console.log("🟥 Account inactive:", user._id);
      return res.status(403).json({
        success: false,
        message: 'Account is deactivated. Please contact HR.'
      });
    }

    if (!user.isVerified) {
      console.log("🟥 Account not verified:", user._id);
      return res.status(403).json({
        success: false,
        message: 'Account is not verified. Please verify your account before logging in.'
      });
    }

    // Device restriction logs
    if (user.deviceId && user.deviceId !== deviceId) {
      console.log("🚫 Device Mismatch!", {
        userDevice: user.deviceId,
        incomingDevice: deviceId
      });
      return res.status(403).json({
        success: false,
        message:
          'Login denied: You are already logged in on another device. Please contact HR or logout from that device first.',
      });
    }

    if (!user.deviceId && deviceId) {
      user.deviceId = deviceId;
    }

    user.lastLogin = new Date();
    user.lastLoginDevice = deviceId || null;

    // 🔔 FCM TOKEN SAVE
    if (fcmToken) {
      user.fcmToken = fcmToken;
    }

    await user.save({ validateBeforeSave: false });
    console.log("🟢 Login successful:", { userId: user._id });
    const token = generateToken(user._id, user.role, user.employeeId);

    res.status(200).json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        employeeId: user.employeeId,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        department: user.department?.name,
        designation: user.designation,
        phone: user.phone,
        profilePicture: user.profilePicture,
        isActive: user.isActive,
        isVerified: user.isVerified,
        deviceId: user.deviceId,
      },
    });

  } catch (error) {
    console.error("🔥 [Login Error]:", error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
    });
  }
};


exports.getManagers = async (req, res) => {
  try {
    const managers = await User.find({ role: 'manager', isActive: true })
      .select('employeeId firstName lastName email department designation')
      .populate('department', 'name code') // show department details
      .sort({ firstName: 1 });

    if (!managers.length) {
      return res.status(404).json({
        success: false,
        message: 'No managers found',
      });
    }

    res.status(200).json({
      success: true,
      count: managers.length,
      data: managers,
    });
  } catch (error) {
    console.error('Error fetching managers:', error);
    res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('department', 'name code description')
      .populate('reportingManager', 'firstName lastName email profilePicture')
      .populate('createdBy', 'firstName lastName');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update profile
// @route   PUT /api/auth/profile
// @access  Private
exports.updateProfile = async (req, res) => {
  try {
    const excludedFields = ['role', 'isActive', 'isVerified', 'employeeId', 'email', 'createdBy', 'department'];
    const updates = { ...req.body };

    excludedFields.forEach(field => delete updates[field]);

    // Handle marital status change
    if (updates.maritalStatus) {
      if (updates.maritalStatus === 'married') {
        if (!updates.marriageAnniversary) {
          return res.status(400).json({
            success: false,
            message: 'Marriage anniversary is required for married status'
          });
        }
        updates.spouseDetails = updates.spouseDetails || {};
      } else {
        // Clear marriage-related fields for non-married status
        updates.marriageAnniversary = undefined;
        updates.spouseDetails = {};
      }
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      {
        new: true,
        runValidators: true,
        select: '-password -resetPasswordToken -resetPasswordExpire'
      }
    ).populate('department reportingManager');

    // Recalculate salary if needed
    if (req.body.salary) {
      user.salary = { ...user.salary, ...req.body.salary };
      user.calculateNetSalary();
      await user.save();
    }

    res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        daysToAnniversary: user.daysToAnniversary
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

exports.updateProfilePicture = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded or invalid file type'
      });
    }

    // Check if file is actually an image (additional security)
    if (!req.file.mimetype.startsWith('image/')) {
      // Delete the uploaded file if it's not an image
      fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: 'Only image files are allowed'
      });
    }

    // Upload file to Cloudinary
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'profile_pictures',
      resource_type: 'image',
      transformation: [
        { width: 300, height: 300, crop: 'fill', gravity: 'face' }
      ]
    });

    // Delete the local file after uploading
    fs.unlinkSync(req.file.path);

    // Update user profile picture in DB
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Delete old profile picture from Cloudinary if it exists
    if (user.profilePicture && user.profilePicture.includes('cloudinary')) {
      const publicId = user.profilePicture.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`profile_pictures/${publicId}`);
    }

    user.profilePicture = result.secure_url;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: 'Profile picture updated successfully',
      user: {
        id: user._id,
        fullName: user.fullName,
        email: user.email,
        profilePicture: user.profilePicture,
        // Include other necessary user fields
        designation: user.designation,
        department: user.department,
      },
    });
  } catch (error) {
    // Clean up uploaded file if error occurs
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    console.error('Update profile picture error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile picture',
    });
  }
};


// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide current and new password'
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters'
      });
    }

    const user = await User.findById(req.user.id).select('+password');

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an email'
      });
    }

    const user = await User.findOne({ email }).select('+resetPasswordToken +resetPasswordExpire');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'No user found with that email'
      });
    }

    // Generate token
    const resetToken = user.getResetPasswordToken();
    await user.save({ validateBeforeSave: false });

    // Create reset URL
    const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;
    console.log('Password reset URL:', resetUrl);

    // Generate HTML email
    const html = generateForgotPasswordEmail(resetUrl);

    try {
      // Send email
      await emailService.sendEmail({
        to: user.email,
        subject: 'HRMS Password Reset',
        html
      });

      res.status(200).json({
        success: true,
        message: 'Password reset email sent successfully'
      });
    } catch (err) {
      console.error('Email send failed:', err);
      // Reset token if email failed
      user.resetPasswordToken = undefined;
      user.resetPasswordExpire = undefined;
      await user.save({ validateBeforeSave: false });

      return res.status(500).json({
        success: false,
        message: 'Email could not be sent. Please try again later.'
      });
    }

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
};



// @desc    Reset password
// @route   PUT /api/auth/reset-password/:resettoken
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const resetPasswordToken = req.params.token; // FIXED NAME

    const user = await User.findOne({
      resetPasswordToken,
      resetPasswordExpire: { $gt: Date.now() }
    }).select('+password');

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired reset token'
      });
    }

    user.password = req.body.password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark a user as unverified (HR only)
// Set user verification status (HR only)
exports.setVerification = async (req, res) => {
  try {
    const { userId } = req.params;
    const { isVerified } = req.body; // true or false

    if (typeof isVerified !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isVerified (boolean) is required in body',
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    user.isVerified = isVerified;
    await user.save({ validateBeforeSave: false });

    console.log(
      `🟠 [HR Action] User verification set to ${isVerified} for ${user.email} by ${req.user.email}`
    );

    res.status(200).json({
      success: true,
      message: `User ${user.fullName} is now ${isVerified ? 'verified' : 'unverified'}`,
      user: {
        id: user._id,
        email: user.email,
        fullName: user.fullName,
        isVerified: user.isVerified,
      },
    });
  } catch (error) {
    console.error('🔴 [Set Verification Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating verification',
    });
  }
};

// Check if logged-in user is verified (for app access)
exports.checkVerification = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('isVerified fullName email role');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    if (!user.isVerified) {
      console.warn(`🔴 [Access Denied] ${user.email} (${user.role}) is not verified.`);
      return res.status(403).json({
        success: false,
        message: 'Your account has been unverified by HR. Please contact HR.',
        isVerified: false,
      });
    }

    res.status(200).json({
      success: true,
      message: 'User is verified',
      isVerified: true,
      user: {
        fullName: user.fullName,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('🔴 [Check Verification Error]:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while checking verification',
    });
  }
};
