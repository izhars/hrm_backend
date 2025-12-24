// routes/badgeRoutes.js
const express = require('express');
const router = express.Router();

// Import upload middleware - CORRECT WAY
const { upload } = require('../middleware/upload');

const {
  createBadge,
  getBadges,
  deleteBadge
} = require('../controllers/badgeController');

const { protect, authorize } = require('../middleware/auth');

// 🔒 Protected Routes
router.use(protect);
router.use(authorize('hr', 'superadmin'));

// Create a new badge (with image upload)
router.post('/', upload.single('image'), createBadge);

// Get all badges
router.get('/', getBadges);

// Delete a badge by ID
router.delete('/:id', deleteBadge);

module.exports = router;