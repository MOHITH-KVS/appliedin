// AppliedIn - Glassdoor Content Script v2
// Complete rewrite with bulletproof popup locking.
//
// FLOW:
// 1. User clicks Apply/Easy Apply → cache job data silently
// 2. User clicks Submit → show popup IMMEDIATELY (don't wait for success)
// 3. Popup is LOCKED — MutationObserver disconnected, overlay blocks all clicks
// 4. Success message arrives → IGNORED (popup already handling it)
// 5. User fills details → clicks Save → application saved

(function () {
  const _blockedPaths = ['/member/', '/community/', '/profile/', '/salary/', '/reviews/'];
  if (_blockedPaths.some(p => window.location.pathname.toLowerCase().startsWith(p))) return;
  if (window.__appliedinGlassdoorInjected) return;
  window.__appliedinGlassdoorInjected = true;
  window.__appliedinHandled = true; // tell guarantee layer to stay away

  const PENDING_KEY = 'appliedin_pending_' + Math.round(performance.now() * 1000);
  const PENDING_MAX_AGE_MS = 30 * 60 * 1000;
  let popupOpen = false;
  let alreadySaved = false;

  // ── Helpers ──
  function extractSalary() {
    for (const sel of ['[class*="salary"]','[class*="payRange"]','[class*="compensation"]']) {
      const el = document.querySelector(sel);
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

  function getJobDetails() {
    try {
      const noiseWords = ['thank','applied','application','received','submitted','congratulations'];
      function clean(text) {
        if (!text||text.length>80) return null;
        if (noiseWords.some(w=>text.toLowerCase().includes(w))) return null;
        if (/[.!?]$/.test(text.trim())) return null;
        return text.trim();
      }

      const title = clean(document.querySelector('[data-test="job-title"]')?.innerText) ||
                    clean(document.querySelector('.jobTitle')?.innerText) ||
                    clean(document.querySelector('h1')?.innerText) || '';

      const company = clean(document.querySelector('[data-test="employer-name"]')?.innerText) ||
                      clean(document.querySelector('.employerName')?.innerText) ||
                      clean(document.querySelector('[class*="employerName"]')?.innerText) || '';

      const location = document.querySelector('[data-test="location"]')?.innerText?.trim() ||
                       document.querySelector('.location')?.innerText?.trim() || 'Unknown Location';

      return {
        company, role: title, location,
        salary: extractSalary(),
        jobType: extractJobType(),
        workMode: extractWorkMode(),
        platform: 'Glassdoor',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      };
    } catch(e) { return null; }
  }

  function cachePending(data) {
    if (data && data.company) {
      chrome.storage.local.set({ [PENDING_KEY]: { jobData: data, timestamp: Date.now() } });
    }
  }

  function getPending(cb) {
    chrome.storage.local.get([PENDING_KEY], function(r) {
      const e = r[PENDING_KEY];
      cb(e && (Date.now()-e.timestamp) < PENDING_MAX_AGE_MS ? e.jobData : null);
    });
  }

  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:500;z-index:2147483647;
      box-shadow:0 4px 12px rgba(0,0,0,0.2);background:${color};color:white;
      font-family:-apple-system,sans-serif;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3000);
  }

  function saveApplication(data) {
    if (alreadySaved) return;
    alreadySaved = true;
    chrome.runtime.sendMessage({ type: 'SAVE_APPLICATION', data }, function(res) {
      chrome.storage.local.remove(PENDING_KEY);
      if (res && res.duplicate) {
        showToast('⚠️ Already applied here recently!', '#f59e0b');
      } else {
        showToast('✅ Saved — ' + data.company, '#22c55e');
      }
    });
  }

  // ── THE LOCKED POPUP ──
  // Once this opens, NOTHING can close it except the user clicking Save or Skip.
  // - MutationObserver is disconnected on open
  // - Overlay intercepts all clicks (pointer-events: all)
  // - No external code can remove it (we use a MutationObserver to RE-ADD it if removed)
  function showLockedPopup(jobData) {
    if (popupOpen) return;
    popupOpen = true;

    // Disconnect our own observer so success message doesn't re-trigger
    observer.disconnect();

    // Remove any existing popup fragments
    document.getElementById('appliedin-overlay')?.remove();
    document.getElementById('appliedin-confirm')?.remove();

    const company = jobData?.company || '';
    const role    = jobData?.role || '';

    const overlay = document.createElement('div');
    overlay.id = 'appliedin-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483646;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

    const popup = document.createElement('div');
    popup.id = 'appliedin-confirm';
    popup.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:420px;max-width:90vw;background:white;border-radius:16px;
      padding:28px;box-shadow:0 24px 64px rgba(0,0,0,0.35);
      z-index:2147483647;border:1px solid #e5e7eb;`;

    popup.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
      <div style="font-size:13px;color:#6b7280;margin-bottom:18px;">
        Confirm your application details to save.
      </div>
      <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:18px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;
            text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">
            Company
          </label>
          <input id="ai-gd-company" value="${company.replace(/"/g,'')}"
            placeholder="Type company name..."
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${company?'#e5e7eb':'#ef4444'};border-radius:8px;
            font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          ${!company?'<div style="font-size:11px;color:#ef4444;margin-top:3px;">⚠️ Could not detect — please type it</div>':''}
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;
            text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px;">
            Job Role
          </label>
          <input id="ai-gd-role" value="${role.replace(/"/g,'').substring(0,80)}"
            placeholder="Type job role..."
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${role?'#e5e7eb':'#ef4444'};border-radius:8px;
            font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          ${!role?'<div style="font-size:11px;color:#ef4444;margin-top:3px;">⚠️ Could not detect — please type it</div>':''}
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="ai-gd-save"
          style="flex:1;padding:12px;background:#22c55e;color:white;border:none;
          border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
          ✅ Save Application
        </button>
        <button id="ai-gd-skip"
          style="flex:1;padding:12px;background:#f3f4f6;color:#374151;border:none;
          border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          Skip
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    // Guard: if Glassdoor's own JS tries to remove our popup elements,
    // put them back immediately using a dedicated watcher
    const guardObserver = new MutationObserver(function() {
      if (!document.getElementById('appliedin-confirm') && popupOpen) {
        document.body.appendChild(overlay);
        document.body.appendChild(popup);
      }
    });
    guardObserver.observe(document.body, { childList: true });

    // Focus first empty field
    setTimeout(()=>{
      const c = document.getElementById('ai-gd-company');
      const r = document.getElementById('ai-gd-role');
      ((c && !c.value.trim()) ? c : (r && !r.value.trim()) ? r : c)?.focus();
    }, 100);

    function closePopup() {
      popupOpen = false;
      guardObserver.disconnect();
      overlay.remove();
      popup.remove();
    }

    document.getElementById('ai-gd-save').addEventListener('click', function() {
      const finalCompany = document.getElementById('ai-gd-company').value.trim();
      const finalRole    = document.getElementById('ai-gd-role').value.trim();

      if (!finalCompany) {
        document.getElementById('ai-gd-company').style.border = '2px solid #ef4444';
        document.getElementById('ai-gd-company').focus();
        return;
      }
      if (!finalRole) {
        document.getElementById('ai-gd-role').style.border = '2px solid #ef4444';
        document.getElementById('ai-gd-role').focus();
        return;
      }

      closePopup();
      saveApplication({
        ...(jobData||{}),
        company: finalCompany,
        role: finalRole,
        platform: 'Glassdoor',
        url: window.location.href,
        date: new Date().toISOString(),
        status: 'Applied'
      });
    });

    document.getElementById('ai-gd-skip').addEventListener('click', closePopup);
    // Overlay click does NOT close — user must explicitly click Skip
    // This prevents accidental dismissal when Glassdoor redraws the page
  };

  // ── MutationObserver — watches for success BEFORE submit click ──
  // Only used as a backup if user submits without clicking a detected button
  const observer = new MutationObserver(function() {
    if (popupOpen || alreadySaved) return;
    const bodyText = (document.body.innerText||'').toLowerCase();
    const successPhrases = [
      'application submitted','your application has been submitted',
      'successfully applied','you have applied',"you've applied",
      'thank you for applying','we have received your application'
    ];
    if (successPhrases.some(p=>bodyText.includes(p))) {
      setTimeout(()=>{
        if (popupOpen||alreadySaved) return;
        getPending(function(pending){
          const data = pending || getJobDetails();
          if (data && data.company) {
            saveApplication(data);
          } else {
            showLockedPopup(data || {});
          }
        });
      }, 800);
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // ── Click handler — PRIMARY trigger for popup ──
  document.addEventListener('click', function(e) {
    const btn = e.target.closest('button,[role="button"]');
    if (!btn) return;
    const text = (btn.innerText||btn.getAttribute('aria-label')||'').toLowerCase().trim();

    // Cache job details on ANY apply click
    if (text.includes('apply')||text.includes('easy apply')) {
      const data = getJobDetails();
      cachePending(data);
    }

    // On final submit — show popup IMMEDIATELY, don't wait for success message
    const isFinalSubmit = text==='submit' ||
      text.includes('submit application') ||
      text.includes('send application') ||
      text.includes('submit my application');

    if (isFinalSubmit && !popupOpen && !alreadySaved) {
      getPending(function(pending) {
        const data = pending || getJobDetails();
        showLockedPopup(data || {});
      });
    }
  }, true); // useCapture=true — fires before Glassdoor's own handlers

})();
