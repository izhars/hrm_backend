const jwt = require('jsonwebtoken');
const User = require('../models/User');

let ioInstance;

function initNotificationSocket(io) {
  // Create namespace for notifications
  ioInstance = io.of('/notifications');

  // 🔹 Authenticate socket users
  ioInstance.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token provided'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id role');
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      console.error('Socket Auth Error:', err.message);
      next(new Error('Authentication failed'));
    }
  });

  // 🔹 On connection
  ioInstance.on('connection', (socket) => {
    console.log(`🔔 User connected to notifications: ${socket.user._id}`);

    // Join personal + role rooms
    socket.join(socket.user._id.toString());
    socket.join(socket.user.role);
    socket.join('all');

    socket.on('disconnect', () => {
      console.log(`🔕 User disconnected: ${socket.user._id}`);
    });
  });
}

/**
 * Emit notification to users, roles, or all
 */
function sendNotification({ userIds = [], roles = [], notification }) {
  if (!ioInstance) return;

  if (userIds.length > 0) {
    userIds.forEach((id) => ioInstance.to(id.toString()).emit('notification:new', notification));
  }

  if (roles.length > 0) {
    roles.forEach((role) => ioInstance.to(role).emit('notification:new', notification));
  }

  if (userIds.length === 0 && roles.length === 0) {
    ioInstance.to('all').emit('notification:new', notification);
  }
}

module.exports = { initNotificationSocket, sendNotification };
