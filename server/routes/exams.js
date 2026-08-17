const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const SyncQueueManager = require('../../shared/services/syncQueue');

// GET /api/exams - Teacher / Parent exams list
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const exams = await all(
                `SELECT e.*, 
                        COALESCE(e.target_class, c.name, 'Class 8') as class_name,
                        (SELECT COUNT(*) FROM exam_submissions es WHERE es.exam_id = e.id) as submissions_count,
                        (SELECT COUNT(*) FROM exam_submissions es WHERE es.exam_id = e.id AND es.status = 'in_progress') as active_count,
                        (SELECT COALESCE(SUM(violation_count), 0) FROM exam_submissions es WHERE es.exam_id = e.id) as violations_count
                 FROM exams e
                 LEFT JOIN classes c ON e.class_id = c.id
                 WHERE e.created_by = ? OR e.created_by = ?
                 GROUP BY e.id
                 ORDER BY e.created_at DESC`,
                [req.user.id, req.user.uid || req.user.id]
            ).catch(() => []);

            const formattedExams = exams.map(e => {
                let questions = [];
                try { questions = JSON.parse(e.questions_json || '[]'); } catch(err) {}
                let totalMarks = questions.reduce((sum, q) => sum + (parseFloat(q.marks) || 1), 0);
                if (totalMarks === 0) totalMarks = 100;

                return {
                    ...e,
                    questions_count: questions.length,
                    total_marks: totalMarks,
                    exam_type: e.exam_type || 'written'
                };
            });

            return res.json({ exams: formattedExams });
        }

        if (req.user.role === 'parent') {
            const { studentId } = req.query;
            if (!studentId) return res.status(400).json({ error: 'studentId is required' });

            const student = await get("SELECT class_id FROM students WHERE id = ? OR user_id = ?", [studentId, studentId]);
            if (!student) return res.json({ exams: [] });

            const exams = await all(
                `SELECT e.id, e.title, e.subject, e.exam_type, e.duration_minutes, e.start_date, e.start_time, e.end_date, e.end_time,
                        es.score, es.total_marks, es.status, es.submitted_at, es.evaluated_at, es.feedback
                 FROM exams e
                 LEFT JOIN exam_submissions es ON e.id = es.exam_id AND (es.student_id = ? OR es.student_uid = ?)
                 WHERE e.class_id = ? OR e.target_class = (SELECT name FROM classes WHERE id = ?)
                 ORDER BY e.created_at DESC`,
                [studentId, studentId, student.class_id, student.class_id]
            ).catch(() => []);
            return res.json({ exams });
        }

        res.json({ exams: [] });
    } catch (err) {
        console.error('Fetch exams error:', err);
        res.status(500).json({ error: 'Error fetching exams.' });
    }
});

// POST /api/exams - Create new exam (Teacher)
router.post('/', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const {
            class_id,
            target_class,
            targetClass,
            target_section,
            targetSection,
            education_level,
            educationLevel,
            title,
            questions,
            duration_minutes,
            subject,
            exam_type,
            start_date,
            start_time,
            end_date,
            end_time
        } = req.body;

        const targetClassStr = String(target_class || targetClass || class_id || '').trim();
        const targetSectionStr = String(target_section || targetSection || 'All').trim();
        const educationLevelStr = String(education_level || educationLevel || '').trim();

        if (!targetClassStr || !title || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Target Class, Exam Title, and at least one Question are required.' });
        }

        const teacherUid = String(req.user.uid || req.user.id);
        const teacherUser = await get("SELECT id, name, email, teacher_code, subject FROM users WHERE id = ?", [req.user.id]).catch(() => null);
        const teacherCode = teacherUser?.teacher_code || req.user.teacherCode || req.user.teacher_code || `TCH-${req.user.id}`;
        const teacherSubject = subject || teacherUser?.subject || req.user.subject || 'Mathematics';
        const finalExamType = exam_type === 'mcq' ? 'mcq' : 'written';

        // 1. Get all connected students for this teacher
        const directConns = await all(
            `SELECT stc.*, s.id as s_id, s.user_id as s_user_id, s.firebase_uid as s_firebase_uid, s.class_id as s_class_id,
                    s.grade as s_grade, s.class_name as s_class_name, s.section as s_section, s.education_level as s_education_level,
                    u.name as u_name, u.email as u_email,
                    COALESCE(s.grade, s.class_name, c.name, 'Grade 8') as resolved_grade,
                    COALESCE(s.section, c.section, 'A') as resolved_section,
                    COALESCE(s.education_level, 'High School') as resolved_education_level
             FROM student_teacher_connections stc
             LEFT JOIN students s ON (stc.student_uid = s.user_id OR stc.student_code = s.student_code OR stc.student_uid = s.firebase_uid)
             LEFT JOIN users u ON (s.user_id = u.id OR stc.student_code = u.student_code)
             LEFT JOIN classes c ON s.class_id = c.id
             WHERE (stc.teacher_uid = ? OR stc.teacher_uid = ? OR stc.teacher_code = ?) AND stc.status = 'active'`,
            [teacherUid, String(req.user.id), teacherCode]
        ).catch(() => []);

        const classStudents = await all(
            `SELECT s.id as s_id, s.user_id as s_user_id, s.firebase_uid as s_firebase_uid, s.class_id as s_class_id,
                    s.grade as s_grade, s.class_name as s_class_name, s.section as s_section, s.education_level as s_education_level,
                    u.name as u_name, u.email as u_email,
                    COALESCE(s.grade, s.class_name, c.name, 'Grade 8') as resolved_grade,
                    COALESCE(s.section, c.section, 'A') as resolved_section,
                    COALESCE(s.education_level, 'High School') as resolved_education_level
             FROM classes c
             JOIN students s ON c.id = s.class_id
             JOIN users u ON s.user_id = u.id
             WHERE c.teacher_id = ?`,
            [req.user.id]
        ).catch(() => []);

        // Deduplicate connected students
        const studentMap = new Map();
        [...classStudents, ...directConns].forEach(st => {
            const key = String(st.s_firebase_uid || st.s_user_id || st.student_uid || st.s_id);
            if (!studentMap.has(key)) {
                studentMap.set(key, {
                    ...st,
                    grade: (st.s_grade || st.resolved_grade || st.class_name || 'Grade 8').trim(),
                    section: (st.s_section || st.resolved_section || 'A').trim().toUpperCase(),
                    educationLevel: (st.s_education_level || st.resolved_education_level || 'High School').trim(),
                    name: st.u_name || st.student_name || 'Student',
                    uid: st.s_firebase_uid || st.s_user_id || st.student_uid || String(st.s_id)
                });
            }
        });
        const allConnectedStudents = Array.from(studentMap.values());

        // 2. Derive available unique classes
        const availableClasses = [...new Set(allConnectedStudents.map(s => s.grade).filter(Boolean))];

        // 3. Match target class and section
        const matchingStudents = allConnectedStudents.filter(s => {
            const sGrade = String(s.grade || s.class_name || '').trim();
            const sSection = String(s.section || 'A').trim().toUpperCase();
            const sEdu = String(s.educationLevel || '').trim();

            const classMatch = sGrade.toLowerCase() === targetClassStr.toLowerCase() ||
                               sGrade.replace(/[^a-z0-9]/gi, '').toLowerCase() === targetClassStr.replace(/[^a-z0-9]/gi, '').toLowerCase() ||
                               sGrade.toLowerCase().includes(targetClassStr.toLowerCase()) ||
                               targetClassStr.toLowerCase().includes(sGrade.toLowerCase());

            const sectionMatch = targetSectionStr.toUpperCase() === 'ALL' ||
                                 !targetSectionStr ||
                                 sSection === targetSectionStr.toUpperCase();

            const eduMatch = !educationLevelStr || !sEdu || (sEdu.toLowerCase() === educationLevelStr.toLowerCase());

            return classMatch && sectionMatch && eduMatch;
        });

        // 4. Validate that teacher has connected students in target class
        if (matchingStudents.length === 0 && allConnectedStudents.length > 0) {
            return res.status(403).json({
                error: `Teacher is not connected to any students in ${targetClassStr} (Section: ${targetSectionStr}).`,
                availableClasses
            });
        }

        // 5. Build secure question list and secret answer key
        const answerKey = {};
        const sanitizedQuestions = questions.map((q, idx) => {
            const qId = q.id || `q_${idx + 1}`;
            if (finalExamType === 'mcq' && q.correct) {
                answerKey[qId] = String(q.correct).trim().toUpperCase();
            }
            return {
                id: qId,
                type: finalExamType,
                question: q.question || '',
                options: q.options || (finalExamType === 'mcq' ? { A: '', B: '', C: '', D: '' } : null),
                marks: parseFloat(q.marks) || (finalExamType === 'mcq' ? 1 : 10)
            };
        });

        // 6. Resolve dates and times
        const todayStr = new Date().toISOString().split('T')[0];
        const startDate = start_date || todayStr;
        const startTime = start_time || '09:00';
        const endDate = end_date || startDate;
        const endTime = end_time || '23:59';
        const durationMins = parseInt(duration_minutes, 10) || 60;

        // 7. Resolve target class row in database
        let targetClassId = class_id;
        const existingClass = await get("SELECT id, name FROM classes WHERE id = ? OR LOWER(name) = LOWER(?)", [class_id, targetClassStr]).catch(() => null);
        if (existingClass) {
            targetClassId = existingClass.id;
        } else {
            const newClass = await run(
                "INSERT INTO classes (name, teacher_id, class_code, section) VALUES (?, ?, ?, ?)",
                [targetClassStr, req.user.id, `CLASS-${targetClassStr.replace(/\s+/g, '')}-${Date.now().toString().slice(-4)}`, targetSectionStr]
            ).catch(() => ({ id: 64 }));
            targetClassId = newClass.id || 64;
        }

        // 8. Insert exam into SQLite
        const result = await run(
            `INSERT INTO exams (
                class_id, title, questions_json, duration_minutes, created_by, 
                target_class, target_section, education_level, subject, exam_type, start_date, start_time, end_date, end_time, answer_key
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                targetClassId,
                title.trim(),
                JSON.stringify(sanitizedQuestions),
                durationMins,
                req.user.id,
                targetClassStr,
                targetSectionStr,
                educationLevelStr,
                teacherSubject,
                finalExamType,
                startDate,
                startTime,
                endDate,
                endTime,
                JSON.stringify(answerKey)
            ]
        );

        // 9. Notify matching students
        for (const st of matchingStudents) {
            const userId = st.uid || st.s_user_id || st.student_uid;
            if (userId) {
                await run(
                    "INSERT INTO notifications (user_id, type, content) VALUES (?, 'exam', ?)",
                    [userId, `New ${finalExamType.toUpperCase()} Exam Published: "${title.trim()}" for ${startDate}`]
                ).catch(() => {});
            }
        }

        // 10. Enqueue to sync queue
        await SyncQueueManager.enqueue('CREATE', 'exam', result.id, {
            class_id: targetClassId,
            target_class: targetClassStr,
            target_section: targetSectionStr,
            education_level: educationLevelStr,
            subject: teacherSubject,
            title: title.trim(),
            exam_type: finalExamType,
            questions: sanitizedQuestions,
            answer_key: answerKey,
            start_date: startDate,
            start_time: startTime,
            end_date: endDate,
            end_time: endTime,
            duration_minutes: durationMins,
            created_by: req.user.id,
            recipientStudentUids: matchingStudents.map(s => s.uid || s.s_user_id || s.student_uid)
        }).catch(() => {});

        console.log(`[EXAM CREATED] ID: ${result.id} | Type: ${finalExamType} | Title: "${title}" | Target: ${targetClassStr} (${targetSectionStr}) | Recipients: ${matchingStudents.length}`);

        res.status(201).json({
            success: true,
            message: `${finalExamType.toUpperCase()} Exam created successfully!`,
            examId: result.id,
            targetClass: targetClassStr,
            targetSection: targetSectionStr,
            educationLevel: educationLevelStr,
            examType: finalExamType,
            recipientCount: matchingStudents.length,
            recipients: matchingStudents.map(s => ({ uid: s.uid, name: s.name, code: s.student_code }))
        });
    } catch (err) {
        console.error('Create exam error:', err);
        res.status(500).json({ error: 'Error creating exam: ' + err.message });
    }
});

// GET /api/exams/:id/submissions - View all student submissions for an exam (Teacher)
router.get('/:id/submissions', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const examId = req.params.id;
        const exam = await get("SELECT * FROM exams WHERE id = ?", [examId]);
        if (!exam) return res.status(404).json({ error: 'Exam not found.' });

        const submissions = await all(
            `SELECT es.*, 
                    COALESCE(u.name, st.student_name, 'Student') as student_name,
                    COALESCE(s.student_code, u.student_code, st.student_code, '') as student_code,
                    (SELECT COUNT(*) FROM exam_violations ev WHERE ev.exam_id = es.exam_id AND (ev.student_id = es.student_id OR ev.student_uid = es.student_uid)) as real_violation_count
             FROM exam_submissions es
             LEFT JOIN students s ON (es.student_id = s.id OR es.student_id = s.user_id)
             LEFT JOIN users u ON (s.user_id = u.id OR es.student_id = u.id)
             LEFT JOIN student_teacher_connections st ON (es.student_id = st.student_uid OR es.student_id = st.student_code)
             WHERE es.exam_id = ?
             GROUP BY es.id
             ORDER BY es.submitted_at DESC`,
            [examId]
        ).catch(() => []);

        const formattedSubmissions = submissions.map(sub => {
            let parsedAnswers = {};
            try { parsedAnswers = JSON.parse(sub.answers || '{}'); } catch(e) {}
            return {
                ...sub,
                answers: parsedAnswers
            };
        });

        let questions = [];
        try { questions = JSON.parse(exam.questions_json || '[]'); } catch(e) {}

        res.json({
            exam: {
                id: exam.id,
                title: exam.title,
                subject: exam.subject,
                exam_type: exam.exam_type || 'written',
                target_class: exam.target_class,
                duration_minutes: exam.duration_minutes,
                questions
            },
            submissions: formattedSubmissions
        });
    } catch (err) {
        console.error('Fetch exam submissions error:', err);
        res.status(500).json({ error: 'Error fetching exam submissions.' });
    }
});

// GET /api/exams/:id/live-status - Live monitoring of student statuses and violations during exam
router.get('/:id/live-status', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const examId = req.params.id;
        const exam = await get("SELECT * FROM exams WHERE id = ?", [examId]);
        if (!exam) return res.status(404).json({ error: 'Exam not found.' });

        const submissions = await all(
            `SELECT es.id, es.student_id, es.student_uid, es.status, es.score, es.total_marks, 
                    es.submitted_at, es.violation_count,
                    COALESCE(u.name, st.student_name, 'Student') as student_name,
                    COALESCE(s.student_code, u.student_code, st.student_code, '') as student_code
             FROM exam_submissions es
             LEFT JOIN students s ON (es.student_id = s.id OR es.student_id = s.user_id)
             LEFT JOIN users u ON (s.user_id = u.id OR es.student_id = u.id)
             LEFT JOIN student_teacher_connections st ON (es.student_id = st.student_uid OR es.student_id = st.student_code)
             WHERE es.exam_id = ?
             ORDER BY es.submitted_at DESC`,
            [examId]
        ).catch(() => []);

        const recentViolations = await all(
            `SELECT ev.*, COALESCE(u.name, 'Student') as student_name
             FROM exam_violations ev
             LEFT JOIN users u ON ev.student_id = u.id OR ev.student_uid = u.id
             WHERE ev.exam_id = ?
             ORDER BY ev.timestamp DESC
             LIMIT 15`,
            [examId]
        ).catch(() => []);

        res.json({
            examId: exam.id,
            title: exam.title,
            students: submissions,
            violations: recentViolations
        });
    } catch (err) {
        console.error('Live status error:', err);
        res.status(500).json({ error: 'Error fetching live exam status.' });
    }
});

// POST /api/exams/evaluate/:submissionId - Teacher evaluates a written exam submission
router.post('/evaluate/:submissionId', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const submissionId = req.params.submissionId;
        const { score, total_marks, feedback, marks } = req.body;
        const existingSub = await get("SELECT * FROM exam_submissions WHERE id = ?", [submissionId]);
        const finalScore = parseFloat(score !== undefined ? score : marks) || 0;
        const finalTotalMarks = parseFloat(total_marks) || (existingSub?.total_marks) || 100;
        const evaluatedBy = req.user.name || 'Teacher';

        await run(
            `UPDATE exam_submissions 
             SET score = ?, total_marks = ?, feedback = ?, status = 'evaluated', evaluated_at = CURRENT_TIMESTAMP, evaluated_by = ?
             WHERE id = ?`,
            [finalScore, finalTotalMarks, feedback || '', evaluatedBy, submissionId]
        );

        const sub = await get("SELECT * FROM exam_submissions WHERE id = ?", [submissionId]);
        if (sub) {
            await SyncQueueManager.enqueue('UPDATE', 'exam_evaluation', submissionId, {
                submission_id: submissionId,
                exam_id: sub.exam_id,
                student_id: sub.student_id,
                student_uid: sub.student_uid,
                score: finalScore,
                total_marks: finalTotalMarks,
                feedback: feedback || '',
                status: 'evaluated',
                evaluated_by: evaluatedBy,
                evaluated_at: new Date().toISOString()
            }).catch(() => {});
        }

        res.json({
            success: true,
            message: 'Exam evaluation and marks saved successfully!',
            score: finalScore,
            totalMarks: finalTotalMarks
        });
    } catch (err) {
        console.error('Evaluate exam error:', err);
        res.status(500).json({ error: 'Error saving exam evaluation: ' + err.message });
    }
});

module.exports = router;
