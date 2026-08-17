const express = require('express');
const path = require('path');
const cors = require('cors');

const { initDb } = require('../server/db/database');
const { seed } = require('../server/db/seed');

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

// API Routes for Parent & Teacher Portal
app.use('/api/auth', authRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationsRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'SmartSlate Parent & Teacher Portal (Vercel)', version: '1.0.0' });
});

app.use(errorLogger);

// Initialize DB on cold start
let dbInitialized = false;
async function ensureDb() {
    if (!dbInitialized) {
        await initDb();
        await seed();
        dbInitialized = true;
    }
}

module.exports = async (req, res) => {
    await ensureDb();
    return app(req, res);
};
