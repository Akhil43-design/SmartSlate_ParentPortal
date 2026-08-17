const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

const firebaseConfig = {
    projectId: "smartslate-bd117",
    apiKey: "AIzaSyBOgNWBVqSYfMypeZS8NwRLOYpq7DY3-ls"
};

// Database configurations for all 6 SmartSlate applications
const appDatabases = {
    elementary: {
        name: "Elementary / 5thBelow",
        dbPath: path.resolve("F:/smartSlate/5thbelow/data/smartslate-elementary.db"),
        module: "../../5thbelow/backend/database/sqlite.cjs"
    },
    highschool: {
        name: "High School / 6to10",
        dbPath: path.resolve("F:/smartSlate/6to10th/student/data/smartslate-highschool.db"),
        module: "../../6to10th/student/backend/database/sqlite.js"
    },
    intermediate: {
        name: "Intermediate / Diploma",
        dbPath: path.resolve("F:/smartSlate/intermediate/data/smartslate-intermediate.db"),
        module: "../../intermediate/backend/database/sqlite.js"
    },
    btech: {
        name: "B.Tech",
        dbPath: path.resolve("F:/smartSlate/btech/data/smartslate-btech.db"),
        module: "../../btech/backend/database/sqlite.js"
    },
    parent: {
        name: "Parent Portal",
        dbPath: path.resolve("F:/smartSlate/parent-teacher/data/smartslate-parent.db"),
        module: "../../parent-teacher/backend/database/sqlite-parent.js"
    },
    teacher: {
        name: "Teacher Portal",
        dbPath: path.resolve("F:/smartSlate/parent-teacher/data/smartslate-teacher.db"),
        module: "../../parent-teacher/backend/database/sqlite-teacher.js"
    }
};

function sendCloudRequest(method, url, payload = null, headers = {}) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const lib = parsedUrl.protocol === 'https:' ? https : http;
        const dataStr = payload ? JSON.stringify(payload) : '';

        const options = {
            method: method,
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            },
            timeout: 5000
        };

        if (dataStr) {
            options.headers['Content-Length'] = Buffer.byteLength(dataStr);
        }

        const req = lib.request(options, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                let parsed;
                try { parsed = JSON.parse(body); } catch (e) { parsed = body; }
                resolve({ status: res.statusCode, body: parsed });
            });
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Cloud connection timeout'));
        });

        if (dataStr) req.write(dataStr);
        req.end();
    });
}

class SyncManager {
    constructor() {
        this.isOnline = false;
        this.projectId = firebaseConfig.projectId;
        this.apiKey = firebaseConfig.apiKey;
    }

    // Connectivity verification (ping Google DNS / Firebase endpoint)
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

    // Get DB handle for specified app
    getDbModule(appKey) {
        const info = appDatabases[appKey];
        if (!info || !fs.existsSync(info.dbPath)) return null;
        try {
            return require(info.module);
        } catch (e) {
            console.error(`[SYNC] Failed to load DB module for ${appKey}:`, e.message);
            return null;
        }
    }

    // Process pending sync_queue items for a specific application database
    async syncAppQueue(appKey) {
        const dbMod = this.getDbModule(appKey);
        if (!dbMod) return { processed: 0, synced: 0, failed: 0 };

        const pending = await dbMod.all(
            `SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') AND retry_count < 5 ORDER BY id ASC LIMIT 50`
        );

        if (!pending || pending.length === 0) {
            return { processed: 0, synced: 0, failed: 0 };
        }

        console.log(`[SYNC] ${appDatabases[appKey].name}: Starting sync for ${pending.length} pending items...`);
        let syncedCount = 0;
        let failedCount = 0;

        for (const item of pending) {
            try {
                await dbMod.run(`UPDATE sync_queue SET status = 'syncing' WHERE id = ?`, [item.id]);
                
                let payload = {};
                try { payload = JSON.parse(item.payload || '{}'); } catch (e) {}

                const success = await this.uploadEntityToCloud(item.entity_type, item.entity_id, item.operation, payload, item.firebase_uid);

                if (success) {
                    await dbMod.run(`UPDATE sync_queue SET status = 'synced' WHERE id = ?`, [item.id]);
                    console.log(`[SYNC] Upload successful: ${item.entity_type} ID ${item.entity_id} (${item.operation})`);
                    syncedCount++;
                } else {
                    await dbMod.run(`UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1 WHERE id = ?`, [item.id]);
                    console.warn(`[SYNC] Upload failed, retry enqueued for queue item ID: ${item.id}`);
                    failedCount++;
                }
            } catch (err) {
                await dbMod.run(`UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1 WHERE id = ?`, [item.id]);
                console.error(`[SYNC] Exception processing queue item ${item.id}:`, err.message);
                failedCount++;
            }
        }

        return { processed: pending.length, synced: syncedCount, failed: failedCount };
    }

    // Upload local entity change to Cloud Firestore via REST API
    async uploadEntityToCloud(entityType, entityId, operation, payload, firebaseUid) {
        try {
            const collectionName = entityType === 'note' ? 'notes' : 
                                   entityType === 'book' ? 'books' : 
                                   entityType === 'profile' ? 'students' : 
                                   entityType === 'student_parent_connection' ? 'student_parent_connections' :
                                   entityType === 'student_teacher_connection' ? 'student_teacher_connections' :
                                   `${entityType}s`;
            let docPath = `${collectionName}/${entityId}`;
            if (firebaseUid && entityType === 'note') {
                docPath = `students/${firebaseUid}/notes/${entityId}`;
            } else if (firebaseUid && entityType === 'book') {
                docPath = `students/${firebaseUid}/books/${entityId}`;
            } else if (firebaseUid && entityType === 'task') {
                docPath = `students/${firebaseUid}/tasks/${entityId}`;
            } else if (firebaseUid && entityType === 'search_history') {
                docPath = `students/${firebaseUid}/search_history/${entityId}`;
            } else if (firebaseUid && entityType === 'profile') {
                docPath = `students/${firebaseUid}`;
            } else if (entityType === 'student_parent_connection') {
                docPath = `student_parent_connections/${entityId}`;
            } else if (entityType === 'student_teacher_connection') {
                docPath = `student_teacher_connections/${entityId}`;
            }

            if (operation === 'delete') {
                const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${docPath}?key=${this.apiKey}`;
                const res = await sendCloudRequest('DELETE', url);
                return res.status === 200 || res.status === 404;
            }

            // Convert raw JS payload into Firestore REST field format
            const fields = {};
            for (const key of Object.keys(payload || {})) {
                const val = payload[key];
                if (typeof val === 'string') fields[key] = { stringValue: val };
                else if (typeof val === 'number') fields[key] = { integerValue: val };
                else if (typeof val === 'boolean') fields[key] = { booleanValue: val };
                else if (val && typeof val === 'object') fields[key] = { stringValue: JSON.stringify(val) };
            }
            if (!fields.updated_at) fields.updated_at = { stringValue: new Date().toISOString() };

            const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/${docPath}?key=${this.apiKey}`;

            const res = await sendCloudRequest('PATCH', url, { fields });
            return res.status === 200;
        } catch (err) {
            console.error(`[SYNC] uploadEntityToCloud error for ${entityType}:${entityId}:`, err.message);
            return false;
        }
    }

    // Pull Cloud Firestore changes down into SQLite (Deterministic conflict resolution: latest updated_at wins)
    async pullCloudUpdatesToApp(appKey, firebaseUid) {
        const dbMod = this.getDbModule(appKey);
        if (!dbMod || !firebaseUid) return false;

        try {
            console.log(`[SYNC] Pulling cloud updates for UID ${firebaseUid} in ${appDatabases[appKey].name}...`);
            const url = `https://firestore.googleapis.com/v1/projects/${this.projectId}/databases/(default)/documents/students/${firebaseUid}?key=${this.apiKey}`;
            const res = await sendCloudRequest('GET', url);

            if (res.status === 200 && res.body && res.body.fields) {
                const fields = res.body.fields;
                const cloudName = fields.name ? fields.name.stringValue : '';
                const cloudClass = fields.class ? fields.class.stringValue : '';
                const cloudUpdatedAt = fields.updated_at ? fields.updated_at.stringValue : '';

                // Check local SQLite timestamp
                const localProfile = await dbMod.get(`SELECT * FROM student_profiles WHERE firebase_uid = ?`, [firebaseUid]);

                if (!localProfile) {
                    await dbMod.run(
                        `INSERT INTO student_profiles (firebase_uid, name, class) VALUES (?, ?, ?)`,
                        [firebaseUid, cloudName, cloudClass]
                    );
                    console.log(`[SYNC] Cloud -> SQLite: Created local profile for ${firebaseUid}`);
                } else {
                    const localUpdatedAt = localProfile.updated_at || '';
                    if (!localUpdatedAt || new Date(cloudUpdatedAt) >= new Date(localUpdatedAt)) {
                        await dbMod.run(
                            `UPDATE student_profiles SET name = ?, class = ?, updated_at = CURRENT_TIMESTAMP WHERE firebase_uid = ?`,
                            [cloudName || localProfile.name, cloudClass || localProfile.class, firebaseUid]
                        );
                        console.log(`[SYNC] Cloud -> SQLite: Updated local profile for ${firebaseUid} (Cloud newer)`);
                    }
                }
            }
            return true;
        } catch (err) {
            console.error(`[SYNC] pullCloudUpdatesToApp error for ${firebaseUid}:`, err.message);
            return false;
        }
    }

    // Process sync for all 6 applications
    async syncAllApplications() {
        const isOnline = await this.checkInternetConnection();
        this.isOnline = isOnline;

        if (!isOnline) {
            console.log('[SYNC] Offline mode active — skipping cloud upload/download.');
            return { online: false, results: {} };
        }

        console.log('🌐 [SYNC] Online connection detected! Processing pending sync queues across all applications...');
        const results = {};
        for (const appKey of Object.keys(appDatabases)) {
            results[appKey] = await this.syncAppQueue(appKey);
        }
        console.log('[SYNC] Sync completed across all applications.');
        return { online: true, results };
    }
}

module.exports = new SyncManager();
