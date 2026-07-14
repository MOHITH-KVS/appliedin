// AppliedIn - Unstop Content Script
// Unstop navigates to a brand-new URL (…/register/success) after
// registering, and that success page's DOM often doesn't have reliable
// company/role selectors. So we cache the job details from the original
// listing page — where the selectors work — the moment "Register"/"Submit"
// is clicked, and use that cached data once we land on the success page.

(function () {
  console.log('[AppliedIn] unstop.js loaded on', window.location.href);

  let lastHandledUrl = null;
  const PENDING_KEY = 'appliedin_pending_application';
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
      const title = titleCandidates.find(t => t && !isGenericText(t)) || null;

      const companyCandidates = [
        document.querySelector('.company-name')?.innerText?.trim(),
        document.querySelector('[class*="org-name"]')?.innerText?.trim(),
        document.querySelector('[class*="company"]')?.innerText?.trim()
      ];
      const company = companyCandidates.find(c => c && !isGenericText(c)) || null;

      const location =
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      if (!title || !company) return null;

      return {
        company,
        role: title,
        location,
        platform: 'Unstop',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      console.log('[AppliedIn] getJobDetails threw:', e);
      return null;
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

  function urlLooksLikeSuccess() {
    const url = window.location.href.toLowerCase();
    return url.includes('/success') || url.includes('rstatus=1');
  }

  function textLooksLikeSuccess() {
    const bodyText = document.body.innerText || '';
    return successPhrases.some(phrase => bodyText.toLowerCase().includes(phrase));
  }

  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    getPendingJob(function (pendingJob) {
      const jobData = pendingJob || getJobDetails();
      console.log('[AppliedIn] jobData for save:', jobData);

      if (jobData && jobData.company && jobData.company !== 'Unknown Company') {
        saveApplication(jobData);
      } else if (jobData) {
        window.__appliedinCommon.showConfirmPopup(jobData, 'Unstop', function () {
          // user answered — this URL stays marked as handled
        });
      } else {
        lastHandledUrl = null;
      }
    });
  }

  // METHOD 0 — Page loaded directly on a success/confirmation URL or state.
  const immediateUrlSuccess = urlLooksLikeSuccess();
  const immediateTextSuccess = textLooksLikeSuccess();
  console.log('[AppliedIn] immediate check:', { immediateUrlSuccess, immediateTextSuccess, url: window.location.href });

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
      const jobData = getJobDetails();
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
    if (lastHandledUrl === window.location.href) return;
    if (textLooksLikeSuccess()) {
      setTimeout(handleSuccess, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

})();
