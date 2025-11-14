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
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const cronJobs = require('./utils/cronJobs');

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
const comboOffRoutes = require('./routes/comboOffRoutes')
const faqRoutes = require('./routes/faqRoutes');
const helpRoutes = require('./routes/helpRoutes');
const ticketRoutes = require('./routes/ticketRoutes');
const aboutRoutes = require('./routes/aboutRoutes');

const { initChat } = require('./socket/chat');

const app = express();
const server = http.createServer(app);

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests, please try again later.',
});
app.use('/api/', limiter);

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

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
// Use routes
app.use('/api/faqs', faqRoutes);
app.use('/api/help-topics', helpRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/about', aboutRoutes);


app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HRMS API is running fine',
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Welcome to HRMS API with Real-Time Chat',
    version: '1.0.0',
    documentation: '/api/docs',
  });
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// ✅ Wait for MongoDB connection before starting cron + server
connectDB()
  .then(async () => {
    console.log('✅ MongoDB connected successfully');

    // Start cron jobs only after DB connection
    await cronJobs.startCronJobs();

    const io = initChat(server);
    server.listen(PORT, () => {
      console.log(`
Environment : ${process.env.NODE_ENV || 'development'}
Port        : ${PORT}
API         : http://localhost:${PORT}/api
Socket      : ws://localhost:${PORT}
`);
    });
  })
  .catch((err) => {
    console.error('❌ Failed to connect to MongoDB:', err);
    process.exit(1);
  });

// Graceful shutdown
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Rejection:', err.message);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM RECEIVED. Shutting down gracefully');
  process.exit(0);
});
