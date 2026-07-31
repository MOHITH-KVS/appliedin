// AppliedIn - Internshala Content Script
// Captures ONLY on submission confirmation

(function () {
  // PATH GUARD: don't track on non-apply pages of this portal
  const _blockedPaths = ['/chat', '/dashboard', '/my-profile', '/student/view_applications', '/message', '/notification', '/feed', '/course', '/training'];
  const _currentPath = window.location.pathname.toLowerCase();
  if (_blockedPaths.some(p => _currentPath.startsWith(p))) return;

  console.log('[AppliedIn] internshala.js loaded on', window.location.href);

  // Tracks the URL we already handled — prevents re-asking on every
  // subsequent DOM mutation once a success message is showing.
  let lastHandledUrl = null;
  let observerActive = true; // set false once popup opens — locks popup open


  // Validate that extracted text is actually a job role/company name
  // and not a success message or page noise
  const NOISE_WORDS = [
    'thank you', 'thanks for', 'successfully applied', 'application submitted',
    'you have applied', 'we have received', 'your application',
    'congratulations', 'we will be in touch', 'your submission',
  ];

  function isCleanText(text) {
    if (!text || text.length > 80) return false;
    const lower = text.toLowerCase();
    if (NOISE_WORDS.some(w => lower.includes(w))) return false;
    if (/[.!?]$/.test(text.trim())) return false;
    return true;
  }
  function extractSalary() {
    const selectors = [
      '[class*="salary"]', '[class*="ctc"]', '[class*="stipend"]',
      '[data-testid*="salary"]', '[class*="compensation"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText.trim()) return el.innerText.trim();
    }
    // Regex scan for salary patterns in page text
    const match = (document.body.innerText || '').match(
      /(₹[\d,]+\s*(?:LPA|lpa|L|k|\/month|per month|stipend)?[\s\-–to]*₹?[\d,]*\s*(?:LPA|lpa|L|k)?)/
    );
    return match ? match[1].trim() : '';
  }

  function extractJobType() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('internship')) return 'Internship';
    if (text.includes('full-time') || text.includes('full time')) return 'Full-Time';
    if (text.includes('part-time') || text.includes('part time')) return 'Part-Time';
    if (text.includes('contract')) return 'Contract';
    if (text.includes('freelance')) return 'Freelance';
    return '';
  }

  function extractWorkMode() {
    const text = (document.body.innerText || '').toLowerCase();
    if (text.includes('work from home') || text.includes('remote')) return 'Remote';
    if (text.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }


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
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Internshala',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) {
      return null;
    }
  }

  const successPhrases = [
    'successfully applied',
    'application submitted',
    'you have applied',
    'your application has been sent',
    'application sent successfully',
    'thank you for applying'
  ];

  function saveApplication(jobData) {
    window.__appliedinCommon.saveApplication(jobData, function () {
      // duplicate — this URL stays marked as handled, no re-prompt
    }, function () {
      // saved — this URL stays marked as handled, no re-prompt
    });
  }


  // Guard: if confirm popup already open (user typing), skip — don't interrupt.
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }
  function bodyLooksLikeSuccess() {
    // First try targeted selectors — Internshala shows success in a modal or alert
    const confirmationSelectors = [
      '.success-message', '.application-success', '[class*="success"]',
      '.modal-body', '.alert-success', '[class*="confirmation"]',
      '.thank-you', '[class*="thankyou"]', '.applied-success'
    ];

    for (const sel of confirmationSelectors) {
      const el = document.querySelector(sel);
      if (el && el.innerText) {
        const text = el.innerText.toLowerCase();
        if (successPhrases.some(p => text.includes(p))) return true;
      }
    }

    // Fallback: check full body BUT only if URL looks like a post-apply page
    const path = window.location.pathname.toLowerCase();
    const isApplyPath = path.includes('/apply') || path.includes('/internship/detail')
                     || path.includes('/job/detail');
    if (!isApplyPath) return false;

    const bodyText = (document.body.innerText || '').toLowerCase();
    return successPhrases.some(p => bodyText.includes(p));
  }

  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;

    const jobData = getJobDetails();

    if (jobData && jobData.company !== 'Unknown Company') {
      saveApplication(jobData);
    } else if (jobData) {
      window.__appliedinCommon.showConfirmPopup(jobData, 'Internshala', function () {
        // user answered — this URL stays marked as handled
      },
          function () { observerActive = false; } // lock popup open (reset on close)
        );
    } else {
      lastHandledUrl = null;
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
      if (lastHandledUrl === window.location.href) return;

      setTimeout(() => {
        if (bodyLooksLikeSuccess()) {
          handleSuccess();
        }
      }, 2000);
    }
  });

  // METHOD 2 — Watch for success message
  const observer = new MutationObserver(function () {
    if (!observerActive) return; // popup open — locked, don't interfere
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeSuccess()) {
      setTimeout(handleSuccess, 1000);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });


  // Check immediately on script load — handles redirect-based success pages
  // where the success message is already in DOM when our script injects
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(function() {
      if (typeof bodyLooksLikeSuccess === 'function' && bodyLooksLikeSuccess()) {
        if (typeof handleSuccess === 'function') handleSuccess();
      }
    }, 500);
  }

})();