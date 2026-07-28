// AppliedIn - Cutshort Content Script
// Cutshort is a startup-focused job platform. Applications go through
// a multi-step flow ending with a "Applied successfully" toast/banner.
// Job details are reliably in the page header before and during application.

(function () {
  let lastHandledUrl = null;
  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000;

  function extractSalary() {
    const el =
      document.querySelector('[class*="salary"]') ||
      document.querySelector('[class*="ctc"]') ||
      document.querySelector('[data-test*="salary"]');
    return el?.innerText?.trim() || '';
  }

  function extractJobType() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('internship')) return 'Internship';
    if (text.includes('full-time') || text.includes('full time')) return 'Full-Time';
    if (text.includes('part-time')) return 'Part-Time';
    if (text.includes('contract')) return 'Contract';
    return 'Full-Time';
  }

  function extractWorkMode() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('remote')) return 'Remote';
    if (text.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }

  function getJobDetails() {
    try {
      const title =
        document.querySelector('h1')?.innerText?.trim() ||
        document.querySelector('[class*="job-title"]')?.innerText?.trim() ||
        document.querySelector('[class*="position"]')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('[class*="company-name"]')?.innerText?.trim() ||
        document.querySelector('[class*="org-name"]')?.innerText?.trim() ||
        document.querySelector('h2')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company, role: title, location,
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Cutshort',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) { return null; }
  }

  function getJobDetailsForCaching() {
    const d = getJobDetails();
    if (!d || d.company === 'Unknown Company' || d.role === 'Unknown Role') return null;
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
    'applied successfully', 'application submitted', 'successfully applied',
    'you have applied', 'your application', 'thank you for applying'
  ];


  // Guard: if confirm popup already open (user typing), skip — don't interrupt.
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }
  function bodyLooksLikeSuccess() {
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
        window.__appliedinCommon.showConfirmPopup(data, 'Cutshort', null);
      }
    });
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button');
    if (!btn) return;
    const text = (btn.innerText || '').toLowerCase().trim();
    if (text.includes('apply') || text === 'submit') {
      const cached = getJobDetailsForCaching();
      if (cached) cachePending(cached);
      if (lastHandledUrl === window.location.href) return;
      setTimeout(() => { if (bodyLooksLikeSuccess()) handleSuccess(); }, 2000);
    }
  });

  const observer = new MutationObserver(function () {
    if (lastHandledUrl === window.location.href) return;
    if (isPopupOpen()) return;
    if (bodyLooksLikeSuccess()) setTimeout(handleSuccess, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
