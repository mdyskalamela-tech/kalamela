// Auto-plan: builds the day's schedule from the event lists.
// Pure functions (no screen, no database), so they can be tested on their own.
//
// The plan guarantees:
//   • nobody is in two events at the same time (team members included), with a buffer between their events
//   • a judging panel never has two events at the same time; each panel stays on one stage where that costs no time
//   • on every stage, events run in their part order: First → Middle → Last
//   • optional: Middle events wait until every First event has finished; Last events wait until every Middle event has finished
//   • no event runs across the lunch break
//   • written / drawing events go in rooms (all entries at once); performance events go on stages (one entry after another)

const WRITTEN = /essay|story writing|poem writing|clay|quiz|pencil drawing|painting|cartoon/i;

/** Starting values for each event, from the Kalamela Manual's time limits plus a little changeover. */
export function defaultEventSetting(ev) {
  return { ...defaultTiming(ev), panel: defaultPanel(ev) };
}

/** Default judging panel. Events with the same panel never run at the same time. "" = marked later (no live judges). */
export function defaultPanel(ev) {
  const n = String(ev.name || "");
  if (/solo|group song/i.test(n)) return "Music – vocal";
  if (/instrument/i.test(n)) return "Music – instrumental";
  if (/elocution|bible reading|recitation/i.test(n)) return "Speech";
  if (/quiz/i.test(n)) return "Quiz";
  if (/margam|choreo/i.test(n)) return "Dance";
  if (/tableau|mime/i.test(n)) return "Drama";
  if (WRITTEN.test(n)) return "";
  return ev.type === "team" ? "Team events" : "";
}

function defaultTiming(ev) {
  const n = String(ev.name || ""), team = ev.type === "team";
  if (team) {
    if (/group song/i.test(n)) return { where: "stage", part: "first", mins: 8 };     // 5 min + getting on and off
    if (/margam/i.test(n)) return { where: "stage", part: "last", mins: 12 };          // 10 min
    if (/choreo/i.test(n)) return { where: "stage", part: "last", mins: 16 };          // 10 min + 5 min setup
    if (/tableau/i.test(n)) return { where: "stage", part: "last", mins: 9 };          // 1 min + 7 min setup
    if (/mime/i.test(n)) return { where: "stage", part: "last", mins: 10 };            // 5–8 min
    return { where: "stage", part: "last", mins: 10 };
  }
  if (WRITTEN.test(n)) return { where: "room", part: "middle", mins: /painting/i.test(n) ? 55 : 40 };  // 30/45 min + 10 min topic
  if (/recitation/i.test(n)) return { where: "stage", part: "middle", mins: 8 };       // 7 min
  return { where: "stage", part: "middle", mins: 6 };                                  // solo, instrumental, elocution, Bible reading: 5 min
}

export const DEFAULT_AUTO = {
  stages: 3,            // stages available (performance events)
  rooms: 3,             // rooms for written / drawing events (0 = use the stages)
  start: "09:00",
  lunchAt: "13:00",
  lunchMins: 45,        // 0 = no lunch break
  gap: 5,               // minutes between two events on the same stage
  buffer: 10,           // minimum minutes between two events of the same participant
  firstBarrier: true,   // Middle events start only after every First event has finished
  lastBarrier: true,    // Last events start only after every Middle event has finished
  events: {},           // per event name: { where, part, mins }
};

const PARTS = ["first", "middle", "last"];
const JUDGE = "judges:";   // prefix that marks a judging panel among the people of an event
const isJudge = p => p.startsWith(JUDGE);
export let TRIES = 200;   // orderings tried; the plan that finishes earliest is kept
export const setTries = n => { TRIES = n; };
export const toMin = t => { const [h, m] = String(t || "").split(":").map(Number); return (isFinite(h) ? h : 9) * 60 + (isFinite(m) ? m : 0); };
export const toHHMM = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };

/** Settings with defaults filled in and values kept in range. */
export function normalise(auto, config) {
  const a = { ...DEFAULT_AUTO, ...(auto || {}) };
  const out = {
    stages: clampInt(a.stages, 1, 12, 3), rooms: clampInt(a.rooms, 0, 12, 3),
    start: /^\d\d:\d\d$/.test(a.start) ? a.start : "09:00",
    lunchAt: /^\d\d:\d\d$/.test(a.lunchAt) ? a.lunchAt : "13:00", lunchMins: clampInt(a.lunchMins, 0, 180, 45),
    gap: clampInt(a.gap, 0, 60, 5), buffer: clampInt(a.buffer, 0, 120, 10),
    firstBarrier: a.firstBarrier !== false, lastBarrier: a.lastBarrier !== false, events: {},
  };
  for (const ev of (config && config.events) || []) {
    const d = defaultEventSetting(ev), s = { ...d, ...((a.events || {})[ev.name] || {}) };
    out.events[ev.name] = {
      where: s.where === "room" ? "room" : "stage",
      part: PARTS.includes(s.part) ? s.part : d.part,
      mins: clampInt(s.mins, 1, 240, d.mins),
      panel: String(s.panel ?? d.panel).replace(/\s+/g, " ").trim().slice(0, 40),
    };
  }
  return out;
}

/** People (chest numbers) taking part in one event list. Team entries count every member. */
export function peopleOf(L) {
  const s = new Set();
  for (const e of L.entries || []) {
    if (e.members) { for (const m of e.members) if (m.chest !== "" && m.chest != null) s.add(String(m.chest)); }
    else if (e.id != null && e.id !== "") s.add(String(e.id));
  }
  return s;
}

/**
 * Build a schedule.
 * @param lists      event lists [{key, ev, grp, order, entries:[{id, members?}]}]
 * @param config     this year's rules (events with name and type)
 * @param auto       settings (see DEFAULT_AUTO)
 * @param oldStages  current stages and rooms, so their names are kept
 * @returns {stages, items, report}
 */
export function autoPlan(lists, config, auto, oldStages = []) {
  const A = normalise(auto, config);
  const evSet = name => A.events[name] || defaultEventSetting({ name, type: "individual" });
  const day0 = toMin(A.start), lunch0 = toMin(A.lunchAt), lunch1 = lunch0 + A.lunchMins;

  // Stages and rooms: keep existing names (e.g. "Main Stage") in order, add or drop to match the numbers asked for.
  const keepOf = kind => oldStages.filter(s => (s.kind === "room") === (kind === "room"));
  const used = new Set(), stages = [];
  const nextId = () => { let n = 1; while (used.has("s" + n) || oldStages.some(s => s.id === "s" + n && !stages.includes(s))) n++; return "s" + n; };
  for (const [kind, count, word] of [["stage", A.stages, "Stage"], ["room", A.rooms, "Room"]]) {
    const old = keepOf(kind);
    for (let i = 0; i < count; i++) {
      const o = old[i], id = o ? o.id : nextId(); used.add(id);
      stages.push({ id, name: o ? o.name : `${word} ${i + 1}`, kind, first: A.start, perEntry: o ? o.perEntry || 6 : 6, filled: false });
    }
  }
  // One task per event list that has entries.
  const skipped = [], tasks = [];
  const nRooms = stages.filter(s => s.kind === "room").length;
  for (const L of lists) {
    const n = (L.entries || []).length;
    if (!n) { skipped.push(L.key); continue; }
    const s = evSet(L.ev), where = s.where === "room" && nRooms ? "room" : "stage";
    const dur = s.where === "room" ? s.mins : n * s.mins;   // written events: everyone at once, even on a stage
    const people = peopleOf(L);
    if (s.panel) people.add(JUDGE + s.panel.toLowerCase());   // the judging panel is "in" the event too
    tasks.push({ L, key: L.key, part: s.part, where, dur, people, panel: s.panel, order: L.order ?? 999 });
  }

  // Try a few orderings and keep the plan that finishes earliest (then the one with least waiting on stages).
  const orders = [
    t => [-t.load, -t.dur, t.order],   // people with the most to do first
    t => [-t.dur, -t.load, t.order],   // longest events first
    t => [t.order, -t.dur],            // the Manual's order
  ];
  let best = null;
  const rnd = seeded(7);
  for (let k = 0; k < TRIES; k++) {
    const key = k < orders.length ? orders[k] : (noise => t => [-t.load * (0.8 + 0.4 * noise.get(t.key)), -t.dur, t.order])(jitter(tasks, rnd));
    const r = runOnce(tasks, stages, A, key, day0, lunch0, lunch1);
    if (!best || r.finish < best.finish || (r.finish === best.finish && r.idle < best.idle)) best = r;
  }
  const { venues, placed, unplaced } = best;

  const items = {};
  for (const v of venues) v.items.sort((a, b) => a.s - b.s).forEach((it, i) => { items[it.key] = { stage: v.id, order: i + 1, start: toHHMM(it.s) }; });

  // Report
  const ends = [...placed.values()].map(p => p.e), finish = ends.length ? Math.max(...ends) : day0;
  const perPerson = new Map();
  for (const t of tasks) if (placed.has(t.key)) for (const p of t.people) if (!isJudge(p)) perPerson.set(p, (perPerson.get(p) || 0) + 1);
  const panels = new Map();
  for (const t of tasks) { const p = placed.get(t.key); if (!t.panel || !p) continue;
    const x = panels.get(t.panel) || { name: t.panel, events: 0, s: Infinity, e: 0, venues: new Set(), parts: new Set(), mins: 0 };
    x.events++; x.s = Math.min(x.s, p.s); x.e = Math.max(x.e, p.e); x.venues.add(p.venue); x.parts.add(t.part); x.mins += p.e - p.s; panels.set(t.panel, x); }
  const vName = id => (stages.find(s => s.id === id) || {}).name || id;
  const busiest = [...perPerson.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const report = {
    finish: toHHMM(finish), finishMins: finish, pastMidnight: finish >= 24 * 60, placed: placed.size, unplaced, skipped,
    venues: venues.map(v => ({ id: v.id, name: v.name, kind: v.kind, events: v.items.length,
      end: v.items.length ? toHHMM(Math.max(...v.items.map(i => i.e))) : "", busyMins: v.items.reduce((s, i) => s + i.e - i.s, 0) })),
    busiest, clashes: countClashes(tasks, placed, A.buffer, A.gap),
    panels: [...panels.values()].sort((a, b) => a.s - b.s).map(x => ({ name: x.name, events: x.events, from: toHHMM(x.s), to: toHHMM(x.e), toMins: x.e, judgingMins: x.mins, parts: [...x.parts], where: [...x.venues].map(vName) })),
    timeline: [...placed.entries()].map(([key, p]) => ({ key, venue: p.venue, s: p.s, e: p.e, part: p.part })),
    partEnds: partEndsOf(placed, stages),
  };
  return { stages, items, report, settings: A };
}

/** Independent check: pairs of events that share a participant and overlap (should always be 0). */
export function countClashes(tasks, placed, buffer = 0, judgeGap = 0) {
  const byP = new Map(); let n = 0;
  for (const t of tasks) { const p = placed.get(t.key); if (!p) continue; for (const c of t.people) (byP.get(c) || byP.set(c, []).get(c)).push(p); }
  for (const [c, arr] of byP) { const buf = isJudge(c) ? judgeGap : buffer;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
      if (arr[i].s < arr[j].e + buf && arr[j].s < arr[i].e + buf) n++; }
  return n;
}

/** One planning pass with a given priority order. Events are placed in the earliest gap that fits. */
function runOnce(tasks, stages, A, key, day0, lunch0, lunch1) {
  const venues = stages.map(s => ({ ...s, items: [], floor: day0 }));
  const stageV = venues.filter(v => v.kind === "stage"), roomV = venues.filter(v => v.kind === "room");
  const busy = new Map();
  const crossesLunch = (s, e) => A.lunchMins > 0 && s < lunch1 && lunch0 < e;
  const slot = (t, v, nb) => {
    let s = Math.max(v.floor, nb);
    for (let guard = 0; guard < 2000; guard++) {
      const e = s + t.dur; let moved = false;
      if (crossesLunch(s, e)) { s = lunch1; continue; }
      for (const it of v.items) if (s < it.e + A.gap && it.s < e + A.gap) { s = it.e + A.gap; moved = true; break; }
      if (moved) continue;
      for (const p of t.people) { const buf = isJudge(p) ? A.gap : A.buffer; for (const [a, b] of busy.get(p) || []) if (s < b + buf && a < e + buf) { s = b + buf; moved = true; break; } if (moved) break; }
      if (moved) continue;
      return s;
    }
    return Infinity;
  };
  // how much each person has to do: used to place the most tied-up people first
  const loadOf = new Map();
  for (const t of tasks) for (const p of t.people) loadOf.set(p, (loadOf.get(p) || 0) + t.dur + A.buffer);
  for (const t of tasks) { let m = 0; for (const p of t.people) m = Math.max(m, loadOf.get(p)); t.load = m; }
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.key < b.key ? -1 : 1; };

  const placed = new Map(), unplaced = [], panelHome = new Map();
  const partEnd = { first: day0, middle: day0, last: day0 };
  for (const part of PARTS) {
    // on each stage, this part starts after the stage's earlier parts
    for (const v of venues) v.floor = v.kind === "stage" && v.items.length ? Math.max(...v.items.map(i => i.e)) + A.gap : day0;
    const nb = part === "middle" && A.firstBarrier ? partEnd.first
      : part === "last" && A.lastBarrier ? Math.max(partEnd.first, partEnd.middle) : day0;
    for (const t of tasks.filter(t => t.part === part).sort(cmp)) {
      let pick = null;
      const home = t.panel ? panelHome.get(t.panel) : null;   // keep a panel on the stage it already uses, if that costs no time
      for (const v of t.where === "room" ? roomV : stageV) {
        const s = slot(t, v, t.where === "room" ? day0 : nb);
        if (!pick || s < pick.s || (s === pick.s && v.id === home)) pick = { v, s };
      }
      if (!pick || !isFinite(pick.s)) { unplaced.push(t.key); continue; }
      const e = pick.s + t.dur;
      pick.v.items.push({ key: t.key, s: pick.s, e, part });
      for (const p of t.people) (busy.get(p) || busy.set(p, []).get(p)).push([pick.s, e]);
      if (t.where === "stage") partEnd[part] = Math.max(partEnd[part], e);
      if (t.panel && !panelHome.has(t.panel)) panelHome.set(t.panel, pick.v.id);
      placed.set(t.key, { venue: pick.v.id, s: pick.s, e, part });
    }
  }
  const ends = [...placed.values()].map(p => p.e), finish = ends.length ? Math.max(...ends) : day0;
  let idle = 0;
  for (const v of stageV) { const its = v.items.slice().sort((a, b) => a.s - b.s); for (let i = 1; i < its.length; i++) idle += its[i].s - its[i - 1].e; }
  return { venues, placed, unplaced, finish: finish + unplaced.length * 100000, idle };
}

function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function jitter(tasks, rnd) { const m = new Map(); for (const t of tasks) m.set(t.key, rnd()); return m; }

/** When each part ends on the stages (for the report). */
function partEndsOf(placed, stages) {
  const stageIds = new Set(stages.filter(s => s.kind === "stage").map(s => s.id)), out = {};
  for (const p of placed.values()) if (stageIds.has(p.venue)) out[p.part] = Math.max(out[p.part] || 0, p.e);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, toHHMM(v)]));
}
