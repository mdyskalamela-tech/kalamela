// Schedule (admin) and Stage (stage managers) screens, and the data published for the participant page.
// Stages and rooms, the running order and planned times live in editions/{year}/plan/main.
// Live stage progress lives in public/{year}/status/{eventKey}; stage attendance in editions/{year}/att/{eid}.

import { $, $$, esc, toast, enqueue } from "./util.js";

const store = { get: k => { try { return localStorage.getItem("mk." + k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem("mk." + k, v); } catch {} } };
const STATUS = { pending: "Pending", active: "On stage now", done: "Completed" };
const statusPill = st => `<span class="pill ${st === "active" ? "s-ready" : st === "done" ? "s-locked" : "s-awaiting"}">${STATUS[st] || "Pending"}</span>`;
export const stageStatusOf = (S, key) => (S.status.get(key) || {}).status || "pending";

/** Event lists placed on a stage, in running order. */
export function stageQueue(S, stageId) {
  const items = (S.plan && S.plan.items) || {};
  return [...S.lists.values()].filter(L => items[L.key] && items[L.key].stage === stageId)
    .sort((a, b) => (items[a.key].order || 0) - (items[b.key].order || 0) || (items[a.key].start || "").localeCompare(items[b.key].start || ""));
}
export function stageName(S, id) { const s = ((S.plan && S.plan.stages) || []).find(x => x.id === id); return s ? s.name : ""; }

// ================================================================ SCHEDULE (admin)
let work = null, workEd = null;
export function vSchedule(view, ctx) {
  const { S, gl, D, can } = ctx;
  if (!S.lists.size) { view.innerHTML = `<div class="panel empty"><b>No event lists yet</b><span>Build the event lists first (Entries → Centre forms), then plan the schedule here.</span><a class="btn" href="#centres">Open Centre forms</a></div>`; return; }
  if (!work || workEd !== S.ed) { work = structuredClone(S.plan || { stages: [], items: {} }); workEd = S.ed; }
  const locked = !can.admin() || ctx.phase() === "archived";
  view.dataset.keep = "1";
  const lists = [...S.lists.values()].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || String(a.key).localeCompare(String(b.key)));
  const label = L => `${L.ev} · ${gl(L.grp)}`;
  const draw = () => {
    const q = (id, L) => work.items[L.key] && work.items[L.key].stage === id;
    const unplaced = lists.filter(L => !work.items[L.key] || !work.stages.some(s => s.id === work.items[L.key].stage));
    const stageOpts = sel => `<option value="">Choose…</option>${work.stages.map(s => `<option value="${esc(s.id)}" ${s.id === sel ? "selected" : ""}>${esc(s.name)}</option>`).join("")}`;
    $("#schStages").innerHTML = work.stages.length ? work.stages.map((s, i) => `<div class="schrow">
        <label class="field" style="flex:1 1 200px"><span>Name</span><input class="txt" data-sname="${i}" value="${esc(s.name)}" maxlength="40" ${locked ? "disabled" : ""}></label>
        <label class="field"><span>Kind</span><select class="txt" data-skind="${i}" ${locked ? "disabled" : ""}><option value="stage" ${s.kind !== "room" ? "selected" : ""}>Stage</option><option value="room" ${s.kind === "room" ? "selected" : ""}>Room (written / drawing)</option></select></label>
        <button class="btn danger" data-sdel="${i}" ${locked ? "disabled" : ""} title="Remove ${esc(s.name)}">Remove</button></div>`).join("")
      : '<p class="muted">No stages yet. Add the stages and rooms used on the day.</p>';
    $("#schPlan").innerHTML = work.stages.map(s => {
      const evs = lists.filter(L => q(s.id, L)).sort((a, b) => work.items[a.key].order - work.items[b.key].order);
      return `<section class="card"><div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;justify-content:space-between">
          <h3>${esc(s.name)} <span class="muted small">${s.kind === "room" ? "Room" : "Stage"} · ${evs.length} event(s)</span></h3>
          <div class="filltimes"><label class="field"><span>First start</span><input class="txt" type="time" data-fstart="${esc(s.id)}" value="${esc(s.first || "09:00")}" ${locked ? "disabled" : ""}></label>
          <label class="field"><span>Minutes per entry</span><input class="txt" type="number" min="1" max="60" data-fmin="${esc(s.id)}" value="${esc(s.perEntry || 6)}" style="width:6em" ${locked ? "disabled" : ""}></label>
          <button class="btn" data-fill="${esc(s.id)}" ${locked || !evs.length ? "disabled" : ""}>Fill times</button></div></div>
        ${evs.length ? `<div class="scroll"><table><thead><tr><th class="c">#</th><th>Event</th><th class="c">Entries</th><th>Planned start</th><th>Move to</th><th></th></tr></thead><tbody>
          ${evs.map((L, i) => `<tr><td class="c num">${i + 1}</td><td>${esc(label(L))}</td><td class="c num">${(L.entries || []).length}</td>
            <td><input class="in" type="time" data-start="${esc(L.key)}" value="${esc(work.items[L.key].start || "")}" aria-label="Planned start: ${esc(label(L))}" ${locked ? "disabled" : ""}></td>
            <td><select class="in" data-move="${esc(L.key)}" aria-label="Move ${esc(label(L))}" ${locked ? "disabled" : ""}>${stageOpts(s.id)}<option value="-">Not scheduled</option></select></td>
            <td style="white-space:nowrap"><button class="btn" data-up="${esc(L.key)}" ${locked || i === 0 ? "disabled" : ""} title="Earlier" aria-label="Earlier">↑</button> <button class="btn" data-down="${esc(L.key)}" ${locked || i === evs.length - 1 ? "disabled" : ""} title="Later" aria-label="Later">↓</button></td></tr>`).join("")}
          </tbody></table></div>` : '<p class="muted">Nothing on this stage yet. Add events from "Not scheduled" below.</p>'}</section>`;
    }).join("") + `<section class="card"><h3>Not scheduled <span class="muted small">${unplaced.length} event(s)</span></h3>
      ${unplaced.length ? `<div class="scroll"><table><thead><tr><th>Event</th><th class="c">Entries</th><th>Put on</th></tr></thead><tbody>
        ${unplaced.map(L => `<tr><td>${esc(label(L))}</td><td class="c num">${(L.entries || []).length}</td><td><select class="in" data-move="${esc(L.key)}" aria-label="Put ${esc(label(L))} on a stage" ${locked || !work.stages.length ? "disabled" : ""}>${stageOpts("")}</select></td></tr>`).join("")}</tbody></table></div>`
        : '<p class="muted">Every event is on a stage or in a room.</p>'}</section>`;
    $("#schCount").textContent = `${lists.length - unplaced.length} of ${lists.length} events scheduled`;
  };
  const fillTimes = s => {
    const [h, m] = String(s.first || "09:00").split(":").map(Number); let t = (h || 9) * 60 + (m || 0);
    lists.filter(L => work.items[L.key] && work.items[L.key].stage === s.id).sort((a, b) => work.items[a.key].order - work.items[b.key].order)
      .forEach(L => { work.items[L.key].start = `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; t += Math.max(1, (L.entries || []).length) * (s.perEntry || 6); });
  };
  const renumber = id => lists.filter(L => work.items[L.key] && work.items[L.key].stage === id)
    .sort((a, b) => work.items[a.key].order - work.items[b.key].order).forEach((L, i) => { work.items[L.key].order = i + 1; });
  const pub = S.plan && S.plan.at ? `Last saved ${new Date(S.plan.at.toDate ? S.plan.at.toDate() : S.plan.at).toLocaleString()}.` : "Not saved yet.";
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Schedule</h2><p>Add the stages and rooms, put each event on one in running order, and give planned start times. Saving also updates the participants' "My Kalamela" page. You can change it on the day too (for example if a stage runs late).</p></div>
      <div class="actions"><span class="muted small" id="schCount"></span><button class="btn" id="schReset" ${locked ? "disabled" : ""}>Undo unsaved changes</button><button class="btn primary" id="schSave" ${locked ? "disabled" : ""}>Save and publish</button></div></div>
    ${locked && can.admin() ? '<div class="banner info">This year is archived, so the schedule is read-only.</div>' : ""}
    <section class="card"><h3>Stages and rooms</h3><div id="schStages"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="addStage" ${locked ? "disabled" : ""}>+ Add stage</button><button class="btn" id="addRoom" ${locked ? "disabled" : ""}>+ Add room</button></div>
      <p class="small muted">${esc(pub)} Participants' page: <a href="me.html" target="_blank" rel="noopener">me.html</a></p></section>
    <div id="schPlan" style="display:grid;gap:14px"></div></div>`;
  const newId = () => { let n = 1; while (work.stages.some(s => s.id === "s" + n)) n++; return "s" + n; };
  $("#addStage").onclick = () => { work.stages.push({ id: newId(), name: `Stage ${work.stages.filter(s => s.kind !== "room").length + 1}`, kind: "stage" }); draw(); };
  $("#addRoom").onclick = () => { work.stages.push({ id: newId(), name: `Room ${work.stages.filter(s => s.kind === "room").length + 1}`, kind: "room" }); draw(); };
  view.oninput = e => {
    if (view.dataset.v !== "schedule") return;
    const t = e.target, d = t.dataset;
    if (d.sname) work.stages[+d.sname].name = t.value.slice(0, 40);
    if (d.start) { work.items[d.start].start = t.value; const s = work.stages.find(x => x.id === work.items[d.start].stage); if (s) s.filled = false; }
    if (d.fstart) work.stages.find(s => s.id === d.fstart).first = t.value;
    if (d.fmin) work.stages.find(s => s.id === d.fmin).perEntry = Math.max(1, Math.min(60, Number(t.value) || 6));
  };
  view.onchange = e => {
    if (view.dataset.v !== "schedule") return;
    const t = e.target, d = t.dataset;
    if (d.skind) { work.stages[+d.skind].kind = t.value; draw(); }
    if (d.move) {
      const old = work.items[d.move];
      if (t.value === "-" || !t.value) delete work.items[d.move];
      else { const max = Math.max(0, ...Object.values(work.items).filter(x => x.stage === t.value).map(x => x.order || 0)); work.items[d.move] = { stage: t.value, order: max + 1, start: "" }; }
      if (old) renumber(old.stage); draw();
    }
  };
  view.onclick = e => {
    if (view.dataset.v !== "schedule") return;
    const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
    if (d.sdel !== undefined) { const s = work.stages[+d.sdel]; for (const [k, v] of Object.entries(work.items)) if (v.stage === s.id) delete work.items[k]; work.stages.splice(+d.sdel, 1); draw(); }
    if (d.up || d.down) {
      const key = d.up || d.down, it = work.items[key], sibs = lists.filter(L => work.items[L.key] && work.items[L.key].stage === it.stage).sort((a, b) => work.items[a.key].order - work.items[b.key].order);
      const i = sibs.findIndex(L => L.key === key), j = i + (d.up ? -1 : 1);
      if (sibs[j]) { const o = work.items[sibs[j].key].order; work.items[sibs[j].key].order = it.order; it.order = o; }
      const s = work.stages.find(x => x.id === it.stage);
      if (s && s.filled) fillTimes(s); else if (sibs.some(L => work.items[L.key].start)) toast('Order changed. Press "Fill times" to update the planned times.');
      draw();
    }
    if (d.fill) { const s = work.stages.find(x => x.id === d.fill); fillTimes(s); s.filled = true; draw(); toast(`Times filled for ${s.name}. Moving events up or down now updates them too.`); }
  };
  $("#schReset").onclick = () => { work = structuredClone(S.plan || { stages: [], items: {} }); draw(); };
  $("#schSave").onclick = async () => {
    if (work.stages.some(s => !s.name.trim())) return toast("Every stage or room needs a name.", "bad");
    const btn = $("#schSave"); btn.disabled = true;
    try {
      const plan = { stages: work.stages.map(s => ({ id: s.id, name: s.name.trim(), kind: s.kind === "room" ? "room" : "stage", first: s.first || "", perEntry: s.perEntry || 6, filled: !!s.filled })), items: work.items };
      await D.savePlan(S.ed, plan);
      const n = await D.publishPublic(S.ed, ...publicData(S, plan, ctx));
      toast(`Schedule saved. Participants' page updated for ${n} chest numbers.`);
    } catch (e) { console.error(e); toast("Couldn't save the schedule. Check the connection and try again.", "bad"); }
    btn.disabled = false;
  };
  view._refresh = () => {}; draw();
}

/** What the participant page may show: event names, groups, stages, order, planned times and chest → events.
 *  Built from the event lists; nothing personal (no names, dates of birth, phones or photos). */
export function publicData(S, plan, ctx) {
  const c = ctx.cfg(), items = [], chests = {};
  for (const L of S.lists.values()) {
    const it = plan.items[L.key];
    items.push({ key: L.key, ev: L.ev, grp: ctx.gl(L.grp), stage: it ? it.stage : "", order: it ? it.order : 0, start: it ? it.start || "" : "", n: (L.entries || []).length });
    for (const e of L.entries || []) {
      const ids = e.members ? e.members.map(m => String(m.chest || "")).filter(Boolean) : [String(e.id || "")];
      for (const id of ids) if (/^\d+$/.test(id)) (chests[id] ||= []).includes(L.key) || chests[id].push(L.key);
    }
  }
  const meta = { name: (S.edition && S.edition.name) || S.ed, date: c.eventDate || "", venue: c.venue || "",
    stages: plan.stages.map(s => ({ id: s.id, name: s.name, kind: s.kind })), items };
  return [meta, chests];
}

// ================================================================ STAGE (stage managers)
let openKey = null;
export function vStage(view, ctx) {
  const { S, gl, D } = ctx;
  const stages = (S.plan && S.plan.stages) || [];
  if (!stages.length) { view.innerHTML = `<div class="panel empty"><b>No schedule yet</b><span>The admin sets up stages and the running order under Settings → Schedule.</span></div>`; return; }
  let sid = store.get("stage"); if (!stages.some(s => s.id === sid)) sid = stages[0].id;
  const queue = stageQueue(S, sid), items = S.plan.items;
  const st = L => stageStatusOf(S, L.key);
  const active = queue.find(L => st(L) === "active");
  const lastIdx = Math.max(-1, ...queue.map((L, i) => st(L) !== "pending" ? i : -1));
  const next = active ? queue.slice(queue.indexOf(active) + 1).find(L => st(L) === "pending") : queue.slice(lastIdx + 1).find(L => st(L) === "pending") || queue.find(L => st(L) === "pending");
  if (!openKey || !queue.some(L => L.key === openKey)) openKey = (active || next || queue[0] || {}).key || null;
  const done = queue.filter(L => st(L) === "done").length;
  const attOf = eid => (S.att.get(eid) || {}).att || "";
  const writable = ctx.phase() !== "archived";
  const card = L => {
    const s = st(L), entries = L.entries || [], pres = entries.filter(e => attOf(e.eid) === "Present").length, abs = entries.filter(e => attOf(e.eid) === "Absent").length;
    const tag = L === active ? '<span class="pill s-ready">On stage now</span>' : L === next ? '<span class="pill s-verify">Next</span>' : statusPill(s);
    const btns = !writable ? "" : s === "pending" ? `<button class="btn primary" data-go="active" data-key="${esc(L.key)}">Start</button>`
      : s === "active" ? `<button class="btn primary" data-go="done" data-key="${esc(L.key)}">Mark completed</button>`
      : `<button class="btn" data-go="active" data-key="${esc(L.key)}">Reopen</button>`;
    const open = L.key === openKey;
    return `<article class="stagecard ${s}${L === active ? " now" : ""}" data-key="${esc(L.key)}">
      <div class="sc-head"><button class="sc-toggle" data-open="${esc(L.key)}" aria-expanded="${open}">
          <span class="sc-ord">${items[L.key].order}</span>
          <span class="sc-title"><b>${esc(L.ev)}</b> <span class="muted">· ${esc(gl(L.grp))}</span><br><span class="small muted">${items[L.key].start ? "Planned " + esc(items[L.key].start) + " · " : ""}${entries.length} ${L.grp === "Team" ? "team(s)" : "entries"} · ${pres} present · ${abs} absent · ${entries.length - pres - abs} pending</span></span></button>
        <span class="sc-right">${tag}${btns}</span></div>
      ${open ? `<div class="sc-body">${entries.length ? entries.map(e => {
          const a = attOf(e.eid), mem = e.members ? `<div class="small muted">${e.members.map(m => esc(m.chest || "?")).join(", ")}</div>` : "";
          return `<div class="attrow"><div><span class="chestno">${esc(e.id)}</span> <span class="small muted">${esc(e.name || "")}</span>${mem}</div>
            <div class="seg" role="group" aria-label="Attendance chest ${esc(e.id)}">${["", "Present", "Absent"].map(v => `<button class="${a === v ? "on " + (v || "pend").toLowerCase() : ""}" data-att="${v}" data-eid="${esc(e.eid)}" ${writable ? "" : "disabled"} aria-pressed="${a === v}">${v || "Pending"}</button>`).join("")}</div></div>`;
        }).join("") : '<p class="muted">No entries in this event.</p>'}</div>` : ""}
    </article>`;
  };
  view.innerHTML = `<div class="view">
    <div class="vhead"><div><h2>Stage</h2><p>Your stage's running order. Press <b>Start</b> when an event begins and <b>Mark completed</b> when it ends; participants see this live on their phones. Mark each entry Present or Absent as they're called.</p></div></div>
    <div class="picker"><label class="field" style="flex:1 1 240px;max-width:360px"><span>Stage or room</span><select class="txt" id="stagePick">${stages.map(s => `<option value="${esc(s.id)}" ${s.id === sid ? "selected" : ""}>${esc(s.name)}</option>`).join("")}</select></label>
      <span class="muted">${done} of ${queue.length} completed</span></div>
    ${active ? `<div class="banner ok">On stage now: ${esc(active.ev)} · ${esc(gl(active.grp))}${next ? ` <small>· Next: ${esc(next.ev)} · ${esc(gl(next.grp))}</small>` : ""}</div>`
      : next ? `<div class="banner info">Next up: ${esc(next.ev)} · ${esc(gl(next.grp))}. Press Start when it begins.</div>` : queue.length ? '<div class="banner ok">Everything on this stage is completed.</div>' : ""}
    <div class="stagelist">${queue.length ? queue.map(card).join("") : '<div class="panel empty"><b>Nothing scheduled on this stage</b></div>'}</div></div>`;
  $("#stagePick").onchange = e => { store.set("stage", e.target.value); openKey = null; vStage(view, ctx); };
  view.onclick = e => {
    if (view.dataset.v !== "stage") return;
    const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
    if (d.open) { openKey = openKey === d.open ? "" : d.open; vStage(view, ctx); return; }
    if (d.go) {
      const jobs = [];
      if (d.go === "active") for (const L of queue) if (L.key !== d.key && st(L) === "active") { jobs.push([L.key, "done"]); S.status.set(L.key, { status: "done" }); }
      jobs.push([d.key, d.go]); S.status.set(d.key, { status: d.go });
      if (d.go === "done") { const i = queue.findIndex(L => L.key === d.key); const nx = queue.slice(i + 1).find(L => st(L) === "pending"); openKey = nx ? nx.key : d.key; } else openKey = d.key;
      vStage(view, ctx);
      for (const [k, s] of jobs) enqueue("stage-" + k, () => D.setStageStatus(S.ed, k, s)).catch(() => toast("Couldn't save – check the connection.", "bad"));
      return;
    }
    if (d.eid !== undefined && d.att !== undefined) {
      const v = d.att || null; if (v) S.att.set(d.eid, { att: v }); else S.att.delete(d.eid);
      vStage(view, ctx);
      enqueue("att-" + d.eid, () => D.saveAtt(S.ed, d.eid, v)).catch(() => toast("Couldn't save attendance – check the connection.", "bad"));
    }
  };
}
