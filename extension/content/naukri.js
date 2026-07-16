// AppliedIn - Naukri Content Script
// Captures ONLY on submission confirmation. Caches job details the moment
// "Apply" is first clicked (while the listing page's DOM is still intact),
// so the eventual save uses reliable data even if a modal later obscures it.

(function () {
  console.log('[AppliedIn] naukri.js loaded on', window.location.href);

  let lastHandledUrl = null;
  const PENDING_KEY = 'appliedin_pending_application';
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  function getJobDetails() {
    try {
      const structured = window.__appliedinCommon?.getStructuredJobData?.();

      const title =
        structured?.title ||
        document.querySelector('.jd-header-title')?.innerText?.trim() ||
        document.querySelector('[class*="job-title"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        structured?.company ||
        document.querySelector('.jd-header-comp-name a')?.innerText?.trim() ||
        document.querySelector('.jd-header-comp-name')?.innerText?.trim() ||
        document.querySelector('[class*="comp-name"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        structured?.location ||
        document.querySelector('.location')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company,
        role: title,
        location,
        platform: 'Naukri',
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
        platform: 'Naukri',
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
    'application submitted',
    'successfully applied',
    'you have applied',
    'your application has been submitted',
    'applied successfully',
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
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    getPendingJob(function (pendingJob) {
      const jobData = pendingJob || getJobDetails();

      if (jobData && jobData.company && jobData.company !== 'Unknown Company') {
        saveApplication(jobData);
      } else if (jobData) {
        window.__appliedinCommon.showConfirmPopup(jobData, 'Naukri', function () {
          // user answered — this URL stays marked as handled
        });
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

  // METHOD 2 — Watch for success message (debounced to avoid rescanning
  // the full page text on every incidental DOM mutation)
  let mutationDebounce = null;
  const observer = new MutationObserver(function () {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      if (lastHandledUrl === window.location.href) return;
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
