// AppliedIn v1.1 — one detection engine for every portal.
//
// How it works (the accuracy upgrade):
//  1. On a job page it reads the job with a layered extractor:  JSON-LD JobPosting  >  portal selectors  >  ATS URL  >  page title.
//  2. That job is remembered per TAB (in the background worker), so it survives redirects and new tabs.
//  3. When you click Apply / Submit the tab becomes "armed" for a few minutes. Success text is only trusted while armed
//     (or on a known confirmation URL) — listing pages that merely say "you have applied" can no longer cause false saves.
//  4. High-confidence jobs are saved instantly with Undo/Edit. Anything uncertain shows a pre-filled confirm box.
(function () {
  'use strict';
  if (window.__appliedinCore) return;
  const S = self.AppliedInShared, ADP = self.AppliedInAdapters;
  if (!S || !ADP || typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.id) return;
  window.__appliedinCore = true;

  const IS_TOP = window === window.top;
  const host = location.hostname.toLowerCase().replace(/^www\./, '');
  const adapter = ADP.pick(host);
  const JOBURL = /(career|job|apply|opening|position|vacanc|recruit|hiring|opportunit|requisition|posting)/i;
  const NOISE = ['thank you', 'thanks for', 'successfully applied', 'application submitted', 'you have applied', 'we have received',
    'your application', 'congratulations', 'we will be in touch', 'your submission', 'apply confirmation', 'naukri campus'];

  let settings = { enabled: true, showTrackButton: true, badges: true };
  let remote = null;
  let index = [], byKey = new Map();
  let tabState = { draft: null, armLevel: 0, armedAt: 0, ask: null, inherited: false };
  let handled = false, syncMode = false, skipPage = false;
  let lastUrl = location.href, hiddenAt = 0, watchTimer = null, watchMo = null, watchUntil = 0;

  // ───────────────────────── helpers ─────────────────────────
  let sendFail = '';
  function send(msg) {
    return new Promise(res => {
      try {
        chrome.runtime.sendMessage(msg, r => {
          const le = chrome.runtime.lastError;
          if (le) sendFail = /context invalidated/i.test(le.message) ? 'stale' : 'down';
          res(r || null);
        });
      } catch (e) { sendFail = 'stale'; res(null); }     // thrown when the extension was updated while this page stayed open
    });
  }
  function debounce(fn, ms) { let t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }
  function pathLower() { return location.pathname.toLowerCase(); }
  function inList(arr) { const p = pathLower(); return (arr || []).some(x => p.indexOf(x) === 0); }
  function sels(key) {
    const r = remote && remote.portals && remote.portals[adapter.id] && remote.portals[adapter.id][key];
    return (Array.isArray(r) ? r.filter(x => typeof x === 'string' && x.length < 200) : []).concat(adapter[key] || []);
  }
  function plain(s) {
    try { return new DOMParser().parseFromString(String(s || ''), 'text/html').body.textContent.replace(/\s+/g, ' ').trim(); } catch (e) { return String(s || ''); }
  }
  function clean(s, max) {
    if (!s) return '';
    s = String(s).replace(/\s+/g, ' ').trim();
    if (!s || s.length > (max || 100)) return '';
    const l = s.toLowerCase();
    if (NOISE.some(w => l.indexOf(w) >= 0)) return '';
    if (/[.!?]$/.test(s)) return '';
    return s;
  }
  function firstLine(el) { return String(el.innerText || el.textContent || '').split('\n').map(x => x.trim()).filter(Boolean)[0] || ''; }
  function firstBy(selectors, max) {
    for (const sel of selectors) {
      try {
        const els = document.querySelectorAll(sel);
        for (let i = 0; i < els.length && i < 8; i++) {
          const t = clean(firstLine(els[i]), max);
          if (t) return t;
        }
      } catch (e) {}
    }
    return '';
  }
  function textBy(selectors, max) {
    for (const sel of selectors) {
      try { const el = document.querySelector(sel); if (el && el.innerText && el.innerText.trim().length > 40) return el.innerText.trim().slice(0, max); } catch (e) {}
    }
    return '';
  }

  // ───────────────────────── extraction ─────────────────────────
  function ldJob() {
    const found = [];
    function walk(n) {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { n.forEach(walk); return; }
      const t = n['@type'];
      if ((Array.isArray(t) ? t : [t]).indexOf('JobPosting') >= 0) found.push(n);
      if (n['@graph']) walk(n['@graph']);
    }
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s => { try { walk(JSON.parse(s.textContent)); } catch (e) {} });
    return found.find(j => j.title) || null;
  }
  function ldFields(j) {
    const org = j.hiringOrganization;
    const jl = Array.isArray(j.jobLocation) ? j.jobLocation[0] : j.jobLocation, ad = jl && jl.address;
    let location = '';
    if (ad) location = typeof ad === 'string' ? ad : [ad.addressLocality, ad.addressRegion || ad.addressCountry].filter(Boolean).join(', ');
    let salary = '';
    const bs = j.baseSalary, v = bs && bs.value;
    if (v && typeof v === 'object') {
      const cur = bs.currency || v.currency || '';
      const range = [v.minValue, v.maxValue].filter(Boolean).join(' - ') || v.value || '';
      if (range) salary = (cur ? cur + ' ' : '') + range + (v.unitText ? ' / ' + String(v.unitText).toLowerCase() : '');
    }
    const et = [].concat(j.employmentType || []).join(' ').toUpperCase();
    const jobType = /INTERN/.test(et) ? 'Internship' : /FULL/.test(et) ? 'Full-Time' : /PART/.test(et) ? 'Part-Time' : /CONTRACT|TEMP/.test(et) ? 'Contract' : '';
    const idv = j.identifier && (j.identifier.value || j.identifier);
    return {
      role: clean(plain(j.title), 140), company: clean(plain(typeof org === 'string' ? org : org && org.name), 100),
      location: String(location).slice(0, 100), salary: String(salary).slice(0, 80), jobType,
      workMode: /TELECOMMUTE/i.test(j.jobLocationType || '') ? 'Remote' : '',
      jd: plain(j.description || '').slice(0, 6000), id: typeof idv === 'string' || typeof idv === 'number' ? String(idv) : ''
    };
  }
  function atsCompany() {
    const h = location.hostname.toLowerCase(), p = location.pathname.split('/').filter(Boolean);
    const nm = x => { try { return S.slugToName(decodeURIComponent(x)); } catch (e) { return S.slugToName(x); } };
    if (/(greenhouse\.io|lever\.co|ashbyhq\.com|smartrecruiters\.com)$/.test(h)) return p[0] && !/^(embed|jobs)$/i.test(p[0]) ? nm(p[0]) : '';
    if (/workable\.com$/.test(h)) return p[0] && p[0] !== 'j' ? nm(p[0]) : '';
    if (/(myworkdayjobs|recruitee|zohorecruit|keka|darwinbox|bamboohr|freshteam)\./.test(h)) {
      const sub = h.split('.')[0];
      if (!/^(www|careers|jobs|apply|wd\d*)$/.test(sub)) return nm(sub);
    }
    return '';
  }
  function hostCompany() {
    if (S.hostLabelIsNoise(location.hostname)) return '';      // "career5.successfactors.eu" is a hiring system, not a company
    const x = location.hostname.replace(/^(www|careers|jobs|apply|talent|work|hr)\./i, '').split('.')[0];
    return x ? x.charAt(0).toUpperCase() + x.slice(1) : '';
  }
  const SRC_RANK = { ld: 4, adp: 3, ats: 2, meta: 1, host: 0 };

  function extract(opts) {
    opts = opts || {};
    const c = { company: [], role: [] };
    const add = (f, v, src) => { if (f === 'role') v = S.cleanRole(v); if (v) c[f].push({ v, src, r: SRC_RANK[src] }); };

    let ld = null;
    try { const j = ldJob(); if (j) ld = ldFields(j); } catch (e) {}
    const adpRole = firstBy(sels('role'), 140), adpCompany = firstBy(sels('company'), 100);
    if (ld && adpRole && ld.role) {            // guard against stale JSON-LD left over from the previous job in a single-page app
      const a = adpRole.toLowerCase(), b = ld.role.toLowerCase();
      if (!S.sameRole(adpRole, ld.role) && a.indexOf(b) < 0 && b.indexOf(a) < 0) ld = null;
    }
    if (ld) { add('company', ld.company, 'ld'); add('role', ld.role, 'ld'); }
    add('company', adpCompany, 'adp'); add('role', adpRole, 'adp');
    add('company', atsCompany(), 'ats');

    let split = {};
    try { if (adapter.titleSplit) split = adapter.titleSplit(document.title) || {}; } catch (e) {}
    let metaRole = clean(split.role, 140);
    if (!metaRole && !adapter.titleSplit) {
      const t = (document.title || '').split(/\s[|\-–—]\s/)[0];
      metaRole = clean(t, 140);
    }
    add('role', metaRole, 'meta'); add('company', clean(split.company, 100), 'meta');
    if (adapter.generic || adapter.ats) {
      const og = document.querySelector('meta[property="og:site_name"]');
      add('company', clean(og && og.content, 60), 'meta');
    }
    if (!adapter.alwaysConfirm) add('company', hostCompany(), 'host');

    const best = f => c[f].sort((a, b) => b.r - a.r)[0] || { v: '', src: '', r: -1 };
    const co = best('company'), ro = best('role');
    let conf = 'low';
    if (co.v && ro.v) conf = (co.r >= 3 && ro.r >= 3) || (co.r >= 2 && ro.r >= 3) ? 'high' : (co.r >= 1 && ro.r >= 1 ? 'medium' : 'low');

    // optional facts (location, salary, type, mode)
    const h1 = document.querySelector('h1');
    const head = h1 && h1.closest('section,article,header,[class*="top"],[class*="header"]');
    const headTxt = head ? String(head.innerText || '').slice(0, 800).toLowerCase() : '';
    const jobType = (ld && ld.jobType) || (/internship/.test(((ro.v || '') + ' ' + headTxt).toLowerCase()) ? 'Internship' : /full[- ]time/.test(headTxt) ? 'Full-Time' : /part[- ]time/.test(headTxt) ? 'Part-Time' : adapter.jobTypeDefault || '');
    const workMode = (ld && ld.workMode) || (/work from home|remote/.test(headTxt) ? 'Remote' : /hybrid/.test(headTxt) ? 'Hybrid' : '');
    const out = {
      company: co.v, role: ro.v, conf, srcs: { company: co.src, role: ro.src },
      location: (ld && ld.location) || firstBy(sels('location'), 100), salary: (ld && ld.salary) || firstBy(sels('salary'), 80),
      jobType, workMode, platform: adapter.platform, url: location.href, urlKey: S.urlKey(location.href), jd: '', conf2: conf
    };
    if (opts.withJd) out.jd = (ld && ld.jd) || textBy(sels('jd'), 6000);
    return out;
  }

  // ───────────────────────── per-tab state (kept by the background worker) ─────────────────────────
  function armedRecently() {
    return tabState.armLevel > 0 && Date.now() - tabState.armedAt < (tabState.inherited ? 10 : 5) * 60000;
  }
  function arm(level, ex) {
    tabState.armLevel = Math.max(tabState.armLevel, level); tabState.armedAt = Date.now(); tabState.inherited = false;
    if (ex && ex.company && ex.role) tabState.draft = ex;
    send({ type: 'ARM', level: tabState.armLevel, draft: tabState.draft });
    startWatching();
  }
  function disarm() {
    tabState.armLevel = 0; tabState.draft = null; tabState.ask = null;
    send({ type: 'DISARM' }); stopWatching();
  }
  function pushDraft() {
    const ex = extract({ withJd: true });
    if ((ex.company && ex.role && ex.conf !== 'low') || (adapter.alwaysConfirm && (ex.company || ex.role))) {
      tabState.draft = ex; send({ type: 'DRAFT_SET', draft: ex });
    }
    return ex;
  }

  // ───────────────────────── UI (Shadow DOM so page CSS can never break it) ─────────────────────────
  let uiHost = null, uiRoot = null;
  const CSS = `
    :host{all:initial}*{box-sizing:border-box;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
    .ov{position:fixed;inset:0;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;z-index:2147483645}
    .card{background:#fff;color:#0f172a;border-radius:14px;padding:22px;width:400px;max-width:92vw;box-shadow:0 24px 70px rgba(15,23,42,.35)}
    .ttl{font-size:16px;font-weight:700;margin:0 0 2px}.sub{font-size:13px;color:#475569;margin:0 0 14px}
    label{display:block;font-size:12px;font-weight:600;color:#475569;margin:0 0 4px}
    input,select{width:100%;padding:10px 12px;border:1.5px solid #cbd5e1;border-radius:8px;font-size:14px;color:#0f172a;background:#fff;margin-bottom:12px;outline:none}
    input:focus,select:focus{border-color:#1a56ff;box-shadow:0 0 0 3px rgba(26,86,255,.15)}input.bad{border-color:#dc2626}
    .row{display:flex;gap:8px;margin-top:4px}
    .btn{flex:1;padding:11px 14px;border:0;border-radius:8px;font-size:14px;font-weight:600;cursor:pointer;background:#e2e8f0;color:#0f172a}
    .btn.p{background:#1a56ff;color:#fff}.btn.p:hover{background:#1445d6}.btn:focus-visible{outline:3px solid rgba(26,86,255,.4);outline-offset:2px}
    .toast{position:fixed;right:20px;bottom:20px;display:flex;align-items:center;gap:12px;background:#0f172a;color:#fff;padding:12px 14px 12px 16px;border-radius:10px;font-size:14px;box-shadow:0 8px 30px rgba(15,23,42,.35);z-index:2147483647;max-width:min(420px,92vw)}
    .toast.ok{border-left:4px solid #22c55e}.toast.warn{border-left:4px solid #f59e0b}.toast.info{border-left:4px solid #60a5fa}
    .toast button{background:none;border:0;color:#93c5fd;font-weight:700;font-size:13px;cursor:pointer;padding:4px 6px;border-radius:6px}.toast button:hover{background:rgba(255,255,255,.1)}
    .bar{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#fff;color:#0f172a;border:1.5px solid #1a56ff;border-radius:12px;padding:12px 14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;box-shadow:0 10px 36px rgba(15,23,42,.3);z-index:2147483646;max-width:min(560px,94vw);font-size:14px}
    .bar b{font-weight:700}.bar .btn{flex:none;padding:8px 12px;font-size:13px}
    .ban{position:fixed;top:16px;right:16px;width:290px;background:#fff;color:#0f172a;border:2px solid #1a56ff;border-radius:12px;padding:12px 14px;box-shadow:0 8px 28px rgba(26,86,255,.22);z-index:2147483646;font-size:13px;line-height:1.4}
    .ban .x{position:absolute;top:6px;right:8px;background:none;border:0;font-size:18px;color:#94a3b8;cursor:pointer}.ban .st{display:inline-block;margin-top:6px;padding:2px 9px;border-radius:99px;background:#eff6ff;color:#1d4ed8;font-weight:600;font-size:12px}
    .fab{position:fixed;right:18px;bottom:84px;height:40px;min-width:40px;border-radius:20px;border:0;background:#1a56ff;color:#fff;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 6px 20px rgba(26,86,255,.4);z-index:2147483640;padding:0 12px;display:flex;align-items:center;gap:6px;overflow:hidden;max-width:40px;transition:max-width .2s}
    .fab:hover,.fab:focus-visible{max-width:180px}.fab span{white-space:nowrap}
    @media (prefers-reduced-motion:reduce){.fab{transition:none}}`;

  function el(tag, props) {
    const e = document.createElement(tag);
    if (props) for (const k in props) {
      if (k === 'text') e.textContent = props[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), props[k]);
      else if (props[k] != null && props[k] !== false) e.setAttribute(k, props[k]);
    }
    for (let i = 2; i < arguments.length; i++) [].concat(arguments[i]).forEach(c => { if (c) e.append(c.nodeType ? c : document.createTextNode(c)); });
    return e;
  }
  function layer() {
    if (!uiHost || !uiHost.isConnected) {
      uiHost = document.createElement('div'); uiHost.id = 'appliedin-host';
      uiRoot = uiHost.attachShadow({ mode: 'closed' });
      uiRoot.appendChild(el('style', { text: CSS }));
      uiRoot.appendChild(el('div', { id: 'l' }));
      document.documentElement.appendChild(uiHost);
    }
    return uiRoot.getElementById ? uiRoot.getElementById('l') : uiRoot.querySelector('#l');
  }
  function inUi(e) { return !!(uiHost && e.composedPath && e.composedPath().indexOf(uiHost) >= 0); }
  function drop(sel) { if (uiRoot) uiRoot.querySelectorAll(sel).forEach(n => n.remove()); }

  const UI = {
    toast(p) {
      const L = layer(); drop('.toast');
      const t = el('div', { class: 'toast ' + (p.kind || 'info'), role: 'status' }, el('span', { text: p.msg }));
      (p.actions || []).forEach(a => t.appendChild(el('button', { type: 'button', text: a.label, onclick: () => { t.remove(); runAction(a); } })));
      L.appendChild(t); setTimeout(() => t.remove(), (p.actions && p.actions.length) ? 9000 : 4500);
    },
    confirm(p) {
      const L = layer(); drop('.ov'); drop('.fab');
      const d = p.data || {}, mode = p.mode || 'new';
      const co = el('input', { id: 'co', maxlength: 100, value: d.company || '', placeholder: 'Company name' });
      const ro = el('input', { id: 'ro', maxlength: 140, value: d.role || '', placeholder: 'Job role' });
      co.value = d.company || ''; ro.value = d.role || '';
      const stSel = el('select', { id: 'st' }, el('option', { value: 'Applied', text: 'I have applied' }), el('option', { value: 'Saved', text: 'Save for later' }));
      const miss = !d.company || !d.role;
      const title = mode === 'edit' ? 'Edit saved application' : mode === 'track' ? 'Track this job' : 'Application detected';
      const sub = mode === 'edit' ? 'Fix any detail below.' : miss ? 'We could not read every detail — please fill in the red fields.' : 'Check the details and save.';
      const ov = el('div', { class: 'ov' });
      function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); }
      function onKey(e) { if (e.key === 'Escape') close(); if (e.key === 'Enter' && !e.shiftKey && uiRoot.activeElement && uiRoot.activeElement.tagName === 'INPUT') { e.preventDefault(); save(); } }
      async function save() {
        const c = co.value.trim(), r = ro.value.trim();
        co.classList.toggle('bad', !c); ro.classList.toggle('bad', !r);
        if (!c || !r) { (!c ? co : ro).focus(); return; }
        close();
        if (mode === 'edit') { const u = await send({ type: 'UPDATE_APP', id: p.id, changes: { company: c, role: r } }); UI.toast(u && u.ok ? { msg: 'Updated — ' + c, kind: 'ok' } : { msg: '⚠ Could not update. Open the AppliedIn dashboard to edit it.', kind: 'warn' }); return; }
        const status = mode === 'track' ? stSel.value : 'Applied';
        const res = await send({ type: 'SAVE_APP', data: Object.assign({}, d, { company: c, role: r, status, date: new Date().toISOString(), source: mode === 'track' ? 'manual' : 'auto' }) });
        afterSave(res, c, d, status);
      }
      const card = el('div', { class: 'card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'AppliedIn' },
        el('p', { class: 'ttl', text: '📋 AppliedIn — ' + title }), el('p', { class: 'sub', text: sub }),
        el('label', { for: 'co', text: 'Company' }), co, el('label', { for: 'ro', text: 'Job role' }), ro,
        mode === 'track' ? [el('label', { for: 'st', text: 'Status' }), stSel] : null,
        el('div', { class: 'row' }, el('button', { class: 'btn p', type: 'button', text: mode === 'edit' ? 'Save changes' : 'Save application', onclick: save }), el('button', { class: 'btn', type: 'button', text: 'Skip', onclick: close })));
      co.classList.toggle('bad', !d.company); ro.classList.toggle('bad', !d.role);
      ov.appendChild(card); ov.addEventListener('click', e => { if (e.target === ov) close(); });
      L.appendChild(ov); document.addEventListener('keydown', onKey, true);
      setTimeout(() => (!co.value ? co : !ro.value ? ro : co).focus(), 50);
    },
    ask(p) {
      const L = layer(); drop('.bar');
      const d = p.data;
      const bar = el('div', { class: 'bar', role: 'alertdialog', 'aria-label': 'AppliedIn' },
        el('span', {}, 'Did you apply for ', el('b', { text: d.role }), ' at ', el('b', { text: d.company }), '?'),
        el('button', { class: 'btn p', type: 'button', text: 'Yes, save it', onclick: async () => {
          bar.remove(); send({ type: 'ASK_CLEAR' }); tabState.ask = null;
          const res = await send({ type: 'SAVE_APP', data: Object.assign({}, d, { status: 'Applied', date: new Date().toISOString(), source: 'auto' }) });
          afterSave(res, d.company, d, 'Applied');
        } }),
        el('button', { class: 'btn', type: 'button', text: 'Edit first', onclick: () => { bar.remove(); send({ type: 'ASK_CLEAR' }); UI.confirm({ data: d, mode: 'new' }); } }),
        el('button', { class: 'btn', type: 'button', text: 'Not yet', onclick: () => { bar.remove(); send({ type: 'ASK_CLEAR' }); tabState.ask = null; } }));
      L.appendChild(bar);
    },
    banner(p) {
      const L = layer(); drop('.ban');
      const a = p.app, saved = a.status === 'Saved';
      const when = a.date ? new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'earlier';
      const b = el('div', { class: 'ban', role: 'status' },
        el('button', { class: 'x', type: 'button', 'aria-label': 'Close', text: '×', onclick: () => b.remove() }),
        el('b', { text: saved ? '🔖 You saved this job' : '✅ Already applied' }), el('br'),
        el('span', { text: (a.company || '') + ' · ' + String(a.role || '').slice(0, 40) }), el('br'),
        el('span', { text: (saved ? 'Saved ' : 'Applied ') + when + ' via ' + (a.platform || 'AppliedIn') }), el('br'),
        el('span', { class: 'st', text: a.status || 'Applied' }));
      L.appendChild(b); setTimeout(() => b.remove(), 9000);
    },
    fab(p) {
      const L = layer(); drop('.fab');
      L.appendChild(el('button', { class: 'fab', type: 'button', 'aria-label': 'Track this job with AppliedIn', onclick: () => UI.confirm({ data: p.data, mode: 'track' }) },
        el('b', { text: '＋' }), el('span', { text: 'Track this job' })));
    }
  };
  function ui(name, payload) { if (IS_TOP) UI[name](payload); else send({ type: 'UI_FORWARD', name, payload }); }
  function runAction(a) {
    if (a.do === 'undo') send({ type: 'DELETE_APP', id: a.id }).then(() => UI.toast({ msg: 'Removed from AppliedIn', kind: 'info' }));
    else if (a.do === 'edit') UI.confirm({ data: a.data, id: a.id, mode: 'edit' });
    else if (a.do === 'view') send({ type: 'OPEN_DASH', hash: a.hash || '#applications' });
    else if (a.do === 'again') send({ type: 'SAVE_APP', force: true, data: a.data }).then(r => afterSave(r, a.data.company, a.data, a.data.status));
  }
  function afterSave(res, company, data, status) {
    const q = '#applications?q=' + encodeURIComponent(company);
    if (res && res.saved) {
      UI.toast({
        msg: (res.promoted ? 'Moved to Applied — ' : status === 'Saved' ? 'Saved for later — ' : res.upgraded ? 'Updated — ' : 'Saved — ') + company + (res.total ? '  (#' + res.total + ')' : ''), kind: 'ok',
        actions: [{ label: 'View', do: 'view', hash: q }, { label: 'Edit', do: 'edit', id: res.id, data: { company, role: data.role } }, { label: 'Undo', do: 'undo', id: res.id }]
      });
    } else if (res && res.duplicate) {
      const e = res.existing || {};
      UI.toast({ msg: 'NOT added — you already have “' + String(e.role || '').slice(0, 40) + '” at ' + (e.company || company) + ' (' + (e.status || 'Applied') + ', ' + new Date(e.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + '). Same ' + (res.reason || 'job') + '.', kind: 'warn',
        actions: [{ label: 'Add again', do: 'again', data: Object.assign({}, data, { company, status: status || 'Applied' }) }, { label: 'View', do: 'view', hash: q }] });
    } else {
      const why = sendFail === 'stale' ? 'AppliedIn was updated — refresh this page (F5), then try again.'
        : sendFail === 'down' ? 'AppliedIn’s background service is not running. Open chrome://extensions and press reload on AppliedIn.'
        : (res && res.error) ? 'Could not save: ' + res.error : 'Could not save. Open the AppliedIn popup and add it manually.';
      UI.toast({ msg: '⚠ NOT saved. ' + why, kind: 'warn' });
    }
    loadIndex();
  }

  // ───────────────────────── apply / submit clicks ─────────────────────────
  function labelOf(el) { return String(el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function eq(label, arr) { return arr.indexOf(label) >= 0; }
  function starts(label, arr) { return arr.some(x => label === x || label.indexOf(x + ' ') === 0); }

  function onClick(e) {
    if (inUi(e) || !e.target || !e.target.closest) return;
    const b = e.target.closest('button,a,[role="button"],input[type="submit"],input[type="button"]');
    if (!b) return;
    const label = labelOf(b);
    if (!label || label.length > 40) return;
    const isApply = eq(label, adapter.applyText || ADP.DEFAULT_APPLY);
    const isSubmit = starts(label, adapter.submitText || ADP.DEFAULT_SUBMIT);
    if (!isApply && !isSubmit) return;
    const ex = extract({ withJd: true });
    arm(isSubmit ? 2 : 1, ex);
    const external = isApply && ((b.tagName === 'A' && (b.target === '_blank' || (b.host && b.host !== location.host))) || eq(label, adapter.externalText || []));
    if (external && ex.company && ex.role) {
      tabState.ask = { data: ex, at: Date.now() };
      send({ type: 'ASK_SET', ask: tabState.ask });
    }
  }

  // ───────────────────────── success detection ─────────────────────────
  function successUrlNow() { return !!(adapter.successUrl && adapter.successUrl.test(location.href)); }
  function visibleInputs() {
    return document.querySelectorAll('input[type="text"]:not([readonly]),input[type="email"]:not([readonly]),input[type="tel"]:not([readonly]),textarea:not([readonly]),select').length;
  }
  function isSuccess() {
    if (adapter.successSelectors && armedRecently()) {
      for (const sel of adapter.successSelectors) {
        try {
          const e = document.querySelector(sel);
          if (e && e.innerText && e.innerText.trim().length > 10 && !/error|failed|invalid/i.test(e.innerText)) return true;
        } catch (x) {}
      }
    }
    const body = String((document.body && document.body.innerText) || '').slice(0, 250000).toLowerCase();
    const strong = sels('success').concat(ADP.GENERIC_STRONG);
    if (strong.some(p => body.indexOf(p) >= 0)) return true;
    const level2 = tabState.armLevel >= 2 || successUrlNow();
    if (level2 && visibleInputs() <= 3) {
      if ((adapter.weak || []).concat(ADP.GENERIC_WEAK).some(p => body.indexOf(p) >= 0)) return true;
    }
    return false;
  }
  function startWatching() {
    watchUntil = Date.now() + (tabState.inherited ? 10 : 5) * 60000;
    if (!watchTimer) watchTimer = setInterval(tick, 1000);
    if (!watchMo && document.body) { watchMo = new MutationObserver(debounce(tick, 350)); watchMo.observe(document.body, { childList: true, subtree: true, characterData: true }); }
  }
  function stopWatching() {
    clearInterval(watchTimer); watchTimer = null;
    if (watchMo) { watchMo.disconnect(); watchMo = null; }
  }
  function tick() {
    if (handled) return;
    if (Date.now() > watchUntil) { stopWatching(); return; }
    if (adapter.contextRequired && !(JOBURL.test(location.pathname + location.search) || tabState.draft)) return;
    if (isSuccess()) finalize();
  }
  function doneKey() { return 'appliedin_done:' + location.href; }

  async function finalize() {
    if (handled) return; handled = true; stopWatching();
    try { sessionStorage.setItem(doneKey(), '1'); } catch (e) {}
    const cur = extract({ withJd: true }), dr = tabState.draft;
    let d = cur;
    if (dr && (cur.conf !== 'high' || !cur.company || !cur.role)) {
      d = Object.assign({}, cur);
      ['company', 'role', 'location', 'salary', 'jobType', 'workMode', 'jd', 'url', 'urlKey'].forEach(k => { if (dr[k]) d[k] = dr[k]; });
      d.conf = dr.conf;
    }
    const data = Object.assign({}, d, { platform: adapter.platform, status: 'Applied', date: new Date().toISOString(), source: 'auto', conf: d.conf });
    if (d.conf === 'high' && !adapter.alwaysConfirm && d.company && d.role) {
      const res = await send({ type: 'SAVE_APP', data });
      if (IS_TOP) afterSave(res, d.company, data, 'Applied');
      else send({ type: 'UI_FORWARD', name: 'toast', payload: res && res.saved ? { msg: 'Saved — ' + d.company, kind: 'ok', actions: [{ label: 'View', do: 'view', hash: '#applications?q=' + encodeURIComponent(d.company) }, { label: 'Undo', do: 'undo', id: res.id }] } : { msg: res && res.duplicate ? 'NOT added — already tracked (' + ((res.existing || {}).status || 'Applied') + ')' : '⚠ NOT saved. ' + ((res && res.error) || 'AppliedIn is not running — reload it on chrome://extensions.'), kind: 'warn', actions: res && res.duplicate ? [{ label: 'Add again', do: 'again', data: Object.assign({}, data, { company: d.company }) }] : [] } });
    } else ui('confirm', { data, mode: 'new' });
    disarm();
  }

  // ───────────────────────── "Did you apply?" when you come back from an external site ─────────────────────────
  function onVisibility() {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    loadIndex();
    const a = tabState.ask;
    if (!a || handled || !IS_TOP) return;
    if (Date.now() - a.at > 20 * 60000) { tabState.ask = null; send({ type: 'ASK_CLEAR' }); return; }
    if (hiddenAt && Date.now() - hiddenAt > 5000) UI.ask({ data: a.data });
  }

  // ───────────────────────── already-applied banner, list badges, track button ─────────────────────────
  async function loadIndex() {
    const r = await send({ type: 'GET_INDEX' });
    index = Array.isArray(r) ? r : [];
    byKey = new Map(); index.forEach(a => { if (a.urlKey) byKey.set(a.urlKey, a); });
  }
  function trackedMatch(ex) {
    return index.find(a => (ex.urlKey && a.urlKey === ex.urlKey) || (ex.company && ex.role && S.sameCompany(a.company, ex.company) && S.sameRole(a.role, ex.role)));
  }
  let badgeRuns = 0; const seen = new WeakSet();
  function markLinks() {
    if (!settings.badges || !byKey.size || badgeRuns++ > 60) return;
    const links = document.querySelectorAll('a[href]');
    for (let i = 0; i < links.length && i < 800; i++) {
      const a = links[i]; if (seen.has(a)) continue;
      seen.add(a);
      const rec = byKey.get(S.urlKey(a.href));
      if (!rec || rec.status === 'Saved' || (a.textContent || '').trim().length < 3) continue;
      if (a.nextSibling && a.nextSibling.nodeType === 1 && a.nextSibling.getAttribute('data-ai-badge')) continue;
      const b = document.createElement('span');
      b.setAttribute('data-ai-badge', '1'); b.textContent = '✓ Applied';
      b.title = 'AppliedIn: ' + rec.status + ' on ' + new Date(rec.date).toLocaleDateString('en-IN');
      b.style.cssText = 'display:inline-block;margin-left:6px;padding:1px 7px;border-radius:99px;background:#dcfce7;color:#166534;font:600 11px/1.6 system-ui,sans-serif;vertical-align:middle;white-space:nowrap';
      try { a.insertAdjacentElement('afterend', b); } catch (e) {}
    }
  }
  // "My applications" pages: read the status text next to each tracked job link and update our record.
  let syncRuns = 0;
  function runSync() {
    if (!byKey.size || syncRuns++ > 6) return;
    const updates = [], done = new Set();
    document.querySelectorAll('a[href]').forEach(a => {
      const k = S.urlKey(a.href), rec = k && byKey.get(k);
      if (!rec || done.has(rec.id)) return;
      const box = a.closest('li,tr,article,[class*="card"],[class*="row"],[class*="item"]') || (a.parentElement && a.parentElement.parentElement);
      if (!box) return;
      const keys = new Set(); box.querySelectorAll('a[href]').forEach(x => { const kk = S.urlKey(x.href); if (kk) keys.add(kk); });
      if (keys.size > 1) return;                       // this container holds several jobs — unsafe to guess
      const st = S.statusFromText(box.innerText);
      if (st && st !== rec.status) { updates.push({ id: rec.id, status: st }); done.add(rec.id); }
    });
    if (updates.length) send({ type: 'SYNC_STATUS', updates }).then(r => {
      if (r && r.changed) { UI.toast({ msg: 'AppliedIn updated ' + r.changed + ' status' + (r.changed > 1 ? 'es' : '') + ' from ' + adapter.platform, kind: 'ok' }); loadIndex(); }
    });
  }

  function onPage() {
    handled = false;
    try { handled = !!sessionStorage.getItem(doneKey()); } catch (e) {}
    syncMode = inList(adapter.sync);
    skipPage = (adapter.requirePath && pathLower().indexOf(adapter.requirePath) < 0) || (!syncMode && (inList(adapter.skip) || (!adapter.alwaysConfirm && inList(ADP.COMMON_SKIP))));
    drop('.ban'); drop('.fab');
    if (skipPage) return;
    setTimeout(markLinks, 1500);
    if (syncMode) { setTimeout(runSync, 2500); return; }
    setTimeout(function () {
      if (adapter.contextRequired && !jobContextOk()) return;
      const ex = pushDraft();
      const m = trackedMatch(ex);
      if (m && IS_TOP) { UI.banner({ app: m }); return; }
      if (!m && IS_TOP && settings.showTrackButton && ex.company && ex.role && ex.conf !== 'low' && !adapter.alwaysConfirm && !armedRecently()) UI.fab({ data: ex });
    }, 1800);
    if (armedRecently() || (successUrlNow() && (tabState.draft || adapter.alwaysConfirm))) startWatching();
  }
  function jobContextOk() { return JOBURL.test(location.pathname + location.search) || !!ldJob(); }

  // ───────────────────────── boot ─────────────────────────
  async function start() {
    let cfg = {};
    try { cfg = await chrome.storage.local.get(['settings', 'remoteConfig']); } catch (e) { return; }
    settings = Object.assign(settings, cfg.settings || {});
    if (!settings.enabled) return;
    remote = settings.remoteConfig !== false ? cfg.remoteConfig || null : null;
    const st = await send({ type: 'TAB_STATE' });
    if (st) tabState = Object.assign(tabState, st);
    await loadIndex();
    document.addEventListener('click', onClick, true);
    document.addEventListener('visibilitychange', onVisibility);
    if (IS_TOP) chrome.runtime.onMessage.addListener(m => { if (m && m.type === 'UI_SHOW' && UI[m.name]) UI[m.name](m.payload); });
    onPage();
    new MutationObserver(debounce(markLinks, 1500)).observe(document.documentElement, { childList: true, subtree: true });
    setInterval(function () {            // single-page-app navigation (LinkedIn, Naukri, Unstop …)
      if (location.href === lastUrl) return;
      lastUrl = location.href; badgeRuns = 0; syncRuns = 0;
      if (!armedRecently()) { tabState.draft = null; send({ type: 'DRAFT_CLEAR' }); }
      loadIndex().then(onPage);
    }, 800);
  }
  start();
})();
