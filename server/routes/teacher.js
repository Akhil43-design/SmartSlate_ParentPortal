const express = require('express');
const router = express.Router();
const { get, all, run } = require('../db/database');
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const FirebaseCloudService = require('../services/firebaseAdmin');

async function fetchTeacherConnectedClasses(teacherId, teacherUid, teacherCode) {
    const safeTeacherUid = String(teacherUid || teacherId);
    const studentMap = new Map();

    // 1. Cloud Firestore Source of Truth
    try {
        const cloudStudents = await FirebaseCloudService.getTeacherStudents(safeTeacherUid);
        if (Array.isArray(cloudStudents)) {
            cloudStudents.forEach(st => {
                const key = String(st.uid || st.student_id);
                studentMap.set(key, {
                    uid: key,
                    id: key,
                    name: st.name || 'Student',
                    studentCode: st.studentCode || `STU-${key.slice(0, 4)}`,
                    grade: (st.class || st.grade || '8').trim(),
                    section: (st.section || 'A').trim().toUpperCase(),
                    educationLevel: st.educationLevel || 'HIGH_SCHOOL',
                    subject: st.subject || 'All Subjects',
                    classId: `class-${(st.class || st.grade || '8').toLowerCase().replace(/[^a-z0-9]/g, '-')}-${(st.section || 'a').toLowerCase()}`
                });
            });
        }
    } catch (e) {
        console.warn("[Teacher Cloud Fetch Note]:", e.message);
    }

    // 2. Fallback to local SQLite if available
    try {
        const directConns = await all(
            `SELECT stc.*, s.id as s_id, s.user_id as s_user_id, s.firebase_uid as s_firebase_uid,
                    s.grade as s_grade, s.class_name as s_class_name, s.section as s_section, s.education_level as s_education_level,
                    s.class_id_str,
                    u.name as u_name, u.email as u_email,
                    COALESCE(s.grade, s.class_name, c.name, 'Grade 8') as resolved_grade,
                    COALESCE(s.section, c.section, 'A') as resolved_section,
                    COALESCE(s.education_level, 'High School') as resolved_education_level
             FROM student_teacher_connections stc
             LEFT JOIN students s ON (stc.student_uid = s.user_id OR stc.student_code = s.student_code OR stc.student_uid = s.firebase_uid)
             LEFT JOIN users u ON (s.user_id = u.id OR stc.student_code = u.student_code)
             LEFT JOIN classes c ON s.class_id = c.id
             WHERE (stc.teacher_uid = ? OR stc.teacher_uid = ? OR stc.teacher_code = ?) AND stc.status = 'active'`,
            [safeTeacherUid, String(teacherId), teacherCode || `TCH-${teacherId}`]
        ).catch(() => []);

        const classStudents = await all(
            `SELECT s.id as s_id, s.user_id as s_user_id, s.firebase_uid as s_firebase_uid,
                    s.grade as s_grade, s.class_name as s_class_name, s.section as s_section, s.education_level as s_education_level,
                    s.class_id_str,
                    u.name as u_name, u.email as u_email,
                    COALESCE(s.grade, s.class_name, c.name, 'Grade 8') as resolved_grade,
                    COALESCE(s.section, c.section, 'A') as resolved_section,
                    COALESCE(s.education_level, 'High School') as resolved_education_level
             FROM classes c
             JOIN students s ON c.id = s.class_id
             JOIN users u ON s.user_id = u.id
             WHERE c.teacher_id = ?`,
            [teacherId]
        ).catch(() => []);

        [...classStudents, ...directConns].forEach(st => {
            const key = String(st.s_firebase_uid || st.s_user_id || st.student_uid || st.s_id);
            if (!studentMap.has(key)) {
                studentMap.set(key, {
                    uid: st.s_firebase_uid || st.s_user_id || st.student_uid || String(st.s_id),
                    id: st.s_id,
                    name: st.student_name || st.u_name || 'Student',
                    studentCode: st.student_code || `STU-${key.slice(0, 4)}`,
                    grade: (st.s_grade || st.resolved_grade || st.s_class_name || 'Grade 8').trim(),
                    section: (st.s_section || st.resolved_section || 'A').trim().toUpperCase(),
                    educationLevel: (st.s_education_level || st.resolved_education_level || 'High School').trim(),
                    classId: st.class_id_str || `class-${(st.s_grade || '8').toLowerCase()}-${(st.s_section || 'a').toLowerCase()}`
                });
            }
        });
    } catch (e) {}

    const students = Array.from(studentMap.values());

    // 3. Group by canonical Grade + Education Level
    const classGroups = new Map();
    students.forEach(s => {
        const groupKey = `${s.educationLevel}___${s.grade}`;
        if (!classGroups.has(groupKey)) {
            classGroups.set(groupKey, {
                grade: s.grade,
                name: s.grade,
                className: s.grade,
                displayName: s.grade,
                classId: s.classId,
                educationLevel: s.educationLevel,
                sections: new Set([s.section]),
                students: [s],
                studentUids: [s.uid]
            });
        } else {
            const group = classGroups.get(groupKey);
            group.sections.add(s.section);
            group.students.push(s);
            if (!group.studentUids.includes(s.uid)) {
                group.studentUids.push(s.uid);
            }
        }
    });

    const classes = Array.from(classGroups.values()).map(g => ({
        grade: g.grade,
        name: g.grade,
        className: g.grade,
        displayName: g.displayName,
        classId: g.classId,
        educationLevel: g.educationLevel,
        sections: Array.from(g.sections).sort(),
        studentCount: g.students.length,
        students: g.students,
        studentUids: g.studentUids
    }));

    return { classes, students };
}

// GET /api/teacher/connected-classes - Get dynamic classes & sections from connected students
router.get('/connected-classes', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherUid = String(req.user.uid || req.user.id);
        const teacherUser = await get("SELECT id, name, email, teacher_code, subject FROM users WHERE id = ?", [req.user.id]).catch(() => null);
        const teacherCode = teacherUser?.teacher_code || req.user.teacherCode || req.user.teacher_code || `TCH-${req.user.id}`;

        const result = await fetchTeacherConnectedClasses(req.user.id, teacherUid, teacherCode);
        res.json(result);
    } catch (err) {
        console.error('Fetch connected classes error:', err);
        res.status(500).json({ error: 'Error fetching connected classes: ' + err.message });
    }
});

// GET /api/teacher/classes - Get classes taught by teacher (dynamically derived from connected students)
router.get('/classes', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherUid = String(req.user.uid || req.user.id);
        const teacherUser = await get("SELECT id, name, email, teacher_code, subject FROM users WHERE id = ?", [req.user.id]).catch(() => null);
        const teacherCode = teacherUser?.teacher_code || req.user.teacherCode || req.user.teacher_code || `TCH-${req.user.id}`;

        const result = await fetchTeacherConnectedClasses(req.user.id, teacherUid, teacherCode);
        res.json(result);
    } catch (err) {
        console.error('Fetch teacher classes error:', err);
        res.status(500).json({ error: 'Error fetching classes.' });
    }
});

// POST /api/teacher/connect-student & /link - Link teacher to student via student_code
const handleConnectStudent = async (req, res) => {
    try {
        const studentCode = req.body.studentCode || req.body.student_code || req.body.studentId;
        if (!studentCode || !studentCode.trim()) {
            return res.status(400).json({ error: 'Student code is required.' });
        }

        const cleanStudentCode = studentCode.trim().toUpperCase();
        const teacherUid = String(req.user.uid || req.user.id);
        const teacherName = req.user.name || 'Teacher';
        const subject = req.user.subject || 'All Subjects';

        // 1. Primary Cloud Link in Firestore
        const linkResult = await FirebaseCloudService.linkTeacherToStudent(
            teacherUid,
            cleanStudentCode,
            teacherName,
            subject
        );

        // 2. Best-effort local SQLite write (non-blocking)
        try {
            await run(
                `INSERT INTO student_teacher_connections (student_uid, teacher_uid, student_code, student_name, teacher_name, subject, status)
                 VALUES (?, ?, ?, ?, ?, ?, 'active')
                 ON CONFLICT(student_uid, teacher_uid) DO UPDATE SET status = 'active'`,
                [linkResult.student.uid, teacherUid, cleanStudentCode, linkResult.student.name, teacherName, subject]
            ).catch(() => {});
        } catch (e) {}

        return res.status(200).json(linkResult);
    } catch (err) {
        console.error('[Teacher Connect Error]', err);
        return res.status(500).json({ error: 'Unable to connect student: ' + err.message });
    }
};

router.post('/connect-student', authenticateToken, requireRole('teacher'), handleConnectStudent);
router.post('/link', authenticateToken, requireRole('teacher'), handleConnectStudent);

// GET /api/teacher/search-students - Search students by Code or Name (minimal info only)
router.get('/search-students', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const query = (req.query.q || '').trim();
        if (!query) {
            return res.json({ students: [] });
        }

        const students = await all(
            `SELECT s.id as student_id, s.student_code, u.name as student_name, 
                    COALESCE(c.name, 'Class 8') as class_name, COALESCE(c.section, 'A') as section,
                    'SmartSlate Academy' as school_name
             FROM students s
             JOIN users u ON s.user_id = u.id
             LEFT JOIN classes c ON s.class_id = c.id
             WHERE s.student_code LIKE ? OR u.name LIKE ?
             LIMIT 10`,
            [`%${query}%`, `%${query}%`]
        );

        res.json({ students });
    } catch (err) {
        console.error('Search students error:', err);
        res.status(500).json({ error: 'Error searching students.' });
    }
});

// GET /api/teacher/students - Get all connected students for teacher
router.get('/students', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherUid = String(req.user.uid || req.user.id);
        console.log("[TEACHER] Authenticated UID:", teacherUid);
        console.log("[TEACHER] Querying connections for:", teacherUid);

        // 1. Primary Cloud Authority: Firestore via Firebase Admin SDK
        const cloudStudents = await FirebaseCloudService.getTeacherStudents(teacherUid);
        console.log("[TEACHER] Connections found:", cloudStudents.length);
        console.log("[TEACHER] Students returned:", cloudStudents.length);

        return res.status(200).json({
            success: true,
            students: cloudStudents
        });
    } catch (err) {
        console.error('[Teacher Firebase Error]', err);
        return res.status(500).json({
            success: false,
            error: 'Unable to load teacher students: ' + err.message,
            students: []
        });
    }
});

// GET /api/teacher/students/:classId - Get students list filtered by class
router.get('/students/:classId', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherUid = String(req.user.uid || req.user.id);
        const classId = req.params.classId;
        const allStudents = await FirebaseCloudService.getTeacherStudents(teacherUid);

        if (classId && classId !== 'all') {
            const filtered = allStudents.filter(s => {
                const sClassId = `class-${(s.class || s.grade || '8').toLowerCase()}-${(s.section || 'a').toLowerCase()}`;
                return s.class == classId || s.grade == classId || sClassId == classId;
            });
            return res.json({ success: true, students: filtered });
        }

        return res.json({ success: true, students: allStudents });
    } catch (err) {
        console.error('Fetch class students error:', err);
        return res.status(500).json({ success: false, error: 'Error fetching class students.', students: [] });
    }
});

module.exports = router;

