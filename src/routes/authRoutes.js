const express = require('express');
const router = express.Router();

// ✅ Correctly destructure the upload middleware
const { upload } = require('../middleware/upload');

const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getManagers,
  resetDevice,
  setVerification,
  checkVerification,
  updateProfilePicture
} = require('../controllers/authController');

const { protect, hrAndAbove } = require('../middleware/auth');
const { registerValidator, loginValidator } = require('../validators/authValidator');
const { loginLimiter, registerLimiter } = require('../middleware/rateLimit');

// -------------------------------
// 🔐 Public Routes
// -------------------------------
router.post('/login', loginValidator, loginLimiter, login);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:token', resetPassword);

// -------------------------------
// 👥 HR / Admin Restricted Routes
// -------------------------------
router.post('/register', protect, hrAndAbove, registerValidator, registerLimiter, register);
router.put('/reset-device/:userId', protect, hrAndAbove, resetDevice);
router.put('/verify/:userId', protect, hrAndAbove, setVerification);
router.get('/managers', protect, hrAndAbove, getManagers); // Fixed route name for clarity

// -------------------------------
// 🔒 Authenticated User Routes (protect applied below)
// -------------------------------
router.use(protect); // All routes below this require authentication

router.get('/me', getMe);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);
router.get('/check-verification', checkVerification);

// ✅ Now this works correctly!
router.put('/profile-picture', upload.single('file'), updateProfilePicture);

module.exports = router;