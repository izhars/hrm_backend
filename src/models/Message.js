// models/Message.js
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String },
  fromName: String,
  fromRole: String,
  timestamp: { type: Date, default: Date.now },
  // NEW FIELDS
  deliveredAt: { type: Date },
  readAt: { type: Date },
  attachment: {
    type: { type: String, enum: ['image', 'file'] },
    url: String,
    filename: String,
    size: Number
  },
  reactions: [{
    userId: String,
    emoji: String
  }]
});

module.exports = mongoose.model('Message', messageSchema);