const express = require('express');
const router = express.Router();
const { all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/notifications
router.get('/', authenticateToken, async (req, res) => {
    try {
        const notifications = await all(
            "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
            [req.user.id]
        );
        res.json({ notifications });
    } catch (err) {
        console.error('Fetch notifications error:', err);
        res.status(500).json({ error: 'Error fetching notifications.' });
    }
});

// POST /api/notifications/read-all
router.post('/read-all', authenticateToken, async (req, res) => {
    try {
        await run("UPDATE notifications SET is_read = 1 WHERE user_id = ?", [req.user.id]);
        res.json({ message: 'All notifications marked as read.' });
    } catch (err) {
        console.error('Mark read notifications error:', err);
        res.status(500).json({ error: 'Error updating notifications.' });
    }
});

module.exports = router;
