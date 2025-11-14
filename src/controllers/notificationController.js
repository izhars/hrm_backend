const Notification = require('../models/Notification');
const User = require('../models/User');

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

    const payloadBase = {
      title,
      message,
      type: type || 'info',
      link,
      meta,
    };

    let notifications = [];

    // Individual users
    if (Array.isArray(userIds) && userIds.length > 0) {
      notifications.push(...userIds.map((id) => ({ ...payloadBase, user: id })));
    }

    // Roles (can target multiple)
    if (Array.isArray(roles) && roles.length > 0) {
      for (const role of roles) {
        const users = await User.find({ role }).select('_id');
        const roleNotifications = users.map((u) => ({
          ...payloadBase,
          user: u._id,
          role,
        }));
        notifications.push(...roleNotifications);
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
    const filter = {
      deleted: false,
      $or: [
        { user: req.user._id },          // personal notifications
        { role: req.user.role },         // role-based notifications
        { role: 'all' }                  // global/system notifications
      ]
    };

    if (read !== undefined) filter.read = read === 'true';
    if (type) filter.type = type;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: sort === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(Number(limit)),
      Notification.countDocuments(filter),
    ]);

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
/**
 * @desc    Mark notification as read
 * @route   PATCH /api/notifications/:id/read
 * @access  Private
 */
exports.markAsRead = async (req, res) => {
  try {
    const filter = {
      _id: req.params.id,
      $or: [
        { user: req.user._id },
        { role: req.user.role },
        { role: 'all' },
      ],
      deleted: false,
    };

    const notification = await Notification.findOneAndUpdate(
      filter,
      { read: true },
      { new: true }
    );

    if (!notification)
      return res.status(404).json({
        success: false,
        message: 'Notification not found or not accessible',
      });

    res.json({ success: true, data: notification });
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
  await Notification.updateMany(
    { user: req.user._id, read: false },
    { read: true }
  );
  res.json({ success: true, message: 'All notifications marked as read' });
};

/**
 * @desc    Delete notification (soft delete)
 * @route   DELETE /api/notifications/:id
 * @access  Private (owner or superadmin)
 */
exports.deleteNotification = async (req, res) => {
  const filter =
    req.user.role === 'superadmin'
      ? { _id: req.params.id }
      : { _id: req.params.id, user: req.user._id };

  const notification = await Notification.findOneAndUpdate(
    filter,
    { deleted: true },
    { new: true }
  );

  if (!notification)
    return res
      .status(404)
      .json({ success: false, message: 'Notification not found' });

  res.json({ success: true, message: 'Notification deleted' });
};

/**
 * @desc    Delete multiple notifications
 * @route   DELETE /api/notifications
 * @access  Private
 */
exports.deleteMultiple = async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0)
    return res.status(400).json({ success: false, message: 'No IDs provided' });

  await Notification.updateMany(
    { _id: { $in: ids }, user: req.user._id },
    { deleted: true }
  );
  res.json({ success: true, message: 'Selected notifications deleted' });
};

exports.getNotificationCounts = async (req, res) => {
  try {
    const baseFilter = {
      deleted: false,
      $or: [
        { user: req.user._id },  // personal notifications
        { role: req.user.role }, // role-based
        { role: 'all' }          // global
      ]
    };

    const [total, unread, read] = await Promise.all([
      Notification.countDocuments(baseFilter),
      Notification.countDocuments({ ...baseFilter, read: false }),
      Notification.countDocuments({ ...baseFilter, read: true }),
    ]);

    res.json({
      success: true,
      counts: {
        total,
        unread,
        read,
      },
    });
  } catch (err) {
    console.error('Notification Count Error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
};