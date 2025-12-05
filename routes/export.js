const express = require('express');
const { db } = require('../db');

const router = express.Router();

const escapeCsv = (value) => {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

router.get('/', (req, res) => {
  try {
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

    const header = ['ID', 'Name', 'Role', 'Branch', 'Day', 'Start', 'End', 'Rate', 'Rate Unit', 'Total Wage'];
    const lines = rows.map((r) =>
      [r.id, r.name, r.role, r.branch, r.day, r.start_time, r.end_time, r.rate, r.rate_unit || 'hour', r.total_wage]
        .map(escapeCsv)
        .join(',')
    );

      const bom = '\uFEFF';
      const csv = bom + [header.join(','), ...lines].join('\n');

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const suffix = !Number.isNaN(days) && days > 0 ? `-${days}d` : 'all';
      res.setHeader('Content-Disposition', `attachment; filename="allocations-${suffix}.csv"`);
      res.send(csv);
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while exporting CSV' });
  }
});

module.exports = router;
