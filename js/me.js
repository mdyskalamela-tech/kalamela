// "My Kalamela": a participant types their chest number (or scans the QR on their admit card) and sees their events,
// stages, planned times, live stage progress and where to go next. No sign-in; reads only the public data
// published from the Schedule screen (no names, dates of birth, phone numbers or photos).
import { FIREBASE_CONFIG, SITE_NAME, ORG_NAME } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getFirestore, doc, getDoc, collection, onSnapshot } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
$("#siteTitle").textContent = "My Kalamela"; $("#siteSub").textContent = "Participant portal";
const db = getFirestore(initializeApp(FIREBASE_CONFIG));
let meta = null, ed = null, status = new Map(), mine = null, chest = "";

const out = $("#out");
const msg = (t, cls = "info") => { out.innerHTML = `<div class="banner ${cls}" style="display:block">${t}</div>`; };
async function boot() {
  try {
    const cur = await getDoc(doc(db, "public", "current"));
    if (!cur.exists()) return msg("The schedule hasn't been published yet. Please check again closer to the Kalamela.");
    ed = cur.data().ed;
    const m = await getDoc(doc(db, "public", ed));
    if (!m.exists()) return msg("The schedule hasn't been published yet. Please check again closer to the Kalamela.");
    meta = m.data();
    document.title = `My Kalamela · ${SITE_NAME} ${meta.name}`;
    $("#siteSub").textContent = `Participant portal\n${SITE_NAME} ${meta.name}`;
    $("#intro").textContent = `${meta.date ? new Date(meta.date + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : ""}${meta.venue ? " · " + meta.venue : ""}. Type the chest number on your admit card, or scan the QR code on it. This page updates by itself.`;
    onSnapshot(collection(db, "public", ed, "status"), s => { status = new Map(s.docs.map(d => [d.id, d.data().status])); draw(); });
    const h = decodeURIComponent(location.hash.slice(1)); let saved = ""; try { saved = localStorage.getItem("me.chest") || ""; } catch {}
    const start = /^\d{1,6}$/.test(h) ? h : saved;
    if (start) { $("#chest").value = start; look(start); }
  } catch (e) { console.error(e); msg("Couldn't load the schedule. Check your internet connection and reload.", "bad"); }
}
async function look(c) {
  chest = c; mine = null; out.innerHTML = '<p class="muted">Looking up…</p>';
  try {
    const d = await getDoc(doc(db, "public", ed, "chest", c));
    if (!d.exists()) return msg(`No events found for chest number <b>${esc(c)}</b>. Check the number on your admit card.`, "warn");
    mine = d.data().events || []; try { localStorage.setItem("me.chest", c); } catch {}
    if (location.hash.slice(1) !== c) history.replaceState(null, "", "#" + c);
    draw();
  } catch (e) { console.error(e); msg("Couldn't look that up. Check your internet connection and try again.", "bad"); }
}
const stOf = k => status.get(k) || "pending";
const svg = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const IC = {
  done: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.7 2.7L16 9.7"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  live: svg('<circle cx="12" cy="12" r="2"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4"/>'),
  dot: svg('<circle cx="12" cy="12" r="9"/>'),
  cal: svg('<rect x="3" y="5" width="18" height="16" rx="1.5"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>'),
};
/** "In 1h 6m" on the Kalamela day, from the planned start; empty on other days or without a time. */
function eta(start) {
  if (!start || !meta || !meta.date) return "";
  const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  if (iso !== meta.date) return "";
  const [h, m] = String(start).split(":").map(Number); if (!isFinite(h) || !isFinite(m)) return "";
  const left = h * 60 + m - (d.getHours() * 60 + d.getMinutes());
  if (left <= 0) return "Due now";
  return "In " + (left >= 60 ? `${Math.floor(left / 60)}h ${left % 60}m` : `${left} min`);
}
setInterval(() => { if (mine) draw(); }, 60000);
function draw() {
  if (!meta || !mine) return;
  const items = new Map(meta.items.map(i => [i.key, i])), stages = new Map(meta.stages.map(s => [s.id, s]));
  const evs = mine.map(k => items.get(k)).filter(Boolean)
    .sort((a, b) => (a.start || "99").localeCompare(b.start || "99") || (a.order || 0) - (b.order || 0));
  const where = i => stages.get(i.stage) ? stages.get(i.stage).name : "Stage to be announced";
  // how many events on that stage are still to go before this one
  const ahead = i => meta.items.filter(x => x.stage === i.stage && x.order < i.order && stOf(x.key) === "pending").length + (meta.items.some(x => x.stage === i.stage && stOf(x.key) === "active" && x.key !== i.key) ? 1 : 0);
  const nowOn = i => meta.items.find(x => x.stage === i.stage && stOf(x.key) === "active");
  const next = evs.find(i => stOf(i.key) === "active") || evs.find(i => stOf(i.key) === "pending");
  let top = "";
  if (!next) top = `<div class="next"><div class="k">${IC.done} All done</div><div class="ev">All your events are completed.</div><div class="muted">Results are announced together at the end. Thank you for taking part!</div></div>`;
  else if (stOf(next.key) === "active") top = `<div class="next now"><div class="k">${IC.live} On stage now</div><div class="ev">${esc(next.ev)} <span class="muted" style="font-size:15px;font-weight:500">${esc(next.grp)}</span></div><div class="go">Go to <b>${esc(where(next))}</b> now.</div></div>`;
  else {
    const n = ahead(next), cur = nowOn(next), e = eta(next.start);
    top = `<div class="next"><div class="k">${IC.cal} Up next${e ? `<span class="eta">${esc(e)}</span>` : ""}</div><div class="ev">${esc(next.ev)} <span class="muted" style="font-size:15px;font-weight:500">${esc(next.grp)}</span></div>
      <div class="go">Go to <b>${esc(where(next))}</b>${next.start ? ` · planned ${esc(next.start)}` : ""}</div>
      <div class="muted small">${stages.get(next.stage) ? (n === 0 ? "Yours is the next event there – please be ready." : `${n} event${n > 1 ? "s" : ""} before yours on this stage.`) + (cur ? ` Now on: ${esc(cur.ev)} (${esc(cur.grp)}).` : "") : "The stage will be announced."}</div></div>`;
  }
  const row = i => { const s = stOf(i.key), isNext = next && i.key === next.key && s === "pending";
    const cls = s === "active" ? "active" : s === "done" ? "done" : isNext ? "next" : "pending";
    const tag = s === "active" ? "On stage now" : s === "done" ? "Completed" : isNext ? "Up next" : "Upcoming";
    return `<div class="evrow ${cls}"><span class="st">${s === "done" ? IC.done : s === "active" ? IC.live : isNext ? IC.clock : IC.dot}</span>
      <div><div class="t">${esc(i.ev)} <span class="muted" style="font-weight:500">· ${esc(i.grp)}</span></div><div class="s">${esc(tag)} · <b>${esc(where(i))}</b>${i.start ? " · " + esc(i.start) : ""}</div></div>
      <span class="tag">${s === "pending" && i.start ? esc(i.start) : ""}</span></div>`; };
  out.innerHTML = `<div style="display:grid;gap:14px">
    <div class="mcard chestcard"><span class="av">${IC.user}</span><div><div class="small muted">Chest number</div><div class="no">${esc(chest)}</div></div><button class="btn" id="changeChest" type="button">Change</button></div>
    ${top}
    <div class="sec"><h2>My events (${evs.length})</h2><span class="small muted">Updates live</span></div>
    <div class="mcard evlist">${evs.map(row).join("")}</div>
    <p class="small muted" style="margin:0">Times are planned times; stages can run early or late, so keep this page open. Stage and order are set by the Kalamela team.</p></div>`;
  const change = $("#changeChest"); if (change) change.onclick = () => { mine = null; chest = ""; out.innerHTML = ""; $("#chest").value = ""; $("#chest").focus(); };
}
$("#f").onsubmit = e => { e.preventDefault(); const c = $("#chest").value.trim(); if (!/^\d{1,6}$/.test(c)) return msg("Type the chest number (digits only) from your admit card.", "warn"); if (ed) look(c); };
window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (/^\d{1,6}$/.test(h) && h !== chest && ed) { $("#chest").value = h; look(h); } });
boot();
