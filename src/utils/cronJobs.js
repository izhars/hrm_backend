// utils/cronJobs.js
const cron = require('node-cron');
const moment = require('moment-timezone');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const { updateCronRun, getLastCronRun } = require('./cronLogger');
const testNotification = require('./testNotification');
const { notifyMorningPunchIn, notifyMorningPunchOut, notifyEveningPunchIn, notifyEveningPunchOut } = require('./attendanceNotifications');
const { sendCelebrationNotifications, scheduleCelebrationNotifications } = require('./celebrationScheduler');

/**
 * Check if today is a holiday
 */
async function isTodayHoliday() {
  const today = moment().tz('Asia/Kolkata').startOf('day').toDate();
  const holiday = await Holiday.findOne({ date: today });
  return !!holiday;
}

/**
 * Check if employee is on approved leave today
 */
async function isEmployeeOnLeave(employeeId) {
  const today = moment().tz('Asia/Kolkata').startOf('day').toDate();

  const leave = await Leave.findOne({
    employee: employeeId,
    startDate: { $lte: today },
    endDate: { $gte: today },
    status: 'approved',
  });

  return !!leave;
}

/**
 * Fetch employees who need punch-in/punch-out notification
 */
async function getEmployeesToNotify(type) {
  const today = moment().tz('Asia/Kolkata').startOf('day').toDate();
  const isHoliday = await isTodayHoliday();

  if (isHoliday) {
    return [];
  }

  const employees = await User.find({ isActive: true, role: 'user' }).select('_id');
  const toNotify = [];

  for (const emp of employees) {
    const onLeave = await isEmployeeOnLeave(emp._id);
    if (onLeave) continue;

    let attendance = await Attendance.findOne({
      employee: emp._id,
      date: today
    });

    if (!attendance) attendance = {};

    if (type === 'morning_in' && (!attendance.checkIn || !attendance.checkIn.time)) {
      toNotify.push(emp._id);
    } else if (type === 'morning_out' && attendance.checkIn?.time && (!attendance.checkOut || !attendance.checkOut.time)) {
      toNotify.push(emp._id);
    } else if (type === 'evening_in' && attendance.checkOut?.time && (!attendance.eveningCheckIn || !attendance.eveningCheckIn.time)) {
      toNotify.push(emp._id);
    } else if (type === 'evening_out' && attendance.eveningCheckIn?.time && (!attendance.eveningCheckOut || !attendance.eveningCheckOut.time)) {
      toNotify.push(emp._id);
    }
  }

  return toNotify;
}

// Store the actual task functions for manual execution
const cronTasks = {
  sendTestNotification: async () => {
    try {
      await updateCronRun('sendTestNotification');
      const result = await testNotification();
      return result;
    } catch (error) {
      console.error('❌ Cron sendTestNotification failed:', error);
      return { success: false, error: error.message };
    }
  },

  autoCheckoutEmployees: async () => {
    try {
      await updateCronRun('autoCheckoutEmployees');

      const istNow = moment().tz('Asia/Kolkata');
      const isHoliday = await isTodayHoliday();

      if (isHoliday) {
        return { success: true, count: 0, message: 'Holiday - no auto checkout' };
      }

      const todayStart = istNow.clone().startOf('day').toDate();
      const todayEnd = istNow.clone().endOf('day').toDate();

      const pendingAttendances = await Attendance.find({
        date: { $gte: todayStart, $lte: todayEnd },
        'checkIn.time': { $exists: true },
        'checkOut.time': { $exists: false },
        status: 'present',
      });

      if (!pendingAttendances.length) {
        return { success: true, count: 0, message: 'No pending checkouts' };
      }

      const checkOutTime = istNow.toDate();

      let successCount = 0;
      for (const attendance of pendingAttendances) {
        try {
          const checkInTime = moment(attendance.checkIn.time).tz('Asia/Kolkata').toDate();
          const totalHours = ((checkOutTime - checkInTime) / (1000 * 60 * 60)).toFixed(2);

          attendance.checkOut = {
            time: checkOutTime,
            location: {
              latitude: null,
              longitude: null,
              address: 'Auto Checked Out by System'
            },
            deviceInfo: { name: 'System', type: 'Auto' },
          };
          attendance.workHours = parseFloat(totalHours);
          attendance.missedCheckout = true;

          await attendance.save();
          successCount++;
        } catch (err) {
          console.error(`❌ Failed to checkout ${attendance.employee}:`, err.message);
        }
      }

      return {
        success: true,
        count: successCount,
        total: pendingAttendances.length,
        message: `Auto checkout complete for ${successCount}/${pendingAttendances.length} employee(s)`
      };
    } catch (error) {
      console.error('❌ Error in auto checkout cron:', error);
      return { success: false, error: error.message };
    }
  },

  markAbsentEmployees: async () => {
    try {
      await updateCronRun('markAbsentEmployees');

      const istNow = moment().tz('Asia/Kolkata');
      const todayStart = istNow.clone().startOf('day').toDate();
      const todayEnd = istNow.clone().endOf('day').toDate();

      const isHoliday = await isTodayHoliday();

      if (isHoliday) {
        return { success: true, count: 0, message: 'Holiday - no absent marking' };
      }

      const employees = await User.find({ isActive: true });
      let markedCount = 0;

      for (const employee of employees) {
        const onLeave = await isEmployeeOnLeave(employee._id);
        if (onLeave) continue;

        const attendance = await Attendance.findOne({
          employee: employee._id,
          date: { $gte: todayStart, $lte: todayEnd }
        });

        if (!attendance) {
          await Attendance.create({
            employee: employee._id,
            date: todayStart,
            status: 'absent',
          });
          markedCount++;
        }
      }

      return { success: true, count: markedCount };
    } catch (error) {
      console.error('❌ Error marking absent employees:', error);
      return { success: false, error: error.message };
    }
  },

  resetLeaveBalance: async () => {
    try {
      await updateCronRun('resetLeaveBalance');

      const result = await User.updateMany(
        { isActive: true },
        {
          $set: {
            'leaveBalance.casual': 12,
            'leaveBalance.sick': 10,
            'leaveBalance.earned': 15,
          },
        }
      );

      return { success: true, count: result.modifiedCount };
    } catch (error) {
      console.error('❌ Error resetting leave balance:', error);
      return { success: false, error: error.message };
    }
  },

  sendBirthdayWishes: async () => {
    try {
      await updateCronRun('sendBirthdayWishes');

      const today = moment().tz('Asia/Kolkata');
      const month = today.month() + 1;
      const day = today.date();

      const employees = await User.find({
        isActive: true,
        $expr: {
          $and: [
            { $eq: [{ $month: '$dateOfBirth' }, month] },
            { $eq: [{ $dayOfMonth: '$dateOfBirth' }, day] },
          ],
        },
      });

      if (employees.length === 0) {
        return { success: true, count: 0, message: 'No birthdays today' };
      }

      // Optionally: await emailService.sendBirthdayWish(emp);

      return { success: true, count: employees.length };
    } catch (error) {
      console.error('❌ Error sending birthday wishes:', error);
      return { success: false, error: error.message };
    }
  },

  generateMonthlyReport: async () => {
    try {
      await updateCronRun('generateMonthlyReport');

      // TODO: Generate and save report

      return { success: true };
    } catch (error) {
      console.error('❌ Error generating monthly report:', error);
      return { success: false, error: error.message };
    }
  },

  notifyMorningPunchIn: async () => {
    try {
      await updateCronRun('notifyMorningPunchIn');

      const employees = await getEmployeesToNotify('morning_in');

      if (employees.length === 0) {
        return { success: true, count: 0 };
      }

      const results = await Promise.allSettled(
        employees.map(id => notifyMorningPunchIn(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      return {
        success: true,
        count: employees.length,
        successful,
        failed
      };
    } catch (error) {
      console.error('❌ Error sending morning punch-in notifications:', error);
      return { success: false, error: error.message };
    }
  },

  notifyMorningPunchOut: async () => {
    try {
      await updateCronRun('notifyMorningPunchOut');

      const employees = await getEmployeesToNotify('morning_out');

      if (employees.length === 0) {
        return { success: true, count: 0 };
      }

      const results = await Promise.allSettled(
        employees.map(id => notifyMorningPunchOut(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      return {
        success: true,
        count: employees.length,
        successful,
        failed
      };
    } catch (error) {
      console.error('❌ Error sending morning punch-out notifications:', error);
      return { success: false, error: error.message };
    }
  },

  notifyEveningPunchIn: async () => {
    try {
      await updateCronRun('notifyEveningPunchIn');

      const employees = await getEmployeesToNotify('evening_in');

      if (employees.length === 0) {
        return { success: true, count: 0 };
      }

      const results = await Promise.allSettled(
        employees.map(id => notifyEveningPunchIn(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      return {
        success: true,
        count: employees.length,
        successful,
        failed
      };
    } catch (error) {
      console.error('❌ Error sending evening punch-in notifications:', error);
      return { success: false, error: error.message };
    }
  },

  notifyEveningPunchOut: async () => {
    try {
      await updateCronRun('notifyEveningPunchOut');

      const employees = await getEmployeesToNotify('evening_out');

      if (employees.length === 0) {
        return { success: true, count: 0 };
      }

      const results = await Promise.allSettled(
        employees.map(id => notifyEveningPunchOut(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      return {
        success: true,
        count: employees.length,
        successful,
        failed
      };
    } catch (error) {
      console.error('❌ Error sending evening punch-out notifications:', error);
      return { success: false, error: error.message };
    }
  },

  sendCelebrationNotifications: async () => {
    try {
      await updateCronRun('sendCelebrationNotifications');
      const result = await sendCelebrationNotifications();
      return result;
    } catch (error) {
      console.error('❌ Error in celebration notifications cron:', error);
      return { success: false, error: error.message };
    }
  },
};

/* ───────────────────────────────────────────────
   🕗 AUTO CHECK-OUT (9:00 PM IST)
─────────────────────────────────────────────── */
exports.autoCheckoutEmployees = cron.schedule(
  '0 21 * * *',
  cronTasks.autoCheckoutEmployees,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

/* ───────────────────────────────────────────────
   🚫 MARK ABSENT EMPLOYEES (11:59 PM IST)
─────────────────────────────────────────────── */
exports.markAbsentEmployees = cron.schedule(
  '59 23 * * *',
  cronTasks.markAbsentEmployees,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

/* ───────────────────────────────────────────────
   🔄 RESET LEAVE BALANCE (Jan 1, 12:00 AM)
─────────────────────────────────────────────── */
exports.resetLeaveBalance = cron.schedule(
  '0 0 1 1 *',
  cronTasks.resetLeaveBalance,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

/* ───────────────────────────────────────────────
   🎂 SEND BIRTHDAY WISHES (9:00 AM IST)
─────────────────────────────────────────────── */
exports.sendBirthdayWishes = cron.schedule(
  '0 9 * * *',
  cronTasks.sendBirthdayWishes,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

/* ───────────────────────────────────────────────
   📊 GENERATE MONTHLY ATTENDANCE REPORT
─────────────────────────────────────────────── */
exports.generateMonthlyReport = cron.schedule(
  '0 1 1 * *',
  cronTasks.generateMonthlyReport,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

/* ───────────────────────────────────────────────
   ⏰ ATTENDANCE NOTIFICATIONS
─────────────────────────────────────────────── */

// Morning Punch-In: 9:00 AM
exports.notifyMorningPunchIn = cron.schedule(
  '0 9 * * *',
  cronTasks.notifyMorningPunchIn,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

// Morning Punch-Out: 1:00 PM
exports.notifyMorningPunchOut = cron.schedule(
  '0 13 * * *',
  cronTasks.notifyMorningPunchOut,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

// Evening Punch-In: 2:00 PM
exports.notifyEveningPunchIn = cron.schedule(
  '0 14 * * *',
  cronTasks.notifyEveningPunchIn,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

// Evening Punch-Out: 6:00 PM
exports.notifyEveningPunchOut = cron.schedule(
  '0 18 * * *',
  cronTasks.notifyEveningPunchOut,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

// Celebration Notifications: 9:00 AM
exports.sendCelebrationNotifications = cron.schedule(
  '0 9 * * *',
  cronTasks.sendCelebrationNotifications,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

exports.sendTestNotification = cron.schedule(
  '38 14 * * *',
  cronTasks.sendTestNotification,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

/* ───────────────────────────────────────────────
   🚀 START ALL CRON JOBS
─────────────────────────────────────────────── */
exports.startCronJobs = async () => {
  try {
    if (scheduleCelebrationNotifications) {
      scheduleCelebrationNotifications();
    }

    const jobs = [
      exports.autoCheckoutEmployees,
      exports.markAbsentEmployees,
      exports.resetLeaveBalance,
      exports.sendBirthdayWishes,
      exports.generateMonthlyReport,
      exports.notifyMorningPunchIn,
      exports.notifyMorningPunchOut,
      exports.notifyEveningPunchIn,
      exports.notifyEveningPunchOut,
      exports.sendCelebrationNotifications,
      exports.sendTestNotification,
    ];

    jobs.forEach(job => job.start());
  } catch (error) {
    console.error('❌ Failed to start cron jobs:', error);
  }
};

/* ───────────────────────────────────────────────
   ⏸️ STOP ALL CRON JOBS (for testing/shutdown)
─────────────────────────────────────────────── */
exports.stopCronJobs = () => {
  const jobs = [
    exports.autoCheckoutEmployees,
    exports.markAbsentEmployees,
    exports.resetLeaveBalance,
    exports.sendBirthdayWishes,
    exports.generateMonthlyReport,
    exports.notifyMorningPunchIn,
    exports.notifyMorningPunchOut,
    exports.notifyEveningPunchIn,
    exports.notifyEveningPunchOut,
    exports.sendCelebrationNotifications,
    exports.sendTestNotification,
  ];

  jobs.forEach(job => job.stop());
};

/* ───────────────────────────────────────────────
   🔍 GET CRON JOB STATUS
─────────────────────────────────────────────── */
exports.getCronStatus = () => {
  const jobs = [
    { name: 'autoCheckoutEmployees', task: exports.autoCheckoutEmployees },
    { name: 'markAbsentEmployees', task: exports.markAbsentEmployees },
    { name: 'resetLeaveBalance', task: exports.resetLeaveBalance },
    { name: 'sendBirthdayWishes', task: exports.sendBirthdayWishes },
    { name: 'generateMonthlyReport', task: exports.generateMonthlyReport },
    { name: 'notifyMorningPunchIn', task: exports.notifyMorningPunchIn },
    { name: 'notifyMorningPunchOut', task: exports.notifyMorningPunchOut },
    { name: 'notifyEveningPunchIn', task: exports.notifyEveningPunchIn },
    { name: 'notifyEveningPunchOut', task: exports.notifyEveningPunchOut },
    { name: 'sendCelebrationNotifications', task: exports.sendCelebrationNotifications },
    { name: 'sendTestNotification', task: exports.sendTestNotification },
  ];

  return jobs.map(job => ({
    name: job.name,
    isRunning: job.task.getStatus() === 'started',
    nextRun: job.task.nextDate(),
  }));
};

// Export tasks for manual testing/triggering
exports.cronTasks = cronTasks;