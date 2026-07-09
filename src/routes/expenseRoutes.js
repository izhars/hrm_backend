const express = require('express');
const router = express.Router();
const expenseController = require('../controllers/expenseController');
const { protect, authorize } = require('../middleware/auth');
const { expenseUpload } = require('../middleware/upload'); // Fixed import

// Apply auth middleware to all routes
router.use(protect);

// ========== EMPLOYEE ROUTES ==========
// Use expenseUpload.single() as the middleware
router.post('/', expenseUpload.single('receipt'), expenseController.createExpense);
router.get('/me', expenseController.getMyExpenses);
router.put('/:id', expenseUpload.single('receipt'), expenseController.updateExpense);
router.delete('/:id', expenseController.deleteExpense);
router.post('/:id/submit', expenseController.submitExpense);
router.get('/:id', expenseController.getExpenseById);

// ========== HR/ADMIN ROUTES ==========
// HR Dashboard endpoints
router.get('/hr/all', authorize('hr', 'admin'), expenseController.getAllExpensesForHR);
router.get('/hr/pending', authorize('hr', 'admin'), expenseController.getPendingExpenses);
router.get('/hr/approved', authorize('hr', 'admin'), expenseController.getApprovedExpenses);
router.get('/hr/rejected', authorize('hr', 'admin'), expenseController.getRejectedExpenses);

// HR Statistics
router.get('/hr/stats', authorize('hr', 'admin'), expenseController.getExpenseStats);
router.get('/hr/department', authorize('hr', 'admin'), expenseController.getDepartmentExpenses);

// HR Approval actions
router.put('/:id/hr-approve', authorize('hr', 'admin'), expenseController.hrApproveExpense);

// HR Bulk actions
// router.post('/hr/bulk-approve', authorize('hr', 'admin'), expenseController.bulkApproveExpenses);

module.exports = router;