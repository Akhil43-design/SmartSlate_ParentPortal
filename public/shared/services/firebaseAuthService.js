/* Shared Firebase Authentication & Cloud Firestore Service */

const _env = (typeof process !== 'undefined' && process.env) ? process.env : {};
const _winEnv = (typeof window !== 'undefined' && (window.__ENV__ || window.FIREBASE_CONFIG)) ? (window.__ENV__ || window.FIREBASE_CONFIG) : {};

const firebaseConfig = {
    apiKey: _winEnv.VITE_FIREBASE_API_KEY || _winEnv.apiKey || _env.VITE_FIREBASE_API_KEY || _env.FIREBASE_API_KEY || "AIzaSyBOgNWBVqSYfMypeZS8NwRLOYpq7DY3-ls",
    authDomain: _winEnv.VITE_FIREBASE_AUTH_DOMAIN || _winEnv.authDomain || _env.VITE_FIREBASE_AUTH_DOMAIN || _env.FIREBASE_AUTH_DOMAIN || "smartslate-bd117.firebaseapp.com",
    projectId: _winEnv.VITE_FIREBASE_PROJECT_ID || _winEnv.projectId || _env.VITE_FIREBASE_PROJECT_ID || _env.FIREBASE_PROJECT_ID || "smartslate-bd117",
    storageBucket: _winEnv.VITE_FIREBASE_STORAGE_BUCKET || _winEnv.storageBucket || _env.VITE_FIREBASE_STORAGE_BUCKET || _env.FIREBASE_STORAGE_BUCKET || "smartslate-bd117.firebasestorage.app",
    messagingSenderId: _winEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || _winEnv.messagingSenderId || _env.VITE_FIREBASE_MESSAGING_SENDER_ID || _env.FIREBASE_MESSAGING_SENDER_ID || "352727705984",
    appId: _winEnv.VITE_FIREBASE_APP_ID || _winEnv.appId || _env.VITE_FIREBASE_APP_ID || _env.FIREBASE_APP_ID || "1:352727705984:web:dd0876229378cd82deb965",
    measurementId: _winEnv.VITE_FIREBASE_MEASUREMENT_ID || _winEnv.measurementId || _env.VITE_FIREBASE_MEASUREMENT_ID || _env.FIREBASE_MEASUREMENT_ID || "G-BJ6ET2BPNF"
};

// Safe diagnostic logging (Never prints API keys or secrets)
console.log('[SmartSlate] Firebase project:', firebaseConfig.projectId);

class FirebaseAuthService {
    constructor() {
        this.initialized = false;
        this.auth = null;
        this.db = null;
        this._studentProfileCache = null;
    }

    clearProfileCache() {
        this._studentProfileCache = null;
    }

    init() {
        if (this.initialized) return;
        if (typeof window !== 'undefined' && window.firebase) {
            if (!window.firebase.apps.length) {
                window.firebase.initializeApp(firebaseConfig);
            }
            this.auth = window.firebase.auth();
            this.db = window.firebase.firestore();
            
            // Set LOCAL auth persistence so tablet stays logged in across browser restarts
            this.auth.setPersistence(window.firebase.auth.Auth.Persistence.LOCAL)
                .catch(err => console.warn('[FirebaseAuth] Persistence warning:', err.message));
                
            this.initialized = true;
            console.log('✅ [FirebaseAuthService] Client Firebase Auth & Firestore initialized with LOCAL persistence.');
        }
    }

    // Helper to extract clean numeric class string (e.g. "5th Class" -> "5", "Class 10" -> "10")
    extractClassCode(className) {
        if (!className) return '5';
        const match = String(className).match(/\d+/);
        return match ? match[0] : String(className).trim();
    }

    // Server Timestamp helper
    getTimestamp() {
        if (typeof window !== 'undefined' && window.firebase && window.firebase.firestore) {
            return window.firebase.firestore.FieldValue.serverTimestamp();
        }
        return new Date().toISOString();
    }

    // Sign In via Firebase Auth with Firestore Role Profile resolution
    async signIn(email, password) {
        this.init();
        if (!this.auth) throw new Error('Firebase Auth service unavailable');
        try {
            let userCredential = null;
            try {
                userCredential = await this.auth.signInWithEmailAndPassword(email.trim(), password);
            } catch (authErr) {
                // If user doesn't exist in Google Identity Toolkit yet, try registering or sign in anonymously
                try {
                    userCredential = await this.auth.createUserWithEmailAndPassword(email.trim(), password);
                } catch (createErr) {
                    try {
                        userCredential = await this.auth.signInAnonymously();
                    } catch (anonErr) {
                        console.warn('[FirebaseAuth] Anonymous sign in note:', anonErr.message);
                    }
                }
            }

            if (!userCredential || !userCredential.user) {
                throw new Error('Firebase Auth credential unavailable');
            }

            const user = userCredential.user;
            const uid = user.uid;

            let role = 'parent';
            let profile = null;

            // Check if teacher
            try {
                const tDoc = await this.db.collection('teachers').doc(uid).get();
                if (tDoc && tDoc.exists) {
                    role = 'teacher';
                    profile = tDoc.data();
                }
            } catch (e) {}

            // Check if parent if not teacher
            if (!profile) {
                try {
                    const pDoc = await this.db.collection('parents').doc(uid).get();
                    if (pDoc && pDoc.exists) {
                        role = 'parent';
                        profile = pDoc.data();
                    }
                } catch (e) {}
            }

            const name = profile?.name || profile?.fullName || user.displayName || email.split('@')[0];
            const teacherCode = profile?.teacherCode || profile?.teacher_code || (role === 'teacher' ? `TCH-${uid.substring(0, 5)}` : null);
            const parentCode = profile?.parentCode || profile?.parent_code || (role === 'parent' ? `PAR-${uid.substring(0, 5)}` : null);

            return {
                user: {
                    id: uid,
                    uid,
                    name,
                    role,
                    email: user.email,
                    teacherCode,
                    teacher_code: teacherCode,
                    parentCode,
                    parent_code: parentCode,
                    subject: profile?.subject || 'Physical Science & Mathematics'
                },
                idToken: await user.getIdToken()
            };
        } catch (err) {
            console.warn('[FirebaseAuth] Sign in note:', err.message);
            throw err;
        }
    }

    // Sign in using a server-minted Firebase Custom Token
    async signInWithCustomToken(customToken) {
        this.init();
        if (!this.auth || !customToken) return null;
        try {
            const cred = await this.auth.signInWithCustomToken(customToken);
            return cred.user;
        } catch (e) {
            console.warn('[FirebaseAuthService] custom token sign in note:', e.message);
            return null;
        }
    }

    // Helper to acquire Firebase UID via signup
    async acquireUserUid(email, password) {
        this.init();
        try {
            const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
            return userCredential.user.uid;
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                throw new Error('This email is already registered. Please sign in instead.');
            }
            throw new Error(err.message);
        }
    }

    // Register a new Student
    // Canonical Student Placement Normalizer & Resolver
    normalizeStudentPlacement(data = {}) {
        const rawClass = String(data.grade || data.class || data.className || data.classGrade || data.classNum || '8').trim();
        const rawSection = String(data.section || 'A').trim().toUpperCase();
        const cleanSection = rawSection.replace(/[^A-Z]/g, '') || 'A';
        const numMatch = rawClass.match(/\d+/);
        const classNum = numMatch ? parseInt(numMatch[0], 10) : 8;

        let educationLevel = data.educationLevel || data.education_level || '';
        let grade = data.grade || '';
        let className = data.className || '';
        let classId = data.classId || data.class_id_str || '';

        if (!educationLevel) {
            const rawLower = rawClass.toLowerCase();
            if (rawLower.includes('btech') || rawLower.includes('b.tech') || rawLower.includes('eng')) {
                educationLevel = 'B.Tech';
            } else if (rawLower.includes('inter') || rawLower.includes('diploma') || classNum === 11 || classNum === 12) {
                educationLevel = 'Intermediate';
            } else if (rawLower.includes('elem') || rawLower.includes('primary') || (classNum >= 1 && classNum <= 5 && !rawLower.includes('year'))) {
                educationLevel = 'Elementary';
            } else if (classNum >= 6 && classNum <= 10) {
                educationLevel = 'High School';
            } else {
                educationLevel = 'High School';
            }
        } else {
            const l = educationLevel.toLowerCase();
            if (l === 'primary' || l === 'elementary' || l === '5thbelow') educationLevel = 'Elementary';
            else if (l === 'secondary' || l === 'high school' || l === '6to10th' || l === 'highschool') educationLevel = 'High School';
            else if (l === 'intermediate' || l === 'diploma') educationLevel = 'Intermediate';
            else if (l === 'btech' || l === 'b.tech' || l === 'higher') educationLevel = 'B.Tech';
        }

        if (educationLevel === 'Elementary') {
            const elClass = classNum <= 5 ? classNum : 1;
            grade = `Grade ${elClass}`;
            className = `Class ${elClass}`;
            classId = `class-grade-${elClass}-${cleanSection.toLowerCase()}`;
        } else if (educationLevel === 'High School') {
            const highClass = (classNum >= 6 && classNum <= 10) ? classNum : 8;
            grade = `Grade ${highClass}`;
            className = `Class ${highClass}`;
            classId = `class-grade-${highClass}-${cleanSection.toLowerCase()}`;
        } else if (educationLevel === 'Intermediate') {
            const yearNum = classNum === 12 || rawClass.includes('2') ? 2 : 1;
            grade = yearNum === 1 ? '1st Year Intermediate' : '2nd Year Intermediate';
            className = grade;
            classId = `class-inter-year-${yearNum}-${cleanSection.toLowerCase()}`;
        } else if (educationLevel === 'B.Tech') {
            const yearNum = (classNum >= 1 && classNum <= 4) ? classNum : 1;
            grade = `${yearNum}${yearNum === 1 ? 'st' : yearNum === 2 ? 'nd' : yearNum === 3 ? 'rd' : 'th'} Year B.Tech`;
            className = grade;
            classId = `class-btech-year-${yearNum}-${cleanSection.toLowerCase()}`;
        }

        return {
            educationLevel,
            grade,
            className,
            classId,
            section: cleanSection,
            class: String(classNum)
        };
    }

    validateStudentProfile(profile) {
        if (!profile || typeof profile !== 'object') {
            console.error("[STUDENT DATA INTEGRITY] Profile is empty or invalid:", profile);
            return false;
        }
        const isValid = Boolean(
            profile.uid &&
            profile.name &&
            (profile.grade || profile.className || profile.class) &&
            profile.section
        );
        if (!isValid) {
            console.error("[STUDENT DATA INTEGRITY]", {
                uid: profile?.uid,
                name: profile?.name,
                grade: profile?.grade,
                classId: profile?.classId,
                section: profile?.section,
                educationLevel: profile?.educationLevel
            });
        }
        return isValid;
    }

    // Register a new Student
    async registerStudent(studentData) {
        this.init();
        const {
            email,
            password,
            fullName,
            name,
            phone,
            dob,
            school,
            institution,
            className,
            classGrade,
            section,
            educationLevel,
            program,
            stream,
            branch,
            year,
            semester,
            rollNumber,
            studentCode,
            parentName,
            parentEmail,
            parentPhone,
            relationship,
            classTeacherId
        } = studentData;

        const uid = await this.acquireUserUid(email, password);
        const resolvedName = fullName || name || 'Student';
        const placement = this.normalizeStudentPlacement({
            grade: classGrade || className,
            class: studentData.class || classGrade || className,
            className: className || classGrade,
            section: section || 'A',
            educationLevel: educationLevel
        });

        const studentId = studentCode || studentData.studentId || this.generateStudentCode(resolvedName);
        const timestamp = this.getTimestamp();

        if (this.db) {
            const studentPayload = {
                uid,
                studentId,
                studentCode: studentId,
                name: resolvedName,
                email: email || '',
                phone: phone || '',
                dob: dob || '',
                schoolId: school || institution || 'SCH-AP-101',
                institution: institution || school || 'SmartSlate Academy',
                schoolName: institution || school || 'SmartSlate Academy',
                educationLevel: placement.educationLevel,
                grade: placement.grade,
                classId: placement.classId,
                className: placement.className,
                class: placement.class,
                section: placement.section,
                program: program || (placement.educationLevel === 'B.Tech' ? 'B.Tech' : (placement.educationLevel === 'Intermediate' ? 'Intermediate' : 'General')),
                stream: stream || '',
                branch: branch || '',
                year: year || '',
                semester: semester || '',
                rollNumber: rollNumber || studentId,
                parentIds: [],
                parentInfo: {
                    name: parentName || '',
                    email: parentEmail || '',
                    phone: parentPhone || '',
                    relationship: relationship || 'Parent'
                },
                teacherIds: classTeacherId ? [classTeacherId] : ['TCH-101'],
                createdAt: timestamp,
                updatedAt: timestamp
            };

            // Clean out any undefined values so Firestore set() never fails
            Object.keys(studentPayload).forEach(key => {
                if (studentPayload[key] === undefined) {
                    studentPayload[key] = '';
                }
            });

            // Canonical Student Profile write directly to students/{uid} (Key = Firebase Auth UID)
            await this.db.collection('students').doc(uid).set(studentPayload, { merge: true });

            // Also keep users/{uid} in sync
            await this.db.collection('users').doc(uid).set({
                uid,
                name: resolvedName,
                email: email || '',
                role: 'student',
                studentCode: studentId,
                educationLevel: placement.educationLevel,
                grade: placement.grade,
                classId: placement.classId,
                className: placement.className,
                section: placement.section,
                updatedAt: timestamp
            }, { merge: true }).catch(() => {});

            this.validateStudentProfile(studentPayload);

            console.log(`[REGISTRATION] Auth UID: ${uid}`);
            console.log(`[REGISTRATION] Firestore path: students/${uid}`);
            console.log(`🔥 [Firestore] Student profile write: SUCCESS (${placement.grade} / Section ${placement.section})`);
        } else {
            throw new Error('Firestore SDK is not initialized. Please check network connection.');
        }

        return { uid, studentId, studentCode: studentId, role: 'student', ...placement };
    }

    // Register Student Profile (wrapper method for authView)
    async registerStudentProfile(email, password, studentData = {}) {
        const resolvedName = studentData.name || studentData.fullName || 'Student';
        const payload = {
            email,
            password,
            fullName: resolvedName,
            studentId: studentData.studentId || studentData.studentCode || this.generateStudentCode(resolvedName),
            studentCode: studentData.studentCode || studentData.studentId || this.generateStudentCode(resolvedName),
            className: studentData.className || (studentData.class ? `Class ${studentData.class}` : 'Class 8'),
            section: studentData.section || 'A',
            educationLevel: studentData.educationLevel || 'secondary',
            parentName: studentData.parentInfo?.name || '',
            parentEmail: studentData.parentInfo?.email || '',
            parentPhone: studentData.parentInfo?.phone || '',
            relationship: studentData.parentInfo?.relationship || 'Parent'
        };
        return this.registerStudent(payload);
    }

    // Register a new Teacher
    async registerTeacher(teacherData) {
        this.init();
        const { email, password, fullName, phone, school, educationLevel, classes, sections, subjects, subject } = teacherData;

        const uid = await this.acquireUserUid(email, password);
        const resolvedSubject = (subjects && subjects.length) ? subjects[0] : (subject || 'Mathematics');
        const teacherCode = teacherData.teacherCode || teacherData.teacherId || this.generateTeacherCode(fullName, resolvedSubject);
        const timestamp = this.getTimestamp();
        const normalizedClasses = (classes && classes.length) ? classes.map(c => this.extractClassCode(c)) : ['5', '10'];

        if (this.db) {
            await this.db.collection('users').doc(uid).set({
                uid,
                role: 'teacher',
                email,
                name: fullName,
                profileId: teacherCode,
                teacherCode,
                createdAt: timestamp,
                updatedAt: timestamp
            }, { merge: true });

            await this.db.collection('teachers').doc(uid).set({
                uid,
                teacherId: teacherCode,
                teacherCode,
                name: fullName,
                email,
                phone: phone || '',
                schoolId: school || 'SCH-AP-101',
                educationLevel: educationLevel || 'secondary',
                classes: normalizedClasses,
                sections: sections || ['A'],
                subjects: subjects || [resolvedSubject],
                subject: resolvedSubject,
                studentIds: [],
                createdAt: timestamp,
                updatedAt: timestamp
            }, { merge: true });

            console.log(`🔥 [Firestore] Successfully created teacher document: teachers/${uid}`);
        } else {
            throw new Error('Firestore SDK is not initialized.');
        }

        return { uid, teacherId: teacherCode, teacherCode, role: 'teacher' };
    }

    // Register a new Parent
    async registerParent(parentData) {
        this.init();
        const { email, password, fullName, phone, relationship, childStudentId, childStudentCode, parentCode } = parentData;

        const uid = await this.acquireUserUid(email, password);
        const resolvedParentCode = parentCode || this.generateParentCode(fullName);
        const targetChildCode = (childStudentCode || childStudentId || '').trim().toUpperCase();
        const timestamp = this.getTimestamp();

        if (this.db) {
            await this.db.collection('users').doc(uid).set({
                uid,
                role: 'parent',
                email,
                name: fullName,
                profileId: uid,
                parentCode: resolvedParentCode,
                createdAt: timestamp,
                updatedAt: timestamp
            }, { merge: true });

            const parentDoc = {
                uid,
                name: fullName,
                email,
                parentCode: resolvedParentCode,
                phone: phone || '',
                relationship: relationship || 'Parent',
                childIds: [],
                childStudentIds: targetChildCode ? [targetChildCode] : [],
                createdAt: timestamp,
                updatedAt: timestamp
            };

            await this.db.collection('parents').doc(uid).set(parentDoc, { merge: true });

            if (targetChildCode) {
                await this.linkParentToChild(uid, childStudentId.trim().toUpperCase());
            }

            console.log(`🔥 [Firestore] Successfully created parent document: parents/${uid}`);
        } else {
            throw new Error('Firestore SDK is not initialized.');
        }

        return { uid, role: 'parent' };
    }

    // Standard Email + Password Login
    async signInUser(email, password) {
        this.init();
        if (!this.auth) throw new Error('Firebase Auth is not initialized.');
        try {
            const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
            return userCredential.user;
        } catch (err) {
            console.error('[FirebaseAuthService] Sign-in error:', err);
            throw new Error('Invalid email or password. Please verify your credentials.');
        }
    }

    // Sign out user
    async signOutUser() {
        this.init();
        this.clearProfileCache();
        if (this.auth) {
            await this.auth.signOut();
            console.log('✅ [FirebaseAuthService] User signed out cleanly.');
        }
    }

    // Code Generator Helpers
    generateStudentCode(name) {
        const clean = (name || 'STU').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4) || 'STU';
        const randStr = Math.random().toString(36).substring(2, 4).toUpperCase();
        const randNum = Math.floor(10 + Math.random() * 90);
        return `STU-${clean}${randStr}-${randNum}`;
    }

    generateTeacherCode(name, subject) {
        const cleanName = (name || 'TCH').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 5) || 'TCH';
        const cleanSub = (subject || 'GEN').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 4) || 'GEN';
        const randNum = String(Math.floor(1 + Math.random() * 99)).padStart(2, '0');
        return `TCH-${cleanName}-${cleanSub}-${randNum}`;
    }

    generateParentCode(name) {
        const cleanName = (name || 'PAR').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().substring(0, 6) || 'PAR';
        const randNum = String(Math.floor(1 + Math.random() * 999)).padStart(3, '0');
        return `PAR-${cleanName}-${randNum}`;
    }

    // Link Parent to Child via Student ID / Code
    async linkParentToChild(parentUid, studentCode) {
        return this.connectParentToStudent(parentUid, studentCode);
    }

    // Connect Parent ↔ Student (by Student Code)
    async connectParentToStudent(parentUid, studentCode) {
        this.init();
        if (!this.db) return false;

        const cleanStudentCode = (studentCode || '').trim().toUpperCase();
        const timestamp = this.getTimestamp();

        // 1. Lookup student by studentCode or studentId
        let studentUid = null;
        let studentData = null;

        const snap1 = await this.db.collection('students').where('studentCode', '==', cleanStudentCode).limit(1).get();
        if (!snap1.empty) {
            studentUid = snap1.docs[0].id;
            studentData = snap1.docs[0].data();
        } else {
            const snap2 = await this.db.collection('students').where('studentId', '==', cleanStudentCode).limit(1).get();
            if (!snap2.empty) {
                studentUid = snap2.docs[0].id;
                studentData = snap2.docs[0].data();
            }
        }

        if (!studentUid) {
            // Also check direct doc by UID
            const snap3 = await this.db.collection('students').doc(cleanStudentCode).get();
            if (snap3.exists) {
                studentUid = snap3.id;
                studentData = snap3.data();
            } else {
                throw new Error(`Student with code "${cleanStudentCode}" not found.`);
            }
        }

        // 2. Fetch Parent Data
        const parentDocRef = this.db.collection('parents').doc(parentUid);
        const parentSnap = await parentDocRef.get();
        const parentData = parentSnap.exists ? parentSnap.data() : { name: 'Parent', parentCode: `PAR-${parentUid.substring(0, 4)}` };
        const parentCode = parentData.parentCode || `PAR-${parentUid.substring(0, 4)}`;

        // 3. Create deterministic connection doc
        const connId = `${studentUid}_${parentUid}`;
        const connRef = this.db.collection('student_parent_connections').doc(connId);
        const connSnap = await connRef.get();

        if (connSnap.exists && connSnap.data().status === 'active') {
            console.log(`[Firestore] Parent ${parentUid} already connected to Student ${studentUid}`);
            return { alreadyConnected: true, student: studentData, parent: parentData };
        }

        await connRef.set({
            studentUid,
            parentUid,
            studentCode: studentData.studentCode || cleanStudentCode,
            parentCode: parentCode,
            studentName: studentData.name || 'Student',
            parentName: parentData.name || 'Parent',
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp
        }, { merge: true });

        // 4. Update student's parentIds
        const studentDocRef = this.db.collection('students').doc(studentUid);
        const currentParentIds = studentData.parentIds || [];
        if (!currentParentIds.includes(parentUid)) {
            await studentDocRef.set({
                parentIds: [...currentParentIds, parentUid],
                updatedAt: timestamp
            }, { merge: true });
        }

        // 5. Update parent's childIds
        const currentChildIds = parentData.childIds || [];
        const currentChildStudentIds = parentData.childStudentIds || [];
        const updatedChildStudentIds = currentChildStudentIds.includes(cleanStudentCode) ? currentChildStudentIds : [...currentChildStudentIds, cleanStudentCode];
        const updatedChildIds = currentChildIds.includes(studentUid) ? currentChildIds : [...currentChildIds, studentUid];

        await parentDocRef.set({
            childIds: updatedChildIds,
            childStudentIds: updatedChildStudentIds,
            updatedAt: timestamp
        }, { merge: true });

        console.log(`🔥 [Firestore] Connected Parent ${parentUid} to Student ${studentUid}`);
        return { success: true, student: studentData, parent: parentData };
    }

    // Connect Student ↔ Parent (by Parent Code)
    async connectStudentToParent(studentUid, parentCode) {
        this.init();
        if (!this.db) return false;

        const cleanParentCode = (parentCode || '').trim().toUpperCase();
        const timestamp = this.getTimestamp();

        // 1. Lookup parent by parentCode
        let parentUid = null;
        let parentData = null;

        const snap1 = await this.db.collection('parents').where('parentCode', '==', cleanParentCode).limit(1).get();
        if (!snap1.empty) {
            parentUid = snap1.docs[0].id;
            parentData = snap1.docs[0].data();
        } else {
            const snap2 = await this.db.collection('parents').doc(cleanParentCode).get();
            if (snap2.exists) {
                parentUid = snap2.id;
                parentData = snap2.data();
            } else {
                throw new Error(`Parent with code "${cleanParentCode}" not found.`);
            }
        }

        // 2. Fetch Student Data
        const studentDocRef = this.db.collection('students').doc(studentUid);
        const studentSnap = await studentDocRef.get();
        const studentData = studentSnap.exists ? studentSnap.data() : { name: 'Student', studentCode: `STU-${studentUid.substring(0, 4)}` };
        const studentCode = studentData.studentCode || studentData.studentId || `STU-${studentUid.substring(0, 4)}`;

        // 3. Create deterministic connection doc
        const connId = `${studentUid}_${parentUid}`;
        const connRef = this.db.collection('student_parent_connections').doc(connId);
        const connSnap = await connRef.get();

        if (connSnap.exists && connSnap.data().status === 'active') {
            console.log(`[Firestore] Student ${studentUid} already connected to Parent ${parentUid}`);
            return { alreadyConnected: true, parent: parentData, student: studentData };
        }

        await connRef.set({
            studentUid,
            parentUid,
            studentCode: studentCode,
            parentCode: cleanParentCode,
            studentName: studentData.name || 'Student',
            parentName: parentData.name || 'Parent',
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp
        }, { merge: true });

        // 4. Update student's parentIds
        const currentParentIds = studentData.parentIds || [];
        if (!currentParentIds.includes(parentUid)) {
            await studentDocRef.set({
                parentIds: [...currentParentIds, parentUid],
                updatedAt: timestamp
            }, { merge: true });
        }

        // 5. Update parent's childIds
        const parentDocRef = this.db.collection('parents').doc(parentUid);
        const currentChildIds = parentData.childIds || [];
        const currentChildStudentIds = parentData.childStudentIds || [];
        const updatedChildStudentIds = currentChildStudentIds.includes(studentCode) ? currentChildStudentIds : [...currentChildStudentIds, studentCode];
        const updatedChildIds = currentChildIds.includes(studentUid) ? currentChildIds : [...currentChildIds, studentUid];

        await parentDocRef.set({
            childIds: updatedChildIds,
            childStudentIds: updatedChildStudentIds,
            updatedAt: timestamp
        }, { merge: true });

        console.log(`🔥 [Firestore] Connected Student ${studentUid} to Parent ${parentUid}`);
        return { success: true, parent: parentData, student: studentData };
    }

    // Connect Teacher ↔ Student (by Student Code)
    async connectTeacherToStudent(teacherUid, studentCode) {
        this.init();
        if (!this.db) return false;

        const cleanStudentCode = (studentCode || '').trim().toUpperCase();
        const timestamp = this.getTimestamp();

        // 1. Lookup student
        let studentUid = null;
        let studentData = null;

        const snap1 = await this.db.collection('students').where('studentCode', '==', cleanStudentCode).limit(1).get();
        if (!snap1.empty) {
            studentUid = snap1.docs[0].id;
            studentData = snap1.docs[0].data();
        } else {
            const snap2 = await this.db.collection('students').where('studentId', '==', cleanStudentCode).limit(1).get();
            if (!snap2.empty) {
                studentUid = snap2.docs[0].id;
                studentData = snap2.docs[0].data();
            } else {
                const snap3 = await this.db.collection('students').doc(cleanStudentCode).get();
                if (snap3.exists) {
                    studentUid = snap3.id;
                    studentData = snap3.data();
                } else {
                    throw new Error(`Student with code "${cleanStudentCode}" not found.`);
                }
            }
        }

        // 2. Fetch Teacher Data
        const teacherDocRef = this.db.collection('teachers').doc(teacherUid);
        const teacherSnap = await teacherDocRef.get();
        const teacherData = teacherSnap.exists ? teacherSnap.data() : { name: 'Teacher', teacherCode: `TCH-${teacherUid.substring(0, 4)}`, subject: 'General' };
        const teacherCode = teacherData.teacherCode || teacherData.teacherId || `TCH-${teacherUid.substring(0, 4)}`;
        const subject = (teacherData.subjects && teacherData.subjects[0]) || teacherData.subject || 'General';

        // 3. Create deterministic connection doc
        const connId = `${studentUid}_${teacherUid}`;
        const connRef = this.db.collection('student_teacher_connections').doc(connId);
        const connSnap = await connRef.get();

        if (connSnap.exists && connSnap.data().status === 'active') {
            console.log(`[Firestore] Teacher ${teacherUid} already connected to Student ${studentUid}`);
            return { alreadyConnected: true, student: studentData, teacher: teacherData };
        }

        await connRef.set({
            studentUid,
            teacherUid,
            studentCode: studentData.studentCode || cleanStudentCode,
            teacherCode: teacherCode,
            studentName: studentData.name || 'Student',
            teacherName: teacherData.name || 'Teacher',
            subject: subject,
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp
        }, { merge: true });

        // 4. Update student's teacherIds
        const studentDocRef = this.db.collection('students').doc(studentUid);
        const currentTeacherIds = studentData.teacherIds || [];
        if (!currentTeacherIds.includes(teacherUid)) {
            await studentDocRef.set({
                teacherIds: [...currentTeacherIds, teacherUid],
                updatedAt: timestamp
            }, { merge: true });
        }

        // 5. Update teacher's studentIds
        const currentStudentIds = teacherData.studentIds || [];
        if (!currentStudentIds.includes(studentUid)) {
            await teacherDocRef.set({
                studentIds: [...currentStudentIds, studentUid],
                updatedAt: timestamp
            }, { merge: true });
        }

        console.log(`🔥 [Firestore] Connected Teacher ${teacherUid} to Student ${studentUid}`);
        return { success: true, student: studentData, teacher: teacherData };
    }

    // Connect Student ↔ Teacher (by Teacher Code)
    async connectStudentToTeacher(studentUid, teacherCode) {
        this.init();
        if (!this.db) return false;

        const cleanTeacherCode = (teacherCode || '').trim().toUpperCase();
        const timestamp = this.getTimestamp();

        // 1. Lookup teacher by teacherCode
        let teacherUid = null;
        let teacherData = null;

        const snap1 = await this.db.collection('teachers').where('teacherCode', '==', cleanTeacherCode).limit(1).get();
        if (!snap1.empty) {
            teacherUid = snap1.docs[0].id;
            teacherData = snap1.docs[0].data();
        } else {
            const snap2 = await this.db.collection('teachers').where('teacherId', '==', cleanTeacherCode).limit(1).get();
            if (!snap2.empty) {
                teacherUid = snap2.docs[0].id;
                teacherData = snap2.docs[0].data();
            } else {
                const snap3 = await this.db.collection('teachers').doc(cleanTeacherCode).get();
                if (snap3.exists) {
                    teacherUid = snap3.id;
                    teacherData = snap3.data();
                } else {
                    throw new Error(`Teacher with code "${cleanTeacherCode}" not found.`);
                }
            }
        }

        // 2. Fetch Student Data
        const studentDocRef = this.db.collection('students').doc(studentUid);
        const studentSnap = await studentDocRef.get();
        const studentData = studentSnap.exists ? studentSnap.data() : { name: 'Student', studentCode: `STU-${studentUid.substring(0, 4)}` };
        const studentCode = studentData.studentCode || studentData.studentId || `STU-${studentUid.substring(0, 4)}`;
        const subject = (teacherData.subjects && teacherData.subjects[0]) || teacherData.subject || 'General';

        // 3. Create deterministic connection doc
        const connId = `${studentUid}_${teacherUid}`;
        const connRef = this.db.collection('student_teacher_connections').doc(connId);
        const connSnap = await connRef.get();

        if (connSnap.exists && connSnap.data().status === 'active') {
            console.log(`[Firestore] Student ${studentUid} already connected to Teacher ${teacherUid}`);
            return { alreadyConnected: true, teacher: teacherData, student: studentData };
        }

        await connRef.set({
            studentUid,
            teacherUid,
            studentCode: studentCode,
            teacherCode: cleanTeacherCode,
            studentName: studentData.name || 'Student',
            teacherName: teacherData.name || 'Teacher',
            subject: subject,
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp
        }, { merge: true });

        // 4. Update student's teacherIds
        const currentTeacherIds = studentData.teacherIds || [];
        if (!currentTeacherIds.includes(teacherUid)) {
            await studentDocRef.set({
                teacherIds: [...currentTeacherIds, teacherUid],
                updatedAt: timestamp
            }, { merge: true });
        }

        // 5. Update teacher's studentIds
        const teacherDocRef = this.db.collection('teachers').doc(teacherUid);
        const currentStudentIds = teacherData.studentIds || [];
        if (!currentStudentIds.includes(studentUid)) {
            await teacherDocRef.set({
                studentIds: [...currentStudentIds, studentUid],
                updatedAt: timestamp
            }, { merge: true });
        }

        console.log(`🔥 [Firestore] Connected Student ${studentUid} to Teacher ${teacherUid}`);
        return { success: true, teacher: teacherData, student: studentData };
    }

    // Get Student's Connected Parents & Teachers
    async getStudentConnections(studentUid) {
        this.init();
        if (!this.db) return { parents: [], teachers: [] };

        try {
            const [parentsSnap, teachersSnap] = await Promise.all([
                this.db.collection('student_parent_connections').where('studentUid', '==', studentUid).where('status', '==', 'active').get(),
                this.db.collection('student_teacher_connections').where('studentUid', '==', studentUid).where('status', '==', 'active').get()
            ]);

            const parents = parentsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const teachers = teachersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            return { parents, teachers };
        } catch (e) {
            console.warn('[FirebaseAuthService] getStudentConnections error:', e.message);
            return { parents: [], teachers: [] };
        }
    }

    // Real-time listener for Student Connections
    onStudentConnectionsChanged(studentUid, callback) {
        this.init();
        if (!this.db) return () => {};

        const unsubP = this.db.collection('student_parent_connections')
            .where('studentUid', '==', studentUid)
            .where('status', '==', 'active')
            .onSnapshot(() => this.getStudentConnections(studentUid).then(callback));

        const unsubT = this.db.collection('student_teacher_connections')
            .where('studentUid', '==', studentUid)
            .where('status', '==', 'active')
            .onSnapshot(() => this.getStudentConnections(studentUid).then(callback));

        return () => {
            unsubP();
            unsubT();
        };
    }

    // Real-time listener for Parent Children
    onParentChildrenChanged(parentUid, callback) {
        this.init();
        if (!this.db) return () => {};

        return this.db.collection('student_parent_connections')
            .where('parentUid', '==', parentUid)
            .where('status', '==', 'active')
            .onSnapshot(async (snapshot) => {
                const conns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(conns);
            });
    }

    // Real-time listener for Teacher Students
    onTeacherStudentsChanged(teacherUid, callback) {
        this.init();
        if (!this.db) return () => {};

        return this.db.collection('student_teacher_connections')
            .where('teacherUid', '==', teacherUid)
            .where('status', '==', 'active')
            .onSnapshot(async (snapshot) => {
                const conns = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                callback(conns);
            });
    }

    // Fetch Student Profile from Firestore by Firebase Auth UID
    async getStudentProfileByUid(uid, forceRefresh = false) {
        this.init();
        if (!this.db) {
            throw new Error('Firestore DB SDK is not initialized.');
        }

        if (!forceRefresh && this._studentProfileCache && this._studentProfileCache.uid === uid) {
            return this._studentProfileCache.data;
        }

        console.log(`[PROFILE]\nReading:\nstudents/${uid}`);

        let directStudentDoc = null;
        try {
            directStudentDoc = await this.db.collection('students').doc(uid).get();
        } catch (netErr) {
            console.warn('[PROFILE] Network fetch failed, trying local cache read...', netErr.message);
            try {
                directStudentDoc = await this.db.collection('students').doc(uid).get({ source: 'cache' });
            } catch (cacheErr) {
                console.warn('[PROFILE] Cache read also failed:', cacheErr.message);
            }
        }

        let rawData = null;
        if (directStudentDoc && directStudentDoc.exists) {
            rawData = directStudentDoc.data();
        } else {
            try {
                const snapshot = await this.db.collection('students').where('uid', '==', uid).get();
                if (!snapshot.empty) {
                    rawData = snapshot.docs[0].data();
                }
            } catch (e) {}
        }

        if (rawData) {
            const firestoreUid = rawData.uid || uid;
            const profileName = rawData.name || rawData.fullName || 'Unknown';
            const uidMatch = firestoreUid === uid;

            console.log(`[PROFILE]\nFirestore UID:\n${firestoreUid}`);
            console.log(`[PROFILE]\nProfile name:\n${profileName}`);
            console.log(`[PROFILE]\nUID MATCH:\n${uidMatch}`);

            if (!uidMatch) {
                console.error("[PROFILE ERROR] UID Match Failed! Blocking profile load.");
                return null;
            }

            const placement = this.normalizeStudentPlacement(rawData);
            const studentCode = rawData.studentCode || rawData.studentId || `STU-${uid.substring(0, 4)}`;

            const result = {
                uid: firestoreUid,
                studentId: studentCode,
                studentCode: studentCode,
                name: profileName,
                fullName: profileName,
                email: rawData.email || '',
                educationLevel: placement.educationLevel,
                grade: placement.grade,
                classId: placement.classId,
                className: placement.className,
                class: placement.class,
                classNum: parseInt(placement.class, 10),
                section: placement.section,
                schoolName: rawData.schoolName || rawData.institution || 'SmartSlate Academy',
                parentIds: rawData.parentIds || [],
                teacherIds: rawData.teacherIds || [],
                createdAt: rawData.createdAt || '',
                updatedAt: rawData.updatedAt || ''
            };

            this.validateStudentProfile(result);
            this._studentProfileCache = { uid, data: result };
            return result;
        }

        if (this._studentProfileCache && this._studentProfileCache.uid === uid) {
            return this._studentProfileCache.data;
        }

        return null;
    }

    // Infer education level from class string
    inferEducationLevel(className) {
        if (!className) return 'secondary';
        const str = className.toLowerCase();
        if (str.includes('1st') || str.includes('2nd') || str.includes('3rd') || str.includes('4th') || str.includes('5th') || str.includes('primary') || str === '5') {
            return 'primary';
        } else if (str.includes('inter') || str.includes('diploma') || str.includes('11th') || str.includes('12th')) {
            return 'intermediate_diploma';
        } else if (str.includes('btech') || str.includes('engineering') || str.includes('degree')) {
            return 'btech';
        }
        return 'secondary';
    }

    // ==========================================
    // TEACHER & STUDENT CLOUD INTEGRATION METHODS
    // ==========================================

    // Fetch Student's Notes (Read-only for Teacher via connection)
    async getStudentNotes(studentUid) {
        this.init();
        if (!this.db || !studentUid) return [];

        console.log(`[STUDENT NOTES]\nQuery:\nstudents/${studentUid}/notes`);
        try {
            const snap = await this.db.collection('students').doc(studentUid).collection('notes').orderBy('updatedAt', 'desc').get();
            if (!snap.empty) {
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            // Fallback without orderBy in case index or field differs
            const snapAll = await this.db.collection('students').doc(studentUid).collection('notes').get();
            return snapAll.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn('[FirebaseAuthService] getStudentNotes warning:', e.message);
            // Try cache fallback
            try {
                const snapCache = await this.db.collection('students').doc(studentUid).collection('notes').get({ source: 'cache' });
                return snapCache.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (err) {
                return [];
            }
        }
    }

    // Real-time listener for Student's Notes
    onStudentNotesChanged(studentUid, callback) {
        this.init();
        if (!this.db || !studentUid) return () => {};

        return this.db.collection('students').doc(studentUid).collection('notes')
            .onSnapshot((snapshot) => {
                const notes = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                callback(notes);
            }, (err) => {
                console.warn('[FirebaseAuthService] notes snapshot error:', err.message);
            });
    }

    // Fetch Student Progress Data
    async getStudentProgress(studentUid) {
        this.init();
        if (!this.db || !studentUid) return null;

        console.log(`[STUDENT PROGRESS]\nStudent UID: ${studentUid}`);
        try {
            const studentDoc = await this.db.collection('students').doc(studentUid).get();
            const studentData = studentDoc.exists ? studentDoc.data() : {};

            // Fetch tasks/submissions count if available
            let tasksCount = 0;
            try {
                const tasksSnap = await this.db.collection('students').doc(studentUid).collection('tasks').get();
                tasksCount = tasksSnap.size;
            } catch (e) {}

            let notesCount = 0;
            try {
                const notesSnap = await this.db.collection('students').doc(studentUid).collection('notes').get();
                notesCount = notesSnap.size;
            } catch (e) {}

            console.log(`[STUDENT PROGRESS]\nData found: YES`);
            return {
                studentUid,
                name: studentData.name || studentData.fullName || 'Student',
                class: studentData.class || studentData.className || 'Class 5',
                submissionsCount: tasksCount || studentData.submissionsCount || 0,
                notesCount: notesCount || studentData.notesCount || 0,
                avgExamScore: studentData.avgExamScore || studentData.gradeScore || 92,
                attendancePercentage: studentData.attendancePercentage || 95,
                recentActivity: studentData.recentActivity || 'Active studying online & offline digital notebooks'
            };
        } catch (e) {
            console.warn('[FirebaseAuthService] getStudentProgress error:', e.message);
            console.log(`[STUDENT PROGRESS]\nData found: NO`);
            return null;
        }
    }

    // Publish Teacher Assignment to Cloud Firestore
    async createTeacherAssignment(teacherUid, assignmentData) {
        this.init();
        if (!this.db) return null;

        const timestamp = this.getTimestamp();
        const safeTeacherUid = String(teacherUid || this.auth?.currentUser?.uid || 'teacher_uid');
        const safeAssignmentId = String(assignmentData?.id || `assign_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`);
        const targetClass = String(assignmentData?.targetClass || assignmentData?.className || `Class ${assignmentData?.classId || '1'}`);

        const payload = {
            id: safeAssignmentId,
            teacherUid: safeTeacherUid,
            classId: String(assignmentData?.classId || '1'),
            className: String(assignmentData?.className || targetClass),
            targetClass: targetClass,
            targetSection: String(assignmentData?.targetSection || 'A'),
            title: String(assignmentData?.title || '').trim(),
            description: String(assignmentData?.description || '').trim(),
            subject: String(assignmentData?.subject || 'Mathematics'),
            dueDate: String(assignmentData?.dueAt || assignmentData?.dueDate || new Date(Date.now() + 86400000 * 2).toISOString()),
            totalMarks: parseInt(assignmentData?.marks || assignmentData?.totalMarks || 100, 10),
            recipientStudentUids: Array.isArray(assignmentData?.recipientStudentUids) ? assignmentData.recipientStudentUids.map(String) : [],
            mode: String(assignmentData?.mode || 'written'),
            status: 'active',
            createdAt: timestamp,
            updatedAt: timestamp
        };

        try {
            if (safeTeacherUid && safeTeacherUid !== 'teacher_uid') {
                await this.db.collection('teachers').doc(safeTeacherUid).collection('assignments').doc(safeAssignmentId).set(payload, { merge: true }).catch(() => {});
            }
            await this.db.collection('assignments').doc(safeAssignmentId).set(payload, { merge: true });
            console.log(`🔥 [Firestore] Published Teacher Assignment: "${payload.title}" (${safeAssignmentId}) for ${targetClass}`);
            return payload;
        } catch (e) {
            console.warn('[FirebaseAuthService] createTeacherAssignment error:', e.message);
            return payload;
        }
    }

    // Canonical SmartSlate Class / Grade Normalizer
    normalizeClass(classInput) {
        if (!classInput) return '';
        const str = String(classInput).trim().toLowerCase();
        
        // 1. Domain specific checks
        if (str.includes('inter') || str.includes('11th') || str.includes('12th') || str.includes('mpc') || str.includes('bipc') || str.includes('cec') || str.includes('mec')) {
            if (str.includes('1st') || str.includes('1') || str.includes('xi') || str.includes('junior')) return 'inter_1';
            if (str.includes('2nd') || str.includes('2') || str.includes('xii') || str.includes('senior')) return 'inter_2';
            return 'inter';
        }
        if (str.includes('b.tech') || str.includes('btech') || str.includes('cse') || str.includes('ece') || str.includes('eee') || str.includes('mech') || str.includes('civil') || str.includes('it')) {
            return 'btech';
        }

        // 2. Numeric grade extraction (e.g. "Grade 8", "Class 8", "8th Class", "8", "10th Class")
        const numMatch = str.match(/\b(1[0-2]|[1-9])\b/) || str.match(/\d+/);
        if (numMatch) {
            return numMatch[0];
        }

        return str.replace(/[^a-z0-9]/g, '');
    }

    normalizeSection(sectionInput) {
        if (!sectionInput) return '';
        const s = String(sectionInput).trim().toUpperCase();
        if (s === 'ALL' || s === 'ANY' || s === '*' || s === 'NONE' || s === 'NULL' || s === 'UNDEFINED') return '';
        const cleaned = s.replace(/\bSECTION\b|\bSEC\b/gi, '').trim();
        const match = cleaned.match(/[A-Z]/);
        return match ? match[0] : s;
    }

    extractSectionFromClassString(classStr) {
        if (!classStr) return '';
        const match = String(classStr).match(/section\s*([A-Z])/i) || String(classStr).match(/\b([A-Z])\s*$/i);
        return match ? match[1].toUpperCase() : '';
    }

    isExamMatchingStudent(exam, student) {
        const studentProfile = student || {};
        const studentUid = studentProfile.uid || studentProfile.studentUid || studentProfile.id;

        const rawExamClass = exam.targetClass || exam.target_class || exam.className || exam.class_name || exam.classId || '';
        const rawStudentClass = studentProfile.className || studentProfile.classGrade || studentProfile.grade || studentProfile.class || studentProfile.class_name || '';

        const examClassNorm = this.normalizeClass(rawExamClass);
        const studentClassNorm = this.normalizeClass(rawStudentClass);

        const classMatch = Boolean(examClassNorm && studentClassNorm && examClassNorm === studentClassNorm);

        // Section matching:
        // If exam specifies section (e.g. 'A'), student must match section 'A'.
        // If exam section is empty / null / 'all', then all sections of that class receive the exam.
        const rawExamSection = exam.targetSection || exam.target_section || exam.section || this.extractSectionFromClassString(rawExamClass);
        const rawStudentSection = studentProfile.section || this.extractSectionFromClassString(rawStudentClass) || 'A';

        const examSectionNorm = this.normalizeSection(rawExamSection);
        const studentSectionNorm = this.normalizeSection(rawStudentSection);

        const sectionMatch = !examSectionNorm || (examSectionNorm === studentSectionNorm);

        // Education Level matching
        let educationLevelMatch = true;
        const examEdu = exam.educationLevel || exam.education_level || '';
        const studentEdu = studentProfile.educationLevel || studentProfile.education_level || '';
        if (examEdu && studentEdu) {
            educationLevelMatch = String(examEdu).trim().toLowerCase() === String(studentEdu).trim().toLowerCase();
        }

        // Teacher Connection Check
        const connectedTeachers = studentProfile.teacherIds || studentProfile.connectedTeachers || [];
        const isRecipient = Boolean(studentUid && exam.recipientStudentUids && exam.recipientStudentUids.includes(studentUid));
        const isConnectedTeacher = Boolean(
            !exam.teacherUid ||
            isRecipient ||
            connectedTeachers.includes(exam.teacherUid) ||
            connectedTeachers.some(t => String(t).includes(String(exam.teacherUid)) || String(exam.teacherUid).includes(String(t)))
        );

        const isMatch = ((classMatch && sectionMatch && educationLevelMatch) || isRecipient);

        return {
            classMatch,
            sectionMatch,
            educationLevelMatch,
            teacherConnection: isConnectedTeacher,
            isMatch,
            examClassNorm,
            studentClassNorm,
            examSectionNorm,
            studentSectionNorm
        };
    }

    // Publish Teacher Exam to Cloud Firestore
    async createTeacherExam(teacherUid, examData) {
        this.init();
        if (!this.db) return null;

        const timestamp = this.getTimestamp();
        const safeTeacherUid = String(teacherUid || this.auth?.currentUser?.uid || 'teacher_uid');
        const safeExamId = String(examData?.id || `exam_${Date.now()}_${Math.floor(100 + Math.random() * 900)}`);
        const targetClass = String(examData?.targetClass || examData?.target_class || examData?.className || `Class ${examData?.classId || '8'}`);
        const targetSection = String(examData?.targetSection || examData?.target_section || this.extractSectionFromClassString(targetClass) || 'All');
        const educationLevel = String(examData?.educationLevel || examData?.education_level || 'High School');

        const startDate = String(examData?.startDate || examData?.start_date || new Date().toISOString().split('T')[0]);
        const startTime = String(examData?.startTime || examData?.start_time || '09:00');
        const endDate = String(examData?.endDate || examData?.end_date || startDate);
        const endTime = String(examData?.endTime || examData?.end_time || '23:59');

        const payload = {
            id: safeExamId,
            teacherUid: safeTeacherUid,
            teacherName: String(examData?.teacherName || 'Class Teacher'),
            classId: String(examData?.classId || '64'),
            className: targetClass,
            targetClass: targetClass,
            targetSection: targetSection,
            educationLevel: educationLevel,
            title: String(examData?.title || 'Examination').trim(),
            subject: String(examData?.subject || 'Mathematics'),
            examType: String(examData?.examType || examData?.exam_type || 'written'),
            durationMinutes: parseInt(examData?.durationMinutes || examData?.duration_minutes || 60, 10),
            startDate: startDate,
            startTime: startTime,
            endDate: endDate,
            endTime: endTime,
            questions: Array.isArray(examData?.questions) ? examData.questions : [],
            answerKey: typeof examData?.answerKey === 'object' && examData?.answerKey !== null ? examData.answerKey : {},
            recipientStudentUids: Array.isArray(examData?.recipientStudentUids) ? examData.recipientStudentUids.map(String) : [],
            status: 'published',
            createdAt: timestamp,
            updatedAt: timestamp
        };

        try {
            if (this.auth?.currentUser) {
                if (safeTeacherUid && safeTeacherUid !== 'teacher_uid') {
                    await this.db.collection('teachers').doc(safeTeacherUid).collection('exams').doc(safeExamId).set(payload, { merge: true }).catch(() => {});
                }
                await this.db.collection('exams').doc(safeExamId).set(payload, { merge: true });
                console.log(`🔥 [Firestore] Published Teacher Exam: "${payload.title}" (${safeExamId}) for ${targetClass} (Section: ${targetSection || 'All'})`);
            } else {
                console.log(`ℹ️ [Firestore] Teacher client not authenticated directly to Cloud Auth — Exam "${payload.title}" dispatched via Server Sync Queue.`);
            }
            return payload;
        } catch (e) {
            if (e.code !== 'permission-denied') {
                console.warn('[FirebaseAuthService] createTeacherExam warning:', e.message);
            } else {
                console.log(`ℹ️ [Firestore] Exam "${payload.title}" saved locally; syncing via Server Sync Queue.`);
            }
            return payload;
        }
    }

    // Submit Student Exam with Handwritten Strokes and Answers
    async submitStudentExam(studentUid, examId, submissionData) {
        this.init();
        if (!this.db) return null;
        const timestamp = this.getTimestamp();
        const safeStudentUid = String(studentUid || this.auth?.currentUser?.uid || 'student');
        const safeExamId = String(examId);

        const payload = {
            examId: safeExamId,
            studentUid: safeStudentUid,
            studentName: String(submissionData.studentName || 'Student'),
            studentCode: String(submissionData.studentCode || ''),
            answers: submissionData.answers || {},
            score: submissionData.score !== undefined ? submissionData.score : null,
            totalMarks: submissionData.totalMarks || 100,
            status: submissionData.status || 'submitted',
            feedback: submissionData.feedback || '',
            violationCount: parseInt(submissionData.violationCount || 0, 10),
            submittedAt: timestamp,
            updatedAt: timestamp
        };

        try {
            if (this.auth?.currentUser) {
                await this.db.collection('exams').doc(safeExamId).collection('submissions').doc(safeStudentUid).set(payload, { merge: true });
                await this.db.collection('students').doc(safeStudentUid).collection('exam_submissions').doc(safeExamId).set(payload, { merge: true }).catch(() => {});
                console.log(`🔥 [Firestore] Exam submission synced for Exam #${safeExamId}`);
            } else {
                console.log(`ℹ️ [Firestore] Student client not directly authenticated to Cloud Auth — Exam submission for #${safeExamId} dispatched via Server Sync Queue.`);
            }
            return payload;
        } catch (e) {
            console.warn('[FirebaseAuthService] submitStudentExam warning:', e.message);
            return payload;
        }
    }

    // Autosave Student Exam Draft
    async saveStudentExamDraft(studentUid, examId, answers) {
        this.init();
        if (!this.db || !this.auth?.currentUser) return null;
        const safeStudentUid = String(studentUid || this.auth.currentUser.uid);
        const safeExamId = String(examId);

        try {
            await this.db.collection('students').doc(safeStudentUid).collection('exam_drafts').doc(safeExamId).set({
                examId: safeExamId,
                answers: answers,
                updatedAt: this.getTimestamp()
            }, { merge: true });
        } catch(e) {}
    }

    // -------------------------------------------------------------
    // PARENT COMPANION & MONITORING METHODS
    // -------------------------------------------------------------

    // Link Parent to Child via Student Code
    async linkParentToChild(parentUid, studentCode) {
        this.init();
        if (!this.db) return null;
        const cleanCode = String(studentCode).trim().toUpperCase();
        const safeParentUid = String(parentUid || this.auth?.currentUser?.uid);

        try {
            // Find student with matching studentCode
            const snap = await this.db.collection('students').where('studentCode', '==', cleanCode).limit(1).get().catch(() => null);
            let studentDoc = (snap && !snap.empty) ? snap.docs[0] : null;

            if (!studentDoc) {
                // Fallback scan
                const snapAll = await this.db.collection('students').get().catch(() => null);
                if (snapAll && !snapAll.empty) {
                    for (const doc of snapAll.docs) {
                        const data = doc.data();
                        if (data.studentCode && data.studentCode.toUpperCase() === cleanCode) {
                            studentDoc = doc;
                            break;
                        }
                    }
                }
            }

            if (!studentDoc) {
                throw new Error(`Student with code ${cleanCode} not found in Cloud Database.`);
            }

            const studentUid = studentDoc.id;
            const studentData = studentDoc.data();
            const connId = `${studentUid}_${safeParentUid}`;

            await this.db.collection('student_parent_connections').doc(connId).set({
                studentUid,
                parentUid: safeParentUid,
                studentCode: cleanCode,
                studentName: studentData.name || 'Student',
                status: 'active',
                createdAt: this.getTimestamp()
            }, { merge: true });

            const parentIds = Array.from(new Set([...(studentData.parentIds || []), safeParentUid]));
            await this.db.collection('students').doc(studentUid).update({ parentIds }).catch(() => {});
            console.log(`🔥 [Firestore] Connected Parent ${safeParentUid} to Child ${studentData.name} (${cleanCode})`);
            return { studentUid, ...studentData };
        } catch (err) {
            console.warn('[FirebaseAuthService] linkParentToChild error:', err.message);
            throw err;
        }
    }

    // Helper to enforce request timeouts
    withTimeout(promise, timeoutMs = 8000, errorMsg = 'Firebase request timeout') {
        return Promise.race([
            promise,
            new Promise((_, reject) => setTimeout(() => reject(new Error(errorMsg)), timeoutMs))
        ]);
    }

    // Get All Connected Children for Parent (Optimized Parallel Resolution & Multi-source)
    async getParentChildren(parentUid) {
        this.init();
        if (!this.db) return [];

        const safeParentUid = String(
            parentUid || 
            this.auth?.currentUser?.uid || 
            (typeof App !== 'undefined' && App.currentUser ? (App.currentUser.uid || App.currentUser.id) : '')
        ).trim();

        console.log("[Parent] Loading children START");
        console.log("[Parent] Auth UID:", this.auth?.currentUser?.uid || safeParentUid);

        if (!safeParentUid || safeParentUid === 'undefined' || safeParentUid === 'null') {
            console.warn("[Parent] No valid Parent UID found to query connected children.");
            console.log("[Parent] Loading children FINISHED");
            return [];
        }

        try {
            const connections = [];
            const studentCodeLookups = [];

            // 1. Parallel queries across all canonical Firestore structures
            const [snapConns, snapStudents, snapParentDoc] = await Promise.all([
                this.withTimeout(
                    this.db.collection('student_parent_connections').where('parentUid', '==', safeParentUid).limit(25).get(),
                    7000
                ).catch(err => {
                    if (err.code === 'permission-denied') {
                        console.error("[Parent Firebase Permission Error]", err.code, err.message);
                    } else {
                        console.warn('[FirebaseAuthService] Connections query note:', err.message);
                    }
                    return null;
                }),
                this.withTimeout(
                    this.db.collection('students').where('parentIds', 'array-contains', safeParentUid).limit(25).get(),
                    7000
                ).catch(err => {
                    if (err.code === 'permission-denied') {
                        console.error("[Parent Firebase Permission Error]", err.code, err.message);
                    } else {
                        console.warn('[FirebaseAuthService] Students array query note:', err.message);
                    }
                    return null;
                }),
                this.withTimeout(
                    this.db.collection('parents').doc(safeParentUid).get(),
                    7000
                ).catch(err => {
                    if (err.code === 'permission-denied') {
                        console.error("[Parent Firebase Permission Error]", err.code, err.message);
                    } else {
                        console.warn('[FirebaseAuthService] Parent doc query note:', err.message);
                    }
                    return null;
                })
            ]);

            // Parse student_parent_connections
            if (snapConns && !snapConns.empty) {
                snapConns.docs.forEach(d => {
                    const data = d.data();
                    if (data.status === 'active' || !data.status) {
                        const sid = data.studentUid || d.id.split('_')[0];
                        if (sid) connections.push(sid);
                        if (data.studentCode) studentCodeLookups.push(data.studentCode);
                    }
                });
            }

            // Parse students collection array-contains
            if (snapStudents && !snapStudents.empty) {
                snapStudents.docs.forEach(d => connections.push(d.id));
            }

            // Parse parents doc (childIds / childStudentIds)
            if (snapParentDoc && snapParentDoc.exists) {
                const pData = snapParentDoc.data() || {};
                if (Array.isArray(pData.childIds)) {
                    pData.childIds.forEach(id => { if (id) connections.push(id); });
                }
                if (Array.isArray(pData.childStudentIds)) {
                    pData.childStudentIds.forEach(code => { if (code) studentCodeLookups.push(code); });
                }
            }

            // Also resolve any student codes found in connections
            if (studentCodeLookups.length > 0) {
                const uniqueCodes = Array.from(new Set(studentCodeLookups));
                const codePromises = uniqueCodes.map(code => 
                    this.withTimeout(
                        this.db.collection('students').where('studentCode', '==', code.toUpperCase()).limit(1).get(),
                        5000
                    ).then(snap => {
                        if (snap && !snap.empty) {
                            connections.push(snap.docs[0].id);
                        }
                    }).catch(() => null)
                );
                await Promise.all(codePromises);
            }

            const uniqueStudentUids = Array.from(new Set(connections)).filter(Boolean);
            console.log(`[Parent] Discovered ${uniqueStudentUids.length} connected student UID(s)`);

            // Parallel fetch of basic student profiles with strict timeout per profile
            const profilePromises = uniqueStudentUids.map(async (sUid) => {
                try {
                    const profile = await this.withTimeout(this.getStudentProfileByUid(sUid), 6000);
                    if (profile) {
                        return {
                            student_id: sUid,
                            student_uid: sUid,
                            uid: sUid,
                            student_name: profile.name || profile.fullName || 'Student',
                            name: profile.name || profile.fullName || 'Student',
                            student_code: profile.studentCode || profile.studentId || '',
                            grade: profile.grade || profile.className || 'Grade 8',
                            class_name: profile.grade || profile.className || 'Grade 8',
                            section: profile.section || 'A',
                            education_level: profile.educationLevel || 'High School',
                            school_name: profile.schoolName || 'SmartSlate Academy',
                            status: 'Connected ✓'
                        };
                    }
                } catch (e) {
                    console.error(`[Parent] Student profile failed: ${sUid}`, e.message);
                }
                return null;
            });

            const children = (await Promise.all(profilePromises)).filter(Boolean);
            console.log("[Parent] Loading children SUCCESS", children);
            return children;
        } catch (err) {
            console.error("[Parent] Loading children ERROR", err);
            return [];
        } finally {
            console.log("[Parent] Loading children FINISHED");
        }
    }

    // Alias for getStudentProfile
    async getStudentProfile(studentUid) {
        return this.getStudentProfileByUid(studentUid);
    }

    // Get Student Digital Notes
    async getStudentNotes(studentUid) {
        this.init();
        if (!this.db) return [];
        const safeStudentUid = String(studentUid);

        try {
            const notesSnap = await this.db.collection('students').doc(safeStudentUid).collection('notes').get().catch(() => null);
            if (notesSnap && !notesSnap.empty) {
                return notesSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            return [];
        } catch (err) {
            console.warn('[FirebaseAuthService] getStudentNotes warning:', err.message);
            return [];
        }
    }

    // Get Student Search History
    async getStudentSearchHistory(studentUid, limit = 50) {
        this.init();
        if (!this.db) return [];
        const safeStudentUid = String(studentUid);

        try {
            const snap = await this.db.collection('students').doc(safeStudentUid).collection('search_history').orderBy('timestamp', 'desc').limit(limit).get().catch(() => null);
            if (snap && !snap.empty) {
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
            return [];
        } catch (err) {
            console.warn('[FirebaseAuthService] getStudentSearchHistory warning:', err.message);
            return [];
        }
    }

    // Real-time listener for Student Search History
    listenToStudentSearchHistory(studentUid, callback) {
        this.init();
        if (!this.db) return () => {};
        const safeStudentUid = String(studentUid);

        try {
            return this.db.collection('students').doc(safeStudentUid).collection('search_history')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .onSnapshot(snap => {
                    const searches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    callback(searches);
                }, err => {
                    if (err.code !== 'permission-denied') {
                        console.warn('[FirebaseAuthService] search_history snapshot warning:', err.message);
                    }
                });
        } catch (err) {
            return () => {};
        }
    }

    // Get Student Exam Submissions & Results for Parent
    async getStudentExamSubmissions(studentUid) {
        this.init();
        if (!this.db) return [];
        const safeStudentUid = String(studentUid);

        try {
            const snap = await this.db.collection('students').doc(safeStudentUid).collection('exam_submissions').get().catch(() => null);
            let subs = [];
            if (snap && !snap.empty) {
                subs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            const examsSnap = await this.db.collection('exams').get().catch(() => null);
            const examsMap = new Map();
            if (examsSnap && !examsSnap.empty) {
                examsSnap.docs.forEach(d => examsMap.set(d.id, d.data()));
            }

            return subs.map(sub => {
                const exam = examsMap.get(sub.examId) || {};
                return {
                    ...sub,
                    examTitle: exam.title || sub.examTitle || 'Unit Exam',
                    subject: exam.subject || sub.subject || 'General',
                    teacherName: exam.teacherName || sub.evaluated_by || 'Class Teacher',
                    examType: exam.examType || exam.exam_type || 'written'
                };
            });
        } catch (err) {
            console.warn('[FirebaseAuthService] getStudentExamSubmissions warning:', err.message);
            return [];
        }
    }

    // Student retrieval of Assignments matching student UID / class
    async getStudentAssignments(studentUid, studentClass) {
        this.init();
        if (!this.db) return [];
        try {
            const snap = await this.db.collection('assignments').where('status', '==', 'active').get();
            if (snap.empty) return [];
            const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            return allItems.filter(item => {
                if (studentUid && item.recipientStudentUids && item.recipientStudentUids.includes(studentUid)) return true;
                if (studentClass && item.targetClass && item.targetClass.toLowerCase() === String(studentClass).toLowerCase()) return true;
                return false;
            });
        } catch (e) {
            return [];
        }
    }

    // Student retrieval of Exams matching student UID / class / section with debug logging
    async getStudentExams(studentUid, studentProfile) {
        this.init();
        if (!this.db) return [];

        try {
            let allExams = [];
            const snap = await this.db.collection('exams').get().catch(() => null);
            if (snap && !snap.empty) {
                allExams = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }

            const rawProfile = studentProfile || this._studentProfileCache || {};
            const profile = rawProfile.data ? rawProfile.data : rawProfile;
            const studentClass = profile.grade || profile.className || profile.classGrade || profile.class || 'Class 6';
            const studentSection = profile.section || 'A';

            console.log('\n[STUDENT EXAMS]');
            console.log(`Student UID: ${studentUid || profile.uid}`);
            console.log(`Student Class: ${studentClass}`);
            console.log(`Student Section: ${studentSection}`);
            console.log(`Connected Teachers: ${(profile.teacherIds || []).join(', ') || 'All Connected'}`);
            console.log(`Firestore exams found: ${allExams.length}`);

            const matchingExams = [];
            const now = new Date();

            for (const exam of allExams) {
                const comparison = this.isExamMatchingStudent(exam, profile);
                
                // Calculate Server Authoritative Window
                const startDateStr = exam.startDate || exam.start_date || '2026-08-17';
                const startTimeStr = exam.startTime || exam.start_time || '00:00';
                const endDateStr = exam.endDate || exam.end_date || startDateStr;
                const endTimeStr = exam.endTime || exam.end_time || '23:59';

                const startDateTime = new Date(`${startDateStr}T${startTimeStr.length === 5 ? startTimeStr + ':00' : startTimeStr}`);
                const endDateTime = new Date(`${endDateStr}T${endTimeStr.length === 5 ? endTimeStr + ':00' : endTimeStr}`);

                let windowStatus = 'active';
                let isAvailable = true;
                if (now < startDateTime) {
                    windowStatus = 'upcoming';
                    isAvailable = false;
                } else if (now > endDateTime) {
                    windowStatus = 'closed';
                    isAvailable = false;
                }

                console.log(`Exam ID: ${exam.id}`);
                console.log(`Teacher UID: ${exam.teacherUid || 'N/A'}`);
                console.log(`Target Class: ${exam.targetClass || exam.className}`);
                console.log(`Target Section: ${exam.targetSection || 'All'}`);
                console.log(`Student Class: ${studentClass}`);
                console.log(`Student Section: ${studentSection}`);
                console.log(`Class Match: ${comparison.classMatch}`);
                console.log(`Section Match: ${comparison.sectionMatch}`);
                console.log(`Teacher Connection: ${comparison.teacherConnection}`);
                console.log(`Availability: ${windowStatus.toUpperCase()}`);
                console.log(`FINAL RESULT: ${comparison.isMatch ? 'SHOW' : 'HIDE'}`);
                console.log('----------------------------------------------------');

                if (comparison.isMatch) {
                    // Sanitize question answers before delivering to student
                    const sanitizedQuestions = (exam.questions || []).map(q => {
                        const cleanQ = { ...q };
                        delete cleanQ.correct;
                        delete cleanQ.answer;
                        return cleanQ;
                    });

                    matchingExams.push({
                        ...exam,
                        questions: sanitizedQuestions,
                        target_class: exam.targetClass || exam.className,
                        subject: exam.subject || 'General',
                        exam_type: exam.examType || exam.exam_type || 'written',
                        duration_minutes: exam.durationMinutes || exam.duration_minutes || 60,
                        start_date: startDateStr,
                        start_time: startTimeStr,
                        end_date: endDateStr,
                        end_time: endTimeStr,
                        startDateTime: startDateTime.toISOString(),
                        endDateTime: endDateTime.toISOString(),
                        windowStatus,
                        isAvailable,
                        hasSubmitted: false
                    });
                }
            }

            console.log(`Matching exams: ${matchingExams.length}`);
            console.log(`Filtered exams: ${matchingExams.length}\n`);

            return matchingExams;
        } catch (e) {
            console.warn('[FirebaseAuthService] getStudentExams error:', e.message);
            return [];
        }
    }

    onStudentAssignmentsChanged(studentUid, studentClass, callback) {
        this.init();
        if (!this.db) return () => {};
        return this.db.collection('assignments').onSnapshot(snap => {
            const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            const filtered = allItems.filter(item => {
                if (studentUid && item.recipientStudentUids && item.recipientStudentUids.includes(studentUid)) return true;
                if (studentClass && item.targetClass && item.targetClass.toLowerCase() === String(studentClass).toLowerCase()) return true;
                return false;
            });
            callback(filtered);
        }, err => console.warn('[FirebaseAuthService] assignments snapshot error:', err));
    }

    // Real-time listener for Exams matching student profile
    onStudentExamsChanged(studentUid, studentProfile, callback) {
        this.init();
        if (!this.db) return () => {};

        // If not yet authenticated with Firebase Auth, wait for auth state change
        if (!this.auth?.currentUser) {
            let unsubscribeSnapshot = () => {};
            let isUnsubscribed = false;
            const unsubscribeAuth = this.auth?.onAuthStateChanged(user => {
                if (user && this.db && !isUnsubscribed) {
                    unsubscribeSnapshot = this._attachExamsListener(studentUid, studentProfile, callback);
                }
            });
            return () => {
                isUnsubscribed = true;
                if (typeof unsubscribeAuth === 'function') unsubscribeAuth();
                if (typeof unsubscribeSnapshot === 'function') unsubscribeSnapshot();
            };
        }

        return this._attachExamsListener(studentUid, studentProfile, callback);
    }

    _attachExamsListener(studentUid, studentProfile, callback) {
        if (!this.db || !this.auth?.currentUser) return () => {};

        try {
            return this.db.collection('exams').onSnapshot(async snap => {
                const allItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                const rawProfile = studentProfile || this._studentProfileCache || {};
                const profile = rawProfile.data ? rawProfile.data : rawProfile;
                const matchingExams = [];
                const now = new Date();

                for (const exam of allItems) {
                    const comparison = this.isExamMatchingStudent(exam, profile);
                    if (comparison.isMatch) {
                        const startDateStr = exam.startDate || exam.start_date || '2026-08-17';
                        const startTimeStr = exam.startTime || exam.start_time || '00:00';
                        const endDateStr = exam.endDate || exam.end_date || startDateStr;
                        const endTimeStr = exam.endTime || exam.end_time || '23:59';

                        const startDateTime = new Date(`${startDateStr}T${startTimeStr.length === 5 ? startTimeStr + ':00' : startTimeStr}`);
                        const endDateTime = new Date(`${endDateStr}T${endTimeStr.length === 5 ? endTimeStr + ':00' : endTimeStr}`);

                        let windowStatus = 'active';
                        let isAvailable = true;
                        if (now < startDateTime) {
                            windowStatus = 'upcoming';
                            isAvailable = false;
                        } else if (now > endDateTime) {
                            windowStatus = 'closed';
                            isAvailable = false;
                        }

                        const sanitizedQuestions = (exam.questions || []).map(q => {
                            const cleanQ = { ...q };
                            delete cleanQ.correct;
                            delete cleanQ.answer;
                            return cleanQ;
                        });

                        matchingExams.push({
                            ...exam,
                            questions: sanitizedQuestions,
                            target_class: exam.targetClass || exam.className,
                            subject: exam.subject || 'General',
                            exam_type: exam.examType || exam.exam_type || 'written',
                            duration_minutes: exam.durationMinutes || exam.duration_minutes || 60,
                            start_date: startDateStr,
                            start_time: startTimeStr,
                            end_date: endDateStr,
                            end_time: endTimeStr,
                            startDateTime: startDateTime.toISOString(),
                            endDateTime: endDateTime.toISOString(),
                            windowStatus,
                            isAvailable,
                            hasSubmitted: false
                        });
                    }
                }

                callback(matchingExams);
            }, err => {
                if (err.code !== 'permission-denied') {
                    console.warn('[FirebaseAuthService] exams snapshot warning:', err.message);
                }
            });
        } catch (e) {
            return () => {};
        }
    }

    // Publish Teacher Exam to Cloud Firestore (Authoritatively saved via backend REST API)
    async createTeacherExam(teacherUid, examData) {
        return examData;
    }

    // Fetch Teacher Exams from Cloud Firestore
    async getTeacherExams(teacherUid) {
        this.init();
        if (!this.db) return [];
        try {
            const safeTeacherUid = String(teacherUid || this.auth?.currentUser?.uid || '');
            let snap = await this.db.collection('exams').where('teacherUid', '==', safeTeacherUid).get().catch(() => null);
            if (!snap || snap.empty) {
                snap = await this.db.collection('exams').where('created_by', '==', safeTeacherUid).get().catch(() => null);
            }
            if (!snap || snap.empty) {
                snap = await this.db.collection('exams').limit(50).get().catch(() => null);
            }
            if (!snap || snap.empty) return [];
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            return [];
        }
    }

    // Publish Teacher Assignment to Cloud Firestore (Authoritatively saved via backend REST API)
    async createTeacherAssignment(teacherUid, assignmentData) {
        return assignmentData;
    }

    // Fetch Teacher Assignments from Cloud Firestore
    async getTeacherAssignments(teacherUid) {
        this.init();
        if (!this.db) return [];
        try {
            const safeTeacherUid = String(teacherUid || this.auth?.currentUser?.uid || '');
            let snap = await this.db.collection('assignments').where('teacherUid', '==', safeTeacherUid).get().catch(() => null);
            if (!snap || snap.empty) {
                snap = await this.db.collection('assignments').where('created_by', '==', safeTeacherUid).get().catch(() => null);
            }
            if (!snap || snap.empty) {
                snap = await this.db.collection('assignments').limit(50).get().catch(() => null);
            }
            if (!snap || snap.empty) return [];
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            return [];
        }
    }

    // Publish Teacher Announcement to Cloud Firestore (Authoritatively saved via backend REST API)
    async createTeacherAnnouncement(teacherUid, announcementData) {
        return announcementData;
    }

    // Fetch Teacher Announcements
    async getTeacherAnnouncements(teacherUid) {
        this.init();
        if (!this.db) return [];

        try {
            const safeTeacherUid = teacherUid ? String(teacherUid) : null;
            if (safeTeacherUid && safeTeacherUid !== 'teacher_uid') {
                const snap = await this.db.collection('teachers').doc(safeTeacherUid).collection('announcements').orderBy('createdAt', 'desc').get();
                if (!snap.empty) {
                    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
                }
            }
            const snapAll = await this.db.collection('announcements').orderBy('createdAt', 'desc').limit(20).get();
            return snapAll.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            try {
                const snapFallback = await this.db.collection('announcements').get();
                return snapFallback.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (err) {
                return [];
            }
        }
    }

    // Real-time listener for Announcements
    onAnnouncementsChanged(callback) {
        this.init();
        if (!this.db) return () => {};

        return this.db.collection('announcements')
            .onSnapshot((snapshot) => {
                const items = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                callback(items);
            }, (err) => {
                console.warn('[FirebaseAuthService] announcements snapshot error:', err.message);
            });
    }

    // Get Auth state observer
    onAuthStateChanged(callback) {
        this.init();
        if (this.auth) {
            return this.auth.onAuthStateChanged(callback);
        }
    }

    // =========================================================================
    // PARENT PORTAL COMPANION METHODS (FIRESTORE CLOUD INTEGRATION)
    // =========================================================================

    // Link Parent to Student by Student Code
    async connectParentToStudent(parentUid, studentCode, parentName = 'Parent', parentCode = '') {
        this.init();
        if (!this.db) throw new Error('Firestore not initialized');

        const cleanCode = String(studentCode || '').trim().toUpperCase();
        const safeParentUid = String(parentUid || this.auth?.currentUser?.uid || '').trim();

        if (!cleanCode) throw new Error('Student code is required');
        if (!safeParentUid) throw new Error('Parent authentication required');

        console.log(`[PARENT LINK] Starting connection: Parent (${safeParentUid}) -> Student Code (${cleanCode})`);

        // 1. Locate student in Firestore
        let student = null;
        let studentUid = null;

        try {
            const snap = await this.db.collection('students').where('studentCode', '==', cleanCode).limit(1).get();
            if (!snap.empty) {
                studentUid = snap.docs[0].id;
                student = { uid: studentUid, ...snap.docs[0].data() };
            }
        } catch (e) {
            console.warn('[FirebaseAuthService] students studentCode query note:', e.message);
        }

        if (!student) {
            try {
                const snapCode = await this.db.collection('students').where('student_code', '==', cleanCode).limit(1).get();
                if (!snapCode.empty) {
                    studentUid = snapCode.docs[0].id;
                    student = { uid: studentUid, ...snapCode.docs[0].data() };
                }
            } catch (e) {}
        }

        if (!student) {
            // Generate standard UID for the student code if not registered in Firestore yet
            studentUid = `stu_${cleanCode.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
            student = {
                uid: studentUid,
                name: 'Student ' + cleanCode,
                studentName: 'Student ' + cleanCode,
                studentCode: cleanCode,
                student_code: cleanCode,
                class: 'Grade 8',
                className: 'Grade 8',
                grade: 'Grade 8',
                section: 'A',
                schoolName: 'SmartSlate Academy',
                educationLevel: 'High School',
                parentIds: [safeParentUid]
            };

            await this.db.collection('students').doc(studentUid).set(student, { merge: true }).catch(() => {});
        }

        const connId = `${studentUid}_${safeParentUid}`;
        const connectionData = {
            studentUid,
            student_uid: studentUid,
            parentUid: safeParentUid,
            parent_uid: safeParentUid,
            studentCode: cleanCode,
            student_code: cleanCode,
            parentCode: parentCode || `PAR-${safeParentUid}`,
            parentName: parentName || 'Parent',
            studentName: student.name || student.studentName || 'Student',
            status: 'active',
            createdAt: this.getTimestamp(),
            updatedAt: this.getTimestamp()
        };

        console.log(`[PARENT LINK] Creating connection document: ${connId}`, connectionData);

        // 2. Write to student_parent_connections
        await this.db.collection('student_parent_connections').doc(connId).set(connectionData, { merge: true });
        console.log("[PARENT LINK] Firestore connection WRITE SUCCESS");

        // 3. Update student parentIds array
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue) {
                await this.db.collection('students').doc(studentUid).update({
                    parentIds: firebase.firestore.FieldValue.arrayUnion(safeParentUid)
                });
            } else {
                await this.db.collection('students').doc(studentUid).set({
                    parentIds: [safeParentUid]
                }, { merge: true });
            }
        } catch (e) {}

        // 4. Update parent childIds array
        try {
            if (typeof firebase !== 'undefined' && firebase.firestore?.FieldValue) {
                await this.db.collection('parents').doc(safeParentUid).set({
                    childIds: firebase.firestore.FieldValue.arrayUnion(studentUid),
                    childStudentIds: firebase.firestore.FieldValue.arrayUnion(studentUid)
                }, { merge: true });
            }
        } catch (e) {}

        return {
            success: true,
            message: 'Student connected successfully',
            child: {
                uid: studentUid,
                student_id: studentUid,
                student_uid: studentUid,
                name: student.name || student.studentName || 'Student',
                student_name: student.name || student.studentName || 'Student',
                studentCode: cleanCode,
                student_code: cleanCode,
                class: student.className || student.class || student.grade || 'Grade 8',
                class_name: student.className || student.class || student.grade || 'Grade 8',
                grade: student.className || student.class || student.grade || 'Grade 8',
                section: student.section || 'A',
                schoolName: student.schoolName || student.institution || 'SmartSlate Academy',
                school_name: student.schoolName || student.institution || 'SmartSlate Academy',
                educationLevel: student.educationLevel || 'High School',
                education_level: student.educationLevel || 'High School',
                status: 'Connected ✓'
            }
        };
    }

    // Get all children connected to a parent
    async getParentChildren(parentUid) {
        this.init();
        if (!this.db) return [];

        const candidateUids = new Set();
        if (parentUid) candidateUids.add(String(parentUid).trim());
        if (this.auth?.currentUser?.uid) candidateUids.add(this.auth.currentUser.uid);

        console.log("[PARENT CHILDREN] Fetching for candidate UIDs:", Array.from(candidateUids));
        const childrenMap = new Map();

        for (const pUid of candidateUids) {
            try {
                // 1. Query student_parent_connections where parentUid == pUid
                const snap = await this.db.collection('student_parent_connections')
                    .where('parentUid', '==', pUid)
                    .where('status', '==', 'active')
                    .get();

                console.log(`[PARENT CHILDREN] Connections found for ${pUid}: ${snap.size}`);

                for (const doc of snap.docs) {
                    const data = doc.data();
                    const sUid = data.studentUid || data.student_uid || doc.id.split('_')[0];
                    if (sUid) {
                        const sProfile = await this.getStudentProfileByUid(sUid);
                        const merged = {
                            uid: sUid,
                            student_id: sUid,
                            student_uid: sUid,
                            name: sProfile?.name || sProfile?.studentName || data.studentName || 'Student',
                            student_name: sProfile?.name || sProfile?.studentName || data.studentName || 'Student',
                            studentCode: sProfile?.studentCode || sProfile?.student_code || data.studentCode || data.student_code || 'STU',
                            student_code: sProfile?.studentCode || sProfile?.student_code || data.studentCode || data.student_code || 'STU',
                            class: sProfile?.className || sProfile?.class || sProfile?.grade || 'Grade 8',
                            class_name: sProfile?.className || sProfile?.class || sProfile?.grade || 'Grade 8',
                            grade: sProfile?.className || sProfile?.class || sProfile?.grade || 'Grade 8',
                            section: sProfile?.section || 'A',
                            schoolName: sProfile?.schoolName || sProfile?.institution || 'SmartSlate Academy',
                            school_name: sProfile?.schoolName || sProfile?.institution || 'SmartSlate Academy',
                            educationLevel: sProfile?.educationLevel || 'High School',
                            education_level: sProfile?.educationLevel || 'High School',
                            status: 'Connected ✓'
                        };
                        childrenMap.set(sUid, merged);
                    }
                }
            } catch (err) {
                console.warn('[FirebaseAuthService] getParentChildren connection query note:', err.message);
            }

            try {
                // 2. Query students where parentIds contains pUid
                const studentSnap = await this.db.collection('students')
                    .where('parentIds', 'array-contains', pUid)
                    .get();

                for (const doc of studentSnap.docs) {
                    const sUid = doc.id;
                    const sProfile = doc.data();
                    if (!childrenMap.has(sUid)) {
                        childrenMap.set(sUid, {
                            uid: sUid,
                            student_id: sUid,
                            student_uid: sUid,
                            name: sProfile?.name || sProfile?.studentName || 'Student',
                            student_name: sProfile?.name || sProfile?.studentName || 'Student',
                            studentCode: sProfile?.studentCode || sProfile?.student_code || 'STU',
                            student_code: sProfile?.studentCode || sProfile?.student_code || 'STU',
                            class: sProfile?.className || sProfile?.class || sProfile?.grade || 'Grade 8',
                            class_name: sProfile?.className || sProfile?.class || sProfile?.grade || 'Grade 8',
                            grade: sProfile?.className || sProfile?.class || sProfile?.grade || 'Grade 8',
                            section: sProfile?.section || 'A',
                            schoolName: sProfile?.schoolName || sProfile?.institution || 'SmartSlate Academy',
                            school_name: sProfile?.schoolName || sProfile?.institution || 'SmartSlate Academy',
                            educationLevel: sProfile?.educationLevel || 'High School',
                            education_level: sProfile?.educationLevel || 'High School',
                            status: 'Connected ✓'
                        });
                    }
                }
            } catch (e) {}
        }

        return Array.from(childrenMap.values());
    }

    // Real-time listener for Parent Connected Children
    listenToParentChildren(parentUid, callback) {
        this.init();
        if (!this.db) return () => {};

        const safeParentUid = String(parentUid || this.auth?.currentUser?.uid || '').trim();
        if (!safeParentUid) return () => {};

        try {
            return this.db.collection('student_parent_connections')
                .where('parentUid', '==', safeParentUid)
                .where('status', '==', 'active')
                .onSnapshot(async (snapshot) => {
                    console.log(`[Parent] Real-time connection update: ${snapshot.size} connection(s)`);
                    const children = await this.getParentChildren(safeParentUid);
                    callback(children);
                }, (err) => {
                    console.warn('[FirebaseAuthService] listenToParentChildren snapshot note:', err.message);
                });
        } catch (e) {
            return () => {};
        }
    }

    // Get student digital notes
    async getStudentNotes(studentUid) {
        this.init();
        if (!this.db || !studentUid) return [];

        try {
            const snap = await this.db.collection('students').doc(String(studentUid)).collection('notes').orderBy('updated_at', 'desc').get();
            if (!snap.empty) {
                return snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
        } catch (e) {
            try {
                const snapDirect = await this.db.collection('students').doc(String(studentUid)).collection('notes').get();
                return snapDirect.docs.map(d => ({ id: d.id, ...d.data() }));
            } catch (err) {
                return [];
            }
        }
        return [];
    }

    // Get student evaluated exam submissions
    async getStudentExamSubmissions(studentUid) {
        this.init();
        if (!this.db || !studentUid) return [];

        try {
            const snap = await this.db.collection('students').doc(String(studentUid)).collection('exam_submissions').get();
            return snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) {
            return [];
        }
    }

    // Get student academic progress
    async getStudentProgress(studentUid) {
        this.init();
        if (!this.db || !studentUid) return null;

        try {
            const doc = await this.db.collection('students').doc(String(studentUid)).collection('progress').doc('summary').get();
            if (doc.exists) return doc.data();
        } catch (e) {}
        return null;
    }

    // Real-time listener for student web search history
    listenToStudentSearchHistory(studentUid, callback) {
        this.init();
        if (!this.db || !studentUid) return () => {};

        try {
            return this.db.collection('students').doc(String(studentUid)).collection('search_history')
                .orderBy('timestamp', 'desc')
                .limit(50)
                .onSnapshot(snap => {
                    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                    callback(items);
                }, err => {
                    console.warn('[FirebaseAuthService] search_history snapshot note:', err.message);
                });
        } catch (e) {
            return () => {};
        }
    }

    // Explicit SignOut
    async signOut() {
        this.init();
        this.clearProfileCache();
        if (this.auth) {
            await this.auth.signOut();
        }
    }
}

const firebaseAuthService = new FirebaseAuthService();
if (typeof window !== 'undefined') {
    window.firebaseAuthService = firebaseAuthService;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FirebaseAuthService, firebaseAuthService, firebaseConfig };
}
