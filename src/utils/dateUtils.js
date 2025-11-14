const moment = require('moment-timezone');

// Get IST date object at current time
const getISTDate = () => {
  return moment().tz('Asia/Kolkata').toDate();
};

// Get IST midnight (start of day)
const getISTMidnight = () => {
  return moment().tz('Asia/Kolkata').startOf('day').toDate();
};

// Get IST 10:00 AM (standard check-in time)
const getISTStandardTime = () => {
  return moment().tz('Asia/Kolkata').set({ hour: 10, minute: 0, second: 0, millisecond: 0 }).toDate();
};

// Get IST 6:00 PM (standard check-out time)
const getISTStandardCheckoutTime = () => {
  return moment().tz('Asia/Kolkata').set({ hour: 18, minute: 0, second: 0, millisecond: 0 }).toDate();
};

// Get IST 9:00 PM (latest allowed checkout before marking missed)
const getISTAutoCheckoutTime = () => {
  return moment().tz('Asia/Kolkata').set({ hour: 21, minute: 0, second: 0, millisecond: 0 }).toDate();
};

// Format time for display
const formatISTTime = (date) => {
  return date ? moment(date).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss') : null;
};

// Calculate current work hours
const getCurrentWorkHours = (attendance) => {
  if (!attendance?.checkIn?.time) return 0;
  const now = moment().tz('Asia/Kolkata');
  const checkIn = moment(attendance.checkIn.time).tz('Asia/Kolkata');
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
};
