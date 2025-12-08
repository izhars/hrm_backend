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
    workDays: { type: Number, default: 0 },
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

// Unique index for employee, month, year combination
payrollSchema.index({ employee: 1, month: 1, year: 1 }, { unique: true });

// Calculate totals before saving
payrollSchema.pre('save', function(next) {
  // Calculate total earnings
  const { basicSalary, hra, transport, bonus, overtime, other } = this.earnings;
  this.earnings.total = basicSalary + hra + transport + bonus + overtime + other;
  
  // Calculate total deductions
  const deductions = this.deductions;
  this.deductions.total = deductions.pf + deductions.tax + deductions.insurance + deductions.advance + deductions.other;
  
  // Calculate net salary
  this.netSalary = this.earnings.total - this.deductions.total;
  
  next();
});

module.exports = mongoose.model('Payroll', payrollSchema);