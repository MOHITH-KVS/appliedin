// AppliedIn - Unstop Content Script
// Captures on submission confirmation, with a manual-confirm fallback
// for anything the automatic detection can't be sure about.

(function () {
  console.log('[AppliedIn] unstop.js loaded on', window.location.href);
  let captured = false;

  const GENERIC_PHRASES = [
    'registration successful', 'successfully registered', 'application submitted',
    'thank you for registering', 'participation confirmed', 'success'
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
      return null;
    }
  }

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — leave captured as-is
    }, function () {
      captured = false;
    });
  }

  // METHOD 0 — Page loaded directly on a success/confirmation URL or state
  // Unstop navigates to a brand-new URL (…/register/success) after registering,
  // so by the time this script attaches, the confirmation text is already
  // present — a MutationObserver alone will never see it change.
  function checkImmediateSuccess() {
    if (captured) return;

    const url = window.location.href.toLowerCase();
    const bodyText = document.body.innerText || '';

    const urlLooksLikeSuccess = url.includes('/success') || url.includes('rstatus=1');
    const textLooksLikeSuccess = successPhrases.some(phrase => bodyText.toLowerCase().includes(phrase));

    console.log('[AppliedIn] checkImmediateSuccess:', { urlLooksLikeSuccess, textLooksLikeSuccess });

    if (urlLooksLikeSuccess || textLooksLikeSuccess) {
      captured = true;
      setTimeout(() => {
        const jobData = getJobDetails();
        console.log('[AppliedIn] jobData extracted:', jobData);
        if (jobData && jobData.company !== 'Unknown Company') {
          saveApplication(jobData);
        } else if (jobData) {
          console.log('[AppliedIn] company unknown, showing confirm popup');
          // We know it succeeded (URL/text confirms it) but couldn't
          // read the company/role — ask the user to fill it in.
          window.__appliedinCommon.showConfirmPopup(jobData, 'Unstop', function () {
            captured = false;
          });
        } else {
          captured = false;
        }
      }, 500);
    }
  }

  checkImmediateSuccess();

  // METHOD 1 — Final submit button
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
      if (captured) return;
      captured = true;

      setTimeout(() => {
        const jobData = getJobDetails();
        const bodyText = (document.body.innerText || '').toLowerCase();
        const url = window.location.href.toLowerCase();
        const successDetected = successPhrases.some(p => bodyText.includes(p)) ||
          url.includes('/success') || url.includes('rstatus=1');

        if (jobData && jobData.company !== 'Unknown Company' && successDetected) {
          saveApplication(jobData);
        } else if (jobData) {
          window.__appliedinCommon.showConfirmPopup(jobData, 'Unstop', function () {
            captured = false;
          });
        } else {
          captured = false;
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message
  const observer = new MutationObserver(function () {
    if (captured) return;

    const bodyText = document.body.innerText || '';

    const found = successPhrases.some(phrase =>
      bodyText.toLowerCase().includes(phrase)
    );

    if (found) {
      captured = true;
      setTimeout(() => {
        const jobData = getJobDetails();
        if (jobData && jobData.company !== 'Unknown Company') {
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
