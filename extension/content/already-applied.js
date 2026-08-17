// AppliedIn - Already Applied Banner
// Shows a non-intrusive banner when user opens a job page they already applied to.
// Checks by URL match first, then company+role fuzzy match.
// Works on ALL pages — dedicated portals + company career sites + ATS.

(function () {
  // Skip non-job paths
  const path = window.location.pathname.toLowerCase();
  const SKIP = ['/dashboard','/profile','/feed','/inbox','/messages',
    '/notifications','/settings','/account','/mynetwork','/learning',
    '/chat','/my-applications','/saved','/news','/blog','/about','/orders'];
  if (path === '/') return;
  if (SKIP.some(p => path === p || path.startsWith(p + '/'))) return;

  // Skip own pages
  const host = window.location.hostname.toLowerCase();
  if (host.includes('appliedin') || host.includes('allformats')) return;

  // Run after page settles
  setTimeout(checkAlreadyApplied, 1200);

  function checkAlreadyApplied() {
    chrome.storage.local.get(['applications'], function (result) {
      const apps = result.applications || [];
      if (!apps.length) return;

      const currentUrl = window.location.href.toLowerCase();

      // METHOD 1: Exact URL match (most reliable)
      const urlMatch = apps.find(app =>
        app.url && currentUrl.includes(new URL(app.url).pathname.toLowerCase().split('?')[0])
        && new URL(app.url).pathname.length > 5
      );
      if (urlMatch) { showBanner(urlMatch); return; }

      // METHOD 2: Company name match from page
      const pageText = (document.body?.innerText || '').toLowerCase();
      const pageTitle = document.title?.toLowerCase() || '';

      // Try to extract company from page
      const companyEl =
        document.querySelector('[class*="company-name"]') ||
        document.querySelector('[class*="companyName"]') ||
        document.querySelector('[class*="employer"]') ||
        document.querySelector('meta[property="og:site_name"]');

      const pageCompany = (
        companyEl?.content?.toLowerCase() ||
        companyEl?.innerText?.toLowerCase() || ''
      ).trim();

      // Try to extract role from page
      const roleEl =
        document.querySelector('[class*="job-title"]') ||
        document.querySelector('[class*="jobTitle"]') ||
        document.querySelector('h1') ||
        document.querySelector('h2');

      const pageRole = (roleEl?.innerText || '').toLowerCase().trim();

      if (!pageCompany && !pageRole) return;

      // Find matching application
      const match = apps.find(app => {
        const appCompany = (app.company || '').toLowerCase();
        const appRole    = (app.role    || '').toLowerCase();

        // Company match
        const companyMatch = pageCompany &&
          (pageCompany.includes(appCompany) || appCompany.includes(pageCompany));

        // Role match (at least 3 words in common)
        const roleWords = appRole.split(/\s+/).filter(w => w.length > 2);
        const pageRoleWords = pageRole.split(/\s+/).filter(w => w.length > 2);
        const commonWords = roleWords.filter(w => pageRoleWords.includes(w));
        const roleMatch = commonWords.length >= Math.min(2, roleWords.length);

        return companyMatch && roleMatch;
      });

      if (match) showBanner(match);
    });
  }

  function showBanner(app) {
    // Don't show if popup is open or banner already shown
    if (document.getElementById('ai-already-banner')) return;
    if (window.__appliedinPopupOpen) return;

    const date = app.date ? new Date(app.date).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    }) : 'earlier';

    const banner = document.createElement('div');
    banner.id = 'ai-already-banner';
    banner.style.cssText = `
      position: fixed;
      top: 16px;
      right: 16px;
      z-index: 2147483646;
      background: white;
      border: 2px solid #1A56FF;
      border-radius: 12px;
      padding: 12px 16px;
      max-width: 300px;
      box-shadow: 0 4px 20px rgba(26,86,255,0.2);
      font-family: -apple-system, BlinkMacSystemFont, sans-serif;
      animation: slideIn 0.3s ease;
    `;

    // Add animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from { opacity:0; transform:translateY(-10px); }
        to   { opacity:1; transform:translateY(0); }
      }
    `;
    document.head.appendChild(style);

    banner.innerHTML = `
      <div style="display:flex;align-items:flex-start;gap:10px;">
        <div style="font-size:20px;flex-shrink:0;line-height:1;">✅</div>
        <div style="flex:1;">
          <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:2px;">
            Already Applied!
          </div>
          <div style="font-size:12px;color:#4b5563;line-height:1.4;">
            You applied to <strong>${escHtml(app.company)}</strong>
            ${app.role ? 'for <strong>' + escHtml(app.role.substring(0,40)) + '</strong>' : ''}
            on ${date}.
          </div>
          <div style="display:flex;gap:8px;margin-top:8px;">
            <div style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:20px;
              background:${getStatusColor(app.status).bg};color:${getStatusColor(app.status).text};">
              ${escHtml(app.status || 'Applied')}
            </div>
            <span style="font-size:11px;color:#9ca3af;">via ${escHtml(app.platform||'Unknown')}</span>
          </div>
        </div>
        <button id="ai-banner-close" style="flex-shrink:0;background:none;border:none;
          cursor:pointer;font-size:16px;color:#9ca3af;padding:0;line-height:1;">×</button>
      </div>
    `;

    document.body.appendChild(banner);

    // Auto-dismiss after 8 seconds
    const timer = setTimeout(() => dismissBanner(), 8000);

    document.getElementById('ai-banner-close').addEventListener('click', function() {
      clearTimeout(timer);
      dismissBanner();
    });

    function dismissBanner() {
      banner.style.opacity = '0';
      banner.style.transform = 'translateY(-10px)';
      banner.style.transition = 'opacity 0.3s, transform 0.3s';
      setTimeout(() => banner.remove(), 300);
    }
  }

  function getStatusColor(status) {
    const colors = {
      'Applied':     { bg: '#eff6ff', text: '#2563eb' },
      'In Review':   { bg: '#fef3c7', text: '#d97706' },
      'Interview':   { bg: '#f0fdf4', text: '#16a34a' },
      'Shortlisted': { bg: '#f0fdf4', text: '#16a34a' },
      'Rejected':    { bg: '#fff1f2', text: '#e11d48' },
      'Offer':       { bg: '#f0fdf4', text: '#16a34a' },
    };
    return colors[status] || colors['Applied'];
  }

  function escHtml(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})();
