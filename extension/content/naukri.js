// AppliedIn - Naukri Content Script
// Captures ONLY on submission confirmation

(function () {
  console.log('[AppliedIn] naukri.js loaded on', window.location.href);

  // Tracks the URL we already handled — prevents re-asking on every
  // subsequent DOM mutation once a success message is showing.
  let lastHandledUrl = null;

  function getJobDetails() {
    try {
      const title =
        document.querySelector('.jd-header-title')?.innerText?.trim() ||
        document.querySelector('[class*="job-title"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('.jd-header-comp-name a')?.innerText?.trim() ||
        document.querySelector('.jd-header-comp-name')?.innerText?.trim() ||
        document.querySelector('[class*="comp-name"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
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
      return null;
    }
  }

  const successPhrases = [
    'application submitted',
    'successfully applied',
    'you have applied',
    'your application has been submitted',
    'applied successfully'
  ];

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — this URL stays marked as handled, no re-prompt
    }, function () {
      // saved — this URL stays marked as handled, no re-prompt
    });
  }

  function bodyLooksLikeSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    const jobData = getJobDetails();

    if (jobData && jobData.company !== 'Unknown Company') {
      saveApplication(jobData);
    } else if (jobData) {
      window.__appliedinCommon.showConfirmPopup(jobData, 'Naukri', function () {
        // user answered — this URL stays marked as handled
      });
    } else {
      lastHandledUrl = null;
    }
  }

  // METHOD 1 — Final submit button
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button, a');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();

    if (
      text === 'submit' ||
      text === 'submit application' ||
      text === 'apply' ||
      text === 'confirm apply'
    ) {
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
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeSuccess()) {
      setTimeout(handleSuccess, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

})();
