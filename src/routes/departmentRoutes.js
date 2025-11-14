const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAllDepartments,
  getDepartment,
  createDepartment,
  updateDepartment,
  deleteDepartment
} = require('../controllers/departmentController');

router.use(protect);

router.route('/')
  .get(getAllDepartments)
  .post(authorize('hr', 'superadmin'), createDepartment);

router.route('/:id')
  .get(getDepartment)
  .put(authorize('hr', 'superadmin'), updateDepartment)
  .delete(authorize('superadmin'), deleteDepartment);

module.exports = router;