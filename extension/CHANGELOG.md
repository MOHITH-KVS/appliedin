# Changelog

## 1.1.5 — "Resume, star, weekly summary"
- **Resume used per application.** Set "Resume you are using now" once in Settings: every new application is tagged with it automatically. Edit it per application, set it for many at once ("Set resume…" in the bulk bar), and see **Which resume gets replies?** in Insights. Included in CSV/Excel export.
- **★ Dream-company star.** Star any application (popup, list, board, details, or the ★ Star button in the "Saved" toast). Starred jobs: follow-up after 3 days (changeable), stay in the follow-up queue until you act, are never auto-moved to No Response, float to the top of lists/board columns, are named first in the daily reminder, and have their own ★ filter.
- **Sunday weekly summary.** A notification on Sunday after 9 am (applications vs last week, replies, interviews, offers, ★ jobs waiting). The same numbers are on the dashboard Overview in a new "Your week" card. Switch it off or preview it in Settings.

## 1.1.4 — "Smarter mail, lighter engine"
**Mail automation**
- **Several roles at one company:** when a reply could belong to more than one of your applications, AppliedIn no longer guesses. It narrows down by the role named in the email and by which jobs the reply could actually change; if it is still unclear, the email goes to **Replies to confirm** (Overview, Follow-ups, and a strip in the popup) where you tap the right role.
- **Search email** now searches the company *and only mail from after you applied*; a second button searches company + role words.
- **Draft follow-up**: opens a ready-to-send Gmail compose window (company, role, date filled in; signed with the name you set in Settings). Nothing is sent automatically.
- **Add to calendar** for interview dates (Google Calendar link).
- Subjects like "Interview for QA Engineer" / "Interview with …" are now recognised; newsletters such as "interview tips" are ignored.

**Optimisation**
- The list used on job pages is cached in the background worker and rebuilt only after a change (before, every job page and tab switch re-read every saved record including job descriptions).
- Job pages re-ask for that list at most every 30 seconds.
- While waiting for the "application sent" message, the page text is only re-read when the page actually changed.
- Gmail batches use the cached list instead of the whole database.

## 1.1.2 — "Calmer & clearer"
- **Board redesigned:** a pipeline strip (eight stage tiles with counts, grouped *In progress* / *Closed*) and one focused stage below it. Nothing scrolls sideways, nothing is hidden in empty columns. Applied is split into *Time to follow up* and *Recently applied*. Cards have an avatar, chips, waiting time, a **Move ⇄** menu (works with touch and keyboard), open ↗ and delete 🗑; drag a card onto a stage tile also works. "Select cards" mode for bulk move/delete. Search, portal filter and sorting.
- **Exit button** in the dashboard header: closes the dashboard and brings the quick popup back (Chrome 127+; older versions just close the tab). It never closes your whole window.
- **Toolbar number removed.** The "99+" badge is gone by default; Settings → "Number on the toolbar icon" can show interviews-only or today's count if you want it. The Follow-ups menu item now shows a quiet dot instead of a number, and the popup's follow-up strip is neutral blue (amber only for interviews).

## 1.1.1 — "Saves you can trust"
- **Fixed false "already exists":** a job link now counts as the same job only when it contains a real job id (LinkedIn id, Naukri id, `career_job_req_id=…`, Workday/Greenhouse/Lever ids). Listing pages such as `careers.acme.com/openings` no longer make every job look like a duplicate.
- **Fixed jobs being merged by mistake:** same role title at a different company (or in a different city) is never a duplicate any more; removed the "same tab + same role" rule.
- **"Add anyway" / "Add again"** on every duplicate warning (popup, dashboard, on-page toast) so a wrong warning never blocks you. Warnings now say which job matched and why.
- **Saves are verified:** a save is read back from the database before "Saved" is shown; the toast shows the running number (#450) plus **View / Edit / Undo**. If saving fails the message says why instead of pretending.
- **Edit and Delete are visible again** on every card (popup and dashboard), with Undo after delete.
- **Background worker hardening:** survives a failed `importScripts`, shows a red "!" badge, answers with a clear error and reloads itself once; errors are logged, not swallowed.
- **Diagnostics** (Settings): self-test, copy debug info.
- **Recovery:** anything written to the old v1.0 storage location by a stale open tab is pulled into the database automatically.
- Bulk "No Response" changes are now listed in Automatic updates and can be reverted in one click.

## 1.1.0 — "Reliable & automatic"

**Dashboard (rebuilt)**
- Responsive layout: sidebar on desktop, icon rail on tablets, bottom navigation on phones. No sideways scrolling anywhere.
- Overview, Follow-ups queue, searchable/sortable/paginated Applications list with bulk actions, wrapping Kanban Board, real Insights (funnel, per-day chart, portals), Settings.
- Fixed: Board and Insights both showing at once (a `hidden` attribute was overridden by CSS).
- Everything the popup can do is available here; "Close dashboard" / "Quick popup" buttons.

**Replies & reminders**
- "Replies" now shows a count and a fair rate (only applications older than 7 days), plus a banner explaining why it looks low until statuses are updated.
- Optional Gmail reply detection (local, opt-in) + automatic-updates log with Revert.
- One daily reminder digest instead of one alert per application; toolbar icon turns orange with a number when something needs you; test-notification button.
- Follow-up queue: Followed up / Snooze / record a reply / search email.

**Data quality**
- Titles are cleaned ("Career Opportunities: MIS Analyst (578627)" → "MIS Analyst"); hiring-system hostnames are never used as company names.
- Same application captured twice in one tab is merged and upgraded to the better data.
- Clean-up tool: merge duplicates and tidy old titles (with Undo). Backup reminder after 14 days.

**Accuracy**
- One shared detection engine replaces 14 separate scripts (old code was copy-pasted per portal).
- Reads JSON-LD `JobPosting` data first, then portal selectors, then company-hiring-system URLs (Greenhouse, Lever, Workday…), then the page title.
- The job is remembered per browser tab, so it survives redirects (Naukri `saveApply`) and "Apply on company website" new tabs.
- Success text is trusted only after you click Apply/Submit — pages that just say "you have applied" no longer create false entries.
- High-confidence jobs save instantly with **Undo / Edit**; uncertain ones show a pre-filled confirm box. Nothing is saved silently from a guess.
- Duplicate detection works across portals ("Google LLC" = "Google", "Data Analyst" = "Data Analyst – Fresher"), 45-day window.

**Saving**
- Data moved to IndexedDB (no size limit, one safe record per write). Old data is migrated automatically and a backup copy is kept.
- JSON Backup / Restore. CSV export fixed (quotes, Excel text encoding, formula injection).

**Automation & monitoring**
- Follow-up reminders, interview reminders, automatic "No Response" (all configurable).
- "Did you apply?" prompt when you return from an external company site.
- Status sync from the portals' "my applications" pages (best-effort).
- "✓ Applied" badges in job lists, "Track this job" button, save-for-later status.
- Kanban dashboard + insights, daily goal and streak, toolbar badge with today's count.
- Optional remote selector file so portal changes can be fixed without a new release.

**Privacy & trust**
- Removed the "run on every website" permission. Career-site tracking is now opt-in.
- Removed the publicly exposed xlsx file. Popup no longer injects raw HTML.
