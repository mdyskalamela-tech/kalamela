// Pure result calculations – no Firebase, no DOM. Tested in test/compute.test.mjs.

export const LETTERS = "ABCDEFGHIJ";
export const GROUP_ORDER = { g1: 0, g2: 1, op: 2 };

export function slug(s) {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
}
export function eventIndex(config, name) {
  return (config.events || []).findIndex(e => e.name === name);
}
export function eventDef(config, name) {
  return (config.events || []).find(e => e.name === name) || null;
}
/** Key of one event list, e.g. "ev05-g1" (event 5, Group I) or "ev26-op" (team event 26). */
export function listKey(config, eventName, groupCode) {
  const i = eventIndex(config, eventName);
  return (i >= 0 ? "ev" + String(i + 1).padStart(2, "0") : "x-" + slug(eventName)) + "-" + groupCode;
}
export function groupLabel(config, code) {
  if (code === "op") return "Open (team)";
  const g = (config.groups || []).find(x => x.code === code);
  return g ? g.label : code;
}
const isNum = v => typeof v === "number" && isFinite(v);
export const round2 = n => Math.round(n * 100) / 100;

/**
 * Work out every event's ranking, status and points.
 * lists:     [{key, ev, grp, order, entries:[{eid,id,name,gender,sakha,centre,members?}]}]
 * marks:     Map eid -> {att, j1:[], j1w, j2:[], j2w, ver}
 * intake:    Map key -> {rec, time, venue, op}
 * decisions: Map eid -> {pos, note}
 */
export function computeAll({ lists, marks, intake, decisions, config, locks = new Map() }) {
  const minPct = Number(config.minPercent ?? 50);
  const ptsInd = config.points?.individual || [5, 3, 1];
  const ptsTeam = config.points?.team || [15, 10, 5];
  const PLACES = ["1st", "2nd", "3rd"];
  const sorted = [...lists].sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || (GROUP_ORDER[a.grp] ?? 9) - (GROUP_ORDER[b.grp] ?? 9));
  const events = [], rowsAll = [];

  for (const L of sorted) {
    const def = eventDef(config, L.ev) || { criteria: [], judges: 2 };
    const cr = def.criteria || [], ncr = cr.length, nj = Number(def.judges) === 1 ? 1 : 2;
    const maxTotal = cr.reduce((a, c) => a + Number(c.max || 0), 0) || 100;
    const isTeam = L.grp === "op";

    const rows = (L.entries || []).map(e => {
      const m = marks.get(e.eid) || {};
      const att = m.att || "Present";
      const j1 = (m.j1 || []).slice(0, ncr), j2 = (m.j2 || []).slice(0, ncr);
      const has = [...j1, ...j2, m.j1w, m.j2w].some(v => v != null && v !== "");
      const msgs = [];
      let t1 = null, t2 = null, final = null, check;
      if (att !== "Present") check = att;
      else if (!has) check = "Not entered";
      else {
        const one = (arr, w, tag) => {
          let miss = 0, bad = 0, over = 0, sum = 0;
          for (let i = 0; i < ncr; i++) {
            const v = arr[i];
            if (v == null || v === "") miss++;
            else if (!isNum(v)) bad++;
            else { if (v > cr[i].max || v < 0) over++; sum += v; }
          }
          if (miss) msgs.push(`${tag} marks missing`);
          if (bad) msgs.push(`${tag} has a value that is not a number`);
          if (over) msgs.push(`${tag} mark above the maximum`);
          if (!miss && !bad && w != null && w !== "") {
            if (!isNum(w)) msgs.push(`${tag} written total is not a number`);
            else if (Math.abs(w - sum) > 1e-9) msgs.push(`${tag} wrote ${round2(w)} but marks add to ${round2(sum)}`);
          }
          return miss || bad ? null : sum;
        };
        t1 = one(j1, m.j1w, nj === 2 ? "J1" : "Judge");
        if (nj === 2) t2 = one(j2, m.j2w, "J2");
        check = msgs.length ? msgs.join("; ") : "OK";
        if (check === "OK") final = round2((t1 + (nj === 2 ? t2 : 0)) / nj);
      }
      const pct = final == null ? null : round2(final / maxTotal * 100);
      const ok = check === "OK", ver = ok && !!m.ver;
      return { L, e, m, att, t1, t2, final, pct, check, ok, ver, elig: ver && pct >= minPct,
               rank: null, tie: false, pos: "", pts: 0, decided: false, note: (decisions.get(e.eid) || {}).note || "" };
    });

    const elig = rows.filter(r => r.elig);
    for (const r of elig) {
      r.rank = 1 + elig.filter(o => o.final > r.final).length;
      r.tie = r.rank <= 3 && elig.filter(o => o.final === r.final).length > 1;
    }
    for (const r of rows) {
      const d = decisions.get(r.e.eid);
      if (d && d.pos) { r.pos = d.pos === "None" ? "" : d.pos; r.decided = true; }
      else if (r.tie) r.pos = "TIE";
      else if (r.rank && r.rank <= 3) r.pos = PLACES[r.rank - 1];
      const pi = PLACES.indexOf(r.pos);
      r.pts = pi >= 0 ? Number((isTeam ? ptsTeam : ptsInd)[pi] || 0) : 0;
    }

    const n = rows.length, absent = rows.filter(r => r.att !== "Present").length;
    const okc = rows.filter(r => r.ok).length, verc = rows.filter(r => r.ver).length;
    const ties = rows.filter(r => r.pos === "TIE").length, it = intake.get(L.key) || {};
    const started = rows.some(r => r.att === "Present" && r.check !== "Not entered");
    let status;
    if (!ncr) status = "Not in rules";
    else if (n > 0 && n === absent) status = "Ready";
    else if (!started) status = it.rec ? "Received – to enter" : "Awaiting sheets";
    else if (okc < n - absent) status = "Entering / errors";
    else if (verc < okc) status = "Verify";
    else if (ties) status = "Tie – committee";
    else status = "Ready";

    const places = {};
    for (const p of PLACES) places[p] = rows.filter(r => r.pos === p);
    const lock = locks.get(L.key) || null;   // results announced: marks and decisions are locked
    const ev = { key: L.key, ev: L.ev, grp: L.grp, L, def, cr, nj, maxTotal, rows, n, absent, okc, verc, ties, status, intake: it, places, lock };
    events.push(ev); rowsAll.push(...rows);
  }

  // Centre championship
  const centres = new Map();
  for (const r of rowsAll) {
    const c = r.e.centre || "—";
    if (!centres.has(c)) centres.set(c, { centre: c, ind: 0, team: 0 });
    centres.get(c)[r.L.grp === "op" ? "team" : "ind"] += r.pts;
  }
  const board = [...centres.values()].map(c => ({ ...c, total: c.ind + c.team }))
    .sort((a, b) => b.total - a.total || a.centre.localeCompare(b.centre));
  board.forEach(c => { c.rank = 1 + board.filter(o => o.total > c.total).length; });

  // Individual points for Kalaprathibha / Kalathilakam (team events not counted)
  const people = new Map();
  for (const r of rowsAll) {
    if (r.L.grp === "op") continue;
    const k = String(r.e.id);
    if (!people.has(k)) people.set(k, { id: k, name: r.e.name, gender: r.e.gender, sakha: r.e.sakha, centre: r.e.centre, pts: 0, wins: [] });
    const p = people.get(k);
    p.pts += r.pts;
    if (r.pos && r.pos !== "TIE") p.wins.push(`${r.pos} ${r.L.ev}`);
    if (!p.gender && r.e.gender) p.gender = r.e.gender;
  }

  return { events, rowsAll, board, people: [...people.values()], byKey: new Map(events.map(e => [e.key, e])) };
}

/** Group for a date of birth ("YYYY-MM-DD"), using the edition's groups. */
export function groupForDob(config, dob) {
  if (!dob) return "";
  for (const g of config.groups || []) {
    if ((!g.from || dob >= g.from) && (!g.to || dob <= g.to)) return g.code;
  }
  return "none";
}
