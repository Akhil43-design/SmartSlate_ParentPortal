/* SmartSlate Parent & Teacher API Client */

const API = {
    getToken() {
        return localStorage.getItem('smartslate_pt_token');
    },

    setToken(token) {
        if (token) {
            localStorage.setItem('smartslate_pt_token', token);
        } else {
            localStorage.removeItem('smartslate_pt_token');
        }
    },

    async request(endpoint, options = {}) {
        const token = this.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const config = {
            ...options,
            headers
        };

        try {
            const response = await fetch(endpoint, config);
            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                if (response.status === 401 && !endpoint.includes('/login') && !endpoint.includes('/signup')) {
                    this.setToken(null);
                    window.location.reload();
                }
                throw new Error(data.error || `HTTP ${response.status} Request Failed`);
            }

            return data;
        } catch (err) {
            console.error(`API Error [${endpoint}]:`, err);
            throw err;
        }
    },

    // Auth
    login(email, password) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    },

    signup(name, role, email, password, student_code) {
        const payload = typeof name === 'object' ? name : { name, role, email, password, student_code };
        return this.request('/api/auth/signup', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    getCurrentUser() {
        return this.request('/api/auth/me');
    },

    logout() {
        return this.request('/api/auth/logout', { method: 'POST' });
    },

    // Parent Portal
    linkChild(studentCode) {
        return this.request('/api/parent/link', {
            method: 'POST',
            body: JSON.stringify({ studentCode })
        });
    },

    connectChild(studentCode) {
        return this.linkChild(studentCode);
    },

    getChildren() {
        return this.request('/api/parent/children');
    },

    getChildOverview(studentId) {
        return this.request(`/api/parent/child/${studentId}/overview`);
    },

    getChildExams(studentId) {
        return this.request(`/api/parent/child/${studentId}/exams`);
    },

    getChildNotes(studentId) {
        return this.request(`/api/parent/child/${studentId}/notes`);
    },

    getChildSearches(studentId) {
        return this.request(`/api/parent/child/${studentId}/searches`);
    },

    getChildAttendance(studentId) {
        return this.request(`/api/parent/child/${studentId}/attendance`);
    },

    getChildAssignments(studentId) {
        return this.request(`/api/parent/child/${studentId}/assignments`);
    },

    getChildAnnouncements(studentId) {
        return this.request(`/api/parent/child/${studentId}/announcements`);
    },

    getProgressCard(studentId) {
        return this.request(`/api/parent/progress-card/${studentId}`);
    },

    getChildProgressCard(studentId) {
        return this.request(`/api/parent/progress-card/${studentId}`);
    },

    getWebActivity(studentId) {
        return this.request(`/api/parent/web-activity/${studentId}`);
    },

    getChildWebActivity(studentId) {
        return this.request(`/api/parent/web-activity/${studentId}`);
    },

    getChildActivity(studentId) {
        return this.request(`/api/parent/web-activity/${studentId}`);
    },

    getchildactivity(studentId) {
        return this.request(`/api/parent/web-activity/${studentId}`);
    },

    // Teacher Portal
    connectStudent(studentCode) {
        return this.request('/api/teacher/connect-student', {
            method: 'POST',
            body: JSON.stringify({ studentCode })
        });
    },

    searchStudents(query) {
        return this.request(`/api/teacher/search-students?q=${encodeURIComponent(query)}`);
    },

    getAllStudents() {
        return this.request('/api/teacher/students');
    },

    getTeacherClasses() {
        return this.request('/api/teacher/classes');
    },

    getConnectedClasses() {
        return this.request('/api/teacher/connected-classes');
    },

    getClassStudents(classId) {
        if (classId) {
            return this.request(`/api/teacher/students/${classId}`);
        }
        return this.request('/api/teacher/students');
    },

    createAssignment(target_class, title, description, due_at, subject) {
        const payload = typeof target_class === 'object'
            ? target_class
            : { class_id: target_class, target_class, title, description, due_at, subject };
        return this.request('/api/assignments', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    getAnnouncements() {
        return this.request('/api/chat/announcements');
    },

    createAnnouncement(title, content, classId, subject) {
        const payload = typeof title === 'object' ? title : { title, content, classId, subject };
        return this.request('/api/chat/announcements', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    },

    getAssignmentSubmissions(assignmentId) {
        return this.request(`/api/assignments/${assignmentId}/submissions`);
    },

    gradeSubmission(submissionId, grade, feedback) {
        return this.request(`/api/assignments/grade/${submissionId}`, {
            method: 'POST',
            body: JSON.stringify({ grade, feedback })
        });
    },

    createExam(examData) {
        return this.request('/api/exams', {
            method: 'POST',
            body: JSON.stringify(examData)
        });
    },

    getExamSubmissions(examId) {
        return this.request(`/api/exams/${examId}/submissions`);
    },

    getExamLiveStatus(examId) {
        return this.request(`/api/exams/${examId}/live-status`);
    },

    evaluateExamSubmission(submissionId, score, total_marks, feedback) {
        return this.request(`/api/exams/evaluate/${submissionId}`, {
            method: 'POST',
            body: JSON.stringify({ score, total_marks, feedback })
        });
    },

    getExamResults(examId) {
        return this.request(`/api/exams/${examId}/results`);
    },

    getAttendance(classId, studentId, date) {
        let url = '/api/attendance?';
        if (classId) url += `classId=${classId}&`;
        if (studentId) url += `studentId=${studentId}&`;
        if (date) url += `date=${date}`;
        return this.request(url);
    },

    markAttendance(class_id, student_id, date, status) {
        return this.request('/api/attendance/mark', {
            method: 'POST',
            body: JSON.stringify({ class_id, student_id, date, status })
        });
    },

    // Shared APIs
    getAssignments(classId, studentId) {
        let url = '/api/assignments?';
        if (classId) url += `classId=${classId}&`;
        if (studentId) url += `studentId=${studentId}`;
        return this.request(url);
    },

    getExams(studentId) {
        let url = '/api/exams?';
        if (studentId) url += `studentId=${studentId}`;
        return this.request(url);
    },

    getChatMessages(receiverId) {
        return this.request(`/api/chat/messages?receiverId=${receiverId}`);
    },

    sendMessage(receiverId, content) {
        return this.request('/api/chat/send', {
            method: 'POST',
            body: JSON.stringify({ receiverId, content })
        });
    },

    getNotifications() {
        return this.request('/api/notifications');
    },

    markNotificationsRead() {
        return this.request('/api/notifications/read-all', { method: 'POST' });
    }
};
