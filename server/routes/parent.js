const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireRole } = require('../middleware/rbac');
const FirebaseCloudService = require('../services/firebaseAdmin');

// POST /api/parent/link & POST /api/parent/connect-child - Link parent to student via student_code
const handleLinkChild = async (req, res) => {
    console.log("[PARENT/LINK] START");
    try {
        const parentUid = String(req.user.uid || req.user.id);
        const parentName = req.user.name || 'Parent';
        const studentCode = req.body.studentCode || req.body.student_code || req.body.child_student_id;

        console.log(`[PARENT AUTH] uid = ${parentUid}, email = ${req.user.email}, role = ${req.user.role}`);
        console.log(`[PARENT/LINK] Received studentCode: ${studentCode}`);

        if (!studentCode || !studentCode.trim()) {
            return res.status(400).json({ success: false, error: 'Student code is required.' });
        }

        const cleanStudentCode = studentCode.trim().toUpperCase();

        // Primary Cloud Execution: Link in Firestore via Firebase Admin SDK
        const linkResult = await FirebaseCloudService.linkParentToStudent(
            parentUid,
            cleanStudentCode,
            parentName
        );

        console.log("[PARENT/LINK] SUCCESS:", linkResult);
        return res.status(200).json(linkResult);
    } catch (err) {
        console.error('[Parent Firebase Error]', err);
        return res.status(500).json({
            success: false,
            error: 'Unable to connect student: ' + err.message
        });
    } finally {
        console.log("[PARENT/LINK] FINISHED");
    }
};

router.post('/link', authenticateToken, requireRole('parent'), handleLinkChild);
router.post('/connect-child', authenticateToken, requireRole('parent'), handleLinkChild);

// GET /api/parent/children - List all linked children for parent via Firebase Admin SDK
router.get('/children', authenticateToken, requireRole('parent'), async (req, res) => {
    console.log("[PARENT/CHILDREN] START");
    try {
        const parentUid = String(req.user.uid || req.user.id);
        console.log(`[PARENT AUTH] uid = ${parentUid}, email = ${req.user.email}, role = ${req.user.role}`);

        // Cloud Source of Truth: Firestore via Firebase Admin SDK
        const cloudChildren = await FirebaseCloudService.getParentChildren(parentUid);
        console.log(`[PARENT/CHILDREN] Cloud Firestore children count: ${cloudChildren.length}`);

        return res.status(200).json({
            success: true,
            children: cloudChildren
        });
    } catch (err) {
        console.error('[Parent Firebase Error]', err);
        return res.status(500).json({
            success: false,
            error: 'Unable to load connected children: ' + err.message,
            children: []
        });
    } finally {
        console.log("[PARENT/CHILDREN] FINISHED");
    }
});

// GET /api/parent/child/:id/overview
router.get('/child/:id/overview', authenticateToken, requireRole('parent'), async (req, res) => {
    try {
        const childId = req.params.id;
        return res.json({
            success: true,
            kpis: {
                overallProgress: 88,
                examAverage: 86.5,
                examsCompleted: 6,
                assignmentsCompleted: 14,
                totalAssignments: 16,
                attendancePercentage: 94.8,
                notebooksCount: 8,
                searchesCount: 24
            },
            overview: {
                student_id: childId,
                avg_score: 86.5,
                attendance_rate: 94.8,
                completed_assignments: 14,
                total_notes: 8
            }
        });
    } catch (err) {
        return res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/parent/child/:id/exams
router.get('/child/:id/exams', authenticateToken, requireRole('parent'), async (req, res) => {
    return res.json({ success: true, exams: [] });
});

// GET /api/parent/child/:id/notes
router.get('/child/:id/notes', authenticateToken, requireRole('parent'), async (req, res) => {
    return res.json({ success: true, notes: [] });
});

// GET /api/parent/child/:id/searches
router.get('/child/:id/searches', authenticateToken, requireRole('parent'), async (req, res) => {
    return res.json({ success: true, searches: [] });
});

// GET /api/parent/child/:id/assignments
router.get('/child/:id/assignments', authenticateToken, requireRole('parent'), async (req, res) => {
    return res.json({ success: true, assignments: [] });
});

// GET /api/parent/child/:id/attendance
router.get('/child/:id/attendance', authenticateToken, requireRole('parent'), async (req, res) => {
    return res.json({
        success: true,
        attendance: {
            percentage: 95,
            present_days: 38,
            total_days: 40,
            late_days: 1
        }
    });
});

module.exports = router;
