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

  // Skip portals with dedicated content scripts — they handle themselves
  // Universal tracker must NOT inject on these to avoid double-firing
  const coveredPortals = [
    'linkedin.com', 'naukri.com', 'internshala.com',
    'indeed.com', 'glassdoor.com', 'glassdoor.co.in',
    'unstop.com', 'shine.com', 'foundit.in',
    'freshersworld.com', 'hirist.tech', 'hirist.com',
    'cutshort.io', 'monster.com', 'monsterindia.com',
  ];

  const isCovered = coveredPortals.some(portal => url.includes(portal));
  if (isCovered) return;

  const hostname = (() => { try { return new URL(tab.url).hostname.toLowerCase(); } catch(e){ return ''; } })();

  // TIER 1 — Hard block: never inject on these domains no matter what.
  // These are non-job sites where false positives cause bad saves (Gmail, YouTube etc.)
  const BLOCKED_DOMAINS = [
    // Email
    'mail.google.com', 'outlook.live.com', 'outlook.office.com',
    'mail.yahoo.com', 'protonmail.com', 'zoho.com/mail',
    // Social
    'twitter.com', 'x.com', 'facebook.com', 'instagram.com',
    'reddit.com', 'quora.com', 'discord.com', 'telegram.org',
    'whatsapp.com', 'snapchat.com', 'pinterest.com',
    // Video / Entertainment
    'youtube.com', 'netflix.com', 'hotstar.com', 'primevideo.com',
    'spotify.com', 'twitch.tv',
    // News
    'news.google.com', 'timesofindia.com', 'ndtv.com', 'thehindu.com',
    'hindustantimes.com', 'bbc.com', 'cnn.com',
    // Shopping
    'amazon.in', 'amazon.com', 'flipkart.com', 'myntra.com',
    'meesho.com', 'snapdeal.com', 'nykaa.com', 'swiggy.com', 'zomato.com',
    // Banking / Finance (sensitive)
    'sbi.co.in', 'hdfcbank.com', 'icicibank.com', 'axisbank.com',
    'paytm.com', 'phonepe.com', 'gpay.app', 'razorpay.com',
    // Dev / Learning (not job apply)
    'github.com', 'stackoverflow.com', 'leetcode.com', 'hackerrank.com',
    'geeksforgeeks.org', 'udemy.com', 'coursera.org',
    // Docs / Productivity (docs.google.com excluded — used for job application forms)
    'drive.google.com', 'sheets.google.com', 'slides.google.com',
    'notion.so', 'trello.com', 'slack.com', 'teams.microsoft.com',
    // Search
    'google.com', 'bing.com', 'duckduckgo.com',
  ];

  // Use endsWith for exact domain matching — prevents 'google.com' from
  // blocking 'docs.google.com', 'careers.google.com' etc.
  // TIER 2 check FIRST — job domains are never blocked even if they match BLOCKED_DOMAINS
  // e.g. docs.google.com would be blocked by 'google.com' but it's a job form domain
  const JOB_DOMAINS_PRIORITY = [
    'docs.google.com', 'forms.gle', 'forms.google.com',
    'binary.so', 'typeform.com', 'jotform.com', 'tally.so',
    'forms.app', 'fillout.com', 'paperform.co', 'cognitoforms.com',
    'formstack.com', 'wufoo.com',
    'workday.com', 'myworkdayjobs.com', 'greenhouse.io', 'lever.co',
    'smartrecruiters.com', 'taleo.net', 'icims.com',
    'successfactors.com', 'sapsf.eu', 'sapsf.com',
    'zohorecruit.com', 'freshteam.com', 'keka.com', 'darwinbox.com',
    'recruitcrm.io', 'bamboohr.com', 'applytojob.com',
    'careers.google.com', 'amazon.jobs',
    'wellfound.com', 'angel.co',
    'apna.co', 'workindia.in', 'iimjobs.com',
  ];
  const isPriorityJobDomain = JOB_DOMAINS_PRIORITY.some(d => hostname === d || hostname.endsWith('.' + d));

  // Only check blocked list if NOT a priority job domain
  if (!isPriorityJobDomain) {
    if (BLOCKED_DOMAINS.some(d => hostname === d || hostname.endsWith('.' + d))) return;
  }

  // TIER 2 — Always inject on form tools and ATS systems
  // NOTE: Portals with dedicated content scripts (linkedin, naukri, internshala etc.)
  // are NOT listed here — they are already skipped by coveredPortals above.
  // Only list domains that have NO dedicated script and need universal tracker.
  const JOB_DOMAINS = [
    // Form tools used by Indian companies for job applications
    'docs.google.com', 'forms.gle',  // Google Forms — huge for Indian job applications
    'binary.so', 'typeform.com', 'jotform.com', 'tally.so',
    'forms.app', 'fillout.com', 'paperform.co', 'cognitoforms.com',
    'formstack.com', 'wufoo.com',
    // ATS / HRMS platforms (no dedicated script)
    'workday.com', 'myworkdayjobs.com', 'greenhouse.io', 'lever.co',
    'smartrecruiters.com', 'taleo.net', 'icims.com',
    'successfactors.com', 'sapsf.eu', 'sapsf.com', 'sap.com',
    'career.sap', 'jobs.sap',
    'zohorecruit.com', 'freshteam.com', 'keka.com', 'darwinbox.com',
    'recruitcrm.io', 'bamboohr.com', 'applytojob.com',
    'springrecruit.com', 'hirecraft.in',
    // Known company career portals (no dedicated script)
    'careers.google.com', 'amazon.jobs',
    'wellfound.com', 'angel.co',
    'apna.co', 'workindia.in', 'iimjobs.com',
  ];

  const isJobDomain = isPriorityJobDomain || JOB_DOMAINS.some(d => hostname.includes(d));

  if (!isJobDomain) {
    // TIER 3 — Conditionally inject: URL path OR query string contains job keywords
    const jobKeywords = [
      '/career', '/careers', '/jobs', '/job/', '/apply',
      '/application', '/hiring', '/vacancy', '/vacancies',
      '/openings', '/opening/', '/recruitment', '/work-with-us',
      '/join-us', '/join-our-team', '/opportunities', '/internship',
      '/portalcareer', '/jobdetail', '/jobapply', '/joboffer',
      '/talent', '/requisition', '/position',
    ];
    const urlFull = tab.url.toLowerCase();
    // Check both path and full URL (catches query params like ?portalcareer, ?isQuickApply)
    const isJobPage = jobKeywords.some(kw => urlFull.includes(kw));

    // TIER 3B — Last resort: inject if URL has job-related query params
    const jobQueryParams = [
      'quickapply', 'jobid', 'job_id', 'positionid', 'requisitionid',
      'careerId', 'applicationid', 'applyredirect',
    ];
    const hasJobParam = jobQueryParams.some(p => urlFull.includes(p.toLowerCase()));

    if (!isJobPage && !hasJobParam) return;
  }

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

  // Skip known non-apply paths even on job portals
  const _path = window.location.pathname.toLowerCase();
  const _skipPaths = [
    '/chat', '/messages', '/messaging', '/inbox',
    '/notifications', '/notification',
    '/dashboard', '/profile', '/account', '/settings',
    '/feed', '/mynetwork', '/learning',
    '/salary', '/reviews', '/community',
    '/my-applications', '/applied', '/saved',
  ];
  if (_skipPaths.some(p => _path.startsWith(p))) return;

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
    'thank you for your interest',
    'someone will be contacting you',
    'we will be in touch',
    'we will contact you shortly',
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
    'we have received your submission',  // binary.so
    'your submission has been received',
    'submission received',
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
    // Google forms
    'docs.google.com', 'forms.google.com', 'forms.gle',
    // Popular form builders used by Indian companies for job applications
    'typeform.com', 'jotform.com', 'surveymonkey.com',
    'airtable.com', 'notion.so', 'tally.so',
    'binary.so',        // Rapido, many Indian startups use this
    'unstop.com',       // Already has dedicated script but just in case
    'forms.app',
    'cognitoforms.com',
    'paperform.co',
    'fillout.com',
    'formstack.com',
    'wufoo.com',
    // Indian HRMS/ATS that host forms
    'zohorecruit.com', 'zoho.com',
    'freshteam.com', 'freshworks.com',
    'keka.com', 'darwinbox.com',
    'greythr.com', 'bamboohr.com',
    'recruitcrm.io', 'hirecraft.in',
    'springrecruit.com', 'razorpayX.com',
    // Microsoft forms
    'forms.microsoft.com', 'office.com',
  ];

  function isAmbiguousDomain() {
    const hostname = window.location.hostname.toLowerCase();
    return ambiguousDomains.some(d => hostname.includes(d));
  }

  // Words that appear in success/confirmation messages — NOT job role names.
  // If h1/h2 contains any of these, it's a success message, not a role title.
  const NOISE_PHRASES = [
    'thank you', 'thanks for', 'successfully applied', 'you have applied',
    "you've applied", 'application submitted', 'application received',
    'we have received', 'your application', 'congratulations',
    'we will be in touch', 'we will get back', 'our team will',
    'your submission', 'response recorded', 'form submitted',
    'you have successfully', 'successfully submitted',
    'mohith', // personalised greetings — never a job role
    'dear ', 'hello ', 'hi ',
  ];

  function looksLikeNoise(text) {
    if (!text) return true;
    const lower = text.toLowerCase();
    // Too long to be a job title (>80 chars is almost certainly a sentence)
    if (lower.length > 80) return true;
    // Contains noise phrases
    if (NOISE_PHRASES.some(p => lower.includes(p))) return true;
    // Ends with punctuation typical of sentences
    if (/[.!?]$/.test(text.trim())) return true;
    return false;
  }

  function getCleanTitle() {
    // Try headings in order — skip any that look like success messages
    const candidates = [
      ...Array.from(document.querySelectorAll('h1')),
      ...Array.from(document.querySelectorAll('h2')),
      ...Array.from(document.querySelectorAll('[class*="job-title"]')),
      ...Array.from(document.querySelectorAll('[class*="position"]')),
      ...Array.from(document.querySelectorAll('[class*="role"]')),
    ];

    for (const el of candidates) {
      const text = el.innerText?.trim();
      if (text && !looksLikeNoise(text)) return text;
    }

    // Try page title — strip common suffixes
    const pageTitle = document.title
      ?.replace(/[-|–—].*$/, '')   // "Software Engineer | Cisco Careers" → "Software Engineer"
      ?.replace(/\s*(careers|jobs|career|apply|job)\s*/gi, '')
      ?.trim();

    if (pageTitle && !looksLikeNoise(pageTitle)) return pageTitle;

    return null; // couldn't find a clean title
  }

  function getCleanCompany() {
    // Try structured meta tags first — most reliable
    const metaCompany =
      document.querySelector('meta[property="og:site_name"]')?.content?.trim() ||
      document.querySelector('meta[name="author"]')?.content?.trim() ||
      document.querySelector('[class*="company-name"]')?.innerText?.trim() ||
      document.querySelector('[class*="employer"]')?.innerText?.trim() ||
      document.querySelector('[class*="org-name"]')?.innerText?.trim() ||
      '';

    if (metaCompany && !looksLikeNoise(metaCompany) && metaCompany.length < 60) {
      return metaCompany;
    }

    // Fall back to hostname — strip known subdomains
    const hostname = new URL(window.location.href).hostname
      .replace(/^(www|careers|jobs|apply|work|talent)\./i, '')
      .split('.')[0];

    if (hostname && hostname.length > 1) {
      return hostname.charAt(0).toUpperCase() + hostname.slice(1);
    }

    return null;
  }

  function getPageDetails() {
    try {
      const role    = getCleanTitle();
      const company = getCleanCompany();

      return {
        company:  company || null,   // null = couldn't detect
        role:     role    || null,   // null = couldn't detect
        location: 'Unknown Location',
        platform: platformName,
        url:      window.location.href,
        date:     new Date().toISOString(),
        status:   'Applied'
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

  observer.observe(document.body, { childList: true, subtree: true });

  // GOOGLE FORMS FIX: On /formResponse pages, success text is already in DOM
  // when script injects — observer never fires because no more mutations happen.
  // Check immediately on script load.
  setTimeout(function checkAlreadyLoaded() {
    if (handledUrls.has(window.location.href)) return;
    if (window.__appliedinPopupOpen) return;
    const bodyText = (document.body?.innerText || '').toLowerCase();
    const isAlreadySuccess = successPhrases.some(p => bodyText.includes(p));
    if (!isAlreadySuccess) return;
    handledUrls.add(window.location.href);
    const jobData = getPageDetails();
    const hasCleanData = jobData && jobData.company && jobData.role && !isAmbiguousDomain();
    if (hasCleanData) {
      saveApplication(jobData);
    } else {
      showConfirmPopup(jobData, true,
        function () { handledUrls.add(window.location.href); },
        function () { observerActive = false; }
      );
    }
  }, 500);

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
        <input id="appliedin-company" maxlength="100"
          value="${companyValue}"
          placeholder="e.g. Razorpay, Zomato, TCS..."
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:2px solid ${isAmbiguous ? '#ef4444' : '#e5e7eb'};border-radius:8px;font-size:14px;
          margin-bottom:4px;color:#111827;outline:none;" />
        ${companyHint}
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;margin-top:12px;">Job role</label>
        <input id="appliedin-role" maxlength="120"
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

  // REDIRECT APPLY FLAG: content scripts set this when submit is clicked
  // Guarantee layer checks on next page load for redirect-based ATS success
  if (message.type === 'SET_APPLY_FLAG') {
    const flag = {
      origin: message.origin,
      jobData: message.jobData,
      ts: Date.now()
    };
    chrome.storage.local.set({ __appliedin_redirect_flag: flag });
    sendResponse({ ok: true });
    return true;
  }

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

// ══════════════════════════════════════════════════════════════
// GUARANTEE LAYER — runs on EVERY page (except hard-blocked ones)
// Scans for success phrases on page load.
// If found and not already saved → injects a minimal popup.
// This ensures zero silent misses even for unknown domains/ATS.
// ══════════════════════════════════════════════════════════════

const HARD_BLOCKED = [
  'mail.google.com', 'outlook.live.com', 'mail.yahoo.com',
  'youtube.com', 'netflix.com', 'facebook.com', 'instagram.com',
  'twitter.com', 'x.com', 'reddit.com', 'discord.com',
  'amazon.in', 'amazon.com', 'flipkart.com', 'swiggy.com', 'zomato.com',
  'sbi.co.in', 'hdfcbank.com', 'icicibank.com', 'paytm.com', 'phonepe.com',
  'github.com', 'stackoverflow.com', 'leetcode.com', 'geeksforgeeks.org',
  'udemy.com', 'coursera.org',
  // NOTE: docs.google.com is NOT blocked — Google Forms is used for job applications
  'drive.google.com', 'sheets.google.com', 'slides.google.com',
  'google.com', 'bing.com', 'duckduckgo.com', 'maps.google.com',
  'translate.google.com', 'play.google.com', 'accounts.google.com',
  'chrome.google.com', 'web.whatsapp.com', 'web.telegram.org',
];

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const url = tab.url.toLowerCase();
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('edge://')) return;

  try {
    const hostname = new URL(tab.url).hostname.toLowerCase();
    if (HARD_BLOCKED.some(d => hostname === d || hostname.endsWith('.' + d))) return;
  } catch(e) { return; }

  // Inject the guarantee scanner
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: guaranteeScanner,
  }).catch(() => {});
});

function guaranteeScanner() {
  // Skip if already explicitly handled by a dedicated portal script
  if (window.__appliedinHandled) return;
  // For __appliedinInjected (universal tracker): still run on formResponse pages
  // because the tracker's observer may have missed the already-loaded success text
  const _gPath = window.location.pathname.toLowerCase();
  const _isFormResponse = _gPath.includes('/formresponse') || _gPath.includes('formresponse');
  if (window.__appliedinInjected && !_isFormResponse) return;

  const path = window.location.pathname.toLowerCase();
  const origin = window.location.origin;

  // CHECK REDIRECT FLAG: if a submit was detected on same origin recently,
  // show popup on this page even without a success phrase
  chrome.storage.local.get(['__appliedin_redirect_flag'], function(r) {
    const flag = r.__appliedin_redirect_flag;
    if (flag && flag.origin === origin && (Date.now() - flag.ts) < 60000) {
      // Clear the flag so it doesn't fire again
      chrome.storage.local.remove('__appliedin_redirect_flag');
      // Show popup with cached job data
      if (!document.getElementById('ai-guarantee-popup')) {
        showGuaranteePopup(flag.jobData || null);
      }
    }
  });

  // Skip non-apply paths

  const skipPaths = [
    '/chat', '/messages', '/messaging', '/inbox', '/notifications',
    '/dashboard', '/profile', '/account', '/settings', '/feed',
    '/mynetwork', '/learning', '/salary', '/reviews', '/community',
    '/my-applications', '/saved', '/wishlist', '/cart',
  ];
  // Special case: on docs.google.com, ONLY process /forms/ paths
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.includes('docs.google.com') && !path.includes('/forms/')) return;
  // Skip exact home page only
  if (path === '/') return;
  if (skipPaths.some(p => path === p || path.startsWith(p + '/'))) return;

  const SUCCESS_PHRASES = [
    'thank you for your interest',        // very common on company forms
    'someone will be contacting you',     // Infinity Assurance form shown in screenshot
    'we will be in touch',
    'we will contact you shortly',
    'your application has been sent',
    'your application has been submitted',
    'application submitted successfully',
    'successfully applied',
    'you have successfully applied',
    'application received',
    'we have received your application',
    'we have received your submission',
    'your submission has been received',
    'thank you for applying',
    'thank you for your application',
    'thanks for applying',
    'thanks for submitting',
    'your response has been recorded',
    'application sent. thank you',
    'your application has been sent. thank you',
    'your application was sent',
    'application was sent',
    'we have received your profile',
    'application complete',
    'your application is complete',
    'application successfully submitted',
  ];

  const bodyText = (document.body?.innerText || '').toLowerCase();
  const isSuccess = SUCCESS_PHRASES.some(p => bodyText.includes(p));
  if (!isSuccess) return;

  // Success detected — mark so main tracker doesn't double-fire
  window.__appliedinHandled = true;

  // Extract company from page
  function getCompany() {
    const hostname = window.location.hostname.toLowerCase();

    // Google Forms — extract company from form title
    // Pattern 1: "Freshers hiring - v4c.ai (Bangalore)" → company = "v4c.ai"
    // Pattern 2: "Glowlogics Internship Registration Form" → company = "Glowlogics"
    if (hostname.includes('docs.google.com') || hostname.includes('forms.gle')) {
      const rawTitle = document.querySelector('h1')?.innerText?.trim() ||
                       document.querySelector('title')?.innerText?.trim() || '';
      // Remove success message if appended
      const formTitle = rawTitle.replace('Your response has been recorded.','').trim();

      // Try parentheses first: "Hiring - CompanyName (City)" → "CompanyName"
      const parenMatch = formTitle.match(/\(([A-Za-z][^)]{1,40})\)/);
      if (parenMatch && !/batch|year|202\d/i.test(parenMatch[1])) {
        return parenMatch[1].trim();
      }

      // Try first word(s) before "Internship/Job/Hiring/Registration/Form"
      // "Glowlogics Internship Registration Form" → "Glowlogics"
      const firstWordMatch = formTitle.match(/^([A-Za-z][A-Za-z0-9._-]{1,30})/);
      if (firstWordMatch) {
        const candidate = firstWordMatch[1].trim();
        // Must look like a company name (not generic words)
        const genericWords = ['freshers','hiring','job','internship','form','apply',
                              'application','registration','open','vacancy','recruitment'];
        if (!genericWords.some(w => candidate.toLowerCase() === w)) {
          return candidate;
        }
      }

      // Try after dash: "Role - CompanyName" → "CompanyName"
      const dashMatch = formTitle.match(/[-–|]\s*([A-Za-z][^\n(]{2,40}?)\s*$/);
      if (dashMatch && !/batch|year|202\d/i.test(dashMatch[1])) {
        return dashMatch[1].trim();
      }

      return ''; // couldn't parse — popup will ask user
    }

    const meta = document.querySelector('meta[property="og:site_name"]')?.content?.trim();
    if (meta && meta.length < 60) return meta;
    const host = window.location.hostname.replace(/^(www|careers|jobs|apply|talent)./i,'').split('.')[0];
    return host ? host.charAt(0).toUpperCase() + host.slice(1) : '';
  }

  function getRole() {
    const noiseWords = ['thank','applied','application','received','submitted','congratulations','welcome','success','recorded','response'];
    const hostname = window.location.hostname.toLowerCase();

    // Google Forms — role is often in the form title before the dash
    if (hostname.includes('docs.google.com') || hostname.includes('forms.gle')) {
      const formTitle = document.querySelector('title')?.innerText ||
                        document.querySelector('h1')?.innerText || '';
      // "Freshers hiring - v4c.ai" → role = "Freshers hiring"
      const dashIdx = formTitle.search(/[-–|]/);
      if (dashIdx > 0) {
        const beforeDash = formTitle.substring(0, dashIdx).trim();
        if (beforeDash.length > 2 && beforeDash.length < 80) return beforeDash;
      }
      if (formTitle.length < 80 && !noiseWords.some(w => formTitle.toLowerCase().includes(w))) {
        return formTitle.trim();
      }
    }

    const candidates = [...document.querySelectorAll('h1,h2,[class*="job-title"],[class*="position"]')];
    for (const el of candidates) {
      const t = el.innerText?.trim() || '';
      if (t.length < 80 && !noiseWords.some(w => t.toLowerCase().includes(w))) return t;
    }
    const title = document.title?.replace(/[-|–].*$/,'').trim() || '';
    if (title.length < 80 && !noiseWords.some(w => title.toLowerCase().includes(w))) return title;
    return '';
  }

  const company = getCompany();
  const role    = getRole();

  // Build and show popup
  if (document.getElementById('appliedin-confirm')) return;

  const overlay = document.createElement('div');
  overlay.id = 'appliedin-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:999998;font-family:-apple-system,sans-serif;';

  const popup = document.createElement('div');
  popup.id = 'appliedin-confirm';
  popup.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    width:420px;max-width:90vw;background:white;border-radius:16px;padding:28px;
    box-shadow:0 20px 60px rgba(0,0,0,0.3);z-index:999999;border:1px solid #e5e7eb;`;

  popup.innerHTML = `
    <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:6px;">📋 AppliedIn</div>
    <div style="font-size:14px;color:#22c55e;font-weight:600;margin-bottom:16px;">
      ✅ Application submitted detected!
    </div>
    <div style="font-size:13px;color:#6b7280;margin-bottom:16px;">
      Confirm details to save this application.
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
      <div>
        <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px;">Company</label>
        <input id="ai-company" maxlength="100" value="${(company||'').replace(/"/g,'')}"
          placeholder="Enter company name"
          style="width:100%;box-sizing:border-box;padding:9px 12px;border:2px solid ${company?'#e5e7eb':'#ef4444'};
          border-radius:8px;font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
        ${!company ? '<div style="font-size:11px;color:#ef4444;margin-top:3px;">⚠️ Could not detect — please type it</div>' : ''}
      </div>
      <div>
        <label style="font-size:11px;font-weight:600;color:#6b7280;display:block;margin-bottom:3px;">Job Role</label>
        <input id="ai-role" maxlength="120" value="${(role||'').replace(/"/g,'').substring(0,80)}"
          placeholder="Enter job role"
          style="width:100%;box-sizing:border-box;padding:9px 12px;border:2px solid ${role?'#e5e7eb':'#ef4444'};
          border-radius:8px;font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
        ${!role ? '<div style="font-size:11px;color:#ef4444;margin-top:3px;">⚠️ Could not detect — please type it</div>' : ''}
      </div>
    </div>
    <div style="display:flex;gap:10px;">
      <button id="ai-save" style="flex:1;padding:12px;background:#22c55e;color:white;
        border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
        ✅ Save Application
      </button>
      <button id="ai-skip" style="flex:1;padding:12px;background:#f3f4f6;color:#374151;
        border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
        Skip
      </button>
    </div>
  `;

  document.body.appendChild(overlay);
  document.body.appendChild(popup);

  // Focus first empty field
  setTimeout(() => {
    const c = document.getElementById('ai-company');
    const r = document.getElementById('ai-role');
    ((!c.value || !c.value.trim()) ? c : (!r.value || !r.value.trim()) ? r : c).focus();
  }, 100);

  function closePopup() {
    overlay.remove();
    popup.remove();
  }

  // Save typed values so re-renders don't lose them
  const companyEl = document.getElementById('ai-company');
  const roleEl    = document.getElementById('ai-role');
  if (companyEl) companyEl.addEventListener('input', () => { window.__ai_saved_company = companyEl.value; });
  if (roleEl)    roleEl.addEventListener('input',    () => { window.__ai_saved_role    = roleEl.value; });

  document.getElementById('ai-save').addEventListener('click', function() {
    const finalCompany = (document.getElementById('ai-company')?.value || '').trim();
    const finalRole    = (document.getElementById('ai-role')?.value    || '').trim();

    if (!finalCompany) {
      const el = document.getElementById('ai-company');
      if (el) { el.style.border='2px solid #ef4444'; el.placeholder='⚠️ Required — type company name'; el.focus(); }
      return;
    }
    if (!finalRole) {
      const el = document.getElementById('ai-role');
      if (el) { el.style.border='2px solid #ef4444'; el.placeholder='⚠️ Required — type job role'; el.focus(); }
      return;
    }

    closePopup();

    const jobData = {
      company: finalCompany, role: finalRole,
      location: 'Unknown Location', platform: 'Company Website',
      url: window.location.href, date: new Date().toISOString(), status: 'Applied'
    };

    chrome.runtime.sendMessage({ type: 'SAVE_APPLICATION', data: jobData }, function(res) {
      const toast = document.createElement('div');
      toast.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
        border-radius:8px;font-size:14px;font-weight:500;z-index:999999;
        background:${res&&res.duplicate?'#f59e0b':'#22c55e'};color:white;
        box-shadow:0 4px 12px rgba(0,0,0,0.15);font-family:-apple-system,sans-serif;`;
      toast.innerText = res&&res.duplicate ? '⚠️ Already applied here recently!' : '✅ Saved — ' + finalCompany;
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 3000);
    });
  });

  document.getElementById('ai-skip').addEventListener('click', closePopup);
  overlay.addEventListener('click', closePopup);
}
