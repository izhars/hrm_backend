const moment = require('moment-timezone');

// Always return IST moment object internally
const nowIST = () => moment().tz("Asia/Kolkata");

// Get IST date object at current time
const getISTDate = () => {
  return nowIST().toDate();
};

// Get IST midnight (start of day)
const getISTMidnight = () => {
  return nowIST().startOf("day").toDate();
};

// Get IST 10:00 AM (standard check-in time)
const getISTStandardTime = () => {
  return nowIST().set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toDate();
};

// Get IST 6:00 PM (standard checkout time)
const getISTStandardCheckoutTime = () => {
  return nowIST().set({ hour: 18, minute: 0, second: 0, millisecond: 0 }).toDate();
};

// Get IST 9:00 PM (auto checkout time)
const getISTAutoCheckoutTime = () => {
  return nowIST().set({ hour: 21, minute: 0, second: 0, millisecond: 0 }).toDate();
};

// Format time for display
const formatISTTime = (date) => {
  return date ? moment(date).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null;
};

// Get day of week in IST (THIS IS THE IMPORTANT FIX)
const getISTDay = (date) => {
  return moment(date).tz("Asia/Kolkata").day(); // 0 = Sunday, 6 = Saturday
};

// Calculate current work hours
const getCurrentWorkHours = (attendance) => {
  if (!attendance?.checkIn?.time) return 0;

  const now = nowIST();
  const checkIn = moment(attendance.checkIn.time).tz("Asia/Kolkata");

  if (attendance.checkOut?.time) {
    return parseFloat(attendance.workHours?.toFixed(2) || 0);
  }

  return parseFloat(((now.diff(checkIn, 'minutes')) / 60).toFixed(2));
};

module.exports = {
  getISTDate,
  getISTMidnight,
  getISTStandardTime,
  getISTStandardCheckoutTime,
  getISTAutoCheckoutTime,
  formatISTTime,
  getCurrentWorkHours,
  getISTDay, // ← NEW utility function
};
