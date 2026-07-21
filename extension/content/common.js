// AppliedIn - Shared helpers used by all per-site content scripts
// Gives every dedicated script (linkedin/naukri/internshala/indeed/glassdoor/unstop)
// the same "ask the user to confirm" safety net that the universal tracker has,
// so a missed auto-detection doesn't mean a silently lost application.

window.__appliedinCommon = window.__appliedinCommon || (function () {
  console.log('[AppliedIn] common.js loaded on', window.location.href);

  function saveApplication(jobData, onDuplicate, onSaved, method) {
    console.log('[AppliedIn] saveApplication called with:', jobData);
    const saveMethod = method || 'auto';
    chrome.storage.local.get(['applications'], function (result) {
      const applications = result.applications || [];

      let matchedAgainst = null;

      // Detects role text that's clearly page-chrome or a mis-detection
      // rather than a real, distinct job title — e.g. "Career Thank you -
      // GlobalLogic" (grabbed from a confirmation banner). Used ONLY to
      // decide whether a same-company, close-in-time entry is likely the
      // SAME submission caught twice by different detection paths — NOT
      // as a general "these are probably the same job" signal, since
      // applying to two different roles at the same company in quick
      // succession is a completely normal, common pattern (e.g. browsing
      // one employer's listings on Indeed) that must NOT be blocked.
      function roleLooksLikeMisdetection(role, company) {
        if (!role) return true;
        const lower = role.toLowerCase();
        if (/thank\s*you/.test(lower)) return true;
        if (/application (submitted|received|complete)/.test(lower)) return true;
        if (company && lower === company.toLowerCase()) return true;
        if (role.length < 4) return true;
        return false;
      }

      const isDuplicate = applications.some(app => {
        // Same exact job URL — definitely a duplicate, regardless of when
        if (jobData.url && app.url && app.url === jobData.url) {
          matchedAgainst = { reason: 'same URL', app };
          return true;
        }

        // Generic/placeholder text should NEVER count as a match basis —
        // "Unknown Company" === "Unknown Company" would otherwise flag
        // every undetected application as a duplicate of any other
        // undetected one, even completely different jobs. Without a real
        // company name, only the exact-URL check above can catch a
        // genuine duplicate.
        if (app.company === 'Unknown Company' || jobData.company === 'Unknown Company') {
          return false;
        }

        const sameCompany = app.company.toLowerCase() === jobData.company.toLowerCase();
        const withinTightWindow = (new Date() - new Date(app.date)) < 5 * 60 * 1000;
        const withinDay = (new Date() - new Date(app.date)) < 24 * 60 * 60 * 1000;

        // Same company + IDENTICAL role within 24 hours — a real repeat.
        if (sameCompany && app.role && jobData.role &&
            app.role.toLowerCase() === jobData.role.toLowerCase() && withinDay) {
          matchedAgainst = { reason: 'same company+role within 24h', app };
          return true;
        }

        // Same company, close in time, AND one of the two role texts
        // looks like a mis-detection (not a real distinct job title) —
        // this is the narrow GlobalLogic-style pattern: two detection
        // methods caught the SAME real submission, one with good data,
        // one with page-chrome text. Deliberately NOT triggered just by
        // "same company, close in time" alone — that would wrongly block
        // legitimate back-to-back applications to different roles at the
        // same employer.
        if (sameCompany && withinTightWindow &&
            (roleLooksLikeMisdetection(app.role, app.company) || roleLooksLikeMisdetection(jobData.role, jobData.company))) {
          matchedAgainst = { reason: 'same company, one role looks like a mis-detection, within 5min', app };
          return true;
        }

        return false;
      });

      if (isDuplicate) {
        console.log('[AppliedIn] DUPLICATE MATCH:', matchedAgainst?.reason,
          '\n  New entry:', { company: jobData.company, role: jobData.role, url: jobData.url },
          '\n  Matched against:', matchedAgainst?.app && {
            company: matchedAgainst.app.company, role: matchedAgainst.app.role,
            url: matchedAgainst.app.url, date: matchedAgainst.app.date
          });
      }

      if (isDuplicate) {
        console.log('[AppliedIn] duplicate detected, not saving');
        showNotification('⚠️ Already applied here recently!', 'warning');
        chrome.runtime.sendMessage({ type: 'appliedin_saved', platform: jobData.platform, method: saveMethod }).catch(() => {});
        if (onDuplicate) onDuplicate();
        return;
      }

      applications.unshift(jobData);
      chrome.storage.local.set({ applications }, function () {
        console.log('[AppliedIn] saved successfully. Total applications:', applications.length);
        showNotification('✅ Application saved — ' + jobData.company, 'success');
        chrome.runtime.sendMessage({ type: 'appliedin_saved', platform: jobData.platform, method: saveMethod }).catch(() => {});
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

    const rawCompany = defaultData?.company;
    const rawRole = defaultData?.role;

    // Treat sentinel 'Unknown Company'/'Unknown Role' as if nothing was
    // detected at all — showing that literal text as a pre-filled value
    // looks like a real (if odd) answer, and a hurried person could easily
    // miss that it's actually a placeholder rather than real data.
    const hasCompany = rawCompany && rawCompany !== 'Unknown Company';
    const hasRole = rawRole && rawRole !== 'Unknown Role';

    const safeCompany = (hasCompany ? rawCompany : '').replace(/"/g, '&quot;');
    const safeRole = (hasRole ? rawRole : '').substring(0, 60).replace(/"/g, '&quot;');

    popup.innerHTML = `
      <div style="font-size:18px;font-weight:700;color:#111827;margin-bottom:6px;">
        📋 AppliedIn
      </div>
      <div style="font-size:15px;color:#4b5563;margin-bottom:20px;line-height:1.4;">
        Did you complete this application on <strong>${platformName}</strong>?
      </div>
      <style>
        #appliedin-confirm input:focus {
          border-color: #6366f1 !important;
          box-shadow: 0 0 0 3px rgba(99,102,241,0.15);
        }
        #appliedin-confirm input.appliedin-needs-input {
          border-color: #f59e0b !important;
          background: #fffbeb !important;
        }
        #appliedin-confirm input::placeholder {
          color: #b45309;
          font-style: italic;
        }
        #appliedin-confirm input:not(.appliedin-needs-input)::placeholder {
          color: #9ca3af;
          font-style: normal;
        }
      </style>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Company name</label>
        <input id="appliedin-company"
          value="${safeCompany}"
          class="${hasCompany ? '' : 'appliedin-needs-input'}"
          placeholder="${hasCompany ? 'Company name' : "Couldn't detect — click here and type it"}"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          margin-bottom:14px;color:#111827;outline:none;pointer-events:auto !important;user-select:text !important;-webkit-user-select:text !important;cursor:text !important;" />
        <label style="display:block;font-size:12px;font-weight:600;color:#6b7280;margin-bottom:4px;">Job role</label>
        <input id="appliedin-role"
          value="${safeRole}"
          class="${hasRole ? '' : 'appliedin-needs-input'}"
          placeholder="${hasRole ? 'Job role' : "Couldn't detect — click here and type it"}"
          style="width:100%;box-sizing:border-box;padding:10px 12px;
          border:1.5px solid #e5e7eb;border-radius:8px;font-size:14px;
          color:#111827;outline:none;pointer-events:auto !important;user-select:text !important;-webkit-user-select:text !important;cursor:text !important;" />
        <div style="font-size:12px;color:#9ca3af;margin-top:8px;line-height:1.4;">
          ✏️ Both fields above are editable — click into either one to type or correct it.
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

    // Auto-focus whichever field needs input first, so it's immediately
    // obvious (cursor blinking right there) that it's a real, editable
    // field waiting for input — not stuck placeholder text.
    const firstNeedsInput = document.querySelector('#appliedin-confirm .appliedin-needs-input');
    (firstNeedsInput || document.getElementById('appliedin-company'))?.focus();

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

      saveApplication(finalData, undefined, undefined, 'popup_confirm');
      if (onDone) onDone();
    });

    document.getElementById('appliedin-no').addEventListener('click', function () {
      overlay.remove();
      popup.remove();
      if (onDone) onDone();
    });
  }

  // Many job sites embed JobPosting structured data (schema.org) inside
  // a <script type="application/ld+json"> tag, specifically so Google's
  // job search can index them. This is far more reliable than guessing
  // from CSS classes (which change often) or hostnames (which are
  // sometimes generic) — when present, it's closer to ground truth.
  function getStructuredJobData() {
    try {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        let data;
        try {
          data = JSON.parse(script.textContent);
        } catch (e) {
          continue;
        }

        const items = Array.isArray(data) ? data : (data['@graph'] || [data]);

        for (const item of items) {
          if (!item) continue;
          const types = Array.isArray(item['@type']) ? item['@type'] : [item['@type']];
          if (!types.includes('JobPosting')) continue;

          const title = item.title || null;

          const org = item.hiringOrganization;
          const company = (org && (org.name || (typeof org === 'string' ? org : null))) || null;

          let location = null;
          const loc = item.jobLocation;
          const locEntry = Array.isArray(loc) ? loc[0] : loc;
          const address = locEntry && locEntry.address;
          if (address) {
            location = [address.addressLocality, address.addressRegion, address.addressCountry]
              .filter(Boolean).join(', ');
          }

          if (title || company) {
            return { title, company, location: location || null };
          }
        }
      }
    } catch (e) {
      // ignore — this is a best-effort enhancement, not critical path
    }
    return null;
  }

  // Some sites briefly show transient status text like "Applying for X..."
  // or "Submitting..." right when a selector fires mid-animation, and that
  // gets mistakenly captured as if it were the actual role name. This
  // strips known transient prefixes and flags text that still looks
  // unusable afterward, so callers can fall back to asking instead of
  // confidently saving garbage.
  function cleanAndValidateRole(text) {
    if (!text) return null;

    let cleaned = text.trim();

    const transientPrefixes = [
      /^applying for\s*/i,
      /^apply for\s*/i,
      /^submitting\s*/i,
      /^please wait\.*/i,
      /^loading\.*/i,
      /^processing\.*/i
    ];
    for (const pattern of transientPrefixes) {
      cleaned = cleaned.replace(pattern, '').trim();
    }

    // Still looks like leftover status text, or too short to be a real
    // role name, or ends mid-sentence with "..."
    if (
      !cleaned ||
      cleaned.length < 3 ||
      /\.\.\.$/.test(cleaned) ||
      /^(applying|submitting|loading|processing|please wait)$/i.test(cleaned)
    ) {
      return null;
    }

    // Greeting banners and dashboard chrome ("Welcome, [Name]...", "Hi
    // there", "My Applications") also get accidentally grabbed by generic
    // h1/h2 selectors — reject those patterns too.
    const lower = cleaned.toLowerCase();
    if (
      /^welcome\b/.test(lower) ||
      /^(hi|hello|hey)\b/.test(lower) ||
      /^you have\b/.test(lower) ||
      /^my (applications|progress|profile|account)\b/.test(lower) ||
      cleaned.length > 80
    ) {
      return null;
    }

    return cleaned;
  }

  return { saveApplication, showNotification, showConfirmPopup, getStructuredJobData, cleanAndValidateRole };
})();
