/**
 * Email routes (mounted at /email)
 *  POST /email/send/:jobId  - manually trigger an outreach email for one job
 *  GET  /email/history      - render the application history page
 */

const express = require('express');
const router = express.Router();

const Job = require('../models/Job');
const SentEmail = require('../models/SentEmail');
const { sendOutreachEmail } = require('../services/mailer');
const { getCurrentResume } = require('../services/resume');

// Manual send for jobs where the automatic send did not fire.
router.post('/send/:jobId', async (req, res) => {
  try {
    const job = await Job.findById(req.params.jobId);
    if (!job) return res.status(404).json({ ok: false, error: 'Job not found' });

    if (!job.recruiterEmail) {
      return res.json({ ok: false, error: 'No recruiter email detected for this job.' });
    }

    const result = await sendOutreachEmail(job);
    if (result.sent) {
      return res.json({ ok: true, message: `Email sent to ${job.recruiterEmail}` });
    }

    const reasons = {
      already_sent: 'This recruiter was already contacted for this job.',
      no_resume_uploaded: 'No resume uploaded yet. Please upload your resume first.',
      no_recruiter_email: 'No recruiter email detected for this job.',
    };
    return res.json({
      ok: false,
      error: reasons[result.reason] || `Could not send email (${result.reason}).`,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Application history page
router.get('/history', async (req, res) => {
  try {
    const emails = await SentEmail.find({}).sort({ sentAt: -1 }).lean();
    const resume = getCurrentResume();
    res.render('history', {
      title: 'Application History',
      active: 'history',
      emails,
      resume,
    });
  } catch (err) {
    res.status(500).send(`Error loading history: ${err.message}`);
  }
});

module.exports = router;
