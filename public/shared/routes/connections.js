const express = require('express');
const router = express.Router();
const sharedDb = require('../db/database');
const path = require('path');

// Helper to get db instance (use provided or fallback to shared)
function getDb(req) {
    return req.app.get('db') || sharedDb;
}

// Helper to resolve student code and user details
async function resolveStudent(db, userId, userUid) {
    const target = userUid || userId;
    let student = await db.get(
        `SELECT s.id as student_id, s.user_id, s.student_code, u.name, u.email, u.id as u_id
         FROM students s
         LEFT JOIN users u ON s.user_id = u.id
         WHERE s.user_id = ? OR s.student_code = ? OR u.id = ?`,
        [target, target, target]
    );

    if (!student) {
        // Fallback check in users
        const u = await db.get("SELECT id, name, email, student_code FROM users WHERE id = ? OR email = ?", [target, target]);
        if (u) {
            student = {
                student_id: u.id,
                user_id: u.id,
                student_code: u.student_code || `STU-${u.id}`,
                name: u.name,
                email: u.email
            };
        } else {
            student = {
                student_id: 1,
                user_id: target || 1,
                student_code: `STU-${target || '101'}`,
                name: 'Student',
                email: ''
            };
        }
    }
    return student;
}

// GET /api/connections - List all connected parents & teachers for the logged-in student
router.get('/', async (req, res) => {
    try {
        const db = getDb(req);
        const uid = req.user?.uid || req.user?.id || req.query.uid || 'guest';
        const student = await resolveStudent(db, req.user?.id, req.user?.uid);
        const studentUid = String(req.user?.uid || student.student_code || student.user_id);
        const studentCode = student.student_code || req.user?.student_code || `STU-${student.student_id}`;

        // 1. Fetch connected parents from student_parent_connections & parent_links
        const parentConns = await db.all(
            `SELECT spc.*, u.name as parent_user_name, u.email as parent_email, u.parent_code as u_parent_code
             FROM student_parent_connections spc
             LEFT JOIN users u ON (spc.parent_uid = u.id OR spc.parent_uid = u.parent_code)
             WHERE spc.student_uid = ? OR spc.student_code = ?`,
            [studentUid, studentCode]
        ).catch(() => []);

        // Also check parent_links table
        const parentLinks = await db.all(
            `SELECT pl.*, u.id as parent_uid, u.name as parent_name, u.email as parent_email, u.parent_code
             FROM parent_links pl
             JOIN users u ON pl.parent_user_id = u.id
             WHERE pl.student_id = ? AND pl.status = 'accepted'`,
            [student.student_id]
        ).catch(() => []);

        const parentsMap = new Map();
        parentConns.forEach(p => {
            parentsMap.set(p.parent_uid, {
                parentUid: p.parent_uid,
                parentCode: p.parent_code || p.u_parent_code || `PAR-${p.parent_uid}`,
                name: p.parent_name || p.parent_user_name || 'Parent',
                email: p.parent_email || '',
                status: 'Connected ✓',
                connectedAt: p.created_at
            });
        });

        parentLinks.forEach(p => {
            if (!parentsMap.has(String(p.parent_uid))) {
                parentsMap.set(String(p.parent_uid), {
                    parentUid: String(p.parent_uid),
                    parentCode: p.parent_code || `PAR-${p.parent_uid}`,
                    name: p.parent_name || 'Parent',
                    email: p.parent_email || '',
                    status: 'Connected ✓',
                    connectedAt: p.created_at
                });
            }
        });

        // 2. Fetch connected teachers from student_teacher_connections
        const teacherConns = await db.all(
            `SELECT stc.*, u.name as teacher_user_name, u.email as teacher_email, u.teacher_code as u_teacher_code
             FROM student_teacher_connections stc
             LEFT JOIN users u ON (stc.teacher_uid = u.id OR stc.teacher_uid = u.teacher_code)
             WHERE stc.student_uid = ? OR stc.student_code = ?`,
            [studentUid, studentCode]
        ).catch(() => []);

        const teachersMap = new Map();
        teacherConns.forEach(t => {
            teachersMap.set(t.teacher_uid, {
                teacherUid: t.teacher_uid,
                teacherCode: t.teacher_code || t.u_teacher_code || `TCH-${t.teacher_uid}`,
                name: t.teacher_name || t.teacher_user_name || 'Teacher',
                subject: t.subject || 'General',
                status: 'Connected ✓',
                connectedAt: t.created_at
            });
        });

        res.json({
            studentCode,
            studentName: student.name,
            parents: Array.from(parentsMap.values()),
            teachers: Array.from(teachersMap.values())
        });
    } catch (err) {
        console.error('[CONNECTIONS API] Fetch error:', err);
        res.status(500).json({ error: 'Error fetching connections: ' + err.message });
    }
});

// POST /api/connections/parent - Connect student to parent via parentCode
router.post('/parent', async (req, res) => {
    try {
        const db = getDb(req);
        const { parentCode } = req.body;
        if (!parentCode || !parentCode.trim()) {
            return res.status(400).json({ error: 'Parent code is required.' });
        }

        const cleanParentCode = parentCode.trim().toUpperCase();
        const student = await resolveStudent(db, req.user?.id, req.user?.uid);
        const studentUid = String(req.user?.uid || student.student_code || student.user_id);
        const studentCode = student.student_code || req.user?.student_code || `STU-${student.student_id}`;

        // 1. Find parent in local DB or Firebase Firestore
        let parent = await db.get(
            `SELECT id, name, email, parent_code FROM users WHERE (parent_code = ? OR UPPER(email) = ? OR id = ?) AND role = 'parent'`,
            [cleanParentCode, cleanParentCode, cleanParentCode]
        );

        if (!parent) {
            // Online Firestore Lookup Fallback
            try {
                const https = require('https');
                const apiKey = "AIzaSyBOgNWBVqSYfMypeZS8NwRLOYpq7DY3-ls";
                const projectId = "smartslate-bd117";
                
                const qRes = await new Promise((resolve) => {
                    const reqFs = https.request({
                        hostname: 'firestore.googleapis.com',
                        path: `/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    }, (resFs) => {
                        let body = '';
                        resFs.on('data', chunk => body += chunk);
                        resFs.on('end', () => {
                            try {
                                const parsed = JSON.parse(body);
                                resolve(parsed);
                            } catch (e) { resolve([]); }
                        });
                    });
                    reqFs.on('error', () => resolve([]));
                    reqFs.write(JSON.stringify({
                        structuredQuery: {
                            from: [{ collectionId: 'parents' }],
                            where: {
                                fieldFilter: {
                                    field: { fieldPath: 'parentCode' },
                                    op: 'EQUAL',
                                    value: { stringValue: cleanParentCode }
                                }
                            },
                            limit: 1
                        }
                    }));
                    reqFs.end();
                });

                if (Array.isArray(qRes) && qRes[0]?.document?.fields) {
                    const fields = qRes[0].document.fields;
                    const docName = qRes[0].document.name;
                    const pUid = docName.split('/').pop();
                    const pName = fields.name?.stringValue || 'Parent';
                    const pEmail = fields.email?.stringValue || `parent_${cleanParentCode.toLowerCase()}@smartslate.test`;

                    const ins = await db.run(
                        `INSERT INTO users (name, email, role, parent_code)
                         VALUES (?, ?, 'parent', ?)
                         ON CONFLICT(email) DO UPDATE SET parent_code = excluded.parent_code`,
                        [pName, pEmail, cleanParentCode]
                    ).catch(() => ({ id: pUid }));

                    parent = { id: ins?.id || pUid, name: pName, email: pEmail, parent_code: cleanParentCode };
                }
            } catch (fsErr) {
                console.warn('[CONNECTIONS] Firestore parent lookup error:', fsErr.message);
            }
        }

        let parentUid = parent ? String(parent.id) : cleanParentCode;
        let parentName = parent ? parent.name : 'Parent';

        // 2. Check if already connected
        const existing = await db.get(
            `SELECT id FROM student_parent_connections 
             WHERE (student_uid = ? OR student_code = ?) AND (parent_uid = ? OR parent_code = ?)`,
            [studentUid, studentCode, parentUid, cleanParentCode]
        );

        if (existing) {
            return res.json({
                message: 'Already connected.',
                alreadyConnected: true,
                parent: { name: parentName, parentCode: cleanParentCode }
            });
        }

        // 3. Insert connection into SQLite
        const connId = `${studentUid}_${parentUid}`;
        await db.run(
            `INSERT INTO student_parent_connections (student_uid, parent_uid, student_code, parent_code, parent_name, student_name, status)
             VALUES (?, ?, ?, ?, ?, ?, 'active')
             ON CONFLICT(student_uid, parent_uid) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP`,
            [studentUid, parentUid, studentCode, cleanParentCode, parentName, student.name]
        );

        if (parent && typeof parent.id === 'number') {
            await db.run(
                `INSERT INTO parent_links (parent_user_id, student_id, status)
                 VALUES (?, ?, 'accepted')
                 ON CONFLICT(parent_user_id, student_id) DO UPDATE SET status = 'accepted'`,
                [parent.id, student.student_id]
            ).catch(() => {});
        }

        // 4. Enqueue into sync_queue
        const payload = {
            studentUid,
            parentUid,
            studentCode,
            parentCode: cleanParentCode,
            studentName: student.name,
            parentName,
            status: 'active',
            createdAt: new Date().toISOString()
        };

        await db.run(
            `INSERT INTO sync_queue (firebase_uid, entity_type, entity_id, operation, payload, status)
             VALUES (?, 'student_parent_connection', ?, 'upsert', ?, 'pending')`,
            [studentUid, connId, JSON.stringify(payload)]
        ).catch(() => {});

        res.json({
            message: 'Parent Connected ✓',
            parent: { name: parentName, parentCode: cleanParentCode },
            connectionId: connId
        });
    } catch (err) {
        console.error('[CONNECTIONS API] Link parent error:', err);
        res.status(500).json({ error: 'Error connecting parent: ' + err.message });
    }
});

// POST /api/connections/teacher - Connect student to teacher via teacherCode
router.post('/teacher', async (req, res) => {
    try {
        const db = getDb(req);
        const { teacherCode } = req.body;
        if (!teacherCode || !teacherCode.trim()) {
            return res.status(400).json({ error: 'Teacher code is required.' });
        }

        const cleanTeacherCode = teacherCode.trim().toUpperCase();
        const student = await resolveStudent(db, req.user?.id, req.user?.uid);
        const studentUid = String(req.user?.uid || student.student_code || student.user_id);
        const studentCode = student.student_code || req.user?.student_code || `STU-${student.student_id}`;

        // 1. Find teacher in local DB or Firestore
        let teacher = await db.get(
            `SELECT u.id, u.name, u.email, u.teacher_code, u.subject, t.subject as t_subject
             FROM users u
             LEFT JOIN teachers t ON u.id = t.user_id
             WHERE (u.teacher_code = ? OR UPPER(u.email) = ? OR u.id = ?) AND u.role = 'teacher'`,
            [cleanTeacherCode, cleanTeacherCode, cleanTeacherCode]
        );

        if (!teacher) {
            // Online Firestore Lookup Fallback
            try {
                const https = require('https');
                const apiKey = "AIzaSyBOgNWBVqSYfMypeZS8NwRLOYpq7DY3-ls";
                const projectId = "smartslate-bd117";
                
                const qRes = await new Promise((resolve) => {
                    const reqFs = https.request({
                        hostname: 'firestore.googleapis.com',
                        path: `/v1/projects/${projectId}/databases/(default)/documents:runQuery`,
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    }, (resFs) => {
                        let body = '';
                        resFs.on('data', chunk => body += chunk);
                        resFs.on('end', () => {
                            try {
                                const parsed = JSON.parse(body);
                                resolve(parsed);
                            } catch (e) { resolve([]); }
                        });
                    });
                    reqFs.on('error', () => resolve([]));
                    reqFs.write(JSON.stringify({
                        structuredQuery: {
                            from: [{ collectionId: 'teachers' }],
                            where: {
                                fieldFilter: {
                                    field: { fieldPath: 'teacherCode' },
                                    op: 'EQUAL',
                                    value: { stringValue: cleanTeacherCode }
                                }
                            },
                            limit: 1
                        }
                    }));
                    reqFs.end();
                });

                if (Array.isArray(qRes) && qRes[0]?.document?.fields) {
                    const fields = qRes[0].document.fields;
                    const docName = qRes[0].document.name;
                    const tUid = docName.split('/').pop();
                    const tName = fields.name?.stringValue || 'Teacher';
                    const tSubject = fields.subject?.stringValue || 'Mathematics';
                    const tEmail = fields.email?.stringValue || `teacher_${cleanTeacherCode.toLowerCase()}@smartslate.test`;

                    const ins = await db.run(
                        `INSERT INTO users (name, email, role, teacher_code, subject)
                         VALUES (?, ?, 'teacher', ?, ?)
                         ON CONFLICT(email) DO UPDATE SET teacher_code = excluded.teacher_code, subject = excluded.subject`,
                        [tName, tEmail, cleanTeacherCode, tSubject]
                    ).catch(() => ({ id: tUid }));

                    teacher = { id: ins?.id || tUid, name: tName, email: tEmail, teacher_code: cleanTeacherCode, subject: tSubject };
                }
            } catch (fsErr) {
                console.warn('[CONNECTIONS] Firestore teacher lookup error:', fsErr.message);
            }
        }

        let teacherUid = teacher ? String(teacher.id) : cleanTeacherCode;
        let teacherName = teacher ? teacher.name : 'Teacher';
        let subject = teacher ? (teacher.subject || teacher.t_subject || 'General') : 'General';

        // 2. Check if already connected
        const existing = await db.get(
            `SELECT id FROM student_teacher_connections 
             WHERE (student_uid = ? OR student_code = ?) AND (teacher_uid = ? OR teacher_code = ?)`,
            [studentUid, studentCode, teacherUid, cleanTeacherCode]
        );

        if (existing) {
            return res.json({
                message: 'Already connected.',
                alreadyConnected: true,
                teacher: { name: teacherName, teacherCode: cleanTeacherCode, subject }
            });
        }

        // 3. Insert connection into SQLite
        const connId = `${studentUid}_${teacherUid}`;
        await db.run(
            `INSERT INTO student_teacher_connections (student_uid, teacher_uid, student_code, teacher_code, teacher_name, student_name, subject, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
             ON CONFLICT(student_uid, teacher_uid) DO UPDATE SET status = 'active', updated_at = CURRENT_TIMESTAMP`,
            [studentUid, teacherUid, studentCode, cleanTeacherCode, teacherName, student.name, subject]
        );

        // 4. Enqueue into sync_queue
        const payload = {
            studentUid,
            teacherUid,
            studentCode,
            teacherCode: cleanTeacherCode,
            studentName: student.name,
            teacherName,
            subject,
            status: 'active',
            createdAt: new Date().toISOString()
        };

        await db.run(
            `INSERT INTO sync_queue (firebase_uid, entity_type, entity_id, operation, payload, status)
             VALUES (?, 'student_teacher_connection', ?, 'upsert', ?, 'pending')`,
            [studentUid, connId, JSON.stringify(payload)]
        ).catch(() => {});

        res.json({
            message: 'Teacher Connected ✓',
            teacher: { name: teacherName, teacherCode: cleanTeacherCode, subject },
            connectionId: connId
        });
    } catch (err) {
        console.error('[CONNECTIONS API] Link teacher error:', err);
        res.status(500).json({ error: 'Error connecting teacher: ' + err.message });
    }
});

// GET /api/connections/teachers - List available teachers to connect with
router.get('/teachers', async (req, res) => {
    try {
        const db = getDb(req);
        const teachers = await db.all(
            `SELECT u.id, u.name, u.teacher_code, u.subject, t.subject as t_subject
             FROM users u
             LEFT JOIN teachers t ON u.id = t.user_id
             WHERE u.role = 'teacher'
             ORDER BY u.name ASC`
        ).catch(() => []);

        const result = teachers.map(t => ({
            id: t.id,
            name: t.name,
            teacherCode: t.teacher_code || `TCH-${t.id}`,
            subject: t.subject || t.t_subject || 'General'
        }));

        res.json({ teachers: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
