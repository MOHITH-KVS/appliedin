// AppliedIn v1.1 — tiny DOM helpers for popup + dashboard (no innerHTML with user data anywhere)
(function (g) {
  function h(tag, props) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else if (v === true) e.setAttribute(k, '');
      else e.setAttribute(k, v);
    }
    for (let i = 2; i < arguments.length; i++) {
      [].concat(arguments[i]).forEach(c => { if (c == null || c === false) return; e.append(c.nodeType ? c : document.createTextNode(String(c))); });
    }
    return e;
  }
  function slug(s) { return String(s || '').toLowerCase().replace(/[^a-z]+/g, '-'); }
  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso), diff = Math.floor((Date.now() - d) / 864e5);
    const time = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
    if (d.toDateString() === new Date().toDateString()) return 'Today, ' + time;
    if (diff <= 1) return 'Yesterday, ' + time;
    if (diff < 7) return diff + ' days ago';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function fmtFull(iso) { return iso ? new Date(iso).toLocaleString('en-IN') : ''; }
  function dayKey(d) { d = new Date(d); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
  function streak(apps) {
    const days = new Set(apps.filter(a => a.status !== 'Saved').map(a => dayKey(a.date)));
    let n = 0; const d = new Date();
    if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);
    while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function download(name, blob) {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;           // block spreadsheet formula injection
    return '"' + s.replace(/"/g, '""') + '"';          // proper quote escaping
  }
  const COLS = ['Company', 'Role', 'Location', 'Platform', 'Salary', 'Job Type', 'Work Mode', 'Status', 'Date Applied', 'Follow-up', 'Interview', 'Notes', 'URL'];
  function rowOf(a) {
    return [a.company, a.role, a.location, a.platform, a.salary, a.jobType, a.workMode, a.status, fmtFull(a.date),
      a.followUpDate ? new Date(a.followUpDate).toLocaleDateString('en-IN') : '', a.interviewDate ? fmtFull(a.interviewDate) : '', a.notes, a.url];
  }
  function toCSV(list) {
    return '\uFEFF' + [COLS.map(csvCell).join(',')].concat(list.map(a => rowOf(a).map(csvCell).join(','))).join('\r\n');
  }
  function stamp() { return new Date().toISOString().slice(0, 10); }
  g.AppliedInUI = { h, slug, fmtDate, fmtFull, dayKey, streak, download, toCSV, COLS, rowOf, stamp };
})(self);
