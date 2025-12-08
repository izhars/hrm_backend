const Payroll = require('../models/Payroll');
const User = require('../models/User');
const Attendance = require('../models/Attendance');

// @desc    Generate payroll for employee
// @route   POST /api/payroll/generate
// @access  Private (HR, Admin)
exports.generatePayroll = async (req, res) => {
  try {
    const { employeeId, month, year } = req.body;
    
    // Check if payroll already exists
    const existingPayroll = await Payroll.findOne({
      employee: employeeId,
      month,
      year
    });
    
    if (existingPayroll) {
      return res.status(400).json({
        success: false,
        message: 'Payroll already generated for this month'
      });
    }
    
    // Get employee details
    const employee = await User.findById(employeeId);
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }
    
    // Calculate attendance for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const attendance = await Attendance.find({
      employee: employeeId,
      date: { $gte: startDate, $lte: endDate }
    });
    
    const workDays = new Date(year, month, 0).getDate(); // Total days in month
    const presentDays = attendance.filter(a => a.status === 'present').length;
    const absentDays = attendance.filter(a => a.status === 'absent').length;
    const leaveDays = attendance.filter(a => a.status === 'on-leave').length;
    const halfDays = attendance.filter(a => a.status === 'half-day').length;
    
    // Calculate earnings
    const basicSalary = employee.salary.basic || 0;
    const hra = employee.salary.hra || 0;
    const transport = employee.salary.transport || 0;
    
    // Calculate deductions (simplified calculation)
    const pf = basicSalary * 0.12; // 12% PF
    const tax = basicSalary * 0.10; // 10% tax (simplified)
    
    // Create payroll
    const payroll = await Payroll.create({
      employee: employeeId,
      month,
      year,
      earnings: {
        basicSalary,
        hra,
        transport,
        bonus: 0,
        overtime: 0,
        other: 0
      },
      deductions: {
        pf,
        tax,
        insurance: 0,
        advance: 0,
        other: 0
      },
      attendance: {
        workDays,
        presentDays,
        absentDays,
        leaveDays,
        halfDays
      },
      generatedBy: req.user.id,
      status: 'draft'
    });
    
    await payroll.populate('employee', 'firstName lastName employeeId email');
    
    res.status(201).json({
      success: true,
      message: 'Payroll generated successfully',
      payroll
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
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