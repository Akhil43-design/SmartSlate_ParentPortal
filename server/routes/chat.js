const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// GET /api/chat/messages
router.get('/messages', authenticateToken, async (req, res) => {
    try {
        const { receiverId } = req.query;

        if (receiverId) {
            const messages = await all(
                `SELECT m.*, u.name as sender_name, u.role as sender_role
                 FROM messages m
                 JOIN users u ON m.sender_id = u.id
                 WHERE (m.sender_id = ? AND m.receiver_id = ?) OR (m.sender_id = ? AND m.receiver_id = ?)
                 ORDER BY m.sent_at ASC LIMIT 100`,
                [req.user.id, receiverId, receiverId, req.user.id]
            );
            return res.json({ messages });
        }

        res.json({ messages: [] });
    } catch (err) {
        console.error('Fetch chat messages error:', err);
        res.status(500).json({ error: 'Error fetching chat messages.' });
    }
});

// POST /api/chat/send - Send direct message
router.post('/send', authenticateToken, async (req, res) => {
    try {
        const { receiverId, content } = req.body;
        if (!receiverId || !content || !content.trim()) {
            return res.status(400).json({ error: 'receiverId and content are required.' });
        }

        const result = await run(
            "INSERT INTO messages (sender_id, receiver_id, content) VALUES (?, ?, ?)",
            [req.user.id, receiverId, content.trim()]
        );

        res.status(201).json({
            message: 'Message sent!',
            data: {
                id: result.id,
                sender_id: req.user.id,
                receiver_id: receiverId,
                content: content.trim(),
                sent_at: new Date().toISOString()
            }
        });
    } catch (err) {
        console.error('Send message error:', err);
        res.status(500).json({ error: 'Error sending message.' });
    }
});

module.exports = router;
