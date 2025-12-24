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
    console.log(`⏰ Morning punch-in reminders for ${employees.length} employees`);
    await Promise.all(employees.map(id => notifyMorningPunchIn(id)));
  });

  // Morning Punch-Out: 1:00 PM
  cron.schedule('0 13 * * *', async () => {
    const employees = await getEmployeesToNotify('morning_out');
    console.log(`⏰ Morning punch-out reminders for ${employees.length} employees`);
    await Promise.all(employees.map(id => notifyMorningPunchOut(id)));
  });

  // Evening Punch-In: 2:00 PM
  cron.schedule('0 14 * * *', async () => {
    const employees = await getEmployeesToNotify('evening_in');
    console.log(`⏰ Evening punch-in reminders for ${employees.length} employees`);
    await Promise.all(employees.map(id => notifyEveningPunchIn(id)));
  });

  // Evening Punch-Out: 6:00 PM
  cron.schedule('0 18 * * *', async () => {
    const employees = await getEmployeesToNotify('evening_out');
    console.log(`⏰ Evening punch-out reminders for ${employees.length} employees`);
    await Promise.all(employees.map(id => notifyEveningPunchOut(id)));
  });

  console.log('✅ Attendance notification scheduler initialized.');
}

module.exports = scheduleAttendanceNotifications;
