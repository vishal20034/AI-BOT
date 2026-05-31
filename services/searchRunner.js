/**
 * Search orchestration.
 *
 * Ties together the scraper, recruiter-contact parser, MongoDB persistence and
 * the mailer. A single run can be in progress at a time; its progress/summary
 * is exposed via getState() so the dashboard can poll without freezing.
 */

const Job = require('../models/Job');
const { scrapeAllJobs } = require('./scraper');
const { detectContacts } = require('./recruiterParser');
const { sendOutreachEmail } = require('./mailer');

const state = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastSummary: null,
  error: null,
};

function getState() {
  return { ...state };
}

// Run async tasks with a bounded concurrency.
async function runPool(items, limit, worker) {
  const results = [];
  let index = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (index < items.length) {
      const current = index++;
      try {
        results[current] = await worker(items[current], current);
      } catch (err) {
        results[current] = { error: err.message };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

// Insert or update a single scraped listing, attaching detected contacts.
async function upsertJob(raw) {
  const contacts = detectContacts(raw.description || '');

  const query =
    raw.url && raw.url.length > 5
      ? { url: raw.url }
      : { title: raw.title, company: raw.company, location: raw.location };

  let job = await Job.findOne(query);
  const status = contacts.email ? 'pending' : 'no_contact';

  // Prefer an explicit company from the source; otherwise fall back to a
  // company name detected in the post / description text.
  const resolvedCompany =
    raw.company && raw.company !== 'Unknown'
      ? raw.company
      : contacts.company || raw.company || 'Unknown';

  if (!job) {
    job = await Job.create({
      title: raw.title,
      company: resolvedCompany,
      location: raw.location || '',
      description: raw.description || '',
      postingDate: raw.postingDate || '',
      url: raw.url || '',
      source: raw.source || '',
      recruiterName: contacts.name,
      recruiterEmail: contacts.email,
      recruiterPhone: contacts.phone,
      status,
      emailSent: false,
    });
    return { job, isNew: true };
  }

  // Update existing: fill in any newly discovered details
  let changed = false;
  if (!job.description && raw.description) {
    job.description = raw.description;
    changed = true;
  }
  if ((!job.company || job.company === 'Unknown') && resolvedCompany !== 'Unknown') {
    job.company = resolvedCompany;
    changed = true;
  }
  if (!job.recruiterEmail && contacts.email) {
    job.recruiterEmail = contacts.email;
    changed = true;
  }
  if (!job.recruiterName && contacts.name) {
    job.recruiterName = contacts.name;
    changed = true;
  }
  if (!job.recruiterPhone && contacts.phone) {
    job.recruiterPhone = contacts.phone;
    changed = true;
  }
  if (job.status === 'no_contact' && job.recruiterEmail) {
    job.status = 'pending';
    changed = true;
  }
  if (changed) await job.save();

  return { job, isNew: false };
}

/**
 * Run a full search.
 * @param {Object} opts { titles?: string[], location?: string, autoSend?: boolean }
 * @returns {Promise<Object>} summary
 */
async function runSearch(opts = {}) {
  if (state.running) return getState();

  state.running = true;
  state.startedAt = new Date();
  state.finishedAt = null;
  state.error = null;
  state.lastSummary = { found: 0, newJobs: 0, withEmail: 0, withPhone: 0, emailsSent: 0 };

  const autoSend = opts.autoSend !== false;

  try {
    const rawJobs = await scrapeAllJobs({
      titles: opts.titles,
      location: opts.location,
      enrich: true,
    });

    const summary = { found: rawJobs.length, newJobs: 0, withEmail: 0, withPhone: 0, emailsSent: 0 };

    // Persist all jobs (bounded concurrency to be gentle on MongoDB)
    const saved = await runPool(rawJobs, 5, async (raw) => upsertJob(raw));

    const jobsWithEmail = [];
    for (const r of saved) {
      if (!r || r.error || !r.job) continue;
      if (r.isNew) summary.newJobs++;
      if (r.job.recruiterEmail) {
        summary.withEmail++;
        if (!r.job.emailSent) jobsWithEmail.push(r.job);
      }
      if (r.job.recruiterPhone) summary.withPhone++;
    }

    // Auto-send outreach emails for jobs that have a recruiter email
    if (autoSend && jobsWithEmail.length) {
      const sendResults = await runPool(jobsWithEmail, 3, async (job) =>
        sendOutreachEmail(job)
      );
      summary.emailsSent = sendResults.filter((s) => s && s.sent).length;
    }

    state.lastSummary = summary;
    return summary;
  } catch (err) {
    console.error('[searchRunner] run failed:', err.message);
    state.error = err.message;
    throw err;
  } finally {
    state.running = false;
    state.finishedAt = new Date();
  }
}

module.exports = { runSearch, getState };
