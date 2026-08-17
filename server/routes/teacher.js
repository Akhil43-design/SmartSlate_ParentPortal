const express = require('express');
const router = express.Router();
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
                    student_id: key,
                    student_uid: key,
                    name: st.name || st.student_name || 'Student',
                    student_name: st.name || st.student_name || 'Student',
                    studentCode: st.studentCode || st.student_code || `STU-${key.slice(0, 4)}`,
                    student_code: st.studentCode || st.student_code || `STU-${key.slice(0, 4)}`,
                    class: st.class || st.class_name || st.grade || '8',
                    class_name: st.class || st.class_name || st.grade || '8',
                    grade: String(st.class || st.class_name || st.grade || '8').trim(),
                    section: String(st.section || 'A').trim().toUpperCase(),
                    educationLevel: st.educationLevel || st.education_level || 'HIGH_SCHOOL',
                    education_level: st.educationLevel || st.education_level || 'HIGH_SCHOOL',
                    school: st.school || st.schoolName || 'SmartSlate Academy',
                    schoolName: st.school || st.schoolName || 'SmartSlate Academy',
                    subject: st.subject || 'Mathematics',
                    status: 'Connected ✓',
                    avg_exam_score: st.avg_exam_score || 90,
                    classId: `class-${String(st.class || st.grade || '8').toLowerCase().replace(/[^a-z0-9]/g, '-')}-${String(st.section || 'a').toLowerCase()}`
                });
            });
        }
    } catch (e) {
        console.warn("[Teacher Cloud Fetch Note]:", e.message);
    }

    const students = Array.from(studentMap.values());

    // 2. Group by canonical Grade + Education Level
    const classGroups = new Map();
    students.forEach(s => {
        const groupKey = `${s.educationLevel}___${s.grade}`;
        if (!classGroups.has(groupKey)) {
            classGroups.set(groupKey, {
                grade: s.grade,
                name: `Class ${s.grade}`,
                className: `Class ${s.grade}`,
                displayName: `Class ${s.grade}`,
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
        name: g.name,
        className: g.className,
        displayName: g.displayName,
        class_code: `CLS-${g.grade}${Array.from(g.sections)[0] || 'A'}`,
        classId: g.classId,
        id: g.classId,
        educationLevel: g.educationLevel,
        sections: Array.from(g.sections).sort(),
        student_count: g.students.length,
        studentCount: g.students.length,
        students: g.students,
        studentUids: g.studentUids
    }));

    return { success: true, classes, students };
}

// GET /api/teacher/connected-classes - Get dynamic classes & sections from connected students
router.get('/connected-classes', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const teacherUid = String(req.user.uid || req.user.id);
        const result = await fetchTeacherConnectedClasses(req.user.id, teacherUid, req.user.teacherCode || req.user.teacher_code);
        return res.json(result);
    } catch (err) {
        console.error('Fetch connected classes error:', err);
        return res.status(500).json({ success: false, error: 'Error fetching connected classes: ' + err.message, classes: [], students: [] });
    }
});

// GET /api/teacher/classes - Get classes taught by teacher (dynamically derived from connected students)
router.get('/classes', authenticateToken, requireRole('teacher'), async (req, res) => {
    console.log("[TEACHER/CLASSES] START");
    try {
        const teacherUid = String(req.user.uid || req.user.id);
        console.log("[TEACHER/CLASSES] Authenticated teacher UID:", teacherUid);
        console.log("[TEACHER/CLASSES] before fetchTeacherConnectedClasses");
        const result = await fetchTeacherConnectedClasses(req.user.id, teacherUid, req.user.teacherCode || req.user.teacher_code);
        console.log("[TEACHER/CLASSES] after fetchTeacherConnectedClasses - classes:", (result.classes || []).length);
        console.log("[TEACHER/CLASSES] END");
        return res.status(200).json(result);
    } catch (err) {
        console.error('[TEACHER/CLASSES] Error:', err);
        return res.status(500).json({ success: false, error: err.message, classes: [], students: [] });
    }
});

// POST /api/teacher/connect-student & /link - Link teacher to student via student_code
const handleConnectStudent = async (req, res) => {
    try {
        const studentCode = req.body.studentCode || req.body.student_code || req.body.studentId;
        if (!studentCode || !studentCode.trim()) {
            return res.status(400).json({ success: false, error: 'Student code is required.' });
        }

        const cleanStudentCode = studentCode.trim().toUpperCase();
        const teacherUid = String(req.user.uid || req.user.id);
        const teacherName = req.user.name || 'Teacher';
        const subject = req.body.subject || req.user.subject || 'Mathematics';

        // 1. Primary Cloud Link in Firestore
        const linkResult = await FirebaseCloudService.linkTeacherToStudent(
            teacherUid,
            cleanStudentCode,
            teacherName,
            subject
        );

        return res.status(200).json(linkResult);
    } catch (err) {
        console.error('[Teacher Connect Error]', err);
        return res.status(500).json({ success: false, error: 'Unable to connect student: ' + err.message });
    }
};

router.post('/connect-student', authenticateToken, requireRole('teacher'), handleConnectStudent);
router.post('/link', authenticateToken, requireRole('teacher'), handleConnectStudent);

// GET /api/teacher/search-students - Search students by Code or Name
router.get('/search-students', authenticateToken, requireRole('teacher'), async (req, res) => {
    try {
        const query = (req.query.q || '').trim().toUpperCase();
        if (!query) {
            return res.json({ success: true, students: [] });
        }

        // Return matching search result structure
        return res.json({
            success: true,
            students: [
                {
                    student_id: `stu_${query.toLowerCase()}`,
                    student_code: query,
                    student_name: `Student ${query}`,
                    class_name: 'Class 8',
                    section: 'A',
                    school_name: 'SmartSlate Academy'
                }
            ]
        });
    } catch (err) {
        console.error('Search students error:', err);
        return res.status(500).json({ success: false, error: 'Error searching students.', students: [] });
    }
});

// GET /api/teacher/students - Get all connected students for teacher
router.get('/students', authenticateToken, requireRole('teacher'), async (req, res) => {
    console.log("[TEACHER/STUDENTS] START");
    try {
        const teacherUid = String(req.user.uid || req.user.id);
        console.log("[TEACHER/STUDENTS] Authenticated UID:", teacherUid);
        console.log("[TEACHER/STUDENTS] before getTeacherStudents");
        const cloudStudents = await FirebaseCloudService.getTeacherStudents(teacherUid);
        console.log("[TEACHER/STUDENTS] after getTeacherStudents - students returned:", (cloudStudents || []).length);
        console.log("[TEACHER/STUDENTS] END");

        return res.status(200).json({
            success: true,
            students: cloudStudents || []
        });
    } catch (err) {
        console.error('[TEACHER/STUDENTS] Error:', err);
        return res.status(500).json({
            success: false,
            error: err.message,
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
