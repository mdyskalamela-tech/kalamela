// Small helpers shared by every screen.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/** Escape text before putting it into HTML. Every name, Sakha or note typed by a person goes through this. */
export const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmt = n => (n == null || n === "" ? "" : String(Math.round(Number(n) * 100) / 100));
export const isNum = v => typeof v === "number" && isFinite(v);

export function parseMark(v) {
  const t = String(v ?? "").trim();
  if (t === "") return null;
  const n = Number(t);
  return isFinite(n) ? n : t;
}

let toastTimer;
export function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg; t.className = kind; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), Math.min(15000, Math.max(3500, String(msg).split(/\s+/).length * 330)));   // long warnings stay up long enough to read
  t.onclick = () => (t.hidden = true);
}

export function statusClass(s) {
  return { "Ready": "s-ready", "Tie – committee": "s-tie", "Verify": "s-verify", "Entering / errors": "s-entering",
           "Received – to enter": "s-received", "Awaiting sheets": "s-awaiting", "Not in rules": "s-entering" }[s] || "s-awaiting";
}
export const pill = s => `<span class="pill ${statusClass(s)}">${esc(s)}</span>`;
export const placeClass = p => (p === "1st" ? "p1" : p === "2nd" ? "p2" : p === "3rd" ? "p3" : "");

export function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return d ? `${d}-${m}-${y}` : iso;
}
export function fmtTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Run writes to the same document one after another. */
const queues = new Map();
export function enqueue(key, fn) {
  const p = (queues.get(key) || Promise.resolve()).then(fn, fn);
  queues.set(key, p.catch(() => {}));
  return p;
}

/** Build an .xlsx in the browser and download it. sheets: [{name, rows: [[...]]}] */
export function downloadXlsx(filename, sheets) {
  const XLSX = window.XLSX;
  if (!XLSX) { toast("The Excel library didn't load. Reload the page.", "bad"); return; }
  const wb = XLSX.utils.book_new(); const used = new Set();
  for (const sh of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sh.rows);
    ws["!cols"] = (sh.rows[0] || []).map((_, i) => ({ wch: Math.min(42, Math.max(6, ...sh.rows.slice(0, 300).map(r => String(r[i] ?? "").length + 1))) }));
    let nm = String(sh.name).replace(/[\\/?*\[\]:]/g, "").slice(0, 31) || "Sheet";
    while (used.has(nm)) nm = nm.slice(0, 28) + "_" + used.size;
    used.add(nm);
    XLSX.utils.book_append_sheet(wb, ws, nm);
  }
  XLSX.writeFile(wb, filename);
}

export function downloadText(filename, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/** Shrink a photo to a small JPEG data URL for admit cards (about 15–30 KB). */
export async function makeThumb(bytes, ext) {
  try {
    const type = ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : "image/jpeg";
    const bmp = await createImageBitmap(new Blob([bytes], { type }));
    const W = 180, H = 225, scale = Math.max(W / bmp.width, H / bmp.height);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, W, H);
    const w = bmp.width * scale, h = bmp.height * scale;
    g.drawImage(bmp, (W - w) / 2, (H - h) / 2, w, h);
    return c.toDataURL("image/jpeg", 0.78);
  } catch { return ""; }
}

/** In-page confirmation (the browser's confirm() is not used, so it works everywhere). */
export function confirmBox(container, { title, body, confirmLabel = "Confirm", typeWord = "", danger = false }) {
  return new Promise(resolve => {
    const box = document.createElement("div");
    box.className = "confirm" + (danger ? " danger" : "");
    box.innerHTML = `<div><b>${esc(title)}</b><p>${body}</p>
      ${typeWord ? `<input class="txt" id="confirmWord" placeholder="Type ${esc(typeWord)} to confirm" autocomplete="off">` : ""}
      <div class="row"><button class="btn ${danger ? "danger" : "primary"}" data-ok ${typeWord ? "disabled" : ""}>${esc(confirmLabel)}</button>
      <button class="btn" data-cancel>Cancel</button></div></div>`;
    container.prepend(box);
    const ok = box.querySelector("[data-ok]");
    if (typeWord) box.querySelector("#confirmWord").oninput = e => (ok.disabled = e.target.value.trim() !== typeWord);
    ok.onclick = () => { box.remove(); resolve(true); };
    box.querySelector("[data-cancel]").onclick = () => { box.remove(); resolve(false); };
    box.scrollIntoView({ block: "nearest" });
  });
}

// ---------------------------------------------------------------- icons (simple line icons drawn for this site)
const ICON_PATHS = {
  overview: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  centres: '<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  people: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.8a3 3 0 0 1 0 6M18 14.3c1.9.7 3 2.9 3 5.7"/>',
  lists: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
  control: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2"/>',
  stage: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  entry: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
  results: '<path d="M9 11l3 3 8-8"/><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h11"/>',
  slip: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
  all: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 10h18M9 4v16"/>',
  board: '<path d="M5 20V11M12 20V4M19 20v-6M3 20h18"/>',
  awards: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5v1.5A3 3 0 0 0 8 10.4M16 6h3v1.5a3 3 0 0 1-3 2.9M12 13v4M9 21h6M10 17h4v4"/>',
  certs: '<circle cx="12" cy="9" r="5"/><path d="M9.2 13.2 8 21l4-2 4 2-1.2-7.8"/>',
  kendra: '<path d="M4 21V9l8-5 8 5v12"/><path d="M9.5 21v-6h5v6M3 21h18"/>',
  rules: '<path d="M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z"/><path d="M9 11h6M9 15h6M9 7h3"/>',
  schedule: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  years: '<path d="M12 3 3 7.5l9 4.5 9-4.5z"/><path d="M3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5"/>',
  team: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>',
  backup: '<path d="M7 18a5 5 0 1 1 1.1-9.9A6 6 0 0 1 19.5 10 4 4 0 0 1 18 18z"/><path d="M12 12v6M9.5 14.5 12 12l2.5 2.5"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3.5 2.5 20h19z"/><path d="M12 10v4.5M12 17.2h.01"/>',
  live: '<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.7"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
};
/** An inline icon. Names come only from the list above, never from data. */
export function icon(name, cls = "ic") {
  const p = ICON_PATHS[name]; if (!p) return "";
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${p}</svg>`;
}
