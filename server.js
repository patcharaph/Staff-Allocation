/* Staff Allocation Backend - Node.js + Express + SQLite */
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const { randomUUID } = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.sqlite');
const RETENTION_DAYS = parseInt(process.env.RETENTION_DAYS || '14', 10); // keep 1–2 weeks by default

if (!fs.existsSync(DB_PATH)) {
  fs.closeSync(fs.openSync(DB_PATH, 'w')); // Create empty file if missing
}

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS staff_pool (
      id TEXT PRIMARY KEY,
      name TEXT,
      role TEXT,
      default_rate REAL
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
      start_time TEXT,
      end_time TEXT,
      rate REAL,
      total_wage REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (staff_id) REFERENCES staff_pool(id)
    )
  `);
});

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const genId = () => (typeof randomUUID === 'function' ? randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

const calculateWage = (start, end, rate) => {
  if (!start || !end || !rate) return null;
  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  if ([sH, sM, eH, eM].some(Number.isNaN)) return null;
  let hours = (eH + eM / 60) - (sH + sM / 60);
  if (hours < 0) hours += 24;
  return Math.round(hours * rate);
};

/* --- Retention: prune old allocations --- */
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

// Run once at start and then daily
pruneOldAllocations();
setInterval(pruneOldAllocations, 24 * 60 * 60 * 1000);

/* --- Staff Pool --- */
app.get('/api/staff', (req, res) => {
  db.all('SELECT * FROM staff_pool', (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch staff' });
    res.json(rows);
  });
});

app.post('/api/staff', (req, res) => {
  const { name, role, default_rate } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const id = req.body.id || genId();
  const stmt = `INSERT INTO staff_pool (id, name, role, default_rate) VALUES (?, ?, ?, ?)`;
  db.run(stmt, [id, name, role || '', default_rate ?? null], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to create staff' });
    res.status(201).json({ id, name, role: role || '', default_rate: default_rate ?? null });
  });
});

/* --- Allocations --- */
app.get('/api/allocations', (req, res) => {
  const days = parseInt(req.query.days, 10);
  let sql = 'SELECT * FROM allocations';
  const params = [];
  if (!Number.isNaN(days) && days > 0) {
    sql += ' WHERE created_at >= datetime("now", ?)';
    params.push(`-${days} days`);
  }
  sql += ' ORDER BY created_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch allocations' });
    res.json(rows);
  });
});

app.post('/api/allocations', (req, res) => {
  const {
    staff_id,
    name,
    role,
    branch,
    day,
    start_time,
    end_time,
    rate,
    total_wage,
  } = req.body;

  if (!name || !day || !branch) {
    return res.status(400).json({ error: 'name, day, and branch are required' });
  }

  const id = req.body.id || genId();
  const effectiveRate = rate ?? null;
  const wage = total_wage ?? calculateWage(start_time, end_time, effectiveRate);

  const stmt = `
    INSERT INTO allocations
      (id, staff_id, name, role, branch, day, start_time, end_time, rate, total_wage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  db.run(
    stmt,
    [id, staff_id || null, name, role || '', branch, day, start_time || null, end_time || null, effectiveRate, wage],
    function (err) {
      if (err) return res.status(500).json({ error: 'Failed to create allocation' });
      res.status(201).json({
        id,
        staff_id: staff_id || null,
        name,
        role: role || '',
        branch,
        day,
        start_time: start_time || null,
        end_time: end_time || null,
        rate: effectiveRate,
        total_wage: wage,
      });
    }
  );
});

app.put('/api/allocations/:id', (req, res) => {
  const { id } = req.params;

  db.get('SELECT * FROM allocations WHERE id = ?', [id], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to load allocation' });
    if (!row) return res.status(404).json({ error: 'Allocation not found' });

    const updated = {
      staff_id: req.body.staff_id ?? row.staff_id,
      name: req.body.name ?? row.name,
      role: req.body.role ?? row.role,
      branch: req.body.branch ?? row.branch,
      day: req.body.day ?? row.day,
      start_time: req.body.start_time ?? row.start_time,
      end_time: req.body.end_time ?? row.end_time,
      rate: req.body.rate ?? row.rate,
      total_wage: req.body.total_wage,
    };

    const needsRecalc = req.body.start_time !== undefined || req.body.end_time !== undefined || req.body.rate !== undefined;
    if (updated.total_wage === undefined && needsRecalc) {
      updated.total_wage = calculateWage(updated.start_time, updated.end_time, updated.rate);
    } else if (updated.total_wage === undefined) {
      updated.total_wage = row.total_wage;
    }

    const stmt = `
      UPDATE allocations SET
        staff_id = ?, name = ?, role = ?, branch = ?, day = ?,
        start_time = ?, end_time = ?, rate = ?, total_wage = ?
      WHERE id = ?
    `;

    db.run(
      stmt,
      [
        updated.staff_id,
        updated.name,
        updated.role,
        updated.branch,
        updated.day,
        updated.start_time,
        updated.end_time,
        updated.rate,
        updated.total_wage,
        id,
      ],
      function (updateErr) {
        if (updateErr) return res.status(500).json({ error: 'Failed to update allocation' });
        res.json({ id, ...updated });
      }
    );
  });
});

app.delete('/api/allocations/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM allocations WHERE id = ?', [id], function (err) {
    if (err) return res.status(500).json({ error: 'Failed to delete allocation' });
    if (this.changes === 0) return res.status(404).json({ error: 'Allocation not found' });
    res.json({ success: true });
  });
});

/* --- CSV Export --- */
const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

app.get('/api/export-csv', (req, res) => {
  const days = parseInt(req.query.days, 10);
  let sql = 'SELECT * FROM allocations';
  const params = [];
  if (!Number.isNaN(days) && days > 0) {
    sql += ' WHERE created_at >= datetime("now", ?)';
    params.push(`-${days} days`);
  }
  sql += ' ORDER BY created_at DESC';

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Failed to export CSV' });

    const header = ['ID', 'Name', 'Role', 'Branch', 'Day', 'Start', 'End', 'Rate', 'Total Wage'];
    const lines = rows.map((r) =>
      [
        r.id,
        r.name,
        r.role,
        r.branch,
        r.day,
        r.start_time,
        r.end_time,
        r.rate,
        r.total_wage,
      ].map(escapeCsv).join(',')
    );

    const bom = '\uFEFF';
    const csv = bom + [header.join(','), ...lines].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const suffix = !Number.isNaN(days) && days > 0 ? `-${days}d` : 'all';
    res.setHeader('Content-Disposition', `attachment; filename="allocations-${suffix}.csv"`);
    res.send(csv);
  });
});

app.listen(PORT, () => {
  console.log(`Staff Allocation API running on http://localhost:${PORT}`);
});
