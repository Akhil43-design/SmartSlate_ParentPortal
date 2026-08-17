const express = require('express');
const path = require('path');
const cors = require('cors');

const authRoutes = require('../server/routes/auth');
const parentRoutes = require('../server/routes/parent');
const teacherRoutes = require('../server/routes/teacher');
const assignmentsRoutes = require('../server/routes/assignments');
const examsRoutes = require('../server/routes/exams');
const attendanceRoutes = require('../server/routes/attendance');
const chatRoutes = require('../server/routes/chat');
const notificationsRoutes = require('../server/routes/notifications');

const { requestLogger, errorLogger } = require('../server/middleware/logger');

const app = express();

app.use(cors());
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));

// API Routes for Parent & Teacher Portal (supporting both /api/ prefix and stripped routes)
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/parent', '/parent'], parentRoutes);
app.use(['/api/teacher', '/teacher'], teacherRoutes);
app.use(['/api/assignments', '/assignments'], assignmentsRoutes);
app.use(['/api/exams', '/exams'], examsRoutes);
app.use(['/api/attendance', '/attendance'], attendanceRoutes);
app.use(['/api/chat', '/chat'], chatRoutes);
app.use(['/api/notifications', '/notifications'], notificationsRoutes);

// Health check endpoint
app.get(['/api/health', '/health'], (req, res) => {
    res.json({ status: 'ok', app: 'SmartSlate Parent & Teacher Portal (Vercel)', version: '2.0.0' });
});

app.use(errorLogger);

module.exports = (req, res) => {
    return app(req, res);
};
