// AppliedIn - Glassdoor Content Script
// Glassdoor's "Easy Apply" often hands off to smartapply.indeed.com to
// actually complete the application. So the moment Easy Apply is clicked
// (while we're still on Glassdoor and can read the real job title/company),
// we cache those details for the Indeed-side script to pick up once the
// application is truly finished — instead of guessing on an unfamiliar page.

(function () {
  console.log('[AppliedIn] glassdoor.js loaded on', window.location.href);

  // Tracks the URL we already handled — prevents re-asking on every
  // subsequent DOM mutation on a static "success" page (the success text
  // never disappears, so a boolean flag alone would loop forever).
  let lastHandledUrl = null;
  const PENDING_KEY = 'appliedin_pending_application';

  const successPhrases = [
    'application submitted',
    'successfully applied',
    'your application has been sent',
    'you\'ve applied',
    'application complete',
    'thank you for applying',
    'has been submitted',
    'has been received'
  ];

  function getJobDetails() {
    try {
      const title =
        document.querySelector('[data-test="job-title"]')?.innerText?.trim() ||
        document.querySelector('[class*="jobTitle"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('[data-test="employer-name"]')?.innerText?.trim() ||
        document.querySelector('[class*="employerName"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        document.querySelector('[data-test="job-location"]')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company,
        role: title,
        location,
        platform: 'Glassdoor',
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
        platform: 'Glassdoor',
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

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — this URL stays marked as handled, no re-prompt
    }, function () {
      // saved — this URL stays marked as handled, no re-prompt
      chrome.storage.local.remove(PENDING_KEY);
    });
  }

  function bodyLooksLikeFinalSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  function handleFinalSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    const jobData = getJobDetails();
    if (jobData) {
      saveApplication(jobData);
    } else {
      // couldn't read anything — allow a later mutation to retry
      lastHandledUrl = null;
    }
  }

  // METHOD 0 — Page already showing a success state on load
  if (bodyLooksLikeFinalSuccess()) {
    setTimeout(handleFinalSuccess, 500);
  }

  document.addEventListener('click', function (e) {
    const button = e.target.closest('button, a');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();
    if (!text) return;

    // Easy Apply / Apply Now just STARTS the flow — often redirecting to
    // Indeed. Cache the correct job details now, while we can still read
    // them, but don't mark this as a completed application yet.
    if (text === 'apply now' || text === 'easy apply' || text === 'apply') {
      const jobData = getJobDetailsForCaching();
      if (jobData) cachePendingJob(jobData);
      return;
    }

    // Only an explicit final-submit label counts as a real completion signal.
    const isFinalSubmit =
      text === 'submit' ||
      text.includes('submit application') ||
      text.includes('send application');

    if (isFinalSubmit) {
      if (lastHandledUrl === window.location.href) return;

      setTimeout(() => {
        const jobData = getJobDetails();
        const successDetected = bodyLooksLikeFinalSuccess();

        if (!successDetected) return; // not actually done yet — stay silent

        lastHandledUrl = window.location.href;

        if (jobData) {
          saveApplication(jobData);
        } else {
          window.__appliedinCommon.showConfirmPopup(
            { company: '', role: '', platform: 'Glassdoor', url: window.location.href, date: new Date().toISOString(), status: 'Applied' },
            'Glassdoor',
            function () {
              // user answered — this URL stays marked as handled
            }
          );
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message appearing in the DOM
  const observer = new MutationObserver(function () {
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeFinalSuccess()) {
      setTimeout(handleFinalSuccess, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

})();
