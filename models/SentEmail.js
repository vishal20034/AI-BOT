const mongoose = require('mongoose');

/**
 * SentEmail schema
 * One document per outreach email successfully sent. The combination of
 * recruiterEmail + jobId is unique so the same recruiter is never contacted
 * twice for the same job listing.
 */
const sentEmailSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Job',
      required: true,
    },
    recruiterName: { type: String, default: '' },
    recruiterEmail: { type: String, required: true, lowercase: true, trim: true },
    jobTitle: { type: String, default: '' },
    company: { type: String, default: '' },
    subject: { type: String, default: '' },
    body: { type: String, default: '' },
    resumeFile: { type: String, default: '' },
    sentAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Guarantee a recruiter email is contacted only once per job
sentEmailSchema.index({ jobId: 1, recruiterEmail: 1 }, { unique: true });

module.exports = mongoose.model('SentEmail', sentEmailSchema);
