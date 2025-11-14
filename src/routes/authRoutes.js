const express = require('express');
const router = express.Router();
const upload = require('../middleware/upload');
const {register, login, getMe, updateProfile, changePassword, forgotPassword, resetPassword, getManagers, resetDevice, setVerification, checkVerification,updateProfilePicture
} = require('../controllers/authController');

const { protect, hrAndAbove
} = require('../middleware/auth');

const { registerValidator, loginValidator
} = require('../validators/authValidator');

const { loginLimiter, registerLimiter
} = require('../middleware/rateLimit');

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
router.get('/manager', protect, getManagers);

// -------------------------------
// 🔒 Authenticated User Routes
// -------------------------------
router.use(protect);

router.get('/me', getMe);
router.put('/profile', updateProfile);
router.put('/change-password', changePassword);
router.get('/check-verification', checkVerification); // ✅ Add this line
router.put('/profile-picture', upload.single('file'), updateProfilePicture);

module.exports = router;
