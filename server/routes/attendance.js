const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');

// GET /api/attendance - Fetch attendance records
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { classId, studentId, date } = req.query;

        if (req.user.role === 'teacher') {
            if (!classId) return res.status(400).json({ error: 'classId is required.' });
            let sql = `SELECT a.*, u.name as student_name, s.student_code
                       FROM attendance a
                       JOIN students s ON a.student_id = s.id
                       JOIN users u ON s.user_id = u.id
                       WHERE a.class_id = ?`;
            const params = [classId];

            if (date) {
                sql += ` AND a.date = ?`;
                params.push(date);
            }

            sql += ` ORDER BY u.name ASC`;
            const attendance = await all(sql, params);
            return res.json({ attendance });
        }

        if (req.user.role === 'parent') {
            if (!studentId) return res.status(400).json({ error: 'studentId is required.' });
            const attendance = await all(
                "SELECT * FROM attendance WHERE student_id = ? ORDER BY date DESC",
                [studentId]
            );
            return res.json({ attendance });
        }

        res.json({ attendance: [] });
    } catch (err) {
        console.error('Fetch attendance error:', err);
        res.status(500).json({ error: 'Error fetching attendance.' });
    }
});

// POST /api/attendance/mark - Mark attendance (Teacher)
router.post('/mark', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { class_id, student_id, date, status } = req.body;
        if (!class_id || !student_id || !date || !status) {
            return res.status(400).json({ error: 'class_id, student_id, date, and status are required.' });
        }

        await run(
            `INSERT INTO attendance (class_id, student_id, date, status)
             VALUES (?, ?, ?, ?)
             ON CONFLICT(class_id, student_id, date) DO UPDATE SET status = excluded.status`,
            [class_id, student_id, date, status]
        );

        res.json({ message: 'Attendance recorded successfully!' });
    } catch (err) {
        console.error('Mark attendance error:', err);
        res.status(500).json({ error: 'Error marking attendance.' });
    }
});

module.exports = router;
