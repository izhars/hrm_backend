// socket/chat.js
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const Message = require('../models/Message');
const User = require('../models/User');
const { uploadToCloudinary } = require('../middleware/upload');

// Maps for active users and typing states
const activeUsers = new Map(); // userId → Set(socketIds)
const socketToUser = new Map(); // socketId → userId
const typingUsers = new Map(); // socketId → { targetUserId, timeout }

let ioInstance = null;

const initChat = (server) => {
    const io = new Server(server, {
        cors: { origin: '*', methods: ['GET', 'POST'] },
    });
    ioInstance = io;

    // ✅ Authentication middleware
    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (!token) return next(new Error('Authentication error: No token provided'));

        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.id).select('firstName lastName role employeeId email');
            if (!user) return next(new Error('Authentication error: User not found'));

            socket.user = {
                id: user._id.toString(),
                firstName: user.firstName,
                lastName: user.lastName,
                role: user.role,
                employeeId: user.employeeId,
                email: user.email,
            };
            next();
        } catch (err) {
            console.error('❌ Socket auth error:', err.message);
            next(new Error('Authentication error'));
        }
    });

    io.on('connection', (socket) => {
        const { id, firstName, lastName, role } = socket.user;
        const name = `${firstName} ${lastName}`.trim();
        const userId = id.toString();

        console.log('⚡ Socket connected:', { userId, name, role, socketId: socket.id });

        // ✅ Add to active users map
        if (!activeUsers.has(userId)) activeUsers.set(userId, new Set());
        activeUsers.get(userId).add(socket.id);
        socketToUser.set(socket.id, userId);

        // ✅ Update last seen immediately
        User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(console.error);

        // ✅ Notify opposite role users that user is online
        const opposite = role === 'hr' ? 'employee' : 'hr';
        io.to(opposite).emit('user-online', { id: userId, name, role });

        // 📨 Handle message sending
        socket.on('send-message', async ({ toUserId, text, attachment }) => {
            try {
                const sender = socket.user;
                let attachmentData = null;

                if (attachment) {
                    const result = await uploadToCloudinary(attachment.buffer);
                    attachmentData = {
                        type: attachment.mimetype.startsWith('image/') ? 'image' : 'file',
                        url: result.secure_url,
                        filename: attachment.originalname,
                        size: attachment.size,
                    };
                }

                const message = new Message({
                    from: sender.id,
                    to: toUserId,
                    text,
                    fromName: `${sender.firstName} ${sender.lastName}`.trim(),
                    fromRole: sender.role,
                    attachment: attachmentData,
                    deliveredAt: new Date(),
                });
                await message.save();

                const payload = {
                    ...message.toObject(),
                    timestamp: message.timestamp.toISOString(),
                    deliveredAt: message.deliveredAt.toISOString(),
                    readAt: message.readAt ? message.readAt.toISOString() : null,
                };

                // ✅ Send to all receiver sockets (multi-device support)
                const receiverSockets = activeUsers.get(toUserId);
                if (receiverSockets?.size) {
                    receiverSockets.forEach((sid) => io.to(sid).emit('receive-message', payload));
                    socket.emit('message-delivered', { messageId: message._id.toString(), deliveredAt: payload.deliveredAt });
                    console.log(`Delivered to user ${toUserId}`);
                } else {
                    console.log(`Stored for offline user`);
                }

                socket.emit('message-sent', payload);
            } catch (err) {
                console.error('💥 Error sending message:', err);
                socket.emit('error', { message: 'Message send failed', error: err.message });
            }
        });

        // ✅ Mark as read
        socket.on('mark-as-read', async ({ messageId }) => {
            try {
                const message = await Message.findById(messageId);
                if (!message || message.to.toString() !== socket.user.id) return;

                if (!message.readAt) {
                    message.readAt = new Date();
                    await message.save();

                    const senderSockets = activeUsers.get(message.from.toString());
                    if (senderSockets?.size) {
                        senderSockets.forEach((sid) =>
                            io.to(sid).emit('message-read', {
                                messageId: message._id.toString(),
                                readAt: message.readAt.toISOString(),
                            })
                        );
                    }
                }
            } catch (err) {
                console.error('💥 Error marking message as read:', err);
            }
        });

        // ✍️ Typing start
        socket.on('typing-start', ({ toUserId }) => {
            clearTimeout(typingUsers.get(socket.id)?.timeout);
            typingUsers.set(socket.id, { targetUserId: toUserId });

            const receiverSockets = activeUsers.get(toUserId);
            if (receiverSockets?.size) {
                receiverSockets.forEach((sid) =>
                    io.to(sid).emit('user-typing', {
                        fromUserId: socket.user.id,
                        name: `${socket.user.firstName} ${socket.user.lastName}`.trim(),
                    })
                );
            }
        });

        // ⏹️ Typing stop
        socket.on('typing-stop', ({ toUserId }) => {
            const existing = typingUsers.get(socket.id);
            if (existing && existing.targetUserId === toUserId) {
                const timeout = setTimeout(() => {
                    const receiverSockets = activeUsers.get(toUserId);
                    if (receiverSockets?.size) {
                        receiverSockets.forEach((sid) =>
                            io.to(sid).emit('user-stopped-typing', { fromUserId: socket.user.id })
                        );
                    }
                    typingUsers.delete(socket.id);
                }, 1000);
                typingUsers.set(socket.id, { targetUserId: toUserId, timeout });
            }
        });

        // 📜 Load chat history
        socket.on('load-history', async ({ targetUserId }) => {
            try {
                console.log(`📖 Loading chat history between ${socket.user.id} and ${targetUserId}`);
                const messages = await Message.find({
                    $or: [
                        { from: socket.user.id, to: targetUserId },
                        { from: targetUserId, to: socket.user.id },
                    ],
                }).sort({ timestamp: 1 });

                socket.emit(
                    'chat-history',
                    messages.map((m) => ({
                        ...m.toObject(),
                        timestamp: m.timestamp.toISOString(),
                    }))
                );
            } catch (err) {
                console.error('💥 Error loading chat history:', err);
                socket.emit('error', { message: 'Failed to load chat history', error: err.message });
            }
        });

        // 🔍 Get active users
        socket.on('get-active-users', () => {
            const users = Array.from(activeUsers.entries()).map(([userId, sockets]) => ({
                userId,
                socketCount: sockets.size,
            }));
            socket.emit('active-users-list', users);
        });

        // ❌ Disconnect cleanup
        socket.on('disconnect', async () => {
            const userId = socketToUser.get(socket.id);
            socketToUser.delete(socket.id);

            const typingData = typingUsers.get(socket.id);
            if (typingData?.timeout) clearTimeout(typingData.timeout);
            typingUsers.delete(socket.id);

            if (userId && activeUsers.has(userId)) {
                const userSockets = activeUsers.get(userId);
                userSockets.delete(socket.id);

                if (userSockets.size === 0) {
                    activeUsers.delete(userId);
                    await User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(console.error);

                    const role = socket.user.role;
                    const opposite = role === 'hr' ? 'employee' : 'hr';
                    io.to(opposite).emit('user-offline', { id: userId });
                    console.log(`🔴 Disconnected: ${role} ${socket.user.firstName} ${socket.user.lastName}`);
                }
            }
        });
    });

    return io;
};

module.exports = {
    initChat,
    activeUsers: () => activeUsers,
    getIo: () => ioInstance,
};