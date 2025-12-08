const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const {
  getTodaysBirthdays,
  getTodaysMarriageAnniversaries,
  getTodaysWorkAnniversaries,
  getAllUpComingCelebrations,
  getAllTodayCelebrations,
  getCelebrationStats,
  sendCelebrationNotification,
  getEmployeeDetails,
} = require('../controllers/celebrationController');

// Celebration endpoints
router.get('/birthdays', protect, getTodaysBirthdays);
router.get('/marriage-anniversaries', protect, getTodaysMarriageAnniversaries);
router.get('/work-anniversaries', protect, getTodaysWorkAnniversaries);
router.get('/all-upcoming', protect, getAllUpComingCelebrations);
router.get('/all-today', protect, getAllTodayCelebrations);
router.get('/stats', protect, getCelebrationStats);
router.post('/send-notification', protect, sendCelebrationNotification);
router.get('/employee/:employeeId', protect, getEmployeeDetails);

module.exports = router;