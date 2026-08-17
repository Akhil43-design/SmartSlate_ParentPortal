const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dataDir = path.resolve(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'smartslate-parent.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('[SQLite Parent] Error opening database:', err.message);
    } else {
        console.log('[SQLite Parent] Database initialized:', dbPath);
        db.run('PRAGMA foreign_keys = ON;');
        db.run('PRAGMA journal_mode = WAL;');
        db.run('PRAGMA synchronous = NORMAL;');
        db.run('PRAGMA busy_timeout = 5000;');
        initTables();
    }
});

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) return reject(err);
            resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
}

async function initTables() {
    try {
        await run(`
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firebase_uid TEXT UNIQUE NOT NULL,
                email TEXT,
                role TEXT DEFAULT 'parent',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS parent_profiles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firebase_uid TEXT UNIQUE NOT NULL,
                name TEXT,
                email TEXT,
                phone TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS student_connections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_uid TEXT NOT NULL,
                student_uid TEXT NOT NULL,
                student_id TEXT,
                student_name TEXT,
                relationship TEXT DEFAULT 'Parent',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(parent_uid, student_uid)
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS student_activity (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_uid TEXT NOT NULL,
                student_uid TEXT NOT NULL,
                activity_type TEXT NOT NULL,
                description TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);

        await run(`
            CREATE TABLE IF NOT EXISTS sync_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                firebase_uid TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                operation TEXT NOT NULL,
                payload TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                status TEXT DEFAULT 'pending',
                retry_count INTEGER DEFAULT 0
            );
        `);

        console.log('[SQLite Parent] Tables initialized successfully.');
    } catch (err) {
        console.error('[SQLite Parent] Error initializing tables:', err.message);
    }
}

module.exports = {
    db,
    run,
    get,
    all,
    dbPath
};
