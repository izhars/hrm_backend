const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // For role-based or system-wide notifications
    role: {
      type: String,
      enum: ['superadmin', 'hr', 'manager', 'employee', 'all'],
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    message: {
      type: String,
      required: true,
      trim: true,
    },

    type: {
      type: String,
      enum: ['info', 'warning', 'success', 'error', 'system'],
      default: 'info',
    },

    read: {
      type: Boolean,
      default: false,
    },

    link: String,

    // Optional metadata for structured notifications
    meta: {
      type: Object,
      default: {},
    },

    // Soft delete
    deleted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ role: 1 });

module.exports = mongoose.model('Notification', notificationSchema);
