const express = require('express');
const router = express.Router();
const {
  createNotification,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteMultiple,
  getNotificationCounts, // ✅ new import
  sendCallNotification
} = require('../controllers/notificationController');
const { protect, hrAndAbove, superAdminOnly } = require('../middleware/auth');

// All routes protected
router.use(protect);

// Create (single, multiple, or roles)
router.post('/', hrAndAbove, createNotification);

// Add to routes/notificationRoutes.js
router.post('/call', protect, sendCallNotification);

// Get my notifications (with filters)
router.get('/me', getMyNotifications);
router.get('/count', protect, getNotificationCounts); // ✅ new route

// Mark as read or all read
router.patch('/:id/read', markAsRead);
router.patch('/read-all', markAllAsRead);

// Delete one or multiple
router.delete('/:id', deleteNotification);
router.delete('/', deleteMultiple);

module.exports = router;
