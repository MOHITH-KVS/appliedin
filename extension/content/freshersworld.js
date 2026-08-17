// AppliedIn - Freshersworld Content Script
// Large fresher-focused portal. Apply button leads to a confirmation page.

(function () {
  // PATH GUARD: don't track on non-apply pages of this portal
  const _blockedPaths = ['/profile', '/dashboard', '/messages'];
  const _currentPath = window.location.pathname.toLowerCase();
  if (_blockedPaths.some(p => _currentPath.startsWith(p))) return;

  let lastHandledUrl = null;
  let observerActive = true; // set false once popup opens — locks popup open
  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000;

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
    const el = document.querySelector('[class*="salary"]') ||
               document.querySelector('[class*="stipend"]');
    return el?.innerText?.trim() || '';
  }

  function extractJobType() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('internship')) return 'Internship';
    if (text.includes('full time') || text.includes('full-time')) return 'Full-Time';
    return '';
  }

  function extractWorkMode() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('work from home') || text.includes('remote')) return 'Remote';
    if (text.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }

  function getJobDetails() {
    try {
      const title =
        document.querySelector('.job-title')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        document.title?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('.company-name')?.innerText?.trim() ||
        document.querySelector('[class*="company"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company, role: title, location,
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Freshersworld',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) { return null; }
  }

  function getJobDetailsForCaching() {
    const d = getJobDetails();
    if (!d || d.company === 'Unknown Company') return null;
    return d;
  }

  function cachePending(data) {
    chrome.storage.local.set({ [PENDING_KEY]: { jobData: data, timestamp: Date.now() } });
  }

  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], function (r) {
      const e = r[PENDING_KEY];
      cb(e && (Date.now() - e.timestamp) < PENDING_MAX_AGE_MS ? e.jobData : null);
    });
  }

  const successPhrases = [
    'application submitted', 'successfully applied', 'you have applied',
    'applied successfully', 'thank you for applying', 'your application'
  ];

  // Guard: if confirm popup already open (user typing), skip — don't interrupt.
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }
  function bodyLooksLikeSuccess() {
    const url = window.location.href.toLowerCase();
    if (url.includes('applied') || url.includes('success') || url.includes('thank')) return true;
    return successPhrases.some(p => (document.body.innerText || '').toLowerCase().includes(p));
  }

  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;
    window.__appliedinHandled = true;
    getPending(function (pending) {
      const data = pending || getJobDetails();
      if (data && isCleanText(data.company) && isCleanText(data.role)) {
        window.__appliedinCommon.saveApplication(data, null, function() { chrome.storage.local.remove(PENDING_KEY); observerActive = true; });
      } else if (data) {
        window.__appliedinCommon.showConfirmPopup(data, 'Freshersworld', null,
          function () { observerActive = false; } // lock popup open (reset on close)
        );
      }
    });
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, a, input[type="submit"]');
    if (!btn) return;
    const text = (btn.innerText || btn.value || '').toLowerCase().trim();
    if (text.includes('apply') || text.includes('submit')) {
      const cached = getJobDetailsForCaching();
      if (cached) cachePending(cached);
      // Notify guarantee layer in case page redirects after submit
      chrome.runtime.sendMessage({ type: 'SET_APPLY_FLAG', origin: window.location.origin, jobData: cached });
      if (lastHandledUrl === window.location.href) return;
      setTimeout(() => { if (bodyLooksLikeSuccess()) handleSuccess(); }, 2000);
    }
  });

  const observer = new MutationObserver(function () {
    if (window.__appliedinPopupOpen) return; // any popup open — don't interfere
    if (!observerActive) return;
    if (lastHandledUrl === window.location.href || window.__appliedinHandled) return;
    if (bodyLooksLikeSuccess()) setTimeout(handleSuccess, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also check on page load for redirect-based confirmation
  if (bodyLooksLikeSuccess()) setTimeout(handleSuccess, 800);

  // On-load check — ONLY on URL paths that look like post-apply confirmation
  // Never run on listing/search pages to avoid false saves
  (function() {
    const _p = window.location.pathname.toLowerCase();
    const _u = window.location.href.toLowerCase();
    const isApplyPath = _p.includes('/apply') || _p.includes('saveapply') ||
                        _p.includes('applyconfirm') || _u.includes('formresponse') ||
                        _p.includes('/applied') || _u.includes('applysuccess');
    if (!isApplyPath) return; // never run on listing pages
    setTimeout(function() {
      if (typeof bodyLooksLikeSuccess === 'function' && bodyLooksLikeSuccess()) {
        if (typeof handleSuccess === 'function') handleSuccess();
      }
    }, 600);
  })();

})();