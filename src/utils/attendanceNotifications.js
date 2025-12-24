const { sendNotification } = require('../firebase/notificationService'); // your FCM helper

/**
 * Morning Punch-In Reminder
 */
async function notifyMorningPunchIn(userId) {
  await sendNotification(userId, {
    title: 'Good Morning! 🌞',
    body: "Don't forget to punch in for today!",
    data: {
      type: 'attendance',
      action: 'morning_punch_in',
    },
  });
}

/**
 * Morning Punch-Out Reminder
 */
async function notifyMorningPunchOut(userId) {
  await sendNotification(userId, {
    title: 'Morning Session Done! ☕',
    body: "Remember to punch out for the morning session!",
    data: {
      type: 'attendance',
      action: 'morning_punch_out',
    },
  });
}

/**
 * Evening Punch-In Reminder
 */
async function notifyEveningPunchIn(userId) {
  await sendNotification(userId, {
    title: 'Back for Evening Shift 🌆',
    body: "Time to punch in for the evening session!",
    data: {
      type: 'attendance',
      action: 'evening_punch_in',
    },
  });
}

/**
 * Evening Punch-Out Reminder
 */
async function notifyEveningPunchOut(userId) {
  await sendNotification(userId, {
    title: 'Evening Session Over 🌙',
    body: "Don't forget to punch out before leaving!",
    data: {
      type: 'attendance',
      action: 'evening_punch_out',
    },
  });
}

module.exports = {
  notifyMorningPunchIn,
  notifyMorningPunchOut,
  notifyEveningPunchIn,
  notifyEveningPunchOut,
};
