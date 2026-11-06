(function () {
  'use strict';
  const S = AppliedInShared, Store = AppliedInStore, U = AppliedInUI, h = U.h;
  const $ = id => document.getElementById(id);
  const DAY = 864e5;
  const VIEWS = [['overview', 'Overview', '⌂'], ['followups', 'Follow-ups', '⏰'], ['applications', 'Applications', '☰'], ['board', 'Board', '▥'], ['insights', 'Insights', '◔'], ['settings', 'Settings', '⚙']];
  const DEF_F = { q: '', status: 'all', portal: 'all', range: 'all', sort: 'date-desc', day: '' };
  const st = { apps: [], set: Store.DEFAULTS, activity: [], view: 'overview', f: Object.assign({}, DEF_F), page: 1, size: 25, sel: new Set(), qsel: new Set(), qlimit: 40, ins: '30', openId: null, bl: {}, bq: '', bstage: 'Applied', bchosen: false, bportal: 'all', bsort: 'date-desc', bselect: false };
  let snackT = null, lastFocus = null;

  // ───────── helpers ─────────
  const startToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const isoDay = x => { const d = new Date(x), p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
  const waiting = a => a.status === 'Applied' || a.status === 'In Review';
  const waitDays = a => Math.floor((Date.now() - Math.max(Date.parse(a.lastStatusChange || a.date), a.lastFollowUp || 0)) / DAY);
  const mailSearch = c => 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent('"' + c + '"');
  const real = () => st.apps.filter(a => a.status !== 'Saved');
  const hasReplied = a => S.RESPONDED.indexOf(a.status) >= 0 || (a.history || []).some(x => S.RESPONDED.indexOf(x.status) >= 0 && !x.auto);
  const reached = (a, list) => list.indexOf(a.status) >= 0 || (a.history || []).some(x => list.indexOf(x.status) >= 0);
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  function go(view, params) { location.hash = '#' + view + (params ? '?' + new URLSearchParams(params) : ''); }
  function snack(msg, label, fn) {
    const s = $('snack'); s.textContent = ''; s.hidden = false;
    s.appendChild(h('span', { text: msg }));
    if (label) s.appendChild(h('button', { type: 'button', text: label, onclick: () => { s.hidden = true; fn(); } }));
    clearTimeout(snackT); snackT = setTimeout(() => { s.hidden = true; }, 7000);
  }
  function statusSel(a) {
    const sel = h('select', { class: 'st s-' + U.slug(a.status), 'aria-label': 'Status for ' + a.company, onclick: e => e.stopPropagation(), onchange: async e => {
      const old = a.status, next = e.target.value;
      await Store.update(a.id, { status: next }); await load();
      snack(a.company + ' → ' + next, 'Undo', async () => { await Store.update(a.id, { status: old }); await load(); });
    } }, S.STATUSES.map(s => h('option', { value: s, text: s })));
    sel.value = a.status; return sel;
  }
  function dialog(title, body, buttons) {
    const dlg = h('dialog', { 'aria-label': title });
    const close = () => dlg.close();
    const foot = h('footer', null, buttons.map(b => h('button', { type: 'button', class: b.primary ? 'primary' : 'btn', onclick: async () => { const keep = b.onClick ? await b.onClick(dlg) : false; if (keep !== true) close(); } }, b.label)));
    dlg.append(h('div', { class: 'dlg' }, h('header', { text: title }), h('div', { class: 'body' }, body), foot));
    document.body.appendChild(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal(); return dlg;
  }
  const fld = (label, el) => h('label', { class: 'fld' }, h('span', { text: label }), el);
  const inp = (v, o) => { const e = h('input', Object.assign({ type: 'text' }, o || {})); e.value = v || ''; return e; };
  const toLocal = (iso, dateOnly) => {
    if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return ''; const p = n => String(n).padStart(2, '0');
    const day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); return dateOnly ? day : day + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  };
  const fromLocal = v => { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toISOString(); };

  // ───────── load / route / chrome ─────────
  async function load() {
    const y = window.scrollY;
    const r = await Promise.all([Store.getAll(), Store.settings(), Store.activity()]);
    st.apps = r[0]; st.set = r[1]; st.activity = r[2];
    const ids = new Set(st.apps.map(a => a.id)); st.sel.forEach(i => { if (!ids.has(i)) st.sel.delete(i); }); st.qsel.forEach(i => { if (!ids.has(i)) st.qsel.delete(i); });
    render(); window.scrollTo(0, y);
  }
  function route() {
    const raw = (location.hash || '#overview').slice(1).split('?'), view = VIEWS.some(v => v[0] === raw[0]) ? raw[0] : 'overview';
    const came = st.view; st.view = view;
    if (view === 'applications' && !raw[1] && came !== 'applications') { st.f = Object.assign({}, DEF_F); st.page = 1; st.sel.clear(); }
    if (view === 'applications' && raw[1]) { st.f = Object.assign({}, DEF_F, Object.fromEntries(new URLSearchParams(raw[1]))); st.page = 1; st.sel.clear(); }
    closeDrawer(); render(); window.scrollTo(0, 0);
  }
  function buildNav(att) {
    const nav = $('nav'); nav.textContent = '';
    VIEWS.forEach(v => {
      const need = v[0] === 'followups' ? att.due.length + att.soon.length : 0;
      nav.appendChild(h('a', { href: '#' + v[0], 'aria-current': st.view === v[0] ? 'page' : null }, h('span', { class: 'ic', 'aria-hidden': 'true', text: v[2] }), h('span', { class: 'tx', text: v[1] }), need ? h('span', { class: 'badge', role: 'img', 'aria-label': need + ' need attention', title: need + ' need attention' }) : null));
    });
  }
  function banners() {
    const b = $('banners'); b.textContent = '';
    const last = st.set.lastBackupAt || 0;
    if (st.apps.length >= 10 && Date.now() - last > 14 * DAY)
      b.appendChild(h('div', { class: 'banner', role: 'status' }, h('span', { text: '💾 ' + (last ? 'Your last backup was ' + Math.floor((Date.now() - last) / DAY) + ' days ago.' : 'You have never backed up your ' + st.apps.length + ' applications.') + ' Uninstalling the extension deletes them.' }), h('button', { type: 'button', text: 'Back up now', onclick: backup })));
  }
  function render() {
    const att = Store.attention(st.apps, st.set);
    buildNav(att); banners();
    $('viewTitle').textContent = (VIEWS.find(v => v[0] === st.view) || VIEWS[0])[1];
    document.title = $('viewTitle').textContent + ' — AppliedIn';
    const m = $('main'); m.textContent = '';
    ({ overview, followups, applications, board, insights, settings })[st.view](m, att);
  }

  // ───────── charts ─────────
  function bars(items, onClick) {
    const max = Math.max.apply(null, items.map(i => i.v).concat([1]));
    return h('div', { class: 'bars', role: 'list' }, items.map(i => h(onClick ? 'button' : 'div', { class: 'bar' + (i.today ? ' today' : ''), type: onClick ? 'button' : null, role: 'listitem', title: i.title, 'aria-label': i.title, onclick: onClick ? () => onClick(i) : null },
      h('span', { class: 'v', text: i.v || '' }), h('i', { style: 'height:' + Math.round(i.v / max * 100) + '%' }), h('span', { class: 'l', text: i.l || '' }))));
  }
  function lastDays(n, list) {
    const out = [], base = new Date(); base.setHours(0, 0, 0, 0);
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base); d.setDate(d.getDate() - i); const key = isoDay(d);
      const c = list.filter(a => isoDay(a.date) === key).length;
      out.push({ key, v: c, today: i === 0, title: d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) + ': ' + plural(c, 'application'), l: (n <= 14 || i % 5 === 0) ? d.getDate() + '' : '' });
    }
    return out;
  }

  // ───────── OVERVIEW ─────────
  function overview(m, att) {
    const r = real(), today = r.filter(a => Date.parse(a.date) >= startToday()).length, goal = st.set.dailyGoal || 10;
    const week = r.filter(a => Date.parse(a.date) >= Date.now() - 7 * DAY).length, rs = S.replyStats(st.apps);
    const hour = new Date().getHours(), hi = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening', stk = U.streak(st.apps);
    if (!st.apps.length) {
      m.appendChild(h('div', { class: 'panel empty' }, h('b', { text: 'Welcome to AppliedIn 👋' }), 'Apply to a job on LinkedIn, Naukri or Internshala and it appears here automatically. Or add one yourself.', h('div', { style: 'margin-top:14px' }, h('button', { class: 'primary', type: 'button', text: '+ Add your first job', onclick: addJob })))); return;
    }
    m.appendChild(h('p', { class: 'muted', style: 'margin:0 0 14px', text: hi + '. ' + (today >= goal ? 'Daily goal reached 🎉 ' : 'You have applied to ' + today + ' of ' + goal + ' today. ') + (att.due.length ? plural(att.due.length, 'application') + ' waiting for a reply.' : 'Nothing is overdue.') + (stk > 1 ? ' 🔥 ' + stk + '-day streak.' : '') }));
    const kpi = (attrs, big, label, small, extra) => h('a', Object.assign({ class: 'kpi' + (attrs.warn ? ' warn' : '') }, attrs.a), h('b', { text: big }), h('span', { text: label }), small ? h('small', { text: small }) : null, extra);
    m.appendChild(h('div', { class: 'kpis' },
      kpi({ a: { href: '#applications?range=today' } }, today, 'Applied today', 'Goal: ' + goal, h('div', { class: 'meter' + (today >= goal ? ' done' : '') }, h('i', { style: 'width:' + Math.min(100, Math.round(today / goal * 100)) + '%' }))),
      kpi({ a: { href: '#applications?range=7' } }, week, 'Last 7 days', plural(r.length, 'application') + ' in total'),
      kpi({ a: { href: '#insights' } }, rs.replied, 'Replies', rs.eligible >= 10 ? rs.rate + '% of ' + rs.eligible + ' older than a week' : 'Needs 10+ applications older than a week'),
      kpi({ a: { href: '#followups' }, warn: att.due.length > 0 }, att.due.length, 'Waiting for a reply', att.soon.length ? plural(att.soon.length, 'interview') + ' soon' : 'Follow up after ' + st.set.followUpDays + ' days'),
      kpi({ a: { href: '#applications?status=Interview' } }, r.filter(a => a.status === 'Interview').length, 'In interview stage', r.filter(a => a.status === 'Offer').length + ' offers')));

    const trend = h('div', { class: 'panel' }, h('h2', { text: 'Applications, last 30 days' }), h('p', { class: 'sub', text: 'Click a bar to see that day’s applications.' }),
      bars(lastDays(30, r), i => { if (i.v) go('applications', { day: i.key }); }));
    const need = h('div', { class: 'panel' }, h('h2', { text: 'Needs your attention' }), h('p', { class: 'sub', text: 'Oldest first. Open Follow-ups to act on all of them.' }));
    att.soon.forEach(a => need.appendChild(h('div', { class: 'act-row' }, h('span', { 'aria-hidden': 'true', text: '🎯' }), h('div', { class: 'grow' }, h('b', { text: a.company }), h('small', { text: 'Interview soon — ' + a.role })))));
    att.due.slice(0, 5).forEach(a => need.appendChild(h('div', { class: 'act-row' }, h('span', { 'aria-hidden': 'true', text: '⏰' }), h('div', { class: 'grow' }, h('b', { text: a.company }), h('small', { text: a.role + ' · waiting ' + a.waiting + ' days' })))));
    if (!att.soon.length && !att.due.length) need.appendChild(h('div', { class: 'empty', text: 'All caught up. Nothing is waiting.' }));
    else need.appendChild(h('button', { class: 'link', type: 'button', style: 'margin-top:10px', text: 'Open follow-ups (' + (att.due.length + att.soon.length) + ') ›', onclick: () => go('followups') }));
    m.appendChild(h('div', { class: 'grid2' }, trend, need));

    const act = h('div', { class: 'panel' }, h('h2', { text: 'Automatic updates' }), h('p', { class: 'sub', text: 'Every change AppliedIn makes on its own is listed here, so you can check it and undo it.' }));
    const recent = st.activity.slice(0, 6);
    if (!recent.length) act.appendChild(h('div', { class: 'empty' }, h('b', { text: 'No automatic updates yet' }), st.set.gmailSync ? 'Waiting for replies in your Gmail.' : 'Turn on reply detection in Settings so statuses update themselves.', h('div', { style: 'margin-top:8px' }, st.set.gmailSync ? null : h('button', { class: 'link', type: 'button', text: 'Open settings ›', onclick: () => go('settings') }))));
    recent.forEach(e => act.appendChild(h('div', { class: 'act-row' },
      h('div', { class: 'grow' }, h('b', { text: e.company }), h('small', { text: e.from + ' → ' + e.to + ' · ' + ({ email: 'from Gmail', portal: 'from portal page', auto: 'automatic' }[e.source] || e.source) + ' · ' + U.fmtDate(e.at) + (e.note ? ' · “' + String(e.note).slice(0, 50) + '”' : '') })),
      e.reverted ? h('small', { text: 'Reverted' }) : h('button', { class: 'btn', type: 'button', text: 'Revert', onclick: async () => { await Store.revertActivity(e.at); await load(); snack('Reverted ' + e.company + ' to ' + e.from); } }))));

    const last = st.set.lastBackupAt || 0, items = [
      [Date.now() - last < 14 * DAY, 'Back up your data', last ? 'Last backup ' + U.fmtDate(new Date(last).toISOString()) : 'Never backed up', 'Back up', backup],
      [!!st.set.gmailSync, 'Detect replies from Gmail', 'Moves applications to Interview / Rejected for you', 'Set up', () => go('settings')],
      [!!st.set.notifications, 'Desktop reminders', 'Daily follow-up summary and interview alerts', 'Send test', () => { chrome.runtime.sendMessage({ type: 'TEST_NOTIFY' }); snack('Test sent — if nothing appears, allow Chrome notifications in your system settings'); }]
    ];
    const list = h('div', { class: 'panel' }, h('h2', { text: 'Get the most out of AppliedIn' }), h('p', { class: 'sub', text: 'Three things that save you the most manual work.' }));
    items.forEach(i => list.appendChild(h('div', { class: 'check' + (i[0] ? ' done' : '') }, h('span', { class: 'dot', 'aria-hidden': 'true', text: i[0] ? '✓' : '' }), h('div', { style: 'flex:1;min-width:0' }, h('b', { text: i[1] }), h('div', { class: 'muted', style: 'font-size:13px', text: i[2] })), h('button', { class: 'btn', type: 'button', text: i[3], onclick: i[4] }))));
    m.appendChild(h('div', { class: 'grid2' }, act, list));
  }

  // ───────── FOLLOW-UPS ─────────
  async function bulkTouch(ids, patch, msg) {
    await Promise.all(ids.map(id => Store.update(id, patch))); st.qsel.clear(); await load(); snack(msg);
  }
  function followups(m, att) {
    if (att.soon.length) {
      const p = h('div', { class: 'panel', style: 'margin-bottom:16px' }, h('h2', { text: 'Interviews in the next 48 hours' }));
      att.soon.forEach(a => p.appendChild(h('div', { class: 'act-row' }, h('div', { class: 'grow' }, h('b', { text: a.company }), h('small', { text: a.role })), h('button', { class: 'btn', type: 'button', text: 'Open', onclick: () => openDrawer(a.id) }))));
      m.appendChild(p);
    }
    const p = h('div', { class: 'panel' });
    p.appendChild(h('h2', { text: 'Waiting for a reply (' + att.due.length + ')' }));
    p.appendChild(h('p', { class: 'sub', text: 'Applied ' + st.set.followUpDays + '+ days ago with no change. Send a short follow-up email, then press “Followed up” — it comes back after ' + st.set.followUpDays + ' more days.' }));
    if (!att.due.length) { p.appendChild(h('div', { class: 'empty' }, h('b', { text: 'Nothing waiting 🎉' }), 'Applications show up here once they are ' + st.set.followUpDays + ' days old with no reply.')); m.appendChild(p); return; }
    const all = h('input', { type: 'checkbox', id: 'qall', 'aria-label': 'Select all' });
    const shown = att.due.slice(0, st.qlimit);
    all.checked = shown.length > 0 && shown.every(a => st.qsel.has(a.id));
    all.addEventListener('change', () => { shown.forEach(a => all.checked ? st.qsel.add(a.id) : st.qsel.delete(a.id)); render(); });
    const n = st.qsel.size, ids = () => Array.from(st.qsel);
    p.appendChild(h('div', { class: 'toolbar' }, h('label', { style: 'display:flex;gap:8px;align-items:center' }, all, 'Select all'),
      h('button', { class: 'btn', type: 'button', disabled: !n, text: 'Followed up', onclick: () => bulkTouch(ids(), { lastFollowUp: Date.now() }, plural(n, 'application') + ' marked as followed up') }),
      h('button', { class: 'btn', type: 'button', disabled: !n, text: 'Snooze 3 days', onclick: () => bulkTouch(ids(), { snoozeUntil: Date.now() + 3 * DAY }, 'Snoozed for 3 days') }),
      h('button', { class: 'btn', type: 'button', disabled: !n, text: 'Mark No Response', onclick: () => bulkStatus(ids(), 'No Response') }),
      h('span', { class: 'muted', text: n ? n + ' selected' : '' })));
    shown.forEach(a => {
      const rec = st.apps.find(x => x.id === a.id) || a, cb = h('input', { type: 'checkbox', 'aria-label': 'Select ' + a.company, onchange: e => { e.target.checked ? st.qsel.add(a.id) : st.qsel.delete(a.id); render(); } });
      cb.checked = st.qsel.has(a.id);
      const reply = h('select', { 'aria-label': 'Record a reply from ' + a.company, onchange: async e => { if (!e.target.value) return; await Store.update(a.id, { status: e.target.value }); await load(); snack(a.company + ' → ' + e.target.value); } },
        h('option', { value: '', text: 'Got a reply…' }), ['Shortlisted', 'Interview', 'Offer', 'Rejected', 'No Response'].map(s => h('option', { value: s, text: s })));
      p.appendChild(h('div', { class: 'q' }, cb,
        h('div', null, h('div', { class: 'co', text: a.company }), h('div', { class: 'ro', text: a.role }), h('div', { class: 'muted', style: 'font-size:12px', text: (a.custom ? 'Your follow-up date has arrived · ' : 'Waiting ' + a.waiting + ' days · ') + (rec.platform || 'Other') })),
        h('div', { class: 'acts' },
          h('button', { type: 'button', text: 'Followed up', onclick: async () => { await Store.update(a.id, { lastFollowUp: Date.now() }); await load(); snack('Marked as followed up', 'Undo', async () => { await Store.update(a.id, { lastFollowUp: 0 }); await load(); }); } }),
          h('button', { type: 'button', text: 'Snooze 3d', onclick: async () => { await Store.update(a.id, { snoozeUntil: Date.now() + 3 * DAY }); await load(); } }),
          reply, h('a', { class: 'btn', style: 'text-decoration:none;padding:6px 10px;font-size:13px;border-radius:8px', href: mailSearch(a.company), target: '_blank', rel: 'noopener noreferrer', text: 'Search email' }),
          h('button', { type: 'button', text: 'Details', onclick: () => openDrawer(a.id) }))));
    });
    if (att.due.length > st.qlimit) p.appendChild(h('button', { class: 'more', type: 'button', text: 'Show more (' + (att.due.length - st.qlimit) + ' left)', onclick: () => { st.qlimit += 40; render(); } }));
    m.appendChild(p);
  }

  // ───────── APPLICATIONS ─────────
  function filtered(skipStatus) {
    const f = st.f, t = f.q.trim().toLowerCase();
    const list = st.apps.filter(a => {
      if (!skipStatus && f.status !== 'all' && a.status !== f.status) return false;
      if (f.portal !== 'all' && (a.platform || 'Other') !== f.portal) return false;
      if (f.range !== 'all' && Date.parse(a.date) < (f.range === 'today' ? startToday() : Date.now() - (+f.range) * DAY)) return false;
      if (f.day && isoDay(a.date) !== f.day) return false;
      return !t || (a.company + ' ' + a.role + ' ' + (a.platform || '') + ' ' + (a.location || '') + ' ' + (a.notes || '')).toLowerCase().indexOf(t) >= 0;
    });
    const by = {
      'date-desc': (a, b) => Date.parse(b.date) - Date.parse(a.date), 'date-asc': (a, b) => Date.parse(a.date) - Date.parse(b.date),
      'company': (a, b) => a.company.localeCompare(b.company), 'status': (a, b) => S.STATUSES.indexOf(a.status) - S.STATUSES.indexOf(b.status),
      'waiting': (a, b) => (waiting(b) ? waitDays(b) : -1) - (waiting(a) ? waitDays(a) : -1)
    };
    return list.sort(by[f.sort] || by['date-desc']);
  }
  async function bulkStatus(ids, status) {
    const old = ids.map(id => [id, (st.apps.find(a => a.id === id) || {}).status]);
    await Store.bulkUpdate(ids, { status }); st.sel.clear(); st.qsel.clear(); await load();
    snack(plural(ids.length, 'application') + ' moved to ' + status, 'Undo', async () => { for (const o of old) if (o[1]) await Store.update(o[0], { status: o[1] }); await load(); });
  }
  async function deleteIds(ids) {
    const recs = ids.map(id => st.apps.find(a => a.id === id)).filter(Boolean);
    await Store.bulkRemove(ids); st.sel.clear(); closeDrawer(); await load();
    snack('Deleted ' + plural(recs.length, 'application'), 'Undo', async () => { for (const r of recs) await Store.restore(r); await load(); });
  }
  function appRow(a, onSel) {
    const w = waiting(a) ? waitDays(a) : null, due = w !== null && w >= st.set.followUpDays;
    const cb = h('input', { type: 'checkbox', 'aria-label': 'Select ' + a.company + ', ' + a.role, onchange: e => { e.target.checked ? st.sel.add(a.id) : st.sel.delete(a.id); li.classList.toggle('sel', e.target.checked); onSel(); } });
    cb.checked = st.sel.has(a.id);
    const li = h('li', { class: 'row' + (cb.checked ? ' sel' : '') }, cb,
      h('div', { class: 'main' }, h('button', { type: 'button', 'aria-label': 'Open details: ' + a.company + ', ' + a.role, onclick: () => openDrawer(a.id) },
        h('div', { class: 'co', text: a.company }), h('div', { class: 'ro', text: a.role }),
        h('div', { class: 'meta' }, [a.platform || 'Other', U.fmtDate(a.date)].join(' · '), due ? h('span', { class: 'due', text: ' · waiting ' + w + 'd' }) : null))),
      h('div', { class: 'portal', text: a.platform || 'Other' }), h('div', { class: 'when', text: U.fmtDate(a.date) }), h('div', { class: 'wait' + (due ? ' due' : ''), text: w !== null ? w + 'd' : '–' }),
      statusSel(a), h('div', { class: 'ract' },
        h('button', { class: 'iconbtn', type: 'button', title: 'Edit', 'aria-label': 'Edit ' + a.company, text: '✎', onclick: () => openDrawer(a.id) }),
        h('button', { class: 'iconbtn del', type: 'button', title: 'Delete', 'aria-label': 'Delete ' + a.company, text: '🗑', onclick: () => deleteIds([a.id]) })));
    return li;
  }
  function applications(m) {
    const f = st.f, list = filtered(false), pages = Math.max(1, Math.ceil(list.length / st.size));
    if (st.page > pages) st.page = pages;
    const upd = (k, v) => { st.f[k] = v; st.page = 1; st.sel.clear(); render(); };
    const portals = Array.from(new Set(st.apps.map(a => a.platform || 'Other'))).sort();
    const search = h('input', { type: 'search', placeholder: 'Search company, role, notes…  ( / )', 'aria-label': 'Search applications', id: 'q' }); search.value = f.q;
    let timer; search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.f.q = search.value; st.page = 1; const pos = search.selectionStart; render(); const s2 = $('q'); if (s2) { s2.focus(); s2.setSelectionRange(pos, pos); } }, 250); });
    const sel = (aria, key, opts) => { const s = h('select', { 'aria-label': aria, onchange: e => upd(key, e.target.value) }, opts.map(o => h('option', { value: o[0], text: o[1] }))); s.value = f[key]; return s; };
    m.appendChild(h('div', { class: 'toolbar' }, search,
      sel('Portal', 'portal', [['all', 'All portals']].concat(portals.map(p => [p, p]))),
      sel('Date range', 'range', [['all', 'Any date'], ['today', 'Today'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']]),
      sel('Sort by', 'sort', [['date-desc', 'Newest first'], ['date-asc', 'Oldest first'], ['waiting', 'Waiting longest'], ['company', 'Company A–Z'], ['status', 'Status']])));
    const base = filtered(true), chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Filter by status' });
    [['all', 'All']].concat(S.STATUSES.map(s => [s, s])).forEach(c => {
      const n = c[0] === 'all' ? base.length : base.filter(a => a.status === c[0]).length;
      if (c[0] !== 'all' && !n && f.status !== c[0]) return;
      chips.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(f.status === c[0]), text: c[1] + ' ' + n, onclick: () => upd('status', c[0]) }));
    });
    if (f.day) chips.appendChild(h('button', { class: 'chip day', type: 'button', text: 'Day: ' + new Date(f.day + 'T00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + ' ✕', onclick: () => upd('day', '') }));
    m.appendChild(chips);
    if (!list.length) { m.appendChild(h('div', { class: 'panel empty' }, h('b', { text: st.apps.length ? 'No applications match these filters' : 'No applications yet' }), st.apps.length ? h('button', { class: 'link', type: 'button', text: 'Clear all filters', onclick: () => { st.f = Object.assign({}, DEF_F); st.page = 1; render(); } }) : 'They appear automatically when you apply.')); return; }
    const pageItems = list.slice((st.page - 1) * st.size, st.page * st.size);
    const bulkHost = h('div', { id: 'bulkhost' });
    const refreshBulk = () => { bulkHost.textContent = ''; const n = st.sel.size; if (!n) return; const ids = () => Array.from(st.sel);
      const mv = h('select', { 'aria-label': 'Move selected to status', onchange: e => { if (e.target.value) bulkStatus(ids(), e.target.value); } }, h('option', { value: '', text: 'Move to…' }), S.STATUSES.map(s => h('option', { value: s, text: s })));
      bulkHost.appendChild(h('div', { class: 'bulk', role: 'region', 'aria-label': 'Bulk actions' }, h('b', { text: n + ' selected' }),
        n < list.length ? h('button', { type: 'button', text: 'Select all ' + list.length, onclick: () => { list.forEach(a => st.sel.add(a.id)); render(); } }) : null, mv,
        h('button', { type: 'button', text: 'Mark No Response', onclick: () => bulkStatus(ids(), 'No Response') }),
        h('button', { type: 'button', text: 'Delete', onclick: () => deleteIds(ids()) }), h('button', { class: 'x', type: 'button', text: 'Clear', onclick: () => { st.sel.clear(); render(); } }))); };
    const all = h('input', { type: 'checkbox', 'aria-label': 'Select all on this page', onchange: e => { pageItems.forEach(a => e.target.checked ? st.sel.add(a.id) : st.sel.delete(a.id)); render(); } });
    all.checked = pageItems.length > 0 && pageItems.every(a => st.sel.has(a.id));
    const th = (t, key) => h('div', null, h('button', { type: 'button', text: t, onclick: () => upd('sort', key) }));
    const ul = h('ul', { class: 'rows' }, h('li', { class: 'rhead' }, all, th('Company / role', 'company'), h('div', { class: 'hide-m', text: 'Portal' }), h('div', { class: 'hide-m' }, h('button', { type: 'button', text: 'Applied', onclick: () => upd('sort', f.sort === 'date-desc' ? 'date-asc' : 'date-desc') })), h('div', { class: 'hide-m' }, h('button', { type: 'button', text: 'Waiting', onclick: () => upd('sort', 'waiting') })), th('Status', 'status'), h('div', { class: 'hide-m' })));
    pageItems.forEach(a => ul.appendChild(appRow(a, () => { refreshBulk(); all.checked = pageItems.every(x => st.sel.has(x.id)); })));
    m.appendChild(ul);
    const size = h('select', { 'aria-label': 'Rows per page', onchange: e => { st.size = +e.target.value; st.page = 1; render(); } }, [25, 50, 100].map(n => h('option', { value: n, text: n + ' per page' }))); size.value = st.size;
    m.appendChild(h('div', { class: 'pager' }, h('span', { text: 'Showing ' + ((st.page - 1) * st.size + 1) + '–' + Math.min(list.length, st.page * st.size) + ' of ' + list.length }),
      h('div', { style: 'display:flex;gap:8px;align-items:center' }, size,
        h('button', { class: 'btn', type: 'button', disabled: st.page <= 1, text: '‹ Prev', onclick: () => { st.page--; render(); window.scrollTo(0, 0); } }),
        h('span', { text: 'Page ' + st.page + ' / ' + pages }),
        h('button', { class: 'btn', type: 'button', disabled: st.page >= pages, text: 'Next ›', onclick: () => { st.page++; render(); window.scrollTo(0, 0); } }))));
    refreshBulk(); m.appendChild(bulkHost);
  }

  // ───────── BOARD: pipeline strip + one focused stage ─────────
  const PIPE = ['Saved', 'Applied', 'In Review', 'Shortlisted', 'Interview', 'Offer'], CLOSED = ['Rejected', 'No Response'];
  const STAGE_NOTE = {
    'Saved': 'Jobs you bookmarked to apply to later.', 'Applied': 'Sent — waiting to hear back.', 'In Review': 'The company has looked at your application.',
    'Shortlisted': 'You passed a first filter. Prepare for the next round.', 'Interview': 'Interviews and assessments in progress.',
    'Offer': 'Congratulations! Review the offer and decide.', 'Rejected': 'Not this time — keep going.', 'No Response': 'No reply after a long wait. If they get in touch, move the card back to Applied.'
  };
  const hue = s => { let x = 0; String(s).split('').forEach(c => { x = (x * 31 + c.charCodeAt(0)) % 360; }); return x; };
  const avatar = n => h('span', { class: 'av', 'aria-hidden': 'true', style: '--h:' + hue(n), text: (String(n).trim()[0] || '?').toUpperCase() });
  const closeMenus = () => document.querySelectorAll('.mv-menu').forEach(x => { x.hidden = true; });

  function moveMenu(a) {
    const btn = h('button', { class: 'iconbtn', type: 'button', 'aria-haspopup': 'menu', title: 'Move to another stage', 'aria-label': 'Move ' + a.company + ' to another stage', text: '⇄' });
    const menu = h('div', { class: 'mv-menu', role: 'menu', hidden: true }, S.STATUSES.map(s => h('button', { type: 'button', role: 'menuitem', class: 'mi s-' + U.slug(s), disabled: s === a.status, onclick: e => { e.stopPropagation(); closeMenus(); bulkStatus([a.id], s); } }, h('i', { class: 'dot' }), s + (s === a.status ? '  ✓' : ''))));
    btn.onclick = e => { e.stopPropagation(); const was = !menu.hidden; closeMenus(); menu.hidden = was; };
    return h('div', { class: 'mv' }, btn, menu);
  }
  function bcard(a) {
    const w = waiting(a) ? waitDays(a) : null, overdue = w !== null && w >= st.set.followUpDays;
    const cb = st.bselect ? h('input', { type: 'checkbox', class: 'bc-cb', 'aria-label': 'Select ' + a.company, onclick: e => e.stopPropagation(), onchange: e => { e.target.checked ? st.sel.add(a.id) : st.sel.delete(a.id); card.classList.toggle('sel', e.target.checked); renderBulk(); } }) : null;
    if (cb) cb.checked = st.sel.has(a.id);
    const chips = [a.platform, a.workMode, a.location].filter(Boolean).slice(0, 3);
    const when = a.status === 'Interview' && a.interviewDate ? '🎯 ' + new Date(a.interviewDate).toLocaleString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
      : w !== null ? (overdue ? 'Follow up · ' : 'Waiting ') + w + 'd' : 'Applied ' + U.fmtDate(a.date);
    const card = h('article', { class: 'bc' + (st.sel.has(a.id) ? ' sel' : ''), draggable: 'true', tabindex: '0', 'aria-label': a.company + ', ' + a.role + ', ' + a.status,
      ondragstart: e => { e.dataTransfer.setData('text/plain', String(a.id)); e.dataTransfer.effectAllowed = 'move'; card.classList.add('drag'); document.body.classList.add('dragging'); },
      ondragend: () => { card.classList.remove('drag'); document.body.classList.remove('dragging'); },
      onclick: () => { if (st.bselect) { cb.click(); } else openDrawer(a.id); },
      onkeydown: e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); st.bselect ? cb.click() : openDrawer(a.id); } } },
      h('div', { class: 'bc-top' }, cb, avatar(a.company), h('div', { class: 'bc-t' }, h('div', { class: 'bc-co', text: a.company }), h('div', { class: 'bc-ro', text: a.role }))),
      chips.length ? h('div', { class: 'bc-chips' }, chips.map(t => h('span', { class: 'chip-s', text: t }))) : null,
      h('div', { class: 'bc-foot' }, h('span', { class: 'age' + (overdue ? ' warn' : '') }, w !== null ? h('i', { class: 'pulse' }) : null, when),
        h('div', { class: 'bc-acts', onclick: e => e.stopPropagation() }, moveMenu(a),
          a.url ? h('a', { class: 'iconbtn', href: a.url, target: '_blank', rel: 'noopener noreferrer', title: 'Open job posting', 'aria-label': 'Open job posting for ' + a.company, text: '↗' }) : null,
          h('button', { class: 'iconbtn del', type: 'button', title: 'Delete', 'aria-label': 'Delete ' + a.company, text: '🗑', onclick: () => deleteIds([a.id]) }))));
    return card;
  }
  function tile(s, count, total) {
    const on = st.bstage === s;
    const t = h('button', { class: 'tile s-' + U.slug(s) + (on ? ' on' : ''), type: 'button', 'aria-pressed': String(on), 'aria-label': s + ': ' + count,
      onclick: () => { st.bstage = s; st.bchosen = true; st.bl = {}; render(); },
      ondragover: e => { e.preventDefault(); t.classList.add('over'); }, ondragleave: () => t.classList.remove('over'),
      ondrop: e => { e.preventDefault(); t.classList.remove('over'); const id = parseInt(e.dataTransfer.getData('text/plain'), 10); if (id) bulkStatus([id], s); } },
      h('span', { class: 'tl' }, h('i', { class: 'dot' }), s), h('b', { text: count }), h('span', { class: 'share' }, h('i', { style: 'width:' + (total && count ? Math.max(5, Math.round(count / total * 100)) : 0) + '%' })));
    return t;
  }
  let bulkHostEl = null;
  function renderBulk() {
    if (!bulkHostEl) return; bulkHostEl.textContent = ''; const n = st.sel.size; if (!n) return;
    const ids = () => Array.from(st.sel);
    const mv = h('select', { 'aria-label': 'Move selected to stage', onchange: e => { if (e.target.value) bulkStatus(ids(), e.target.value); } }, h('option', { value: '', text: 'Move to…' }), S.STATUSES.map(s => h('option', { value: s, text: s })));
    bulkHostEl.appendChild(h('div', { class: 'bulk', role: 'region', 'aria-label': 'Bulk actions' }, h('b', { text: n + ' selected' }), mv,
      h('button', { type: 'button', text: 'Delete', onclick: () => deleteIds(ids()) }), h('button', { class: 'x', type: 'button', text: 'Clear', onclick: () => { st.sel.clear(); render(); } })));
  }
  function board(m) {
    const t = st.bq.trim().toLowerCase();
    const base = st.apps.filter(a => (!t || (a.company + ' ' + a.role).toLowerCase().indexOf(t) >= 0) && (st.bportal === 'all' || (a.platform || 'Other') === st.bportal));
    const counts = {}; S.STATUSES.forEach(s => { counts[s] = base.filter(a => a.status === s).length; });
    if (!st.bchosen && !counts[st.bstage]) { const first = S.STATUSES.filter(s => counts[s])[0]; if (first) st.bstage = first; }

    // toolbar
    const search = h('input', { type: 'search', id: 'bq', placeholder: 'Search the board…', 'aria-label': 'Search the board' }); search.value = st.bq;
    let timer; search.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => { st.bq = search.value; st.bl = {}; render(); const s2 = $('bq'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } }, 250); });
    const portals = Array.from(new Set(st.apps.map(a => a.platform || 'Other'))).sort();
    const portalSel = h('select', { 'aria-label': 'Portal', onchange: e => { st.bportal = e.target.value; st.bl = {}; render(); } }, h('option', { value: 'all', text: 'All portals' }), portals.map(p => h('option', { value: p, text: p }))); portalSel.value = st.bportal;
    const sortSel = h('select', { 'aria-label': 'Sort cards', onchange: e => { st.bsort = e.target.value; render(); } }, [['date-desc', 'Newest first'], ['date-asc', 'Oldest first'], ['waiting', 'Waiting longest'], ['company', 'Company A–Z']].map(o => h('option', { value: o[0], text: o[1] }))); sortSel.value = st.bsort;
    m.appendChild(h('div', { class: 'toolbar' }, search, portalSel, sortSel,
      h('button', { class: 'btn tgl', type: 'button', 'aria-pressed': String(st.bselect), text: st.bselect ? '✓ Selecting' : 'Select cards', onclick: () => { st.bselect = !st.bselect; if (!st.bselect) st.sel.clear(); render(); } })));

    // pipeline strip (also the drop targets)
    m.appendChild(h('section', { class: 'pipe', 'aria-label': 'Stages' },
      h('div', { class: 'pgroup' }, h('div', { class: 'pg-l', text: 'In progress' }), h('div', { class: 'pg-t p6' }, PIPE.map(s => tile(s, counts[s], base.length)))),
      h('div', { class: 'pgroup' }, h('div', { class: 'pg-l', text: 'Closed' }), h('div', { class: 'pg-t p2' }, CLOSED.map(s => tile(s, counts[s], base.length))))));

    // focused stage
    const s = st.bstage, by = {
      'date-desc': (a, b) => Date.parse(b.date) - Date.parse(a.date), 'date-asc': (a, b) => Date.parse(a.date) - Date.parse(b.date),
      'company': (a, b) => a.company.localeCompare(b.company), 'waiting': (a, b) => (waiting(b) ? waitDays(b) : -1) - (waiting(a) ? waitDays(a) : -1)
    };
    const items = base.filter(a => a.status === s).sort(by[st.bsort]);
    const panel = h('section', { class: 'sp', 'aria-label': s + ' applications' },
      h('div', { class: 'sp-h' }, h('div', null, h('h2', null, h('span', { class: 'pill s-' + U.slug(s), text: s }), plural(items.length, 'application')), h('p', { class: 'sub', text: STAGE_NOTE[s] }))));
    const grid = list => h('div', { class: 'bgrid' }, list.map(bcard));
    const more = (key, total, shown, step) => total > shown ? h('button', { class: 'more', type: 'button', text: 'Show ' + Math.min(step, total - shown) + ' more  (' + (total - shown) + ' left)', onclick: () => { st.bl[key] = shown + step; render(); } }) : null;
    if (!items.length) {
      panel.appendChild(h('div', { class: 'empty' }, h('b', { text: st.apps.length ? 'Nothing in ' + s + (t ? ' matches your search' : ' yet') : 'No applications yet' }),
        st.apps.length ? 'Drag a card onto “' + s + '” above, or press ⇄ on any card to move it here.' : 'They appear here automatically when you apply.'));
    } else if (s === 'Applied' || s === 'In Review') {
      const due = items.filter(a => waitDays(a) >= st.set.followUpDays), fresh = items.filter(a => waitDays(a) < st.set.followUpDays);
      [['due', 'Time to follow up', due, 'Waiting ' + st.set.followUpDays + '+ days — a short email can help.'], ['fresh', 'Recently applied', fresh, 'Give these a few more days.']].forEach(g => {
        if (!g[2].length) return; const lim = st.bl[g[0]] || 12;
        panel.appendChild(h('div', { class: 'grp-h' }, g[1], h('span', { text: g[2].length + ' · ' + g[3] })));
        panel.appendChild(grid(g[2].slice(0, lim))); const mm = more(g[0], g[2].length, lim, 12); if (mm) panel.appendChild(mm);
      });
    } else {
      const lim = st.bl[s] || 24; panel.appendChild(grid(items.slice(0, lim))); const mm = more(s, items.length, lim, 24); if (mm) panel.appendChild(mm);
    }
    m.appendChild(panel);
    bulkHostEl = h('div'); m.appendChild(bulkHostEl); renderBulk();
  }

  // ───────── INSIGHTS ─────────
  function insights(m) {
    const since = st.ins === 'all' ? 0 : Date.now() - (+st.ins) * DAY, apps = real().filter(a => Date.parse(a.date) >= since);
    m.appendChild(h('div', { class: 'toolbar' }, h('div', { class: 'seg', role: 'group', 'aria-label': 'Date range' },
      [['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days'], ['all', 'All time']].map(r => h('button', { type: 'button', 'aria-pressed': String(st.ins === r[0]), text: r[1], onclick: () => { st.ins = r[0]; render(); } })))));
    if (apps.length < 3) { m.appendChild(h('div', { class: 'panel empty' }, h('b', { text: 'Not enough data in this range' }), 'Insights appear once you have a few applications.')); return; }
    const replied = apps.filter(hasReplied), short = apps.filter(a => reached(a, ['Shortlisted', 'Interview', 'Offer'])), intv = apps.filter(a => reached(a, ['Interview', 'Offer'])), offers = apps.filter(a => a.status === 'Offer');
    const times = apps.map(a => { const x = (a.history || []).find(y => S.RESPONDED.indexOf(y.status) >= 0 && !y.auto); return x ? (Date.parse(x.at) - Date.parse(a.date)) / DAY : null; }).filter(v => v !== null && v >= 0);
    const avg = times.length ? (times.reduce((s, v) => s + v, 0) / times.length).toFixed(1) + ' days' : '–';
    const rs = S.replyStats(apps), pct = (n, d) => d ? Math.round(n / d * 100) + '%' : '–';
    const kpi = (b, l, s) => h('div', { class: 'kpi' }, h('b', { text: b }), h('span', { text: l }), s ? h('small', { text: s }) : null);
    m.appendChild(h('div', { class: 'kpis' }, kpi(apps.length, 'Applications sent'), kpi(rs.eligible >= 5 ? rs.rate + '%' : '–', 'Reply rate', rs.replied + ' of ' + rs.eligible + ' older than a week'), kpi(intv.length, 'Reached interview'), kpi(offers.length, 'Offers'), kpi(avg, 'Avg. time to first reply', times.length ? 'from ' + plural(times.length, 'reply') : 'needs recorded replies')));

    if (rs.eligible >= 30 && rs.rate < 5) m.appendChild(h('div', { class: 'banner', role: 'status' }, h('span', { text: 'Only ' + rs.rate + '% of your applications have a status beyond “Applied”. Real replies are probably not recorded yet — the numbers below will look low until they are.' }), h('button', { type: 'button', text: st.set.gmailSync ? 'Open follow-ups' : 'Turn on Gmail detection', onclick: () => go(st.set.gmailSync ? 'followups' : 'settings') })));

    const fun = [['Applied', apps.length], ['Got a reply', replied.length], ['Shortlisted', short.length], ['Interview', intv.length], ['Offer', offers.length]];
    const funnel = h('div', { class: 'funnel' }, fun.map((f, i) => h('div', { class: 'frow' }, h('span', { text: f[0] }), h('div', { class: 't', role: 'img', 'aria-label': f[0] + ': ' + f[1] }, h('i', { style: 'width:' + Math.round(f[1] / apps.length * 100) + '%' })), h('small', { text: f[1] + (i ? ' · ' + pct(f[1], fun[i - 1][1]) + ' of previous' : '') }))));
    const n = st.ins === 'all' ? 30 : Math.min(+st.ins, 30);
    const days = h('div', { class: 'panel' }, h('h2', { text: 'Applications per day' }), h('p', { class: 'sub', text: 'Click a bar to open that day.' }), bars(lastDays(n, apps), i => { if (i.v) go('applications', { day: i.key }); }));
    m.appendChild(h('div', { class: 'grid2' }, h('div', { class: 'panel' }, h('h2', { text: 'Your funnel' }), h('p', { class: 'sub', text: 'How many applications reach each stage.' }), funnel), days));

    const wd = [0, 0, 0, 0, 0, 0, 0], wr = [0, 0, 0, 0, 0, 0, 0]; apps.forEach(a => { const d = new Date(a.date).getDay(); wd[d]++; if (hasReplied(a)) wr[d]++; });
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const by = {}; apps.forEach(a => { (by[a.platform || 'Other'] = by[a.platform || 'Other'] || []).push(a); });
    const rows = Object.keys(by).sort((a, b) => by[b].length - by[a].length).slice(0, 10);
    const tbl = h('table', { class: 't' }, h('thead', null, h('tr', null, h('th', { text: 'Portal' }), h('th', { class: 'n', text: 'Sent' }), h('th', { class: 'n', text: 'Replies' }), h('th', { class: 'n', text: 'Reply rate' }), h('th', { class: 'n', text: 'Interviews' }))),
      h('tbody', null, rows.map(k => { const g = by[k], r = g.filter(hasReplied).length; return h('tr', null, h('td', { text: k }), h('td', { class: 'n', text: g.length }), h('td', { class: 'n', text: r }), h('td', { class: 'n', text: pct(r, g.length) }), h('td', { class: 'n', text: g.filter(a => reached(a, ['Interview', 'Offer'])).length })); })));
    m.appendChild(h('div', { class: 'grid2' },
      h('div', { class: 'panel' }, h('h2', { text: 'Which days you apply' }), bars(wd.map((v, i) => ({ v, l: names[i], title: names[i] + ': ' + plural(v, 'application') + ', ' + wr[i] + ' replied' })))),
      h('div', { class: 'panel' }, h('h2', { text: 'Where replies come from' }), h('div', { style: 'overflow-x:auto' }, tbl))));
  }

  // ───────── SETTINGS ─────────
  function settings(m) {
    const box = h('div', { class: 'panel' }, h('h2', { text: 'Preferences' }));
    const inner = h('div'); box.appendChild(inner); AppliedInSettings.render(inner, { snack, onChange: s => { st.set = s; } });
    const last = st.set.lastBackupAt;
    const data = h('div', { class: 'panel' }, h('h2', { text: 'Your data' }), h('p', { class: 'sub', text: plural(st.apps.length, 'application') + ' stored only on this device. ' + (last ? 'Last backup: ' + U.fmtDate(new Date(last).toISOString()) + '.' : 'Never backed up.') }),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, h('button', { class: 'primary', type: 'button', text: 'Back up (JSON)', onclick: backup }), h('button', { class: 'btn', type: 'button', text: 'Restore…', onclick: () => $('file').click() }), h('button', { class: 'btn', type: 'button', text: 'Export CSV / Excel…', onclick: exportDialog }), h('button', { class: 'btn', type: 'button', text: 'Clean up duplicates…', onclick: cleanup })),
      h('h2', { style: 'margin-top:22px;color:var(--bad)', text: 'Danger zone' }), h('button', { class: 'btn', type: 'button', text: 'Delete all my data…', onclick: wipe }));
    m.appendChild(h('div', { class: 'grid2' }, box, data));
  }
  function wipe() {
    const i = inp('', { placeholder: 'Type DELETE', 'aria-label': 'Type DELETE to confirm' });
    dialog('Delete all data?', [h('p', { text: 'This permanently removes all ' + st.apps.length + ' applications from this device. Make a backup first if you might need them.' }), i, h('p', { class: 'err', id: 'werr' })], [{ label: 'Cancel' }, { label: 'Delete everything', primary: true, onClick: async dlg => {
      if (i.value.trim() !== 'DELETE') { dlg.querySelector('#werr').textContent = 'Type DELETE exactly to confirm.'; return true; }
      await Store.bulkRemove(st.apps.map(a => a.id)); await load(); snack('All data deleted'); } }]);
  }

  // ───────── DRAWER ─────────
  function closeDrawer() { st.openId = null; $('drawer').hidden = true; $('scrim').hidden = true; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); lastFocus = null; }
  function openDrawer(id) {
    const a = st.apps.find(x => x.id === id); if (!a) return;
    lastFocus = document.activeElement; st.openId = id;
    const d = $('drawer'); d.textContent = '';
    const f = { company: inp(a.company, { maxlength: 100 }), role: inp(a.role, { maxlength: 140 }), location: inp(a.location, { maxlength: 100 }), salary: inp(a.salary, { maxlength: 80 }), url: inp(a.url, { type: 'url' }),
      interview: inp(toLocal(a.interviewDate), { type: 'datetime-local' }), follow: inp(toLocal(a.followUpDate, true), { type: 'date' }), notes: h('textarea', { placeholder: 'Recruiter name, salary talk, what to prepare…' }),
      status: h('select', null, S.STATUSES.map(s => h('option', { value: s, text: s }))) };
    f.notes.value = a.notes || ''; f.status.value = a.status;
    const err = h('p', { class: 'err', role: 'alert' });
    const w = waiting(a) ? waitDays(a) : null;
    d.append(
      h('header', null, h('div', null, h('h2', { text: a.company }), h('p', { text: a.role }), h('p', { text: [a.platform, U.fmtDate(a.date), w !== null ? 'waiting ' + w + ' days' : ''].filter(Boolean).join(' · ') })), h('button', { class: 'iconbtn', type: 'button', 'aria-label': 'Close details', text: '✕', onclick: closeDrawer })),
      h('div', { class: 'body' }, fld('Status', f.status), h('div', { class: 'two' }, fld('Company', f.company), fld('Role', f.role)), h('div', { class: 'two' }, fld('Location', f.location), fld('Salary / stipend', f.salary)), fld('Job link', f.url),
        h('div', { class: 'two' }, fld('Interview date', f.interview), fld('Follow up on', f.follow)), fld('Notes', f.notes),
        a.jd ? h('details', { class: 'jd' }, h('summary', { text: 'Saved job description' }), h('pre', { text: a.jd })) : null,
        h('h3', { class: 'set-h', text: 'History' }),
        h('ul', { class: 'tl' }, (a.history || []).slice().reverse().map(x => h('li', null, h('b', { text: x.status }), ' · ' + U.fmtFull(x.at) + (x.auto ? ' (automatic)' : '')))), err),
      h('footer', null,
        h('button', { class: 'primary', type: 'button', text: 'Save changes', onclick: async () => {
          if (!f.company.value.trim() || !f.role.value.trim()) { err.textContent = 'Company and role are required.'; return; }
          await Store.update(a.id, { company: f.company.value.trim(), role: f.role.value.trim(), location: f.location.value.trim(), salary: f.salary.value.trim(), url: f.url.value.trim(), status: f.status.value, interviewDate: fromLocal(f.interview.value), followUpDate: fromLocal(f.follow.value), notes: f.notes.value });
          closeDrawer(); await load(); snack('Saved'); } }),
        a.url ? h('a', { class: 'btn', style: 'text-decoration:none;padding:9px 14px;border-radius:10px', href: a.url, target: '_blank', rel: 'noopener noreferrer', text: 'Open job' }) : null,
        h('a', { class: 'btn', style: 'text-decoration:none;padding:9px 14px;border-radius:10px', href: mailSearch(a.company), target: '_blank', rel: 'noopener noreferrer', text: 'Search email' }),
        waiting(a) ? h('button', { class: 'btn', type: 'button', text: 'Followed up', onclick: async () => { await Store.update(a.id, { lastFollowUp: Date.now() }); closeDrawer(); await load(); snack('Marked as followed up'); } }) : null,
        h('button', { class: 'btn', type: 'button', style: 'color:var(--bad)', text: 'Delete', onclick: () => deleteIds([a.id]) })));
    d.hidden = false; $('scrim').hidden = false; f.company.focus();
  }

  // ───────── add / export / backup / cleanup ─────────
  function addJob() {
    const f = { company: inp('', { maxlength: 100 }), role: inp('', { maxlength: 140 }), location: inp('', { maxlength: 100 }), salary: inp('', { maxlength: 80 }), url: inp('', { type: 'url', placeholder: 'https://…' }),
      platform: h('select', null, ['LinkedIn', 'Naukri', 'Internshala', 'Indeed', 'Glassdoor', 'Unstop', 'Company Website', 'Other'].map(p => h('option', { value: p, text: p }))),
      status: h('select', null, ['Applied', 'Saved', 'In Review', 'Shortlisted', 'Interview', 'Offer', 'Rejected'].map(p => h('option', { value: p, text: p }))) };
    f.platform.value = 'Other'; const err = h('p', { class: 'err', role: 'alert' }); let force = false;
    dialog('Add a job', [h('div', { class: 'two' }, fld('Company', f.company), fld('Job role', f.role)), h('div', { class: 'two' }, fld('Location', f.location), fld('Salary / stipend', f.salary)), fld('Job link', f.url), h('div', { class: 'two' }, fld('Portal', f.platform), fld('Status', f.status)), err],
      [{ label: 'Cancel' }, { label: 'Save job', primary: true, onClick: async dlg => {
        const c = f.company.value.trim(), r = f.role.value.trim(), u = f.url.value.trim();
        if (!c || !r) { err.textContent = 'Enter the company and the job role.'; return true; }
        if (u && !/^https?:\/\//i.test(u)) { err.textContent = 'The job link must start with http:// or https://'; return true; }
        const res = await Store.add({ company: c, role: r, location: f.location.value.trim(), salary: f.salary.value.trim(), url: u, platform: f.platform.value, status: f.status.value, source: 'manual' }, { force });
        if (res.error) { err.textContent = res.error; return true; }
        if (res.duplicate) { err.textContent = 'You already have ' + res.existing.company + ' — ' + res.existing.role + ' (' + res.existing.status + ', ' + U.fmtDate(res.existing.date) + '), matched by ' + res.reason + '. If this is a different job, press “Add anyway”.'; force = true; dlg.querySelector('footer .primary').textContent = 'Add anyway'; return true; }
        await load(); snack(res.promoted ? 'Moved to Applied' : 'Added ' + c); } }]);
    setTimeout(() => f.company.focus(), 30);
  }
  function exportDialog() {
    const per = h('select', null, [['all', 'All applications'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']].map(o => h('option', { value: o[0], text: o[1] })));
    const fmt = h('select', null, h('option', { value: 'csv', text: 'CSV (opens in Excel / Sheets)' }), h('option', { value: 'xlsx', text: 'Excel (.xlsx)' }));
    const info = h('p', { class: 'muted' });
    const pick = () => { const d = new Date(); d.setHours(0, 0, 0, 0); if (per.value === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); if (per.value === 'month') d.setDate(1); const since = per.value === 'all' ? 0 : d.getTime(); return st.apps.filter(a => Date.parse(a.date) >= since); };
    const upd = () => { info.textContent = plural(pick().length, 'application') + ' will be exported.'; }; per.onchange = upd; upd();
    dialog('Export', [fld('Period', per), fld('Format', fmt), info], [{ label: 'Cancel' }, { label: 'Download', primary: true, onClick: async () => {
      const list = pick(); if (!list.length) { snack('Nothing to export for this period'); return; }
      if (fmt.value === 'csv') U.download('appliedin-' + U.stamp() + '.csv', new Blob([U.toCSV(list)], { type: 'text/csv;charset=utf-8' }));
      else {
        if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }).catch(() => {});
        if (!window.XLSX) { snack('Excel export could not load — use CSV'); return; }
        const ws = XLSX.utils.aoa_to_sheet([U.COLS].concat(list.map(U.rowOf))); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Applications'); XLSX.writeFile(wb, 'appliedin-' + U.stamp() + '.xlsx');
      }
      snack('Exported ' + plural(list.length, 'application')); } }]);
  }
  async function backup() {
    await Store.saveSettings({ lastBackupAt: Date.now() });
    U.download('appliedin-backup-' + U.stamp() + '.json', new Blob([JSON.stringify(await Store.exportAll(), null, 2)], { type: 'application/json' }));
    await load(); snack('Backup downloaded — keep it somewhere safe (Drive, email to yourself)');
  }
  async function restore(file) {
    try {
      const j = JSON.parse(await file.text()), list = Array.isArray(j) ? j : j.applications;
      if (!Array.isArray(list)) throw new Error('bad');
      const r = await Store.importMany(list); await load(); snack('Restored ' + plural(r.added, 'application') + (r.skipped ? ' (' + r.skipped + ' already existed)' : ''));
    } catch (e) { snack('That file is not an AppliedIn backup'); }
  }
  async function cleanup() {
    const groups = await Store.duplicates(), titles = await Store.tidyTitles(false);
    const body = [h('p', { class: 'muted', text: 'Finds the same job saved twice (same link, or same role at the same company, or captured twice within minutes) and removes noise like “Career Opportunities:” or “(578627)” from job titles. Everything can be undone.' })];
    body.push(h('h3', { class: 'set-h', text: 'Possible duplicates: ' + groups.length }));
    groups.slice(0, 20).forEach(g => body.push(h('div', { class: 'grp' }, g.map(a => h('div', { class: 'r' }, h('span', { text: a.company + ' — ' + a.role }), h('span', { class: 'muted', text: a.status + ' · ' + U.fmtDate(a.date) }))))));
    if (groups.length > 20) body.push(h('p', { class: 'muted', text: '…and ' + (groups.length - 20) + ' more groups.' }));
    body.push(h('h3', { class: 'set-h', text: 'Titles to tidy: ' + titles.length }));
    titles.slice(0, 5).forEach(t => body.push(h('div', { class: 'r muted', style: 'font-size:13px', text: '“' + t.from + '” → “' + t.to + '”' })));
    const btns = [{ label: 'Close' }];
    if (titles.length) btns.push({ label: 'Tidy ' + titles.length + ' titles', onClick: async () => { await Store.tidyTitles(true); await load(); snack('Tidied ' + plural(titles.length, 'title'), 'Undo', async () => { for (const t of titles) await Store.update(t.id, { role: t.from }); await load(); }); } });
    if (groups.length) btns.push({ label: 'Merge ' + groups.length + ' groups', primary: true, onClick: async () => { let removed = []; for (const g of groups) removed = removed.concat(await Store.mergeGroup(g)); await load(); snack('Removed ' + plural(removed.length, 'duplicate'), 'Undo', async () => { for (const r of removed) await Store.restore(r); await load(); }); } });
    dialog('Clean up', body, btns);
  }
  // Exit: close this tab and bring the quick popup back (asks the background worker, because this page is about to disappear)
  function exitDash() {
    chrome.tabs.getCurrent(t => {
      if (!t) { window.close(); return; }
      let done = false;
      try { chrome.runtime.sendMessage({ type: 'EXIT_DASH', tabId: t.id, windowId: t.windowId }, r => { done = true; if (chrome.runtime.lastError || !r) chrome.tabs.remove(t.id); }); }
      catch (e) { chrome.tabs.remove(t.id); }
      setTimeout(() => { if (!done) chrome.tabs.remove(t.id); }, 1500);
    });
  }

  // ───────── wiring ─────────
  function wire() {
    $('btnAdd').onclick = addJob; $('btnExit').onclick = exitDash; $('scrim').onclick = closeDrawer;
    const menu = $('moreMenu'), mb = $('btnMore');
    mb.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; mb.setAttribute('aria-expanded', String(!menu.hidden)); };
    document.addEventListener('click', () => { menu.hidden = true; mb.setAttribute('aria-expanded', 'false'); closeMenus(); });
    menu.addEventListener('click', e => {
      const a = e.target.closest('[data-act]'); if (!a) return;
      ({ export: exportDialog, backup, restore: () => $('file').click(), cleanup })[a.dataset.act]();
    });
    $('file').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };
    window.addEventListener('hashchange', route);
    document.addEventListener('keydown', e => {
      const tag = (e.target.tagName || '').toLowerCase(), typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if (e.key === 'Escape' && st.openId) closeDrawer();
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('dialog[open]')) return;
      if (e.key === '/') { e.preventDefault(); if (st.view !== 'applications') { go('applications'); setTimeout(() => $('q') && $('q').focus(), 50); } else $('q') && $('q').focus(); }
      if (e.key === 'n') { e.preventDefault(); addJob(); }
    });
    // refresh when the background changes data (but never while you are editing in the drawer)
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && (ch.__rev || ch.activity) && !st.openId && !document.querySelector('dialog[open]')) load(); });
  }
  wire(); route(); load();
})();
