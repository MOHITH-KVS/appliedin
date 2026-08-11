// AppliedIn - Naukri Content Script
// Captures ONLY on submission confirmation. Caches job details the moment
// "Apply" is first clicked (while the listing page's DOM is still intact),
// so the eventual save uses reliable data even if a modal later obscures it.

(function () {
  // PATH GUARD: don't track on non-apply pages of this portal
  const _blockedPaths = ['/mnjuser/', '/mynaukri', '/inbox', '/dashboard', '/notification'];
  const _currentPath = window.location.pathname.toLowerCase();
  if (_blockedPaths.some(p => _currentPath.startsWith(p))) return;

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
    const selectors = [
      '[class*="salary"]', '[class*="ctc"]', '[class*="stipend"]',
      '[data-testid*="salary"]', '[class*="compensation"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    // Regex scan for salary patterns in page text
    const match = (document.body.innerText || '').match(
      /(₹[\d,]+\s*(?:LPA|lpa|L|k|\/month|per month|stipend)?[\s\-–to]*₹?[\d,]*\s*(?:LPA|lpa|L|k)?)/
    );
    return match ? match[1].trim() : '';
  }

  function extractJobType() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('internship')) return 'Internship';
    if (text.includes('full-time') || text.includes('full time')) return 'Full-Time';
    if (text.includes('part-time') || text.includes('part time')) return 'Part-Time';
    if (text.includes('contract')) return 'Contract';
    if (text.includes('freelance')) return 'Freelance';
    return '';
  }

  function extractWorkMode() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('work from home') || text.includes('remote')) return 'Remote';
    if (text.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }

  let lastHandledUrl = null;
  let observerActive = true; // set false once popup opens — locks popup open
  // FIX BUG 2: Use a tab-unique pending key so two tabs (e.g. LinkedIn + Naukri)
  // never overwrite each other's cached job data.
  // performance.now() gives microsecond precision unique to each tab's page load.
  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  // Pages where we should NEVER try to read job details —
  // they are post-apply confirmation/redirect pages with no job data
  const SKIP_DETAIL_PATHS = [
    'myapply', 'saveapply', 'applyconfirm', 'applysuccess',
    'apply-confirm', 'apply-success', 'application-submitted'
  ];

  function isConfirmationPage() {
    const url = window.location.href.toLowerCase();
    return SKIP_DETAIL_PATHS.some(p => url.includes(p));
  }

  function getJobDetails() {
    // On confirmation/redirect pages — return null immediately
    // Caller will use pending cache instead
    if (isConfirmationPage()) return null;

    try {
      const noiseWords = ['apply confirmation','apply confirm','successfully applied',
        'you have applied','thank you','congratulations','naukri campus',
        'application submitted','we have received'];

      function cleanText(text) {
        if (!text || text.length > 100) return null;
        const l = text.toLowerCase();
        if (noiseWords.some(w => l.includes(w))) return null;
        if (/[.!?]$/.test(text.trim())) return null;
        return text.trim();
      }

      // Try multiple Naukri selectors — listing page vs campus page differ
      const title = cleanText(
        document.querySelector('.jd-header-title')?.innerText) ||
        cleanText(document.querySelector('[class*="job-title"]')?.innerText) ||
        cleanText(document.querySelector('[class*="jobTitle"]')?.innerText) ||
        cleanText(document.querySelector('h1')?.innerText) || '';

      // Company — never use hostname as fallback
      const company = cleanText(
        document.querySelector('.jd-header-comp-name a')?.innerText) ||
        cleanText(document.querySelector('.jd-header-comp-name')?.innerText) ||
        cleanText(document.querySelector('[class*="comp-name"]')?.innerText) ||
        cleanText(document.querySelector('[class*="companyName"]')?.innerText) ||
        cleanText(document.querySelector('[class*="company-name"]')?.innerText) || '';

      const location =
        document.querySelector('.location')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() || '';

      // Return null if both are empty — caller shows popup
      if (!company && !title) return null;

      return {
        company: company || '',
        role: title || '',
        location: location || 'Unknown Location',
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Naukri',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      return null; // return null so popup shows — never save garbage
    }
  }

  // Stricter version used ONLY for caching — we don't want to cache
  // "Unknown Company" as if it were reliable data.
  function getJobDetailsForCaching() {
    const jobData = getJobDetails();
    if (jobData.company === 'Unknown Company' || jobData.role === 'Unknown Role') return null;
    return jobData;
  }

  const successPhrases = [
    'application submitted',
    'successfully applied',
    'you have applied',
    'you have successfully applied',
    'your application has been submitted',
    'applied successfully',
    'successfully applied to',    // "You have successfully applied to 'Data Analyst'"
    'application sent',
    'thank you for applying',
  ];

  function cachePendingJob(jobData) {
    chrome.storage.local.set({
      [PENDING_KEY]: { jobData, timestamp: Date.now() }
    });
  }

  function getPendingJob(callback) {
    chrome.storage.local.get([PENDING_KEY], function (result) {
      const entry = result[PENDING_KEY];
      if (entry && (Date.now() - entry.timestamp) < PENDING_MAX_AGE_MS) {
        callback(entry.jobData);
      } else {
        callback(null);
      }
    });
  }

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — this URL stays marked as handled, no re-prompt
    }, function () {
      // saved — this URL stays marked as handled, no re-prompt
      chrome.storage.local.remove(PENDING_KEY);
    });
  }

  // Guard: if confirm popup already open (user typing), skip — don't interrupt.
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }
  function bodyLooksLikeSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    getPendingJob(function (pendingJob) {
      const jobData = pendingJob || getJobDetails();

      if (jobData && jobData.company && jobData.company !== 'Unknown Company') {
        saveApplication(jobData);
      } else if (jobData) {
        window.__appliedinCommon.showConfirmPopup(jobData, 'Naukri', function () {
          // user answered — this URL stays marked as handled
        },
          function () { observerActive = false; } // lock popup open (reset on close)
        );
      } else {
        lastHandledUrl = null;
      }
    });
  }

  // METHOD 1 — Cache on click, then check for success shortly after
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button, a');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();
    if (!text) return;

    if (
      text === 'submit' ||
      text === 'submit application' ||
      text === 'apply' ||
      text === 'confirm apply'
    ) {
      // Cache the currently-visible job details in case a modal takes
      // over the page before we can confirm the real success signal.
      const jobData = getJobDetailsForCaching();
      if (jobData) cachePendingJob(jobData);

      if (lastHandledUrl === window.location.href) return;

      setTimeout(() => {
        if (bodyLooksLikeSuccess()) {
          handleSuccess();
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message
  const observer = new MutationObserver(function () {
    if (window.__appliedinPopupOpen) return;
    if (!observerActive) return;
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeSuccess() || isConfirmationPage()) {
      setTimeout(handleSuccess, 800);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

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