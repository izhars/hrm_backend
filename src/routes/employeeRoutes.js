const express = require('express'); const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../middleware/upload');
const c = require('../controllers/employeeController');

router.use(protect);

router.get('/hr', c.getAllHRs);
router.get('/last-seen', protect, c.getEmployeeList); // moved above
router.get('/', authorize('hr','manager','superadmin','employee'), c.getAllEmployees);
router.post('/', authorize('hr','superadmin'), c.createEmployee);
router.get('/:id', c.getEmployee);
router.put('/:id', authorize('hr','superadmin'), c.updateEmployee);
router.delete('/:id', authorize('superadmin'), c.deleteEmployee);
router.post('/:id/documents', authorize('hr','superadmin'), upload.single('document'), c.uploadDocument);
router.put('/:id/profile-picture', upload.single('profilePicture'), c.updateProfilePicture);
router.put('/:id/availability', authorize('hr','superadmin'), c.toggleHRAvailability);
router.get('/:id/availability-status', authorize('hr','manager','superadmin'), c.getAvailabilityStatus);


module.exports = router;
