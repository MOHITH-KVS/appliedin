// AppliedIn - Shared helpers
// KEY DESIGN: window.__appliedinDone is the single source of truth.
// Once set true on a page, NOTHING fires again — no double saves, no duplicates.

window.__appliedinCommon = window.__appliedinCommon || (function () {

  // Global flags
  window.__appliedinPopupOpen = false;
  // __appliedinDone: set true the moment popup opens OR save fires.
  // Every observer in every script checks this first.
  if (window.__appliedinDone === undefined) window.__appliedinDone = false;

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function showToast(message, type) {
    const existing = document.getElementById('appliedin-toast');
    if (existing) existing.remove();
    const n = document.createElement('div');
    n.id = 'appliedin-toast';
    n.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
      border-radius:8px;font-size:14px;font-weight:500;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;
      z-index:2147483647;box-shadow:0 4px 12px rgba(0,0,0,0.15);
      transition:opacity 0.3s;
      background:${type==='success'?'#22c55e':'#f59e0b'};color:white;`;
    n.innerText = message;
    document.body.appendChild(n);
    setTimeout(()=>{n.style.opacity='0';setTimeout(()=>n.remove(),300);},3500);
  }

  function saveApplication(jobData, onDuplicate, onSaved) {
    // Mark done immediately — prevents any observer from firing again
    window.__appliedinDone = true;

    chrome.runtime.sendMessage({type:'SAVE_APPLICATION',data:jobData}, function(response) {
      if (response && response.duplicate) {
        showToast('⚠️ Already applied here recently!','warning');
        if (onDuplicate) onDuplicate();
      } else if (response && response.saved) {
        showToast('✅ Saved — '+jobData.company,'success');
        if (onSaved) onSaved();
      } else {
        // Fallback direct write
        chrome.storage.local.get(['applications'], function(result) {
          const apps = result.applications || [];
          const cutoff = Date.now() - 24*60*60*1000;
          const dup = apps.some(a =>
            a.company.toLowerCase()===jobData.company.toLowerCase() &&
            a.role.toLowerCase()===jobData.role.toLowerCase() &&
            new Date(a.date).getTime()>cutoff
          );
          if (dup) {
            showToast('⚠️ Already applied here recently!','warning');
            if (onDuplicate) onDuplicate();
            return;
          }
          apps.unshift(jobData);
          chrome.storage.local.set({applications:apps}, function() {
            showToast('✅ Saved — '+jobData.company,'success');
            if (onSaved) onSaved();
          });
        });
      }
    });
  }

  function showConfirmPopup(defaultData, platformName, onDone, onOpen) {
    if (document.getElementById('appliedin-confirm')) return;
    document.getElementById('appliedin-overlay')?.remove();

    // Mark done immediately when popup opens — observer won't fire again
    window.__appliedinDone = true;
    window.__appliedinPopupOpen = true;

    const overlay = document.createElement('div');
    overlay.id = 'appliedin-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);
      z-index:2147483645;font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

    const popup = document.createElement('div');
    popup.id = 'appliedin-confirm';
    popup.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:420px;max-width:92vw;background:white;border-radius:16px;padding:26px;
      box-shadow:0 20px 60px rgba(0,0,0,0.3);z-index:2147483647;border:1px solid #e5e7eb;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

    const safeCompany = escapeHtml(defaultData?.company || '');
    const safeRole    = escapeHtml((defaultData?.role || '').substring(0,80));
    const hasCompany  = !!(defaultData?.company);
    const hasRole     = !!(defaultData?.role);

    popup.innerHTML = `
      <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
      <div style="font-size:13px;color:#22c55e;font-weight:600;margin-bottom:14px;">
        ✅ Application detected — save details
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
            letter-spacing:.05em;display:block;margin-bottom:3px;">Company *</label>
          <input id="appliedin-company" maxlength="100" value="${safeCompany}"
            placeholder="${hasCompany?'':'⚠️ Type company name'}"
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${hasCompany?'#d1d5db':'#ef4444'};border-radius:8px;
            font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          ${!hasCompany?'<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Not detected — please type it</div>':''}
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
            letter-spacing:.05em;display:block;margin-bottom:3px;">Job Role *</label>
          <input id="appliedin-role" maxlength="120" value="${safeRole}"
            placeholder="${hasRole?'':'⚠️ Type job role'}"
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${hasRole?'#d1d5db':'#ef4444'};border-radius:8px;
            font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          ${!hasRole?'<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Not detected — please type it</div>':''}
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="appliedin-yes" style="flex:1;padding:12px;background:#22c55e;color:white;
          border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
          ✅ Save Application
        </button>
        <button id="appliedin-no" style="flex:1;padding:12px;background:#f3f4f6;color:#374151;
          border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          ❌ Skip
        </button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);
    if (onOpen) onOpen();

    // Persist typed values
    const ci = document.getElementById('appliedin-company');
    const ri = document.getElementById('appliedin-role');
    if (ci) ci.addEventListener('input',()=>{window.__ai_company=ci.value;});
    if (ri) ri.addEventListener('input',()=>{window.__ai_role=ri.value;});

    // Focus first empty field
    setTimeout(()=>{
      if (ci && !ci.value.trim()) ci.focus();
      else if (ri && !ri.value.trim()) ri.focus();
    },100);

    function closePopup() {
      window.__appliedinPopupOpen = false;
      overlay.remove(); popup.remove();
      if (onDone) onDone();
    }

    document.getElementById('appliedin-yes').addEventListener('click', function() {
      const fc = (document.getElementById('appliedin-company')?.value||'').trim();
      const fr = (document.getElementById('appliedin-role')?.value||'').trim();
      if (!fc) {
        const el=document.getElementById('appliedin-company');
        if(el){el.style.border='2px solid #ef4444';el.placeholder='⚠️ Required';el.focus();}
        return;
      }
      if (!fr) {
        const el=document.getElementById('appliedin-role');
        if(el){el.style.border='2px solid #ef4444';el.placeholder='⚠️ Required';el.focus();}
        return;
      }
      overlay.remove(); popup.remove();
      window.__appliedinPopupOpen = false;
      // __appliedinDone stays true — no re-trigger after save
      saveApplication(Object.assign({},defaultData,{
        company:fc, role:fr, platform:platformName, date:new Date().toISOString()
      }));
      if (onDone) onDone();
    });

    document.getElementById('appliedin-no').addEventListener('click', closePopup);
    overlay.addEventListener('click', closePopup);
  }

  return { saveApplication, showToast, showConfirmPopup };
})();
