const jwt = require('jsonwebtoken');
const User = require('../models/User');

// ----------------------
// 🔒 Protect Middleware
// ----------------------
exports.protect = async (req, res, next) => {
  let token;

  // ✅ Get token from header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  // ❌ If no token found
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized to access this route (no token provided)',
    });
  }

  try {
    // ✅ Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    // 🪶 Debug log
    console.log('----------------------------------------');
    console.log('🔑 JWT Token:', token);
    console.log('👤 User Info:', {
      id: req.user?._id,
      name: `${req.user?.firstName || ''} ${req.user?.lastName || ''}`.trim(),
      email: req.user?.email,
      role: req.user?.role,
    });
    console.log('----------------------------------------');

    next();
  } catch (error) {
    console.error('❌ JWT verification failed:', error.message);
    res.status(401).json({
      success: false,
      message: 'Not authorized to access this route (invalid token)',
    });
  }
};

// ----------------------
// 🧩 Role Authorization
// ----------------------
exports.authorize = (...roles) => {
  return (req, res, next) => {
    // 🧭 Log current user role and allowed roles
    console.log(`👮 Role Check -> User Role: ${req.user.role}, Allowed: ${roles.join(', ')}`);

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `User role '${req.user.role}' is not authorized to access this route`,
      });
    }

    next();
  };
};

// 🔐 Predefined Role Groups
exports.superAdminOnly = exports.authorize('superadmin');
exports.hrAndAbove = exports.authorize('superadmin', 'hr');
exports.managerAndAbove = exports.authorize('superadmin', 'hr', 'manager');
