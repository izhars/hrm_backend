// routes/expenseCategoryRoutes.js
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const categoryController = require('../controllers/expenseCategoryController');

router.use(protect);

// Admin / HR only
router.post('/', authorize('admin', 'hr'), categoryController.createCategory);
router.put('/:id', authorize('admin', 'hr'), categoryController.updateCategory);
router.delete('/:id', authorize('admin', 'hr'), categoryController.deactivateCategory);

// Everyone can read
router.get('/', categoryController.getCategories);
router.get('/:id', categoryController.getCategoryById);

module.exports = router;
