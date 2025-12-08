const User = require('../models/User');
const Message = require('../models/Message');
const mongoose = require('mongoose');
const moment = require('moment'); // <-- install: npm i moment

exports.getLastMessage = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { targetUserId } = req.params;

    console.log('📩 Last message request:', {
      currentUserId,
      targetUserId
    });

    // ✅ Validate IDs
    if (
      !mongoose.Types.ObjectId.isValid(currentUserId) ||
      !mongoose.Types.ObjectId.isValid(targetUserId)
    ) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format' });
    }

    const currentObjId = new mongoose.Types.ObjectId(currentUserId);
    const targetObjId = new mongoose.Types.ObjectId(targetUserId);

    // ✅ Check that target user exists
    const targetUser = await User.findById(targetObjId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    // ✅ Find the last message (latest by timestamp)
    const lastMessage = await Message.findOne({
      $or: [
        { from: currentObjId, to: targetObjId },
        { from: targetObjId, to: currentObjId }
      ]
    })
      .sort({ timestamp: -1 }) // latest message first
      .lean();

    if (!lastMessage) {
      return res.status(200).json({
        success: true,
        message: 'No messages yet',
        data: null
      });
    }

    // ✅ Format message based on who sent it
    let displayText = '';
    if (String(lastMessage.from) === String(currentUserId)) {
      const timeAgo = moment(lastMessage.timestamp).fromNow(true); // e.g. "43 minutes"
      displayText = `Sent ${timeAgo} ago`;
    } else {
      displayText = lastMessage.text;
    }

    res.status(200).json({
      success: true,
      data: {
        id: lastMessage._id,
        from: lastMessage.from,
        to: lastMessage.to,
        text: displayText, // 👈 formatted
        timestamp: lastMessage.timestamp,
        isRead: lastMessage.isRead,
        fromName: lastMessage.fromName,
        fromRole: lastMessage.fromRole
      }
    });
  } catch (error) {
    console.error('❌ Error fetching last message:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching last message',
      details: error.message
    });
  }
};


exports.getChatHistory = async (req, res) => {
  try {
    const currentUserId = req.user.id;
    const { targetUserId } = req.params;

    console.log('📜 Chat history request:', {
      currentUserId,
      targetUserId,
      currentUserType: typeof currentUserId,
      targetUserType: typeof targetUserId
    });

    // ✅ Validate both IDs
    if (
      !mongoose.Types.ObjectId.isValid(currentUserId) ||
      !mongoose.Types.ObjectId.isValid(targetUserId)
    ) {
      return res.status(400).json({ success: false, error: 'Invalid user ID format' });
    }

    // ✅ Convert both to ObjectId
    const currentObjId = new mongoose.Types.ObjectId(currentUserId);
    const targetObjId = new mongoose.Types.ObjectId(targetUserId);

    // ✅ Check that target user exists
    const targetUser = await User.findById(targetObjId);
    if (!targetUser) {
      return res.status(404).json({ success: false, error: 'Target user not found' });
    }

    // ✅ Query messages using ObjectId values
    const messages = await Message.find({
      $or: [
        { from: currentObjId, to: targetObjId },
        { from: targetObjId, to: currentObjId }
      ]
    })
      .sort({ timestamp: 1 })
      .limit(100)
      .lean();

    console.log(`✅ Found ${messages.length} messages`);

    res.status(200).json({
      success: true,
      count: messages.length,
      data: messages.map(msg => ({
        id: msg._id,
        from: msg.from,
        to: msg.to,
        text: msg.text,
        fromName: msg.fromName,
        fromRole: msg.fromRole,
        timestamp: msg.timestamp,
        isRead: msg.isRead
      }))
    });
  } catch (error) {
    console.error('❌ Get chat history error:', error);
    res.status(500).json({
      success: false,
      error: 'Server error fetching chat history',
      details: error.message
    });
  }
};


/**
 * Get list of currently active users
 */
exports.getActiveUsers = async (req, res) => {
  try {
    const { role } = req.user;
    const targetRole = role === 'hr' ? 'employee' : 'hr';

    const users = await User.find({
      role: targetRole,
      isActive: true
    }).select('name email role lastSeen');

    res.status(200).json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    console.error('❌ Error fetching active users:', error);
    res.status(500).json({ success: false, error: 'Server error', details: error.message });
  }
};
