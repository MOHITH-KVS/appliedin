// AppliedIn - LinkedIn Content Script v3
// STRICT rules to prevent false saves on job listing pages:
// - ONLY saves after clicking "Submit application" or "Done" in Easy Apply modal
// - ONLY saves after "Your application was sent" appears
// - Never saves just from opening a job page
// - "successfully applied" removed — LinkedIn shows this on old applications
// - "done" only triggers save if user clicked Submit first (submitClicked flag)

(function () {
  // PATH GUARD — only run on job detail/apply pages
  const path = window.location.pathname.toLowerCase();
  const allowedPaths = ['/jobs/'];
  const blockedPaths = [
    '/messaging', '/notifications', '/feed', '/mynetwork',
    '/learning', '/in/', '/company/', '/school/', '/groups/',
    '/jobs/search', '/jobs/collections', '/jobs/recommended',
  ];
  if (!allowedPaths.some(p => path.startsWith(p))) return;
  if (blockedPaths.some(p => path.startsWith(p))) return;

  if (window.__appliedinLinkedInInjected) return;
  window.__appliedinLinkedInInjected = true;

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE = 30 * 60 * 1000;

  // KEY FLAG: only allow save if user actually clicked Submit/Done in modal
  // This prevents observer from saving just because a phrase appears on page
  let submitClicked = false;
  let alreadyHandled = false;
  let observerActive = true;

  // ── Noise filter ──
  const NOISE = ['thank you','thanks for','successfully applied',
    'application submitted','you have applied','we have received',
    'your application','congratulations','we will be in touch',
    'your submission','done','complete'];

  function isClean(text) {
    if (!text || text.length > 80) return false;
    const l = text.toLowerCase();
    if (NOISE.some(w => l.includes(w))) return false;
    if (/[.!?]$/.test(text.trim())) return false;
    return true;
  }

  // ── Extraction ──
  function extractSalary() {
    for (const s of ['[class*="salary"]','[class*="ctc"]','[class*="stipend"]',
                     '[data-testid*="salary"]','[class*="compensation"]']) {
      const el = document.querySelector(s);
      if (el?.innerText?.trim()) return el.innerText.trim();
    }
    return '';
  }
  function extractJobType() {
    const t = (document.body.innerText||'').toLowerCase();
    if (t.includes('internship')) return 'Internship';
    if (t.includes('full-time')||t.includes('full time')) return 'Full-Time';
    if (t.includes('part-time')||t.includes('part time')) return 'Part-Time';
    if (t.includes('contract')) return 'Contract';
    return '';
  }
  function extractWorkMode() {
    const t = (document.body.innerText||'').toLowerCase();
    if (t.includes('remote')) return 'Remote';
    if (t.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }
  function getDetailsFromTitle() {
    const parts = (document.title||'').split('|').map(p=>p.trim()).filter(Boolean);
    // "Software Engineer | Google | LinkedIn" → role=Software Engineer, company=Google
    if (parts.length >= 3 && parts[parts.length-1].toLowerCase() === 'linkedin') {
      return { role: parts[0], company: parts[1] };
    }
    if (parts.length >= 2) return { role: parts[0], company: parts[1] };
    return { role: null, company: null };
  }
  function getJobDetails() {
    try {
      const tt = getDetailsFromTitle();
      const company =
        isClean(document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim()) ||
        isClean(document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim()) ||
        (tt.company && isClean(tt.company) ? tt.company : '') || '';
      const role =
        isClean(document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim()) ||
        isClean(document.querySelector('h1.t-24')?.innerText?.trim()) ||
        (tt.role && isClean(tt.role) ? tt.role : '') || '';
      const location =
        document.querySelector('.job-details-jobs-unified-top-card__bullet')?.innerText?.trim() || '';
      return { company, role, location,
        salary: extractSalary(), jobType: extractJobType(), workMode: extractWorkMode(),
        platform: 'LinkedIn', url: window.location.href,
        date: new Date().toISOString(), status: 'Applied' };
    } catch(e) {
      const tt = getDetailsFromTitle();
      return { company: tt.company||'', role: tt.role||'', location:'',
        platform:'LinkedIn', url:window.location.href,
        date:new Date().toISOString(), status:'Applied' };
    }
  }
  function getCacheable() {
    const d = getJobDetails();
    return (d.company && d.role) ? d : null;
  }

  // ── Cache ──
  function cachePending(data) {
    if (data) chrome.storage.local.set({[PENDING_KEY]:{jobData:data,ts:Date.now()}});
  }
  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], r => {
      const e = r[PENDING_KEY];
      cb(e && (Date.now()-e.ts)<PENDING_MAX_AGE ? e.jobData : null);
    });
  }

  // ── SUCCESS PHRASES — strictly LinkedIn post-apply only ──
  // "successfully applied" REMOVED — appears on job listing cards
  // "done" REMOVED — appears on many UI elements
  const SUCCESS_PHRASES = [
    'your application was sent',
    'application was sent to',
    'your application has been submitted',
  ];

  function isPostApplySuccess() {
    const bodyText = (document.body?.innerText||'').toLowerCase();
    return SUCCESS_PHRASES.some(p => bodyText.includes(p));
  }

  // ── Handle confirmed success ──
  function handleSuccess() {
    if (alreadyHandled) return;
    if (window.__appliedinPopupOpen) return;
    // STRICT: only handle if submit was actually clicked
    if (!submitClicked) return;
    alreadyHandled = true;
    observer.disconnect();

    getPending(function(pending) {
      const data = pending || getJobDetails();
      if (data && data.company && data.role) {
        // Both clean — save silently
        chrome.runtime.sendMessage({type:'SAVE_APPLICATION', data}, res => {
          chrome.storage.local.remove(PENDING_KEY);
          showToast(res?.duplicate
            ? '⚠️ Already applied here recently!'
            : '✅ Saved — ' + data.company,
            res?.duplicate ? '#f59e0b' : '#22c55e');
        });
      } else {
        // Missing fields — show popup
        window.__appliedinCommon.showConfirmPopup(
          data || {company:'',role:'',platform:'LinkedIn',
                   url:window.location.href,date:new Date().toISOString(),status:'Applied'},
          'LinkedIn',
          function(){ chrome.storage.local.remove(PENDING_KEY); observerActive=true; },
          function(){ observerActive=false; }
        );
      }
    });
  }

  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:500;z-index:2147483647;color:white;
      background:${color};box-shadow:0 4px 12px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3500);
  }

  // ── Click handler ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button,[role="button"]');
    if (!btn) return;
    const text = (btn.innerText||btn.getAttribute('aria-label')||'').trim().toLowerCase();

    // Cache on Easy Apply click
    if (text === 'easy apply' || text.includes('easy apply')) {
      cachePending(getCacheable());
      return;
    }

    // FINAL submit only — must match exactly
    const isFinalSubmit =
      text === 'submit application' ||
      text === 'submit my application' ||
      (text === 'done' && document.querySelector('[class*="easy-apply"],'
        + '[class*="jobs-easy-apply"]'));

    if (isFinalSubmit) {
      cachePending(getCacheable());
      submitClicked = true; // unlock save
      setTimeout(() => {
        if (alreadyHandled) return;
        if (isPostApplySuccess()) handleSuccess();
        else {
          // Success phrase didn't appear — wait for observer
          setTimeout(() => {
            if (!alreadyHandled && isPostApplySuccess()) handleSuccess();
          }, 2000);
        }
      }, 1500);
    }
  }, true);

  // ── Observer — only fires if submitClicked is true ──
  const observer = new MutationObserver(function() {
    if (!observerActive) return;
    if (window.__appliedinPopupOpen) return;
    if (alreadyHandled) return;
    if (!submitClicked) return; // STRICT GATE — no submit = no save
    if (isPostApplySuccess()) setTimeout(handleSuccess, 800);
  });
  observer.observe(document.body, {childList:true, subtree:true});

  // NO on-load check — LinkedIn job pages always have text that could
  // match success phrases. Only save after explicit user action.

})();
