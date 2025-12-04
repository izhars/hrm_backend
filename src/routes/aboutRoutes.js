// routes/aboutRoutes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const { protect, authorize } = require('../middleware/auth');

const {
  getAboutInfo,
  createAboutContent,    // New!
  updateAboutContent,    // Existing PUT
  addTeamMember,
  updateTeamMember,
  deleteTeamMember,
  updateTimelineItem,
  updateStatItem
} = require('../controllers/aboutController');

const upload = multer({ dest: 'uploads/' });

// Public
router.get('/', getAboutInfo);

// Admin Routes
router.post('/content', protect, authorize('hr', 'superadmin'), createAboutContent);    // Create first time
router.put('/content', protect, authorize('hr', 'superadmin'), updateAboutContent);
router.post('/team', protect, authorize('hr', 'superadmin'), upload.single('image'), addTeamMember);
router.put('/team/:id', protect, authorize('hr', 'superadmin'), upload.single('image'), updateTeamMember);
router.delete('/team/:id', protect, authorize('hr', 'superadmin'), deleteTeamMember);
router.put('/timeline/:id', protect, authorize('hr', 'superadmin'), updateTimelineItem);
router.put('/stats/:id', protect, authorize('hr', 'superadmin'), updateStatItem);

module.exports = router;