// AppliedIn - Shared helpers used by all per-site content scripts
// Gives every dedicated script (linkedin/naukri/internshala/indeed/glassdoor/unstop)
// the same "ask the user to confirm" safety net that the universal tracker has,
// so a missed auto-detection doesn't mean a silently lost application.

window.__appliedinCommon = window.__appliedinCommon || (function () {
  console.log('[AppliedIn] common.js loaded on', window.location.href);

  function saveApplication(jobData, onDuplicate, onSaved) {
    console.log('[AppliedIn] saveApplication called with:', jobData);
    chrome.storage.local.get(['applications'], function (result) {
      const applications = result.applications || [];

      const isDuplicate = applications.some(app =>
        app.company.toLowerCase() === jobData.company.toLowerCase() &&
        app.role.toLowerCase() === jobData.role.toLowerCase() &&
        (new Date() - new Date(app.date)) < 24 * 60 * 60 * 1000
      );

      if (isDuplicate) {
        console.log('[AppliedIn] duplicate detected, not saving');
        showNotification('⚠️ Already applied here recently!', 'warning');
        if (onDuplicate) onDuplicate();
        return;
      }

      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        console.log('[AppliedIn] saved successfully. Total applications:', applications.length);
        showNotification('✅ Application saved — ' + jobData.company, 'success');
        if (onSaved) onSaved();
      });
    });
  }

  function showNotification(message, type) {
    const existing = document.getElementById('appliedin-notification');
    if (existing) existing.remove();

    const n = document.createElement('div');
    n.id = 'appliedin-notification';
    n.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: opacity 0.3s ease;
      background: ${type === 'success' ? '#22c55e' : '#f59e0b'};
      color: white;
    `;
    n.innerText = message;
    document.body.appendChild(n);

    setTimeout(() => {
      n.style.opacity = '0';
      setTimeout(() => n.remove(), 300);
    }, 3000);
  }

  // Shown whenever a submit-like button was clicked but we couldn't
  // confidently auto-confirm success (missing company/role, or no
  // success phrase found on the page). Lets the user confirm manually
  // instead of silently dropping the application.
  function showConfirmPopup(defaultData, platformName, onDone) {
    const existingPopup = document.getElementById('appliedin-confirm');
    if (existingPopup) existingPopup.remove();
    const existingOverlay = document.getElementById('appliedin-overlay');
    if (existingOverlay) existingOverlay.remove();

    const overlay = document.createElement('div');
    overlay.id = 'appliedin-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.45);
      z-index: 999998;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    `;

    const popup = document.createElement('div');
    popup.id = 'appliedin-confirm';
    popup.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 420px;
      max-width: 90vw;
      background: white;
      border-radius: 16px;
      padding: 28px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      border: 1px solid #e5e7eb;
    `;

    const safeCompany = (defaultData?.company || '').replace(/"/g, '&quot;');
    const safeRole = (defaultData?.role || '').substring(0, 60).replace(/"/g, '&quot;');

    popup.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:6px;">
        📋 AppliedIn
      </div>
      <div style="font-size:15px;color:#4b5563;margin-bottom:20px;line-height:1.4;">
        Did you complete this application on <strong>${platformName}</strong>?
      </div>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Company name</label>
        <input id="appliedin-company"
          value="${safeCompany}"
          placeholder="Company name"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          margin-bottom:14px;color:#111827;outline:none;" />
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Job role</label>
        <input id="appliedin-role"
          value="${safeRole}"
          placeholder="Job role"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          color:#111827;outline:none;" />
        <div style="font-size:12px;color:#9ca3af;margin-top:8px;line-height:1.4;">
          ✏️ If the details above look wrong, feel free to edit them before saving.
        </div>
      </div>
      <div style="display:flex;gap:10px;">
        <button id="appliedin-yes"
          style="flex:1;padding:12px;background:#22c55e;color:white;
          border:none;border-radius:8px;font-size:14px;
          font-weight:600;cursor:pointer;">
          ✅ Yes, Save
        </button>
        <button id="appliedin-no"
          style="flex:1;padding:12px;background:#f3f4f6;color:#374151;
          border:none;border-radius:8px;font-size:14px;
          font-weight:600;cursor:pointer;">
          ❌ No
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    document.getElementById('appliedin-yes').addEventListener('click', function () {
      const finalCompany = document.getElementById('appliedin-company').value.trim();
      const finalRole = document.getElementById('appliedin-role').value.trim();

      if (!finalCompany || !finalRole) {
        alert('Please enter company and role.');
        return;
      }

      overlay.remove();
      popup.remove();

      const finalData = Object.assign({}, defaultData, {
        company: finalCompany,
        role: finalRole,
        platform: platformName,
        date: new Date().toISOString()
      });

      saveApplication(finalData);
      if (onDone) onDone();
    });

    document.getElementById('appliedin-no').addEventListener('click', function () {
      overlay.remove();
      popup.remove();
      if (onDone) onDone();
    });
  }

  return { saveApplication, showNotification, showConfirmPopup };
})();
