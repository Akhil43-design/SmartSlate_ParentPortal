const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const SyncQueueManager = require('../../shared/services/syncQueue');
const FirebaseCloudService = require('../services/firebaseAdmin');

// GET /api/exams - Teacher / Parent exams list
router.get('/', authenticateToken, async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const teacherUid = String(req.user.uid || req.user.id);
            
            // 1. Get exams from Firebase Cloud Firestore
            let cloudExams = [];
            try {
                cloudExams = await FirebaseCloudService.getTeacherExams(teacherUid);
            } catch (e) {}

            // 2. Get exams from SQLite
            const sqliteExams = await all(
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

            const examMap = new Map();
            cloudExams.forEach(e => {
                const id = String(e.id || e.examId);
                examMap.set(id, {
                    ...e,
                    id,
                    target_class: e.targetClass || e.target_class || 'Class 8',
                    class_name: e.className || e.targetClass || e.target_class || 'Class 8',
                    questions_count: (e.questions || []).length,
                    total_marks: (e.questions || []).reduce((sum, q) => sum + (parseFloat(q.marks) || 1), 0) || 100,
                    exam_type: e.exam_type || e.examType || 'written',
                    submissions_count: e.submissions_count || 0,
                    active_count: e.active_count || 0,
                    violations_count: e.violations_count || 0
                });
            });

            sqliteExams.forEach(e => {
                const id = String(e.id);
                if (!examMap.has(id)) {
                    let questions = [];
                    try { questions = JSON.parse(e.questions_json || '[]'); } catch(err) {}
                    let totalMarks = questions.reduce((sum, q) => sum + (parseFloat(q.marks) || 1), 0);
                    if (totalMarks === 0) totalMarks = 100;
                    examMap.set(id, {
                        ...e,
                        questions,
                        questions_count: questions.length,
                        total_marks: totalMarks,
                        exam_type: e.exam_type || 'written'
                    });
                }
            });

            return res.json({ exams: Array.from(examMap.values()) });
        }

        if (req.user.role === 'parent') {
            const { studentId } = req.query;
            if (!studentId) return res.status(400).json({ error: 'studentId is required' });

            const student = await get("SELECT class_id FROM students WHERE id = ? OR user_id = ?", [studentId, studentId]).catch(() => null);
            const classId = student?.class_id || 1;

            const exams = await all(
                `SELECT e.id, e.title, e.subject, e.exam_type, e.duration_minutes, e.start_date, e.start_time, e.end_date, e.end_time,
                        es.score, es.total_marks, es.status, es.submitted_at, es.evaluated_at, es.feedback
                 FROM exams e
                 LEFT JOIN exam_submissions es ON e.id = es.exam_id AND (es.student_id = ? OR es.student_uid = ?)
                 WHERE e.class_id = ? OR e.target_class = (SELECT name FROM classes WHERE id = ?)
                 ORDER BY e.created_at DESC`,
                [studentId, studentId, classId, classId]
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

        const targetClassStr = String(target_class || targetClass || class_id || 'Class 8').trim();
        const targetSectionStr = String(target_section || targetSection || 'All').trim();
        const educationLevelStr = String(education_level || educationLevel || 'HIGH_SCHOOL').trim();

        if (!title || !questions || !Array.isArray(questions) || questions.length === 0) {
            return res.status(400).json({ error: 'Exam Title and at least one Question are required.' });
        }

        const teacherUid = String(req.user.uid || req.user.id);
        const teacherSubject = subject || req.user.subject || 'Mathematics';
        const finalExamType = exam_type === 'mcq' ? 'mcq' : 'written';

        // 1. Get all connected students from Firebase Cloud Service first
        let allConnectedStudents = [];
        try {
            allConnectedStudents = await FirebaseCloudService.getTeacherStudents(teacherUid);
        } catch (e) {}

        // Fallback to SQLite if empty
        if (!allConnectedStudents || allConnectedStudents.length === 0) {
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
                 WHERE (stc.teacher_uid = ? OR stc.teacher_uid = ?) AND stc.status = 'active'`,
                [teacherUid, String(req.user.id)]
            ).catch(() => []);

            allConnectedStudents = directConns.map(st => ({
                ...st,
                grade: (st.s_grade || st.resolved_grade || st.class_name || 'Grade 8').trim(),
                section: (st.s_section || st.resolved_section || 'A').trim().toUpperCase(),
                educationLevel: (st.s_education_level || st.resolved_education_level || 'High School').trim(),
                name: st.u_name || st.student_name || 'Student',
                uid: st.s_firebase_uid || st.s_user_id || st.student_uid || String(st.s_id)
            }));
        }

        // 2. Filter matching students
        const matchingStudents = (allConnectedStudents || []).filter(s => {
            const sGrade = String(s.grade || s.class_name || s.class || '').trim();
            const sSection = String(s.section || 'A').trim().toUpperCase();

            const classMatch = !targetClassStr ||
                               sGrade.toLowerCase() === targetClassStr.toLowerCase() ||
                               sGrade.toLowerCase().includes(targetClassStr.toLowerCase()) ||
                               targetClassStr.toLowerCase().includes(sGrade.toLowerCase());

            const sectionMatch = targetSectionStr.toUpperCase() === 'ALL' ||
                                 !targetSectionStr ||
                                 sSection === targetSectionStr.toUpperCase();

            return classMatch && sectionMatch;
        });

        // 3. Build question list and secret answer key
        const answerKey = {};
        const sanitizedQuestions = questions.map((q, idx) => {
            const qId = q.id || `q_${idx + 1}`;
            if (finalExamType === 'mcq' && q.correct) {
                answerKey[qId] = String(q.correct).trim().toUpperCase();
            }
            return {
                id: qId,
                type: finalExamType,
                question: q.question || q.text || '',
                text: q.text || q.question || '',
                options: q.options || (finalExamType === 'mcq' ? { A: '', B: '', C: '', D: '' } : null),
                marks: parseFloat(q.marks) || (finalExamType === 'mcq' ? 1 : 10)
            };
        });

        // 4. Dates and times
        const todayStr = new Date().toISOString().split('T')[0];
        const startDate = start_date || todayStr;
        const startTime = start_time || '09:00';
        const endDate = end_date || startDate;
        const endTime = end_time || '23:59';
        const durationMins = parseInt(duration_minutes, 10) || 60;
        const generatedExamId = `exam_${Date.now()}_${Math.floor(1000 + Math.random() * 9000)}`;

        // 5. Publish to Cloud Firestore
        const recipientUids = (matchingStudents.length > 0 ? matchingStudents : allConnectedStudents).map(s => s.uid || s.student_uid || s.student_id);
        const cloudExamPayload = {
            id: generatedExamId,
            examId: generatedExamId,
            title: title.trim(),
            subject: teacherSubject,
            target_class: targetClassStr,
            targetClass: targetClassStr,
            target_section: targetSectionStr,
            targetSection: targetSectionStr,
            education_level: educationLevelStr,
            educationLevel: educationLevelStr,
            exam_type: finalExamType,
            duration_minutes: durationMins,
            durationMinutes: durationMins,
            questions: sanitizedQuestions,
            start_date: startDate,
            start_time: startTime,
            end_date: endDate,
            end_time: endTime,
            created_by: teacherUid,
            teacherUid: teacherUid,
            recipientStudentUids: recipientUids
        };

        try {
            await FirebaseCloudService.createExam(cloudExamPayload);
        } catch (e) {
            console.warn('[EXAM] Cloud creation error:', e.message);
        }

        // 6. Optional SQLite persist
        let sqliteId = generatedExamId;
        try {
            const resSql = await run(
                `INSERT INTO exams (
                    class_id, title, questions_json, duration_minutes, created_by, 
                    target_class, target_section, education_level, subject, exam_type, start_date, start_time, end_date, end_time, answer_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    class_id || 1,
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
            ).catch(() => null);
            if (resSql?.id) sqliteId = resSql.id;
        } catch (e) {}

        console.log(`[EXAM CREATED] ID: ${generatedExamId} | Type: ${finalExamType} | Title: "${title}" | Recipients: ${recipientUids.length}`);

        res.status(201).json({
            success: true,
            message: `${finalExamType.toUpperCase()} Exam created successfully!`,
            examId: generatedExamId,
            id: generatedExamId,
            targetClass: targetClassStr,
            targetSection: targetSectionStr,
            educationLevel: educationLevelStr,
            examType: finalExamType,
            recipientCount: recipientUids.length,
            recipients: (matchingStudents.length > 0 ? matchingStudents : allConnectedStudents).map(s => ({ uid: s.uid, name: s.name, code: s.student_code || s.studentCode }))
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
