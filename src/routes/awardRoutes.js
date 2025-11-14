const express = require('express');
const {
  createAward,
  getAwards,
  getAward,
  updateAward,
  deleteAward,
  getMyAwards
} = require('../controllers/awardController');

const { protect, hrAndAbove, superAdminOnly } = require('../middleware/auth');

const router = express.Router();

// Public route for employees to see their own awards
router.get('/me', protect, getMyAwards);
// Protected routes (HR & above)
router.use(protect, hrAndAbove);
router .route('/') .post(createAward) .get(getAwards);
router .route('/:id')  .get(getAward).put(updateAward);
// Superadmin only
router.route('/:id').delete(protect, superAdminOnly, deleteAward);

module.exports = router;