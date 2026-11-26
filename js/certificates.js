// Certificates: writes winners onto certificate designs (PDF templates) and returns one PDF.
//
// A design ("template") is a PDF file plus:
//   pages: which page of the file to use for 1st, 2nd and 3rd place (all the same page is fine)
//   boxes: text boxes, each with a pattern such as "{name}" or "{event} ({group})", a position, font, size and colour.
// Positions are PDF points measured from the top-left corner of the page's visible area (CropBox);
// y is the text's baseline. Text is centred in (or starts at the left of) the box and shrinks to fit its width.
//
// Which design an event uses: a design picked for that event, else the one picked for its group, else the default.
// With nothing saved, the built-in Diocese 2026 design is used (the Canva PDF in templates/).
//
// The libraries, fonts and template files load only when someone makes certificates or edits a design.

export const FONTS = {
  cormorant: { label: "Cormorant Garamond Bold (elegant)", file: "fonts/CormorantGaramond-Bold.ttf", css: "KCormorant" },
  poppinsSBI: { label: "Poppins SemiBold Italic", file: "fonts/Poppins-SemiBoldItalic.ttf", css: "KPoppinsSBI" },
  poppinsSB: { label: "Poppins SemiBold", file: "fonts/Poppins-SemiBold.ttf", css: "KPoppinsSB" },
  poppins: { label: "Poppins Regular", file: "fonts/Poppins-Regular.ttf", css: "KPoppins" },
};
export const PLACES = ["1st", "2nd", "3rd"];
export const FIELDS = { name: "Winner's name", centre: "Centre", event: "Competition", place: "Place (1st, 2nd, 3rd)", group: "Group", sakha: "Shakha", year: "Year" };
export const SAMPLE = { name: "Riya Mathew", centre: "Kalyan", event: "Solo Malayalam (Female)", place: "1st", group: "Group I", sakha: "St. Thomas", year: "2026-27" };
const INK = "#2b192e";   // the Diocese template's own text colour

const DIOCESE_PDF = "templates/Diocese_Kalamela_Certificate_2026.pdf";
const dioceseBoxes = (name, centre, event) => [
  { text: "{name}", x: name[0], y: name[1] - 9, w: name[2] - name[0], size: 32, min: 14, font: "cormorant", color: INK, align: "center" },
  { text: "{centre}", x: centre[0], y: centre[1] - 5.5, w: centre[2] - centre[0], size: 13, min: 7, font: "poppinsSBI", color: INK, align: "center" },
  { text: "{event}", x: event[0], y: event[1] - 5.5, w: event[2] - event[0], size: 13, min: 7, font: "poppinsSBI", color: INK, align: "center" },
];
/** The design used until an admin saves their own: the Diocese 2026 Canva PDF (9 pages: Above 18, Below 18, team; each 1st/2nd/3rd). */
export const BUILTIN = {
  templates: {
    "diocese-g2": { name: "Diocese 2026 – Above 18 (Group II)", src: DIOCESE_PDF, pages: { "1st": 0, "2nd": 1, "3rd": 2 },
      boxes: dioceseBoxes([139.0, 324.2, 703.2], [156.9, 354.3, 291.9], [551.0, 354.6, 754.4]) },
    "diocese-g1": { name: "Diocese 2026 – Below 18 (Group I)", src: DIOCESE_PDF, pages: { "1st": 3, "2nd": 4, "3rd": 5 },
      boxes: dioceseBoxes([166.5, 321.0, 730.7], [182.7, 352.6, 317.8], [576.9, 353.0, 780.2]) },
    "diocese-op": { name: "Diocese 2026 – Team events", src: DIOCESE_PDF, pages: { "1st": 6, "2nd": 7, "3rd": 8 },
      boxes: dioceseBoxes([144.5, 330.5, 697.7], [121.4, 366.9, 275.8], [563.0, 366.8, 798.4]) },
  },
  assign: { default: "diocese-g2", groups: { g1: "diocese-g1", g2: "diocese-g2", op: "diocese-op" }, lists: {} },
};

/** The saved setup if there is one, else the built-in Diocese design. */
export function effectiveSetup(saved) {
  return saved && saved.templates && Object.keys(saved.templates).length ? saved : BUILTIN;
}
/** The design id for one event list: picked for the event, else for its group, else the default. */
export function designFor(setup, listKey, grp) {
  const a = setup.assign || {}, t = setup.templates || {};
  for (const id of [(a.lists || {})[listKey], (a.groups || {})[grp], a.default]) if (id && t[id]) return id;
  return Object.keys(t)[0] || null;
}

/** Template files kept in the website's own templates/ folder: a plain file name, nothing else. */
export const isRepoFile = src => typeof src === "string" && /^templates\/[\w .()\-]{1,100}\.pdf$/i.test(src) && !src.includes("..");
export const isStorageFile = src => typeof src === "string" && /^storage:certificates\/[\w\-]{1,40}\/[\w\-]{1,60}\.pdf$/.test(src);

/** Names typed all in lower or all in upper case print as "Riya Mathew"; names with mixed capitals stay as typed. */
export function niceCase(t) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  if (!t || (t !== t.toLowerCase() && t !== t.toUpperCase())) return t;
  return t.toLowerCase().replace(/(^|[\s(.'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
/** Centre names go after "from" and before the printed word "Centre", so drop a trailing "Centre". */
export function centreText(c) { return niceCase(String(c || "").replace(/\s+centre\s*$/i, "")); }
/** Fill a box's pattern: {name}, {centre}, {event}, {place}, {group}, {sakha}, {year}. Unknown words are left out. */
export function fillPattern(pattern, d) {
  return String(pattern || "").replace(/\{(\w+)\}/g, (m, k) => (k in FIELDS ? String(d[k] ?? "") : "")).replace(/\s+/g, " ").trim();
}
const certData = c => ({ name: niceCase(c.name), centre: centreText(c.centre), event: c.event || "", place: c.place || "",
  group: c.group || "", sakha: niceCase(c.sakha || ""), year: c.year || "" });

function loadScript(src) {
  return new Promise((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load " + src)); document.head.append(s);
  });
}
async function bytes(url) {
  const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(`Couldn't load ${url} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}
/** The bytes of a template file: from the website's templates/ folder, or (if enabled) Firebase Storage via readStorage(path). */
export async function templateBytes(src, readStorage) {
  if (isRepoFile(src)) return bytes(src);
  if (isStorageFile(src)) {
    if (!readStorage) throw new Error("Uploaded designs need Firebase Storage, which isn't switched on");
    return readStorage(src.slice("storage:".length));
  }
  throw new Error("Not a design file this website can use: " + src);
}
const hex = c => { const m = /^#?([0-9a-f]{6})$/i.exec(c || ""); const n = parseInt(m ? m[1] : "2b192e", 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

/**
 * certs: [{ key, grp, place: "1st"|"2nd"|"3rd", name, centre, event, group, sakha, year }]
 * setup: the certificate designs (see effectiveSetup). Returns the finished PDF as bytes.
 */
export async function makeCertificatesPdf(certs, setup, { onProgress = () => {}, readStorage } = {}) {
  setup = effectiveSetup(setup);
  await loadScript("vendor/pdf-lib-1.17.1.min.js");
  await loadScript("vendor/fontkit-1.1.1.umd.min.js");
  const { PDFDocument, rgb } = window.PDFLib;
  // which design and page each certificate uses
  const plan = certs.map(c => {
    const id = designFor(setup, c.key, c.grp), t = id && setup.templates[id];
    if (!t) throw new Error(`No certificate design for ${c.event}`);
    const page = Number.isInteger(t.pages?.[c.place]) ? t.pages[c.place] : 0;
    return { c, t, page };
  });
  onProgress("Loading the certificate designs…");
  const out = await PDFDocument.create();
  out.registerFontkit(window.fontkit);
  out.setTitle("MDYS Kalamela certificates"); out.setCreator("MDYS Kalamela website"); out.setProducer("MDYS Kalamela website");
  // each template file is read once, and each page used is embedded once and reused
  const files = new Map(), pages = new Map();
  for (const src of new Set(plan.map(p => p.t.src))) files.set(src, await PDFDocument.load(await templateBytes(src, readStorage)));
  for (const src of files.keys()) {
    const doc = files.get(src), want = [...new Set(plan.filter(p => p.t.src === src).map(p => p.page))];
    for (const i of want) if (i < 0 || i >= doc.getPageCount()) throw new Error(`${src} has no page ${i + 1}`);
    const boxes = want.map(i => { const b = doc.getPage(i).getCropBox(); return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height }; });
    const emb = await out.embedPages(want.map(i => doc.getPage(i)), boxes);
    want.forEach((i, k) => pages.set(`${src}#${i}`, { emb: emb[k], size: doc.getPage(i).getCropBox() }));
  }
  // whole fonts: fontkit 1.1 drops letters when it trims (subsets) these fonts
  const fonts = {};
  for (const f of new Set(plan.flatMap(p => (p.t.boxes || []).map(b => FONTS[b.font] ? b.font : "poppins"))))
    fonts[f] = await out.embedFont(await bytes(FONTS[f].file));
  const fit = (font, text, max, size, min) => { let s = size; while (s > min && font.widthOfTextAtSize(text, s) > max) s -= 0.5; return s; };
  plan.forEach(({ c, t, page }, n) => {
    const pg = pages.get(`${t.src}#${page}`), W = pg.size.width, H = pg.size.height;
    const p = out.addPage([W, H]); p.drawPage(pg.emb, { x: 0, y: 0, width: W, height: H });
    const d = certData(c);
    for (const b of t.boxes || []) {
      const text = fillPattern(b.text, d); if (!text) continue;
      const font = fonts[FONTS[b.font] ? b.font : "poppins"], size = Math.max(4, +b.size || 14), min = Math.min(size, Math.max(4, +b.min || size * 0.45));
      const w = Math.max(10, +b.w || 100), s = fit(font, text, w - 6, size, min), tw = font.widthOfTextAtSize(text, s);
      const x = b.align === "left" ? +b.x : +b.x + (w - tw) / 2;
      p.drawText(text, { x, y: H - (+b.y), size: s, font, color: rgb(...hex(b.color)) });
    }
    if (n % 20 === 0) onProgress(`Writing certificate ${n + 1} of ${certs.length}…`);
  });
  onProgress("Saving…");
  return out.save();
}
