(function () {
  'use strict';
  const S = AppliedInShared, Store = AppliedInStore, U = AppliedInUI, h = U.h;
  const $ = id => document.getElementById(id);
  let apps = [], settings = Store.DEFAULTS, filter = 'all', q = '', limit = 60, openId = null, exportType = 'csv', period = 'all', snackT = null;

  async function load() { apps = await Store.getAll(); settings = await Store.settings(); render(); }

  // ───────── stats ─────────
  function startOf(kind) {
    const d = new Date(); d.setHours(0, 0, 0, 0);
    if (kind === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    if (kind === 'month') d.setDate(1);
    return d.getTime();
  }
  const real = () => apps.filter(a => a.status !== 'Saved');
  const count = since => real().filter(a => Date.parse(a.date) >= since).length;

  function renderStats() {
    const r = real(), today = count(startOf('day'));
    $('totalCount').textContent = apps.length + ' total';
    $('statToday').textContent = today; $('statWeek').textContent = count(startOf('week')); $('statMonth').textContent = count(startOf('month'));
    const rs = S.replyStats(apps);
    $('statResp').textContent = rs.replied;
    $('statRespLbl').textContent = rs.eligible >= 10 ? 'Replies · ' + rs.rate + '%' : 'Replies';
    $('statReplyBox').title = rs.replied + ' of ' + rs.eligible + ' applications older than a week got a reply. Statuses update when you change them, when you visit your portal “applications” pages, or with Gmail detection (Settings).';
    const goal = settings.dailyGoal || 10, pct = Math.min(100, Math.round(today / goal * 100));
    $('goalText').textContent = today >= goal ? 'Goal reached — ' + today + ' today 🎉' : today + ' of ' + goal + ' applications today';
    $('goalFill').style.width = pct + '%'; $('goalFill').parentElement.classList.toggle('done', today >= goal);
    const st = U.streak(apps); $('streakText').textContent = st > 1 ? '🔥 ' + st + '-day streak' : '';
    const att = Store.attention(apps, settings), need = att.due.length + att.soon.length, b = $('attention');
    b.hidden = !need; b.className = 'strip' + (att.soon.length ? ' warn' : '');
    if (need) { b.textContent = '⏰ ' + (att.soon.length ? att.soon.length + ' interview' + (att.soon.length > 1 ? 's' : '') + ' soon · ' : '') + att.due.length + ' waiting for a reply — review follow-ups ›'; b.onclick = () => openBoard('followups'); }
    const bw = $('backupWarn'), last = settings.lastBackupAt || 0, stale = Date.now() - last > 14 * 864e5;
    bw.hidden = !(apps.length >= 10 && stale);
    if (!bw.hidden) { bw.textContent = '💾 ' + (last ? 'Last backup ' + Math.floor((Date.now() - last) / 864e5) + ' days ago' : 'You have never backed up') + ' — back up now ›'; bw.onclick = backup; }
  }
  function renderChips() {
    const nav = $('chips'); nav.textContent = '';
    ['all'].concat(S.STATUSES).forEach(s => {
      const n = s === 'all' ? apps.length : apps.filter(a => a.status === s).length;
      if (s !== 'all' && !n && s !== filter) return;
      nav.appendChild(h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === s), text: (s === 'all' ? 'All' : s) + ' ' + n, onclick: () => { filter = s; limit = 60; render(); } }));
    });
  }

  // ───────── list ─────────
  function visible() {
    const t = q.trim().toLowerCase();
    return apps.filter(a => (filter === 'all' || a.status === filter) &&
      (!t || (a.company + ' ' + a.role + ' ' + a.platform + ' ' + (a.location || '')).toLowerCase().indexOf(t) >= 0));
  }
  function dueFlag(a) {
    if (a.status !== 'Applied' && a.status !== 'In Review') return '';
    const days = Math.floor((Date.now() - Date.parse(a.lastStatusChange || a.date)) / 864e5);
    return days >= settings.followUpDays && !a.followUpDismissed ? 'Follow up (' + days + 'd)' : '';
  }
  function statusSelect(a, cls) {
    const sel = h('select', { class: 'st s-' + U.slug(a.status), 'aria-label': 'Status', onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation(), onchange: async e => {
      await Store.update(a.id, { status: e.target.value }); await load();
    } }, S.STATUSES.map(s => h('option', { value: s, text: s, selected: s === a.status })));
    sel.value = a.status; return sel;
  }
  function toLocalInput(iso, dateOnly) {
    if (!iso) return ''; const d = new Date(iso); if (isNaN(d)) return '';
    const p = n => String(n).padStart(2, '0'), day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    return dateOnly ? day : day + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fromLocalInput(v) { if (!v) return ''; const d = new Date(v); return isNaN(d) ? '' : d.toISOString(); }

  function detail(a) {
    const f = {
      company: h('input', { value: a.company }), role: h('input', { value: a.role }), location: h('input', { value: a.location || '' }),
      salary: h('input', { value: a.salary || '' }), url: h('input', { type: 'url', value: a.url || '' }),
      interview: h('input', { type: 'datetime-local', value: toLocalInput(a.interviewDate) }),
      follow: h('input', { type: 'date', value: toLocalInput(a.followUpDate, true) }),
      notes: h('textarea', { placeholder: 'Recruiter name, salary talk, things to prepare…' })
    };
    f.notes.value = a.notes || '';
    ['company', 'role', 'location', 'salary', 'url'].forEach(k => { f[k].value = a[k] || ''; });
    const L = (t, el) => [h('label', { text: t }), el];
    return h('div', { class: 'detail' },
      h('div', { class: 'two' }, h('div', null, L('Company', f.company)), h('div', null, L('Role', f.role))),
      h('div', { class: 'two' }, h('div', null, L('Location', f.location)), h('div', null, L('Salary / stipend', f.salary))),
      L('Job link', f.url),
      h('div', { class: 'two' }, h('div', null, L('Interview date', f.interview)), h('div', null, L('Follow up on', f.follow))),
      L('Notes', f.notes),
      a.jd ? h('details', { class: 'jd' }, h('summary', { text: 'Saved job description' }), h('pre', { text: a.jd })) : null,
      h('div', { class: 'acts' },
        h('button', { class: 'primary', type: 'button', text: 'Save changes', onclick: async () => {
          if (!f.company.value.trim() || !f.role.value.trim()) return snack('Company and role are required');
          await Store.update(a.id, { company: f.company.value.trim(), role: f.role.value.trim(), location: f.location.value.trim(), salary: f.salary.value.trim(),
            url: f.url.value.trim(), interviewDate: fromLocalInput(f.interview.value), followUpDate: fromLocalInput(f.follow.value), notes: f.notes.value });
          openId = null; await load(); snack('Saved');
        } }),
        a.url ? h('button', { type: 'button', text: 'Open job', onclick: () => chrome.tabs.create({ url: a.url }) }) : null,
        h('button', { type: 'button', text: 'Search my email', title: 'Opens Gmail searching for this company', onclick: () => chrome.tabs.create({ url: 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent('"' + a.company + '"') }) }),
        (a.status === 'Applied' || a.status === 'In Review') && !a.followUpDismissed ? h('button', { type: 'button', text: 'Stop reminders', onclick: async () => { await Store.update(a.id, { followUpDismissed: true }); await load(); } }) : null,
        h('button', { class: 'danger', type: 'button', text: 'Delete', onclick: () => del(a) })));
  }
  async function del(a) {
    const rec = await Store.get(a.id); await Store.remove(a.id); if (openId === a.id) openId = null; await load();
    snack('Deleted ' + a.company, 'Undo', async () => { await Store.restore(rec); await load(); });
  }
  function card(a) {
    const flag = dueFlag(a), open = openId === a.id;
    const tags = [a.platform, a.jobType, a.workMode].filter(Boolean).map(t => h('span', { class: 'tag', text: t }));
    return h('article', { class: 'app' + (open ? ' open' : '') },
      h('div', { class: 'app-h', role: 'button', tabindex: '0', 'aria-expanded': String(open),
        onclick: () => { openId = open ? null : a.id; render(); },
        onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openId = open ? null : a.id; render(); } } },
        h('div', { class: 'app-m' },
          h('div', { class: 'co', text: a.company }), h('div', { class: 'ro', text: a.role }),
          h('div', { class: 'meta' }, tags, U.fmtDate(a.date), flag ? h('span', { class: 'flag', text: ' · ' + flag }) : null,
            a.interviewDate ? h('span', { class: 'flag', text: ' · Interview ' + U.fmtDate(a.interviewDate) }) : null)),
        h('div', { class: 'app-r', onclick: e => e.stopPropagation(), onkeydown: e => e.stopPropagation() }, statusSelect(a),
          h('div', { class: 'app-btns' },
            h('button', { class: 'ib', type: 'button', title: 'Edit', 'aria-label': 'Edit ' + a.company, text: '✎', onclick: () => { openId = open ? null : a.id; render(); } }),
            h('button', { class: 'ib del', type: 'button', title: 'Delete', 'aria-label': 'Delete ' + a.company, text: '🗑', onclick: () => del(a) })))),
      open ? detail(a) : null);
  }
  function renderList() {
    const list = $('list'); list.textContent = '';
    const v = visible(); $('empty').hidden = v.length > 0;
    $('emptyMsg').textContent = apps.length ? 'No applications match this search or filter.' : 'Apply on LinkedIn, Naukri or Internshala and your applications appear here automatically. You can also add one by hand.';
    v.slice(0, limit).forEach(a => list.appendChild(card(a)));
    if (v.length > limit) list.appendChild(h('button', { class: 'more', type: 'button', text: 'Show ' + Math.min(60, v.length - limit) + ' more of ' + (v.length - limit), onclick: () => { limit += 60; renderList(); } }));
  }
  function render() { renderStats(); renderChips(); renderList(); }

  // ───────── snackbar ─────────
  function snack(msg, label, fn) {
    const s = $('snack'); s.textContent = ''; s.hidden = false;
    s.appendChild(h('span', { text: msg }));
    if (label) s.appendChild(h('button', { type: 'button', text: label, onclick: () => { s.hidden = true; fn(); } }));
    clearTimeout(snackT); snackT = setTimeout(() => { s.hidden = true; }, 6000);
  }

  // ───────── add job ─────────
  function openAdd() { ['addCompany', 'addRole', 'addLocation', 'addSalary', 'addUrl'].forEach(i => $(i).value = ''); $('addErr').hidden = true; $('addForce').hidden = true; $('addStatus').value = 'Applied'; $('addModal').hidden = false; $('addCompany').focus(); }
  async function saveAdd(force) {
    const company = $('addCompany').value.trim(), role = $('addRole').value.trim(), err = $('addErr');
    if (!company || !role) { err.textContent = 'Enter the company and the job role.'; err.hidden = false; return; }
    const url = $('addUrl').value.trim();
    if (url && !/^https?:\/\//i.test(url)) { err.textContent = 'The job link must start with http:// or https://'; err.hidden = false; return; }
    const r = await Store.add({ company, role, location: $('addLocation').value.trim(), salary: $('addSalary').value.trim(), url, platform: $('addPlatform').value, status: $('addStatus').value, source: 'manual' }, { force: force === true });
    if (r.error) { err.textContent = r.error; err.hidden = false; return; }
    if (r.duplicate) { err.textContent = 'You already have ' + r.existing.company + ' — ' + r.existing.role + ' (' + r.existing.status + ', ' + U.fmtDate(r.existing.date) + '), matched by ' + r.reason + '. If this is a different job, press “Add anyway”.'; err.hidden = false; $('addForce').hidden = false; return; }
    $('addModal').hidden = true; await load(); snack(r.promoted ? 'Moved to Applied' : 'Added ' + company);
  }

  // ───────── export / backup ─────────
  const PERIODS = [['all', 'All applications'], ['today', 'Today'], ['week', 'This week'], ['month', 'This month']];
  function exportList() {
    const since = period === 'all' ? 0 : startOf(period === 'today' ? 'day' : period);
    return apps.filter(a => Date.parse(a.date) >= since);
  }
  function openExport(type) {
    exportType = type; period = 'all'; $('exportTitle').textContent = 'Export to ' + (type === 'csv' ? 'CSV' : 'Excel');
    const box = $('periods'); box.textContent = '';
    PERIODS.forEach(p => box.appendChild(h('button', { class: 'period', type: 'button', 'aria-pressed': String(period === p[0]), text: p[1], onclick: () => { period = p[0]; [].forEach.call(box.children, (b, i) => b.setAttribute('aria-pressed', String(PERIODS[i][0] === period))); $('periodCount').textContent = exportList().length + ' applications will be exported.'; } })));
    $('periodCount').textContent = exportList().length + ' applications will be exported.';
    $('exportModal').hidden = false;
  }
  async function doExport() {
    const list = exportList();
    if (!list.length) return snack('Nothing to export for this period');
    if (exportType === 'csv') U.download('appliedin-' + U.stamp() + '.csv', new Blob([U.toCSV(list)], { type: 'text/csv;charset=utf-8' }));
    else {
      if (!window.XLSX) await new Promise((res, rej) => { const s = document.createElement('script'); s.src = '../xlsx.full.min.js'; s.onload = res; s.onerror = rej; document.head.appendChild(s); }).catch(() => {});
      if (!window.XLSX) return snack('Excel export could not load — use CSV instead');
      const ws = XLSX.utils.aoa_to_sheet([U.COLS].concat(list.map(U.rowOf)));
      ws['!cols'] = [24, 30, 18, 14, 14, 12, 12, 13, 20, 12, 20, 30, 40].map(w => ({ wch: w }));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Applications');
      XLSX.writeFile(wb, 'appliedin-' + U.stamp() + '.xlsx');
    }
    $('exportModal').hidden = true; snack('Exported ' + list.length + ' applications');
  }
  async function backup() { await Store.saveSettings({ lastBackupAt: Date.now() }); settings = await Store.settings(); render(); U.download('appliedin-backup-' + U.stamp() + '.json', new Blob([JSON.stringify(await Store.exportAll(), null, 2)], { type: 'application/json' })); snack('Backup downloaded — keep it somewhere safe'); }
  async function restore(file) {
    try {
      const j = JSON.parse(await file.text());
      const list = Array.isArray(j) ? j : j.applications;
      if (!Array.isArray(list)) throw new Error('bad');
      const r = await Store.importMany(list); await load();
      snack('Restored ' + r.added + ' applications' + (r.skipped ? ' (' + r.skipped + ' already existed)' : ''));
    } catch (e) { snack('That file is not an AppliedIn backup'); }
  }

  // ───────── settings (shared component) ─────────
  async function openSettings() {
    await AppliedInSettings.render($('settingsBox'), { snack, onChange: async s => { settings = s; render(); } });
    $('setModal').hidden = false;
  }

  // ───────── wiring ─────────
  async function openBoard(view) {
    const url = chrome.runtime.getURL('dashboard/dashboard.html'), hash = typeof view === 'string' ? '#' + view : '#overview';
    const tabs = await chrome.tabs.query({ url: url + '*' });
    if (tabs[0]) { await chrome.tabs.update(tabs[0].id, { active: true, url: url + hash }); chrome.windows.update(tabs[0].windowId, { focused: true }); } else chrome.tabs.create({ url: url + hash });
    window.close();
  }
  function wire() {
    $('searchInput').addEventListener('input', e => { q = e.target.value; limit = 60; renderList(); });
    $('btnAdd').onclick = openAdd; $('addClose').onclick = $('addCancel').onclick = () => $('addModal').hidden = true; $('addSave').onclick = () => saveAdd(false); $('addForce').onclick = () => saveAdd(true);
    $('useTab').onclick = () => chrome.tabs.query({ active: true, currentWindow: true }, t => { if (t[0] && t[0].url && /^https?:/.test(t[0].url)) { $('addUrl').value = t[0].url; if (!$('addRole').value && t[0].title) $('addRole').value = t[0].title.split(/\s[|\-–—]\s/)[0].slice(0, 140); } });
    $('btnCsv').onclick = () => openExport('csv'); $('btnExcel').onclick = () => openExport('excel');
    $('exportClose').onclick = $('exportCancel').onclick = () => $('exportModal').hidden = true; $('exportGo').onclick = doExport;
    $('btnBoard').onclick = $('mBoard').onclick = () => openBoard('overview'); $('btnSettings').onclick = openSettings; $('setClose').onclick = $('setDone').onclick = () => $('setModal').hidden = true;
    $('btnMore').onclick = e => { e.stopPropagation(); $('menu').hidden = !$('menu').hidden; };
    document.addEventListener('click', () => $('menu').hidden = true);
    $('mBackup').onclick = backup; $('mRestore').onclick = () => $('fileRestore').click();
    $('fileRestore').onchange = e => { if (e.target.files[0]) restore(e.target.files[0]); e.target.value = ''; };
    document.addEventListener('keydown', e => { if (e.key === 'Escape') ['addModal', 'exportModal', 'setModal'].forEach(i => $(i).hidden = true); });
    chrome.storage.onChanged.addListener((ch, area) => { if (area === 'local' && ch.__rev) load(); });
  }
  wire(); load();
})();
