// MDYS Kalamela – app shell, sign-in, live data and the tabulation screens.
// Admin screens are in admin.js; all Firebase calls are in db.js; result maths in compute.js.

import * as D from "./db.js";
import { computeAll, groupLabel, LETTERS } from "./compute.js";
import { $, $$, esc, fmt, isNum, parseMark, toast, pill, placeClass, enqueue, downloadXlsx } from "./util.js";
import { DEFAULT_CONFIG } from "./defaults.js";
import { SITE_NAME, ORG_NAME } from "./config.js";
import * as Admin from "./admin.js";
import * as Stage from "./stage.js";

// ---------------------------------------------------------------- state
export const S = {
  user: null, role: "", editions: [], ed: null, edition: null,
  lists: new Map(), marks: new Map(), intake: new Map(), decisions: new Map(), locks: new Map(),
  plan: null, status: new Map(), att: new Map(),   // schedule, live stage progress, stage attendance
  centres: new Map(), participants: new Map(), payments: new Map(),
  loaded: {}, R: null, edUnsubs: [], peopleWatched: false,
};
const draft = new Map(), timers = new Map(), kinds = new Map();   // kinds: eid -> "marks" | "verify"
const bases = new Map();   // eid -> revision of the saved row this person started changing (see firestore.rules)
let entryKey = null, slipKey = null, listKey_ = null, allReadyOnly = false, bigBoard = false;
const store = { get: k => { try { return localStorage.getItem("mk." + k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem("mk." + k, v); } catch {} } };
entryKey = store.get("entry"); slipKey = store.get("slip");

export const cfg = () => (S.edition && S.edition.config) || DEFAULT_CONFIG;
export const phase = () => (S.edition ? S.edition.phase : "");
export const can = {
  admin: () => S.role === "admin",
  chief: () => ["admin", "chief"].includes(S.role),
  tab: () => ["admin", "chief", "tabulator"].includes(S.role),
  stage: () => ["admin", "chief", "tabulator", "stage"].includes(S.role),
};
const archived = () => phase() === "archived";
const writableMarks = () => can.tab() && !archived();
export const gl = code => groupLabel(cfg(), code);

// ---------------------------------------------------------------- screens
const ALL = ["admin", "chief", "tabulator", "viewer"], TAB = ["admin", "chief", "tabulator"], CHIEF = ["admin", "chief"], ADM = ["admin"];
const STG = ["admin", "chief", "tabulator", "stage"];   // stage managers see only their Stage screen
// Screens are grouped into four areas that follow the year: entries before the day, tabulation on the day,
// results after, settings any time. The top row shows the areas; the second row shows the current area's screens.
const AREAS = [
  { id: "entries", label: "Entries", hint: "Centre forms, participants, event lists" },
  { id: "tabulation", label: "Tabulation", hint: "On the day: intake, marks, ties" },
  { id: "results", label: "Results", hint: "Slips, scoreboard, certificates" },
  { id: "settings", label: "Settings", hint: "Rules, years, team, backup" },
];
const VIEWS = [
  { id: "centres", label: "Centre forms", area: "entries", roles: ADM, fn: v => Admin.vCentres(v, ctx) },
  { id: "people", label: "Participants & admit cards", area: "entries", roles: CHIEF, fn: v => Admin.vPeople(v, ctx) },
  { id: "lists", label: "Event lists", area: "entries", roles: TAB, fn: vLists },
  { id: "overview", label: "Overview", area: "tabulation", roles: ALL, fn: vOverview },
  { id: "control", label: "Control", area: "tabulation", roles: TAB, fn: vControl },
  { id: "stage", label: "Stage", area: "tabulation", roles: STG, fn: v => Stage.vStage(v, ctx) },
  { id: "entry", label: "Marks entry", area: "tabulation", roles: TAB, fn: vEntry },
  { id: "results", label: "Results & ties", area: "tabulation", roles: TAB, fn: vResults },
  { id: "slip", label: "Result slip", area: "results", roles: ALL, fn: vSlip },
  { id: "all", label: "All results", area: "results", roles: ALL, fn: vAll },
  { id: "board", label: "Scoreboard", area: "results", roles: ALL, fn: vBoard },
  { id: "awards", label: "Prathibha & Thilakam", area: "results", roles: ALL, fn: vAwards },
  { id: "certs", label: "Certificates", area: "results", roles: ALL, fn: vCerts },
  { id: "kendra", label: "Kendra list", area: "results", roles: ALL, fn: vKendra },
  { id: "rules", label: "Rules", area: "settings", roles: ADM, fn: v => Admin.vRules(v, ctx) },
  { id: "schedule", label: "Schedule", area: "settings", roles: ADM, fn: v => Stage.vSchedule(v, ctx) },
  { id: "years", label: "Years", area: "settings", roles: ADM, fn: v => Admin.vYears(v, ctx) },
  { id: "team", label: "Team & roles", area: "settings", roles: ADM, fn: v => Admin.vTeam(v, ctx) },
  { id: "backup", label: "Backup & audit", area: "settings", roles: CHIEF, fn: v => Admin.vBackup(v, ctx) },
];
const lastInArea = {};   // remembers the screen last opened in each area
const myViews = () => VIEWS.filter(v => v.roles.includes(S.role));
function viewId() {
  // Only a known screen name is accepted; the id returned is the website's own copy, never text from the address bar.
  const h = location.hash.replace("#", ""), known = myViews().find(v => v.id === h);
  return known ? known.id : homeView();
}
/** Where each person starts: admins prepare entries while the year is being set up; on the day everyone starts in tabulation. */
function homeView() {
  if (S.role === "stage") return "stage";
  if (can.admin() && phase() === "setup") return "centres";
  if (can.tab()) return "overview";
  return "board";
}
// context handed to admin.js
const ctx = { S, cfg, phase, can, gl, D, renderAll: () => renderAll(), recompute: () => compute(), watchPeople: () => watchPeople() };

// ---------------------------------------------------------------- boot & sign-in
$("#siteTitle").textContent = SITE_NAME; $("#siteSub").textContent = ORG_NAME;
window.__appStarted = true;   // tells index.html the code loaded
window.addEventListener("hashchange", () => { $("#view").dataset.v = ""; renderAll(); window.scrollTo(0, 0); });
window.addEventListener("online", renderNotice); window.addEventListener("offline", renderNotice);

if (!D.configured) {
  $("#view").innerHTML = `<div class="signin"><h2>Almost ready</h2><p>This site hasn't been connected to the Diocese's Firebase project yet. Follow steps 3 and 4 of ADMIN_GUIDE.md: paste the Firebase settings and the Diocese email into <b>js/config.js</b>.</p></div>`;
} else {
  D.onUser(async u => {
    S.user = u; S.role = "";
    if (!u) return showSignIn();
    S.role = await D.myRole();
    if (!S.role) return showNoAccess();
    startEditions();
    if (D.watchMyRole) D.watchMyRole(role => {
      if (role === S.role || !S.user) return;
      const was = S.role; S.role = role;
      if (!role) { stopEdition(); return showNoAccess(); }
      if (was !== role) { if (S.ed) selectEdition(S.ed); else renderAll(); toast("Your role was changed by an admin."); }
    });
  });
}
function showSignIn() {
  stopEdition(); $("#tabs").hidden = true; $("#who").innerHTML = "";
  $("#view").innerHTML = `<div class="signin"><span class="mark" aria-hidden="true" style="transform:scale(1.6);margin:6px"><i></i><i></i><i></i><i></i></span>
    <h2>${esc(SITE_NAME)}</h2><p>Sign in with the Google account the Diocese added for you.</p>
    <button class="btn primary" id="signin">Sign in with Google</button><p class="small">Only people added by the Kalamela admin can open this site.</p></div>`;
  $("#signin").onclick = async () => { try { await D.signIn(); } catch (e) { if (e && e.code !== "auth/popup-closed-by-user") toast("Sign-in didn't complete. Allow pop-ups for this site and try again.", "bad"); } };
}
function showNoAccess() {
  $("#tabs").hidden = true; whoBar();
  $("#view").innerHTML = `<div class="signin"><h2>No access yet</h2><p>You're signed in as <b>${esc(S.user.email)}</b>, but this account hasn't been added to the Kalamela team. Ask the Kalamela admin to add this email under Team &amp; roles, then reload.</p>
    <button class="btn" id="so">Sign in with a different account</button></div>`;
  $("#so").onclick = () => D.signOutUser();
}
function whoBar() {
  const roleName = { admin: "Admin", chief: "Chief tabulator", tabulator: "Tabulator", stage: "Stage manager", viewer: "Viewer" }[S.role] || "No access";
  const eds = [...S.editions].sort((a, b) => b.id.localeCompare(a.id));
  $("#who").innerHTML = `${eds.length ? `<span class="ed"><select class="sel" id="edPick" aria-label="Kalamela year">${eds.map(e => `<option value="${esc(e.id)}" ${e.id === S.ed ? "selected" : ""}>${esc(e.name || e.id)}</option>`).join("")}</select>
      ${S.edition ? `<span class="phase ${esc(S.edition.phase)}">${esc(S.edition.phase === "setup" ? "Setting up" : S.edition.phase === "live" ? "Live" : "Archived")}</span>` : ""}</span>` : ""}
    ${S.user.photo ? `<img src="${esc(S.user.photo)}" alt="" width="22" height="22" referrerpolicy="no-referrer">` : ""}<span class="nm" title="${esc(S.user.email)}">${esc(S.user.name)}</span><span class="role">${roleName}</span>
    <button class="btn" id="signout" style="padding:4px 9px">Sign out</button>`;
  const p = $("#edPick"); if (p) p.onchange = e => selectEdition(e.target.value);
  $("#signout").onclick = () => D.signOutUser();
}

function startEditions() {
  D.watchEditions(list => {
    S.editions = list;
    if (!S.ed || !list.some(e => e.id === S.ed)) {
      const saved = store.get("ed");
      const pick = list.find(e => e.id === saved) || [...list].filter(e => e.phase !== "archived").sort((a, b) => b.id.localeCompare(a.id))[0]
        || [...list].sort((a, b) => b.id.localeCompare(a.id))[0];
      if (pick) selectEdition(pick.id); else { S.ed = null; S.edition = null; renderAll(); }
    } else renderAll();
  }, permErr);
}
function permErr(e) { console.error(e); toast(e && e.code === "permission-denied" ? "You don't have permission for that." : "Lost the connection to the database. It will retry.", "bad"); }
function stopEdition() { for (const u of S.edUnsubs) try { u(); } catch {} S.edUnsubs = []; S.peopleWatched = false; }
function selectEdition(id) {
  stopEdition(); S.ed = id; store.set("ed", id);
  for (const m of [S.lists, S.marks, S.intake, S.decisions, S.locks, S.centres, S.participants, S.payments, S.status, S.att]) m.clear();
  S.plan = null; draft.clear(); bases.clear(); kinds.clear(); S.loaded = {};
  const on = (name, map) => S.edUnsubs.push(D.watchCol(id, name, m => { map.clear(); for (const [k, v] of m) map.set(k, v); S.loaded[name] = true; renderAll(); }, permErr));
  S.edUnsubs.push(D.watchEdition(id, e => { S.edition = e; renderAll(); }, permErr));
  on("lists", S.lists);
  if (S.role !== "stage") { on("marks", S.marks); on("intake", S.intake); on("decisions", S.decisions); on("locks", S.locks); }   // stage managers don't see marks
  if (S.role !== "viewer") on("att", S.att);
  S.edUnsubs.push(D.watchPlan(id, p => { S.plan = p; renderAll(); }, permErr));
  S.edUnsubs.push(D.watchStageStatus(id, m => { S.status.clear(); for (const [k, v] of m) S.status.set(k, v); renderAll(); }, permErr));
  if (can.chief()) { on("centres", S.centres); on("payments", S.payments); }
  renderAll();
}
function watchPeople() {
  if (S.peopleWatched || !S.ed) return; S.peopleWatched = true;
  S.edUnsubs.push(D.watchCol(S.ed, "participants", m => { S.participants.clear(); for (const [k, v] of m) S.participants.set(k, v); S.loaded.participants = true; renderAll(); }, permErr));
}

// ---------------------------------------------------------------- rendering
function getM(eid) { return draft.get(eid) || S.marks.get(eid) || null; }
function compute() {
  let marks = draft.size ? new Map([...S.marks, ...draft]) : S.marks;
  // Someone marked Absent on stage and not yet entered in the tabulation room: pre-fill as Absent (the operator can change it)
  const stageAbs = [...S.att].filter(([eid, a]) => a.att === "Absent" && !marks.has(eid));
  if (stageAbs.length) { marks = new Map(marks); for (const [eid, a] of stageAbs) marks.set(eid, { att: "Absent", j1: [], j2: [], fromStage: a }); }
  S.R = computeAll({ lists: [...S.lists.values()], marks, intake: S.intake, decisions: S.decisions, locks: S.locks, config: cfg() });
}
function renderTabs() {
  const v = viewId(), mine = myViews(), cur = (VIEWS.find(x => x.id === v) || {}).area;
  lastInArea[cur] = v;
  const areas = AREAS.filter(a => mine.some(x => x.area === a.id));
  const first = a => lastInArea[a.id] && mine.some(x => x.id === lastInArea[a.id]) ? lastInArea[a.id] : mine.find(x => x.area === a.id).id;
  const top = areas.length > 1 ? `<div class="areas" role="navigation" aria-label="Areas">${areas.map(a =>
    `<a href="#${esc(first(a))}" class="area${a.id === cur ? " on" : ""}" ${a.id === cur ? 'aria-current="true"' : ""} title="${esc(a.hint)}">${esc(a.label)}</a>`).join("")}</div>` : "";
  const subs = mine.filter(x => x.area === cur);
  const sub = `<div class="subtabs" aria-label="${esc((AREAS.find(a => a.id === cur) || {}).label || "")} screens">${subs.map(x =>
    `<a href="#${esc(x.id)}" ${x.id === v ? 'aria-current="page"' : ""}>${esc(x.label)}</a>`).join("")}</div>`;
  $("#tabs").innerHTML = top + sub; $("#tabs").hidden = false;
}
export function renderAll() {
  if (!S.user || !S.role) return;
  compute(); whoBar(); renderTabs(); renderNotice();
  const view = $("#view"), v = viewId();
  if (!S.ed) { view.dataset.v = ""; return can.admin() ? Admin.vYears(view, ctx) : (view.innerHTML = `<div class="panel empty"><b>No Kalamela year has been set up yet</b><span>The admin creates one under Years.</span></div>`); }
  if (v === "entry" && view.dataset.v === "entry" && $("#marksBody")?.dataset.key === entryKey) return refreshEntry();
  if (v === "control" && view.dataset.v === "control" && $("#ctrlBody")) return refreshControl();
  if (view.dataset.v === v && view.dataset.keep === "1") { if (typeof view._refresh === "function") view._refresh(); return; }   // screens with unsaved form input refresh only their live parts
  view.dataset.v = v; view.dataset.keep = ""; view._refresh = null;
  VIEWS.find(x => x.id === v).fn(view);
}
function renderNotice() {
  const bits = [];
  if (!navigator.onLine) bits.push(`<div class="banner warn">You're offline. Marks you type are kept on this laptop and sent when the connection returns. Don't close this tab.</div>`);
  if (archived()) bits.push(`<div class="banner info">This year is archived. Everything is read-only.</div>`);
  else if (phase() === "setup" && can.tab() && S.lists.size) bits.push(`<div class="banner info">Setting up: entries can still change and practice marks can be cleared. The admin switches the year to <b>Live</b> on the day.</div>`);
  if (timers.size || [...draft.keys()].length) bits.push(`<div class="banner warn small">Saving ${draft.size} change(s)…</div>`);
  const n = $("#notice"); n.innerHTML = bits.join(""); n.style.cssText = bits.length ? "display:grid;gap:8px;margin-bottom:14px" : "display:none";
}
function noData(view) {
  view.innerHTML = `<div class="panel empty"><b>No event lists yet</b><span>${can.admin() ? "Import the Centre forms and build the event lists under Admin → Centre forms." : "The admin imports the Centre forms and builds the event lists first."}</span>${can.admin() ? '<a class="btn" href="#centres">Open Centre forms</a>' : ""}</div>`;
}
const eventOptions = sel => S.R.events.map(e => `<option value="${esc(e.key)}" ${e.key === sel ? "selected" : ""}>${esc(e.ev)} · ${esc(gl(e.grp))} — ${esc(e.status)}${e.lock ? " · announced" : ""}</option>`).join("");
const lockChip = e => e.lock ? ` <span class="pill s-locked" title="Announced${e.lock.at ? " at " + hhmm(e.lock.at) : ""}">Announced</span>` : "";
const lockedNote = e => `Results announced${e.lock.at ? " at " + hhmm(e.lock.at) : ""} by ${e.lock.by === S.user.email ? "you" : shortName(e.lock.name, e.lock.by)}`;
function handleWriteError(e) {
  console.error(e);
  if (e && e.code === "permission-denied") toast(archived() ? "This year is archived – nothing can be changed." : "You don't have permission to change that.", "bad");
  else toast("Couldn't save just now. Your entry is kept on this screen and will be retried.", "bad");
}
const printBtn = (label = "Print") => `<button class="btn" data-print>${label}</button>`;
function wirePrint(view) { view.querySelectorAll("[data-print]").forEach(b => (b.onclick = () => window.print())); }

// ================================================================ OVERVIEW
function vOverview(view) {
  const events = S.R?.events || [];
  const total = events.length, ready = events.filter(e => e.status === "Ready").length;
  const verified = S.R?.rowsAll?.filter(r => r.ver).length || 0;
  const eligible = S.R?.rowsAll?.filter(r => r.att === "Present").length || 0;
  const ties = events.filter(e => String(e.status).toLowerCase().includes("tie")).length;
  const rec = events.filter(e => e.intake?.rec).length;
  const pct = (a,b) => b ? Math.round(a / b * 100) : 0;
  const links = [
    ...(can.tab() ? [['control','Open control room','Monitor sheets, verification and event readiness'],['entry','Enter marks','Continue scoring and verify entries']] : []),
    ['board','View scoreboard','See the current standings'],
    ...(can.chief() ? [['backup','Backup & audit','Download a safety copy and review activity']] : [])
  ];
  view.innerHTML = `<div class="view overview-view">
    <div class="vhead"><div><h2>Welcome to Kalamela</h2><p>Your operational overview for <b>${esc(S.edition?.name || S.ed)}</b>. Choose a task below to continue.</p></div><span class="phase ${esc(S.edition?.phase || 'setup')}">${esc(S.edition?.phase === 'live' ? 'Live event' : S.edition?.phase === 'archived' ? 'Archived' : 'Setting up')}</span></div>
    <div class="tiles overview-metrics">
      <div class="tile"><div class="k">Events</div><div class="v">${total}</div><div class="small muted">In this Kalamela</div></div>
      <div class="tile"><div class="k">Sheets received</div><div class="v">${rec}<small> / ${total}</small></div><div class="bar"><i style="width:${pct(rec,total)}%"></i></div></div>
      <div class="tile"><div class="k">Entries verified</div><div class="v">${verified}<small> / ${eligible}</small></div><div class="bar"><i style="width:${pct(verified,eligible)}%"></i></div></div>
      <div class="tile"><div class="k">Ready to release</div><div class="v">${ready}<small> / ${total}</small></div><div class="small muted">${ties} tie${ties===1?'':'s'} need committee attention</div></div>
    </div>
    <section class="overview-section"><div class="section-heading"><div><h3>Quick actions</h3><p>Jump straight into the work that needs doing.</p></div></div><div class="quick-grid">${links.map(([id,title,desc])=>`<a class="quick-card" href="#${id}"><span class="quick-arrow" aria-hidden="true">↗</span><b>${esc(title)}</b><span>${esc(desc)}</span></a>`).join('')}</div></section>
    ${can.tab() ? `<section class="overview-section"><div class="section-heading"><div><h3>Event readiness</h3><p>Live summary based on the current event lists.</p></div><a href="#control">Open control room →</a></div><div class="panel scroll"><table><thead><tr><th>Event</th><th>Group</th><th>Sheets</th><th>Progress</th><th>Status</th></tr></thead><tbody>${events.slice(0,8).map(e=>`<tr><td>${esc(e.ev)}</td><td>${esc(gl(e.grp))}</td><td>${e.intake?.rec?'Received':'Awaiting'}</td><td>${e.verc} / ${Math.max(0,e.n-(e.absent||0))} verified</td><td>${pill(e.status)}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Event lists will appear here once they are built.</td></tr>'}</tbody></table></div></section>` : `<section class="overview-section"><h3>Scoreboard</h3><p class="muted">The latest published standings are available on the Scoreboard page.</p><a class="btn primary" href="#board">Open scoreboard</a></section>`}
  </div>`;
}

// ================================================================ CONTROL
function vControl(view) {
  if (!S.R.events.length) return noData(view);
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Control</h2><p>Intake desk: when an event's judging sheets reach the room, tick <b>Sheets received</b> and fill Venue and Operator. Status updates by itself from Marks entry. Click an event to open it for entry.</p></div></div>
    <div id="ctrlTop"></div>
    <div class="panel scroll"><table>
      <thead><tr><th>Event</th><th>Group</th><th class="c">Sheets received</th><th>Time · by</th><th>Venue</th><th>Operator</th><th class="c">Entries</th><th class="c">Absent</th><th class="c">Entered OK</th><th class="c">Verified</th><th>Stage</th><th>Status</th></tr></thead>
      <tbody id="ctrlBody">${S.R.events.map(e => `<tr data-key="${esc(e.key)}">
        <td><a href="#entry" data-open="${esc(e.key)}">${esc(e.ev)}</a></td><td class="muted">${esc(gl(e.grp))}</td>
        <td class="c"><input type="checkbox" id="rec-${esc(e.key)}" data-f="rec" aria-label="Sheets received: ${esc(e.ev)} ${esc(gl(e.grp))}"></td>
        <td class="num small" data-c="time"></td>
        <td><input class="in" id="ven-${esc(e.key)}" data-f="venue" size="10" placeholder="Venue" aria-label="Venue"></td>
        <td><input class="in" id="op-${esc(e.key)}" data-f="op" size="10" placeholder="Name" aria-label="Operator"></td>
        <td class="c num" data-c="n"></td><td class="c num" data-c="abs"></td><td class="c num" data-c="ok"></td><td class="c num" data-c="ver"></td><td class="small" data-c="stg"></td><td data-c="st"></td></tr>`).join("")}</tbody>
    </table></div></div>`;
  const tb = $("#ctrlBody");
  tb.addEventListener("click", ev => { const a = ev.target.closest("[data-open]"); if (a) { entryKey = a.dataset.open; store.set("entry", entryKey); } });
  tb.addEventListener("change", ev => {
    const inp = ev.target; if (!inp.dataset.f) return;
    const key = inp.closest("tr").dataset.key, cur = { ...(S.intake.get(key) || {}) };
    if (inp.dataset.f === "rec") { cur.rec = inp.checked; cur.time = inp.checked ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""; }
    else cur[inp.dataset.f] = inp.value.trim();
    S.intake.set(key, cur); renderAll();
    enqueue("in-" + key, () => D.saveIntake(S.ed, key, cur)).catch(handleWriteError);
  });
  refreshControl();
}
function refreshControl() {
  const E = S.R.events, total = E.length, cnt = st => E.filter(e => e.status === st).length;
  const ready = cnt("Ready"), rec = E.filter(e => e.intake.rec).length, ties = cnt("Tie – committee"), ann = E.filter(e => e.lock).length;
  const rows = S.R.rowsAll.filter(r => r.att === "Present").length, ver = S.R.rowsAll.filter(r => r.ver).length;
  const bar = (a, b) => `<div class="bar"><i style="width:${b ? (a / b) * 100 : 0}%"></i></div>`;
  $("#ctrlTop").innerHTML = `<div style="display:grid;gap:10px">
    ${ready === total ? `<div class="banner ok">All ${total} events are ready. Results can be released.</div>`
      : `<div class="banner warn">Not ready yet: ${cnt("Awaiting sheets")} awaiting sheets · ${cnt("Received – to enter") + cnt("Entering / errors")} being entered · ${cnt("Verify")} to verify · ${ties} tie(s) for the committee</div>`}
    <div class="tiles">
      <div class="tile"><div class="k">Events ready</div><div class="v">${ready} <small>of ${total}</small></div>${bar(ready, total)}</div>
      <div class="tile"><div class="k">Sheets received</div><div class="v">${rec} <small>of ${total}</small></div>${bar(rec, total)}</div>
      <div class="tile"><div class="k">Entries verified</div><div class="v">${ver} <small>of ${rows}</small></div>${bar(ver, rows)}</div>
      <div class="tile"><div class="k">Ties for committee</div><div class="v">${ties}</div></div>
      <div class="tile"><div class="k">Announced (locked)</div><div class="v">${ann} <small>of ${total}</small></div>${bar(ann, total)}</div></div></div>`;
  for (const e of E) {
    const tr = $(`#ctrlBody tr[data-key="${CSS.escape(e.key)}"]`); if (!tr) continue;
    const it = e.intake, rc = tr.querySelector('[data-f="rec"]');
    rc.checked = !!it.rec; rc.disabled = !writableMarks();
    for (const f of ["venue", "op"]) { const i = tr.querySelector(`[data-f="${f}"]`); if (document.activeElement !== i) i.value = it[f] || ""; i.disabled = !writableMarks(); }
    tr.querySelector('[data-c="time"]').innerHTML = it.time ? `${esc(it.time)}${it.by ? `<div class="muted" title="${esc(it.by)}">${it.by === S.user.email ? "you" : shortName(it.name, it.by)}</div>` : ""}` : "";
    tr.querySelector('[data-c="n"]').textContent = e.n;
    tr.querySelector('[data-c="abs"]').textContent = e.absent || "";
    tr.querySelector('[data-c="ok"]').textContent = e.okc;
    tr.querySelector('[data-c="ver"]').textContent = e.verc;
    tr.querySelector('[data-c="st"]').innerHTML = pill(e.status) + lockChip(e);
    const pl = S.plan && S.plan.items && S.plan.items[e.key], ss = Stage.stageStatusOf(S, e.key);
    tr.querySelector('[data-c="stg"]').innerHTML = pl ? `${esc(Stage.stageName(S, pl.stage))}${pl.start ? ` <span class="muted">${esc(pl.start)}</span>` : ""}<br>${ss === "active" ? '<span class="pill s-ready">On stage</span>' : ss === "done" ? '<span class="pill s-locked">Completed</span>' : '<span class="muted">Not started</span>'}` : '<span class="muted">Not scheduled</span>';
  }
}

// ================================================================ MARKS ENTRY
function vEntry(view) {
  if (!S.R.events.length) return noData(view);
  if (!entryKey || !S.R.byKey.has(entryKey)) entryKey = S.R.events[0].key;
  const e = S.R.byKey.get(entryKey), ncr = e.cr.length, nj = e.nj;
  if (!ncr) { view.innerHTML = `<div class="view"><div class="picker"><button class="btn" id="prevEv" aria-label="Previous event">‹</button><select class="sel" id="evPick" aria-label="Event">${eventOptions(entryKey)}</select><button class="btn" id="nextEv" aria-label="Next event">›</button></div>
      <div class="banner bad">"${esc(e.ev)}" is not in this year's Rules (it may have been renamed after the event lists were built). An admin must fix the event name under Rules, or rebuild the event lists, before marks can be entered.</div></div>`;
    $("#evPick").onchange = ev => switchEntry(ev.target.value); $("#prevEv").onclick = () => stepEntry(-1); $("#nextEv").onclick = () => stepEntry(1); return; }
  const jh = j => e.cr.map((c, i) => `<th class="j${j}" title="${esc(c.name)} (max ${c.max})">${LETTERS[i]}<br><span class="muted small">/${c.max}</span></th>`).join("") + `<th class="j${j}">Written<br>total</th><th class="j${j}">Sum</th>`;
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Marks entry</h2><p>Type each judge's marks in the order of the judging sheet (A, B, C…). Press <b>Enter</b> to move to the next box. Rows save by themselves. When a row's Check says OK, a <b>different person</b> reads it back against the paper and ticks <b>Verified</b>. You can't verify marks you entered yourself. Under each Check you can see who entered the row and who verified it.</p></div></div>
    <div class="picker"><button class="btn" id="prevEv" aria-label="Previous event">‹</button>
      <select class="sel" id="evPick" aria-label="Event">${eventOptions(entryKey)}</select>
      <button class="btn" id="nextEv" aria-label="Next event">›</button><span id="evStatus"></span></div>
    <div id="lockBanner"></div>
    <div class="panel legend"><span class="muted">Criteria:</span>${e.cr.map((c, i) => `<span><b>${LETTERS[i]}</b> ${esc(c.name)} <span class="muted">(${c.max})</span></span>`).join("")}
      <span class="muted">· Final score = ${nj === 2 ? "(Judge I + Judge II) ÷ 2" : "the judge's total"}, out of ${e.maxTotal}</span></div>
    <div class="marks-tools"><label class="field marks-search"><span>Find participant</span><input class="txt" id="markSearch" type="search" placeholder="Search chest number or name" autocomplete="off"></label><span class="small muted" id="markVisible">${e.n} entries</span><span class="small muted">Tip: press Enter to move between score fields</span></div>
    <div class="panel scroll"><table class="marks">
      <thead><tr><th rowspan="2">Chest</th><th rowspan="2">Attendance</th><th colspan="${ncr + 2}" class="j1">${nj === 2 ? "JUDGE I" : "JUDGE"}</th>${nj === 2 ? `<th colspan="${ncr + 2}" class="j2">JUDGE II</th>` : ""}<th rowspan="2">Final</th><th rowspan="2">Check</th><th rowspan="2">Verified</th></tr>
        <tr>${jh(1)}${nj === 2 ? jh(2) : ""}</tr></thead>
      <tbody id="marksBody" data-key="${esc(e.key)}">${e.rows.map(r => entryRow(r, e)).join("")}</tbody>
    </table></div>
    <p class="small muted">Names are shown for the tabulation room only; judges see chest numbers. Ranking uses verified rows only, and only scores of ${esc(cfg().minPercent ?? 50)}% or more get a place.</p></div>`;
  $("#evPick").onchange = ev => switchEntry(ev.target.value);
  $("#prevEv").onclick = () => stepEntry(-1); $("#nextEv").onclick = () => stepEntry(1);
  const tb = $("#marksBody");
  tb.addEventListener("input", onMarkInput); tb.addEventListener("change", onMarkChange);
  $("#markSearch").addEventListener("input", ev => { const q = ev.target.value.trim().toLowerCase(); let shown = 0; for (const tr of tb.rows) { const hit = !q || tr.cells[0].textContent.toLowerCase().includes(q); tr.hidden = !hit; if (hit) shown++; } $("#markVisible").textContent = `${shown} of ${tb.rows.length} entries`; });
  tb.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" || !ev.target.classList.contains("mk")) return;
    ev.preventDefault(); const all = $$("input.mk", tb).filter(i => !i.disabled && !i.closest("tr").hidden), i = all.indexOf(ev.target), nx = all[i + (ev.shiftKey ? -1 : 1)];
    if (nx) { nx.focus(); nx.select(); }
  });
  refreshEntry();
}
function entryRow(r, e) {
  const eid = r.e.eid, ncr = e.cr.length;
  const cells = j => Array.from({ length: ncr }, (_, i) => `<td><input class="in mk" id="m-${esc(eid)}-${j}-${i}" data-j="${j}" data-i="${i}" inputmode="decimal" autocomplete="off" aria-label="Chest ${esc(r.e.id)} judge ${j} criterion ${LETTERS[i]}"></td>`).join("")
    + `<td><input class="in mk wt" id="m-${esc(eid)}-${j}-w" data-j="${j}" data-i="w" inputmode="decimal" autocomplete="off" aria-label="Chest ${esc(r.e.id)} judge ${j} written total"></td><td class="sum" data-c="t${j}"></td>`;
  return `<tr data-eid="${esc(eid)}">
    <td class="chest">${esc(r.e.id)}<span class="dot" data-c="dot"></span><small>${esc(r.e.name)}</small></td>
    <td><select class="in" id="att-${esc(eid)}" data-f="att" aria-label="Attendance chest ${esc(r.e.id)}"><option>Present</option><option>Absent</option><option>Disqualified</option></select></td>
    ${cells(1)}${e.nj === 2 ? cells(2) : ""}
    <td class="fin" data-c="fin"></td><td class="check"><span data-c="chk"></span><div class="who" data-c="who"></div></td>
    <td class="c"><input type="checkbox" id="ver-${esc(eid)}" data-f="ver" aria-label="Verified chest ${esc(r.e.id)}"></td></tr>`;
}
function refreshEntry() {
  const e = S.R.byKey.get(entryKey); if (!e) return;
  $("#evStatus").innerHTML = pill(e.status) + lockChip(e) + ` <span class="small muted">${e.okc} of ${e.n - e.absent} entered OK · ${e.verc} verified</span>`;
  const lb = $("#lockBanner");
  if (lb) lb.innerHTML = e.lock ? `<div class="banner info">${esc(lockedNote(e))}. Marks for this event are locked. <small>If a correction is needed, the chief tabulator unlocks it on the Result slip.</small></div>` : "";
  const sel = $("#evPick"); if (document.activeElement !== sel) { const v = sel.value; sel.innerHTML = eventOptions(v); }
  for (const r of e.rows) refreshRow(r, e);
}
function refreshRow(r, e) {
  const tr = $(`#marksBody tr[data-eid="${CSS.escape(r.e.eid)}"]`); if (!tr) return;
  const canEdit = writableMarks() && !e.lock;
  const m = r.m || {}, dirty = timers.has(r.e.eid), focusIn = tr.contains(document.activeElement);
  if (!dirty && !focusIn) {
    tr.querySelector('[data-f="att"]').value = m.att || "Present";
    for (const inp of tr.querySelectorAll("input.mk")) {
      const j = inp.dataset.j, i = inp.dataset.i, v = i === "w" ? m["j" + j + "w"] : (m["j" + j] || [])[Number(i)];
      inp.value = v == null ? "" : String(v);
    }
  }
  for (const inp of tr.querySelectorAll("input.mk")) {
    const i = inp.dataset.i, v = parseMark(inp.value);
    inp.classList.toggle("bad", v !== null && (!isNum(v) || (i !== "w" && (v > e.cr[Number(i)].max || v < 0))));
    inp.disabled = !canEdit || r.att !== "Present";
  }
  tr.querySelector('[data-f="att"]').disabled = !canEdit;
  tr.classList.toggle("absent", r.att !== "Present");
  for (const j of [1, 2]) { const c = tr.querySelector(`[data-c="t${j}"]`); if (c) c.textContent = r["t" + j] == null ? "" : fmt(r["t" + j]); }
  tr.querySelector('[data-c="fin"]').textContent = r.final == null ? "" : fmt(r.final);
  const pos = r.pos ? ` <span class="place ${placeClass(r.pos)}">${esc(r.pos)}</span>` : "";
  tr.querySelector('[data-c="chk"]').innerHTML = r.check === "OK"
    ? `<span class="chip ok">OK</span>${r.pct < Number(cfg().minPercent ?? 50) ? ' <span class="small muted">below the minimum</span>' : ""}${pos}`
    : r.check === "Not entered" || r.att !== "Present" ? `<span class="chip idle">${esc(r.check)}</span>` : `<span class="chip bad">${esc(r.check)}</span>`;
  const enteredBy = m.enteredBy || m.by || "", mine = enteredBy && enteredBy === S.user.email;
  const vb = tr.querySelector('[data-f="ver"]'); vb.checked = r.ver;
  vb.disabled = !canEdit || !r.ok || (mine && !r.ver);
  vb.title = mine && r.ok && !r.ver ? "You entered these marks. A different person must verify them." : "";
  tr.querySelector('[data-c="who"]').innerHTML = whoCell(m, r, mine);
}
const shortName = (name, email) => esc(name || String(email || "").split("@")[0] || "");
export function hhmm(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return isNaN(d) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function whoCell(m, r, mine) {
  if (m.fromStage) return `<div class="muted" title="${esc(m.fromStage.by || "")}">Absent – marked on stage by <b>${m.fromStage.by === S.user.email ? "you" : shortName(m.fromStage.name, m.fromStage.by)}</b>${m.fromStage.at ? " · " + hhmm(m.fromStage.at) : ""}</div>`;
  const enteredBy = m.enteredBy || m.by;
  if (!enteredBy || r.check === "Not entered") return "";
  const ent = `<div title="${esc(enteredBy)}">Entered: <b>${mine ? "you" : shortName(m.enteredName, enteredBy)}</b>${m.enteredAt ? " · " + hhmm(m.enteredAt) : ""}</div>`;
  if (r.ver) return ent + `<div title="${esc(m.verBy || "")}" class="okline">Verified: <b>${m.verBy === S.user.email ? "you" : shortName(m.verName, m.verBy)}</b>${m.verAt ? " · " + hhmm(m.verAt) : ""}</div>`;
  if (r.ok) return ent + `<div class="muted">${mine ? "Waiting for someone else to verify" : "Not verified yet"}</div>`;
  return ent;
}
function switchEntry(key) { flushAll(); entryKey = key; store.set("entry", key); vEntry($("#view")); }
function stepEntry(d) { const i = S.R.events.findIndex(e => e.key === entryKey), n = S.R.events[i + d]; if (n) switchEntry(n.key); }
function rowCtx(t) { const tr = t.closest("tr[data-eid]"); return tr ? { tr, eid: tr.dataset.eid, e: S.R.byKey.get(entryKey) } : null; }
function editMarks(eid, mutate, { resetVer = true, delay = 700 } = {}) {
  if (!bases.has(eid)) bases.set(eid, Number((S.marks.get(eid) || {}).rev || 0));   // the version this change builds on
  const base = getM(eid), cur = base ? { ...base, j1: [...(base.j1 || [])], j2: [...(base.j2 || [])] } : {};
  delete cur.by; delete cur.at;
  mutate(cur);
  if (resetVer) {   // marks or attendance changed: this person becomes "entered by"; verification must be redone
    cur.ver = false; delete cur.verBy; delete cur.verName; delete cur.verAt;
    cur.enteredBy = S.user.email; cur.enteredName = S.user.name; cur.enteredAt = new Date();
    kinds.set(eid, "marks");
  } else if (kinds.get(eid) !== "marks") kinds.set(eid, "verify");
  draft.set(eid, cur);
  clearTimeout(timers.get(eid)); timers.set(eid, setTimeout(() => flush(eid), delay));
  setDot(eid, "dirty"); compute(); refreshEntry();
}
function onMarkInput(ev) {
  const inp = ev.target; if (!inp.classList.contains("mk")) return;
  const c = rowCtx(inp); if (!c) return;
  const ncr = c.e.cr.length, j = inp.dataset.j, i = inp.dataset.i, val = parseMark(inp.value);
  editMarks(c.eid, m => {
    if (i === "w") m["j" + j + "w"] = val;
    else { const a = (m["j" + j] || []).slice(0, ncr); while (a.length < ncr) a.push(null); a[Number(i)] = val; m["j" + j] = a; }
  });
}
function onMarkChange(ev) {
  const t = ev.target, c = rowCtx(t); if (!c) return;
  if (t.dataset.f === "att") editMarks(c.eid, m => { m.att = t.value; }, { delay: 0 });
  if (t.dataset.f === "ver") {
    const m0 = getM(c.eid) || {};
    if (t.checked && (m0.enteredBy || m0.by) === S.user.email) { t.checked = false; return toast("You entered these marks. A different person must verify them.", "bad"); }
    editMarks(c.eid, m => {
      m.ver = t.checked;
      if (t.checked) { m.verBy = S.user.email; m.verName = S.user.name; m.verAt = new Date(); } else { delete m.verBy; delete m.verName; delete m.verAt; }
    }, { resetVer: false, delay: 0 });
  }
}
function setDot(eid, st) {
  const d = $(`#marksBody tr[data-eid="${CSS.escape(eid)}"] [data-c="dot"]`);
  if (d) { d.className = "dot " + st; d.title = { dirty: "Not saved yet", saving: "Saving", saved: "Saved", error: "Not saved – will retry" }[st] || ""; }
}
async function flush(eid, attempt = 0) {
  timers.delete(eid);
  const doc = draft.get(eid); if (!doc) return;
  setDot(eid, "saving"); renderNotice();
  try {
    const kind = kinds.get(eid) || "marks";
    await enqueue(eid, () => { const rev = (bases.get(eid) ?? Number((S.marks.get(eid) || {}).rev || 0)) + 1;
      return D.saveMarks(S.ed, eid, doc, kind, rev).then(() => bases.set(eid, rev)); });
    if (!timers.has(eid) && draft.get(eid) === doc) { draft.delete(eid); kinds.delete(eid); bases.delete(eid); }
    setDot(eid, "saved"); renderNotice();
  } catch (e) {
    if (e && e.code === "permission-denied") return refusedSave(eid);
    setDot(eid, "error"); handleWriteError(e);
    if (attempt < 5) timers.set(eid, setTimeout(() => flush(eid, attempt + 1), 4000 * (attempt + 1)));
  }
}
/** A marks save was refused: the event was locked, or someone else saved the same row first. Show what is saved now. */
function refusedSave(eid) {
  const base = bases.get(eid) ?? 0, saved = S.marks.get(eid) || {}, ev = S.R.byKey.get(String(eid).split("__")[0]);
  clearTimeout(timers.get(eid)); timers.delete(eid); draft.delete(eid); kinds.delete(eid); bases.delete(eid);
  const chest = String(eid).split("__")[1] || "";
  if (ev && ev.lock) toast(`Chest ${chest}: not saved. ${lockedNote(ev)}, so its marks are locked.`, "bad");
  else if (Number(saved.rev || 0) !== base) toast(`Chest ${chest}: ${saved.by === S.user.email ? "this row was changed on another screen" : (shortName(saved.enteredName || saved.verName, saved.by) || "Someone") + " saved this row"} while you were changing it. Your change was NOT saved. The row now shows the saved marks; check them against the paper and re-enter if needed.`, "bad");
  else if (archived()) toast("This year is archived – nothing can be changed.", "bad");
  else toast(`Chest ${chest}: your change was not saved. Someone else may have saved this row at the same moment, or you aren't allowed to change it. The row shows the saved marks; check them against the paper.`, "bad");
  setDot(eid, "error"); compute(); if ($("#marksBody")) { const tr = $(`#marksBody tr[data-eid="${CSS.escape(eid)}"]`); if (tr && tr.contains(document.activeElement)) document.activeElement.blur(); refreshEntry(); }
  renderNotice();
}
function flushAll() { for (const k of [...timers.keys()]) { clearTimeout(timers.get(k)); flush(k); } }
window.addEventListener("beforeunload", ev => { if (timers.size || draft.size) { flushAll(); ev.preventDefault(); ev.returnValue = ""; } });

// ================================================================ RESULTS & TIES
const holder = rows => rows.length ? rows.map(r => `${esc(r.e.id)} · ${esc(r.e.name)}`).join(" / ") + ` <span class="muted small">(${esc(rows[0].e.centre)})</span>` : '<span class="muted">—</span>';
function vResults(view) {
  if (!S.R.events.length) return noData(view);
  const tieEvents = S.R.events.filter(e => e.rows.some(r => r.tie));
  const decideAll = can.chief() && !archived();
  const ties = tieEvents.map(e => {
    const tied = e.rows.filter(r => r.tie).sort((a, b) => b.final - a.final), decide = decideAll && !e.lock;
    return `<div class="tiebox"><h3>${esc(e.ev)} · ${esc(gl(e.grp))} ${e.status === "Tie – committee" ? pill("Tie – committee") : '<span class="pill s-ready">Decided</span>'}${lockChip(e)}</h3>
      <div class="scroll"><table><thead><tr><th>Chest</th><th>Name</th><th>Centre</th><th class="c">Final</th><th class="c">Rank</th><th>Committee decision</th><th>Reason / note</th></tr></thead><tbody>
      ${tied.map(r => { const d = S.decisions.get(r.e.eid) || {}; return `<tr data-eid="${esc(r.e.eid)}"><td class="num">${esc(r.e.id)}</td><td>${esc(r.e.name)}</td><td>${esc(r.e.centre)}</td><td class="c num"><b>${fmt(r.final)}</b></td><td class="c num">${r.rank}</td>
        <td><select class="in" data-f="pos" ${decide ? "" : "disabled"} aria-label="Decision for ${esc(r.e.id)}"><option value="">— decide —</option>${["1st", "2nd", "3rd", "None"].map(p => `<option ${d.pos === p ? "selected" : ""}>${p}</option>`).join("")}</select></td>
        <td><input class="in" data-f="note" size="22" value="${esc(d.note || "")}" ${decide ? "" : "disabled"} placeholder="e.g. higher Voice marks" aria-label="Reason">${d.by ? `<div class="small muted" title="${esc(d.by)}">Recorded by ${d.by === S.user.email ? "you" : shortName(d.name, d.by)}</div>` : ""}</td></tr>`; }).join("")}
      </tbody></table></div></div>`;
  }).join("");
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Results &amp; ties</h2><p>A tie is flagged only when it affects 1st, 2nd or 3rd. Take it to the committee; the chief tabulator then records the decided place for each tied entry. "None" means no place.</p></div>
      <div class="actions"><button class="btn" id="dlRes">Download (.xlsx)</button></div></div>
    ${tieEvents.length ? `<div style="display:grid;gap:10px">${!can.chief() ? '<div class="banner info small">Only the chief tabulator or an admin can record committee decisions.</div>' : ""}${ties}</div>` : '<div class="banner ok">No ties affecting 1st, 2nd or 3rd so far.</div>'}
    <div class="panel scroll"><table><thead><tr><th>Event</th><th>Group</th><th>Status</th><th>1st</th><th>2nd</th><th>3rd</th></tr></thead><tbody>
      ${S.R.events.map(e => `<tr><td>${esc(e.ev)}</td><td class="muted">${esc(gl(e.grp))}</td><td>${pill(e.status)}${lockChip(e)}</td>${["1st", "2nd", "3rd"].map(p => `<td>${holder(e.places[p])}</td>`).join("")}</tr>`).join("")}
    </tbody></table></div></div>`;
  view.querySelectorAll(".tiebox").forEach(box => box.addEventListener("change", ev => {
    const tr = ev.target.closest("tr[data-eid]"); if (!tr) return;
    const eid = tr.dataset.eid, pos = tr.querySelector('[data-f="pos"]').value, note = tr.querySelector('[data-f="note"]').value.trim();
    if (pos) S.decisions.set(eid, { pos, note }); else S.decisions.delete(eid);
    renderAll();
    enqueue("dec-" + eid, () => D.saveDecision(S.ed, eid, pos ? { pos, note } : null)).then(() => toast(pos ? "Decision saved" : "Decision cleared")).catch(handleWriteError);
  }));
  $("#dlRes").onclick = () => downloadXlsx(`Kalamela_${S.ed}_Results.xlsx`, [resultsSheet()]);
}
export function resultsSheet() {
  const rows = [["Event", "Group", "Status", "Place", "Chest / Team", "Name", "Sakha", "Centre", "Final score"]];
  for (const e of S.R.events) for (const p of ["1st", "2nd", "3rd"]) {
    const rs = e.places[p];
    if (!rs.length) rows.push([e.ev, gl(e.grp), e.status, p, "", "", "", "", ""]);
    for (const r of rs) rows.push([e.ev, gl(e.grp), e.status, p, r.e.id, r.e.name, r.e.sakha, r.e.centre, r.final]);
  }
  return { name: "Results", rows };
}

// ================================================================ RESULT SLIP
function vSlip(view) {
  if (!S.R.events.length) return noData(view);
  if (!slipKey || !S.R.byKey.has(slipKey)) slipKey = S.R.events[0].key;
  const e = S.R.byKey.get(slipKey);
  const rows = ["1st", "2nd", "3rd"].flatMap(p => e.places[p].length ? e.places[p].map(r => ({ p, r, shared: e.places[p].length > 1 })) : [{ p, r: null }]);
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Result slip</h2><p>Pick the event, then print it or read it out for the announcer. Announce only when the status is Ready.</p></div><div class="actions">${printBtn()}</div></div>
    <div class="picker"><button class="btn" id="sPrev" aria-label="Previous event">‹</button><select class="sel" id="slipPick" aria-label="Event">${eventOptions(slipKey)}</select><button class="btn" id="sNext" aria-label="Next event">›</button></div>
    <article class="slip">
      <div style="display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;justify-content:space-between">
        <div><div class="ev">${esc(e.ev)}</div><div class="grp">${esc(gl(e.grp))} · ${esc(S.edition?.name || "")} Kalamela</div></div>${pill(e.status)}</div>
      ${e.status !== "Ready" ? `<div class="banner warn">Not final yet – do not announce. <small>${esc(e.status)}.</small></div>` : ""}
      <div class="lockbar noprint" id="lockBar"></div>
      <div>${rows.map(({ p, r, shared }) => `<div class="row"><div class="place ${placeClass(p)}">${p}${shared ? '<div class="small muted" style="font-family:var(--f-body);font-weight:500">shared</div>' : ""}</div>
        ${r ? `<div class="ch">${esc(r.e.id)}</div><div class="nm">${esc(r.e.name)}<small>${esc(r.e.sakha)} Sakha · ${esc(r.e.centre)}</small></div>` : `<div class="ch muted">—</div><div class="nm muted">No ${p} place</div>`}</div>`).join("")}</div>
    </article></div>`;
  lockBar(e, view);
  const go = k => { slipKey = k; store.set("slip", k); vSlip(view); };
  const i = S.R.events.findIndex(x => x.key === slipKey);
  $("#slipPick").onchange = ev => go(ev.target.value);
  $("#sPrev").onclick = () => S.R.events[i - 1] && go(S.R.events[i - 1].key);
  $("#sNext").onclick = () => S.R.events[i + 1] && go(S.R.events[i + 1].key);
  wirePrint(view);
}

function lockBar(e, view) {
  const box = $("#lockBar"), chief = can.chief() && !archived();
  if (e.lock) {
    box.innerHTML = `<div class="banner info" style="justify-content:space-between">${esc(lockedNote(e))}. Marks and tie decisions for this event are locked.
      ${chief ? `<button class="btn" id="unlockBtn">Unlock for a correction…</button>` : ""}</div>
      <div id="unlockForm" hidden><label class="field"><span>Why is it being unlocked? (kept in the audit log)</span><input class="txt" id="unlockWhy" maxlength="300" placeholder="e.g. Judge II total for 1012 misread"></label>
      <div style="display:flex;gap:8px;margin-top:8px"><button class="btn danger" id="unlockOk">Unlock</button><button class="btn" id="unlockNo">Cancel</button></div></div>`;
    if (!chief) return;
    const hold = on => { view.dataset.keep = on ? "1" : ""; view._refresh = on ? () => {} : null; };   // don't redraw while the reason is being typed
    $("#unlockBtn").onclick = () => { $("#unlockForm").hidden = false; hold(true); $("#unlockWhy").focus(); };
    $("#unlockNo").onclick = () => { $("#unlockForm").hidden = true; hold(false); renderAll(); };
    $("#unlockOk").onclick = () => {
      const why = $("#unlockWhy").value.trim(); if (why.length < 3) return toast("Write a short reason first.", "bad");
      hold(false);
      enqueue("lock-" + e.key, () => D.unlockEvent(S.ed, e.key, why)).then(() => { toast("Unlocked. Lock it again after the correction is announced."); renderAll(); }).catch(handleWriteError);
    };
  } else if (chief && e.status === "Ready") {
    box.innerHTML = `<div class="banner ok" style="justify-content:space-between">Ready to announce. After announcing, lock the result so it can't change by accident.
      <button class="btn primary" id="lockBtn">Mark as announced and lock</button></div>`;
    $("#lockBtn").onclick = () => { flushAll(); enqueue("lock-" + e.key, () => D.lockEvent(S.ed, e.key)).then(() => toast("Announced and locked.")).catch(handleWriteError); };
  } else box.innerHTML = "";
}

// ================================================================ ALL RESULTS
function vAll(view) {
  if (!S.R.events.length) return noData(view);
  const evs = S.R.events.filter(e => !allReadyOnly || e.status === "Ready");
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>All results</h2><p>Every event's 1st, 2nd and 3rd. Shared places list both names.</p></div>
      <div class="actions"><label class="chk"><input type="checkbox" id="readyOnly" ${allReadyOnly ? "checked" : ""}> Ready events only</label>${printBtn()}<button class="btn" id="dlAll">Download (.xlsx)</button></div></div>
    <h2 class="printonly">${esc(S.edition?.name || "")} Kalamela – results</h2>
    <div class="panel scroll"><table><thead><tr><th>Event</th><th>Status</th><th>Place</th><th>Chest / Team</th><th>Name</th><th>Sakha</th><th>Centre</th></tr></thead><tbody>
      ${evs.map(e => ["1st", "2nd", "3rd"].map((p, k) => { const rs = e.places[p];
        return `<tr${k === 2 ? ' style="border-bottom:2px solid var(--line-strong)"' : ""}>${k === 0 ? `<td rowspan="3"><b>${esc(e.ev)}</b><div class="small muted">${esc(gl(e.grp))}</div></td><td rowspan="3">${pill(e.status)}</td>` : ""}
          <td class="place ${placeClass(p)}">${p}</td><td class="num">${rs.map(r => esc(r.e.id)).join(" / ") || '<span class="muted">—</span>'}</td><td>${rs.map(r => esc(r.e.name)).join(" / ")}</td><td>${rs.map(r => esc(r.e.sakha)).join(" / ")}</td><td>${rs.map(r => esc(r.e.centre)).join(" / ")}</td></tr>`; }).join("")).join("") || '<tr><td colspan="7" class="muted">No events are ready yet.</td></tr>'}
    </tbody></table></div></div>`;
  $("#readyOnly").onchange = ev => { allReadyOnly = ev.target.checked; vAll(view); };
  $("#dlAll").onclick = () => downloadXlsx(`Kalamela_${S.ed}_All_Results.xlsx`, [resultsSheet()]);
  wirePrint(view);
}

// ================================================================ SCOREBOARD
function vBoard(view) {
  if (!S.R.events.length) return noData(view);
  const p = cfg().points || {}, max = Math.max(1, ...S.R.board.map(c => c.total)), ready = S.R.events.filter(e => e.status === "Ready").length;
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Overall championship</h2><p>Centre points from final places: individual events ${(p.individual || []).join(" / ")}, team events ${(p.team || []).join(" / ")}. Results in: ${ready} of ${S.R.events.length} events.</p></div>
      <div class="actions"><button class="btn" id="bigBtn">${bigBoard ? "Normal size" : "Projector size"}</button></div></div>
    <div class="board ${bigBoard ? "big" : ""}">${S.R.board.map(c => `<div class="brow ${c.rank === 1 && c.total > 0 ? "lead" : ""}"><div class="rk">${c.rank}</div>
      <div><div class="nm">${esc(c.centre)}</div><div class="split">Individual ${c.ind} · Team ${c.team}</div>
      <div class="track"><i class="ind" style="width:${(c.ind / max) * 100}%"></i><i class="tm" style="width:${(c.team / max) * 100}%"></i></div></div>
      <div class="tot">${c.total}</div></div>`).join("")}</div>
    <div class="small muted"><span style="display:inline-block;width:10px;height:10px;background:var(--maroon);border-radius:2px"></span> Individual &nbsp; <span style="display:inline-block;width:10px;height:10px;background:var(--teal);border-radius:2px"></span> Team</div></div>`;
  $("#bigBtn").onclick = async () => {
    bigBoard = !bigBoard; vBoard(view);
    try { if (bigBoard) await document.documentElement.requestFullscreen(); else if (document.fullscreenElement) await document.exitFullscreen(); } catch {}
  };
}

// ================================================================ PRATHIBHA & THILAKAM
function vAwards(view) {
  if (!S.R.events.length) return noData(view);
  const minPts = Number(cfg().awardMinPoints ?? 13);
  const card = (title, g) => {
    const list = S.R.people.filter(p => p.gender === g && p.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 6);
    const top = list[0], tied = top ? list.filter(p => p.pts === top.pts) : [], win = top && top.pts >= minPts;
    return `<div class="awcard"><div class="t">${title}</div>
      ${win ? (tied.length > 1 ? `<div class="w">Tie – committee</div><div>${tied.map(p => esc(p.name)).join(" / ")} · ${top.pts} points</div>`
        : `<div class="w">${esc(top.name)}</div><div class="muted">${esc(top.id)} · ${esc(top.sakha)} Sakha · ${esc(top.centre)} · <b>${top.pts} points</b></div>`)
        : `<div class="w muted">No award yet</div><div class="muted small">Needs at least ${minPts} individual-event points.${top ? ` Highest so far: ${top.pts}.` : ""}</div>`}
      <table><thead><tr><th>Chest</th><th>Name</th><th>Centre</th><th class="c">Points</th></tr></thead><tbody>
      ${list.map(p => `<tr><td class="num">${esc(p.id)}</td><td>${esc(p.name)}<div class="small muted">${esc(p.wins.join(", "))}</div></td><td>${esc(p.centre)}</td><td class="c num"><b>${p.pts}</b></td></tr>`).join("") || '<tr><td colspan="4" class="muted">No points yet.</td></tr>'}
      </tbody></table></div>`;
  };
  const noGender = S.R.people.filter(p => !p.gender && p.pts > 0);
  const warn = noGender.length ? `<div class="banner warn" style="display:block"><b>${noGender.length} participant(s) with points have no gender</b> and are not counted for either award: chest ${noGender.map(p => esc(p.id)).join(", ")}. An admin sets it under Entries → Participants.</div>` : "";
  view.innerHTML = `<div class="view">${warn}<div class="vhead"><div><h2>Kalaprathibha &amp; Kalathilakam</h2><p>Highest individual-event points (team events not counted), minimum ${minPts} points.</p></div><div class="actions">${printBtn()}</div></div>
    <div class="award">${card("Kalaprathibha (male)", "Male")}${card("Kalathilakam (female)", "Female")}</div></div>`;
  wirePrint(view);
}

// ================================================================ EVENT LISTS
function vLists(view) {
  if (!S.R.events.length) return noData(view);
  if (!listKey_ || !S.R.byKey.has(listKey_)) listKey_ = S.R.events[0].key;
  const e = S.R.byKey.get(listKey_), team = e.grp === "op";
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Event lists</h2><p>Who is in each event, for stage managers and the intake desk.</p></div>
      <div class="actions">${printBtn("Print this list")}<button class="btn" id="dlLists">Download all lists (.xlsx)</button></div></div>
    <div class="picker"><select class="sel" id="listPick" aria-label="Event">${eventOptions(listKey_)}</select><span class="muted">${e.n} entr${e.n === 1 ? "y" : "ies"}</span></div>
    <h2 class="printonly">${esc(e.ev)} · ${esc(gl(e.grp))}</h2>
    <div class="panel scroll"><table><thead><tr><th>${team ? "Team" : "Chest"}</th><th>Name</th><th>Sakha</th><th>Centre</th><th>${team ? "Members" : "Gender"}</th></tr></thead><tbody>
      ${e.rows.map(r => `<tr><td class="num"><b>${esc(r.e.id)}</b></td><td>${esc(r.e.name)}</td><td>${esc(r.e.sakha)}</td><td>${esc(r.e.centre)}</td><td class="small">${team ? esc((r.e.members || []).map(m => (m.chest ? m.chest + " " : "") + m.name + (m.role === "Substitute" ? " (sub)" : "")).join(", ")) : esc(r.e.gender)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  $("#listPick").onchange = ev => { listKey_ = ev.target.value; vLists(view); };
  $("#dlLists").onclick = () => downloadXlsx(`Kalamela_${S.ed}_Event_Lists.xlsx`, S.R.events.map(x => ({
    name: `${x.ev} ${x.grp === "op" ? "" : gl(x.grp).replace("Group ", "G")}`.trim(),
    rows: [[`${x.ev} · ${gl(x.grp)}`], [], [x.grp === "op" ? "Team" : "Chest", "Name", "Sakha", "Centre", x.grp === "op" ? "Members" : "Gender"],
      ...x.rows.map(r => [r.e.id, r.e.name, r.e.sakha, r.e.centre, x.grp === "op" ? (r.e.members || []).map(m => m.name).join(", ") : r.e.gender])],
  })));
  wirePrint(view);
}

// ================================================================ CERTIFICATES & KENDRA
function placedRows() {
  const out = [];
  for (const e of S.R.events) for (const p of ["1st", "2nd", "3rd"]) for (const r of e.places[p]) out.push({ e, p, r });
  return out;
}
function vCerts(view) {
  if (!S.R.events.length) return noData(view);
  const pr = placedRows(), ind = pr.filter(x => x.e.grp !== "op"), team = pr.filter(x => x.e.grp === "op");
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Certificates</h2><p>Every final 1st, 2nd and 3rd. Team winners are listed member by member.</p></div>
      <div class="actions">${printBtn()}<button class="btn" id="dlCert">Download (.xlsx)</button></div></div>
    <div class="panel scroll"><table><thead><tr><th>Event</th><th>Group</th><th>Place</th><th>Chest</th><th>Name</th><th>Sakha</th><th>Centre</th></tr></thead><tbody>
      ${ind.map(({ e, p, r }) => `<tr><td>${esc(e.ev)}</td><td class="muted">${esc(gl(e.grp))}</td><td class="place ${placeClass(p)}">${p}</td><td class="num">${esc(r.e.id)}</td><td>${esc(r.e.name)}</td><td>${esc(r.e.sakha)}</td><td>${esc(r.e.centre)}</td></tr>`).join("") || '<tr><td colspan="7" class="muted">No individual places yet.</td></tr>'}
    </tbody></table></div>
    <h3>Team events</h3>
    <div class="panel scroll"><table><thead><tr><th>Event</th><th>Place</th><th>Team</th><th>Member</th><th>Role</th><th>Sakha</th><th>Centre</th></tr></thead><tbody>
      ${team.flatMap(({ e, p, r }) => (r.e.members?.length ? r.e.members : [{ name: "(members not listed)", role: "" }]).map(m => `<tr><td>${esc(e.ev)}</td><td class="place ${placeClass(p)}">${p}</td><td class="num">${esc(r.e.id)}</td><td>${esc(m.name)}</td><td class="muted">${esc(m.role)}</td><td>${esc(r.e.sakha)}</td><td>${esc(r.e.centre)}</td></tr>`)).join("") || '<tr><td colspan="7" class="muted">No team places yet.</td></tr>'}
    </tbody></table></div></div>`;
  $("#dlCert").onclick = () => downloadXlsx(`Kalamela_${S.ed}_Certificates.xlsx`, [
    { name: "Individual", rows: [["Event", "Group", "Place", "Chest", "Name", "Sakha", "Centre"], ...ind.map(({ e, p, r }) => [e.ev, gl(e.grp), p, r.e.id, r.e.name, r.e.sakha, r.e.centre])] },
    { name: "Team members", rows: [["Event", "Place", "Team", "Member", "Role", "Sakha", "Centre"], ...team.flatMap(({ e, p, r }) => (r.e.members || []).map(m => [e.ev, p, r.e.id, m.name, m.role, r.e.sakha, r.e.centre]))] }]);
  wirePrint(view);
}
function vKendra(view) {
  if (!S.R.events.length) return noData(view);
  const minPct = Number(cfg().minPercent ?? 50);
  const q = placedRows().filter(x => (x.p === "1st" || x.p === "2nd") && x.r.pct >= minPct);
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Kendra qualifiers</h2><p>1st and 2nd places with at least ${minPct}% go to the Kendra Kalamela.</p></div>
      <div class="actions">${printBtn()}<button class="btn" id="dlK">Download (.xlsx)</button></div></div>
    <div class="panel scroll"><table><thead><tr><th>Event</th><th>Group</th><th>Place</th><th>Chest / Team</th><th>Name</th><th>Sakha</th><th>Centre</th><th class="c">Final</th></tr></thead><tbody>
      ${q.map(({ e, p, r }) => `<tr><td>${esc(e.ev)}</td><td class="muted">${esc(gl(e.grp))}</td><td class="place ${placeClass(p)}">${p}</td><td class="num">${esc(r.e.id)}</td><td>${esc(r.e.name)}</td><td>${esc(r.e.sakha)}</td><td>${esc(r.e.centre)}</td><td class="c num">${fmt(r.final)}</td></tr>`).join("") || '<tr><td colspan="8" class="muted">No qualifiers yet.</td></tr>'}
    </tbody></table></div></div>`;
  $("#dlK").onclick = () => downloadXlsx(`Kalamela_${S.ed}_Kendra_Qualifiers.xlsx`, [{ name: "Kendra", rows: [["Event", "Group", "Place", "Chest / Team", "Name", "Sakha", "Centre", "Final score"], ...q.map(({ e, p, r }) => [e.ev, gl(e.grp), p, r.e.id, r.e.name, r.e.sakha, r.e.centre, r.final])] }]);
  wirePrint(view);
}
