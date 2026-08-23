// AppliedIn - LinkedIn Content Script v5
// Simplified: no strict state machine that was blocking saves.
// Strategy:
// 1. On Easy Apply click — cache job details
// 2. On Submit click — mark submitClicked = true
// 3. Observer watches for success phrase — saves when found
// 4. Fallback poll every 1s for 2 mins after submit
// 5. On URL change (SPA nav) — full reset

(function () {
  if (window.__appliedinLinkedInInjected) return;
  window.__appliedinLinkedInInjected = true;

  // Block non-job pages only
  const path = window.location.pathname.toLowerCase();
  const BLOCK = ['/messaging','/notifications','/feed','/mynetwork',
    '/learning','/pulse/','/events/','/jobs/tracker'];
  if (BLOCK.some(p => path.startsWith(p))) return;

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const MAX_AGE = 30 * 60 * 1000;

  let submitClicked = false;
  let saved = false;
  let pollTimer = null;

  // ── Extract job details ──
  function getJobDetails() {
    try {
      // Try page selectors first
      const company =
        document.querySelector('.job-details-jobs-unified-top-card__company-name a')?.innerText?.trim() ||
        document.querySelector('.job-details-jobs-unified-top-card__company-name')?.innerText?.trim() ||
        document.querySelector('[class*="topcard__org-name"]')?.innerText?.trim() ||
        document.querySelector('[class*="company-name"]')?.innerText?.trim() || '';

      const role =
        document.querySelector('.job-details-jobs-unified-top-card__job-title h1')?.innerText?.trim() ||
        document.querySelector('h1.t-24')?.innerText?.trim() ||
        document.querySelector('[class*="topcard__title"]')?.innerText?.trim() ||
        document.querySelector('h1')?.innerText?.trim() || '';

      const location =
        document.querySelector('.job-details-jobs-unified-top-card__bullet')?.innerText?.trim() ||
        document.querySelector('.topcard__flavor--bullet')?.innerText?.trim() || '';

      // Page title fallback — "Role | Company | LinkedIn"
      if (!company || !role) {
        const parts = (document.title||'').split('|').map(p=>p.trim()).filter(Boolean);
        return {
          company: company || (parts.length >= 2 ? parts[1] : ''),
          role:    role    || (parts.length >= 1 ? parts[0] : ''),
          location,
          platform: 'LinkedIn',
          url: window.location.href,
          date: new Date().toISOString(),
          status: 'Applied'
        };
      }

      return { company, role, location,
        platform: 'LinkedIn', url: window.location.href,
        date: new Date().toISOString(), status: 'Applied' };
    } catch(e) {
      return { company:'', role:'', location:'',
        platform:'LinkedIn', url:window.location.href,
        date:new Date().toISOString(), status:'Applied' };
    }
  }

  function cachePending(data) {
    if (data?.company || data?.role)
      chrome.storage.local.set({[PENDING_KEY]:{d:data,ts:Date.now()}});
  }
  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], r => {
      const e = r[PENDING_KEY];
      cb(e && (Date.now()-e.ts)<MAX_AGE ? e.d : null);
    });
  }

  function showToast(msg, color) {
    const existing = document.getElementById('ai-li-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'ai-li-toast';
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:600;z-index:2147483647;color:white;
      background:${color};box-shadow:0 4px 16px rgba(0,0,0,0.2);
      font-family:-apple-system,sans-serif;transition:opacity 0.3s;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},4000);
  }

  // ── Success detection — strict phrases only ──
  const SUCCESS = [
    'your application was sent',
    'application was sent',
    'application was sent to',
    'your application has been submitted',
    'application submitted successfully',
    'you have applied',
    "you've applied",
    'application complete',
  ];

  function isSuccess() {
    const body = (document.body?.innerText||'').toLowerCase();
    return SUCCESS.some(p => body.includes(p));
  }

  // ── Save ──
  function doSave() {
    if (saved) return;
    saved = true;
    clearInterval(pollTimer);
    observer.disconnect();
    window.__appliedinHandled = true;

    getPending(function(pending) {
      const data = pending || getJobDetails();

      if (data && data.company && data.role) {
        chrome.runtime.sendMessage({type:'SAVE_APPLICATION', data}, res => {
          chrome.storage.local.remove(PENDING_KEY);
          showToast(
            res?.duplicate ? '⚠️ Already applied here recently!' : '✅ Saved — ' + data.company,
            res?.duplicate ? '#f59e0b' : '#22c55e'
          );
        });
      } else {
        // Show popup if fields missing
        if (window.__appliedinCommon) {
          window.__appliedinCommon.showConfirmPopup(
            data || {company:'',role:'',platform:'LinkedIn',
                     url:window.location.href,date:new Date().toISOString(),status:'Applied'},
            'LinkedIn',
            function(){ chrome.storage.local.remove(PENDING_KEY); },
            function(){}
          );
        }
      }
    });
  }

  // ── Click handler ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button,[role="button"]');
    if (!btn) return;
    const text = (btn.innerText||btn.getAttribute('aria-label')||'').trim().toLowerCase();

    // Easy Apply / Apply — cache data immediately
    if (text === 'easy apply' || text.includes('easy apply') ||
        text === 'apply' || text === 'apply now') {
      cachePending(getJobDetails());
      return;
    }

    // Submit — mark clicked and start watching
    const isSubmit =
      text === 'submit application' ||
      text === 'submit my application' ||
      text.includes('submit application') ||
      (text === 'done' && !!btn.closest('[class*="easy-apply"],[class*="jobs-easy-apply"],[data-test-modal],[aria-labelledby*="apply"]'));

    if (isSubmit && !saved) {
      submitClicked = true;
      cachePending(getJobDetails()); // cache latest data at submit time

      // Check immediately and with retries
      setTimeout(() => { if (!saved && isSuccess()) doSave(); }, 800);
      setTimeout(() => { if (!saved && isSuccess()) doSave(); }, 2000);
      setTimeout(() => { if (!saved && isSuccess()) doSave(); }, 4000);

      // Poll every 1s for 2 minutes as safety net
      clearInterval(pollTimer);
      pollTimer = setInterval(() => {
        if (saved) { clearInterval(pollTimer); return; }
        if (isSuccess()) { clearInterval(pollTimer); doSave(); }
      }, 1000);
      setTimeout(() => clearInterval(pollTimer), 2 * 60 * 1000);
    }
  }, true); // capture phase

  // ── Observer — watches DOM for success phrase after submit ──
  const observer = new MutationObserver(function() {
    if (!submitClicked || saved) return;
    if (window.__appliedinPopupOpen) return;
    if (isSuccess()) setTimeout(() => { if (!saved) doSave(); }, 500);
  });
  observer.observe(document.body, {childList:true, subtree:true});

  // ── SPA navigation — full reset when URL changes ──
  let lastUrl = window.location.href;
  const navObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      submitClicked = false;
      saved = false;
      clearInterval(pollTimer);
      chrome.storage.local.remove(PENDING_KEY);
      window.__appliedinHandled = false;
      // Re-check already applied for new job
      setTimeout(checkAlreadyApplied, 1500);
    }
  });
  navObserver.observe(document, {subtree:true, childList:true});

  // ── Already applied banner ──
  function checkAlreadyApplied() {
    if (document.getElementById('ai-li-banner')) return;
    const currentUrl = window.location.href;
    chrome.storage.local.get(['applications'], function(r) {
      const apps = r.applications || [];
      if (!apps.length) return;

      const parts = (document.title||'').split('|').map(p=>p.trim()).filter(Boolean);
      const pageRole = (parts[0]||'').toLowerCase().trim();
      const pageComp = (parts[1]||'').toLowerCase().trim();

      const match = apps.find(app => {
        // URL match
        if (app.url && app.url === currentUrl) return true;
        // Exact company + role match
        const ac = (app.company||'').toLowerCase().trim();
        const ar = (app.role||'').toLowerCase().trim();
        if (!ac || !ar || !pageComp || !pageRole) return false;
        const compMatch = pageComp.includes(ac) || ac.includes(pageComp);
        const roleMatch = pageRole === ar || pageRole.includes(ar) || ar.includes(pageRole);
        return compMatch && roleMatch;
      });

      if (!match) return;

      const banner = document.createElement('div');
      banner.id = 'ai-li-banner';
      banner.style.cssText = `position:fixed;top:72px;right:16px;
        background:white;border:2px solid #1A56FF;border-radius:12px;
        padding:12px 16px;box-shadow:0 4px 20px rgba(26,86,255,0.15);
        z-index:2147483646;font-family:-apple-system,sans-serif;
        display:flex;align-items:center;gap:10px;max-width:280px;
        animation:slideIn 0.3s ease;`;

      const style = document.createElement('style');
      style.textContent = '@keyframes slideIn{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}';
      document.head.appendChild(style);

      const date = new Date(match.date).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
      banner.innerHTML = `
        <span style="font-size:20px;">✅</span>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#1A56FF;">Already Applied!</div>
          <div style="font-size:11px;color:#6b7280;margin-top:2px;">${match.status} · ${date}</div>
        </div>
        <button id="ai-li-banner-close" style="background:none;border:none;cursor:pointer;
          font-size:18px;color:#9ca3af;padding:2px 4px;line-height:1;">×</button>`;

      document.body.appendChild(banner);
      document.getElementById('ai-li-banner-close').addEventListener('click', () => banner.remove());
      setTimeout(() => { if (banner.parentNode) banner.remove(); }, 8000);
    });
  }

  setTimeout(checkAlreadyApplied, 1500);

})();
