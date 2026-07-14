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
    const existing = document.getElementById('appliedin-confirm');
    if (existing) existing.remove();

    const popup = document.createElement('div');
    popup.id = 'appliedin-confirm';
    popup.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      width: 300px;
      background: white;
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.15);
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      border: 1px solid #e5e7eb;
    `;

    const safeCompany = (defaultData?.company || '').replace(/"/g, '&quot;');
    const safeRole = (defaultData?.role || '').substring(0, 60).replace(/"/g, '&quot;');

    popup.innerHTML = `
      <div style="font-size:13px;font-weight:600;color:#111827;margin-bottom:4px;">
        📋 AppliedIn
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:12px;">
        Did you complete this application on ${platformName}?
      </div>
      <div style="margin-bottom:12px;">
        <input id="appliedin-company"
          value="${safeCompany}"
          placeholder="Company name"
          style="width:100%;box-sizing:border-box;padding:6px 10px;
          border:1px solid #e5e7eb;border-radius:6px;font-size:12px;
          margin-bottom:6px;color:#111827;outline:none;" />
        <input id="appliedin-role"
          value="${safeRole}"
          placeholder="Job role"
          style="width:100%;box-sizing:border-box;padding:6px 10px;
          border:1px solid #e5e7eb;border-radius:6px;font-size:12px;
          color:#111827;outline:none;" />
      </div>
      <div style="display:flex;gap:8px;">
        <button id="appliedin-yes"
          style="flex:1;padding:8px;background:#22c55e;color:white;
          border:none;border-radius:6px;font-size:12px;
          font-weight:500;cursor:pointer;">
          ✅ Yes, Save
        </button>
        <button id="appliedin-no"
          style="flex:1;padding:8px;background:#f3f4f6;color:#374151;
          border:none;border-radius:6px;font-size:12px;
          font-weight:500;cursor:pointer;">
          ❌ No
        </button>
      </div>
    `;

    document.body.appendChild(popup);

    document.getElementById('appliedin-yes').addEventListener('click', function () {
      const finalCompany = document.getElementById('appliedin-company').value.trim();
      const finalRole = document.getElementById('appliedin-role').value.trim();

      if (!finalCompany || !finalRole) {
        alert('Please enter company and role.');
        return;
      }

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
      popup.remove();
      if (onDone) onDone();
    });

    // Auto dismiss after 20 seconds so it doesn't linger forever
    setTimeout(() => {
      if (document.getElementById('appliedin-confirm')) {
        popup.remove();
        if (onDone) onDone();
      }
    }, 20000);
  }

  return { saveApplication, showNotification, showConfirmPopup };
})();
