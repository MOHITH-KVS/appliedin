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
    'greenhouse', 'lever', 'taleo', 'icims', 'smartrecruiters',
    'thankyou', 'thank-you', 'thank_you', 'confirmation'
  ];

  // Google Forms is a common way companies (especially for off-campus
  // hiring in India) collect applications, but its URLs are auto-generated
  // IDs like docs.google.com/forms/d/e/1FAIpQLS.../viewform — they never
  // contain any job-related keyword, so they need an explicit check.
  const isGoogleForm = url.includes('docs.google.com/forms/');

  const isJobPage = isGoogleForm || jobKeywords.some(keyword => url.includes(keyword));
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
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

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
    if (lastHandledUrl === window.location.href) return true;
    if (pageLooksLikeError()) return false;
    if (!hasGenericSuccessElement() && !formDisappeared(formRef)) return false;

    lastHandledUrl = window.location.href;
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
      const company = metaCompany || hostnameCompany || 'Unknown Company';

      const titleCandidates = [
        structured?.title,
        document.querySelector('meta[property="og:title"]')?.content?.trim(),
        document.querySelector('h1')?.innerText?.trim(),
        document.querySelector('h2')?.innerText?.trim(),
        document.title?.trim()
      ];
      const role = titleCandidates.find(t =>
        t && t.length > 3 && !GENERIC_HEADINGS.includes(t.toLowerCase())
      ) || 'Unknown Role';

      // "Confident" means we're comfortable auto-saving without asking —
      // structured JobPosting data (when present) is trustworthy on its
      // own; otherwise require both a real company (not just a hostname
      // guess) and a real role, not just fallback text.
      const confident =
        (!!structured?.company && !!structured?.title) ||
        (!!metaCompany && company !== 'Unknown Company' && role !== 'Unknown Role');

      return {
        company,
        role: role.substring(0, 100),
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

    // Capture the form now, before anything changes — used as a
    // language-independent fallback signal if no phrase/URL matches.
    const formRef = element.closest('form');

    setTimeout(() => {
      if (lastHandledUrl === window.location.href) return;
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
      if (lastHandledUrl === window.location.href) return;

      const currentlyHasSuccessText = bodyLooksLikeSuccess();

      // Only react to a transition from absent -> present, never to text
      // that was already sitting on the page when we started observing.
      if (currentlyHasSuccessText && !bodyAlreadyHadSuccessTextOnLoad) {
        setTimeout(handleDetectedSuccess, 1000);
        return;
      }

      // Keep the baseline in sync — if the text disappears (e.g. a
      // dashboard entry gets removed) a later genuine reappearance should
      // still be able to trigger.
      bodyAlreadyHadSuccessTextOnLoad = currentlyHasSuccessText;

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