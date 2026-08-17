const express = require('express');
const router = express.Router();
const db = require('../database/sqlite-parent');

// GET /api/local/parent/health
router.get('/health', async (req, res) => {
    try {
        res.json({
            database: 'sqlite',
            application: 'smartslate-parent',
            status: 'ok',
            offlineReady: true,
            dbFile: db.dbPath
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/local/parent/profile?uid=<firebase_uid>
router.get('/profile', async (req, res) => {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'firebase_uid is required' });
    try {
        const profile = await db.get('SELECT * FROM parent_profiles WHERE firebase_uid = ?', [uid]);
        res.json({ profile: profile || null });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/local/parent/profile
router.post('/profile', async (req, res) => {
    const { firebase_uid, name, email, phone } = req.body;
    if (!firebase_uid) return res.status(400).json({ error: 'firebase_uid is required' });

    try {
        await db.run(
            `INSERT INTO users (firebase_uid, email, role) VALUES (?, ?, 'parent')
             ON CONFLICT(firebase_uid) DO UPDATE SET email = excluded.email, updated_at = CURRENT_TIMESTAMP`,
            [firebase_uid, email || '']
        );

        await db.run(
            `INSERT INTO parent_profiles (firebase_uid, name, email, phone)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(firebase_uid) DO UPDATE SET
             name = excluded.name,
             email = excluded.email,
             phone = excluded.phone,
             updated_at = CURRENT_TIMESTAMP`,
            [firebase_uid, name || 'Parent', email || '', phone || '']
        );

        console.log(`[SQLite Parent] Profile saved for UID: ${firebase_uid}`);
        res.json({ success: true, firebase_uid });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/local/parent/children?uid=<parent_uid>
router.get('/children', async (req, res) => {
    const { uid } = req.query;
    if (!uid) return res.status(400).json({ error: 'parent_uid is required' });
    try {
        const children = await db.all('SELECT * FROM student_connections WHERE parent_uid = ?', [uid]);
        res.json({ children });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
