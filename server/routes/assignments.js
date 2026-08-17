const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const SyncQueueManager = require('../../shared/services/syncQueue');
const FirebaseCloudService = require('../services/firebaseAdmin');

// GET /api/assignments - Get assignments for teacher or parent view
router.get('/', authenticateToken, async (req, res) => {
    try {
        let classId = req.query.classId;

        if (req.user.role === 'teacher') {
            const teacherUid = String(req.user.uid || req.user.id);
            
            // 1. Get assignments from Firebase Cloud Firestore
            let cloudAssignments = [];
            try {
                cloudAssignments = await FirebaseCloudService.getTeacherAssignments(teacherUid);
            } catch (e) {}

            // 2. Get assignments from SQLite
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
            const sqliteAssignments = await all(sql, params).catch(() => []);

            const assignMap = new Map();
            cloudAssignments.forEach(a => {
                const id = String(a.id || a.assignmentId);
                assignMap.set(id, {
                    ...a,
                    id,
                    target_class: a.targetClass || a.target_class || 'Class 8',
                    class_name: a.className || a.targetClass || a.target_class || 'Class 8',
                    due_at: a.dueAt || a.due_at,
                    submission_count: a.submission_count || 0
                });
            });

            sqliteAssignments.forEach(a => {
                const id = String(a.id);
                if (!assignMap.has(id)) {
                    assignMap.set(id, a);
                }
            });

            return res.json({ assignments: Array.from(assignMap.values()) });
        }

        if (req.user.role === 'parent') {
            const { studentId } = req.query;
            if (!studentId) {
                return res.status(400).json({ error: 'studentId required for parent view' });
            }
            const student = await get("SELECT class_id FROM students WHERE id = ?", [studentId]).catch(() => null);
            const classId = student?.class_id || 1;

            const assignments = await all(
                `SELECT a.*, c.name as class_name,
                        s.id as submission_id, s.submitted_at, s.status as submission_status, s.grade
                 FROM assignments a
                 JOIN classes c ON a.class_id = c.id
                 LEFT JOIN submissions s ON a.id = s.assignment_id AND s.student_id = ?
                 WHERE a.class_id = ?
                 ORDER BY a.due_at ASC`,
                [studentId, classId]
            ).catch(() => []);
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
        const { class_id, target_class, targetClass, title, description, due_at, dueAt, subject } = req.body;
        const finalTitle = String(title || '').trim();
        const finalDueAt = String(due_at || dueAt || new Date().toISOString()).trim();
        const targetClassStr = String(target_class || targetClass || class_id || 'Class 8').trim();

        if (!finalTitle) {
            return res.status(400).json({ error: 'Title is required.' });
        }

        const teacherUid = String(req.user.uid || req.user.id);
        const teacherSubject = subject || req.user.subject || 'Mathematics';

        // 1. Get all connected students for this teacher from Cloud Firestore
        let allConnectedStudents = [];
        try {
            allConnectedStudents = await FirebaseCloudService.getTeacherStudents(teacherUid);
        } catch (e) {}

        if (!allConnectedStudents || allConnectedStudents.length === 0) {
            const directConns = await all(
                `SELECT stc.*, s.id as s_id, s.user_id as s_user_id, s.class_id as s_class_id, u.name as u_name, u.email as u_email,
                        COALESCE(c.name, 'Class 8') as class_name, 'A' as section
                 FROM student_teacher_connections stc
                 LEFT JOIN students s ON (stc.student_uid = s.user_id OR stc.student_code = s.student_code)
                 LEFT JOIN users u ON (s.user_id = u.id OR stc.student_code = u.student_code)
                 LEFT JOIN classes c ON s.class_id = c.id
                 WHERE (stc.teacher_uid = ? OR stc.teacher_uid = ?) AND stc.status = 'active'`,
                [teacherUid, String(req.user.id)]
            ).catch(() => []);

            allConnectedStudents = directConns.map(st => ({
                ...st,
                grade: (st.class_name || 'Class 8').trim(),
                name: st.u_name || st.student_name || 'Student',
                uid: st.s_user_id || st.student_uid || String(st.s_id)
            }));
        }

        const matchingStudents = (allConnectedStudents || []).filter(s => {
            const sClass = String(s.grade || s.class_name || s.class || '').trim();
            return !targetClassStr ||
                   sClass.toLowerCase() === targetClassStr.toLowerCase() ||
                   sClass.toLowerCase().includes(targetClassStr.toLowerCase()) ||
                   targetClassStr.toLowerCase().includes(sClass.toLowerCase());
        });

        const generatedAssignId = `assign_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;
        const recipientUids = (matchingStudents.length > 0 ? matchingStudents : allConnectedStudents).map(s => s.uid || s.student_uid || s.student_id);

        // 2. Publish to Cloud Firestore
        const cloudPayload = {
            id: generatedAssignId,
            assignmentId: generatedAssignId,
            title: finalTitle,
            description: description || '',
            subject: teacherSubject,
            target_class: targetClassStr,
            targetClass: targetClassStr,
            due_at: finalDueAt,
            dueAt: finalDueAt,
            created_by: teacherUid,
            teacherUid: teacherUid,
            recipientStudentUids: recipientUids
        };

        try {
            await FirebaseCloudService.createAssignment(cloudPayload);
        } catch (e) {
            console.warn('[ASSIGNMENT] Cloud creation error:', e.message);
        }

        // 3. Optional SQLite persist
        try {
            await run(
                "INSERT INTO assignments (class_id, title, description, due_at, created_by, target_class, subject) VALUES (?, ?, ?, ?, ?, ?, ?)",
                [class_id || 1, finalTitle, description || '', finalDueAt, req.user.id, targetClassStr, teacherSubject]
            ).catch(() => null);
        } catch (e) {}

        console.log(`[ASSIGNMENT CREATED] ID: ${generatedAssignId} | Title: "${finalTitle}" | Recipients: ${recipientUids.length}`);

        res.status(201).json({
            success: true,
            message: 'Assignment published successfully!',
            assignmentId: generatedAssignId,
            id: generatedAssignId,
            targetClass: targetClassStr,
            recipientCount: recipientUids.length,
            recipients: (matchingStudents.length > 0 ? matchingStudents : allConnectedStudents).map(s => ({ uid: s.uid, name: s.name, code: s.student_code || s.studentCode }))
        });
    } catch (err) {
        console.error('Create assignment error:', err);
        res.status(500).json({ error: 'Error creating assignment: ' + err.message });
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
