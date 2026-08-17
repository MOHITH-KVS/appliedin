// AppliedIn - Internshala Content Script v3
// State machine approach — same as LinkedIn v4
// IDLE → APPLYING → SUBMITTED → SAVED
// Observer only fires in SUBMITTED state

(function () {
  const path = window.location.pathname.toLowerCase();

  // Blocked paths — never run on these
  const BLOCKED = ['/chat','/dashboard','/my-profile','/student/view_applications',
    '/message','/notification','/feed','/course','/training','/interview','/resume'];
  if (BLOCKED.some(p => path.startsWith(p))) return;

  if (window.__appliedinIntersharaInjected) return;
  window.__appliedinIntersharaInjected = true;
  // NOTE: __appliedinHandled is NOT set here — we set it only when we actually handle a save

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const MAX_AGE = 30 * 60 * 1000;

  const STATE = { IDLE: 0, APPLYING: 1, SUBMITTED: 2, SAVED: 3 };
  let state = STATE.IDLE;
  let heartbeat = null;

  function setState(s) {
    if (s <= state) return;
    state = s;
    if (state === STATE.SAVED) {
      observer.disconnect();
      window.__appliedinHandled = true;
    }
  }

  // ── Noise filter ──
  const NOISE = ['thank you','thanks for','successfully applied','application submitted',
    'you have applied','we have received','your application','congratulations',
    'we will be in touch','your submission','on successful'];
  function isClean(text) {
    if (!text || text.length > 80) return false;
    const l = text.toLowerCase();
    return !NOISE.some(w => l.includes(w)) && !/[.!?]$/.test(text.trim());
  }

  // ── Extraction ──
  function extractSalary(root) {
    root = root || document;
    for (const s of ['[class*="stipend"]','[class*="salary"]','[class*="ctc"]']) {
      const el = root.querySelector(s);
      if (el?.innerText?.trim()) return el.innerText.trim();
    }
    return '';
  }
  function extractJobType(root) {
    const t = ((root||document).innerText||'').toLowerCase();
    if (t.includes('internship')) return 'Internship';
    if (t.includes('full-time')||t.includes('full time')) return 'Full-Time';
    if (t.includes('part-time')||t.includes('part time')) return 'Part-Time';
    return 'Internship';
  }
  function extractWorkMode(root) {
    const t = ((root||document).innerText||'').toLowerCase();
    if (t.includes('work from home')||t.includes('remote')) return 'Remote';
    if (t.includes('hybrid')) return 'Hybrid';
    return 'On-site';
  }
  function getJobDetails(root) {
    root = root || document;
    try {
      const title =
        root.querySelector('.profile')?.innerText?.trim() ||
        root.querySelector('[class*="profile-title"]')?.innerText?.trim() ||
        root.querySelector('.internship_meta h2')?.innerText?.trim() ||
        root.querySelector('h2')?.innerText?.trim() ||
        root.querySelector('h1')?.innerText?.trim() || '';
      const company =
        root.querySelector('.company-name a')?.innerText?.trim() ||
        root.querySelector('.company-name')?.innerText?.trim() ||
        root.querySelector('[class*="company_name"]')?.innerText?.trim() || '';
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
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:600;z-index:2147483647;color:white;
      background:${color};box-shadow:0 4px 16px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},4000);
  }

  // ── SUCCESS PHRASES — Internshala specific, post-apply only ──
  // "successfully applied" REMOVED — appears on listing cards
  // "thank you for applying" REMOVED — too generic
  const SUCCESS_PHRASES = [
    'you have successfully applied',    // Internshala's exact post-submit text
    'your application has been sent',
    'applied successfully to',
    'application sent to',
    'congratulations! you have applied', // Internshala congratulations modal
  ];

  // SUCCESS SELECTORS — only check specific confirmation elements, not full body
  const SUCCESS_SELECTORS = [
    '.application_success',
    '.success-message',
    '[class*="application-success"]',
    '[class*="apply-success"]',
    '.alert-success',
    '.congratulations',
    '[class*="success_container"]',
    '[class*="applicationSuccess"]',
  ];

  function isSuccess(root) {
    root = root || document;

    // Check targeted success elements first — most reliable
    for (const sel of SUCCESS_SELECTORS) {
      const el = root.querySelector(sel);
      if (el?.innerText) {
        const t = el.innerText.toLowerCase();
        if (SUCCESS_PHRASES.some(p => t.includes(p))) return true;
        // Even without specific phrase, these elements appearing = success
        if (t.length > 10 && !t.includes('error') && !t.includes('failed')) return true;
      }
    }

    // Only do body scan if we are in SUBMITTED state AND on an apply path
    if (state < STATE.SUBMITTED) return false;
    const p = window.location.pathname.toLowerCase();
    if (!p.includes('/internship/detail') && !p.includes('/jobs/detail') &&
        !p.includes('/apply') && !p.includes('/internship/apply')) return false;

    return SUCCESS_PHRASES.some(p => (root.innerText||'').toLowerCase().includes(p));
  }

  // ── Heartbeat popup ──
  function showHeartbeatPopup(jobData) {
    setState(STATE.SAVED);
    window.__appliedinPopupOpen = true;

    const company = jobData?.company || '';
    const role    = jobData?.role    || '';

    function ensurePopup() {
      if (document.getElementById('ai-is-popup')) return;
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

      const sc = window.__ai_is_company !== undefined ? window.__ai_is_company : company;
      const sr = window.__ai_is_role    !== undefined ? window.__ai_is_role    : role;

      function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

      popup.innerHTML = `
        <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
        <div style="font-size:13px;color:#22c55e;font-weight:600;margin-bottom:14px;">✅ Application submitted — save details</div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px;">Company *</label>
            <input id="ai-is-company" value="${esc(sc)}" maxlength="100"
              placeholder="${sc?'':'⚠️ Type company name'}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid ${sc?'#d1d5db':'#ef4444'};border-radius:8px;font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
            ${!sc?'<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Could not detect — please type it</div>':''}
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px;">Job Role *</label>
            <input id="ai-is-role" value="${esc(sr).substring(0,80)}" maxlength="120"
              placeholder="${sr?'':'⚠️ Type job role'}"
              style="width:100%;box-sizing:border-box;padding:10px 12px;border:2px solid ${sr?'#d1d5db':'#ef4444'};border-radius:8px;font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
            ${!sr?'<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Could not detect — please type it</div>':''}
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ai-is-save" style="flex:1;padding:11px;background:#22c55e;color:white;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">✅ Save Application</button>
          <button id="ai-is-skip" style="padding:11px 18px;background:#f3f4f6;color:#374151;border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Skip</button>
        </div>`;

      document.body.appendChild(overlay);
      document.body.appendChild(popup);

      const ci = document.getElementById('ai-is-company');
      const ri = document.getElementById('ai-is-role');
      if (ci) ci.addEventListener('input', ()=>{ window.__ai_is_company = ci.value; });
      if (ri) ri.addEventListener('input', ()=>{ window.__ai_is_role    = ri.value; });

      setTimeout(()=>{
        if (ci && !ci.value.trim()) ci.focus();
        else if (ri && !ri.value.trim()) ri.focus();
      }, 120);

      document.getElementById('ai-is-save').addEventListener('click', function() {
        const fc = (document.getElementById('ai-is-company')?.value||'').trim();
        const fr = (document.getElementById('ai-is-role')?.value||'').trim();
        if (!fc) { const el=document.getElementById('ai-is-company'); if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
        if (!fr) { const el=document.getElementById('ai-is-role');    if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
        clearInterval(heartbeat);
        window.__appliedinPopupOpen = false;
        overlay.remove(); popup.remove();
        chrome.runtime.sendMessage({type:'SAVE_APPLICATION', data:{...(jobData||{}),company:fc,role:fr,platform:'Internshala',url:window.location.href,date:new Date().toISOString(),status:'Applied'}}, res=>{
          chrome.storage.local.remove(PENDING_KEY);
          showToast(res?.duplicate?'⚠️ Already applied recently!':'✅ Saved — '+fc, res?.duplicate?'#f59e0b':'#22c55e');
        });
      });

      document.getElementById('ai-is-skip').addEventListener('click', function() {
        clearInterval(heartbeat);
        window.__appliedinPopupOpen = false;
        overlay.remove(); popup.remove();
        chrome.storage.local.remove(PENDING_KEY);
      });
    }

    setTimeout(()=>{
      const c=document.getElementById('ai-is-company');
      const r=document.getElementById('ai-is-role');
      if(c&&!c.value.trim()) c.focus(); else if(r&&!r.value.trim()) r.focus();
    }, 150);

    ensurePopup();
    heartbeat = setInterval(ensurePopup, 120);
    setTimeout(()=>clearInterval(heartbeat), 5*60*1000);
  }

  // ── doSave — guaranteed single call ──
  function doSave(modalRoot) {
    if (state >= STATE.SAVED) return;
    setState(STATE.SAVED);

    getPending(function(pending) {
      const data = pending || getJobDetails(modalRoot);
      if (data && data.company && data.role) {
        chrome.runtime.sendMessage({type:'SAVE_APPLICATION', data}, res => {
          chrome.storage.local.remove(PENDING_KEY);
          showToast(res?.duplicate?'⚠️ Already applied recently!':'✅ Saved — '+data.company,
                    res?.duplicate?'#f59e0b':'#22c55e');
        });
      } else {
        showHeartbeatPopup(data || {});
      }
    });
  }

  // ── MutationObserver — ONLY fires in SUBMITTED state ──
  const observer = new MutationObserver(function() {
    if (state !== STATE.SUBMITTED) return; // strict gate
    if (window.__appliedinPopupOpen) return;
    if (isSuccess()) setTimeout(()=>{ if (state===STATE.SUBMITTED) doSave(); }, 600);
  });
  observer.observe(document.body, {childList:true, subtree:true});

  // ── Click handler ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button,a,[role="button"]');
    if (!btn) return;
    const text = (btn.innerText||'').toLowerCase().trim();
    const modal = btn.closest('[class*="modal"],[class*="dialog"],[role="dialog"]');

    // Apply/Continue clicks — move to APPLYING, cache data
    if ((text.includes('apply') && !text.includes('already') && !text.includes('applied'))
        || text === 'continue') {
      if (state === STATE.IDLE) setState(STATE.APPLYING);
      cachePending(getJobDetails(modal));
      return;
    }

    // Final submit
    const isSubmit = text==='submit'||text.includes('submit application')||
                     text.includes('send application')||text==='confirm';
    if (isSubmit && state >= STATE.APPLYING && state < STATE.SAVED) {
      setState(STATE.SUBMITTED);
      cachePending(getJobDetails(modal));
      // Fallback after 3s
      setTimeout(()=>{
        if (state===STATE.SUBMITTED && isSuccess(modal||null)) doSave(modal||null);
      }, 3000);
    }
  }, true);

})();
