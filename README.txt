AppliedIn v1.1.0  —  what is in this zip
=========================================
extension/   the Chrome extension (load this folder in chrome://extensions → Load unpacked)
frontend/    your website (upload/replace on GitHub → Vercel deploys it automatically)
             frontend/appliedin-extension.zip is the download file users get from your site

TO RELEASE (free):
1. Test the extension first (see TEST CHECKLIST below).
2. Replace everything in your website repo with the contents of frontend/ and push. Done —
   the Download button on your site now serves frontend/appliedin-extension.zip.
3. Search Console: submit https://appliedin.vercel.app/sitemap.xml

TEST CHECKLIST (30 min, on the real portals, clean Chrome profile)
 1 LinkedIn Easy Apply -> toast "Saved — Company" with Undo/Edit, correct company+role
 2 LinkedIn plain "Apply" (opens company site) -> "Did you apply?" bar when you return
 3 Naukri 1-click apply -> saved; chrome://extensions > AppliedIn > Errors is empty
 4 Naukri job that redirects to a confirmation page -> correct role saved (not "Naukri")
 5 Internshala Apply now -> submit -> saved as Internship
 6 Re-open an applied job -> green "Already applied" banner; "✓ Applied" badge in lists
 7 Open a listing that says "you have applied" without clicking anything -> nothing saved
 8 Popup: change status, edit, delete + Undo, Back up, Restore
 9 Load v1.1 over your old v1.0 folder -> old applications still there
10 Settings > "track any company career website" -> permission prompt, then works

IF A PORTAL SHOWS THE WRONG COMPANY/ROLE
Right-click the text > Inspect > copy its class name > add it at the FRONT of that portal's
"company" or "role" list in extension/content/adapters.js. Then rebuild frontend/appliedin-extension.zip
(zip the extension folder) and push. Or, without any new release, put it in frontend/selectors.json:
{"version":2,"portals":{"naukri":{"company":[".new-class"]}}}   (raise "version" each time)

UPDATING EXISTING USERS
Extensions installed with "Load unpacked" cannot auto-update. Tell them: Back up (⋯ menu) ->
extract new zip into the SAME folder (replace files) -> click reload on chrome://extensions.
Moving the folder creates a new empty extension; "Restore from backup" fixes that.

COST: everything here is free. Optional later: Edge Add-ons (free) or Chrome Web Store (one-time US$5).
