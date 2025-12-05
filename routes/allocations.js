const express = require('express');
const { db } = require('../db');
const { genId, calculateWage, isNonEmptyString, validateRate } = require('../utils');

const router = express.Router();

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
      if (err) return res.status(500).json({ error: 'Failed to fetch allocations' });
      res.json(rows);
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while fetching allocations' });
  }
});

router.post('/', (req, res) => {
  try {
    const { staff_id, name, role, branch, day, start_time, end_time, rate, total_wage, rate_unit } = req.body;

    if (![name, role, branch, day, start_time, end_time].every(isNonEmptyString)) {
      return res.status(400).json({ error: 'name, role, branch, day, start_time, end_time are required' });
    }

    const rateCheck = validateRate(rate);
    if (!rateCheck.ok) return res.status(400).json({ error: rateCheck.message });
    const unit = rate_unit === 'day' ? 'day' : 'hour';

    const id = req.body.id || genId();
    const wage = total_wage ?? calculateWage(start_time, end_time, rateCheck.value, unit);

    const stmt = `
      INSERT INTO allocations
        (id, staff_id, name, role, branch, day, start_time, end_time, rate, rate_unit, total_wage)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      stmt,
      [id, staff_id || null, name.trim(), role.trim(), branch.trim(), day.trim(), start_time.trim(), end_time.trim(), rateCheck.value, unit, wage],
      function (err) {
        if (err) return res.status(500).json({ error: 'Failed to create allocation' });
        res.status(201).json({
          id,
          staff_id: staff_id || null,
          name: name.trim(),
          role: role.trim(),
          branch: branch.trim(),
          day: day.trim(),
          start_time: start_time.trim(),
          end_time: end_time.trim(),
          rate: rateCheck.value,
          rate_unit: unit,
          total_wage: wage,
        });
      }
    );
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while creating allocation' });
  }
});

router.put('/:id', (req, res) => {
  try {
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
        rate_unit: req.body.rate_unit || row.rate_unit || 'hour',
        total_wage: req.body.total_wage,
      };

      if (![updated.name, updated.role, updated.branch, updated.day, updated.start_time, updated.end_time].every(isNonEmptyString)) {
        return res.status(400).json({ error: 'name, role, branch, day, start_time, end_time are required' });
      }

      const rateCheck = validateRate(updated.rate);
      if (!rateCheck.ok) return res.status(400).json({ error: rateCheck.message });
      updated.rate = rateCheck.value;
      updated.rate_unit = updated.rate_unit === 'day' ? 'day' : 'hour';

      const needsRecalc =
        req.body.start_time !== undefined || req.body.end_time !== undefined || req.body.rate !== undefined;
      if (updated.total_wage === undefined && needsRecalc) {
        updated.total_wage = calculateWage(updated.start_time, updated.end_time, updated.rate, updated.rate_unit);
      } else if (updated.total_wage === undefined) {
        updated.total_wage = row.total_wage;
      }

      const stmt = `
        UPDATE allocations SET
          staff_id = ?, name = ?, role = ?, branch = ?, day = ?,
          start_time = ?, end_time = ?, rate = ?, rate_unit = ?, total_wage = ?
        WHERE id = ?
      `;

      db.run(
        stmt,
        [
          updated.staff_id,
          updated.name.trim(),
          updated.role.trim(),
          updated.branch.trim(),
          updated.day.trim(),
          updated.start_time.trim(),
          updated.end_time.trim(),
          updated.rate,
          updated.rate_unit,
          updated.total_wage,
          id,
        ],
        function (updateErr) {
          if (updateErr) return res.status(500).json({ error: 'Failed to update allocation' });
          res.json({ id, ...updated });
        }
      );
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while updating allocation' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.run('DELETE FROM allocations WHERE id = ?', [id], function (err) {
      if (err) return res.status(500).json({ error: 'Failed to delete allocation' });
      if (this.changes === 0) return res.status(404).json({ error: 'Allocation not found' });
      res.json({ success: true });
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while deleting allocation' });
  }
});

module.exports = router;
