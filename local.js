// Inwentarz hufca: wersja testowa, w której każdy ma własną kopię danych w swojej przeglądarce.
// Podstawia pod aplikację to samo API bazy, które ma w Claude (collection/doc/where/orderBy/limit/onSnapshot).
(() => {
  const IDB = "inwentarz-test", KEY = "db", NAME_KEY = "inw-test-name";
  const store = {};                       // path -> document
  const subs = new Set();
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const isPlain = v => v !== null && typeof v === "object" && !Array.isArray(v);
  const colOf = p => p.split("/").slice(0, -1).join("/");
  const mkErr = (code, msg) => Object.assign(new Error(msg || code), {code});

  /* ---------- zapis w IndexedDB (z zapasem w localStorage) ---------- */
  let idb = null;
  const openIdb = () => new Promise(res => {
    try { const r = indexedDB.open(IDB, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => res(null); }
    catch (_){ res(null); }
  });
  const idbGet = k => new Promise(res => { if (!idb) return res(undefined); try { const r = idb.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); } catch (_){ res(undefined); } });
  const idbPut = (k, v) => new Promise(res => { if (!idb) return res(false); try { const t = idb.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => res(true); t.onerror = () => res(false); } catch (_){ res(false); } });
  let saveT = null;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(async () => { const ok = await idbPut(KEY, store); if (!ok){ try { localStorage.setItem("inw-test-db", JSON.stringify(store)); } catch (_){} } }, 150); };
  window.addEventListener("pagehide", () => { if (saveT){ clearTimeout(saveT); idbPut(KEY, store); } });

  /* ---------- zapytania ---------- */
  const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  const test = (v, op, x) => op === "==" ? v === x : op === "!=" ? v !== x : op === "<" ? v < x : op === "<=" ? v <= x : op === ">" ? v > x : op === ">=" ? v >= x : op === "in" ? Array.isArray(x) && x.includes(v) : op === "not-in" ? Array.isArray(x) && !x.includes(v) : op === "array-contains" ? Array.isArray(v) && v.includes(x) : false;
  const docSnap = path => { const ex = path in store; return {id:path.split("/").pop(), exists:ex, data:() => ex ? clone(store[path]) : undefined, metadata:{fromCache:false, hasPendingWrites:false}}; };
  function run(col, f, o, l){
    let ids = Object.keys(store).filter(p => colOf(p) === col);
    for (const [k, op, x] of f) ids = ids.filter(p => test(store[p][k], op, x));
    if (o){ const [k, d] = o; ids.sort((a, b) => { const A = store[a][k], B = store[b][k]; if (A === undefined && B === undefined) return 0; if (A === undefined) return 1; if (B === undefined) return -1; const r = cmp(A, B); return d === "desc" ? -r : r; }); }
    else ids.sort();
    if (l) ids = ids.slice(0, l);
    const docs = ids.map(docSnap);
    return {docs, size:docs.length, empty:!docs.length, metadata:{fromCache:false, hasPendingWrites:false}, docChanges:() => docs.map((d, i) => ({type:"added", oldIndex:-1, newIndex:i, doc:d}))};
  }
  const notify = () => { persist(); setTimeout(() => subs.forEach(s => s()), 0); };
  function mkQuery(col, f, o, l){
    return {
      where:(k, op, x) => mkQuery(col, [...f, [k, op, x]], o, l),
      orderBy:(k, d) => mkQuery(col, f, [k, d || "asc"], l),
      limit:n => { if (!(n >= 1 && n <= 1000)) throw mkErr("invalid_argument", "limit 1-1000"); return mkQuery(col, f, o, n); },
      get:async () => run(col, f, o, l),
      onSnapshot:next => { const s = () => next(run(col, f, o, l)); subs.add(s); setTimeout(s, 0); return () => subs.delete(s); }
    };
  }
  const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  function merge(a, b){ const o = {...a}; for (const [k, v] of Object.entries(b)){ if (v === undefined) continue; o[k] = isPlain(v) && isPlain(a[k]) ? merge(a[k], v) : clone(v); } return o; }
  const strip = v => Array.isArray(v) ? v.map(strip) : isPlain(v) ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, strip(x)])) : v;
  function mkDoc(path){
    return {
      id:path.split("/").pop(), path,
      get:async () => docSnap(path),
      set:async d => { if (!isPlain(d)) throw mkErr("invalid_argument", "dokument musi być obiektem"); store[path] = strip(clone(d)); notify(); },
      update:async d => { if (!(path in store)) throw mkErr("invalid_argument", "brak dokumentu " + path); store[path] = merge(store[path], d || {}); notify(); },
      delete:async () => { delete store[path]; notify(); },
      onSnapshot:next => { const s = () => next(docSnap(path)); subs.add(s); setTimeout(s, 0); return () => subs.delete(s); },
      collection:sub => mkColl(`${path}/${sub}`)
    };
  }
  function mkColl(col){ return Object.assign(mkQuery(col, [], null, 0), {path:col, doc:id => mkDoc(`${col}/${id || rid()}`), add:async d => { const r = mkDoc(`${col}/${rid()}`); await r.set(d); return r; }}); }
  const db = {doc:mkDoc, collection:mkColl};

  /* ---------- użytkownik ---------- */
  const ME = "tester";
  const myName = () => { try { return (localStorage.getItem(NAME_KEY) || "").trim(); } catch (_){ return ""; } };
  const user = {
    me:async () => ({id:ME, name:myName() || "Tester"}),
    id:async () => ME, can:async () => true, canEdit:async () => true, isOwner:async () => true,
    profiles:async ids => Object.fromEntries(ids.map(i => [i, {name:i === ME ? (myName() || "Tester") : i === "demo" ? "dane przykładowe" : "ktoś"}]))
  };

  /* ---------- zdjęcia ---------- */
  const toDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
  const assets = {
    upload:async b => { const id = rid(); store["blobs/" + id] = {d:await toDataURL(b), at:new Date().toISOString()}; notify(); return {id}; },
    delete:async id => { delete store["blobs/" + id]; notify(); }
  };
  window.INW_BLOB = id => (store["blobs/" + id] || {}).d || "";
  const fillImg = img => { const d = window.INW_BLOB(img.dataset.blob); if (d && img.getAttribute("src") !== d) img.src = d; else if (!d) img.classList.add("no-blob"); };
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

  /* ---------- dane przykładowe (daty liczone od dziś) ---------- */
  function rel(v){
    if (typeof v !== "string") return v;
    const m = /^([@#])(-?\d+)$/.exec(v); if (!m) return v;
    const d = new Date(); d.setDate(d.getDate() + +m[2]);
    if (m[1] === "@"){ d.setHours(10, 0, 0, 0); return d.toISOString(); }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  const relAll = v => Array.isArray(v) ? v.map(relAll) : isPlain(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, relAll(x)])) : rel(v);
  async function seed(){
    const res = await fetch("./demo.json", {cache:"no-store"}); const {docs} = await res.json();
    for (const x of docs) store[x.path] = relAll(x.data);
  }

  /* ---------- start ---------- */
  const gate = () => document.getElementById("inw-gate");
  const initials = n => (n || "T").split(/\s+/).map(w => w[0] || "").join("").slice(0, 2).toUpperCase() || "T";
  function showAcct(){ const ab = document.getElementById("acct-btn"); if (ab){ ab.hidden = false; ab.textContent = initials(myName() || "Tester"); ab.title = myName() || "Tester"; } }
  let started = false;
  async function start(){
    if (started) return; started = true;
    const g = gate(); if (g) g.hidden = true; document.body.classList.remove("gated");
    showAcct();
    window.__inwResolve({db, user, assets, downloads});
  }
  async function boot(){
    idb = await openIdb();
    let saved = await idbGet(KEY);
    if (!saved){ try { saved = JSON.parse(localStorage.getItem("inw-test-db") || "null"); } catch (_){ saved = null; } }
    if (saved && isPlain(saved) && Object.keys(saved).length) Object.assign(store, saved);
    else { try { await seed(); persist(); } catch (e){ console.warn("demo", e); } }
    const g = gate(), inp = document.getElementById("inw-name"), go = document.getElementById("inw-go");
    if (myName() || !g){ start(); return; }
    g.hidden = false; document.body.classList.add("gated");
    const enter = () => { try { localStorage.setItem(NAME_KEY, (inp && inp.value.trim()) || "Tester"); } catch (_){} start(); };
    if (go) go.addEventListener("click", enter);
    if (inp) inp.addEventListener("keydown", e => { if (e.key === "Enter"){ e.preventDefault(); enter(); } });
  }

  /* ---------- konto: imię i powrót do danych przykładowych ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({"&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"}[c]));
  window.INW_ACCT = () => {
    if (typeof openSheet !== "function") return;
    openSheet("Wersja testowa", `<form class="f" novalidate>
      <p class="hint">Twoje zmiany zapisują się tylko w tej przeglądarce. Inni testujący ich nie widzą, a Ty nie widzisz ich zmian.</p>
      <div class="field"><label for="inw-n2">Twoje imię <span class="opt">(widać je w historii)</span></label><input id="inw-n2" maxlength="40" value="${esc(myName())}" placeholder="np. Piotr"></div>
      <div class="form-actions"><button type="button" class="btn btn-ghost btn-danger" data-act="inw-reset">Zacznij od nowa</button><span class="spacer"></span><button type="button" class="btn" data-act="close-sheet">Zamknij</button><button type="submit" class="btn btn-primary">Zapisz</button></div>
    </form>`, w => {
      const f = w.querySelector("form");
      f.addEventListener("submit", e => { e.preventDefault(); try { localStorage.setItem(NAME_KEY, w.querySelector("#inw-n2").value.trim() || "Tester"); } catch (_){} location.reload(); });
    }, {noFocus:true});
  };
  window.INW_RESET = async () => {
    if (!confirm("Usunąć wszystkie Twoje zmiany i wrócić do danych przykładowych?")) return;
    for (const k of Object.keys(store)) delete store[k];
    await seed(); await idbPut(KEY, store); try { localStorage.removeItem("inw-test-db"); localStorage.removeItem("inw-cart"); localStorage.removeItem("inw-cart-draft"); } catch (_){}
    location.reload();
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
