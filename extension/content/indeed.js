// AppliedIn - Indeed Content Script
// Indeed's apply flow is multi-step and often moves to a different
// subdomain (smartapply.indeed.com) whose pages don't have the job
// title/company in the DOM. So instead of re-scraping an unfamiliar
// page at the end, we cache the correct job details from the real
// job listing page the moment the user starts applying, then use that
// cached data once we see a genuine completion signal.

(function () {
  console.log('[AppliedIn] indeed.js loaded on', window.location.href);

  // Chat/messaging pages legitimately contain application-related phrases
  // in normal conversation — never a real submission confirmation. This
  // script should not run there at all.
  const EXCLUDED_PATH_PATTERNS = ['/chat/', '/message', '/inbox', '/conversation'];
  if (EXCLUDED_PATH_PATTERNS.some(p => window.location.pathname.toLowerCase().includes(p))) {
    console.log('[AppliedIn] indeed.js: excluded page type, not running');
    return;
  }

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
      const structured = window.__appliedinCommon?.getStructuredJobData?.();

      const title =
        structured?.title ||
        document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText?.trim() ||
        document.querySelector('[class*="jobTitle"]')?.innerText?.trim() ||
        window.__appliedinCommon?.cleanAndValidateRole?.(document.querySelector('h1')?.innerText?.trim()) ||
        null;

      const company =
        structured?.company ||
        window.__appliedinCommon?.cleanAndValidateCompany?.(document.querySelector('[data-company-name="true"]')?.innerText?.trim()) ||
        window.__appliedinCommon?.cleanAndValidateCompany?.(document.querySelector('[class*="companyName"]')?.innerText?.trim()) ||
        null;

      const location =
        structured?.location ||
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

  // The confirmation heading ("Your application has been submitted!") is
  // often the ONLY h1/h2 on this page — grabbing it as if it were the job
  // role was a serious bug: it's identical across every single Indeed
  // application, which meant every later application would also get this
  // same text and get falsely flagged as a duplicate of the first one.
  function looksLikeConfirmationMessage(text) {
    if (!text) return true;
    const lower = text.toLowerCase();
    return successPhrases.some(p => lower.includes(p)) ||
      lower.includes('submitted') || lower.includes('thank you') ||
      lower.includes('congratulations');
  }

  // Fallback: on the smartapply summary card itself (seen on the right side
  // of the apply flow), the role/company are often shown even though the
  // rest of the DOM is unfamiliar. Never returns null — this is the last
  // resort before showing the popup, so it must always produce something.
  function getJobDetailsFromApplySummary() {
    try {
      const h1Text = document.querySelector('h1, h2')?.innerText?.trim();
      const role = (h1Text && !looksLikeConfirmationMessage(h1Text)) ? h1Text : null;
      const companyLine = window.__appliedinCommon?.cleanAndValidateCompany?.(
        document.querySelector('[class*="company"], [class*="Company"]')?.innerText?.trim()
      ) || null;

      return {
        company: companyLine || 'Unknown Company',
        role: role || 'Unknown Role',
        location: 'Unknown Location',
        platform: 'Indeed',
        // Deliberately NOT window.location.href here — this confirmation
        // page's URL (smartapply.indeed.com/.../post-apply) is generic
        // and IDENTICAL across every single Indeed application. Using it
        // as the dedup key was making every fallback-detected application
        // match any previous one via the exact-URL duplicate check —
        // completely bypassing the company/role comparison logic, since
        // that check runs first and returns immediately.
        url: '',
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      return {
        company: 'Unknown Company',
        role: 'Unknown Role',
        location: 'Unknown Location',
        platform: 'Indeed',
        url: '',
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
    if (isRecentlyHandled()) return;
    markHandled();

    getPendingJob(function (pendingJob) {
      const jobData = pendingJob || getJobDetailsFromApplySummary();

      if (jobData && jobData.company && jobData.company !== 'Unknown Company' && jobData.role && jobData.role !== 'Unknown Role') {
        saveApplication(jobData);
      } else if (jobData) {
        window.__appliedinCommon.showConfirmPopup(jobData, 'Indeed', function () {
          // user answered (Yes or No) — this URL stays marked as handled
        });
      } else {
        // couldn't read anything — allow a later mutation to retry
        lastHandledUrl = null; lastHandledAt = 0;
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

    if (isRecentlyHandled()) return;
    if (urlLooksLikeFinalSuccess()) {
      setTimeout(handleFinalSuccess, 800);
    }
  }, 500);

})();
