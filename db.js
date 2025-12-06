const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '14', 10); // default 2 weeks

if (!fs.existsSync(DB_PATH)) {
  fs.closeSync(fs.openSync(DB_PATH, 'w')); // create empty db file if missing
}

const db = new sqlite3.Database(DB_PATH);

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS staff_pool (
        id TEXT PRIMARY KEY,
        name TEXT,
        role TEXT,
        default_rate REAL,
        rate_unit TEXT DEFAULT 'hour'
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS allocations (
        id TEXT PRIMARY KEY,
        staff_id TEXT,
        name TEXT,
        role TEXT,
        branch TEXT,
        day TEXT,
        work_date TEXT,
        start_time TEXT,
        end_time TEXT,
        rate REAL,
        rate_unit TEXT DEFAULT 'hour',
        total_wage REAL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (staff_id) REFERENCES staff_pool(id)
      )
    `);

    // Backfill columns for older databases (ignore error if exists)
    db.run(`ALTER TABLE allocations ADD COLUMN rate_unit TEXT DEFAULT 'hour'`, () => {});
    db.run(`ALTER TABLE allocations ADD COLUMN work_date TEXT`, () => {});
    db.run(`UPDATE allocations SET work_date = date(created_at) WHERE work_date IS NULL`, () => {});
    db.run(`ALTER TABLE staff_pool ADD COLUMN rate_unit TEXT DEFAULT 'hour'`, () => {});
  });
}

function pruneOldAllocations() {
  if (Number.isNaN(RETENTION_DAYS) || RETENTION_DAYS <= 0) return;
  db.run(
    'DELETE FROM allocations WHERE created_at < datetime("now", ?)',
    [`-${RETENTION_DAYS} days`],
    function onDone(err) {
      if (err) {
        console.error('Prune error:', err.message);
      } else if (this.changes > 0) {
        console.log(`Pruned ${this.changes} old allocations (>${RETENTION_DAYS} days).`);
      }
    }
  );
}

function startRetentionJob() {
  pruneOldAllocations();
  setInterval(pruneOldAllocations, 24 * 60 * 60 * 1000);
}

module.exports = {
  db,
  initDb,
  startRetentionJob,
  DB_PATH,
  RETENTION_DAYS,
};
