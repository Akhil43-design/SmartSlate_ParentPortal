const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');

const { initDb } = require('./db/database');
const { seed } = require('./db/seed');

const authRoutes = require('./routes/auth');
const parentRoutes = require('./routes/parent');
const teacherRoutes = require('./routes/teacher');
const assignmentsRoutes = require('./routes/assignments');
const examsRoutes = require('./routes/exams');
const attendanceRoutes = require('./routes/attendance');
const chatRoutes = require('./routes/chat');
const notificationsRoutes = require('./routes/notifications');

const { requestLogger, errorLogger } = require('./middleware/logger');

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(requestLogger);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const publicPath = path.join(__dirname, '../public');
app.use(express.static(publicPath));
app.use('/shared', express.static(path.join(__dirname, '../public/shared')));

const localParentRoutes = require('../backend/routes/local-parent');
const localTeacherRoutes = require('../backend/routes/local-teacher');
app.use('/api/local/parent', localParentRoutes);
app.use('/api/local/teacher', localTeacherRoutes);

const notesRoutes = require('./routes/notes');

app.use('/api/auth', authRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/assignments', assignmentsRoutes);
app.use('/api/exams', examsRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/debug', require('../shared/routes/debugStudent'));

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', app: 'SmartSlate-Parent-Teacher', version: '1.0.0', uptime: process.uptime() });
});

app.use(errorLogger);

app.get('*', (req, res) => {
    if (req.path.startsWith('/api')) {
        return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(publicPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;

async function startServer() {
    try {
        await initDb();
        await seed();

        server.listen(PORT, () => {
            console.log(`=======================================================`);
            console.log(`👨‍👩‍👧‍👦 SmartSlate Parent & Teacher Portal running on http://localhost:${PORT}`);
            console.log(`☁️ Vercel Ready Build`);
            console.log(`=======================================================`);
        });
    } catch (err) {
        console.error('Fatal error starting Parent & Teacher server:', err);
        process.exit(1);
    }
}

if (require.main === module) {
    startServer();
}

module.exports = app;
