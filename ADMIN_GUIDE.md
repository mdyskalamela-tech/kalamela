# MDYS Kalamela website – admin guide

This website runs the Mumbai Diocese Kalamela every year: it reads the Centre entry forms, gives chest numbers, prints event lists and admit cards, runs the tabulation room, and produces results, the championship table, certificate lists and the Kendra list.

It belongs to the Diocese. Everything runs on the **Diocese Google account**: the database and sign-in are in Google Firebase, and the web pages are on GitHub Pages. Both are free at our size. Nobody needs to install anything or write code to use it or to run it next year.

**Who should read what**
- Setting it up for the first time: Part A (once, about 1–2 hours).
- Running a Kalamela year: Part B.
- On the day: Part C.
- When something goes wrong: Part D.

---

## Part A – first-time setup

Do all of this signed in to the **Diocese Google account** in Chrome.

### A1. Create the Firebase project
1. Go to **console.firebase.google.com** and click **Create a project**.
2. Name it `mdys-kalamela` (any name works). Turn **Google Analytics off**. Click **Create project**.

### A2. Turn on Google sign-in
1. In the left menu: **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Google**, switch it **on**, pick the Diocese email as the support email, and **Save**.

### A3. Create the database
1. Left menu: **Build → Firestore Database → Create database**.
2. Location: **asia-south1 (Mumbai)**. This cannot be changed later.
3. Choose **Start in production mode** and click **Create**.

### A4. Connect the website to Firebase
1. Click the **gear icon → Project settings**. Under **Your apps**, click the **</>** (Web) icon.
2. Nickname: `Kalamela website`. Don't tick Firebase Hosting. Click **Register app**.
3. You'll see a block called `firebaseConfig` with `apiKey`, `authDomain` and so on. Keep this page open.
4. Open the file **js/config.js** from this folder in Notepad and:
   - replace `OWNER_EMAIL` with the Diocese email, **all lowercase**, e.g. `"mdys.kalamela@gmail.com"`;
   - replace each `PASTE-HERE` value with the matching value from Firebase.
5. Save the file.

These Firebase values are not passwords. Anyone could see them in the website; the security comes from the rules in the next step.

### A5. Publish the security rules
1. Open **firestore.rules** in Notepad. Replace `OWNER_EMAIL` with the same Diocese email, **all lowercase**. Save.
2. In Firebase: **Firestore Database → Rules** tab. Select everything in the box, delete it, and paste the whole contents of `firestore.rules`. Click **Publish**.

### A6. Put the website on GitHub Pages
1. Go to **github.com** and **Sign up** with the Diocese email. Choose a username, e.g. `mdys-kalamela`.
2. Click **+ → New repository**. Name: `kalamela`. Choose **Public** (needed for free GitHub Pages; there are no secrets in the files). Click **Create repository**.
3. Click **uploading an existing file**. Drag in **everything in this folder except the `test` folder**: `index.html`, `firestore.rules`, the guides, and the folders `css`, `js`, `vendor`, `templates`, `tools`. Click **Commit changes**.
4. Go to the repository's **Settings → Pages**. Under **Build and deployment**, Source: **Deploy from a branch**; Branch: **main**, folder **/ (root)**. Click **Save**.
5. After a minute or two the address appears at the top of that page, e.g. `https://mdys-kalamela.github.io/kalamela/`. This is the Kalamela website. Bookmark it.

### A7. Allow sign-in from that address
1. Firebase: **Authentication → Settings → Authorized domains → Add domain**.
2. Add the GitHub address without `https://` and without the path, e.g. `mdys-kalamela.github.io`. Click **Add**.

### A8. First sign-in
1. Open the website and **Sign in with Google** using the Diocese account. It is always an admin.
2. You'll see **Years**. Create `2026-27` (copy rules from "Built-in defaults").
3. Open **Team & roles** and add the people who will help (see Part B, step 1).

Setup is done.

---

## Part B – running a Kalamela year

### Roles
| Role | Can do |
|---|---|
| **Admin** | Everything: years, rules, Centre forms, team list, clearing practice data |
| **Chief tabulator** | Tabulation, committee tie decisions, participant list and admit cards, backups |
| | *Only admins and the chief tabulator can see personal details (dates of birth, phone numbers, photos).* |
| **Tabulator** | Intake ticks, marks entry, verification |
| **Viewer** | Results and scoreboard only |

People sign in with their own Google (Gmail) account. Add the exact Gmail address under **Team & roles**. Remove people after the Kalamela.

### Year phases
- **Setting up**: Centre forms can be imported and event lists rebuilt; practice marks can be cleared.
- **Live**: the day itself. Entries are locked. Marks can be entered but can never be bulk-deleted. Only the Diocese account can switch a live year back to Setting up, and the scoring rules are locked.
- **Archived**: read-only for everyone. Only the Diocese account can reopen it.

### Yearly checklist

**1. When the Kalamela notice is prepared (Aug–Sep)**
- **Years → Start a new year**, copying the rules from last year.
- **Rules**: check the date, venue, age groups (birth-date cut-offs move by one year every year), fees, points, events and judging criteria against the latest Kalamela Manual. Save.
- **Team & roles**: add this year's admins, chief tabulator and tabulation team.
- **The Centre entry form**: the file in `templates/` is the 2026–27 form. Its event names and its "Group I" / "Group II" sheet names must match the Rules screen exactly. If the Manual adds, removes or renames events, the form needs updating; see README.md, "Changing the Centre entry form".

**2. Entries (Oct–Nov)**
- Send the Centre entry form to every Centre with the notice.
- As forms arrive: **Centre forms → Upload**. Read the issues listed for each Centre, ask the Centre to fix and resend, and upload again; the new upload replaces the old one.
- Record fees received in the **Paid** column.

**3. After the entry deadline**
- **Centre forms → Build event lists and chest numbers.** Chest numbers start at 1001 (Group I) and 2001 (Group II). Building again later keeps the numbers already given.
- **Participants → Show admit cards → Print.** Each card has only the photo, chest number and events (no name, Sakha or Centre). Print **Event lists** for stage managers.
- Hold a **practice run** with the tabulation team on the venue Wi-Fi, using a few made-up marks.
- **Backup & audit → Clear practice marks.**

**4. Morning of the Kalamela**
- **Years → Go live.**

**5. After the Kalamela**
- **Backup & audit → Download full backup** and **Download Excel backup**. Save both in the Diocese Google Drive.
- Print or download **Certificates** and the **Kendra list**.
- **Years → Archive.**
- Remove temporary helpers from **Team & roles**.

---

## Part C – tabulation room on the day

People: 1 chief tabulator, 1 intake desk, and pairs of operator + verifier (about one pair per venue).

1. **Intake desk**: when an event's judging sheets arrive, open **Control**, tick **Sheets received**, and fill Venue and Operator. The Time column records who ticked it. Hand the sheets to that operator.
2. **Operator**: **Marks entry → pick the event.** Type each judge's marks in the order of the judging sheet (A, B, C…) and each judge's written total. Press **Enter** to jump to the next box. Rows save by themselves (green dot). Mark absentees under Attendance.
3. **The Check column must say OK.** It flags missing marks, marks above the maximum, and a judge whose written total doesn't match the marks. Ask the judge to confirm and initial any correction on paper.
4. **Verifier** (a different person from the operator): read every number on screen back against the paper, then tick **Verified**. The website doesn't let anyone verify marks they entered themselves; their Verified box stays greyed out. Under each row's **Check** you can see who entered it and who verified it, with the time. If anyone changes a mark afterwards, the tick clears, that person becomes "entered by", and someone else must verify again.
5. **Ties** for 1st, 2nd or 3rd show as **TIE**. The chief tabulator takes them to the committee and records the decision under **Results & ties**.
6. When **Control** says **All events are ready**, release results: **Result slip** (one event, printable), **All results**, **Scoreboard** (Projector size), **Prathibha & Thilakam**.
7. **Lock each result once it is announced.** On the **Result slip**, the chief tabulator clicks **Mark as announced and lock**. After that, nobody can change that event's marks or tie decisions; the screens show **Announced** and who locked it. If a real mistake is found, the chief tabulator clicks **Unlock for a correction…**, writes the reason (kept in the audit log), fixes it, gets it verified again, re-announces and locks again.
8. **Every hour**: **Backup & audit → Download Excel backup** on the chief tabulator's laptop.

Rules used: Final score = (Judge I + Judge II) ÷ 2 (one judge for Quiz unless the Rules say 2). A place needs at least the minimum % (50%). Points 5/3/1 individual, 15/10/5 team. Kalaprathibha / Kalathilakam need at least 13 individual-event points. All of these can be changed under **Rules**.

---

## Part D – when something goes wrong

| Problem | What to do |
|---|---|
| "No access yet" after signing in | The admin hasn't added that exact Gmail address, or added a different one. Add it under Team & roles; the person reloads. |
| The sign-in window doesn't open | Allow pop-ups for the website in the browser, then try again. |
| "You're offline" | Keep typing. Marks are kept on that laptop and sent when the Wi-Fi returns. **Don't close the tab** until the banner disappears. |
| Can't change entries or clear marks | The year is **Live**. Switch it back to Setting up under Years only if a real correction is needed. |
| "Not allowed: check your role and the year's phase" | Your role doesn't permit that, or the year is archived. |
| "… saved this row while you were changing it. Your change was NOT saved" | Two people changed the same row at once. The website kept the first save and refused the second, so nothing was overwritten. The row now shows what was saved: check it against the paper and re-type if needed. Give each operator separate events to avoid this. |
| Marks boxes are grey and the screen says "Results announced" | That event was locked after announcement. Only the chief tabulator can unlock it, on the Result slip. |
| Entire site down, or the internet is gone for good | Use the latest **Excel backup** as a paper/Excel fallback and carry on by hand. Enter the marks later. |
| "Quota exceeded" or the site stops saving late in the day | The free daily limit was reached (see below). It resets at about 1:30 pm IST. To avoid it, see "Costs and limits". |

### Costs and limits
The free Firebase plan allows about 50,000 reads and 20,000 saves per day. A normal Kalamela day with 8–10 laptops should stay under that. To remove any risk on the day, you can switch the project to the **Blaze (pay as you go)** plan in Firebase (needs a card). At our size the cost is usually a few rupees. If you do, set a budget alert of ₹500 under **Usage and billing → Budget alerts**.

### Keeping it secure
- Turn on **2-Step Verification** for the Diocese Google account (myaccount.google.com → Security). Ask admins and the chief tabulator to turn it on for their own Gmail too.
- Give **Admin** to as few people as possible – usually the convenor and one deputy. The tabulation team only needs **Tabulator**.
- Remove helpers from Team & roles after each Kalamela.
- The audit log can't be edited or deleted by anyone. Use it if a mark is ever disputed. The Excel backup also lists who entered and who verified each row.

### Handing over to the next convenor
- The Diocese Google account owns everything. When responsibility changes, the Diocese changes that account's password and recovery phone; nothing else needs to move.
- Make the new convenor an **Admin** under Team & roles and give them this guide.
- Technical notes for anyone changing the website are in **README.md**.
