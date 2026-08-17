const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/notes - Retrieve notes
router.get('/', authenticateToken, async (req, res) => {
    try {
        const studentId = req.query.student_id || req.user.id;
        const notes = await all(
            `SELECT * FROM notes WHERE student_id = ? OR user_id = ? ORDER BY updated_at DESC`,
            [studentId, studentId]
        ).catch(() => []);
        res.json({ success: true, notes });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching notes' });
    }
});

module.exports = router;
