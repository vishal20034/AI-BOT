# AI-BOT — Automated Fresher Job Search & Recruiter Outreach

A simple Node.js + Express web app that scrapes fresher / entry-level (0–1 year)
job listings from multiple job boards, detects recruiter contact details,
automatically emails recruiters your resume, and tracks everything on a clean
dark-themed dashboard.

No Docker. No Kubernetes. No build step. Just `node server.js`.

---

## What you need before running (only two things)

1. **Install Node.js** — download the LTS version from
   [https://nodejs.org](https://nodejs.org) and install it. This gives you
   both `node` and `npm`.
2. **Install the project dependencies** — from the project folder run:

   ```bash
   npm install
   ```

That's it. Everything else (MongoDB connection, SMTP credentials, your personal
details) is already filled in inside the `.env` file.

---

## Run it

```bash
node server.js
```

Then open your browser at:

```
http://localhost:5000
```

---

## How to use

1. **Upload your resume** — go to the **Resume** page and upload your resume as a
   PDF. It is stored in the local `/uploads` folder and automatically attached
   to every outreach email. The page always shows the currently uploaded file.
2. **Search jobs** — on the **Dashboard**, optionally pick a location
   (Remote / Bangalore / Hyderabad / Pune / Mumbai / Delhi) and click
   **Search Jobs**. The app scrapes LinkedIn, Naukri, Indeed, Internshala and
   Google for all your target job titles (restricted to fresher / entry-level).
   Scraping runs in the background so the UI never freezes.
3. **Automatic outreach** — whenever a recruiter email is detected in a job
   description, a personalised email (with your resume attached) is sent
   automatically from your address via Brevo SMTP. The same recruiter is never
   emailed twice for the same job.
4. **Manual send** — for jobs where auto-send did not fire, use the
   **Send Email** button in the jobs table.
5. **Track everything** — the dashboard shows live stat cards and a filterable,
   searchable jobs table. The **History** page lists every email sent with the
   full email body.

---

## Features

- **Resume upload** (PDF) stored locally and attached to all emails.
- **Multi-source scraping** with Axios + Cheerio: LinkedIn, Indeed, Naukri,
  Internshala, Google — all run asynchronously.
- **Recruiter contact detection** via regex: name, email, phone.
- **Automated personalised emails** through Nodemailer + Brevo SMTP, with a
  duplicate guard so no recruiter is contacted twice for the same job.
- **Dark-themed dashboard** with four stat cards (total jobs, emails sent,
  recruiters with phone, pending applications) and a filterable jobs table
  (keyword, location, status, "only with recruiter contact" toggle).
- **Application history** page with full sent-email details.
- **MongoDB persistence** — all data survives restarts.

---

## Target job titles

DevOps Engineer · AWS Cloud Engineer · Cloud Support Engineer · Cloud Operations
Engineer · Junior SRE · Infrastructure Engineer · Linux System Administrator ·
Build and Release Engineer · Junior Platform Engineer · DevOps Associate · Cloud
Administrator · Technical Support Engineer Cloud · AWS Operations Engineer ·
Cloud DevOps Engineer · Junior System Engineer

(Edit the list in `config/constants.js` any time.)

---

## Project structure

```
AI-BOT/
├── server.js              # Main entry point (node server.js)
├── .env                   # Credentials & config (already filled in)
├── package.json
├── config/
│   └── constants.js       # Job titles, locations, candidate defaults
├── models/
│   ├── Job.js             # Mongoose schema for scraped jobs
│   └── SentEmail.js       # Mongoose schema for sent emails (dedupe index)
├── routes/
│   ├── jobs.js            # Search + stats + list APIs
│   ├── email.js           # Manual send + history page
│   └── upload.js          # Resume upload
├── services/
│   ├── scraper.js         # Axios + Cheerio scrapers per source
│   ├── recruiterParser.js # Regex contact detection
│   ├── mailer.js          # Nodemailer + Brevo email sending
│   ├── resume.js          # Current-resume helper
│   ├── searchRunner.js    # Orchestrates scrape -> save -> email
│   └── jobQuery.js        # Stats & filtering helpers
├── views/                 # EJS templates (dashboard, upload, history, ...)
├── public/                # CSS + client-side JS
└── uploads/               # Uploaded resume PDF lives here
```

---

## Notes on scraping

Public job boards (LinkedIn, Indeed, Naukri, Internshala, Google) actively
rate-limit and frequently change their markup, and some block server-side
requests outright. Each scraper is written defensively: if a site blocks a
request or changes its layout, that source simply returns no results for that
run instead of crashing the app. The LinkedIn guest endpoint and the Naukri
search API are usually the most reliable. Results will vary by network and time.

---

## SECURITY NOTE — please read

For a true clone-and-run experience, real credentials are committed in the
`.env` file (MongoDB connection string and Brevo SMTP password). This is
convenient but **not** a security best practice:

- Anyone who can see this repository can see those secrets.
- If this repo is or becomes **public**, treat these credentials as compromised
  and **rotate them immediately** (change the MongoDB DB user password and
  regenerate the Brevo SMTP key).
- Recommended: keep the repository **private**, and for real production use move
  secrets out of source control (e.g. environment variables on the host) and add
  `.env` to `.gitignore`.

---

## Troubleshooting

- **MongoDB connection failed** — the server still starts, but data features
  won't work until MongoDB is reachable. Check `MONGO_URI` and that your IP is
  allowed in MongoDB Atlas (Network Access → add your IP / `0.0.0.0/0`).
- **Emails not sending** — confirm the Brevo SMTP credentials in `.env` are
  active and that a resume has been uploaded (emails require an attachment).
- **No jobs found** — job boards may be blocking requests from your network;
  try again later or from a different network.
