/**
 * Job routes (mounted at /jobs)
 *  POST /jobs/search         - kick off an asynchronous scrape + outreach run
 *  GET  /jobs/search/status  - poll the current run state
 *  GET  /jobs/stats          - dashboard stat-card numbers
 *  GET  /jobs/list           - filtered job list as JSON (live table refresh)
 */

const express = require('express');
const router = express.Router();

const { runSearch, getState } = require('../services/searchRunner');
const { getStats, listJobs } = require('../services/jobQuery');
const { JOB_TITLES } = require('../config/constants');

// Start a search in the background so the HTTP response returns immediately.
router.post('/search', (req, res) => {
  const state = getState();
  if (state.running) {
    return res.json({ started: false, alreadyRunning: true, state });
  }

  const location = (req.body && req.body.location) || '';
  let titles = req.body && req.body.titles;
  if (typeof titles === 'string' && titles.trim()) {
    titles = titles.split(',').map((t) => t.trim()).filter(Boolean);
  }
  if (!Array.isArray(titles) || !titles.length) titles = JOB_TITLES;

  // Fire and forget; errors are captured inside runSearch/state.error
  runSearch({ titles, location, autoSend: true }).catch((err) =>
    console.error('[routes/jobs] search error:', err.message)
  );

  res.json({ started: true, titles, location });
});

router.get('/search/status', (req, res) => {
  res.json(getState());
});

router.get('/stats', async (req, res) => {
  try {
    const stats = await getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/list', async (req, res) => {
  try {
    const jobs = await listJobs(req.query);
    res.json({ count: jobs.length, jobs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
