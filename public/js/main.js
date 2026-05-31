/* AI-BOT dashboard client script */
(function () {
  'use strict';

  function toast(message, kind) {
    var holder = document.getElementById('toast');
    if (!holder) return;
    var el = document.createElement('div');
    el.className = 'toast-item ' + (kind === 'err' ? 'err' : 'ok');
    el.textContent = message;
    holder.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s ease';
      setTimeout(function () { el.remove(); }, 320);
    }, 4200);
  }

  /* ---------- Stats refresh ---------- */
  function refreshStats() {
    return fetch('/jobs/stats')
      .then(function (r) { return r.json(); })
      .then(function (s) {
        setText('stat-jobs', s.totalJobs);
        setText('stat-emails', s.totalEmails);
        setText('stat-phones', s.totalRecruitersWithPhone);
        setText('stat-pending', s.totalPending);
      })
      .catch(function () { /* ignore */ });
  }

  function setText(id, val) {
    var el = document.getElementById(id);
    if (el && typeof val !== 'undefined') el.textContent = val;
  }

  /* ---------- Search ---------- */
  var statusBox = document.getElementById('search-status');
  var statusText = document.getElementById('search-status-text');
  var searchBtn = document.getElementById('btn-search');
  var pollTimer = null;

  function showStatus(text) {
    if (!statusBox) return;
    statusBox.classList.add('show');
    if (statusText) statusText.textContent = text;
  }
  function hideStatus() {
    if (statusBox) statusBox.classList.remove('show');
  }

  function pollStatus() {
    fetch('/jobs/search/status')
      .then(function (r) { return r.json(); })
      .then(function (state) {
        refreshStats();
        if (state.running) {
          showStatus('Searching job boards & sending outreach emails…');
        } else {
          stopPolling();
          hideStatus();
          if (searchBtn) { searchBtn.disabled = false; searchBtn.textContent = 'Search Jobs'; }
          var s = state.lastSummary;
          if (state.error) {
            toast('Search error: ' + state.error, 'err');
          } else if (s) {
            toast(
              'Search done · ' + s.found + ' found, ' + s.newJobs + ' new, ' +
              s.emailsSent + ' emails sent.', 'ok'
            );
            // Reload to show fresh table after a short delay
            setTimeout(function () { window.location.reload(); }, 1200);
          }
        }
      })
      .catch(function () { /* ignore transient errors */ });
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(pollStatus, 2500);
  }
  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', function () {
      var location = (document.getElementById('search-location') || {}).value || '';
      var titles = (document.getElementById('search-titles') || {}).value || '';

      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching…';
      showStatus('Starting search…');

      fetch('/jobs/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: location, titles: titles }),
      })
        .then(function (r) { return r.json(); })
        .then(function (res) {
          if (res.started || res.alreadyRunning) {
            toast(res.alreadyRunning ? 'A search is already running.' : 'Search started…', 'ok');
            startPolling();
          } else {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search Jobs';
            hideStatus();
            toast('Could not start search.', 'err');
          }
        })
        .catch(function () {
          searchBtn.disabled = false;
          searchBtn.textContent = 'Search Jobs';
          hideStatus();
          toast('Network error starting search.', 'err');
        });
    });
  }

  // If a search was already running when the page loaded, resume polling.
  if (statusBox && statusBox.classList.contains('show')) {
    if (searchBtn) { searchBtn.disabled = true; searchBtn.textContent = 'Searching…'; }
    startPolling();
  }

  /* ---------- Manual send ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.btn-send') : null;
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    if (!id) return;

    btn.disabled = true;
    btn.textContent = 'Sending…';

    fetch('/email/send/' + id, { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) {
          toast(res.message || 'Email sent.', 'ok');
          var cell = btn.parentNode;
          if (cell) { cell.innerHTML = '<span class="muted">Sent &#10003;</span>'; }
          refreshStats();
        } else {
          btn.disabled = false;
          btn.textContent = 'Send Email';
          toast(res.error || 'Could not send email.', 'err');
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = 'Send Email';
        toast('Network error while sending.', 'err');
      });
  });
})();
