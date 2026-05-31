/**
 * Upload routes (mounted at /upload)
 *  GET  /upload  - render the resume upload page (shows current resume)
 *  POST /upload  - accept a PDF resume, keeping only the latest one
 */

const express = require('express');
const path = require('path');
const multer = require('multer');
const router = express.Router();

const { UPLOAD_DIR, ensureUploadDir, clearResumes, getCurrentResume } = require('../services/resume');

ensureUploadDir();

// Sanitise a filename to a safe, predictable form.
function safeName(original) {
  const base = path
    .basename(original, path.extname(original))
    .replace(/[^a-zA-Z0-9-_]+/g, '_')
    .slice(0, 60) || 'resume';
  return `${base}.pdf`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureUploadDir();
    // Keep only one resume at a time
    clearResumes();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, safeName(file.originalname));
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      return cb(null, true);
    }
    cb(new Error('Only PDF files are allowed.'));
  },
});

// Render upload page
router.get('/', (req, res) => {
  const resume = getCurrentResume();
  res.render('upload', {
    title: 'Upload Resume',
    active: 'upload',
    resume,
    message: req.query.message || null,
    error: req.query.error || null,
  });
});

// Handle upload (with multer error handling)
router.post('/', (req, res) => {
  upload.single('resume')(req, res, (err) => {
    if (err) {
      return res.redirect(`/upload?error=${encodeURIComponent(err.message)}`);
    }
    if (!req.file) {
      return res.redirect('/upload?error=Please%20choose%20a%20PDF%20file%20to%20upload.');
    }
    return res.redirect(
      `/upload?message=${encodeURIComponent('Resume uploaded: ' + req.file.filename)}`
    );
  });
});

module.exports = router;
