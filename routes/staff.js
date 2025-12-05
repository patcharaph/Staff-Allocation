const express = require('express');
const { db } = require('../db');
const { genId, isNonEmptyString, validateRate } = require('../utils');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    db.all('SELECT * FROM staff_pool', (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to fetch staff' });
      res.json(rows);
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while fetching staff' });
  }
});

router.post('/', (req, res) => {
  try {
    const { name, role, default_rate, rate_unit } = req.body;
    if (!isNonEmptyString(name)) return res.status(400).json({ error: 'name is required' });
    if (!isNonEmptyString(role)) return res.status(400).json({ error: 'role is required' });

    let rateValue = null;
    if (default_rate !== undefined) {
      const rateCheck = validateRate(default_rate);
      if (!rateCheck.ok) return res.status(400).json({ error: rateCheck.message });
      rateValue = rateCheck.value;
    }

    const id = req.body.id || genId();
    const unit = rate_unit === 'day' ? 'day' : 'hour';
    const stmt = `INSERT INTO staff_pool (id, name, role, default_rate, rate_unit) VALUES (?, ?, ?, ?, ?)`;
    db.run(stmt, [id, name.trim(), role.trim(), rateValue, unit], function (err) {
      if (err) return res.status(500).json({ error: 'Failed to create staff' });
      res.status(201).json({ id, name: name.trim(), role: role.trim(), default_rate: rateValue, rate_unit: unit });
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while creating staff' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.get('SELECT * FROM staff_pool WHERE id = ?', [id], (err, row) => {
      if (err) return res.status(500).json({ error: 'Failed to load staff' });
      if (!row) return res.status(404).json({ error: 'Staff not found' });

      const updated = {
        name: req.body.name ?? row.name,
        role: req.body.role ?? row.role,
        default_rate: req.body.default_rate ?? row.default_rate,
        rate_unit: req.body.rate_unit || row.rate_unit || 'hour',
      };

      if (!isNonEmptyString(updated.name) || !isNonEmptyString(updated.role)) {
        return res.status(400).json({ error: 'name and role are required' });
      }

      let rateValue = null;
      if (updated.default_rate !== undefined) {
        const rateCheck = validateRate(updated.default_rate);
        if (!rateCheck.ok) return res.status(400).json({ error: rateCheck.message });
        rateValue = rateCheck.value;
      } else {
        rateValue = row.default_rate;
      }

      const unit = updated.rate_unit === 'day' ? 'day' : 'hour';

      db.run(
        'UPDATE staff_pool SET name = ?, role = ?, default_rate = ?, rate_unit = ? WHERE id = ?',
        [updated.name.trim(), updated.role.trim(), rateValue, unit, id],
        function (updateErr) {
          if (updateErr) return res.status(500).json({ error: 'Failed to update staff' });
          res.json({ id, name: updated.name.trim(), role: updated.role.trim(), default_rate: rateValue, rate_unit: unit });
        }
      );
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while updating staff' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    db.run('DELETE FROM allocations WHERE staff_id = ?', [id], function onAllocDelete(allocErr) {
      if (allocErr) return res.status(500).json({ error: 'Failed to delete staff allocations' });
      const removedAllocations = this.changes || 0;

      db.run('DELETE FROM staff_pool WHERE id = ?', [id], function onStaffDelete(staffErr) {
        if (staffErr) return res.status(500).json({ error: 'Failed to delete staff' });
        const removedStaff = this.changes || 0;
        res.json({ success: true, removedStaff, removedAllocations });
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while deleting staff' });
  }
});

module.exports = router;
