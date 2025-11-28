const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const userSchema = new mongoose.Schema(
  {
    // Core Employee Info
    employeeId: {
      type: String,
      required: [true, 'Employee ID is required'],
      unique: true,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]+[0-9]+$/, 'Employee ID format: Letters followed by numbers, e.g., SCAIPLE001']
    },
    firstName: { type: String, required: [true, 'First name is required'], trim: true },
    lastName: { type: String, required: [true, 'Last name is required'], trim: true },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please enter a valid email address']
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false // Never return password by default
    },
    deviceId: { type: String, default: null },
    lastLoginDevice: { type: String, default: null },
    lastSeen: { type: Date, default: null },
    lastLogin: { type: Date },

    // Role & Hierarchy
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
    reportingManager: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null
    },

    // Employment Details
    dateOfJoining: { type: Date, default: Date.now, required: true },
    employmentType: {
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'intern'],
      default: 'full-time',
      required: function () { return this.role === 'employee'; }
    },
    weekendType: {
      type: String,
      enum: ['sunday', 'saturday_sunday'],
      default: 'sunday',
      required: function () { return this.role === 'employee'; }
    },
    status: {
      type: String,
      enum: ['active', 'resigned', 'on-leave', 'terminated'],
      default: 'active'
    },
    workLocation: String,
    shiftTiming: String,

    // Probation
    probationStartDate: { type: Date },
    probationEndDate: { type: Date },
    isProbationCompleted: { type: Boolean, default: false },
    dateOfLeaving: Date,

    // Personal Details (mostly for employees)
    phone: {
      type: String,
      match: [/^\d{10}$/, 'Please enter a valid 10-digit phone number'],
      required: function () { return !['superadmin', 'hr'].includes(this.role); }
    },
    gender: { type: String, enum: ['male', 'female', 'other'] },
    dateOfBirth: {
      type: Date,
      validate: {
        validator: v => !v || v < new Date(),
        message: 'Date of birth must be in the past'
      },
      required: function () { return !['superadmin', 'hr'].includes(this.role); }
    },
    maritalStatus: {
      type: String,
      enum: ['single', 'married', 'divorced', 'widowed', 'separated'],
      default: 'single',
      required: function () { return !['superadmin', 'hr'].includes(this.role); }
    },
    marriageAnniversary: {
      type: Date,
      validate: {
        validator: function (v) {
          return this.maritalStatus !== 'married' || v < new Date();
        },
        message: 'Marriage anniversary must be in the past'
      }
    },
    spouseDetails: {
      name: String,
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

    // Salary & Bank (only employees)
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
    bankDetails: {
      accountNumber: String,
      bankName: String,
      ifscCode: String,
      accountHolderName: String
    },

    // Government IDs
    pfNumber: String,
    uanNumber: String,
    panNumber: {
      type: String,
      uppercase: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format']
    },

    // Leave Balance
    leaveBalance: {
      casual: { type: Number, default: 12, min: 0 },
      sick: { type: Number, default: 10, min: 0 },
      earned: { type: Number, default: 15, min: 0 },
      combo: { type: Number, default: 0, min: 0 },
      unpaid: { type: Number, default: 0, min: 0 }
    },

    // Emergency & Documents
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String
    },
    documents: [{
      type: { type: String, enum: ['aadhar', 'pan', 'passport', 'resume', 'offer-letter', 'experience', 'photo-id', 'bank-proof', 'marriage-certificate'] },
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

    // System Fields
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // Password Reset
    resetPasswordToken: String,
    resetPasswordExpire: Date
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// ────────────────────────────────────────────────────────────────
// Indexes for Performance
// ────────────────────────────────────────────────────────────────
userSchema.index({ employeeId: 1 });
userSchema.index({ email: 1 });
userSchema.index({ department: 1 });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ dateOfJoining: -1 });
userSchema.index({ maritalStatus: 1 });
userSchema.index({ marriageAnniversary: 1 });

// ────────────────────────────────────────────────────────────────
// Virtuals
// ────────────────────────────────────────────────────────────────
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`.trim();
});

userSchema.virtual('daysToAnniversary').get(function () {
  if (this.maritalStatus !== 'married' || !this.marriageAnniversary) return null;

  const today = new Date();
  const thisYearAnniv = new Date(today.getFullYear(), this.marriageAnniversary.getMonth(), this.marriageAnniversary.getDate());

  if (thisYearAnniv < today) {
    thisYearAnniv.setFullYear(today.getFullYear() + 1);
  }

  const diff = thisYearAnniv - today;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
});

// ────────────────────────────────────────────────────────────────
// Pre-save Hooks (All separated properly)
// ────────────────────────────────────────────────────────────────

// 1. Hash password
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// 2. Clear employee-specific fields for admin roles
userSchema.pre('save', function (next) {
  if (['superadmin', 'hr'].includes(this.role)) {
    this.phone = undefined;
    this.dateOfBirth = undefined;
    this.gender = undefined;
    this.maritalStatus = 'single';
    this.marriageAnniversary = undefined;
    this.spouseDetails = {};
    this.salary = { basic: 0, hra: 0, transport: 0, allowances: 0, deductions: 0, netSalary: 0 };
    this.bankDetails = {};
    this.panNumber = undefined;
    this.pfNumber = undefined;
    this.uanNumber = undefined;
    this.leaveBalance = { casual: 0, sick: 0, earned: 0, combo: 0, unpaid: 0 };
    this.employmentType = undefined;
    this.weekendType = undefined;
    this.reportingManager = null;
  }
  next();
});

// 3. Auto-set probation period (only on first save)
userSchema.pre('save', function (next) {
  if (this.isNew && this.role === 'employee') {
    this.probationStartDate = this.dateOfJoining;
    const end = new Date(this.dateOfJoining);
    end.setMonth(end.getMonth() + 6);
    this.probationEndDate = end;
  }

  // Auto-mark probation as completed if end date passed
  if (this.probationEndDate && new Date() > this.probationEndDate) {
    this.isProbationCompleted = true;
  }
  next();
});

// 4. Marriage anniversary & spouse validation
userSchema.pre('save', function (next) {
  if (this.role === 'employee') {
    if (this.maritalStatus === 'married') {
      if (!this.marriageAnniversary) {
        return next(new Error('Marriage anniversary date is required for married employees'));
      }
    } else {
      this.marriageAnniversary = undefined;
      this.spouseDetails = {};
    }
  }
  next();
});

// ────────────────────────────────────────────────────────────────
// Instance Methods
// ────────────────────────────────────────────────────────────────
userSchema.methods.matchPassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.getSignedJwtToken = function () {
  return jwt.sign(
    { id: this._id, role: this.role, employeeId: this.employeeId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '30d' }
  );
};

userSchema.methods.calculateNetSalary = function () {
  if (this.role !== 'employee') return 0;
  const { basic, hra, transport, allowances, deductions } = this.salary;
  this.salary.netSalary = Math.max(0, (basic + hra + transport + allowances) - deductions);
  return this.salary.netSalary;
};

userSchema.methods.getResetPasswordToken = function () {
  // Better random token without crypto
  const resetToken =
    (Math.random().toString(36).substring(2) +
     Math.random().toString(36).substring(2) +
     Date.now().toString(36));

  this.resetPasswordToken = resetToken;

  // Increase expiry time
  this.resetPasswordExpire = Date.now() + 30 * 60 * 1000; // 30 minutes

  return resetToken;
};



module.exports = mongoose.model('User', userSchema);