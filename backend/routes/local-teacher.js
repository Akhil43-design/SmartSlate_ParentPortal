const express = require('express');
const router = express.Router();
const db = require('../database/sqlite-teacher');

// GET /api/local/teacher/health
router.get('/health', async (req, res) => {
    try {
        res.json({
            database: 'sqlite',
            application: 'smartslate-teacher',
            status: 'ok',
            offlineReady: true,
            dbFile: db.dbPath
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/local/teacher/profile?uid=<firebase_uid>
router.get('/profile', async (req, res) => {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'firebase_uid is required' });
    try {
        const profile = await db.get('SELECT * FROM teacher_profiles WHERE firebase_uid = ?', [uid]);
        res.json({ profile: profile || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/local/teacher/profile
router.post('/profile', async (req, res) => {
    const { firebase_uid, name, email, subjects, classes } = req.body;
    if (!firebase_uid) return res.status(400).json({ error: 'firebase_uid is required' });

    try {
        await db.run(
            `INSERT INTO users (firebase_uid, email, role) VALUES (?, ?, 'teacher')
             ON CONFLICT(firebase_uid) DO UPDATE SET email = excluded.email, updated_at = CURRENT_TIMESTAMP`,
            [firebase_uid, email || '']
        );

        await db.run(
            `INSERT INTO teacher_profiles (firebase_uid, name, email, subjects, classes)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(firebase_uid) DO UPDATE SET
             name = excluded.name,
             email = excluded.email,
             subjects = excluded.subjects,
             classes = excluded.classes,
             updated_at = CURRENT_TIMESTAMP`,
            [firebase_uid, name || 'Teacher', email || '', subjects || '', classes || '']
        );

        console.log(`[SQLite Teacher] Profile saved for UID: ${firebase_uid}`);
        res.json({ success: true, firebase_uid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/local/teacher/students?uid=<teacher_uid>
router.get('/students', async (req, res) => {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'teacher_uid is required' });
    try {
        const students = await db.all('SELECT * FROM students WHERE teacher_uid = ?', [uid]);
        res.json({ students });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
