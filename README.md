# MDYS Kalamela website

**What is Kalamela?** Kalamela ("arts fair" in Malayalam) is the annual arts festival of the Mar Thoma Yuvajana Sakhyam, the youth movement of the Mar Thoma Syrian Church. Young people from parishes across the Diocese compete in music, dance, drama, fine arts and literary events. The winners go on to the national (Kendra) level.

This web app runs the Mumbai Diocese Kalamela end to end. It imports Centre registration forms, assigns chest numbers, prints admit cards, plans the stage schedule, and lets tabulators enter and verify judges' marks live. It then publishes results, the championship table and certificates.

**Created by Nelson Varghese.** © 2026 Nelson Varghese, all rights reserved. See [LICENSE](LICENSE). MDYS uses it with the author's written permission. For any other use, ask the author first.

---

## Technical notes

For setup and yearly use, read **ADMIN_GUIDE.md** first. This section is for whoever changes the website itself.

## How it's built
- Plain HTML, CSS and JavaScript modules. **No build step**: edit a file, upload it to GitHub, and GitHub Pages serves it a minute later.
- **Firebase Authentication** (Google sign-in) and **Cloud Firestore** (database), on the Diocese Google account.
- Libraries: Firebase JS SDK 11.10.0 loads from Google's CDN (pinned in `js/db.js`). The libraries are stored in `vendor/` and served with the site: SheetJS 0.20.3 and JSZip 3.10.1 (Excel), jsPDF 4.2.1 (admit-card PDFs) and qrcode-generator 1.4.4 (QR codes on admit cards); no known vulnerabilities at the time of adding. SheetJS 0.18.5 (the last version on npm/cdnjs) has known security flaws, so don't go back to it.
- Firestore keeps a local copy on each laptop (persistent cache), so short Wi-Fi drops don't stop marks entry.

## Files
| File | What it does |
|---|---|
| `index.html` | Page shell; loads the libraries and `js/app.js` |
| `css/app.css` | All styles, including dark mode and print |
| `js/config.js` | Firebase settings and the Diocese owner email – **the only file to edit at setup** |
| `js/db.js` | Every Firebase call (sign-in, live data, saves). Screens never call Firebase directly |
| `js/app.js` | App shell, roles, navigation and the tabulation/results screens |
| `js/admin.js` | Centre forms, participants and admit cards, rules editor, years, team & roles, backup & audit |
| `js/stage.js` | Schedule screen (stages/rooms, running order, planned times), Stage screen for stage managers, and the data published for participants |
| `js/importer.js` | Reads a Centre's Excel form: the Centre registration form (sheets "Individuals Group I/II", one sheet per team, "Declaration") or the website's own entry form; checks it against the rules; extracts photos |
| `js/autoplan.js` | Auto-plan: builds a schedule from the event lists (no participant clashes; First → Middle → Last on every stage; lunch; buffers). Pure functions, no screen or database |
| `me.html`, `js/me.js` | "My Kalamela": public page for participants (no sign-in) – their events, stages, times, live stage progress and where to go next |
| `js/compute.js` | Pure result maths: final scores, ranks, ties, status, points, championship |
| `js/defaults.js` | Starting rules (2026–27 Manual) used only when creating a year from defaults |
| `firestore.rules` | Who can read and write what – the real security |
| `vendor/` | SheetJS, JSZip, jsPDF and qrcode-generator, with their licences |
| `templates/` | The Centre entry form sent to Centres |
| `tools/build_centre_form.py` | Generates the Centre entry form (Python + openpyxl) |
| `test/` | Tests (not needed on the website) |

## Data model (Firestore)
```
users/{email}                       role: admin | chief | tabulator | viewer
editions/{year}                     name, phase: setup | live | archived, config (rules), listsBuiltAt
editions/{year}/centres/{id}        one Centre's form: details, Sakhas, entries, teams, issues, food
editions/{year}/participants/{pid}  person: name, gender, dob, group, Sakha, Centre, chest, photo (small JPEG)
editions/{year}/lists/{key}         one event list, e.g. ev05-g1, with entries {eid, id (chest/team), name, …}
editions/{year}/marks/{eid}         judges' marks for one entry + who entered and who verified, with server times
editions/{year}/intake/{key}        sheets received, venue, operator
editions/{year}/decisions/{eid}     committee decision on a tie
editions/{year}/locks/{key}         results announced for one event: marks and decisions locked
editions/{year}/plan/main           schedule: stages/rooms; per event list its stage, running order, planned start
editions/{year}/att/{eid}           stage attendance (Present / Absent) marked by stage managers
public/current                      which year the participant page shows
public/{year}                       published schedule: event names, groups, stages, order, times (no personal data)
public/{year}/chest/{chest}         event keys for one chest number (can be read one at a time, never listed)
public/{year}/status/{key}          live stage progress: pending / active / done
editions/{year}/payments/{id}       fee received from a Centre
editions/{year}/audit/{auto}        every marks save, decision, import and phase change
```
`config` holds everything that changes between years: age groups, events with criteria (name + max) and judges, team sizes, points, minimum %, fees.

## Security model
- Only signed-in Google accounts with verified email, listed in `users/`, can read anything. The owner email in `firestore.rules` is always admin and can't be locked out.
- Writes are limited by role and by the year's phase (see comments in `firestore.rules`). Marks must carry the saver's own email and the server's timestamp; extra fields are rejected.
- Same-row conflicts: every marks save carries a revision number (`rev`), and the rules accept a save only if it is exactly one more than the saved row. If someone else saved in between, the save is refused and the screen tells the person and shows the saved row, instead of silently overwriting it. This also works for saves queued while offline.
- Stage managers (role `stage`) can read event lists and the schedule, write stage attendance and stage progress, and nothing else; they cannot read marks or personal details.
- The participant page reads only `public/…`. It contains no names, dates of birth, phone numbers, emails or photos. Single chest numbers can be looked up but the chest list can't be listed. Only admins publish it; only the stage crew can change stage progress.
- Results announced: `locks/{eventKey}` (chief tabulator only, server-timestamped). While it exists the rules refuse any change to that event's marks and decisions. Unlocking deletes it; both are in the audit log with the reason.
- Four eyes on marks: whoever changes marks or attendance is recorded as `enteredBy` (with server time), and verification is cleared. Only a *different* person can set `ver`, stamped as `verBy`/`verAt`; a verify save can't change the marks or who entered them. The screens show both names under each row's Check.
- Personal details (participants, Centre forms, payments) are readable only by chief tabulators and admins; tabulators and viewers see only names, Sakhas and Centres in the event lists.
- Only the owner can move a year from Live back to Setting up, or reopen an archived year.
- While a year is Live, the scoring rules (`config`) can't be changed except by the owner.
- Intake, decision, payment and audit documents only accept their expected fields; marks lists are capped at 10 criteria.
- A role change or removal applies to an open session immediately.
- The audit log can't be edited or deleted by anyone, including the owner.
- The Firebase web config in `js/config.js` is public by design; it is not a secret.
- `test/rules.test.mjs` checks the rules. It needs Java and the Firebase emulator:
  `cd test && npm install && npx firebase emulators:exec --only firestore "node rules.test.mjs"`.
  Run it after any change to `firestore.rules`.

## Changing things
- **Rules that change yearly** (events, criteria, points, age groups, fees): use the **Rules** screen. No code change.
- **Code changes**: edit the file on GitHub (open it → pencil icon → Commit). Test on a laptop first: any static web server works, e.g. `python -m http.server` in this folder, then open `http://localhost:8000` (add `localhost` to Firebase authorised domains for testing).
- **Updating SheetJS**: download the new `xlsx.full.min.js` from cdn.sheetjs.com (the official source; npm and cdnjs are out of date), put it in `vendor/`, update the file name in `index.html`, and run the tests.
- **Updating the Firebase SDK**: change the version in the three import URLs in `js/db.js` together, then test sign-in, marks entry and offline behaviour before the Kalamela.
- Other tests: `cd test && npm install`, then `node pipeline.test.mjs <folder of Centre forms>` (import → lists → results), `node browser.test.cjs` (the main flow), `node twoperson.test.cjs` (one person enters, another verifies; who-entered/verified on every screen), `node locks.test.cjs` (announce-and-lock, unlock with reason, two people saving the same row), `node admit.test.cjs` (admit cards show only photo, chest number and events), `node stage.test.cjs` (schedule, stage managers on a phone, stage absences in tabulation, participant page, accessibility) and `node qa.test.cjs` (roles, edge cases, hostile input, offline, phone width, accessibility). The browser tests use a stand-in database (`mock-db.js`) and Playwright. See QA_REPORT.md for the last full run.

## Changing the Centre entry form
The importer reads the form by position, so the form and the Rules screen must agree:
- sheet names `Centre Details`, one sheet per age group named exactly as the group labels (`Group I`, `Group II`), `Team Events`, `Summary & Declaration`, and the hidden `Lists` sheet;
- individual-event rows from row 6: A event, B place, C name, D gender, E date of birth, F Sakha, G membership no., H WhatsApp, I photo;
- team boxes are located through the hidden `Lists` sheet (columns D–I: event, place, header row, first row, last row, max members);
- event names must match the Rules screen exactly.

For small changes (renaming an event), unprotect the sheet in Excel (Review → Unprotect Sheet; there's no password) and edit the event names. For larger changes, edit the event list at the top of `tools/build_centre_form.py` and run `python build_centre_form.py` (needs `pip install openpyxl`).

## UX refresh (November 2026)
- Added a role-aware Overview landing screen with operational counts, event readiness and shortcuts.
- Refined navigation, spacing, cards, controls and responsive layouts using the existing colour and typography tokens.
- Added participant search to Marks entry without changing scoring, autosave, verification or locking logic.
- Added a prominent live/next event focus panel and stage completion progress for stage managers.
- Refreshed My Kalamela for mobile use, including clearer participant lookup, event cards and a Change number action.
- No Firestore schema, collection, security rule or Firebase configuration changes are included.

## Design refresh (November 2026, from the design template board)
- **Layout:** maroon top bar (crest, Edition picker, signed-in person and role) and a left sidebar grouped under Entries, Tabulation, Results and Settings, with Overview on top. On phones and tablets (960px and narrower) the sidebar opens from the ☰ button; Escape or tapping outside closes it. Stage managers have one screen, so they get no sidebar.
- **Logo:** the Kalamela logo (`img/kalamela-logo.png`) appears in the top bar, the sign-in screen, the browser tab and home-screen icons, My Kalamela, the result slip, the header of every printed page, and the admit card PDF (from `js/logo.js`). To change the logo, replace these files: `img/kalamela-logo.png` (512×512), `img/favicon-32.png`, `img/favicon-64.png`, `img/apple-touch-icon.png` (180×180) and `js/logo.js`.
- **Colours** come from the logo:
  - **Maroon** `#A60934` is the main colour: buttons, links and highlights. The top bar is a deeper shade (`#7C0626`) so the logo stands out.
  - **Yellow** `#FFBE02`, **teal** `#038883` and **orange** `#FC5717` are accents: the four-colour band under the top bar, one colour per sidebar area and per Overview card, and 1st / 2nd / 3rd places in maroon / teal / orange.
  - Status colours (green done, blue to verify, amber waiting, red attention or live) stay separate from the logo colours, so a yellow card never reads as a warning.
- **Type:** Inter for text, IBM Plex Mono for chest numbers and marks. Dark mode follows the device setting.
- **Overview:**
  - Four cards: participants in individual events, events and planned stages, results finalised (locked), and centres.
  - **Live operations**, from the Stage screens: what is on each stage, how many entries are marked present or absent, and what's next.
  - **Needs attention**, for tabulators: sheets received but not entered, marks missing, events waiting for verification, ties, and, on the Kalamela day only, events still not started 15 minutes after their planned time. Each line opens the screen that fixes it.
  - **Quick actions**, showing only the screens your role can open.
- **My Kalamela:** "Participant portal" header, chest-number search, an **Up next** card with a countdown on the day ("In 1h 6m"), and an event list with status icons. It still shows no names, dates of birth, phone numbers or photos.
- Presentation only: no change to Firestore data, rules, roles, scoring, autosave, verification or locks. The notifications bell on the design board is not included because there is no notifications feature behind it.

## Certificates (PDF from the Canva design)
- **Results → Certificates → Print certificates** writes the winners onto `templates/Diocese_Kalamela_Certificate_2026.pdf` and downloads one PDF. Pages 1–3 are Above 18 (Group II), 4–6 Below 18 (Group I) and 7–9 team events, each as 1st / 2nd / 3rd.
- Code: `js/certificates.js`, using pdf-lib 1.17.1 and fontkit 1.1.1 (`vendor/`) and the fonts Cormorant Garamond Bold (names) and Poppins SemiBold Italic (Centre and competition) in `fonts/` (SIL Open Font License). These load only when someone makes certificates.
- Each design page is embedded once and reused, so 225 certificates make a PDF of about 8 MB in about a second. The fonts are embedded whole, because fontkit 1.1 drops letters when it trims them.

See `UX_QA_CHECKLIST.md` for the required role and workflow checks before deployment.
