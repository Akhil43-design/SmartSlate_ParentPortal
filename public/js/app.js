/* SmartSlate Parent & Teacher Application Controller & Router */

const App = {
    currentUser: null,
    currentView: 'auth',

    async init() {
        console.log('Initializing SmartSlate Parent & Teacher Web Portal...');

        // 1. Firebase Auth Observer
        if (window.firebaseAuthService) {
            window.firebaseAuthService.onAuthStateChanged(async (fbUser) => {
                if (fbUser && fbUser.email) {
                    console.log('✅ [Portal Auth] Firebase Auth active for:', fbUser.email);
                }
            });
        }

        // 2. Local Token / Session Restore
        const token = API.getToken();
        if (token) {
            try {
                const res = await API.getCurrentUser();
                this.currentUser = res.user;
                console.log('✅ [Portal Auth] Restored session for:', this.currentUser.name, `(${this.currentUser.role})`);
                this.navigateTo(res.user.role);
            } catch (err) {
                console.warn('Session check failed:', err);
                API.setToken(null);
                this.navigateTo('auth');
            }
        } else {
            this.navigateTo('auth');
        }

        this.hideLoadingScreen();
    },

    hideLoadingScreen() {
        const screen = document.getElementById('loading-screen');
        if (screen) {
            screen.classList.add('hidden');
        }
    },

    // Strict Role-Based Protected Router
    navigateTo(viewName) {
        if (!this.currentUser && viewName !== 'auth') {
            viewName = 'auth';
        }

        // Role Protection: Ensure users cannot navigate to unauthorized role views
        if (this.currentUser) {
            if (this.currentUser.role === 'parent' && viewName === 'teacher') {
                this.toast('Access Denied: Parent accounts cannot access Teacher Dashboard.', 'danger');
                viewName = 'parent';
            } else if (this.currentUser.role === 'teacher' && viewName === 'parent') {
                this.toast('Access Denied: Teacher accounts use Teacher Dashboard.', 'warning');
                viewName = 'teacher';
            }
        }

        this.currentView = viewName;
        const navbar = document.getElementById('top-navbar');

        if (viewName === 'auth') {
            if (navbar) navbar.style.display = 'none';
        } else {
            if (navbar) navbar.style.display = 'flex';
            this.updateHeaderProfile();
            this.updateNavLinks();
        }

        const sections = document.querySelectorAll('.view-section');
        sections.forEach(sec => sec.style.display = 'none');

        const targetSection = document.getElementById(`view-${viewName}`);
        if (targetSection) {
            targetSection.style.display = 'block';
            this.renderViewContent(viewName, targetSection);
        }

        this.renderBottomNavBar();
    },

    renderViewContent(viewName, container) {
        switch (viewName) {
            case 'auth':
                AuthView.render(container);
                break;
            case 'parent':
                ParentView.render(container);
                break;
            case 'teacher':
                TeacherView.render(container);
                break;
            case 'settings':
                SettingsView.render(container);
                break;
        }
    },

    updateHeaderProfile() {
        if (!this.currentUser) return;
        const nameEl = document.getElementById('user-display-name');
        const roleEl = document.getElementById('user-display-role');
        const avatarEl = document.getElementById('user-role-avatar');
        if (nameEl) nameEl.textContent = this.currentUser.name;
        if (roleEl) roleEl.textContent = this.currentUser.role === 'teacher' ? 'Class Teacher' : 'Parent / Guardian';
        if (avatarEl) avatarEl.textContent = this.currentUser.role === 'teacher' ? '👩‍🏫' : '👨‍👩‍👦';
    },

    updateNavLinks() {
        const linksContainer = document.getElementById('nav-dynamic-links');
        if (!linksContainer || !this.currentUser) return;

        if (this.currentUser.role === 'parent') {
            linksContainer.innerHTML = `
                <button class="nav-link-btn ${this.currentView === 'parent' ? 'active' : ''}" onclick="App.navigateTo('parent')">
                    <img src="/assets/icons/icon-child-profile.svg" class="nav-link-icon" alt="Parent">
                    <span>Parent Dashboard</span>
                </button>
                <button class="nav-link-btn ${this.currentView === 'settings' ? 'active' : ''}" onclick="App.navigateTo('settings')">
                    <img src="/assets/icons/icon-settings.svg" class="nav-link-icon" alt="Settings">
                    <span>Settings</span>
                </button>
            `;
        } else {
            linksContainer.innerHTML = `
                <button class="nav-link-btn ${this.currentView === 'teacher' ? 'active' : ''}" onclick="App.navigateTo('teacher')">
                    <img src="/assets/icons/icon-teacher.svg" class="nav-link-icon" alt="Teacher">
                    <span>Teacher Dashboard</span>
                </button>
                <button class="nav-link-btn ${this.currentView === 'settings' ? 'active' : ''}" onclick="App.navigateTo('settings')">
                    <img src="/assets/icons/icon-settings.svg" class="nav-link-icon" alt="Settings">
                    <span>Settings</span>
                </button>
            `;
        }
    },

    switchParentTab(tabName) {
        this.navigateTo('parent');
        if (window.ParentView) {
            ParentView.activeTab = tabName;
            const container = document.querySelector('#view-parent');
            if (container) {
                container.querySelectorAll('.tab-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === tabName);
                });
                const contentArea = container.querySelector('#parent-active-tab-content');
                if (contentArea) ParentView.renderActiveTabContent(contentArea);
            }
        }
        this.renderBottomNavBar();
    },

    switchTeacherTab(tabName) {
        this.navigateTo('teacher');
        if (window.TeacherView) {
            TeacherView.activeTab = tabName;
            const container = document.querySelector('#view-teacher');
            if (container) {
                container.querySelectorAll('.tab-btn').forEach(b => {
                    b.classList.toggle('active', b.dataset.tab === tabName);
                });
                const contentArea = container.querySelector('#teacher-tab-content');
                if (contentArea) TeacherView.renderTabContent(contentArea);
            }
        }
        this.renderBottomNavBar();
    },

    renderBottomNavBar() {
        const nav = document.getElementById('bottom-nav-bar');
        if (!nav) return;

        if (this.currentView === 'auth' || !this.currentUser) {
            nav.style.display = 'none';
            return;
        }

        nav.style.display = 'flex';
        if (this.currentUser.role === 'parent') {
            const pTab = window.ParentView?.activeTab || 'overview';
            nav.innerHTML = `
                <div class="bottom-nav-item ${this.currentView === 'parent' && pTab === 'overview' ? 'active' : ''}" onclick="App.switchParentTab('overview')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                    <span>Dashboard</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'parent' && pTab === 'exams' ? 'active' : ''}" onclick="App.switchParentTab('exams')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <span>Exams</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'parent' && pTab === 'notes' ? 'active' : ''}" onclick="App.switchParentTab('notes')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                    <span>Notes</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'parent' && pTab === 'searches' ? 'active' : ''}" onclick="App.switchParentTab('searches')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <span>Search</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'settings' ? 'active' : ''}" onclick="App.navigateTo('settings')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>Settings</span>
                </div>
            `;
        } else {
            const tTab = window.TeacherView?.activeTab || 'overview';
            nav.innerHTML = `
                <div class="bottom-nav-item ${this.currentView === 'teacher' && tTab === 'overview' ? 'active' : ''}" onclick="App.switchTeacherTab('overview')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <span>Roster</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'teacher' && tTab === 'exams' ? 'active' : ''}" onclick="App.switchTeacherTab('exams')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <span>Exams</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'teacher' && tTab === 'assignments' ? 'active' : ''}" onclick="App.switchTeacherTab('assignments')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                    <span>Assign</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'teacher' && tTab === 'chat' ? 'active' : ''}" onclick="App.switchTeacherTab('chat')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span>Announce</span>
                </div>
                <div class="bottom-nav-item ${this.currentView === 'settings' ? 'active' : ''}" onclick="App.navigateTo('settings')">
                    <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                    <span>Settings</span>
                </div>
            `;
        }
    },

    async logout() {
        if (window.firebaseAuthService) {
            await window.firebaseAuthService.signOut().catch(() => {});
        }
        await API.logout();
        API.setToken(null);
        this.currentUser = null;
        this.navigateTo('auth');
        this.toast('Signed out from portal.', 'info');
    },

    toast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.textContent = message;

        container.appendChild(toast);
        setTimeout(() => {
            toast.remove();
        }, 4000);
    },

    showToast(message, type = 'info') {
        return this.toast(message, type);
    },

    showModal(htmlContent) {
        const container = document.getElementById('modal-container');
        if (!container) return;

        container.innerHTML = `
            <div class="modal-overlay active" id="modal-overlay-bg">
                ${htmlContent}
            </div>
        `;
    },

    closeModal() {
        const container = document.getElementById('modal-container');
        if (container) container.innerHTML = '';
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());
