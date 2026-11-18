// Hóvirág Túlóra – egyoldalas felület (vanília JS, nincs build lépés)
const $app = document.getElementById('app');
const $toast = document.getElementById('toast');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

export function fmt(minutes, signed = false) {
  const m = Math.abs(minutes);
  const sign = minutes < 0 ? '−' : signed && minutes > 0 ? '+' : '';
  return `${sign}${Math.floor(m / 60)} ó ${pad(m % 60)} p`;
}
const balClass = (m) => (m > 0 ? 'pos' : m < 0 ? 'neg' : 'zero');
const hu = new Intl.DateTimeFormat('hu-HU', { month: 'short', day: 'numeric' });
const huFull = new Intl.DateTimeFormat('hu-HU', { year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (s) => (s ? hu.format(new Date(s + 'T12:00:00')) : '');
const fullDate = (s) => huFull.format(new Date(s + 'T12:00:00'));
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

function toast(msg) {
  $toast.textContent = msg; $toast.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => ($toast.hidden = true), 2600);
}

async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: opts.body ? { 'content-type': 'application/json' } : {},
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== '/login') { location.hash = '#/belepes'; throw new Error('login'); }
  if (!res.ok) throw new Error(data.error || 'Hiba történt.');
  return data;
}

const ICONS = {
  people: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.6 3-5.4 6-5.4s5.4 1.8 6 5.4"/><path d="M16 5.2a3.2 3.2 0 010 5.6M18.5 14.8c1.4.8 2.2 2.4 2.5 5.2"/></svg>',
  gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  flower: '<svg viewBox="0 0 100 110" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M50 110C50 70 52 40 62 14"/><path d="M62 14C42 22 38 52 54 60C70 52 76 28 62 14Z" fill="currentColor"/><path d="M50 100C34 92 22 80 16 62C34 66 46 80 50 100Z" fill="currentColor"/></svg>',
};

const nav = (on) => `<nav class="nav">
  <a href="#/" class="${on === 'list' ? 'on' : ''}">${ICONS.people}Dolgozók</a>
  <a href="#/beallitasok" class="${on === 'set' ? 'on' : ''}">${ICONS.gear}Beállítások</a></nav>`;

/* ---------- nézetek ---------- */

function viewLogin() {
  $app.innerHTML = `<form class="login" id="f">
    <h1>Hóvirág Túlóra</h1><p>Adonyi Hóvirág Óvoda</p>
    <div class="field"><label for="pw">Jelszó</label>
    <input class="input" id="pw" type="password" autocomplete="current-password" required autofocus></div>
    <div id="msg"></div>
    <button class="btn" type="submit">Belépés</button></form>`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button'); btn.disabled = true;
    try { await api('/login', { method: 'POST', body: { password: document.getElementById('pw').value } }); location.hash = '#/'; }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; btn.disabled = false; }
  };
}

async function viewList() {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { workers } = await api('/workers');
  const active = workers.filter((w) => w.active);
  const total = active.reduce((s, w) => s + w.balance, 0);
  const t = Math.abs(total);
  $app.innerHTML = `
    <div class="hello"><div><small>Szia, Mónika</small><h1>Dolgozók</h1></div><div class="avatar" aria-hidden="true">M</div></div>
    <div class="hero"><small>Összes felhalmozott szabadidő</small>
      <div class="big">${total < 0 ? '−' : ''}${Math.floor(t / 60)}<span>ó</span>${pad(t % 60)}<span>p</span></div>
      <div class="pills"><span class="pill">${active.length} dolgozó</span></div>${ICONS.flower}</div>
    <label class="search">${ICONS.search}<input id="q" type="search" placeholder="Név keresése" aria-label="Név keresése"></label>
    <div class="list" id="l"></div>
    <a class="fab" href="#/uj">${ICONS.plus}Új tétel</a>${nav('list')}`;
  const draw = () => {
    const q = document.getElementById('q').value.trim().toLowerCase();
    const rows = active.filter((w) => w.name.toLowerCase().includes(q));
    document.getElementById('l').innerHTML = rows.length ? rows.map((w) => `
      <a class="card" href="#/dolgozo/${w.id}"><div class="ini">${esc(initials(w.name))}</div>
      <div class="who"><b>${esc(w.name)}</b><span>${w.last_date ? `Utolsó: ${fmt(w.last_minutes, true)} · ${shortDate(w.last_date)}` : 'Még nincs tétel'}</span></div>
      <div class="bal ${balClass(w.balance)}">${fmt(w.balance)}</div></a>`).join('')
      : `<p class="empty">${active.length ? 'Nincs találat.' : 'Még nincs dolgozó. A Beállításokban fel tudod venni őket.'}</p>`;
  };
  document.getElementById('q').oninput = draw; draw();
}

async function viewNew(preselect) {
  const { workers } = await api('/workers');
  const active = workers.filter((w) => w.active);
  if (!active.length) { $app.innerHTML = `<p class="empty">Előbb vegyél fel dolgozót a Beállításokban.</p>${nav('set')}`; return; }
  const st = { kind: 'credit', h: 0, m: 30, w: preselect && active.some((w) => w.id === +preselect) ? +preselect : active[0].id };
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>Új tétel</h2></div>
    <form id="f">
    <div class="field"><label for="w">Dolgozó</label><select class="input" id="w">${active.map((w) => `<option value="${w.id}">${esc(w.name)} (${fmt(w.balance)})</option>`).join('')}</select></div>
    <div class="field"><span class="label">Mi történt?</span><div class="seg">
      <button type="button" data-kind="credit" aria-pressed="true">+ Túlóra jóváírása</button>
      <button type="button" data-kind="use" aria-pressed="false">− Szabadidő kivétele</button></div></div>
    <div class="field"><span class="label">Mennyi időt?</span><div class="stepper">
      <div class="step"><input id="h" type="number" inputmode="numeric" min="0" max="999" aria-label="Óra"><div class="u">óra</div>
        <div class="pm"><button type="button" data-d="h-1" aria-label="Óra csökkentése">−</button><button type="button" data-d="h+1" aria-label="Óra növelése">+</button></div></div>
      <div class="step"><input id="m" type="number" inputmode="numeric" min="0" max="59" aria-label="Perc"><div class="u">perc</div>
        <div class="pm"><button type="button" data-d="m-5" aria-label="Perc csökkentése">−</button><button type="button" data-d="m+5" aria-label="Perc növelése">+</button></div></div></div>
      <div class="quick"><button type="button" data-add="15">+15 p</button><button type="button" data-add="30">+30 p</button><button type="button" data-add="60">+1 ó</button><button type="button" data-add="120">+2 ó</button></div></div>
    <div class="field"><label for="d">Dátum</label><input class="input" id="d" type="date" value="${today()}" required></div>
    <div class="field"><label for="n">Megjegyzés</label><textarea class="input" id="n" maxlength="300" placeholder="Pl. szülői értekezlet, rendezvény…"></textarea></div>
    <div class="preview"><span>Új egyenleg</span><span id="pv"></span></div>
    <div id="msg"></div>
    <button class="btn" id="save" type="submit">Mentés</button></form>${nav('')}`;
  const $ = (id) => document.getElementById(id);
  $('w').value = st.w;
  const minutes = () => st.h * 60 + st.m;
  const sync = () => {
    $('h').value = st.h; $('m').value = st.m;
    const w = active.find((x) => x.id === +$('w').value);
    const next = w.balance + (st.kind === 'use' ? -minutes() : minutes());
    $('pv').innerHTML = `<span style="opacity:.6;text-decoration:line-through">${fmt(w.balance)}</span> → <b>${fmt(next)}</b>`;
    $('save').disabled = minutes() <= 0;
    document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.kind === st.kind));
  };
  const setMin = (total) => { total = Math.max(0, total); st.h = Math.floor(total / 60); st.m = total % 60; };
  $('h').oninput = () => { st.h = Math.max(0, Math.floor(+$('h').value) || 0); sync(); };
  $('m').oninput = () => { setMin(st.h * 60 + (Math.max(0, Math.floor(+$('m').value) || 0))); sync(); };
  $('w').onchange = sync;
  document.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => { st.kind = b.dataset.kind; sync(); }));
  document.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => { setMin(minutes() + +b.dataset.add); sync(); }));
  document.querySelectorAll('[data-d]').forEach((b) => (b.onclick = () => {
    const [f, d] = [b.dataset.d[0], +b.dataset.d.slice(1)];
    if (f === 'h') st.h = Math.max(0, st.h + d); else setMin(minutes() + d);
    sync();
  }));
  sync();
  $('f').onsubmit = async (e) => {
    e.preventDefault(); $('save').disabled = true;
    try {
      await api('/entries', { method: 'POST', body: { worker_id: +$('w').value, kind: st.kind, minutes: minutes(), date: $('d').value, note: $('n').value } });
      toast('Rögzítve'); location.hash = `#/dolgozo/${$('w').value}`;
    } catch (err) { $('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; $('save').disabled = false; }
  };
}

async function viewWorker(id) {
  $app.innerHTML = '<p class="empty">Betöltés…</p>';
  const { worker, entries } = await api(`/workers/${id}/entries`);
  const KIND = { opening: 'Nyitó egyenleg', credit: 'Túlóra', use: 'Szabadidő', reversal: 'Sztornó' };
  $app.innerHTML = `
    <div class="topbar"><a class="back" href="#/" aria-label="Vissza">${ICONS.back}</a><h2>${esc(worker.name)}</h2></div>
    <div class="hero"><small>Aktuális egyenleg</small>
      <div class="big">${worker.balance < 0 ? '−' : ''}${Math.floor(Math.abs(worker.balance) / 60)}<span>ó</span>${pad(Math.abs(worker.balance) % 60)}<span>p</span></div>${ICONS.flower}</div>
    <a class="btn" href="#/uj?w=${worker.id}" style="text-decoration:none">+ Új tétel ennek a dolgozónak</a>
    <div class="entries" id="e">${entries.length ? entries.map((e) => `
      <div class="entry ${e.kind === 'reversal' || e.reversed ? 'dim' : ''}">
        <div class="bal ${balClass(e.minutes)}">${fmt(e.minutes, true)}</div>
        <div class="meta"><b>${esc(e.note || KIND[e.kind])}</b><span>${fullDate(e.date)} · ${KIND[e.kind]}${e.reversed ? ' · sztornózva' : ''}</span></div>
        ${e.kind !== 'reversal' && !e.reversed ? `<button class="undo" data-rev="${e.id}">Sztornó</button>` : ''}
      </div>`).join('') : '<p class="empty">Még nincs tétel.</p>'}</div>
    <p class="tabs-note">A tételek nem törölhetők, hibát sztornóval lehet javítani.</p>${nav('')}`;
  document.querySelectorAll('[data-rev]').forEach((b) => (b.onclick = async () => {
    if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Biztos?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Sztornó'; }, 3000); return; }
    try { await api(`/entries/${b.dataset.rev}/reverse`, { method: 'POST', body: {} }); toast('Sztornózva'); viewWorker(id); }
    catch (err) { toast(err.message); }
  }));
}

async function viewSettings() {
  const { workers } = await api('/workers');
  $app.innerHTML = `
    <div class="topbar"><h2>Beállítások</h2></div>
    <form id="f"><div class="field"><label for="nm">Új dolgozó</label>
      <input class="input" id="nm" placeholder="Teljes név" maxlength="80" required></div>
      <div class="field"><span class="label">Nyitó egyenleg a papírról</span><div class="row">
        <input class="input" id="oh" type="number" inputmode="numeric" min="0" placeholder="óra" aria-label="Nyitó óra">
        <input class="input" id="om" type="number" inputmode="numeric" min="0" max="59" placeholder="perc" aria-label="Nyitó perc"></div></div>
      <div id="msg"></div><button class="btn" type="submit">Dolgozó felvétele</button></form>
    <div class="field"><span class="label">Dolgozók</span>${workers.map((w) => `
      <div class="set-item ${w.active ? '' : 'off'}"><span>${esc(w.name)}</span>
      <button class="btn ghost small" data-toggle="${w.id}" data-active="${w.active ? 0 : 1}">${w.active ? 'Inaktívvá tesz' : 'Aktiválás'}</button></div>`).join('')}</div>
    <div class="field"><button class="btn ghost" id="out" type="button">Kijelentkezés</button></div>${nav('set')}`;
  document.getElementById('f').onsubmit = async (e) => {
    e.preventDefault();
    const min = (+document.getElementById('oh').value || 0) * 60 + (+document.getElementById('om').value || 0);
    try { await api('/workers', { method: 'POST', body: { name: document.getElementById('nm').value, opening_minutes: min, date: today() } }); toast('Felvéve'); viewSettings(); }
    catch (err) { document.getElementById('msg').innerHTML = `<div class="err">${esc(err.message)}</div>`; }
  };
  document.querySelectorAll('[data-toggle]').forEach((b) => (b.onclick = async () => {
    await api(`/workers/${b.dataset.toggle}`, { method: 'PATCH', body: { active: b.dataset.active === '1' } }); viewSettings();
  }));
  document.getElementById('out').onclick = async () => { await api('/logout', { method: 'POST' }); location.hash = '#/belepes'; };
}

/* ---------- útvonalak ---------- */

async function route() {
  const [path, query = ''] = location.hash.slice(1).split('?');
  const q = new URLSearchParams(query);
  try {
    if (path === '/belepes') return viewLogin();
    if (path === '/uj') return await viewNew(q.get('w'));
    if (path === '/beallitasok') return await viewSettings();
    const m = path.match(/^\/dolgozo\/(\d+)$/);
    if (m) return await viewWorker(m[1]);
    return await viewList();
  } catch (err) {
    if (err.message !== 'login') $app.innerHTML = `<div class="err">${esc(err.message)}</div>`;
  }
}
addEventListener('hashchange', route);
route();
