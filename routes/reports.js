const express = require('express');
const { db } = require('../db');
const { calculateWage, hoursBetween } = require('../utils');

const router = express.Router();

router.get('/weekly', (req, res) => {
  try {
    const days = parseInt(req.query.days, 10);
    const lookbackDays = !Number.isNaN(days) && days > 0 ? days : 7;

    const sql = `
      SELECT * FROM allocations
      WHERE created_at >= datetime("now", ?)
      ORDER BY created_at DESC
    `;
    const params = [`-${lookbackDays} days`];

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to load report data' });

      const branchTotals = {};
      const staffHours = {};

      rows.forEach((r) => {
        const wage = r.total_wage ?? calculateWage(r.start_time, r.end_time, r.rate, r.rate_unit) ?? 0;
        branchTotals[r.branch] = (branchTotals[r.branch] || 0) + wage;

        const hours = hoursBetween(r.start_time, r.end_time);
        const key = r.staff_id || r.name;
        if (!staffHours[key]) {
          staffHours[key] = { staff_id: r.staff_id || null, name: r.name, hours: 0, role: r.role };
        }
        staffHours[key].hours += hours;
      });

      const response = {
        range: { days: lookbackDays },
        totals: {
          wage: Object.values(branchTotals).reduce((sum, v) => sum + v, 0),
          hours: Object.values(staffHours).reduce((sum, s) => sum + s.hours, 0),
        },
        branchTotals: Object.entries(branchTotals).map(([branch, totalWage]) => ({ branch, totalWage })),
        staffHours: Object.values(staffHours).map((s) => ({ ...s, hours: Math.round(s.hours * 100) / 100 })),
      };

      res.json(response);
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while generating weekly report' });
  }
});

module.exports = router;
