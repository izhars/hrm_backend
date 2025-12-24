const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

const {
  generatePayroll,
  getAllPayrolls,
  getMyPayroll,
  updatePayroll,
  processPayroll,
  markAsPaid
} = require('../controllers/payrollController');

router.use(protect); // All routes below require login

router
  .route('/generate')
  .post(authorize('hr', 'superadmin'), generatePayroll);

router
  .route('/')
  .get(authorize('hr', 'superadmin'), getAllPayrolls);

router
  .route('/my-payroll')
  .get(getMyPayroll);

router
  .route('/:id')
  .put(authorize('hr', 'superadmin'), updatePayroll);

router
  .route('/:id/process')
  .put(authorize('hr', 'superadmin'), processPayroll);

router
  .route('/:id/pay')
  .put(authorize('hr', 'superadmin'), markAsPaid);

module.exports = router;