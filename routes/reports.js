const express = require('express');
const { db } = require('../db');
const { calculateWage, hoursBetween } = require('../utils');

const router = express.Router();

router.get('/weekly', (req, res) => {
  try {
    const days = parseInt(req.query.days, 10);
    const dateParam = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : null;
    const startParam = typeof req.query.start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.start) ? req.query.start : null;
    const endParam = typeof req.query.end === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.end) ? req.query.end : null;
    const lookbackDays = !Number.isNaN(days) && days > 0 ? days : 7;

    let sql = `SELECT * FROM allocations WHERE 1=1`;
    const params = [];
    let rangeMeta = { days: lookbackDays };

    if (dateParam) {
      sql += ' AND date(work_date) = date(?)';
      params.push(dateParam);
      rangeMeta = { date: dateParam };
    } else if (startParam || endParam) {
      sql += ' AND date(work_date) BETWEEN date(?) AND date(?)';
      params.push(startParam || endParam, endParam || startParam);
      rangeMeta = { start: startParam || endParam, end: endParam || startParam };
    } else {
      sql += ' AND work_date >= date("now", ?)';
      params.push(`-${lookbackDays} days`);
      rangeMeta = { days: lookbackDays };
    }

    sql += ' ORDER BY created_at DESC';

    db.all(sql, params, (err, rows) => {
      if (err) return res.status(500).json({ error: 'Failed to load report data' });

      const branchTotals = {};
      const staffTotals = {};

      rows.forEach((r) => {
        const wage = r.total_wage ?? calculateWage(r.start_time, r.end_time, r.rate, r.rate_unit) ?? 0;
        branchTotals[r.branch] = (branchTotals[r.branch] || 0) + wage;

        const hours = hoursBetween(r.start_time, r.end_time);
        const key = r.staff_id || r.name;
        if (!staffTotals[key]) {
          staffTotals[key] = {
            staff_id: r.staff_id || null,
            name: r.name,
            role: r.role,
            hours: 0,
            wage: 0,
          };
        }
        staffTotals[key].hours += hours;
        staffTotals[key].wage += wage;
      });

      const staffTotalsArr = Object.values(staffTotals).map((s) => ({
        ...s,
        hours: Math.round(s.hours * 100) / 100,
        wage: Math.round(s.wage * 100) / 100,
      }));

      const totalWage = staffTotalsArr.reduce((sum, s) => sum + s.wage, 0);
      const totalHours = staffTotalsArr.reduce((sum, s) => sum + s.hours, 0);

      const response = {
        range: rangeMeta,
        totals: {
          wage: totalWage,
          hours: totalHours,
        },
        branchTotals: Object.entries(branchTotals).map(([branch, totalWage]) => ({ branch, totalWage })),
        staffTotals: staffTotalsArr,
        // kept for backward compatibility with older clients
        staffHours: staffTotalsArr.map(({ wage, ...rest }) => rest),
      };

      res.json(response);
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while generating weekly report' });
  }
});

module.exports = router;
