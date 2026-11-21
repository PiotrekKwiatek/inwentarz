// Inwentarz hufca: wersja testowa na GitHub Pages + Firebase.
// Ten plik podstawia pod aplikację to samo API bazy, które miała w Claude (collection/doc/where/orderBy/limit/onSnapshot).
import { initializeApp } from "./vendor/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "./vendor/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, query, where, orderBy, limit, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc, FieldPath, writeBatch } from "./vendor/firebase-firestore.js";
import CFG from "./config.js";

const gate = document.getElementById("inw-gate"), gMsg = document.getElementById("inw-gate-msg"), gBtn = document.getElementById("inw-login");
const say = (t, err) => { if (gMsg){ gMsg.textContent = t || ""; gMsg.classList.toggle("err", !!err); } };

if (!CFG || !CFG.apiKey || String(CFG.apiKey).includes("WSTAW")){
  say("Strona nie ma jeszcze ustawień bazy (plik config.js).", true);
  if (gBtn) gBtn.disabled = true;
  throw new Error("Brak konfiguracji Firebase");
}

const app = initializeApp(CFG);
const auth = getAuth(app);
let fs;
try { fs = initializeFirestore(app, {ignoreUndefinedProperties:true, localCache:persistentLocalCache({tabManager:persistentMultipleTabManager()})}); }
catch (_){ fs = initializeFirestore(app, {ignoreUndefinedProperties:true}); }

/* ---------- błędy w kodach, których używa aplikacja ---------- */
function mapErr(e){
  const raw = String((e && e.code) || "unavailable").replace(/^(firestore|auth)\//, "").replace(/-/g, "_");
  const code = ["not_found", "permission_denied", "failed_precondition", "out_of_range"].includes(raw) ? "invalid_argument" : raw === "deadline_exceeded" ? "unavailable" : raw;
  const o = new Error((e && e.message) || code); o.code = code; o.raw = raw; return o;
}
const guard = async fn => { try { return await fn(); } catch (e){ throw mapErr(e); } };

/* ---------- migawki ---------- */
const wDoc = s => ({id:s.id, exists:s.exists(), data:() => (s.exists() ? s.data() : undefined), metadata:s.metadata});
const wQDoc = d => ({id:d.id, exists:true, data:() => d.data(), metadata:d.metadata});
const wQuery = q => ({docs:q.docs.map(wQDoc), size:q.size, empty:q.empty, metadata:q.metadata,
  docChanges:() => q.docChanges().map(c => ({type:c.type, oldIndex:c.oldIndex, newIndex:c.newIndex, doc:wQDoc(c.doc)}))});

/* ---------- update: zagnieżdżone obiekty scalane (jak w Claude), tablice zastępowane ---------- */
const isPlain = v => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
function flat(o, pre, out){
  for (const [k, v] of Object.entries(o)){
    if (v === undefined) continue;
    if (isPlain(v) && Object.keys(v).length) flat(v, [...pre, k], out);
    else out.push(new FieldPath(...pre, k), v);
  }
  return out;
}

/* ---------- referencje ---------- */
function mkQuery(path, cons){
  const q = () => query(collection(fs, path), ...cons);
  return {
    where:(f, op, v) => mkQuery(path, [...cons, where(f, op, v)]),
    orderBy:(f, dir) => mkQuery(path, [...cons, orderBy(f, dir || "asc")]),
    limit:n => mkQuery(path, [...cons, limit(n)]),
    get:() => guard(async () => wQuery(await getDocs(q()))),
    onSnapshot:(next, err) => onSnapshot(q(), s => next(wQuery(s)), e => { const m = mapErr(e); if (err) err(m); else console.warn(path, m); })
  };
}
function mkColl(path){
  return Object.assign(mkQuery(path, []), {
    path,
    doc:id => mkDoc(id ? `${path}/${id}` : doc(collection(fs, path)).path),
    add:async data => { const r = mkDoc(doc(collection(fs, path)).path); await r.set(data); return r; }
  });
}
function mkDoc(path){
  const ref = doc(fs, path);
  return {
    id:ref.id, path,
    get:() => guard(async () => wDoc(await getDoc(ref))),
    set:data => guard(() => setDoc(ref, data)),
    update:data => guard(async () => { const a = flat(data || {}, [], []); if (a.length) await updateDoc(ref, ...a); }),
    delete:() => guard(() => deleteDoc(ref)),
    onSnapshot:(next, err) => onSnapshot(ref, s => next(wDoc(s)), e => { const m = mapErr(e); if (err) err(m); else console.warn(path, m); }),
    collection:sub => mkColl(`${path}/${sub}`)
  };
}
const db = {doc:mkDoc, collection:mkColl};

/* ---------- użytkownik ---------- */
let U = null;
const names = new Map();
const user = {
  me:async () => ({id:U.uid, name:U.displayName || (U.email || "").split("@")[0] || "Ja"}),
  id:async () => U.uid,
  can:async () => true,
  canEdit:async () => true,
  isOwner:async () => false,
  profiles:async ids => {
    const out = {};
    await Promise.all(ids.map(async id => {
      if (!names.has(id)){ try { const s = await getDoc(doc(fs, "users", id)); names.set(id, s.exists() ? s.data() : null); } catch (_){ names.set(id, null); } }
      const p = names.get(id); if (p && p.name) out[id] = {name:p.name};
    }));
    return out;
  }
};

/* ---------- zdjęcia: w osobnej kolekcji, ładowane leniwie ---------- */
const blobs = new Map();
const toDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
const assets = {
  upload:async b => {
    const d = await toDataURL(b);
    if (d.length > 900000) throw Object.assign(new Error("Zdjęcie jest za duże."), {code:"invalid_argument"});
    const r = doc(collection(fs, "blobs"));
    await guard(() => setDoc(r, {d, at:new Date().toISOString(), by:U ? U.uid : ""}));
    blobs.set(r.id, d);
    return {id:r.id};
  },
  delete:async id => { blobs.delete(id); try { await deleteDoc(doc(fs, "blobs", id)); } catch (_){} }
};
window.INW_BLOB = id => blobs.get(id) || "";
async function fillImg(img){
  const id = img.dataset.blob; if (!id || img.dataset.done) return;
  img.dataset.done = "1";
  if (!blobs.has(id)){ try { const s = await getDoc(doc(fs, "blobs", id)); blobs.set(id, s.exists() ? s.data().d : ""); } catch (_){ blobs.set(id, ""); } }
  const d = blobs.get(id); if (d) img.src = d; else img.classList.add("no-blob");
}
new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes){ if (n.nodeType !== 1) continue; if (n.matches && n.matches("img[data-blob]")) fillImg(n); if (n.querySelectorAll) n.querySelectorAll("img[data-blob]").forEach(fillImg); } })
  .observe(document.documentElement, {childList:true, subtree:true});

/* ---------- pobieranie plików ---------- */
const downloads = {
  save:async ({filename, data, type}) => {
    const b = data instanceof Blob ? data : new Blob([data], {type:type || "text/plain;charset=utf-8"});
    const u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = filename || "plik"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 10000);
  }
};

/* ---------- logowanie ---------- */
const provider = new GoogleAuthProvider();
provider.setCustomParameters({prompt:"select_account"});
if (gBtn) gBtn.addEventListener("click", async () => {
  gBtn.disabled = true; say("Otwieram okno logowania Google…");
  try { await signInWithPopup(auth, provider); }
  catch (e){
    const c = String(e && e.code || "");
    if (c.includes("popup-blocked") || c.includes("operation-not-supported")){ say("Przekierowuję do Google…"); try { await signInWithRedirect(auth, provider); return; } catch (e2){ e = e2; } }
    gBtn.disabled = false;
    say(c.includes("popup-closed") || c.includes("cancelled-popup") ? "Logowanie przerwane. Spróbuj jeszcze raz." : c.includes("unauthorized-domain") ? "Ta strona nie jest jeszcze dopuszczona w ustawieniach logowania Firebase (Authorized domains)." : `Nie udało się zalogować (${c || "błąd"}).`, true);
  }
});
getRedirectResult(auth).catch(e => say(`Nie udało się zalogować (${(e && e.code) || "błąd"}).`, true));

let started = false;
onAuthStateChanged(auth, async u => {
  if (!u){ U = null; if (gate) gate.hidden = false; document.body.classList.add("gated"); if (gBtn) gBtn.disabled = false; return; }
  U = u;
  if (gate) gate.hidden = true; document.body.classList.remove("gated");
  const name = u.displayName || (u.email || "").split("@")[0] || "Ja";
  names.set(u.uid, {name});
  setDoc(doc(fs, "users", u.uid), {name, seen:new Date().toISOString()}, {merge:true}).catch(() => {});
  const ab = document.getElementById("acct-btn");
  if (ab){ ab.hidden = false; ab.textContent = name.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase() || "?"; ab.title = name; }
  if (!started){ started = true; window.__inwResolve({db, user, assets, downloads}); }
});

/* ---------- konto, wylogowanie, dane przykładowe ---------- */
const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
window.INW_ACCT = () => {
  if (!U || typeof openSheet !== "function") return;
  const empty = typeof S !== "undefined" && S.rooms && S.rooms.size === 0;
  openSheet("Konto", `<div class="f">
    <div><p class="sheet-lead">${esc(U.displayName || "")}</p><p class="meta">${esc(U.email || "")}</p></div>
    <p class="hint">To wersja testowa. Wszyscy testujący pracują na tych samych, przykładowych danych i widzą swoje zmiany na żywo. Śmiało klikaj.</p>
    <div class="form-actions">${empty ? `<button type="button" class="btn" data-act="inw-seed">Wczytaj przykładowe dane</button>` : ""}<span class="spacer"></span><button type="button" class="btn" data-act="inw-signout">Wyloguj</button></div>
  </div>`, null, {noFocus:true});
};
window.INW_SIGNOUT = async () => { try { await signOut(auth); } finally { location.reload(); } };
function rel(v){
  if (typeof v !== "string") return v;
  const m = /^([@#])(-?\d+)$/.exec(v); if (!m) return v;
  const d = new Date(); d.setDate(d.getDate() + +m[2]);
  if (m[1] === "@"){ d.setHours(10, 0, 0, 0); return d.toISOString(); }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const relAll = v => Array.isArray(v) ? v.map(relAll) : isPlain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relAll(x)])) : rel(v);
window.INW_SEED = async btn => {
  if (!U) return;
  if (typeof S !== "undefined" && S.rooms && S.rooms.size && !confirm("W spisie są już dane. Dopisać do nich przykładowe?")) return;
  if (btn){ btn.disabled = true; btn.textContent = "Wczytuję…"; }
  try {
    const res = await fetch("./demo.json", {cache:"no-store"}); const {docs} = await res.json();
    for (let k = 0; k < docs.length; k += 400){
      const b = writeBatch(fs);
      for (const x of docs.slice(k, k + 400)) b.set(doc(fs, x.path), relAll(x.data));
      await b.commit();
    }
    if (typeof closeSheet === "function") closeSheet();
    if (typeof toast === "function") toast(`Wczytano przykładowe dane (${docs.length} wpisów).`);
  } catch (e){
    if (btn){ btn.disabled = false; btn.textContent = "Wczytaj przykładowe dane"; }
    if (typeof toast === "function") toast(`Nie udało się wczytać danych (${mapErr(e).raw}).`, "err");
  }
};
