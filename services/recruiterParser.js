/**
 * Recruiter / HR contact detection.
 *
 * Given a block of free text (typically a job description) this module uses
 * regular expressions to pull out the first email address, phone/mobile number
 * and a likely recruiter or HR contact name.
 */

// Email: standard local@domain.tld
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Indian / international phone numbers: optional +country, 10-13 digits,
// allowing spaces / dashes. Anchored to avoid grabbing random long numbers.
const PHONE_RE =
  /(?:(?:\+?\d{1,3}[\s-]?)?(?:\(?\d{2,5}\)?[\s-]?)?\d{3,5}[\s-]?\d{3,5})/g;

// Name following a recruiter/HR label, e.g. "Contact: Priya Sharma" or
// "HR - Rahul Verma" or "Recruiter Name: John Doe".
const NAME_LABEL_RE =
  /(?:recruiter|hr|h\.r\.|hiring manager|talent acquisition|ta|contact person|contact|spoc|poc)\s*(?:name)?\s*[:\-–]\s*([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,2})/i;

// Company-name patterns commonly seen in hiring posts / job descriptions, e.g.
// "Company Name: Acme", "We at Acme Corp are hiring", "join Acme Solutions",
// "Acme Technologies is hiring".
const COMPANY_LABEL_RE =
  /(?:company\s*name|company|organization|organisation|employer)\s*[:\-–]\s*([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})/i;
const COMPANY_AT_RE =
  /\b(?:we\s+at|here\s+at|join|at)\s+([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})\s+(?:is|are|we|hiring|as|team)\b/;
const COMPANY_IS_HIRING_RE =
  /\b([A-Z][A-Za-z0-9&.\-]+(?:\s+[A-Z][A-Za-z0-9&.\-]+){0,3})\s+is\s+(?:hiring|looking|seeking)\b/;

// Words that should never be treated as a company name on their own.
const COMPANY_STOPWORDS = /^(?:we|the|our|a|an|is|are|hiring|looking|seeking|team|join|currently|now|immediate)$/i;

// Domains we never treat as a recruiter email (job boards, no-reply, etc.)
const BLOCKED_EMAIL_PARTS = [
  'noreply',
  'no-reply',
  'donotreply',
  'example.com',
  'sentry.io',
  'wixpress.com',
  'linkedin.com',
  'indeed.com',
  'naukri.com',
  'internshala.com',
  'google.com',
];

function isUsableEmail(email) {
  const lower = email.toLowerCase();
  return !BLOCKED_EMAIL_PARTS.some((part) => lower.includes(part));
}

// Normalise a candidate phone string and validate digit length (10-13).
function normalisePhone(raw) {
  const digits = raw.replace(/[^\d+]/g, '');
  const justDigits = digits.replace(/\D/g, '');
  if (justDigits.length < 10 || justDigits.length > 13) return '';
  return digits;
}

/**
 * Detect a likely company name in a block of text.
 * @param {string} text
 * @returns {string}
 */
function detectCompany(text = '') {
  if (!text || typeof text !== 'string') return '';
  for (const re of [COMPANY_LABEL_RE, COMPANY_AT_RE, COMPANY_IS_HIRING_RE]) {
    const m = text.match(re);
    if (m && m[1]) {
      const company = m[1].trim().replace(/\s+/g, ' ').replace(/[.,]$/, '');
      if (company.length >= 2 && !COMPANY_STOPWORDS.test(company)) {
        return company;
      }
    }
  }
  return '';
}

/**
 * Detect recruiter contact details in a piece of text.
 * @param {string} text
 * @returns {{ name: string, email: string, phone: string, company: string }}
 */
function detectContacts(text = '') {
  const result = { name: '', email: '', phone: '', company: '' };
  if (!text || typeof text !== 'string') return result;

  // ---- Email ----
  const emails = (text.match(EMAIL_RE) || []).filter(isUsableEmail);
  if (emails.length) result.email = emails[0].toLowerCase();

  // ---- Phone ----
  const phoneCandidates = text.match(PHONE_RE) || [];
  for (const cand of phoneCandidates) {
    const normalised = normalisePhone(cand);
    if (normalised) {
      result.phone = normalised;
      break;
    }
  }

  // ---- Name ----
  const nameMatch = text.match(NAME_LABEL_RE);
  if (nameMatch && nameMatch[1]) {
    result.name = nameMatch[1].trim();
  } else if (result.email) {
    // Fall back to a readable name derived from the email local-part
    const local = result.email.split('@')[0].replace(/[._\d]+/g, ' ').trim();
    if (local && /^[a-zA-Z ]{3,}$/.test(local)) {
      result.name = local
        .split(' ')
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    }
  }

  // ---- Company ----
  result.company = detectCompany(text);

  return result;
}

module.exports = { detectContacts, detectCompany, isUsableEmail, normalisePhone };
