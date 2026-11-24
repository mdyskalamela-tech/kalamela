// Everything that talks to Firebase lives in this file. The screens never call Firebase directly.
// Firebase SDK version is pinned; update it here only after testing (see README.md).

import { FIREBASE_CONFIG, OWNER_EMAIL } from "./config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection, onSnapshot,
         getDoc, getDocs, setDoc, deleteDoc, writeBatch, serverTimestamp, query, where, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

export const configured = !String(FIREBASE_CONFIG.apiKey || "").includes("PASTE") && OWNER_EMAIL !== "OWNER_EMAIL";

let app, auth, db;
if (configured) {
  app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  // Keeps a copy on each laptop so a short Wi-Fi drop doesn't stop work; saves are sent when the connection returns.
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
}

const lower = e => String(e || "").trim().toLowerCase();
let myEmail = "", myName = "";
export const ownerEmail = () => lower(OWNER_EMAIL);

// ---------------------------------------------------------------- sign-in
export function onUser(cb) {
  if (!configured) { cb(null); return () => {}; }
  return onAuthStateChanged(auth, u => {
    myEmail = u ? lower(u.email) : ""; myName = u ? String(u.displayName || myEmail).slice(0, 80) : "";
    cb(u ? { email: myEmail, name: u.displayName || myEmail, photo: u.photoURL || "", verified: u.emailVerified } : null);
  });
}
export async function signIn() {
  const p = new GoogleAuthProvider(); p.setCustomParameters({ prompt: "select_account" });
  await signInWithPopup(auth, p);
}
export const signOutUser = () => signOut(auth);

/** The signed-in person's role: admin | chief | tabulator | viewer | "" (no access). */
export async function myRole() {
  if (!myEmail) return "";
  if (myEmail === ownerEmail()) return "admin";
  try { const d = await getDoc(doc(db, "users", myEmail)); return d.exists() ? d.data().role || "" : ""; }
  catch { return ""; }
}

// ---------------------------------------------------------------- live data
const edPath = (ed, ...p) => ["editions", ed, ...p].join("/");
export function watchEditions(cb, err) {
  return onSnapshot(collection(db, "editions"), s => cb(s.docs.map(d => ({ id: d.id, ...d.data() }))), err);
}
export function watchEdition(ed, cb, err) {
  return onSnapshot(doc(db, "editions", ed), d => cb(d.exists() ? { id: d.id, ...d.data() } : null), err);
}
/** Live map of a sub-collection of one edition (lists, marks, intake, decisions, centres, participants, payments). */
export function watchCol(ed, name, cb, err) {
  return onSnapshot(collection(db, edPath(ed, name)), { includeMetadataChanges: false }, s => {
    const m = new Map(); for (const d of s.docs) m.set(d.id, d.data());
    cb(m, s.metadata);
  }, err);
}
/** Live role of the signed-in person, so a role change or removal applies at once. */
export function watchMyRole(cb) {
  if (!myEmail || myEmail === ownerEmail()) return () => {};
  return onSnapshot(doc(db, "users", myEmail), d => cb(d.exists() ? d.data().role || "" : ""), () => cb(""));
}
export function watchUsers(cb, err) {
  return onSnapshot(collection(db, "users"), s => cb(s.docs.map(d => ({ email: d.id, ...d.data() }))), err);
}

// ---------------------------------------------------------------- tabulation writes
/**
 * Save one entry's marks and add an audit record in the same step.
 * kind "marks": marks or attendance changed – this person becomes the one who entered them, and verification is cleared.
 * kind "verify": only the Verified tick changed – who entered the marks is kept; a different person must verify.
 */
export async function saveMarks(ed, eid, data, kind = "marks", rev = 1) {
  const clean = {
    att: data.att || "Present",
    j1: (data.j1 || []).map(v => (v === undefined ? null : v)),
    j2: (data.j2 || []).map(v => (v === undefined ? null : v)),
    j1w: data.j1w ?? null, j2w: data.j2w ?? null,
    by: myEmail, at: serverTimestamp(), rev,
  };
  if (kind === "verify") {
    clean.enteredBy = data.enteredBy || ""; clean.enteredName = data.enteredName || "";
    if (data.enteredAt) clean.enteredAt = data.enteredAt;
    clean.ver = !!data.ver;
    if (clean.ver) { clean.verBy = myEmail; clean.verName = myName; clean.verAt = serverTimestamp(); }
  } else {
    clean.enteredBy = myEmail; clean.enteredName = myName; clean.enteredAt = serverTimestamp(); clean.ver = false;
  }
  const b = writeBatch(db);
  b.set(doc(db, edPath(ed, "marks"), eid), clean);
  b.set(doc(collection(db, edPath(ed, "audit"))), { kind: kind === "verify" ? (clean.ver ? "verify" : "unverify") : "marks", eid, att: clean.att, j1: clean.j1, j1w: clean.j1w, j2: clean.j2, j2w: clean.j2w, ver: clean.ver, by: myEmail, at: serverTimestamp() });
  await b.commit();
}
export const saveIntake = (ed, key, data) => setDoc(doc(db, edPath(ed, "intake"), key), { rec: !!data.rec, time: data.time || "", venue: data.venue || "", op: data.op || "", by: myEmail, name: myName });
export async function saveDecision(ed, eid, data) {
  const b = writeBatch(db);
  if (data) b.set(doc(db, edPath(ed, "decisions"), eid), { pos: data.pos, note: data.note || "", by: myEmail, name: myName });
  else b.delete(doc(db, edPath(ed, "decisions"), eid));
  b.set(doc(collection(db, edPath(ed, "audit"))), { kind: "decision", eid, pos: data ? data.pos : "cleared", note: data ? data.note || "" : "", by: myEmail, at: serverTimestamp() });
  await b.commit();
}
/** Results announced: lock an event so its marks and decisions can't change. */
export async function lockEvent(ed, key) {
  const b = writeBatch(db);
  b.set(doc(db, edPath(ed, "locks"), key), { by: myEmail, name: myName, at: serverTimestamp() });
  b.set(doc(collection(db, edPath(ed, "audit"))), { kind: "lock", eid: key, by: myEmail, at: serverTimestamp() });
  await b.commit();
}
/** Unlock an announced event to correct a mistake. The reason is kept in the audit log. */
export async function unlockEvent(ed, key, reason) {
  const b = writeBatch(db);
  b.delete(doc(db, edPath(ed, "locks"), key));
  b.set(doc(collection(db, edPath(ed, "audit"))), { kind: "unlock", eid: key, detail: String(reason || "").slice(0, 300), by: myEmail, at: serverTimestamp() });
  await b.commit();
}
export const savePayment = (ed, centreId, data) => setDoc(doc(db, edPath(ed, "payments"), centreId), { ...data, by: myEmail });

// ---------------------------------------------------------------- admin writes
async function commitInChunks(ops, size = 120) {
  for (let i = 0; i < ops.length; i += size) {
    const b = writeBatch(db);
    for (const op of ops.slice(i, i + size)) op.del ? b.delete(op.ref) : b.set(op.ref, op.data, op.merge ? { merge: true } : {});
    await b.commit();
  }
}
export const createEdition = (id, data) => setDoc(doc(db, "editions", id), { ...data, phase: "setup", createdBy: myEmail, createdAt: serverTimestamp() });
export const updateEdition = (id, data) => setDoc(doc(db, "editions", id), { ...data, updatedBy: myEmail, updatedAt: serverTimestamp() }, { merge: true });
export async function logAdmin(ed, kind, detail) {
  try { await setDoc(doc(collection(db, edPath(ed, "audit"))), { kind, detail: String(detail).slice(0, 500), by: myEmail, at: serverTimestamp() }); } catch {}
}

/** Replace one Centre's form: its record and all its participants. */
export async function importCentre(ed, centreId, centreDoc, participants) {
  const old = await getDocs(query(collection(db, edPath(ed, "participants")), where("centreId", "==", centreId)));
  const keep = new Set(participants.map(p => p.pid));
  const ops = [];
  for (const d of old.docs) if (!keep.has(d.id)) ops.push({ del: true, ref: d.ref });
  for (const p of participants) ops.push({ ref: doc(db, edPath(ed, "participants"), p.pid), data: p });
  ops.push({ ref: doc(db, edPath(ed, "centres"), centreId), data: { ...centreDoc, importedBy: myEmail, importedAt: serverTimestamp() } });
  await commitInChunks(ops, 60);
}
export async function removeCentre(ed, centreId) {
  const old = await getDocs(query(collection(db, edPath(ed, "participants")), where("centreId", "==", centreId)));
  await commitInChunks([...old.docs.map(d => ({ del: true, ref: d.ref })), { del: true, ref: doc(db, edPath(ed, "centres"), centreId) }]);
}
/** Write chest numbers onto participants and (re)write every event list. */
export async function writeBuild(ed, chestUpdates, lists, removeKeys) {
  const ops = [];
  for (const [pid, chest] of chestUpdates) ops.push({ ref: doc(db, edPath(ed, "participants"), pid), data: { chest }, merge: true });
  for (const L of lists) ops.push({ ref: doc(db, edPath(ed, "lists"), L.key), data: L });
  for (const k of removeKeys) ops.push({ del: true, ref: doc(db, edPath(ed, "lists"), k) });
  await commitInChunks(ops, 150);
}
/** Delete practice marks, intake ticks, decisions and announcement locks (allowed only in setup). The audit trail is kept. */
export async function clearPractice(ed) {
  const ops = [];
  for (const name of ["marks", "intake", "decisions", "locks", "att"]) {
    const s = await getDocs(collection(db, edPath(ed, name)));
    for (const d of s.docs) ops.push({ del: true, ref: d.ref });
  }
  const st = await getDocs(collection(db, "public", ed, "status"));   // stage progress shown to participants
  for (const d of st.docs) ops.push({ del: true, ref: d.ref });
  await commitInChunks(ops, 400);
  await logAdmin(ed, "clear", `Practice data cleared: ${ops.length} records`);
  return ops.length;
}
// ---------------------------------------------------------------- schedule, stages and the public participant page
/** The schedule: stages/rooms and, for each event list, its stage, running order and planned start. */
export function watchPlan(ed, cb, err) {
  return onSnapshot(doc(db, edPath(ed, "plan"), "main"), d => cb(d.exists() ? d.data() : null), err);
}
export async function savePlan(ed, plan) {
  await setDoc(doc(db, edPath(ed, "plan"), "main"), { stages: plan.stages, items: plan.items, by: myEmail, at: serverTimestamp() });
  await logAdmin(ed, "schedule", `Schedule saved: ${plan.stages.length} stages/rooms, ${Object.keys(plan.items).length} events placed`);
}
/** Publish what participants may see: event names, stages, times and which chest numbers are in which events.
 *  No names, dates of birth, phone numbers or photos. */
export async function publishPublic(ed, meta, chests) {
  const metaRef = doc(db, "public", ed), old = await getDoc(metaRef);
  const before = old.exists() ? old.data().chests || [] : [], now = Object.keys(chests);
  const ops = [{ ref: metaRef, data: { ...meta, chests: now, updatedAt: serverTimestamp() } }, { ref: doc(db, "public", "current"), data: { ed } }];
  for (const c of now) ops.push({ ref: doc(db, "public", ed, "chest", c), data: { events: chests[c] } });
  for (const c of before) if (!chests[c]) ops.push({ del: true, ref: doc(db, "public", ed, "chest", c) });
  await commitInChunks(ops, 400);
  return now.length;
}
/** Live stage progress for each event list: pending, active (on stage now) or done. Public, so participants see it. */
export function watchStageStatus(ed, cb, err) {
  return onSnapshot(collection(db, "public", ed, "status"), s => { const m = new Map(); for (const d of s.docs) m.set(d.id, d.data()); cb(m); }, err);
}
export async function setStageStatus(ed, key, status) {
  const b = writeBatch(db);
  b.set(doc(db, "public", ed, "status", key), { status, at: serverTimestamp() });
  b.set(doc(collection(db, edPath(ed, "audit"))), { kind: "stage", eid: key, detail: status, by: myEmail, at: serverTimestamp() });
  await b.commit();
}
/** Stage attendance for one entry: "Present", "Absent", or null to set it back to pending. */
export async function saveAtt(ed, eid, att) {
  const ref = doc(db, edPath(ed, "att"), eid);
  if (att) await setDoc(ref, { att, by: myEmail, name: myName, at: serverTimestamp() }); else await deleteDoc(ref);
}

export async function readAudit(ed, n = 300) {
  const s = await getDocs(query(collection(db, edPath(ed, "audit")), orderBy("at", "desc"), limit(n)));
  return s.docs.map(d => d.data());
}
export async function readAll(ed) {
  const out = {};
  for (const name of ["centres", "participants", "lists", "marks", "intake", "decisions", "locks", "payments", "att", "plan"]) {
    const s = await getDocs(collection(db, edPath(ed, name)));
    out[name] = Object.fromEntries(s.docs.map(d => [d.id, d.data()]));
  }
  return out;
}
export const setUser = (email, data) => setDoc(doc(db, "users", lower(email)), { ...data, updatedBy: myEmail, updatedAt: serverTimestamp() });
export const removeUser = email => deleteDoc(doc(db, "users", lower(email)));
