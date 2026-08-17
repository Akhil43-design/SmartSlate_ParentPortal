const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'smartslate.db');
const schemaPath = path.join(__dirname, 'schema.sql');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening Unified SmartSlate SQLite database:', err);
    } else {
        console.log('Connected to Unified SmartSlate SQLite database at:', dbPath);
        db.run('PRAGMA foreign_keys = ON;');
        db.run('PRAGMA journal_mode = WAL;');
        db.run('PRAGMA synchronous = NORMAL;');
        db.run('PRAGMA busy_timeout = 5000;');
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

function initDb() {
    return new Promise((resolve, reject) => {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        db.exec(schemaSql, (err) => {
            if (err) {
                console.error('Failed to initialize database schema:', err);
                return reject(err);
            }
            db.run("ALTER TABLE exams ADD COLUMN start_time DATETIME", () => {});
            db.run("ALTER TABLE exams ADD COLUMN end_time DATETIME", () => {});
            db.run("ALTER TABLE assignments ADD COLUMN target_class TEXT", () => {});
            db.run("ALTER TABLE assignments ADD COLUMN subject TEXT", () => {});
            db.run("ALTER TABLE exams ADD COLUMN target_class TEXT", () => {});
            db.run("ALTER TABLE exams ADD COLUMN subject TEXT", () => {});
            db.run("ALTER TABLE notes ADD COLUMN deleted INTEGER DEFAULT 0", () => {});
            db.run("ALTER TABLE books ADD COLUMN deleted INTEGER DEFAULT 0", () => {});
            db.run("ALTER TABLE notes ADD COLUMN sync_status TEXT DEFAULT 'synced'", () => {});
            db.run("ALTER TABLE books ADD COLUMN sync_status TEXT DEFAULT 'synced'", () => {});
            db.run("ALTER TABLE notes ADD COLUMN firebase_uid TEXT", () => {});
            db.run("ALTER TABLE notes ADD COLUMN note_id TEXT", () => {});
            db.run("ALTER TABLE notes ADD COLUMN drawing_data TEXT", () => {});
            db.run("ALTER TABLE books ADD COLUMN firebase_uid TEXT", () => {});
            db.run("ALTER TABLE books ADD COLUMN book_id TEXT", () => {});
            db.run("ALTER TABLE books ADD COLUMN description TEXT", () => {});
            db.run("ALTER TABLE submissions ADD COLUMN evaluated_at DATETIME", () => {});
            db.run("ALTER TABLE submissions ADD COLUMN evaluated_by TEXT", () => {});
            db.run("ALTER TABLE submissions ADD COLUMN student_uid TEXT", () => {});
            db.run("ALTER TABLE exams ADD COLUMN exam_type TEXT DEFAULT 'written'", () => {});
            db.run("ALTER TABLE exams ADD COLUMN duration_minutes INTEGER DEFAULT 60", () => {});
            db.run("ALTER TABLE exams ADD COLUMN start_date TEXT", () => {});
            db.run("ALTER TABLE exams ADD COLUMN end_date TEXT", () => {});
            db.run("ALTER TABLE exams ADD COLUMN answer_key TEXT", () => {});
            db.run(`CREATE TABLE IF NOT EXISTS exam_submissions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                student_uid TEXT,
                answers TEXT NOT NULL,
                score REAL,
                total_marks REAL,
                status TEXT DEFAULT 'submitted',
                submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                evaluated_at DATETIME,
                evaluated_by TEXT,
                feedback TEXT,
                violation_count INTEGER DEFAULT 0,
                UNIQUE(exam_id, student_id)
            )`, () => {});
            db.run(`CREATE TABLE IF NOT EXISTS exam_violations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                exam_id INTEGER NOT NULL,
                student_id INTEGER NOT NULL,
                student_uid TEXT,
                type TEXT NOT NULL,
                details TEXT,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
            )`, () => {});
            db.run("ALTER TABLE users ADD COLUMN firebase_uid TEXT", () => {});
            db.run("ALTER TABLE students ADD COLUMN firebase_uid TEXT", () => {});
            db.run("ALTER TABLE students ADD COLUMN grade TEXT", () => {});
            db.run("ALTER TABLE students ADD COLUMN class_name TEXT", () => {});
            db.run("ALTER TABLE students ADD COLUMN class_id_str TEXT", () => {});
            db.run("ALTER TABLE exams ADD COLUMN target_section TEXT DEFAULT 'All'", () => {});
            db.run("ALTER TABLE exams ADD COLUMN education_level TEXT", () => {});
            db.run("ALTER TABLE assignments ADD COLUMN target_section TEXT DEFAULT 'All'", () => {});
            db.run("ALTER TABLE assignments ADD COLUMN education_level TEXT", () => {});
            console.log('Unified SmartSlate database schema initialized.');
            resolve();
        });
    });
}

module.exports = {
    db,
    run,
    get,
    all,
    initDb
};
