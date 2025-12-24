const express = require('express');
const router = express.Router();
const { protect, hrAndAbove, managerAndAbove } = require('../middleware/auth');

const {
  getTasks,
  getTask,
  createTask,
  updateTask,
  completeTask,
  addComment,
  deleteTask
} = require('../controllers/taskController');

router.use(protect);

router.get('/', getTasks);
router.get('/:id', getTask);

router.post('/', managerAndAbove, createTask);
router.patch('/:id', managerAndAbove, updateTask);

router.post('/:id/complete', completeTask);
router.post('/:id/comments', addComment);

router.delete('/:id', hrAndAbove, deleteTask);

module.exports = router;
