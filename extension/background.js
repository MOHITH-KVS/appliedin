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

  let lastHandledUrl = null;

  // Only genuinely FINAL submit labels trigger a completion check.
  // Words like "Apply"/"Register"/"Confirm"/"Done"/"Proceed" are too
  // ambiguous — they're usually the button that just STARTS the flow,
  // not the one that finishes it, so they're deliberately excluded here.
  // The MutationObserver (Method 2 below) remains the real safety net —
  // it only fires once genuine confirmation text actually appears.
  const submitTexts = [
    'submit application',
    'submit your application',
    'submit',
    'send application',
    'confirm application',
    'complete application',
    'finish application',
    'send my application',
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

  // Generic subdomain labels that are never the actual company name —
  // strip these from the front of the hostname before guessing.
  const GENERIC_SUBDOMAINS = [
    'www', 'account', 'accounts', 'apply', 'jobs', 'careers', 'career',
    'portal', 'my', 'app', 'id', 'signin', 'login', 'auth', 'recruiting',
    'recruit', 'talent', 'hire', 'hiring', 'candidate', 'candidates'
  ];

  // Generic headings that are UI chrome, not a job title — never trust
  // these as the role even if they're in an <h1>/<h2>.
  const GENERIC_HEADINGS = [
    'apply', 'submit', 'continue', 'home', 'login', 'sign in', 'sign up',
    'welcome', 'my progress', 'applications', 'profile', 'dashboard',
    'search', 'get started', 'next', 'back', 'save'
  ];

  function guessCompanyFromHostname() {
    const parts = new URL(window.location.href).hostname
      .split('.')
      .filter(Boolean);

    // Drop generic labels from the front (e.g. "account.amazon.jobs" -> "amazon.jobs")
    while (parts.length > 1 && GENERIC_SUBDOMAINS.includes(parts[0].toLowerCase())) {
      parts.shift();
    }

    const candidate = parts[0] || '';
    if (!candidate || GENERIC_SUBDOMAINS.includes(candidate.toLowerCase())) return null;
    return candidate.charAt(0).toUpperCase() + candidate.slice(1);
  }

  function getPageDetails() {
    try {
      const metaCompany =
        document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
        document.querySelector('meta[name="author"]')?.content?.trim() ||
        null;

      const hostnameCompany = guessCompanyFromHostname();
      const company = metaCompany || hostnameCompany || 'Unknown Company';

      const titleCandidates = [
        document.querySelector('meta[property="og:title"]')?.content?.trim(),
        document.querySelector('h1')?.innerText?.trim(),
        document.querySelector('h2')?.innerText?.trim(),
        document.title?.trim()
      ];
      const role = titleCandidates.find(t =>
        t && t.length > 3 && !GENERIC_HEADINGS.includes(t.toLowerCase())
      ) || 'Unknown Role';

      // "Confident" means we're comfortable auto-saving without asking —
      // require both a real company (not just a hostname guess) and a
      // real role, not just fallback text.
      const confident = !!metaCompany && company !== 'Unknown Company' && role !== 'Unknown Role';

      return {
        company,
        role: role.substring(0, 100),
        location: 'Unknown Location',
        platform: platformName,
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied',
        confident
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
        return;
      }

      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        showToast('✅ Application saved — ' + jobData.company, '#22c55e');
      });
    });
  }

  // METHOD 1 — Fast path: if a submit-like click is immediately followed
  // by real confirmation text, save right away without waiting for the
  // MutationObserver. If confirmation ISN'T found, we do nothing here —
  // deliberately no popup fallback in this handler, because many
  // multi-section forms (e.g. Amazon Jobs) have their own per-section
  // "Submit" buttons that aren't the final application submission.
  // Method 2 below is the real authority: it only acts once genuine
  // success text actually appears anywhere on the page.
  document.addEventListener('click', function (e) {
    if (lastHandledUrl === window.location.href) return;

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

    setTimeout(() => {
      if (lastHandledUrl === window.location.href) return;

      const bodyText = document.body.innerText || '';
      const isConfirmed = successPhrases.some(phrase =>
        bodyText.toLowerCase().includes(phrase)
      );

      if (isConfirmed) {
        lastHandledUrl = window.location.href;
        const jobData = getPageDetails();
        if (jobData && jobData.confident) {
          saveApplication(jobData);
        } else {
          showConfirmPopup();
        }
      }
      // Not confirmed — stay silent, this was likely just a section save
    }, 2000);
  });

  // METHOD 2 — Watch DOM for genuine success confirmation message.
  // This is the real authority for both auto-save and the popup fallback —
  // it only fires once real confirmation text is actually on the page,
  // regardless of which button (if any) triggered it.
  const observer = new MutationObserver(function () {
    if (lastHandledUrl === window.location.href) return;

    const bodyText = document.body.innerText || '';
    const isConfirmed = successPhrases.some(phrase =>
      bodyText.toLowerCase().includes(phrase)
    );

    if (isConfirmed) {
      lastHandledUrl = window.location.href;
      setTimeout(() => {
        const jobData = getPageDetails();
        if (jobData && jobData.confident) {
          saveApplication(jobData);
        } else if (jobData) {
          showConfirmPopup();
        }
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

    const overlay = document.createElement('div');
    overlay.id = 'appliedin-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.45);
      z-index: 999998;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    const popup = document.createElement('div');
    popup.id = 'appliedin-confirm';
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 420px;
      max-width: 90vw;
      background: white;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      border: 1px solid #e5e7eb;
    `;

    popup.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:6px;">
        📋 AppliedIn
      </div>
      <div style="font-size:15px;color:#4b5563;margin-bottom:20px;line-height:1.4;">
        Did you complete this application?
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Company name</label>
        <input id="appliedin-company"
          value="${jobData?.company || ''}"
          placeholder="Company name"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          margin-bottom:14px;color:#111827;outline:none;" />
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Job role</label>
        <input id="appliedin-role"
          value="${jobData?.role?.substring(0, 60) || ''}"
          placeholder="Job role"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          color:#111827;outline:none;" />
        <div style="font-size:12px;color:#9ca3af;margin-top:8px;line-height:1.4;">
          ✏️ If the details above look wrong, feel free to edit them before saving.
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="appliedin-yes"
          style="flex:1;padding:12px;background:#22c55e;color:white;
          border:none;border-radius:8px;font-size:14px;
          font-weight:600;cursor:pointer;">
          ✅ Yes, Save
        </button>
        <button id="appliedin-no"
          style="flex:1;padding:12px;background:#f3f4f6;color:#374151;
          border:none;border-radius:8px;font-size:14px;
          font-weight:600;cursor:pointer;">
          ❌ No
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
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

      overlay.remove();
      popup.remove();
      saveApplication(finalData);
    });

    document.getElementById('appliedin-no').addEventListener('click', function () {
      overlay.remove();
      popup.remove();
    });
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