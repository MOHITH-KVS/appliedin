// AppliedIn - Unstop Content Script
// Unstop navigates to a brand-new URL (…/register/success) after
// registering, and that success page's DOM often doesn't have reliable
// company/role selectors. So we cache the job details from the original
// listing page — where the selectors work — the moment "Register"/"Submit"
// is clicked, and use that cached data once we land on the success page.

(function () {
  // PATH GUARD: don't track on non-apply pages
  const _blockedPaths = ['/profile', '/dashboard', '/messages', '/notifications', '/wallet'];
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
    const selectors = [
      '[class*="salary"]', '[class*="ctc"]', '[class*="stipend"]',
      '[data-testid*="salary"]', '[class*="compensation"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    const match = (document.body.innerText || '').match(
      /(₹[\d,]+\s*(?:LPA|lpa|L|k|\/month|per month|stipend)?[\s\-\u2013to]*₹?[\d,]*\s*(?:LPA|lpa|L|k)?)/
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

  // FIX BUG 2: Use a tab-unique pending key so two tabs (e.g. LinkedIn + Naukri)
  // never overwrite each other's cached job data.
  // performance.now() gives microsecond precision unique to each tab's page load.
  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  const GENERIC_PHRASES = [
    'registration successful', 'successfully registered', 'application submitted',
    'thank you for registering', 'participation confirmed'
  ];

  const successPhrases = [
    'successfully registered',
    'registration successful',
    'successfully applied',
    'application submitted',
    'you have registered',
    'thank you for registering',
    'participation confirmed'
  ];

  function isGenericText(text) {
    if (!text) return true;
    const lower = text.toLowerCase().trim();
    return GENERIC_PHRASES.some(p => lower === p || lower.includes(p));
  }

  function getJobDetails() {
    try {
      const titleCandidates = [
        document.querySelector('.opportunity-heading')?.innerText?.trim(),
        document.querySelector('[class*="opportunity-title"]')?.innerText?.trim(),
        document.querySelector('h3')?.innerText?.trim(),
        document.querySelector('h1')?.innerText?.trim()
      ];
      const title = titleCandidates.find(t => t && !isGenericText(t)) || 'Unknown Role';

      const companyCandidates = [
        document.querySelector('.company-name')?.innerText?.trim(),
        document.querySelector('[class*="org-name"]')?.innerText?.trim(),
        document.querySelector('[class*="company"]')?.innerText?.trim()
      ];
      const company = companyCandidates.find(c => c && !isGenericText(c)) || 'Unknown Company';

      const location =
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company,
        role: title,
        location,
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Unstop',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      // Even on error, return SOMETHING so a popup can still be shown —
      // never go completely silent.
      return {
        company: 'Unknown Company',
        role: 'Unknown Role',
        location: 'Unknown Location',
        platform: 'Unstop',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    }
  }

  // Stricter version used ONLY for caching — we don't want to cache
  // "Unknown Company" as if it were reliable data.
  function getJobDetailsForCaching() {
    const jobData = getJobDetails();
    if (jobData.company === 'Unknown Company' || jobData.role === 'Unknown Role') return null;
    return jobData;
  }

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

  function urlLooksLikeSuccess() {
    const url = window.location.href.toLowerCase();
    return url.includes('/success') || url.includes('rstatus=1');
  }

  function textLooksLikeSuccess() {
    const bodyText = document.body.innerText || '';
    return successPhrases.some(phrase => bodyText.toLowerCase().includes(phrase));
  }

  // Guard: if confirm popup already open (user typing), skip — don't interrupt.
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }
  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;
    window.__appliedinHandled = true;

    getPendingJob(function (pendingJob) {
      const jobData = pendingJob || getJobDetails();

      if (jobData && jobData.company && jobData.company !== 'Unknown Company') {
        saveApplication(jobData);
      } else if (jobData) {
        window.__appliedinCommon.showConfirmPopup(jobData, 'Unstop', function () {
          // user answered — this URL stays marked as handled
        },
          function () { observerActive = false; } // lock popup open
        );
      } else {
        lastHandledUrl = null;
      }
    });
  }

  // METHOD 0 — Page loaded directly on a success/confirmation URL or state.
  const immediateUrlSuccess = urlLooksLikeSuccess();
  const immediateTextSuccess = textLooksLikeSuccess();

  if (immediateUrlSuccess || immediateTextSuccess) {
    setTimeout(handleSuccess, 500);
  }

  // METHOD 1 — Cache job details the moment the user starts registering
  // (on the listing page, before the redirect to the success page)
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button, a');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();
    if (!text) return;

    if (
      text === 'submit' ||
      text === 'register' ||
      text === 'confirm registration' ||
      text === 'confirm' ||
      text === 'participate'
    ) {
      const jobData = getJobDetailsForCaching();
      if (jobData) cachePendingJob(jobData);

      if (lastHandledUrl === window.location.href) return;

      setTimeout(() => {
        if (urlLooksLikeSuccess() || textLooksLikeSuccess()) {
          handleSuccess();
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message appearing in the DOM
  const observer = new MutationObserver(function () {
    if (window.__appliedinPopupOpen) return; // any popup open — don't interfere
    if (!observerActive) return;
    if (lastHandledUrl === window.location.href) return;
    if (textLooksLikeSuccess()) {
      setTimeout(handleSuccess, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();
