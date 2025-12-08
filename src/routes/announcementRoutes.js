const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getAllAnnouncements,
  getAnnouncement,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement
} = require('../controllers/announcementController');

router.use(protect);

router.route('/')
  .get(getAllAnnouncements)
  .post(authorize('hr', 'superadmin'), createAnnouncement);

router.route('/:id')
  .get(getAnnouncement)
  .put(authorize('hr', 'superadmin'), updateAnnouncement)
  .delete(authorize('hr', 'superadmin'), deleteAnnouncement);

module.exports = router;
