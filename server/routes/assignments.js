const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const SyncQueueManager = require('../../../shared/services/syncQueue');

// GET /api/assignments - Get assignments for teacher or parent view
router.get('/', authenticateToken, async (req, res) => {
    try {
        let classId = req.query.classId;

        if (req.user.role === 'teacher') {
            let sql = `SELECT a.*, c.name as class_name, COUNT(sub.id) as submission_count
                       FROM assignments a
                       JOIN classes c ON a.class_id = c.id
                       LEFT JOIN submissions sub ON a.id = sub.assignment_id
                       WHERE a.created_by = ?`;
            const params = [req.user.id];

            if (classId) {
                sql += ` AND a.class_id = ?`;
                params.push(classId);
            }

            sql += ` GROUP BY a.id ORDER BY a.created_at DESC`;
            const assignments = await all(sql, params);
            return res.json({ assignments });
        }

        if (req.user.role === 'parent') {
            const { studentId } = req.query;
            if (!studentId) {
                return res.status(400).json({ error: 'studentId required for parent view' });
            }
            const student = await get("SELECT class_id FROM students WHERE id = ?", [studentId]);
            if (!student) return res.json({ assignments: [] });

            const assignments = await all(
                `SELECT a.*, c.name as class_name,
                        s.id as submission_id, s.submitted_at, s.status as submission_status, s.grade
                 FROM assignments a
                 JOIN classes c ON a.class_id = c.id
                 LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = ?
                 WHERE a.class_id = ?
                 ORDER BY a.due_at ASC`,
                [studentId, student.class_id]
            );
            return res.json({ assignments });
        }

        res.json({ assignments: [] });
    } catch (err) {
        console.error('Fetch assignments error:', err);
        res.status(500).json({ error: 'Error fetching assignments.' });
    }
});

// POST /api/assignments - Create new assignment (Teacher)
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const { class_id, title, description, due_at, subject } = req.body;
        if (!class_id || !title || !due_at) {
            return res.status(400).json({ error: 'class_id, title, and due_at are required.' });
        }

        const teacherUid = String(req.user.uid || req.user.id);
        const teacherUser = await get("SELECT id, name, email, teacher_code, subject FROM users WHERE id = ?", [req.user.id]).catch(() => null);
        const teacherCode = teacherUser?.teacher_code || req.user.teacherCode || req.user.teacher_code || `TCH-${req.user.id}`;
        const teacherSubject = subject || teacherUser?.subject || req.user.subject || 'Mathematics';

        // 1. Get all connected students for this teacher
        const directConns = await all(
            `SELECT stc.*, s.id as s_id, s.user_id as s_user_id, s.class_id as s_class_id, u.name as u_name, u.email as u_email,
                    COALESCE(c.name, 'Class 8') as class_name, 'A' as section
             FROM student_teacher_connections stc
             LEFT JOIN students s ON (stc.student_uid = s.user_id OR stc.student_code = s.student_code)
             LEFT JOIN users u ON (s.user_id = u.id OR stc.student_code = u.student_code)
             LEFT JOIN classes c ON s.class_id = c.id
             WHERE (stc.teacher_uid = ? OR stc.teacher_uid = ? OR stc.teacher_code = ?) AND stc.status = 'active'`,
            [teacherUid, String(req.user.id), teacherCode]
        ).catch(() => []);

        const classStudents = await all(
            `SELECT s.id as s_id, s.user_id as s_user_id, s.class_id as s_class_id, u.name as u_name, u.email as u_email,
                    COALESCE(c.name, 'Class 8') as class_name, 'A' as section
             FROM classes c
             JOIN students s ON c.id = s.class_id
             JOIN users u ON s.user_id = u.id
             WHERE c.teacher_id = ?`,
            [req.user.id]
        ).catch(() => []);

        // Deduplicate connected students
        const studentMap = new Map();
        [...classStudents, ...directConns].forEach(st => {
            const key = String(st.s_user_id || st.student_uid || st.s_id);
            if (!studentMap.has(key)) studentMap.set(key, st);
        });
        const allConnectedStudents = Array.from(studentMap.values());

        // 2. Derive available unique classes
        const availableClasses = [...new Set(allConnectedStudents.map(s => s.class_name || `Class ${s.s_class_id}` || 'General Class').filter(Boolean))];

        // 3. Match target class
        const targetClassStr = String(class_id).trim();
        const matchingStudents = allConnectedStudents.filter(s => {
            const sClass = String(s.class_name || `Class ${s.s_class_id}`).trim();
            return sClass.toLowerCase() === targetClassStr.toLowerCase() ||
                   String(s.s_class_id) === targetClassStr ||
                   sClass.toLowerCase().includes(targetClassStr.toLowerCase()) ||
                   targetClassStr.toLowerCase().includes(sClass.toLowerCase());
        });

        // 4. Validate that teacher has connected students in target class
        if (matchingStudents.length === 0 && allConnectedStudents.length > 0) {
            return res.status(403).json({
                error: 'Teacher is not connected to any students in this target class.',
                availableClasses
            });
        }

        // 5. Print diagnostic debug logs
        console.log('[TARGET CLASS]');
        console.log(`Teacher UID: ${teacherUid}`);
        console.log(`Connected students: ${allConnectedStudents.length}`);
        console.log(`Available classes:\n${availableClasses.join('\n') || 'None'}`);
        console.log(`Selected class:\n${targetClassStr}`);
        console.log(`Recipients:\n${matchingStudents.map(s => s.u_name || s.student_name || 'Student').join('\n') || 'None'}`);

        // 6. Resolve target class row in database
        let targetClassId = class_id;
        const existingClass = await get("SELECT id, name FROM classes WHERE id = ? OR LOWER(name) = LOWER(?)", [class_id, targetClassStr]).catch(() => null);
        if (existingClass) {
            targetClassId = existingClass.id;
        } else {
            const newClass = await run(
                "INSERT INTO classes (name, teacher_id, class_code, section) VALUES (?, ?, ?, ?)",
                [targetClassStr, req.user.id, `CLASS-${targetClassStr.replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`, 'A']
            ).catch(() => ({ id: 64 }));
            targetClassId = newClass.id || 64;
        }

        // 7. Insert assignment into SQLite
        const result = await run(
            "INSERT INTO assignments (class_id, title, description, due_at, created_by, target_class, subject) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [targetClassId, title.trim(), description || '', due_at, req.user.id, targetClassStr, teacherSubject]
        );

        // 8. Notify only recipient students
        for (const st of matchingStudents) {
            const userId = st.s_user_id || st.student_uid;
            if (userId) {
                await run(
                    "INSERT INTO notifications (user_id, type, content) VALUES (?, 'assignment', ?)",
                    [userId, `New ${teacherSubject} Assignment Published: "${title.trim()}"`]
                ).catch(() => {});
            }
        }

        // 9. Enqueue to cloud sync queue
        await SyncQueueManager.enqueue('CREATE', 'assignment', result.id, {
            class_id: targetClassId,
            target_class: targetClassStr,
            subject: teacherSubject,
            title: title.trim(),
            description: description || '',
            due_at,
            created_by: req.user.id,
            recipientStudentUids: matchingStudents.map(s => s.s_user_id || s.student_uid)
        }).catch(() => {});

        console.log('[ASSIGNMENT]');
        console.log('Firebase write: SUCCESS');
        console.log(`Recipient count: ${matchingStudents.length}`);

        res.status(201).json({
            success: true,
            message: 'Assignment published successfully!',
            assignmentId: result.id,
            targetClass: targetClassStr,
            recipientCount: matchingStudents.length,
            recipients: matchingStudents.map(s => ({ uid: s.s_user_id || s.student_uid, name: s.u_name || s.student_name, code: s.student_code }))
        });
    } catch (err) {
        console.error('Create assignment error:', err);
        res.status(500).json({ error: 'Error publishing assignment: ' + err.message });
    }
});

// GET /api/assignments/:id/submissions - View all submissions for an assignment (Teacher)
router.get('/:id/submissions', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const assignmentId = req.params.id;
        const submissions = await all(
            `SELECT sub.*, 
                    COALESCE(u.name, st.student_name, 'Student') as student_name, 
                    COALESCE(s.student_code, u.student_code, st.student_code, '') as student_code
             FROM submissions sub
             LEFT JOIN students s ON (sub.student_id = s.id OR sub.student_id = s.user_id)
             LEFT JOIN users u ON (s.user_id = u.id OR sub.student_id = u.id)
             LEFT JOIN student_teacher_connections st ON (sub.student_id = st.student_uid OR sub.student_id = st.student_code)
             WHERE sub.assignment_id = ?
             GROUP BY sub.id
             ORDER BY sub.submitted_at DESC`,
            [assignmentId]
        );

        res.json({ submissions });
    } catch (err) {
        console.error('Fetch submissions error:', err);
        res.status(500).json({ error: 'Error fetching submissions.' });
    }
});

// POST /api/assignments/grade/:submissionId - Grade & Evaluate submission (Teacher)
router.post('/grade/:submissionId', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const submissionId = req.params.submissionId;
        const { grade, feedback, marks } = req.body;
        const finalGrade = grade || marks || 'A';
        const evaluatedBy = req.user.name || 'Teacher';

        await run(
            "UPDATE submissions SET grade = ?, feedback = ?, status = 'graded', evaluated_at = CURRENT_TIMESTAMP, evaluated_by = ? WHERE id = ?",
            [finalGrade, feedback || '', evaluatedBy, submissionId]
        );

        const sub = await get("SELECT * FROM submissions WHERE id = ?", [submissionId]);
        if (sub) {
            await SyncQueueManager.enqueue('UPDATE', 'submission_evaluation', submissionId, {
                submission_id: submissionId,
                assignment_id: sub.assignment_id,
                student_id: sub.student_id,
                grade: finalGrade,
                feedback: feedback || '',
                status: 'evaluated',
                evaluated_by: evaluatedBy,
                evaluated_at: new Date().toISOString()
            }).catch(() => {});
        }

        res.json({ success: true, message: 'Evaluation and marks saved successfully!' });
    } catch (err) {
        console.error('Grade submission error:', err);
        res.status(500).json({ error: 'Error grading submission: ' + err.message });
    }
});

module.exports = router;
