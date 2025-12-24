require('dotenv').config();
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const cronJobs = require('./utils/cronJobs');
const emailService = require('./utils/emailService');

const authRoutes = require('./routes/authRoutes');
const employeeRoutes = require('./routes/employeeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const leaveRoutes = require('./routes/leaveRoutes');
const payrollRoutes = require('./routes/payrollRoutes');
const departmentRoutes = require('./routes/departmentRoutes');
const announcementRoutes = require('./routes/announcementRoutes');
const assetRoutes = require('./routes/assetRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const holidayRoutes = require('./routes/holidayRoutes');
const celebrationRoutes = require('./routes/celebrationRoutes');
const chatRoutes = require('./routes/chat');
const feedbackRoutes = require('./routes/feedbackRoutes');
const pollRoutes = require('./routes/pollRoutes');
const awardRoutes = require('./routes/awardRoutes');
const badgeRoutes = require('./routes/badgeRoutes');
const notificationRoutes = require('./routes/notificationRoutes');
const cronTestRoutes = require('./routes/cronTestRoutes');
const comboOffRoutes = require('./routes/comboOffRoutes');
const faqRoutes = require('./routes/faqRoutes');
const helpRoutes = require('./routes/helpRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const aboutRoutes = require('./routes/aboutRoutes');
const emailRoutes = require('./routes/emailRoutes');
const createSuperAdmin = require('./seedAdmin');
const uploadRoutes = require('./routes/uploadRoutes');
const taskRoutes = require('./routes/taskRoutes');
const { initChat } = require('./socket/chat');
const systemRoutes = require('./routes/systemRoutes');


const app = express();
const server = http.createServer(app);

// Security & Middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "form-action": ["'self'"],
        "script-src": ["'self'", "'unsafe-inline'"],
      },
    },
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (for CSS, JS, images)
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Password Reset Page Route (before API routes)
app.get('/reset-password/:token', (req, res) => {
  res.sendFile(path.join(__dirname, 'email', 'reset-password.html'));
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/payroll', payrollRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/announcements', announcementRoutes);
app.use('/api/assets', assetRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/celebrations', celebrationRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/feedbacks', feedbackRoutes);
app.use('/api/polls', pollRoutes);
app.use('/api/awards', awardRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/cron', cronTestRoutes);
app.use('/api/combooff', comboOffRoutes);
app.use('/api/faqs', faqRoutes);
app.use('/api/help-topics', helpRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/about', aboutRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/system', systemRoutes);


// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// Start Server after MongoDB connection
connectDB()
  .then(async () => {
    console.log('✅ MongoDB connected successfully');

    // Initialize services
    await cronJobs.startCronJobs();
    await createSuperAdmin();

    // Verify email service
    try {
      await emailService.verifyEmailConfig();
      console.log('✅ Email service initialized successfully');
    } catch (error) {
      console.error('❌ Email service initialization failed:', error.message);
      console.warn('⚠️  Server will continue but emails may not work');
      console.warn('⚠️  Please check your .env email configuration');
    }

    // Initialize Socket.IO
    const io = initChat(server);

    // Start server
    server.listen(PORT, () => {
      console.log(`
╔═══════════════════════════════════════════════════════════════╗
║                   HRMS Server Started                         ║
╠═══════════════════════════════════════════════════════════════╣
║ Environment : ${process.env.NODE_ENV || 'development'}        ║
║ Port        : ${PORT}                                         ║
║ API         : http://localhost:${PORT}/api                    ║
║ Socket      : ws://localhost:${PORT}                          ║
║ Reset Page  : http://localhost:${PORT}/reset-password/:token  ║
║ Email       : ${process.env.EMAIL_HOST || 'Not Configured'}   ║
╚═══════════════════════════════════════════════════════════════╝
`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});