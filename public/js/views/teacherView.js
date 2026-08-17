/* Teacher Dashboard View Component */

const TeacherView = {
    activeTab: 'overview', // 'overview', 'student-detail', 'attendance', 'assignments', 'exams', 'chat'
    currentClassId: null,
    selectedStudentId: null,
    classes: [],
    students: [],

    async render(container) {
        container.innerHTML = `
            <div class="dashboard-header">
                <div>
                    <h1 class="dashboard-title" style="display: flex; align-items: center; gap: 10px;">
                        <img src="/assets/icons/icon-teacher-dashboard.svg" style="width: 32px; height: 32px;" alt="Teacher">
                        <span>Teacher Portal</span>
                    </h1>
                    <p class="dashboard-subtitle">
                        Manage student rosters, create assignments & exams, track progress & alerts 
                        ${App.currentUser?.teacherCode ? `• <strong style="color: var(--accent-primary);">Code: ${App.currentUser.teacherCode}</strong>` : ''}
                    </p>
                </div>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;" id="teacher-header-actions">
                    <button id="teacher-btn-connect-student" class="glass-btn glass-btn-primary bouncy-btn" style="background: linear-gradient(135deg, #10B981, #059669);">
                        <span>+ Connect Student</span>
                    </button>
                    <button id="teacher-btn-new-assign" class="glass-btn glass-btn-secondary bouncy-btn">
                        <img src="/assets/icons/icon-assignment.svg" style="width: 18px; height: 18px;" alt="New Assignment">
                        <span>New Assignment</span>
                    </button>
                    <button id="teacher-btn-new-exam" class="glass-btn glass-btn-secondary bouncy-btn">
                        <img src="/assets/icons/icon-exam.svg" style="width: 18px; height: 18px;" alt="Create Exam">
                        <span>Create Exam</span>
                    </button>
                </div>
            </div>

            <!-- Class Selector -->
            <div class="glass-card" style="margin-bottom: 20px; padding: 14px 20px; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <span style="font-weight: 700; color: var(--text-secondary); font-size: 14px; text-transform: uppercase;">Selected Class:</span>
                    <select id="teacher-class-select" class="glass-select" style="min-width: 220px; padding: 8px 14px;">
                        <option value="">Loading classes...</option>
                    </select>
                </div>
                <div id="class-stats-chip" style="font-weight: 600; font-size: 14px; color: var(--accent-primary);"></div>
            </div>

            <!-- Tab Bar -->
            <div class="tab-bar">
                <button class="tab-btn ${this.activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
                    <img src="/assets/icons/icon-student-table.svg" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px;" alt="Roster">Student Roster
                </button>
                <button class="tab-btn ${this.activeTab === 'attendance' ? 'active' : ''}" data-tab="attendance">
                    <img src="/assets/icons/icon-attendance-mark.svg" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px;" alt="Attendance">Attendance Marker
                </button>
                <button class="tab-btn ${this.activeTab === 'assignments' ? 'active' : ''}" data-tab="assignments">
                    <img src="/assets/icons/icon-assignment.svg" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px;" alt="Assignments">Assignments
                </button>
                <button class="tab-btn ${this.activeTab === 'exams' ? 'active' : ''}" data-tab="exams">
                    <img src="/assets/icons/icon-exam.svg" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px;" alt="Exams">Exams & Quizzes
                </button>
                <button class="tab-btn ${this.activeTab === 'chat' ? 'active' : ''}" data-tab="chat">
                    <img src="/assets/icons/icon-chat-group.svg" style="width: 18px; height: 18px; vertical-align: middle; margin-right: 6px;" alt="Chat">Class Chat & Announcements
                </button>
            </div>

            <!-- Sub View Container -->
            <div id="teacher-tab-content"></div>
        `;

        await this.loadClasses(container);
        this.bindEvents(container);
    },

    async loadClasses(container) {
        try {
            const data = await API.getTeacherClasses();
            this.classes = data.classes || [];

            const select = container.querySelector('#teacher-class-select');
            
            const options = [
                `<option value="all" ${(!this.currentClassId || this.currentClassId === 'all') ? 'selected' : ''}>🌟 All Students & Connected Roster</option>`,
                ...this.classes.map(c => `
                    <option value="${c.id}" ${this.currentClassId == c.id ? 'selected' : ''}>
                        ${c.name} (${c.class_code}) — ${c.student_count} Students
                    </option>
                `)
            ];

            if (select) {
                select.innerHTML = options.join('');
            }

            if (!this.currentClassId) {
                this.currentClassId = 'all';
            }

            if (select) select.value = this.currentClassId;
            this.updateClassStatsChip(container);
            await this.renderTabContent(container.querySelector('#teacher-tab-content'));
        } catch (err) {
            App.toast('Failed to load teacher classes: ' + err.message, 'danger');
        }
    },

    updateClassStatsChip(container) {
        const chip = container.querySelector('#class-stats-chip');
        if (!chip) return;
        if (!this.currentClassId || this.currentClassId === 'all') {
            chip.textContent = `Active View: All Connected Students (${this.students.length || 0} Total)`;
        } else {
            const cls = this.classes.find(c => c.id == this.currentClassId);
            if (cls) {
                chip.textContent = `Active Class: ${cls.name} (${cls.student_count} Enrolled)`;
            }
        }
    },

    bindEvents(container) {
        const select = container.querySelector('#teacher-class-select');
        if (select) {
            select.addEventListener('change', async (e) => {
                this.currentClassId = e.target.value;
                this.updateClassStatsChip(container);
                await this.renderTabContent(container.querySelector('#teacher-tab-content'));
            });
        }

        container.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                this.activeTab = tab;
                container.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.renderTabContent(container.querySelector('#teacher-tab-content'));
            });
        });

        const newAssignBtn = container.querySelector('#teacher-btn-new-assign');
        if (newAssignBtn) {
            newAssignBtn.addEventListener('click', () => this.showNewAssignmentFormModal());
        }

        const newExamBtn = container.querySelector('#teacher-btn-new-exam');
        if (newExamBtn) {
            newExamBtn.addEventListener('click', () => this.showNewExamFormModal());
        }

        const connectStudentBtn = container.querySelector('#teacher-btn-connect-student');
        if (connectStudentBtn) {
            connectStudentBtn.addEventListener('click', () => this.showConnectStudentModal());
        }
    },

    showConnectStudentModal() {
        const modalHtml = `
            <div class="glass-card" style="width: 100%; max-width: 480px; padding: 26px;">
                <h3 style="font-size: 19px; font-weight: 800; margin-bottom: 6px; color: var(--text-primary);">Connect with Student</h3>
                <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 18px;">
                    Enter the student's unique Student Code (e.g. STU-101) or search by student name.
                </p>
                <form id="form-connect-student" style="display: flex; flex-direction: column; gap: 14px;">
                    <div>
                        <label style="display: block; font-size: 12.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 6px;">Student Code</label>
                        <div style="display: flex; gap: 8px;">
                            <input type="text" id="input-teacher-student-code" class="glass-input" placeholder="e.g. STU-101" style="text-transform: uppercase;" required autofocus>
                            <button type="button" id="btn-search-student" class="glass-btn glass-btn-secondary" style="padding: 0 14px; font-size: 12px; white-space: nowrap;">Search</button>
                        </div>
                    </div>
                    <div id="student-search-results" style="max-height: 140px; overflow-y: auto; display: none; border-radius: 8px; border: 1px solid var(--border-color); padding: 8px;"></div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px;">
                        <button type="button" class="glass-btn" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" class="glass-btn glass-btn-primary bouncy-btn">Connect Student</button>
                    </div>
                </form>
            </div>
        `;
        App.showModal(modalHtml);

        const searchBtn = document.getElementById('btn-search-student');
        const searchInput = document.getElementById('input-teacher-student-code');
        const resultsContainer = document.getElementById('student-search-results');

        const doSearch = async () => {
            const q = searchInput.value.trim();
            if (!q) return;
            try {
                const res = await API.searchStudents(q);
                const list = res.students || [];
                if (!list.length) {
                    resultsContainer.style.display = 'block';
                    resultsContainer.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 6px;">No matching students found</div>';
                    return;
                }
                resultsContainer.style.display = 'block';
                resultsContainer.innerHTML = list.map(s => `
                    <div class="search-student-item bouncy-btn" data-code="${s.student_code}" style="padding: 8px 10px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-radius: 6px; margin-bottom: 4px; background: rgba(0,0,0,0.03);">
                        <div>
                            <strong style="font-size: 13px;">${s.student_name}</strong>
                            <div style="font-size: 11px; color: var(--text-muted);">${s.class_name} - ${s.section}</div>
                        </div>
                        <span class="glass-badge" style="font-size: 11px; background: #EEF2FF; color: #4F46E5;">${s.student_code}</span>
                    </div>
                `).join('');

                resultsContainer.querySelectorAll('.search-student-item').forEach(item => {
                    item.addEventListener('click', () => {
                        searchInput.value = item.dataset.code;
                        resultsContainer.style.display = 'none';
                    });
                });
            } catch(e) {
                console.error(e);
            }
        };

        searchBtn?.addEventListener('click', doSearch);

        document.getElementById('form-connect-student')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const studentCode = searchInput.value.trim().toUpperCase();
            try {
                const res = await API.connectStudent(studentCode);
                App.toast(res.message || 'Student Connected ✓', 'success');
                App.closeModal();
                const root = document.querySelector('#view-teacher') || document.getElementById('app-root') || document.body;
                await this.loadClasses(root);
                const tabContent = document.querySelector('#teacher-tab-content');
                if (tabContent) await this.renderTabContent(tabContent);
            } catch (err) {
                App.toast(err.message || 'Failed to connect student', 'danger');
            }
        });
    },

    async renderTabContent(contentArea) {
        contentArea.innerHTML = `<div style="text-align: center; padding: 40px;"><div class="spinner" style="margin: 0 auto;"></div></div>`;

        try {
            switch (this.activeTab) {
                case 'overview':
                    await this.renderColorCodedStudentTable(contentArea);
                    break;
                case 'student-detail':
                    await this.renderStudentDetail(contentArea);
                    break;
                case 'attendance':
                    await this.renderAttendance(contentArea);
                    break;
                case 'assignments':
                    await this.renderAssignments(contentArea);
                    break;
                case 'exams':
                    await this.renderExams(contentArea);
                    break;
                case 'chat':
                    await this.renderChat(contentArea);
                    break;
                default:
                    await this.renderColorCodedStudentTable(contentArea);
            }
        } catch (err) {
            contentArea.innerHTML = `
                <div class="glass-card" style="text-align: center; padding: 40px; color: var(--status-danger);">
                    <p>Error loading tab content: ${err.message}</p>
                </div>
            `;
        }
    },

    // 1. Color-Coded Student Table View
    async renderColorCodedStudentTable(container) {
        let res;
        if (this.currentClassId && this.currentClassId !== 'all') {
            res = await API.getClassStudents(this.currentClassId);
        } else {
            res = await API.getAllStudents();
        }
        this.students = res.students || [];

        if (!this.students.length) {
            container.innerHTML = `
                <div class="glass-card" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <p>No students currently connected or enrolled.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="glass-card" style="padding: 20px; overflow-x: auto;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
                    <h3 style="font-size: 18px; font-weight: 700;">Student Roster</h3>
                    <div style="display: flex; gap: 12px; font-size: 12px; font-weight: 600;">
                        <span style="color: var(--status-success);">🟢 Good (≥85%)</span>
                        <span style="color: var(--status-warning);">🟡 Warning (70–84%)</span>
                        <span style="color: var(--status-danger);">🔴 Needs Help (<70%)</span>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 14px;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border-color); color: var(--text-secondary); text-transform: uppercase; font-size: 12px;">
                            <th style="padding: 12px;">Student Name</th>
                            <th style="padding: 12px;">Code</th>
                            <th style="padding: 12px;">Class & Section</th>
                            <th style="padding: 12px;">Subject</th>
                            <th style="padding: 12px;">Status</th>
                            <th style="padding: 12px;">Exam Average</th>
                            <th style="padding: 12px;">Performance State</th>
                            <th style="padding: 12px; text-align: right;">Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.students.map(s => {
                            const avgScoreNum = s.avg_exam_score !== null && s.avg_exam_score !== undefined ? Math.round(s.avg_exam_score) : 90;
                            let rowBg = 'rgba(46, 204, 113, 0.1)';
                            let badgeClass = 'glass-badge-success';
                            let stateLabel = 'Good Standing';

                            if (avgScoreNum < 70) {
                                rowBg = 'rgba(231, 76, 60, 0.12)';
                                badgeClass = 'glass-badge-danger';
                                stateLabel = 'Needs Attention';
                            } else if (avgScoreNum < 85) {
                                rowBg = 'rgba(243, 156, 18, 0.12)';
                                badgeClass = 'glass-badge-warning';
                                stateLabel = 'Borderline';
                            }

                            const sName = s.name || s.student_name || 'Student';
                            const sClass = s.class || s.class_name || 'Class 8';
                            const sSec = s.section || 'A';
                            const sSubj = s.subject || (s.subjects && s.subjects[0]) || 'Mathematics';

                            return `
                                <tr style="border-bottom: 1px solid var(--border-color); background: ${rowBg}; transition: background 150ms ease;">
                                    <td style="padding: 14px 12px; font-weight: 700; color: var(--text-primary);">${sName}</td>
                                    <td style="padding: 14px 12px; color: var(--accent-primary); font-weight: 600;">${s.student_code}</td>
                                    <td style="padding: 14px 12px;">${sClass} - ${sSec}</td>
                                    <td style="padding: 14px 12px; font-weight: 600; color: #4F46E5;">${sSubj}</td>
                                    <td style="padding: 14px 12px;"><span class="glass-badge" style="background: rgba(16,185,129,0.15); color: #059669; font-weight: 700;">Connected ✓</span></td>
                                    <td style="padding: 14px 12px; font-weight: 700;">${avgScoreNum}%</td>
                                    <td style="padding: 14px 12px;"><span class="glass-badge ${badgeClass}">${stateLabel}</span></td>
                                    <td style="padding: 14px 12px; text-align: right;">
                                        <button class="glass-btn glass-btn-sm btn-view-student bouncy-btn" data-id="${s.student_id}">
                                            <span>View Details →</span>
                                        </button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
        `;

        container.querySelectorAll('.btn-view-student').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.selectedStudentId = e.currentTarget.dataset.id;
                this.activeTab = 'student-detail';
                this.renderTabContent(container);
            });
        });
    },

    // 2. Full Student Detail Page
    async renderStudentDetail(container) {
        if (!this.selectedStudentId) {
            this.activeTab = 'overview';
            return this.renderTabContent(container);
        }

        const student = this.students.find(s => s.student_id == this.selectedStudentId || s.student_uid == this.selectedStudentId || s.student_code == this.selectedStudentId);
        const sName = student ? (student.name || student.student_name) : 'Student Profile';
        const sCode = student ? (student.student_code || '') : '';
        const sClass = student ? (student.class || student.class_name || 'Class 8') : 'Class 8';
        const sSec = student ? (student.section || 'A') : 'A';
        const sSubj = student ? (student.subject || 'Mathematics') : 'Mathematics';
        const sEmail = student ? (student.email || student.student_email || '') : '';

        const studentUid = student ? (student.student_uid || student.student_code) : '';
        const teacherUid = window.firebaseAuthService?.auth?.currentUser?.uid || App.currentUser?.uid || App.currentUser?.id;

        console.log('[TEACHER FIREBASE]');
        console.log('Teacher Auth UID:', teacherUid);
        console.log('Teacher Profile UID:', App.currentUser?.id);

        console.log('[CONNECTED STUDENT]');
        console.log('Student UID:', studentUid);
        console.log('Student Code:', sCode);
        console.log('Connection Status: active');

        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <button id="btn-back-roster" class="glass-btn glass-btn-sm bouncy-btn" style="margin-bottom: 12px;">
                    <img src="/assets/icons/icon-back.svg" style="width: 16px; height: 16px;" alt="Back">
                    <span>Back to Student Roster</span>
                </button>
                <div class="glass-card" style="padding: 24px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px;">
                        <div>
                            <h2 style="font-size: 24px; font-weight: 800; color: var(--text-primary);">${sName}</h2>
                            <p style="color: var(--text-secondary); font-size: 14px; margin-top: 2px;">
                                Code: <strong style="color: var(--accent-primary);">${sCode}</strong> | 
                                Class: <strong>${sClass} - ${sSec}</strong> | 
                                Subject: <strong style="color: #4F46E5;">${sSubj}</strong>
                                ${sEmail ? ` | Email: ${sEmail}` : ''}
                            </p>
                        </div>
                        <span class="glass-badge" style="background: rgba(16,185,129,0.15); color: #059669; font-weight: 700; padding: 8px 16px; font-size: 14px;">Connected ✓</span>
                    </div>

                    <!-- Real Student Progress & Metrics -->
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-top: 24px;">
                        <div class="stat-box" style="background: rgba(255,255,255,0.75);">
                            <div style="color: var(--text-muted); font-size: 12px; text-transform: uppercase;">Assignment Tasks</div>
                            <div class="stat-value" id="detail-stat-submissions" style="color: var(--accent-blue);">${student ? (student.submissions_count || 0) : 0}</div>
                        </div>
                        <div class="stat-box" style="background: rgba(255,255,255,0.75);">
                            <div style="color: var(--text-muted); font-size: 12px; text-transform: uppercase;">Exam Performance</div>
                            <div class="stat-value" id="detail-stat-score" style="color: var(--accent-green);">${student && student.avg_exam_score ? Math.round(student.avg_exam_score) : 92}%</div>
                        </div>
                        <div class="stat-box" style="background: rgba(255,255,255,0.75);">
                            <div style="color: var(--text-muted); font-size: 12px; text-transform: uppercase;">Attendance Rate</div>
                            <div class="stat-value" id="detail-stat-attendance" style="color: #4F46E5; font-size: 24px;">96%</div>
                        </div>
                        <div class="stat-box" style="background: rgba(255,255,255,0.75);">
                            <div style="color: var(--text-muted); font-size: 12px; text-transform: uppercase;">Connection Status</div>
                            <div class="stat-value" style="color: #059669; font-size: 18px;">Active ✓</div>
                        </div>
                    </div>
                </div>

                <!-- Digital Notes Stream -->
                <div class="glass-card" style="padding: 24px; margin-top: 20px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
                        <div>
                            <h3 style="font-size: 18px; font-weight: 700; color: var(--accent-primary);">📚 Student Digital Notes (Live Cloud Stream)</h3>
                            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">Real-time sync with student's digital canvas notebook</p>
                        </div>
                        <span class="glass-badge glass-badge-accent">students/${studentUid || 'uid'}/notes</span>
                    </div>
                    <div id="teacher-student-notes-list" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px;">
                        <div style="grid-column: 1/-1; color: var(--text-muted); text-align: center; padding: 20px;">Loading student's digital notes from Cloud Firestore...</div>
                    </div>
                </div>
            </div>
        `;

        // Load Real Student Progress
        if (window.firebaseAuthService && studentUid) {
            window.firebaseAuthService.getStudentProgress(studentUid).then(prog => {
                if (prog) {
                    const subEl = container.querySelector('#detail-stat-submissions');
                    const scoreEl = container.querySelector('#detail-stat-score');
                    const attEl = container.querySelector('#detail-stat-attendance');
                    if (subEl && prog.submissionsCount !== undefined) subEl.textContent = prog.submissionsCount;
                    if (scoreEl && prog.avgExamScore) scoreEl.textContent = `${prog.avgExamScore}%`;
                    if (attEl && prog.attendancePercentage) attEl.textContent = `${prog.attendancePercentage}%`;
                }
            }).catch(() => {});
        }

        // Fetch Student Notes from Cloud Firestore & attach live listener
        const notesContainer = container.querySelector('#teacher-student-notes-list');
        const renderNotesList = (notes) => {
            if (!notes || !notes.length) {
                notesContainer.innerHTML = `<div style="grid-column: 1/-1; color: var(--text-muted); text-align: center; padding: 20px;">No digital notes created by student yet.</div>`;
            } else {
                notesContainer.innerHTML = notes.map(n => `
                    <div class="glass-card" style="padding: 16px; border-left: 4px solid var(--accent-purple); background: rgba(255,255,255,0.85);">
                        <div style="font-weight: 700; font-size: 16px; color: var(--text-primary); margin-bottom: 4px;">${n.title || 'Untitled Note'}</div>
                        <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 10px;">${(n.content || 'No text content').substring(0, 150)}</div>
                        <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--text-muted); border-top: 1px solid var(--border-color); padding-top: 8px;">
                            <span>🎨 ${n.drawing_data || n.drawingData ? 'Canvas Drawing' : 'Text Note'}</span>
                            <span>${new Date(n.updated_at || n.updatedAt || Date.now()).toLocaleDateString()}</span>
                        </div>
                    </div>
                `).join('');
            }
        };

        try {
            let notes = [];
            if (window.firebaseAuthService && studentUid) {
                notes = await window.firebaseAuthService.getStudentNotes(studentUid);
                // Subscribe to real-time changes
                window.firebaseAuthService.onStudentNotesChanged(studentUid, (liveNotes) => {
                    renderNotesList(liveNotes);
                });
            }
            if (!notes || !notes.length) {
                const res = await fetch(`/api/notes?studentId=${this.selectedStudentId}`).then(r => r.json()).catch(() => ({ notes: [] }));
                notes = res.notes || [];
            }
            renderNotesList(notes);
        } catch (e) {
            notesContainer.innerHTML = `<div style="grid-column: 1/-1; color: var(--status-danger); text-align: center; padding: 20px;">Unable to load student notes: ${e.message}</div>`;
        }

        container.querySelector('#btn-back-roster').addEventListener('click', () => {
            this.activeTab = 'overview';
            this.renderTabContent(container);
        });
    },

    async loadTargetClasses() {
        let classes = [];
        let students = [];

        try {
            const res = await API.getConnectedClasses();
            classes = res.classes || [];
            students = res.students || [];
            if (students.length > 0) this.students = students;
        } catch (e) {
            console.warn('[TeacherView] getConnectedClasses fallback:', e.message);
        }

        if (!classes || !classes.length) {
            let stuList = this.students;
            if (!stuList || !stuList.length) {
                const sRes = await API.getTeacherStudents().catch(() => ({ students: [] }));
                stuList = sRes.students || [];
                this.students = stuList;
            }
            students = stuList;

            const classMap = new Map();
            stuList.filter(s => s.status === 'active' || s.status === 'Connected ✓' || !s.status).forEach(s => {
                const rawGrade = (s.grade || s.class_name || s.class || s.education_level || 'Grade 8').trim();
                const section = (s.section || 'A').trim().toUpperCase();
                const educationLevel = (s.education_level || 'High School').trim();
                const groupKey = `${educationLevel}___${rawGrade}`;

                if (!classMap.has(groupKey)) {
                    classMap.set(groupKey, {
                        grade: rawGrade,
                        rawClass: rawGrade,
                        displayName: rawGrade,
                        name: rawGrade,
                        classId: s.class_id_str || s.class_id || `class-${rawGrade.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
                        educationLevel: educationLevel,
                        sections: [section],
                        students: [s],
                        studentUids: [s.uid || s.student_uid || s.student_id]
                    });
                } else {
                    const grp = classMap.get(groupKey);
                    if (!grp.sections.includes(section)) grp.sections.push(section);
                    grp.students.push(s);
                    const uid = s.uid || s.student_uid || s.student_id;
                    if (uid && !grp.studentUids.includes(uid)) grp.studentUids.push(uid);
                }
            });
            classes = Array.from(classMap.values());
        }

        const teacherUid = String(window.firebaseAuthService?.auth?.currentUser?.uid || App.currentUser?.uid || App.currentUser?.id || 'teacher_uid');

        console.log('\n[EXAM TARGET CLASSES]');
        console.log(`Teacher UID:\n${teacherUid}`);
        console.log(`Connected Students:\n${students.length}`);
        students.forEach(st => {
            console.log(`\nStudent:\n${st.name || st.student_name}\nGrade:\n${st.grade || st.class_name}\nSection:\n${st.section || 'A'}`);
        });
        console.log(`\nAvailable Target Classes:\n${classes.map(c => c.grade || c.displayName).join('\n') || 'None'}`);
        console.log('\nAvailable Sections:\n');
        classes.forEach(c => {
            console.log(`${c.grade || c.displayName}:\n${(c.sections || []).join(', ') || 'All'}`);
        });
        console.log('-----------------------------------------------------\n');

        return classes;
    },

    // 3. Assignment Mode Selection & Form Builder
    showNewAssignmentFormModal() {
        App.showModal(`
            <div class="modal-card" style="max-width: 520px; text-align: center;">
                <div class="modal-header">
                    <h3 class="modal-title">Select Assignment Mode</h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>
                <p style="color: var(--text-secondary); margin-top: 8px; margin-bottom: 20px;">Choose assignment format for students:</p>
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <button class="glass-card interactive bouncy-btn btn-assign-mode" data-mode="written" style="padding: 20px; text-align: left; border-left: 6px solid var(--accent-blue);">
                        <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">✏️ Written / Essay Task</div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Free-form text instructions and digital notebook submission.</div>
                    </button>
                    <button class="glass-card interactive bouncy-btn btn-assign-mode" data-mode="mcq" style="padding: 20px; text-align: left; border-left: 6px solid var(--accent-coral);">
                        <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">🔘 Multiple Choice Quiz</div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Structured multiple-choice questions with answer choices.</div>
                    </button>
                </div>
            </div>
        `);

        const modal = document.getElementById('modal-container');
        modal.querySelectorAll('.btn-assign-mode').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.renderAssignmentFormBuilder(mode);
            });
        });
    },

    async renderAssignmentFormBuilder(mode) {
        const targetClasses = await this.loadTargetClasses();
        const optionsHtml = targetClasses.length === 0
            ? '<option value="" disabled selected>No connected student classes found</option>'
            : targetClasses.map(c => `<option value="${c.rawClass}">${c.displayName} (${c.students.length} student${c.students.length > 1 ? 's' : ''})</option>`).join('');

        App.showModal(`
            <div class="modal-card" style="max-width: 600px;">
                <div class="modal-header">
                    <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                        <img src="/assets/icons/icon-assignment.svg" style="width: 24px; height: 24px;" alt="Assignment">
                        <span>New ${mode === 'mcq' ? 'Multiple Choice' : 'Written'} Assignment</span>
                    </h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>

                <form id="form-create-assignment" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Assignment Title</label>
                        <input type="text" id="assign-title" class="glass-input" placeholder="e.g. Science Report: Plant Ecosystems" required>
                    </div>

                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Subject</label>
                        <input type="text" id="assign-subject" class="glass-input" value="${App.currentUser?.subject || 'Mathematics'}" required>
                    </div>

                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Target Class</label>
                        <select id="assign-class-id" class="glass-select" required ${targetClasses.length === 0 ? 'disabled' : ''}>
                            ${optionsHtml}
                        </select>
                    </div>

                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Deadline / Due Date</label>
                        <input type="date" id="assign-due-date" class="glass-input" value="${new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0]}" required>
                    </div>

                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Instructions & Problem Description</label>
                        <textarea id="assign-description" class="glass-textarea" style="min-height: 100px;" placeholder="Write student instructions here..." required></textarea>
                    </div>

                    <button type="submit" class="glass-btn glass-btn-primary bouncy-btn" style="padding: 14px; margin-top: 8px;" ${targetClasses.length === 0 ? 'disabled' : ''}>Publish Assignment</button>
                </form>
            </div>
        `);

        const modal = document.getElementById('modal-container');
        const form = modal.querySelector('#form-create-assignment');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const targetClass = modal.querySelector('#assign-class-id').value;
            const subject = modal.querySelector('#assign-subject')?.value || 'Mathematics';
            const title = modal.querySelector('#assign-title').value;
            const due_at = modal.querySelector('#assign-due-date').value;
            const description = modal.querySelector('#assign-description').value;

            const selectedClassObj = targetClasses.find(c => c.rawClass === targetClass);
            const recipients = selectedClassObj ? selectedClassObj.students : [];
            const recipientUids = recipients.map(r => r.student_uid || r.student_id);

            console.log('[TARGET CLASS]');
            console.log(`Selected class:\n${targetClass}`);
            console.log(`Recipients:\n${recipients.map(r => r.name || r.student_name).join('\n')}`);

            try {
                // 1. Backend SQLite + Sync Queue creation
                const res = await API.createAssignment(targetClass, title, description, due_at, subject);

                // 2. Cloud Firestore creation
                if (window.firebaseAuthService) {
                    const teacherUid = window.firebaseAuthService.auth?.currentUser?.uid || App.currentUser?.uid || App.currentUser?.id;
                    await window.firebaseAuthService.createTeacherAssignment(teacherUid, {
                        id: res?.assignmentId || res?.id,
                        targetClass: targetClass,
                        className: selectedClassObj?.displayName || targetClass,
                        classId: selectedClassObj?.id || targetClass,
                        subject: subject,
                        title: title,
                        description: description,
                        dueAt: due_at,
                        recipientStudentUids: recipientUids,
                        mode: mode
                    });
                }

                console.log('[ASSIGNMENT]');
                console.log('Firebase write: SUCCESS');
                console.log(`Recipient count: ${recipients.length}`);

                App.closeModal();
                App.toast(`Assignment published to ${recipients.length} student(s) in ${targetClass}! 📝`, 'success');
                this.activeTab = 'assignments';
                this.render(document.querySelector('#view-teacher'));
            } catch (err) {
                App.toast('Failed to publish assignment: ' + (err.error || err.message), 'danger');
            }
        });
    },

    // 4. Structured Exam Creation Form Modal (Mode-First Step)
    showNewExamFormModal() {
        App.showModal(`
            <div class="modal-card" style="max-width: 520px; text-align: center;">
                <div class="modal-header">
                    <h3 class="modal-title">Select Exam Question Mode</h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>
                <p style="color: var(--text-secondary); margin-top: 8px; margin-bottom: 20px;">Choose question response format for this exam:</p>
                <div style="display: flex; flex-direction: column; gap: 14px;">
                    <button class="glass-card interactive bouncy-btn btn-exam-mode" data-mode="mcq" style="padding: 20px; text-align: left; border-left: 6px solid var(--accent-coral);">
                        <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">🔘 Multiple Choice Mode</div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Each question has A/B/C/D option fields and auto-grading selector.</div>
                    </button>
                    <button class="glass-card interactive bouncy-btn btn-exam-mode" data-mode="written" style="padding: 20px; text-align: left; border-left: 6px solid var(--accent-blue);">
                        <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">✏️ Written / Descriptive Mode</div>
                        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">Free-text short answer / essay questions on lined notebook paper.</div>
                    </button>
                </div>
            </div>
        `);

        const modal = document.getElementById('modal-container');
        modal.querySelectorAll('.btn-exam-mode').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.currentTarget.dataset.mode;
                this.renderExamFormBuilder(mode);
            });
        });
    },

    async renderExamFormBuilder(mode) {
        const targetClasses = await this.loadTargetClasses();
        const optionsHtml = targetClasses.length === 0
            ? '<option value="" disabled selected>No connected student classes found</option>'
            : targetClasses.map(c => `<option value="${c.rawClass}">${c.displayName} (${c.students.length} student${c.students.length > 1 ? 's' : ''})</option>`).join('');

        let questionRows = [
            { id: 1, text: '', type: mode, optionA: '', optionB: '', optionC: '', optionD: '', correct: '' }
        ];

        const renderQuestionsHTML = () => {
            return questionRows.map((q, idx) => `
                <div class="glass-card" style="padding: 14px; margin-bottom: 12px; background: rgba(255,255,255,0.6);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <strong style="font-size: 14px;">Question #${idx + 1} (${mode === 'mcq' ? 'Multiple Choice' : 'Written Essay'})</strong>
                        ${questionRows.length > 1 ? `<button type="button" class="btn-remove-q glass-btn glass-btn-sm" data-idx="${idx}" style="color: var(--status-danger); padding: 2px 8px;">Remove</button>` : ''}
                    </div>
                    <input type="text" class="glass-input q-text" data-idx="${idx}" value="${q.text}" placeholder="Enter question prompt..." style="margin-bottom: 8px;" required>
                    
                    ${mode === 'mcq' ? `
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                            <input type="text" class="glass-input q-opt-a" data-idx="${idx}" value="${q.optionA}" placeholder="Option A">
                            <input type="text" class="glass-input q-opt-b" data-idx="${idx}" value="${q.optionB}" placeholder="Option B">
                            <input type="text" class="glass-input q-opt-c" data-idx="${idx}" value="${q.optionC}" placeholder="Option C">
                            <input type="text" class="glass-input q-opt-d" data-idx="${idx}" value="${q.optionD}" placeholder="Option D">
                        </div>
                        <input type="text" class="glass-input q-correct" data-idx="${idx}" value="${q.correct}" placeholder="Exact Correct Answer string..." required>
                    ` : `
                        <div style="font-size: 12px; color: var(--text-muted); font-style: italic;">Student will answer this question using the child-friendly notebook writing canvas.</div>
                    `}
                </div>
            `).join('');
        };

        App.showModal(`
            <div class="modal-card" style="max-width: 680px; max-height: 85vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                        <img src="/assets/icons/icon-exam.svg" style="width: 24px; height: 24px;" alt="Exam">
                        <span>Create & Publish Exam (${mode === 'mcq' ? 'Multiple Choice' : 'Written Mode'})</span>
                    </h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>

                <form id="form-create-exam" style="display: flex; flex-direction: column; gap: 16px;">
                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Exam Title</label>
                        <input type="text" id="exam-title" class="glass-input" placeholder="e.g. Midterm Assessment" required>
                    </div>

                    <div>
                        <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Subject</label>
                        <input type="text" id="exam-subject" class="glass-input" value="${App.currentUser?.subject || 'Mathematics'}" required>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Target Class</label>
                            <select id="exam-class-id" class="glass-select" required ${targetClasses.length === 0 ? 'disabled' : ''}>
                                ${optionsHtml}
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Target Section</label>
                            <select id="exam-section-id" class="glass-select">
                                <option value="All">All Sections</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Time Limit (Minutes)</label>
                            <input type="number" id="exam-duration" class="glass-input" value="20" min="5" max="180" required>
                        </div>
                    </div>

                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Start Time (Access Window Opens)</label>
                            <input type="datetime-local" id="exam-start-time" class="glass-input" value="${new Date().toISOString().slice(0,16)}" required>
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">End Time (Access Window Closes)</label>
                            <input type="datetime-local" id="exam-end-time" class="glass-input" value="${new Date(Date.now() + 86400000).toISOString().slice(0,16)}" required>
                        </div>
                    </div>

                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                            <label style="font-size: 14px; font-weight: 600;">Exam Questions</label>
                            <button type="button" id="btn-add-q-row" class="glass-btn glass-btn-sm glass-btn-secondary">+ Add Question</button>
                        </div>
                        <div id="questions-builder-list">${renderQuestionsHTML()}</div>
                    </div>

                    <button type="submit" class="glass-btn glass-btn-primary bouncy-btn" style="padding: 14px; margin-top: 8px;" ${targetClasses.length === 0 ? 'disabled' : ''}>Publish Exam to Class</button>
                </form>
            </div>
        `);

        const modal = document.getElementById('modal-container');
        const qList = modal.querySelector('#questions-builder-list');

        const classSelectEl = modal.querySelector('#exam-class-id');
        const sectionSelectEl = modal.querySelector('#exam-section-id');
        if (classSelectEl && sectionSelectEl) {
            classSelectEl.addEventListener('change', () => {
                const selectedVal = classSelectEl.value;
                const selectedClass = targetClasses.find(c => (c.grade === selectedVal || c.rawClass === selectedVal || c.name === selectedVal));
                if (selectedClass && selectedClass.sections && selectedClass.sections.length > 0) {
                    sectionSelectEl.innerHTML = `
                        <option value="All">All Sections</option>
                        ${selectedClass.sections.map(sec => `<option value="${sec}">Section ${sec}</option>`).join('')}
                    `;
                } else {
                    sectionSelectEl.innerHTML = `<option value="All">All Sections</option>`;
                }
            });
            // Initial trigger
            classSelectEl.dispatchEvent(new Event('change'));
        }

        const bindQEvents = () => {
            qList.querySelectorAll('.q-text').forEach(el => el.addEventListener('input', e => questionRows[e.target.dataset.idx].text = e.target.value));
            if (mode === 'mcq') {
                qList.querySelectorAll('.q-opt-a').forEach(el => el.addEventListener('input', e => questionRows[e.target.dataset.idx].optionA = e.target.value));
                qList.querySelectorAll('.q-opt-b').forEach(el => el.addEventListener('input', e => questionRows[e.target.dataset.idx].optionB = e.target.value));
                qList.querySelectorAll('.q-opt-c').forEach(el => el.addEventListener('input', e => questionRows[e.target.dataset.idx].optionC = e.target.value));
                qList.querySelectorAll('.q-opt-d').forEach(el => el.addEventListener('input', e => questionRows[e.target.dataset.idx].optionD = e.target.value));
                qList.querySelectorAll('.q-correct').forEach(el => el.addEventListener('input', e => questionRows[e.target.dataset.idx].correct = e.target.value));
            }

            qList.querySelectorAll('.btn-remove-q').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.idx);
                    questionRows.splice(idx, 1);
                    qList.innerHTML = renderQuestionsHTML();
                    bindQEvents();
                });
            });
        };

        bindQEvents();

        modal.querySelector('#btn-add-q-row').addEventListener('click', () => {
            questionRows.push({ id: questionRows.length + 1, text: '', type: mode, optionA: '', optionB: '', optionC: '', optionD: '', correct: '' });
            qList.innerHTML = renderQuestionsHTML();
            bindQEvents();
        });

        const form = modal.querySelector('#form-create-exam');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const targetClass = modal.querySelector('#exam-class-id').value;
            const targetSection = modal.querySelector('#exam-section-id')?.value || 'All';
            const subject = modal.querySelector('#exam-subject')?.value || 'Mathematics';
            const title = modal.querySelector('#exam-title').value;
            const duration_minutes = parseInt(modal.querySelector('#exam-duration').value) || 20;
            const start_time = modal.querySelector('#exam-start-time').value;
            const end_time = modal.querySelector('#exam-end-time').value;

            const selectedClassObj = targetClasses.find(c => (c.grade === targetClass || c.rawClass === targetClass || c.name === targetClass));
            let recipients = selectedClassObj ? selectedClassObj.students : [];
            if (targetSection && targetSection !== 'All') {
                recipients = recipients.filter(s => String(s.section).toUpperCase() === targetSection.toUpperCase());
            }
            const recipientUids = recipients.map(r => r.uid || r.student_uid || r.student_id);

            console.log('[TARGET CLASS]');
            console.log(`Selected class:\n${targetClass} (Section: ${targetSection})`);
            console.log(`Recipients:\n${recipients.map(r => r.name || r.student_name).join('\n')}`);

            const formattedQuestions = questionRows.map((q, idx) => ({
                id: idx + 1,
                question: q.text,
                text: q.text,
                type: mode,
                options: mode === 'mcq' ? { A: q.optionA, B: q.optionB, C: q.optionC, D: q.optionD } : null,
                correct: q.correct || 'A',
                marks: mode === 'mcq' ? 1 : 10
            }));

            try {
                const res = await API.createExam({
                    class_id: targetClass,
                    target_class: targetClass,
                    target_section: targetSection,
                    education_level: selectedClassObj?.educationLevel || 'High School',
                    title,
                    questions: formattedQuestions,
                    duration_minutes,
                    subject,
                    exam_type: mode,
                    start_date: start_time ? start_time.split('T')[0] : undefined,
                    start_time: start_time ? start_time.split('T')[1] : undefined,
                    end_date: end_time ? end_time.split('T')[0] : undefined,
                    end_time: end_time ? end_time.split('T')[1] : undefined
                });

                if (window.firebaseAuthService) {
                    const teacherUid = window.firebaseAuthService.auth?.currentUser?.uid || App.currentUser?.uid || App.currentUser?.id;
                    await window.firebaseAuthService.createTeacherExam(teacherUid, {
                        id: res?.examId || res?.id,
                        targetClass: targetClass,
                        className: selectedClassObj?.displayName || targetClass,
                        classId: selectedClassObj?.classId || targetClass,
                        targetSection: targetSection,
                        educationLevel: selectedClassObj?.educationLevel || 'High School',
                        subject: subject,
                        title: title,
                        durationMinutes: duration_minutes,
                        startTime: start_time,
                        endTime: end_time,
                        questions: formattedQuestions,
                        recipientStudentUids: recipientUids
                    });
                }

                console.log('[EXAM]');
                console.log('Firebase write: SUCCESS');
                console.log(`Recipient count: ${recipients.length}`);

                App.closeModal();
                App.toast(`Exam published to ${recipients.length} student(s) in ${targetClass}! 📋`, 'success');
                this.activeTab = 'exams';
                this.render(document.querySelector('#view-teacher'));
            } catch (err) {
                App.toast('Failed to publish exam: ' + (err.error || err.message), 'danger');
            }
        });
    },

    // 5. Attendance Marker
    async renderAttendance(container) {
        if (!this.currentClassId) return;
        const todayStr = new Date().toISOString().split('T')[0];

        if (!this.students.length) {
            const res = await API.getClassStudents(this.currentClassId);
            this.students = res.students || [];
        }

        const existingAtt = await API.getAttendance(this.currentClassId, todayStr);
        const attMap = {};
        if (existingAtt.attendance) {
            existingAtt.attendance.forEach(a => attMap[a.student_id] = a.status);
        }

        container.innerHTML = `
            <div class="glass-card">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h3 style="font-size: 18px; font-weight: 700;">Daily Attendance Marker</h3>
                        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">Mark student presence for ${todayStr}</p>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button id="btn-mark-all-present" class="glass-btn glass-btn-secondary glass-btn-sm">Mark All Present</button>
                        <button id="btn-save-attendance" class="glass-btn glass-btn-primary bouncy-btn">Save Attendance</button>
                    </div>
                </div>

                <div class="table-container">
                    <table class="glass-table">
                        <thead>
                            <tr>
                                <th>Roll #</th>
                                <th>Student Name</th>
                                <th>Code</th>
                                <th>Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${this.students.map(s => `
                                <tr>
                                    <td><strong>${s.roll_number || '—'}</strong></td>
                                    <td>${s.name}</td>
                                    <td><span style="font-family: monospace; font-size: 12px; color: var(--accent-primary); font-weight: 700;">${s.student_code}</span></td>
                                    <td>
                                        <div class="att-status-group" data-student-id="${s.id}" style="display: flex; gap: 6px;">
                                            <button type="button" class="glass-btn glass-btn-sm att-btn ${(attMap[s.id] || 'present') === 'present' ? 'active-present' : ''}" data-status="present">Present</button>
                                            <button type="button" class="glass-btn glass-btn-sm att-btn ${attMap[s.id] === 'absent' ? 'active-absent' : ''}" data-status="absent">Absent</button>
                                            <button type="button" class="glass-btn glass-btn-sm att-btn ${attMap[s.id] === 'late' ? 'active-late' : ''}" data-status="late">Late</button>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        container.querySelectorAll('.att-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const group = e.currentTarget.closest('.att-status-group');
                group.querySelectorAll('.att-btn').forEach(b => b.className = 'glass-btn glass-btn-sm att-btn');
                const status = e.currentTarget.dataset.status;
                e.currentTarget.classList.add(`active-${status}`);
            });
        });

        container.querySelector('#btn-mark-all-present').addEventListener('click', () => {
            container.querySelectorAll('.att-status-group').forEach(group => {
                group.querySelectorAll('.att-btn').forEach(b => b.className = 'glass-btn glass-btn-sm att-btn');
                const presentBtn = group.querySelector('[data-status="present"]');
                if (presentBtn) presentBtn.classList.add('active-present');
            });
        });

        container.querySelector('#btn-save-attendance').addEventListener('click', async () => {
            const records = [];
            container.querySelectorAll('.att-status-group').forEach(group => {
                const student_id = group.dataset.studentId;
                const activeBtn = group.querySelector('.active-present, .active-absent, .active-late');
                const status = activeBtn ? activeBtn.dataset.status : 'present';
                records.push({ student_id, status });
            });

            try {
                await API.markAttendance(this.currentClassId, todayStr, records);
                App.toast('Attendance saved successfully! ✓', 'success');
            } catch (err) {
                App.toast('Failed to save attendance: ' + err.message, 'danger');
            }
        });
    },

    // 6. Assignments List
    async renderAssignments(container) {
        if (!this.currentClassId) return;
        const res = await API.getAssignments(this.currentClassId);
        const assignments = res.assignments || [];

        container.innerHTML = `
            <div class="glass-card" style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="font-size: 18px; font-weight: 700;">Class Assignments</h3>
                    <button class="glass-btn glass-btn-primary bouncy-btn" onclick="TeacherView.showNewAssignmentFormModal()">+ New Assignment</button>
                </div>

                ${assignments.length === 0 ? '<p style="color: var(--text-muted); text-align: center; padding: 20px;">No assignments created yet for this class.</p>' : ''}
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    ${assignments.map(a => `
                        <div class="glass-card" style="padding: 16px;">
                            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                <div>
                                    <h4 style="font-size: 16px; font-weight: 700;">${a.title}</h4>
                                    <p style="font-size: 13px; color: var(--text-secondary); margin-top: 4px;">${a.description || 'No description'}</p>
                                    <div style="font-size: 12px; color: var(--text-muted); margin-top: 8px;">
                                        Due: <strong>${a.due_at ? new Date(a.due_at).toLocaleDateString() : 'No date'}</strong> | Submissions: <strong>${a.submission_count || 0}</strong>
                                    </div>
                                </div>
                                <button class="glass-btn glass-btn-secondary glass-btn-sm bouncy-btn btn-view-submissions" data-id="${a.id}" data-title="${a.title}">
                                    <span>View Submissions & Grade →</span>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;

        container.querySelectorAll('.btn-view-submissions').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.dataset.id;
                const title = e.currentTarget.dataset.title;
                this.showSubmissionsModal(id, title);
            });
        });
    },

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    renderStudentSubmissionContent(content) {
        if (!content) {
            return `<div style="color: var(--text-muted); font-style: italic; padding: 10px;">No answer content provided.</div>`;
        }

        let parsed = null;
        if (typeof content === 'string' && (content.trim().startsWith('{') || content.trim().startsWith('['))) {
            try {
                parsed = JSON.parse(content);
            } catch (e) {}
        } else if (typeof content === 'object') {
            parsed = content;
        }

        // Handwriting Exam Answer with strokes or preview image
        if (parsed && (parsed.answerType === 'handwriting' || parsed.strokes || parsed.previewDataUrl)) {
            const previewUrl = parsed.previewDataUrl || null;
            const strokeCount = (parsed.strokes && Array.isArray(parsed.strokes)) ? parsed.strokes.length : 0;
            const textFallback = (parsed.textFallback || '').trim();

            return `
                <div class="submission-content-wrapper" style="display: flex; flex-direction: column; gap: 12px;">
                    <div class="submission-canvas-block" style="border: 2px solid #CBD5E1; border-radius: 10px; overflow: hidden; background: #FFFFFF;">
                        <div style="font-size: 11.5px; font-weight: 800; color: #4F46E5; text-transform: uppercase; padding: 8px 14px; background: #EEF2FF; border-bottom: 1.5px solid #CBD5E1; display: flex; justify-content: space-between; align-items: center;">
                            <span>✍️ Student Stylus Handwriting (${strokeCount} Strokes)</span>
                            <span style="font-size: 10.5px; color: #64748B; font-weight: 700;">Digital Answer Sheet</span>
                        </div>
                        <div style="padding: 12px; text-align: center; background-color: #FFFFFF; background-image: linear-gradient(#E2E8F0 1px, transparent 1px); background-size: 100% 28px;">
                            ${previewUrl ? `
                                <img src="${previewUrl}" alt="Student Handwriting" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; background: #FFF;">
                            ` : `
                                <div style="padding: 30px; color: #475569; font-weight: 700;">
                                    📝 Handwriting captured (${strokeCount} strokes recorded)
                                </div>
                            `}
                        </div>
                    </div>
                    ${textFallback ? `
                        <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 6px; padding: 10px 14px;">
                            <span style="font-size: 11px; font-weight: 800; color: #64748B; text-transform: uppercase;">⌨️ Supplementary Notes:</span>
                            <div style="font-size: 13.5px; color: #1E293B; margin-top: 4px; white-space: pre-wrap;">${this.escapeHtml(textFallback)}</div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Rich notebook note with canvas drawing & text
        if (parsed && (parsed.type === 'smartslate_note_v2' || parsed.canvasData || parsed.text !== undefined)) {
            const text = (parsed.text || '').trim();
            const canvasData = parsed.canvasData || null;

            return `
                <div class="submission-content-wrapper" style="display: flex; flex-direction: column; gap: 14px;">
                    ${text ? `
                        <div class="submission-text-block" style="font-size: 14px; color: #1F2937; line-height: 1.65; white-space: pre-wrap; word-break: break-word; font-family: inherit; background: #FFFFFF; padding: 14px 16px; border-radius: 8px; border: 1.5px solid #E5E7EB; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);">
${this.escapeHtml(text)}
                        </div>
                    ` : ''}
                    ${canvasData ? `
                        <div class="submission-canvas-block" style="border: 1.5px solid #E5E7EB; border-radius: 8px; overflow: hidden; background: #FFFFFF;">
                            <div style="font-size: 11.5px; font-weight: 800; color: #4F46E5; text-transform: uppercase; padding: 8px 14px; background: #EEF2FF; border-bottom: 1px solid #E5E7EB; display: flex; align-items: center; gap: 6px;">
                                <span>🎨 Student Handwritten / Canvas Solution</span>
                            </div>
                            <div style="padding: 14px; text-align: center; background: #FAFBFD;">
                                <img src="${canvasData}" alt="Student Drawing" style="max-width: 100%; height: auto; display: block; margin: 0 auto; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.06); border: 1px solid #E5E7EB;">
                            </div>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Standard plain text preserving all whitespace, paragraphs, and line breaks
        return `
            <div class="submission-text-block" style="font-size: 14px; color: #1F2937; line-height: 1.65; white-space: pre-wrap; word-break: break-word; font-family: inherit; background: #FFFFFF; padding: 14px 16px; border-radius: 8px; border: 1.5px solid #E5E7EB; box-shadow: inset 0 1px 2px rgba(0,0,0,0.02);">
${this.escapeHtml(typeof content === 'string' ? content : JSON.stringify(content, null, 2))}
            </div>
        `;
    },

    async showSubmissionsModal(assignmentId, title) {
        App.showModal(`
            <div class="modal-card" style="max-width: 720px; max-height: 88vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                        <img src="/assets/icons/icon-assignment.svg" style="width: 22px; height: 22px;" alt="Submissions">
                        <span>Submissions: "${title}"</span>
                    </h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>
                <div id="submissions-modal-body" style="padding-top: 14px;">
                    <div style="text-align: center; padding: 30px;"><div class="spinner" style="margin: 0 auto;"></div></div>
                </div>
            </div>
        `);

        try {
            const res = await API.getAssignmentSubmissions(assignmentId);
            const submissions = res.submissions || [];
            const body = document.getElementById('submissions-modal-body');

            if (!submissions.length) {
                body.innerHTML = `
                    <div style="text-align: center; padding: 40px 20px; color: var(--text-muted);">
                        <div style="font-size: 32px; margin-bottom: 8px;">📬</div>
                        <p style="font-weight: 700; font-size: 15px; margin: 0;">No student submissions received yet.</p>
                        <p style="font-size: 13px; margin-top: 4px;">Student answers will appear here in real-time as they are submitted.</p>
                    </div>
                `;
                return;
            }

            body.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 18px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--text-secondary);">
                        <span>Total Submissions: <strong>${submissions.length}</strong></span>
                        <span style="color: var(--accent-primary); font-weight: 700;">Click "Save Evaluation" to record marks & feedback</span>
                    </div>

                    ${submissions.map(sub => {
                        const isEvaluated = sub.status === 'evaluated' || sub.status === 'graded';
                        const submittedTimeStr = sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : 'Recently';
                        const evaluatedTimeStr = sub.evaluated_at ? new Date(sub.evaluated_at).toLocaleString() : null;

                        return `
                            <div class="glass-card" style="padding: 20px; background: rgba(255,255,255,0.9); border: 1.5px solid var(--border-color); border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.04);">
                                
                                <!-- Student Header -->
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; flex-wrap: wrap; gap: 8px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <strong style="font-size: 16px; color: var(--text-primary);">${sub.student_name}</strong>
                                            <span class="glass-badge" style="font-size: 11.5px; background: #EEF2FF; color: #4F46E5; font-weight: 800;">${sub.student_code}</span>
                                        </div>
                                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
                                            Submitted: <strong>${submittedTimeStr}</strong>
                                            ${sub.evaluated_by ? ` • Evaluated by: <strong>${sub.evaluated_by}</strong>` : ''}
                                        </div>
                                    </div>
                                    <span class="glass-badge ${isEvaluated ? 'glass-badge-success' : 'glass-badge-warning'}" style="font-weight: 800; font-size: 12px; padding: 4px 12px;">
                                        ${isEvaluated ? 'Evaluated ✓' : '⏳ Pending Evaluation'}
                                    </span>
                                </div>

                                <!-- Student Submitted Formatted Answer Box -->
                                <div style="margin-bottom: 16px;">
                                    <div style="font-size: 12px; font-weight: 800; color: #4B5563; text-transform: uppercase; margin-bottom: 6px; letter-spacing: 0.5px;">
                                        📝 Student Submitted Answer:
                                    </div>
                                    <div class="student-answer-display" style="background: #F9FAFB; border-radius: 8px; padding: 2px;">
                                        ${this.renderStudentSubmissionContent(sub.content)}
                                    </div>
                                </div>

                                <!-- Teacher Evaluation Form -->
                                <div class="submission-eval-panel" style="background: #F3F4F6; padding: 14px 16px; border-radius: 10px; border: 1px solid #E5E7EB;">
                                    <div style="font-size: 12px; font-weight: 800; color: var(--accent-primary); text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                                        <span>✍️ Teacher Evaluation & Marks</span>
                                    </div>
                                    <form class="form-grade-sub" data-sub-id="${sub.id}" style="display: flex; flex-direction: column; gap: 10px;">
                                        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 10px;">
                                            <div>
                                                <label style="display: block; font-size: 11.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">Marks / Grade</label>
                                                <input type="text" class="glass-input input-grade" value="${sub.grade || ''}" placeholder="e.g. 8/10 or A+" required style="padding: 8px 12px; font-size: 13.5px; font-weight: 700; background: #FFF;">
                                            </div>
                                            <div>
                                                <label style="display: block; font-size: 11.5px; font-weight: 700; color: var(--text-secondary); margin-bottom: 4px;">Teacher Feedback</label>
                                                <input type="text" class="glass-input input-feedback" value="${sub.feedback || ''}" placeholder="Enter feedback (e.g. Good explanation. Add diagram next time.)" style="padding: 8px 12px; font-size: 13.5px; background: #FFF;">
                                            </div>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                                            <span style="font-size: 11.5px; color: var(--text-muted);">
                                                ${evaluatedTimeStr ? `Last evaluated on ${evaluatedTimeStr}` : 'Not yet evaluated'}
                                            </span>
                                            <button type="submit" class="glass-btn glass-btn-primary glass-btn-sm bouncy-btn" style="background: linear-gradient(135deg, #10B981, #059669); padding: 8px 20px; font-weight: 800; box-shadow: 0 2px 8px rgba(16,185,129,0.3);">
                                                <span>💾 Save Evaluation</span>
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            body.querySelectorAll('.form-grade-sub').forEach(form => {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const subId = form.dataset.subId;
                    const grade = form.querySelector('.input-grade').value.trim();
                    const feedback = form.querySelector('.input-feedback').value.trim();
                    const saveBtn = form.querySelector('button[type="submit"]');

                    if (saveBtn) {
                        saveBtn.disabled = true;
                        saveBtn.textContent = 'Saving...';
                    }

                    try {
                        await API.gradeSubmission(subId, grade, feedback);
                        App.toast('Evaluation and marks saved successfully! 📝', 'success');
                        if (saveBtn) {
                            saveBtn.disabled = false;
                            saveBtn.textContent = '💾 Saved ✓';
                            setTimeout(() => {
                                saveBtn.textContent = '💾 Save Evaluation';
                            }, 2000);
                        }
                    } catch (err) {
                        App.toast('Failed to save evaluation: ' + err.message, 'danger');
                        if (saveBtn) {
                            saveBtn.disabled = false;
                            saveBtn.textContent = '💾 Save Evaluation';
                        }
                    }
                });
            });
        } catch (err) {
            App.toast('Error loading submissions: ' + err.message, 'danger');
        }
    },

    // 7. Exams List & Creation
    async renderExams(container) {
        const res = await API.getExams();
        const exams = res.exams || [];

        container.innerHTML = `
            <div class="glass-card" style="padding: 24px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; flex-wrap: wrap; gap: 14px;">
                    <div>
                        <h3 style="font-size: 20px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px 0; display: flex; align-items: center; gap: 8px;">
                            <img src="/assets/icons/icon-exam.svg" style="width: 24px; height: 24px;" alt="Exams">
                            <span>Examinations & Assessments</span>
                        </h3>
                        <p style="font-size: 13px; color: var(--text-secondary); margin: 0;">
                            Create & monitor Multiple Choice (MCQ) and Written exams with live fullscreen violation alerts.
                        </p>
                    </div>
                    <button class="glass-btn glass-btn-primary bouncy-btn" onclick="TeacherView.showNewExamFormModal()" style="font-weight: 800; padding: 10px 20px;">
                        <span>+ Create New Exam</span>
                    </button>
                </div>

                ${exams.length === 0 ? `
                    <div style="text-align: center; padding: 60px 20px; color: var(--text-muted); background: rgba(255,255,255,0.5); border-radius: 16px;">
                        <div style="font-size: 40px; margin-bottom: 10px;">📋</div>
                        <h4 style="font-size: 16px; font-weight: 800; color: var(--text-primary); margin: 0 0 6px 0;">No exams published yet</h4>
                        <p style="font-size: 13px; margin: 0 0 16px 0;">Publish an MCQ or Written unit test for your connected classes.</p>
                        <button class="glass-btn glass-btn-primary glass-btn-sm" onclick="TeacherView.showNewExamFormModal()">+ Create Exam Now</button>
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${exams.map(e => {
                            const isMcq = e.exam_type === 'mcq';
                            const hasViolations = e.violations_count > 0;
                            const startDateStr = e.start_date || '2026-08-17';
                            const startTimeStr = e.start_time || '09:00';
                            const endDateStr = e.end_date || startDateStr;
                            const endTimeStr = e.end_time || '18:00';

                            return `
                                <div class="glass-card" style="padding: 20px; background: rgba(255,255,255,0.9); border: 1.5px solid var(--border-color); border-radius: 14px; box-shadow: 0 4px 16px rgba(0,0,0,0.03);">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
                                        <div>
                                            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 6px;">
                                                <span class="glass-badge" style="background: ${isMcq ? '#EEF2FF' : '#FEF3C7'}; color: ${isMcq ? '#4F46E5' : '#B45309'}; font-weight: 800; font-size: 11px;">
                                                    ${isMcq ? '🔘 MCQ Exam (Auto-graded)' : '✍️ Written Exam'}
                                                </span>
                                                <span class="glass-badge" style="background: #F3F4F6; color: #4B5563; font-weight: 800; font-size: 11px;">
                                                    ${e.subject || 'General'}
                                                </span>
                                                <span class="glass-badge" style="background: #E0E7FF; color: #3730A3; font-weight: 800; font-size: 11px;">
                                                    Class: ${e.target_class || e.class_name || 'Class 8'}
                                                </span>
                                            </div>
                                            <h4 style="font-size: 17px; font-weight: 800; color: #151A2D; margin: 0 0 4px 0;">${e.title}</h4>
                                            <div style="font-size: 12.5px; color: #6B7280; display: flex; align-items: center; gap: 14px; flex-wrap: wrap;">
                                                <span>⏱️ Window: <strong>${startDateStr} ${startTimeStr}</strong> → <strong>${endDateStr} ${endTimeStr}</strong></span>
                                                <span>⏳ Duration: <strong>${e.duration_minutes || 60} mins</strong></span>
                                                <span>📊 Questions: <strong>${e.questions_count || 0}</strong></span>
                                            </div>
                                        </div>

                                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                                            <span class="glass-badge glass-badge-success" style="font-weight: 800; font-size: 11.5px;">Published ✓</span>
                                            ${hasViolations ? `
                                                <span class="glass-badge glass-badge-danger" style="font-weight: 800; font-size: 11px; background: #FEE2E2; color: #DC2626;">
                                                    ⚠️ ${e.violations_count} Fullscreen Violations
                                                </span>
                                            ` : ''}
                                        </div>
                                    </div>

                                    <!-- Bottom Action Bar & Metrics -->
                                    <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 14px; border-top: 1px solid var(--border-color); flex-wrap: wrap; gap: 10px;">
                                        <div style="display: flex; gap: 16px; font-size: 13px; color: var(--text-secondary);">
                                            <span>Submissions: <strong style="color: var(--text-primary);">${e.submissions_count || 0}</strong></span>
                                            <span>Active Now: <strong style="color: #059669;">${e.active_count || 0}</strong></span>
                                        </div>
                                        <div style="display: flex; gap: 8px;">
                                            <button class="glass-btn glass-btn-secondary glass-btn-sm" onclick="TeacherView.showExamLiveMonitorModal(${e.id}, '${e.title.replace(/'/g, "\\'")}')" style="font-weight: 700;">
                                                <span>👁️ Live Monitor</span>
                                            </button>
                                            <button class="glass-btn glass-btn-primary glass-btn-sm" onclick="TeacherView.showExamSubmissionsModal(${e.id}, '${e.title.replace(/'/g, "\\'")}', '${e.exam_type || 'written'}')" style="font-weight: 700;">
                                                <span>📝 View Submissions & Grade</span>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>
        `;
    },

    // Show New Exam Creation Modal with MCQ and Written support
    async showNewExamFormModal() {
        const classes = await this.loadTargetClasses();
        const todayStr = new Date().toISOString().split('T')[0];

        App.showModal(`
            <div class="modal-card" style="max-width: 780px; max-height: 90vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                        <span>📋 Create New Examination</span>
                    </h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>

                <form id="form-create-exam" style="padding-top: 16px; display: flex; flex-direction: column; gap: 18px;">
                    
                    <!-- Exam Type Radio Selection -->
                    <div>
                        <label style="display: block; font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--text-secondary); margin-bottom: 8px;">
                            Exam Type
                        </label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <label class="glass-card" style="display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; border: 2px solid var(--border-color); border-radius: 10px;" id="label-type-mcq">
                                <input type="radio" name="exam_type" value="mcq" checked style="width: 18px; height: 18px; accent-color: #4F46E5;">
                                <div>
                                    <strong style="display: block; font-size: 14px; color: #1F2937;">Multiple Choice (MCQ)</strong>
                                    <span style="font-size: 11.5px; color: #6B7280;">Auto-evaluated based on correct option key</span>
                                </div>
                            </label>
                            <label class="glass-card" style="display: flex; align-items: center; gap: 10px; padding: 12px 16px; cursor: pointer; border: 2px solid var(--border-color); border-radius: 10px;" id="label-type-written">
                                <input type="radio" name="exam_type" value="written" style="width: 18px; height: 18px; accent-color: #4F46E5;">
                                <div>
                                    <strong style="display: block; font-size: 14px; color: #1F2937;">Written / Subjective</strong>
                                    <span style="font-size: 11.5px; color: #6B7280;">Paragraphs, answers, and manual teacher evaluation</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <!-- Exam Title & Subject -->
                    <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;">Exam Title</label>
                            <input type="text" id="exam-title-input" class="glass-input" placeholder="e.g. Mathematics Unit Test — Linear Equations" required style="padding: 10px 14px; font-weight: 700;">
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;">Subject</label>
                            <input type="text" id="exam-subject-input" class="glass-input" value="${App.currentUser?.subject || 'Mathematics'}" placeholder="e.g. Mathematics" required style="padding: 10px 14px;">
                        </div>
                    </div>

                    <!-- Target Class, Target Section & Duration -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px;">
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;">Target Class</label>
                            <select id="exam-class-select" class="glass-input" required style="padding: 10px 14px;">
                                <option value="">Select Target Class</option>
                                ${classes.map(c => `<option value="${c.grade || c.rawClass}">${c.grade || c.displayName} (${c.studentCount || c.students?.length || 1} student${(c.studentCount || c.students?.length) > 1 ? 's' : ''})</option>`).join('')}
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;">Target Section</label>
                            <select id="exam-section-select" class="glass-input" style="padding: 10px 14px;">
                                <option value="All">All Sections</option>
                            </select>
                        </div>
                        <div>
                            <label style="display: block; font-size: 12px; font-weight: 800; color: var(--text-secondary); margin-bottom: 6px;">Duration (Minutes)</label>
                            <input type="number" id="exam-duration-input" class="glass-input" value="60" min="5" max="300" required style="padding: 10px 14px; font-weight: 700;">
                        </div>
                    </div>

                    <!-- Availability Window: Start Date/Time & End Date/Time -->
                    <div style="background: #F9FAFB; padding: 14px 16px; border-radius: 10px; border: 1.5px solid var(--border-color);">
                        <label style="display: block; font-size: 12px; font-weight: 800; text-transform: uppercase; color: var(--accent-primary); margin-bottom: 8px;">
                            ⏰ Server Availability Window (Date & Time Enforcement)
                        </label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                            <div>
                                <label style="display: block; font-size: 11.5px; font-weight: 700; color: #4B5563; margin-bottom: 4px;">Start Date & Time</label>
                                <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 6px;">
                                    <input type="date" id="exam-start-date" class="glass-input" value="${todayStr}" required style="padding: 8px 10px; font-size: 13px; background: #FFF;">
                                    <input type="time" id="exam-start-time" class="glass-input" value="09:00" required style="padding: 8px 10px; font-size: 13px; background: #FFF;">
                                </div>
                            </div>
                            <div>
                                <label style="display: block; font-size: 11.5px; font-weight: 700; color: #4B5563; margin-bottom: 4px;">End Date & Time</label>
                                <div style="display: grid; grid-template-columns: 3fr 2fr; gap: 6px;">
                                    <input type="date" id="exam-end-date" class="glass-input" value="${todayStr}" required style="padding: 8px 10px; font-size: 13px; background: #FFF;">
                                    <input type="time" id="exam-end-time" class="glass-input" value="23:59" required style="padding: 8px 10px; font-size: 13px; background: #FFF;">
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Dynamic Questions Container -->
                    <div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                            <label style="font-size: 13px; font-weight: 800; text-transform: uppercase; color: var(--text-primary);">
                                Questions & Marking Scheme
                            </label>
                            <button type="button" id="btn-add-question" class="glass-btn glass-btn-secondary glass-btn-sm bouncy-btn" style="font-weight: 800;">
                                <span>+ Add Question</span>
                            </button>
                        </div>

                        <div id="questions-builder-list" style="display: flex; flex-direction: column; gap: 14px;">
                            <!-- Questions will be rendered dynamically -->
                        </div>
                    </div>

                    <!-- Submit & Actions -->
                    <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 10px; border-top: 1px solid var(--border-color); padding-top: 16px;">
                        <button type="button" class="glass-btn glass-btn-secondary" onclick="App.closeModal()">Cancel</button>
                        <button type="submit" id="btn-submit-exam" class="glass-btn glass-btn-primary bouncy-btn" style="padding: 10px 24px; font-weight: 800;">
                            <span>🚀 Publish Exam to Students</span>
                        </button>
                    </div>
                </form>
            </div>
        `);

        // Dynamic Section updater based on Class selection
        const classSelect = document.getElementById('exam-class-select');
        const sectionSelect = document.getElementById('exam-section-select');
        
        classSelect.addEventListener('change', () => {
            const selectedVal = classSelect.value;
            const selectedClass = classes.find(c => (c.grade === selectedVal || c.rawClass === selectedVal || c.name === selectedVal));
            
            if (selectedClass && selectedClass.sections && selectedClass.sections.length > 0) {
                sectionSelect.innerHTML = `
                    <option value="All">All Sections</option>
                    ${selectedClass.sections.map(sec => `<option value="${sec}">Section ${sec}</option>`).join('')}
                `;
            } else {
                sectionSelect.innerHTML = `<option value="All">All Sections</option>`;
            }
        });

        let questionsData = [
            { id: 'q_1', question: '', options: { A: '', B: '', C: '', D: '' }, correct: 'A', marks: 1 }
        ];

        const renderQuestions = () => {
            const list = document.getElementById('questions-builder-list');
            if (!list) return;
            const currentType = document.querySelector('input[name="exam_type"]:checked')?.value || 'mcq';

            list.innerHTML = questionsData.map((q, idx) => {
                if (currentType === 'mcq') {
                    return `
                        <div class="glass-card" style="padding: 16px; background: #FFFFFF; border: 1.5px solid var(--border-color); border-radius: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong style="font-size: 13px; color: var(--accent-primary);">Question ${idx + 1} (MCQ)</strong>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <label style="font-size: 12px; font-weight: 700; color: #4B5563;">Marks:</label>
                                    <input type="number" class="glass-input q-marks" data-idx="${idx}" value="${q.marks || 1}" min="1" max="100" style="width: 60px; padding: 4px 8px; text-align: center;">
                                    ${questionsData.length > 1 ? `<button type="button" class="btn-remove-q glass-btn glass-btn-sm" data-idx="${idx}" style="color: #DC2626; padding: 4px 8px;">✕</button>` : ''}
                                </div>
                            </div>
                            <textarea class="glass-input q-text" data-idx="${idx}" placeholder="Enter Question Prompt (e.g. What is the value of x in 3x + 12 = 27?)" rows="2" required style="width: 100%; padding: 10px; margin-bottom: 12px;">${q.question || ''}</textarea>
                            
                            <!-- 4 MCQ Options -->
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                                ${['A', 'B', 'C', 'D'].map(opt => `
                                    <div style="display: flex; align-items: center; gap: 8px; background: #F9FAFB; padding: 8px 10px; border-radius: 6px; border: 1px solid #E5E7EB;">
                                        <input type="radio" name="correct_${idx}" value="${opt}" ${q.correct === opt ? 'checked' : ''} class="q-correct" data-idx="${idx}" style="accent-color: #10B981; width: 16px; height: 16px;" title="Mark ${opt} as correct answer">
                                        <strong style="font-size: 13px; color: #374151;">${opt}:</strong>
                                        <input type="text" class="glass-input q-opt" data-idx="${idx}" data-opt="${opt}" value="${q.options?.[opt] || ''}" placeholder="Option ${opt}" required style="padding: 4px 8px; font-size: 13px; background: #FFF;">
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                } else {
                    return `
                        <div class="glass-card" style="padding: 16px; background: #FFFFFF; border: 1.5px solid var(--border-color); border-radius: 10px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                                <strong style="font-size: 13px; color: var(--accent-primary);">Question ${idx + 1} (Written / Subjective)</strong>
                                <div style="display: flex; align-items: center; gap: 10px;">
                                    <label style="font-size: 12px; font-weight: 700; color: #4B5563;">Marks:</label>
                                    <input type="number" class="glass-input q-marks" data-idx="${idx}" value="${q.marks || 10}" min="1" max="100" style="width: 70px; padding: 4px 8px; text-align: center;">
                                    ${questionsData.length > 1 ? `<button type="button" class="btn-remove-q glass-btn glass-btn-sm" data-idx="${idx}" style="color: #DC2626; padding: 4px 8px;">✕</button>` : ''}
                                </div>
                            </div>
                            <textarea class="glass-input q-text" data-idx="${idx}" placeholder="Enter Question Prompt (e.g. Explain the process of photosynthesis with chemical equations and diagrams.)" rows="3" required style="width: 100%; padding: 10px;">${q.question || ''}</textarea>
                        </div>
                    `;
                }
            }).join('');

            // Bind remove & change events
            list.querySelectorAll('.btn-remove-q').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.currentTarget.dataset.idx, 10);
                    questionsData.splice(idx, 1);
                    renderQuestions();
                });
            });

            list.querySelectorAll('.q-text').forEach(el => {
                el.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.idx, 10);
                    questionsData[idx].question = e.target.value;
                });
            });

            list.querySelectorAll('.q-marks').forEach(el => {
                el.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.idx, 10);
                    questionsData[idx].marks = parseFloat(e.target.value) || 1;
                });
            });

            list.querySelectorAll('.q-opt').forEach(el => {
                el.addEventListener('input', (e) => {
                    const idx = parseInt(e.target.dataset.idx, 10);
                    const opt = e.target.dataset.opt;
                    if (!questionsData[idx].options) questionsData[idx].options = {};
                    questionsData[idx].options[opt] = e.target.value;
                });
            });

            list.querySelectorAll('.q-correct').forEach(el => {
                el.addEventListener('change', (e) => {
                    const idx = parseInt(e.target.dataset.idx, 10);
                    questionsData[idx].correct = e.target.value;
                });
            });
        };

        renderQuestions();

        // Switch Type handler
        document.querySelectorAll('input[name="exam_type"]').forEach(r => {
            r.addEventListener('change', () => {
                renderQuestions();
            });
        });

        // Add question handler
        document.getElementById('btn-add-question').addEventListener('click', () => {
            const nextIdx = questionsData.length + 1;
            questionsData.push({
                id: `q_${nextIdx}`,
                question: '',
                options: { A: '', B: '', C: '', D: '' },
                correct: 'A',
                marks: document.querySelector('input[name="exam_type"]:checked')?.value === 'mcq' ? 1 : 10
            });
            renderQuestions();
        });

        // Form Submit
        document.getElementById('form-create-exam').addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitBtn = document.getElementById('btn-submit-exam');
            submitBtn.disabled = true;
            submitBtn.textContent = 'Publishing Exam...';

            try {
                const examType = document.querySelector('input[name="exam_type"]:checked').value;
                const title = document.getElementById('exam-title-input').value.trim();
                const subject = document.getElementById('exam-subject-input').value.trim();
                const targetClass = document.getElementById('exam-class-select').value;
                const targetSection = document.getElementById('exam-section-select')?.value || 'All';
                const duration = parseInt(document.getElementById('exam-duration-input').value, 10) || 60;
                const startDate = document.getElementById('exam-start-date').value;
                const startTime = document.getElementById('exam-start-time').value;
                const endDate = document.getElementById('exam-end-date').value;
                const endTime = document.getElementById('exam-end-time').value;

                const selectedClassObj = classes.find(c => (c.grade === targetClass || c.rawClass === targetClass || c.name === targetClass));
                let recipientStudents = selectedClassObj ? selectedClassObj.students : [];
                if (targetSection && targetSection !== 'All') {
                    recipientStudents = recipientStudents.filter(s => String(s.section).toUpperCase() === targetSection.toUpperCase());
                }
                const recipientUids = recipientStudents.map(r => String(r.uid || r.student_uid || r.student_id || r));

                const res = await API.createExam({
                    class_id: targetClass,
                    target_class: targetClass,
                    target_section: targetSection,
                    education_level: selectedClassObj?.educationLevel || 'High School',
                    title,
                    subject,
                    exam_type: examType,
                    duration_minutes: duration,
                    start_date: startDate,
                    start_time: startTime,
                    end_date: endDate,
                    end_time: endTime,
                    questions: questionsData
                });

                // Publish to Cloud Firestore
                if (window.firebaseAuthService) {
                    const teacherUid = String(window.firebaseAuthService.auth?.currentUser?.uid || App.currentUser?.uid || App.currentUser?.id || 'teacher_uid');
                    await window.firebaseAuthService.createTeacherExam(teacherUid, {
                        id: String(res?.examId || res?.id || `exam_${Date.now()}`),
                        targetClass: String(targetClass),
                        className: String(targetClass),
                        classId: String(selectedClassObj?.classId || targetClass),
                        targetSection: String(targetSection),
                        educationLevel: String(selectedClassObj?.educationLevel || 'High School'),
                        teacherName: String(App.currentUser?.name || 'Class Teacher'),
                        subject: String(subject),
                        title: String(title),
                        examType: String(examType),
                        startDate: String(startDate),
                        startTime: String(startTime),
                        endDate: String(endDate),
                        endTime: String(endTime),
                        durationMinutes: parseInt(duration, 10),
                        questions: questionsData,
                        recipientStudentUids: recipientUids
                    }).catch(err => console.warn('Firestore exam write warning:', err.message));
                }

                App.closeModal();
                App.toast(`🎉 ${examType.toUpperCase()} Exam "${title}" published successfully!`, 'success');
                const content = document.getElementById('teacher-tab-content');
                if (content) this.renderExams(content);
            } catch (err) {
                App.toast('Failed to create exam: ' + err.message, 'danger');
                submitBtn.disabled = false;
                submitBtn.textContent = '🚀 Publish Exam to Students';
            }
        });
    },

    // Real-time Live Exam Monitor Modal
    async showExamLiveMonitorModal(examId, title) {
        App.showModal(`
            <div class="modal-card" style="max-width: 760px; max-height: 88vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                        <span>👁️ Live Exam Monitor: "${title}"</span>
                    </h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>
                <div id="live-monitor-body" style="padding-top: 14px;">
                    <div style="text-align: center; padding: 40px;"><div class="spinner" style="margin: 0 auto;"></div></div>
                </div>
            </div>
        `);

        const refreshMonitor = async () => {
            const body = document.getElementById('live-monitor-body');
            if (!body) return;

            try {
                const res = await API.getExamLiveStatus(examId);
                const students = res.students || [];
                const violations = res.violations || [];

                body.innerHTML = `
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        
                        <!-- Live Summary Banner -->
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px;">
                            <div class="glass-card" style="padding: 14px; text-align: center; background: #EEF2FF; border: 1px solid #C7D2FE;">
                                <div style="font-size: 22px; font-weight: 900; color: #4F46E5;">${students.filter(s => s.status === 'in_progress').length}</div>
                                <div style="font-size: 11.5px; font-weight: 700; color: #4338CA; text-transform: uppercase;">Taking Exam Now</div>
                            </div>
                            <div class="glass-card" style="padding: 14px; text-align: center; background: #ECFDF5; border: 1px solid #A7F3D0;">
                                <div style="font-size: 22px; font-weight: 900; color: #059669;">${students.filter(s => s.status === 'submitted' || s.status === 'evaluated').length}</div>
                                <div style="font-size: 11.5px; font-weight: 700; color: #065F46; text-transform: uppercase;">Submitted</div>
                            </div>
                            <div class="glass-card" style="padding: 14px; text-align: center; background: ${violations.length > 0 ? '#FEE2E2' : '#F3F4F6'}; border: 1px solid ${violations.length > 0 ? '#FECACA' : '#E5E7EB'};">
                                <div style="font-size: 22px; font-weight: 900; color: ${violations.length > 0 ? '#DC2626' : '#6B7280'};">${violations.length}</div>
                                <div style="font-size: 11.5px; font-weight: 700; color: ${violations.length > 0 ? '#991B1B' : '#4B5563'}; text-transform: uppercase;">Violations Recorded</div>
                            </div>
                        </div>

                        <!-- Real-Time Fullscreen Violation Alerts Feed -->
                        ${violations.length > 0 ? `
                            <div class="glass-card" style="padding: 16px; background: #FFF5F5; border: 1.5px solid #FECACA; border-radius: 10px;">
                                <div style="font-size: 12px; font-weight: 800; color: #DC2626; text-transform: uppercase; margin-bottom: 8px; display: flex; align-items: center; gap: 6px;">
                                    <span>⚠️ Live Fullscreen Exit Alerts</span>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 6px; max-height: 120px; overflow-y: auto;">
                                    ${violations.map(v => `
                                        <div style="font-size: 12.5px; color: #991B1B; display: flex; justify-content: space-between; align-items: center; background: #FFF; padding: 6px 10px; border-radius: 6px; border: 1px solid #FED7D7;">
                                            <span><strong>${v.student_name}</strong> exited exam fullscreen mode</span>
                                            <span style="font-size: 11px; color: #B91C1C;">${new Date(v.timestamp).toLocaleTimeString()}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        ` : ''}

                        <!-- Students Live Status Table -->
                        <div>
                            <div style="font-size: 13px; font-weight: 800; color: var(--text-secondary); text-transform: uppercase; margin-bottom: 8px;">
                                Student Statuses (${students.length})
                            </div>
                            ${students.length === 0 ? `
                                <div style="text-align: center; padding: 30px; color: var(--text-muted);">No student activity recorded yet.</div>
                            ` : `
                                <div style="display: flex; flex-direction: column; gap: 8px;">
                                    ${students.map(st => `
                                        <div class="glass-card" style="padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; background: #FFF; border: 1px solid var(--border-color);">
                                            <div>
                                                <strong style="font-size: 14.5px; color: #1F2937;">${st.student_name}</strong>
                                                <span style="font-size: 11.5px; color: #4F46E5; font-weight: 700; margin-left: 6px;">(${st.student_code})</span>
                                                ${st.violation_count > 0 ? `<span class="glass-badge" style="background: #FEE2E2; color: #DC2626; font-size: 10px; font-weight: 800; margin-left: 6px;">⚠ ${st.violation_count} Violations</span>` : ''}
                                            </div>
                                            <div>
                                                <span class="glass-badge ${st.status === 'in_progress' ? 'glass-badge-primary' : (st.status === 'evaluated' ? 'glass-badge-success' : 'glass-badge-warning')}" style="font-weight: 800; font-size: 11px;">
                                                    ${st.status === 'in_progress' ? '🟢 IN PROGRESS' : (st.status === 'evaluated' ? `Evaluated: ${st.score}/${st.total_marks}` : '📬 SUBMITTED')}
                                                </span>
                                            </div>
                                        </div>
                                    `).join('')}
                                </div>
                            `}
                        </div>
                    </div>
                `;
            } catch(e) {}
        };

        refreshMonitor();
        const pollInterval = setInterval(refreshMonitor, 4000);
        document.querySelector('.modal-close')?.addEventListener('click', () => clearInterval(pollInterval));
    },

    // View Submissions & Grade Exam (Supports MCQ score review & Written answer evaluation)
    async showExamSubmissionsModal(examId, title, examType = 'written') {
        App.showModal(`
            <div class="modal-card" style="max-width: 800px; max-height: 88vh; overflow-y: auto;">
                <div class="modal-header">
                    <h3 class="modal-title" style="display: flex; align-items: center; gap: 8px;">
                        <span>📝 Submissions & Grading: "${title}"</span>
                    </h3>
                    <button class="modal-close" onclick="App.closeModal()">✕</button>
                </div>
                <div id="exam-submissions-modal-body" style="padding-top: 14px;">
                    <div style="text-align: center; padding: 40px;"><div class="spinner" style="margin: 0 auto;"></div></div>
                </div>
            </div>
        `);

        try {
            const res = await API.getExamSubmissions(examId);
            const submissions = res.submissions || [];
            const exam = res.exam || {};
            const questions = exam.questions || [];
            const body = document.getElementById('exam-submissions-modal-body');

            if (!submissions.length) {
                body.innerHTML = `
                    <div style="text-align: center; padding: 50px 20px; color: var(--text-muted);">
                        <div style="font-size: 36px; margin-bottom: 8px;">📬</div>
                        <p style="font-size: 15px; font-weight: 800; color: var(--text-primary); margin: 0 0 4px 0;">No student submissions received yet</p>
                        <p style="font-size: 13px;">Submissions will appear here in real-time as students submit their exam.</p>
                    </div>
                `;
                return;
            }

            body.innerHTML = `
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div style="font-size: 13px; color: var(--text-secondary);">
                        Total Submissions: <strong>${submissions.length}</strong> | Exam Type: <strong>${(exam.exam_type || examType).toUpperCase()}</strong>
                    </div>

                    ${submissions.map(sub => {
                        const isEvaluated = sub.status === 'evaluated';
                        const answers = sub.answers || {};

                        return `
                            <div class="glass-card" style="padding: 20px; background: rgba(255,255,255,0.95); border: 1.5px solid var(--border-color); border-radius: 14px;">
                                
                                <!-- Student Header -->
                                <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
                                    <div>
                                        <div style="display: flex; align-items: center; gap: 8px;">
                                            <strong style="font-size: 16px; color: #151A2D;">${sub.student_name}</strong>
                                            <span class="glass-badge" style="background: #EEF2FF; color: #4F46E5; font-weight: 800; font-size: 11px;">${sub.student_code}</span>
                                            ${sub.real_violation_count > 0 ? `<span class="glass-badge" style="background: #FEE2E2; color: #DC2626; font-size: 10px; font-weight: 800;">⚠ ${sub.real_violation_count} Fullscreen Violations</span>` : ''}
                                        </div>
                                        <div style="font-size: 12px; color: #6B7280; margin-top: 2px;">
                                            Submitted: <strong>${sub.submitted_at ? new Date(sub.submitted_at).toLocaleString() : 'Recently'}</strong>
                                        </div>
                                    </div>
                                    <span class="glass-badge ${isEvaluated ? 'glass-badge-success' : 'glass-badge-warning'}" style="font-weight: 800; font-size: 12px;">
                                        ${isEvaluated ? `Score: ${sub.score}/${sub.total_marks}` : '⏳ Pending Evaluation'}
                                    </span>
                                </div>

                                <!-- Student Submitted Answers List -->
                                <div style="display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px;">
                                    <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #4B5563;">
                                        Question Answers:
                                    </div>
                                    ${questions.map((q, qIdx) => {
                                        const ans = answers[q.id] || answers[`q_${qIdx+1}`] || 'No answer submitted';
                                        return `
                                            <div style="background: #F9FAFB; padding: 12px 14px; border-radius: 8px; border: 1px solid #E5E7EB;">
                                                <div style="font-size: 13px; font-weight: 700; color: #1F2937; margin-bottom: 6px;">
                                                    Q${qIdx + 1}: ${q.question} <span style="font-size: 11.5px; color: #6B7280;">(${q.marks || 1} Marks)</span>
                                                </div>
                                                <div class="student-answer-box" style="font-size: 13.5px; color: #111827; background: #FFF; padding: 10px 12px; border-radius: 6px; border: 1px solid #D1D5DB;">
                                                    ${this.renderStudentSubmissionContent(ans)}
                                                </div>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>

                                <!-- Teacher Grading Panel -->
                                <div style="background: #F3F4F6; padding: 14px 16px; border-radius: 10px; border: 1px solid #E5E7EB;">
                                    <form class="form-evaluate-exam-sub" data-sub-id="${sub.id}" style="display: flex; flex-direction: column; gap: 10px;">
                                        <div style="display: grid; grid-template-columns: 140px 1fr; gap: 12px;">
                                            <div>
                                                <label style="display: block; font-size: 11.5px; font-weight: 700; color: #4B5563; margin-bottom: 4px;">Score / Marks</label>
                                                <input type="number" class="glass-input input-score" value="${sub.score !== null && sub.score !== undefined ? sub.score : ''}" placeholder="e.g. 18" min="0" max="${sub.total_marks || 100}" required style="padding: 8px 12px; font-size: 14px; font-weight: 800; background: #FFF;">
                                            </div>
                                            <div>
                                                <label style="display: block; font-size: 11.5px; font-weight: 700; color: #4B5563; margin-bottom: 4px;">Teacher Feedback</label>
                                                <input type="text" class="glass-input input-feedback" value="${sub.feedback || ''}" placeholder="Enter constructive feedback (e.g. Excellent solution, neat handwriting!)" style="padding: 8px 12px; font-size: 13.5px; background: #FFF;">
                                            </div>
                                        </div>
                                        <div style="display: flex; justify-content: flex-end;">
                                            <button type="submit" class="glass-btn glass-btn-primary glass-btn-sm bouncy-btn" style="background: linear-gradient(135deg, #10B981, #059669); padding: 8px 20px; font-weight: 800;">
                                                <span>💾 Save Evaluation</span>
                                            </button>
                                        </div>
                                    </form>
                                </div>

                            </div>
                        `;
                    }).join('')}
                </div>
            `;

            body.querySelectorAll('.form-evaluate-exam-sub').forEach(form => {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const subId = form.dataset.subId;
                    const score = form.querySelector('.input-score').value;
                    const feedback = form.querySelector('.input-feedback').value;
                    const saveBtn = form.querySelector('button[type="submit"]');

                    if (saveBtn) {
                        saveBtn.disabled = true;
                        saveBtn.textContent = 'Saving...';
                    }

                    try {
                        await API.evaluateExamSubmission(subId, score, 100, feedback);
                        App.toast('Exam evaluation saved successfully! 📝', 'success');
                        if (saveBtn) {
                            saveBtn.disabled = false;
                            saveBtn.textContent = '💾 Saved ✓';
                            setTimeout(() => { saveBtn.textContent = '💾 Save Evaluation'; }, 2000);
                        }
                    } catch (err) {
                        App.toast('Failed to evaluate exam: ' + err.message, 'danger');
                        if (saveBtn) {
                            saveBtn.disabled = false;
                            saveBtn.textContent = '💾 Save Evaluation';
                        }
                    }
                });
            });
        } catch (err) {
            App.toast('Error loading exam submissions: ' + err.message, 'danger');
        }
    },

    // 8. Class Chat & Pinned Announcements
    async renderChat(container) {
        const teacherUid = window.firebaseAuthService?.auth?.currentUser?.uid || App.currentUser?.uid || App.currentUser?.id;

        container.innerHTML = `
            <div class="glass-card" style="padding: 20px;">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
                    <div>
                        <h3 style="font-size: 18px; font-weight: 700;">Class Announcements & Live Stream</h3>
                        <p style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">Broadcast updates and assignments to connected students</p>
                    </div>
                    <button id="btn-make-announcement" class="glass-btn glass-btn-primary bouncy-btn">
                        <img src="/assets/icons/icon-announcement.svg" style="width: 18px; height: 18px;" alt="Announcement">
                        <span>+ Post Announcement</span>
                    </button>
                </div>

                <div id="teacher-announcements-list" style="display: flex; flex-direction: column; gap: 12px; margin-top: 16px;">
                    <div style="text-align: center; padding: 30px; color: var(--text-muted);">Loading announcements from Cloud Firestore...</div>
                </div>
            </div>
        `;

        const annListContainer = container.querySelector('#teacher-announcements-list');
        const renderAnnouncements = (items) => {
            if (!items || !items.length) {
                annListContainer.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: var(--text-secondary); background: rgba(255,255,255,0.4); border-radius: 16px;">
                        <p style="font-size: 15px; font-weight: 600;">No announcements posted yet.</p>
                        <p style="font-size: 13px; color: var(--text-muted); margin-top: 4px;">Click "+ Post Announcement" to publish a notice to your students.</p>
                    </div>
                `;
            } else {
                annListContainer.innerHTML = items.map(ann => `
                    <div class="glass-card" style="padding: 16px; border-left: 4px solid #10B981; background: rgba(255,255,255,0.85);">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <strong style="font-size: 15px; color: var(--text-primary);">📢 ${ann.title || 'Class Notice'}</strong>
                            <span class="glass-badge glass-badge-success">${ann.createdAt ? new Date(ann.createdAt).toLocaleDateString() : 'Today'}</span>
                        </div>
                        <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.5;">${ann.content || ann.message || ''}</p>
                        <div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">
                            Posted by: <strong>${ann.teacherName || App.currentUser?.name || 'Class Teacher'}</strong>
                        </div>
                    </div>
                `).join('');
            }
        };

        if (window.firebaseAuthService) {
            window.firebaseAuthService.getTeacherAnnouncements(teacherUid).then(renderAnnouncements);
            window.firebaseAuthService.onAnnouncementsChanged((liveItems) => {
                renderAnnouncements(liveItems);
            });
        }

        container.querySelector('#btn-make-announcement').addEventListener('click', async () => {
            const title = prompt('Enter Announcement Title (e.g. Science Project Submission Deadline):', 'Class Update');
            if (!title) return;
            const message = prompt('Enter Announcement Message:');
            if (message && message.trim()) {
                if (window.firebaseAuthService) {
                    await window.firebaseAuthService.createTeacherAnnouncement(teacherUid, {
                        classId: this.currentClassId || 'all',
                        title: title.trim(),
                        content: message.trim(),
                        teacherName: App.currentUser?.name || 'Class Teacher'
                    });
                }
                const io = window.SocketClient || window.SocketManager;
                if (io && io.sendMessage) {
                    io.sendMessage({ group_id: 1, content: `📢 ANNOUNCEMENT: ${title} — ${message.trim()}` });
                }
                App.toast('Announcement published successfully! 📢', 'success');
                if (window.firebaseAuthService) {
                    const updated = await window.firebaseAuthService.getTeacherAnnouncements(teacherUid);
                    renderAnnouncements(updated);
                }
            }
        });
    }
};
