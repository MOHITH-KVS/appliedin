// AppliedIn - Glassdoor Content Script
// Glassdoor's "Easy Apply" often hands off to smartapply.indeed.com to
// actually complete the application. So the moment Easy Apply is clicked
// (while we're still on Glassdoor and can read the real job title/company),
// we cache those details for the Indeed-side script to pick up once the
// application is truly finished — instead of guessing on an unfamiliar page.

(function () {
  console.log('[AppliedIn] glassdoor.js loaded on', window.location.href);

  let captured = false;
  const PENDING_KEY = 'appliedin_pending_application';

  const successPhrases = [
    'application submitted',
    'successfully applied',
    'your application has been sent',
    'you\'ve applied',
    'application complete',
    'thank you for applying'
  ];

  function getJobDetails() {
    try {
      const title =
        document.querySelector('[data-test="job-title"]')?.innerText?.trim() ||
        document.querySelector('[class*="jobTitle"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        null;

      const company =
        document.querySelector('[data-test="employer-name"]')?.innerText?.trim() ||
        document.querySelector('[class*="employerName"]')?.innerText?.trim() ||
        null;

      const location =
        document.querySelector('[data-test="job-location"]')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      if (!title || !company) return null;

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
      return null;
    }
  }

  function cachePendingJob(jobData) {
    chrome.storage.local.set({
      [PENDING_KEY]: { jobData, timestamp: Date.now() }
    });
  }

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — leave captured as-is
    }, function () {
      captured = false;
      chrome.storage.local.remove(PENDING_KEY);
    });
  }

  function bodyLooksLikeFinalSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  // METHOD 0 — Page already showing a success state on load
  if (bodyLooksLikeFinalSuccess()) {
    captured = true;
    setTimeout(() => {
      const jobData = getJobDetails();
      if (jobData) {
        saveApplication(jobData);
      } else {
        captured = false;
      }
    }, 500);
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
      const jobData = getJobDetails();
      if (jobData) cachePendingJob(jobData);
      return;
    }

    // Only an explicit final-submit label counts as a real completion signal.
    const isFinalSubmit =
      text === 'submit' ||
      text.includes('submit application') ||
      text.includes('send application');

    if (isFinalSubmit) {
      if (captured) return;
      captured = true;

      setTimeout(() => {
        const jobData = getJobDetails();
        const successDetected = bodyLooksLikeFinalSuccess();

        if (jobData && successDetected) {
          saveApplication(jobData);
        } else if (jobData) {
          window.__appliedinCommon.showConfirmPopup(jobData, 'Glassdoor', function () {
            captured = false;
          });
        } else {
          captured = false;
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message appearing in the DOM
  const observer = new MutationObserver(function () {
    if (captured) return;

    if (bodyLooksLikeFinalSuccess()) {
      captured = true;
      setTimeout(() => {
        const jobData = getJobDetails();
        if (jobData) {
          saveApplication(jobData);
        } else {
          captured = false;
        }
      }, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

})();
