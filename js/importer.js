// Reads one Centre's Excel entry form (MDYS Centre Entry Form) and checks it against
// the edition's rules. Works in the browser and in Node (for tests): the caller passes
// the SheetJS (XLSX) and JSZip libraries in.

import { eventDef, groupForDob } from "./compute.js";

const s = v => (v == null ? "" : String(v).trim());

function pad(n) { return String(n).padStart(2, "0"); }
/** Excel cell value -> "YYYY-MM-DD" or "" */
export function toIsoDate(v, XLSX) {
  if (v == null || v === "") return "";
  if (typeof v === "number" && v > 1000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : "";
  }
  if (v instanceof Date && !isNaN(v)) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const t = s(v);
  let m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (m) { const [d, mo, y] = [+m[1], +m[2], +m[3]]; if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return `${y}-${pad(mo)}-${pad(d)}`; }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return t;
  return "";
}

// ---------------------------------------------------------------- pictures inside the workbook
function attrs(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:]+)="([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}
function parseRels(xml) {
  const map = {};
  for (const m of (xml || "").matchAll(/<Relationship\b[^>]*>/g)) { const a = attrs(m[0]); map[a.Id] = a.Target; }
  return map;
}
function resolve(base, target) {
  if (target.startsWith("/")) return target.slice(1);
  const parts = base.split("/"); parts.pop();
  for (const seg of target.split("/")) { if (seg === "..") parts.pop(); else if (seg !== ".") parts.push(seg); }
  return parts.join("/");
}
const relsPath = p => { const i = p.lastIndexOf("/"); return p.slice(0, i) + "/_rels/" + p.slice(i + 1) + ".rels"; };

/** Map "Sheet name|row" -> {data: Uint8Array, ext}. Handles floating pictures and Excel 365 "Place in Cell" pictures. */
export async function extractPictures(buf, JSZip) {
  const out = new Map();
  let zip;
  try { zip = await JSZip.loadAsync(buf); } catch { return out; }
  const read = async p => (zip.file(p) ? zip.file(p).async("string") : null);
  const bin = async p => (zip.file(p) ? zip.file(p).async("uint8array") : null);
  const wb = await read("xl/workbook.xml"); if (!wb) return out;
  const wbRels = parseRels(await read("xl/_rels/workbook.xml.rels"));
  const sheets = [...wb.matchAll(/<sheet\b[^>]*>/g)].map(m => attrs(m[0]))
    .map(a => ({ name: a.name.replace(/&amp;/g, "&"), path: resolve("xl/workbook.xml", wbRels[a["r:id"]] || "") }));

  // rich-value pictures
  let richImg = [], vmToRv = [], futToRv = [];
  const rd = await read("xl/richData/rdrichvalue.xml");
  if (rd) {
    const relList = [...((await read("xl/richData/richValueRel.xml")) || "").matchAll(/<rel\b[^>]*>/g)].map(m => attrs(m[0])["r:id"]);
    const rvRels = parseRels(await read("xl/richData/_rels/richValueRel.xml.rels"));
    richImg = [...rd.matchAll(/<rv\b[^>]*>([\s\S]*?)<\/rv>/g)].map(m => {
      const v = m[1].match(/<v[^>]*>([^<]*)<\/v>/); const idx = v ? Number(v[1]) : -1;
      const t = rvRels[relList[idx]]; return t ? resolve("xl/richData/richValueRel.xml", t) : null;
    });
    const md = (await read("xl/metadata.xml")) || "";
    const fut = md.match(/<futureMetadata\b[\s\S]*?<\/futureMetadata>/);
    if (fut) futToRv = [...fut[0].matchAll(/<bk>([\s\S]*?)<\/bk>/g)].map(b => { const r = b[1].match(/<(?:\w+:)?rvb\b[^>]*\bi="(\d+)"/); return r ? Number(r[1]) : null; });
    const vmd = md.match(/<valueMetadata\b[\s\S]*?<\/valueMetadata>/);
    if (vmd) vmToRv = [...vmd[0].matchAll(/<bk>([\s\S]*?)<\/bk>/g)].map(b => { const r = b[1].match(/<rc\b[^>]*v="(\d+)"/); return r ? futToRv[Number(r[1])] : null; });
  }

  for (const sh of sheets) {
    const xml = await read(sh.path); if (!xml) continue;
    // floating pictures
    const rels = parseRels(await read(relsPath(sh.path)));
    for (const t of Object.values(rels)) {
      if (!/drawings\/drawing/.test(t)) continue;
      const dPath = resolve(sh.path, t), dXml = await read(dPath); if (!dXml) continue;
      const dRels = parseRels(await read(relsPath(dPath)));
      for (const a of dXml.matchAll(/<(?:\w+:)?(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g)) {
        const row = a[0].match(/<(?:\w+:)?from>[\s\S]*?<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/);
        const emb = a[0].match(/:embed="([^"]+)"/);
        if (!row || !emb || !dRels[emb[1]]) continue;
        const media = resolve(dPath, dRels[emb[1]]), data = await bin(media);
        const key = `${sh.name}|${Number(row[1]) + 1}`;
        if (data && !out.has(key)) out.set(key, { data, ext: media.split(".").pop().toLowerCase() });
      }
    }
    // pictures placed in cells
    if (richImg.length) {
      for (const c of xml.matchAll(/<c\b[^>]*\bvm="(\d+)"[^>]*>/g)) {
        const a = attrs(c[0]); const rv = vmToRv[Number(a.vm) - 1]; const img = rv == null ? null : richImg[rv];
        if (!img) continue;
        const row = Number(String(a.r).replace(/[A-Z]/g, "")); const key = `${sh.name}|${row}`;
        const data = await bin(img); if (data && !out.has(key)) out.set(key, { data, ext: img.split(".").pop().toLowerCase() });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- the form itself
export const FORM_SHEETS = ["Centre Details", "Team Events", "Summary & Declaration", "Lists"];

/**
 * Parse and check one Centre form.
 * Returns {centre, people, entries, teams, issues, pictures} or throws an Error with a plain message.
 */
export async function readCentreForm(buf, fileName, config, { XLSX, JSZip }) {
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const groupSheets = (config.groups || []).map(g => g.label);
  const missing = [...FORM_SHEETS, ...groupSheets].filter(n => !wb.Sheets[n]);
  if (missing.length) throw new Error(`${fileName}: this is not the MDYS Centre entry form for this year (missing sheets: ${missing.join(", ")}).`);
  const cell = (sh, ref) => { const c = wb.Sheets[sh][ref]; return c ? c.v : null; };
  const pictures = JSZip ? await extractPictures(buf, JSZip) : new Map();

  const centreName = s(cell("Centre Details", "B5")) || fileName.replace(/\.xlsx$/i, "");
  const centre = {
    name: centreName, president: s(cell("Centre Details", "B6")), secretary: s(cell("Centre Details", "B7")),
    phone: s(cell("Centre Details", "B8")), email: s(cell("Centre Details", "B9")), sakhas: [], file: fileName,
  };
  for (let r = 13; r <= 42; r++) { const v = s(cell("Centre Details", "A" + r)); if (v) centre.sakhas.push(v); }

  const issues = [];
  const iss = (sheet, row, msg) => issues.push({ sheet, row: row || "", msg });
  const people = new Map();
  const keyOf = (name, dob) => `${name.toLowerCase().replace(/\s+/g, " ")}|${dob}`;
  const person = (name, gender, dob, sakha, membership, phone, pic) => {
    const k = keyOf(name, dob);
    if (!people.has(k)) people.set(k, { key: k, name, gender, dob, sakha, membership, phone, group: groupForDob(config, dob), photo: null, ind: 0, team: 0 });
    const p = people.get(k);
    if (gender && p.gender && gender !== p.gender && !p.genderClash) { p.genderClash = true; }
    for (const [f, v] of [["gender", gender], ["sakha", sakha], ["membership", membership], ["phone", phone]]) if (v && !p[f]) p[f] = v;
    if (pic && !p.photo) p.photo = pic;
    return p;
  };

  // ---- individual events, one sheet per age group
  const entries = [];
  for (const g of config.groups || []) {
    const ws = wb.Sheets[g.label]; const range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
    for (let r = 6; r <= range.e.r + 1; r++) {
      const ev = s(cell(g.label, "A" + r)), pos = s(cell(g.label, "B" + r)), name = s(cell(g.label, "C" + r));
      if (!ev || !name) continue;
      const rawDob = cell(g.label, "E" + r), dob = toIsoDate(rawDob, XLSX);
      const gender = s(cell(g.label, "D" + r)), sakha = s(cell(g.label, "F" + r)), mem = s(cell(g.label, "G" + r)), phone = s(cell(g.label, "H" + r)).replace(/\s/g, "");
      const p = person(name, gender, dob, sakha, mem, phone, pictures.get(`${g.label}|${r}`));
      const def = eventDef(config, ev), flags = [];
      if (!def || def.type !== "individual") flags.push(`"${ev}" is not an individual event in this year's rules`);
      if (!dob) flags.push("date of birth missing or not a valid date");
      else if (p.group === "none") flags.push("born outside every age group – not eligible");
      else if (p.group !== g.code) flags.push(`date of birth puts them in ${(config.groups.find(x => x.code === p.group) || {}).label || p.group}`);
      if (!gender || !sakha || !mem) flags.push("gender, Sakha or membership no. missing");
      if (phone && !/^\d{10}$/.test(phone)) flags.push("WhatsApp no. must be 10 digits");
      if (sakha && centre.sakhas.length && !centre.sakhas.includes(sakha)) flags.push(`Sakha "${sakha}" is not on the Centre's Sakha list`);
      if (def && def.gender && def.gender !== "Any" && gender && gender !== def.gender) flags.push(`${ev} is for ${def.gender.toLowerCase()} participants only`);
      if (!["1st", "2nd"].includes(pos)) flags.push("place at Centre must be 1st or 2nd");
      if (entries.some(e => e.event === ev && e.group === g.code && e.pkey === p.key)) flags.push("same person in 1st and 2nd place");
      for (const f of flags) iss(g.label, r, `${name} – ${ev}: ${f}`);
      p.ind++;
      entries.push({ event: ev, group: g.code, pos, pkey: p.key, ok: flags.length === 0 });
    }
  }

  // ---- team events: box positions are recorded on the hidden Lists sheet
  const teams = [];
  for (let lr = 2; lr <= 40; lr++) {
    const ev = s(cell("Lists", "D" + lr)); if (!ev) continue;
    const pos = s(cell("Lists", "E" + lr)), h = Number(cell("Lists", "F" + lr)), f0 = Number(cell("Lists", "G" + lr)),
          f1 = Number(cell("Lists", "H" + lr)), mx = Number(cell("Lists", "I" + lr));
    const sakha = s(cell("Team Events", "B" + (h + 1))), notes = s(cell("Team Events", "E" + (h + 1)));
    const def = eventDef(config, ev), members = [], flags = [];
    for (let r = f0; r <= f1; r++) {
      const name = s(cell("Team Events", "B" + r)); if (!name) continue;
      const role = r > f0 + mx - 1 ? "Substitute" : "Member";
      const dob = toIsoDate(cell("Team Events", "D" + r), XLSX);
      const p = person(name, s(cell("Team Events", "C" + r)), dob, sakha, s(cell("Team Events", "E" + r)), "", pictures.get(`Team Events|${r}`));
      p.team++;
      if (!dob) flags.push(`${name}: date of birth missing`);
      else if (p.group === "none") flags.push(`${name}: born outside every age group – not eligible`);
      if (def && def.gender && def.gender !== "Any" && p.gender && p.gender !== def.gender) flags.push(`${name}: ${ev} is for ${def.gender.toLowerCase()} participants only`);
      if (members.some(m => m.pkey === p.key)) flags.push(`${name} listed twice`);
      members.push({ pkey: p.key, role });
    }
    if (!members.length && !sakha) continue;
    const reg = members.filter(m => m.role === "Member").length, subs = members.length - reg;
    if (!def || def.type !== "team") flags.push(`"${ev}" is not a team event in this year's rules`);
    if (!sakha) flags.push("Sakha not selected");
    if (def && (reg < def.teamMin || reg > def.teamMax)) flags.push(`${reg} members (allowed ${def.teamMin}–${def.teamMax})`);
    if (def && subs > (def.substitutes ?? 2)) flags.push(`${subs} substitutes (max ${def.substitutes ?? 2})`);
    if (def && def.needsSong && !notes) flags.push("song(s) not given for vetting");
    const first = teams.find(t => t.event === ev && t.pos === "1st");
    if (pos === "2nd" && first && sakha && first.sakha === sakha) flags.push(`${sakha} has both the 1st and 2nd place teams`);
    for (const f of flags) iss("Team Events", h, `${ev} (${pos}, ${sakha || "?"}): ${f}`);
    teams.push({ event: ev, pos, sakha, notes, members, ok: flags.length === 0 });
  }

  // ---- per-person checks
  const maxInd = Number(config.maxIndividualEvents ?? 4);
  for (const p of people.values()) {
    if (p.ind > maxInd) iss(p.group === "g1" ? "Group I" : "Group II", "", `${p.name}: ${p.ind} individual events (max ${maxInd})`);
    if (!p.photo) iss("Photos", "", `${p.name}: no photo found`);
    if (p.genderClash) iss("People", "", `${p.name}: entered as male in one row and female in another – check the gender`);
  }

  // ---- food from the summary sheet (cell positions are on the Lists sheet)
  const where = {};
  for (let r = 2; r <= 6; r++) { const k = s(cell("Lists", "K" + r)); if (k) where[k] = s(cell("Lists", "L" + r)); }
  const num = v => (typeof v === "number" ? v : 0);
  centre.food = { total: num(cell("Summary & Declaration", where.food_total || "B26")), dinner: num(cell("Summary & Declaration", where.dinner || "B28")) };

  return { centre, people: [...people.values()], entries, teams, issues };
}
