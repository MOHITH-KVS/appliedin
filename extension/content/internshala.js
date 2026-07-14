// AppliedIn - Internshala Content Script
// Captures ONLY on submission confirmation

(function () {
  let captured = false;

  function getJobDetails() {
    try {
      const title =
        document.querySelector('.profile')?.innerText?.trim() ||
        document.querySelector('[class*="profile-title"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('.company-name a')?.innerText?.trim() ||
        document.querySelector('.company-name')?.innerText?.trim() ||
        document.querySelector('[class*="company"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
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
      return null;
    }
  }

  const successPhrases = [
    'successfully applied',
    'application submitted',
    'you have applied',
    'your application has been sent',
    'application sent successfully',
    'thank you for applying'
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
    const button = e.target.closest('button, a');
    if (!button) return;

    const text = button.innerText?.trim().toLowerCase();

    if (
      text === 'submit' ||
      text === 'submit application' ||
      text === 'send application' ||
      text === 'confirm'
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
          window.__appliedinCommon.showConfirmPopup(jobData, 'Internshala', function () {
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