const admin = require("./firebase");
const User = require("../models/User");
const EmployeeInteraction = require("../models/EmployeeInteraction");

const INVALID_TOKEN_ERRORS = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument'
]);

/**
 * Unified notification sender
 */
async function sendNotification(userId, payload) {
  console.log("🔔 [sendNotification] START");
  console.log("👤 [sendNotification] User ID:", userId);
  console.log("📦 [sendNotification] Payload:", JSON.stringify(payload, null, 2));

  try {
    const user = await User.findById(userId).lean();

    if (!user) {
      console.warn(`⚠️ [sendNotification] User not found: ${userId}`);
      return { success: false, reason: "user_not_found" };
    }

    console.log("👤 [sendNotification] User found");

    // ===============================
    // 🔕 Notification preference checks
    // ===============================
    const settings = user.notificationSettings || {};

    // 1️⃣ Global master switch
    if (settings.enabled === false) {
      console.log(`🔕 [sendNotification] Notifications globally disabled for user ${userId}`);
      return { success: false, reason: "notifications_disabled" };
    }

    // 2️⃣ Type-based switches
    const type = payload?.data?.type;

    const typeToSettingMap = {
      incoming_call: "calls",
      call_accepted: "calls",
      call_declined: "calls",
      call_ended: "calls",
      call_missed: "calls",
      call_action_complete: "calls",
      message: "messages",
      employee_interaction: "employeeInteractions",
      schedule_update: "scheduleUpdates",
    };

    const settingKey = typeToSettingMap[type];

    if (settingKey && settings[settingKey] === false) {
      console.log(
        `🔕 [sendNotification] ${settingKey} notifications disabled for user ${userId} (type: ${type})`
      );
      return { success: false, reason: `${settingKey}_disabled` };
    }

    // ===============================
    // 📱 FCM token handling
    // ===============================
    const tokens = Array.isArray(user.fcmToken)
      ? user.fcmToken.filter(Boolean)
      : user.fcmToken
        ? [user.fcmToken]
        : [];

    console.log("📱 [sendNotification] FCM Tokens:", tokens);

    if (tokens.length === 0) {
      console.warn(`⚠️ [sendNotification] No FCM tokens for user ${userId}`);
      return { success: false, reason: "no_tokens" };
    }

    // ===============================
    // 🚀 Build FCM message
    // ===============================
    const flattenedData = {};
    if (payload.data) {
      Object.keys(payload.data).forEach(key => {
        const value = payload.data[key];
        flattenedData[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      });
    }

    const message = {
      tokens,
      notification: {
        title: payload.title || "Notification",
        body: payload.body || "",
        ...(payload.imageUrl && { image: payload.imageUrl }),
      },
      data: flattenedData,
      android: {
        priority: "high",
        ttl: 60 * 60 * 1000,
        notification: {
          sound: payload.data?.type === 'incoming_call' ? "ringtone" : "default",
          channelId: payload.data?.type === 'incoming_call' ? "staffsync_calls" : "staffsync_general",
        },
      },
      apns: {
        headers: {
          "apns-priority": payload.data?.type === 'incoming_call' ? "10" : "5",
          "apns-push-type": "alert",
        },
        payload: {
          aps: {
            alert: {
              title: payload.title,
              body: payload.body,
            },
            sound: payload.data?.type === 'incoming_call' ? "ringtone.aiff" : "default",
            badge: 1,
            contentAvailable: true,
            ...(payload.data?.type === 'incoming_call' && {
              category: "INCOMING_CALL",
              interruptionLevel: "time-sensitive"
            }),
          },
        },
      },
    };

    console.log("🚀 [sendNotification] Final FCM message:", JSON.stringify(message, null, 2));

    // ===============================
    // 📡 Send notification
    // ===============================
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log("📊 [sendNotification] FCM response:", {
      successCount: response.successCount,
      failureCount: response.failureCount,
    });

    // ===============================
    // 🧹 Cleanup invalid tokens
    // ===============================
    if (response.failureCount > 0) {
      console.warn("🧹 [sendNotification] Cleaning up invalid tokens");

      const invalidTokens = [];

      response.responses.forEach((res, index) => {
        if (
          !res.success &&
          res.error &&
          INVALID_TOKEN_ERRORS.has(res.error.code)
        ) {
          invalidTokens.push(tokens[index]);
        }
      });

      if (invalidTokens.length > 0) {
        await User.updateOne(
          { _id: userId },
          { $pull: { fcmToken: { $in: invalidTokens } } }
        );

        console.log(
          `🧹 [sendNotification] Removed ${invalidTokens.length} invalid tokens`
        );
      }
    }

    console.log("✅ [sendNotification] DONE");

    return {
      success: true,
      successCount: response.successCount,
      failureCount: response.failureCount,
      totalTokens: tokens.length,
    };
  } catch (err) {
    console.error("🔥 [sendNotification] ERROR:", err);
    throw err;
  }
}

/**
 * Send call notification with user identification
 */
async function sendCallNotification({
  callerId,
  receiverId,
  callId,
  roomId,
  callType = 'audio',
  notificationType, // 'incoming_call', 'call_accepted', 'call_declined', 'call_ended', 'call_missed'
  actionBy = null, // Who performed the action (null for incoming call)
  reason = '',
  metadata = {}
}) {
  try {
    if (callerId.toString() === receiverId.toString()) {
      return { success: false, reason: 'self_call' };
    }

    const caller = await User.findById(callerId).select('firstName lastName profilePicture notificationSettings');
    const receiver = await User.findById(receiverId).select('firstName lastName notificationSettings');

    if (!caller || !receiver) {
      throw new Error('User not found');
    }

    // Check notification preferences
    if (receiver.notificationSettings &&
      receiver.notificationSettings.calls === false) {
      console.log(`🔕 Call notifications disabled for user ${receiverId}`);
      return { success: false, reason: 'calls_disabled' };
    }

    const callerName = `${caller.firstName || ''} ${caller.lastName || ''}`.trim() || 'Unknown';
    const receiverName = `${receiver.firstName || ''} ${receiver.lastName || ''}`.trim() || 'User';

    let title, body;
    let sound = "default";
    let channel = "staffsync_general";

    switch (notificationType) {
      case 'incoming_call':
        title = `📞 Incoming ${callType === 'audio' ? 'Audio' : 'Video'} Call`;
        body = `${callerName} is calling you`;
        sound = "ringtone";
        channel = "staffsync_calls";
        break;
      case 'call_accepted':
        title = '✅ Call Accepted';
        body = `${receiverName} accepted your call`;
        break;
      case 'call_declined':
        title = '❌ Call Declined';
        body = `${callerName} declined your call`;
        break;
      case 'call_ended':
        title = '📞 Call Ended';
        body = reason || `${callerName} ended the call`;
        break;
      case 'call_missed':
        title = '⏰ Missed Call';
        body = `Missed call from ${callerName}`;
        break;
      default:
        title = '📞 Call Update';
        body = 'Call status updated';
    }

    const payload = {
      title,
      body,
      imageUrl: caller.profilePicture || null,
      data: {
        type: notificationType,
        callId,
        roomId,
        callerId: callerId.toString(),
        callerName,
        receiverId: receiverId.toString(),
        receiverName,
        callType,
        // Add action identification fields
        ...(actionBy && { actionBy: actionBy.toString() }),
        ...(notificationType === 'call_declined' && { declinedBy: actionBy?.toString() }),
        ...(notificationType === 'call_ended' && { endedBy: actionBy?.toString() }),
        ...(notificationType === 'call_missed' && { missedBy: actionBy?.toString() }),
        reason,
        metadata: JSON.stringify(metadata),
        timestamp: new Date().toISOString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      }
    };

    return await sendNotification(receiverId, payload);
  } catch (error) {
    console.error('🔥 Call notification error:', error);
    throw error;
  }
}

/**
 * Send employee interaction notification
 */
async function sendEmployeeInteractionNotification({
  senderId,
  receiverId,
  interactionType,
  message = '',
  metadata = {}
}) {
  try {
    if (senderId.toString() === receiverId.toString()) {
      return { success: false, reason: 'self_interaction' };
    }

    const sender = await User.findById(senderId).select('firstName lastName profilePicture notificationSettings');
    const receiver = await User.findById(receiverId).select('notificationSettings');

    if (!sender || !receiver) {
      throw new Error('User not found');
    }

    if (receiver.notificationSettings &&
      receiver.notificationSettings.employeeInteractions === false) {
      console.log(`🔕 Employee interaction notifications disabled for user ${receiverId}`);
      return { success: false, reason: 'employee_interactions_disabled' };
    }

    const senderName = `${sender.firstName || ''} ${sender.lastName || ''}`.trim() || 'Someone';

    let title, body;
    let action = 'VIEW_PROFILE';

    switch (interactionType) {
      case 'viewed_profile':
        title = '👀 Profile Viewed';
        body = `${senderName} viewed your profile`;
        action = 'VIEW_PROFILE';
        break;
      case 'viewed_contact':
        title = '📞 Contact Viewed';
        body = `${senderName} viewed your contact info`;
        action = 'VIEW_CONTACT';
        break;
      case 'messaged':
        title = '💬 New Message';
        body = message || `${senderName} sent you a message`;
        action = 'VIEW_MESSAGES';
        break;
      case 'shared_profile':
        title = '📤 Profile Shared';
        body = `${senderName} shared your profile`;
        action = 'VIEW_PROFILE';
        break;
      case 'saved_contact':
        title = '⭐ Contact Saved';
        body = `${senderName} saved your contact`;
        action = 'VIEW_CONTACT';
        break;
      case 'downloaded_resume':
        title = '📥 Resume Downloaded';
        body = `${senderName} downloaded your resume`;
        action = 'VIEW_RESUME';
        break;
      case 'started_call':
        title = '📞 Call Initiated';
        body = `${senderName} started a call with you`;
        action = 'VIEW_CALL';
        break;
      default:
        title = '📱 New Activity';
        body = `${senderName} interacted with your profile`;
        action = 'VIEW_PROFILE';
    }

    const payload = {
      title,
      body,
      imageUrl: sender.profilePicture || null,
      data: {
        type: 'employee_interaction',
        interactionType,
        senderId: senderId.toString(),
        senderName,
        receiverId: receiverId.toString(),
        action,
        metadata: JSON.stringify(metadata),
        timestamp: new Date().toISOString(),
        click_action: 'FLUTTER_NOTIFICATION_CLICK'
      }
    };

    return await sendNotification(receiverId, payload);
  } catch (error) {
    console.error('🔥 Employee interaction notification error:', error);
    throw error;
  }
}

async function sendBulkNotifications(tokens, payload, tokenToUserMap = new Map()) {
  if (!tokens || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokensCleaned: 0 };
  }

  const message = {
    tokens,
    data: {
      title: payload.title || 'Notification',
      body: payload.body || '',
      ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
      ...Object.fromEntries(
        Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
      ),
    },
    android: {
      priority: 'high',
      ttl: 60 * 60 * 1000,
      notification: {
        sound: payload.data?.type === 'incoming_call' ? "ringtone" : "default",
        channelId: payload.data?.type === 'incoming_call' ? "staffsync_calls" : "staffsync_general",
      },
    },
    apns: {
      headers: { 
        'apns-priority': payload.data?.type === 'incoming_call' ? '10' : '5',
        'apns-push-type': 'alert' 
      },
      payload: { 
        aps: { 
          contentAvailable: true,
          sound: payload.data?.type === 'incoming_call' ? "ringtone.aiff" : "default",
          ...(payload.data?.type === 'incoming_call' && {
            category: "INCOMING_CALL",
            interruptionLevel: "time-sensitive"
          }),
        } 
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    let invalidTokensCleaned = 0;

    if (response.failureCount > 0) {
      const invalidTokens = [];
      response.responses.forEach((res, idx) => {
        const token = tokens[idx];
        if (!res.success && INVALID_TOKEN_ERRORS.has(res.error?.code)) {
          invalidTokens.push(token);
        }
      });

      if (invalidTokens.length > 0) {
        invalidTokensCleaned = await cleanupInvalidTokensBulk(invalidTokens, tokenToUserMap);
      }
    }

    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
      invalidTokensCleaned,
    };
  } catch (err) {
    console.error('🔥 Bulk send error:', err);
    throw err;
  }
}

async function cleanupInvalidTokensBulk(invalidTokens, tokenToUserMap) {
  const userTokensMap = new Map();

  for (const token of invalidTokens) {
    const userId = tokenToUserMap.get(token);
    if (userId) {
      if (!userTokensMap.has(userId)) userTokensMap.set(userId, []);
      userTokensMap.get(userId).push(token);
    }
  }

  let totalRemoved = 0;

  const updatePromises = Array.from(userTokensMap.entries()).map(
    async ([userId, tokensToRemove]) => {
      const result = await User.findByIdAndUpdate(
        userId,
        { $pull: { fcmToken: { $in: tokensToRemove } } },
        { new: true }
      );
      totalRemoved += tokensToRemove.length;
      return result;
    }
  );

  await Promise.all(updatePromises);
  return totalRemoved;
}

async function logEmployeeInteraction({
  senderId,
  receiverId,
  interactionType,
  notificationSent = false,
  metadata = {}
}) {
  try {
    const interaction = await EmployeeInteraction.create({
      senderId,
      receiverId,
      interactionType,
      notificationSent,
      metadata
    });
    
    return interaction;
  } catch (error) {
    console.error('🔥 Error logging interaction:', error);
    throw error;
  }
}

/**
 * Get user's interactions
 */
async function getUserInteractions(userId, options = {}) {
  const {
    limit = 50,
    offset = 0,
    interactionType,
    startDate,
    endDate
  } = options;

  const query = {
    $or: [
      { senderId: userId },
      { receiverId: userId }
    ]
  };

  if (interactionType) {
    query.interactionType = interactionType;
  }

  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  const interactions = await EmployeeInteraction.find(query)
    .sort({ createdAt: -1 })
    .skip(parseInt(offset))
    .limit(parseInt(limit))
    .populate('senderId', 'firstName lastName profilePicture')
    .populate('receiverId', 'firstName lastName profilePicture')
    .lean();

  return interactions;
}

/**
 * Get interaction statistics
 */
async function getInteractionStats(userId) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const stats = await EmployeeInteraction.aggregate([
    {
      $match: {
        receiverId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: thirtyDaysAgo }
      }
    },
    {
      $group: {
        _id: '$interactionType',
        count: { $sum: 1 }
      }
    }
  ]);

  // Format the response
  const formattedStats = {};
  stats.forEach(stat => {
    formattedStats[stat._id] = stat.count;
  });

  return {
    last30Days: formattedStats,
    totalInteractions: await EmployeeInteraction.countDocuments({
      receiverId: userId
    })
  };
}

module.exports = {
  sendNotification,
  sendCallNotification, // Added new function
  sendBulkNotifications,
  sendEmployeeInteractionNotification,
  cleanupInvalidTokensBulk,
  logEmployeeInteraction,
  getUserInteractions,
  getInteractionStats
};