/* Settings View Component */

const SettingsView = {
    render(container) {
        const user = App.currentUser || {};
        const isStudent = user.role === 'student';

        container.innerHTML = `
            <div style="max-width: 720px; margin: 0 auto; padding: 20px 0;">
                <div class="dashboard-header">
                    <div>
                        <h1 class="dashboard-title">System Settings</h1>
                        <p class="dashboard-subtitle">Customize tablet kiosk preferences, account details, and display modes</p>
                    </div>
                </div>

                <!-- Account Information Card -->
                <div class="glass-card" style="margin-bottom: 24px; padding: 24px;">
                    <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <svg class="icon-svg"><use href="#icon-user"/></svg>
                        <span>User Profile</span>
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 12px; font-size: 14px;">
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                            <span style="color: var(--text-muted);">Full Name:</span>
                            <strong>${user.name || 'N/A'}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                            <span style="color: var(--text-muted);">Email Address:</span>
                            <strong>${user.email || 'N/A'}</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
                            <span style="color: var(--text-muted);">Account Role:</span>
                            <span class="glass-badge glass-badge-accent" style="text-transform: capitalize;">${user.role || 'User'}</span>
                        </div>
                        ${isStudent ? `
                            <div style="display: flex; justify-content: space-between; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; background: rgba(107, 143, 216, 0.08); padding: 10px; border-radius: 8px;">
                                <span style="color: var(--text-primary); font-weight: 600;">Parent Pairing Code:</span>
                                <strong style="color: var(--accent-primary); font-size: 16px;">${user.student_code || 'STU-101'}</strong>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- Tablet Kiosk Display Settings -->
                <div class="glass-card" style="margin-bottom: 24px; padding: 24px;">
                    <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                        <svg class="icon-svg"><use href="#icon-settings"/></svg>
                        <span>Kiosk & Display Preferences</span>
                    </h3>
                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong>Tablet Layout Orientation</strong>
                                <p style="font-size: 13px; color: var(--text-muted);">Optimizes UI for Raspberry Pi touchscreen display</p>
                            </div>
                            <select id="settings-orientation-select" class="glass-select" style="width: auto; padding: 6px 12px;">
                                <option value="landscape" selected>Landscape (Default)</option>
                                <option value="portrait">Portrait Mode</option>
                            </select>
                        </div>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div>
                                <strong>High Contrast Mode</strong>
                                <p style="font-size: 13px; color: var(--text-muted);">Enhance text visibility for digital notebook writing</p>
                            </div>
                            <input type="checkbox" id="settings-contrast-toggle" style="width: 20px; height: 20px; cursor: pointer;">
                        </div>
                    </div>
                </div>

                <!-- Account Actions -->
                <div class="glass-card" style="padding: 24px; text-align: center;">
                    <button id="settings-btn-logout" class="glass-btn glass-badge-danger" style="width: 100%; max-width: 240px; padding: 12px;">
                        <svg class="icon-svg"><use href="#icon-logout"/></svg>
                        <span>Log Out of SmartSlate</span>
                    </button>
                </div>
            </div>
        `;

        this.bindEvents(container);
    },

    bindEvents(container) {
        const logoutBtn = container.querySelector('#settings-btn-logout');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                API.logout().then(() => {
                    App.toast('Logged out successfully', 'info');
                    App.currentUser = null;
                    App.navigateTo('auth');
                });
            });
        }
    }
};
