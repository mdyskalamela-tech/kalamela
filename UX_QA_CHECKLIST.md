# Kalamela UX refresh – deployment QA checklist

The November 2026 refresh changes presentation and navigation only. It does not intentionally change Firestore data, scoring formulas, role permissions, publishing rules or security rules.

## Automated checks completed in this package
- [x] `node --check` passed for every `js/*.js` module.
- [x] Existing Firebase configuration, Firestore rules and data model left unchanged.
- [x] Existing marks autosave, revision conflict handling, independent verification and result locks left in place.
- [x] Participant page continues to read only the published `public/{year}` data.

## Required browser checks before publishing
Use a staging copy and test with real test accounts for each role. Do not use the live event year for destructive tests.

### Navigation and responsive layout
- [ ] Admin, chief, tabulator, viewer and stage-manager accounts see only the screens allowed for their role.
- [ ] Sidebar shows Overview, then Entries / Tabulation / Results / Settings, with the open screen highlighted; browser back/forward work.
- [ ] Phone and tablet: ☰ opens the sidebar; choosing a screen, Escape, or tapping outside closes it.
- [ ] Year selector and phase badge remain usable at desktop and phone widths.
- [ ] No horizontal page overflow at 320px, 375px, 768px and desktop widths.

### Overview dashboard
- [ ] Counts match Control and Results for the selected year.
- [ ] Live operations matches what stage managers have started and marked on their Stage screens.
- [ ] Needs attention lines appear as sheets are received and marks entered, and each opens the right screen.
- [ ] Quick-action links open the correct screen and preserve the selected year.
- [ ] Empty year / no event-list state is understandable.

### Marks entry
- [ ] Search matches chest number and participant name and can be cleared.
- [ ] Search does not alter marks or hide data from exports/results.
- [ ] Enter and Shift+Enter move between score inputs.
- [ ] Autosave, offline queue, conflict warning and validation still work.
- [ ] A different user can verify; the person who entered marks cannot self-verify.
- [ ] Announced/locked events remain read-only; chief unlock flow still requires a reason.

### Stage manager
- [ ] Stage manager sees only their Stage screen and no marks or personal details.
- [ ] Correct stage/room queue, active event and next event are shown.
- [ ] Start, complete, reopen and attendance actions update live status.
- [ ] Starting another event completes the previous active event as before.
- [ ] Stage manager phone layout has usable Present / Absent / Pending controls.

### My Kalamela
- [ ] QR/hash chest lookup and manual lookup work.
- [ ] Unknown chest numbers and unpublished schedule states show clear messages.
- [ ] Active, pending and completed statuses update live.
- [ ] Change number returns focus to the chest-number field.
- [ ] On the Kalamela day, the Up next countdown matches the planned time.
- [ ] No names, dates of birth, contact details or photos are exposed.

### Release gate
- [ ] Run the project's Firestore rules tests and existing browser workflow tests from the full development repository (the uploaded ZIP does not include its `test/` directory).
- [ ] Test with staging Firebase and at least one account per role.
- [ ] Take a full backup before deploying to GitHub Pages.
- [ ] Publish only after all checks above pass.

## Certificates
- [ ] After publishing the new `firestore.rules`: Settings → Certificate designs → move a box, Save, reload the page; the change is still there.
- [ ] Preview PDF for each design used this year; the text sits on the blank lines.
- [ ] After one result is announced, Certificates → Print certificates for that event makes a PDF with the right design (Above 18, Below 18 or team), place, name, Centre and competition.
- [ ] Print one certificate on A4 landscape and check margins and alignment on the real printer.
