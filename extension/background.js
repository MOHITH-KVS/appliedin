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

  // Guard: popup already open — don't interrupt user typing
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }

  // FIX BUG 2: Use a Set to track ALL handled URLs, not just the last one.
  // Previously lastHandledUrl only stored ONE url, so after user dismissed
  // the popup by clicking No/close, it was still that same URL and the observer
  // kept re-triggering. Now once a URL is handled (popup shown OR saved),
  // it NEVER shows again in this tab session.
  const handledUrls = new Set();
  let observerActive = true; // false once popup opens — locks it

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

  // Success confirmation phrases — includes Google Forms specific phrases
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
    'application confirmation',
    // Google Forms specific
    'your response has been recorded',
    'your response has been submitted',
    'thanks for submitting',
    'form submitted',
    'response recorded'
  ];

  // FIX BUG 1: Domains where we KNOW the detected company will be wrong.
  // These are form/survey hosts, not the actual company.
  // For these we skip auto-save and ALWAYS show the confirm popup so the
  // user can type the real company name.
  const ambiguousDomains = [
    'docs.google.com',
    'forms.google.com',
    'forms.gle',
    'typeform.com',
    'jotform.com',
    'surveymonkey.com',
    'airtable.com',
    'notion.so',
    'zohorecruit.com',
    'zoho.com',
    'freshteam.com',
    'keka.com',
    'darwinbox.com',
    'greythr.com',
    'bamboohr.com',
    'forms.microsoft.com',
    'office.com',
  ];

  function isAmbiguousDomain() {
    const hostname = window.location.hostname.toLowerCase();
    return ambiguousDomains.some(d => hostname.includes(d));
  }

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
        return;
      }

      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        showToast('✅ Application saved — ' + jobData.company, '#22c55e');
      });
    });
  }

  // METHOD 1 — Detect submit button click
  document.addEventListener('click', function (e) {
    // FIX BUG 2: check the Set, not a single variable
    if (handledUrls.has(window.location.href)) return;

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
      if (!observerActive) return; // popup locked
      if (handledUrls.has(window.location.href)) return;

      const bodyText = document.body.innerText || '';
      const isConfirmed = successPhrases.some(phrase =>
        bodyText.toLowerCase().includes(phrase)
      );

      if (isConfirmed) {
        handledUrls.add(window.location.href); // FIX BUG 2: mark as handled

        // FIX BUG 1: if ambiguous domain, always ask user even if success detected
        if (isAmbiguousDomain()) {
          const jobData = getPageDetails();
          showConfirmPopup(jobData, true,
            function () { handledUrls.add(window.location.href); }, // onDone
            function () { observerActive = false; }                  // onOpen
          );
        } else {
          const jobData = getPageDetails();
          if (jobData) saveApplication(jobData);
        }
      } else if (!handledUrls.has(window.location.href)) {
        handledUrls.add(window.location.href); // FIX BUG 2: mark as handled
        showConfirmPopup(null, false);
      }
    }, 2000);
  });

  // METHOD 2 — Watch DOM for success confirmation message
  const observer = new MutationObserver(function () {
    // FIX BUG 2: check the Set
    if (!observerActive) return; // popup locked open
    if (handledUrls.has(window.location.href)) return;

    const bodyText = document.body.innerText || '';
    const isConfirmed = successPhrases.some(phrase =>
      bodyText.toLowerCase().includes(phrase)
    );

    if (isConfirmed) {
      handledUrls.add(window.location.href); // FIX BUG 2: mark as handled immediately

      setTimeout(() => {
        // FIX BUG 1: ambiguous domain → always show popup with empty company field
        if (isAmbiguousDomain()) {
          const jobData = getPageDetails();
          showConfirmPopup(jobData, true);
        } else {
          const jobData = getPageDetails();
          if (jobData) saveApplication(jobData);
        }
      }, 1000);
    }
  });

  // BUG 5 FIX (pre-emptive): remove characterData — not needed, just costs CPU
  observer.observe(document.body, {
    childList: true,
    subtree: true
    // characterData removed — we only need node additions, not text changes
  });

  // Confirmation popup
  // FIX BUG 1: alreadyConfirmed = true means success was detected, we just
  // need the user to fill in the correct company name (Google Forms case).
  // alreadyConfirmed = false means we're uncertain, so we ask "did you apply?"
  function showConfirmPopup(jobData, alreadyConfirmed, onDone, onOpen) {
    const existing = document.getElementById('appliedin-confirm');
    if (existing) return; // popup already open, don't duplicate

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

    // FIX BUG 1: if ambiguous domain, company field starts EMPTY and is highlighted
    // so user is forced to type the real company name. We show a clear message
    // explaining why we can't auto-detect it.
    const isAmbiguous = isAmbiguousDomain();
    const companyValue = isAmbiguous ? '' : (jobData?.company || '');
    const roleValue = isAmbiguous
      ? (document.title?.replace(' - Google Forms', '').replace('Apply Now', '').trim() || '')
      : (jobData?.role?.substring(0, 60) || '');

    const questionText = alreadyConfirmed
      ? '✅ Application submitted! <br><span style="font-size:13px;color:#6b7280;">Enter the company name to save it correctly.</span>'
      : 'Did you complete this application?';

    const companyHint = isAmbiguous
      ? '<div style="font-size:11px;color:#ef4444;margin-top:4px;">⚠️ We can\'t auto-detect the company from this form. Please type it.</div>'
      : '';

    popup.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:6px;">
        📋 AppliedIn
      </div>
      <div style="font-size:15px;color:#4b5563;margin-bottom:20px;line-height:1.5;">
        ${questionText}
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Company name</label>
        <input id="appliedin-company"
          value="${companyValue}"
          placeholder="e.g. Razorpay, Zomato, TCS..."
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:2px solid ${isAmbiguous ? '#ef4444' : '#e5e7eb'};border-radius:8px;font-size:14px;
          margin-bottom:4px;color:#111827;outline:none;" />
        ${companyHint}
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;margin-top:12px;">Job role</label>
        <input id="appliedin-role"
          value="${roleValue}"
          placeholder="e.g. Software Engineer, Data Analyst..."
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          color:#111827;outline:none;" />
      </div>
      <div style="display:flex;gap:10px;">
        <button id="appliedin-yes"
          style="flex:1;padding:12px;background:#22c55e;color:white;
          border:none;border-radius:8px;font-size:14px;
          font-weight:600;cursor:pointer;">
          ✅ Save Application
        </button>
        <button id="appliedin-no"
          style="flex:1;padding:12px;background:#f3f4f6;color:#374151;
          border:none;border-radius:8px;font-size:14px;
          font-weight:600;cursor:pointer;">
          ❌ ${alreadyConfirmed ? 'Skip' : 'No'}
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    if (onOpen) onOpen(); // lock observer

    // Auto-focus company field so user can type immediately
    setTimeout(() => {
      document.getElementById('appliedin-company')?.focus();
    }, 100);

    document.getElementById('appliedin-yes').addEventListener('click', function () {
      const finalCompany = document.getElementById('appliedin-company').value.trim();
      const finalRole = document.getElementById('appliedin-role').value.trim();

      if (!finalCompany) {
        document.getElementById('appliedin-company').style.border = '2px solid #ef4444';
        document.getElementById('appliedin-company').placeholder = 'Company name is required!';
        return;
      }
      if (!finalRole) {
        document.getElementById('appliedin-role').style.border = '2px solid #ef4444';
        document.getElementById('appliedin-role').placeholder = 'Job role is required!';
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
      // FIX BUG 2: mark as handled after user clicks Yes — won't re-appear
      handledUrls.add(window.location.href);
      saveApplication(finalData);
    });

    document.getElementById('appliedin-no').addEventListener('click', function () {
      overlay.remove();
      popup.remove();
      // FIX BUG 2: mark as handled after No too — won't re-appear even if
      // user dismissed it. They made a conscious choice.
      handledUrls.add(window.location.href);
    });

    // Close on overlay click
    overlay.addEventListener('click', function () {
      overlay.remove();
      popup.remove();
      // FIX BUG 2: also mark handled on overlay dismiss
      handledUrls.add(window.location.href);
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

// ── FIX BUG 1: Message handler for content script → IndexedDB saves ──
// Content scripts can't open the popup's IndexedDB directly.
// They send a message here; background worker writes using chrome.storage.local
// (the background acts as a relay — popup reads from IndexedDB, background
// writes to chrome.storage.local as a temporary bridge until the popup
// migrates everything to IndexedDB on next open).
// In practice this means: content script saves go to chrome.storage.local,
// popup migrates them to IndexedDB on next open. Zero data loss.

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.type !== 'SAVE_APPLICATION') return false;

  const jobData = message.data;
  if (!jobData || !jobData.company || !jobData.role) {
    sendResponse({ saved: false, error: 'missing fields' });
    return true;
  }

  chrome.storage.local.get(['applications'], function (result) {
    const applications = result.applications || [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const isDuplicate = applications.some(app =>
      app.company.toLowerCase() === jobData.company.toLowerCase() &&
      app.role.toLowerCase()    === jobData.role.toLowerCase()    &&
      new Date(app.date).getTime() > cutoff
    );

    if (isDuplicate) {
      sendResponse({ saved: false, duplicate: true });
      return;
    }

    applications.unshift(jobData);
    chrome.storage.local.set({ applications }, function () {
      sendResponse({ saved: true });
    });
  });

  return true; // keep message channel open for async response
});
