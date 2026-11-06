// AppliedIn v1.1 — portal adapters. Each portal is just data: selectors, button labels, success phrases.
// If a portal changes its HTML, only this file (or the optional selectors.json override) needs updating.
(function (g) {
  if (g.AppliedInAdapters) return;

  const GENERIC_STRONG = [
    'your application was sent', 'application was sent', 'your application has been sent', 'your application has been submitted',
    'application submitted successfully', 'application sent successfully', 'you have successfully applied', 'successfully applied',
    'applied successfully', 'your response has been recorded', 'your response has been submitted',
    'we have received your application', 'we have received your submission', 'your submission has been received'
  ];
  // Weak phrases are only trusted after the user clicked a Submit-type button (or landed on a confirmation URL)
  const GENERIC_WEAK = [
    'thank you for applying', 'thank you for your application', 'thanks for applying', 'thanks for submitting',
    'thank you for submitting', 'application submitted', 'application complete', 'application received',
    'your details have been submitted', 'your information has been submitted', 'we will be in touch', 'someone will be contacting you'
  ];
  const DEFAULT_APPLY = ['apply', 'apply now', 'apply for this job', 'apply for job', 'apply online', 'apply here', 'easy apply', 'quick apply'];
  const DEFAULT_SUBMIT = ['submit', 'submit application', 'submit my application', 'send application', 'finish', 'complete application', 'confirm application'];
  const COMMON_SKIP = ['/chat', '/messages', '/messaging', '/inbox', '/notifications', '/settings', '/account', '/cart', '/orders', '/terms', '/privacy', '/help'];

  const list = [
    {
      id: 'linkedin', platform: 'LinkedIn', hosts: ['linkedin.com'],
      skip: ['/messaging', '/notifications', '/feed', '/mynetwork', '/learning', '/pulse', '/events', '/in/', '/company/'],
      sync: ['/jobs-tracker', '/my-items/saved-jobs'],
      company: ['.job-details-jobs-unified-top-card__company-name a', '.job-details-jobs-unified-top-card__company-name', '.jobs-unified-top-card__company-name a', '[class*="topcard__org-name"]', '[class*="company-name"]'],
      role: ['.job-details-jobs-unified-top-card__job-title h1', '.job-details-jobs-unified-top-card__job-title', 'h1.t-24', '[class*="topcard__title"]', 'h1'],
      location: ['.job-details-jobs-unified-top-card__bullet', '.topcard__flavor--bullet', '[class*="primary-description"] span'],
      jd: ['#job-details', '.jobs-description__content', '.jobs-box__html-content', '.description__text'],
      applyText: ['easy apply', 'apply', 'apply now', 'apply on company website'],
      externalText: ['apply', 'apply on company website'],
      submitText: ['submit application', 'submit my application'],
      success: ['your application was sent', 'application was sent to', "you've applied", 'you have applied'],
      titleSplit: function (t) {
        t = String(t || '').replace(/^\(\d+\)\s*/, '');
        let m = t.match(/^(.+?)\s+hiring\s+(.+?)(?:\s+in\s+.+?)?\s*\|\s*LinkedIn/i);
        if (m) return { company: m[1].trim(), role: m[2].trim() };
        const p = t.split('|').map(s => s.trim()).filter(Boolean);
        return p.length >= 3 ? { role: p[0], company: p[1] } : {};
      }
    },
    {
      id: 'naukri', platform: 'Naukri', hosts: ['naukri.com'],
      skip: ['/inbox', '/dashboard', '/notification'], sync: ['/mnjuser/', '/mynaukri'],
      company: ['.jd-header-comp-name a', '.jd-header-comp-name', '[class*="comp-name"]', '[class*="companyName"]', '[class*="company-name"]'],
      role: ['.jd-header-title', '[class*="job-title"]', '[class*="jobTitle"]', 'h1'],
      location: ['.location', '[class*="location"]'], salary: ['[class*="salary"]', '[class*="ctc"]'],
      jd: ['[class*="job-desc"]', '[class*="dang-inner-html"]', '.styles_JDC__dang-inner-html__h0K4t'],
      applyText: ['apply', 'apply now', 'apply on company site', 'easy apply'], externalText: ['apply on company site'],
      submitText: ['submit', 'submit application', 'confirm apply'],
      successUrl: /saveapply|applyconfirm|apply-?success|applied/i,
      success: ['successfully applied', 'you have applied', 'application submitted', 'applied successfully', 'application sent']
    },
    {
      id: 'internshala', platform: 'Internshala', hosts: ['internshala.com'], jobTypeDefault: 'Internship',
      skip: ['/chat', '/dashboard', '/my-profile', '/message', '/notification', '/feed', '/course', '/training', '/interview', '/resume'],
      sync: ['/student/applications', '/student/view_applications'],
      company: ['.company-name a', '.company-name', '[class*="company_name"]', '.company_and_premium a'],
      role: ['.profile', '[class*="profile-title"]', '.internship_meta h2', 'h1', 'h2'],
      location: ['.location_link', '[class*="location"]'], salary: ['[class*="stipend"]', '[class*="salary"]', '[class*="ctc"]'],
      jd: ['.internship_details', '#details_container', '[class*="text-container"]'],
      applyText: ['apply now', 'apply'], submitText: ['submit', 'submit application', 'submit my application'],
      success: ['you have successfully applied', 'your application has been sent', 'applied successfully to', 'application sent to', 'congratulations! you have applied'],
      successSelectors: ['.application_success', '.success-message', '[class*="application-success"]', '[class*="apply-success"]', '.congratulations', '[class*="success_container"]', '[class*="applicationSuccess"]']
    },
    {
      id: 'indeed', platform: 'Indeed', hosts: ['indeed.com'],
      company: ['[data-company-name="true"]', '[data-testid="inlineHeader-companyName"]', '[class*="companyName"]'],
      role: ['.jobsearch-JobInfoHeader-title', '[data-testid="jobsearch-JobInfoHeader-title"]', '[class*="jobTitle"]', 'h1'],
      location: ['[data-testid="job-location"]', '[data-testid="inlineHeader-companyLocation"]', '[class*="location"]'],
      jd: ['#jobDescriptionText'],
      applyText: ['apply now', 'apply'], submitText: ['submit', 'submit application', 'submit your application'],
      successUrl: /post-apply|applied|confirmation/i,
      success: ['your application has been submitted', 'your application was sent']
    },
    {
      id: 'glassdoor', platform: 'Glassdoor', hosts: ['glassdoor.com', 'glassdoor.co.in'],
      company: ['[data-test="employer-name"]', '.employerName', '[class*="employerName"]'],
      role: ['[data-test="job-title"]', '.jobTitle', 'h1'],
      location: ['[data-test="location"]', '[class*="location"]'],
      jd: ['[class*="JobDetails_jobDescription"]', '[class*="jobDescription"]'],
      applyText: ['apply now', 'easy apply', 'apply'], submitText: ['submit', 'submit application'],
      success: ['your application was sent', 'application was sent', 'ready for jobs to come to you']
    },
    {
      id: 'unstop', platform: 'Unstop', hosts: ['unstop.com'], skip: ['/dashboard', '/profile', '/feed'],
      company: ['.company-name', '[class*="org-name"]', '[class*="company"]'],
      role: ['.opportunity-heading', '[class*="opportunity-title"]', 'h1', 'h3'],
      location: ['[class*="location"]'],
      applyText: ['register', 'apply', 'apply now', 'participate'],
      submitText: ['submit', 'confirm registration', 'confirm', 'register', 'participate'],
      success: ['successfully registered', 'registration successful', 'successfully applied', 'application submitted', 'you have registered', 'thank you for registering', 'participation confirmed']
    },
    { id: 'shine', platform: 'Shine', hosts: ['shine.com'], company: ['.company-name', '[class*="company"]'], role: ['.job-title', 'h1'], location: ['.job-location', '[class*="location"]'], salary: ['.salary', '[class*="salary"]', '[class*="ctc"]'] },
    { id: 'foundit', platform: 'Foundit', hosts: ['foundit.in'], company: ['[class*="companyName"]', '[class*="company-name"]'], role: ['[class*="jobTitle"]', 'h1'], location: ['[class*="location"]'], salary: ['[class*="salary"]'] },
    { id: 'hirist', platform: 'Hirist', hosts: ['hirist.tech', 'hirist.com'], company: ['.company-name', '[class*="company"]'], role: ['.job-title', 'h1', 'h2'], location: ['[class*="location"]'], salary: ['[class*="salary"]', '[class*="ctc"]'] },
    { id: 'cutshort', platform: 'Cutshort', hosts: ['cutshort.io'], company: ['[class*="company-name"]', '[class*="org-name"]'], role: ['h1', '[class*="job-title"]'], location: ['[class*="location"]'], salary: ['[class*="salary"]', '[class*="ctc"]'] },
    { id: 'freshersworld', platform: 'Freshersworld', hosts: ['freshersworld.com'], company: ['.company-name', '[class*="company"]'], role: ['.job-title', 'h1'], location: ['[class*="location"]'], salary: ['[class*="salary"]', '[class*="stipend"]'] },
    { id: 'instahyre', platform: 'Instahyre', hosts: ['instahyre.com'], company: ['[class*="company"]'], role: ['h1', '[class*="designation"]'] },
    { id: 'wellfound', platform: 'Wellfound', hosts: ['wellfound.com', 'angel.co'], company: ['[class*="company"] a', 'h2'], role: ['h1'] },
    { id: 'apna', platform: 'Apna', hosts: ['apna.co'], company: ['[class*="company"]'], role: ['h1'] },
    { id: 'timesjobs', platform: 'TimesJobs', hosts: ['timesjobs.com'], company: ['.jd-company-name', '[class*="company"]'], role: ['h1'] },
    {
      id: 'googleforms', platform: 'Google Forms', hosts: ['docs.google.com', 'forms.gle', 'forms.google.com'],
      requirePath: '/forms', alwaysConfirm: true, successUrl: /formresponse/i,
      success: ['your response has been recorded', 'your response has been submitted'],
      weak: ['thanks for submitting', 'thank you for submitting', 'thank you for your response', 'response recorded', 'form submitted'],
      titleSplit: function (t) {
        t = String(t || '').replace(/\s*[-–]\s*Google Forms\s*$/i, '').trim();
        const m = t.match(/^(.+?)\s*[-–|:]\s*(.+)$/);
        if (m) {
          const l = m[1].trim(), r = m[2].trim();
          return (/\.(com|ai|in|io|co|org|net)$/i.test(r) || r.length < l.length) ? { role: l, company: r } : { role: r, company: l };
        }
        const p = t.match(/\(([A-Za-z][^)]{1,50})\)/);
        if (p && !/batch|year|202\d/i.test(p[1])) return { role: t.replace(p[0], '').trim(), company: p[1].trim() };
        return { role: t };
      }
    },
    // Other form builders used by small companies for hiring — company can't be read reliably, so always confirm.
    { id: 'forms', platform: 'Application Form', hosts: ['typeform.com', 'jotform.com', 'tally.so'], alwaysConfirm: true },
    // ATS / HR systems — company comes from the URL, role from JSON-LD or the page title.
    {
      id: 'ats', platform: 'Company Website', ats: true,
      hosts: ['greenhouse.io', 'lever.co', 'myworkdayjobs.com', 'workday.com', 'smartrecruiters.com', 'icims.com', 'taleo.net', 'ashbyhq.com',
        'workable.com', 'recruitee.com', 'zohorecruit.com', 'zohorecruit.in', 'keka.com', 'darwinbox.in', 'darwinbox.com', 'bamboohr.com', 'freshteam.com']
    }
  ];

  const GENERIC = { id: 'careers', platform: 'Company Website', generic: true, contextRequired: true, hosts: [] };

  function hostMatch(host, d) { return host === d || host.endsWith('.' + d); }
  function pick(host) {
    host = String(host || '').toLowerCase().replace(/^www\./, '');
    for (const a of list) if (a.hosts.some(d => hostMatch(host, d))) return a;
    return GENERIC;
  }

  g.AppliedInAdapters = { list, pick, GENERIC_STRONG, GENERIC_WEAK, DEFAULT_APPLY, DEFAULT_SUBMIT, COMMON_SKIP };
})(self);
