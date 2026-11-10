// AppliedIn v1.1 — background service worker
// Single place that writes to the database for content scripts, keeps the per-tab "current job" draft,
// sends reminders, and (only if the user opts in) registers tracking on company career sites.
let LIBS_OK = true;
try { importScripts('lib/shared.js', 'lib/store.js'); } catch (e) { LIBS_OK = false; }

function failSafe() {
  // The helper files could not be loaded (usually right after the extension folder was replaced while Chrome was open).
  // Tell the user clearly, answer messages with an error instead of silence, and reload ONCE automatically.
  chrome.action.setBadgeText({ text: '!' }); chrome.action.setBadgeBackgroundColor({ color: '#DC2626' });
  chrome.action.setTitle({ title: 'AppliedIn could not start — click the reload icon on chrome://extensions' });
  chrome.runtime.onMessage.addListener((m, s, respond) => { respond({ saved: false, error: 'AppliedIn is not running. Open chrome://extensions and press the reload icon on AppliedIn.' }); return true; });
  chrome.storage.local.get('swReloadAt', r => {
    if (Date.now() - (r.swReloadAt || 0) > 120000) chrome.storage.local.set({ swReloadAt: Date.now() }, () => setTimeout(() => chrome.runtime.reload(), 2500));
  });
}

function main() {
  const Store = self.AppliedInStore;
  const DASHBOARD = 'dashboard/dashboard.html';
  const DRAFT_TTL = 30 * 60 * 1000;

  // Sites we never touch, even when the user enables "company career sites".
  const NEVER = ['mail.google.com', 'outlook.live.com', 'outlook.office.com', 'mail.yahoo.com', 'twitter.com', 'x.com', 'facebook.com',
    'instagram.com', 'reddit.com', 'discord.com', 'web.whatsapp.com', 'web.telegram.org', 'youtube.com', 'netflix.com', 'hotstar.com',
    'primevideo.com', 'spotify.com', 'amazon.in', 'amazon.com', 'flipkart.com', 'myntra.com', 'swiggy.com', 'zomato.com', 'sbi.co.in',
    'hdfcbank.com', 'icicibank.com', 'paytm.com', 'phonepe.com', 'google.com', 'bing.com', 'duckduckgo.com', 'timesofindia.com',
    'ndtv.com', 'thehindu.com', 'bbc.com', 'cnn.com', 'stackoverflow.com', 'leetcode.com', 'geeksforgeeks.org', 'udemy.com',
    'coursera.org', 'github.com', 'drive.google.com', 'slack.com', 'teams.microsoft.com', 'trello.com', 'notion.so',
    'appliedin.vercel.app', 'vercel.app', 'netlify.app', 'github.io', 'claude.ai', 'chatgpt.com'];
  const CAREERS_ID = 'appliedin-careers';

  // ───────────── error log (so problems are visible instead of swallowed) ─────────────
  async function errlog(where, e) {
    try {
      const r = await chrome.storage.local.get('errlog'), list = Array.isArray(r.errlog) ? r.errlog : [];
      list.unshift({ at: new Date().toISOString(), where, msg: String(e && e.message || e).slice(0, 300) });
      await chrome.storage.local.set({ errlog: list.slice(0, 30) });
    } catch (x) {}
  }
  self.addEventListener('unhandledrejection', ev => errlog('unhandled', ev.reason));
  self.addEventListener('error', ev => errlog('error', ev.message));
  async function debugInfo() {
    const all = await Store.getAll(), set = await Store.settings(), err = (await chrome.storage.local.get('errlog')).errlog || [];
    const perms = { careers: await chrome.permissions.contains({ origins: ['https://*/*'] }), gmail: await chrome.permissions.contains({ origins: ['https://mail.google.com/*'] }) };
    const last = all[0];
    return ['AppliedIn ' + chrome.runtime.getManifest().version, navigator.userAgent, 'Applications: ' + all.length + (last ? ' (newest: ' + last.company + ' at ' + last.date + ')' : ''),
      'Settings: ' + JSON.stringify(Object.assign({}, set)), 'Permissions: ' + JSON.stringify(perms), 'Recent errors: ' + (err.length ? '\n' + err.map(x => x.at + ' ' + x.where + ' ' + x.msg).join('\n') : 'none')].join('\n');
  }
  async function openDash(hash) {
    const url = chrome.runtime.getURL(DASHBOARD), tabs = await chrome.tabs.query({ url: url + '*' });
    if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true, url: url + hash }); chrome.windows.update(tabs[0].windowId, { focused: true }); } else chrome.tabs.create({ url: url + hash });
  }
  // Anything still writing to the OLD storage location (stale tabs, old copies) is pulled into the database automatically.
  chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.applications && Array.isArray(ch.applications.newValue) && ch.applications.newValue.length) Store.importLegacy().catch(e => errlog('legacy', e)); });

  // ───────────── per-tab state (survives redirects, new tabs and service-worker restarts) ─────────────
  async function getTab(id) { const k = 'tab_' + id; const r = await chrome.storage.session.get(k); return r[k] || {}; }
  async function setTab(id, patch) { const next = Object.assign(await getTab(id), patch); await chrome.storage.session.set({ ['tab_' + id]: next }); return next; }

  chrome.tabs.onRemoved.addListener(id => chrome.storage.session.remove('tab_' + id));
  chrome.tabs.onCreated.addListener(async tab => {
    // A new tab opened from an "Apply on company website" click inherits the job being applied for.
    if (!tab.openerTabId) return;
    const o = await getTab(tab.openerTabId);
    if (o.draft && o.armLevel > 0 && Date.now() - (o.armedAt || 0) < 10 * 60000)
      await setTab(tab.id, { draft: o.draft, armLevel: 1, armedAt: Date.now(), inherited: true });
  });

  // ───────────── messages ─────────────
  chrome.runtime.onMessage.addListener((msg, sender, respond) => {
    (async () => {
      const tabId = sender.tab && sender.tab.id;
      try {
        switch (msg && msg.type) {
          case 'SAVE_APP': {
            const d = msg.data || {};
            if (!d.resume) { const set0 = await Store.settings(); if (set0.defaultResume) d.resume = set0.defaultResume; }      // tag with the resume you are using now
            if (!d.company || !d.role) return respond({ saved: false, error: 'Company and role are required' });
            return respond(await Store.add(d, { force: !!msg.force }));
          }
          case 'PING': return respond({ ok: true, version: chrome.runtime.getManifest().version, count: (await Store.getAll()).length });
          case 'SELF_TEST': return respond(await Store.selfTest());
          case 'WEEKLY_NOW': { const set1 = await Store.settings(), w = Store.weeklyStats(await Store.getAll(), set1), m = weeklyMessage(w); notify('ai-week-' + Date.now(), m.title, m.message); return respond(w); }
          case 'GET_DEBUG': return respond(await debugInfo());
          case 'EXIT_DASH': {            // close the dashboard tab, then bring the quick popup back
          respond(true);
          const winId = msg.windowId, tabs = await chrome.tabs.query({ windowId: winId });
          if (tabs.length <= 1) await chrome.tabs.create({ windowId: winId, active: true });   // never close the whole window
          await chrome.tabs.remove(msg.tabId);
          setTimeout(() => { try { chrome.action.openPopup({ windowId: winId }).catch(() => {}); } catch (e) {} }, 350);
          return;
        }
        case 'OPEN_DASH': await openDash(msg.hash || '#overview'); return respond(true);
          case 'UPDATE_APP': return respond({ ok: await Store.update(msg.id, msg.changes || {}) });
          case 'DELETE_APP': return respond({ ok: await Store.remove(msg.id) });
          case 'GET_INDEX': return respond(await Store.index());
          case 'SYNC_STATUS': { const r = await Store.syncStatuses(msg.updates, 'portal'); return respond({ changed: r.changed }); }
          case 'EMAIL_SIGNAL': return respond(await handleEmails(msg.items || []));
          case 'SYNC_GMAIL': await syncGmail(); return respond(true);
          case 'TEST_NOTIFY': notify('ai-test-' + Date.now(), 'AppliedIn reminders work ✅', 'You will get a daily follow-up summary and interview reminders like this.'); return respond(true);
          case 'TAB_STATE': {
            if (tabId == null) return respond(null);
            const t = await getTab(tabId);
            if (t.draft && Date.now() - (t.draft._at || 0) > DRAFT_TTL) t.draft = null;
            return respond(t);
          }
          case 'DRAFT_SET': if (tabId != null) await setTab(tabId, { draft: Object.assign({}, msg.draft, { _at: Date.now() }) }); return respond(true);
          case 'DRAFT_CLEAR': if (tabId != null) await setTab(tabId, { draft: null }); return respond(true);
          case 'ARM': if (tabId != null) await setTab(tabId, { armLevel: msg.level || 1, armedAt: Date.now(), inherited: false, draft: msg.draft ? Object.assign({}, msg.draft, { _at: Date.now() }) : (await getTab(tabId)).draft || null }); return respond(true);
          case 'DISARM': if (tabId != null) await setTab(tabId, { armLevel: 0, armedAt: 0, draft: null, ask: null }); return respond(true);
          case 'ASK_SET': if (tabId != null) await setTab(tabId, { ask: msg.ask }); return respond(true);
          case 'ASK_CLEAR': if (tabId != null) await setTab(tabId, { ask: null }); return respond(true);
          case 'UI_FORWARD':
            if (tabId != null) chrome.tabs.sendMessage(tabId, { type: 'UI_SHOW', name: msg.name, payload: msg.payload }, { frameId: 0 }).catch(() => {});
            return respond(true);
          case 'SYNC_CAREERS': await syncCareers(); return respond(true);
          case 'RUN_MAINTENANCE': await runMaintenance(); return respond(true);
          default: return respond(null);
        }
      } catch (e) {
        errlog('message:' + (msg && msg.type), e);
        respond(msg && msg.type === 'SAVE_APP' ? { saved: false, error: String(e && e.message || e) } : null);
      }
    })();
    return true;
  });

  // ───────────── toolbar icon badge — OFF unless the user turns it on in Settings ─────────────
  async function updateBadge() {
    try {
      const set = await Store.settings(), mode = set.badgeMode || 'off';
      let text = '', color = '#1A56FF', title = 'AppliedIn';
      if (mode !== 'off') {
        const all = await Store.getAll();
        if (mode === 'interviews') {
          const n = Store.attention(all, set).soon.length;
          if (n) { text = String(n); color = '#7C3AED'; title = 'AppliedIn — ' + n + ' interview' + (n > 1 ? 's' : '') + ' soon'; }
        } else if (mode === 'today') {
          const start = new Date(); start.setHours(0, 0, 0, 0);
          const n = all.filter(a => a.status !== 'Saved' && Date.parse(a.date) >= start.getTime()).length;
          if (n) { text = n > 99 ? '99+' : String(n); title = 'AppliedIn — ' + n + ' applied today'; }
        }
      }
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color });
      await chrome.action.setTitle({ title });
    } catch (e) {}
  }
  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local') return;
    if (ch.__rev) { Store.invalidate(); updateBadge(); }
    if (ch.settings) { syncCareers(); syncGmail(); updateBadge(); }
  });

  // ───────────── reminders + auto "No Response" ─────────────
  function notify(id, title, message) {
    chrome.notifications.create(id, { type: 'basic', iconUrl: 'icons/icon128.png', title, message: message.slice(0, 200) });
  }
  const names = list => list.slice(0, 3).map(a => (a.starred ? '★ ' : '') + a.company).join(', ') + (list.length > 3 ? ' +' + (list.length - 3) + ' more' : '');
  const dayStr = d => d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  function weeklyMessage(w) {
    const d = w.applied - w.appliedPrev, trend = d > 0 ? 'up ' + d + ' on last week 🎉' : d < 0 ? 'down ' + (-d) + ' on last week' : 'same as last week';
    return { title: 'Your week in job hunting', message: 'Applied ' + w.applied + ' (' + trend + ') · Replies ' + w.replies + ' · Interviews ' + w.interviews + (w.offers ? ' · Offers ' + w.offers + ' 🎉' : '') +
      '. ' + (w.starredWaiting ? w.starredWaiting + ' ★ dream jobs waiting for a follow-up. ' : w.waiting + ' waiting for a reply. ') + (w.applied < w.goal / 2 ? 'A few more applications this week would help.' : 'Keep it up!') };
  }
  async function runMaintenance() {
    const s = await Store.settings();
    const r = await Store.maintenance(s);
    if (s.notifications) {
      if (r.interviews.length) notify('ai-interview-' + Date.now(), 'Interview coming up', names(r.interviews) + ' — good luck!');
      if (r.customDue.length) notify('ai-custom-' + Date.now(), 'Follow-up date reached', names(r.customDue));
      if (r.ghosted) notify('ai-ghost-' + Date.now(), r.ghosted + ' marked as No Response', 'No update for ' + s.ghostDays + '+ days. Change this in Settings.');
      // ONE friendly digest per day (after 9 am) instead of hundreds of separate alerts
      const now = new Date();
      if (s.weeklySummary !== false && now.getDay() === 0 && now.getHours() >= 9 && s.lastWeeklyKey !== dayStr(now)) {        // Sunday summary, once
        const wm = weeklyMessage(Store.weeklyStats(await Store.getAll(), s)); notify('ai-week-' + Date.now(), wm.title, wm.message);
        await Store.saveSettings({ lastWeeklyKey: dayStr(now) });
      }
      if (now.getHours() >= 9 && s.lastDigestDay !== dayStr(now)) {
        const att = Store.attention(await Store.getAll(), s);
        if (att.due.length) {
          notify('ai-followup-' + Date.now(), att.due.length + ' application' + (att.due.length > 1 ? 's' : '') + ' waiting for a reply', 'Oldest: ' + names(att.due) + '. Click to review and follow up.');
          await Store.saveSettings({ lastDigestDay: dayStr(now) });
        }
      }
    }
    updateBadge();
  }
  chrome.notifications.onClicked.addListener(async id => { await openDash('#followups'); chrome.notifications.clear(id); });

  // ───────────── optional selector updates (free static file on your own site; no personal data is sent) ─────────────
  function validateConfig(j) {
    if (!j || typeof j !== 'object' || typeof j.version !== 'number' || !j.portals || typeof j.portals !== 'object') return null;
    const out = { version: j.version, portals: {} };
    for (const id of Object.keys(j.portals)) {
      const cfg = j.portals[id];
      if (!/^[a-z]{2,20}$/.test(id) || !cfg || typeof cfg !== 'object') continue;
      out.portals[id] = {};
      ['company', 'role', 'location', 'salary', 'jd', 'success'].forEach(k => {
        if (Array.isArray(cfg[k])) out.portals[id][k] = cfg[k].filter(x => typeof x === 'string' && x.length < 200).slice(0, 15);
      });
    }
    return out;
  }
  async function fetchConfig() {
    try {
      const s = await Store.settings(); if (!s.remoteConfig) return;
      const r = await fetch('https://appliedin.vercel.app/selectors.json', { cache: 'no-cache' });
      if (!r.ok) return;
      const clean = validateConfig(await r.json());
      if (clean) await chrome.storage.local.set({ remoteConfig: clean });
    } catch (e) {}
  }

  // ───────────── opt-in tracking on any company career website ─────────────
  async function syncCareers() {
    try {
      const s = await Store.settings();
      const has = await chrome.permissions.contains({ origins: ['https://*/*'] });
      const reg = await chrome.scripting.getRegisteredContentScripts({ ids: [CAREERS_ID] }).catch(() => []);
      if (s.careerSites && has) {
        if (!reg.length) await chrome.scripting.registerContentScripts([{
          id: CAREERS_ID, matches: ['https://*/*'], excludeMatches: NEVER.map(d => 'https://*.' + d + '/*').concat(NEVER.map(d => 'https://' + d + '/*')),
          js: ['lib/shared.js', 'content/adapters.js', 'content/core.js'], runAt: 'document_idle', persistAcrossSessions: true
        }]);
      } else if (reg.length) {
        await chrome.scripting.unregisterContentScripts({ ids: [CAREERS_ID] });
      }
    } catch (e) {}
  }
  // ───────────── opt-in: detect company replies in the user's open Gmail tab (all matching happens locally) ─────────────
  const GMAIL_ID = 'appliedin-gmail';
  async function syncGmail() {
    try {
      const s = await Store.settings();
      const has = await chrome.permissions.contains({ origins: ['https://mail.google.com/*'] });
      const reg = await chrome.scripting.getRegisteredContentScripts({ ids: [GMAIL_ID] }).catch(() => []);
      if (s.gmailSync && has) {
        if (!reg.length) await chrome.scripting.registerContentScripts([{ id: GMAIL_ID, matches: ['https://mail.google.com/*'], js: ['content/gmail.js'], runAt: 'document_idle', persistAcrossSessions: true }]);
      } else if (reg.length) await chrome.scripting.unregisterContentScripts({ ids: [GMAIL_ID] });
    } catch (e) {}
  }
  async function handleEmails(items) {
    const s = await Store.settings(); if (!s.gmailSync) return { changed: 0, pending: 0 };
    const S2 = self.AppliedInShared, apps = await Store.index();      // cached slim list — no full database read per batch
    const st = await chrome.storage.local.get('emailSeen'), seen = new Set(Array.isArray(st.emailSeen) ? st.emailSeen : []);
    const updates = [], pend = [], done = [];
    for (const it of items) {
      if (!it || !it.id || seen.has(it.id)) continue;
      const c = S2.classifyEmail([it.subject, it.snippet, it.body].join(' '));
      if (!c.status) { done.push(it.id); continue; }
      const m = S2.matchEmail(apps, it, c.status);
      if (!m) continue;                          // not a company we applied to (or nothing to change) — look again next time
      if (m.app) updates.push({ id: m.app.id, status: c.status, reason: c.reason, subject: String(it.subject || '').slice(0, 90) });
      else pend.push({ id: it.id, from: String(it.fromName || it.fromEmail || '').slice(0, 60), subject: String(it.subject || '').slice(0, 120), status: c.status, reason: c.reason, candidates: m.candidates.map(a => a.id), at: new Date().toISOString() });
      done.push(it.id);
    }
    const r = updates.length ? await Store.syncStatuses(updates, 'email') : { changed: 0, names: [] };
    const added = pend.length ? await Store.addPending(pend) : 0;
    if (done.length) await chrome.storage.local.set({ emailSeen: Array.from(seen).concat(done).slice(-3000) });
    if (s.notifications) {
      if (r.changed) notify('ai-mail-' + Date.now(), r.changed + ' application' + (r.changed > 1 ? 's' : '') + ' updated from your inbox', names(r.names.map(c => ({ company: c }))));
      if (added) notify('ai-pend-' + Date.now(), added + ' repl' + (added > 1 ? 'ies need' : 'y needs') + ' your choice', 'A company has several roles from you — tell AppliedIn which one the email is about.');
    }
    return { changed: r.changed, pending: added };
  }
  chrome.permissions.onRemoved.addListener(() => { syncCareers(); syncGmail(); });

  // ───────────── lifecycle ─────────────
  async function boot() {
    await Store.ready(); await Store.importLegacy().catch(() => {});
    chrome.alarms.create('maintenance', { delayInMinutes: 0.5, periodInMinutes: 120 });   // re-created on every browser start so missed reminders fire soon after Chrome opens
    chrome.alarms.get('config', a => { if (!a) chrome.alarms.create('config', { delayInMinutes: 1, periodInMinutes: 1440 }); });
    syncCareers(); syncGmail(); updateBadge();
  }
  chrome.runtime.onInstalled.addListener(boot);
  chrome.runtime.onStartup.addListener(boot);
  chrome.alarms.onAlarm.addListener(a => { if (a.name === 'maintenance') runMaintenance(); if (a.name === 'config') fetchConfig(); });

}

if (LIBS_OK && self.AppliedInStore && self.AppliedInShared) main(); else failSafe();
