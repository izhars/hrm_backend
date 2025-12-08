const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Leave = require('../models/Leave');
const Department = require('../models/Department');
const Announcement = require('../models/Announcement');

// Helper: Start of today (00:00:00.000)
const getStartOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Helper: Start of current month
const getStartOfMonth = () => {
  const today = new Date();
  return new Date(today.getFullYear(), today.getMonth(), 1);
};

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const today = getStartOfDay();
    const startOfMonth = getStartOfMonth();

    // -------------------------------------------------
    // 1. EMPLOYEE DASHBOARD
    // -------------------------------------------------
    if (req.user.role === 'employee') {
      const [todayAttendance, pendingLeaves, monthAttendance] = await Promise.all([
        Attendance.findOne({ employee: req.user.id, date: today }).lean(),
        Leave.countDocuments({ employee: req.user.id, status: 'pending' }),
        Attendance.find({
          employee: req.user.id,
          date: { $gte: startOfMonth, $lte: today },
        }).lean(),
      ]);

      const monthlyStats = {
        present: monthAttendance.filter(a => ['present', 'half-day'].includes(a.status)).length,
        absent:  monthAttendance.filter(a => a.status === 'absent').length,
        onLeave: monthAttendance.filter(a => a.status === 'on-leave').length,
      };

      const stats = {
        todayStatus: todayAttendance?.status ?? 'absent',
        checkInTime: todayAttendance?.checkInTimeFormatted ?? null,
        checkOutTime: todayAttendance?.checkOutTimeFormatted ?? null,
        workHours: todayAttendance?.workHours ?? 0,
        isLate: todayAttendance?.isLate ?? false,
        leaveBalance: req.user.leaveBalance,
        pendingLeaves,
        monthlyStats,
      };

      return res.status(200).json({ success: true, stats });
    }

    // -------------------------------------------------
    // 2. HR / ADMIN / MANAGER DASHBOARD
    // -------------------------------------------------
    const [
      totalEmployees,
      totalDepartments,
      pendingLeaves,
      recentAnnouncements,
      departments,
      monthLeaves,
      allEmployees,
      todayAttendance,
    ] = await Promise.all([
      User.countDocuments({ isActive: true, role: { $in: ['employee', 'manager'] } }),
      Department.countDocuments({ isActive: true }),
      Leave.countDocuments({ status: 'pending' }),
      Announcement.find({ isActive: true })
        .limit(5)
        .sort({ createdAt: -1 })
        .populate('createdBy', 'firstName lastName')
        .lean(),
      Department.find({ isActive: true }).select('name code employeeCount').lean(),
      Leave.countDocuments({ startDate: { $gte: startOfMonth }, status: 'approved' }),

      // All employees/managers
      User.find({ isActive: true, role: { $in: ['employee', 'manager'] } })
        .select('_id firstName lastName role department')
        .lean(),

      // Today’s attendance records
      Attendance.find({ date: today })
        .populate('employee', '_id firstName lastName role department')
        .lean(),
    ]);

    // Initialize counters
    let presentToday = 0;
    let onLeaveToday = 0;
    let halfDayToday = 0;
    let lateToday = 0;

    todayAttendance.forEach(a => {
      if (['present', 'half-day'].includes(a.status)) presentToday++;
      if (a.status === 'on-leave') onLeaveToday++;
      if (a.status === 'half-day') halfDayToday++;
      if (a.isLate) lateToday++;
    });

    // 🔥 Count absentees = employees with no attendance record OR status === 'absent'
    const attendedEmployeeIds = todayAttendance.map(a => String(a.employee?._id));
    const absentToday = allEmployees.filter(
      emp =>
        !attendedEmployeeIds.includes(String(emp._id)) ||
        todayAttendance.some(
          a => String(a.employee?._id) === String(emp._id) && a.status === 'absent'
        )
    ).length;

    const stats = {
      totalEmployees,
      totalDepartments,
      presentToday,
      absentToday,
      lateToday,
      onLeaveToday,
      halfDayToday,
      pendingLeaves,
      monthLeaves,
      recentAnnouncements,
      departments,
    };

    res.status(200).json({ success: true, stats });
  } catch (error) {
    console.error('Dashboard Stats Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};



// @desc    Get attendance overview (monthly)
// @route   GET /api/dashboard/attendance-overview?month=6&year=2025
// @access  Private (HR, Manager, Admin)
exports.getAttendanceOverview = async (req, res) => {
  try {
    const { month, year } = req.query;
    const currentYear = parseInt(year) || new Date().getFullYear();
    const currentMonth = parseInt(month) || new Date().getMonth() + 1;

    const startDate = new Date(currentYear, currentMonth - 1, 1);
    const endDate = new Date(currentYear, currentMonth, 0, 23, 59, 59);

    const overviewAgg = await Attendance.aggregate([
      { $match: { date: { $gte: startDate, $lte: endDate } } },
      {
        $group: {
          _id: null,
          totalRecords: { $sum: 1 },
          present: { $sum: { $cond: [{ $in: ['$status', ['present', 'half-day']] }, 1, 0] } },
          absent: { $sum: { $cond: [{ $eq: ['$status', 'absent'] }, 1, 0] } },
          onLeave: { $sum: { $cond: [{ $eq: ['$status', 'on-leave'] }, 1, 0] } },
          late: { $sum: { $cond: ['$isLate', 1, 0] } },
          totalWorkHours: { $sum: '$workHours' }
        }
      }
    ]);

    const data = overviewAgg[0] || {
      totalRecords: 0, present: 0, absent: 0, onLeave: 0, late: 0, totalWorkHours: 0
    };

    const overview = {
      totalRecords: data.totalRecords,
      present: data.present,
      absent: data.absent,
      halfDay: data.present - data.late, // rough estimate
      onLeave: data.onLeave,
      late: data.late,
      totalWorkHours: data.totalWorkHours
    };

    res.status(200).json({
      success: true,
      month: currentMonth,
      year: currentYear,
      overview
    });
  } catch (error) {
    console.error('Attendance Overview Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get leave overview (yearly)
// @route   GET /api/dashboard/leave-overview?year=2025
// @access  Private (HR, Manager, Admin)
exports.getLeaveOverview = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = parseInt(year) || new Date().getFullYear();

    const startOfYear = new Date(currentYear, 0, 1);
    const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59);

    const leaves = await Leave.find({
      startDate: { $gte: startOfYear, $lte: endOfYear }
    }).lean();

    const overview = {
      total: leaves.length,
      pending: leaves.filter(l => l.status === 'pending').length,
      approved: leaves.filter(l => l.status === 'approved').length,
      rejected: leaves.filter(l => l.status === 'rejected').length,
      cancelled: leaves.filter(l => l.status === 'cancelled').length,
      byType: {
        casual: leaves.filter(l => l.leaveType === 'casual').length,
        sick: leaves.filter(l => l.leaveType === 'sick').length,
        earned: leaves.filter(l => l.leaveType === 'earned').length,
        unpaid: leaves.filter(l => l.leaveType === 'unpaid').length
      },
      totalDays: leaves
        .filter(l => l.status === 'approved')
        .reduce((sum, l) => sum + (l.totalDays || 0), 0)
    };

    res.status(200).json({
      success: true,
      year: currentYear,
      overview
    });
  } catch (error) {
    console.error('Leave Overview Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get employee growth chart data
// @route   GET /api/dashboard/employee-growth?year=2025
// @access  Private (HR, Admin)
exports.getEmployeeGrowth = async (req, res) => {
  try {
    const { year } = req.query;
    const currentYear = parseInt(year) || new Date().getFullYear();

    const monthlyData = [];

    for (let month = 0; month < 12; month++) {
      const startOfMonth = new Date(currentYear, month, 1);
      const endOfMonth = new Date(currentYear, month + 1, 0, 23, 59, 59);

      const [joined, left, totalAtEnd] = await Promise.all([
        User.countDocuments({
          role: 'employee',
          dateOfJoining: { $gte: startOfMonth, $lte: endOfMonth }
        }),
        User.countDocuments({
          role: 'employee',
          dateOfLeaving: { $gte: startOfMonth, $lte: endOfMonth }
        }),
        User.countDocuments({
          role: 'employee',
          dateOfJoining: { $lte: endOfMonth },
          $or: [
            { dateOfLeaving: { $exists: false } },
            { dateOfLeaving: { $gt: endOfMonth } }
          ]
        })
      ]);

      monthlyData.push({
        month: month + 1,
        monthName: new Date(currentYear, month).toLocaleString('default', { month: 'short' }),
        joined,
        left,
        total: totalAtEnd
      });
    }

    res.status(200).json({
      success: true,
      year: currentYear,
      data: monthlyData
    });
  } catch (error) {
    console.error('Employee Growth Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all employees (with pagination)
// @route   GET /api/employees?page=1&limit=10
// @access  Private (HR, Admin)
exports.getAllEmployees = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      User.find({ role: 'employee', isActive: true })
        .select('-password')
        .populate('department', 'name code')
        .skip(skip)
        .limit(limit)
        .lean(),
      User.countDocuments({ role: 'employee', isActive: true })
    ]);

    res.status(200).json({
      success: true,
      count: employees.length,
      total,
      page,
      pages: Math.ceil(total / limit),
      employees
    });
  } catch (error) {
    console.error('Get Employees Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single employee by ID
// @route   GET /api/employees/:id
// @access  Private (HR, Admin)
exports.getEmployeeById = async (req, res) => {
  try {
    const employee = await User.findById(req.params.id)
      .select('-password')
      .populate('department', 'name code')
      .lean();

    if (!employee || employee.role !== 'employee') {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.status(200).json({
      success: true,
      employee
    });
  } catch (error) {
    console.error('Get Employee By ID Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};