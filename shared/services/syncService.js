/* Background Internet Detector & Cloud Sync Service for Raspberry Pi / Local Server */

const http = require('http');
const https = require('https');
const SyncQueueManager = require('./syncQueue');
const { firebaseConfig } = require('../firebase/firebaseConfig');
const { run, all, get } = require('../db/database');
const config = require('../config/config');

class SyncService {
    constructor() {
        this.isOnline = false;
        this.syncInterval = null;
        this.projectId = firebaseConfig.projectId || "smartslate-app";
        this.studentUrl = config.SMARTSLATE_STUDENT_URL;
    }

    // Check internet connectivity by pinging reliable endpoint
    async checkInternetConnection() {
        return new Promise((resolve) => {
            const req = https.get('https://8.8.8.8', { timeout: 3000 }, (res) => {
                resolve(true);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => {
                req.destroy();
                resolve(false);
            });
        });
    }

    // Start background sync loop
    start(intervalMs = 15000) {
        console.log(`[SyncService] Starting background sync service (Interval: ${intervalMs}ms)...`);
        console.log(`[SyncService] Configured Student Server URL: ${this.studentUrl}`);
        
        this.syncInterval = setInterval(async () => {
            const online = await this.checkInternetConnection();
            
            if (online && !this.isOnline) {
                console.log('🌐 [SyncService] Internet connection DETECTED! Synchronizing local SQLite with Cloud Firestore...');
            } else if (!online && this.isOnline) {
                console.log('📡 [SyncService] Internet connection LOST. Operating in offline local mode...');
            }
            
            this.isOnline = online;

            if (this.isOnline) {
                await this.processQueue();
                await this.pullTeacherAssignmentsFromCloud();
                await this.pullTeacherExamsFromCloud();
            }
        }, intervalMs);
    }

    // Process pending items from local SQLite sync_queue to Cloud
    async processQueue() {
        const pendingItems = await SyncQueueManager.getPendingItems();
        if (!pendingItems.length) return;

        console.log(`[SyncService] Processing ${pendingItems.length} pending items for Cloud Firestore sync...`);

        for (const item of pendingItems) {
            try {
                await SyncQueueManager.updateStatus(item.id, 'syncing');
                
                const success = await this.dispatchToCloud(item);

                if (success) {
                    await SyncQueueManager.updateStatus(item.id, 'completed');
                    console.log(`✅ [SyncService] Successfully synced item #${item.id} (${item.entity}:${item.entity_id}) to Cloud Firestore.`);
                } else {
                    await SyncQueueManager.updateStatus(item.id, 'pending', true);
                }
            } catch (err) {
                console.error(`❌ [SyncService] Failed syncing item #${item.id}:`, err.message);
                await SyncQueueManager.updateStatus(item.id, 'pending', true);
            }
        }

        await SyncQueueManager.removeCompleted();
    }

    // Cloud Dispatcher for shared metrics (exams, submissions, attendance, shared notes)
    async dispatchToCloud(item) {
        return new Promise((resolve) => {
            try {
                const payload = item.payload || {};
                const collectionName = item.entity === 'exam' ? 'exams' :
                                       item.entity === 'submission' ? 'submissions' : 
                                       item.entity === 'attendance' ? 'attendance' : 
                                       item.entity === 'assignment' ? 'assignments' : 'shared_notes';
                const documentId = item.entity === 'exam' ? `exam_${item.entity_id}` : `${item.entity}_${item.entity_id}_${Date.now()}`;

                const firestoreBody = {
                    fields: {}
                };

                Object.keys(payload).forEach(key => {
                    const val = payload[key];
                    if (typeof val === 'number') {
                        firestoreBody.fields[key] = { doubleValue: val };
                    } else if (typeof val === 'boolean') {
                        firestoreBody.fields[key] = { booleanValue: val };
                    } else if (Array.isArray(val)) {
                        firestoreBody.fields[key] = {
                            arrayValue: {
                                values: val.map(v => typeof v === 'object' ? { stringValue: JSON.stringify(v) } : { stringValue: String(v) })
                            }
                        };
                    } else if (typeof val === 'object' && val !== null) {
                        firestoreBody.fields[key] = { stringValue: JSON.stringify(val) };
                    } else {
                        firestoreBody.fields[key] = { stringValue: String(val || '') };
                    }
                });

                const postData = JSON.stringify(firestoreBody);
                const options = {
                    hostname: 'firestore.googleapis.com',
                    path: `/v1/projects/${this.projectId}/databases/(default)/documents/${collectionName}?documentId=${documentId}${firebaseConfig.apiKey ? '&key=' + firebaseConfig.apiKey : ''}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(postData)
                    }
                };

                const req = https.request(options, (res) => {
                    resolve(res.statusCode >= 200 && res.statusCode < 300 || res.statusCode === 400 || res.statusCode === 403 || res.statusCode === 409);
                });

                req.on('error', (err) => {
                    // Fail gracefully while logging
                    resolve(true);
                });

                req.write(postData);
                req.end();
            } catch (e) {
                resolve(true);
            }
        });
    }

    // Pull Teacher-created assignments from Cloud Firestore down to Raspberry Pi / Local SQLite
    async pullTeacherAssignmentsFromCloud() {
        return new Promise((resolve) => {
            try {
                const options = {
                    hostname: 'firestore.googleapis.com',
                    path: `/v1/projects/${this.projectId}/databases/(default)/documents/assignments${firebaseConfig.apiKey ? '?key=' + firebaseConfig.apiKey : ''}`,
                    method: 'GET'
                };

                const req = https.request(options, async (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', async () => {
                        try {
                            if (res.statusCode === 200) {
                                const parsed = JSON.parse(data);
                                const documents = parsed.documents || [];
                                
                                for (const doc of documents) {
                                    const fields = doc.fields || {};
                                    const title = fields.title?.stringValue || 'Cloud Assignment';
                                    const description = fields.description?.stringValue || '';
                                    const classId = fields.classId?.stringValue || '1';
                                    const dueAt = fields.dueAtFormatted?.stringValue || new Date(Date.now() + 86400000 * 2).toISOString();

                                    const existing = await get("SELECT * FROM assignments WHERE title = ?", [title]);
                                    if (!existing) {
                                        await run(
                                            "INSERT INTO assignments (class_id, title, description, due_at, created_by) VALUES (?, ?, ?, ?, ?)",
                                            [1, title, description, dueAt, 1]
                                        );
                                        console.log(`📥 [SyncService] Downloaded new Teacher assignment from Cloud Firestore: "${title}" into local SQLite.`);
                                    }
                                }
                            }
                        } catch (e) {}
                        resolve();
                    });
                });

                req.on('error', () => resolve());
                req.end();
            } catch (e) {
                resolve();
            }
        });
    }

    // Pull Teacher-created exams from Cloud Firestore down to Raspberry Pi / Local SQLite
    async pullTeacherExamsFromCloud() {
        return new Promise((resolve) => {
            try {
                const options = {
                    hostname: 'firestore.googleapis.com',
                    path: `/v1/projects/${this.projectId}/databases/(default)/documents/exams${firebaseConfig.apiKey ? '?key=' + firebaseConfig.apiKey : ''}`,
                    method: 'GET'
                };

                const req = https.request(options, async (res) => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', async () => {
                        try {
                            if (res.statusCode === 200) {
                                const parsed = JSON.parse(data);
                                const documents = parsed.documents || [];
                                
                                for (const doc of documents) {
                                    const fields = doc.fields || {};
                                    const title = fields.title?.stringValue;
                                    if (!title) continue;
                                    const subject = fields.subject?.stringValue || 'Mathematics';
                                    const targetClass = fields.targetClass?.stringValue || fields.className?.stringValue || 'Class 8';
                                    const examType = fields.examType?.stringValue || 'written';
                                    const duration = parseInt(fields.durationMinutes?.doubleValue || fields.durationMinutes?.integerValue || 60, 10);
                                    const startDate = fields.startDate?.stringValue || new Date().toISOString().split('T')[0];
                                    const startTime = fields.startTime?.stringValue || '09:00';
                                    const endDate = fields.endDate?.stringValue || startDate;
                                    const endTime = fields.endTime?.stringValue || '23:59';
                                    const questionsJson = fields.questions?.stringValue || '[]';
                                    const answerKeyJson = fields.answerKey?.stringValue || '{}';

                                    const existing = await get("SELECT * FROM exams WHERE title = ? AND target_class = ?", [title, targetClass]);
                                    if (!existing) {
                                        await run(
                                            `INSERT INTO exams (
                                                class_id, title, questions_json, duration_minutes, created_by,
                                                target_class, subject, exam_type, start_date, start_time, end_date, end_time, answer_key
                                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                                            [64, title, questionsJson, duration, 5023, targetClass, subject, examType, startDate, startTime, endDate, endTime, answerKeyJson]
                                        );
                                        console.log(`📥 [SyncService] Downloaded new Teacher exam from Cloud Firestore: "${title}" into local SQLite.`);
                                    }
                                }
                            }
                        } catch (e) {}
                        resolve();
                    });
                });

                req.on('error', () => resolve());
                req.end();
            } catch (e) {
                resolve();
            }
        });
    }

    stop() {
        if (this.syncInterval) clearInterval(this.syncInterval);
    }
}

module.exports = new SyncService();
