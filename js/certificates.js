// Certificates: fills the Diocese certificate template (made in Canva) with the winners and returns one PDF.
// The template has 9 pages: three designs, each in 1st / 2nd / 3rd place versions.
//   pages 1-3  "Above 18 category"  -> Group II
//   pages 4-6  "Below 18 category"  -> Group I
//   pages 7-9  no category line      -> team (group) events
// The libraries, fonts and template load only when someone makes certificates.

export const TEMPLATE = "templates/Diocese_Kalamela_Certificate_2026.pdf";
const FIRST_PAGE = { g2: 0, g1: 3, op: 6 };
const PLACE_OFFSET = { "1st": 0, "2nd": 1, "3rd": 2 };
// The blank lines on each design, in PDF points from the top-left: [left x, line y, right x]
const SLOTS = {
  g2: { name: [139.0, 324.2, 703.2], centre: [156.9, 354.3, 291.9], event: [551.0, 354.6, 754.4] },
  g1: { name: [166.5, 321.0, 730.7], centre: [182.7, 352.6, 317.8], event: [576.9, 353.0, 780.2] },
  op: { name: [144.5, 330.5, 697.7], centre: [121.4, 366.9, 275.8], event: [563.0, 366.8, 798.4] },
};
const INK = [0x2b / 255, 0x19 / 255, 0x2e / 255];   // the template's own text colour

function loadScript(src) {
  return new Promise((ok, bad) => {
    if (document.querySelector(`script[src="${src}"]`)) return ok();
    const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("Couldn't load " + src)); document.head.append(s);
  });
}
async function bytes(url) {
  const r = await fetch(url); if (!r.ok) throw new Error(`Couldn't load ${url} (${r.status})`);
  return new Uint8Array(await r.arrayBuffer());
}

/** Names typed all in lower or all in upper case print as "Riya Mathew"; names with mixed capitals stay as typed. */
export function niceCase(t) {
  t = String(t || "").replace(/\s+/g, " ").trim();
  if (!t || (t !== t.toLowerCase() && t !== t.toUpperCase())) return t;
  return t.toLowerCase().replace(/(^|[\s(.'’-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}
/** Centre names go after "from" and before the printed word "Centre", so drop a trailing "Centre". */
export function centreText(c) { return niceCase(String(c || "").replace(/\s+centre\s*$/i, "")); }

/**
 * certs: [{ grp: "g1"|"g2"|"op", place: "1st"|"2nd"|"3rd", name, centre, event }]
 * Returns the finished PDF as bytes.
 */
export async function makeCertificatesPdf(certs, onProgress = () => {}) {
  await loadScript("vendor/pdf-lib-1.17.1.min.js");
  await loadScript("vendor/fontkit-1.1.1.umd.min.js");
  const { PDFDocument, rgb } = window.PDFLib;
  onProgress("Loading the certificate design…");
  const [tpl, fName, fText] = await Promise.all([bytes(TEMPLATE), bytes("fonts/CormorantGaramond-Bold.ttf"), bytes("fonts/Poppins-SemiBoldItalic.ttf")]);
  const src = await PDFDocument.load(tpl);
  const out = await PDFDocument.create();
  out.registerFontkit(window.fontkit);
  out.setTitle("MDYS Kalamela certificates"); out.setCreator("MDYS Kalamela website"); out.setProducer("MDYS Kalamela website");
  const nameFont = await out.embedFont(fName);   // whole fonts: fontkit 1.1 drops letters when it trims (subsets) these fonts
  const textFont = await out.embedFont(fText);
  // each template page is embedded once and reused, so 100 certificates stay close to the template's size
  const needed = [...new Set(certs.map(c => FIRST_PAGE[c.grp] + PLACE_OFFSET[c.place]))];
  const embedded = {};
  // embed by the visible area (CropBox): Canva's page box is offset from it, which would shift the artwork
  const boxes = needed.map(i => { const b = src.getPage(i).getCropBox(); return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height }; });
  const pages = await out.embedPages(needed.map(i => src.getPage(i)), boxes);
  needed.forEach((i, k) => { embedded[i] = pages[k]; });
  const { width: W, height: H } = src.getPage(0).getCropBox();
  const ink = rgb(...INK);
  const fit = (font, text, max, size, min) => { let s = size; while (s > min && font.widthOfTextAtSize(text, s) > max) s -= 0.5; return s; };
  const put = (page, font, text, [x0, y, x1], size, min, lift) => {
    text = String(text || "").replace(/\s+/g, " ").trim(); if (!text) return;
    const max = x1 - x0 - 6, s = fit(font, text, max, size, min), w = font.widthOfTextAtSize(text, s);
    page.drawText(text, { x: x0 + (x1 - x0 - w) / 2, y: H - y + lift, size: s, font, color: ink });
  };
  certs.forEach((c, n) => {
    const slot = SLOTS[c.grp], ix = FIRST_PAGE[c.grp] + PLACE_OFFSET[c.place];
    if (!slot || embedded[ix] === undefined) return;
    const page = out.addPage([W, H]);
    page.drawPage(embedded[ix], { x: 0, y: 0, width: W, height: H });
    put(page, nameFont, niceCase(c.name), slot.name, 32, 14, 9);
    put(page, textFont, centreText(c.centre), slot.centre, 13, 7, 5.5);
    put(page, textFont, c.event, slot.event, 13, 7, 5.5);
    if (n % 20 === 0) onProgress(`Writing certificate ${n + 1} of ${certs.length}…`);
  });
  onProgress("Saving…");
  return out.save();
}
