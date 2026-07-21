// AppliedIn - Internshala Content Script
// Captures ONLY on submission confirmation

(function () {
  console.log('[AppliedIn] internshala.js loaded on', window.location.href);

  // Chat/messaging pages legitimately contain phrases like "your
  // application has been received" as normal conversation text — that
  // is NOT a submission confirmation, and this script should never run
  // there at all. This was firing false popups on Internshala's chat
  // inbox, using a completely unrelated job's info from the sidebar.
  const EXCLUDED_PATH_PATTERNS = ['/chat/', '/message', '/inbox', '/conversation'];
  if (EXCLUDED_PATH_PATTERNS.some(p => window.location.pathname.toLowerCase().includes(p))) {
    console.log('[AppliedIn] internshala.js: excluded page type, not running');
    return;
  }

  // Tracks the URL we already handled, with a cooldown rather than a
  // permanent lock — this blocks immediate re-triggers for the SAME
  // event (e.g. rapid duplicate DOM mutations), while still allowing a
  // genuinely NEW, later application on the same page to be caught —
  // important for "Recommended jobs for you" widgets where someone
  // applies to a second job shortly after the first.
  let lastHandledUrl = null;
  let lastHandledAt = 0;
  const REARM_COOLDOWN_MS = 8000;

  function isRecentlyHandled() {
    return lastHandledUrl === normalizedUrl() && (Date.now() - lastHandledAt) < REARM_COOLDOWN_MS;
  }

  function markHandled() {
    lastHandledUrl = normalizedUrl();
    lastHandledAt = Date.now();
  }

  // SPA-style portals often mutate query strings/hash on internal
  // navigation without a real reload - comparing origin+pathname only
  // avoids false re-triggers from those irrelevant URL changes.
  function normalizedUrl() {
    return window.location.origin + window.location.pathname;
  }

  // Some sites (Internshala included) overlay a "Recommended jobs for
  // you" modal on TOP of the actual application form — a naive selector
  // can grab an unrelated job's company from that overlay instead of the
  // real one being applied to. Skip anything inside a modal/overlay/
  // recommendation container.
  function isInsideExcludedContainer(el) {
    if (!el) return false;
    return !!el.closest(
      '[class*="modal" i], [class*="overlay" i], [class*="recommend" i], ' +
      '[class*="popup" i], [id*="modal" i], [class*="suggestion" i]'
    );
  }

  function textFromSelector(selector) {
    const el = document.querySelector(selector);
    if (!el || isInsideExcludedContainer(el)) return null;
    return el.innerText?.trim() || null;
  }

  // Final sanity check on ANY extracted text before it's trusted, from
  // any source. A '|' character or unusual length is a strong sign that
  // a selector accidentally grabbed multiple concatenated UI elements
  // (e.g. "CompanyRole internship|Chatting") rather than one clean value.
  function looksLikeGarbledConcatenation(text) {
    if (!text) return false;
    if (text.includes('|')) return true;
    if (text.length > 80) return true;
    // Two capital-letter "words" running together with no space
    // ("WordscloudAI") is another common symptom of concatenation.
    if (/[a-z][A-Z]{2,}/.test(text)) return true;
    return false;
  }

  // Internshala's application URLs encode the exact role and company
  // directly, e.g. ".../form/fresher-remote-junior-data-analyst-job-at-
  // datavinci-private-limited1783937402" — far more reliable than
  // guessing CSS class names, which can silently go stale.
  function parseFromUrlSlug() {
    try {
      const path = decodeURIComponent(window.location.pathname);
      const match = path.match(/\/form\/(.+?)-job-at-([a-z0-9-]+?)(\d+)?\/?$/i);
      if (!match) return null;

      const roleSlug = match[1];
      const companySlug = match[2];

      const toTitleCase = (slug) =>
        slug.split('-').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

      const role = toTitleCase(roleSlug);
      const company = toTitleCase(companySlug);

      if (!role || !company) return null;
      return { role, company };
    } catch (e) {
      return null;
    }
  }

  function getJobDetails() {
    try {
      const structured = window.__appliedinCommon?.getStructuredJobData?.();
      const clean = window.__appliedinCommon?.cleanAndValidateRole;
      const urlParsed = parseFromUrlSlug();

      const titleCandidates = [
        structured?.title,
        urlParsed?.role,
        textFromSelector('.profile'),
        textFromSelector('[class*="profile-title"]'),
        textFromSelector('h1')
      ];
      const title = titleCandidates
        .map(t => clean ? clean(t) : t)
        .find(t => t && !looksLikeGarbledConcatenation(t)) || 'Unknown Role';

      const companyCandidates = [
        structured?.company,
        urlParsed?.company,
        textFromSelector('.company-name a'),
        textFromSelector('.company-name'),
        textFromSelector('[class*="company"]')
      ];
      const company = companyCandidates.find(c => c && !looksLikeGarbledConcatenation(c)) || 'Unknown Company';

      const location =
        structured?.location ||
        textFromSelector('.location_link') ||
        textFromSelector('[class*="location"]') ||
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
      // Even on error, return SOMETHING so a popup can still be shown —
      // never go completely silent.
      return {
        company: 'Unknown Company',
        role: 'Unknown Role',
        location: 'Work From Home',
        platform: 'Internshala',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    }
  }

  const successPhrases = [
    'successfully applied',
    'application submitted',
    'you have applied',
    'your application has been sent',
    'application sent successfully',
    'thank you for applying',
    'has been submitted',
    'has been received'
  ];

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — this URL stays marked as handled, no re-prompt
    }, function () {
      // saved — this URL stays marked as handled, no re-prompt
    });
  }

  function bodyLooksLikeSuccess() {
    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  function handleSuccess() {
    if (isRecentlyHandled()) return;
    markHandled();

    const jobData = getJobDetails();

    if (jobData && jobData.company !== 'Unknown Company' && jobData.role !== 'Unknown Role') {
      saveApplication(jobData);
    } else if (jobData) {
      window.__appliedinCommon.showConfirmPopup(jobData, 'Internshala', function () {
        // user answered — this URL stays marked as handled
      });
    } else {
      lastHandledUrl = null; lastHandledAt = 0;
    }
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
      if (isRecentlyHandled()) return;

      setTimeout(() => {
        if (bodyLooksLikeSuccess()) {
          handleSuccess();
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message (debounced)
  let mutationDebounce = null;
  const observer = new MutationObserver(function () {
    clearTimeout(mutationDebounce);
    mutationDebounce = setTimeout(() => {
      if (isRecentlyHandled()) return;
      if (bodyLooksLikeSuccess()) {
        setTimeout(handleSuccess, 1000);
      }
    }, 400);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });

})();
