// AppliedIn - LinkedIn Content Script v4
// State machine with single save guarantee:
// IDLE → APPLYING (Easy Apply clicked) → SUBMITTED (Submit clicked) → SAVED
// Once SAVED, nothing else can trigger another save for this URL.

(function () {
  const path = window.location.pathname.toLowerCase();
  // Allow ALL LinkedIn job paths — search results, detail pages, etc.
  // LinkedIn shows job panel on right side of search results page too
  // Only block pure non-job paths
  const hardBlock = [
    '/messaging', '/notifications', '/feed', '/mynetwork',
    '/learning', '/in/', '/company/', '/school/', '/groups/',
    '/pulse/', '/events/', '/jobs/tracker',
  ];
  if (hardBlock.some(p => path.startsWith(p))) return;
  if (window.__appliedinLinkedInInjected) return;
  window.__appliedinLinkedInInjected = true;

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const MAX_AGE = 30 * 60 * 1000;

  // ── State machine ──
  // Only ONE state transition matters: SUBMITTED → SAVED
  // All other events are no-ops
  const STATE = { IDLE: 0, APPLYING: 1, SUBMITTED: 2, SAVED: 3 };
  let state = STATE.IDLE;

  function setState(s) {
    if (s <= state) return; // never go backwards
    state = s;
    if (state === STATE.SAVED) observer.disconnect();
  }

  // ── Helpers ──
  const NOISE = ['thank you','thanks for','successfully applied',
    'application submitted','you have applied','we have received',
    'congratulations','we will be in touch','your submission'];

  function isClean(text) {
    if (!text || text.length > 80) return false;
    const l = text.toLowerCase();
    return !NOISE.some(w => l.includes(w)) && !/[.!?]$/.test(text.trim());
  }

  function extractSalary() {
    for (const s of ['[class*="salary"]','[class*="compensation"]','[class*="stipend"]']) {
      const el = document.querySelector(s);
      if (el?.innerText?.trim()) return el.innerText.trim();
    }
    return '';
  }
  function extractJobType() {
    const t = (document.body.innerText||'').toLowerCase();
    if (t.includes('internship')) return 'Internship';
    if (t.includes('full-time')||t.includes('full time')) return 'Full-Time';
    if (t.includes('part-time')) return 'Part-Time';
    if (t.includes('contract')) return 'Contract';
    return '';
  }
  function extractWorkMode() {
    const t = (document.body.innerText||'').toLowerCase();
    if (t.includes('remote')) return 'Remote';
    if (t.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }
  function getJobDetails() {
    try {
      const parts = (document.title||'').split('|').map(p=>p.trim()).filter(Boolean);
      const ttRole = parts.length >= 3 ? parts[0] : null;
      const ttComp = parts.length >= 3 ? parts[1] : null;
      const company =
        document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim() ||
        document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim() ||
        (ttComp && isClean(ttComp) ? ttComp : '') || '';
      const role =
        document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim() ||
        document.querySelector('h1.t-24')?.innerText?.trim() ||
        (ttRole && isClean(ttRole) ? ttRole : '') || '';
      const location =
        document.querySelector('.job-details-jobs-unified-top-card__bullet')?.innerText?.trim() || '';
      return { company, role, location,
        salary: extractSalary(), jobType: extractJobType(), workMode: extractWorkMode(),
        platform: 'LinkedIn', url: window.location.href,
        date: new Date().toISOString(), status: 'Applied' };
    } catch(e) { return null; }
  }
  function cachePending(data) {
    if (data?.company) chrome.storage.local.set({[PENDING_KEY]:{d:data,ts:Date.now()}});
  }
  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], r => {
      const e = r[PENDING_KEY];
      cb(e && (Date.now()-e.ts)<MAX_AGE ? e.d : null);
    });
  }
  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:600;z-index:2147483647;color:white;
      background:${color};box-shadow:0 4px 16px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},4000);
  }

  // ── SUCCESS PHRASES — only phrases unique to post-submit LinkedIn ──
  const SUCCESS_PHRASES = [
    'your application was sent',
    'application was sent',
    'application was sent to',
    'your application has been submitted',
    'application submitted',
    'you have applied',
    "you've applied",
    'application complete',
  ];
  function isSuccess() {
    const t = (document.body?.innerText||'').toLowerCase();
    return SUCCESS_PHRASES.some(p => t.includes(p));
  }

  // ── SAVE — guaranteed single call ──
  function doSave() {
    if (state >= STATE.SAVED) return; // already saved — never save twice
    setState(STATE.SAVED);

    getPending(function(pending) {
      const data = pending || getJobDetails();
      if (!data) {
        showConfirmPopup({});
        return;
      }
      if (data.company && data.role) {
        // Auto-save silently
        chrome.runtime.sendMessage({type:'SAVE_APPLICATION', data}, res => {
          chrome.storage.local.remove(PENDING_KEY);
          showToast(res?.duplicate
            ? '⚠️ Already applied here recently!'
            : '✅ Saved — ' + data.company,
            res?.duplicate ? '#f59e0b' : '#22c55e');
        });
      } else {
        // Missing fields — popup
        showConfirmPopup(data);
      }
    });
  }

  function showConfirmPopup(jobData) {
    window.__appliedinCommon.showConfirmPopup(
      jobData || {company:'',role:'',platform:'LinkedIn',
                  url:window.location.href,date:new Date().toISOString(),status:'Applied'},
      'LinkedIn',
      function(){ chrome.storage.local.remove(PENDING_KEY); },
      function(){ /* locked */ }
    );
  }

  // ── Click handler ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button,[role="button"]');
    if (!btn) return;
    const text = (btn.innerText||btn.getAttribute('aria-label')||'').trim().toLowerCase();

    if (text === 'easy apply' || text.includes('easy apply') ||
        text === 'apply' || text === 'apply now') {
      setState(STATE.APPLYING);
      cachePending(getJobDetails());
      return;
    }

    // Final submit detection — must be in APPLYING state
    const isFinalSubmit =
      text === 'submit application' ||
      text === 'submit my application' ||
      (text === 'done' && state === STATE.APPLYING &&
       !!btn.closest('[class*="easy-apply"],[class*="jobs-easy-apply"],[data-test-modal]'));

    if (isFinalSubmit && state === STATE.APPLYING) {
      setState(STATE.SUBMITTED);
      cachePending(getJobDetails());
      // Check after short delay
      setTimeout(() => {
        if (state >= STATE.SAVED) return;
        if (isSuccess()) doSave();
        else setTimeout(() => { if (state < STATE.SAVED && isSuccess()) doSave(); }, 2000);
      }, 1200);
    }
  }, true);

  // ── Observer — only acts in SUBMITTED state ──
  const observer = new MutationObserver(function() {
    if (state !== STATE.SUBMITTED) return; // strict — only SUBMITTED state
    if (window.__appliedinPopupOpen) return;
    if (isSuccess()) setTimeout(() => { if (state === STATE.SUBMITTED) doSave(); }, 600);
  });
  observer.observe(document.body, {childList:true, subtree:true});

  // ── Already-applied banner ──
  // Check if this URL was applied to previously and show a banner
  function checkAlreadyApplied() {
    const currentUrl = window.location.href;
    chrome.storage.local.get(['applications'], function(r) {
      const apps = r.applications || [];
      // Match by URL (job ID) or company+role
      const parts = (document.title||'').split('|').map(p=>p.trim());
      const pageRole = parts[0] || '';
      const pageComp = parts[1] || '';
      const match = apps.find(app =>
        app.url === currentUrl ||
        (app.company && pageComp &&
         app.company.toLowerCase().trim() === pageComp.toLowerCase().trim() &&
         app.role && pageRole &&
         app.role.toLowerCase().trim() === pageRole.toLowerCase().trim())
      );
      if (!match) return;
      // Show already-applied banner
      const banner = document.createElement('div');
      banner.style.cssText = `position:fixed;top:72px;right:16px;
        background:white;border:2px solid #1A56FF;border-radius:12px;
        padding:12px 16px;box-shadow:0 4px 20px rgba(26,86,255,0.15);
        z-index:2147483646;font-family:-apple-system,sans-serif;
        display:flex;align-items:center;gap:10px;max-width:280px;`;
      banner.innerHTML = `
        <span style="font-size:20px;">📋</span>
        <div>
          <div style="font-size:13px;font-weight:700;color:#1A56FF;">Already applied!</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">
            ${match.status} · ${new Date(match.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}
          </div>
        </div>
        <button onclick="this.parentNode.remove()" style="background:none;border:none;
          cursor:pointer;font-size:16px;color:#9ca3af;margin-left:auto;padding:2px;">✕</button>`;
      document.body.appendChild(banner);
      setTimeout(() => banner.remove(), 8000);
    });
  }
  // Check on load and on URL change (LinkedIn SPA)
  setTimeout(checkAlreadyApplied, 1500);
  let lastUrl = location.href;
  new MutationObserver(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      // Reset state for new job page
      if (state < STATE.SAVED) {
        state = STATE.IDLE;
      } else {
        state = STATE.IDLE; // always reset on navigation
      }
      chrome.storage.local.remove(PENDING_KEY);
      setTimeout(checkAlreadyApplied, 1500);
    }
  }).observe(document, {subtree:true, childList:true});

})();
