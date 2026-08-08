// AppliedIn - Glassdoor Content Script v3
// Architecture: Show popup ONLY after success confirmed.
// Popup uses setInterval heartbeat to survive React re-renders.

(function () {
  const _blockedPaths = ['/member/','/community/','/profile/','/salary/','/reviews/'];
  if (_blockedPaths.some(p => window.location.pathname.toLowerCase().startsWith(p))) return;
  if (window.__appliedinGlassdoorInjected) return;
  window.__appliedinGlassdoorInjected = true;
  window.__appliedinHandled = true; // keep guarantee layer away

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const MAX_AGE = 30 * 60 * 1000;
  let alreadyHandled = false;
  let heartbeat = null;

  // ── Helpers ──
  function extractSalary() {
    for (const s of ['[class*="salary"]','[class*="payRange"]','[class*="compensation"]']) {
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
  function isNoise(text) {
    if (!text || text.length > 80) return true;
    const bad = ['thank','applied','application','received','submitted',
                 'congratulations','we\'re thrilled','we will','our team'];
    return bad.some(w => text.toLowerCase().includes(w)) || /[.!?]$/.test(text.trim());
  }
  function getJobDetails() {
    try {
      const title =
        [document.querySelector('[data-test="job-title"]'),
         document.querySelector('.jobTitle'),
         document.querySelector('h1')]
        .map(el => el?.innerText?.trim())
        .find(t => t && !isNoise(t)) || '';
      const company =
        [document.querySelector('[data-test="employer-name"]'),
         document.querySelector('.employerName'),
         document.querySelector('[class*="employerName"]')]
        .map(el => el?.innerText?.trim())
        .find(t => t && !isNoise(t)) || '';
      const location =
        document.querySelector('[data-test="location"]')?.innerText?.trim() ||
        document.querySelector('.location')?.innerText?.trim() || '';
      return {
        company, role: title, location,
        salary: extractSalary(), jobType: extractJobType(), workMode: extractWorkMode(),
        platform: 'Glassdoor', url: window.location.href,
        date: new Date().toISOString(), status: 'Applied'
      };
    } catch(e) { return null; }
  }
  function cachePending(data) {
    if (data?.company) chrome.storage.local.set({[PENDING_KEY]:{jobData:data,ts:Date.now()}});
  }
  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], r => {
      const e = r[PENDING_KEY];
      cb(e && (Date.now()-e.ts) < MAX_AGE ? e.jobData : null);
    });
  }
  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;
      font-size:14px;font-weight:500;z-index:2147483647;color:white;background:${color};
      box-shadow:0 4px 12px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3500);
  }
  function doSave(data) {
    chrome.runtime.sendMessage({type:'SAVE_APPLICATION',data}, res => {
      chrome.storage.local.remove(PENDING_KEY);
      showToast(res?.duplicate ? '⚠️ Already applied here recently!' : '✅ Saved — '+data.company,
                res?.duplicate ? '#f59e0b' : '#22c55e');
    });
  }

  // ── Heartbeat popup — survives React re-renders ──
  // Instead of fighting React, we use setInterval to re-add the popup
  // every 100ms if it gets removed. The popup IS the source of truth.
  // heartbeat stops only when user clicks Save or Skip.
  function showHeartbeatPopup(jobData) {
    if (alreadyHandled) return;
    alreadyHandled = true;
    observer.disconnect(); // stop watching for success — popup handles it now

    const company = jobData?.company || '';
    const role    = jobData?.role    || '';

    function buildPopupHTML() {
      return `
        <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
        <div style="font-size:13px;color:#22c55e;font-weight:600;margin-bottom:14px;">
          ✅ Application submitted — save the details
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
              letter-spacing:.05em;display:block;margin-bottom:3px;">Company *</label>
            <input id="ai-gd-company" value="${company.replace(/"/g,'&quot;')}"
              placeholder="Type company name..."
              style="width:100%;box-sizing:border-box;padding:10px 12px;
              border:2px solid ${company?'#d1d5db':'#ef4444'};border-radius:8px;
              font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
            ${!company?'<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Not detected — please type it</div>':''}
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
              letter-spacing:.05em;display:block;margin-bottom:3px;">Job Role *</label>
            <input id="ai-gd-role" value="${role.replace(/"/g,'&quot;').substring(0,80)}"
              placeholder="Type job role..."
              style="width:100%;box-sizing:border-box;padding:10px 12px;
              border:2px solid ${role?'#d1d5db':'#ef4444'};border-radius:8px;
              font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
            ${!role?'<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Not detected — please type it</div>':''}
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ai-gd-save"
            style="flex:1;padding:11px;background:#22c55e;color:white;border:none;
            border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
            ✅ Save Application
          </button>
          <button id="ai-gd-skip"
            style="padding:11px 18px;background:#f3f4f6;color:#374151;border:none;
            border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
            Skip
          </button>
        </div>`;
    }

    function ensurePopupExists() {
      // If popup already exists and is in DOM — attach listeners and return
      if (document.getElementById('ai-gd-popup')) return;

      // Popup was removed (React re-render) — rebuild it
      const existing_overlay = document.getElementById('ai-gd-overlay');
      if (existing_overlay) existing_overlay.remove();

      const overlay = document.createElement('div');
      overlay.id = 'ai-gd-overlay';
      overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.6);
        z-index:2147483645;`;

      const popup = document.createElement('div');
      popup.id = 'ai-gd-popup';
      popup.style.cssText = `position:fixed;top:50%;left:50%;
        transform:translate(-50%,-50%);width:400px;max-width:92vw;
        background:white;border-radius:16px;padding:24px;
        box-shadow:0 24px 80px rgba(0,0,0,0.4);z-index:2147483647;
        border:1px solid #e5e7eb;font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;
      popup.innerHTML = buildPopupHTML();

      document.body.appendChild(overlay);
      document.body.appendChild(popup);

      // Restore typed values if user had already typed something
      const savedCompany = window.__ai_gd_company || company;
      const savedRole    = window.__ai_gd_role    || role;
      const ci = document.getElementById('ai-gd-company');
      const ri = document.getElementById('ai-gd-role');
      if (ci) { ci.value = savedCompany; ci.style.border = `2px solid ${savedCompany?'#d1d5db':'#ef4444'}`; }
      if (ri) { ri.value = savedRole;    ri.style.border = `2px solid ${savedRole?'#d1d5db':'#ef4444'}`; }

      // Save typed values so we can restore after re-render
      if (ci) ci.addEventListener('input', () => { window.__ai_gd_company = ci.value; });
      if (ri) ri.addEventListener('input', () => { window.__ai_gd_role = ri.value; });

      document.getElementById('ai-gd-save').addEventListener('click', function() {
        const finalCompany = document.getElementById('ai-gd-company')?.value.trim() || '';
        const finalRole    = document.getElementById('ai-gd-role')?.value.trim() || '';

        // Block save if either field is empty
        if (!finalCompany) {
          const el = document.getElementById('ai-gd-company');
          if (el) { el.style.border='2px solid #ef4444'; el.focus(); }
          showToast('⚠️ Please enter the company name', '#ef4444');
          return;
        }
        if (!finalRole) {
          const el = document.getElementById('ai-gd-role');
          if (el) { el.style.border='2px solid #ef4444'; el.focus(); }
          showToast('⚠️ Please enter the job role', '#ef4444');
          return;
        }

        // Stop heartbeat FIRST so popup isn't re-added after removal
        clearInterval(heartbeat);
        overlay.remove();
        popup.remove();

        doSave({
          ...(jobData||{}),
          company: finalCompany, role: finalRole,
          platform: 'Glassdoor', url: window.location.href,
          date: new Date().toISOString(), status: 'Applied'
        });
      });

      document.getElementById('ai-gd-skip').addEventListener('click', function() {
        clearInterval(heartbeat);
        overlay.remove();
        popup.remove();
        chrome.storage.local.remove(PENDING_KEY);
      });
    }

    // Focus first empty field on first render
    setTimeout(() => {
      const c = document.getElementById('ai-gd-company');
      const r = document.getElementById('ai-gd-role');
      if (c && !c.value.trim()) c.focus();
      else if (r && !r.value.trim()) r.focus();
    }, 150);

    // Heartbeat: check every 120ms — re-add popup if React removed it
    ensurePopupExists();
    heartbeat = setInterval(ensurePopupExists, 120);

    // Safety: stop after 5 minutes (user clearly abandoned)
    setTimeout(() => clearInterval(heartbeat), 5 * 60 * 1000);
  }

  // ── Success detection ──
  const successPhrases = [
    'application submitted','your application has been submitted',
    'successfully applied','you have applied',"you've applied",
    'thank you for applying','we have received your application',
    'application sent','your application has been sent',
  ];
  function isSuccess() {
    return successPhrases.some(p => (document.body.innerText||'').toLowerCase().includes(p));
  }

  // ── Cache job data on any apply click ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button,[role="button"]');
    if (!btn) return;
    const text = (btn.innerText||btn.getAttribute('aria-label')||'').toLowerCase().trim();
    if (text.includes('apply') || text.includes('easy apply')) {
      cachePending(getJobDetails());
    }
  }, true);

  // ── MutationObserver — waits for success, THEN shows popup ──
  const observer = new MutationObserver(function() {
    if (alreadyHandled) return;
    if (!isSuccess()) return;
    // Success confirmed — show popup now
    setTimeout(() => {
      if (alreadyHandled) return;
      getPending(function(pending) {
        showHeartbeatPopup(pending || getJobDetails() || {});
      });
    }, 600);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Fallback: check on page load (redirect-based success)
  if (isSuccess()) {
    setTimeout(() => {
      getPending(p => showHeartbeatPopup(p || getJobDetails() || {}));
    }, 800);
  }

})();
