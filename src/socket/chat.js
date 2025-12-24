// socket/chat.js
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const Message = require('../models/Message');
const User = require('../models/User');
const { uploadToCloudinary, uploadBase64ToCloudinary } = require('../middleware/upload');

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

        console.log('⚡ Socket connected');
        console.log('   👤 User:', { userId, name, role });
        console.log('   🔌 Socket ID:', socket.id);

        // 🔑 Join role room
        socket.join(role);
        console.log(`   🏠 Joined room: ${role}`);

        // Track active users
        if (!activeUsers.has(userId)) activeUsers.set(userId, new Set());
        activeUsers.get(userId).add(socket.id);
        socketToUser.set(socket.id, userId);

        console.log(
            `   📊 Active sockets for user ${userId}:`,
            activeUsers.get(userId).size
        );

        // Update last seen
        User.findByIdAndUpdate(userId, { lastSeen: new Date() }).catch(console.error);

        const opposite = role === 'hr' ? 'employee' : 'hr';

        // 🚀 Emit online ONLY on first connection
        if (activeUsers.get(userId).size === 1) {
            console.log(
                `📢 EMIT user-online → room: ${opposite}`,
                { id: userId, name, role }
            );

            io.to(opposite).emit('user-online', {
                id: userId,
                name,
                role,
            });
        } else {
            console.log(
                `⏩ Skipping user-online emit (already online)`
            );
        }

        // 📨 Handle message sending
        socket.on('send-message', async ({ toUserId, text, attachment, fileName, fileType, base64Data }) => {
            try {
                const sender = socket.user;
                let attachmentData = null;
                let result = null;

                /**
                 * ------------------------------------------
                 *  HANDLE ATTACHMENT (if exists)
                 * ------------------------------------------
                 */
                if (attachment || base64Data) {
                    try {
                        console.log("📤 Incoming attachment:", {
                            fileName,
                            fileType,
                            hasBase64: !!base64Data,
                            attachmentKeys: attachment ? Object.keys(attachment) : []
                        });

                        /**
                         * -----------------------------------------------------
                         * CASE 2: PRE-UPLOADED CLOUDINARY OBJECT
                         * -----------------------------------------------------
                         * Skip Cloudinary upload
                         */
                        if (
                            typeof attachment === 'object' &&
                            attachment.url &&
                            attachment.publicId &&
                            (attachment.filename || attachment.fileName || attachment.name)
                        ) {
                            console.log("📦 Pre-uploaded Cloudinary object → Skipped re-upload");

                            attachmentData = {
                                type: attachment.type || (attachment.mimeType?.startsWith('image/') ? 'image' : 'file'),
                                url: attachment.url,
                                filename: attachment.filename || attachment.fileName || attachment.name,
                                size: attachment.size || attachment.fileSize,
                                publicId: attachment.publicId,
                                mimeType: attachment.mimeType,
                                uploadedAt: new Date(),
                            };

                            if (attachment.dimensions || (attachment.width && attachment.height)) {
                                attachmentData.dimensions = {
                                    width: attachment.width || attachment.dimensions?.width,
                                    height: attachment.height || attachment.dimensions?.height,
                                };
                            }

                            console.log("✅ Using pre-uploaded attachment:", attachmentData);
                        }

                        /**
                         * ------------------------------
                         * CASE 1: BASE64 UPLOAD
                         * ------------------------------
                         */
                        else if (base64Data) {
                            console.log("☁️ Uploading BASE64 to Cloudinary...");

                            result = await uploadBase64ToCloudinary(base64Data, {
                                folder: 'chat_attachments',
                                resource_type: fileType?.startsWith('image/') ? 'image' : 'auto',
                            });

                            attachmentData = {
                                type: fileType?.startsWith('image/') ? 'image' : 'file',
                                url: result.url,
                                filename: fileName || `file_${Date.now()}`,
                                size: result.bytes,
                                publicId: result.publicId,
                                mimeType: fileType,
                                uploadedAt: new Date(),
                            };

                            if (result.width && result.height) {
                                attachmentData.dimensions = {
                                    width: result.width,
                                    height: result.height,
                                };
                            }
                        }

                        /**
                         * ------------------------------
                         * CASE 3: RAW BUFFER INPUTS
                         * ------------------------------
                         */
                        else {
                            let buffer;

                            if (Buffer.isBuffer(attachment)) {
                                console.log("📦 Direct Buffer received");
                                buffer = attachment;

                            } else if (attachment?.type === "Buffer" && attachment?.data) {
                                console.log("📦 {type:'Buffer', data:[]} received");
                                buffer = Buffer.from(attachment.data);

                            } else if (attachment?.buffer?.data) {
                                console.log("📦 Flutter .buffer.data array");
                                buffer = Buffer.from(attachment.buffer.data);

                            } else if (Array.isArray(attachment)) {
                                console.log("📦 Raw byte array");
                                buffer = Buffer.from(attachment);

                            } else if (attachment?.data && Array.isArray(attachment.data)) {
                                console.log("📦 Raw data array");
                                buffer = Buffer.from(attachment.data);

                            } else if (typeof attachment === 'string') {
                                console.log("📦 Base64 string detected");
                                const base64String = attachment.replace(/^data:\w+\/\w+;base64,/, '');
                                buffer = Buffer.from(base64String, 'base64');

                            } else {
                                console.log("❌ Unsupported attachment format:", attachment);
                                throw new Error("Unsupported attachment format");
                            }

                            console.log("☁️ Uploading BUFFER to Cloudinary... size:", buffer.length);

                            result = await uploadToCloudinary(buffer, {
                                folder: 'chat_attachments',
                                resource_type: fileType?.startsWith('image/') ? 'image' : 'auto',
                            });

                            attachmentData = {
                                type: fileType?.startsWith('image/') ? 'image' : 'file',
                                url: result.url,
                                filename: fileName || `file_${Date.now()}`,
                                size: result.bytes,
                                publicId: result.publicId,
                                mimeType: fileType,
                                uploadedAt: new Date(),
                            };

                            if (result.width && result.height) {
                                attachmentData.dimensions = {
                                    width: result.width,
                                    height: result.height,
                                };
                            }
                        }

                        console.log("✅ Final Attachment Data:", attachmentData);

                    } catch (upErr) {
                        console.error("❌ Upload failed:", upErr);
                        socket.emit("upload-error", {
                            message: "File upload failed",
                            error: upErr.message
                        });
                        return;
                    }
                }

                /**
                 * ------------------------------------------
                 * SAVE MESSAGE
                 * ------------------------------------------
                 */
                const message = new Message({
                    from: sender.id,
                    to: toUserId,
                    text: text || "",
                    fromName: `${sender.firstName} ${sender.lastName}`.trim(),
                    fromRole: sender.role,
                    attachment: attachmentData,
                    deliveredAt: new Date(),
                });

                await message.save();

                const payload = {
                    ...message.toObject(),
                    _id: message._id.toString(),
                    timestamp: message.timestamp.toISOString(),
                    deliveredAt: message.deliveredAt.toISOString(),
                    readAt: message.readAt ? message.readAt.toISOString() : null,
                };

                /**
                 * SEND TO RECEIVER
                 */
                const receiverSockets = activeUsers.get(toUserId);

                if (receiverSockets?.size) {
                    receiverSockets.forEach((sid) =>
                        io.to(sid).emit('receive-message', payload)
                    );

                    socket.emit("message-delivered", {
                        messageId: message._id.toString(),
                        deliveredAt: payload.deliveredAt,
                    });

                    console.log(`📨 Message delivered to user ${toUserId}`);
                } else {
                    console.log("📦 User offline → Message stored");
                }

                /**
                 * CONFIRM TO SENDER
                 */
                socket.emit("message-sent", payload);

                /**
                 * SELF MESSAGE → auto mark read
                 */
                if (toUserId === sender.id) {
                    message.readAt = new Date();
                    await message.save();

                    socket.emit("message-read", {
                        messageId: message._id.toString(),
                        readAt: message.readAt.toISOString(),
                    });
                }

            } catch (err) {
                console.error("💥 send-message FAILED:", err);
                socket.emit("error", {
                    message: "Message send failed",
                    error: err.message
                });
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
        // ▶️ Typing start
        socket.on('typing-start', ({ toUserId }) => {
            console.log('⌨️ typing-start received');
            console.log('   From socket:', socket.id);
            console.log('   From user:', socket.user?.id);
            console.log('   To user:', toUserId);

            const existing = typingUsers.get(socket.id);
            if (existing?.timeout) {
                console.log('   ⏹️ Clearing previous stop-typing timeout');
                clearTimeout(existing.timeout);
            }

            typingUsers.set(socket.id, { targetUserId: toUserId });

            const receiverSockets = activeUsers.get(toUserId);
            console.log(
                '   📡 Receiver sockets:',
                receiverSockets ? Array.from(receiverSockets) : 'NONE'
            );

            if (receiverSockets?.size) {
                receiverSockets.forEach((sid) => {
                    console.log(`   ➡️ Emitting user-typing to socket ${sid}`);
                    io.to(sid).emit('user-typing', {
                        fromUserId: socket.user.id,
                        name: `${socket.user.firstName} ${socket.user.lastName}`.trim(),
                    });
                });
            } else {
                console.log('   ⚠️ No active sockets for receiver');
            }
        });

        // ⏹️ Typing stop
        socket.on('typing-stop', ({ toUserId }) => {
            console.log('✋ typing-stop received');
            console.log('   From socket:', socket.id);
            console.log('   From user:', socket.user?.id);
            console.log('   To user:', toUserId);

            const existing = typingUsers.get(socket.id);

            if (!existing) {
                console.log('   ❌ No typing state found for this socket');
                return;
            }

            if (existing.targetUserId !== toUserId) {
                console.log(
                    '   ⚠️ Target mismatch:',
                    'expected',
                    existing.targetUserId,
                    'got',
                    toUserId
                );
                return;
            }

            console.log('   ⏳ Scheduling stop-typing emit in 1s');

            const timeout = setTimeout(() => {
                const receiverSockets = activeUsers.get(toUserId);
                console.log(
                    '   📡 Receiver sockets (stop):',
                    receiverSockets ? Array.from(receiverSockets) : 'NONE'
                );

                if (receiverSockets?.size) {
                    receiverSockets.forEach((sid) => {
                        console.log(`   ➡️ Emitting user-stopped-typing to socket ${sid}`);
                        io.to(sid).emit('user-stopped-typing', {
                            fromUserId: socket.user.id,
                        });
                    });
                } else {
                    console.log('   ⚠️ No active sockets for receiver (stop)');
                }

                typingUsers.delete(socket.id);
                console.log('   🧹 Typing state cleared for socket', socket.id);
            }, 1000);

            typingUsers.set(socket.id, { targetUserId: toUserId, timeout });
        });


        // 📜 Load chat history
        socket.on('load-history', async ({ targetUserId }) => {
            try {
                const currentUserId = socket.user.id;

                console.log(`📖 Loading chat history between ${currentUserId} and ${targetUserId}`);

                // Validate that targetUserId is different from current user
                if (currentUserId === targetUserId) {
                    console.log('⚠️ User trying to load chat with themselves');
                    return socket.emit('error', { message: 'Cannot load chat with yourself' });
                }

                // Find messages where either:
                // 1. current user sent to target user
                // 2. target user sent to current user
                const messages = await Message.find({
                    $or: [
                        { from: currentUserId, to: targetUserId },
                        { from: targetUserId, to: currentUserId },
                    ],
                })
                    .sort({ timestamp: 1 })
                    .lean();

                console.log(`✅ Found ${messages.length} messages for ${currentUserId} ↔ ${targetUserId}`);

                // Transform messages for client
                const formattedMessages = messages.map(message => ({
                    id: message._id.toString(),
                    text: message.text || '',
                    fromUserId: message.from.toString(),
                    timestamp: message.timestamp.toISOString(),
                    delivered: !!message.deliveredAt,
                    read: !!message.readAt,
                    attachment: message.attachment ? {
                        type: message.attachment.type,
                        url: message.attachment.url,
                        fileName: message.attachment.filename,
                        fileSize: message.attachment.size,
                        mimeType: message.attachment.mimeType,
                        publicId: message.attachment.publicId,
                    } : null,
                }));

                socket.emit('chat-history', formattedMessages);

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