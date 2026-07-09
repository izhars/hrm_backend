const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// Import face recognition controllers
const {
  faceCheckIn,
  faceCheckOut,
  registerFace,
  updateFace,
  deleteFace,
  getFaceStatus,
  verifyFaceStandalone,
  getFaceLogs,
  getFaceRegistrations,
  getEmployeeFaceStatus,
  bulkFaceRegistration,
  compareFaces
} = require('../controllers/faceRecognitionController');

// ====================
// PUBLIC/HEALTH ROUTES
// ====================

// @route   GET /api/face/health
// @desc    Check face recognition service health
// @access  Public
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Face Recognition API is running',
    service: 'Google Cloud Vision API',
    timestamp: new Date().toISOString()
  });
});

// ====================
// EMPLOYEE ROUTES
// ====================

// @route   POST /api/face/register
// @desc    Register face for recognition
// @access  Private
router.post('/register', protect, registerFace);

// @route   POST /api/face/check-in
// @desc    Face recognition check-in
// @access  Private
router.post('/check-in', protect, faceCheckIn);

// @route   POST /api/face/check-out
// @desc    Face recognition check-out
// @access  Private
router.post('/check-out', protect, faceCheckOut);

// @route   POST /api/face/verify
// @desc    Verify face (standalone)
// @access  Private
router.post('/verify', protect, verifyFaceStandalone);

// @route   GET /api/face/status
// @desc    Get face registration status
// @access  Private
router.get('/status', protect, getFaceStatus);

// @route   PUT /api/face/update
// @desc    Update face registration
// @access  Private
router.put('/update', protect, updateFace);

// @route   DELETE /api/face/delete
// @desc    Delete face registration
// @access  Private
router.delete('/delete', protect, deleteFace);

// ====================
// ADMIN/HR ROUTES
// ====================

// @route   GET /api/face/admin/logs
// @desc    Get face recognition logs
// @access  Private (HR, Admin)
router.get('/admin/logs', protect, authorize('hr', 'manager', 'superadmin'), getFaceLogs);

// @route   GET /api/face/admin/registrations
// @desc    Get all face registrations
// @access  Private (HR, Admin)
router.get('/admin/registrations', protect, authorize('hr', 'superadmin'), getFaceRegistrations);

// @route   GET /api/face/admin/employee/:employeeId/status
// @desc    Get face status for specific employee
// @access  Private (HR, Admin)
router.get('/admin/employee/:employeeId/status', protect, authorize('hr', 'manager', 'superadmin'), getEmployeeFaceStatus);

// @route   DELETE /api/face/admin/employee/:employeeId
// @desc    Delete face registration for employee (admin)
// @access  Private (HR, Admin)
router.delete('/admin/employee/:employeeId', protect, authorize('hr', 'superadmin'), deleteFace);

// @route   POST /api/face/admin/bulk-register
// @desc    Bulk register faces (for HR/Admin)
// @access  Private (HR, Admin)
router.post('/admin/bulk-register', protect, authorize('hr', 'superadmin'), bulkFaceRegistration);

// @route   POST /api/face/compare
// @desc    Compare two face images (for testing/verification)
// @access  Private
router.post('/compare', protect, compareFaces);

module.exports = router;