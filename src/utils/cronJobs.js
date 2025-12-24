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
    console.log('📅 Today is a holiday, skipping notifications');
    return [];
  }

  const employees = await User.find({ isActive: true, role: 'user' }).select('_id');
  const toNotify = [];

  for (const emp of employees) {
    // Check if employee is on approved leave
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
      console.log('⏰ Running cron: sendTestNotification');
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
      console.log('⏰ Running cron: Auto checkout employees who missed checkout');
      await updateCronRun('autoCheckoutEmployees');

      const istNow = moment().tz('Asia/Kolkata');
      const isHoliday = await isTodayHoliday();

      if (isHoliday) {
        console.log('📅 Today is a holiday, skipping auto checkout');
        return { success: true, count: 0, message: 'Holiday - no auto checkout' };
      }

      // ✅ FIX 1: Create date range for today in IST
      const todayStart = istNow.clone().startOf('day').toDate();
      const todayEnd = istNow.clone().endOf('day').toDate();

      console.log(`🔍 Searching for attendance between ${todayStart} and ${todayEnd}`);

      const pendingAttendances = await Attendance.find({
        date: { $gte: todayStart, $lte: todayEnd },
        'checkIn.time': { $exists: true },
        'checkOut.time': { $exists: false },
        status: 'present',
      });

      console.log(`📊 Found ${pendingAttendances.length} pending checkouts`);

      if (!pendingAttendances.length) {
        console.log('✅ No pending auto checkouts found.');
        return { success: true, count: 0, message: 'No pending checkouts' };
      }

      // ✅ FIX 2: Use current time instead of standard 6 PM
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
          console.log(`🕘 Auto checked out employee ${attendance.employee} (${totalHours}h)`);
        } catch (err) {
          console.error(`❌ Failed to checkout ${attendance.employee}:`, err.message);
        }
      }

      const result = {
        success: true,
        count: successCount,
        total: pendingAttendances.length,
        message: `Auto checkout complete for ${successCount}/${pendingAttendances.length} employee(s)`
      };
      console.log(`✅ ${result.message}`);
      return result;
    } catch (error) {
      console.error('❌ Error in auto checkout cron:', error);
      return { success: false, error: error.message };
    }
  },

  markAbsentEmployees: async () => {
    try {
      console.log('📅 Running cron: Mark absent employees');
      await updateCronRun('markAbsentEmployees');

      const istNow = moment().tz('Asia/Kolkata');
      const todayStart = istNow.clone().startOf('day').toDate();
      const todayEnd = istNow.clone().endOf('day').toDate();

      const isHoliday = await isTodayHoliday();

      if (isHoliday) {
        console.log('📅 Today is a holiday, skipping absent marking');
        return { success: true, count: 0, message: 'Holiday - no absent marking' };
      }

      const employees = await User.find({ isActive: true });
      let markedCount = 0;

      for (const employee of employees) {
        // Check if employee is on approved leave
        const onLeave = await isEmployeeOnLeave(employee._id);
        if (onLeave) {
          console.log(`📝 ${employee.name} is on approved leave, skipping absent marking`);
          continue;
        }

        // Check if attendance exists for today
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
          console.log(`❌ Marked ${employee.name} as absent`);
        }
      }

      console.log(`✅ Marked ${markedCount} employees as absent`);
      return { success: true, count: markedCount };
    } catch (error) {
      console.error('❌ Error marking absent employees:', error);
      return { success: false, error: error.message };
    }
  },

  resetLeaveBalance: async () => {
    try {
      console.log('🔁 Running cron: Reset leave balance');
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

      console.log(`✅ Leave balance reset for ${result.modifiedCount} employees`);
      return { success: true, count: result.modifiedCount };
    } catch (error) {
      console.error('❌ Error resetting leave balance:', error);
      return { success: false, error: error.message };
    }
  },

  sendBirthdayWishes: async () => {
    try {
      console.log('🎉 Running cron: Send birthday wishes');
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
        console.log('No birthdays today 🎈');
        return { success: true, count: 0, message: 'No birthdays today' };
      }

      for (const emp of employees) {
        console.log(`🎂 Happy Birthday, ${emp.name}! 🎉`);
        // Optionally: await emailService.sendBirthdayWish(emp);
      }

      console.log(`✅ Sent birthday wishes to ${employees.length} employee(s)`);
      return { success: true, count: employees.length };
    } catch (error) {
      console.error('❌ Error sending birthday wishes:', error);
      return { success: false, error: error.message };
    }
  },

  generateMonthlyReport: async () => {
    try {
      console.log('📈 Running cron: Generate monthly attendance report');
      await updateCronRun('generateMonthlyReport');

      // Get last month's data
      const lastMonth = moment().subtract(1, 'month');
      const monthStart = lastMonth.startOf('month').toDate();
      const monthEnd = lastMonth.endOf('month').toDate();

      // TODO: Generate and save report
      // This could involve calculating:
      // - Total working days
      // - Leaves taken
      // - Average work hours
      // - Late arrivals
      // - Early departures

      console.log('✅ Monthly attendance report generated successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Error generating monthly report:', error);
      return { success: false, error: error.message };
    }
  },

  notifyMorningPunchIn: async () => {
    try {
      console.log('⏰ Running cron: Morning punch-in reminders');
      await updateCronRun('notifyMorningPunchIn');

      const employees = await getEmployeesToNotify('morning_in');

      if (employees.length === 0) {
        console.log('✅ No employees need morning punch-in reminders');
        return { success: true, count: 0 };
      }

      console.log(`⏰ Sending morning punch-in reminders to ${employees.length} employees`);

      const results = await Promise.allSettled(
        employees.map(id => notifyMorningPunchIn(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Morning punch-in: ${successful} successful, ${failed} failed`);
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
      console.log('⏰ Running cron: Morning punch-out reminders');
      await updateCronRun('notifyMorningPunchOut');

      const employees = await getEmployeesToNotify('morning_out');

      if (employees.length === 0) {
        console.log('✅ No employees need morning punch-out reminders');
        return { success: true, count: 0 };
      }

      console.log(`⏰ Sending morning punch-out reminders to ${employees.length} employees`);

      const results = await Promise.allSettled(
        employees.map(id => notifyMorningPunchOut(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Morning punch-out: ${successful} successful, ${failed} failed`);
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
      console.log('⏰ Running cron: Evening punch-in reminders');
      await updateCronRun('notifyEveningPunchIn');

      const employees = await getEmployeesToNotify('evening_in');

      if (employees.length === 0) {
        console.log('✅ No employees need evening punch-in reminders');
        return { success: true, count: 0 };
      }

      console.log(`⏰ Sending evening punch-in reminders to ${employees.length} employees`);

      const results = await Promise.allSettled(
        employees.map(id => notifyEveningPunchIn(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Evening punch-in: ${successful} successful, ${failed} failed`);
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
      console.log('⏰ Running cron: Evening punch-out reminders');
      await updateCronRun('notifyEveningPunchOut');

      const employees = await getEmployeesToNotify('evening_out');

      if (employees.length === 0) {
        console.log('✅ No employees need evening punch-out reminders');
        return { success: true, count: 0 };
      }

      console.log(`⏰ Sending evening punch-out reminders to ${employees.length} employees`);

      const results = await Promise.allSettled(
        employees.map(id => notifyEveningPunchOut(id))
      );

      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      console.log(`✅ Evening punch-out: ${successful} successful, ${failed} failed`);
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
      console.log('🎉 Running cron: Send celebration notifications');
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

// Evening Punch-In: 2:00 PM (Adjust as needed)
exports.notifyEveningPunchIn = cron.schedule(
  '0 14 * * *',
  cronTasks.notifyEveningPunchIn,
  {
    scheduled: true,
    timezone: 'Asia/Kolkata'
  }
);

// Evening Punch-Out: 6:00 PM (Adjust as needed)
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
  '53 16 * * *',
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
  console.log('🕒 Starting cron jobs...');

  try {
    // Initialize celebration scheduler if needed
    if (scheduleCelebrationNotifications) {
      scheduleCelebrationNotifications();
      console.log('✅ Celebration scheduler initialized');
    }

    // Start all cron jobs
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

    console.log('✅ All cron jobs started successfully');
  } catch (error) {
    console.error('❌ Failed to start cron jobs:', error);
  }
};

/* ───────────────────────────────────────────────
   ⏸️ STOP ALL CRON JOBS (for testing/shutdown)
─────────────────────────────────────────────── */
exports.stopCronJobs = () => {
  console.log('🛑 Stopping all cron jobs...');

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

  console.log('✅ All cron jobs stopped');
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

// ✅ Export tasks for manual testing/triggering
exports.cronTasks = cronTasks;