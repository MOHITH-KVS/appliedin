// AppliedIn - Already Applied Banner
// Shows banner when user opens a job page they already applied to.
// Requires BOTH company AND role to match — never company alone.

(function () {
  const path = window.location.pathname.toLowerCase();
  const SKIP = ['/dashboard','/profile','/feed','/inbox','/messages',
    '/notifications','/settings','/account','/mynetwork','/learning',
    '/chat','/my-applications','/saved','/news','/blog','/about',
    '/orders','/terms','/privacy','/help'];
  if (path === '/') return;
  if (SKIP.some(p => path === p || path.startsWith(p + '/'))) return;

  const host = window.location.hostname.toLowerCase();
  if (host.includes('appliedin') || host.includes('allformats')) return;
  // Skip on active form pages — user is filling, not browsing
  // Check deferred until page settles

  setTimeout(checkAlreadyApplied, 1500);

  function checkAlreadyApplied() {
    // Don't show on pages with many active form inputs
    const inputs = document.querySelectorAll(
      'input[type="text"]:not([readonly]),input[type="email"]:not([readonly]),' +
      'textarea:not([readonly]),select'
    );
    if (inputs.length > 3) return; // active form — don't show banner

    chrome.storage.local.get(['applications'], function (result) {
      const apps = result.applications || [];
      if (!apps.length) return;

      const currentUrl = window.location.href;

      // METHOD 1: Exact URL match
      let match = null;
      try {
        match = apps.find(app => {
          if (!app.url) return false;
          try {
            const savedPath = new URL(app.url).pathname.toLowerCase().split('?')[0];
            const currPath  = new URL(currentUrl).pathname.toLowerCase().split('?')[0];
            return savedPath.length > 10 && savedPath === currPath;
          } catch(e) { return false; }
        });
      } catch(e) {}
      if (match) { showBanner(match); return; }

      // METHOD 2: Company + Role fuzzy match
      // Get company and role from page DOM
      const companyEl =
        document.querySelector('[class*="company-name"] a') ||
        document.querySelector('[class*="company-name"]') ||
        document.querySelector('[class*="companyName"]') ||
        document.querySelector('[class*="employer-name"]') ||
        document.querySelector('[class*="employer"]') ||
        document.querySelector('meta[property="og:site_name"]');

      const pageCompany = (
        companyEl?.getAttribute('content') ||
        companyEl?.innerText || ''
      ).trim().toLowerCase();

      const roleEl =
        document.querySelector('[class*="job-title"] h1') ||
        document.querySelector('[class*="job-title"]') ||
        document.querySelector('[class*="jobTitle"]') ||
        document.querySelector('h1');

      const pageRole = (roleEl?.innerText || '').trim().toLowerCase();

      // Must have BOTH company AND role from page
      if (!pageCompany || pageCompany.length < 3) return;
      if (!pageRole    || pageRole.length < 3)    return;

      match = apps.find(app => {
        const ac = (app.company || '').toLowerCase().trim();
        const ar = (app.role    || '').toLowerCase().trim();
        if (!ac || !ar) return false;

        // Company: strong containment, min 4 chars
        const compOk =
          (pageCompany.includes(ac) || ac.includes(pageCompany)) &&
          Math.min(ac.length, pageCompany.length) >= 4;
        if (!compOk) return false;

        // Role: 70%+ of meaningful words must match
        // This prevents "Data Analyst at Google" matching "SWE at Google"
        const AW = ar.split(/\s+/).filter(w => w.length > 2);
        const PW = pageRole.split(/\s+/).filter(w => w.length > 2);
        if (!AW.length || !PW.length) return false;
        const common = AW.filter(w => PW.includes(w));
        return common.length >= Math.max(1, Math.ceil(AW.length * 0.7));
      });

      if (match) showBanner(match);
    });
  }

  function showBanner(app) {
    if (document.getElementById('ai-already-banner')) return;
    if (window.__appliedinPopupOpen) return;

    const date = app.date ? new Date(app.date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    }) : 'earlier';

    const style = document.createElement('style');
    style.textContent = `
      @keyframes ai-slideIn {
        from { opacity:0; transform:translateY(-10px); }
        to   { opacity:1; transform:translateY(0); }
      }
      #ai-already-banner { animation: ai-slideIn 0.3s ease; }
    `;
    document.head.appendChild(style);

    const banner = document.createElement('div');
    banner.id = 'ai-already-banner';
    banner.style.cssText = `
      position:fixed;top:16px;right:16px;z-index:2147483646;
      background:white;border:2px solid #1A56FF;border-radius:12px;
      padding:12px 16px;max-width:300px;
      box-shadow:0 4px 20px rgba(26,86,255,0.2);
      font-family:-apple-system,BlinkMacSystemFont,sans-serif;`;

    function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    const statusColors = {
      'Applied':     {bg:'#eff6ff',color:'#2563eb'},
      'In Review':   {bg:'#fef3c7',color:'#d97706'},
      'Interview':   {bg:'#f0fdf4',color:'#16a34a'},
      'Shortlisted': {bg:'#f0fdf4',color:'#16a34a'},
      'Rejected':    {bg:'#fff1f2',color:'#e11d48'},
    };
    const sc = statusColors[app.status] || statusColors['Applied'];

    banner.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="font-size:20px;flex-shrink:0;">✅</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">
            Already Applied!
          </div>
          <div style="font-size:12px;color:#4b5563;line-height:1.4;margin-bottom:6px;">
            <strong>${esc(app.company)}</strong>
            ${app.role ? '· ' + esc(app.role.substring(0,35)) + (app.role.length>35?'…':'') : ''}
            <br/>${date}
          </div>
          <div style="display:flex;gap:6px;align-items:center;">
            <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:20px;
              background:${sc.bg};color:${sc.color};">
              ${esc(app.status||'Applied')}
            </span>
            <span style="font-size:11px;color:#9ca3af;">via ${esc(app.platform||'Unknown')}</span>
          </div>
        </div>
        <button id="ai-banner-close" style="flex-shrink:0;background:none;border:none;
          cursor:pointer;font-size:18px;color:#9ca3af;padding:0 0 0 4px;line-height:1;">×</button>
      </div>`;

    document.body.appendChild(banner);

    const timer = setTimeout(dismiss, 8000);
    document.getElementById('ai-banner-close').addEventListener('click', () => {
      clearTimeout(timer); dismiss();
    });
    function dismiss() {
      banner.style.opacity = '0';
      banner.style.transition = 'opacity 0.3s';
      setTimeout(() => banner.remove(), 300);
    }
  }
})();
