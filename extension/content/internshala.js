// AppliedIn - Internshala Content Script v2
// Architecture:
// - On submit click → cache data silently, wait for success
// - On success detected → if popup already open, do NOTHING
// - If popup not open → auto-save if data clean, else show popup
// - Popup uses heartbeat (setInterval) — survives DOM re-renders
// - Recommended job modals handled separately

(function () {
  const _blockedPaths = ['/chat','/dashboard','/my-profile',
    '/student/view_applications','/message','/notification','/feed','/course','/training'];
  if (_blockedPaths.some(p => window.location.pathname.toLowerCase().startsWith(p))) return;
  if (window.__appliedinIntersharaInjected) return;
  window.__appliedinIntersharaInjected = true;
  window.__appliedinHandled = true;

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const MAX_AGE = 30 * 60 * 1000;
  let alreadyHandled = false;
  let heartbeat = null;

  // ── Noise filter ──
  const NOISE = ['thank you','thanks for','successfully applied','application submitted',
    'you have applied','we have received','your application','congratulations',
    'we will be in touch','your submission','on successful'];
  function isClean(text) {
    if (!text || text.length > 80) return false;
    const l = text.toLowerCase();
    if (NOISE.some(w => l.includes(w))) return false;
    if (/[.!?]$/.test(text.trim())) return false;
    return true;
  }

  // ── Extraction helpers ──
  function extractSalary(root) {
    root = root || document;
    for (const s of ['[class*="stipend"]','[class*="salary"]','[class*="ctc"]']) {
      const el = root.querySelector(s);
      if (el?.innerText?.trim()) return el.innerText.trim();
    }
    const m = (root.innerText||'').match(/(₹[\d,]+\s*(?:LPA|lpa|\/month|per month)?[\s\-–to]*₹?[\d,]*\s*(?:LPA|lpa)?)/);
    return m ? m[1].trim() : '';
  }
  function extractJobType(root) {
    const t = ((root||document).innerText||'').toLowerCase();
    if (t.includes('internship')) return 'Internship';
    if (t.includes('full-time')||t.includes('full time')) return 'Full-Time';
    if (t.includes('part-time')||t.includes('part time')) return 'Part-Time';
    if (t.includes('contract')) return 'Contract';
    return 'Internship';
  }
  function extractWorkMode(root) {
    const t = ((root||document).innerText||'').toLowerCase();
    if (t.includes('work from home')||t.includes('remote')) return 'Remote';
    if (t.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }

  // ── Get job details — tries modal first, then page ──
  function getJobDetails(modalRoot) {
    try {
      const root = modalRoot || document;
      const title =
        root.querySelector('.profile')?.innerText?.trim() ||
        root.querySelector('[class*="profile-title"]')?.innerText?.trim() ||
        root.querySelector('h2')?.innerText?.trim() ||
        root.querySelector('h1')?.innerText?.trim() || '';

      const company =
        root.querySelector('.company-name a')?.innerText?.trim() ||
        root.querySelector('.company-name')?.innerText?.trim() ||
        root.querySelector('[class*="company"]')?.innerText?.trim() || '';

      const location =
        root.querySelector('.location_link')?.innerText?.trim() ||
        root.querySelector('[class*="location"]')?.innerText?.trim() || '';

      return {
        company: isClean(company) ? company : '',
        role:    isClean(title)   ? title   : '',
        location: location || 'Unknown Location',
        salary:   extractSalary(root),
        jobType:  extractJobType(root),
        workMode: extractWorkMode(root),
        platform: 'Internshala',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch(e) { return null; }
  }

  // ── Cache pending ──
  function cachePending(data) {
    if (data?.company || data?.role) {
      chrome.storage.local.set({[PENDING_KEY]:{jobData:data,ts:Date.now()}});
    }
  }
  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], r => {
      const e = r[PENDING_KEY];
      cb(e && (Date.now()-e.ts)<MAX_AGE ? e.jobData : null);
    });
  }

  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:500;z-index:2147483647;color:white;
      background:${color};box-shadow:0 4px 12px rgba(0,0,0,0.2);
      font-family:-apple-system,sans-serif;transition:opacity 0.3s;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3500);
  }

  function doSave(data) {
    chrome.runtime.sendMessage({type:'SAVE_APPLICATION',data}, res => {
      chrome.storage.local.remove(PENDING_KEY);
      showToast(res?.duplicate?'⚠️ Already applied recently!':'✅ Saved — '+data.company,
                res?.duplicate?'#f59e0b':'#22c55e');
    });
  }

  // ── Heartbeat popup — survives DOM re-renders ──
  function showHeartbeatPopup(jobData) {
    if (alreadyHandled) return;
    alreadyHandled = true;
    observer.disconnect();

    const company = jobData?.company || '';
    const role    = jobData?.role    || '';

    function ensurePopup() {
      if (document.getElementById('ai-is-popup')) return;

      // Remove stale overlay
      document.getElementById('ai-is-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ai-is-overlay';
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483645;`;

      const popup = document.createElement('div');
      popup.id = 'ai-is-popup';
      popup.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        width:400px;max-width:92vw;background:white;border-radius:16px;padding:24px;
        box-shadow:0 24px 80px rgba(0,0,0,0.35);z-index:2147483647;border:1px solid #e5e7eb;
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

      const savedC = window.__ai_is_company !== undefined ? window.__ai_is_company : company;
      const savedR = window.__ai_is_role    !== undefined ? window.__ai_is_role    : role;

      popup.innerHTML = `
        <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
        <div style="font-size:13px;color:#22c55e;font-weight:600;margin-bottom:14px;">✅ Application submitted — save details</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
              letter-spacing:.05em;display:block;margin-bottom:3px;">Company *</label>
            <input id="ai-is-company" value="${savedC.replace(/"/g,'&quot;')}"
              placeholder="${savedC?'':'⚠️ Type company name'}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;
              border:2px solid ${savedC?'#d1d5db':'#ef4444'};border-radius:8px;
              font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
              letter-spacing:.05em;display:block;margin-bottom:3px;">Job Role *</label>
            <input id="ai-is-role" value="${savedR.replace(/"/g,'&quot;').substring(0,80)}"
              placeholder="${savedR?'':'⚠️ Type job role'}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;
              border:2px solid ${savedR?'#d1d5db':'#ef4444'};border-radius:8px;
              font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ai-is-save" style="flex:1;padding:11px;background:#22c55e;color:white;
            border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
            ✅ Save Application
          </button>
          <button id="ai-is-skip" style="padding:11px 18px;background:#f3f4f6;color:#374151;
            border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
            Skip
          </button>
        </div>`;

      document.body.appendChild(overlay);
      document.body.appendChild(popup);

      // Persist typed values across re-renders
      const ci = document.getElementById('ai-is-company');
      const ri = document.getElementById('ai-is-role');
      if (ci) ci.addEventListener('input', () => { window.__ai_is_company = ci.value; });
      if (ri) ri.addEventListener('input', () => { window.__ai_is_role    = ri.value; });

      document.getElementById('ai-is-save').addEventListener('click', function() {
        const fc = (document.getElementById('ai-is-company')?.value||'').trim();
        const fr = (document.getElementById('ai-is-role')?.value||'').trim();
        if (!fc) {
          const el = document.getElementById('ai-is-company');
          if (el) { el.style.border='2px solid #ef4444'; el.focus(); }
          return;
        }
        if (!fr) {
          const el = document.getElementById('ai-is-role');
          if (el) { el.style.border='2px solid #ef4444'; el.focus(); }
          return;
        }
        clearInterval(heartbeat);
        overlay.remove(); popup.remove();
        doSave({...(jobData||{}), company:fc, role:fr,
          platform:'Internshala', url:window.location.href,
          date:new Date().toISOString(), status:'Applied'});
      });

      document.getElementById('ai-is-skip').addEventListener('click', function() {
        clearInterval(heartbeat);
        overlay.remove(); popup.remove();
        chrome.storage.local.remove(PENDING_KEY);
      });
    }

    // Focus first empty field on first show
    setTimeout(()=>{
      const c=document.getElementById('ai-is-company');
      const r=document.getElementById('ai-is-role');
      if(c&&!c.value.trim()) c.focus();
      else if(r&&!r.value.trim()) r.focus();
    }, 150);

    ensurePopup();
    heartbeat = setInterval(ensurePopup, 120);
    setTimeout(()=>clearInterval(heartbeat), 5*60*1000);
  }

  // ── Success detection ──
  const successPhrases = [
    'successfully applied','application submitted',
    'you have applied',"you've applied",
    'your application has been sent','application sent successfully',
    'thank you for applying','applied successfully',
  ];

  function isSuccess(root) {
    root = root || document;
    // Check confirmation elements first
    const selectors = ['.success-message','.application-success',
      '[class*="success"]','.alert-success','[class*="confirmation"]',
      '.thank-you','[class*="thankyou"]','.applied-success','.modal-body'];
    for (const sel of selectors) {
      const el = root.querySelector(sel);
      if (el?.innerText) {
        const t = el.innerText.toLowerCase();
        if (successPhrases.some(p => t.includes(p))) return true;
      }
    }
    // Fallback body scan only on apply paths
    const path = window.location.pathname.toLowerCase();
    if (!path.includes('/internship/detail') && !path.includes('/jobs/detail') && !path.includes('/apply')) return false;
    return successPhrases.some(p => (root.innerText||'').toLowerCase().includes(p));
  }

  // ── Handle confirmed success ──
  function handleConfirmedSuccess(modalRoot) {
    if (alreadyHandled) return;
    // CRITICAL: if popup already open — do NOTHING, let user finish
    if (document.getElementById('ai-is-popup')) return;
    alreadyHandled = true;
    observer.disconnect();

    getPending(function(pending) {
      const data = pending || getJobDetails(modalRoot);
      if (data && data.company && data.role) {
        // Both fields clean — auto save silently, no popup
        doSave(data);
      } else {
        // Missing fields — show popup so user can fill
        showHeartbeatPopup(data || {});
      }
    });
  }

  // ── MutationObserver ──
  const observer = new MutationObserver(function() {
    if (alreadyHandled) return;
    // CRITICAL CHECK: if popup open — ignore ALL DOM changes
    if (document.getElementById('ai-is-popup')) return;
    if (isSuccess()) setTimeout(() => handleConfirmedSuccess(), 600);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── Click handler — cache data + detect submit ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button,a,[role="button"]');
    if (!btn) return;
    const text = (btn.innerText||'').toLowerCase().trim();

    // Find modal context if any
    const modal = btn.closest('[class*="modal"],[class*="dialog"],[role="dialog"]');

    // Cache on apply click (for recommended jobs in modal too)
    if (text.includes('apply') || text.includes('continue')) {
      const data = getJobDetails(modal);
      cachePending(data);
    }

    // On submit — cache and wait for success via observer
    const isSubmit = text==='submit'||text.includes('submit application')||
                     text.includes('send application')||text==='confirm';
    if (isSubmit && !alreadyHandled) {
      const data = getJobDetails(modal);
      cachePending(data);
      // Fallback check after 3s if observer misses it
      setTimeout(()=>{
        if (alreadyHandled) return;
        if (document.getElementById('ai-is-popup')) return;
        if (isSuccess()) handleConfirmedSuccess(modal);
      }, 3000);
    }
  }, true); // useCapture — fires before Internshala's own handlers

  // Check on load for redirect-based success
  if (isSuccess()) setTimeout(()=>handleConfirmedSuccess(), 800);

})();
