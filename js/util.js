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
