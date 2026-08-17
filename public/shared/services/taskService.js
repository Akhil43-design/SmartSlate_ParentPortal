/* SmartSlate Unified Task Service (Cloud Firestore & Offline-First Storage) */

(function () {
    const TaskService = {
        db: null,

        init() {
            if (typeof window !== 'undefined' && window.firebase && window.firebase.firestore) {
                this.db = window.firebase.firestore();
            }
        },

        getTimestamp() {
            if (typeof window !== 'undefined' && window.firebase && window.firebase.firestore) {
                return window.firebase.firestore.FieldValue.serverTimestamp();
            }
            return new Date().toISOString();
        },

        async getTasks(studentId) {
            this.init();
            if (!studentId) return [];
            const cleanStudentId = studentId.trim().toUpperCase();

            // Try loading from Cloud Firestore if online & initialized
            if (this.db) {
                try {
                    const snapshot = await this.db
                        .collection('students')
                        .doc(cleanStudentId)
                        .collection('tasks')
                        .orderBy('createdAt', 'desc')
                        .get();

                    const tasks = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    console.log(`[TaskService] Tasks loaded successfully from Firestore for ${cleanStudentId}: ${tasks.length} task(s)`);
                    localStorage.setItem(`smartslate_tasks_${cleanStudentId}`, JSON.stringify(tasks));
                    return tasks;
                } catch (err) {
                    console.warn('[TaskService] Firestore task read warning:', err.message);
                }
            }

            // Offline / LocalStorage fallback
            const cached = localStorage.getItem(`smartslate_tasks_${cleanStudentId}`);
            if (cached) {
                try {
                    return JSON.parse(cached);
                } catch (e) {
                    return [];
                }
            }
            return [];
        },

        async createTask(studentId, taskData) {
            this.init();
            if (!studentId) throw new Error('Student ID is required to create a task.');

            const cleanStudentId = studentId.trim().toUpperCase();
            const taskId = `task_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            const timestamp = this.getTimestamp();

            const newTask = {
                id: taskId,
                taskId: taskId,
                studentId: cleanStudentId,
                title: taskData.title || 'Untitled Task',
                description: taskData.description || '',
                subject: taskData.subject || 'General',
                status: 'pending', // 'pending' | 'completed'
                dueDate: taskData.dueDate || 'Today',
                createdAt: timestamp,
                updatedAt: timestamp
            };

            // Save to LocalStorage immediately
            const currentTasks = await this.getTasks(cleanStudentId);
            const updatedTasks = [newTask, ...currentTasks];
            localStorage.setItem(`smartslate_tasks_${cleanStudentId}`, JSON.stringify(updatedTasks));

            // Write to Cloud Firestore
            if (this.db) {
                try {
                    await this.db
                        .collection('students')
                        .doc(cleanStudentId)
                        .collection('tasks')
                        .doc(taskId)
                        .set(newTask, { merge: true });
                    console.log(`🔥 [TaskService] Task created in Firestore: students/${cleanStudentId}/tasks/${taskId}`);
                } catch (err) {
                    console.warn('[TaskService] Firestore task write warning:', err.message);
                }
            }

            return newTask;
        },

        async completeTask(studentId, taskId, isCompleted = true) {
            this.init();
            if (!studentId || !taskId) return false;

            const cleanStudentId = studentId.trim().toUpperCase();
            const status = isCompleted ? 'completed' : 'pending';
            const timestamp = this.getTimestamp();

            // Local update
            const currentTasks = await this.getTasks(cleanStudentId);
            const updatedTasks = currentTasks.map(t => {
                if (t.id === taskId || t.taskId === taskId) {
                    return { ...t, status, updatedAt: new Date().toISOString() };
                }
                return t;
            });
            localStorage.setItem(`smartslate_tasks_${cleanStudentId}`, JSON.stringify(updatedTasks));

            // Firestore update
            if (this.db) {
                try {
                    await this.db
                        .collection('students')
                        .doc(cleanStudentId)
                        .collection('tasks')
                        .doc(taskId)
                        .update({
                            status: status,
                            updatedAt: timestamp
                        });
                } catch (err) {
                    console.warn('[TaskService] Firestore task update warning:', err.message);
                }
            }

            return true;
        },

        async deleteTask(studentId, taskId) {
            this.init();
            if (!studentId || !taskId) return false;

            const cleanStudentId = studentId.trim().toUpperCase();

            // Local delete
            const currentTasks = await this.getTasks(cleanStudentId);
            const updatedTasks = currentTasks.filter(t => t.id !== taskId && t.taskId !== taskId);
            localStorage.setItem(`smartslate_tasks_${cleanStudentId}`, JSON.stringify(updatedTasks));

            // Firestore delete
            if (this.db) {
                try {
                    await this.db
                        .collection('students')
                        .doc(cleanStudentId)
                        .collection('tasks')
                        .doc(taskId)
                        .delete();
                } catch (err) {
                    console.warn('[TaskService] Firestore task delete warning:', err.message);
                }
            }

            return true;
        }
    };

    if (typeof window !== 'undefined') {
        window.TaskService = TaskService;
    }
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = TaskService;
    }
})();
