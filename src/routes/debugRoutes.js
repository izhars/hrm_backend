const express = require('express');
const router = express.Router();
const { 
    debugUserConnection, 
    getConnectionStats,
    getOnlineUsers,
    isUserOnline 
} = require('../socket/chat');

// Get all connection statistics
router.get('/connections', async (req, res) => {
    try {
        const stats = getConnectionStats();
        res.json({
            success: true,
            ...stats
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Debug specific user connection
router.get('/connections/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const debugInfo = debugUserConnection(userId);
        
        res.json({
            success: true,
            ...debugInfo
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Get all online users
router.get('/online-users', async (req, res) => {
    try {
        const onlineUsers = getOnlineUsers();
        
        res.json({
            success: true,
            count: onlineUsers.length,
            users: onlineUsers,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Test if user is online
router.get('/online-status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const online = isUserOnline(userId);
        
        res.json({
            success: true,
            userId,
            isOnline: online,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;