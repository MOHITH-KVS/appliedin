// AppliedIn - Background Service Worker v2
// Architecture: THREE independent layers, each catching what others miss
// Layer 1: Dedicated content scripts (LinkedIn, Naukri, Internshala etc.)
// Layer 2: Universal tracker — injects on job-related pages
// Layer 3: Guarantee scanner — catches EVERYTHING else after page load

// ── In-memory dedup: same company+role within 10s = double-save ──
const _recentSaves = new Map();

// ── Portals with dedicated scripts ──
const DEDICATED_PORTALS = [
  'linkedin.com', 'naukri.com', 'internshala.com',
  'indeed.com', 'glassdoor.com', 'glassdoor.co.in',
  'unstop.com', 'shine.com', 'foundit.in',
  'freshersworld.com', 'hirist.tech', 'hirist.com',
  'cutshort.io', 'monster.com', 'monsterindia.com',
];

// ── Hard-blocked domains — never inject on these ──
const NEVER_INJECT = [
  // Email
  'mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com',
  // Social / Chat
  'twitter.com', 'x.com', 'facebook.com', 'instagram.com', 'reddit.com',
  'discord.com', 'telegram.org', 'web.whatsapp.com', 'web.telegram.org',
  'linkedin.com/messaging', // messaging sub-path handled separately
  // Video / Entertainment
  'youtube.com', 'netflix.com', 'hotstar.com', 'primevideo.com', 'spotify.com',
  // Shopping
  'amazon.in', 'amazon.com', 'flipkart.com', 'myntra.com', 'swiggy.com', 'zomato.com',
  // Banking
  'sbi.co.in', 'hdfcbank.com', 'icicibank.com', 'paytm.com', 'phonepe.com',
  // Search engines (bare domain only)
  'google.com', 'bing.com', 'duckduckgo.com',
  // News
  'timesofindia.com', 'ndtv.com', 'thehindu.com', 'bbc.com', 'cnn.com',
  // Dev/Learning (non-apply)
  'stackoverflow.com', 'leetcode.com', 'geeksforgeeks.org', 'udemy.com', 'coursera.org',
  'github.com',
  // Productivity (non-forms)
  'drive.google.com', 'sheets.google.com', 'slides.google.com',
  'slack.com', 'teams.microsoft.com', 'trello.com',
  // AppliedIn's own pages
  'appliedin.vercel.app', 'allformatsready.vercel.app',
  'vercel.app', 'netlify.app', 'github.io',
];

function isNeverInject(hostname) {
  return NEVER_INJECT.some(d => hostname === d || hostname.endsWith('.' + d));
}

function isDedicatedPortal(hostname) {
  return DEDICATED_PORTALS.some(d => hostname.includes(d));
}

// ══════════════════════════════════════════════════════
// LAYER 2: Universal Tracker
// Injects on ALL pages that aren't hard-blocked or covered
// ══════════════════════════════════════════════════════

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const url = tab.url.toLowerCase();
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('edge://')) return;

  let hostname = '';
  try { hostname = new URL(tab.url).hostname.toLowerCase(); } catch(e) { return; }

  // Never inject on hard-blocked domains
  if (isNeverInject(hostname)) return;

  // Skip dedicated portals — they handle themselves
  if (isDedicatedPortal(hostname)) return;

  // Inject universal tracker on everything else
  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: injectUniversalTracker,
    args: [getDisplayName(hostname, tab.url)]
  }).catch(() => {});
});

function getDisplayName(hostname, url) {
  const KNOWN = {
    'workday.com': 'Company Website', 'myworkdayjobs.com': 'Company Website',
    'greenhouse.io': 'Company Website', 'lever.co': 'Company Website',
    'smartrecruiters.com': 'Company Website', 'taleo.net': 'Company Website',
    'icims.com': 'Company Website', 'successfactors.com': 'Company Website',
    'sapsf.eu': 'Company Website', 'sapsf.com': 'Company Website',
    'zohorecruit.com': 'Zoho Recruit', 'freshteam.com': 'Freshteam',
    'keka.com': 'Keka HR', 'darwinbox.com': 'Darwinbox',
    'bamboohr.com': 'BambooHR', 'recruitcrm.io': 'RecruitCRM',
    'typeform.com': 'Typeform', 'jotform.com': 'JotForm',
    'tally.so': 'Tally Form', 'binary.so': 'Company Form',
    'wellfound.com': 'Wellfound', 'angel.co': 'AngelList',
    'apna.co': 'Apna', 'workindia.in': 'WorkIndia',
    'iimjobs.com': 'IIMJobs', 'careers.google.com': 'Google Careers',
    'amazon.jobs': 'Amazon Jobs',
  };
  for (const [domain, name] of Object.entries(KNOWN)) {
    if (hostname.includes(domain)) return name;
  }
  // Extract company name from hostname
  const parts = hostname.replace(/^(www|careers|jobs|apply|talent|work|hr)\./i, '').split('.');
  const name = parts[0];
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// ══════════════════════════════════════════════════════
// UNIVERSAL TRACKER — injected into page context
// ══════════════════════════════════════════════════════
function injectUniversalTracker(platformName) {
  if (window.__appliedinInjected) return;
  window.__appliedinInjected = true;

  // Skip non-apply paths — these are definitely not job apply pages
  const path = window.location.pathname.toLowerCase();
  const SKIP_PATHS = [
    '/chat', '/messages', '/messaging', '/inbox', '/notifications',
    '/dashboard', '/profile', '/account', '/settings', '/feed',
    '/mynetwork', '/learning', '/salary', '/reviews', '/community',
    '/my-applications', '/saved', '/wishlist', '/cart', '/orders',
    '/news', '/blog', '/about', '/contact', '/terms', '/privacy',
  ];
  if (path === '/' || SKIP_PATHS.some(p => path.startsWith(p))) return;

  let handled = false;
  let observerActive = true;

  const SUCCESS_PHRASES = [
    // Application confirmations
    'your application was sent', 'application was sent',
    'your application has been sent', 'application has been sent',
    'your application has been submitted', 'application submitted',
    'application submitted successfully', 'application successful',
    'your application is complete', 'application complete',
    'successfully applied', 'you have successfully applied',
    'you have applied', "you've applied",
    'applied successfully', 'application sent successfully',
    // Thank you variations
    'thank you for applying', 'thank you for your application',
    'thanks for applying', 'thanks for submitting',
    'thank you for submitting', 'thank you for your interest',
    'thank you for your interest in joining',
    // Response confirmations
    'your response has been recorded', 'your response has been submitted',
    'response recorded', 'form submitted',
    // Receipt confirmations
    'we have received your application', 'we have received your submission',
    'we have received your profile',
    'your submission has been received', 'submission received',
    'application received',
    // Company-specific patterns
    'your application is under review',
    'we will be in touch', 'we will contact you',
    'we will review your application',
    'someone will be contacting you',
    'our team will reach out',
    // Generic success
    'you are now being considered',
    'your details have been submitted',
    'your information has been submitted',
  ];

  // AMBIGUOUS DOMAINS — company name can't be read from these
  const AMBIGUOUS = [
    'docs.google.com', 'forms.google.com', 'forms.gle',
    'typeform.com', 'jotform.com', 'tally.so', 'binary.so',
    'airtable.com', 'fillout.com', 'paperform.co', 'forms.app',
    'zohorecruit.com', 'freshteam.com', 'keka.com', 'darwinbox.com',
    'bamboohr.com', 'recruitcrm.io', 'forms.microsoft.com',
  ];

  function isAmbiguous() {
    return AMBIGUOUS.some(d => window.location.hostname.includes(d));
  }

  function isSuccess() {
    const body = (document.body?.innerText || '').toLowerCase();
    if (SUCCESS_PHRASES.some(p => body.includes(p))) return true;
    // Check dialogs/modals too
    const dialogs = document.querySelectorAll('[role="dialog"],[class*="modal"],[class*="dialog"]');
    for (const d of dialogs) {
      const t = (d.innerText || '').toLowerCase();
      if (SUCCESS_PHRASES.some(p => t.includes(p))) return true;
    }
    return false;
  }

  const NOISE = ['thank you','thanks for','successfully applied','application submitted',
    'you have applied','we have received','your application','congratulations',
    'we will','our team','someone will'];

  function cleanText(text) {
    if (!text || text.length > 80) return null;
    const l = text.toLowerCase();
    if (NOISE.some(w => l.includes(w))) return null;
    if (/[.!?]$/.test(text.trim())) return null;
    return text.trim();
  }

  function getCompany() {
    const meta = document.querySelector('meta[property="og:site_name"]')?.content?.trim();
    if (meta && cleanText(meta)) return meta.trim();
    // Try structured elements
    for (const sel of ['[class*="company-name"]','[class*="companyName"]',
                       '[class*="employer"]','[class*="org-name"]']) {
      const el = document.querySelector(sel);
      if (el && cleanText(el.innerText)) return el.innerText.trim();
    }
    // Hostname fallback
    const host = window.location.hostname
      .replace(/^(www|careers|jobs|apply|talent|work|hr)\./i, '').split('.')[0];
    return host.charAt(0).toUpperCase() + host.slice(1);
  }

  function getRole() {
    for (const sel of ['[class*="job-title"]','[class*="jobTitle"]',
                       '[class*="position"]','[class*="role"]','h1','h2']) {
      const el = document.querySelector(sel);
      if (el && cleanText(el.innerText)) return el.innerText.trim().substring(0, 100);
    }
    // Page title fallback — strip site name
    const title = document.title?.replace(/[-|–].*$/, '').trim() || '';
    return cleanText(title) ? title : '';
  }

  function saveApp(data) {
    chrome.runtime.sendMessage({ type: 'SAVE_APPLICATION', data }, res => {
      showToast(res?.duplicate ? '⚠️ Already applied here recently!' : '✅ Saved — ' + data.company,
                res?.duplicate ? '#f59e0b' : '#22c55e');
    });
  }

  function showToast(msg, color) {
    const t = document.createElement('div');
    t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;
      font-size:14px;font-weight:500;z-index:2147483647;color:white;background:${color};
      box-shadow:0 4px 12px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;transition:opacity 0.3s;`;
    t.innerText = msg;
    document.body.appendChild(t);
    setTimeout(() => { t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3500);
  }

  // ── THE ALWAYS-POPUP — shows on success, cannot be suppressed ──
  function showGuaranteePopup(prefill) {
    if (document.getElementById('ai-gu-popup')) return;
    handled = true;
    observerActive = false;
    window.__appliedinHandled = true;
    window.__appliedinPopupOpen = true;

    const company = prefill?.company || '';
    const role    = prefill?.role    || '';

    let heartbeat = null;

    function build() {
      if (document.getElementById('ai-gu-popup')) return;
      document.getElementById('ai-gu-overlay')?.remove();

      function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

      const overlay = document.createElement('div');
      overlay.id = 'ai-gu-overlay';
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483645;';

      const popup = document.createElement('div');
      popup.id = 'ai-gu-popup';
      popup.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
        width:400px;max-width:92vw;background:white;border-radius:16px;padding:24px;
        box-shadow:0 24px 80px rgba(0,0,0,0.4);z-index:2147483647;border:1px solid #e5e7eb;
        font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

      const sc = window.__ai_gu_c !== undefined ? window.__ai_gu_c : company;
      const sr = window.__ai_gu_r !== undefined ? window.__ai_gu_r : role;

      popup.innerHTML = `
        <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
        <div style="font-size:13px;color:#22c55e;font-weight:600;margin-bottom:6px;">✅ Application detected — save it!</div>
        <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">
          ${!sc||!sr ? '⚠️ Could not auto-detect details. Please fill in:' : 'Confirm details:'}
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px;">Company *</label>
            <input id="ai-gu-company" value="${esc(sc)}" maxlength="100"
              placeholder="Type company name..."
              style="width:100%;box-sizing:border-box;padding:10px 12px;
              border:2px solid ${sc?'#d1d5db':'#ef4444'};border-radius:8px;
              font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px;">Job Role *</label>
            <input id="ai-gu-role" value="${esc(sr).substring(0,80)}" maxlength="120"
              placeholder="Type job role..."
              style="width:100%;box-sizing:border-box;padding:10px 12px;
              border:2px solid ${sr?'#d1d5db':'#ef4444'};border-radius:8px;
              font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button id="ai-gu-save" style="flex:1;padding:11px;background:#22c55e;color:white;
            border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">✅ Save</button>
          <button id="ai-gu-skip" style="padding:11px 18px;background:#f3f4f6;color:#374151;
            border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Skip</button>
        </div>`;

      document.body.appendChild(overlay);
      document.body.appendChild(popup);

      const ci = document.getElementById('ai-gu-company');
      const ri = document.getElementById('ai-gu-role');
      if (ci) ci.addEventListener('input', ()=>{ window.__ai_gu_c = ci.value; });
      if (ri) ri.addEventListener('input', ()=>{ window.__ai_gu_r = ri.value; });

      setTimeout(()=>{
        if (ci && !ci.value.trim()) ci.focus();
        else if (ri && !ri.value.trim()) ri.focus();
      }, 100);

      document.getElementById('ai-gu-save').addEventListener('click', function() {
        const fc = (document.getElementById('ai-gu-company')?.value||'').trim();
        const fr = (document.getElementById('ai-gu-role')?.value||'').trim();
        if (!fc) { const el=document.getElementById('ai-gu-company'); if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
        if (!fr) { const el=document.getElementById('ai-gu-role');    if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
        clearInterval(heartbeat);
        window.__appliedinPopupOpen = false;
        overlay.remove(); popup.remove();
        saveApp({ company:fc, role:fr, location:'Unknown Location',
          platform: platformName, url:window.location.href,
          date:new Date().toISOString(), status:'Applied' });
      });

      document.getElementById('ai-gu-skip').addEventListener('click', function() {
        clearInterval(heartbeat);
        window.__appliedinPopupOpen = false;
        overlay.remove(); popup.remove();
      });
    }

    build();
    heartbeat = setInterval(build, 120);
    setTimeout(()=>clearInterval(heartbeat), 5*60*1000);
  }

  function handleSuccess() {
    if (handled) return;
    if (window.__appliedinPopupOpen) return;
    handled = true;
    observerActive = false;
    window.__appliedinHandled = true;

    const company = getCompany();
    const role    = getRole();

    // If on ambiguous domain OR missing details → always show popup
    if (isAmbiguous() || !company || !role || !cleanText(role)) {
      showGuaranteePopup({ company, role });
    } else {
      // Clean data — save silently
      saveApp({ company, role, location:'Unknown Location',
        platform: platformName, url:window.location.href,
        date:new Date().toISOString(), status:'Applied' });
    }
  }

  // Observer
  const observer = new MutationObserver(function() {
    if (!observerActive || handled) return;
    if (window.__appliedinPopupOpen) return;
    if (isSuccess()) setTimeout(handleSuccess, 800);
  });
  observer.observe(document.body, { childList:true, subtree:true, attributes:true,
    attributeFilter:['class','style','aria-hidden'] });

  // Check on load — catches redirect-based success pages
  setTimeout(function() {
    if (!handled && !window.__appliedinPopupOpen && isSuccess()) handleSuccess();
  }, 600);

  // Safety poll — every 1s for 3 mins, catches anything observer missed
  const poll = setInterval(function() {
    if (handled || window.__appliedinPopupOpen) { clearInterval(poll); return; }
    if (isSuccess()) { clearInterval(poll); handleSuccess(); }
  }, 1000);
  setTimeout(() => clearInterval(poll), 3 * 60 * 1000);
}

// ══════════════════════════════════════════════════════
// LAYER 3: Guarantee Scanner
// Runs on EVERY page load as final safety net
// Specifically catches redirect-based confirmation pages
// ══════════════════════════════════════════════════════

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo, tab) {
  if (changeInfo.status !== 'complete') return;
  if (!tab.url) return;

  const url = tab.url.toLowerCase();
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('about:') || url.startsWith('edge://')) return;

  let hostname = '';
  try { hostname = new URL(tab.url).hostname.toLowerCase(); } catch(e) { return; }

  if (isNeverInject(hostname)) return;
  // Don't run guarantee scanner on dedicated portal pages
  // (they have their own scripts) EXCEPT for redirect confirmation pages
  if (isDedicatedPortal(hostname)) {
    const path = url.includes('saveapply') || url.includes('applyconfirm') ||
                 url.includes('apply-success') || url.includes('applysuccess');
    if (!path) return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: guaranteeScanner,
    args: [getDisplayName(hostname, tab.url)]
  }).catch(() => {});
});

function guaranteeScanner(platformName) {
  // Only run if not already handled
  if (window.__appliedinHandled) return;
  if (window.__appliedinPopupOpen) return;

  const path = window.location.pathname.toLowerCase();
  const url  = window.location.href.toLowerCase();

  // Skip non-apply paths strictly
  const SKIP = [
    '/chat','/messages','/messaging','/inbox','/notifications','/dashboard',
    '/profile','/account','/settings','/feed','/mynetwork','/learning',
    '/salary','/reviews','/community','/my-applications','/saved',
    '/wishlist','/cart','/orders','/news','/blog','/about','/contact',
    '/terms','/privacy','/help','/support',
  ];
  if (path === '/') return;
  if (SKIP.some(p => path === p || path.startsWith(p + '/'))) return;

  // Context check — skip dashboard/tracker/portfolio pages
  const title = document.title?.toLowerCase() || '';
  const desc  = document.querySelector('meta[name="description"]')?.content?.toLowerCase() || '';
  const SKIP_CONTEXT = ['job tracker','application tracker','track your applications',
    'my applications','appliedin','allformats','portfolio','resume builder'];
  if (SKIP_CONTEXT.some(s => title.includes(s) || desc.includes(s))) return;
  if (url.includes('appliedin') || url.includes('allformats')) return;

  // Google Forms special case — only run on /formResponse
  const host = window.location.hostname.toLowerCase();
  if (host.includes('docs.google.com') && !path.includes('/forms/')) return;

  const SUCCESS_PHRASES = [
    'your application was sent','application was sent',
    'your application has been sent','application has been sent',
    'your application has been submitted','application submitted',
    'successfully applied','you have successfully applied',
    'you have applied',"you've applied",'applied successfully',
    'thank you for applying','thank you for your application',
    'thanks for applying','thank you for submitting',
    'thank you for your interest',
    'your response has been recorded','response recorded',
    'we have received your application','we have received your submission',
    'your submission has been received','submission received',
    'application received','someone will be contacting you',
    'we will be in touch','we will contact you shortly',
    'your details have been submitted',
    'your information has been submitted',
    'application complete','application successful',
  ];

  function isSuccess() {
    const body = (document.body?.innerText || '').toLowerCase();
    if (SUCCESS_PHRASES.some(p => body.includes(p))) return true;
    const dialogs = document.querySelectorAll('[role="dialog"],[class*="modal"]');
    for (const d of dialogs) {
      const t = (d.innerText || '').toLowerCase();
      if (SUCCESS_PHRASES.some(p => t.includes(p))) return true;
    }
    return false;
  }

  if (!isSuccess()) return; // page has no success content — do nothing

  // Mark handled
  window.__appliedinHandled = true;
  window.__appliedinPopupOpen = true;

  // Extract what we can
  function getC() {
    const meta = document.querySelector('meta[property="og:site_name"]')?.content?.trim();
    if (meta && meta.length < 60) return meta;

    // Google Forms: "This form was created inside CompanyName"
    const m = (document.body?.innerText||'').match(/form was created inside ([^.\n\-]{2,60})/i);
    if (m) return m[1].replace(/private limited|pvt\.?\s*ltd\.?/gi,'').trim();

    const host = window.location.hostname
      .replace(/^(www|careers|jobs|apply|talent|hr)\./i,'').split('.')[0];
    return host.charAt(0).toUpperCase() + host.slice(1);
  }

  function getR() {
    const noise = ['thank','applied','application','received','submitted',
      'congratulations','welcome','success','recorded','response','interest'];
    for (const sel of ['h1','h2','[class*="job-title"],[class*="position"]']) {
      const el = document.querySelector(sel);
      const t  = el?.innerText?.trim() || '';
      if (t && t.length < 80 && !noise.some(w => t.toLowerCase().includes(w))) return t;
    }
    // Google Forms: role is title before the dash
    const ft = document.querySelector('h1')?.innerText?.trim() || document.title || '';
    const di = ft.search(/[-–|]/);
    if (di > 0) { const b = ft.substring(0,di).trim(); if (b.length>2&&b.length<80) return b; }
    return '';
  }

  const company = getC();
  const role    = getR();

  // Show heartbeat popup — always
  let heartbeat = null;

  function buildPopup() {
    if (document.getElementById('ai-gs-popup')) return;
    document.getElementById('ai-gs-overlay')?.remove();

    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

    const overlay = document.createElement('div');
    overlay.id = 'ai-gs-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:2147483645;';

    const popup = document.createElement('div');
    popup.id = 'ai-gs-popup';
    popup.style.cssText = `position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      width:400px;max-width:92vw;background:white;border-radius:16px;padding:24px;
      box-shadow:0 24px 80px rgba(0,0,0,0.4);z-index:2147483647;border:1px solid #e5e7eb;
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

    const sc = window.__ai_gs_c !== undefined ? window.__ai_gs_c : company;
    const sr = window.__ai_gs_r !== undefined ? window.__ai_gs_r : role;

    popup.innerHTML = `
      <div style="font-size:17px;font-weight:700;color:#111827;margin-bottom:4px;">📋 AppliedIn</div>
      <div style="font-size:13px;color:#22c55e;font-weight:600;margin-bottom:6px;">✅ Application detected!</div>
      <div style="font-size:12px;color:#6b7280;margin-bottom:14px;">
        ${!sc||!sr?'Could not auto-detect details — please fill in:':'Confirm and save:'}
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;">
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px;">Company *</label>
          <input id="ai-gs-company" value="${esc(sc)}" maxlength="100"
            placeholder="Type company name..."
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${sc?'#d1d5db':'#ef4444'};border-radius:8px;font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:3px;">Job Role *</label>
          <input id="ai-gs-role" value="${esc(sr).substring(0,80)}" maxlength="120"
            placeholder="Type job role..."
            style="width:100%;box-sizing:border-box;padding:10px 12px;
            border:2px solid ${sr?'#d1d5db':'#ef4444'};border-radius:8px;font-size:14px;color:#111827;outline:none;font-family:inherit;"/>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        <button id="ai-gs-save" style="flex:1;padding:11px;background:#22c55e;color:white;
          border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer;">✅ Save</button>
        <button id="ai-gs-skip" style="padding:11px 18px;background:#f3f4f6;color:#374151;
          border:none;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;">Skip</button>
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    const ci = document.getElementById('ai-gs-company');
    const ri = document.getElementById('ai-gs-role');
    if (ci) ci.addEventListener('input', ()=>{ window.__ai_gs_c = ci.value; });
    if (ri) ri.addEventListener('input', ()=>{ window.__ai_gs_r = ri.value; });

    setTimeout(()=>{
      if (ci && !ci.value.trim()) ci.focus();
      else if (ri && !ri.value.trim()) ri.focus();
    }, 100);

    function showToast(msg, color) {
      const t = document.createElement('div');
      t.style.cssText = `position:fixed;bottom:24px;right:24px;padding:12px 20px;border-radius:8px;
        font-size:14px;font-weight:500;z-index:2147483647;color:white;background:${color};
        box-shadow:0 4px 12px rgba(0,0,0,0.2);font-family:-apple-system,sans-serif;`;
      t.innerText = msg;
      document.body.appendChild(t);
      setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),300);},3500);
    }

    document.getElementById('ai-gs-save').addEventListener('click', function() {
      const fc = (document.getElementById('ai-gs-company')?.value||'').trim();
      const fr = (document.getElementById('ai-gs-role')?.value||'').trim();
      if (!fc) { const el=document.getElementById('ai-gs-company'); if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
      if (!fr) { const el=document.getElementById('ai-gs-role');    if(el){el.style.border='2px solid #ef4444';el.focus();} return; }
      clearInterval(heartbeat);
      window.__appliedinPopupOpen = false;
      overlay.remove(); popup.remove();
      chrome.runtime.sendMessage({ type:'SAVE_APPLICATION', data:{
        company:fc, role:fr, location:'Unknown Location',
        platform:platformName, url:window.location.href,
        date:new Date().toISOString(), status:'Applied'
      }}, res => {
        showToast(res?.duplicate?'⚠️ Already applied recently!':'✅ Saved — '+fc,
                  res?.duplicate?'#f59e0b':'#22c55e');
      });
    });

    document.getElementById('ai-gs-skip').addEventListener('click', function() {
      clearInterval(heartbeat);
      window.__appliedinPopupOpen = false;
      overlay.remove(); popup.remove();
    });
  }

  buildPopup();
  heartbeat = setInterval(buildPopup, 120);
  setTimeout(()=>clearInterval(heartbeat), 5*60*1000);
}

// ══════════════════════════════════════════════════════
// MESSAGE HANDLER — saves from content scripts
// ══════════════════════════════════════════════════════

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {

  if (message.type === 'SET_APPLY_FLAG') {
    chrome.storage.local.set({ __appliedin_redirect_flag: {
      origin: message.origin, jobData: message.jobData, ts: Date.now()
    }});
    sendResponse({ ok: true });
    return true;
  }

  if (message.type !== 'SAVE_APPLICATION') return false;

  const jobData = message.data;
  if (!jobData || !jobData.company || !jobData.role) {
    sendResponse({ saved: false, error: 'missing fields' });
    return true;
  }

  // 10-second in-memory dedup — catches double-save from popup + observer
  const _key = (jobData.company + '|' + jobData.role).toLowerCase().trim();
  const _last = _recentSaves.get(_key);
  if (_last && (Date.now() - _last) < 10000) {
    sendResponse({ saved: false, duplicate: true });
    return true;
  }
  _recentSaves.set(_key, Date.now());
  for (const [k,ts] of _recentSaves) { if (Date.now()-ts > 60000) _recentSaves.delete(k); }

  chrome.storage.local.get(['applications'], function (result) {
    const applications = result.applications || [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const isDup = applications.some(app =>
      app.company.toLowerCase() === jobData.company.toLowerCase() &&
      app.role.toLowerCase()    === jobData.role.toLowerCase()    &&
      new Date(app.date).getTime() > cutoff
    );
    if (isDup) { sendResponse({ saved: false, duplicate: true }); return; }
    applications.unshift(jobData);
    chrome.storage.local.set({ applications }, () => sendResponse({ saved: true }));
  });

  return true;
});
