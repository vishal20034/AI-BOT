/**
 * AI-BOT — Automated fresher job search & recruiter email outreach.
 * Single entry point: `node server.js` then open http://localhost:5000
 */

require('dotenv').config();

const path = require('path');
const express = require('express');
const mongoose = require('mongoose');

const { ensureUploadDir } = require('./services/resume');
const { verifyTransport } = require('./services/mailer');
const { getStats, listJobs } = require('./services/jobQuery');
const { getState } = require('./services/searchRunner');
const { JOB_TITLES, LOCATIONS, CANDIDATE } = require('./config/constants');

const jobsRouter = require('./routes/jobs');
const emailRouter = require('./routes/email');
const uploadRouter = require('./routes/upload');
const { getCurrentResume } = require('./services/resume');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 5000;

// ----- View engine & middleware -----
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

ensureUploadDir();

// ----- Dashboard (home) -----
app.get('/', async (req, res) => {
  try {
    const [stats, jobs] = await Promise.all([getStats(), listJobs(req.query)]);
    res.render('dashboard', {
      title: 'Dashboard',
      active: 'dashboard',
      stats,
      jobs,
      filters: {
        keyword: req.query.keyword || '',
        location: req.query.location || 'all',
        status: req.query.status || '',
        contactOnly: req.query.contactOnly === 'true',
      },
      jobTitles: JOB_TITLES,
      locations: LOCATIONS,
      candidate: CANDIDATE,
      searchState: getState(),
      resume: getCurrentResume(),
    });
  } catch (err) {
    console.error('[server] dashboard error:', err.message);
    res.status(500).render('error', {
      title: 'Error',
      active: '',
      message: 'Could not load the dashboard.',
      detail: err.message,
    });
  }
});

// ----- Feature routers -----
app.use('/jobs', jobsRouter);
app.use('/email', emailRouter);
app.use('/upload', uploadRouter);

// ----- Health check -----
app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime() }));

// ----- 404 -----
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Not Found',
    active: '',
    message: 'Page not found.',
    detail: `No route for ${req.method} ${req.originalUrl}`,
  });
});

// ----- Error handler -----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] unhandled error:', err.message);
  res.status(500).render('error', {
    title: 'Error',
    active: '',
    message: 'Something went wrong.',
    detail: err.message,
  });
});

// ----- Boot -----
async function start() {
  const mongoUri = process.env.MONGO_URI;
  const dbName = process.env.MONGO_DB || 'jobsdb';

  if (!mongoUri) {
    console.error('FATAL: MONGO_URI is not set in .env');
    process.exit(1);
  }

  try {
    await mongoose.connect(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 15000,
    });
    console.log(`[db] Connected to MongoDB (database: ${dbName}).`);
  } catch (err) {
    console.error('[db] MongoDB connection failed:', err.message);
    console.error('     The app will keep running, but data features will not work');
    console.error('     until MongoDB is reachable. Check MONGO_URI / network access.');
  }

  // Verify SMTP in the background (non-blocking, non-fatal)
  verifyTransport();

  app.listen(PORT, () => {
    console.log('');
    console.log('  ============================================');
    console.log('   AI-BOT job outreach server is running');
    console.log(`   Open:  http://localhost:${PORT}`);
    console.log('  ============================================');
    console.log('');
  });
}

start();

module.exports = app;
