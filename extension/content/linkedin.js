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

  function saveApplication(jobData) {
    chrome.storage.local.get(['applications'], function (result) {
      const applications = result.applications || [];

      const isDuplicate = applications.some(app =>
        app.company.toLowerCase() === jobData.company.toLowerCase() &&
        app.role.toLowerCase() === jobData.role.toLowerCase() &&
        (new Date() - new Date(app.date)) < 24 * 60 * 60 * 1000
      );

      if (isDuplicate) {
        showNotification('⚠️ Already applied here recently!', 'warning');
        return;
      }

      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        showNotification('✅ Application saved — ' + jobData.company, 'success');
        captured = false;
      });
    });
  }

  function showNotification(message, type) {
    const existing = document.getElementById('appliedin-notification');
    if (existing) existing.remove();

    const n = document.createElement('div');
    n.id = 'appliedin-notification';
    n.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: opacity 0.3s ease;
      background: ${type === 'success' ? '#22c55e' : '#f59e0b'};
      color: white;
    `;
    n.innerText = message;
    document.body.appendChild(n);

    setTimeout(() => {
      n.style.opacity = '0';
      setTimeout(() => n.remove(), 300);
    }, 3000);
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
        if (jobData && jobData.company !== 'Unknown Company') {
          saveApplication(jobData);
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

    const successPhrases = [
      'your application was sent',
      'application submitted',
      'you\'ve applied',
      'application was sent to',
      'successfully applied'
    ];

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