// routes/chatRoutes.js
const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getChatHistory,
  getActiveUsers,
  getLastMessage
} = require('../controllers/chatController');

const router = express.Router();

// ✅ All chat routes are protected
router.use(protect);

// ✅ Get chat history between logged-in user and target
router.get('/history/:targetUserId', getChatHistory);

// ✅ Get last message between logged-in user and target
router.get('/last/:targetUserId', getLastMessage);

// ✅ Get currently active users (online via socket)
router.get('/active-users', getActiveUsers);

module.exports = router;
