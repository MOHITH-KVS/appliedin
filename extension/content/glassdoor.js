// AppliedIn - Glassdoor Content Script
// Glassdoor uses a multi-step modal apply flow. The final submit button
// says "Submit application" and a success screen appears in the same modal.
//
// POPUP RACE FIX: We NEVER show the popup on button click.
// We ONLY show it after the success message is confirmed in the DOM.
// Once the popup is open, the MutationObserver is disconnected — nothing
// can close the popup except the user clicking Yes or No.

(function () {
  // PATH GUARD: don't track on non-apply pages of this portal
  const _blockedPaths = ['/member/', '/community/', '/profile/', '/salary/', '/reviews/'];
  const _currentPath = window.location.pathname.toLowerCase();
  if (_blockedPaths.some(p => _currentPath.startsWith(p))) return;

  if (window.__appliedinGlassdoorInjected) return;
  window.__appliedinGlassdoorInjected = true;

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000;
  let lastHandledUrl = null;
  let observerActive = true; // we flip this to false once popup opens

  // ── Salary / JobType / WorkMode helpers ──

  // Validate that extracted text is actually a job role/company name
  // and not a success message or page noise
  const NOISE_WORDS = [
    'thank you', 'thanks for', 'successfully applied', 'application submitted',
    'you have applied', 'we have received', 'your application',
    'congratulations', 'we will be in touch', 'your submission',
  ];

  function isCleanText(text) {
    if (!text || text.length > 80) return false;
    const lower = text.toLowerCase();
    if (NOISE_WORDS.some(w => lower.includes(w))) return false;
    if (/[.!?]$/.test(text.trim())) return false;
    return true;
  }
  function extractSalary() {
    const selectors = ['[class*="salary"]','[class*="payRange"]','[class*="compensation"]'];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    return '';
  }

  function extractJobType() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('internship')) return 'Internship';
    if (text.includes('full-time') || text.includes('full time')) return 'Full-Time';
    if (text.includes('part-time') || text.includes('part time')) return 'Part-Time';
    if (text.includes('contract')) return 'Contract';
    return '';
  }

  function extractWorkMode() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('remote')) return 'Remote';
    if (text.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }

  // ── Read job details from listing page ──
  function getJobDetails() {
    try {
      const title =
        document.querySelector('[data-test="job-title"]')?.innerText?.trim() ||
        document.querySelector('.jobTitle')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('[data-test="employer-name"]')?.innerText?.trim() ||
        document.querySelector('.employerName')?.innerText?.trim() ||
        document.querySelector('[class*="employerName"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        document.querySelector('[data-test="location"]')?.innerText?.trim() ||
        document.querySelector('.location')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company, role: title, location,
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Glassdoor',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) { return null; }
  }

  // ── Pending cache (captures data before apply modal closes) ──
  function cachePending(data) {
    chrome.storage.local.set({ [PENDING_KEY]: { jobData: data, timestamp: Date.now() } });
  }

  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], function (r) {
      const e = r[PENDING_KEY];
      cb(e && (Date.now() - e.timestamp) < PENDING_MAX_AGE_MS ? e.jobData : null);
    });
  }

  // ── Success detection ──
  const successPhrases = [
    'application submitted',
    'your application has been submitted',
    'application sent',
    'successfully applied',
    'you have applied',
    'you\'ve applied',
    'thank you for applying',
    'we have received your application'
  ];

  function bodyLooksLikeFinalSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  // ── Save helper ──
  function saveApplication(jobData) {
    chrome.runtime.sendMessage({ type: 'SAVE_APPLICATION', data: jobData }, function (response) {
      if (response && response.duplicate) {
        showToast('⚠️ Already applied here recently!', '#f59e0b');
      } else {
        showToast('✅ Saved — ' + jobData.company, '#22c55e');
      }
      chrome.storage.local.remove(PENDING_KEY);
    });
  }

  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:500;z-index:999999;
      box-shadow:0 4px 12px rgba(0,0,0,0.15);background:${color};color:white;
      font-family:-apple-system,sans-serif;transition:opacity 0.3s;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
  }

  // ── Core handler — called ONLY after success confirmed ──
  function handleConfirmedSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    getPending(function (pending) {
      const jobData = pending || getJobDetails();

      if (jobData && jobData.company !== 'Unknown Company') {
        // Auto-save silently — no popup needed
        saveApplication(jobData);
      } else {
        // Can't detect company — show popup so user can fill it in.
        // Pass onOpen: () disconnect observer so nothing can close the popup.
        window.__appliedinCommon.showConfirmPopup(
          jobData || {
            company: '', role: '',
            platform: 'Glassdoor',
            url: window.location.href,
            date: new Date().toISOString(),
            status: 'Applied'
          },
          'Glassdoor',
          function () { chrome.storage.local.remove(PENDING_KEY); observerActive = true; }, // onDone — reset so next app works
          function () { observerActive = false; }                    // onOpen — disconnect observer
        );
      }
    });
  }

  // ── METHOD 1: Watch DOM for success confirmation ──
  // Observer is the PRIMARY trigger — fires when success message appears.
  const observer = new MutationObserver(function () {
    if (!observerActive) return;            // popup is open — stay silent
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeFinalSuccess()) {
      // Wait 800ms to let success UI fully render, then handle
      setTimeout(handleConfirmedSuccess, 800);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── METHOD 2: On submit click — ONLY cache job data, show nothing ──
  // We capture data NOW because the apply modal may close before success
  // and we'd lose the job details. Popup shows ONLY after success confirmed.
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, [role="button"]');
    if (!btn) return;
    const text = (btn.innerText || btn.getAttribute('aria-label') || '').toLowerCase().trim();

    // Cache on any apply-related click (data capture only)
    if (text.includes('apply') || text.includes('easy apply')) {
      const data = getJobDetails();
      if (data && data.company !== 'Unknown Company') cachePending(data);
    }

    // On final submit — also cache latest data then wait for DOM success
    const isFinalSubmit =
      text === 'submit' ||
      text.includes('submit application') ||
      text.includes('send application');

    if (isFinalSubmit) {
      const data = getJobDetails();
      if (data && data.company !== 'Unknown Company') cachePending(data);

      // Fallback: if observer misses success for any reason, check after 4s
      // This handles cases where success appears then disappears quickly
      setTimeout(() => {
        if (lastHandledUrl === window.location.href) return;
        if (!observerActive) return; // popup already open
        if (bodyLooksLikeFinalSuccess()) handleConfirmedSuccess();
      }, 4000);
    }
  });

})();
