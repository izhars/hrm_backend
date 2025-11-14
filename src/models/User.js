const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
  // Core Employee Info
  employeeId: {
    type: String,
    required: [true, 'Employee ID is required'],
    unique: true,
    uppercase: true,
    trim: true,
    validate: {
      validator: function (v) {
        return /^[A-Z]+[0-9]+$/.test(v);
      },
      message: 'Employee ID format: Letters followed by numbers, e.g., SCAIPLE001'
    }
  },
  firstName: { type: String, required: [true, 'First name is required'], trim: true },
  lastName: { type: String, required: [true, 'Last name is required'], trim: true },
  lastSeen: { type: Date, default: null },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: 8,
    select: false
  },
  deviceId: { type: String, default: null },
  lastLoginDevice: { type: String, default: null },
  // Phone - OPTIONAL for superadmin and HR
  phone: {
    type: String,
    match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number'],
    trim: true,
    required: function () {
      return !['superadmin', 'hr'].includes(this.role);
    }
  },

  // Role & Department
  role: {
    type: String,
    enum: ['superadmin', 'hr', 'manager', 'employee'],
    default: 'employee',
    required: true
  },
  department: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },

  designation: { type: String, required: [true, 'Designation is required'], trim: true },

  // Employment Details - OPTIONAL for admin roles
  dateOfJoining: { type: Date, default: Date.now, required: true },
  employmentType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'intern'],
    default: 'full-time',
    required: function () {
      return this.role === 'employee';
    }
  },
  weekendType: {
    type: String,
    enum: ['sunday', 'saturday_sunday'],
    default: 'sunday', // default: only Sunday off
    required: function () {
      return this.role === 'employee';
    }
  },
  status: {
    type: String,
    enum: ['active', 'resigned', 'on-leave', 'terminated'],
    default: 'active'
  },
  reportingManager: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  workLocation: String,
  shiftTiming: String,
  probationEndDate: Date,
  dateOfLeaving: Date,

  // Personal Details - OPTIONAL for admin roles
  gender: { type: String, enum: ['male', 'female', 'other'] },
  dateOfBirth: {
    type: Date,
    validate: {
      validator: function (v) {
        return !v || v < new Date();
      },
      message: 'Date of birth must be in the past'
    },
    required: function () {
      return !['superadmin', 'hr'].includes(this.role);
    }
  },
  maritalStatus: {
    type: String,
    enum: ['single', 'married', 'divorced', 'widowed', 'separated'],
    default: 'single',
    required: function () {
      return !['superadmin', 'hr'].includes(this.role);
    }
  },

  // Marriage Anniversary - Only for married employees
  marriageAnniversary: {
    type: Date,
    validate: {
      validator: function (v) {
        return this.maritalStatus !== 'married' || !v || v < new Date();
      },
      message: 'Marriage anniversary must be in the past for married employees'
    },
    required: function () {
      return this.maritalStatus === 'married' && this.role === 'employee';
    }
  },

  spouseDetails: {
    name: { type: String, trim: true },
    dateOfBirth: Date,
    occupation: String,
    phone: String,
    email: String,
    isWorking: { type: Boolean, default: false },
    companyName: String,
    annualIncome: Number
  },
  bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
  alternatePhone: String,

  address: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'India' },
    postalCode: String
  },

  // Payroll & Salary Details - ONLY for employees
  salary: {
    basic: { type: Number, default: 0, min: 0 },
    hra: { type: Number, default: 0, min: 0 },
    transport: { type: Number, default: 0, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    deductions: { type: Number, default: 0, min: 0 },
    netSalary: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    payFrequency: { type: String, enum: ['monthly', 'bi-weekly'], default: 'monthly' }
  },

  // Bank details - ONLY for employees
  bankDetails: {
    accountNumber: {
      type: String,
      required: function () {
        return this.role === 'employee' && this.isActive;
      }
    },
    bankName: {
      type: String,
      required: function () {
        return this.role === 'employee' && this.isActive;
      }
    },
    ifscCode: {
      type: String,
      required: function () {
        return this.role === 'employee' && this.isActive;
      }
    },
    accountHolderName: String
  },

  // Government IDs - ONLY for employees
  pfNumber: String,
  uanNumber: String,
  panNumber: {
    type: String,
    match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format'],
    required: function () {
      return this.role === 'employee' && this.isActive;
    }
  },

  // Leave & Attendance - ONLY for employees
  leaveBalance: {
    casual: { type: Number, default: 12, min: 0 },
    sick: { type: Number, default: 10, min: 0 },
    earned: { type: Number, default: 15, min: 0 },
    combo: { type: Number, default: 0 }, // ← NEW
    unpaid: { type: Number, default: 0, min: 0 }
  },
  lastLogin: Date,

  // Emergency Contact - OPTIONAL for admin roles
  emergencyContact: {
    name: String,
    relationship: String,
    phone: String
  },

  // Documents - ONLY for employees
  documents: [{
    type: {
      type: String,
      enum: ['aadhar', 'pan', 'passport', 'resume', 'offer-letter', 'experience', 'photo-id', 'bank-proof', 'marriage-certificate']
    },
    fileName: String,
    fileUrl: String,
    fileSize: Number,
    mimeType: String,
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verified: { type: Boolean, default: false },
    expiryDate: Date,
    uploadedAt: { type: Date, default: Date.now }
  }],
  profilePicture: { type: String, default: '' },

  // System Info
  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true
});

// Indexes for performance
userSchema.index({ employeeId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ department: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ dateOfJoining: -1 });
userSchema.index({ maritalStatus: 1 });
userSchema.index({ 'marriageAnniversary': 1 });

// Virtual for days to marriage anniversary
userSchema.virtual('daysToAnniversary').get(function () {
  if (this.maritalStatus !== 'married' || !this.marriageAnniversary) {
    return null;
  }

  const today = new Date();
  const anniversary = new Date(today.getFullYear(), this.marriageAnniversary.getMonth(), this.marriageAnniversary.getDate());

  if (anniversary < today) {
    anniversary.setFullYear(today.getFullYear() + 1);
  }

  const diffTime = anniversary - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return diffDays;
});

// Virtual for full name
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Admin role cleanup middleware
userSchema.pre('save', function (next) {
  const adminRoles = ['superadmin', 'hr'];

  if (adminRoles.includes(this.role)) {
    // Clear employee-specific fields for admin roles
    this.employmentType = 'full-time';
    this.maritalStatus = 'single';
    this.marriageAnniversary = undefined;
    this.spouseDetails = {};
    this.salary = this.salary || {};
    this.bankDetails = this.bankDetails || {};
    this.panNumber = '';
    this.leaveBalance = {
      casual: 0, sick: 0, earned: 0, unpaid: 0
    };
  }

  // Validate marriage anniversary when marital status changes
  if (this.isModified('maritalStatus') && this.maritalStatus === 'married' && !this.marriageAnniversary && this.role === 'employee') {
    const error = new Error('Marriage anniversary is required for married employees');
    return next(error);
  }

  if (this.maritalStatus !== 'married') {
    this.marriageAnniversary = undefined;
    this.spouseDetails = {};
  }

  next();
});

// Calculate net salary for employees only
userSchema.methods.calculateNetSalary = function () {
  if (this.role !== 'employee') return;

  const { basic, hra, transport, allowances, deductions } = this.salary;
  this.salary.netSalary = Math.max(0, (basic + hra + transport + allowances) - deductions);
  return this.salary.netSalary;
};

// Compare password method
userSchema.methods.matchPassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate JWT token
userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, employeeId: this.employeeId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

// Generate reset password token
userSchema.methods.getResetPasswordToken = function () {
  const resetToken = crypto.randomBytes(20).toString('hex');

  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

// Ensure virtuals are included in JSON
userSchema.set('toJSON', { virtuals: true });
userSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('User', userSchema);