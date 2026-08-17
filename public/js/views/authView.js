/* Parent & Teacher Web Portal Auth View with Firebase Auth & Cloud Firestore Integration */

const AuthView = {
    render(container) {
        container.innerHTML = `
            <div style="min-height: 85vh; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px;">
                <div style="text-align: center; margin-bottom: 24px;">
                    <div style="width: 64px; height: 64px; background: linear-gradient(135deg, var(--accent-purple), var(--accent-blue)); border-radius: 16px; display: inline-flex; align-items: center; justify-content: center; color: white; font-size: 32px; margin-bottom: 12px; box-shadow: 0 10px 25px rgba(155, 81, 224, 0.3);">
                        👨‍👩‍👧‍🏫
                    </div>
                    <h1 style="font-size: 32px; font-weight: 800; color: var(--text-primary);">SmartSlate Web Portal</h1>
                    <p style="color: var(--text-secondary); font-size: 16px; margin-top: 4px;">Parent & Teacher Cloud Dashboard (Firebase Integrated)</p>
                </div>

                <div class="glass-card" style="padding: 12px 18px; max-width: 520px; width: 100%; margin-bottom: 20px; font-size: 13px; text-align: center; background: rgba(255,255,255,0.7);">
                    <div style="font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">🔑 Quick Demo Accounts:</div>
                    <div style="display: flex; flex-direction: column; gap: 4px; color: var(--text-secondary);">
                        <span>👨‍🏫 Class Teacher (Ravi Kumar): <strong>teacher@smartslate.edu</strong></span>
                        <span>👨‍👩‍👦 Parent (Suresh Kumar): <strong>parent@smartslate.edu</strong></span>
                    </div>
                </div>

                <div class="glass-card" style="width: 100%; max-width: 480px; padding: 32px;">
                    <div style="display: flex; border-bottom: 1px solid var(--border-color); margin-bottom: 24px;">
                        <button id="tab-login" class="tab-btn active" style="flex: 1; text-align: center;">Sign In</button>
                        <button id="tab-signup" class="tab-btn" style="flex: 1; text-align: center;">Create Account</button>
                    </div>

                    <!-- Login Form -->
                    <form id="auth-login-form" style="display: flex; flex-direction: column; gap: 16px;">
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Email Address *</label>
                            <input type="email" id="login-email" class="glass-input" placeholder="e.g. teacher@smartslate.edu" required>
                        </div>
                        <div>
                            <label style="display: block; font-size: 14px; font-weight: 600; margin-bottom: 6px;">Password *</label>
                            <input type="password" id="login-password" class="glass-input" placeholder="Enter your password" required>
                        </div>
                        <button type="submit" class="glass-btn glass-btn-primary bouncy-btn" style="padding: 14px; margin-top: 8px;">Sign In to Portal</button>
                    </form>

                    <!-- Signup Form -->
                    <form id="auth-signup-form" style="display: none; flex-direction: column; gap: 14px;">
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Account Role *</label>
                            <select id="signup-role" class="glass-select" style="padding: 10px;">
                                <option value="teacher">👩‍🏫 Teacher Account</option>
                                <option value="parent">👨‍👩‍👦 Parent Account</option>
                            </select>
                        </div>
                        
                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Full Name *</label>
                            <input type="text" id="signup-name" class="glass-input" placeholder="e.g. Ravi Kumar" required>
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Email Address *</label>
                                <input type="email" id="signup-email" class="glass-input" placeholder="teacher@smartslate.edu" required>
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Password *</label>
                                <input type="password" id="signup-password" class="glass-input" placeholder="Min 6 characters" required minlength="6">
                            </div>
                        </div>

                        <div>
                            <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Phone Number</label>
                            <input type="tel" id="signup-phone" class="glass-input" placeholder="+91 98765 33333">
                        </div>

                        <!-- Teacher Specific Fields -->
                        <div id="teacher-fields-group" style="display: flex; flex-direction: column; gap: 10px;">
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Assigned Subject</label>
                                <input type="text" id="signup-subject" class="glass-input" placeholder="e.g. Physical Science & Mathematics" value="Physical Science">
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Assigned Class & Section</label>
                                <input type="text" id="signup-class" class="glass-input" placeholder="e.g. 10th Class — Section A" value="10th Class">
                            </div>
                        </div>

                        <!-- Parent Specific Fields -->
                        <div id="parent-fields-group" style="display: none; flex-direction: column; gap: 10px;">
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Relationship to Student</label>
                                <input type="text" id="signup-relationship" class="glass-input" placeholder="e.g. Father, Mother, Guardian" value="Father">
                            </div>
                            <div>
                                <label style="display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px;">Child's Student ID (Optional during signup)</label>
                                <input type="text" id="signup-child-id" class="glass-input" placeholder="e.g. STU-101">
                            </div>
                        </div>

                        <button type="submit" class="glass-btn glass-btn-primary bouncy-btn" style="padding: 14px; margin-top: 8px; font-weight: 700;">Complete Portal Registration</button>
                    </form>
                </div>
            </div>
        `;

        const tabLogin = container.querySelector('#tab-login');
        const tabSignup = container.querySelector('#tab-signup');
        const loginForm = container.querySelector('#auth-login-form');
        const signupForm = container.querySelector('#auth-signup-form');
        const roleSelect = container.querySelector('#signup-role');
        const teacherFields = container.querySelector('#teacher-fields-group');
        const parentFields = container.querySelector('#parent-fields-group');

        roleSelect.addEventListener('change', () => {
            if (roleSelect.value === 'teacher') {
                teacherFields.style.display = 'flex';
                parentFields.style.display = 'none';
            } else {
                teacherFields.style.display = 'none';
                parentFields.style.display = 'flex';
            }
        });

        tabLogin.addEventListener('click', () => {
            tabLogin.classList.add('active');
            tabSignup.classList.remove('active');
            loginForm.style.display = 'flex';
            signupForm.style.display = 'none';
        });

        tabSignup.addEventListener('click', () => {
            tabSignup.classList.add('active');
            tabLogin.classList.remove('active');
            signupForm.style.display = 'flex';
            loginForm.style.display = 'none';
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = (container.querySelector('#login-email').value || '').trim();
            const password = (container.querySelector('#login-password').value || '').trim();
            const submitBtn = loginForm.querySelector('button[type="submit"]');

            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = 'Signing in...';
            }

            try {
                let userObj = null;
                let token = null;

                // 1. Authenticate via Server API
                try {
                    const res = await API.login(email, password);
                    if (res && res.user && res.token) {
                        userObj = res.user;
                        token = res.token;

                        // If backend returned a Firebase Custom Token, sign in to Firebase Client SDK instantly
                        if (res.firebaseCustomToken && window.firebaseAuthService && typeof window.firebaseAuthService.signInWithCustomToken === 'function') {
                            try {
                                await window.firebaseAuthService.signInWithCustomToken(res.firebaseCustomToken);
                            } catch (e) {}
                        }
                    }
                } catch (apiErr) {
                    console.warn('[Portal Auth] API login note:', apiErr.message);
                }

                // 2. Client Firebase Auth companion - Authenticate Firebase Client SDK so request.auth is populated for Firestore rules
                if (window.firebaseAuthService && !window.firebaseAuthService.auth?.currentUser && typeof window.firebaseAuthService.signIn === 'function') {
                    try {
                        const fbRes = await window.firebaseAuthService.signIn(email, password);
                        if (fbRes && fbRes.user) {
                            if (!userObj) userObj = fbRes.user;
                            if (!token) token = fbRes.idToken;
                            if (userObj) {
                                userObj.firebaseUid = fbRes.user.uid;
                                userObj.uid = fbRes.user.uid || userObj.uid;
                            }
                        }
                    } catch (fbErr) {
                        console.warn('[Portal Auth] Client Firebase sign in note:', fbErr.message);
                    }
                }

                if (!userObj) {
                    throw new Error('Invalid email or password. Please verify your credentials.');
                }

                API.setToken(token);
                App.currentUser = userObj;
                App.toast(`Welcome back, ${userObj.name}! 🎉`, 'success');
                App.navigateTo(userObj.role || 'parent');
            } catch (err) {
                console.error('[Portal Auth] Login Error:', err);
                App.toast(err.message || 'Login failed. Please check your credentials.', 'danger');
            } finally {
                if (submitBtn) {
                    submitBtn.disabled = false;
                    submitBtn.textContent = 'Sign In to Portal';
                }
            }
        });

        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = container.querySelector('#signup-name').value;
            const role = container.querySelector('#signup-role').value;
            const email = container.querySelector('#signup-email').value;
            const password = container.querySelector('#signup-password').value;
            const phone = container.querySelector('#signup-phone').value;

            try {
                if (window.firebaseAuthService) {
                    const pass = password.length < 6 ? password + "12345" : password;
                    if (role === 'teacher') {
                        const subject = container.querySelector('#signup-subject').value;
                        const className = container.querySelector('#signup-class').value;
                        await window.firebaseAuthService.registerTeacher({
                            fullName: name,
                            email,
                            password: pass,
                            phone,
                            subjects: [subject],
                            classes: [className]
                        });
                    } else {
                        const relationship = container.querySelector('#signup-relationship').value;
                        const childStudentId = container.querySelector('#signup-child-id').value;
                        await window.firebaseAuthService.registerParent({
                            fullName: name,
                            email,
                            password: pass,
                            phone,
                            relationship,
                            childStudentId
                        });
                    }
                }

                const childStudentId = role === 'parent' ? (container.querySelector('#signup-child-id')?.value || '') : '';
                const res = await API.signup(name, role, email, password, childStudentId);
                API.setToken(res.token);
                App.currentUser = res.user;
                App.toast(`Account created! Welcome to SmartSlate, ${name}! 🎉`, 'success');
                App.navigateTo(role);
            } catch (err) {
                console.error('[Portal Auth] Signup Error:', err);
                App.toast(err.message || 'Failed to create account.', 'danger');
            }
        });
    }
};
