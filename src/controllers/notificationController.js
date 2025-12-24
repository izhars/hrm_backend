const Notification = require('../models/Notification');
const User = require('../models/User');

/**
 * @desc    Get notification filter based on user role
 * @param   {Object} user - User object with role
 * @returns {Object} MongoDB filter for notifications
 */
/**
 * @desc    Get notification filter based on user role
 * @param   {Object} user - User object with role
 * @returns {Object} MongoDB filter for notifications
 */
const getNotificationFilterByRole = (user) => {
  const userId = user._id.toString();
  
  const baseFilter = {
    deleted: false,
    $or: [
      { user: userId }, // Personal notifications
      { role: 'all' },  // Global notifications
      { isGlobal: true }
    ]
  };

  switch (user.role) {
    case 'superadmin':
      return { deleted: false };
      
    case 'hr':
      // HR sees their personal HR role notifications
      baseFilter.$or.push(
        { $and: [{ role: 'hr' }, { user: userId }] }
      );
      // HR can ALSO see all manager notifications (for oversight)
      baseFilter.$or.push(
        { role: 'manager' }
      );
      break;
      
    case 'manager':
      baseFilter.$or.push(
        { $and: [{ role: 'manager' }, { user: userId }] }
      );
      // Managers see all employee notifications (their team)
      baseFilter.$or.push(
        { role: 'employee' }
      );
      break;
      
    case 'employee':
      baseFilter.$or.push(
        { $and: [{ role: 'employee' }, { user: userId }] }
      );
      break;
  }

  return baseFilter;
};

/**
 * @desc    Check if user can act on a notification
 * @param   {Object} user - Current user
 * @param   {Object} notification - Notification object
 * @returns {Boolean} True if user can act
 */
const canUserActOnNotification = (user, notification) => {
  // Superadmin can act on any notification
  if (user.role === 'superadmin') return true;
  
  // User can always act on their own notifications
  if (notification.user && notification.user.toString() === user._id.toString()) {
    return true;
  }
  
  // Check if notification has isGlobal flag
  if (notification.isGlobal) {
    // Global notifications can be acted on by anyone
    return true;
  }
  
  // Check role-based access
  if (notification.role) {
    switch (user.role) {
      case 'hr':
        // HR can act on hr, manager, employee, and all role notifications
        return ['hr', 'manager', 'employee', 'all'].includes(notification.role);
        
      case 'manager':
        // Managers can act on manager, employee, and all role notifications
        return ['manager', 'employee', 'all'].includes(notification.role);
        
      case 'employee':
        // Employees can only act on employee and all role notifications
        return ['employee', 'all'].includes(notification.role);
    }
  }
  
  return false;
};

/**
 * @desc    Create notification (user(s), role(s), or all)
 * @route   POST /api/notifications
 * @access  Private (hrAndAbove)
 */
exports.createNotification = async (req, res) => {
  try {
    const { userIds, roles, title, message, type, link, meta } = req.body;

    if ((!userIds || userIds.length === 0) && (!roles || roles.length === 0)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide at least one userId or role to target.',
      });
    }

    // Role hierarchy check for creating notifications
    const allowedRolesToNotify = {
      superadmin: ['superadmin', 'hr', 'manager', 'employee', 'all'],
      hr: ['hr', 'manager', 'employee', 'all'],
      manager: ['manager', 'employee', 'all'],
      employee: ['employee'] // Employees can only notify themselves
    };

    const userAllowedRoles = allowedRolesToNotify[req.user.role] || [];

    const payloadBase = {
      title,
      message,
      type: type || 'info',
      link,
      meta,
      createdBy: req.user._id,
      createdAt: new Date()
    };

    let notifications = [];

    // Individual users
    if (Array.isArray(userIds) && userIds.length > 0) {
      notifications.push(...userIds.map((id) => ({ 
        ...payloadBase, 
        user: id,
        role: null // Explicitly null for user-specific notifications
      })));
    }

    // Roles (can target multiple)
    if (Array.isArray(roles) && roles.length > 0) {
      // Check if user has permission to notify these roles
      const unauthorizedRoles = roles.filter(role => !userAllowedRoles.includes(role));
      if (unauthorizedRoles.length > 0) {
        return res.status(403).json({
          success: false,
          message: `You don't have permission to notify roles: ${unauthorizedRoles.join(', ')}`
        });
      }

      for (const role of roles) {
        if (role === 'all') {
          // Send to all active users
          const users = await User.find({ isActive: true }).select('_id');
          const allNotifications = users.map((u) => ({
            ...payloadBase,
            user: u._id,
            role: 'all',
            isGlobal: true
          }));
          notifications.push(...allNotifications);
        } else {
          // Send to specific role
          const users = await User.find({ role, isActive: true }).select('_id');
          const roleNotifications = users.map((u) => ({
            ...payloadBase,
            user: u._id,
            role,
          }));
          notifications.push(...roleNotifications);
        }
      }
    }

    // Insert all notifications
    const created = await Notification.insertMany(notifications);

    // Optional: emit via Socket.IO (if integrated)
    if (req.io) {
      created.forEach((n) => {
        req.io.to(n.user?.toString()).emit('notification:new', n);
      });
    }

    res.status(201).json({
      success: true,
      count: created.length,
      data: created,
    });
  } catch (err) {
    console.error('Notification Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get my notifications (filter, sort, paginate)
 * @route   GET /api/notifications/me
 * @access  Private
 */
exports.getMyNotifications = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      read,
      type,
      sort = 'desc',
      from,
      to,
    } = req.query;

    const skip = (page - 1) * limit;
    
    // Get role-based filter
    const filter = getNotificationFilterByRole(req.user);

    // Apply additional filters
    if (read !== undefined) filter.read = read === 'true';
    if (type) filter.type = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    console.log('User ID:', req.user._id);
    console.log('User Role:', req.user.role);
    console.log('Filter being used:', JSON.stringify(filter, null, 2));
    
    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: sort === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(Number(limit)),
      Notification.countDocuments(filter),
    ]);
    
    // Debug: Check what notifications are being returned
    console.log('Notifications found:', notifications.map(n => ({
      id: n._id,
      user: n.user,
      role: n.role,
      title: n.title
    })));
    
    res.json({
      success: true,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
      data: notifications,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Mark notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification || notification.deleted) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user can act on this notification
    if (!canUserActOnNotification(req.user, notification)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this notification'
      });
    }

    const updatedNotification = await Notification.findByIdAndUpdate(
      req.params.id,
      { read: true },
      { new: true }
    );

    res.json({ 
      success: true, 
      data: updatedNotification 
    });
  } catch (err) {
    console.error('MarkAsRead Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Mark all notifications as read
 * @route   PATCH /api/notifications/read-all
 * @access  Private
 */
exports.markAllAsRead = async (req, res) => {
  try {
    const filter = getNotificationFilterByRole(req.user);
    
    await Notification.updateMany(
      { ...filter, read: false },
      { read: true }
    );
    
    res.json({ 
      success: true, 
      message: 'All notifications marked as read' 
    });
  } catch (err) {
    console.error('MarkAllAsRead Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Delete notification (soft delete)
 * @route   DELETE /api/notifications/:id
 * @access  Private (owner or superadmin)
 */
exports.deleteNotification = async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    
    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    // Check if user can delete this notification
    if (!canUserActOnNotification(req.user, notification)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this notification'
      });
    }

    const deletedNotification = await Notification.findByIdAndUpdate(
      req.params.id,
      { deleted: true, deletedAt: new Date(), deletedBy: req.user._id },
      { new: true }
    );

    res.json({ 
      success: true, 
      message: 'Notification deleted',
      data: deletedNotification
    });
  } catch (err) {
    console.error('Delete Notification Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Delete multiple notifications
 * @route   DELETE /api/notifications
 * @access  Private
 */
exports.deleteMultiple = async (req, res) => {
  try {
    const { ids } = req.body;
    
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'No IDs provided' 
      });
    }

    // Get all notifications first to check permissions
    const notifications = await Notification.find({ _id: { $in: ids } });
    
    // Check if user can delete all notifications
    for (const notification of notifications) {
      if (!canUserActOnNotification(req.user, notification)) {
        return res.status(403).json({
          success: false,
          message: `Not authorized to delete notification ${notification._id}`
        });
      }
    }

    await Notification.updateMany(
      { _id: { $in: ids } },
      { 
        deleted: true, 
        deletedAt: new Date(), 
        deletedBy: req.user._id 
      }
    );
    
    res.json({ 
      success: true, 
      message: 'Selected notifications deleted' 
    });
  } catch (err) {
    console.error('Delete Multiple Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Get notification counts
 * @route   GET /api/notifications/counts
 * @access  Private
 */
exports.getNotificationCounts = async (req, res) => {
  try {
    const filter = getNotificationFilterByRole(req.user);

    const [total, unread, read] = await Promise.all([
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false }),
      Notification.countDocuments({ ...filter, read: true }),
    ]);

    // Get counts by type
    const typeCounts = await Notification.aggregate([
      { $match: filter },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      counts: {
        total,
        unread,
        read,
        byType: typeCounts.reduce((acc, curr) => {
          acc[curr._id] = curr.count;
          return acc;
        }, {})
      },
    });
  } catch (err) {
    console.error('Notification Count Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

/**
 * @desc    Clear all notifications (soft delete)
 * @route   DELETE /api/notifications/clear-all
 * @access  Private
 */
exports.clearAllNotifications = async (req, res) => {
  try {
    const filter = getNotificationFilterByRole(req.user);
    
    await Notification.updateMany(
      filter,
      { 
        deleted: true, 
        deletedAt: new Date(), 
        deletedBy: req.user._id 
      }
    );
    
    res.json({ 
      success: true, 
      message: 'All notifications cleared' 
    });
  } catch (err) {
    console.error('Clear All Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};