// AppliedIn - Shine Content Script
// Shine.com is a large Indian job portal with a traditional apply flow.

(function () {
  let lastHandledUrl = null;
  let observerActive = true; // set false once popup opens — locks popup open

  function extractSalary() {
    const el =
      document.querySelector('.salary') ||
      document.querySelector('[class*="salary"]') ||
      document.querySelector('[class*="ctc"]');
    return el?.innerText?.trim() || '';
  }

  function extractJobType() {
    const el = document.querySelector('[class*="job-type"]') ||
               document.querySelector('[class*="employment"]');
    const text = (el?.innerText || document.body.innerText || '').toLowerCase();
    if (text.includes('internship')) return 'Internship';
    if (text.includes('full time') || text.includes('full-time')) return 'Full-Time';
    if (text.includes('part time')) return 'Part-Time';
    if (text.includes('contract')) return 'Contract';
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
        document.querySelector('.job-title')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() ||
        'Unknown Role';

      const company =
        document.querySelector('.company-name')?.innerText?.trim() ||
        document.querySelector('[class*="company"]')?.innerText?.trim() ||
        'Unknown Company';

      const location =
        document.querySelector('.job-location')?.innerText?.trim() ||
        document.querySelector('[class*="location"]')?.innerText?.trim() ||
        'Unknown Location';

      return {
        company, role: title, location,
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Shine',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch (e) { return null; }
  }

  const successPhrases = [
    'application submitted', 'successfully applied', 'you have applied',
    'application sent', 'thank you for applying', 'your application has been sent'
  ];


  // Guard: if confirm popup already open (user typing), skip — don't interrupt.
  function isPopupOpen() {
    return !!document.getElementById('appliedin-confirm');
  }
  function bodyLooksLikeSuccess() {
    return successPhrases.some(p => (document.body.innerText || '').toLowerCase().includes(p));
  }

  function handleSuccess() {
    if (lastHandledUrl === window.location.href) return;
    lastHandledUrl = window.location.href;
    const data = getJobDetails();
    if (data && data.company !== 'Unknown Company') {
      window.__appliedinCommon.saveApplication(data, null, null);
    } else if (data) {
      window.__appliedinCommon.showConfirmPopup(data, 'Shine', null,
          function () { observerActive = false; } // lock popup open
        );
    }
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, input[type="submit"], a');
    if (!btn) return;
    const text = (btn.innerText || btn.value || '').toLowerCase().trim();
    if (text.includes('apply') || text.includes('submit')) {
      if (lastHandledUrl === window.location.href) return;
      setTimeout(() => { if (bodyLooksLikeSuccess()) handleSuccess(); }, 2000);
    }
  });

  const observer = new MutationObserver(function () {
    if (!observerActive) return; // popup open — locked, don't interfere
    if (lastHandledUrl === window.location.href) return;
    if (bodyLooksLikeSuccess()) setTimeout(handleSuccess, 1000);
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
