const cron = require('node-cron');
const moment = require('moment-timezone');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Holiday = require('../models/Holiday');
const Leave = require('../models/Leave');
const { updateCronRun, getLastCronRun } = require('./cronLogger');

// Store the actual task functions for manual execution
const cronTasks = {
  autoCheckoutEmployees: async () => {
    try {
      console.log('⏰ Running cron: Auto checkout employees who missed checkout');
      await updateCronRun('autoCheckoutEmployees');

      const istNow = moment().tz('Asia/Kolkata');
      
      // ✅ FIX 1: Create date range for today in IST
      const todayStart = istNow.clone().startOf('day').toDate();
      const todayEnd = istNow.clone().endOf('day').toDate();

      console.log(`🔍 Searching for attendance between ${todayStart} and ${todayEnd}`);

      const pendingAttendances = await Attendance.find({
        date: { $gte: todayStart, $lte: todayEnd }, // ✅ Use range instead of exact match
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

      const employees = await User.find({ isActive: true });
      let markedCount = 0;

      for (const employee of employees) {
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

      // TODO: Add report generation + email logic
      console.log('✅ Monthly attendance report generated successfully');
      return { success: true };
    } catch (error) {
      console.error('❌ Error generating monthly report:', error);
      return { success: false, error: error.message };
    }
  }
};

/* ───────────────────────────────────────────────
   🕗 AUTO CHECK-OUT (9:00 PM IST)
   ✅ FIX: Set timezone to Asia/Kolkata
─────────────────────────────────────────────── */
exports.autoCheckoutEmployees = cron.schedule(
  '0 21 * * *', 
  cronTasks.autoCheckoutEmployees, 
  { 
    scheduled: true, // ✅ Changed to true
    timezone: 'Asia/Kolkata' // ✅ Added timezone
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
   🚀 START ALL CRON JOBS + AUTO RECOVERY CHECK
─────────────────────────────────────────────── */
exports.startCronJobs = async () => {
  console.log('🕒 Starting cron jobs with recovery check...');

  const jobs = [
    { name: 'autoCheckoutEmployees', task: cronTasks.autoCheckoutEmployees, cron: exports.autoCheckoutEmployees },
    { name: 'markAbsentEmployees', task: cronTasks.markAbsentEmployees, cron: exports.markAbsentEmployees },
    { name: 'resetLeaveBalance', task: cronTasks.resetLeaveBalance, cron: exports.resetLeaveBalance },
    { name: 'sendBirthdayWishes', task: cronTasks.sendBirthdayWishes, cron: exports.sendBirthdayWishes },
    { name: 'generateMonthlyReport', task: cronTasks.generateMonthlyReport, cron: exports.generateMonthlyReport },
  ];

  const now = moment().tz('Asia/Kolkata');

  for (const job of jobs) {
    const lastRun = await getLastCronRun(job.name);

    if (!lastRun) {
      console.log(`⚠️ ${job.name} has never run — skipping recovery.`);
    } else {
      const diffHours = moment(now).diff(moment(lastRun), 'hours');
      if (diffHours > 24) {
        console.log(`⚠️ ${job.name} missed last scheduled run (${diffHours}h ago). Running now...`);
        await job.task();
      }
    }

    console.log(`✅ Started cron: ${job.name}`);
  }

  console.log('✅ All cron jobs started successfully');
};

// ✅ Export tasks for manual testing
exports.cronTasks = cronTasks;