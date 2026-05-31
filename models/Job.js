const mongoose = require('mongoose');

/**
 * Job schema
 * Stores a single scraped job listing along with any recruiter contact
 * details detected from the job description and its application status.
 */
const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    company: { type: String, default: 'Unknown', trim: true },
    location: { type: String, default: '', trim: true },
    description: { type: String, default: '' },
    postingDate: { type: String, default: '' },
    url: { type: String, default: '', trim: true },
    source: { type: String, default: '', trim: true }, // LinkedIn / Indeed / Naukri / Internshala / Google

    // Recruiter / HR contact details parsed from the description
    recruiterName: { type: String, default: '' },
    recruiterEmail: { type: String, default: '' },
    recruiterPhone: { type: String, default: '' },

    // Application lifecycle
    // applied      -> outreach email has been sent
    // pending      -> a recruiter email exists but no email sent yet (manual send available)
    // no_contact   -> no recruiter email detected
    status: {
      type: String,
      enum: ['applied', 'pending', 'no_contact'],
      default: 'no_contact',
    },

    emailSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Prevent storing duplicate listings (same URL, or same title+company when no URL)
jobSchema.index({ url: 1 }, { unique: false });
jobSchema.index({ title: 1, company: 1, location: 1 });

module.exports = mongoose.model('Job', jobSchema);
