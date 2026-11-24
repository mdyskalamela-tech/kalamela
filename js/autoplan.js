// Auto-plan: builds the day's schedule from the event lists.
// Pure functions (no screen, no database), so they can be tested on their own.
//
// The plan guarantees:
//   • nobody is in two events at the same time (team members included), with a buffer between their events
//   • a judging panel never has two events at the same time; when there are several panels of one kind
//     (e.g. 2 Speech panels), their events are shared between them, and each panel stays on one stage where that costs no time
//   • on every stage, events run in their part order: First → Middle → Last
//   • optional: Middle events wait until every First event has finished; Last events wait until every Middle event has finished
//   • no event runs across the lunch break
//   • written / drawing events go in rooms (all entries at once); performance events go on stages (one entry after another)

const WRITTEN = /essay|story writing|poem writing|clay|quiz|pencil drawing|painting|cartoon/i;

/** Starting values for each event: timing from the Kalamela Manual's time limits plus changeover, and a judging panel. */
export function defaultEventSetting(ev) {
  return { ...defaultTiming(ev), panel: defaultPanel(ev) };
}

/** Default kind of judging panel. "" = marked later (no live judges). */
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
  gap: 5,               // minutes between two events on the same stage (also a judging panel's break between events)
  buffer: 10,           // minimum minutes between two events of the same participant
  firstBarrier: true,   // Middle events start only after every First event has finished
  lastBarrier: true,    // Last events start only after every Middle event has finished
  keepPanels: true,     // keep each judging panel on one stage (it moves only if it can't fit there at all)
  events: {},           // per event name: { where, part, mins, panel }
  panels: [],           // kinds of judging panel: { name, count (how many such panels), judges (in each panel) }
};

const PARTS = ["first", "middle", "last"];
export let TRIES = 150;   // orderings tried; the plan that finishes earliest is kept
export const setTries = n => { TRIES = n; };
const JUDGE = "judges:";   // prefix of a judging panel's key in the "busy" table
const isJudge = p => p.startsWith(JUDGE);
export const toMin = t => { const [h, m] = String(t || "").split(":").map(Number); return (isFinite(h) ? h : 9) * 60 + (isFinite(m) ? m : 0); };
export const toHHMM = m => `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(Math.round(m) % 60).padStart(2, "0")}`;
const clampInt = (v, lo, hi, d) => { const n = Math.round(Number(v)); return isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const cleanName = v => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
export const MAX_PANELS = 6, MAX_JUDGES = 5;

/** Settings with defaults filled in and values kept in range. */
export function normalise(auto, config) {
  const a = { ...DEFAULT_AUTO, ...(auto || {}) };
  const out = {
    stages: clampInt(a.stages, 1, 12, 3), rooms: clampInt(a.rooms, 0, 12, 3),
    start: /^\d\d:\d\d$/.test(a.start) ? a.start : "09:00",
    lunchAt: /^\d\d:\d\d$/.test(a.lunchAt) ? a.lunchAt : "13:00", lunchMins: clampInt(a.lunchMins, 0, 180, 45),
    gap: clampInt(a.gap, 0, 60, 5), buffer: clampInt(a.buffer, 0, 120, 10),
    firstBarrier: a.firstBarrier !== false, lastBarrier: a.lastBarrier !== false, events: {}, panels: [],
    keepPanels: a.keepPanels !== false,
  };
  const evs = (config && config.events) || [];
  for (const ev of evs) {
    const d = defaultEventSetting(ev), s = { ...d, ...((a.events || {})[ev.name] || {}) };
    out.events[ev.name] = {
      where: s.where === "room" ? "room" : "stage",
      part: PARTS.includes(s.part) ? s.part : d.part,
      mins: clampInt(s.mins, 1, 240, d.mins),
      panel: cleanName(s.panel ?? d.panel),
    };
  }
  // Kinds of judging panel: the saved list, plus any panel an event uses that isn't in it yet.
  const byName = new Map();
  const rulesJudges = name => { const js = evs.filter(e => out.events[e.name].panel.toLowerCase() === name.toLowerCase()).map(e => (Number(e.judges) === 1 ? 1 : 2)); return js.length ? Math.max(...js) : 2; };
  for (const p of Array.isArray(a.panels) ? a.panels : []) {
    const name = cleanName(p && p.name); if (!name || byName.has(name.toLowerCase())) continue;
    byName.set(name.toLowerCase(), { name, count: clampInt(p.count, 1, MAX_PANELS, 1), judges: clampInt(p.judges, 1, MAX_JUDGES, rulesJudges(name)) });
  }
  for (const ev of evs) {
    const name = out.events[ev.name].panel; if (!name) continue;
    const k = name.toLowerCase();
    if (!byName.has(k)) byName.set(k, { name, count: 1, judges: rulesJudges(name) });
    out.events[ev.name].panel = byName.get(k).name;   // same spelling everywhere
  }
  out.panels = [...byName.values()];
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

/** Name of one panel when there are several of a kind: "Speech 1", "Speech 2"; just "Speech" when there is one. */
export const panelLabel = (kind, k, count) => (count > 1 ? `${kind} ${k + 1}` : kind);

/**
 * Build a schedule.
 * @param lists      event lists [{key, ev, grp, order, entries:[{id, members?}]}]
 * @param config     this year's rules (events with name, type and judges)
 * @param auto       settings (see DEFAULT_AUTO)
 * @param oldStages  current stages and rooms, so their names are kept
 * @returns {stages, items, report, settings}
 */
export function autoPlan(lists, config, auto, oldStages = []) {
  const A = normalise(auto, config);
  const evSet = name => A.events[name] || { ...defaultEventSetting({ name, type: "individual" }), panel: "" };
  const kindOf = new Map(A.panels.map(p => [p.name, p]));
  const day0 = toMin(A.start), lunch0 = toMin(A.lunchAt), lunch1 = lunch0 + A.lunchMins;

  // Stages and rooms: keep existing names (e.g. "Main Stage") in order, add or drop to match the numbers asked for.
  const keepOf = kind => oldStages.filter(s => (s.kind === "room") === (kind === "room"));
  const used = new Set(), stages = [];
  const nextId = () => { let n = 1; while (used.has("s" + n) || oldStages.some(s => s.id === "s" + n)) n++; return "s" + n; };
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
    const kind = s.panel && kindOf.get(s.panel);
    tasks.push({ L, key: L.key, part: s.part, where, dur, people: peopleOf(L), kind: kind ? kind.name : "", kcount: kind ? kind.count : 0, order: L.order ?? 999 });
  }

  // Try a few orderings and keep the plan that finishes earliest (then the one with least waiting on stages).
  const orders = [
    t => [-t.load, -t.dur, t.order],   // people / judges with the most to do first
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
  for (const v of venues) v.items.sort((a, b) => a.s - b.s).forEach((it, i) => {
    const p = placed.get(it.key);
    items[it.key] = { stage: v.id, order: i + 1, start: toHHMM(it.s), ...(p.panel ? { panel: p.panel } : {}) };
  });

  // ---- report
  const ends = [...placed.values()].map(p => p.e), finish = ends.length ? Math.max(...ends) : day0;
  const perPerson = new Map();
  for (const t of tasks) if (placed.has(t.key)) for (const p of t.people) perPerson.set(p, (perPerson.get(p) || 0) + 1);
  const busiest = [...perPerson.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const vName = id => (stages.find(s => s.id === id) || {}).name || id;
  const panels = new Map();   // one row per actual panel ("Speech 1", "Speech 2")
  for (const t of tasks) {
    const p = placed.get(t.key); if (!p || !p.panel) continue;
    const x = panels.get(p.panel) || { name: p.panel, kind: t.kind, events: 0, s: Infinity, e: 0, venues: new Set(), parts: new Set(), mins: 0 };
    x.events++; x.s = Math.min(x.s, p.s); x.e = Math.max(x.e, p.e); x.venues.add(p.venue); x.parts.add(t.part); x.mins += p.e - p.s; panels.set(p.panel, x);
  }
  const kinds = A.panels.map(k => {
    const usedPanels = [...panels.values()].filter(x => x.kind === k.name).length;
    const events = tasks.filter(t => t.kind === k.name).length;
    const rules = (config.events || []).filter(e => A.events[e.name] && A.events[e.name].panel === k.name)
      .map(e => ({ name: e.name, judges: Number(e.judges) === 1 ? 1 : 2 }));
    return { name: k.name, count: k.count, used: usedPanels, judges: k.judges, events, judgesNeeded: usedPanels * k.judges,
      rulesDiffer: rules.filter(r => r.judges !== k.judges).map(r => r.name) };
  });
  const report = {
    finish: toHHMM(finish), finishMins: finish, pastMidnight: finish >= 24 * 60, placed: placed.size, unplaced, skipped,
    venues: venues.map(v => ({ id: v.id, name: v.name, kind: v.kind, events: v.items.length,
      end: v.items.length ? toHHMM(Math.max(...v.items.map(i => i.e))) : "", busyMins: v.items.reduce((s, i) => s + i.e - i.s, 0) })),
    busiest, clashes: countClashes(tasks, placed, A.buffer, A.gap),
    timeline: [...placed.entries()].map(([key, p]) => ({ key, venue: p.venue, s: p.s, e: p.e, part: p.part, panel: p.panel || "" })),
    partEnds: partEndsOf(placed, stages),
    panels: [...panels.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, undefined, { numeric: true }))
      .map(x => ({ name: x.name, kind: x.kind, events: x.events, from: toHHMM(x.s), to: toHHMM(x.e), toMins: x.e, judgingMins: x.mins, parts: [...x.parts], where: [...x.venues].map(vName) })),
    kinds, judgesNeeded: kinds.reduce((n, k) => n + k.judgesNeeded, 0),
  };
  return { stages, items, report, settings: A };
}

/** One planning pass with a given priority order. Events are placed in the earliest gap that fits. */
function runOnce(tasks, stages, A, key, day0, lunch0, lunch1) {
  const venues = stages.map(s => ({ ...s, items: [], floor: day0 }));
  const stageV = venues.filter(v => v.kind === "stage"), roomV = venues.filter(v => v.kind === "room");
  const busy = new Map();
  const crossesLunch = (s, e) => A.lunchMins > 0 && s < lunch1 && lunch0 < e;
  const slot = (t, v, nb, jk) => {
    let s = Math.max(v.floor, nb);
    for (let guard = 0; guard < 3000; guard++) {
      const e = s + t.dur; let moved = false;
      if (crossesLunch(s, e)) { s = lunch1; continue; }
      for (const it of v.items) if (s < it.e + A.gap && it.s < e + A.gap) { s = it.e + A.gap; moved = true; break; }
      if (moved) continue;
      if (jk) for (const [a, b] of busy.get(jk) || []) if (s < b + A.gap && a < e + A.gap) { s = b + A.gap; moved = true; break; }
      if (moved) continue;
      for (const p of t.people) { for (const [a, b] of busy.get(p) || []) if (s < b + A.buffer && a < e + A.buffer) { s = b + A.buffer; moved = true; break; } if (moved) break; }
      if (moved) continue;
      return s;
    }
    return Infinity;
  };
  // How much each person (and each kind of panel, shared between its panels) has to do: the most tied-up go first.
  const loadOf = new Map(), kindLoad = new Map();
  for (const t of tasks) {
    for (const p of t.people) loadOf.set(p, (loadOf.get(p) || 0) + t.dur + A.buffer);
    if (t.kind) kindLoad.set(t.kind, (kindLoad.get(t.kind) || 0) + (t.dur + A.gap) / t.kcount);
  }
  for (const t of tasks) { let m = t.kind ? kindLoad.get(t.kind) : 0; for (const p of t.people) m = Math.max(m, loadOf.get(p)); t.load = m; }
  const cmp = (a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i]; return a.key < b.key ? -1 : 1; };

  const placed = new Map(), unplaced = [], home = new Map();
  const partEnd = { first: day0, middle: day0, last: day0 };
  for (const part of PARTS) {
    // on each stage, this part starts after the stage's earlier parts
    for (const v of venues) v.floor = v.kind === "stage" && v.items.length ? Math.max(...v.items.map(i => i.e)) + A.gap : day0;
    const nb = part === "middle" && A.firstBarrier ? partEnd.first
      : part === "last" && A.lastBarrier ? Math.max(partEnd.first, partEnd.middle) : day0;
    for (const t of tasks.filter(t => t.part === part).sort(cmp)) {
      const panelsOfKind = t.kind ? Array.from({ length: t.kcount }, (_, k) => ({ jk: `${JUDGE}${t.kind.toLowerCase()}#${k}`, label: panelLabel(t.kind, k, t.kcount) })) : [{ jk: null, label: "" }];
      let pick = null;
      for (const v of t.where === "room" ? roomV : stageV) for (const pj of panelsOfKind) {
        const s = slot(t, v, t.where === "room" ? day0 : nb, pj.jk);
        // earliest start wins; with keepPanels, moving a panel to another stage counts as 10 hours later, so it only moves if it must
        const away = pj.jk && home.has(pj.jk) && home.get(pj.jk) !== v.id, score = s + (away && A.keepPanels ? 600 : 0);
        if (!pick || score < pick.score || (score === pick.score && s < pick.s)) pick = { v, s, pj, score };
      }
      if (!pick || !isFinite(pick.s)) { unplaced.push(t.key); continue; }
      const e = pick.s + t.dur;
      pick.v.items.push({ key: t.key, s: pick.s, e, part });
      for (const p of t.people) (busy.get(p) || busy.set(p, []).get(p)).push([pick.s, e]);
      if (pick.pj.jk) { (busy.get(pick.pj.jk) || busy.set(pick.pj.jk, []).get(pick.pj.jk)).push([pick.s, e]); if (!home.has(pick.pj.jk)) home.set(pick.pj.jk, pick.v.id); }
      if (t.where === "stage") partEnd[part] = Math.max(partEnd[part], e);
      placed.set(t.key, { venue: pick.v.id, s: pick.s, e, part, panel: pick.pj.label, jk: pick.pj.jk });
    }
  }
  const ends = [...placed.values()].map(p => p.e), finish = ends.length ? Math.max(...ends) : day0;
  let idle = 0;
  for (const v of stageV) { const its = v.items.slice().sort((a, b) => a.s - b.s); for (let i = 1; i < its.length; i++) idle += its[i].s - its[i - 1].e; }
  return { venues, placed, unplaced, finish: finish + unplaced.length * 100000, idle };
}

/** Independent check: pairs of events that share a participant or a judging panel and overlap (should always be 0). */
export function countClashes(tasks, placed, buffer = 0, judgeGap = 0) {
  const byP = new Map(); let n = 0;
  for (const t of tasks) {
    const p = placed.get(t.key); if (!p) continue;
    const keys = [...t.people, ...(p.jk ? [p.jk] : [])];
    for (const c of keys) (byP.get(c) || byP.set(c, []).get(c)).push(p);
  }
  for (const [c, arr] of byP) {
    const buf = isJudge(c) ? judgeGap : buffer;
    for (let i = 0; i < arr.length; i++) for (let j = i + 1; j < arr.length; j++)
      if (arr[i].s < arr[j].e + buf && arr[j].s < arr[i].e + buf) n++;
  }
  return n;
}

/** When each part ends on the stages (for the report). */
function partEndsOf(placed, stages) {
  const stageIds = new Set(stages.filter(s => s.kind === "stage").map(s => s.id)), out = {};
  for (const p of placed.values()) if (stageIds.has(p.venue)) out[p.part] = Math.max(out[p.part] || 0, p.e);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, toHHMM(v)]));
}

function seeded(seed) { let x = seed >>> 0; return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; }
function jitter(tasks, rnd) { const m = new Map(); for (const t of tasks) m.set(t.key, rnd()); return m; }
