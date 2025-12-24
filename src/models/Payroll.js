const mongoose = require('mongoose');

const payrollSchema = new mongoose.Schema({
  employee: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },

  earnings: {
    basicSalary: { type: Number, required: true, default: 0 },
    hra: { type: Number, default: 0 },
    transport: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    overtime: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },

  deductions: {
    pf: { type: Number, default: 0 },
    tax: { type: Number, default: 0 },
    insurance: { type: Number, default: 0 },
    advance: { type: Number, default: 0 },
    other: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },

  attendance: {
    workDays: { type: Number, required: true },
    presentDays: { type: Number, default: 0 },
    absentDays: { type: Number, default: 0 },
    leaveDays: { type: Number, default: 0 },
    halfDays: { type: Number, default: 0 }
  },

  netSalary: { type: Number, required: true, default: 0 },

  status: {
    type: String,
    enum: ['draft', 'processed', 'paid'],
    default: 'draft'
  },

  paidOn: Date,
  paymentMethod: { type: String, enum: ['bank-transfer', 'cash', 'cheque'] },
  transactionId: String,

  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
});

// Unique payroll per employee per month/year
payrollSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

// Auto-calculate totals before save
payrollSchema.pre('save', function(next) {
  const earnings = this.earnings;
  const deductions = this.deductions;

  earnings.total = earnings.basicSalary + earnings.hra + earnings.transport +
                   earnings.bonus + earnings.overtime + earnings.other;

  deductions.total = deductions.pf + deductions.tax + deductions.insurance +
                     deductions.advance + deductions.other;

  this.netSalary = earnings.total - deductions.total;

  next();
});

// Virtual: Gross Salary (before deductions)
payrollSchema.virtual('grossSalary').get(function() {
  return this.earnings.total;
});

module.exports = mongoose.model('Payroll', payrollSchema);