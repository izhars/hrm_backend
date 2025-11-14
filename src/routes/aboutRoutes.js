const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getAboutInfo } = require('../controllers/aboutController');
router.get('/',protect, getAboutInfo);
module.exports = router;