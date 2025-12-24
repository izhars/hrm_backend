const admin = require("./firebase");
const User = require("../models/User");

const INVALID_TOKEN_ERRORS = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
  "messaging/invalid-argument",
]);

/**
 * Send push notification to a user
 * @param {string|ObjectId} userId
 * @param {{
 *   title: string,
 *   body: string,
 *   imageUrl?: string,
 *   data?: Record<string, any>
 * }} payload
 */
async function sendNotification(userId, payload) {
  console.log(`📤 Sending notification → User: ${userId}`);

  try {
    const user = await User.findById(userId).lean();
    if (!user) {
      console.log("❌ User not found");
      return;
    }

    const tokens = Array.isArray(user.fcmToken)
      ? user.fcmToken.filter(Boolean)
      : user.fcmToken
        ? [user.fcmToken]
        : [];

    if (tokens.length === 0) {
      console.log("⚠️ No FCM tokens found for user");
      return;
    }

    // ✅ DATA-ONLY MESSAGE (no notification field)
    const message = {
      tokens,
      data: {
        // Required fields for your Flutter app
        title: payload.title || 'Notification',
        body: payload.body || '',
        ...(payload.imageUrl && { imageUrl: payload.imageUrl }),
        
        // Additional custom data
        ...Object.fromEntries(
          Object.entries(payload.data || {}).map(([k, v]) => [k, String(v)])
        ),
      },

      android: {
        priority: "high",
        ttl: 60 * 60 * 1000, // 1 hour
      },

      apns: {
        headers: {
          "apns-priority": "10",
        },
        payload: {
          aps: {
            contentAvailable: true, // Wakes app in background
          },
        },
      },
    };

    console.log("📨 FCM Payload:", JSON.stringify(message, null, 2));

    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `✅ Notifications sent: ${response.successCount} | ❌ Failed: ${response.failureCount}`
    );

    if (response.failureCount > 0) {
      await cleanupInvalidTokens(tokens, response.responses, userId);
    }
  } catch (err) {
    console.error("🔥 sendNotification fatal error:", err);
  }
}

/**
 * Send push notification to many tokens across users (bulk)
 * @param {string[]} tokens - List of FCM tokens
 * @param {Object} payload - Notification payload (title, body, data, etc.)
 * @param {Map<string, ObjectId>} tokenToUserMap - Map from token → userId for cleanup
 */
async function sendBulkNotifications(tokens, payload, tokenToUserMap = new Map()) {
  if (!tokens || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokensCleaned: 0 };
  }

  console.log(`📤 Sending bulk notification to ${tokens.length} tokens...`);

  // Build multicast message (data-only)
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
      ttl: 60 * 60 * 1000, // 1 hour
    },
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: { contentAvailable: true },
      },
    },
  };

  try {
    const response = await admin.messaging().sendEachForMulticast(message);

    console.log(
      `✅ Bulk send: ${response.successCount} OK | ❌ ${response.failureCount} failed`
    );

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

/**
 * Clean up invalid tokens across multiple users
 * @param {string[]} invalidTokens
 * @param {Map<string, ObjectId>} tokenToUserMap
 */
async function cleanupInvalidTokensBulk(invalidTokens, tokenToUserMap) {
  // Group tokens by user ID
  const userTokensMap = new Map();

  for (const token of invalidTokens) {
    const userId = tokenToUserMap.get(token);
    if (userId) {
      if (!userTokensMap.has(userId)) userTokensMap.set(userId, []);
      userTokensMap.get(userId).push(token);
    }
  }

  let totalRemoved = 0;

  // Update each user in parallel
  const updatePromises = Array.from(userTokensMap.entries()).map(
    async ([userId, tokensToRemove]) => {
      const result = await User.findByIdAndUpdate(
        userId,
        { $pull: { fcmToken: { $in: tokensToRemove } } },
        { new: true }
      );
      console.log(`🗑️ User ${userId}: removed ${tokensToRemove.length} invalid tokens`);
      totalRemoved += tokensToRemove.length;
    }
  );

  await Promise.all(updatePromises);
  return totalRemoved;
}

async function cleanupInvalidTokens(tokens, responses, userId) {
  const invalidTokens = [];

  responses.forEach((res, idx) => {
    if (!res.success) {
      const code = res.error?.code;
      if (INVALID_TOKEN_ERRORS.has(code)) {
        invalidTokens.push(tokens[idx]);
        console.log(`🧹 Invalid token detected: ${tokens[idx]} (${code})`);
      }
    }
  });

  if (invalidTokens.length === 0) return;

  await User.findByIdAndUpdate(userId, {
    $pull: { fcmToken: { $in: invalidTokens } },
  });

  console.log(
    `🗑️ Removed ${invalidTokens.length} invalid FCM token(s) for user ${userId}`
  );
}

// Export both functions
module.exports = { 
  sendNotification,
  sendBulkNotifications  // Fixed: Added to exports
};