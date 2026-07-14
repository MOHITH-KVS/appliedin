// AppliedIn - Unstop Content Script
// Captures on submission confirmation, with a manual-confirm fallback
// for anything the automatic detection can't be sure about.

(function () {
  console.log('[AppliedIn] unstop.js loaded on', window.location.href);

  // Tracks the URL we already handled — prevents re-asking on every
  // subsequent DOM mutation on a static "success" page.
  let lastHandledUrl = null;

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
      const title = titleCandidates.find(t => t && !isGenericText(t)) || 'Unknown Role';

      const companyCandidates = [
        document.querySelector('.company-name')?.innerText?.trim(),
        document.querySelector('[class*="org-name"]')?.innerText?.trim(),
        document.querySelector('[class*="company"]')?.innerText?.trim()
      ];
      const company = companyCandidates.find(c => c && !isGenericText(c)) || 'Unknown Company';

      const location =
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

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

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — this URL stays marked as handled, no re-prompt
    }, function () {
      // saved — this URL stays marked as handled, no re-prompt
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

    const jobData = getJobDetails();
    console.log('[AppliedIn] jobData extracted:', jobData);

    if (jobData && jobData.company !== 'Unknown Company') {
      saveApplication(jobData);
    } else if (jobData) {
      console.log('[AppliedIn] company unknown, showing confirm popup');
      window.__appliedinCommon.showConfirmPopup(jobData, 'Unstop', function () {
        // user answered — this URL stays marked as handled
      });
    } else {
      // couldn't read anything — allow a later mutation to retry
      lastHandledUrl = null;
    }
  }

  // METHOD 0 — Page loaded directly on a success/confirmation URL or state.
  // Unstop navigates to a brand-new URL (…/register/success) after
  // registering, so a MutationObserver alone would never see this happen
  // (the text is already there by the time we attach).
  const immediateUrlSuccess = urlLooksLikeSuccess();
  const immediateTextSuccess = textLooksLikeSuccess();
  console.log('[AppliedIn] immediate check:', { immediateUrlSuccess, immediateTextSuccess, url: window.location.href });

  if (immediateUrlSuccess || immediateTextSuccess) {
    setTimeout(handleSuccess, 500);
  }

  // METHOD 1 — Final submit/register button click
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button, a');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();

    if (
      text === 'submit' ||
      text === 'register' ||
      text === 'confirm registration' ||
      text === 'confirm' ||
      text === 'participate'
    ) {
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
