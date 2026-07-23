// AppliedIn - LinkedIn Content Script
// Captures ONLY on final submission confirmation.
// The Easy Apply modal can obscure/replace the underlying job title and
// company elements once it's open, so we cache those details the moment
// "Easy Apply" is clicked — while the job card is still visible — and use
// that cached data at submission time instead of re-scraping the modal.

(function () {
  console.log('[AppliedIn] linkedin.js loaded on', window.location.href);

  // Chat/messaging pages legitimately contain application-related phrases
  // in normal conversation — never a real submission confirmation. This
  // script should not run there at all.
  const EXCLUDED_PATH_PATTERNS = ['/messaging/', '/chat/', '/inbox'];
  if (EXCLUDED_PATH_PATTERNS.some(p => window.location.pathname.toLowerCase().includes(p))) {
    console.log('[AppliedIn] linkedin.js: excluded page type, not running');
    return;
  }

  // Tracks the URL we already handled — prevents re-asking on every
  // subsequent DOM mutation once a success message is showing.
  let lastHandledUrl = null;
  let lastHandledAt = 0;
  const REARM_COOLDOWN_MS = 8000;

  function isRecentlyHandled() {
    return lastHandledUrl === normalizedUrl() && (Date.now() - lastHandledAt) < REARM_COOLDOWN_MS;
  }

  function markHandled() {
    lastHandledUrl = normalizedUrl();
    lastHandledAt = Date.now();
  }

  // SPA-style portals often mutate query strings/hash on internal
  // navigation without a real reload - comparing origin+pathname only
  // avoids false re-triggers from those irrelevant URL changes.
  function normalizedUrl() {
    return window.location.origin + window.location.pathname;
  }
  const PENDING_KEY = 'appliedin_pending_application';
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  // LinkedIn's tab title reliably follows "Job Title | Company | LinkedIn"
  // — much more stable than CSS class names, which change frequently.
  function getDetailsFromTabTitle() {
    const parts = (document.title || '').split('|').map(p => p.trim()).filter(Boolean);
    // parts[0] = role, parts[1] = company, parts[last] usually "LinkedIn"
    if (parts.length >= 2) {
      return { role: parts[0], company: parts[1] };
    }
    return { role: null, company: null };
  }

  function getJobDetails() {
    try {
      const structured = window.__appliedinCommon?.getStructuredJobData?.();
      const tabTitle = getDetailsFromTabTitle();

      const title =
        structured?.title ||
        document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim() ||
        document.querySelector('h1.t-24')?.innerText?.trim() ||
        window.__appliedinCommon?.cleanAndValidateRole?.(document.querySelector('h1')?.innerText?.trim()) ||
        tabTitle.role ||
        'Unknown Role';

      const company =
        structured?.company ||
        window.__appliedinCommon?.cleanAndValidateCompany?.(document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim()) ||
        window.__appliedinCommon?.cleanAndValidateCompany?.(document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim()) ||
        window.__appliedinCommon?.cleanAndValidateCompany?.(document.querySelector('a[href*="/company/"]')?.innerText?.trim()) ||
        tabTitle.company ||
        'Unknown Company';

      const location =
        structured?.location ||
        document.querySelector('.job-details-jobs-unified-top-card__bullet')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company,
        role: title,
        location,
        platform: 'LinkedIn',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      console.log('[AppliedIn] getJobDetails threw:', e);
      // Last-resort fallback: try the tab title one more time before
      // giving up completely.
      const tabTitle = getDetailsFromTabTitle();
      return {
        company: tabTitle.company || 'Unknown Company',
        role: tabTitle.role || 'Unknown Role',
        location: 'Unknown Location',
        platform: 'LinkedIn',
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

  const successPhrases = [
    'your application was sent',
    'application submitted',
    'you\'ve applied',
    'application was sent to',
    'successfully applied',
    'has been submitted',
    'has been received'
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

  function bodyLooksLikeSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  function handleSuccess() {
    if (isRecentlyHandled()) return;
    markHandled();

    getPendingJob(function (pendingJob) {
      const jobData = pendingJob || getJobDetails();
      console.log('[AppliedIn] jobData for save:', jobData);

      if (jobData && jobData.company && jobData.company !== 'Unknown Company' && jobData.role && jobData.role !== 'Unknown Role') {
        saveApplication(jobData);
      } else if (jobData) {
        window.__appliedinCommon.showConfirmPopup(jobData, 'LinkedIn', function () {
          // user answered — this URL stays marked as handled
        });
      } else {
        lastHandledUrl = null; lastHandledAt = 0;
      }
    });
  }

  document.addEventListener('click', function (e) {
    const button = e.target.closest('button');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();
    if (!text) return;

    // "Easy Apply" just opens the modal — cache the real job details now,
    // while the underlying job card is still visible and readable.
    if (text === 'easy apply') {
      const jobData = getJobDetailsForCaching();
      if (jobData) cachePendingJob(jobData);
      return;
    }

    // Only capture on FINAL submit — not on "Next"/"Review"
    if (
      text === 'submit application' ||
      text === 'submit' ||
      text === 'done'
    ) {
      if (isRecentlyHandled()) return;

      setTimeout(() => {
        if (bodyLooksLikeSuccess()) {
          handleSuccess();
        }
      }, 2000);
    }
  });

  // Watch for success confirmation message in DOM. Debounced so a page
  // with lots of incidental mutations (ads, trackers) doesn't trigger a
  // full-text rescan on every single one.
  let mutationDebounce = null;
  const observer = new MutationObserver(function () {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      if (isRecentlyHandled()) return;
      if (bodyLooksLikeSuccess()) {
        setTimeout(handleSuccess, 1000);
      }
    }, 400);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

})();
