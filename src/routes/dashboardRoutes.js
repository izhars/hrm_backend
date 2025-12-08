const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getDashboardStats,
  getAttendanceOverview,
  getLeaveOverview,
  getEmployeeGrowth,
  getAllEmployees,
  getEmployeeById
} = require('../controllers/dashboardController');

router.use(protect);

// Public to logged-in users
router.get('/stats', getDashboardStats);

// Restricted routes
router.get('/attendance-overview', authorize('hr', 'manager', 'superadmin'), getAttendanceOverview);
router.get('/leave-overview', authorize('hr', 'manager', 'superadmin'), getLeaveOverview);
router.get('/employee-growth', authorize('hr', 'superadmin'), getEmployeeGrowth);

// Employee CRUD
router.get('/employees', authorize('hr', 'superadmin'), getAllEmployees);
router.get('/employees/:id', authorize('hr', 'superadmin'), getEmployeeById);

module.exports = router;