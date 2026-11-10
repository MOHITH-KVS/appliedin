// AppliedIn v1.1 — shared pure helpers (used by service worker, popup, dashboard and content scripts)
(function (g) {
  const STATUSES = ['Saved', 'Applied', 'In Review', 'Shortlisted', 'Interview', 'Offer', 'Rejected', 'No Response'];
  const RANK = { 'Saved': 0, 'Applied': 1, 'In Review': 2, 'Shortlisted': 3, 'Interview': 4, 'Offer': 5 };
  const RESPONDED = ['In Review', 'Shortlisted', 'Interview', 'Offer', 'Rejected'];
  const LEGAL = /\b(private|pvt|limited|ltd|llc|llp|inc|incorporated|corp|corporation|co|plc|gmbh|opc)\b/g;
  const FILLER = /\b(fresher|freshers|hiring|urgent|opening|openings|immediate|walk in|walkin|apply|now|batch|20\d\d)\b/g;

  function words(s) {
    return String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/&/g, ' and ')
      .replace(/[^a-z0-9\u0900-\u0dff ]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function normCompany(s) { return words(s).replace(LEGAL, ' ').replace(/\s+/g, ' ').trim(); }
  function normRole(s) { return words(s).replace(FILLER, ' ').replace(/\s+/g, ' ').trim(); }

  function sameCompany(a, b) {
    a = normCompany(a); b = normCompany(b);
    if (!a || !b) return false;
    if (a === b) return true;
    const s = a.length <= b.length ? a : b, l = a.length <= b.length ? b : a;
    return s.length >= 4 && l.indexOf(s + ' ') === 0;
  }
  function sameRole(a, b) {
    a = normRole(a); b = normRole(b);
    if (!a || !b) return false;
    if (a === b) return true;
    const ta = new Set(a.split(' ')), tb = new Set(b.split(' '));
    let inter = 0; ta.forEach(t => { if (tb.has(t)) inter++; });
    return inter / (ta.size + tb.size - inter) >= 0.8;
  }

  // Stable per-job key from a URL. Empty string when the URL has no usable identity.
  function urlKey(u) {
    try {
      const x = new URL(u), h = x.hostname.replace(/^www\./, '').toLowerCase();
      const p = x.pathname.replace(/\/+$/, ''), q = x.searchParams;
      let m;
      if (/(^|\.)linkedin\.com$/.test(h)) {
        m = p.match(/\/jobs\/view\/(?:[^\/?#]*?-)?(\d{6,})/);
        const id = m ? m[1] : q.get('currentJobId');
        return id ? 'li:' + id : '';
      }
      if (/(^|\.)naukri\.com$/.test(h)) { m = p.match(/-(\d{8,})$/); return m ? 'nk:' + m[1] : ''; }
      if (/(^|\.)indeed\.com$/.test(h)) { const id = q.get('jk') || q.get('vjk'); return id ? 'in:' + id : ''; }
      if (/(^|\.)glassdoor\./.test(h)) { const id = q.get('jobListingId') || q.get('jl'); return id ? 'gd:' + id : ''; }
      if (/(^|\.)internshala\.com$/.test(h)) { m = p.match(/\/(?:internship|job)\/detail\/.*?(\d{5,})$/); return m ? 'is:' + m[1] : ''; }
      if (h === 'docs.google.com') { m = p.match(/\/forms\/d\/e\/([^\/]+)/); return m ? 'gf:' + m[1] : ''; }
      // Any other site: a URL only identifies ONE job if it contains a real job id.
      // "careers.acme.com/openings" is a listing page shared by many jobs, so it gets NO key.
      const path = p.toLowerCase().replace(/\/(formresponse|viewform|apply|application)$/, '');
      let id = '';
      q.forEach((v, k) => {
        if (id || v.length < 3 || v.length > 60) return;
        if (/(^|[_-])(id|req|reqid|jid|job|jobid|posting|position|opening|vacancy|requisition)([_-]|$)|jobid|reqid|requisition/i.test(k)) id = '?' + k.toLowerCase() + '=' + v.toLowerCase();
      });
      if (!id) {
        const segs = path.split('/').filter(Boolean);
        const hit = segs.some(sg => /^\d{5,}$/.test(sg) || /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(sg) || /[-_]\d{4,}$/.test(sg) || /^[a-z]{0,4}\d{5,}$/.test(sg));
        if (!hit) return '';
      }
      return h + path + id;
    } catch (e) { return ''; }
  }

  function canonicalUrl(u) {
    try {
      const k = urlKey(u);
      if (k.indexOf('li:') === 0) return 'https://www.linkedin.com/jobs/view/' + k.slice(3) + '/';
      const x = new URL(u); x.hash = '';
      Array.from(x.searchParams.keys()).forEach(p => {
        if (/^(utm_|fbclid|gclid|trk|refid|trackingid|ref$|src$|source$|lipi|midtoken|midsig|eid$)/i.test(p)) x.searchParams.delete(p);
      });
      return x.toString();
    } catch (e) { return u || ''; }
  }

  // Best-effort status detection from the text around a job link on a portal's "my applications" page.
  function statusFromText(t) {
    t = String(t || '').toLowerCase().replace(/\s+/g, ' ');
    if (/not (been )?(selected|shortlisted)|unsuccessful|rejected|declined|not moving forward|position (has been )?filled|no longer (under )?consider/.test(t)) return 'Rejected';
    if (/interview (scheduled|invite|round|call|slot)|scheduled (an |for )?interview|invited (you )?(to|for) (an )?interview/.test(t)) return 'Interview';
    if (/shortlisted|shortlist(ed)? by/.test(t)) return 'Shortlisted';
    if (/(application|profile|resume|cv) (was |has been |is )?(viewed|seen|reviewed|downloaded|under review)|viewed by (the )?(employer|recruiter|company)|recruiter (viewed|action)|in review|under review|application viewed/.test(t)) return 'In Review';
    return '';
  }

  function slugToName(s) {
    return String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).trim();
  }


  // ───────── title cleanup: "Career Opportunities: MIS Analyst (578627)" → "MIS Analyst" ─────────
  function cleanRole(s) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    s = s.replace(/^(career opportunities|job opportunities|job details?|job opening|job description|careers?|apply(?: for| now)?|position|vacancy|requisition)\s*[:\-–|]\s*/i, '');
    s = s.replace(/\s*[\(\[]\s*(?:req(?:uisition)?\s*(?:id|#)?\s*:?\s*)?[A-Za-z]{0,4}\d{3,}[A-Za-z0-9\-]*\s*[\)\]]\s*$/i, '');
    s = s.replace(/\s*[-–|]\s*(?:req(?:uisition)?\s*(?:id|#)?\s*:?\s*)?\d{4,}\s*$/i, '');
    s = s.replace(/\s*[-–|]\s*(careers?|jobs?)\s*$/i, '');
    return s.trim();
  }
  // Host labels that are hiring systems, not company names ("career5.successfactors.eu" is not "Career5")
  function hostLabelIsNoise(host) {
    host = String(host || '').toLowerCase();
    if (/(successfactors|taleo|oraclecloud|icims|workday|myworkdayjobs|brassring|ultipro|paylocity|smartrecruiters|greenhouse|lever\.co|ashbyhq|workable|recruitee|zohorecruit|keka|darwinbox|bamboohr|freshteam|jobvite|phenom|eightfold|avature|cornerstone|peoplestrong)/.test(host)) return true;
    const label = host.replace(/^(www|careers?|jobs?|apply|talent|work|hr)\./, '').split('.')[0];
    return /^(career|careers|job|jobs|hcm|ats|apply|talent|recruit|recruiting|wd)\d*$/.test(label);
  }

  // ───────── email reply detection (runs locally in the user's open Gmail tab) ─────────
  function classifyEmail(text) {
    const t = String(text || '').toLowerCase().replace(/\s+/g, ' ');
    if (/unfortunately|regret to inform|not (be )?moving forward|will not be proceeding|not been selected|not selected|other candidates|decided not to (move|proceed|continue)|unable to (offer|proceed|move forward)|position has been filled|we won'?t be (moving|proceeding)|not shortlisted/.test(t)) return { status: 'Rejected', reason: 'rejection wording' };
    if (/offer letter|job offer|offer of employment|pleased to offer|delighted to offer|happy to offer|we are excited to offer|letter of intent/.test(t)) return { status: 'Offer', reason: 'offer wording' };
    const notInterview = /(interview (tips|questions|preparation|prep|guide|series|experience)|mock interview|how to (crack|ace|prepare))/.test(t);
    if (!notInterview && /interview (schedule|scheduled|invitation|invite|round|slot|link|confirmation|details|for|with|at|on|call|process|request|panel|date|time)|invite you (for|to) (an |a )?(interview|discussion)|schedule (an|your|a) (interview|call|discussion)|technical (round|interview)|hr (round|interview)|video interview|face[- ]to[- ]face interview|virtual interview/.test(t)) return { status: 'Interview', reason: 'interview wording' };
    if (/shortlisted|short-listed|selected for (the )?(next|further) (round|stage|process)|online (assessment|test)|coding (test|assessment|challenge)|aptitude test|assessment link|hackerrank|codility|mettl|hirepro|cocubes|amcat|test link/.test(t)) return { status: 'Shortlisted', reason: 'shortlist / assessment wording' };
    if (/(application|profile|resume|cv) (was |has been |is )?(viewed|seen|reviewed|downloaded|under review)|viewed your (application|profile|resume)|recruiter (viewed|action)|employer viewed/.test(t)) return { status: 'In Review', reason: 'application viewed' };
    return { status: '', reason: '' };
  }
  const GENERIC_CO = ['data', 'cloud', 'tech', 'global', 'services', 'solutions', 'systems', 'digital', 'india', 'group', 'software', 'technologies', 'consulting', 'labs', 'career', 'careers', 'jobs', 'hiring', 'team', 'talent', 'recruitment', 'hr'];
  function domainLabel(email) { const m = String(email || '').toLowerCase().match(/@([^>\s]+)/); if (!m) return ''; const p = m[1].split('.'); return p.length > 2 && p[p.length - 2].length <= 3 ? p[p.length - 3] : p[Math.max(0, p.length - 2)]; }
  function matchEmailToApp(apps, it, status) { const r = matchEmail(apps, it, status || ''); return r && r.app || null; }
  function _oldMatchEmailToApp(apps, it) {
    const hay = ' ' + words([it.fromName, domainLabel(it.fromEmail), it.subject, it.snippet].join(' ')) + ' ';
    const cands = apps.filter(a => {
      if (a.status === 'Saved') return false;
      const c = normCompany(a.company);
      return c.length >= 3 && GENERIC_CO.indexOf(c) < 0 && hay.indexOf(' ' + c + ' ') >= 0;
    });
    if (!cands.length) return null;
    if (cands.length === 1) return cands[0];
    let best = null, bs = -1;
    cands.forEach(a => {
      const toks = normRole(a.role).split(' ').filter(x => x.length > 2);
      const sc = toks.filter(x => hay.indexOf(' ' + x + ' ') >= 0).length * 1000 + Date.parse(a.date) / 1e11;
      if (sc > bs) { bs = sc; best = a; }
    });
    return best;
  }

  // Fair reply statistics: applications younger than 7 days haven't had a chance to get a reply yet.
  function replyStats(apps) {
    const real = apps.filter(a => a.status !== 'Saved');
    const replied = real.filter(a => RESPONDED.indexOf(a.status) >= 0 || (a.history || []).some(x => RESPONDED.indexOf(x.status) >= 0 && !x.auto));
    const cutoff = Date.now() - 7 * 864e5;
    const eligible = real.filter(a => Date.parse(a.date) <= cutoff || replied.indexOf(a) >= 0);
    return { total: real.length, replied: replied.length, eligible: eligible.length, rate: eligible.length ? Math.round(replied.length / eligible.length * 100) : 0 };
  }



  // Several roles at the SAME company? Don't guess — narrow down, and if still unclear return the candidates so the user can pick.
  function matchEmail(apps, it, status) {
    const hay = ' ' + words([it.fromName, domainLabel(it.fromEmail), it.subject, it.snippet].join(' ')) + ' ';
    let cands = apps.filter(a => {
      if (a.status === 'Saved') return false;
      const c = normCompany(a.company);
      return c.length >= 3 && GENERIC_CO.indexOf(c) < 0 && hay.indexOf(' ' + c + ' ') >= 0;
    });
    if (!cands.length) return null;
    if (status) {                                     // keep only applications this reply could actually change
      cands = cands.filter(a => status === 'Rejected' ? (a.status !== 'Offer' && a.status !== 'Rejected')
        : RANK[status] > (RANK[a.status] === undefined ? 1 : RANK[a.status]));
      if (!cands.length) return null;
    }
    if (cands.length === 1) return { app: cands[0] };
    const score = a => normRole(a.role).split(' ').filter(x => x.length > 2 && hay.indexOf(' ' + x + ' ') >= 0).length;
    const ranked = cands.map(a => ({ a, s: score(a) })).sort((x, y) => y.s - x.s);
    if (ranked[0].s > 0 && ranked[0].s > ranked[1].s) return { app: ranked[0].a };
    return { candidates: cands.slice().sort((x, y) => Date.parse(y.date) - Date.parse(x.date)).slice(0, 6) };
  }
  // Gmail search that only looks at mail AFTER you applied; add the role words to narrow it down further.
  const ymd = d => { d = new Date(d); return d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate(); };
  function mailQuery(a, withRole) {
    const co = '"' + String(a.company || '').replace(/"/g, '') + '"', after = a.date ? ' after:' + ymd(Date.parse(a.date) - 864e5) : '';
    const toks = normRole(cleanRole(a.role)).split(' ').filter(t => t.length > 2).slice(0, 3);
    return co + (withRole && toks.length ? ' (' + toks.map(t => '"' + t + '"').join(' OR ') + ')' : '') + after;
  }
  const mailSearchUrl = (a, withRole) => 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent(mailQuery(a, withRole));
  const mailSubjectUrl = subject => 'https://mail.google.com/mail/u/0/#search/' + encodeURIComponent('subject:"' + String(subject || '').replace(/"/g, '').slice(0, 80) + '"');
  // One-click polite follow-up email (opens Gmail compose; nothing is sent automatically).
  function followUpDraft(a, name) {
    const d = new Date(a.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
    const subject = 'Following up on my application – ' + a.role;
    const body = 'Dear ' + a.company + ' Hiring Team,\n\nI hope you are doing well. I applied for the ' + a.role + ' position on ' + d + ' and wanted to follow up on the status of my application.\n\nI remain very interested in the opportunity and would be glad to share any additional information you may need.\n\nThank you for your time and consideration.\n\nBest regards,\n' + (name || '[Your name]');
    return { subject, body, url: 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body) };
  }
  function calendarUrl(a) {
    const t = Date.parse(a.interviewDate); if (!t) return '';
    const f = x => new Date(x).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent('Interview – ' + a.company + ' (' + a.role + ')') + '&dates=' + f(t) + '/' + f(t + 36e5) + '&details=' + encodeURIComponent('Added from AppliedIn');
  }

  g.AppliedInShared = { matchEmail, mailQuery, mailSearchUrl, mailSubjectUrl, followUpDraft, calendarUrl, cleanRole, hostLabelIsNoise, classifyEmail, matchEmailToApp, replyStats, domainLabel, words, STATUSES, RANK, RESPONDED, normCompany, normRole, sameCompany, sameRole, urlKey, canonicalUrl, statusFromText, slugToName };
})(typeof self !== 'undefined' ? self : this);
