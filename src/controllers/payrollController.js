const Payroll = require('../models/Payroll');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

// Generate Payroll - with accurate proration
exports.generatePayroll = async (req, res) => {
  try {
    const {
      employeeId,
      month,
      year,
      bonus = 0,
      overtime = 0,
      otherEarnings = 0,
      insurance = 0,
      advance = 0,
      otherDeductions = 0,
      pfRate = 0.12,
      taxRate = 0.10
    } = req.body;

    if (!employeeId || !month || !year) {
      return res.status(400).json({ success: false, message: 'employeeId, month, and year are required' });
    }

    if (month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: 'Invalid month' });
    }

    const existing = await Payroll.findOne({ employee: employeeId, month, year });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Payroll already exists for this period' });
    }

    const employee = await User.findById(employeeId);
    if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

    const basic = employee.salary?.basic || 0;
    const hra = employee.salary?.hra || 0;
    const transport = employee.salary?.transport || 0;

    if (basic === 0) {
      return res.status(400).json({ success: false, message: 'Employee has no basic salary set' });
    }

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const workDays = new Date(year, month, 0).getDate();

    const attendance = await Attendance.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate }
    });

    const presentDays = attendance.filter(a => a.status === 'present').length;
    const leaveDays = attendance.filter(a => a.status === 'on-leave').length;
    const halfDays = attendance.filter(a => a.status === 'half-day').length;
    const absentDays = attendance.filter(a => a.status === 'absent').length;

    // Change policy here: include/exclude leaveDays
    const payableDays = presentDays + leaveDays + (halfDays * 0.5); // Leaves are PAID

    const dailyBasic = basic / workDays;
    const dailyHra = hra / workDays;
    const dailyTransport = transport / workDays;

    const earnedBasic = dailyBasic * payableDays;
    const earnedHra = dailyHra * payableDays;
    const earnedTransport = dailyTransport * payableDays;

    const pf = earnedBasic * pfRate;
    const tax = earnedBasic * taxRate;

    const payroll = await Payroll.create({
      employee: employeeId,
      month,
      year,
      earnings: {
        basicSalary: Math.round(earnedBasic * 100) / 100,
        hra: Math.round(earnedHra * 100) / 100,
        transport: Math.round(earnedTransport * 100) / 100,
        bonus,
        overtime,
        other: otherEarnings
      },
      deductions: {
        pf: Math.round(pf * 100) / 100,
        tax: Math.round(tax * 100) / 100,
        insurance,
        advance,
        other: otherDeductions
      },
      attendance: { workDays, presentDays, absentDays, leaveDays, halfDays },
      generatedBy: req.user.id,
      status: 'draft'
    });

    await payroll.populate([
      { path: 'employee', select: 'firstName lastName employeeId email department' },
      { path: 'generatedBy', select: 'firstName lastName' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Payroll generated successfully',
      payroll
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all payrolls
// @route   GET /api/payroll
// @access  Private (HR, Admin)
exports.getAllPayrolls = async (req, res) => {
  try {
    const { month, year, status, employeeId } = req.query;
    
    const query = {};
    if (month) query.month = month;
    if (year) query.year = year;
    if (status) query.status = status;
    if (employeeId) query.employee = employeeId;
    
    const payrolls = await Payroll.find(query)
      .populate('employee', 'firstName lastName employeeId email department')
      .populate('generatedBy', 'firstName lastName')
      .sort({ year: -1, month: -1 });
    
    res.status(200).json({
      success: true,
      count: payrolls.length,
      payrolls
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Get my payroll
// @route   GET /api/payroll/my-payroll
// @access  Private
exports.getMyPayroll = async (req, res) => {
  try {
    const { month, year } = req.query;
    
    const query = { employee: req.user.id };
    if (month) query.month = month;
    if (year) query.year = year;
    
    const payrolls = await Payroll.find(query)
      .sort({ year: -1, month: -1 });
    
    res.status(200).json({
      success: true,
      count: payrolls.length,
      payrolls
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Update payroll
// @route   PUT /api/payroll/:id
// @access  Private (HR, Admin)
exports.updatePayroll = async (req, res) => {
  try {
    let payroll = await Payroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found'
      });
    }
    
    payroll = await Payroll.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('employee');
    
    res.status(200).json({
      success: true,
      message: 'Payroll updated successfully',
      payroll
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Process payroll
// @route   PUT /api/payroll/:id/process
// @access  Private (HR, Admin)
exports.processPayroll = async (req, res) => {
  try {
    const payroll = await Payroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found'
      });
    }
    
    payroll.status = 'processed';
    await payroll.save();
    
    res.status(200).json({
      success: true,
      message: 'Payroll processed successfully',
      payroll
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};

// @desc    Mark payroll as paid
// @route   PUT /api/payroll/:id/pay
// @access  Private (HR, Admin)
exports.markAsPaid = async (req, res) => {
  try {
    const { paymentMethod, transactionId } = req.body;
    
    const payroll = await Payroll.findById(req.params.id);
    
    if (!payroll) {
      return res.status(404).json({
        success: false,
        message: 'Payroll not found'
      });
    }
    
    payroll.status = 'paid';
    payroll.paidOn = Date.now();
    payroll.paymentMethod = paymentMethod;
    payroll.transactionId = transactionId;
    payroll.paidBy = req.user.id;
    await payroll.save();
    
    await payroll.populate('employee paidBy');
    
    res.status(200).json({
      success: true,
      message: 'Payroll marked as paid',
      payroll
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
};