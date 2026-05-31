/**
 * Job scraping service.
 *
 * Uses Axios + Cheerio to pull fresher / entry-level job listings from
 * multiple sources. Every source parser is wrapped in its own try/catch so a
 * single failing source never breaks the whole run, and all sources are run
 * concurrently so the request stays responsive.
 *
 * NOTE: Public job boards aggressively rate-limit and change their markup.
 * Each parser is written defensively and simply returns an empty array when a
 * site blocks the request or its layout changes.
 */

const axios = require('axios');
const cheerio = require('cheerio');
const { JOB_TITLES, REQUEST_HEADERS } = require('../config/constants');
const { detectCompany } = require('./recruiterParser');

const HTTP_TIMEOUT = 15000;

// Hiring signals used to recognise LinkedIn posts that advertise openings.
const HIRING_KEYWORDS = [
  'hiring',
  'we are hiring',
  "we're hiring",
  'looking for',
  'job opening',
  'opportunity',
  'fresher',
  '0-1 year',
  '0 to 1 year',
  'entry level',
  'immediate joiner',
  'urgent requirement',
  'now hiring',
  'apply now',
];

// Small helper: GET a URL with browser-like headers and a timeout.
async function fetchHtml(url, extraHeaders = {}) {
  const res = await axios.get(url, {
    headers: { ...REQUEST_HEADERS, ...extraHeaders },
    timeout: HTTP_TIMEOUT,
    // Treat 4xx as resolved so we can decide per-source instead of throwing
    validateStatus: (s) => s >= 200 && s < 500,
  });
  return res;
}

function clean(text = '') {
  return String(text).replace(/\s+/g, ' ').trim();
}

/* ----------------------------- LinkedIn ----------------------------- */
// LinkedIn exposes a guest "see more job postings" endpoint that returns
// server-rendered job cards (no login needed). f_E=1,2 => internship + entry.
async function scrapeLinkedIn(keyword, location) {
  const jobs = [];
  try {
    const loc = location && location.toLowerCase() !== 'remote' ? location : 'India';
    const url =
      'https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search' +
      `?keywords=${encodeURIComponent(keyword)}` +
      `&location=${encodeURIComponent(loc)}` +
      '&f_E=1%2C2&start=0';

    const res = await fetchHtml(url);
    if (res.status !== 200 || typeof res.data !== 'string') return jobs;

    const $ = cheerio.load(res.data);
    $('li').each((_, el) => {
      const card = $(el);
      const title = clean(card.find('.base-search-card__title').text());
      if (!title) return;
      const company = clean(card.find('.base-search-card__subtitle').text());
      const place = clean(card.find('.job-search-card__location').text());
      const link =
        card.find('a.base-card__full-link').attr('href') ||
        card.find('a').attr('href') ||
        '';
      const date = clean(card.find('time').attr('datetime') || card.find('time').text());
      jobs.push({
        title,
        company: company || 'Unknown',
        location: place || loc,
        description: '',
        postingDate: date,
        url: clean(link).split('?')[0],
        source: 'LinkedIn Jobs',
      });
    });
  } catch (err) {
    console.warn(`[scraper] LinkedIn "${keyword}" failed: ${err.message}`);
  }
  return jobs;
}

// Fetch the full description for a LinkedIn job so recruiter contacts can be
// parsed out of it. Best-effort only.
async function fetchLinkedInDescription(jobUrl) {
  try {
    const match = jobUrl.match(/(\d+)(?:\/?)$/);
    const jobId = match ? match[1] : null;
    if (!jobId) return '';
    const url = `https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${jobId}`;
    const res = await fetchHtml(url);
    if (res.status !== 200 || typeof res.data !== 'string') return '';
    const $ = cheerio.load(res.data);
    return clean(
      $('.show-more-less-html__markup').text() || $('.description__text').text()
    );
  } catch (err) {
    return '';
  }
}

/* --------------------------- LinkedIn Posts ------------------------- */
// Beyond the Jobs section, recruiters frequently advertise openings as feed
// POSTS ("We are hiring a DevOps Engineer…"). Those posts (and the banner /
// pamphlet images attached to them) live behind auth and heavy JS, so we
// discover public post URLs via a Google site-search, then fetch each public
// post page and parse its visible text + image alt text.
//
// NOTE on image pamphlets: true pixel-level OCR is out of scope (no OCR
// dependency is bundled). We DO read each image's `alt` text plus the post's
// og:description / commentary, which captures the wording of the vast majority
// of "we are hiring" banner posts that also include text.

function textHasHiringSignal(text) {
  const lower = (text || '').toLowerCase();
  return HIRING_KEYWORDS.some((k) => lower.includes(k));
}

function textMatchesTitle(text, title) {
  const lower = (text || '').toLowerCase();
  const t = title.toLowerCase();
  if (lower.includes(t)) return true;
  // Partial match: at least half of the title's significant words appear.
  const words = t.split(/\s+/).filter((w) => w.length > 2);
  if (!words.length) return false;
  let hits = 0;
  for (const w of words) if (lower.includes(w)) hits += 1;
  return hits >= Math.ceil(words.length / 2);
}

// Fetch a single public LinkedIn post page and extract its text content,
// including image alt text from any banner / pamphlet images.
async function fetchLinkedInPostText(postUrl) {
  try {
    const res = await fetchHtml(postUrl);
    if (res.status !== 200 || typeof res.data !== 'string') return '';
    const $ = cheerio.load(res.data);
    const parts = [];

    const ogDesc =
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content');
    if (ogDesc) parts.push(ogDesc);

    const ogTitle = $('meta[property="og:title"]').attr('content');
    if (ogTitle) parts.push(ogTitle);

    // Banner / pamphlet image alt text
    $('img').each((_, el) => {
      const alt = $(el).attr('alt');
      if (alt && alt.trim().length > 8) parts.push(alt.trim());
    });

    // Visible commentary text available to logged-out viewers
    const body = clean(
      $(
        '.attributed-text-segment-list__content, .feed-shared-update-v2__description, .break-words, article, .core-rail'
      ).text()
    );
    if (body) parts.push(body);

    return clean(parts.join(' '));
  } catch (err) {
    return '';
  }
}

// Discover + parse LinkedIn posts for one job title.
async function scrapeLinkedInPosts(keyword, location) {
  const posts = [];
  try {
    const locPart =
      location && location.toLowerCase() !== 'remote' ? ` ${location}` : '';
    const q =
      `site:linkedin.com/posts "${keyword}" ` +
      '(hiring OR "we are hiring" OR "looking for" OR "job opening" OR ' +
      'opportunity OR fresher OR "entry level" OR "0-1 year")' +
      locPart;
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`;

    const res = await fetchHtml(url, { 'Accept-Language': 'en-US,en;q=0.9' });
    if (res.status !== 200 || typeof res.data !== 'string') return posts;

    const $ = cheerio.load(res.data);
    const discovered = [];
    const seen = new Set();
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/url\?q=([^&]+)/);
      if (!m) return;
      const target = decodeURIComponent(m[1]).split('&')[0];
      if (!/linkedin\.com\/posts\//.test(target)) return;
      if (seen.has(target)) return;
      seen.add(target);
      // Capture the surrounding Google snippet as a fallback text source.
      const snippet = clean($(el).closest('div').text());
      discovered.push({ url: target, snippet });
    });

    // Fetch a capped number of post pages concurrently to stay responsive.
    const slice = discovered.slice(0, 10);
    await Promise.allSettled(
      slice.map(async (d) => {
        let text = await fetchLinkedInPostText(d.url);
        if (!text && d.snippet) text = d.snippet;
        else if (d.snippet) text = `${text} ${d.snippet}`;
        text = clean(text);
        if (!text) return;

        // Must read like a hiring post AND mention this target title.
        if (!textHasHiringSignal(text) || !textMatchesTitle(text, keyword)) return;

        const company = detectCompany(text);
        posts.push({
          title: keyword,
          company: company || 'Unknown',
          location: location || '',
          description: text,
          postingDate: '',
          url: d.url,
          source: 'LinkedIn Post',
        });
      })
    );
  } catch (err) {
    console.warn(`[scraper] LinkedIn Posts "${keyword}" failed: ${err.message}`);
  }
  return posts;
}


/* ------------------------------ Naukri ------------------------------ */
// Naukri exposes a JSON search API used by its own frontend.
async function scrapeNaukri(keyword, location) {
  const jobs = [];
  try {
    const kw = keyword.toLowerCase().replace(/\s+/g, '-');
    const url =
      'https://www.naukri.com/jobapi/v3/search' +
      `?noOfResults=20&urlType=search_by_keyword&searchType=adv&keyword=${encodeURIComponent(
        keyword
      )}&experience=0&k=${encodeURIComponent(keyword)}` +
      (location && location.toLowerCase() !== 'remote'
        ? `&location=${encodeURIComponent(location)}`
        : '');

    const res = await fetchHtml(url, {
      appid: '109',
      systemid: 'Naukri',
      Accept: 'application/json',
      Referer: `https://www.naukri.com/${kw}-jobs`,
    });
    if (res.status !== 200 || !res.data || !res.data.jobDetails) return jobs;

    for (const j of res.data.jobDetails) {
      const title = clean(j.title);
      if (!title) continue;
      const placeholders = (j.placeholders || [])
        .map((p) => clean(p.label))
        .filter(Boolean);
      jobs.push({
        title,
        company: clean(j.companyName) || 'Unknown',
        location: placeholders.find((p) => /[a-z]/i.test(p)) || location || '',
        description: clean(j.jobDescription || ''),
        postingDate: clean(j.footerPlaceholderLabel || j.createdDate || ''),
        url: j.jdURL
          ? j.jdURL.startsWith('http')
            ? j.jdURL
            : `https://www.naukri.com${j.jdURL}`
          : '',
        source: 'Naukri',
      });
    }
  } catch (err) {
    console.warn(`[scraper] Naukri "${keyword}" failed: ${err.message}`);
  }
  return jobs;
}

/* ---------------------------- Internshala --------------------------- */
async function scrapeInternshala(keyword, location) {
  const jobs = [];
  try {
    const kw = keyword.toLowerCase().replace(/\s+/g, '-');
    const url = `https://internshala.com/jobs/${encodeURIComponent(kw)}-jobs/`;
    const res = await fetchHtml(url);
    if (res.status !== 200 || typeof res.data !== 'string') return jobs;

    const $ = cheerio.load(res.data);
    $('.individual_internship, .internship_meta').each((_, el) => {
      const card = $(el);
      const title = clean(
        card.find('.job-internship-name, .profile').first().text()
      );
      if (!title) return;
      const company = clean(card.find('.company-name, .company_name').first().text());
      const place = clean(card.find('.locations, .location_link').first().text());
      const rel = card.find('a.job-title-href, a.view_detail_button').attr('href') || '';
      jobs.push({
        title,
        company: company || 'Unknown',
        location: place || location || '',
        description: clean(card.find('.job_description, .text-container').text()),
        postingDate: clean(card.find('.status-success, .posted_by_container').text()),
        url: rel ? (rel.startsWith('http') ? rel : `https://internshala.com${rel}`) : '',
        source: 'Internshala',
      });
    });
  } catch (err) {
    console.warn(`[scraper] Internshala "${keyword}" failed: ${err.message}`);
  }
  return jobs;
}

/* ------------------------------ Indeed ------------------------------ */
// Indeed frequently blocks server-side scraping (Cloudflare). Best-effort.
async function scrapeIndeed(keyword, location) {
  const jobs = [];
  try {
    const loc = location && location.toLowerCase() !== 'remote' ? location : '';
    const url =
      'https://www.indeed.com/jobs' +
      `?q=${encodeURIComponent(keyword + ' fresher')}` +
      (loc ? `&l=${encodeURIComponent(loc)}` : '') +
      '&fromage=14';
    const res = await fetchHtml(url);
    if (res.status !== 200 || typeof res.data !== 'string') return jobs;

    const $ = cheerio.load(res.data);
    $('div.job_seen_beacon, a.tapItem').each((_, el) => {
      const card = $(el);
      const title = clean(card.find('h2.jobTitle span').first().text());
      if (!title) return;
      const company = clean(card.find('span.companyName, [data-testid="company-name"]').text());
      const place = clean(card.find('div.companyLocation, [data-testid="text-location"]').text());
      const rel = card.find('h2.jobTitle a').attr('href') || card.attr('href') || '';
      jobs.push({
        title,
        company: company || 'Unknown',
        location: place || loc,
        description: clean(card.find('div.job-snippet').text()),
        postingDate: clean(card.find('span.date').text()),
        url: rel ? (rel.startsWith('http') ? rel : `https://www.indeed.com${rel}`) : '',
        source: 'Indeed',
      });
    });
  } catch (err) {
    console.warn(`[scraper] Indeed "${keyword}" failed: ${err.message}`);
  }
  return jobs;
}

/* --------------------------- Google Jobs ---------------------------- */
// Plain Google results page scrape (best-effort; Google often returns a
// consent / JS page to bots).
async function scrapeGoogle(keyword, location) {
  const jobs = [];
  try {
    const q = `${keyword} fresher jobs ${location || 'India'}`;
    const url = `https://www.google.com/search?q=${encodeURIComponent(q)}&num=20`;
    const res = await fetchHtml(url, { 'Accept-Language': 'en-US,en;q=0.9' });
    if (res.status !== 200 || typeof res.data !== 'string') return jobs;

    const $ = cheerio.load(res.data);
    $('a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/\/url\?q=([^&]+)/);
      if (!m) return;
      const target = decodeURIComponent(m[1]);
      if (!/linkedin\.com\/jobs|naukri\.com|indeed\.com|internshala\.com/.test(target)) return;
      const title = clean($(el).find('h3').text());
      if (!title) return;
      jobs.push({
        title,
        company: 'Unknown',
        location: location || '',
        description: '',
        postingDate: '',
        url: target.split('&')[0],
        source: 'Google',
      });
    });
  } catch (err) {
    console.warn(`[scraper] Google "${keyword}" failed: ${err.message}`);
  }
  return jobs;
}

/* --------------------------- Orchestration -------------------------- */

// De-duplicate by URL, falling back to title+company when URL is missing.
function dedupe(jobs) {
  const seen = new Set();
  const out = [];
  for (const j of jobs) {
    const key = (j.url && j.url.length > 5
      ? j.url
      : `${j.title}|${j.company}|${j.location}`
    ).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(j);
  }
  return out;
}

/**
 * Scrape every source for the requested titles concurrently.
 *
 * @param {Object} opts
 * @param {string[]} [opts.titles]   Job titles to search (defaults to all)
 * @param {string}   [opts.location] Location filter
 * @param {boolean}  [opts.enrich]   Fetch LinkedIn descriptions (default true)
 * @returns {Promise<Array>} de-duplicated raw job objects
 */
async function scrapeAllJobs(opts = {}) {
  const titles = Array.isArray(opts.titles) && opts.titles.length ? opts.titles : JOB_TITLES;
  const location = opts.location || '';
  const enrich = opts.enrich !== false;

  // Build one task per (title x source). All run concurrently.
  const tasks = [];
  for (const title of titles) {
    tasks.push(scrapeLinkedIn(title, location));
    tasks.push(scrapeLinkedInPosts(title, location));
    tasks.push(scrapeNaukri(title, location));
    tasks.push(scrapeInternshala(title, location));
    tasks.push(scrapeIndeed(title, location));
    tasks.push(scrapeGoogle(title, location));
  }

  const results = await Promise.allSettled(tasks);
  let jobs = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && Array.isArray(r.value)) jobs = jobs.concat(r.value);
  }

  jobs = dedupe(jobs);

  // Best-effort enrichment of LinkedIn Jobs that have no description yet so
  // the recruiter-contact regex has something to work with. (LinkedIn Posts
  // already carry their text, so they are not enriched here.)
  if (enrich) {
    const toEnrich = jobs
      .filter((j) => j.source === 'LinkedIn Jobs' && !j.description && j.url)
      .slice(0, 25); // cap to keep things responsive
    await Promise.allSettled(
      toEnrich.map(async (j) => {
        j.description = await fetchLinkedInDescription(j.url);
      })
    );
  }

  return jobs;
}

module.exports = {
  scrapeAllJobs,
  scrapeLinkedIn,
  scrapeLinkedInPosts,
  scrapeNaukri,
  scrapeInternshala,
  scrapeIndeed,
  scrapeGoogle,
  fetchLinkedInDescription,
  fetchLinkedInPostText,
};
