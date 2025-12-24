// routes/aboutRoutes.js (or similar)
const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');

// ✅ Import the configured upload from your middleware
const { upload } = require('../middleware/upload');

const {
  getAboutInfo,
  createOrUpdateAbout,
  addTimelineItem,
  updateTimelineItem,
  deleteTimelineItem,
  addStatItem,
  updateStatItem,
  deleteStatItem,
  addTeamMember,
  updateTeamMember,
  deleteTeamMember
} = require('../controllers/aboutController');

// Public route
router.get('/', getAboutInfo);

// Admin - Main content (upsert)
router.put(
  '/content',
  protect,
  authorize('hr', 'superadmin'),
  createOrUpdateAbout
);

// Timeline routes
router.post(
  '/timeline',
  protect,
  authorize('hr', 'superadmin'),
  addTimelineItem
);
router.put(
  '/timeline/:id',
  protect,
  authorize('hr', 'superadmin'),
  updateTimelineItem
);
router.delete(
  '/timeline/:id',
  protect,
  authorize('hr', 'superadmin'),
  deleteTimelineItem
);

// Stats routes
router.post(
  '/stats',
  protect,
  authorize('hr', 'superadmin'),
  addStatItem
);
router.put(
  '/stats/:id',
  protect,
  authorize('hr', 'superadmin'),
  updateStatItem
);
router.delete(
  '/stats/:id',
  protect,
  authorize('hr', 'superadmin'),
  deleteStatItem
);

// Team routes - with file upload
router.post(
  '/team',
  protect,
  authorize('hr', 'superadmin'),
  // Specify the field name expected in the form-data
  upload.single('image'),
  addTeamMember
);

router.put(
  '/team/:id',
  protect,
  authorize('hr', 'superadmin'),
  upload.single('image'), // 'image' should match the field name in the request
  updateTeamMember
);

router.delete(
  '/team/:id',
  protect,
  authorize('hr', 'superadmin'),
  deleteTeamMember
);

module.exports = router;