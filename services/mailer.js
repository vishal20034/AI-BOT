/**
 * Email service.
 *
 * Builds a personalised outreach email for a job listing and sends it via
 * Nodemailer using the Brevo SMTP relay. The current resume PDF is attached to
 * every message. A SentEmail record is written so the same recruiter is never
 * emailed twice for the same job.
 */

const nodemailer = require('nodemailer');
const { CANDIDATE } = require('../config/constants');
const { getCurrentResume } = require('./resume');
const SentEmail = require('../models/SentEmail');
const Job = require('../models/Job');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: false, // STARTTLS on 587
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return transporter;
}

// Verify SMTP connectivity at startup (non-fatal if it fails).
async function verifyTransport() {
  try {
    await getTransporter().verify();
    console.log('[mailer] Brevo SMTP connection verified.');
    return true;
  } catch (err) {
    console.warn(`[mailer] SMTP verify failed (emails may not send): ${err.message}`);
    return false;
  }
}

/** Build the subject + plain text + HTML body for a job. */
function buildEmailContent(job) {
  const recruiterName = job.recruiterName && job.recruiterName.trim()
    ? job.recruiterName.trim()
    : 'Hiring Team';
  const company = job.company && job.company !== 'Unknown' ? job.company : 'your organisation';
  const role = job.title || 'the open role';

  const subject = `Application for ${role}${
    job.company && job.company !== 'Unknown' ? ` at ${job.company}` : ''
  } - ${CANDIDATE.name}`;

  const text = `Dear ${recruiterName},

I hope you are doing well. My name is ${CANDIDATE.name}, and I am writing to express my strong interest in the ${role} position${
    job.company && job.company !== 'Unknown' ? ` at ${company}` : ''
  }.

As a motivated ${CANDIDATE.experience} candidate focused on DevOps and Cloud engineering, I have hands-on exposure to AWS, Linux administration, CI/CD pipelines, and infrastructure automation. I am eager to contribute to your team and grow within a fast-paced environment.

I have attached my resume for your review. I would welcome the opportunity to discuss how my skills align with your requirements.

Thank you for your time and consideration.

Best regards,
${CANDIDATE.name}
Phone: ${CANDIDATE.phone}
Email: ${CANDIDATE.email}
LinkedIn: ${CANDIDATE.linkedin}`;

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a;">
  <p>Dear ${recruiterName},</p>
  <p>I hope you are doing well. My name is <strong>${CANDIDATE.name}</strong>, and I am writing to express my strong interest in the <strong>${role}</strong> position${
    job.company && job.company !== 'Unknown' ? ` at <strong>${company}</strong>` : ''
  }.</p>
  <p>As a motivated <strong>${CANDIDATE.experience}</strong> candidate focused on DevOps and Cloud engineering, I have hands-on exposure to AWS, Linux administration, CI/CD pipelines, and infrastructure automation. I am eager to contribute to your team and grow within a fast-paced environment.</p>
  <p>I have attached my resume for your review. I would welcome the opportunity to discuss how my skills align with your requirements.</p>
  <p>Thank you for your time and consideration.</p>
  <p>Best regards,<br/>
  <strong>${CANDIDATE.name}</strong><br/>
  Phone: ${CANDIDATE.phone}<br/>
  Email: <a href="mailto:${CANDIDATE.email}">${CANDIDATE.email}</a><br/>
  LinkedIn: <a href="${CANDIDATE.linkedin}">${CANDIDATE.linkedin}</a></p>
</div>`;

  return { subject, text, html };
}

/**
 * Send an outreach email for a job to its detected recruiter email.
 * Skips automatically if no recruiter email exists or if the same recruiter
 * was already contacted for this job.
 *
 * @param {Object} job  A Mongoose Job document (or plain object with _id)
 * @returns {Promise<{ sent: boolean, reason?: string, sentEmail?: Object }>}
 */
async function sendOutreachEmail(job) {
  if (!job || !job.recruiterEmail) {
    return { sent: false, reason: 'no_recruiter_email' };
  }

  const recruiterEmail = job.recruiterEmail.toLowerCase().trim();

  // Duplicate guard (also enforced by the unique index on SentEmail)
  const existing = await SentEmail.findOne({ jobId: job._id, recruiterEmail });
  if (existing) {
    return { sent: false, reason: 'already_sent' };
  }

  const resume = getCurrentResume();
  if (!resume) {
    return { sent: false, reason: 'no_resume_uploaded' };
  }

  const { subject, text, html } = buildEmailContent(job);

  const mailOptions = {
    from: `"${CANDIDATE.name}" <${process.env.EMAIL_FROM || CANDIDATE.email}>`,
    to: recruiterEmail,
    replyTo: CANDIDATE.email,
    subject,
    text,
    html,
    attachments: [
      {
        filename: resume.filename,
        path: resume.path,
        contentType: 'application/pdf',
      },
    ],
  };

  try {
    await getTransporter().sendMail(mailOptions);
  } catch (err) {
    console.warn(`[mailer] Failed to send to ${recruiterEmail}: ${err.message}`);
    return { sent: false, reason: `smtp_error: ${err.message}` };
  }

  // Persist the sent record (unique index prevents duplicates under races)
  let sentEmail;
  try {
    sentEmail = await SentEmail.create({
      jobId: job._id,
      recruiterName: job.recruiterName || '',
      recruiterEmail,
      jobTitle: job.title || '',
      company: job.company || '',
      subject,
      body: text,
      resumeFile: resume.filename,
      sentAt: new Date(),
    });
  } catch (err) {
    if (err.code === 11000) {
      return { sent: false, reason: 'already_sent' };
    }
    throw err;
  }

  // Mark the job as applied
  await Job.findByIdAndUpdate(job._id, { status: 'applied', emailSent: true });

  return { sent: true, sentEmail };
}

module.exports = {
  getTransporter,
  verifyTransport,
  buildEmailContent,
  sendOutreachEmail,
};
