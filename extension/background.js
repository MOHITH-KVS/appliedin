// AppliedIn - Background Service Worker
// Handles ALL websites universally — captures on confirmation only

// ── Google Analytics (GA4 Measurement Protocol) ──
// Chrome extensions (Manifest V3) can't load Google's regular gtag.js
// script due to CSP restrictions on remotely-hosted code, so we send
// events as plain HTTPS requests instead — Google's own recommended
// approach for extensions. Analytics failures are always swallowed
// silently; they must never affect the extension's actual job-tracking.
const GA_MEASUREMENT_ID = 'G-YRR8V9LW8D';
const GA_API_SECRET = 'vJrg6JjDTmClwwAbtkZ1oA';

function getOrCreateClientId(callback) {
  chrome.storage.local.get(['appliedin_ga_client_id'], function (result) {
    if (result.appliedin_ga_client_id) {
      callback(result.appliedin_ga_client_id);
      return;
    }
    const newId = (self.crypto?.randomUUID?.() || (Date.now() + '-' + Math.random().toString(36).slice(2)));
    chrome.storage.local.set({ appliedin_ga_client_id: newId }, function () {
      callback(newId);
    });
  });
}

function sendGAEvent(eventName, params) {
  getOrCreateClientId(function (clientId) {
    fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: 'POST',
        body: JSON.stringify({
          client_id: clientId,
          events: [{ name: eventName, params: params || {} }]
        })
      }
    ).catch(() => {
      // Analytics is best-effort — never let a network hiccup here
      // affect anything else the extension does.
    });
  });
}

chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') {
    sendGAEvent('extension_installed', { version: chrome.runtime.getManifest().version });
  } else if (details.reason === 'update') {
    sendGAEvent('extension_updated', {
      version: chrome.runtime.getManifest().version,
      previous_version: details.previousVersion
    });
  }
});

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

// ── Universal manual capture ──
// This is the real backup plan for pages the automatic detection never
// even watches (URL has no job-related keyword), or where the page is
// structurally unreadable (canvas UI, image-based confirmation, opaque
// iframe). It works on literally ANY page, completely independent of the
// job-keyword gate below — triggered by right-click or a keyboard shortcut,
// never by automatic detection.

chrome.runtime.onInstalled.addListener(function () {
  chrome.contextMenus.create({
    id: 'appliedin-manual-log',
    title: '📋 Log this application with AppliedIn',
    contexts: ['page', 'selection', 'link']
  });
});

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'appliedin-manual-log' && tab?.id) {
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectManualCapture
    }).catch((err) => {
      console.log('[AppliedIn] manual capture injection failed:', err);
    });
  }
});

chrome.commands.onCommand.addListener(function (command) {
  if (command !== 'log-application') return;
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const tab = tabs[0];
    if (!tab?.id) return;
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: injectManualCapture
    }).catch((err) => {
      console.log('[AppliedIn] manual capture injection failed:', err);
    });
  });
});

// Self-contained (MV3 injected functions can't reference outside scope) —
// does a lightweight best-effort read of the current page, then always
// shows an editable popup so the person can confirm or correct before
// saving. Deliberately simpler than the full detection pipeline, since
// this is a manual trigger — the person already knows they want to log
// something, we're just saving them from typing everything from scratch.
function injectManualCapture() {
  if (document.getElementById('appliedin-confirm')) return; // already open

  function guessCompany() {
    const meta =
      document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
      document.querySelector('meta[name="author"]')?.content?.trim();
    if (meta) return meta;

    try {
      const parts = new URL(window.location.href).hostname.split('.').filter(Boolean);
      const generic = ['www', 'account', 'accounts', 'apply', 'jobs', 'careers', 'career', 'portal', 'my', 'app'];
      while (parts.length > 1 && generic.includes(parts[0].toLowerCase())) parts.shift();
      const candidate = parts[0];
      if (candidate && !generic.includes(candidate.toLowerCase())) {
        return candidate.charAt(0).toUpperCase() + candidate.slice(1);
      }
    } catch (e) { /* ignore */ }
    return '';
  }

  function guessRole() {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content?.trim();
    if (ogTitle && ogTitle.length <= 100) return ogTitle;
    return '';
  }

  const overlay = document.createElement('div');
  overlay.id = 'appliedin-overlay';
  overlay.style.cssText = `
    position: fixed; top:0; left:0; right:0; bottom:0;
    background: rgba(0,0,0,0.45); z-index: 999998;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
  `;

  const popup = document.createElement('div');
  popup.id = 'appliedin-confirm';
  popup.style.cssText = `
    position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 420px; max-width: 90vw; background: white; border-radius: 16px;
    padding: 28px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    border: 1px solid #e5e7eb;
  `;

  const guessedCompany = guessCompany();
  const guessedRole = guessRole();

  popup.innerHTML = `
    <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:6px;">
      📋 Log this application
    </div>
    <div style="font-size:15px;color:#4b5563;margin-bottom:20px;line-height:1.4;">
      Add the company and role — we'll save it to your AppliedIn list.
    </div>
    <div style="margin-bottom:20px;">
      <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Company name</label>
      <input id="appliedin-company" value="${guessedCompany.replace(/"/g, '&quot;')}"
        placeholder="${guessedCompany ? 'Company name' : "Type the company name"}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #e5e7eb;
        border-radius:8px;font-size:14px;margin-bottom:14px;color:#111827;outline:none;pointer-events:auto !important;user-select:text !important;-webkit-user-select:text !important;cursor:text !important;" />
      <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Job role</label>
      <input id="appliedin-role" value="${guessedRole.replace(/"/g, '&quot;')}"
        placeholder="${guessedRole ? 'Job role' : "Type the job role"}"
        style="width:100%;box-sizing:border-box;padding:10px 12px;border:1.5px solid #e5e7eb;
        border-radius:8px;font-size:14px;color:#111827;outline:none;pointer-events:auto !important;user-select:text !important;-webkit-user-select:text !important;cursor:text !important;" />
    </div>
    <div style="display:flex;gap:10px;">
      <button id="appliedin-yes" style="flex:1;padding:12px;background:#22c55e;color:white;
        border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">✅ Save</button>
      <button id="appliedin-no" style="flex:1;padding:12px;background:#f3f4f6;color:#374151;
        border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">❌ Cancel</button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(popup);
  document.getElementById('appliedin-company').focus();

  document.getElementById('appliedin-yes').addEventListener('click', function () {
    const company = document.getElementById('appliedin-company').value.trim();
    const role = document.getElementById('appliedin-role').value.trim();

    if (!company || !role) {
      alert('Please enter both company and role.');
      return;
    }

    const jobData = {
      company,
      role,
      location: 'Unknown Location',
      platform: 'Manual',
      url: window.location.href,
      date: new Date().toISOString(),
      status: 'Applied'
    };

    chrome.storage.local.get(['applications'], function (result) {
      const applications = result.applications || [];
      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        chrome.runtime.sendMessage({ type: 'appliedin_saved', platform: 'Manual', method: 'manual_entry' }).catch(() => {});
        overlay.remove();
        popup.remove();
      });
    });
  });

  document.getElementById('appliedin-no').addEventListener('click', function () {
    overlay.remove();
    popup.remove();
  });
}

// ── Persistent badge state ──
// A 3-second toast is easy to miss entirely if you're not looking at that
// exact moment. This badge on the extension icon is persistent instead —
// it stays until the page changes, so checking it any time after applying
// gives a definitive answer, not just a moment you might have missed.
//
//   (no badge)  — not watching this page at all
//   "●" (blue)  — watching, nothing saved yet
//   "✓" (green) — saved for this page
function setBadgeState(tabId, state) {
  if (state === 'watching') {
    chrome.action.setBadgeText({ tabId, text: '●' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#6366f1' });
    chrome.action.setTitle({ tabId, title: 'AppliedIn — watching this page for a submission' });
  } else if (state === 'saved') {
    chrome.action.setBadgeText({ tabId, text: '✓' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#22c55e' });
    chrome.action.setTitle({ tabId, title: 'AppliedIn — saved for this page ✓' });
  } else {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setTitle({ tabId, title: "AppliedIn — not watching this page. Right-click and choose \"Log this application\" if you applied here." });
  }
}

// Content scripts / injected functions message here the moment they
// successfully save, so the badge can flip to "saved" immediately —
// far more reliable than hoping someone catches a 3-second toast.
chrome.runtime.onMessage.addListener(function (message, sender) {
  if (message?.type === 'appliedin_saved') {
    if (sender?.tab?.id) {
      setBadgeState(sender.tab.id, 'saved');
    }
    sendGAEvent('application_saved', {
      platform: message.platform || 'Unknown',
      method: message.method || 'auto'
    });
  } else if (message?.type === 'appliedin_popup_opened') {
    sendGAEvent('popup_opened', {});
  }
});

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
  ) {
    setBadgeState(tabId, 'idle');
    return;
  }

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
  if (isCovered) {
    // Dedicated content scripts handle these — still show "watching" so
    // the person gets the same at-a-glance confirmation everywhere.
    setBadgeState(tabId, 'watching');
    return;
  }

  // Check if this looks like a job related page
  const jobKeywords = [
    // Generic job/career wording
    'career', 'careers', 'jobs', 'job', 'apply',
    'application', 'hiring', 'vacancy', 'vacancies',
    'opening', 'openings', 'recruitment', 'recruit', 'recruiting',
    'work-with-us', 'join-us', 'join-our-team', 'joinus',
    'opportunities', 'employment', 'positions', 'roles',
    'talent', 'staffing', 'hire', 'hire-us',
    'thankyou', 'thank-you', 'thank_you', 'confirmation',
    // Global ATS platforms
    'workday', 'greenhouse', 'lever', 'taleo', 'icims',
    'smartrecruiters', 'workable', 'jobvite', 'ashbyhq',
    'breezy', 'recruitee', 'personio', 'bamboohr',
    // ATS/HR platforms common in India
    'zohorecruit', 'freshteam', 'keka', 'darwinbox', 'peoplestrong'
  ];

  // Google Forms is a common way companies (especially for off-campus
  // hiring in India) collect applications, but its URLs are auto-generated
  // IDs like docs.google.com/forms/d/e/1FAIpQLS.../viewform — they never
  // contain any job-related keyword, so they need an explicit check.
  // Chat/messaging pages legitimately contain application-related phrases
  // in normal conversation (a recruiter writing "we received your
  // application") — never a real submission confirmation. Exclude these
  // regardless of whether the URL also happens to contain a job keyword.
  const excludedPathPatterns = ['/chat/', '/message', '/inbox', '/conversation'];
  const isExcludedPage = excludedPathPatterns.some(p => url.includes(p));

  const isGoogleForm = url.includes('docs.google.com/forms/');

  const isJobPage = !isExcludedPage && (isGoogleForm || jobKeywords.some(keyword => url.includes(keyword)));

  if (isGoogleForm && !isExcludedPage) {
    console.log('[AppliedIn] Google Form detected, injecting tracker:', url);
  }

  if (!isJobPage) {
    setBadgeState(tabId, 'idle');
    return;
  }

  setBadgeState(tabId, 'watching');

  // Inject universal tracker into this page
  // allFrames: true so an embedded Google Form (or other iframe-based
  // application widget) inside a company's careers page gets covered too —
  // the top-level tab URL alone wouldn't reveal what's embedded in it.
  chrome.scripting.executeScript({
    target: { tabId: tabId, allFrames: true },
    func: injectUniversalTracker,
    args: [detectPlatform(tab.url)]
  }).catch((err) => {
    console.log('[AppliedIn] injection failed:', err);
  });
});

// Universal tracker — injected into any job page
// Captures ONLY on confirmation — not on first click
function injectUniversalTracker(platformName) {
  if (window.__appliedinInjected) return;
  window.__appliedinInjected = true;

  console.log('[AppliedIn] universal tracker loaded on', window.location.href, '(platform:', platformName + ')');

  let lastHandledUrl = null;

  // Many SPA-style career portals (Workday in particular) mutate the URL's
  // query string or hash on internal navigation without a real page
  // reload — comparing the raw href would treat every such tweak as "a
  // different page," repeatedly re-arming detection on what is actually
  // the same screen. Comparing origin+pathname only is far more stable.
  function normalizedUrl() {
    return window.location.origin + window.location.pathname;
  }

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
    'application confirmation',
    // Broader fragments to catch phrasing like "your application has been
    // submitted" / "your resume has been received" that the more rigid
    // two-word phrases above miss.
    'has been submitted',
    'has been received',
    'has been sent',
    'successfully received',
    // Google Forms' standard confirmation text
    'your response has been recorded'
  ];

  // URL patterns that strongly indicate a completed application —
  // most ATS platforms (Workday, Greenhouse, Oracle-based systems, etc.)
  // navigate to a URL like this after a real, final submission.
  const successUrlPatterns = [
    'thankyou', 'thank-you', 'thank_you', 'applythankyou',
    'application-submitted', 'applysuccess', 'apply-success',
    'applicationsuccess', 'confirmation', 'applied=1',
    'status=success', 'status=offline-success', 'submitted=true'
  ];

  function urlLooksLikeSuccess() {
    return successUrlPatterns.some(p => window.location.href.toLowerCase().includes(p));
  }

  function titleLooksLikeSuccess() {
    const title = (document.title || '').toLowerCase();
    return successPhrases.some(phrase => title.includes(phrase)) ||
      title.includes('thank you');
  }

  function bodyLooksLikeSuccess() {
    const bodyText = document.body.innerText || '';
    return successPhrases.some(phrase => bodyText.toLowerCase().includes(phrase));
  }

  // Words that indicate a FAILED submission (validation error, etc.) —
  // if any of these are present, don't treat structural changes as success.
  const errorIndicators = [
    'required field', 'is required', 'please fill', 'please enter',
    'invalid', 'error occurred', 'something went wrong', 'failed to',
    'try again', 'please correct', 'field is empty'
  ];

  function pageLooksLikeError() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return errorIndicators.some(phrase => bodyText.includes(phrase));
  }

  // Structural, language-independent success signal: an element whose
  // class or id names sound like a success/confirmation box. Developers
  // use these naming conventions constantly regardless of what the
  // visible text actually says, so this catches wording we could never
  // fully enumerate.
  function hasGenericSuccessElement() {
    const el = document.querySelector(
      '[class*="success" i], [class*="thank-you" i], [class*="thankyou" i], ' +
      '[class*="confirmation" i], [id*="success" i], [id*="thank-you" i], ' +
      '[id*="confirmation" i], [class*="submitted" i]'
    );
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  // Structural signal #2: the form the user just submitted has vanished
  // from the page — a near-universal pattern after a real submission,
  // regardless of what confirmation text (if any) replaces it.
  function formDisappeared(formRef) {
    if (!formRef) return false;
    if (!document.body.contains(formRef)) return true;
    const style = window.getComputedStyle(formRef);
    return style.display === 'none' || style.visibility === 'hidden';
  }

  function handleDetectedSuccess() {
    if (lastHandledUrl === normalizedUrl()) return;
    lastHandledUrl = normalizedUrl();

    const jobData = getPageDetails();
    if (jobData && jobData.confident) {
      saveApplication(jobData);
    } else if (jobData) {
      showConfirmPopup();
    }
  }

  // Fallback for when no exact phrase/URL matched, but the page structure
  // still strongly suggests a real submission happened. Always shows the
  // popup here rather than auto-saving — this signal is weaker than an
  // exact phrase match, so we ask rather than guess silently.
  function handlePossibleSuccess(formRef) {
    if (lastHandledUrl === normalizedUrl()) return true;
    if (pageLooksLikeError()) return false;
    if (!hasGenericSuccessElement() && !formDisappeared(formRef)) return false;

    lastHandledUrl = normalizedUrl();
    const jobData = getPageDetails();
    if (jobData) showConfirmPopup();
    return true;
  }

  // Last resort: we saw a submit-like click, but NOTHING — not exact
  // phrase, not URL, not structural signal — gave us any confidence
  // about what happened. Rather than silently doing nothing (which
  // leaves the person unknowingly relying on a save that never
  // happened), show a small, low-friction nudge they can act on or
  // ignore, instead of a full popup demanding an answer.
  function showSoftNudge() {
    if (document.getElementById('appliedin-nudge')) return;

    const overlay = document.createElement('div');
    overlay.id = 'appliedin-nudge-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.4);
      z-index: 999996;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    const nudge = document.createElement('div');
    nudge.id = 'appliedin-nudge';
    nudge.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 360px;
      max-width: 90vw;
      background: white;
      border-radius: 16px;
      padding: 26px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      z-index: 999997;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      border: 1px solid #e5e7eb;
      text-align: center;
    `;
    nudge.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:10px;">
        📋 AppliedIn
      </div>
      <div style="font-size:15px;color:#4b5563;margin-bottom:22px;line-height:1.5;">
        Did you just submit an application?<br>We couldn't confirm it automatically.
      </div>
      <div style="display:flex;gap:10px;">
        <button id="appliedin-nudge-log" style="flex:1;padding:12px;background:#4f46e5;color:white;
          border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          Yes, log it
        </button>
        <button id="appliedin-nudge-dismiss" style="flex:1;padding:12px;background:#f3f4f6;color:#374151;
          border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          No, dismiss
        </button>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(nudge);

    document.getElementById('appliedin-nudge-log').addEventListener('click', function () {
      overlay.remove();
      nudge.remove();
      showConfirmPopup();
    });

    document.getElementById('appliedin-nudge-dismiss').addEventListener('click', function () {
      overlay.remove();
      nudge.remove();
    });
  }

  // METHOD 0 — Page already loaded directly on a confirmation page.
  // Deliberately checking URL/title ONLY here, not body text — a page
  // like an "Applications" dashboard permanently displays status text
  // such as "Application submitted" for applications from days ago, and
  // trusting body text on load alone would re-trigger every single time
  // that page is revisited. URL and tab title are reliable because they
  // specifically indicate a fresh post-submission redirect, not just a
  // page someone is casually browsing back to.
  if (urlLooksLikeSuccess() || titleLooksLikeSuccess()) {
    setTimeout(handleDetectedSuccess, 500);
  }

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

  // The exact-match blacklist above only catches literal matches like
  // "Welcome" on its own — it misses "Welcome, Mohith Kintali (Mohith...)"
  // since that text is never an exact match against anything. This catches
  // greeting banners and other page chrome by pattern instead.
  function looksLikeGreetingOrChrome(text) {
    if (!text) return true;
    const lower = text.toLowerCase().trim();
    if (GENERIC_HEADINGS.includes(lower)) return true;
    if (/^welcome\b/.test(lower)) return true;
    if (/^(hi|hello|hey)\b/.test(lower)) return true;
    if (/^you have\b/.test(lower)) return true;
    if (/^my (applications|progress|profile|account)\b/.test(lower)) return true;
    // Job titles are essentially never this long — a paragraph or
    // greeting banner accidentally grabbed by an h1/h2 selector usually is
    if (text.length > 80) return true;
    return false;
  }

  // Hosts that are form/survey PLATFORMS, not companies — guessing a
  // company name from these hostnames would produce nonsense like
  // "Docs" or "Forms". These generic form builders never tell us who
  // the actual employer is, so we deliberately leave company unknown
  // and let the popup ask instead of guessing wrong.
  const FORM_PLATFORM_HOSTS = [
    'docs.google.com', 'forms.gle', 'forms.office.com',
    'typeform.com', 'jotform.com', 'airtable.com'
  ];

  function guessCompanyFromHostname() {
    const hostname = new URL(window.location.href).hostname;
    if (FORM_PLATFORM_HOSTS.some(h => hostname.includes(h))) return null;

    const parts = hostname
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

  // Many job sites embed JobPosting structured data (schema.org) inside
  // a <script type="application/ld+json"> tag, specifically so Google's
  // job search can index them. This is far more reliable than guessing
  // from CSS classes or hostnames — when present, treat it as ground truth.
  function getStructuredJobData() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let data;
        try {
          data = JSON.parse(script.textContent);
        } catch (e) {
          continue;
        }

        const items = Array.isArray(data) ? data : (data['@graph'] || [data]);

        for (const item of items) {
          if (!item) continue;
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
          if (!types.includes('JobPosting')) continue;

          const title = item.title || null;

          const org = item.hiringOrganization;
          const company = (org && (org.name || (typeof org === 'string' ? org : null))) || null;

          let location = null;
          const loc = item.jobLocation;
          const locEntry = Array.isArray(loc) ? loc[0] : loc;
          const address = locEntry && locEntry.address;
          if (address) {
            location = [address.addressLocality, address.addressRegion, address.addressCountry]
              .filter(Boolean).join(', ');
          }

          if (title || company) {
            return { title, company, location: location || null };
          }
        }
      }
    } catch (e) {
      // best-effort enhancement, not critical path
    }
    return null;
  }

  function getPageDetails() {
    try {
      const structured = getStructuredJobData();

      const metaCompany =
        structured?.company ||
        document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
        document.querySelector('meta[name="author"]')?.content?.trim() ||
        null;

      const hostnameCompany = guessCompanyFromHostname();
      const company = metaCompany || hostnameCompany || null;

      // Strong sources: structured JobPosting data and og:title metadata
      // are specifically authored to describe THIS job — reliable enough
      // to auto-save from.
      const strongTitle =
        structured?.title ||
        document.querySelector('meta[property="og:title"]')?.content?.trim() ||
        null;

      // Weak sources: generic page headings. These have repeatedly turned
      // out to grab the wrong thing (greeting banners, dashboard titles,
      // "Apply" buttons) — still worth trying, but never confident, and
      // filtered through the greeting/chrome detector first.
      const weakTitleCandidates = [
        document.querySelector('h1')?.innerText?.trim(),
        document.querySelector('h2')?.innerText?.trim(),
        document.title?.trim()
      ];
      const weakTitle = weakTitleCandidates.find(t =>
        t && t.length > 3 && !looksLikeGreetingOrChrome(t)
      ) || null;

      const role = strongTitle || weakTitle || null;

      // "Confident" means we're comfortable auto-saving without asking.
      // Structured JobPosting data is trustworthy on its own; otherwise
      // require a real (non-guessed) company AND a strong title source —
      // a weak/guessed title is never enough to auto-save on its own.
      const confident =
        (!!structured?.company && !!structured?.title) ||
        (!!metaCompany && !!strongTitle);

      return {
        company: company || null,
        role: role ? role.substring(0, 100) : null,
        location: structured?.location || 'Unknown Location',
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

      const isDuplicate = applications.some(app => {
        // Same exact job URL — definitely a duplicate, regardless of when
        if (jobData.url && app.url && app.url === jobData.url) return true;

        return (
          app.company.toLowerCase() === jobData.company.toLowerCase() &&
          app.role.toLowerCase() === jobData.role.toLowerCase() &&
          (new Date() - new Date(app.date)) < 24 * 60 * 60 * 1000
        );
      });

      if (isDuplicate) {
        showToast('⚠️ Already applied here recently!', '#f59e0b');
        chrome.runtime.sendMessage({
          type: 'appliedin_saved',
          platform: jobData.platform,
          method: jobData.confident ? 'auto' : 'popup_confirm'
        }).catch(() => {});
        return;
      }

      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        showToast('✅ Application saved — ' + jobData.company, '#22c55e');
        chrome.runtime.sendMessage({
          type: 'appliedin_saved',
          platform: jobData.platform,
          method: jobData.confident ? 'auto' : 'popup_confirm'
        }).catch(() => {});
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
    if (lastHandledUrl === normalizedUrl()) return;

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

    // Capture the form now, before anything changes — used as a
    // language-independent fallback signal if no phrase/URL matches.
    const formRef = element.closest('form');

    setTimeout(() => {
      if (lastHandledUrl === normalizedUrl()) return;
      if (urlLooksLikeSuccess() || titleLooksLikeSuccess() || bodyLooksLikeSuccess()) {
        handleDetectedSuccess();
        return;
      }

      // No exact phrase/URL matched — fall back to structural signals
      // (form gone, or a success-styled element appeared) rather than
      // going completely silent. Always asks via popup here, never
      // auto-saves, since this signal is weaker than an exact match.
      const handled = handlePossibleSuccess(formRef);

      if (!handled) {
        // Nothing gave us any confidence at all. Rather than silently
        // doing nothing, surface a small dismissible nudge so the person
        // knows to check — instead of unknowingly assuming it saved.
        showSoftNudge();
      }
    }, 2500);
  });

  // METHOD 1B — Some sites (e.g. Shine.com) have a single "Apply" button
  // that, on click, simply relabels itself to "Applied" — no new banner,
  // no confirmation text anywhere else on the page. "Apply" alone is
  // deliberately excluded from submitTexts above (too ambiguous — it's
  // usually a START action, not completion), so this needs its own,
  // narrowly-scoped check: only watches whether THIS SPECIFIC element's
  // own label flips to a "done" state, not the whole page. That scoping
  // is what makes it safe from the multi-section-form false-positive
  // risk that ambiguous words like "Apply" would otherwise cause.
  document.addEventListener('click', function (e) {
    if (lastHandledUrl === normalizedUrl()) return;

    const element = e.target.closest('button, a');
    if (!element) return;

    const text = (element.innerText || '').toLowerCase().trim();
    if (!text.includes('apply')) return;
    if (submitTexts.some(t => text === t || text.includes(t))) return; // already handled above

    const originalText = element.innerText;

    setTimeout(() => {
      if (lastHandledUrl === normalizedUrl()) return;
      if (!document.body.contains(element)) return;

      const newText = (element.innerText || '').trim();
      const flippedToApplied =
        newText !== originalText &&
        /\bapplied\b/i.test(newText) &&
        !/\bapply\b/i.test(newText);

      if (flippedToApplied) {
        handleDetectedSuccess();
      }
    }, 2000);
  });

  // Snapshot: was success text already present the moment this script
  // loaded? If so, it's very likely a persistent status label (e.g. an
  // "Applications" dashboard showing "Application submitted" for
  // something from days ago) rather than a fresh confirmation — so we
  // must only react to text that's genuinely NEW, not merely present.
  let bodyAlreadyHadSuccessTextOnLoad = bodyLooksLikeSuccess();

  // METHOD 2 — Watch DOM for genuine success confirmation message.
  // This is the real authority for both auto-save and the popup fallback —
  // it only fires once real confirmation text NEWLY appears, regardless
  // of which button (if any) triggered it. Debounced so busy pages
  // (ads, trackers, live-updating widgets) don't trigger a full-text
  // rescan on every single incidental mutation.
  let mutationDebounce = null;
  const observer = new MutationObserver(function () {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      if (lastHandledUrl === normalizedUrl()) return;

      const currentlyHasSuccessText = bodyLooksLikeSuccess();
      const isNewTransition = currentlyHasSuccessText && !bodyAlreadyHadSuccessTextOnLoad;

      // Always sync the baseline FIRST, before any early return — this was
      // the actual bug causing the infinite popup loop: the old code only
      // updated the baseline on the non-triggering path, so after a real
      // trigger it stayed permanently stuck at "false," making every
      // subsequent unrelated mutation look like a fresh transition again.
      bodyAlreadyHadSuccessTextOnLoad = currentlyHasSuccessText;

      if (isNewTransition) {
        setTimeout(handleDetectedSuccess, 1000);
        return;
      }

      if (urlLooksLikeSuccess()) {
        setTimeout(handleDetectedSuccess, 1000);
      }
    }, 400);
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
      <style>
        #appliedin-confirm input:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }
        #appliedin-confirm input.appliedin-needs-input {
          border-color: #f59e0b !important;
          background: #fffbeb !important;
        }
        #appliedin-confirm input::placeholder {
          color: #b45309;
          font-style: italic;
        }
        #appliedin-confirm input:not(.appliedin-needs-input)::placeholder {
          color: #9ca3af;
          font-style: normal;
        }
      </style>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Company name</label>
        <input id="appliedin-company"
          value="${jobData?.company || ''}"
          class="${jobData?.company ? '' : 'appliedin-needs-input'}"
          placeholder="${jobData?.company ? 'Company name' : "Couldn't detect — click here and type it"}"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          margin-bottom:14px;color:#111827;outline:none;pointer-events:auto !important;user-select:text !important;-webkit-user-select:text !important;cursor:text !important;" />
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Job role</label>
        <input id="appliedin-role"
          value="${jobData?.role?.substring(0, 60) || ''}"
          class="${jobData?.role ? '' : 'appliedin-needs-input'}"
          placeholder="${jobData?.role ? 'Job role' : "Couldn't detect — click here and type it"}"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          color:#111827;outline:none;pointer-events:auto !important;user-select:text !important;-webkit-user-select:text !important;cursor:text !important;" />
        <div style="font-size:12px;color:#9ca3af;margin-top:8px;line-height:1.4;">
          ✏️ Both fields above are editable — click into either one to type or correct it.
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

    const firstNeedsInput = document.querySelector('#appliedin-confirm .appliedin-needs-input');
    (firstNeedsInput || document.getElementById('appliedin-company'))?.focus();

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
      // This wasn't actually a completion — allow a later, genuine
      // submission on this same page (common on multi-section forms
      // like Amazon Jobs) to still be caught instead of going silent.
      lastHandledUrl = null;
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