// AppliedIn v1.1 — OPTIONAL Gmail reply detection (off by default; needs the user's permission).
// Reads sender, subject and preview of messages already shown in the user's own Gmail tab and sends them
// ONLY to AppliedIn's background worker on the same computer, which compares them with your saved companies.
// Nothing is uploaded, nothing is stored except the resulting status change.
(function () {
  'use strict';
  if (window.__appliedinGmail || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
  window.__appliedinGmail = true;
  const sent = new Set();
  const txt = el => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();

  function collect() {
    const items = [];
    // Inbox / search list rows
    document.querySelectorAll('tr.zA').forEach(tr => {
      const id = tr.getAttribute('data-legacy-thread-id') || (tr.querySelector('[data-legacy-thread-id]') || {}).getAttribute && tr.querySelector('[data-legacy-thread-id]').getAttribute('data-legacy-thread-id') || tr.id;
      if (!id || sent.has(id)) return;
      const who = tr.querySelector('span[email]');
      items.push({
        id, fromName: who ? (who.getAttribute('name') || txt(who)) : '', fromEmail: who ? who.getAttribute('email') || '' : '',
        subject: txt(tr.querySelector('.bog')), snippet: txt(tr.querySelector('.y2')).replace(/^-\s*/, '')
      });
    });
    // An opened conversation (more text to read than the one-line preview)
    const h = document.querySelector('h2.hP');
    if (h) {
      const key = 'open:' + location.hash;
      if (!sent.has(key)) {
        const who = document.querySelector('span.gD[email]');
        const bodies = Array.prototype.slice.call(document.querySelectorAll('.a3s')).slice(-2).map(txt).join(' ').slice(0, 2500);
        items.push({ id: key, fromName: who ? (who.getAttribute('name') || txt(who)) : '', fromEmail: who ? who.getAttribute('email') || '' : '', subject: txt(h), snippet: '', body: bodies });
      }
    }
    return items;
  }
  function note(msg) {
    const d = document.createElement('div');
    d.setAttribute('role', 'status');
    d.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#0f172a;color:#fff;padding:12px 16px;border-radius:10px;font:14px system-ui,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.35);border-left:4px solid #22c55e';
    d.textContent = msg; document.documentElement.appendChild(d); setTimeout(() => d.remove(), 6000);
  }
  function scan() {
    let items; try { items = collect(); } catch (e) { return; }
    if (!items.length) return;
    items.forEach(i => sent.add(i.id));
    try {
      chrome.runtime.sendMessage({ type: 'EMAIL_SIGNAL', items: items.slice(0, 80) }, r => {
        void chrome.runtime.lastError;
        if (r && r.changed) note('AppliedIn updated ' + r.changed + ' application' + (r.changed > 1 ? 's' : '') + ' from your inbox');
        else if (r && r.pending) note('AppliedIn found ' + r.pending + ' repl' + (r.pending > 1 ? 'ies' : 'y') + ' for a company with several roles — open the AppliedIn dashboard to pick the role');
      });
    } catch (e) {}
  }
  let t; const later = () => { clearTimeout(t); t = setTimeout(scan, 1500); };
  setTimeout(scan, 3000);
  new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', later);
})();
