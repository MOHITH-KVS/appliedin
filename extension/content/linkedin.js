// AppliedIn - LinkedIn Content Script
// Captures ONLY on final submission confirmation

(function () {
  console.log('[AppliedIn] linkedin.js loaded on', window.location.href);

  // Tracks the URL we already handled — prevents re-asking on every
  // subsequent DOM mutation once a success message is showing.
  let lastHandledUrl = null;

  function getJobDetails() {
    try {
      const title =
        document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim() ||
        document.querySelector('h1.t-24')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim() ||
        document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim() ||
        'Unknown Company';

      const location =
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
      return null;
    }
  }

  const successPhrases = [
    'your application was sent',
    'application submitted',
    'you\'ve applied',
    'application was sent to',
    'successfully applied'
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
    console.log('[AppliedIn] jobData extracted:', jobData);

    if (jobData && jobData.company !== 'Unknown Company') {
      saveApplication(jobData);
    } else if (jobData) {
      window.__appliedinCommon.showConfirmPopup(jobData, 'LinkedIn', function () {
        // user answered — this URL stays marked as handled
      });
    } else {
      lastHandledUrl = null;
    }
  }

  // METHOD 1 — Detect final "Submit application" button click
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();
    console.log('[AppliedIn] button clicked:', text);

    // Only capture on FINAL submit — not on "Easy Apply" or "Next"
    if (
      text === 'submit application' ||
      text === 'submit' ||
      text === 'done'
    ) {
      if (lastHandledUrl === window.location.href) return;

      setTimeout(() => {
        if (bodyLooksLikeSuccess()) {
          handleSuccess();
        } else {
          console.log('[AppliedIn] submit clicked but no success text found yet');
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success confirmation message in DOM
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
