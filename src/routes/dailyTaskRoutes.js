const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');

const taskController = require('../controllers/dailyTaskController');
const { protect, hrAndAbove, managerAndAbove } = require('../middleware/auth');

// =======================
// ✅ VALIDATIONS
// =======================
const validateTask = [
  body('tasks')
    .isArray({ min: 1 })
    .withMessage('Tasks must be a non-empty array'),

  body('tasks.*.title')
    .notEmpty()
    .withMessage('Task title is required'),

  body('tasks.*.timeSpent')
    .isInt({ min: 0 })
    .withMessage('Time spent must be a positive integer'),

  body('notes')
    .optional()
    .isString()
    .trim()
];

const validateDateRange = [
  query('from')
    .optional()
    .isISO8601()
    .withMessage('Invalid from date'),

  query('to')
    .optional()
    .isISO8601()
    .withMessage('Invalid to date'),
];

router.post('/', protect, validateTask, taskController.createOrUpdateDailyTask); // 🧾 Create or update daily task
router.post('/draft', protect, validateTask, taskController.saveAsDraft); // 🧾 Save Tasks as Draft
router.get('/today', protect, taskController.getTodayTask); // 📅 Get Today’s Task
router.get('/', protect, validateDateRange, taskController.getTasksByDateRange); // 📆 Get Tasks by Date Range
router.get('/summary/weekly', protect, taskController.getWeeklySummary); // 📊 Weekly Summary (Manager+)

module.exports = router;
