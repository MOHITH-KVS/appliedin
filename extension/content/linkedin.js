// AppliedIn - LinkedIn Content Script
// Captures ONLY on final submission confirmation

(function () {
  let captured = false;

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
      // duplicate — leave captured as-is
    }, function () {
      captured = false;
    });
  }

  // METHOD 1 — Detect final "Submit application" button click
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();

    // Only capture on FINAL submit — not on "Easy Apply" or "Next"
    if (
      text === 'submit application' ||
      text === 'submit' ||
      text === 'done'
    ) {
      if (captured) return;
      captured = true;

      setTimeout(() => {
        const jobData = getJobDetails();
        const bodyText = (document.body.innerText || '').toLowerCase();
        const successDetected = successPhrases.some(p => bodyText.includes(p));

        if (jobData && jobData.company !== 'Unknown Company' && successDetected) {
          saveApplication(jobData);
        } else if (jobData) {
          // Not confident — ask the user instead of silently dropping it
          window.__appliedinCommon.showConfirmPopup(jobData, 'LinkedIn', function () {
            captured = false;
          });
        } else {
          captured = false;
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success confirmation message in DOM
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