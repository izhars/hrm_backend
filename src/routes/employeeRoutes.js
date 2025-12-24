// routes/employeeRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../middleware/upload'); // ✅ Correct Multer instance

const {
  getAllEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  uploadDocument,
  updateProfilePicture,
  getAllHRs,
  getEmployeeLastSeen,
  toggleHRAvailability, // Keep the toggle API
  getAvailabilityStatus
} = require('../controllers/employeeController');

router.use(protect);
router.get('/hr', getAllHRs); // List all HR users
router.route('/')
  .get(authorize('hr', 'manager', 'superadmin'), getAllEmployees)   // Managers can view list
  .post(authorize('hr', 'superadmin'), createEmployee);             // Only HR+ can create
router.route('/:id')
  .get(getEmployee)                                                // Any authenticated user can view profile
  .put(authorize('hr', 'superadmin'), updateEmployee)              // Only HR & Superadmin can edit details
  .delete(authorize('superadmin'), deleteEmployee);                // Only Superadmin can delete
router.post(
  '/:id/documents',
  authorize('hr', 'superadmin'),
  upload.single('document'), // Expect form-data key: 'document'
  uploadDocument
);
router.put(
  '/:id/profile-picture',
  upload.single('profilePicture'), // Expect form-data key: 'profilePicture'
  updateProfilePicture
);
router.get(
  '/:id/last-seen',
  authorize('hr', 'manager', 'superadmin'),
  getEmployeeLastSeen
);

router.put('/:id/availability', authorize('hr', 'superadmin'), toggleHRAvailability);

router.get(
  "/:id/availability-status",
  protect,
  authorize("hr", "manager", "superadmin"),
  getAvailabilityStatus
);

module.exports = router;