// AppliedIn - Background Service Worker
// Handles company website redirects and universal apply detection

// Platform name detector from URL
function detectPlatform(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();

    const platforms = {
      'linkedin.com': 'LinkedIn',
      'naukri.com': 'Naukri',
      'internshala.com': 'Internshala',
      'indeed.com': 'Indeed',
      'glassdoor.com': 'Glassdoor',
      'glassdoor.co.in': 'Glassdoor',
      'unstop.com': 'Unstop',
      'shine.com': 'Shine',
      'monster.com': 'Monster',
      'monsterindia.com': 'Monster India',
      'foundit.in': 'Foundit',
      'freshersworld.com': 'Freshersworld',
      'hirist.com': 'Hirist',
      'angel.co': 'AngelList',
      'wellfound.com': 'Wellfound',
      'cutshort.io': 'Cutshort',
      'instahyre.com': 'Instahyre',
      'jobdejo.com': 'JobDejo',
      'jobdedo.com': 'JobDedo',
      'apna.co': 'Apna',
      'iimjobs.com': 'IIMJobs',
      'updazz.com': 'Updazz',
      'placementindia.com': 'PlacementIndia',
      'timesjobs.com': 'TimesJobs',
      'careesma.in': 'Careesma',
      'workindia.in': 'WorkIndia',
      'jobhai.com': 'JobHai',
      'careerjet.co.in': 'CareerJet',
      'quikr.com': 'Quikr Jobs',
      'olx.in': 'OLX Jobs',
    };

    for (const [domain, name] of Object.entries(platforms)) {
      if (hostname.includes(domain)) return name;
    }

    // Unknown portal — extract domain name and capitalize
    const parts = hostname.replace('www.', '').split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);

  } catch (e) {
    return 'Unknown Portal';
  }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SHOW_CONFIRM_POPUP') {
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'SHOW_CONFIRM_POPUP',
          data: message.data
        });
      }
    });
  }
  sendResponse({ status: 'ok' });
  return true;
});

// Watch all tabs for URL changes (company website redirects)
chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const url = tab.url.toLowerCase();

  // Skip browser internal pages
  if (
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://')
  ) return;

  // Skip already covered portals — they handle themselves
  const coveredPortals = [
    'linkedin.com',
    'naukri.com',
    'internshala.com',
    'indeed.com',
    'glassdoor.com',
    'glassdoor.co.in',
    'unstop.com'
  ];

  const isCovered = coveredPortals.some(portal => url.includes(portal));
  if (isCovered) return;

  // Check if this looks like a job application page
  const jobKeywords = [
    'career', 'careers', 'jobs', 'job', 'apply',
    'application', 'hiring', 'vacancy', 'vacancies',
    'opening', 'openings', 'recruitment', 'work-with-us',
    'join-us', 'join-our-team', 'opportunities'
  ];

  const isJobPage = jobKeywords.some(keyword => url.includes(keyword));
  if (!isJobPage) return;

  // Inject universal content script into this page
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: injectUniversalTracker,
    args: [detectPlatform(tab.url)]
  }).catch(() => {
    // Silently fail if injection not allowed
  });
});

// Universal tracker injected into any job page
function injectUniversalTracker(platformName) {
  // Don't inject twice
  if (window.__appliedinInjected) return;
  window.__appliedinInjected = true;

  // All possible apply button texts
  const applyTexts = [
    'apply now',
    'apply',
    'easy apply',
    'quick apply',
    'apply for this job',
    'apply for this role',
    'apply for this position',
    'submit application',
    'submit',
    'register',
    'register now',
    'participate',
    'apply for internship',
    'apply for job',
    'one click apply',
    'instant apply',
    'apply with linkedin',
    'apply with naukri',
    'apply with resume',
    'apply with profile',
    'express apply',
    'fast apply',
    'apply in seconds',
    'apply online',
    'apply here',
    'apply today',
    'apply for this opening',
    'apply for this vacancy',
    'send application',
    'send my application',
    'continue to apply',
    'proceed to apply',
    'complete application',
    'finish application',
    'confirm application'
  ];

  let lastShownUrl = '';

  document.addEventListener('click', function (e) {
    const element = e.target.closest('button, a, input[type="submit"], input[type="button"]');
    if (!element) return;

    const text = (
      element.innerText ||
      element.value ||
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      ''
    ).toLowerCase().trim();

    const isApplyButton = applyTexts.some(applyText =>
      text.includes(applyText)
    );

    if (!isApplyButton) return;
    if (window.location.href === lastShownUrl) return;
    lastShownUrl = window.location.href;

    // Get job details from page
    setTimeout(() => {
      const title =
        document.querySelector('h1')?.innerText?.trim() ||
        document.querySelector('h2')?.innerText?.trim() ||
        document.title?.trim() ||
        'Unknown Role';

      const companyMeta =
        document.querySelector('meta[property="og:site_name"]')?.content ||
        document.querySelector('meta[name="author"]')?.content ||
        '';

      const company = companyMeta ||
        new URL(window.location.href).hostname.replace('www.', '').split('.')[0] ||
        'Unknown Company';

      // Show confirmation popup
      showConfirmPopup(company, title, platformName);
    }, 1500);
  });

  function showConfirmPopup(company, role, platform) {
    // Remove existing popup
    const existing = document.getElementById('appliedin-confirm');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'appliedin-confirm';
    popup.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 300px;
      background: white;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      border: 1px solid #e5e7eb;
    `;

    popup.innerHTML = `
      <div style="font-size:13px; font-weight:600; color:#111827; margin-bottom:4px;">
        👋 AppliedIn
      </div>
      <div style="font-size:12px; color:#6b7280; margin-bottom:12px;">
        Did you complete this application?
      </div>
      <div style="margin-bottom:12px;">
        <input id="appliedin-company" value="${company}" placeholder="Company name"
          style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #e5e7eb;
          border-radius:6px; font-size:12px; margin-bottom:6px; color:#111827;" />
        <input id="appliedin-role" value="${role.substring(0, 60)}" placeholder="Job role"
          style="width:100%; box-sizing:border-box; padding:6px 10px; border:1px solid #e5e7eb;
          border-radius:6px; font-size:12px; color:#111827;" />
      </div>
      <div style="display:flex; gap:8px;">
        <button id="appliedin-yes" style="flex:1; padding:8px; background:#22c55e; color:white;
          border:none; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer;">
          ✅ Yes, Save it
        </button>
        <button id="appliedin-no" style="flex:1; padding:8px; background:#f3f4f6; color:#374151;
          border:none; border-radius:6px; font-size:12px; font-weight:500; cursor:pointer;">
          ❌ Skip
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    // Yes button
    document.getElementById('appliedin-yes').addEventListener('click', function () {
      const finalCompany = document.getElementById('appliedin-company').value.trim();
      const finalRole = document.getElementById('appliedin-role').value.trim();

      const jobData = {
        company: finalCompany || company,
        role: finalRole || role,
        location: 'Unknown Location',
        platform: platform,
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };

      chrome.storage.local.get(['applications'], function (result) {
        const applications = result.applications || [];

        const isDuplicate = applications.some(app =>
          app.company.toLowerCase() === jobData.company.toLowerCase() &&
          app.role.toLowerCase() === jobData.role.toLowerCase() &&
          (new Date() - new Date(app.date)) < 24 * 60 * 60 * 1000
        );

        if (isDuplicate) {
          popup.remove();
          showToast('⚠️ Already applied here recently!', '#f59e0b');
          return;
        }

        applications.unshift(jobData);
        chrome.storage.local.set({ applications }, function () {
          popup.remove();
          showToast('✅ Application saved — ' + jobData.company, '#22c55e');
        });
      });
    });

    // No button
    document.getElementById('appliedin-no').addEventListener('click', function () {
      popup.remove();
    });

    // Auto dismiss after 15 seconds
    setTimeout(() => {
      if (document.getElementById('appliedin-confirm')) {
        popup.remove();
      }
    }, 15000);
  }

  function showToast(message, color) {
    const toast = document.createElement('div');
    toast.style.cssText = `
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
      background: ${color};
      color: white;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}