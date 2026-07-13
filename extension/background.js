// AppliedIn - Background Service Worker
// Handles ALL websites universally — captures on confirmation only

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
      'workindia.in': 'WorkIndia',
      'jobhai.com': 'JobHai',
      'quikr.com': 'Quikr Jobs',
      'workday.com': 'Company Website',
      'greenhouse.io': 'Company Website',
      'lever.co': 'Company Website',
      'smartrecruiters.com': 'Company Website',
      'taleo.net': 'Company Website',
      'icims.com': 'Company Website',
      'successfactors.com': 'Company Website',
      'myworkdayjobs.com': 'Company Website',
      'careers.google.com': 'Google Careers',
      'amazon.jobs': 'Amazon Jobs',
      'infosys.com': 'Infosys',
      'tcs.com': 'TCS',
      'wipro.com': 'Wipro',
      'hcltech.com': 'HCL',
      'cognizant.com': 'Cognizant',
      'accenture.com': 'Accenture',
      'capgemini.com': 'Capgemini',
      'deloitte.com': 'Deloitte',
      'ibm.com': 'IBM',
      'microsoft.com': 'Microsoft',
    };

    for (const [domain, name] of Object.entries(platforms)) {
      if (hostname.includes(domain)) return name;
    }

    // Unknown portal — extract and capitalize domain name
    const parts = hostname.replace('www.', '').split('.');
    return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);

  } catch (e) {
    return 'Company Website';
  }
}

// Watch all tabs for URL changes
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

  // Check if this looks like a job related page
  const jobKeywords = [
    'career', 'careers', 'jobs', 'job', 'apply',
    'application', 'hiring', 'vacancy', 'vacancies',
    'opening', 'openings', 'recruitment', 'work-with-us',
    'join-us', 'join-our-team', 'opportunities', 'workday',
    'greenhouse', 'lever', 'taleo', 'icims', 'smartrecruiters'
  ];

  const isJobPage = jobKeywords.some(keyword => url.includes(keyword));
  if (!isJobPage) return;

  // Inject universal tracker into this page
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: injectUniversalTracker,
    args: [detectPlatform(tab.url)]
  }).catch(() => {
    // Silently fail if page doesn't allow injection
  });
});

// Universal tracker — injected into any job page
// Captures ONLY on confirmation — not on first click
function injectUniversalTracker(platformName) {
  if (window.__appliedinInjected) return;
  window.__appliedinInjected = true;

  let captured = false;

  // All final submit button texts
  const submitTexts = [
    'submit application',
    'submit your application',
    'submit',
    'send application',
    'confirm application',
    'complete application',
    'finish application',
    'confirm',
    'done',
    'proceed',
    'send my application',
    'apply now',
    'apply',
    'register now',
    'register',
    'participate',
    'confirm registration',
    'complete registration'
  ];

  // Success confirmation phrases
  const successPhrases = [
    'application submitted',
    'application received',
    'application complete',
    'successfully applied',
    'successfully submitted',
    'your application has been sent',
    'your application was sent',
    'you have applied',
    'you\'ve applied',
    'thank you for applying',
    'thank you for your application',
    'we have received your application',
    'your resume was sent',
    'application sent successfully',
    'registration successful',
    'successfully registered',
    'thank you for registering',
    'participation confirmed',
    'you have registered',
    'application confirmation'
  ];

  function getPageDetails() {
    try {
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
        new URL(window.location.href).hostname
          .replace('www.', '')
          .replace('careers.', '')
          .replace('jobs.', '')
          .split('.')[0] ||
        'Unknown Company';

      return {
        company: company.charAt(0).toUpperCase() + company.slice(1),
        role: title.substring(0, 100),
        location: 'Unknown Location',
        platform: platformName,
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
        showToast('⚠️ Already applied here recently!', '#f59e0b');
        captured = false;
        return;
      }

      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        showToast('✅ Application saved — ' + jobData.company, '#22c55e');
        captured = false;
      });
    });
  }

  // METHOD 1 — Detect submit button click
  // Shows confirmation popup to verify before saving
  document.addEventListener('click', function (e) {
    if (captured) return;

    const element = e.target.closest('button, input[type="submit"], input[type="button"], a');
    if (!element) return;

    const text = (
      element.innerText ||
      element.value ||
      element.getAttribute('aria-label') ||
      element.getAttribute('title') ||
      ''
    ).toLowerCase().trim();

    const isSubmitButton = submitTexts.some(t => text === t || text.includes(t));
    if (!isSubmitButton) return;

    captured = true;

    // Wait for page to show confirmation
    setTimeout(() => {
      const bodyText = document.body.innerText || '';
      const isConfirmed = successPhrases.some(phrase =>
        bodyText.toLowerCase().includes(phrase)
      );

      if (isConfirmed) {
        // Auto save — confirmation detected
        const jobData = getPageDetails();
        if (jobData) saveApplication(jobData);
      } else {
        // Show manual confirmation popup
        showConfirmPopup();
      }
    }, 2000);
  });

  // METHOD 2 — Watch DOM for success confirmation message
  const observer = new MutationObserver(function () {
    if (captured) return;

    const bodyText = document.body.innerText || '';
    const isConfirmed = successPhrases.some(phrase =>
      bodyText.toLowerCase().includes(phrase)
    );

    if (isConfirmed) {
      captured = true;
      setTimeout(() => {
        const jobData = getPageDetails();
        if (jobData) saveApplication(jobData);
      }, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

  // Confirmation popup — shown when auto detection is uncertain
  function showConfirmPopup() {
    const existing = document.getElementById('appliedin-confirm');
    if (existing) existing.remove();

    const jobData = getPageDetails();

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
      <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px;">
        📋 AppliedIn
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">
        Did you complete this application?
      </div>
      <div style="margin-bottom:12px;">
        <input id="appliedin-company"
          value="${jobData?.company || ''}"
          placeholder="Company name"
          style="width:100%;box-sizing:border-box;padding:6px 10px;
          border:1px solid #e5e7eb;border-radius:6px;font-size:12px;
          margin-bottom:6px;color:#111827;outline:none;" />
        <input id="appliedin-role"
          value="${jobData?.role?.substring(0, 60) || ''}"
          placeholder="Job role"
          style="width:100%;box-sizing:border-box;padding:6px 10px;
          border:1px solid #e5e7eb;border-radius:6px;font-size:12px;
          color:#111827;outline:none;" />
      </div>
      <div style="display:flex;gap:8px;">
        <button id="appliedin-yes"
          style="flex:1;padding:8px;background:#22c55e;color:white;
          border:none;border-radius:6px;font-size:12px;
          font-weight:500;cursor:pointer;">
          ✅ Yes, Save
        </button>
        <button id="appliedin-no"
          style="flex:1;padding:8px;background:#f3f4f6;color:#374151;
          border:none;border-radius:6px;font-size:12px;
          font-weight:500;cursor:pointer;">
          ❌ No
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    document.getElementById('appliedin-yes').addEventListener('click', function () {
      const finalCompany = document.getElementById('appliedin-company').value.trim();
      const finalRole = document.getElementById('appliedin-role').value.trim();

      if (!finalCompany || !finalRole) {
        alert('Please enter company and role.');
        return;
      }

      const finalData = {
        company: finalCompany,
        role: finalRole,
        location: 'Unknown Location',
        platform: platformName,
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };

      popup.remove();
      saveApplication(finalData);
    });

    document.getElementById('appliedin-no').addEventListener('click', function () {
      popup.remove();
      captured = false;
    });

    // Auto dismiss after 20 seconds
    setTimeout(() => {
      if (document.getElementById('appliedin-confirm')) {
        popup.remove();
        captured = false;
      }
    }, 20000);
  }

  function showToast(message, color) {
    const existing = document.getElementById('appliedin-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'appliedin-toast';
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
      transition: opacity 0.3s ease;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
}