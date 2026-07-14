// AppliedIn - Indeed Content Script
// Captures ONLY on submission confirmation

(function () {
  let captured = false;

  function getJobDetails() {
    try {
      const title =
        document.querySelector('.jobsearch-JobInfoHeader-title')?.innerText?.trim() ||
        document.querySelector('[class*="jobTitle"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('[data-company-name="true"]')?.innerText?.trim() ||
        document.querySelector('[class*="companyName"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        document.querySelector('[data-testid="job-location"]')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

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

  const successPhrases = [
    'your application was sent',
    'application submitted',
    'you\'ve applied',
    'successfully applied',
    'your resume was sent',
    'application complete'
  ];

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — leave captured as-is
    }, function () {
      captured = false;
    });
  }

  // METHOD 1 — Final submit button
  document.addEventListener('click', function (e) {
    const button = e.target.closest('button');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();

    if (
      text &&
      (text === 'submit' ||
      text === 'continue' ||
      text === 'apply' ||
      text.includes('submit application') ||
      text.includes('submit your application'))
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
          window.__appliedinCommon.showConfirmPopup(jobData, 'Indeed', function () {
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