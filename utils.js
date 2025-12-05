const { randomUUID } = require('crypto');

const genId = () =>
  typeof randomUUID === 'function'
    ? randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const calculateWage = (start, end, rate, unit = 'hour') => {
  if (rate === undefined || rate === null) return null;
  if (unit === 'day') return Math.round(Number(rate));
  if (!start || !end) return null;
  const [sH, sM] = String(start).split(':').map(Number);
  const [eH, eM] = String(end).split(':').map(Number);
  if ([sH, sM, eH, eM].some(Number.isNaN)) return null;
  let hours = (eH + eM / 60) - (sH + sM / 60);
  if (hours < 0) hours += 24;
  return Math.round(hours * rate);
};

const hoursBetween = (start, end) => {
  if (!start || !end) return 0;
  const [sH, sM] = String(start).split(':').map(Number);
  const [eH, eM] = String(end).split(':').map(Number);
  if ([sH, sM, eH, eM].some(Number.isNaN)) return 0;
  let hours = (eH + eM / 60) - (sH + sM / 60);
  if (hours < 0) hours += 24;
  return Math.max(hours, 0);
};

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;

const validateRate = (value) => {
  if (value === undefined || value === null) return { ok: false, message: 'rate is required' };
  const num = Number(value);
  if (Number.isNaN(num)) return { ok: false, message: 'rate must be a number' };
  if (num < 0) return { ok: false, message: 'rate must be non-negative' };
  return { ok: true, value: num };
};

module.exports = {
  genId,
  calculateWage,
  hoursBetween,
  isNonEmptyString,
  validateRate,
};
