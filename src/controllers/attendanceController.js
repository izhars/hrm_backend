const Attendance = require('../models/Attendance');
const User = require('../models/User');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const moment = require('moment-timezone');
const ComboOff = require('../models/ComboOff');

const {
  getISTDate,
  getISTMidnight,
  getISTStandardTime,
  getISTStandardCheckoutTime,   // ← correct name
  getISTAutoCheckoutTime,
  formatISTTime,
  getCurrentWorkHours,          // ← correct name
} = require('../utils/dateUtils');

// @desc    Check in
// @route   POST /api/attendance/check-in
// @access  Private
exports.checkIn = async (req, res) => {
  try {
    const { latitude, longitude, address, deviceInfo } = req.body;
    const today = getISTMidnight();

    console.log("Check-In Attempt");
    console.log("User ID:", req.user.id);
    console.log("Date (IST Midnight):", today);
    console.log("Location:", { latitude, longitude, address });
    console.log("Device Info:", deviceInfo);

    // ── employee weekend type ───────────────────────────────────────────────
    const user = await User.findById(req.user.id).select("weekendType");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    const weekendType = user.weekendType || "sunday";
    const day = today.getDay(); // 0 = Sunday, 6 = Saturday
    const isWeekend =
      (weekendType === "sunday" && day === 0) ||
      (weekendType === "saturday_sunday" && (day === 0 || day === 6));

    // ── check for holiday ───────────────────────────────────────────────────
    const startOfDay = getISTMidnight();
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(startOfDay.getDate() + 1);

    const holiday = await Holiday.findOne({
      date: { $gte: startOfDay, $lt: endOfDay },
      isActive: true,
    });

    // ── weekend or holiday logic ────────────────────────────────────────────
    if (isWeekend || holiday) {
      console.log("Weekend/Holiday check detected");

      // Check if Combo Off is approved for today
      const comboOff = await ComboOff.findOne({
        employee: req.user.id,
        date: today,
        status: "approved",
      });

      if (!comboOff) {
        const msg = holiday
          ? `Cannot check in on holiday (${holiday.name}) without approved Combo Off`
          : "Cannot check in on your weekly off day without approved Combo Off";

        return res.status(400).json({
          success: false,
          message: msg,
        });
      } else {
        console.log("✅ Combo Off Approved for this date");
      }
    }

    // ── leave check ─────────────────────────────────────────────────────────
    const leave = await Leave.findOne({
      employee: req.user.id,
      fromDate: { $lte: today },
      toDate: { $gte: today },
      status: "approved",
    });
    if (leave) {
      return res.status(400).json({
        success: false,
        message: "Cannot check in, you are on approved leave",
      });
    }

    // ── already checked-in? ────────────────────────────────────────────────
    const existingAttendance = await Attendance.findOne({
      employee: req.user.id,
      date: today,
    });

    if (existingAttendance && existingAttendance.checkIn?.time) {
      return res.status(400).json({
        success: false,
        message: "Already checked in today",
        checkInTime: formatISTTime(existingAttendance.checkIn.time),
      });
    }

    // ── record check-in ─────────────────────────────────────────────────────
    const checkInTime = getISTDate();
    const standardTime = getISTStandardTime();
    const isLate = checkInTime > standardTime;
    const lateBy = isLate ? Math.round((checkInTime - standardTime) / (1000 * 60)) : 0;

    let attendance;
    if (existingAttendance) {
      existingAttendance.checkIn = {
        time: checkInTime,
        location: { latitude, longitude, address },
        deviceInfo,
      };
      existingAttendance.status = "present";
      existingAttendance.isLate = isLate;
      existingAttendance.lateBy = lateBy;
      attendance = await existingAttendance.save();
    } else {
      attendance = await Attendance.create({
        employee: req.user.id,
        date: today,
        checkIn: {
          time: checkInTime,
          location: { latitude, longitude, address },
          deviceInfo,
        },
        status: "present",
        isLate,
        lateBy,
      });
    }

    // ── mark Combo Off as earned after successful weekend/holiday punch-in ──
    if (isWeekend || holiday) {
      const comboOff = await ComboOff.findOne({
        employee: req.user.id,
        date: today,
        status: "approved",
      });
      if (comboOff) {
        comboOff.status = "earned";
        comboOff.earnedOn = new Date();
        await comboOff.save();
        console.log("✅ Combo Off marked as earned");
      }
    }

    res.status(200).json({
      success: true,
      message: isLate ? `Checked in ${lateBy} minutes late` : "Checked in successfully",
      checkInTime: formatISTTime(checkInTime),
      isLate,
      lateBy,
      attendance: {
        ...attendance.toObject(),
        checkInTimeFormatted: formatISTTime(attendance.checkIn.time),
      },
    });
  } catch (error) {
    console.error("Check-in error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// ─────────────────────────────────────────────────────────────────────────────
// @desc    Check out
// @route   POST /api/attendance/check-out
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.checkOut = async (req, res) => {
  try {
    const { latitude, longitude, address, deviceInfo } = req.body;
    const today = getISTMidnight();

    const attendance = await Attendance.findOne({
      employee: req.user.id,
      date: today,
    });

    if (!attendance || !attendance.checkIn?.time) {
      return res.status(400).json({ success: false, message: 'Please check in first' });
    }
    if (attendance.checkOut?.time) {
      return res.status(400).json({ success: false, message: 'Already checked out today' });
    }

    let checkOutTime = getISTDate();

    // ── prevent checkout before check-in ───────────────────────────────────
    if (checkOutTime < attendance.checkIn.time) {
      return res
        .status(400)
        .json({ success: false, message: 'Check-out time cannot be before check-in time' });
    }

    // ── cap at 23:59:59 ───────────────────────────────────────────────────
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);
    const missedCheckout = checkOutTime > endOfDay;
    if (missedCheckout) checkOutTime = endOfDay;

    // ── SHORT ATTENDANCE LOGIC (CORRECTED) ────────────────────────────────
    const standardCheckOut = getISTStandardCheckoutTime(); // 18:00 IST
    
    // Short attendance = leaving before standard checkout time (6:00 PM)
    const isShort = checkOutTime < standardCheckOut;
    
    let shortByMinutes = 0;
    if (isShort) {
      shortByMinutes = Math.round((standardCheckOut - checkOutTime) / (1000 * 60));
    }

    // ── record checkout ───────────────────────────────────────────────────
    attendance.checkOut = {
      time: checkOutTime,
      location: { latitude, longitude, address },
      deviceInfo,
    };

    // ── work hours (actual duration) ──────────────────────────────────────
    const workHours = parseFloat(
      ((checkOutTime - attendance.checkIn.time) / (1000 * 60 * 60)).toFixed(2)
    );
    attendance.workHours = workHours;

    attendance.isShortAttendance = isShort;
    attendance.shortByMinutes = shortByMinutes;
    if (missedCheckout) attendance.missedCheckout = true;

    await attendance.save();

    res.status(200).json({
      success: true,
      message: missedCheckout
        ? `Checked out at 23:59 (missed). Work hours: ${workHours}`
        : isShort
          ? `Checked out – **short attendance** by ${shortByMinutes} min. Work hours: ${workHours}`
          : `Checked out – full day. Work hours: ${workHours}`,
      checkOutTime: formatISTTime(checkOutTime),
      workHours,
      isShortAttendance: isShort,
      shortByMinutes,
      missedCheckout,
      attendance: {
        ...attendance.toObject(),
        checkInTimeFormatted: formatISTTime(attendance.checkIn.time),
        checkOutTimeFormatted: formatISTTime(attendance.checkOut.time),
      },
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark missed checkouts
// @access  Internal (e.g., cron job)
exports.markMissedCheckouts = async () => {
  const today = getISTMidnight();
  const endOfDay = new Date(today);
  endOfDay.setHours(23, 59, 59, 999);

  const forgotCheckouts = await Attendance.find({
    date: today,
    checkIn: { $exists: true },
    checkOut: { $exists: false },
  });

  for (const attendance of forgotCheckouts) {
    const workHours = ((endOfDay - attendance.checkIn.time) / (1000 * 60 * 60)).toFixed(2);
    attendance.checkOut = { time: endOfDay };
    attendance.workHours = parseFloat(workHours);
    attendance.missedCheckout = true;
    await attendance.save();
    console.log(`Missed checkout marked for employee ${attendance.employee}, work hours: ${attendance.workHours}`);
  }
};


// @desc    Get my attendance
// @route   GET /api/attendance/my-attendance
// @access  Private
exports.getMyAttendance = async (req, res) => {
  try {
    const { startDate, endDate, month, year } = req.query;
    const employeeId = req.user.id;

    const user = await User.findById(employeeId).select('weekendType');
    const weekendType = user?.weekendType || 'sunday';

    // ── Date range setup ─────────────────────────────────────────────
    let start, end;
    if (startDate && endDate) {
      start = moment.tz(startDate, 'Asia/Kolkata').startOf('day');
      end = moment.tz(endDate, 'Asia/Kolkata').endOf('day');
    } else if (month && year) {
      start = moment.tz({ year: Number(year), month: Number(month) - 1, day: 1 }, 'Asia/Kolkata').startOf('day');
      end = moment(start).endOf('month');
    } else {
      start = moment.tz('Asia/Kolkata').startOf('month');
      end = moment(start).endOf('month');
    }

    const startUTC = start.clone().utc().toDate();
    const endUTC = end.clone().utc().toDate();

    // ── Fetch all data together ──────────────────────────────────────
    const [attendance, holidays, comboOffs] = await Promise.all([
      Attendance.find({
        employee: employeeId,
        date: { $gte: startUTC, $lte: endUTC },
      }).sort({ date: -1 }).lean(),
      Holiday.find({
        date: { $gte: startUTC, $lte: endUTC },
        isActive: true,
      }).lean(),
      ComboOff.find({
        employee: employeeId,
        date: { $gte: startUTC, $lte: endUTC },
        status: { $in: ['approved', 'used', 'earned'] },
      }).lean(),
    ]);

    // ── Create quick lookup maps ─────────────────────────────────────
    const holidayMap = new Map(
      holidays.map((h) => [moment(h.date).format('YYYY-MM-DD'), { name: h.name, type: h.type }])
    );
    const attendanceMap = new Map(
      attendance.map((a) => [moment(a.date).format('YYYY-MM-DD'), a])
    );
    const comboOffMap = new Map(
      comboOffs.map((c) => [moment(c.date).format('YYYY-MM-DD'), c])
    );

    const today = moment.tz('Asia/Kolkata').startOf('day');
    const totalDays = [];
    let current = start.clone();

    // ── Build the attendance list ────────────────────────────────────
    while (current.isSameOrBefore(end, 'day') && current.isSameOrBefore(today, 'day')) {
      const dateKey = current.format('YYYY-MM-DD');
      const dayOfWeek = current.format('dddd');
      const record = attendanceMap.get(dateKey);
      const holiday = holidayMap.get(dateKey);
      const comboOff = comboOffMap.get(dateKey);

      let isWeekend = false;
      if (weekendType === 'sunday') isWeekend = dayOfWeek === 'Sunday';
      else if (weekendType === 'saturday_sunday')
        isWeekend = ['Saturday', 'Sunday'].includes(dayOfWeek);

      // ── 1️⃣ Combo Off ───────────────────────────────────────────────
      if (comboOff) {
        totalDays.push({
          date: current.toDate(),
          status: 'combo-off',
          comboOffStatus: comboOff.status,
          remarks: comboOff.remarks || null,
          approvedBy: comboOff.approvedBy || null,
          workHours: 0,
          checkIn: { time: null },
          checkOut: { time: null },
          isLate: false,
        });
      }

      // ── 2️⃣ Holiday ────────────────────────────────────────────────
      else if (holiday) {
        totalDays.push({
          date: current.toDate(),
          status: 'holiday',
          holidayName: holiday.name,
          holidayType: holiday.type,
          workHours: 0,
          checkIn: { time: null },
          checkOut: { time: null },
          isLate: false,
        });
      }

      // ── 3️⃣ Weekend ────────────────────────────────────────────────
      else if (isWeekend) {
        totalDays.push({
          date: current.toDate(),
          status: 'weekly-off',
          workHours: 0,
          checkIn: { time: null },
          checkOut: { time: null },
          isLate: false,
        });
      }

      // ── 4️⃣ Present / Other Attendance ─────────────────────────────
      else if (record) {
        const workHours = current.isSame(today, 'day')
          ? getCurrentWorkHours(record)
          : record.workHours;

        totalDays.push({
          ...record,
          workHours,
          checkInTimeFormatted: record.checkIn?.time ? formatISTTime(record.checkIn.time) : null,
          checkOutTimeFormatted: record.checkOut?.time ? formatISTTime(record.checkOut.time) : null,
        });
      }

      // ── 5️⃣ Absent ────────────────────────────────────────────────
      else {
        totalDays.push({
          date: current.toDate(),
          status: 'absent',
          workHours: 0,
          checkIn: { time: null },
          checkOut: { time: null },
          isLate: false,
        });
      }

      current.add(1, 'day');
    }

    // ── Summary Stats ────────────────────────────────────────────────
    const stats = {
      totalDays: totalDays.length,
      present: totalDays.filter((a) => a.status === 'present').length,
      absent: totalDays.filter((a) => a.status === 'absent').length,
      halfDay: totalDays.filter((a) => a.status === 'half-day').length,
      onLeave: totalDays.filter((a) => a.status === 'on-leave').length,
      holiday: totalDays.filter((a) => a.status === 'holiday').length,
      weeklyOff: totalDays.filter((a) => a.status === 'weekly-off').length,
      comboOff: totalDays.filter((a) => a.status === 'combo-off').length,
      totalWorkHours: totalDays.reduce((sum, a) => sum + (a.workHours || 0), 0),
      lateCount: totalDays.filter((a) => a.isLate).length,
    };

    res.status(200).json({
      success: true,
      count: totalDays.length,
      stats,
      attendance: totalDays,
    });
  } catch (error) {
    console.error('Attendance fetch error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};



// @desc    Get today's attendance
// @route   GET /api/attendance/today
// @access  Private
exports.getTodayAttendance = async (req, res) => {
  try {
    const today = getISTMidnight();
    const employeeId = req.user.id;

    // ── Find attendance record ─────────────────────────────────────────────
    const attendance = await Attendance.findOne({
      employee: employeeId,
      date: today,
    }).lean();

    // ── Check if Combo Off exists for today ────────────────────────────────
    const comboOff = await ComboOff.findOne({
      employee: employeeId,
      date: today,
      status: { $in: ['approved', 'used', 'earned'] },
    }).populate('approvedBy', 'name email'); // optional: show approver

    // ── If Combo Off is found, show it clearly ─────────────────────────────
    if (comboOff) {
      return res.status(200).json({
        success: true,
        comboOff: {
          status: comboOff.status,
          remarks: comboOff.remarks || null,
          approvedBy: comboOff.approvedBy || null,
          earnedOn: comboOff.earnedOn || null,
        },
        attendance: null,
        isComboOff: true,
        isCheckedIn: false,
        isCheckedOut: false,
        checkInTimeFormatted: null,
        checkOutTimeFormatted: null,
        currentWorkHours: 0,
        message: 'Today is a Combo Off day',
      });
    }

    // ── Default response when normal attendance exists ─────────────────────
    res.status(200).json({
      success: true,
      isComboOff: false,
      attendance: attendance || null,
      isCheckedIn: !!attendance?.checkIn?.time,
      isCheckedOut: !!attendance?.checkOut?.time,
      checkInTimeFormatted: attendance?.checkIn?.time
        ? formatISTTime(attendance.checkIn.time)
        : null,
      checkOutTimeFormatted: attendance?.checkOut?.time
        ? formatISTTime(attendance.checkOut.time)
        : null,
      currentWorkHours: attendance ? getCurrentWorkHours(attendance) : 0,
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


// @desc    Get employee attendance (for managers/HR)
// @route   GET /api/attendance/employee/:employeeId
// @access  Private (Manager, HR, Admin)
exports.getEmployeeAttendance = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const query = { employee: req.params.employeeId };

    if (startDate && endDate) {
      query.date = {
        $gte: moment.tz(startDate, 'Asia/Kolkata').startOf('day').toDate(),
        $lte: moment.tz(endDate, 'Asia/Kolkata').endOf('day').toDate(),
      };
    }

    const attendance = await Attendance.find(query)
      .sort({ date: -1 })
      .populate('employee', 'firstName lastName employeeId email');

    res.status(200).json({
      success: true,
      count: attendance.length,
      attendance,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get attendance report
// @route   GET /api/attendance/report
// @access  Private (HR, Admin)
exports.getAttendanceReport = async (req, res) => {
  try {
    const { department, month, year } = req.query;
    const currentYear = year || moment().tz('Asia/Kolkata').year();
    const currentMonth = month || moment().tz('Asia/Kolkata').month() + 1;

    const startDate = moment.tz({ year: currentYear, month: currentMonth - 1, day: 1 }, 'Asia/Kolkata').startOf('day').toDate();
    const endDate = moment.tz({ year: currentYear, month: currentMonth - 1, day: 1 }, 'Asia/Kolkata').endOf('month').toDate();

    const employeeQuery = { isActive: true };
    if (department) employeeQuery.department = department;

    const employees = await User.find(employeeQuery)
      .select('firstName lastName employeeId email department')
      .populate('department', 'name');

    const report = [];
    for (const employee of employees) {
      const attendance = await Attendance.find({
        employee: employee._id,
        date: { $gte: startDate, $lte: endDate },
      });

      report.push({
        employee: {
          id: employee._id,
          employeeId: employee.employeeId,
          name: `${employee.firstName} ${employee.lastName}`,
          email: employee.email,
          department: employee.department?.name,
        },
        stats: {
          present: attendance.filter((a) => a.status === 'present').length,
          absent: attendance.filter((a) => a.status === 'absent').length,
          halfDay: attendance.filter((a) => a.status === 'half-day').length,
          onLeave: attendance.filter((a) => a.status === 'on-leave').length,
          publicHoliday: attendance.filter((a) => a.status === 'public-holiday').length,
          comboOff: attendance.filter((a) => a.status === 'combo-off').length,
          nonWorkingDay: attendance.filter((a) => a.status === 'non-working-day').length,
          totalWorkHours: attendance.reduce((sum, a) => sum + (a.workHours || 0), 0),
          lateCount: attendance.filter((a) => a.isLate).length,
        },
      });
    }

    res.status(200).json({
      success: true,
      month: currentMonth,
      year: currentYear,
      count: report.length,
      report,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update attendance record
// @route   PUT /api/attendance/:attendanceId
// @access  Private (HR, Admin)
exports.updateAttendance = async (req, res) => {
  try {
    const { checkIn, checkOut, status, notes } = req.body;
    const attendance = await Attendance.findById(req.params.attendanceId);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    if (checkIn?.time) attendance.checkIn.time = new Date(checkIn.time);
    if (checkOut?.time) {
      attendance.checkOut = { time: new Date(checkOut.time), location: attendance.checkOut?.location };
      attendance.workHours = ((new Date(checkOut.time) - attendance.checkIn.time) / (1000 * 60 * 60)).toFixed(2);
    }
    if (status) attendance.status = status;
    if (notes) attendance.notes = notes;
    const standardTime = getISTStandardTime();
    attendance.isLate = attendance.checkIn?.time > standardTime;
    attendance.lateBy = attendance.isLate ? Math.round((attendance.checkIn.time - standardTime) / (1000 * 60)) : 0;
    await attendance.save();
    res.status(200).json({
      success: true,
      attendance: {
        ...attendance.toObject(),
        checkInTimeFormatted: formatISTTime(attendance.checkIn?.time),
        checkOutTimeFormatted: formatISTTime(attendance.checkOut?.time),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Mark leave or special status
// @route   POST /api/attendance/mark-status
// @access  Private (HR, Admin)
exports.markStatus = async (req, res) => {
  try {
    const { employeeId, date, status, notes } = req.body;
    const istDate = moment.tz(date, 'Asia/Kolkata').startOf('day').toDate();
    let attendance = await Attendance.findOne({ employee: employeeId, date: istDate });
    if (attendance) {
      attendance.status = status;
      attendance.notes = notes;
      await attendance.save();
    } else {
      attendance = await Attendance.create({
        employee: employeeId,
        date: istDate,
        status,
        notes,
        checkIn: null,
        checkOut: null,
        workHours: 0,
      });
    }
    res.status(200).json({
      success: true,
      attendance: {
        ...attendance.toObject(),
        checkInTimeFormatted: formatISTTime(attendance.checkIn?.time),
        checkOutTimeFormatted: formatISTTime(attendance.checkOut?.time),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Bulk upload attendance
// @route   POST /api/attendance/bulk-upload
// @access  Private (HR, Admin)
exports.bulkUploadAttendance = async (req, res) => {
  try {
    const { records } = req.body;
    const results = [];
    for (const record of records) {
      const istDate = moment.tz(record.date, 'Asia/Kolkata').startOf('day').toDate();
      const existing = await Attendance.findOne({ employee: record.employeeId, date: istDate });
      if (existing) {
        results.push({ employeeId: record.employeeId, date: record.date, status: 'skipped', reason: 'Record exists' });
        continue;
      }
      const attendance = await Attendance.create({
        employee: record.employeeId,
        date: istDate,
        checkIn: record.checkIn ? { time: new Date(record.checkIn) } : null,
        checkOut: record.checkOut ? { time: new Date(record.checkOut) } : null,
        status: record.status || 'present',
        workHours: record.checkIn && record.checkOut ? ((new Date(record.checkOut) - new Date(record.checkIn)) / (1000 * 60 * 60)).toFixed(2) : 0,
      });
      results.push({ employeeId: record.employeeId, date: record.date, status: 'success' });
    }
    res.status(200).json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get attendance summary
// @route   GET /api/attendance/summary
// @access  Private (Manager, HR, Admin)
exports.getAttendanceSummary = async (req, res) => {
  try {
    const { department, startDate, endDate, month, year } = req.query;
    const start = startDate
      ? moment.tz(startDate, 'Asia/Kolkata').startOf('day').toDate()
      : moment.tz({ year: Number(year) || moment().year(), month: (Number(month) || moment().month() + 1) - 1, day: 1 }, 'Asia/Kolkata').startOf('day').toDate();
    const end = endDate ? moment.tz(endDate, 'Asia/Kolkata').endOf('day').toDate() : moment(start).endOf('month').toDate();
    const query = { date: { $gte: start, $lte: end } };
    if (department) {
      const employees = await User.find({ department }).select('_id');
      query.employee = { $in: employees.map((e) => e._id) };
    }
    const attendance = await Attendance.find(query);
    const summary = {
      totalEmployees: department ? await User.countDocuments({ department }) : await User.countDocuments(),
      presentDays: attendance.filter((a) => a.status === 'present').length,
      absentDays: attendance.filter((a) => a.status === 'absent').length,
      totalWorkHours: attendance.reduce((sum, a) => sum + (a.workHours || 0), 0),
      lateCount: attendance.filter((a) => a.isLate).length,
      averageWorkHours: attendance.length ? (attendance.reduce((sum, a) => sum + (a.workHours || 0), 0) / attendance.length).toFixed(2) : 0,
    };
    res.status(200).json({ success: true, summary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Cancel check-in or check-out
// @route   DELETE /api/attendance/:attendanceId/action
// @access  Private (HR, Admin)
exports.cancelAction = async (req, res) => {
  try {
    const { action } = req.query;
    const attendance = await Attendance.findById(req.params.attendanceId);
    if (!attendance) {
      return res.status(404).json({ success: false, message: 'Attendance record not found' });
    }
    if (action === 'check-in') {
      if (!attendance.checkIn?.time) {
        return res.status(400).json({ success: false, message: 'No check-in to cancel' });
      }
      attendance.checkIn = null;
      attendance.status = 'absent';
      attendance.workHours = 0;
      attendance.isLate = false;
      attendance.lateBy = 0;
    } else if (action === 'check-out') {
      if (!attendance.checkOut?.time) {
        return res.status(400).json({ success: false, message: 'No check-out to cancel' });
      }
      attendance.checkOut = null;
      attendance.workHours = 0;
      attendance.missedCheckout = false;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid action' });
    }
    await attendance.save();
    res.status(200).json({
      success: true,
      attendance: {
        ...attendance.toObject(),
        checkInTimeFormatted: formatISTTime(attendance.checkIn?.time),
        checkOutTimeFormatted: formatISTTime(attendance.checkOut?.time),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get attendance status
// @route   GET /api/attendance/status
// @access  Private
exports.getAttendanceStatus = async (req, res) => {
  try {
    const today = getISTMidnight();
    const holiday = await Holiday.findOne({ date: today, isActive: true });
    if (holiday) {
      return res.status(200).json({ success: true, status: 'holiday', holidayName: holiday.name });
    }
    if (today.getDay() === 0) {
      return res.status(200).json({ success: true, status: 'weekly-off' });
    }
    const leave = await Leave.findOne({
      employee: req.user.id,
      fromDate: { $lte: today },
      toDate: { $gte: today },
      status: 'approved',
    });
    if (leave) {
      return res.status(200).json({ success: true, status: 'on-leave', leaveType: leave.type });
    }
    const attendance = await Attendance.findOne({ employee: req.user.id, date: today });
    if (!attendance || !attendance.checkIn?.time) {
      return res.status(200).json({ success: false, status: 'absent' });
    }
    if (attendance.checkOut?.time) {
      return res.status(200).json({ success: true, status: 'checked-out' });
    }
    return res.status(200).json({
      success: true,
      status: 'checked-in',
      currentWorkHours: getCurrentWorkHours(attendance),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Export attendance data
// @route   GET /api/attendance/export
// @access  Private (HR, Admin)
exports.exportAttendance = async (req, res) => {
  try {
    const { department, startDate, endDate, format = 'json' } = req.query;
    const query = {
      date: {
        $gte: moment.tz(startDate, 'Asia/Kolkata').startOf('day').toDate(),
        $lte: moment.tz(endDate, 'Asia/Kolkata').endOf('day').toDate(),
      },
    };
    if (department) {
      const employees = await User.find({ department }).select('_id');
      query.employee = { $in: employees.map((e) => e._id) };
    }
    const attendance = await Attendance.find(query).populate('employee', 'firstName lastName employeeId');
    if (format === 'csv') {
      const csv = attendance.map((a) => ({
        employeeId: a.employee.employeeId,
        name: `${a.employee.firstName} ${a.employee.lastName}`,
        date: moment(a.date).format('YYYY-MM-DD'),
        checkIn: a.checkIn?.time ? formatISTTime(a.checkIn.time) : '',
        checkOut: a.checkOut?.time ? formatISTTime(a.checkOut.time) : '',
        workHours: a.workHours || 0,
        status: a.status,
        isLate: a.isLate,
      }));
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=attendance.csv');
      res.status(200).json(csv); // Use a CSV library like `fast-csv` for actual file streaming
    } else {
      res.status(200).json({
        success: true,
        attendance: attendance.map((a) => ({
          ...a.toObject(),
          checkInTimeFormatted: formatISTTime(a.checkIn?.time),
          checkOutTimeFormatted: formatISTTime(a.checkOut?.time),
        })),
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get today's attendance for all employees
// @route   GET /api/attendance/today-all
// @access  Private (HR, Admin)
exports.getTodayAllEmployeesAttendance = async (req, res) => {
  try {
    const today = getISTMidnight();
    const { department } = req.query; // Optional department filter

    // Build query
    const query = { date: today };
    if (department) {
      const employees = await User.find({
        department,
        isActive: true,
        role: { $in: ['employee', 'manager'] },
      }).select('_id');
      query.employee = { $in: employees.map((e) => e._id) };
    }

    // Fetch today's attendance records
    const attendanceRecords = await Attendance.find(query)
      .populate('employee', 'firstName lastName employeeId email department')
      .lean();

    // Fetch all active employees (only employee + manager roles)
    const employeeQuery = {
      isActive: true,
      role: { $in: ['employee', 'manager'] },
    };
    if (department) employeeQuery.department = department;

    const employees = await User.find(employeeQuery)
      .select('firstName lastName employeeId email department')
      .populate('department', 'name')
      .lean();

    // Check for holiday or Sunday
    const holiday = await Holiday.findOne({ date: today, isActive: true });
    if (holiday) {
      return res.status(200).json({
        success: true,
        message: `Today is a holiday: ${holiday.name}`,
        date: moment(today).format('YYYY-MM-DD'),
        attendance: [],
        totalEmployees: employees.length,
        presentCount: 0,
      });
    }

    if (today.getDay() === 0) {
      return res.status(200).json({
        success: true,
        message: 'Today is a weekly off (Sunday)',
        date: moment(today).format('YYYY-MM-DD'),
        attendance: [],
        totalEmployees: employees.length,
        presentCount: 0,
      });
    }

    // Build attendance map
    const attendanceMap = new Map(
      attendanceRecords.map((record) => [record.employee._id.toString(), record])
    );

    const todayAttendance = [];

    // Process each employee
    for (const employee of employees) {
      const record = attendanceMap.get(employee._id.toString());
      const leave = await Leave.findOne({
        employee: employee._id,
        fromDate: { $lte: today },
        toDate: { $gte: today },
        status: 'approved',
      });

      if (leave) {
        todayAttendance.push({
          employee: {
            id: employee._id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            department: employee.department?.name,
          },
          status: 'on-leave',
          leaveType: leave.type,
          checkIn: null,
          checkOut: null,
          workHours: 0,
          isLate: false,
        });
      } else if (record) {
        todayAttendance.push({
          employee: {
            id: employee._id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            department: employee.department?.name,
          },
          status: record.status,
          checkIn: record.checkIn
            ? {
              time: formatISTTime(record.checkIn.time),
              location: record.checkIn.location,
              deviceInfo: record.checkIn.deviceInfo,
            }
            : null,
          checkOut: record.checkOut
            ? {
              time: formatISTTime(record.checkOut.time),
              location: record.checkOut.location,
              deviceInfo: record.checkOut.deviceInfo,
            }
            : null,
          workHours: getCurrentWorkHours(record),
          isLate: record.isLate,
          lateBy: record.lateBy,
        });
      } else {
        todayAttendance.push({
          employee: {
            id: employee._id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            department: employee.department?.name,
          },
          status: 'absent',
          checkIn: null,
          checkOut: null,
          workHours: 0,
          isLate: false,
        });
      }
    }

    res.status(200).json({
      success: true,
      date: moment(today).format('YYYY-MM-DD'),
      totalEmployees: employees.length,
      presentCount: todayAttendance.filter((a) => a.status === 'present').length,
      attendance: todayAttendance,
    });
  } catch (error) {
    console.error('Get today all employees attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};


exports.getAllEmployeesAttendance = async (req, res) => {
  try {
    const { department, date } = req.query;

    // Convert date to IST midnight or use today
    const targetDate = date
      ? moment.tz(date, 'YYYY-MM-DD', 'Asia/Kolkata').startOf('day').toDate()
      : getISTMidnight();

    // Build query for attendance
    const query = { date: targetDate };
    if (department) {
      const employees = await User.find({ department, isActive: true }).select('_id');
      query.employee = { $in: employees.map((e) => e._id) };
    }

    // Fetch attendance records
    const attendanceRecords = await Attendance.find(query)
      .populate('employee', 'firstName lastName employeeId email department weekendType')
      .lean();

    // Fetch all active employees (to include absentees)
    const employeeQuery = { isActive: true };
    if (department) employeeQuery.department = department;
    const employees = await User.find(employeeQuery)
      .select('firstName lastName employeeId email department weekendType')
      .populate('department', 'name')
      .lean();

    // Fetch holidays
    const holiday = await Holiday.findOne({ date: targetDate, isActive: true });
    if (holiday) {
      return res.status(200).json({
        success: true,
        message: `Holiday: ${holiday.name}`,
        date: moment(targetDate).format('YYYY-MM-DD'),
        attendance: [],
        totalEmployees: employees.length,
        presentCount: 0,
      });
    }

    // Create attendance map
    const attendanceMap = new Map(
      attendanceRecords.map((record) => [record.employee._id.toString(), record])
    );

    const attendanceList = [];

    // Determine weekday
    const day = targetDate.getDay(); // 0 = Sunday, 6 = Saturday

    // Iterate through each employee
    for (const employee of employees) {
      const record = attendanceMap.get(employee._id.toString());
      const weekendType = employee.weekendType || 'sunday'; // default fallback
      const isWeekend =
        (weekendType === 'sunday' && day === 0) ||
        (weekendType === 'saturday_sunday' && (day === 0 || day === 6));

      // If it's a weekend for this employee
      if (isWeekend) {
        attendanceList.push({
          employee: {
            id: employee._id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            department: employee.department?.name,
          },
          status: 'weekly-off',
          checkIn: null,
          checkOut: null,
          workHours: 0,
          isLate: false,
        });
        continue;
      }

      // Check if employee is on leave
      const leave = await Leave.findOne({
        employee: employee._id,
        fromDate: { $lte: targetDate },
        toDate: { $gte: targetDate },
        status: 'approved',
      });

      if (leave) {
        attendanceList.push({
          employee: {
            id: employee._id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            department: employee.department?.name,
          },
          status: 'on-leave',
          leaveType: leave.type,
          checkIn: null,
          checkOut: null,
          workHours: 0,
          isLate: false,
        });
      } else if (record) {
        attendanceList.push({
          employee: {
            id: employee._id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            department: employee.department?.name,
          },
          status: record.status,
          checkIn: record.checkIn
            ? {
              time: formatISTTime(record.checkIn.time),
              location: record.checkIn.location,
              deviceInfo: record.checkIn.deviceInfo,
            }
            : null,
          checkOut: record.checkOut
            ? {
              time: formatISTTime(record.checkOut.time),
              location: record.checkOut.location,
              deviceInfo: record.checkOut.deviceInfo,
            }
            : null,
          workHours: getCurrentWorkHours(record),
          isLate: record.isLate,
          lateBy: record.lateBy,
        });
      } else {
        attendanceList.push({
          employee: {
            id: employee._id,
            employeeId: employee.employeeId,
            name: `${employee.firstName} ${employee.lastName}`,
            email: employee.email,
            department: employee.department?.name,
          },
          status: 'absent',
          checkIn: null,
          checkOut: null,
          workHours: 0,
          isLate: false,
        });
      }
    }

    res.status(200).json({
      success: true,
      date: moment(targetDate).format('YYYY-MM-DD'),
      totalEmployees: employees.length,
      presentCount: attendanceList.filter((a) => a.status === 'present').length,
      attendance: attendanceList,
    });
  } catch (error) {
    console.error('Get employees attendance error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc  Get work-hours data for a chart (daily totals)
// @route GET /api/attendance/work-hours-chart
// @access Private (any logged-in user – shows only own data)
// ─────────────────────────────────────────────────────────────────────────────
exports.getEmployeeWorkHoursChart = async (req, res) => {
  try {
    const employeeId = req.user.id;

    // ── Optional query params ─────────────────────────────────────────────
    const { startDate, endDate, month, year } = req.query;

    // Build the date range (IST)
    let start, end;
    const tz = 'Asia/Kolkata';

    if (startDate && endDate) {
      start = moment.tz(startDate, tz).startOf('day');
      end = moment.tz(endDate, tz).endOf('day');
    } else if (month && year) {
      start = moment.tz({ year: +year, month: +month - 1, day: 1 }, tz).startOf('day');
      end = moment(start).endOf('month');
    } else {
      // default = current month
      start = moment.tz(tz).startOf('month');
      end = moment.tz(tz).endOf('month');
    }

    const startUTC = start.clone().utc().toDate();
    const endUTC = end.clone().utc().toDate();

    // ── Pull only the fields we need ─────────────────────────────────────
    const records = await Attendance.find({
      employee: employeeId,
      date: { $gte: startUTC, $lte: endUTC },
      status: 'present',                 // only days where user actually worked
    })
      .select('date workHours')
      .sort({ date: 1 })
      .lean();

    // ── Build a map: dateString → workHours ───────────────────────────────
    const dataMap = new Map();
    records.forEach(r => {
      const key = moment(r.date).tz(tz).format('YYYY-MM-DD');
      dataMap.set(key, parseFloat(r.workHours) || 0);
    });

    // ── Fill missing days with 0 (so the chart has a continuous line) ─────
    const chartData = [];
    let cur = start.clone();

    while (cur.isSameOrBefore(end, 'day')) {
      const key = cur.format('YYYY-MM-DD');
      chartData.push({
        date: key,
        label: cur.format('DD MMM'),          // e.g. "13 Nov"
        day: cur.format('ddd'),             // Mon, Tue…
        workHours: dataMap.get(key) ?? 0,
      });
      cur.add(1, 'day');
    }

    // ── Optional summary ─────────────────────────────────────────────────
    const totalHours = chartData.reduce((s, d) => s + d.workHours, 0);
    const avgHours = chartData.length ? (totalHours / chartData.length).toFixed(2) : '0';

    res.status(200).json({
      success: true,
      period: {
        from: start.format('YYYY-MM-DD'),
        to: end.format('YYYY-MM-DD'),
      },
      summary: {
        totalWorkHours: +totalHours.toFixed(2),
        averageDaily: +avgHours,
        workingDays: records.length,
      },
      chart: chartData,          // <-- plug straight into Chart.js
    });
  } catch (error) {
    console.error('Work-hours chart error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc  Get work-hours data for a chart (daily totals)
// @route GET /api/attendance/work-hours-chart
// @access Private (logged-in user → own data)
// ─────────────────────────────────────────────────────────────────────────────
exports.getWorkHoursChartMonthly = async (req, res) => {
  try {
    const employeeId = req.user.id;
    const tz = 'Asia/Kolkata';

    // ── 1. Build date range (default = current month in IST) ─────────────
    let start, end;

    const { startDate, endDate, month, year } = req.query;

    if (startDate && endDate) {
      // Custom range
      start = moment.tz(startDate, tz).startOf('day');
      end   = moment.tz(endDate,   tz).endOf('day');
    } else if (month && year) {
      // Specific month/year
      start = moment.tz({ year: +year, month: +month - 1, day: 1 }, tz).startOf('day');
      end   = moment(start).endOf('month');
    } else {
      // DEFAULT: current month in IST
      const now = moment.tz(tz);
      start = now.clone().startOf('month');
      end   = now.clone().endOf('month');
    }

    const startUTC = start.clone().utc().toDate();
    const endUTC   = end.clone().utc().toDate();

    // ── 2. Fetch attendance (only present days) ─────────────────────────
    const records = await Attendance.find({
      employee: employeeId,
      date: { $gte: startUTC, $lte: endUTC },
      status: 'present',
    })
      .select('date workHours')
      .sort({ date: 1 })
      .lean();

    // ── 3. Map: dateString → workHours ───────────────────────────────────
    const dataMap = new Map();
    records.forEach(r => {
      const key = moment(r.date).tz(tz).format('YYYY-MM-DD');
      dataMap.set(key, parseFloat(r.workHours) || 0);
    });

    // ── 4. Build continuous daily array (fill 0 for missing days) ───────
    const chartData = [];
    let cur = start.clone();

    while (cur.isSameOrBefore(end, 'day')) {
      const key = cur.format('YYYY-MM-DD');
      chartData.push({
        date: key,
        label: cur.format('DD MMM'),   // 01 Nov, 02 Nov...
        day: cur.format('ddd'),        // Mon, Tue...
        workHours: dataMap.get(key) ?? 0,
      });
      cur.add(1, 'day');
    }

    // ── 5. Summary ───────────────────────────────────────────────────────
    const totalHours = chartData.reduce((s, d) => s + d.workHours, 0);
    const avgHours   = chartData.length ? (totalHours / chartData.filter(d => d.workHours > 0).length || 1).toFixed(2) : '0';

    // ── 6. Response ──────────────────────────────────────────────────────
    res.status(200).json({
      success: true,
      period: {
        from: start.format('YYYY-MM-DD'),
        to:   end.format('YYYY-MM-DD'),
        display: start.format('MMM YYYY'), // e.g. "Nov 2025"
      },
      summary: {
        totalWorkHours: +totalHours.toFixed(2),
        averageDaily: +avgHours,
        workingDays: records.length,
      },
      chart: chartData,
    });

  } catch (error) {
    console.error('Work-hours chart error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};