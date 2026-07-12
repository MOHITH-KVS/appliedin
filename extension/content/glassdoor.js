// AppliedIn - Glassdoor Content Script
// Watches for Apply button clicks and captures job details

(function () {
  let lastCapturedUrl = '';
  let captureTimeout = null;

  function getJobDetails() {
    try {
      const title =
        document.querySelector('[data-test="job-title"]')?.innerText?.trim() ||
        document.querySelector('.job-title')?.innerText?.trim() ||
        document.querySelector('h1[data-test="jobTitle"]')?.innerText?.trim() ||
        document.querySelector('[class*="jobTitle"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('[data-test="employer-name"]')?.innerText?.trim() ||
        document.querySelector('.employer-name')?.innerText?.trim() ||
        document.querySelector('[class*="employerName"]')?.innerText?.trim() ||
        document.querySelector('[class*="employer"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        document.querySelector('[data-test="job-location"]')?.innerText?.trim() ||
        document.querySelector('.location')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company: company,
        role: title,
        location: location,
        platform: 'Glassdoor',
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

      // Duplicate check — same company + role within 24 hours
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
      });
    });
  }

  function showNotification(message, type) {
    const existing = document.getElementById('appliedin-notification');
    if (existing) existing.remove();

    const notification = document.createElement('div');
    notification.id = 'appliedin-notification';
    notification.style.cssText = `
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
    notification.innerText = message;
    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  function watchForApplyButton() {
    document.addEventListener('click', function (e) {
      const button = e.target.closest('button, a');
      if (!button) return;

      const buttonText = button.innerText?.trim().toLowerCase();
      const buttonId = button.id?.toLowerCase() || '';
      const buttonClass = button.className?.toLowerCase() || '';

      // Glassdoor specific apply button detection
      if (
        buttonText.includes('easy apply') ||
        buttonText.includes('apply now') ||
        buttonText.includes('apply') ||
        buttonId.includes('apply') ||
        buttonClass.includes('apply-btn') ||
        buttonClass.includes('applyButton') ||
        buttonClass.includes('easy-apply')
      ) {
        clearTimeout(captureTimeout);
        captureTimeout = setTimeout(() => {
          const currentUrl = window.location.href;
          if (currentUrl === lastCapturedUrl) return;
          lastCapturedUrl = currentUrl;

          const jobData = getJobDetails();
          if (jobData && jobData.company !== 'Unknown Company') {
            saveApplication(jobData);
          }
        }, 1500);
      }
    });
  }

  // Start watching
  watchForApplyButton();
})();