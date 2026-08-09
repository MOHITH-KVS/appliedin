// AppliedIn - Hirist Content Script
// Hirist is a tech-focused job portal popular with fresher developers.
// Job details are in structured divs; success is shown inline after submit.

(function () {
  // PATH GUARD: don't track on non-apply pages of this portal
  const _blockedPaths = ['/profile', '/dashboard', '/messages'];
  const _currentPath = window.location.pathname.toLowerCase();
  if (_blockedPaths.some(p => _currentPath.startsWith(p))) return;

  let lastHandledUrl = null;
  let observerActive = true; // set false once popup opens — locks popup open


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
    const el =
      document.querySelector('[class*="salary"]') ||
      document.querySelector('[class*="ctc"]') ||
      document.querySelector('[class*="stipend"]');
    return el?.innerText?.trim() || '';
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
    if (text.includes('work from home') || text.includes('remote')) return 'Remote';
    if (text.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }

  function getJobDetails() {
    try {
      const title =
        document.querySelector('.job-title')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        document.querySelector('h2')?.innerText?.trim() ||
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
        platform: 'Hirist',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      return null;
    }
  }

  const successPhrases = [
    'application submitted', 'successfully applied',
    'you have applied', 'application sent', 'thank you for applying'
  ];


  // Guard: if confirm popup already open (user typing), skip — don't interrupt.
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }
  function bodyLooksLikeSuccess() {
    const body = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => body.includes(p));
  }

  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;
    const jobData = getJobDetails();
    if (jobData && jobData.company !== 'Unknown Company') {
      window.__appliedinCommon.saveApplication(jobData, null, null);
    } else if (jobData) {
      window.__appliedinCommon.showConfirmPopup(jobData, 'Hirist', null,
          function () { observerActive = false; } // lock popup open (reset on close)
        );
    }
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, input[type="submit"]');
    if (!btn) return;
    const text = (btn.innerText || btn.value || '').toLowerCase().trim();
    if (text.includes('apply') || text.includes('submit')) {
      setTimeout(() => { if (bodyLooksLikeSuccess()) handleSuccess(); }, 2000);
    }
  });

  const observer = new MutationObserver(function () {
    if (window.__appliedinPopupOpen) return; // any popup open — don't interfere
    if (!observerActive) return;
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeSuccess()) setTimeout(handleSuccess, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Check immediately on script load — handles redirect-based success pages
  // where the success message is already in DOM when our script injects
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function() {
      if (typeof bodyLooksLikeSuccess === 'function' && bodyLooksLikeSuccess()) {
        if (typeof handleSuccess === 'function') handleSuccess();
      }
    }, 500);
  }

})();