// utils/attendanceScheduler.js
const cron = require('node-cron');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const moment = require('moment-timezone');
const {
  notifyMorningPunchIn,
  notifyMorningPunchOut,
  notifyEveningPunchIn,
  notifyEveningPunchOut,
} = require('./attendanceNotifications');

/**
 * Get today's date in IST
 */
function getTodayDate() {
  return moment().tz('Asia/Kolkata').startOf('day').toDate();
}

/**
 * Fetch employees who need punch-in/punch-out notification
 */
async function getEmployeesToNotify(type) {
  const today = getTodayDate();

  const employees = await User.find({ isActive: true, role: 'user' }).select('_id').lean();

  const attendances = await Attendance.find({
    employee: { $in: employees.map(e => e._id) },
    date: today,
  }).lean();

  const toNotify = employees.filter(emp => {
    const att = attendances.find(a => a.employee.toString() === emp._id.toString()) || {};

    switch (type) {
      case 'morning_in':
        return !att.checkIn?.time;
      case 'morning_out':
        return att.checkIn?.time && !att.checkOut?.time;
      case 'evening_in':
        return !att.eveningCheckIn?.time;
      case 'evening_out':
        return att.eveningCheckIn?.time && !att.eveningCheckOut?.time;
      default:
        return false;
    }
  });

  return toNotify.map(e => e._id);
}

/**
 * Schedule attendance notifications
 */
function scheduleAttendanceNotifications() {
  // Morning Punch-In: 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    const employees = await getEmployeesToNotify('morning_in');
    await Promise.all(employees.map(id => notifyMorningPunchIn(id).catch(err => {
      console.error(`❌ Morning punch-in notification failed for employee ${id}:`, err.message);
    })));
  });

  // Morning Punch-Out: 1:00 PM
  cron.schedule('0 13 * * *', async () => {
    const employees = await getEmployeesToNotify('morning_out');
    await Promise.all(employees.map(id => notifyMorningPunchOut(id).catch(err => {
      console.error(`❌ Morning punch-out notification failed for employee ${id}:`, err.message);
    })));
  });

  // Evening Punch-In: 2:00 PM
  cron.schedule('0 14 * * *', async () => {
    const employees = await getEmployeesToNotify('evening_in');
    await Promise.all(employees.map(id => notifyEveningPunchIn(id).catch(err => {
      console.error(`❌ Evening punch-in notification failed for employee ${id}:`, err.message);
    })));
  });

  // Evening Punch-Out: 6:00 PM
  cron.schedule('0 18 * * *', async () => {
    const employees = await getEmployeesToNotify('evening_out');
    await Promise.all(employees.map(id => notifyEveningPunchOut(id).catch(err => {
      console.error(`❌ Evening punch-out notification failed for employee ${id}:`, err.message);
    })));
  });
}

module.exports = scheduleAttendanceNotifications;