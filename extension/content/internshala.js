// AppliedIn - Internshala Content Script
// Captures ONLY on submission confirmation

(function () {
  console.log('[AppliedIn] internshala.js loaded on', window.location.href);

  // Tracks the URL we already handled — prevents re-asking on every
  // subsequent DOM mutation once a success message is showing.
  let lastHandledUrl = null;

  function getJobDetails() {
    try {
      const structured = window.__appliedinCommon?.getStructuredJobData?.();

      const title =
        structured?.title ||
        document.querySelector('.profile')?.innerText?.trim() ||
        document.querySelector('[class*="profile-title"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        structured?.company ||
        document.querySelector('.company-name a')?.innerText?.trim() ||
        document.querySelector('.company-name')?.innerText?.trim() ||
        document.querySelector('[class*="company"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        structured?.location ||
        document.querySelector('.location_link')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Work From Home';

      return {
        company,
        role: title,
        location,
        platform: 'Internshala',
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
        location: 'Work From Home',
        platform: 'Internshala',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    }
  }

  const successPhrases = [
    'successfully applied',
    'application submitted',
    'you have applied',
    'your application has been sent',
    'application sent successfully',
    'thank you for applying',
    'has been submitted',
    'has been received'
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
      window.__appliedinCommon.showConfirmPopup(jobData, 'Internshala', function () {
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
      text === 'send application' ||
      text === 'confirm'
    ) {
      if (lastHandledUrl === window.location.href) return;

      setTimeout(() => {
        if (bodyLooksLikeSuccess()) {
          handleSuccess();
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message (debounced)
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
