const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Department name is required'],
    unique: true,
    trim: true,
    uppercase: true
  },
  code: {
    type: String,
    required: [true, 'Department code is required'],
    unique: true,
    uppercase: true,
    trim: true,
    minlength: 2,
    maxlength: 10
  },
  description: {
    type: String,
    trim: true
  },
  head: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  isActive: {
    type: Boolean,
    default: true
  },
  employeeCount: {
    type: Number,
    default: 0,
    min: 0
  }
}, {
  timestamps: true
});

// Indexes for performance
departmentSchema.index({ name: 1 });
departmentSchema.index({ code: 1 });
departmentSchema.index({ isActive: 1 });
// _id index is automatically created by MongoDB, no need to add

// Maintain employeeCount
departmentSchema.pre('save', async function (next) {
  if (!this.isModified('employeeCount')) return next();
  if (this.employeeCount < 0) {
    return next(new Error('Employee count cannot be negative'));
  }
  next();
});

module.exports = mongoose.model('Department', departmentSchema);
