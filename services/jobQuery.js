/**
 * Shared job querying helpers used by both the dashboard render and the JSON
 * API: dashboard statistics, filter building and filtered listing.
 */

const Job = require('../models/Job');
const SentEmail = require('../models/SentEmail');

/** Aggregate the four dashboard stat cards. */
async function getStats() {
  const [totalJobs, totalEmails, totalRecruitersWithPhone, totalPending] = await Promise.all([
    Job.countDocuments({}),
    SentEmail.countDocuments({}),
    Job.countDocuments({ recruiterPhone: { $nin: ['', null] } }),
    Job.countDocuments({ status: 'pending' }),
  ]);
  return { totalJobs, totalEmails, totalRecruitersWithPhone, totalPending };
}

/** Build a Mongo filter object from request query params. */
function buildFilter(query = {}) {
  const filter = {};

  if (query.keyword && query.keyword.trim()) {
    filter.title = { $regex: query.keyword.trim(), $options: 'i' };
  }

  if (query.location && query.location.trim() && query.location !== 'all') {
    filter.location = { $regex: query.location.trim(), $options: 'i' };
  }

  if (query.status && ['applied', 'pending', 'no_contact'].includes(query.status)) {
    filter.status = query.status;
  }

  // Toggle: only jobs where a recruiter contact (email or phone) was found
  if (query.contactOnly === 'true' || query.contactOnly === '1' || query.contactOnly === 'on') {
    filter.$or = [
      { recruiterEmail: { $nin: ['', null] } },
      { recruiterPhone: { $nin: ['', null] } },
    ];
  }

  return filter;
}

/** Return filtered jobs (newest first). */
async function listJobs(query = {}, limit = 500) {
  const filter = buildFilter(query);
  return Job.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
}

module.exports = { getStats, buildFilter, listJobs };
