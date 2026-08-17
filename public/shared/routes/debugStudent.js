const express = require('express');
const router = express.Router();
const https = require('https');
const { get } = require('../db/database');
const { firebaseConfig } = require('../firebase/firebaseConfig');

const apiKey = firebaseConfig.apiKey;
const projectId = firebaseConfig.projectId || 'smartslate-bd117';

function fetchFirestoreStudent(uid, token) {
    return new Promise((resolve) => {
        const urlPath = `/v1/projects/${projectId}/databases/(default)/documents/students/${uid}${apiKey ? '?key=' + apiKey : ''}`;
        const headers = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const req = https.request({
            hostname: 'firestore.googleapis.com',
            path: urlPath,
            method: 'GET',
            headers
        }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    if (data && data.fields) {
                        const fields = {};
                        for (const [k, v] of Object.entries(data.fields)) {
                            fields[k] = v.stringValue || v.integerValue || v.booleanValue || (v.arrayValue ? v.arrayValue.values : v);
                        }
                        resolve(fields);
                    } else {
                        resolve(null);
                    }
                } catch(e) {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.end();
    });
}

function normalizeGrade(g) {
    if (!g) return 'Grade 8';
    const s = String(g).trim();
    if (s.toLowerCase().startsWith('grade')) return s;
    if (s.toLowerCase().startsWith('class')) return s.replace(/class/i, 'Grade').trim();
    const num = s.match(/\d+/);
    return num ? `Grade ${num[0]}` : s;
}

// Development Diagnostic Endpoint: GET /api/debug/student/:uid
router.get('/student/:uid', async (req, res) => {
    try {
        const uid = req.params.uid;
        if (!uid) return res.status(400).json({ error: 'UID is required' });

        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

        // 1. Firebase Profile
        const fbRaw = await fetchFirestoreStudent(uid, token);
        const firebaseProfile = fbRaw ? {
            uid: fbRaw.uid || uid,
            name: fbRaw.name || fbRaw.fullName,
            grade: normalizeGrade(fbRaw.grade || fbRaw.class || fbRaw.className),
            classId: fbRaw.classId || `class-grade-${String(fbRaw.class || '8').replace(/\D/g, '')}-${(fbRaw.section || 'A').toLowerCase()}`,
            className: fbRaw.className || fbRaw.grade || `Class ${fbRaw.class || '8'}`,
            section: (fbRaw.section || 'A').toUpperCase(),
            educationLevel: fbRaw.educationLevel || 'High School'
        } : null;

        // 2. SQLite Profile
        const sqliteUser = await get(
            "SELECT * FROM users WHERE firebase_uid = ? OR id = ? OR student_code = ?",
            [uid, uid, uid]
        ).catch(() => null);

        const sqliteStudent = sqliteUser ? await get(
            "SELECT s.*, c.name as class_table_name, c.section as class_table_section FROM students s LEFT JOIN classes c ON s.class_id = c.id WHERE s.user_id = ? OR s.firebase_uid = ? OR s.student_code = ?",
            [sqliteUser.id, uid, sqliteUser.student_code]
        ).catch(() => null) : null;

        const rawGrade = sqliteStudent?.grade || sqliteStudent?.class_name || sqliteStudent?.class_table_name || (firebaseProfile ? firebaseProfile.grade : 'Grade 8');
        const sqliteProfile = sqliteUser ? {
            uid: sqliteUser.firebase_uid || uid,
            name: sqliteUser.name,
            grade: normalizeGrade(rawGrade),
            classId: sqliteStudent?.class_id_str || (firebaseProfile ? firebaseProfile.classId : 'class-grade-8-a'),
            section: (sqliteStudent?.section || sqliteStudent?.class_table_section || 'A').toUpperCase(),
            educationLevel: sqliteStudent?.education_level || (firebaseProfile ? firebaseProfile.educationLevel : 'High School')
        } : null;

        // 3. Teacher View (what teacher queries)
        const teacherView = {
            grade: sqliteProfile ? sqliteProfile.grade : (firebaseProfile ? firebaseProfile.grade : 'Grade 8'),
            classId: sqliteProfile ? sqliteProfile.classId : (firebaseProfile ? firebaseProfile.classId : 'class-grade-8-a'),
            section: sqliteProfile ? sqliteProfile.section : (firebaseProfile ? firebaseProfile.section : 'A'),
            educationLevel: sqliteProfile ? sqliteProfile.educationLevel : (firebaseProfile ? firebaseProfile.educationLevel : 'High School')
        };

        // 4. Parent View (what parent queries)
        const parentView = {
            grade: sqliteProfile ? sqliteProfile.grade : (firebaseProfile ? firebaseProfile.grade : 'Grade 8'),
            classId: sqliteProfile ? sqliteProfile.classId : (firebaseProfile ? firebaseProfile.classId : 'class-grade-8-a'),
            section: sqliteProfile ? sqliteProfile.section : (firebaseProfile ? firebaseProfile.section : 'A'),
            educationLevel: sqliteProfile ? sqliteProfile.educationLevel : (firebaseProfile ? firebaseProfile.educationLevel : 'High School')
        };

        const consistent = Boolean(
            firebaseProfile &&
            sqliteProfile &&
            firebaseProfile.grade === sqliteProfile.grade &&
            firebaseProfile.section === sqliteProfile.section &&
            teacherView.grade === firebaseProfile.grade &&
            parentView.grade === firebaseProfile.grade
        );

        res.json({
            uid,
            firebaseProfile,
            sqliteProfile,
            teacherView,
            parentView,
            consistent
        });
    } catch (err) {
        console.error('Debug student endpoint error:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
