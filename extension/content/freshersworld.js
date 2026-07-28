// AppliedIn - Freshersworld Content Script
// Large fresher-focused portal. Apply button leads to a confirmation page.

(function () {
  let lastHandledUrl = null;
  let observerActive = true; // set false once popup opens — locks popup open
  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000;

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
    getPending(function (pending) {
      const data = pending || getJobDetails();
      if (data && data.company !== 'Unknown Company') {
        window.__appliedinCommon.saveApplication(data, null, () => chrome.storage.local.remove(PENDING_KEY));
      } else if (data) {
        window.__appliedinCommon.showConfirmPopup(data, 'Freshersworld', null,
          function () { observerActive = false; } // lock popup open
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
      if (lastHandledUrl === window.location.href) return;
      setTimeout(() => { if (bodyLooksLikeSuccess()) handleSuccess(); }, 2000);
    }
  });

  const observer = new MutationObserver(function () {
    if (!observerActive) return; // popup open — locked, don't interfere
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeSuccess()) setTimeout(handleSuccess, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Also check on page load for redirect-based confirmation
  if (bodyLooksLikeSuccess()) setTimeout(handleSuccess, 800);
})();
