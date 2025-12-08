const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const {
  getAllEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  uploadDocument,
  updateProfilePicture,
  getAllHRs,
  getEmployeeLastSeen
} = require('../controllers/employeeController');

router.use(protect);

router.get('/hr', getAllHRs);

router.route('/',)
  .get(authorize('hr', 'manager', 'superadmin'), getAllEmployees)
  .post(authorize('hr', 'superadmin'), createEmployee);

router.route('/:id')
  .get(getEmployee)
  .put(authorize('hr', 'superadmin'), updateEmployee)
  .delete(authorize('superadmin'), deleteEmployee);

router.post('/:id/documents', 
  authorize('hr', 'superadmin'), 
  upload.single('document'), 
  uploadDocument
);

router.put('/:id/profile-picture', 
  upload.single('profilePicture'), 
  updateProfilePicture
);

// ✅ Get employee last seen
router.get('/:id/last-seen', authorize('hr', 'manager', 'superadmin'), getEmployeeLastSeen);


module.exports = router;