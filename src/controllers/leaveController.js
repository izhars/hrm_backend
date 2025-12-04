// controllers/leaveController.js
const Leave = require('../models/Leave');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Notification = require('../models/Notification');

// ====================================
// HELPER: Can current user act on leave?
// ====================================
const canActOnLeave = async (currentUser, leaveEmployeeId) => {
  if (['hr', 'superadmin'].includes(currentUser.role)) return true;

  if (currentUser.role === 'manager') {
    const employee = await User.findById(leaveEmployeeId).select('reportingManager');
    return employee && employee.reportingManager?.toString() === currentUser.id;
  }
  return false;
};

// ================================
// 1. Apply for Leave (Employee)
// ================================
exports.applyLeave = async (req, res) => {
  try {
    console.log('[Leave] Request body:', req.body);

    const {
      leaveType,
      startDate,
      endDate,
      reason,
      documents,
      leaveDuration,
      halfDayType
    } = req.body;

    if (!leaveType || !startDate || !endDate || !leaveDuration) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start) || isNaN(end) || start > end) {
      return res.status(400).json({
        success: false,
        message: 'Invalid date range. End date must be after start date.'
      });
    }

    // === Half-day validation ===
    if (leaveDuration === 'half') {
      if (!halfDayType || !['first_half', 'second_half'].includes(halfDayType)) {
        return res.status(400).json({
          success: false,
          message: 'halfDayType must be "first_half" or "second_half"'
        });
      }
      if (start.toDateString() !== end.toDateString()) {
        return res.status(400).json({
          success: false,
          message: 'Half-day leave can only be applied for a single day.'
        });
      }
    }

    // === Fetch holidays in range ===
    const holidays = await Holiday.find({
      date: { $gte: start, $lte: end },
      isActive: true
    }).select('date');
    const holidayDates = holidays.map(h => h.date.toDateString());

    // === Filter leave days to exclude holidays ===
    let leaveDays = [];
    if (leaveDuration === 'full') {
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        if (!holidayDates.includes(d.toDateString())) {
          leaveDays.push(new Date(d));
        }
      }
    } else {
      // Half-day leave: check if it's a holiday
      if (!holidayDates.includes(start.toDateString())) {
        leaveDays.push(new Date(start));
      }
    }

    if (leaveDays.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All selected dates are holidays. Leave cannot be applied.'
      });
    }

    // === Check for overlapping full-day leaves ===
    const fullDayOverlap = await Leave.findOne({
      employee: req.user.id,
      status: { $in: ['pending', 'approved'] },
      leaveDuration: 'full',
      startDate: { $lte: end },
      endDate: { $gte: start }
    });

    if (fullDayOverlap) {
      return res.status(400).json({
        success: false,
        message: 'Cannot apply leave. Full-day leave already exists for these dates.'
      });
    }

    // === Check for overlapping half-day leaves ===
    if (leaveDuration === 'half') {
      const halfDayOverlap = await Leave.findOne({
        employee: req.user.id,
        status: { $in: ['pending', 'approved'] },
        leaveDuration: 'half',
        startDate: start,
        endDate: end,
        halfDayType
      });

      if (halfDayOverlap) {
        return res.status(400).json({
          success: false,
          message: `Cannot apply ${halfDayType} leave. Already exists for this date.`
        });
      }
    }

    // === Check attendance conflicts ===
    const attendance = await Attendance.find({
      employee: req.user.id,
      date: { $gte: start, $lte: end },
      'checkIn.time': { $ne: null }
    });

    if (attendance.length > 0) {
      if (leaveDuration === 'half') {
        const att = attendance.find(a => new Date(a.date).toDateString() === start.toDateString());
        if (att && halfDayType === 'first_half') {
          return res.status(400).json({
            success: false,
            message: 'You already punched in today. First half leave not allowed, apply for second half instead.'
          });
        }
      } else {
        const punchedDates = attendance.map(a => a.date.toDateString());
        return res.status(400).json({
          success: false,
          message: `You already punched in on ${punchedDates.join(', ')}, leave not allowed for these dates.`
        });
      }
    }

    // === Fetch user & probation check ===
    const user = await User.findById(req.user.id);
    const today = new Date();
    if (user.probationEndDate && today < new Date(user.probationEndDate)
      && leaveType !== 'unpaid' && leaveType !== 'combo') {
      return res.status(400).json({
        success: false,
        message: 'You are on probation. Paid leaves are locked. Only unpaid or combo leave can be applied.'
      });
    }

    // === Calculate totalDays, excluding holidays ===
    let totalDays;
    try {
      totalDays = await getWorkingDays(
        leaveDays[0],
        leaveDays[leaveDays.length - 1],
        leaveDuration,
        halfDayType,
        leaveType,
        holidayDates // pass holidays to skip
      );
    } catch (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    // === Check leave balance ===
    if (leaveType !== 'unpaid' && user.leaveBalance[leaveType] < totalDays) {
      return res.status(400).json({
        success: false,
        message: `Insufficient ${leaveType} leave. Available: ${user.leaveBalance[leaveType]} days`
      });
    }

    // === Create the leave ===
    const leave = await Leave.create({
      employee: req.user.id,
      leaveType,
      leaveDuration,
      halfDayType: leaveDuration === 'half' ? halfDayType : null,
      startDate: leaveDays[0],
      endDate: leaveDays[leaveDays.length - 1],
      totalDays,
      reason,
      documents: documents || []
    });

    await leave.populate('employee', 'firstName lastName employeeId email');

    // === Send notification to HR/Admin ===
    await Notification.create({
      title: 'New Leave Application',
      message: `${leave.employee.firstName} ${leave.employee.lastName} has applied for ${leave.leaveType} leave from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()}.`,
      type: 'info',
      role: 'hr',
      meta: { leaveId: leave._id, applicantId: req.user.id },
    });

    res.status(201).json({
      success: true,
      message: 'Leave applied successfully. Holidays were skipped in calculation. Notification sent to HR and Admin.',
      leave
    });

  } catch (error) {
    console.error('[Leave] Apply Leave Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================================
// 2. Get My Leaves
// ================================
exports.getMyLeaves = async (req, res) => {
  try {
    const { status, year } = req.query;
    const query = { employee: req.user.id };

    if (status) query.status = status;
    if (year) {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59);
      query.startDate = { $gte: start, $lte: end };
    }

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .populate('approvedBy', 'firstName lastName email');

    res.status(200).json({
      success: true,
      count: leaves.length,
      leaves
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================================
// 3. Get Single Leave
// ================================
exports.getLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id)
      .populate('employee', 'firstName lastName employeeId email profilePicture department')
      .populate('employee.department', 'name')
      .populate('approvedBy', 'firstName lastName email');

    if (!leave) {
      return res.status(404).json({ success: false, message: 'Leave not found' });
    }

    const isOwner = leave.employee._id.toString() === req.user.id;
    const allowed = isOwner || await canActOnLeave(req.user, leave.employee._id);

    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this leave' });
    }

    res.status(200).json({ success: true, leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================================
// 4. Get Leave Balance
// ================================
exports.getLeaveBalance = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('leaveBalance');
    res.status(200).json({ success: true, leaveBalance: user.leaveBalance });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================================
// 5. Cancel Leave
// ================================
exports.cancelLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    const isEmployee = leave.employee.toString() === req.user.id;
    const isManagerOrAbove = await canActOnLeave(req.user, leave.employee);

    if (!isEmployee && !isManagerOrAbove) {
      return res.status(403).json({ success: false, message: 'Not authorized to cancel this leave' });
    }

    if (isEmployee && !['pending', 'approved'].includes(leave.status)) {
      return res.status(400).json({ success: false, message: 'You can only cancel pending or approved leaves' });
    }

    // ✅ Restore balance if approved
    if (leave.status === 'approved' && leave.leaveType !== 'unpaid') {
      await User.findByIdAndUpdate(
        leave.employee,
        { $inc: { [`leaveBalance.${leave.leaveType}`]: leave.totalDays } }
      );
    }

    leave.status = 'cancelled';
    if (isManagerOrAbove) {
      leave.cancelledBy = req.user.id;
      leave.cancellationReason = req.body.cancellationReason || 'Cancelled by manager/HR';
    }

    await leave.save();

    res.status(200).json({ success: true, message: 'Leave cancelled', leave });
  } catch (error) {
    console.error('Cancel Leave Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================================
// 6. Get Pending Leaves (Manager/HR)
// ================================
exports.getPendingLeaves = async (req, res) => {
  try {
    const { department } = req.query;
    let query = { status: 'pending' };

    if (req.user.role === 'manager') {
      const team = await User.find({ reportingManager: req.user.id }).select('_id');
      query.employee = { $in: team.map(t => t._id) };
    }

    if (department) {
      const deptUsers = await User.find({ department }).select('_id');
      query.employee = { $in: deptUsers.map(u => u._id) };
    }

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .populate('employee', 'firstName lastName employeeId email department profilePicture')
      .populate('employee.department', 'name');

    res.status(200).json({ success: true, count: leaves.length, leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================================
// 7. Approve Leave
// ================================
exports.approveLeave = async (req, res) => {
  try {
    const leave = await Leave.findById(req.params.id);
    if (!leave)
      return res.status(404).json({ success: false, message: 'Leave not found' });

    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Leave already processed' });
    }

    const allowed = await canActOnLeave(req.user, leave.employee);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized to approve this leave' });
    }

    leave.status = 'approved';
    leave.approvedBy = req.user.id;
    leave.approvedAt = Date.now();
    await leave.save();

    // ✅ Deduct balance
    if (leave.leaveType !== 'unpaid') {
      if (leave.leaveType === 'combo') {
        // Deduct from combo balance
        await User.findByIdAndUpdate(
          leave.employee,
          { $inc: { 'leaveBalance.combo': -leave.totalDays } }
        );
      } else {
        // Deduct from regular leave balance
        await User.findByIdAndUpdate(
          leave.employee,
          { $inc: { [`leaveBalance.${leave.leaveType}`]: -leave.totalDays } }
        );
      }
    }

    // ✅ Mark attendance
    const current = new Date(leave.startDate);
    while (current <= leave.endDate) {
      const attendanceData = {
        employee: leave.employee,
        date: new Date(current),
        status: leave.leaveDuration === 'half'
          ? (leave.halfDayType === 'first_half' ? 'half-day-first' : 'half-day-second')
          : 'on-leave'
      };

      await Attendance.findOneAndUpdate(
        { employee: leave.employee, date: new Date(current) },
        attendanceData,
        { upsert: true }
      );

      current.setDate(current.getDate() + 1);
    }

    await leave.populate('employee approvedBy');
    res.status(200).json({ success: true, message: 'Leave approved', leave });
  } catch (error) {
    console.error('Approve Leave Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ================================
// 8. Reject Leave
// ================================
exports.rejectLeave = async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const leave = await Leave.findById(req.params.id);
    if (!leave) return res.status(404).json({ success: false, message: 'Leave not found' });

    if (leave.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Leave already processed' });
    }

    const allowed = await canActOnLeave(req.user, leave.employee);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Not authorized to reject this leave' });
    }

    leave.status = 'rejected';
    leave.approvedBy = req.user.id;
    leave.approvedAt = Date.now();
    leave.rejectionReason = rejectionReason || 'No reason provided';
    await leave.save();

    await leave.populate('employee approvedBy');
    res.status(200).json({ success: true, message: 'Leave rejected', leave });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ================================
// 9. Get All Leaves (HR/Manager)
// ================================
exports.getAllLeaves = async (req, res) => {
  try {
    const { status, department, year } = req.query;
    let query = {};

    if (status) query.status = status;
    if (department) {
      const users = await User.find({ department }).select('_id');
      query.employee = { $in: users.map(u => u._id) };
    }
    if (year) {
      const start = new Date(year, 0, 1);
      const end = new Date(year, 11, 31, 23, 59, 59);
      query.startDate = { $gte: start, $lte: end };
    }

    if (req.user.role === 'manager') {
      const team = await User.find({ reportingManager: req.user.id }).select('_id');
      query.employee = { $in: team.map(t => t._id) };
    }

    const leaves = await Leave.find(query)
      .sort({ createdAt: -1 })
      .populate('employee', 'firstName lastName employeeId email department profilePicture')
      .populate('approvedBy', 'firstName lastName email');

    res.status(200).json({ success: true, count: leaves.length, leaves });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};


// ---------------------------------------------------
// Helper: count *working* days (skip Sat/Sun + holidays)
// ---------------------------------------------------
const getWorkingDays = async (start, end, leaveDuration, halfDayType, leaveType) => {
  if (!(start instanceof Date) || !(end instanceof Date) || isNaN(start) || isNaN(end)) {
    throw new Error('Invalid date range');
  }

  if (start > end) throw new Error('Start date cannot be after end date');

  // Combo leave cannot be half-day
  if (leaveType === 'combo' && leaveDuration === 'half') {
    throw new Error('Combo leave cannot be half-day.');
  }

  const startDate = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDate = new Date(end.getFullYear(), end.getMonth(), end.getDate());

  // Load holidays
  const holidays = await Holiday.find({
    date: { $gte: new Date(startDate.getFullYear(), 0, 1), $lte: new Date(endDate.getFullYear(), 11, 31) }
  }).select('date');

  const holidaySet = new Set(
    holidays.map(h => {
      const d = h.date;
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })
  );

  let workingDays = 0;
  const cur = new Date(startDate);

  console.log('[WorkingDays] Calculating working days from', startDate.toDateString(), 'to', endDate.toDateString());
  while (cur <= endDate) {
    const dayStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`;
    const dayOfWeek = cur.getDay(); // 0 = Sunday, 6 = Saturday

    if (dayOfWeek === 0 || dayOfWeek === 6) {
      console.log(`[WorkingDays] ${dayStr} is weekend, skipped`);
    } else if (holidaySet.has(dayStr)) {
      console.log(`[WorkingDays] ${dayStr} is holiday, skipped`);
    } else {
      workingDays++;
      console.log(`[WorkingDays] ${dayStr} counted as working day (total so far: ${workingDays})`);
    }

    cur.setDate(cur.getDate() + 1);
  }

  // Handle half-day
  if (leaveDuration === 'half') {
    if (startDate.toDateString() !== endDate.toDateString()) {
      throw new Error('Half-day leave can only be applied for a single day.');
    }
    if (!['first_half', 'second_half'].includes(halfDayType)) {
      throw new Error('halfDayType must be "first_half" or "second_half"');
    }
    console.log('[WorkingDays] Half-day leave applied: 0.5 days');
    return 0.5;
  }

  console.log('[WorkingDays] Total working days:', workingDays);
  return workingDays;
};
