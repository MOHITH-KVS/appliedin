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
        if (jobData && jobData.company !== 'Unknown Company') {
          saveApplication(jobData);
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

    const successPhrases = [
      'successfully applied',
      'application submitted',
      'you have applied',
      'your application has been sent',
      'application sent successfully',
      'thank you for applying'
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