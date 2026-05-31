/**
 * Central configuration: target job titles, location options, experience
 * filters and the candidate's hard-coded default details.
 */

// Target job titles to search for (fresher / entry-level focused)
const JOB_TITLES = [
  'DevOps Engineer',
  'AWS Cloud Engineer',
  'Cloud Support Engineer',
  'Cloud Operations Engineer',
  'Junior SRE',
  'Infrastructure Engineer',
  'Linux System Administrator',
  'Build and Release Engineer',
  'Junior Platform Engineer',
  'DevOps Associate',
  'Cloud Administrator',
  'Technical Support Engineer Cloud',
  'AWS Operations Engineer',
  'Cloud DevOps Engineer',
  'Junior System Engineer',
];

// Location filter options exposed in the UI
const LOCATIONS = ['Remote', 'Bangalore', 'Hyderabad', 'Pune', 'Mumbai', 'Delhi'];

// Keywords appended to every query so results stay fresher / entry-level
const EXPERIENCE_KEYWORDS = ['fresher', 'entry level', '0-1 year'];

// Candidate defaults (also overridable via .env)
const CANDIDATE = {
  name: process.env.CANDIDATE_NAME || 'Bishal Nag',
  email: process.env.CANDIDATE_EMAIL || 'nagbishal07@gmail.com',
  phone: process.env.CANDIDATE_PHONE || '7863992542',
  linkedin: process.env.CANDIDATE_LINKEDIN || 'https://www.linkedin.com/in/bishalnag',
  experience: process.env.CANDIDATE_EXPERIENCE || 'Fresher to 1 year',
};

// Browser-like headers used for all scraping requests to reduce blocking
const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

module.exports = {
  JOB_TITLES,
  LOCATIONS,
  EXPERIENCE_KEYWORDS,
  CANDIDATE,
  REQUEST_HEADERS,
};
