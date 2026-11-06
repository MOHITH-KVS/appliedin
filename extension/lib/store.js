// AppliedIn v1.1 — IndexedDB store. Every write is one atomic transaction on ONE record,
// so two tabs / popup / background can never overwrite each other's data again.
(function (g) {
  const S = g.AppliedInShared;
  const DB_NAME = 'appliedin_v2', STORE = 'applications';
  const DEFAULTS = {
    enabled: true, showTrackButton: true, badges: true, notifications: true,
    followUpDays: 7, ghostDays: 30, autoGhost: true, dailyGoal: 10, careerSites: false, remoteConfig: true,
    gmailSync: false, lastBackupAt: 0, lastDigestDay: '', badgeMode: 'off'
  };
  let dbp = null, mig = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
          st.createIndex('date', 'date'); st.createIndex('urlKey', 'urlKey');
        }
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => { dbp = null; rej(r.error); };
    });
    return dbp;
  }
  const P = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  async function run(mode, fn) {
    const db = await open();
    const t = db.transaction(STORE, mode);
    const done = new Promise((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    done.catch(() => {});
    try { const out = await fn(t.objectStore(STORE)); await done; return out; }
    catch (e) { try { t.abort(); } catch (_) {} throw e; }
  }
  function bump() { try { chrome.storage.local.set({ __rev: Date.now() }); } catch (e) {} }

  function build(d) {
    const now = new Date().toISOString();
    const url = d.url ? S.canonicalUrl(d.url) : '';
    const company = String(d.company || '').trim().slice(0, 120);
    const role = String(d.source === 'auto' ? S.cleanRole(d.role) : d.role || '').trim().slice(0, 160);
    const status = S.STATUSES.indexOf(d.status) >= 0 ? d.status : 'Applied';
    const date = d.date || now;
    return {
      company, role, location: String(d.location || '').slice(0, 120), salary: String(d.salary || '').slice(0, 80),
      jobType: d.jobType || '', workMode: d.workMode || '', platform: d.platform || 'Other',
      url, urlKey: url ? S.urlKey(url) : '', companyNorm: S.normCompany(company), roleNorm: S.normRole(role),
      status, date, lastStatusChange: d.lastStatusChange || date,
      notes: String(d.notes || '').slice(0, 2000), followUpDate: d.followUpDate || '', interviewDate: d.interviewDate || '',
      jd: String(d.jd || '').slice(0, 8000), source: d.source || 'manual',
      history: Array.isArray(d.history) && d.history.length ? d.history : [{ status, at: date }],
      lastReminded: d.lastReminded || 0, followUpNotified: !!d.followUpNotified, interviewNotified: !!d.interviewNotified,
      followUpDismissed: !!d.followUpDismissed, conf: d.conf || '', lastFollowUp: d.lastFollowUp || 0, snoozeUntil: d.snoozeUntil || 0, tabId: d.tabId || 0
    };
  }
  function slim(a) {
    return { id: a.id, company: a.company, role: a.role, status: a.status, date: a.date, platform: a.platform, url: a.url, urlKey: a.urlKey };
  }
  function locationsDiffer(a, b) {
    a = S.words(a); b = S.words(b);
    return !!(a && b && a !== b && a.indexOf(b) < 0 && b.indexOf(a) < 0);
  }
  // Two saves are the SAME application only if they clearly describe the same job:
  //  • the link carries a real job id AND the role or company also matches, or
  //  • same company + same role (+ same city when both have one) within 45 days.
  // A shared listing page URL, or the same role title at another company, is never a duplicate.
  function findDup(all, rec) {
    const win = 45 * 864e5, t = Date.parse(rec.date);
    for (const a of all) {
      const co = S.sameCompany(a.company, rec.company), ro = S.sameRole(a.role, rec.role);
      if (rec.urlKey && a.urlKey === rec.urlKey && (co || ro)) return { rec: a, reason: 'same job link' };
      if (co && ro && Math.abs(t - Date.parse(a.date)) < win && !locationsDiffer(a.location, rec.location)) return { rec: a, reason: 'same company and role' };
    }
    return null;
  }

  // Moves anything found in the OLD storage location (v1.0 / stale open tabs) into the database. Safe to run repeatedly.
  async function importLegacy() {
    const r = await chrome.storage.local.get(['applications', 'applications_backup_v1']);
    const old = Array.isArray(r.applications) ? r.applications : [];
    if (!old.length) { if (r.applications !== undefined) await chrome.storage.local.remove('applications'); return 0; }
    let n = 0;
    await run('readwrite', async st => {
      const all = await P(st.getAll());
      for (const a of old) {
        if (!a || !a.company || !a.role) continue;
        const rec = build(Object.assign({}, a, { source: a.source || 'legacy' }));
        if (all.some(x => x.company === rec.company && x.role === rec.role && x.date === rec.date)) continue;
        const id = await P(st.add(rec)); all.push(Object.assign({ id }, rec)); n++;
      }
    });
    const prev = Array.isArray(r.applications_backup_v1) ? r.applications_backup_v1 : [];
    await chrome.storage.local.set({ applications_backup_v1: prev.concat(old).slice(-3000), appliedin_migrated_v2: true });
    await chrome.storage.local.remove('applications');
    bump(); return n;
  }
  async function migrate() { return importLegacy(); }
  function ready() { return mig || (mig = migrate().catch(() => 0)); }

  const api = {
    ready, DEFAULTS, importLegacy,
    async getAll() { await ready(); const all = await run('readonly', st => P(st.getAll())); return all.sort((a, b) => Date.parse(b.date) - Date.parse(a.date)); },
    async get(id) { await ready(); return run('readonly', st => P(st.get(id))); },
    async index() { return (await api.getAll()).map(slim); },
    async add(d, opts) {
      await ready();
      const rec = build(d), force = !!(opts && opts.force);
      if (!rec.company || !rec.role) return { saved: false, error: 'Company and role are required' };
      const out = await run('readwrite', async st => {
        const all = await P(st.getAll());
        const hit = force ? null : findDup(all, rec), dup = hit && hit.rec;
        if (dup) {
          if (dup.status === 'Saved' && rec.status !== 'Saved') {
            const up = Object.assign({}, dup, { status: rec.status, date: rec.date, lastStatusChange: rec.date, jd: dup.jd || rec.jd,
              history: (dup.history || []).concat([{ status: rec.status, at: rec.date }]) });
            await P(st.put(up));
            return { saved: true, promoted: true, id: dup.id, total: all.length };
          }
          const rank = { high: 3, medium: 2, low: 1, '': 1 };
          if (hit.reason === 'same job link' && !S.sameCompany(dup.company, rec.company) && rank[rec.conf || ''] > rank[dup.conf || '']) {
            const up = Object.assign({}, dup, { company: rec.company, companyNorm: rec.companyNorm, role: rec.role, roleNorm: rec.roleNorm,
              location: rec.location || dup.location, salary: rec.salary || dup.salary, jd: dup.jd || rec.jd, conf: rec.conf });
            await P(st.put(up));
            return { saved: true, upgraded: true, id: dup.id, total: all.length };
          }
          return { saved: false, duplicate: true, reason: hit.reason, existing: slim(dup) };
        }
        const id = await P(st.add(rec));
        if (!(await P(st.get(id)))) throw new Error('Saved record could not be read back');   // never claim success without proof
        return { saved: true, id, total: all.length + 1 };
      });
      bump(); return out;
    },
    async update(id, ch) {
      await ready();
      const out = await run('readwrite', async st => {
        const cur = await P(st.get(id)); if (!cur) return false;
        const next = Object.assign({}, cur, ch);
        if (ch.company !== undefined) next.companyNorm = S.normCompany(next.company);
        if (ch.role !== undefined) next.roleNorm = S.normRole(next.role);
        if (ch.url !== undefined) { next.url = ch.url ? S.canonicalUrl(ch.url) : ''; next.urlKey = next.url ? S.urlKey(next.url) : ''; }
        if (ch.status && ch.status !== cur.status) {
          next.lastStatusChange = new Date().toISOString();
          next.history = (cur.history || []).concat([{ status: ch.status, at: next.lastStatusChange }]);
          next.followUpDismissed = false; next.lastReminded = 0;
        }
        if (ch.interviewDate !== undefined && ch.interviewDate !== cur.interviewDate) next.interviewNotified = false;
        if (ch.followUpDate !== undefined && ch.followUpDate !== cur.followUpDate) next.followUpNotified = false;
        await P(st.put(next)); return true;
      });
      bump(); return out;
    },
    async remove(id) { await ready(); await run('readwrite', st => P(st.delete(id))); bump(); return true; },
    async restore(rec) { await ready(); await run('readwrite', st => P(st.put(rec))); bump(); return true; },
    async bulkUpdate(ids, ch) { for (const id of ids) await api.update(id, ch); return true; },
    async bulkRemove(ids) { await ready(); await run('readwrite', async st => { for (const id of ids) await P(st.delete(id)); }); bump(); return true; },
    // Apply statuses read from a portal's "my applications" page. Only moves forward (or to Rejected).
    async syncStatuses(updates, source) {
      let changed = 0; const names = [];
      for (const u of updates || []) {
        const cur = await api.get(u.id); if (!cur || cur.status === u.status) continue;
        const curRank = S.RANK[cur.status] === undefined ? 1 : S.RANK[cur.status];
        const ok = u.status === 'Rejected' ? cur.status !== 'Offer' : S.RANK[u.status] > curRank;
        if (ok && await api.update(u.id, { status: u.status })) {
          changed++; names.push(cur.company);
          await api.logActivity({ id: cur.id, company: cur.company, role: cur.role, from: cur.status, to: u.status, source: source || 'portal', note: u.subject || u.reason || '' });
        }
      }
      return { changed, names };
    },
    // Every automatic change is written here so the user can see it and revert it.
    async logActivity(e) {
      const r = await chrome.storage.local.get('activity'); const list = Array.isArray(r.activity) ? r.activity : [];
      list.unshift(Object.assign({ at: new Date().toISOString() }, e));
      await chrome.storage.local.set({ activity: list.slice(0, 150) });
    },
    async activity() { const r = await chrome.storage.local.get('activity'); return Array.isArray(r.activity) ? r.activity : []; },
    async revertActivity(at) {
      const list = await api.activity(); const e = list.find(x => x.at === at); if (!e || e.reverted) return false;
      if (e.bulk) { for (const id of Object.keys(e.bulk)) { const c = await api.get(+id); if (c && c.status === e.to) await api.update(+id, { status: e.bulk[id] }); } e.reverted = true; await chrome.storage.local.set({ activity: list }); return true; }
      const cur = await api.get(e.id); if (!cur) return false;
      await api.update(e.id, { status: e.from });
      e.reverted = true; await chrome.storage.local.set({ activity: list }); return true;
    },
    // What needs the user's attention right now (pure — no writes).
    attention(all, s, now) {
      now = now || Date.now(); const day = 864e5, due = [], soon = [];
      for (const a of all) {
        if (a.status === 'Applied' || a.status === 'In Review') {
          const base = Math.max(Date.parse(a.lastStatusChange || a.date), a.lastFollowUp || 0);
          const age = (now - base) / day;
          if (age >= s.followUpDays && age < s.ghostDays && !a.followUpDismissed && (a.snoozeUntil || 0) < now) due.push(Object.assign(slim(a), { waiting: Math.floor(age) }));
        }
        if (a.interviewDate) { const t = Date.parse(a.interviewDate); if (t && t - now < 48 * 36e5 && t - now > -2 * 36e5) soon.push(slim(a)); }
        if (a.followUpDate && Date.parse(a.followUpDate) <= now && (a.lastFollowUp || 0) < Date.parse(a.followUpDate) && ['Applied', 'In Review', 'Shortlisted'].indexOf(a.status) >= 0) due.push(Object.assign(slim(a), { waiting: 0, custom: true }));
      }
      due.sort((x, y) => y.waiting - x.waiting);
      return { due, soon };
    },
    // Find the same job saved more than once (same link, or same role + same/similar company, or same role within minutes).
    async duplicates() {
      const suspect = r => r.conf === 'low' || S.normCompany(r.company) === S.normCompany(r.platform);
      const all = await api.getAll(), byRole = new Map();
      all.forEach(a => { const k = S.normRole(S.cleanRole(a.role)); if (k) (byRole.get(k) || byRole.set(k, []).get(k)).push(a); });
      const groups = [];
      byRole.forEach(list => {
        if (list.length < 2) return;
        const used = new Set();
        list.forEach((a, i) => {
          if (used.has(a.id)) return;
          const g = [a];
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j]; if (used.has(b.id)) continue;
            const dt = Math.abs(Date.parse(a.date) - Date.parse(b.date));
            if ((a.urlKey && a.urlKey === b.urlKey) || (S.sameCompany(a.company, b.company) && dt < 30 * 864e5) || (dt < 3 * 60000 && a.source !== 'manual' && b.source !== 'manual' && (suspect(a) || suspect(b)))) g.push(b);
          }
          if (g.length > 1) { g.forEach(x => used.add(x.id)); groups.push(g); }
        });
      });
      return groups;
    },
    async mergeGroup(group) {   // keeps the most informative record, removes the rest, returns removed records (for Undo)
      const rank = r => (S.RANK[r.status] || 0) * 10 + (r.conf === 'high' ? 3 : r.conf === 'medium' ? 2 : 0) + (r.url ? 1 : 0) + (r.notes ? 2 : 0);
      const sorted = group.slice().sort((a, b) => rank(b) - rank(a) || Date.parse(a.date) - Date.parse(b.date));
      const keep = sorted[0], drop = sorted.slice(1);
      const notes = [keep.notes].concat(drop.map(d => d.notes)).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join('\n');
      await api.update(keep.id, { notes, jd: keep.jd || (drop.find(d => d.jd) || {}).jd || '', url: keep.url || (drop.find(d => d.url) || {}).url || '' });
      await api.bulkRemove(drop.map(d => d.id));
      return drop;
    },
    async tidyTitles(apply) {
      const all = await api.getAll(), changes = [];
      all.forEach(a => { const c = S.cleanRole(a.role); if (c && c !== a.role) changes.push({ id: a.id, from: a.role, to: c }); });
      if (apply) for (const c of changes) await api.update(c.id, { role: c.to });
      return changes;
    },
    async exportAll() {
      const apps = (await api.getAll()).map(a => { const c = Object.assign({}, a); delete c.id; return c; });
      return { app: 'AppliedIn', schema: 2, exportedAt: new Date().toISOString(), applications: apps };
    },
    async importMany(list) {
      await ready();
      let added = 0, skipped = 0;
      await run('readwrite', async st => {
        const all = await P(st.getAll());
        for (const a of list || []) {
          const rec = build(Object.assign({}, a, { source: a.source || 'import' }));
          if (!rec.company || !rec.role) { skipped++; continue; }
          if (all.some(x => x.company === rec.company && x.role === rec.role && x.date === rec.date)) { skipped++; continue; }
          const id = await P(st.add(rec)); all.push(Object.assign({ id }, rec)); added++;
        }
      });
      bump(); return { added, skipped };
    },
    async settings() {
      const r = await chrome.storage.local.get('settings');
      return Object.assign({}, DEFAULTS, r.settings || {});
    },
    async saveSettings(p) {
      const cur = Object.assign(await api.settings(), p);
      await chrome.storage.local.set({ settings: cur });
      return cur;
    },
    // Housekeeping: automatic "No Response" and one-time interview / custom follow-up reminders.
    async maintenance(s) {
      await ready();
      const now = Date.now(), day = 864e5, out = { ghosted: 0, interviews: [], customDue: [] }, ghostMap = {};
      await run('readwrite', async st => {
        const all = await P(st.getAll());
        for (const a of all) {
          let ch = false;
          if ((a.status === 'Applied' || a.status === 'In Review') && s.autoGhost) {
            const base = Math.max(Date.parse(a.lastStatusChange || a.date), a.lastFollowUp || 0);
            if ((now - base) / day >= s.ghostDays) {
              a.status = 'No Response'; a.lastStatusChange = new Date().toISOString();
              a.history = (a.history || []).concat([{ status: 'No Response', at: a.lastStatusChange, auto: true }]);
              out.ghosted++; ch = true; ghostMap[a.id] = a.history[a.history.length - 2] ? a.history[a.history.length - 2].status : 'Applied';
            }
          }
          if (a.interviewDate && !a.interviewNotified) {
            const t = Date.parse(a.interviewDate);
            if (t && t - now < 24 * 36e5 && t - now > -2 * 36e5) { out.interviews.push(slim(a)); a.interviewNotified = true; ch = true; }
          }
          if (a.followUpDate && !a.followUpNotified && Date.parse(a.followUpDate) <= now) { out.customDue.push(slim(a)); a.followUpNotified = true; ch = true; }
          if (ch) await P(st.put(a));
        }
      });
      if (out.ghosted) await api.logActivity({ id: 0, company: out.ghosted + ' applications', role: '', from: 'Applied', to: 'No Response', source: 'auto', note: 'no update for ' + s.ghostDays + '+ days', bulk: ghostMap });
      bump(); return out;
    },
    // Quick health check used by Settings → Diagnostics (writes, reads back and removes a temporary record).
    async selfTest() {
      const steps = [];
      try {
        await ready(); steps.push(['Database opens', true]);
        const r = await api.add({ company: '__selftest__', role: 'Self test', source: 'selftest', status: 'Saved' }, { force: true });
        steps.push(['Can save a record', !!r.saved]);
        const back = r.id ? await api.get(r.id) : null; steps.push(['Can read it back', !!back]);
        if (r.id) await api.remove(r.id); steps.push(['Can delete it', r.id ? !(await api.get(r.id)) : false]);
        steps.push(['Total records now', (await api.getAll()).length]);
      } catch (e) { steps.push(['Error: ' + (e && e.message || e), false]); }
      return steps;
    }
  };
  g.AppliedInStore = api;
})(typeof self !== 'undefined' ? self : this);
