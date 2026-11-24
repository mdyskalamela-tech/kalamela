// Admin screens: Centre forms, participants & admit cards, rules, years, team & roles, backup & audit.
// Each function receives the view element and a context object from app.js.

import { $, $$, esc, toast, fmtDate, fmtTime, downloadXlsx, downloadText, makeThumb, confirmBox } from "./util.js";
import { slug, listKey, eventIndex, eventDef, LETTERS } from "./compute.js";
import { readCentreForm } from "./importer.js";
import { DEFAULT_CONFIG } from "./defaults.js";

const clone = o => JSON.parse(JSON.stringify(o));
const phaseName = p => ({ setup: "Setting up", live: "Live", archived: "Archived" }[p] || p);
const fail = e => { console.error(e); toast(e && e.code === "permission-denied" ? "Not allowed: check your role and the year's phase." : (e && e.message) || "Something went wrong. Try again.", "bad"); };

// ================================================================ CENTRE FORMS
let pending = [];   // parsed forms waiting to be saved
let buildMsg = "";
export function vCentres(view, ctx) {
  const { S, cfg, phase, D } = ctx;
  ctx.watchPeople();
  const setup = phase() === "setup";
  view.dataset.keep = "1";
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Centre forms</h2><p>Upload each Centre's filled Excel form. The site checks it against this year's rules, keeps the photos, and lists anything the Centre must fix. Uploading a Centre again replaces its earlier form.</p></div></div>
    ${setup ? "" : `<div class="banner info">This year is ${esc(phaseName(phase()))}. Centre forms and event lists are locked. To change them, switch the year back to Setting up under Years.</div>`}
    <section class="card"><h3>1. Upload Centre forms</h3>
      <p>Choose one or several .xlsx files. Nothing is saved until you press Save for each Centre.</p>
      <input type="file" id="cf" accept=".xlsx" multiple aria-label="Centre forms (.xlsx)" ${setup ? "" : "disabled"}>
      <div id="pending" style="display:grid;gap:10px"></div></section>
    <section class="card"><h3>2. Centres received</h3><div id="centresTable"></div></section>
    <section class="card"><h3>3. Build event lists and chest numbers</h3>
      <p>Run this after all Centre forms are in. Group chest numbers start at 1001, 2001… in Centre, Sakha and name order. Numbers already given are kept if you build again, so printed admit cards stay valid.</p>
      <div id="buildBox"></div></section></div>`;
  $("#cf").onchange = async ev => {
    const files = [...ev.target.files]; ev.target.value = "";
    for (const f of files) {
      try {
        const buf = new Uint8Array(await f.arrayBuffer());
        const r = await readCentreForm(buf, f.name, cfg(), { XLSX: window.XLSX, JSZip: window.JSZip });
        pending = pending.filter(p => p.centre.name !== r.centre.name); pending.push(r);
      } catch (e) { pending.push({ error: e.message, file: f.name }); }
    }
    drawPending();
  };
  function drawPending() {
    $("#pending").innerHTML = pending.map((r, i) => r.error
      ? `<div class="banner bad">${esc(r.file)}: ${esc(r.error)} <button class="btn" data-drop="${i}">Dismiss</button></div>`
      : `<div class="evcard"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between">
          <div><b>${esc(r.centre.name)}</b> <span class="muted small">${esc(r.centre.file)}</span><div class="small muted">${r.people.length} people · ${r.entries.length} individual entries · ${r.teams.length} teams · ${r.people.filter(p => p.photo).length} photos · Sakhas: ${esc(r.centre.sakhas.join(", "))}</div></div>
          <div style="display:flex;gap:8px"><button class="btn primary" data-save="${i}" ${setup ? "" : "disabled"}>Save ${esc(r.centre.name)}</button><button class="btn" data-drop="${i}">Discard</button></div></div>
        ${r.issues.length ? `<div class="issues">${r.issues.map(x => `<div class="${x.sheet === "Photos" ? "photo" : ""}">${esc(x.sheet)}${x.row ? " row " + esc(x.row) : ""}: ${esc(x.msg)}</div>`).join("")}</div>
          <p class="small muted">${r.issues.length} issue(s). You can still save; ask the Centre to fix the form and upload it again.</p>` : `<div class="banner ok small">No problems found.</div>`}</div>`).join("");
    $$("[data-drop]", $("#pending")).forEach(b => b.onclick = () => { pending.splice(Number(b.dataset.drop), 1); drawPending(); });
    $$("[data-save]", $("#pending")).forEach(b => b.onclick = async () => {
      const r = pending[Number(b.dataset.save)]; b.disabled = true; b.textContent = "Saving…";
      try { await saveCentre(r); pending = pending.filter(x => x !== r); drawPending(); toast(`${r.centre.name} saved`); }
      catch (e) { fail(e); b.disabled = false; b.textContent = `Save ${r.centre.name}`; }
    });
  }
  async function saveCentre(r) {
    const { cid, centreDoc, participants } = await centreDocs(r, S.participants, makeThumb);
    await D.importCentre(S.ed, cid, centreDoc, participants);
    D.logAdmin(S.ed, "import", `${r.centre.name}: ${r.people.length} people, ${r.entries.length} entries, ${r.teams.length} teams`);
  }
  function drawTable() {
    const cs = [...S.centres.entries()].map(([id, c]) => [id, { ...c, __id: id }]).sort((a, b) => a[1].name.localeCompare(b[1].name)), fees = cfg().fees || {};
    const due = c => (c.entries?.length || 0) * (fees.individual || 0) + (c.teams?.length || 0) * (fees.team || 0) + (c.sakhas?.length || 0) * (fees.sakha || 0);
    const tot = cs.reduce((a, [, c]) => ({ p: a.p + (c.counts?.people || 0), e: a.e + (c.entries?.length || 0), t: a.t + (c.teams?.length || 0), f: a.f + (c.food?.total || 0), d: a.d + due(c), paid: a.paid + Number(S.payments.get(c.__id)?.amount || 0) }), { p: 0, e: 0, t: 0, f: 0, d: 0, paid: 0 });
    const el = $("#centresTable"); if (!el) return;
    if (!cs.length) { el.innerHTML = `<p>No Centre forms saved yet.</p>`; return; }
    el.innerHTML = `<div class="scroll"><table><thead><tr><th>Centre</th><th>Saved</th><th class="c">People</th><th class="c">Entries</th><th class="c">Teams</th><th class="c">Photos</th><th class="c">Issues</th><th class="c">Food</th><th class="c">Fee due (Rs.)</th><th>Paid (Rs.)</th><th></th></tr></thead><tbody>
      ${cs.map(([id, c]) => `<tr data-id="${esc(id)}"><td><b>${esc(c.name)}</b><div class="small muted">${esc(c.file || "")}</div></td><td class="small">${esc(fmtTime(c.importedAt))}</td>
        <td class="c num">${c.counts?.people ?? ""}</td><td class="c num">${c.entries?.length ?? ""}</td><td class="c num">${c.teams?.length ?? ""}</td><td class="c num">${c.counts?.photos ?? ""}</td>
        <td class="c">${c.issues?.length ? `<button class="btn" data-iss="${esc(id)}" style="padding:2px 8px">${c.issues.length}</button>` : '<span class="chip ok">0</span>'}</td>
        <td class="c num">${c.food?.total || 0}</td><td class="c num">${due(c)}</td>
        <td><input class="in" data-paid="${esc(id)}" size="7" inputmode="numeric" value="${esc(S.payments.get(id)?.amount ?? "")}" aria-label="Paid by ${esc(c.name)}" ${phase() === "archived" ? "disabled" : ""}></td>
        <td>${setup ? `<button class="btn danger" data-rm="${esc(id)}" style="padding:2px 8px">Remove</button>` : ""}</td></tr>
        <tr data-issrow="${esc(id)}" hidden><td colspan="11"><div class="issues">${(c.issues || []).map(x => `<div class="${x.sheet === "Photos" ? "photo" : ""}">${esc(x.sheet)}${x.row ? " row " + esc(x.row) : ""}: ${esc(x.msg)}</div>`).join("")}</div></td></tr>`).join("")}
      <tr><td><b>Total</b></td><td></td><td class="c num"><b>${tot.p}</b></td><td class="c num"><b>${tot.e}</b></td><td class="c num"><b>${tot.t}</b></td><td></td><td></td><td class="c num"><b>${tot.f}</b></td><td class="c num"><b>${tot.d}</b></td><td class="num"><b>${tot.paid}</b></td><td></td></tr>
      </tbody></table></div><p class="small muted">Fee due = individual entries × Rs. ${fees.individual || 0} + teams × Rs. ${fees.team || 0} + Sakhas × Rs. ${fees.sakha || 0}. Food is the headcount the Centre entered.</p>`;
    $$("[data-iss]", el).forEach(b => b.onclick = () => { const r = $(`[data-issrow="${CSS.escape(b.dataset.iss)}"]`, el); r.hidden = !r.hidden; });
    $$("[data-paid]", el).forEach(i => i.onchange = () => D.savePayment(S.ed, i.dataset.paid, { amount: Number(i.value) || 0 }).then(() => toast("Payment saved")).catch(fail));
    $$("[data-rm]", el).forEach(b => b.onclick = async () => {
      const c = S.centres.get(b.dataset.rm);
      if (await confirmBox($("#centresTable"), { title: `Remove ${c.name}?`, body: "Its participants are removed too. Event lists change only when you build them again.", confirmLabel: "Remove", danger: true })) {
        try { await D.removeCentre(S.ed, b.dataset.rm); D.logAdmin(S.ed, "remove-centre", c.name); toast("Removed"); } catch (e) { fail(e); }
      }
    });
  }
  function drawBuild() {
    const el = $("#buildBox"); if (!el) return;
    const built = S.edition?.listsBuiltAt;
    el.innerHTML = `<p>${built ? `Last built ${esc(fmtTime(built))}: <b>${S.lists.size}</b> event lists.` : "Not built yet."} Centres saved: <b>${S.centres.size}</b>.</p>
      <div><button class="btn primary" id="build" ${setup && S.centres.size && S.loaded.participants ? "" : "disabled"}>${built ? "Rebuild event lists" : "Build event lists and chest numbers"}</button></div><div id="buildOut" class="small">${buildMsg}</div>`;
    $("#build").onclick = async () => {
      if (S.marks.size && !(await confirmBox(el, { title: "Marks already exist", body: `${S.marks.size} entries have marks. Rebuilding keeps chest numbers, but entries removed from Centre forms will drop out of the results.`, confirmLabel: "Rebuild anyway", danger: true }))) return;
      const out = $("#buildOut"); buildMsg = ""; out.textContent = "Building…";
      try {
        const b = buildLists(cfg(), S.centres, S.participants);
        const remove = [...S.lists.keys()].filter(k => !b.lists.some(L => L.key === k));
        await D.writeBuild(S.ed, b.chestUpdates, b.lists, remove);
        await D.updateEdition(S.ed, { listsBuiltAt: new Date().toISOString() });
        D.logAdmin(S.ed, "build", `${b.lists.length} lists, ${b.chestUpdates.length} new chest numbers`);
        buildMsg = `<div class="banner ok">Built ${b.lists.length} event lists. ${b.chestUpdates.length} new chest numbers given.</div>${b.warnings.length ? `<div class="issues">${b.warnings.map(w => `<div>${esc(w)}</div>`).join("")}</div>` : ""}`;
        const o2 = $("#buildOut"); if (o2) o2.innerHTML = buildMsg;
      } catch (e) { out.textContent = ""; fail(e); }
    };
  }
  view._refresh = () => { drawTable(); drawBuild(); };
  drawPending(); drawTable(); drawBuild();
}

/** Turn one parsed Centre form into the documents to save. Keeps chest numbers and photos already saved for the same person. */
export async function centreDocs(r, existing, thumb) {
  const cid = slug(r.centre.name), pidOf = {}, participants = [];
  for (const p of r.people) {
    const pid = `${cid}~${slug(p.name)}~${p.dob || "nodob"}`; pidOf[p.key] = pid;
    const old = existing.get(pid);
    const photo = p.photo && thumb ? await thumb(p.photo.data, p.photo.ext) : (old && old.photo) || "";
    participants.push({ pid, centreId: cid, centre: r.centre.name, name: p.name, gender: p.gender, dob: p.dob, group: p.group, sakha: p.sakha,
      membership: p.membership, phone: p.phone, photo, ...(old && old.chest ? { chest: old.chest } : {}),
      events: r.entries.filter(e => e.pkey === p.key).map(e => e.event), teams: r.teams.filter(t => t.members.some(m => m.pkey === p.key)).map(t => t.event) });
  }
  const centreDoc = { ...r.centre, entries: r.entries.map(e => ({ event: e.event, group: e.group, pos: e.pos, pid: pidOf[e.pkey] })),
    teams: r.teams.map(t => ({ event: t.event, pos: t.pos, sakha: t.sakha, notes: t.notes, members: t.members.map(m => ({ pid: pidOf[m.pkey], role: m.role })) })),
    issues: r.issues.slice(0, 300), counts: { people: r.people.length, entries: r.entries.length, teams: r.teams.length, photos: r.people.filter(p => p.photo).length } };
  return { cid, centreDoc, participants };
}

/** Chest numbers + event lists from the saved Centre forms. Pure: returns what to write. */
export function buildLists(config, centres, participants) {
  const warnings = [], chestUpdates = [], chestOf = new Map();
  const groups = config.groups || [];
  for (const [i, g] of groups.entries()) {
    const base = 1000 * (i + 1);
    const inGroup = [...participants.entries()].filter(([, p]) => p.group === g.code);
    let next = Math.max(base, ...inGroup.map(([, p]) => Number(p.chest) || 0)) + 1;
    for (const [pid, p] of inGroup) if (p.chest) chestOf.set(pid, p.chest);
    const fresh = inGroup.filter(([, p]) => !p.chest).sort(([, a], [, b]) => (a.centre || "").localeCompare(b.centre || "") || (a.sakha || "").localeCompare(b.sakha || "") || a.name.localeCompare(b.name));
    for (const [pid] of fresh) { chestOf.set(pid, next); chestUpdates.push([pid, next]); next++; }
  }
  for (const [, p] of participants) if (!groups.some(g => g.code === p.group)) warnings.push(`${p.name} (${p.centre}): no valid age group, so no chest number`);
  const lists = new Map();
  const listFor = (ev, grp) => {
    const key = listKey(config, ev, grp);
    if (!lists.has(key)) { const i = eventIndex(config, ev); lists.set(key, { key, ev, grp, order: i >= 0 ? i : 900, entries: [] }); }
    return lists.get(key);
  };
  for (const [, c] of centres) {
    for (const e of c.entries || []) {
      const p = participants.get(e.pid);
      if (!p) { warnings.push(`${c.name}: an entry for ${e.event} has no participant record – upload the form again`); continue; }
      if (!eventDef(config, e.event)) warnings.push(`${c.name}: "${e.event}" is not in this year's rules`);
      const ch = chestOf.get(e.pid); if (!ch) continue;
      listFor(e.event, e.group).entries.push({ eid: `${listKey(config, e.event, e.group)}__${ch}`, id: String(ch), pid: e.pid, name: p.name, gender: p.gender || "", sakha: p.sakha || "", centre: c.name, pos: e.pos });
    }
  }
  const teams = [];
  for (const [, c] of centres) for (const t of c.teams || []) teams.push({ ...t, centre: c.name });
  teams.sort((a, b) => eventIndex(config, a.event) - eventIndex(config, b.event) || a.centre.localeCompare(b.centre) || a.pos.localeCompare(b.pos));
  teams.forEach((t, i) => {
    const id = "T" + String(i + 1).padStart(2, "0"), L = listFor(t.event, "op");
    L.entries.push({ eid: `${L.key}__${id.toLowerCase()}`, id, name: `${t.sakha} Sakha team`, gender: "", sakha: t.sakha, centre: t.centre, pos: t.pos, notes: t.notes || "",
      members: t.members.map(m => { const p = participants.get(m.pid) || {}; return { name: p.name || "?", role: m.role, chest: chestOf.get(m.pid) || "" }; }) });
  });
  for (const L of lists.values()) L.entries.sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));
  return { lists: [...lists.values()], chestUpdates, warnings };
}

// ================================================================ PARTICIPANTS & ADMIT CARDS
let peopleFilter = "", peopleCards = false;
export function vPeople(view, ctx) {
  const { S, gl } = ctx; ctx.watchPeople();
  const draw = () => {
    const q = peopleFilter.toLowerCase();
    const list = [...S.participants.values()].filter(p => !q || [p.name, p.centre, p.sakha, String(p.chest || "")].some(x => String(x || "").toLowerCase().includes(q)))
      .sort((a, b) => (Number(a.chest) || 99999) - (Number(b.chest) || 99999) || a.name.localeCompare(b.name));
    const body = $("#peopleBody"); if (!body) return;
    $("#peopleCount").textContent = `${list.length} of ${S.participants.size}`;
    body.innerHTML = peopleCards
      ? `<div class="admit">${list.map(p => `<div class="card-admit">${p.photo ? `<img src="${esc(p.photo)}" alt="Photo, chest ${esc(p.chest || "")}">` : '<div class="nophoto">No photo</div>'}
          <div><div class="ch">${esc(p.chest || "—")}</div>
          <ul class="evs">${[...(p.events || []).map(e => `<li>${esc(e)}</li>`), ...(p.teams || []).map(t => `<li>${esc(t)} <span class="muted">(team)</span></li>`)].join("")}</ul></div></div>`).join("")}</div>`
      : `<div class="panel scroll"><table><thead><tr><th>Photo</th><th>Chest</th><th>Name</th><th>Group</th><th>Date of birth</th><th>Sakha</th><th>Centre</th><th>Events</th><th>Phone</th></tr></thead><tbody>
          ${list.map(p => `<tr><td>${p.photo ? `<img class="thumb" src="${esc(p.photo)}" alt="">` : '<span class="chip bad">none</span>'}</td><td class="num"><b>${esc(p.chest || "—")}</b></td><td>${esc(p.name)}<div class="small muted">${esc(p.gender)}</div></td><td>${esc(gl(p.group))}</td><td class="num small">${esc(fmtDate(p.dob))}</td><td>${esc(p.sakha)}</td><td>${esc(p.centre)}</td><td class="small">${esc([...(p.events || []), ...(p.teams || []).map(t => t + " (team)")].join(", "))}</td><td class="num small">${esc(p.phone || "")}</td></tr>`).join("") || '<tr><td colspan="9" class="muted">No participants yet. Import Centre forms first.</td></tr>'}
        </tbody></table></div>`;
  };
  view.dataset.keep = "1";
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Participants</h2><p>Everyone from the saved Centre forms, with photos and chest numbers. Switch to admit cards to print them (about 9 per A4 page). Admit cards show only the photo, chest number and events: no name, Sakha or Centre.</p></div>
      <div class="actions"><button class="btn" id="toggleCards">${peopleCards ? "Show table" : "Show admit cards"}</button><button class="btn" data-print>Print</button><button class="btn" id="dlPeople">Download (.xlsx)</button></div></div>
    <div class="picker"><input class="txt" id="pq" placeholder="Search name, chest, Sakha or Centre" value="${esc(peopleFilter)}" style="flex:1 1 260px;max-width:420px"><span class="muted" id="peopleCount"></span></div>
    <div id="peopleBody"></div></div>`;
  $("#pq").oninput = e => { peopleFilter = e.target.value; draw(); };
  $("#toggleCards").onclick = () => { peopleCards = !peopleCards; $("#toggleCards").textContent = peopleCards ? "Show table" : "Show admit cards"; draw(); };
  view.querySelector("[data-print]").onclick = () => window.print();
  $("#dlPeople").onclick = () => downloadXlsx(`Kalamela_${S.ed}_Participants.xlsx`, [{ name: "Participants", rows: [["Chest", "Name", "Gender", "Date of birth", "Group", "Sakha", "Centre", "Membership", "Phone", "Events", "Team events", "Photo"],
    ...[...S.participants.values()].sort((a, b) => (a.chest || 99999) - (b.chest || 99999)).map(p => [p.chest || "", p.name, p.gender, fmtDate(p.dob), gl(p.group), p.sakha, p.centre, p.membership, p.phone, (p.events || []).join(", "), (p.teams || []).join(", "), p.photo ? "Yes" : "No"])] }]);
  view._refresh = draw; draw();
}

// ================================================================ RULES
let work = null, workEd = null;
export function vRules(view, ctx) {
  const { S, cfg, phase, D } = ctx;
  if (!work || workEd !== S.ed) { work = clone(cfg()); workEd = S.ed; }
  const isOwner = S.user && S.user.email === D.ownerEmail();
  const locked = phase() === "archived" || (phase() === "live" && !isOwner);
  view.dataset.keep = "1";
  const num = (path, v) => `<input class="txt" type="number" step="any" data-path="${path}" value="${esc(v ?? "")}" ${locked ? "disabled" : ""}>`;
  const txt = (path, v, ph = "") => `<input class="txt" data-path="${path}" value="${esc(v ?? "")}" placeholder="${esc(ph)}" ${locked ? "disabled" : ""}>`;
  const draw = () => {
    view.innerHTML = `<div class="view">
      <div class="vhead"><div><h2>Rules for ${esc(S.edition?.name || S.ed)}</h2><p>Events, judging criteria, age groups and points for this year. Change them when the Kalamela Manual changes. Changes apply to this year only.</p></div>
        <div class="actions"><button class="btn" id="resetRules" ${locked ? "disabled" : ""}>Undo unsaved changes</button><button class="btn primary" id="saveRules" ${locked ? "disabled" : ""}>Save rules</button></div></div>
      ${phase() === "live" && !isOwner ? `<div class="banner info">The year is Live, so the scoring rules are locked. Only the Diocese account can change them now.</div>` : ""}
      ${S.lists.size ? `<div class="banner warn">Event lists are already built. Renaming or removing an event now will break its list – rebuild the lists afterwards. Changing criteria or maximum marks affects scores already entered.</div>` : ""}
      <div id="rulesMsg"></div>
      <section class="card"><h3>Day and general rules</h3><div class="grid2">
        <label class="field"><span>Kalamela date</span><input class="txt" type="date" data-path="eventDate" value="${esc(work.eventDate || "")}" ${locked ? "disabled" : ""}></label>
        <label class="field"><span>Venue</span>${txt("venue", work.venue)}</label>
        <label class="field"><span>Max individual events per person</span>${num("maxIndividualEvents", work.maxIndividualEvents)}</label>
        <label class="field"><span>Minimum % for a place</span>${num("minPercent", work.minPercent)}</label>
        <label class="field"><span>Kalaprathibha / Kalathilakam minimum points</span>${num("awardMinPoints", work.awardMinPoints)}</label>
        <label class="field"><span>Points, individual (1st, 2nd, 3rd)</span>${txt("points.individual", (work.points?.individual || []).join(", "), "5, 3, 1")}</label>
        <label class="field"><span>Points, team (1st, 2nd, 3rd)</span>${txt("points.team", (work.points?.team || []).join(", "), "15, 10, 5")}</label>
        <label class="field"><span>Fee per individual entry (Rs.)</span>${num("fees.individual", work.fees?.individual)}</label>
        <label class="field"><span>Fee per team (Rs.)</span>${num("fees.team", work.fees?.team)}</label>
        <label class="field"><span>Shakha Vihitham per Sakha (Rs.)</span>${num("fees.sakha", work.fees?.sakha)}</label></div></section>
      <section class="card"><h3>Age groups</h3><p>Born on or after "From" and on or before "To" (leave To empty for "or later"). The labels must match the sheet names in the Centre form.</p>
        ${(work.groups || []).map((g, i) => `<div class="grid2"><label class="field"><span>Label</span>${txt(`groups.${i}.label`, g.label)}</label>
          <label class="field"><span>Born from</span><input class="txt" type="date" data-path="groups.${i}.from" value="${esc(g.from || "")}" ${locked ? "disabled" : ""}></label>
          <label class="field"><span>Born to</span><input class="txt" type="date" data-path="groups.${i}.to" value="${esc(g.to || "")}" ${locked ? "disabled" : ""}></label></div>`).join("")}</section>
      <section class="card"><h3>Events and judging criteria</h3><p>Criteria are typed by the tabulation room in the order shown (A, B, C…), the same order as the printed judging sheets. Event names must match the Centre form exactly.</p>
        <div id="evList" style="display:grid;gap:10px">${(work.events || []).map((e, i) => evCard(e, i)).join("")}</div>
        <div><button class="btn" id="addEv" ${locked ? "disabled" : ""}>Add event</button></div></section></div>`;
    wire();
  };
  const evCard = (e, i) => {
    const total = (e.criteria || []).reduce((a, c) => a + Number(c.max || 0), 0);
    return `<div class="evcard" data-ev="${i}">
      <div class="head"><label class="field"><span>Event ${i + 1}</span>${txt(`events.${i}.name`, e.name)}</label>
        <label class="field"><span>Type</span><select class="txt" data-path="events.${i}.type" ${locked ? "disabled" : ""}><option value="individual" ${e.type === "individual" ? "selected" : ""}>Individual</option><option value="team" ${e.type === "team" ? "selected" : ""}>Team</option></select></label>
        <label class="field"><span>For</span><select class="txt" data-path="events.${i}.gender" ${locked ? "disabled" : ""}>${["Any", "Male", "Female"].map(g => `<option ${e.gender === g ? "selected" : ""}>${g}</option>`).join("")}</select></label>
        <label class="field"><span>Judges</span><select class="txt" data-path="events.${i}.judges" data-num="1" ${locked ? "disabled" : ""}><option value="2" ${Number(e.judges) !== 1 ? "selected" : ""}>2</option><option value="1" ${Number(e.judges) === 1 ? "selected" : ""}>1</option></select></label>
        <div style="display:flex;gap:4px"><button class="btn" data-mv="${i}" data-d="-1" title="Move up" ${locked ? "disabled" : ""}>↑</button><button class="btn" data-mv="${i}" data-d="1" title="Move down" ${locked ? "disabled" : ""}>↓</button><button class="btn danger" data-del="${i}" title="Remove event" ${locked ? "disabled" : ""}>✕</button></div></div>
      ${e.type === "team" ? `<div class="grid2"><label class="field"><span>Min members</span>${num(`events.${i}.teamMin`, e.teamMin)}</label><label class="field"><span>Max members</span>${num(`events.${i}.teamMax`, e.teamMax)}</label>
        <label class="field"><span>Substitutes allowed</span>${num(`events.${i}.substitutes`, e.substitutes ?? 2)}</label>
        <label class="field"><span>Song needed for vetting</span><select class="txt" data-path="events.${i}.needsSong" data-bool="1" ${locked ? "disabled" : ""}><option value="false">No</option><option value="true" ${e.needsSong ? "selected" : ""}>Yes</option></select></label></div>` : ""}
      <div class="crit">${(e.criteria || []).map((c, j) => `<div class="cr"><b>${LETTERS[j]}</b><input class="txt" data-path="events.${i}.criteria.${j}.name" value="${esc(c.name)}" aria-label="Criterion ${LETTERS[j]} name" ${locked ? "disabled" : ""}>
        <input class="txt" type="number" data-path="events.${i}.criteria.${j}.max" value="${esc(c.max)}" aria-label="Criterion ${LETTERS[j]} maximum" ${locked ? "disabled" : ""}><button class="btn" data-rmc="${i}.${j}" title="Remove criterion" ${locked ? "disabled" : ""}>✕</button></div>`).join("")}
        <div style="display:flex;gap:10px;align-items:center"><button class="btn" data-addc="${i}" ${locked || (e.criteria || []).length >= 10 ? "disabled" : ""}>Add criterion</button>
          <span class="small ${total === 100 ? "muted" : ""}" style="${total === 100 ? "" : "color:var(--bad);font-weight:600"}">Total per judge: ${total}${total === 100 ? "" : " (usually 100)"}</span></div></div></div>`;
  };
  const setPath = (path, v) => { const ks = path.split("."); let o = work; for (const k of ks.slice(0, -1)) o = o[/^\d+$/.test(k) ? Number(k) : k] ??= {}; o[ks.at(-1)] = v; };
  function wire() {
    $$("[data-path]", view).forEach(inp => inp.onchange = () => {
      const p = inp.dataset.path; let v = inp.value;
      if (p.startsWith("points.")) v = v.split(/[,\s]+/).filter(Boolean).map(Number);
      else if (inp.type === "number" || inp.dataset.num) v = v === "" ? null : Number(v);
      else if (inp.dataset.bool) v = v === "true";
      else v = v.trim();
      setPath(p, v);
      if (/\.(type|criteria\.\d+\.max)$/.test(p)) draw();
    });
    const ev = () => work.events;
    $$("[data-mv]", view).forEach(b => b.onclick = () => { const i = +b.dataset.mv, j = i + +b.dataset.d; if (j < 0 || j >= ev().length) return; [ev()[i], ev()[j]] = [ev()[j], ev()[i]]; draw(); });
    $$("[data-del]", view).forEach(b => b.onclick = () => { ev().splice(+b.dataset.del, 1); draw(); });
    $$("[data-addc]", view).forEach(b => b.onclick = () => { (ev()[+b.dataset.addc].criteria ||= []).push({ name: "", max: 20 }); draw(); });
    $$("[data-rmc]", view).forEach(b => b.onclick = () => { const [i, j] = b.dataset.rmc.split(".").map(Number); ev()[i].criteria.splice(j, 1); draw(); });
    $("#addEv").onclick = () => { ev().push({ name: "New event", type: "individual", gender: "Any", judges: 2, criteria: [{ name: "", max: 20 }] }); draw(); };
    $("#resetRules").onclick = () => { work = clone(cfg()); draw(); };
    $("#saveRules").onclick = async () => {
      const errs = validateConfig(work);
      if (errs.length) { $("#rulesMsg").innerHTML = `<div class="banner bad" style="display:block">Fix these first:<ul>${errs.map(e => `<li>${esc(e)}</li>`).join("")}</ul></div>`; return; }
      try { await D.updateEdition(S.ed, { config: work }); D.logAdmin(S.ed, "rules", "Rules saved"); $("#rulesMsg").innerHTML = `<div class="banner ok">Rules saved.</div>`; toast("Rules saved"); }
      catch (e) { fail(e); }
    };
  }
  draw();
}
export function validateConfig(c) {
  const errs = [], names = new Set();
  if (!(c.groups || []).length) errs.push("Add at least one age group.");
  for (const g of c.groups || []) if (!g.label || !g.from) errs.push(`Age group "${g.label || "?"}" needs a label and a "born from" date.`);
  for (const [i, e] of (c.events || []).entries()) {
    if (!e.name) errs.push(`Event ${i + 1} has no name.`);
    else if (names.has(e.name)) errs.push(`"${e.name}" appears twice.`); else names.add(e.name);
    if (!(e.criteria || []).length) errs.push(`${e.name || "Event " + (i + 1)}: add at least one criterion.`);
    for (const cr of e.criteria || []) if (!cr.name || !(Number(cr.max) > 0)) errs.push(`${e.name}: every criterion needs a name and a maximum above 0.`);
    if (e.type === "team" && !(Number(e.teamMax) >= Number(e.teamMin) && Number(e.teamMin) >= 1)) errs.push(`${e.name}: team min and max members are not valid.`);
  }
  for (const k of ["individual", "team"]) if ((c.points?.[k] || []).length !== 3 || c.points[k].some(n => !isFinite(n))) errs.push(`Points (${k}) must be three numbers, e.g. 5, 3, 1.`);
  return [...new Set(errs)];
}

// ================================================================ YEARS
export function vYears(view, ctx) {
  const { S, D } = ctx;
  view.dataset.keep = "1";
  const owner = S.user && S.user.email === D.ownerEmail();
  const draw = () => {
    const eds = [...S.editions].sort((a, b) => b.id.localeCompare(a.id));
    const next = (() => { const y = new Date().getFullYear(), m = new Date().getMonth(); const start = m >= 6 ? y : y - 1; return `${start}-${String((start + 1) % 100).padStart(2, "0")}`; })();
    view.innerHTML = `<div class="view">
      <div class="vhead"><div><h2>Kalamela years</h2><p>Each year has its own entries, marks and results. Past years stay here, read-only, once archived.</p></div></div>
      <div id="yearsMsg"></div>
      ${eds.length ? `<div class="panel scroll"><table><thead><tr><th>Year</th><th>Phase</th><th>Event lists</th><th>Created</th><th>Change phase</th></tr></thead><tbody>
        ${eds.map(e => `<tr><td><b>${esc(e.name || e.id)}</b> ${e.id === S.ed ? '<span class="chip ok">open</span>' : `<button class="btn" data-open="${esc(e.id)}" style="padding:2px 8px">Open</button>`}</td>
          <td><span class="phase ${esc(e.phase)}">${esc(phaseName(e.phase))}</span></td><td class="small">${e.listsBuiltAt ? esc(fmtTime(e.listsBuiltAt)) : "—"}</td><td class="small">${esc(fmtTime(e.createdAt))}</td>
          <td style="display:flex;gap:6px;flex-wrap:wrap">${e.phase === "setup" ? `<button class="btn primary" data-ph="${esc(e.id)}" data-to="live">Go live</button>` : ""}
            ${e.phase === "live" ? `${owner ? `<button class="btn" data-ph="${esc(e.id)}" data-to="setup">Back to setting up</button>` : ""}<button class="btn" data-ph="${esc(e.id)}" data-to="archived">Archive</button>` : ""}
            ${e.phase === "archived" ? (owner ? `<button class="btn" data-ph="${esc(e.id)}" data-to="setup">Reopen</button>` : `<span class="small muted">Read only</span>`) : ""}</td></tr>`).join("")}</tbody></table></div>` : `<div class="banner info">No Kalamela year yet. Create the first one below.</div>`}
      <section class="card"><h3>Start a new year</h3><p>Rules are copied from the year you choose, so you only change what's new. Entries and marks always start empty.</p>
        <div class="grid2"><label class="field"><span>Year (used in file names)</span><input class="txt" id="nyId" value="${esc(next)}" placeholder="2027-28"></label>
          <label class="field"><span>Display name</span><input class="txt" id="nyName" value="${esc(next.replace("-", "–"))}" placeholder="2027–28"></label>
          <label class="field"><span>Copy rules from</span><select class="txt" id="nyFrom">${eds.map(e => `<option value="${esc(e.id)}">${esc(e.name || e.id)}</option>`).join("")}<option value="">Built-in defaults (2026–27 Manual)</option></select></label></div>
        <div><button class="btn primary" id="nyCreate">Create year</button></div></section>
      <section class="card"><h3>What the phases mean</h3><p><b>Setting up</b>: import Centre forms, build event lists, practise marks entry, clear practice marks. <b>Live</b>: the day itself – entries are locked and marks can't be bulk-deleted; only the Diocese account can switch it back. <b>Archived</b>: read-only for everyone; only the Diocese account can reopen it.</p></section></div>`;
    $$("[data-open]", view).forEach(b => b.onclick = () => { $("#edPick") && ($("#edPick").value = b.dataset.open, $("#edPick").dispatchEvent(new Event("change"))); });
    $$("[data-ph]", view).forEach(b => b.onclick = async () => {
      const to = b.dataset.to, id = b.dataset.ph;
      const msgs = { live: ["Go live?", "Centre forms and event lists will be locked, and practice marks can no longer be cleared. Do this on the morning of the Kalamela after clearing practice marks.", "Go live", ""],
                     setup: ["Go back to setting up?", "Entries become editable again and marks could be cleared. Only do this if something must be corrected.", "Back to setting up", ""],
                     archived: ["Archive this year?", "Everything becomes read-only for everyone. Only the Diocese account can reopen it.", "Archive", "ARCHIVE"] }[to];
      if (!(await confirmBox($("#yearsMsg"), { title: msgs[0], body: msgs[1], confirmLabel: msgs[2], typeWord: msgs[3], danger: to !== "live" }))) return;
      try { await D.updateEdition(id, { phase: to }); D.logAdmin(id, "phase", `Phase set to ${to}`); toast(`Phase: ${phaseName(to)}`); } catch (e) { fail(e); }
    });
    $("#nyCreate").onclick = async () => {
      const id = $("#nyId").value.trim(), name = $("#nyName").value.trim() || id, from = $("#nyFrom").value;
      if (!/^[0-9]{4}-[0-9]{2}$/.test(id)) return toast("Use the form 2027-28 for the year.", "bad");
      if (S.editions.some(e => e.id === id)) return toast("That year already exists.", "bad");
      const src = from ? S.editions.find(e => e.id === from)?.config : DEFAULT_CONFIG;
      try { await D.createEdition(id, { name, config: clone(src || DEFAULT_CONFIG) }); toast(`${name} created`); } catch (e) { fail(e); }
    };
  };
  view._refresh = draw; draw();
}

// ================================================================ TEAM & ROLES
let usersCache = [], usersUnsub = null;
export function vTeam(view, ctx) {
  const { S, D } = ctx;
  view.dataset.keep = "1";
  const ROLES = { admin: "Admin", chief: "Chief tabulator", tabulator: "Tabulator", viewer: "Viewer" };
  const draw = () => {
    const el = $("#teamBody"); if (!el) return;
    const owner = D.ownerEmail();
    el.innerHTML = `<div class="panel scroll"><table><thead><tr><th>Email</th><th>Name / note</th><th>Role</th><th></th></tr></thead><tbody>
      <tr><td><b>${esc(owner)}</b></td><td class="muted">Diocese account (always admin)</td><td>Admin</td><td></td></tr>
      ${usersCache.filter(u => u.email !== owner).sort((a, b) => a.email.localeCompare(b.email)).map(u => `<tr><td>${esc(u.email)}</td><td>${esc(u.name || "")}</td>
        <td><select class="in" data-role="${esc(u.email)}" aria-label="Role for ${esc(u.email)}">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? "selected" : ""}>${v}</option>`).join("")}</select></td>
        <td><button class="btn danger" data-rmu="${esc(u.email)}" style="padding:2px 8px" ${u.email === S.user.email ? "disabled title='You cannot remove yourself'" : ""}>Remove</button></td></tr>`).join("")}</tbody></table></div>`;
    $$("[data-role]", el).forEach(s => s.onchange = () => { const u = usersCache.find(x => x.email === s.dataset.role); D.setUser(u.email, { role: s.value, name: u.name || "" }).then(() => toast("Role updated")).catch(fail); });
    $$("[data-rmu]", el).forEach(b => b.onclick = async () => { if (await confirmBox($("#teamBody"), { title: `Remove ${b.dataset.rmu}?`, body: "They lose access immediately.", confirmLabel: "Remove", danger: true })) D.removeUser(b.dataset.rmu).then(() => toast("Removed")).catch(fail); });
  };
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Team &amp; roles</h2><p>Only people listed here can sign in. They sign in with the Google account of the email you add.</p></div></div>
    <section class="card"><h3>Add a person</h3><div class="grid2">
      <label class="field"><span>Google email</span><input class="txt" id="nuEmail" type="email" placeholder="name@gmail.com"></label>
      <label class="field"><span>Name or note</span><input class="txt" id="nuName" placeholder="e.g. Tabulation – Stage 2"></label>
      <label class="field"><span>Role</span><select class="txt" id="nuRole">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${k === "tabulator" ? "selected" : ""}>${v}</option>`).join("")}</select></label></div>
      <div><button class="btn primary" id="nuAdd">Add</button></div></section>
    <div id="teamBody"></div>
    <section class="card"><h3>Roles</h3><p><b>Admin</b>: everything, including Centre forms, rules, years and this list. <b>Chief tabulator</b>: tabulation plus committee tie decisions, participants and backups. <b>Tabulator</b>: intake ticks, marks entry and verification. <b>Viewer</b>: results and scoreboard only.</p></section></div>`;
  $("#nuAdd").onclick = async () => {
    const email = $("#nuEmail").value.trim().toLowerCase(), name = $("#nuName").value.trim(), role = $("#nuRole").value;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("Enter a valid email address.", "bad");
    try { await D.setUser(email, { role, name }); $("#nuEmail").value = ""; $("#nuName").value = ""; toast(`${email} added`); } catch (e) { fail(e); }
  };
  if (!usersUnsub) usersUnsub = D.watchUsers(list => { usersCache = list; if ($("#teamBody")) draw(); }, fail);
  view._refresh = draw; draw();
}

// ================================================================ BACKUP & AUDIT
export function vBackup(view, ctx) {
  const { S, D, gl, phase, can } = ctx;
  view.dataset.keep = "1";
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Backup &amp; audit</h2><p>Take a backup every hour on the day. The audit log shows every saved mark and decision: who, when and what.</p></div></div>
    <div class="setup">
      <section class="card"><h3>Excel backup</h3><p>Every mark, the Control status, results, the scoreboard and the participant list, in one Excel file. Works as a manual fallback if the internet fails.</p><button class="btn primary" id="bkX">Download Excel backup</button></section>
      <section class="card"><h3>Full data backup</h3><p>Everything for this year (including photos) as a JSON file, for safekeeping in the Diocese Google Drive.</p><button class="btn" id="bkJ">Download full backup</button></section>
      ${can.admin() ? `<section class="card"><h3>Clear practice marks</h3><p>Deletes all marks, intake ticks and decisions for this year. Entries stay, and the audit log keeps a record that this was done. Only possible while the year is <b>Setting up</b>.</p>
        <button class="btn danger" id="clr" ${phase() === "setup" ? "" : "disabled"}>Clear practice marks</button><div id="clrMsg"></div></section>` : ""}
    </div>
    <section class="card"><h3>Audit log</h3><div><button class="btn" id="loadAudit">Show the latest 300 changes</button></div><div id="audit"></div></section></div>`;
  $("#bkX").onclick = () => {
    ctx.recompute(); const R = S.R, maxC = Math.max(1, ...ctx.cfg().events.map(e => (e.criteria || []).length));
    const head = ["Event", "Group", "Chest / Team", "Name", "Sakha", "Centre", "Attendance"];
    for (const j of [1, 2]) { for (let i = 0; i < maxC; i++) head.push(`J${j} ${LETTERS[i]}`); head.push(`J${j} written`); }
    head.push("J1 total", "J2 total", "Final", "%", "Check", "Verified", "Rank", "Position", "Points", "Committee note", "Entered by", "Entered at", "Verified by", "Verified at");
    const marks = [head];
    for (const e of R.events) for (const r of e.rows) {
      const m = r.m || {}, row = [e.ev, gl(e.grp), r.e.id, r.e.name, r.e.sakha, r.e.centre, r.att];
      for (const j of [1, 2]) { const a = m["j" + j] || []; for (let i = 0; i < maxC; i++) row.push(a[i] ?? ""); row.push(m["j" + j + "w"] ?? ""); }
      const t = ts => { if (!ts) return ""; const d = ts.toDate ? ts.toDate() : new Date(ts); return isNaN(d) ? "" : d.toLocaleString(); };
      row.push(r.t1 ?? "", r.t2 ?? "", r.final ?? "", r.pct ?? "", r.check, r.ver ? "Yes" : "", r.rank ?? "", r.pos, r.pts, r.note,
        m.enteredBy || m.by || "", t(m.enteredAt), r.ver ? m.verBy || "" : "", r.ver ? t(m.verAt) : ""); marks.push(row);
    }
    const control = [["Event", "Group", "Sheets received", "Time", "Venue", "Operator", "Entries", "Absent", "Entered OK", "Verified", "Status", "Announced (locked) by"], ...R.events.map(e => [e.ev, gl(e.grp), e.intake.rec ? "Yes" : "", e.intake.time || "", e.intake.venue || "", e.intake.op || "", e.n, e.absent, e.okc, e.verc, e.status, e.lock ? e.lock.by : ""])];
    const results = [["Event", "Group", "Status", "Place", "Chest / Team", "Name", "Sakha", "Centre", "Final"]];
    for (const e of R.events) for (const p of ["1st", "2nd", "3rd"]) for (const r of e.places[p]) results.push([e.ev, gl(e.grp), e.status, p, r.e.id, r.e.name, r.e.sakha, r.e.centre, r.final]);
    const board = [["Rank", "Centre", "Individual", "Team", "Total"], ...R.board.map(c => [c.rank, c.centre, c.ind, c.team, c.total])];
    const people = [["Chest", "Name", "Gender", "Date of birth", "Group", "Sakha", "Centre", "Phone"], ...[...S.participants.values()].map(p => [p.chest || "", p.name, p.gender, fmtDate(p.dob), gl(p.group), p.sakha, p.centre, p.phone || ""])];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
    downloadXlsx(`Kalamela_${S.ed}_Backup_${stamp}.xlsx`, [{ name: "Marks", rows: marks }, { name: "Control", rows: control }, { name: "Results", rows: results }, { name: "Scoreboard", rows: board }, ...(S.participants.size ? [{ name: "Participants", rows: people }] : [])]);
  };
  $("#bkJ").onclick = async () => {
    try { const data = await D.readAll(S.ed); const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
      downloadText(`Kalamela_${S.ed}_Full_${stamp}.json`, JSON.stringify({ edition: S.edition, exportedAt: new Date().toISOString(), ...data }, null, 1)); }
    catch (e) { fail(e); }
  };
  const clr = $("#clr");
  if (clr) clr.onclick = async () => {
    if (!(await confirmBox($("#clrMsg"), { title: "Clear all practice marks?", body: `This deletes ${S.marks.size} mark rows, all intake ticks and decisions for ${esc(S.edition?.name || S.ed)}. The audit log is kept.`, confirmLabel: "Clear", typeWord: "CLEAR", danger: true }))) return;
    try { const n = await D.clearPractice(S.ed); toast(`Cleared ${n} records`); } catch (e) { fail(e); }
  };
  $("#loadAudit").onclick = async () => {
    try {
      const rows = await D.readAudit(S.ed, 300), lookup = new Map();
      for (const L of S.lists.values()) for (const e of L.entries || []) lookup.set(e.eid, `${L.ev} · ${gl(L.grp)} · ${e.id}`);
      for (const L of S.lists.values()) lookup.set(L.key, `${L.ev} · ${gl(L.grp)}`);
      const what = a => a.kind === "verify" ? "Verified" : a.kind === "unverify" ? "Verification removed" : a.kind === "marks" && a.att && a.att !== "Present" ? a.att : a.kind === "marks" ? `J1 ${(a.j1 || []).map(v => v ?? "–").join("/")}${a.j2 && a.j2.length ? " · J2 " + a.j2.map(v => v ?? "–").join("/") : ""}${a.ver ? " · verified" : ""}`
        : a.kind === "decision" ? `Decision: ${a.pos}${a.note ? " – " + a.note : ""}`
        : a.kind === "lock" ? "Results announced – locked" : a.kind === "unlock" ? `Unlocked for a correction: ${a.detail || ""}` : a.detail || "";
      $("#audit").innerHTML = `<div class="scroll"><table><thead><tr><th>When</th><th>Who</th><th>Entry</th><th>What</th></tr></thead><tbody>
        ${rows.map(a => `<tr><td class="small num">${esc(fmtTime(a.at))}</td><td class="small">${esc(a.by)}</td><td class="small">${esc(a.eid ? lookup.get(a.eid) || a.eid : a.kind)}</td><td class="small mono">${esc(what(a))}</td></tr>`).join("") || '<tr><td colspan="4" class="muted">Nothing recorded yet.</td></tr>'}</tbody></table></div>`;
    } catch (e) { fail(e); }
  };
}
