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

router.use(protect);

router.post('/generate', 
  authorize('hr', 'superadmin'), 
  generatePayroll
);

router.get('/', 
  authorize('hr', 'superadmin'), 
  getAllPayrolls
);

router.get('/my-payroll', getMyPayroll);

router.put('/:id', 
  authorize('hr', 'superadmin'), 
  updatePayroll
);

router.put('/:id/process', 
  authorize('hr', 'superadmin'), 
  processPayroll
);

router.put('/:id/pay', 
  authorize('hr', 'superadmin'), 
  markAsPaid
);

module.exports = router;