# AppliedIn — free job application tracker (Chrome / Edge / Brave)

Auto-tracks job applications from LinkedIn, Naukri, Internshala, Indeed, Glassdoor, Unstop and common company hiring systems.
100% local: no server, no account, no tracking.

## Install (developer mode)
1. Download the latest ZIP from Releases and extract it to a folder you will keep (do not move it later).
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, pick the extracted folder.

## Update
Back up first (⋯ → Back up). Replace the files in the **same folder**, then click the reload icon on `chrome://extensions`.

## Project layout
- `background.js` — service worker: saving, per-tab job memory, reminders, badge
- `lib/` — shared helpers, IndexedDB store, UI helpers
- `content/adapters.js` — **per-portal selectors and phrases (edit this when a portal changes)**
- `content/core.js` — the detection engine
- `popup/`, `dashboard/` — UI
