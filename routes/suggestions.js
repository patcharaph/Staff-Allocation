const express = require('express');
const { db } = require('../db');
const { genId, calculateWage, hoursBetween, isNonEmptyString, validateRate } = require('../utils');

const router = express.Router();

router.post('/schedule', (req, res) => {
  try {
    const {
      branches = [],
      days = [],
      start_time = '09:00',
      end_time = '18:00',
      maxHoursPerDay = 8,
      minStaffPerBranch = 1,
    } = req.body;

    if (!Array.isArray(branches) || !Array.isArray(days) || branches.length === 0 || days.length === 0) {
      return res.status(400).json({ error: 'branches and days are required arrays' });
    }
    if (!isNonEmptyString(start_time) || !isNonEmptyString(end_time)) {
      return res.status(400).json({ error: 'start_time and end_time are required' });
    }
    if (Number.isNaN(Number(maxHoursPerDay)) || Number(maxHoursPerDay) <= 0) {
      return res.status(400).json({ error: 'maxHoursPerDay must be a positive number' });
    }
    if (Number.isNaN(Number(minStaffPerBranch)) || Number(minStaffPerBranch) <= 0) {
      return res.status(400).json({ error: 'minStaffPerBranch must be a positive number' });
    }

    db.all('SELECT * FROM staff_pool', (err, staffRows) => {
      if (err) return res.status(500).json({ error: 'Failed to load staff' });
      if (!staffRows || staffRows.length === 0) return res.status(400).json({ error: 'No staff available to suggest schedule' });

      const suggestions = [];
      const hoursTracker = {};
      const hoursPerShift = hoursBetween(start_time, end_time);

      let staffIndex = 0;
      days.forEach((day) => {
        branches.forEach((branch) => {
          for (let i = 0; i < minStaffPerBranch; i += 1) {
            const staff = staffRows[staffIndex % staffRows.length];
            staffIndex += 1;

            const staffKey = staff.id;
            const currentHours = hoursTracker[staffKey]?.[day] || 0;
            if (currentHours + hoursPerShift > maxHoursPerDay) {
              continue; // skip assignment if exceeds max per day
            }

            const rateCheck = validateRate(staff.default_rate ?? 0);
            const rate = rateCheck.ok ? rateCheck.value : 0;
            const suggestion = {
              id: genId(),
              staff_id: staff.id,
              name: staff.name,
              role: staff.role,
              branch,
              day,
              start_time,
              end_time,
              rate,
              rate_unit: 'hour',
              total_wage: calculateWage(start_time, end_time, rate),
            };
            suggestions.push(suggestion);

            hoursTracker[staffKey] = hoursTracker[staffKey] || {};
            hoursTracker[staffKey][day] = currentHours + hoursPerShift;
          }
        });
      });

      res.json({
        generated: suggestions.length,
        constraints: { branches, days, start_time, end_time, maxHoursPerDay, minStaffPerBranch },
        suggestions,
      });
    });
  } catch (err) {
    res.status(500).json({ error: 'Unexpected error while generating suggested schedule' });
  }
});

module.exports = router;
