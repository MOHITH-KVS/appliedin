// AppliedIn - Indeed Content Script
// Indeed's apply flow is multi-step and often moves to a different
// subdomain (smartapply.indeed.com) whose pages don't have the job
// title/company in the DOM. So instead of re-scraping an unfamiliar
// page at the end, we cache the correct job details from the real
// job listing page the moment the user starts applying, then use that
// cached data once we see a genuine completion signal.

(function () {
  console.log('[AppliedIn] indeed.js loaded on', window.location.href);

  let lastHandledUrl = null;
  const PENDING_KEY = 'appliedin_pending_application';
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

  // Only the exact, specific confirmation heading — deliberately narrow.
  // Broader phrases like "application submitted" can appear as ordinary
  // copy mid-form (e.g. "once submitted, your application submitted..."),
  // which was causing the popup to fire before the form was even finished.
  const successPhrases = [
    'your application has been submitted',
    'your application was sent'
  ];

  function urlLooksLikeFinalSuccess() {
    const url = window.location.href.toLowerCase();
    return url.includes('post-apply') || url.includes('application-sent') || url.includes('applied=1');
  }

  function bodyLooksLikeFinalSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  function getJobDetailsFromListingPage() {
    try {
      const title =
        document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText?.trim() ||
        document.querySelector('[class*="jobTitle"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        null;

      const company =
        document.querySelector('[data-company-name="true"]')?.innerText?.trim() ||
        document.querySelector('[class*="companyName"]')?.innerText?.trim() ||
        null;

      const location =
        document.querySelector('[data-testid="job-location"]')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      if (!title || !company) return null;

      return {
        company,
        role: title,
        location,
        platform: 'Indeed',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      return null;
    }
  }

  // Fallback: on the smartapply summary card itself (seen on the right side
  // of the apply flow), the role/company are often shown even though the
  // rest of the DOM is unfamiliar. Never returns null — this is the last
  // resort before showing the popup, so it must always produce something.
  function getJobDetailsFromApplySummary() {
    try {
      const role = document.querySelector('h1, h2')?.innerText?.trim() || 'Unknown Role';
      const companyLine = document.querySelector('[class*="company"], [class*="Company"]')?.innerText?.trim() || 'Unknown Company';

      return {
        company: companyLine,
        role,
        location: 'Unknown Location',
        platform: 'Indeed',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      return {
        company: 'Unknown Company',
        role: 'Unknown Role',
        location: 'Unknown Location',
        platform: 'Indeed',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    }
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

  function handleFinalSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    getPendingJob(function (pendingJob) {
      const jobData = pendingJob || getJobDetailsFromApplySummary();

      if (jobData && jobData.company && jobData.company !== 'Unknown Company') {
        saveApplication(jobData);
      } else if (jobData) {
        window.__appliedinCommon.showConfirmPopup(jobData, 'Indeed', function () {
          // user answered (Yes or No) — this URL stays marked as handled
        });
      } else {
        // couldn't read anything — allow a later mutation to retry
        lastHandledUrl = null;
      }
    });
  }

  // METHOD 0 — Page already loaded on a confirmed success URL
  // (handles Indeed's step-by-step navigation landing directly on
  // the post-apply confirmation page). URL is the authority here —
  // text alone is too easily matched by ordinary mid-form copy.
  if (urlLooksLikeFinalSuccess()) {
    setTimeout(handleFinalSuccess, 500);
  }

  // METHOD 1 — Cache job details the moment the user starts applying
  // (only on the real job listing page, where selectors are reliable)
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button, a');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();
    if (!text) return;

    const isApplyStart = text === 'apply now' || text === 'apply';

    if (isApplyStart) {
      const jobData = getJobDetailsFromListingPage();
      if (jobData) cachePendingJob(jobData);
      return;
    }

    // Only a truly explicit final-submit label counts — "Continue"/"Next"
    // deliberately excluded since they fire on every intermediate step.
    const isFinalSubmit =
      text === 'submit' ||
      text.includes('submit application') ||
      text.includes('submit your application');

    if (isFinalSubmit) {
      setTimeout(() => {
        if (urlLooksLikeFinalSuccess() || bodyLooksLikeFinalSuccess()) {
          handleFinalSuccess();
        }
      }, 2000);
    }
  });

  // METHOD 2 — Poll for the URL reaching the confirmed success page.
  // (Deliberately NOT scanning body text on every DOM mutation — that was
  // the source of the premature/duplicate popups, since ordinary mid-form
  // copy can loosely contain success-sounding words.)
  let lastCheckedUrl = window.location.href;
  const urlPoll = setInterval(function () {
    if (window.location.href === lastCheckedUrl) return;
    lastCheckedUrl = window.location.href;

    if (lastHandledUrl === window.location.href) return;
    if (urlLooksLikeFinalSuccess()) {
      setTimeout(handleFinalSuccess, 800);
    }
  }, 500);

})();
