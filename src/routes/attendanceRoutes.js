const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  checkIn,
  checkOut,
  getMyAttendance,
  getTodayAttendance,
  getEmployeeAttendance,
  getAttendanceReport,
  updateAttendance,
  markStatus,
  bulkUploadAttendance,
  getAttendanceSummary,
  cancelAction,
  getAttendanceStatus,
  exportAttendance,
  getTodayAllEmployeesAttendance, // New API
  getAllEmployeesAttendance,
  getEmployeeWorkHoursChart,
  getWorkHoursChartMonthly,
  exportMonthlyAttendanceExcel
} = require('../controllers/attendanceController');

// Protect all routes
router.use(protect);

// Employee routes
router.post('/check-in', checkIn);
router.post('/check-out', checkOut);
router.get('/my-attendance', getMyAttendance);
router.get('/today', getTodayAttendance);
router.get('/status', getAttendanceStatus);
router.get('/work-hours-chart', getEmployeeWorkHoursChart);
router.get('/work-hours-chart-monthly', getWorkHoursChartMonthly);

// Manager/HR/Admin routes
router.get('/employee/:employeeId', authorize('hr', 'manager', 'superadmin'), getEmployeeAttendance);
router.get('/summary', authorize('hr', 'manager', 'superadmin'), getAttendanceSummary);
router.get('/today-all', authorize('hr', 'superadmin'), getTodayAllEmployeesAttendance); // New route
router.get('/attendance-all', authorize('hr', 'superadmin'), getAllEmployeesAttendance); // New route

// HR/Admin routes
router.get('/report', authorize('hr', 'superadmin'), getAttendanceReport);
router.put('/:attendanceId', authorize('hr', 'superadmin'), updateAttendance);
router.post('/mark-status', authorize('hr', 'superadmin'), markStatus);
router.post('/bulk-upload', authorize('hr', 'superadmin'), bulkUploadAttendance);
router.delete('/:attendanceId/action', authorize('hr', 'superadmin'), cancelAction);
router.get('/export', authorize('hr', 'superadmin'), exportAttendance);
// Add this route (HR/Admin only)
router.get('/export-monthly', authorize('hr', 'superadmin'), exportMonthlyAttendanceExcel);

module.exports = router;