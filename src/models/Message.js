const mongoose = require('mongoose');

const attachmentSchema = new mongoose.Schema({
  type: { type: String, enum: ['image', 'file', 'video', 'audio'], required: true },
  url: String,
  filename: String,
  size: Number,
  publicId: String,
  thumbnailUrl: String,
  dimensions: {
    width: Number,
    height: Number
  }
}, { _id: false });

const reactionSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  emoji: { type: String, required: true }
}, { _id: false });

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, default: '' },

  fromName: { type: String, required: true },
  fromRole: { type: String, required: true },

  attachment: { type: attachmentSchema, default: null },

  reactions: { type: [reactionSchema], default: [] },

  timestamp: { type: Date, default: Date.now },
  deliveredAt: Date,
  readAt: Date
}, { timestamps: true });

module.exports = mongoose.model('Message', messageSchema);
