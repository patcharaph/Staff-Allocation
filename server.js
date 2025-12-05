/* Staff Allocation Backend - Entry point wiring routes + DB */
const path = require('path');
const express = require('express');
const cors = require('cors');

const { initDb, startRetentionJob } = require('./db');
const staffRoutes = require('./routes/staff');
const allocationRoutes = require('./routes/allocations');
const exportRoutes = require('./routes/export');
const reportRoutes = require('./routes/reports');
const suggestionRoutes = require('./routes/suggestions');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize DB and housekeeping
initDb();
startRetentionJob();

// Routes
app.use('/api/staff', staffRoutes);
app.use('/api/allocations', allocationRoutes);
app.use('/api/export-csv', exportRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/suggest', suggestionRoutes);

// Not Found handler
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  return next();
});

// Centralized error handler
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Staff Allocation API running on http://localhost:${PORT}`);
});
