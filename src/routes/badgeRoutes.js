// routes/badgeRoutes.js
const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const { createBadge, getBadges, deleteBadge } = require('../controllers/badgeController');

router.post('/', upload.single('image'), createBadge);
router.get('/', getBadges);
router.delete('/:id', deleteBadge);

module.exports = router;
