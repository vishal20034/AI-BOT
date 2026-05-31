/**
 * Helper for tracking the single "current" resume PDF stored in /uploads.
 * Only one resume is kept at a time, so the most recent PDF in the folder is
 * always the active one. This survives restarts because it reads the disk.
 */

const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

/**
 * Returns the currently active resume, or null if none uploaded yet.
 * @returns {{ filename: string, path: string, uploadedAt: Date }|null}
 */
function getCurrentResume() {
  ensureUploadDir();
  const files = fs
    .readdirSync(UPLOAD_DIR)
    .filter((f) => f.toLowerCase().endsWith('.pdf'));
  if (!files.length) return null;

  // Newest by modified time
  const newest = files
    .map((f) => {
      const full = path.join(UPLOAD_DIR, f);
      return { filename: f, path: full, uploadedAt: fs.statSync(full).mtime };
    })
    .sort((a, b) => b.uploadedAt - a.uploadedAt)[0];

  return newest;
}

/** Remove every existing PDF so only one resume is ever kept. */
function clearResumes() {
  ensureUploadDir();
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    if (f.toLowerCase().endsWith('.pdf')) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, f));
      } catch (_) {
        /* ignore */
      }
    }
  }
}

module.exports = { getCurrentResume, clearResumes, ensureUploadDir, UPLOAD_DIR };
