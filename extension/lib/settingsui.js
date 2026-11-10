// AppliedIn v1.1 — one settings panel shared by the popup and the dashboard.
(function (g) {
  const Store = g.AppliedInStore, h = g.AppliedInUI.h;
  const D = {
    careers: ['https://*/*'], gmail: ['https://mail.google.com/*']
  };

  async function render(box, opts) {
    opts = opts || {};
    const say = opts.snack || function () {};
    let s = await Store.settings();
    box.textContent = '';
    const save = async patch => { s = await Store.saveSettings(patch); if (opts.onChange) opts.onChange(s); };

    function toggle(key, title, hint) {
      const input = h('input', { type: 'checkbox', id: 'set-' + key });
      input.checked = !!s[key];
      input.addEventListener('change', () => save({ [key]: input.checked }));
      return h('label', { class: 'sw', for: 'set-' + key }, input, h('span', null, title, hint ? h('small', { text: hint }) : null));
    }
    function number(key, title, min, max) {
      const input = h('input', { type: 'number', id: 'set-' + key, min, max });
      input.value = s[key];
      input.addEventListener('change', () => {
        const v = Math.max(min, Math.min(max, parseInt(input.value, 10) || Store.DEFAULTS[key]));
        input.value = v; save({ [key]: v });
      });
      return h('div', { class: 'num' }, h('label', { for: 'set-' + key, text: title }), input);
    }
    function select(key, title, opts, hint) {
      const sel = h('select', { id: 'set-' + key }, opts.map(o => h('option', { value: o[0], text: o[1] })));
      sel.value = s[key] || opts[0][0];
      sel.addEventListener('change', () => save({ [key]: sel.value }));
      return h('div', { class: 'num' }, h('label', { for: 'set-' + key, text: title }), sel, hint ? h('small', { class: 'muted', text: hint }) : null);
    }
    function text(key, title, ph, hint) {
      const input = h('input', { type: 'text', id: 'set-' + key, placeholder: ph, maxlength: 60 }); input.value = s[key] || '';
      input.addEventListener('change', () => save({ [key]: input.value.trim() }));
      return h('div', { class: 'num' }, h('label', { for: 'set-' + key, text: title }), input, hint ? h('small', { class: 'muted', text: hint }) : null);
    }
    // Optional permissions must be requested directly inside the click handler (browser rule)
    function permToggle(key, origins, title, hint, message) {
      const input = h('input', { type: 'checkbox', id: 'set-' + key });
      input.checked = !!s[key];
      input.addEventListener('change', () => {
        if (input.checked) {
          chrome.permissions.request({ origins }, async granted => {
            if (!granted) { input.checked = false; return say('Permission was not granted'); }
            await save({ [key]: true }); chrome.runtime.sendMessage({ type: message }); say('Turned on');
          });
        } else {
          chrome.permissions.remove({ origins }, async () => { await save({ [key]: false }); chrome.runtime.sendMessage({ type: message }); say('Turned off'); });
        }
      });
      return h('label', { class: 'sw', for: 'set-' + key }, input, h('span', null, title, h('small', { text: hint })));
    }

    const out = h('pre', { class: 'diag', style: 'display:none;white-space:pre-wrap;font:12px/1.5 ui-monospace,Consolas,monospace;background:rgba(127,127,127,.12);border-radius:8px;padding:8px;margin:6px 0' });
    box.append(
      h('h3', { class: 'set-h', text: 'Tracking' }),
      toggle('enabled', 'Track applications automatically'),
      toggle('showTrackButton', 'Show the “Track this job” button on job pages'),
      toggle('badges', 'Show “✓ Applied” next to jobs in search results'),
      permToggle('careerSites', D.careers, 'Also track any company career website', 'Asks for extra permission. Off by default. Never runs on email, banking, social or shopping sites.', 'SYNC_CAREERS'),
      h('h3', { class: 'set-h', text: 'Replies & reminders' }),
      permToggle('gmailSync', D.gmail, 'Detect replies from my Gmail', 'Looks at sender, subject and preview of emails in your open Gmail tab, on your computer, and moves matching applications to Shortlisted, Interview, Offer or Rejected. Nothing is uploaded.', 'SYNC_GMAIL'),
      toggle('notifications', 'Desktop reminders (daily follow-up summary and interviews)'),
      text('defaultResume', 'Resume you are using now', 'e.g. Resume v2 – Data Analyst', 'New applications are tagged with it automatically, so you can see later which resume gets replies. Change it when you switch resumes.'),
      text('userName', 'Your name (for follow-up email drafts)', 'e.g. Mohith Venkata', 'Used only to sign the draft emails. Stays on this device.'),
      select('badgeMode', 'Number on the toolbar icon', [['off', 'Off (recommended)'], ['interviews', 'Only interviews coming up'], ['today', 'Applications made today']]),
      h('div', { class: 'row2' }, number('followUpDays', 'Remind me after (days)', 1, 60), number('ghostDays', 'No Response after (days)', 7, 180)),
      number('starFollowUpDays', 'Follow up ★ starred jobs after (days)', 1, 30),
      toggle('weeklySummary', 'Sunday weekly summary notification'),
      h('button', { class: 'linkbtn', type: 'button', text: 'Preview the weekly summary now', onclick: () => { chrome.runtime.sendMessage({ type: 'WEEKLY_NOW' }); say('Sent — check your notifications'); } }),
      toggle('autoGhost', 'Mark as “No Response” automatically'),
      number('dailyGoal', 'Daily goal (applications)', 1, 200),
      h('button', { class: 'linkbtn', type: 'button', text: 'Send a test notification', onclick: () => { chrome.runtime.sendMessage({ type: 'TEST_NOTIFY' }); say('Sent — if nothing appears, check Windows/Mac notification settings for Chrome'); } }),
      h('h3', { class: 'set-h', text: 'Updates' }),
      toggle('remoteConfig', 'Get portal fixes automatically', 'Downloads a small public selector file from appliedin.vercel.app. Sends nothing about you.'),
      h('h3', { class: 'set-h', text: 'Diagnostics' }),
      h('p', { class: 'muted', text: 'If something is not saving, run the self-test. It saves a temporary record, reads it back and removes it.' }),
      h('button', { class: 'linkbtn', type: 'button', text: 'Run self-test', onclick: () => {
        out.style.display = 'block'; out.textContent = 'Testing…';
        chrome.runtime.sendMessage({ type: 'SELF_TEST' }, r => {
          if (chrome.runtime.lastError || !Array.isArray(r)) { out.textContent = '❌ AppliedIn’s background service is not responding.\nOpen chrome://extensions and press the reload icon on AppliedIn, then refresh your job tabs.'; return; }
          out.textContent = r.map(x => (x[1] === true ? '✅ ' : x[1] === false ? '❌ ' : '• ') + x[0] + (typeof x[1] === 'number' ? ': ' + x[1] : '')).join('\n');
        });
      } }),
      h('button', { class: 'linkbtn', type: 'button', text: 'Copy debug info', onclick: () => chrome.runtime.sendMessage({ type: 'GET_DEBUG' }, async r => {
        if (!r) { say('Background service is not responding — reload the extension'); return; }
        try { await navigator.clipboard.writeText(r); say('Copied — paste it when asking for help'); } catch (e) { out.style.display = 'block'; out.textContent = r; }
      }) }),
      out,
      h('p', { class: 'muted', text: 'All data stays on this device. Back up regularly — uninstalling the extension deletes it.' }));
  }
  g.AppliedInSettings = { render };
})(self);
