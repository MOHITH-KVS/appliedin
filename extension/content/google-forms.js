// AppliedIn - Google Forms Dedicated Content Script
// Handles docs.google.com/forms/* and forms.gle/*
// Google Forms is the #1 application channel for Indian startups/SMEs.
// The /formResponse page loads with success text already in DOM —
// no mutations happen after load, so MutationObserver never fires.
// This dedicated script handles it correctly.

(function () {
  if (window.__appliedinGoogleFormsInjected) return;
  window.__appliedinGoogleFormsInjected = true;
  window.__appliedinHandled = true; // keep guarantee layer away
  window.__appliedinInjected = true; // keep universal tracker away

  // Only run on /forms/ paths — not on Google Docs, Sheets etc.
  const path = window.location.pathname.toLowerCase();
  if (!path.includes('/forms/') && !path.includes('forms.gle')) return;

  const SUCCESS_PHRASES = [
    'your response has been recorded',
    'your response has been submitted',
    'thanks for submitting',
    'thank you for submitting',
    'thank you for your response',
    'response recorded',
    'form submitted',
  ];

  function isSuccessPage() {
    const body = (document.body?.innerText || '').toLowerCase();
    // Also check URL — formResponse is always the success URL
    const isFormResponse = window.location.pathname.toLowerCase().includes('formresponse');
    return isFormResponse || SUCCESS_PHRASES.some(p => body.includes(p));
  }

  if (!isSuccessPage()) return; // Not a success page — do nothing

  // ── Extract from form title ──
  // Google Forms title pattern: "Role - CompanyName" or "CompanyName: Role Form"
  // or just "CompanyName Hiring Form"
  function extractFromTitle() {
    const rawH1 = document.querySelector('h1')?.innerText?.trim() || '';
    const rawTitle = document.title?.trim() || '';
    const formTitle = rawH1 || rawTitle.replace(' - Google Forms', '').trim();

    let company = '', role = '';

    // Pattern 1: "Role - Company" or "Role – Company"
    const dashMatch = formTitle.match(/^(.+?)\s*[-–|]\s*(.+)$/);
    if (dashMatch) {
      const left = dashMatch[1].trim();
      const right = dashMatch[2].trim();
      // Heuristic: company usually shorter, or right side has .com/.ai/.in
      if (/\.(com|ai|in|io|co|org|net)$/i.test(right) || right.length < left.length) {
        role = left; company = right;
      } else {
        role = right; company = left;
      }
    }

    // Pattern 2: "(CompanyName)" anywhere in title
    if (!company) {
      const parenMatch = formTitle.match(/\(([A-Za-z][^)]{1,50})\)/);
      if (parenMatch && !/batch|year|202\d/i.test(parenMatch[1])) {
        company = parenMatch[1].trim();
      }
    }

    // Pattern 3: First capitalized word(s) before "Hiring/Internship/Job/Form"
    if (!company) {
      const m = formTitle.match(/^([A-Z][A-Za-z0-9._-]{1,30}(?:\s[A-Z][A-Za-z0-9]{1,20})?)/);
      if (m) {
        const skip = ['freshers','hiring','internship','job','form','apply','application',
                      'registration','open','vacancy','recruitment','machine','data','software'];
        if (!skip.some(w => m[1].toLowerCase().startsWith(w))) {
          company = m[1].trim();
        }
      }
    }

    // Pattern 4: "This form was created inside CompanyName"
    const createdInside = document.body?.innerText?.match(
      /form was created inside ([^.\n-]{2,60})/i
    );
    if (createdInside && !company) {
      company = createdInside[1].replace(/private limited|pvt\.?\s*ltd\.?/gi, '').trim();
    }

    // Clean role — remove noise
    const noiseInRole = ['form','registration','hiring','application','internship form',
                         'job application','apply','2025','2026','2027','batch'];
    if (role) {
      noiseInRole.forEach(n => { role = role.replace(new RegExp(n, 'gi'), '').trim(); });
    }

    return { company: company.trim(), role: role.trim() };
  }

  // ── Show heartbeat popup ──
  let heartbeat = null;

  function showPopup() {
    if (document.getElementById('ai-gf-popup')) return;

    const { company, role } = extractFromTitle();

    const overlay = document.createElement('div');
    overlay.id = 'ai-gf-overlay';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:2147483645;`;

    const popup = document.createElement('div');
    popup.id = 'ai-gf-popup';
    popup.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:400px;max-width:92vw;background:white;border-radius:16px;padding:24px;
      box-shadow:0 24px 80px rgba(0,0,0,0.35);z-index:2147483647;border:1px solid #e5e7eb;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

    const savedC = window.__ai_gf_company !== undefined ? window.__ai_gf_company : company;
    const savedR = window.__ai_gf_role    !== undefined ? window.__ai_gf_role    : role;

    function escHtml(s) {
      return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    popup.innerHTML = `
      <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
      <div style="font-size:13px;color:#22c55e;font-weight:600;margin-bottom:6px;">
        ✅ Google Form submission detected
      </div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">
        Confirm details to save this application.
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
            letter-spacing:.05em;display:block;margin-bottom:3px;">Company *</label>
          <input id="ai-gf-company" value="${escHtml(savedC)}" maxlength="100"
            placeholder="${savedC ? '' : '⚠️ Type company name'}"
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${savedC ? '#d1d5db' : '#ef4444'};border-radius:8px;
            font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          ${!savedC ? '<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Could not detect — please type it</div>' : ''}
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;
            letter-spacing:.05em;display:block;margin-bottom:3px;">Job Role *</label>
          <input id="ai-gf-role" value="${escHtml(savedR).substring(0,80)}" maxlength="120"
            placeholder="${savedR ? '' : '⚠️ Type job role'}"
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${savedR ? '#d1d5db' : '#ef4444'};border-radius:8px;
            font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          ${!savedR ? '<div style="font-size:11px;color:#ef4444;margin-top:2px;">⚠️ Could not detect — please type it</div>' : ''}
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="ai-gf-save" style="flex:1;padding:11px;background:#22c55e;color:white;
          border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">
          ✅ Save Application
        </button>
        <button id="ai-gf-skip" style="padding:11px 18px;background:#f3f4f6;color:#374151;
          border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">
          Skip
        </button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    const ci = document.getElementById('ai-gf-company');
    const ri = document.getElementById('ai-gf-role');
    if (ci) ci.addEventListener('input', () => { window.__ai_gf_company = ci.value; });
    if (ri) ri.addEventListener('input', () => { window.__ai_gf_role    = ri.value; });

    // Focus first empty field
    setTimeout(() => {
      if (ci && !ci.value.trim()) ci.focus();
      else if (ri && !ri.value.trim()) ri.focus();
    }, 100);

    function showToast(msg, color) {
      const t = document.createElement('div');
      t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;
        border-radius:8px;font-size:14px;font-weight:500;z-index:2147483647;color:white;
        background:${color};box-shadow:0 4px 12px rgba(0,0,0,0.2);
        font-family:-apple-system,sans-serif;transition:opacity 0.3s;`;
      t.innerText = msg;
      document.body.appendChild(t);
      setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3500);
    }

    document.getElementById('ai-gf-save').addEventListener('click', function () {
      const fc = (document.getElementById('ai-gf-company')?.value || '').trim();
      const fr = (document.getElementById('ai-gf-role')?.value    || '').trim();
      if (!fc) {
        const el = document.getElementById('ai-gf-company');
        if (el) { el.style.border = '2px solid #ef4444'; el.focus(); }
        return;
      }
      if (!fr) {
        const el = document.getElementById('ai-gf-role');
        if (el) { el.style.border = '2px solid #ef4444'; el.focus(); }
        return;
      }
      clearInterval(heartbeat);
      overlay.remove(); popup.remove();
      chrome.runtime.sendMessage({
        type: 'SAVE_APPLICATION',
        data: {
          company: fc, role: fr,
          location: 'Unknown Location',
          platform: 'Google Forms',
          url: window.location.href,
          date: new Date().toISOString(),
          status: 'Applied'
        }
      }, function (res) {
        showToast(
          res?.duplicate ? '⚠️ Already applied here recently!' : '✅ Saved — ' + fc,
          res?.duplicate ? '#f59e0b' : '#22c55e'
        );
      });
    });

    document.getElementById('ai-gf-skip').addEventListener('click', function () {
      clearInterval(heartbeat);
      overlay.remove(); popup.remove();
    });
  }

  // Heartbeat — survive any DOM re-renders
  showPopup();
  heartbeat = setInterval(showPopup, 120);
  setTimeout(() => clearInterval(heartbeat), 5 * 60 * 1000);

})();
