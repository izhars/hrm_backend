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

    // Notification type - only define this ONCE
    type: {
      type: String,
      enum: ['info', 'warning', 'success', 'error', 'system', 'call', 'meeting', 'task'],
      default: 'info',
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

    // For audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // Soft delete
    deleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: Date,
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },

    // For global notifications
    isGlobal: {
      type: Boolean,
      default: false,
    }
  },
  { timestamps: true }
);

// Indexes for better query performance
notificationSchema.index({ user: 1, read: 1, createdAt: -1 });
notificationSchema.index({ role: 1, createdAt: -1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ isGlobal: 1 });
notificationSchema.index({ deleted: 1 });

module.exports = mongoose.model('Notification', notificationSchema);