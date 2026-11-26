// Settings → Certificate designs: choose PDF templates, place the text on them by dragging, and pick which design each event uses.
// The work is kept in a draft until Save; live data updates don't redraw this screen (view.dataset.keep).

import { $, $$, esc, toast, confirmBox, icon } from "./util.js";
import { BUILTIN, FONTS, PLACES, FIELDS, SAMPLE, effectiveSetup, designFor, isRepoFile, isStorageFile, templateBytes, fillPattern, makeCertificatesPdf } from "./certificates.js";

const MM = 25.4 / 72;                       // millimetres per PDF point
const clone = o => JSON.parse(JSON.stringify(o));
const GROUPS = [["g1", "Group I"], ["g2", "Group II"], ["op", "Team events"]];
let ctx, S, D, draft = null, dirty = false, savedRef, editing = null, place = "1st", sel = 0, repoFiles = null, eventsOpen = false;
const docs = new Map();                     // template src -> pdf.js document (for page count and drawing)
const imgs = new Map();                     // `${src}#${page}` -> { url, w, h } (rendered page picture, sizes in points)

// ---------------------------------------------------------------- pdf.js (loaded only on this screen)
let pdfjsMod = null;
async function pdfjs() {
  if (!pdfjsMod) {
    pdfjsMod = await import("../vendor/pdfjs/pdf-4.10.38.min.js");
    pdfjsMod.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker-4.10.38.min.js", import.meta.url).href;
  }
  return pdfjsMod;
}
async function openPdf(src) {
  if (docs.has(src)) return docs.get(src);
  const data = await templateBytes(src, D.readCertFile), m = await pdfjs();
  const doc = await m.getDocument({ data: data.slice(), isEvalSupported: false, enableXfa: false }).promise;
  docs.set(src, doc); return doc;
}
async function pagePicture(src, i) {
  const k = `${src}#${i}`; if (imgs.has(k)) return imgs.get(k);
  const doc = await openPdf(src), page = await doc.getPage(i + 1);
  const w = page.view[2] - page.view[0], h = page.view[3] - page.view[1];
  const vp = page.getViewport({ scale: 1600 / w }), c = document.createElement("canvas");
  c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  await page.render({ canvasContext: c.getContext("2d"), viewport: vp }).promise;
  const pic = { url: c.toDataURL("image/jpeg", 0.86), w, h }; imgs.set(k, pic); return pic;
}

// ---------------------------------------------------------------- screen
export function vCertDesign(view, c) {
  ctx = c; S = c.S; D = c.D;
  if (!draft || (!dirty && savedRef !== S.certSetup)) { draft = clone(effectiveSetup(S.certSetup)); savedRef = S.certSetup; dirty = false; }
  view.dataset.keep = "1";
  // live updates redraw the list (new event lists, year switched to archived, designs saved elsewhere), but never the editor,
  // and never while someone is typing on this screen
  view._refresh = () => {
    if (editing) return;
    const ae = document.activeElement;
    if (view.contains(ae) && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
    if ($("#cdNewName")?.value || $("#cdNewFile")?.value || $("#cdUpload")?.files?.length) return;
    vCertDesign(view, ctx);
  };
  window.onbeforeunload = () => (dirty ? "You have unsaved certificate designs." : undefined);
  if (editing && !draft.templates[editing]) editing = null;
  return editing ? editor(view) : list(view);
}
const ro = () => ctx.phase() === "archived";
const markDirty = () => { dirty = true; const b = $("#cdSave"); if (b) b.disabled = ro(); const n = $("#cdDirty"); if (n) n.hidden = false; };
const designOptions = (cur, first) => `${first ? `<option value="">${esc(first)}</option>` : ""}${Object.entries(draft.templates).map(([id, t]) => `<option value="${esc(id)}" ${id === cur ? "selected" : ""}>${esc(t.name)}</option>`).join("")}`;
const srcLabel = src => isStorageFile(src) ? "Uploaded file" : String(src).replace(/^templates\//, "templates/ ");
const head = (title, sub, extra = "") => `<div class="vhead"><div><h2>${title}</h2><p>${sub}</p></div><div class="actions">${extra}
  <span class="small warn-text" id="cdDirty" ${dirty ? "" : "hidden"}>Unsaved changes</span>
  <button class="btn primary" id="cdSave" ${dirty && !ro() ? "" : "disabled"}>Save designs</button></div></div>`;

function list(view) {
  const builtinInUse = !S.certSetup, lists = [...S.lists.values()].sort((a, b) => a.key.localeCompare(b.key));
  const a = draft.assign = draft.assign || {}; a.groups = a.groups || {}; a.lists = a.lists || {};
  const chosen = Object.values(a.lists).filter(Boolean).length;
  view.innerHTML = `<div class="view cd-view">
    ${head("Certificate designs", "The PDF designs used for certificates, where the winner's details go on them, and which design each event uses.")}
    ${builtinInUse ? `<div class="banner info">Using the built-in <b>Diocese 2026</b> design. Edit it or add your own, then <b>Save designs</b>; designs are saved for this year.</div>` : ""}
    ${ro() ? `<div class="banner info">This year is archived. Designs are read-only.</div>` : ""}
    <section class="panel cd-panel"><div class="cd-panel-h"><h3>Designs</h3>
      <button class="btn" id="cdReset" ${ro() ? "disabled" : ""}>Start again from the Diocese design</button></div>
      <div class="scroll"><table class="cd-table"><thead><tr><th>Design</th><th>File</th><th>Pages for 1st / 2nd / 3rd</th><th>Text boxes</th><th></th></tr></thead><tbody>
      ${Object.entries(draft.templates).map(([id, t]) => `<tr><td><b>${esc(t.name)}</b></td><td class="small">${esc(srcLabel(t.src))}</td>
        <td>${PLACES.map(p => (t.pages?.[p] ?? 0) + 1).join(" / ")}</td><td>${(t.boxes || []).length}</td>
        <td class="nowrap"><button class="btn" data-edit="${esc(id)}">${icon("entry")}Edit</button> <button class="btn" data-copy="${esc(id)}" ${ro() ? "disabled" : ""}>Copy</button> <button class="btn danger" data-del="${esc(id)}" ${ro() ? "disabled" : ""}>Delete</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="cd-add" id="cdAddBox">
        <h4>Add a design</h4>
        <div class="cd-add-row">
          <label class="lbl">Name <input class="txt" id="cdNewName" maxlength="80" placeholder="e.g. Kendra 2027 – Group I"></label>
          <label class="lbl">File in the website's <code>templates</code> folder
            <span class="cd-file"><input class="txt" id="cdNewFile" maxlength="100" list="cdRepoFiles" placeholder="e.g. Certificate_GroupI.pdf"><datalist id="cdRepoFiles"></datalist></span></label>
          ${D.certUploadsOn() ? `<label class="lbl">or upload a PDF <input type="file" id="cdUpload" accept="application/pdf"></label>` : ""}
          <button class="btn primary" id="cdAdd" ${ro() ? "disabled" : ""}>Add design</button>
        </div>
        <p class="small muted">Make the design in Canva (or any tool) with blank spaces for the name and other details, download it as a PDF, and upload it to the <code>templates</code> folder on GitHub${D.certUploadsOn() ? ", or upload it here" : ""}. One page can serve all places, or use a separate page for each of 1st, 2nd and 3rd.</p>
        <p class="small" id="cdAddMsg" role="status"></p>
      </div>
    </section>
    <section class="panel cd-panel"><div class="cd-panel-h"><h3>Which design each event uses</h3></div>
      <p class="small muted">An event uses the design chosen for it; if none, the one for its group; if none, the default.</p>
      <div class="cd-assign">
        <label class="lbl">All events (default) <select class="sel" data-asg="default" ${ro() ? "disabled" : ""}>${designOptions(a.default)}</select></label>
        ${GROUPS.map(([g, n]) => `<label class="lbl">${n} <select class="sel" data-asg="g:${g}" ${ro() ? "disabled" : ""}>${designOptions(a.groups[g], "Same as default")}</select></label>`).join("")}
      </div>
      <details class="cd-events" id="cdEvents" ${chosen || eventsOpen ? "open" : ""}><summary>Single events (${chosen} chosen)</summary>
        ${lists.length ? `<div class="scroll"><table class="cd-table"><thead><tr><th>Event</th><th>Group</th><th>Design</th><th>Will use</th></tr></thead><tbody>
          ${lists.map(L => `<tr><td>${esc(L.ev)}</td><td>${esc(ctx.gl(L.grp))}</td><td><select class="sel" data-asg="l:${esc(L.key)}" ${ro() ? "disabled" : ""}>${designOptions(a.lists[L.key], "Same as group")}</select></td><td class="small muted" data-will="${esc(L.key)}">${esc(draft.templates[designFor(draft, L.key, L.grp)]?.name || "")}</td></tr>`).join("")}
        </tbody></table></div>` : `<p class="small muted">Event lists appear here once they are built.</p>`}
      </details>
    </section>
  </div>`;
  $("#cdSave").onclick = save;
  $("#cdReset").onclick = async () => {
    if (await confirmBox($("#cdAddBox"), { title: "Start again from the Diocese design?", body: "Your designs and choices on this screen are replaced by the built-in Diocese 2026 design. Nothing changes until you save.", confirmLabel: "Start again", danger: true })) {
      draft = clone(BUILTIN); markDirty(); list(view);
    }
  };
  $$("[data-edit]", view).forEach(b => b.onclick = () => { editing = b.dataset.edit; place = "1st"; sel = 0; editor(view); });
  $$("[data-copy]", view).forEach(b => b.onclick = () => { const t = clone(draft.templates[b.dataset.copy]); t.name = ("Copy of " + t.name).slice(0, 80); draft.templates[newId()] = t; markDirty(); list(view); });
  $$("[data-del]", view).forEach(b => b.onclick = async () => {
    const id = b.dataset.del, where = usedBy(id);
    if (Object.keys(draft.templates).length === 1) return toast("Keep at least one design.", "bad");
    if (where.length) return toast(`In use: ${where.slice(0, 3).join(", ")}${where.length > 3 ? "…" : ""}. Choose another design there first.`, "bad");
    if (await confirmBox($("#cdAddBox"), { title: `Delete ${draft.templates[id].name}?`, body: "Nothing changes until you save.", confirmLabel: "Delete", danger: true })) { delete draft.templates[id]; markDirty(); list(view); }
  });
  $$("[data-asg]", view).forEach(s => s.onchange = () => {
    const [k, v] = [s.dataset.asg, s.value];
    if (k === "default") a.default = v; else if (k.startsWith("g:")) { if (v) a.groups[k.slice(2)] = v; else delete a.groups[k.slice(2)]; }
    else { if (v) a.lists[k.slice(2)] = v; else delete a.lists[k.slice(2)]; }
    markDirty();
    $$("[data-will]", view).forEach(td => { const L = S.lists.get(td.dataset.will); if (L) td.textContent = draft.templates[designFor(draft, L.key, L.grp)]?.name || ""; });
  });
  $("#cdAdd").onclick = () => addDesign(view);
  $("#cdEvents").ontoggle = e => { eventsOpen = e.target.open; };
  fillRepoList();
}
function usedBy(id) {
  const a = draft.assign || {}, out = [];
  if (a.default === id) out.push("All events (default)");
  for (const [g, n] of GROUPS) if ((a.groups || {})[g] === id) out.push(n);
  for (const [k, v] of Object.entries(a.lists || {})) if (v === id) { const L = S.lists.get(k); out.push(L ? `${L.ev} · ${ctx.gl(L.grp)}` : k); }
  return out;
}
const newId = () => "d-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** The PDFs in the website's templates/ folder, listed from GitHub when the site runs on GitHub Pages (otherwise type the name). */
async function fillRepoList() {
  const dl = $("#cdRepoFiles"); if (!dl) return;
  if (!repoFiles) {
    repoFiles = [];
    const m = /^([\w-]+)\.github\.io$/i.exec(location.hostname), repo = location.pathname.split("/").filter(Boolean)[0];
    if (m && repo) try {
      const r = await fetch(`https://api.github.com/repos/${m[1]}/${repo}/contents/templates`);
      if (r.ok) repoFiles = (await r.json()).filter(f => f.type === "file" && /\.pdf$/i.test(f.name)).map(f => String(f.name));
    } catch { /* type the file name instead */ }
  }
  dl.innerHTML = repoFiles.map(n => `<option value="${esc(n)}">`).join("");
}

async function addDesign(view) {
  const msg = $("#cdAddMsg"), name = $("#cdNewName").value.trim(), file = $("#cdNewFile").value.trim(), up = $("#cdUpload")?.files?.[0];
  const say = (t, bad) => { msg.textContent = t; msg.className = "small " + (bad ? "bad-text" : "muted"); };
  if (!name) return say("Give the design a name.", true);
  const id = newId(); let src;
  try {
    if (up) {
      if (up.size > 20 * 1024 * 1024) return say("That PDF is larger than 20 MB. Download it from Canva as 'PDF Standard' to make it smaller.", true);
      const head = new Uint8Array(await up.slice(0, 5).arrayBuffer());
      if (String.fromCharCode(...head) !== "%PDF-") return say("That file isn't a PDF.", true);
      say("Uploading…"); src = await D.uploadCertFile(S.ed, id, up);
    } else {
      src = "templates/" + file.replace(/^templates\//i, "");
      if (!file || !isRepoFile(src)) return say("Type the PDF's file name as it is in the templates folder (letters, numbers, spaces, - _ . ( ) only).", true);
    }
    say("Opening the PDF…");
    const doc = await openPdf(src), pic = await pagePicture(src, 0), n = doc.numPages;
    const W = pic.w, H = pic.h;
    draft.templates[id] = { name: name.slice(0, 80), src, pages: n >= 3 ? { "1st": 0, "2nd": 1, "3rd": 2 } : { "1st": 0, "2nd": 0, "3rd": 0 },
      boxes: [
        { text: "{name}", x: +(W * 0.15).toFixed(1), y: +(H * 0.55).toFixed(1), w: +(W * 0.7).toFixed(1), size: 30, min: 14, font: "cormorant", color: "#2b192e", align: "center" },
        { text: "{centre}", x: +(W * 0.15).toFixed(1), y: +(H * 0.64).toFixed(1), w: +(W * 0.3).toFixed(1), size: 13, min: 7, font: "poppinsSBI", color: "#2b192e", align: "center" },
        { text: "{event}", x: +(W * 0.55).toFixed(1), y: +(H * 0.64).toFixed(1), w: +(W * 0.3).toFixed(1), size: 13, min: 7, font: "poppinsSBI", color: "#2b192e", align: "center" },
      ] };
    markDirty(); editing = id; place = "1st"; sel = 0; editor(view);
    toast("Design added. Drag the boxes onto the blank spaces, then save.", "ok");
  } catch (e) { console.error(e); say(`Couldn't open that PDF: ${e.message || e}. Check the file name and that it's uploaded to the templates folder.`, true); }
}

// ---------------------------------------------------------------- editor
async function editor(view) {
  const t = draft.templates[editing], boxes = t.boxes = t.boxes || [];
  t.pages = t.pages || { "1st": 0, "2nd": 0, "3rd": 0 };
  if (sel >= boxes.length) sel = Math.max(0, boxes.length - 1);
  view.innerHTML = `<div class="view cd-view">
    ${head(`Edit design: ${esc(t.name)}`, "Drag each box onto its blank space. Drag a box's right edge to change its width. Arrow keys move the selected box (hold Shift for bigger steps).",
      `<button class="btn" id="cdBack">← All designs</button><button class="btn" id="cdPreview">${icon("certs")}Preview PDF</button>`)}
    <div class="cd-edit">
      <div class="cd-left">
        <div class="cd-places" role="group" aria-label="Show the page for">${PLACES.map(p => `<button class="btn ${p === place ? "on" : ""}" data-place="${p}" aria-pressed="${p === place}">${p} place</button>`).join("")}</div>
        <div class="cd-stage" id="cdStage"><div class="cd-loading muted">Loading the design…</div></div>
        <p class="small muted">The boxes show sample details. <b>Preview PDF</b> shows exactly how certificates will print.</p>
      </div>
      <aside class="cd-side">
        <label class="lbl col">Design name <input class="txt" id="cdName" maxlength="80" value="${esc(t.name)}" ${ro() ? "disabled" : ""}></label>
        <div class="small muted">File: ${esc(srcLabel(t.src))} <span id="cdPages"></span></div>
        <fieldset class="cd-fs"><legend>Page to use for</legend><div class="cd-pagepick" id="cdPagePick"></div></fieldset>
        <fieldset class="cd-fs"><legend>Text boxes</legend><div id="cdBoxes"></div>
          <button class="btn" id="cdAddBoxBtn" ${ro() || boxes.length >= 20 ? "disabled" : ""}>+ Add a text box</button></fieldset>
      </aside>
    </div>
    <dialog class="cd-dialog" id="cdDialog"><div class="cd-dialog-h"><b>Preview</b><span class="small muted">Sample details, one page per place</span><button class="btn" id="cdDlgClose">Close</button></div><iframe id="cdFrame" title="Certificate preview"></iframe></dialog>
  </div>`;
  $("#cdSave").onclick = save;
  $("#cdBack").onclick = () => { editing = null; list(view); };
  $("#cdName").oninput = e => { t.name = e.target.value.slice(0, 80); markDirty(); };
  $$("[data-place]", view).forEach(b => b.onclick = () => { place = b.dataset.place; editor(view); });
  $("#cdAddBoxBtn").onclick = () => { boxes.push({ text: "{event}", x: 100, y: 200, w: 250, size: 14, min: 7, font: "poppinsSBI", color: "#2b192e", align: "center" }); sel = boxes.length - 1; markDirty(); editor(view); };
  $("#cdPreview").onclick = () => preview(t);
  $("#cdDlgClose").onclick = () => { $("#cdDialog").close(); const f = $("#cdFrame"); if (f.src.startsWith("blob:")) URL.revokeObjectURL(f.src); f.removeAttribute("src"); };
  sideBoxes(view, t);
  try {
    const doc = await openPdf(t.src); if (!$("#cdStage")) return;
    $("#cdPages").textContent = `· ${doc.numPages} page${doc.numPages === 1 ? "" : "s"}`;
    $("#cdPagePick").innerHTML = PLACES.map(p => `<label class="lbl col">${p} place <select class="sel" data-pg="${p}" ${ro() ? "disabled" : ""}>${Array.from({ length: doc.numPages }, (_, i) => `<option value="${i}" ${i === (t.pages[p] ?? 0) ? "selected" : ""}>Page ${i + 1}</option>`).join("")}</select></label>`).join("");
    $$("[data-pg]", view).forEach(s => s.onchange = () => { t.pages[s.dataset.pg] = +s.value; markDirty(); if (s.dataset.pg === place) editor(view); });
    const pic = await pagePicture(t.src, Math.min(t.pages[place] ?? 0, doc.numPages - 1)); if (!$("#cdStage")) return;
    const stage = $("#cdStage");
    stage.style.aspectRatio = `${pic.w} / ${pic.h}`;
    stage.innerHTML = `<img src="${pic.url}" alt="Page of the design" draggable="false"><div class="cd-overlay" id="cdOverlay"></div>`;
    stage.dataset.w = pic.w; stage.dataset.h = pic.h;
    drawBoxes(t);
    new ResizeObserver(() => drawBoxes(t)).observe(stage);
  } catch (e) { console.error(e); const st = $("#cdStage"); if (st) st.innerHTML = `<div class="banner warn">Couldn't open ${esc(srcLabel(t.src))}: ${esc(e.message || e)}. Check that the file is in the website's templates folder.</div>`; }
}

/** The side panel: one card per text box. Edits update the drawing directly (no full redraw). */
function sideBoxes(view, t) {
  const host = $("#cdBoxes"), dis = ro() ? "disabled" : "";
  host.innerHTML = t.boxes.map((b, i) => `<div class="cd-card ${i === sel ? "sel" : ""}" data-card="${i}">
      <div class="cd-card-h"><b>Box ${i + 1}</b><span class="small muted">${esc(fillPattern(b.text, SAMPLE) || "(empty)")}</span>
        <button class="btn danger cd-rm" data-rm="${i}" ${dis} aria-label="Remove box ${i + 1}">Remove</button></div>
      <label class="lbl col">Text <input class="txt" data-f="text" data-i="${i}" maxlength="120" value="${esc(b.text)}" ${dis}></label>
      <div class="cd-chips">${Object.entries(FIELDS).map(([k, n]) => `<button class="chip" data-ins="${k}" data-i="${i}" title="Insert ${esc(n)}" ${dis}>{${k}}</button>`).join("")}</div>
      <div class="cd-grid">
        <label class="lbl col">Font <select class="sel" data-f="font" data-i="${i}" ${dis}>${Object.entries(FONTS).map(([k, f]) => `<option value="${k}" ${k === b.font ? "selected" : ""}>${esc(f.label)}</option>`).join("")}</select></label>
        <label class="lbl col">Size (pt) <input class="txt" type="number" min="4" max="120" step="0.5" data-f="size" data-i="${i}" value="${b.size}" ${dis}></label>
        <label class="lbl col">Smallest size if long <input class="txt" type="number" min="4" max="120" step="0.5" data-f="min" data-i="${i}" value="${b.min ?? ""}" ${dis}></label>
        <label class="lbl col">Colour <input type="color" data-f="color" data-i="${i}" value="${esc(/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#2b192e")}" ${dis}></label>
        <label class="lbl col">Align <select class="sel" data-f="align" data-i="${i}" ${dis}><option value="center" ${b.align !== "left" ? "selected" : ""}>Centre</option><option value="left" ${b.align === "left" ? "selected" : ""}>Left</option></select></label>
        <label class="lbl col">From left (mm) <input class="txt" type="number" step="0.5" data-f="x" data-i="${i}" value="${(b.x * MM).toFixed(1)}" ${dis}></label>
        <label class="lbl col">From top to text line (mm) <input class="txt" type="number" step="0.5" data-f="y" data-i="${i}" value="${(b.y * MM).toFixed(1)}" ${dis}></label>
        <label class="lbl col">Width (mm) <input class="txt" type="number" step="0.5" min="5" data-f="w" data-i="${i}" value="${(b.w * MM).toFixed(1)}" ${dis}></label>
      </div></div>`).join("") || `<p class="small muted">No text boxes yet.</p>`;
  $$("[data-card]", host).forEach(c => c.onclick = e => { if (e.target.closest("input,select,button")) return; selectBox(t, +c.dataset.card); });
  $$("[data-f]", host).forEach(inp => inp.oninput = inp.onchange = () => {
    const b = t.boxes[+inp.dataset.i], f = inp.dataset.f; let v = inp.value;
    if (["size", "min"].includes(f)) v = Math.min(120, Math.max(4, +v || 4));
    if (["x", "y", "w"].includes(f)) v = Math.max(f === "w" ? 10 : 0, (+v || 0) / MM);
    if (f === "text") v = v.slice(0, 120);
    b[f] = v; markDirty(); selectBox(t, +inp.dataset.i, true); drawBoxes(t);
    if (f === "text") { const s = inp.closest(".cd-card").querySelector(".cd-card-h .muted"); s.textContent = fillPattern(b.text, SAMPLE) || "(empty)"; }
  });
  $$("[data-ins]", host).forEach(btn => btn.onclick = () => {
    const i = +btn.dataset.i, inp = host.querySelector(`input[data-f="text"][data-i="${i}"]`), tok = `{${btn.dataset.ins}}`;
    const at = inp.selectionStart ?? inp.value.length; inp.value = (inp.value.slice(0, at) + tok + inp.value.slice(inp.selectionEnd ?? at)).slice(0, 120);
    inp.dispatchEvent(new Event("input")); inp.focus();
  });
  $$("[data-rm]", host).forEach(btn => btn.onclick = () => { t.boxes.splice(+btn.dataset.rm, 1); sel = Math.max(0, sel - 1); markDirty(); editor(view); });
}
function selectBox(t, i, quiet) {
  sel = i;
  $$(".cd-card").forEach(c => c.classList.toggle("sel", +c.dataset.card === i));
  $$(".cd-box").forEach(d => d.classList.toggle("sel", +d.dataset.box === i));
  if (!quiet) { const c = $(`.cd-card[data-card="${i}"]`); if (c) c.scrollIntoView({ block: "nearest" }); }
}
const measure = document.createElement("canvas").getContext("2d");
function fitted(b, text) {
  // same rule as printing: shrink in half-points until the text fits the box (less 6 pt), but not below the smallest size
  const fam = FONTS[b.font]?.css || "KPoppins", size = +b.size || 14, min = Math.min(size, +b.min || size * 0.45);
  let s = size; measure.font = `${s}px ${fam}`;
  while (s > min && measure.measureText(text).width > b.w - 6) { s -= 0.5; measure.font = `${s}px ${fam}`; }
  return s;
}
/** How far below the text's line box its baseline sits, as a share of the font size (from the font's own measurements). */
const baseDrop = {};
function dropFor(fam) {
  if (baseDrop[fam] != null) return baseDrop[fam];
  measure.font = `100px ${fam}`; const m = measure.measureText("Hg");
  const A = (m.fontBoundingBoxAscent || 92) / 100, Dd = (m.fontBoundingBoxDescent || 28) / 100;
  return (baseDrop[fam] = (1 - A + Dd) / 2);
}
function drawBoxes(t) {
  const stage = $("#cdStage"), ov = $("#cdOverlay"); if (!stage || !ov) return;
  const W = +stage.dataset.w, k = stage.clientWidth / W;
  ov.innerHTML = t.boxes.map((b, i) => {
    const text = fillPattern(b.text, SAMPLE), s = fitted(b, text), fam = FONTS[b.font]?.css || "KPoppins", h = (+b.size || 14) * 1.15;
    return `<div class="cd-box ${i === sel ? "sel" : ""}" data-box="${i}" tabindex="${ro() ? -1 : 0}" role="button" aria-label="Box ${i + 1}: ${esc(text)}. Arrow keys move it."
      style="left:${b.x * k}px;top:${(b.y - h) * k}px;width:${b.w * k}px;height:${h * k}px">
      <span class="cd-txt" style="font-family:${fam};font-size:${s * k}px;color:${esc(b.color)};transform:translateY(${dropFor(fam).toFixed(3)}em);${b.align === "left" ? "left:0" : "left:0;right:0;text-align:center"}">${esc(text)}</span>
      <span class="cd-handle" data-handle="${i}" aria-hidden="true"></span></div>`;
  }).join("");
  if (!ro()) $$(".cd-box", ov).forEach(el => wireDrag(t, el, k));
  // the fonts arrive a moment later the first time; redraw once they're in
  if (!drawBoxes.fontsLoaded) { drawBoxes.fontsLoaded = true; Promise.all(Object.values(FONTS).map(f => document.fonts.load(`20px ${f.css}`))).then(() => { for (const k of Object.keys(baseDrop)) delete baseDrop[k]; drawBoxes(t); }).catch(() => {}); }
}
function wireDrag(t, el, k) {
  const i = +el.dataset.box, b = t.boxes[i], stage = $("#cdStage"), W = +stage.dataset.w, H = +stage.dataset.h;
  const sync = () => {
    const h = (+b.size || 14) * 1.15; el.style.left = b.x * k + "px"; el.style.top = (b.y - h) * k + "px"; el.style.width = b.w * k + "px";
    for (const f of ["x", "y", "w"]) { const inp = $(`input[data-f="${f}"][data-i="${i}"]`); if (inp && document.activeElement !== inp) inp.value = (b[f] * MM).toFixed(1); }
  };
  el.onpointerdown = e => {
    e.preventDefault(); selectBox(t, i); el.focus({ preventScroll: true });
    const resize = !!e.target.closest(".cd-handle"), x0 = e.clientX, y0 = e.clientY, ox = b.x, oy = b.y, ow = b.w;
    el.setPointerCapture(e.pointerId);
    el.onpointermove = m => {
      const dx = (m.clientX - x0) / k, dy = (m.clientY - y0) / k;
      if (resize) b.w = Math.round(Math.min(W - b.x, Math.max(10, ow + dx)) * 2) / 2;
      else { b.x = Math.round(Math.min(W - b.w, Math.max(0, ox + dx)) * 2) / 2; b.y = Math.round(Math.min(H, Math.max(4, oy + dy)) * 2) / 2; }
      sync(); markDirty();
    };
    el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; drawBoxes(t); };
  };
  el.onkeydown = e => {
    const step = e.shiftKey ? 5 : 0.5, mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!mv) return; e.preventDefault();
    b.x = Math.min(W - b.w, Math.max(0, b.x + mv[0])); b.y = Math.min(H, Math.max(4, b.y + mv[1])); sync(); markDirty();
  };
}

async function preview(t) {
  const btn = $("#cdPreview"); btn.disabled = true;
  try {
    const one = { templates: { p: t }, assign: { default: "p", groups: {}, lists: {} } };
    const pdf = await makeCertificatesPdf(PLACES.map(p => ({ ...SAMPLE, key: "", grp: "", place: p })), one, { readStorage: D.readCertFile });
    const f = $("#cdFrame"); f.src = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" })); $("#cdDialog").showModal();
  } catch (e) { console.error(e); toast("Couldn't make the preview: " + (e.message || e), "bad"); }
  finally { btn.disabled = false; }
}

// ---------------------------------------------------------------- save
function problems() {
  const out = [], ids = Object.keys(draft.templates);
  if (!ids.length) out.push("Add at least one design.");
  if (ids.length > 30) out.push("Keep it to 30 designs or fewer.");
  for (const [id, t] of Object.entries(draft.templates)) {
    if (!/^[\w-]{1,40}$/.test(id)) out.push(`A design has an invalid id.`);
    if (!String(t.name || "").trim()) out.push("Every design needs a name.");
    if (!isRepoFile(t.src) && !isStorageFile(t.src)) out.push(`${t.name}: the file isn't in the templates folder.`);
    if (!(t.boxes || []).length) out.push(`${t.name}: add at least one text box.`);
    if ((t.boxes || []).length > 20) out.push(`${t.name}: at most 20 text boxes.`);
    if (!(t.boxes || []).some(b => /\{name\}/.test(b.text))) out.push(`${t.name}: no box shows {name}.`);
  }
  if (!draft.templates[draft.assign?.default]) out.push("Choose a default design under 'Which design each event uses'.");
  return out;
}
async function save() {
  const p = problems(); if (p.length) return toast(p.slice(0, 2).join(" "), "bad");
  const btn = $("#cdSave"); btn.disabled = true;
  // keep only known keys, so nothing unexpected is stored
  const clean = {
    templates: Object.fromEntries(Object.entries(draft.templates).map(([id, t]) => [id, { name: String(t.name).slice(0, 80), src: t.src,
      pages: Object.fromEntries(PLACES.map(pl => [pl, Number.isInteger(t.pages?.[pl]) ? t.pages[pl] : 0])),
      boxes: t.boxes.map(b => ({ text: String(b.text).slice(0, 120), x: +(+b.x).toFixed(2), y: +(+b.y).toFixed(2), w: +(+b.w).toFixed(2), size: +b.size, min: +(b.min || 0),
        font: FONTS[b.font] ? b.font : "poppins", color: /^#[0-9a-f]{6}$/i.test(b.color) ? b.color : "#2b192e", align: b.align === "left" ? "left" : "center" })) }])),
    assign: { default: draft.assign.default, groups: { ...(draft.assign.groups || {}) }, lists: { ...(draft.assign.lists || {}) } },
  };
  try {
    await D.saveCertSetup(S.ed, clean);
    dirty = false; draft = clone(clean); savedRef = undefined;   // the live update brings the saved copy back
    $("#cdDirty").hidden = true; toast("Certificate designs saved.", "ok");
  } catch (e) {
    console.error(e); btn.disabled = false;
    toast(/permission/i.test(e.code || e.message || "") ? "Not allowed: the database rules need the update for certificate designs (see ADMIN_GUIDE, 'Certificate designs')." : "Couldn't save: " + (e.message || e), "bad");
  }
}
