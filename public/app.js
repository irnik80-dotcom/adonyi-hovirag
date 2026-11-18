// HÓVIRÁG – egyoldalas felület (vanília JS, nincs build lépés)
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => iso(new Date());
const dotted = (s) => s.replace(/-/g, '. ') + '.';

export function fmt(minutes, signed = false) {
  const m = Math.abs(minutes);
  const sign = minutes < 0 ? '−' : signed && minutes > 0 ? '+' : '';
  return `${sign}${Math.floor(m / 60)} ó ${pad(m % 60)} p`;
}
const hm = (m, signed = false) => `${m < 0 ? '−' : signed && m > 0 ? '+' : ''}${Math.floor(Math.abs(m) / 60)}:${pad(Math.abs(m) % 60)}`;
const balClass = (m) => (m > 0 ? 'pos' : m < 0 ? 'neg' : 'zero');
const hu = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' });
const huFull = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (s) => (s ? hu.format(new Date(s + 'T12:00:00')) : '');
const fullDate = (s) => huFull.format(new Date(s + 'T12:00:00'));
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
const gidsOf = (w) => (w.group_ids ? String(w.group_ids).split(',').map(Number) : []);
const bigTime = (m) => `${m < 0 ? '−' : ''}${Math.floor(Math.abs(m) / 60)}<span>ó</span>${pad(Math.abs(m) % 60)}<span>p</span>`;

function toast(msg, action) {
  $toast.replaceChildren();
  const t = document.createElement('span'); t.textContent = msg; $toast.append(t);
  if (action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label;
    b.onclick = async () => { $toast.hidden = true; await action.run(); };
    $toast.append(b);
  }
  $toast.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => ($toast.hidden = true), action ? 9000 : 2600);
}

async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method: opts.method || 'GET',
      headers: opts.body ? { 'content-type': 'application/json' } : {},
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    const e = new Error('Nincs kapcsolat.'); e.offline = true; throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { location.hash = '#/belepes'; throw new Error('login'); }
  if (!res.ok) {
    const e = new Error(data.error || 'Hiba történt.');
    if (data.needs_confirm) { e.needsConfirm = true; e.workers = data.workers; }
    throw e;
  }
  return data;
}

const ICONS = {
  home: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></svg>',
  doc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  cal: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  flower: '<svg viewBox="20 18 90 100"><path d="M50 114C47 84 38 58 24 34C42 52 52 82 54 114Z" fill="currentColor"/><path d="M54 114C58 86 70 66 84 46C72 68 62 90 58 114Z" fill="currentColor" opacity=".7"/><path d="M54 114C52 76 54 44 64 30C70 22 80 22 80 36" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><ellipse cx="80" cy="38" rx="3.6" ry="4.6" fill="currentColor"/><path d="M80 40C72 52 68 66 72 82C80 70 84 54 80 40Z" fill="currentColor"/><path d="M80 40C66 46 56 62 56 78C68 72 78 58 80 40Z" fill="currentColor" opacity=".8"/><path d="M80 40C94 46 104 62 104 78C92 72 82 58 80 40Z" fill="currentColor" opacity=".8"/><path d="M70 70C74 78 86 78 90 70C86 74 74 74 70 70Z" fill="currentColor" opacity=".55"/></svg>',
};

const nav = (on) => `<nav class="nav">
  <a href="#/" class="${on === 'list' ? 'on' : ''}">${ICONS.home}Áttekintés</a>
  <a href="#/naptar" class="${on === 'cal' ? 'on' : ''}">${ICONS.cal}Naptár</a>
  <a href="#/kimutatas" class="${on === 'rep' ? 'on' : ''}">${ICONS.doc}Kimutatás</a>
  <a href="#/beallitasok" class="${on === 'set' ? 'on' : ''}">${ICONS.gear}Beállítások</a></nav>`;

const KIND = { opening: 'Nyitó egyenleg', credit: 'Túlóra', use: 'Szabadidő', reversal: 'Sztornó' };

/* ---------- offline sor ---------- */

const QKEY = 'hovirag_queue';
const loadQ = () => { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } };
const saveQ = (q) => { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch { /* tele a tárhely vagy tiltott */ } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
let flushing = false;

async function flushQueue() {
  if (flushing || !navigator.onLine) return 0;
  flushing = true;
  let sent = 0;
  try {
    const q = loadQ();
    for (const item of q) {
      if (item.blocked) continue;
      try { await api('/entries', { method: 'POST', body: item.body }); item.done = true; sent++; }
      catch (err) {
        if (err.offline) break;
        if (err.message === 'login') break;
        item.blocked = err.needsConfirm ? 'Már aláírt időszakba esik.' : err.message;
        item.needsConfirm = Boolean(err.needsConfirm);
      }
    }
    saveQ(q.filter((i) => !i.done));
  } finally { flushing = false; }
  if (sent) { toast(`${sent} offline rögzített tétel feltöltve`); route(); }
  return sent;
}

function queueBanner() {
  const q = loadQ();
  if (!q.length) return '';
  return `<div class="queue"><span class="label">Feltöltésre vár (${q.length})</span>${q.map((i, n) => `
    <div class="qi"><span>${esc(i.label)}${i.blocked ? `<br><em class="status warn">${esc(i.blocked)}</em>` : ''}</span>
    ${i.blocked ? `${i.needsConfirm ? `<button class="btn small" data-qok="${n}">Mégis rögzítem</button>` : ''}<button class="btn ghost small" data-qdrop="${n}">Elvetés</button>` : '<em class="status">vár…</em>'}</div>`).join('')}</div>`;
}
function bindQueue() {
  document.querySelectorAll('[data-qok]').forEach((b) => (b.onclick = () => {
    const q = loadQ(); const i = q[+b.dataset.qok]; i.body.confirm_signed = true; delete i.blocked; saveQ(q); flushQueue().then(() => route());
  }));
  document.querySelectorAll('[data-qdrop]').forEach((b) => (b.onclick = () => { const q = loadQ(); q.splice(+b.dataset.qdrop, 1); saveQ(q); route(); }));
}

/* ---------- belépés ---------- */

function viewLogin() {
  $app.innerHTML = `<form class="login" id="f">
    <div class="logo">${ICONS.flower}</div>
    <h1>HÓVIRÁG</h1><p>Adonyi Hóvirág Óvoda</p>
    <div class="field"><label for="pw">Jelszó</label>
    <input class="input" id="pw" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" required autofocus></div>
    <div id="msg"></div>
    <button class="btn" type="submit">Belépés</button></form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api('/login', { method: 'POST', body: { password: document.getElementById('pw').value } }); location.hash = '#/'; }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; btn.disabled = false; }
  };
}

/* ---------- áttekintés ---------- */

function statusLine(w) {
  if (w.signed_to) {
    return w.unsigned
      ? `<span class="status warn">${w.unsigned} új tétel az aláírás óta</span>`
      : `<span class="status ok">Aláírva: ${dotted(w.signed_to)}-ig</span>`;
  }
  return w.last_date ? '<span class="status warn">Még nincs aláírt kimutatás</span>' : '';
}

async function viewList() {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { workers, upcoming, groups, warn_high_min: warnHigh, prev_month_end: prevEnd } = await api('/workers');
  const active = workers.filter((w) => w.active);
  const total = active.reduce((s, w) => s + w.balance, 0);
  const f = { g: 0 };
  const warns = [];
  const missing = active.filter((w) => w.unsigned_old > 0);
  if (missing.length) warns.push(`<a href="#/kimutatas?w=all&from=${prevEnd.slice(0, 8)}01&to=${prevEnd}"><b>${missing.length} dolgozónak</b> nincs aláírt kimutatása ${dotted(prevEnd)}-ig</a>`);
  if (warnHigh > 0) active.filter((w) => w.balance >= warnHigh).forEach((w) => warns.push(`<a href="#/dolgozo/${w.id}"><b>${esc(w.name)}</b>: magas egyenleg (${fmt(w.balance)}), érdemes szabadidőt kiadni</a>`));
  active.filter((w) => w.balance < 0).forEach((w) => warns.push(`<a href="#/dolgozo/${w.id}"><b>${esc(w.name)}</b>: előre kivett szabadidő (${fmt(w.balance)})</a>`));
  const usedGroups = groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id)));
  $app.innerHTML = `
    <div class="hello"><div><small>Adonyi Hóvirág Óvoda</small><h1>Áttekintés</h1></div></div>
    <div class="hero"><small>Összes felhalmozott szabadidő</small>
      <div class="big">${bigTime(total)}</div>
      <div class="pills"><span class="pill">${active.length} dolgozó</span>${upcoming.length ? `<span class="pill">${upcoming.length} tervezett szabadidő</span>` : ''}</div>${ICONS.flower}</div>
    ${warns.length ? `<details class="warnlist" ${warns.length <= 3 ? 'open' : ''}><summary>${warns.length} figyelmeztetés</summary>${warns.join('')}</details>` : ''}
    ${upcoming.length ? `<div class="upcoming"><span class="label">Közelgő szabadidő</span>${upcoming.map((u) => `
      <a href="#/dolgozo/${u.worker_id}"><b>${shortDate(u.date)}</b><span>${esc(u.name)}</span><em>${fmt(-u.minutes)}</em></a>`).join('')}</div>` : ''}
    ${queueBanner()}
    <label class="search">${ICONS.search}<input id="q" type="search" placeholder="Név keresése" aria-label="Név keresése"></label>
    ${usedGroups.length ? `<div class="quick chips" id="gf"><button type="button" data-g="0" aria-pressed="true">Mindenki</button>${usedGroups.map((g) => `<button type="button" data-g="${g.id}">${esc(g.name)}</button>`).join('')}</div>` : ''}
    <div class="list" id="l"></div>
    <a class="fab" href="#/uj">${ICONS.plus}Új tétel</a>${nav('list')}`;
  bindQueue();
  const draw = () => {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const rows = active.filter((w) => w.name.toLowerCase().includes(q) && (!f.g || gidsOf(w).includes(f.g)));
    document.getElementById('l').innerHTML = rows.length ? rows.map((w) => `
      <a class="card" href="#/dolgozo/${w.id}"><div class="ini">${esc(initials(w.name))}</div>
      <div class="who"><b>${esc(w.name)}</b><span>${w.last_date ? `Utolsó: ${fmt(w.last_minutes, true)} · ${shortDate(w.last_date)}` : 'Még nincs tétel'}</span>${statusLine(w)}</div>
      <div class="bal ${balClass(w.balance)}">${fmt(w.balance)}</div></a>`).join('')
      : `<p class="empty">${active.length ? 'Nincs találat.' : 'Még nincs dolgozó. A Beállításokban fel tudod venni őket.'}</p>`;
  };
  document.getElementById('q').oninput = draw;
  document.querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => {
    f.g = +b.dataset.g; document.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
  }));
  draw();
}

/* ---------- új tétel ---------- */

async function viewNew(preselect) {
  const [{ workers, today: srvToday, groups }, { templates }] = await Promise.all([api('/workers'), api('/templates')]);
  const active = workers.filter((w) => w.active);
  if (!active.length) { $app.innerHTML = `<p class="empty">Előbb vegyél fel dolgozót a Beállításokban.</p>${nav('set')}`; return; }
  const st = { kind: 'credit', h: 0, m: 30, multi: false, w: preselect && active.some((w) => w.id === +preselect) ? +preselect : active[0].id, picked: new Set() };
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>Új tétel</h2></div>
    <form id="f">
    <div class="field"><label for="w">Dolgozó</label>
      <select class="input" id="w">${active.map((w) => `<option value="${w.id}">${esc(w.name)} (${fmt(w.balance)})</option>`).join('')}</select>
      <div id="many" hidden>
      <div class="quick chips" id="gch" style="margin:0 0 8px">${groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id))).map((g) => `<button type="button" data-gp="${g.id}">${esc(g.name)} (${active.filter((w) => gidsOf(w).includes(g.id)).length})</button>`).join('')}<button type="button" data-gp="all">Mindenki</button><button type="button" data-gp="none">Törlés</button></div>
      <div class="checks">${active.map((w) => `<label class="check"><input type="checkbox" value="${w.id}"><span>${esc(w.name)}</span></label>`).join('')}</div></div>
      <label class="check multi"><input type="checkbox" id="multi"><span>Több dolgozónak egyszerre</span></label></div>
    <div class="field"><span class="label">Mi történt?</span><div class="seg">
      <button type="button" data-kind="credit" aria-pressed="true">+ Túlóra jóváírása</button>
      <button type="button" data-kind="use" aria-pressed="false">− Szabadidő kivétele</button></div></div>
    <div class="field"><span class="label">Mennyi időt?</span><div class="stepper">
      <div class="step"><input id="h" type="number" inputmode="numeric" min="0" max="999" aria-label="Óra"><div class="u">óra</div>
        <div class="pm"><button type="button" data-d="h-1" aria-label="Óra csökkentése">−</button><button type="button" data-d="h+1" aria-label="Óra növelése">+</button></div></div>
      <div class="step"><input id="m" type="number" inputmode="numeric" min="0" max="59" aria-label="Perc"><div class="u">perc</div>
        <div class="pm"><button type="button" data-d="m-5" aria-label="Perc csökkentése">−</button><button type="button" data-d="m+5" aria-label="Perc növelése">+</button></div></div></div>
      <div class="quick"><button type="button" data-add="15">+15 p</button><button type="button" data-add="30">+30 p</button><button type="button" data-add="60">+1 ó</button><button type="button" data-add="120">+2 ó</button><button type="button" data-add="480">+8 ó</button></div></div>
    <div class="field"><label for="d">Dátum</label><input class="input" id="d" type="date" value="${srvToday}" required>
      <p class="tabs-note" id="dnote" hidden></p></div>
    <div class="field"><label for="n">Megjegyzés</label>
      ${templates.length ? `<div class="quick" id="tpl" style="margin:0 0 8px">${templates.map((t) => `<button type="button" data-t="${esc(t.text)}">${esc(t.text)}</button>`).join('')}</div>` : ''}
      <textarea class="input" id="n" maxlength="300" placeholder="Pl. szülői értekezlet, rendezvény…"></textarea></div>
    <div class="preview"><span id="pl">Új egyenleg</span><span id="pv"></span></div>
    <div id="msg"></div>
    </form><div class="savebar"><button class="btn" id="save" type="submit" form="f">Mentés</button></div>`;
  const $ = (id) => document.getElementById(id);
  $('w').value = st.w;
  const minutes = () => st.h * 60 + st.m;
  const targets = () => (st.multi ? [...st.picked] : [+$('w').value]);
  const sync = () => {
    $('h').value = st.h; $('m').value = st.m;
    const future = st.kind === 'use' && $('d').value > srvToday;
    $('d').max = st.kind === 'credit' ? srvToday : '';
    if (st.kind === 'credit' && $('d').value > srvToday) $('d').value = srvToday;
    $('dnote').hidden = !future; $('dnote').textContent = 'Tervezett szabadidő: az egyenleget csak a kivétel napjától csökkenti.';
    if (st.multi) {
      $('pl').textContent = 'Összesen';
      $('pv').innerHTML = `<b>${st.picked.size} dolgozó × ${fmt(minutes())}</b>`;
      $('save').disabled = minutes() <= 0 || !st.picked.size;
    } else {
      const w = active.find((x) => x.id === +$('w').value);
      const delta = st.kind === 'use' ? -minutes() : minutes();
      const next = future ? w.balance : w.balance + delta;
      $('pl').textContent = future ? 'Egyenleg (nem változik)' : 'Új egyenleg';
      $('pv').innerHTML = future ? `<b>${fmt(w.balance)}</b>` : `<span style="opacity:.6;text-decoration:line-through">${fmt(w.balance)}</span> → <b>${fmt(next)}</b>`;
      $('save').disabled = minutes() <= 0;
    }
    document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.kind === st.kind));
  };
  const setMin = (total) => { total = Math.max(0, total); st.h = Math.floor(total / 60); st.m = total % 60; };
  $('h').oninput = () => { st.h = Math.max(0, Math.floor(+$('h').value) || 0); sync(); };
  $('m').oninput = () => { setMin(st.h * 60 + Math.max(0, Math.floor(+$('m').value) || 0)); sync(); };
  $('w').onchange = sync; $('d').onchange = sync;
  $('multi').onchange = () => {
    st.multi = $('multi').checked; $('many').hidden = !st.multi; $('w').hidden = st.multi;
    if (st.multi && !st.picked.size) { st.picked.add(+$('w').value); $('many').querySelector(`input[value="${$('w').value}"]`).checked = true; }
    sync();
  };
  $('many').onchange = (e) => { if (e.target.type !== 'checkbox') return; const v = +e.target.value; e.target.checked ? st.picked.add(v) : st.picked.delete(v); sync(); };
  const syncChecks = () => document.querySelectorAll('#many input[type=checkbox]').forEach((c) => { c.checked = st.picked.has(+c.value); });
  document.querySelectorAll('[data-gp]').forEach((b) => (b.onclick = () => {
    const k = b.dataset.gp;
    if (k === 'none') st.picked.clear();
    else {
      const members = k === 'all' ? active : active.filter((w) => gidsOf(w).includes(+k));
      const all = members.every((w) => st.picked.has(w.id));
      members.forEach((w) => (all ? st.picked.delete(w.id) : st.picked.add(w.id)));
    }
    syncChecks(); sync();
  }));
  document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { st.kind = b.dataset.kind; sync(); }));
  document.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { setMin(minutes() + +b.dataset.add); sync(); }));
  document.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { $('n').value = $('n').value.trim() ? `${$('n').value.trim()}, ${b.dataset.t}` : b.dataset.t; }));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    const [f, d] = [b.dataset.d[0], +b.dataset.d.slice(1)];
    if (f === 'h') st.h = Math.max(0, st.h + d); else setMin(minutes() + d);
    sync();
  }));
  sync();
  const submit = async (confirm) => {
    const ids = targets();
    const body = { worker_ids: ids, kind: st.kind, minutes: minutes(), date: $('d').value, note: $('n').value, client_id: uuid() };
    const hits = ids.map((id) => active.find((w) => w.id === id)).filter((w) => w && w.signed_to && body.date <= w.signed_to);
    if (hits.length && !confirm) return warnSigned(hits.map((w) => ({ name: w.name, signed_to: w.signed_to })));
    if (confirm) body.confirm_signed = true;
    $('save').disabled = true; $('msg').innerHTML = '';
    try {
      const { ids: created } = await api('/entries', { method: 'POST', body });
      location.hash = ids.length === 1 ? `#/dolgozo/${ids[0]}` : '#/';
      toast(ids.length === 1 ? 'Rögzítve' : `Rögzítve ${ids.length} dolgozónak`, {
        label: 'Visszavonás',
        run: async () => { try { await api('/entries/undo', { method: 'POST', body: { ids: created } }); toast('Visszavonva'); route(); } catch (err) { toast(err.message); } },
      });
    } catch (err) {
      if (err.needsConfirm) { $('save').disabled = false; return warnSigned(err.workers); }
      if (err.offline) {
        const names = ids.map((id) => active.find((w) => w.id === id)?.name).filter(Boolean).join(', ');
        const q = loadQ(); q.push({ body, label: `${names} · ${fmt(st.kind === 'use' ? -minutes() : minutes(), true)} · ${shortDate(body.date)}` }); saveQ(q);
        toast('Nincs kapcsolat: a tétel a telefonon van, a net visszatérésekor feltöltődik.'); location.hash = '#/';
        return;
      }
      $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; $('save').disabled = false;
    }
  };
  const warnSigned = (list) => {
    $('msg').innerHTML = `<div class="warnbox"><b>Ez az időszak már alá van írva.</b><br>${list.map((x) => `${esc(x.name)}: ${dotted(x.signed_to)}-ig`).join('<br>')}
      <br>A mostani tétel az aláírt papír tartalmát megváltoztatná.<div class="row" style="margin-top:10px"><button class="btn small" type="button" id="go">Mégis rögzítem</button><button class="btn ghost small" type="button" id="no">Mégsem</button></div></div>`;
    $('go').onclick = () => submit(true); $('no').onclick = () => { $('msg').innerHTML = ''; };
    $('msg').scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  $('f').onsubmit = (e) => { e.preventDefault(); submit(false); };
}

/* ---------- dolgozó lapja ---------- */

const eduYearStart = (d = new Date()) => `${d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1}-09-01`;

async function viewWorker(id) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { worker, entries, signatures, groups, today: srvToday } = await api(`/workers/${id}/entries`);
  const myGroups = groups.filter((g) => gidsOf(worker).includes(g.id));
  const f = { type: 'all', range: 'all', year: 'edu' };
  const isPlanned = (e) => e.date > srvToday && !e.reversed && e.kind === 'use';
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>${esc(worker.name)}</h2></div>
    ${myGroups.length ? `<div class="quick" style="margin:8px 0 0">${myGroups.map((g) => `<span class="gtag">${esc(g.name)}</span>`).join('')}</div>` : ''}
    <div class="hero"><small>Aktuális egyenleg</small>
      <div class="big">${bigTime(worker.balance)}</div>
      ${worker.planned ? `<div class="pills"><span class="pill">Tervezett: ${fmt(worker.planned, true)}</span></div>` : ''}${ICONS.flower}</div>
    <a class="btn" href="#/uj?w=${worker.id}" style="text-decoration:none">+ Új tétel ennek a dolgozónak</a>
    <div class="row" style="margin-top:10px"><a class="btn ghost small" style="flex:1;text-align:center;text-decoration:none" href="#/kimutatas?w=${worker.id}">Kimutatás</a>
      <button class="btn ghost small" style="flex:1" id="ren" type="button">Átnevezés</button></div>
    <form id="renf" class="row" style="margin-top:10px" hidden><input class="input" id="newname" maxlength="80" value="${esc(worker.name)}" aria-label="Új név" required>
      <button class="btn small" type="submit">Mentés</button></form>
    <div class="yearcard" id="yc"></div>
    ${signatures.length ? `<div class="field"><span class="label">Aláírt kimutatások</span>${signatures.slice(0, 5).map((s) => `<div class="set-item"><span>${dotted(s.from_date)} – ${dotted(s.to_date)}</span><em class="status ok">Aláírva: ${dotted(s.signed_on)}</em></div>`).join('')}</div>` : ''}
    <div class="field"><span class="label">Tételek</span>
      <div class="quick chips" id="ft" style="margin-top:0"><button type="button" data-ft="all" aria-pressed="true">Mind</button><button type="button" data-ft="credit">Túlóra</button><button type="button" data-ft="use">Szabadidő</button><button type="button" data-ft="planned">Tervezett</button></div>
      <div class="quick chips" id="fr"><button type="button" data-fr="all" aria-pressed="true">Mindig</button><button type="button" data-fr="edu">Nevelési év</button><button type="button" data-fr="90">Utolsó 90 nap</button></div></div>
    <div class="entries" id="e"></div>
    <p class="tabs-note">A tételek nem törölhetők, hibát sztornóval lehet javítani.</p>${nav('')}`;

  const drawYear = () => {
    const d = new Date();
    const start = f.year === 'edu' ? eduYearStart(d) : `${d.getFullYear()}-01-01`;
    const live = entries.filter((e) => e.date <= srvToday);
    const before = live.filter((e) => e.date < start || (e.kind === 'opening' && e.date >= start)).reduce((s, e) => s + e.minutes, 0);
    const inRange = live.filter((e) => e.date >= start && e.kind !== 'opening');
    const gained = inRange.reduce((s, e) => s + Math.max(e.minutes, 0), 0);
    const used = inRange.reduce((s, e) => s + Math.max(-e.minutes, 0), 0);
    document.getElementById('yc').innerHTML = `<div class="yhead"><span class="label" style="margin:0">${f.year === 'edu' ? 'Nevelési év' : 'Naptári év'} (${dotted(start)}-tól)</span>
      <span class="quick chips" style="margin:0"><button type="button" data-yr="edu" aria-pressed="${f.year === 'edu'}">Nevelési</button><button type="button" data-yr="cal" aria-pressed="${f.year === 'cal'}">Naptári</button></span></div>
      <div class="ygrid"><div><small>Nyitó</small><b>${fmt(before)}</b></div><div><small>Gyűjtött</small><b class="plus-c">${fmt(gained, true)}</b></div>
      <div><small>Felhasznált</small><b class="minus-c">${used ? fmt(-used) : '0 ó 00 p'}</b></div><div><small>Egyenleg</small><b>${fmt(before + gained - used)}</b></div></div>`;
    document.querySelectorAll('[data-yr]').forEach((b) => (b.onclick = () => { f.year = b.dataset.yr; drawYear(); }));
  };
  const drawEntries = () => {
    const d = new Date();
    const from = f.range === 'edu' ? eduYearStart(d) : f.range === '90' ? iso(new Date(d.getTime() - 90 * 864e5)) : '0000-00-00';
    const rows = entries.filter((e) => e.date >= from && (f.type === 'all' || (f.type === 'credit' && e.kind === 'credit') || (f.type === 'use' && e.kind === 'use' && !isPlanned(e)) || (f.type === 'planned' && isPlanned(e))));
    document.getElementById('e').innerHTML = rows.length ? rows.map((e) => {
      const planned = isPlanned(e);
      return `<div class="entry ${e.kind === 'reversal' || e.reversed ? 'dim' : ''} ${planned ? 'planned' : ''}">
        <div class="bal ${balClass(e.minutes)}">${fmt(e.minutes, true)}</div>
        <div class="meta"><b>${esc(e.note || KIND[e.kind])}</b><span>${fullDate(e.date)} · ${planned ? 'Tervezett szabadidő' : KIND[e.kind]}${e.reversed ? ' · sztornózva' : ''}</span></div>
        <div class="eb"><button class="undo" data-edit="${e.id}" aria-label="Megjegyzés szerkesztése">✎</button>${e.kind !== 'reversal' && !e.reversed ? `<button class="undo" data-rev="${e.id}">${planned ? 'Lemondás' : 'Sztornó'}</button>` : ''}</div>
      </div>`; }).join('') : `<p class="empty">${entries.length ? 'Nincs a szűrésnek megfelelő tétel.' : 'Még nincs tétel.'}</p>`;
    document.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => {
      const e = entries.find((x) => x.id === +b.dataset.edit); const row = b.closest('.entry');
      row.innerHTML = `<form class="editf"><input class="input" maxlength="300" value="${esc(e.note)}" aria-label="Megjegyzés"><div class="ew"></div>
        <div class="row" style="margin-top:8px"><button class="btn small" type="submit">Mentés</button><button class="btn ghost small" type="button" data-cancel>Mégsem</button></div></form>`;
      const form = row.querySelector('form'); let confirm = false;
      row.querySelector('[data-cancel]').onclick = () => drawEntries();
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        try { await api(`/entries/${e.id}`, { method: 'PATCH', body: { note: form.querySelector('input').value, confirm_signed: confirm } }); toast('Megjegyzés módosítva'); viewWorker(id); }
        catch (err) {
          if (err.needsConfirm) { confirm = true; form.querySelector('.ew').innerHTML = '<div class="warnbox">Ez az időszak már alá van írva, a papír szövege megváltozna.</div>'; form.querySelector('button[type=submit]').textContent = 'Mégis módosítom'; }
          else toast(err.message);
        }
      };
      form.querySelector('input').focus();
    }));
    document.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
      const label = b.textContent;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Biztos?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = label; }, 3000); return; }
      try { await api(`/entries/${b.dataset.rev}/reverse`, { method: 'POST', body: {} }); toast('Sztornózva'); viewWorker(id); }
      catch (err) { toast(err.message); }
    }));
  };
  const chips = (sel, attr, key) => document.querySelectorAll(sel).forEach((b) => (b.onclick = () => {
    f[key] = b.dataset[attr]; document.querySelectorAll(sel).forEach((x) => x.setAttribute('aria-pressed', x === b)); drawEntries();
  }));
  chips('[data-ft]', 'ft', 'type'); chips('[data-fr]', 'fr', 'range');
  drawYear(); drawEntries();
  document.getElementById('ren').onclick = () => { const fm = document.getElementById('renf'); fm.hidden = !fm.hidden; if (!fm.hidden) document.getElementById('newname').focus(); };
  document.getElementById('renf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api(`/workers/${id}`, { method: 'PATCH', body: { name: document.getElementById('newname').value } }); toast('Átnevezve'); viewWorker(id); }
    catch (err) { toast(err.message); }
  };
}

/* ---------- beállítások ---------- */

async function viewSettings() {
  const [{ workers, groups, warn_high_min: warnHigh }, { templates }] = await Promise.all([api('/workers'), api('/templates')]);
  const newGroups = new Set();
  $app.innerHTML = `
    <div class="topbar"><h2>Beállítások</h2></div>
    <form id="f"><div class="field"><label for="nm">Új dolgozó</label>
      <input class="input" id="nm" placeholder="Teljes név" maxlength="80" required></div>
      ${groups.length ? `<div class="field"><span class="label">Munkakör</span><div class="quick chips" id="ng" style="margin-top:0">${groups.map((g) => `<button type="button" data-ng="${g.id}" aria-pressed="false">${esc(g.name)}</button>`).join('')}</div></div>` : ''}
      <div class="field"><span class="label">Nyitó egyenleg a papírról</span><div class="row">
        <input class="input" id="oh" type="number" inputmode="numeric" min="0" placeholder="óra" aria-label="Nyitó óra">
        <input class="input" id="om" type="number" inputmode="numeric" min="0" max="59" placeholder="perc" aria-label="Nyitó perc"></div></div>
      <div id="msg"></div><button class="btn" type="submit">Dolgozó felvétele</button></form>
    <div class="field"><span class="label">Dolgozók</span>${workers.map((w) => `
      <div class="set-item col ${w.active ? '' : 'off'}"><div class="top"><span>${esc(w.name)}</span>
      <button class="btn ghost small" data-toggle="${w.id}" data-active="${w.active ? 0 : 1}">${w.active ? 'Inaktívvá tesz' : 'Aktiválás'}</button></div>
      ${groups.length ? `<div class="quick chips" data-wg="${w.id}">${groups.map((g) => `<button type="button" data-g="${g.id}" aria-pressed="${gidsOf(w).includes(g.id)}">${esc(g.name)}</button>`).join('')}</div>` : ''}</div>`).join('')}</div>
    <div class="field"><span class="label">Munkakörök</span>
      ${groups.map((g) => `<div class="set-item"><span>${esc(g.name)}</span><button class="btn ghost small" data-delgrp="${g.id}">Törlés</button></div>`).join('')}
      <form id="gf2" class="row" style="margin-top:8px"><input class="input" id="gn" maxlength="60" placeholder="Új munkakör (pl. Konyhai dolgozó)" required><button class="btn small" type="submit">Hozzáad</button></form>
      <p class="tabs-note">Egy dolgozónak egy munkaköre van, ami bármikor átállítható. A munkakör törlése a dolgozókat nem törli. A korábbi kimutatásokat nem érinti, az új kimutatások mindig a jelenlegi munkakört veszik alapul.</p></div>
    <div class="field"><span class="label">Figyelmeztetés magas egyenlegre</span>
      <form id="wf" class="row"><input class="input" id="wh" type="number" inputmode="numeric" min="0" max="1000" value="${Math.round(warnHigh / 60)}" aria-label="Óra"><button class="btn small" type="submit">Mentés</button></form>
      <p class="tabs-note">Ennyi óra felett az Áttekintésen figyelmeztetést látsz. 0 = kikapcsolva.</p></div>
    <div class="field"><span class="label">Gyakori megjegyzések</span>
      ${templates.map((t) => `<div class="set-item"><span>${esc(t.text)}</span><button class="btn ghost small" data-deltpl="${t.id}" aria-label="Törlés: ${esc(t.text)}">Törlés</button></div>`).join('')}
      <form id="tf" class="row" style="margin-top:8px"><input class="input" id="tt" maxlength="60" placeholder="Új gyors megjegyzés" required><button class="btn small" type="submit">Hozzáad</button></form></div>
    <div class="field"><span class="label">Adatok mentése</span>
      <a class="btn ghost" style="text-decoration:none;margin-top:0" href="/api/backup?format=csv" download>Táblázat letöltése (Excel, CSV)</a>
      <a class="btn ghost" style="text-decoration:none" href="/api/backup" download>Teljes mentés letöltése (JSON)</a>
      <p class="tabs-note">Havonta egyszer érdemes letölteni és egy biztonságos helyre menteni.</p></div>
    <div class="field"><span class="label">Jelszó módosítása</span>
      <form id="pf"><input class="input" id="pc" type="password" autocomplete="current-password" autocapitalize="off" placeholder="Jelenlegi jelszó" required>
      <input class="input" id="pn" type="password" autocomplete="new-password" autocapitalize="off" placeholder="Új jelszó (legalább 8 karakter)" minlength="8" required style="margin-top:8px">
      <input class="input" id="pn2" type="password" autocomplete="new-password" autocapitalize="off" placeholder="Új jelszó mégegyszer" required style="margin-top:8px">
      <div id="pmsg"></div><button class="btn ghost" type="submit">Jelszó módosítása</button></form></div>
    <div class="field"><a class="btn ghost" style="text-decoration:none;margin-top:0" href="#/naplo">Napló megtekintése</a></div>
    <div class="field"><span class="label">Telepítés a telefonra</span>
      <p class="tabs-note" style="margin:0">iPhone: Safari → Megosztás → <b>Főképernyőhöz adás</b>. Android: Chrome → ⋮ menü → <b>Alkalmazás telepítése</b>.</p></div>
    <div class="field"><button class="btn ghost" id="out" type="button">Kijelentkezés</button></div>${nav('set')}`;
  const $ = (id) => document.getElementById(id);
  document.querySelectorAll('[data-ng]').forEach((b) => (b.onclick = () => {
    const v = +b.dataset.ng; const was = newGroups.has(v); newGroups.clear(); if (!was) newGroups.add(v);
    document.querySelectorAll('[data-ng]').forEach((x) => x.setAttribute('aria-pressed', newGroups.has(+x.dataset.ng)));
  }));
  $('f').onsubmit = async (e) => {
    e.preventDefault();
    const min = (+$('oh').value || 0) * 60 + (+$('om').value || 0);
    try { await api('/workers', { method: 'POST', body: { name: $('nm').value, opening_minutes: min, date: today(), group_ids: [...newGroups] } }); toast('Felvéve'); viewSettings(); }
    catch (err) { $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  document.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = async () => {
    await api(`/workers/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.active === '1' } }); viewSettings();
  }));
  document.querySelectorAll('[data-wg] [data-g]').forEach((b) => (b.onclick = async () => {
    const wrap = b.closest('[data-wg]');
    const was = b.getAttribute('aria-pressed') === 'true';
    wrap.querySelectorAll('[data-g]').forEach((x) => x.setAttribute('aria-pressed', x === b && !was));
    const group_ids = [...wrap.querySelectorAll('[aria-pressed=true]')].map((x) => +x.dataset.g);
    try { await api(`/workers/${wrap.dataset.wg}/groups`, { method: 'PUT', body: { group_ids } }); } catch (err) { toast(err.message); viewSettings(); }
  }));
  document.querySelectorAll('[data-delgrp]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Biztos?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Törlés'; }, 3000); return; }
    await api(`/groups/${b.dataset.delgrp}`, { method: 'DELETE' }); viewSettings();
  }));
  $('gf2').onsubmit = async (e) => { e.preventDefault(); try { await api('/groups', { method: 'POST', body: { name: $('gn').value } }); viewSettings(); } catch (err) { toast(err.message); } };
  $('wf').onsubmit = async (e) => { e.preventDefault(); await api('/settings', { method: 'PUT', body: { warn_high_hours: +$('wh').value } }); toast('Mentve'); };
  document.querySelectorAll('[data-deltpl]').forEach((b) => (b.onclick = async () => { await api(`/templates/${b.dataset.deltpl}`, { method: 'DELETE' }); viewSettings(); }));
  $('tf').onsubmit = async (e) => {
    e.preventDefault();
    try { await api('/templates', { method: 'POST', body: { text: $('tt').value } }); viewSettings(); } catch (err) { toast(err.message); }
  };
  $('pf').onsubmit = async (e) => {
    e.preventDefault();
    const msg = $('pmsg');
    if ($('pn').value !== $('pn2').value) { msg.innerHTML = '<div class="err">A két új jelszó nem egyezik.</div>'; return; }
    try {
      await api('/password', { method: 'POST', body: { current: $('pc').value, next: $('pn').value } });
      e.target.reset(); msg.innerHTML = ''; toast('Jelszó módosítva. A többi eszközön újra be kell lépni.');
    } catch (err) { msg.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  $('out').onclick = async () => {
    await api('/logout', { method: 'POST' });
    try { await caches.delete('hovirag-v1'); localStorage.removeItem(QKEY); } catch { /* nincs gyorsítótár */ }
    location.hash = '#/belepes';
  };
}

/* ---------- kimutatás ---------- */

function presetRange(name) {
  const now = new Date(); now.setHours(12);
  if (name === 'month' || name === 'lastmonth') {
    const first = new Date(now.getFullYear(), now.getMonth() - (name === 'lastmonth' ? 1 : 0), 1, 12);
    return [iso(first), iso(new Date(first.getFullYear(), first.getMonth() + 1, 0, 12))];
  }
  const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7) - (name === 'lastweek' ? 7 : 0));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  return [iso(mon), iso(sun)];
}

async function viewReportForm(q) {
  const { workers, groups } = await api('/workers');
  const active = workers.filter((w) => w.active);
  const [f0, t0] = presetRange('month');
  const pre = q && q.get('w');
  const st = { mode: 'sheets' };
  const useGroups = groups.filter((g) => active.some((w) => gidsOf(w).includes(g.id)));
  $app.innerHTML = `
    <div class="topbar"><h2>Kimutatás</h2></div>
    <form id="f">
    <div class="field"><span class="label">Forma</span><div class="seg">
      <button type="button" data-mode="sheets" aria-pressed="true">Dolgozónként (aláírásra)</button>
      <button type="button" data-mode="summary" aria-pressed="false">Összesítő lista</button></div></div>
    <div class="field"><label for="w">Kiknek</label><select class="input" id="w"><option value="all">Mindenki (${active.length} dolgozó)</option>
      ${useGroups.length ? `<optgroup label="Munkakör">${useGroups.map((g) => `<option value="g${g.id}"${pre === `g${g.id}` ? ' selected' : ''}>${esc(g.name)} (${active.filter((w) => gidsOf(w).includes(g.id)).length})</option>`).join('')}</optgroup>` : ''}
      <optgroup label="Dolgozó">${active.map((w) => `<option value="${w.id}"${String(w.id) === pre ? ' selected' : ''}>${esc(w.name)}</option>`).join('')}</optgroup></select></div>
    <div class="field"><span class="label">Időszak</span><div class="quick" style="margin-top:0">
      <button type="button" data-p="week">Ez a hét</button><button type="button" data-p="lastweek">Múlt hét</button>
      <button type="button" data-p="month">Ez a hónap</button><button type="button" data-p="lastmonth">Múlt hónap</button></div></div>
    <div class="field"><div class="row">
      <div style="flex:1;min-width:0"><label class="label" for="from">Ettől</label><input class="input" id="from" type="date" value="${(q && q.get('from')) || f0}" required></div>
      <div style="flex:1;min-width:0"><label class="label" for="to">Eddig</label><input class="input" id="to" type="date" value="${(q && q.get('to')) || t0}" required></div></div></div>
    <div id="msg"></div>
    <button class="btn" type="submit">Kimutatás megnyitása</button></form>
    <p class="tabs-note">A következő oldalon nyomtathatod vagy PDF-be mentheted. Az aláírt példányokat ott jelölheted meg.</p>${nav('rep')}`;
  document.querySelectorAll('[data-mode]').forEach((b) => (b.onclick = () => {
    st.mode = b.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach((x) => x.setAttribute('aria-pressed', x.dataset.mode === st.mode));
  }));
  document.querySelectorAll('[data-p]').forEach((b) => (b.onclick = () => {
    const [f, t] = presetRange(b.dataset.p); document.getElementById('from').value = f; document.getElementById('to').value = t;
  }));
  document.getElementById('f').onsubmit = (e) => {
    e.preventDefault();
    const from = document.getElementById('from').value, to = document.getElementById('to').value, w = document.getElementById('w').value;
    if (from > to) { document.getElementById('msg').innerHTML = '<div class="err">Az „Ettől” dátum nem lehet későbbi, mint az „Eddig”.</div>'; return; }
    location.hash = `#/kimutatas/${st.mode === 'summary' ? 'osszesito' : 'nyomtatas'}?from=${from}&to=${to}&w=${w}`;
  };
}

const stamp = () => new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date());

const sheetHead = (when) => `<div class="ph-head"><div class="org">${ICONS.flower.replace('<svg', '<svg width="38" height="38" style="color:#1E4D3B"')}
  <div><b>Adonyi Hóvirág Óvoda</b><span>Túlóra és szabadidő nyilvántartás</span></div></div>
  <div class="meta">Készült<br><b>${when}</b></div></div>`;

async function viewReportPrint(q) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const r = await api(`/report?from=${q.get('from')}&to=${q.get('to')}&worker=${encodeURIComponent(q.get('w') || 'all')}`);
  const when = stamp();
  const sheet = (s) => {
    let run = s.opening;
    const rows = s.entries.map((e) => { run += e.minutes; return `<tr><td>${dotted(e.date)}</td><td>${esc(e.note || KIND[e.kind])}<br><small>${KIND[e.kind]}</small></td>
      <td class="r ${e.minutes < 0 ? 'minus' : 'plus'}">${fmt(e.minutes, true)}</td><td class="r">${fmt(run)}</td></tr>`; }).join('');
    return `<section class="sheet">${sheetHead(when)}
      <h3>Túlóra-kimutatás</h3>
      <div class="facts"><div><small>Dolgozó</small><b>${esc(s.worker.name)}</b></div><div><small>Időszak</small><b>${dotted(r.from)} – ${dotted(r.to)}</b></div>
        <div><small>Nyitó egyenleg</small><b>${fmt(s.opening)}</b></div></div>
      <table><thead><tr><th>Dátum</th><th>Megjegyzés</th><th class="r">Változás</th><th class="r">Egyenleg</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4" class="none">Az időszakban nem volt tétel.</td></tr>'}</tbody></table>
      <div class="total"><span>Záró egyenleg</span><b>${fmt(s.closing)}</b></div>
      <div class="sig"><div>Dolgozó aláírása</div><div>Munkáltató képviselője</div></div>
      <div class="foot"><span>Az egyenleg szabadidőben értendő.</span><span>Kelt: ………………………</span></div></section>
      <div class="noprint signrow">${s.signed
        ? `<span class="status ok">${esc(s.worker.name)}: aláírva ${dotted(s.signed.signed_on)}</span><button class="btn ghost small" data-unsign="${s.signed.id}">Visszavonás</button>`
        : `<label class="label" for="sd${s.worker.id}">${esc(s.worker.name)}: aláírva</label><input class="input" type="date" id="sd${s.worker.id}" value="${r.today}">
           <button class="btn small" data-sign="${s.worker.id}">Aláírt példány megvan</button>`}</div>`;
  };
  const unsigned = r.sheets.filter((s) => !s.signed);
  const bulk = r.sheets.length > 1 ? `<div class="bulk"><span class="label">Aláírások jelölése</span>${unsigned.length ? `
      <div class="checks">${unsigned.map((s) => `<label class="check"><input type="checkbox" data-bw="${s.worker.id}" checked><span>${esc(s.worker.name)}</span></label>`).join('')}</div>
      <div class="row" style="margin-top:8px"><input class="input" type="date" id="bd" value="${r.today}"><button class="btn small" id="bgo" type="button">Kijelöltek aláírva</button></div>
      <p class="tabs-note" style="margin-top:6px">Vedd ki a pipát attól, aki még nem írta alá.</p>` : '<p class="tabs-note" style="margin:0">Mindenki aláírta ezt a kimutatást.</p>'}</div>` : '';
  $app.innerHTML = `<div class="noprint"><div class="topbar"><a class="back" href="#/kimutatas" aria-label="Vissza">${ICONS.back}</a><h2>${r.sheets.length} oldal · ${esc(r.scope.name)}</h2></div>
    <button class="btn" id="print" type="button" style="margin-bottom:16px">Nyomtatás / PDF mentése</button>${bulk}</div>
    ${r.sheets.length ? r.sheets.map(sheet).join('') : '<p class="empty">Nincs dolgozó a kimutatáshoz.</p>'}`;
  const go = document.getElementById('bgo');
  if (go) go.onclick = async () => {
    const ids = [...document.querySelectorAll('[data-bw]:checked')].map((c) => +c.dataset.bw);
    if (!ids.length) { toast('Jelölj ki legalább egy dolgozót.'); return; }
    try { const { added } = await api('/signatures/bulk', { method: 'POST', body: { worker_ids: ids, from: r.from, to: r.to, signed_on: document.getElementById('bd').value } }); toast(`${added} aláírás rögzítve`); viewReportPrint(q); }
    catch (err) { toast(err.message); }
  };
  document.getElementById('print').onclick = () => window.print();
  document.querySelectorAll('[data-sign]').forEach((b) => (b.onclick = async () => {
    try { await api('/signatures', { method: 'POST', body: { worker_id: +b.dataset.sign, from: r.from, to: r.to, signed_on: document.getElementById('sd' + b.dataset.sign).value } }); toast('Aláírás rögzítve'); viewReportPrint(q); }
    catch (err) { toast(err.message); }
  }));
  document.querySelectorAll('[data-unsign]').forEach((b) => (b.onclick = async () => {
    await api(`/signatures/${b.dataset.unsign}`, { method: 'DELETE' }); toast('Aláírás visszavonva'); viewReportPrint(q);
  }));
}

async function viewReportSummary(q) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const r = await api(`/report?from=${q.get('from')}&to=${q.get('to')}&worker=${encodeURIComponent(q.get('w') || 'all')}`);
  const rows = r.sheets.map((s) => {
    const credit = s.entries.reduce((a, e) => a + Math.max(e.minutes, 0), 0);
    const used = s.entries.reduce((a, e) => a + Math.max(-e.minutes, 0), 0);
    return { name: s.worker.name, opening: s.opening, credit, used, closing: s.closing };
  });
  const sum = (k) => rows.reduce((a, x) => a + x[k], 0);
  const when = stamp();
  $app.innerHTML = `<div class="noprint"><div class="topbar"><a class="back" href="#/kimutatas" aria-label="Vissza">${ICONS.back}</a><h2>Összesítő</h2></div>
    <button class="btn" id="print" type="button" style="margin-bottom:16px">Nyomtatás / PDF mentése</button></div>
    <section class="sheet">${sheetHead(when)}
      <h3>Összesítő kimutatás</h3>
      <div class="facts"><div><small>Időszak</small><b>${dotted(r.from)} – ${dotted(r.to)}</b></div><div><small>Kiknek</small><b>${esc(r.scope.name)}</b></div></div>
      <p class="unit">Az értékek óra:perc formában szerepelnek.</p>
      <table class="sum"><thead><tr><th>Dolgozó</th><th class="r">Nyitó</th><th class="r">Jóváírás</th><th class="r">Kivétel</th><th class="r">Záró</th></tr></thead>
        <tbody>${rows.map((x) => `<tr><td>${esc(x.name)}</td><td class="r">${hm(x.opening)}</td><td class="r plus">${x.credit ? hm(x.credit, true) : '–'}</td><td class="r minus">${x.used ? hm(-x.used) : '–'}</td><td class="r"><b>${hm(x.closing)}</b></td></tr>`).join('')}</tbody>
        <tfoot><tr><td>Összesen</td><td class="r">${hm(sum('opening'))}</td><td class="r">${hm(sum('credit'), true)}</td><td class="r">${hm(-sum('used'))}</td><td class="r">${hm(sum('closing'))}</td></tr></tfoot></table>
      <div class="sig"><div>Készítette</div><div>Óvodavezető</div></div>
      <div class="foot"><span>Az egyenleg szabadidőben értendő.</span><span>Kelt: ………………………</span></div></section>`;
  document.getElementById('print').onclick = () => window.print();
}

/* ---------- naptár ---------- */

async function viewCalendar(q) {
  const now = new Date();
  let month = q.get('m') || `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const { entries, today: srvToday } = await api(`/calendar?month=${month}`);
  const [y, mo] = month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1, 12);
  const days = new Date(y, mo, 0).getDate();
  const lead = (first.getDay() + 6) % 7;
  const byDay = {};
  entries.forEach((e) => { (byDay[e.date] ||= []).push(e); });
  const prev = new Date(y, mo - 2, 1, 12), next = new Date(y, mo, 1, 12);
  const key = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const title = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long' }).format(first);
  const cells = [...Array(lead).fill('<div class="day empty"></div>')];
  for (let d = 1; d <= days; d++) {
    const date = `${month}-${pad(d)}`; const n = (byDay[date] || []).length;
    cells.push(`<button type="button" class="day ${date === srvToday ? 'today' : ''} ${date > srvToday ? 'future' : ''}" data-day="${date}"><span>${d}</span>${n ? `<i>${n}</i>` : ''}</button>`);
  }
  $app.innerHTML = `
    <div class="topbar"><h2>Naptár</h2></div>
    <div class="calhead"><a class="back" href="#/naptar?m=${key(prev)}" aria-label="Előző hónap">${ICONS.back}</a><b>${title}</b>
      <a class="back" href="#/naptar?m=${key(next)}" aria-label="Következő hónap" style="transform:scaleX(-1)">${ICONS.back}</a></div>
    <div class="calgrid"><span>H</span><span>K</span><span>Sze</span><span>Cs</span><span>P</span><span>Szo</span><span>V</span>${cells.join('')}</div>
    <p class="tabs-note">A számok azt mutatják, hányan vesznek ki szabadidőt aznap. Koppints egy napra a részletekért.</p>
    <div id="dd" class="upcoming" hidden></div>${nav('cal')}`;
  const show = (date) => {
    const list = byDay[date] || [];
    const box = document.getElementById('dd'); box.hidden = false;
    box.innerHTML = `<span class="label">${fullDate(date)}</span>${list.length ? list.map((e) => `<a href="#/dolgozo/${e.worker_id}"><b>${fmt(-e.minutes)}</b><span>${esc(e.name)}${e.note ? ` · ${esc(e.note)}` : ''}</span><em></em></a>`).join('') : '<p class="tabs-note" style="margin:0">Ezen a napon senki nem vesz ki szabadidőt.</p>'}`;
  };
  document.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => show(b.dataset.day)));
  if (byDay[srvToday]) show(srvToday);
}

/* ---------- napló ---------- */

async function viewAudit() {
  const { log, workers } = await api('/audit');
  const name = (id) => workers[id] || `#${id}`;
  const when = (s) => new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(s.replace(' ', 'T') + 'Z'));
  const text = (r) => {
    const d = r.detail || {};
    switch (r.action) {
      case 'worker.create': return `Dolgozó felvéve: ${esc(d.name)}${d.opening ? ` (nyitó: ${fmt(d.opening)})` : ''}`;
      case 'worker.update': return d.name !== undefined ? `Átnevezve: ${esc(d.name)}` : `${d.active ? 'Aktiválva' : 'Inaktívvá téve'}: ${esc(name(d.id))}`;
      case 'entry.create': return `Rögzítve: ${(d.workerIds || []).map((x) => esc(name(x))).join(', ')} · ${fmt(d.minutes, true)} · ${dotted(d.date)}${d.overrideSigned ? ' · <b>aláírt időszakba</b>' : ''}${d.offline ? ' · offline rögzítve' : ''}`;
      case 'entry.undo': return `Visszavonva (törölve): ${(d.ids || []).length} tétel`;
      case 'entry.reverse': return `Sztornó rögzítve (#${d.reverses} tételhez)`;
      case 'signature.create': return `Aláírás rögzítve: ${esc(name(d.wid))} · ${dotted(d.from)} – ${dotted(d.to)}`;
      case 'signature.delete': return 'Aláírás visszavonva';
      case 'signature.bulk': return `Aláírások rögzítve: ${d.count} dolgozó · ${dotted(d.from)} – ${dotted(d.to)}`;
      case 'entry.note': return `Megjegyzés módosítva: ${esc(name(d.workerId))} · „${esc(d.from)}” → „${esc(d.to)}”${d.overrideSigned ? ' · <b>aláírt időszakban</b>' : ''}`;
      case 'worker.groups': return `Munkakör módosítva: ${esc(name(d.id))}`;
      case 'group.create': return `Munkakör létrehozva: ${esc(d.name)}`;
      case 'group.delete': return 'Munkakör törölve';
      case 'settings.warn': return `Magas egyenleg jelzése: ${d.hours} óra`;
      case 'password.change': return 'Jelszó módosítva';
      case 'login.fail': return `Sikertelen belépés (${esc(d.ip)})`;
      default: return esc(r.action);
    }
  };
  $app.innerHTML = `<div class="topbar"><a class="back" href="#/beallitasok" aria-label="Vissza">${ICONS.back}</a><h2>Napló</h2></div>
    <p class="tabs-note">Az utolsó ${log.length} esemény, az újabbak elöl.</p>
    <div class="entries">${log.map((r) => `<div class="entry ${r.action === 'login.fail' ? 'dim' : ''}"><div class="meta"><b>${text(r)}</b><span>${when(r.at)}</span></div></div>`).join('') || '<p class="empty">Még nincs bejegyzés.</p>'}</div>${nav('set')}`;
}

/* ---------- útvonalak ---------- */

async function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const q = new URLSearchParams(query);
  try {
    if (path === '/belepes') return viewLogin();
    $app.classList.toggle('wide', path.startsWith('/kimutatas/'));
    if (path === '/uj') return await viewNew(q.get('w'));
    if (path === '/kimutatas') return await viewReportForm(q);
    if (path === '/kimutatas/nyomtatas') return await viewReportPrint(q);
    if (path === '/kimutatas/osszesito') return await viewReportSummary(q);
    if (path === '/beallitasok') return await viewSettings();
    if (path === '/naptar') return await viewCalendar(q);
    if (path === '/naplo') return await viewAudit();
    const m = path.match(/^\/dolgozo\/(\d+)$/);
    if (m) return await viewWorker(m[1]);
    return await viewList();
  } catch (err) {
    if (err.message !== 'login') $app.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}
addEventListener('hashchange', route);

const $net = document.getElementById('net');
const setNet = () => { if ($net) $net.hidden = navigator.onLine; };
addEventListener('online', () => { setNet(); flushQueue(); });
addEventListener('offline', setNet);
setNet();
route().then(() => flushQueue());

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* nem baj, online továbbra is működik */ });
