// Wypożyczalnia Hufca: wersja testowa, w której każdy ma własną kopię danych w swojej przeglądarce.
// Podstawia pod aplikację to samo API bazy, które ma w Claude (collection/doc/where/orderBy/limit/onSnapshot).
(() => {
  const IDB = "inwentarz-test", KEY = "db", NAME_KEY = "inw-test-seen";
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
  const myName = () => "Tester";
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
  const standalone = () => window.navigator.standalone === true || (window.matchMedia && matchMedia("(display-mode: standalone)").matches);
  const downloads = {
    save:async ({filename, data, type}) => {
      const b = data instanceof Blob ? data : new Blob([data], {type:type || "text/plain;charset=utf-8"});
      // w aplikacji z ekranu początkowego iPhone'a pobieranie bywa kłopotliwe, więc używamy „Udostępnij” (Zachowaj w Plikach, Drukuj, AirDrop)
      if (standalone() && navigator.canShare){
        try { const f = new File([b], filename || "plik", {type:b.type || "application/octet-stream"}); if (navigator.canShare({files:[f]})){ await navigator.share({files:[f], title:filename}); return; } }
        catch (e){ if (e && e.name === "AbortError") return; }
      }
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
  function showAcct(){ const ab = document.getElementById("acct-btn"); if (ab){ ab.hidden = false; ab.textContent = "Test"; ab.title = "Wersja testowa"; ab.setAttribute("aria-label", "Wersja testowa: informacje i powrót do danych przykładowych"); } }
  let started = false;
  async function start(){
    if (started) return; started = true;
    showAcct();
    window.__inwResolve({db, user, assets, downloads});
    let first = false; try { first = !localStorage.getItem(NAME_KEY); localStorage.setItem(NAME_KEY, "1"); } catch (_){}
    if (first) setTimeout(() => { if (typeof toast === "function") toast("Wersja testowa: dane są przykładowe, a Twoje zmiany widzisz tylko Ty. Śmiało klikaj."); }, 1200);
  }
  async function boot(){
    idb = await openIdb();
    let saved = await idbGet(KEY);
    if (!saved){ try { saved = JSON.parse(localStorage.getItem("inw-test-db") || "null"); } catch (_){ saved = null; } }
    if (saved && isPlain(saved) && Object.keys(saved).length) Object.assign(store, saved);
    else { try { await seed(); persist(); } catch (e){ console.warn("demo", e); } }
    start();
  }

  /* ---------- konto: imię i powrót do danych przykładowych ---------- */
  window.INW_ACCT = () => {
    if (typeof openSheet !== "function") return;
    openSheet("Wersja testowa", `<div class="f">
      <p class="lead">Dane są przykładowe. Twoje zmiany zapisują się tylko w tej przeglądarce: inni testujący ich nie widzą, a Ty nie widzisz ich zmian.</p>
      <p class="hint">„Zacznij od nowa” usuwa Twoje zmiany i przywraca dane przykładowe.</p>
      ${standalone() ? `<p class="hint">Działa jako aplikacja z ekranu początkowego, także bez internetu.</p>` : `<div class="inw-install"><b>Ikona na telefonie</b><p class="hint">iPhone: w Safari stuknij Udostępnij <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="vertical-align:-3px"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M12 3v12M8 7l4-4 4 4M7 11H6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg> i wybierz „Do ekranu początkowego”. Android: w Chrome menu ⋮ → „Zainstaluj aplikację”. Aplikacja z ikony ma osobne dane niż przeglądarka.</p></div>`}
      <div class="form-actions"><button type="button" class="btn btn-ghost btn-danger" data-act="inw-reset">Zacznij od nowa</button><span class="spacer"></span><button type="button" class="btn btn-primary" data-act="close-sheet">Zamknij</button></div>
    </div>`, null, {noFocus:true});
  };
  window.INW_RESET = async () => {
    if (!confirm("Usunąć wszystkie Twoje zmiany i wrócić do danych przykładowych?")) return;
    for (const k of Object.keys(store)) delete store[k];
    await seed(); await idbPut(KEY, store); try { localStorage.removeItem("inw-test-db"); localStorage.removeItem("inw-cart"); localStorage.removeItem("inw-cart-draft"); } catch (_){}
    location.reload();
  };

  /* ---------- aplikacja na ekranie telefonu ---------- */
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")){
    window.addEventListener("load", () => { navigator.serviceWorker.register("./sw.js").catch(e => console.warn("sw", e)); });
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (_){}
  const syncThemeColor = () => {
    const m = document.querySelector('meta[name="theme-color"]'); if (!m) return;
    const v = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim(); if (v) m.setAttribute("content", v);
  };
  new MutationObserver(syncThemeColor).observe(document.documentElement, {attributes:true, attributeFilter:["data-theme"]});
  window.addEventListener("load", syncThemeColor);
  window.INW_STANDALONE = standalone;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
