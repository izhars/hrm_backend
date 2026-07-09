const User = require('../models/User');
const { sendBulkNotifications } = require('../firebase/notificationService'); // Fixed path
const moment = require('moment-timezone');

const testNotification = async () => {
    try {
        const users = await User.find({
            isActive: true,
            fcmToken: {
                $exists: true,
                $type: 'string',
                $ne: null,
                $ne: ''
            }
        }).select('_id name fcmToken');

        if (!users.length) {
            return { success: true, count: 0 };
        }

        // Flatten tokens + map back to user IDs for cleanup
        const tokenToUserMap = new Map();
        const allTokens = [];

        for (const user of users) {
            const tokens = Array.isArray(user.fcmToken)
                ? user.fcmToken.filter(t => t && typeof t === 'string')
                : user.fcmToken
                    ? [user.fcmToken]
                    : [];

            for (const token of tokens) {
                tokenToUserMap.set(token, user._id);
                allTokens.push(token);
            }
        }

        if (allTokens.length === 0) {
            return { success: true, count: 0 };
        }

        const firedAt = moment().tz('Asia/Kolkata');
        const payload = {
            title: '🧪 Test Notification',
            body: `Cron fired at ${firedAt.format('hh:mm A')} IST`,
            data: {
                type: 'test_notification',
                source: 'cron',
                env: process.env.NODE_ENV || 'development',
                firedAt: firedAt.toISOString(),
            },
        };
        // ✅ Send ALL tokens in optimized batches (up to 500 per call)
        const result = await sendBulkNotifications(allTokens, payload, tokenToUserMap);
        return {
            success: true,
            count: result.successCount,
            failed: result.failureCount,
            invalidTokensCleaned: result.invalidTokensCleaned
        };
    } catch (error) {
        console.error('💥 testNotification crashed:', error);
        return { success: false, error: error.message };
    }
};

module.exports = testNotification;