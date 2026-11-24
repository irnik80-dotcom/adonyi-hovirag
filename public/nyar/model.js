// Nyári beosztás – tiszta logika (böngészőben, Web Workerben és Node-tesztben is fut).
// Dátumok mindenhol 'ÉÉÉÉ-HH-NN' szövegként; a számítás UTC-ben történik, így nincs időzóna-csúszás.

export const SHIFTS = ['DE', 'DU'];           // kétműszakos munkakör
export const ALL_CODES = ['DE', 'DU', 'D'];      // D: egy műszakos munkakör napi beosztása (pl. pedagógiai asszisztens)
export const SHIFT_LABEL = { DE: 'Délelőtt', DU: 'Délután', D: 'Napi' };
// A munkakör műszakjai: kétműszakos (DE + DU) vagy egy műszakos (D)
export const shiftsOf = (role) => (role?.single ? ['D'] : SHIFTS);
export const minSum = (role, key = 'min') => shiftsOf(role).reduce((a, s) => a + (role[key]?.[s] ?? role.min[s] ?? 0), 0);
export const WEEKDAY_SHORT = ['V', 'H', 'K', 'Sze', 'Cs', 'P', 'Szo'];
export const MONTH_NAMES = ['január', 'február', 'március', 'április', 'május', 'június', 'július', 'augusztus', 'szeptember', 'október', 'november', 'december'];
export const ABSENCE_KINDS = { szabadsag: 'Szabadság', beteg: 'Betegállomány', pluszora: 'Szabadnap plusz órából', egyeb: 'Egyéb távollét' };
// Működési mód: 'mindenki' – aki nincs távol, dolgozik (nincs pihenőnap); 'pihenovel' – heti blokkok pihenőnapokkal
export const MODES = { mindenki: 'Aki nincs távol, dolgozik (nincs pihenőnap)', pihenovel: 'Heti munkablokkok pihenőnapokkal' };
export const allWork = (plan) => (plan.mode || 'mindenki') === 'mindenki';
export const ABSENCE_STATUS = { igenyelt: 'Igényelt', jovahagyott: 'Jóváhagyott' };

// A fő alkalmazás munkakör-csoportjainak alapértelmezett megfeleltetése és induló létszáma (4.1. pont, nem végleges).
const ROLE_PRESETS = [
  { match: /pedag[oó]gus|óvodapedag|ovodapedag/i, not: /asszisztens/i, label: 'Óvodapedagógus', min: { DE: 2, DU: 1 } },
  { match: /asszisztens/i, label: 'Pedagógiai asszisztens', single: true, min: { DE: 2, DU: 1, D: 3 } },
  { match: /dajk/i, label: 'Dajka', min: { DE: 2, DU: 2 } },
];

export const DEFAULT_SETTINGS = {
  alternatives: 3,
  colors: { DE: '#FFE08A', DU: '#A9D3F5', D: '#F3C9A8', szabadsag: '#9FD89A', beteg: '#F4A7A7', pluszora: '#B8E3E0', egyeb: '#D9C3F0', piheno: '#FFFFFF', hetvege: '#D6D6D6', zarva: '#BDBDBD' },
  abbr: { DE: 'DE', DU: 'DU', D: 'D', szabadsag: 'SZ', beteg: 'B', pluszora: 'PL', egyeb: 'T', piheno: '', hetvege: '', zarva: 'Ü' },
  groupMax: 25, // ennyi gyerek fér egy csoportba (50 → 2 csoport, 52 → 3)
  report: { title: 'Adonyi Hóvirág Óvoda', margin_mm: 5, weekend_x: false, period_only: true },
};

// ---------- dátum segédek ----------
const D = (s) => new Date(s + 'T00:00:00Z');
const S = (d) => d.toISOString().slice(0, 10);
export const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && S(D(s)) === s;
export const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return S(d); };
export const dowOf = (s) => D(s).getUTCDay(); // 0 = vasárnap
export const mondayOf = (s) => addDays(s, -((dowOf(s) + 6) % 7));
export function eachDate(from, to) { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; }
export const dotted = (s) => `${s.slice(0, 4)}. ${s.slice(5, 7)}. ${s.slice(8, 10)}.`;
export const shortHu = (s) => `${MONTH_NAMES[Number(s.slice(5, 7)) - 1].slice(0, 3)}. ${Number(s.slice(8, 10))}.`;
export const monthLabel = (key) => `${key.slice(0, 4)}. ${MONTH_NAMES[Number(key.slice(5, 7)) - 1]}`;
// névegyeztetéshez: kis-nagybetű, ékezet, kötőjel, pont és szóköz-eltérés nem számít
export const nameKey = (s) => norm(s).replace(/[.\-–,]/g, ' ').replace(/\s+/g, ' ').trim();
export const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

// ---------- új terv ----------
// groups: [{id, name}] a fő alkalmazásból; workers: [{id, name, active, group_ids}]
export function newPlan(year, groups, workers) {
  const y = Number(year);
  // alapértelmezés (beállításban módosítható): június 21. vagy az utána következő hétfő,
  // vége az augusztus 31-ét tartalmazó hét előtti péntek (2027: 06. 21. – 08. 27.)
  const j21 = `${y}-06-21`;
  const from = dowOf(j21) === 1 ? j21 : addDays(mondayOf(j21), 7);
  const to = addDays(mondayOf(`${y}-08-31`), -3);
  const roles = [];
  for (const p of ROLE_PRESETS) {
    const g = groups.find((x) => p.match.test(x.name) && !(p.not && p.not.test(x.name)) && !roles.some((r) => r.group_id === x.id));
    if (g) roles.push({ group_id: g.id, label: p.label, single: Boolean(p.single), min: { DE: 0, DU: 0, D: 0, ...p.min }, opt: { DE: 0, DU: 0, D: 0, ...p.min } });
  }
  defaultSubstitution(roles);
  return {
    v: 2,
    mode: 'mindenki',
    name: `Nyári beosztás ${y}`,
    period: { from, to },
    closed: [],
    roles,
    staff: syncStaff([], roles, workers),
    absences: [],
    alternatives: [],
    children: {}, // { 'hétfő dátuma': várható gyereklétszám }
    selected: null,
    schedule: null,
    approvals: {},
    settings: structuredClone(DEFAULT_SETTINGS),
  };
}

// A terv dolgozói listáját frissíti a fő alkalmazás adataiból. A fő adatokat soha nem módosítja.
export function syncStaff(staff, roles, workers) {
  const byId = new Map(staff.map((s) => [s.id, s]));
  const roleIds = new Set(roles.map((r) => r.group_id));
  const out = [];
  for (const w of workers) {
    const gid = w.group_ids ? Number(String(w.group_ids).split(',')[0]) : null;
    const prev = byId.get(w.id);
    if (w.active !== 1 && !prev) continue;
    if (!roleIds.has(gid) && !prev) continue;
    out.push({ id: w.id, name: w.name, group_id: gid, active: w.active === 1, include: prev ? prev.include && w.active === 1 : true, order: prev?.order ?? null });
    byId.delete(w.id);
  }
  // A fő appból törölt dolgozó a tervben inaktívként marad, hogy a régi beosztás olvasható legyen.
  for (const s of byId.values()) out.push({ ...s, active: false, include: false, removed: true });
  return out;
}

// Helyettesítés: az óvónői létszámba a pedagógiai asszisztens is beleszámít (délelőtt és délután is),
// de műszakonként legalább role.minOwn óvónőnek bent kell lennie. role.subBy: a helyettesítő munkakör group_id-ja.
export function defaultSubstitution(roles) {
  const asz = roles.find((r) => /asszisztens/i.test(r.label));
  for (const r of roles) {
    // egy dolgozó műszakonként ennyi csoportot lát el (0: a létszámigény nem függ a csoportszámtól)
    r.groupsPer ??= /asszisztens/i.test(r.label) ? 0 : /dajk/i.test(r.label) ? 2 : /pedag/i.test(r.label) ? 1 : 0;
    if (r.subBy !== undefined) continue;
    r.subBy = asz && r !== asz && /pedag/i.test(r.label) && !/asszisztens/i.test(r.label) ? asz.group_id : null;
    r.minOwn ??= 1;
  }
}
// A helyettesítő munkakör napi jelenléte: Map(date -> { DE, DU }).
// grid megadásakor a tényleges beosztásból; különben pihenőnap nélkül a jelenlévőkből, pihenőnapos módban a biztosan bent lévő minimumból.
export function coverCount(plan, cal, absMap, role, locks = {}, grid = null) {
  const out = new Map();
  const sub = role.subBy != null && plan.roles.find((r) => r.group_id === role.subBy && r !== role);
  if (!sub) return out;
  const ws = staffByRole(plan).find((x) => x.role.group_id === sub.group_id)?.workers || [];
  for (const d of cal.workdays) {
    const c = { DE: 0, DU: 0 };
    if (grid) {
      for (const w of ws) { const v = grid[w.id]?.[d]; if (!v || isAbsent(absMap, w.id, d)) continue; if (v === 'D') { c.DE++; c.DU++; } else c[v]++; }
    } else if (allWork(plan)) {
      for (const w of ws) { if (isAbsent(absMap, w.id, d)) continue; const v = locks[lockKey(w.id, d)]; if (v === 'P') continue; if (sub.single || v === 'D') { c.DE++; c.DU++; } else if (v) c[v]++; }
    } else {
      const here = ws.filter((w) => !isAbsent(absMap, w.id, d)).length;
      if (sub.single) c.DE = c.DU = Math.min(here, sub.min.D || 0); else { c.DE = Math.min(here, sub.min.DE || 0); c.DU = Math.min(here, sub.min.DU || 0); }
    }
    out.set(d, c);
  }
  return out;
}
// Csoportok száma egy napon a heti várható gyereklétszámból (null, ha nincs megadva)
export function groupsOn(plan, date) {
  const n = Number(plan.children?.[mondayOf(date)]);
  if (!n || n <= 0) return null;
  return Math.ceil(n / Math.max(1, Number(plan.settings?.groupMax) || 25));
}
// Napi minimum műszakonként: a csoportszámból számolt igény, de legalább a beállított fix minimum
export function dayMin(plan, role, sh, date) {
  const base = role.min[sh] || 0;
  const g = role.groupsPer > 0 && sh !== 'D' ? groupsOn(plan, date) : null;
  return g ? Math.max(base, Math.ceil(g / role.groupsPer)) : base;
}
// A munkakör tényleges minimuma egy napon, műszakonként (a helyettesítők levonásával, de legalább minOwn saját dolgozó)
export function effMin(role, sh, cov, base = null) {
  const min = base ?? (role.min[sh] || 0);
  if (role.subBy == null || !cov) return min;
  return Math.max(Math.min(role.minOwn ?? 1, min), min - (cov[sh] || 0));
}

export function normalizePlan(p) {
  p.settings = { ...structuredClone(DEFAULT_SETTINGS), ...(p.settings || {}) };
  for (const k of ['colors', 'abbr', 'report']) p.settings[k] = { ...DEFAULT_SETTINGS[k], ...(p.settings[k] || {}) };
  p.mode ||= 'mindenki';
  p.children ||= {};
  p.prefs ||= {};
  p.closed ||= []; p.absences ||= []; p.alternatives ||= []; p.approvals ||= {}; p.staff ||= []; p.roles ||= [];
  for (const r of p.roles) {
    r.min ||= { DE: 0, DU: 0 }; r.opt ||= { ...r.min };
    // 1 → 2: a pedagógiai asszisztens egy műszakos (D); a meglévő DE/DU beosztásuk D lesz
    if (r.single === undefined) {
      r.single = /asszisztens/i.test(r.label);
      if (r.single) {
        r.min.D = (r.min.DE || 0) + (r.min.DU || 0); r.opt.D = Math.max(r.min.D, (r.opt.DE || 0) + (r.opt.DU || 0));
        const ids = new Set(p.staff.filter((x) => x.group_id === r.group_id).map((x) => String(x.id)));
        const conv = (g) => { for (const [w, days] of Object.entries(g || {})) if (ids.has(String(w))) for (const d of Object.keys(days)) days[d] = 'D'; };
        conv(p.schedule?.grid); for (const a of p.alternatives) conv(a.grid);
        for (const k of Object.keys(p.locks || {})) if (ids.has(k.split('|')[0]) && p.locks[k] !== 'P') p.locks[k] = 'D';
      }
    }
    r.min.D ??= 0; r.opt.D ??= r.min.D;
  }
  defaultSubstitution(p.roles);
  return p;
}

// Munkakörönként csoportosított, rendezett dolgozólista (csak a tervbe bevont, aktív dolgozók)
export function staffByRole(plan, { all = false } = {}) {
  return plan.roles.map((role) => ({
    role,
    workers: plan.staff
      .filter((s) => s.group_id === role.group_id && (all || s.include))
      .sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name, 'hu')),
  }));
}

// ---------- naptár ----------
// holidays: [{date, kind:'off'|'work', label}] a fő alkalmazásból (törvényi ünnepek + speciális napok)
export function buildCalendar(plan, holidays = []) {
  const hol = new Map(holidays.map((h) => [h.date, h]));
  const closed = new Map((plan.closed || []).map((c) => [c.date, c]));
  const { from, to } = plan.period;
  const days = [];
  if (isDate(from) && isDate(to) && from <= to) {
    for (const date of eachDate(from, to)) {
      const dow = dowOf(date);
      const weekend = dow === 0 || dow === 6;
      const h = hol.get(date);
      const c = closed.get(date);
      let work = !weekend;
      if (h?.kind === 'off') work = false;
      if (h?.kind === 'work') work = true;
      if (c) work = false;
      days.push({ date, dow, weekend, month: date.slice(0, 7), work,
        off: !work && !weekend ? (c?.label || h?.label || 'Zárva') : (!work && h?.kind === 'off' ? h.label : null) });
    }
  }
  const workdays = days.filter((d) => d.work).map((d) => d.date);
  const weekMap = new Map();
  for (const d of workdays) { const k = mondayOf(d); if (!weekMap.has(k)) weekMap.set(k, []); weekMap.get(k).push(d); }
  const weeks = [...weekMap].map(([key, ds]) => ({ key, days: ds }));
  const monthMap = new Map();
  for (const d of days) { if (!monthMap.has(d.month)) monthMap.set(d.month, []); monthMap.get(d.month).push(d); }
  const months = [...monthMap].map(([key, ds]) => ({ key, label: monthLabel(key), days: ds }));
  return { days, workdays, weeks, months, byDate: new Map(days.map((d) => [d.date, d])) };
}

// ---------- távollétek ----------
// Visszaad: Map(worker_id -> Map(date -> távollét rekord)); minden naptári napra (hétvégére is, a megjelenítéshez)
export function expandAbsences(plan) {
  const out = new Map();
  for (const a of plan.absences || []) {
    if (!isDate(a.from) || !isDate(a.to) || a.from > a.to) continue;
    const from = a.from < plan.period.from ? plan.period.from : a.from;
    const to = a.to > plan.period.to ? plan.period.to : a.to;
    if (from > to) continue;
    if (!out.has(a.worker_id)) out.set(a.worker_id, new Map());
    const m = out.get(a.worker_id);
    for (const d of eachDate(from, to)) if (!m.has(d) || a.kind === 'szabadsag') m.set(d, a);
  }
  return out;
}
export const isAbsent = (absMap, wid, date) => Boolean(absMap.get(wid)?.has(date));

// ---------- beosztás-rács segédek ----------
// grid: { [worker_id]: { [date]: 'DE'|'DU'|'D' } } – csak a munkanapok szerepelnek; ami hiányzik, az pihenőnap.
// locks: { 'wid|date': 'DE'|'DU'|'D'|'P' } – kézzel rögzített cellák, generáláskor kötelező feltételként maradnak.
export const cellOf = (grid, wid, date) => grid?.[wid]?.[date] || null;
export function setCell(grid, wid, date, val) {
  grid[wid] ||= {};
  if (ALL_CODES.includes(val)) grid[wid][date] = val; else delete grid[wid][date];
}
export const lockKey = (wid, date) => `${wid}|${date}`;
export const approvalKey = (date, shift, gid) => `${date}|${shift}|${gid}`;

// Egy munkakör feladata az optimalizálónak / ellenőrzésnek
export function roleProblem(plan, cal, absMap, role, locks = {}) {
  const workers = staffByRole(plan).find((x) => x.role.group_id === role.group_id)?.workers || [];
  const avail = new Map(workers.map((w) => [w.id, new Set(cal.workdays.filter((d) => !isAbsent(absMap, w.id, d)))]));
  const totalAvail = workers.reduce((a, w) => a + avail.get(w.id).size, 0);
  const demand = cal.workdays.length * minSum(role, 'opt');
  const target = new Map(workers.map((w) => [w.id, totalAvail ? (demand * avail.get(w.id).size) / totalAvail : 0]));
  const lk = {};
  for (const w of workers) for (const d of cal.workdays) { const v = locks[lockKey(w.id, d)]; if (v) lk[lockKey(w.id, d)] = v; }
  // pihenőnap nélküli módban a napszám adott; a délelőttök arányát a tervezett létszám aránya adja
  const oDE = role.opt?.DE ?? role.min.DE, oDU = role.opt?.DU ?? role.min.DU;
  const share = oDE + oDU ? oDE / (oDE + oDU) : 0.5;
  const cov = coverCount(plan, cal, absMap, role, locks);
  const minEff = {};
  const dayMins = {};
  for (const d of cal.workdays) {
    dayMins[d] = Object.fromEntries(shiftsOf(role).map((sh) => [sh, dayMin(plan, role, sh, d)]));
    minEff[d] = Object.fromEntries(shiftsOf(role).map((sh) => [sh, effMin(role, sh, cov.get(d), dayMins[d][sh])]));
  }
  return { role, workers, avail, target, demand, locks: lk, workdays: cal.workdays, weeks: cal.weeks, allWork: allWork(plan), share, minEff, dayMins };
}

// ---------- előzetes megvalósíthatósági ellenőrzés ----------
// Egy munkakörön belül a napok függetlenek (egy dolgozó naponta egy műszakban), ezért ez pontos:
// egy napon akkor és csak akkor teljesíthető a minimum, ha a szabad dolgozók száma ≥ a még hiányzó DE + DU létszám.
export function precheck(plan, cal, absMap, locks = {}) {
  const conflicts = [];
  const nameOf = new Map(plan.staff.map((s) => [s.id, s.name]));
  for (const role of plan.roles) {
    const pr = roleProblem(plan, cal, absMap, role, locks);
    for (const w of pr.workers) for (const d of cal.workdays) {
      const v = locks[lockKey(w.id, d)];
      if (v && v !== 'P' && !shiftsOf(role).includes(v)) conflicts.push({ type: 'lock_shift', date: d, role: role.label, group_id: role.group_id, worker: w.name, worker_id: w.id, shift: v });
      else if (v && v !== 'P' && isAbsent(absMap, w.id, d)) conflicts.push({ type: 'lock_absent', date: d, role: role.label, group_id: role.group_id, worker: w.name, worker_id: w.id, shift: v });
    }
    const shifts = shiftsOf(role);
    for (const d of cal.workdays) {
      const locked = Object.fromEntries(shifts.map((x) => [x, 0]));
      let free = 0;
      const absent = [];
      for (const w of pr.workers) {
        const v = locks[lockKey(w.id, d)];
        const here = pr.avail.get(w.id).has(d);
        if (!here) { const a = absMap.get(w.id)?.get(d); absent.push({ worker_id: w.id, name: w.name, absence: a }); continue; }
        if (v && v !== 'P' && locked[v] != null) locked[v]++; else if (!v) free++;
      }
      const mins = pr.minEff[d];
      const need = Object.fromEntries(shifts.map((x) => [x, Math.max(0, mins[x] - locked[x])]));
      const needSum = shifts.reduce((a, x) => a + need[x], 0);
      if (free < needSum) {
        const lockedSum = shifts.reduce((a, x) => a + locked[x], 0);
        conflicts.push({ type: 'shortage', date: d, role: role.label, group_id: role.group_id,
          required: Object.fromEntries(shifts.map((x) => [x, mins[x]])), available: free + lockedSum, locked,
          covered: role.subBy != null ? Object.fromEntries(shifts.map((x) => [x, pr.dayMins[d][x] - mins[x]])) : null,
          groups: groupsOn(plan, d),
          missing: needSum - free,
          // kétműszakos munkakörnél a hiányt a délutánra írjuk, ha a délelőtt még kitölthető
          shifts: shifts.length === 1 ? shifts : free >= need.DE ? ['DU'] : (need.DU > 0 ? ['DE', 'DU'] : ['DE']),
          absent: absent.map((x) => ({ name: x.name || nameOf.get(x.worker_id), kind: x.absence?.kind, from: x.absence?.from, to: x.absence?.to, status: x.absence?.status, note: x.absence?.note })) });
      }
    }
    if (!pr.workers.length && minSum(role) && cal.workdays.length) conflicts.push({ type: 'no_staff', role: role.label, group_id: role.group_id });
  }
  return conflicts;
}

// ---------- ellenőrzés (generálás és minden kézi módosítás után) ----------
export function validate(plan, cal, absMap, schedule) {
  const grid = schedule?.grid || {};
  const errors = [], warnings = [], surplus = [], shortages = [], counts = {};
  const approvals = plan.approvals || {};
  const included = new Set(plan.staff.filter((s) => s.include).map((s) => s.id));
  const staffById = new Map(plan.staff.map((s) => [s.id, s]));
  const roleByGid = new Map(plan.roles.map((r) => [r.group_id, r]));
  // beosztás nem bevont dolgozóra vagy nem munkanapra
  for (const [widS, days] of Object.entries(grid)) {
    const wid = Number(widS); const s = staffById.get(wid);
    for (const [d, v] of Object.entries(days)) {
      if (!v) continue;
      if (!cal.byDate.get(d)?.work) { if (cal.byDate.has(d)) errors.push({ type: 'nonworkday', date: d, worker: s?.name || `#${wid}`, shift: v, msg: `${s?.name || wid}: beosztás nem munkanapra (${dotted(d)})` }); continue; }
      if (!s || !included.has(wid)) errors.push({ type: 'not_included', date: d, worker: s?.name || `#${wid}`, shift: v, msg: `${s?.name || wid} nincs bevonva a tervbe, mégis be van osztva (${dotted(d)})` });
      else if (!roleByGid.has(s.group_id)) errors.push({ type: 'role', date: d, worker: s.name, shift: v, msg: `${s.name}: a munkaköre nem szerepel a tervben` });
      else if (!shiftsOf(roleByGid.get(s.group_id)).includes(v)) errors.push({ type: 'shift', date: d, worker: s.name, shift: v, msg: `${s.name}: a(z) ${v} műszak nem létezik a munkakörében (${dotted(d)})` });
      if (isAbsent(absMap, wid, d)) {
        const a = absMap.get(wid).get(d);
        errors.push({ type: 'absent', date: d, worker: s?.name, worker_id: wid, shift: v, msg: `${s?.name}: ${ABSENCE_KINDS[a.kind] || 'távollét'} napjára van beosztva (${dotted(d)}, ${SHIFT_LABEL[v]})` });
      }
    }
  }
  for (const { role, workers } of staffByRole(plan)) {
    const cov = coverCount(plan, cal, absMap, role, {}, grid);
    const subName = role.subBy != null ? plan.roles.find((r) => r.group_id === role.subBy)?.label : null;
    for (const d of cal.workdays) {
      for (const sh of shiftsOf(role)) {
        const names = workers.filter((w) => grid[w.id]?.[d] === sh && !isAbsent(absMap, w.id, d)).map((w) => w.name);
        const n = names.length;
        counts[`${d}|${sh}|${role.group_id}`] = n;
        const c = cov.get(d)?.[sh] || 0;
        if (subName) counts[`cov|${d}|${sh}|${role.group_id}`] = c;
        const min = dayMin(plan, role, sh, d), opt = Math.max(role.opt?.[sh] ?? min, min);
        counts[`min|${d}|${sh}|${role.group_id}`] = min;
        const own = subName ? Math.min(role.minOwn ?? 1, min) : 0;
        if (n + c < min || n < own) {
          const short = Math.max(min - n - c, own - n);
          const rec = { date: d, shift: sh, role: role.label, group_id: role.group_id, required: min, assigned: n, covered: c, missing: short, names };
          shortages.push(rec);
          const msg = n < own
            ? `${dotted(d)} ${SHIFT_LABEL[sh]}, ${role.label}: nincs bent ${role.label.toLowerCase()} (legalább ${own} kell${c ? `, a(z) ${c} fő ${subName.toLowerCase()} nem pótolja` : ''})`
            : `${dotted(d)} ${SHIFT_LABEL[sh]}, ${role.label}: ${n} fő${c ? ` + ${c} ${subName.toLowerCase()}` : ''} a szükséges ${min} helyett`;
          errors.push({ type: 'shortage', ...rec, msg });
        } else if (n > opt) {
          const key = approvalKey(d, sh, role.group_id);
          const ap = approvals[key];
          surplus.push({ key, date: d, shift: sh, role: role.label, group_id: role.group_id, required: opt, assigned: n, extra: n - opt, names, approved: Boolean(ap), note: ap?.note || '' });
        }
      }
    }
  }
  // elavult jóváhagyás (a többlet már nincs meg) – csak figyelmeztetés, nem törlünk automatikusan
  const surplusKeys = new Set(surplus.map((s) => s.key));
  const staleApprovals = Object.keys(approvals).filter((k) => !surplusKeys.has(k));
  const unapproved = allWork(plan) ? [] : surplus.filter((s) => !s.approved);
  if (allWork(plan)) {
    for (const { workers } of staffByRole(plan)) for (const w of workers) for (const d of cal.workdays) {
      if (!grid[w.id]?.[d] && !isAbsent(absMap, w.id, d) && plan.locks?.[lockKey(w.id, d)] !== 'P')
        warnings.push({ type: 'idle', date: d, worker: w.name, worker_id: w.id, msg: `${w.name}: ${dotted(d)} nem dolgozik, de nincs rögzített távolléte` });
    }
  }
  for (const s of unapproved) warnings.push({ type: 'surplus', ...s, msg: `${dotted(s.date)} ${SHIFT_LABEL[s.shift]}, ${s.role}: ${s.assigned} fő (${s.extra} fő többlet, nincs jóváhagyva)` });
  const m = metrics(plan, cal, absMap, grid);
  return { ok: errors.length === 0, errors, warnings, surplus, shortages, staleApprovals, counts, metrics: m };
}

// ---------- minőségi mutatók ----------
export function metrics(plan, cal, absMap, grid) {
  const perWorker = [];
  let blocksFull = 0, blocksWorked = 0, shiftChanges = 0, isolated = 0;
  const perRole = [];
  for (const { role, workers } of staffByRole(plan)) {
    const pr = roleProblem(plan, cal, absMap, role);
    const devs = [];
    for (const w of workers) {
      const av = pr.avail.get(w.id);
      let days = 0, full = 0, worked = 0, changes = 0, iso = 0, de = 0, du = 0, dd = 0;
      for (const wk of cal.weeks) {
        const ad = wk.days.filter((d) => av.has(d));
        if (!ad.length) continue;
        const seq = ad.map((d) => grid?.[w.id]?.[d] || null);
        const n = seq.filter(Boolean).length;
        if (!n) continue;
        worked++; if (n === ad.length) full++;
        let prev = null;
        for (const v of seq) { if (v && prev && v !== prev) changes++; if (v) prev = v; }
        // elszigetelt munkavégzés: 1–2 napos szakasz egy olyan héten, ahol legalább 3 nap elérhető lett volna
        if (ad.length >= 3) { let run = 0; for (const v of [...seq, null]) { if (v) run++; else { if (run > 0 && run <= 2) iso += run; run = 0; } } }
      }
      for (const d of cal.workdays) { const v = grid?.[w.id]?.[d]; if (v && av.has(d)) { days++; if (v === 'DE') de++; else if (v === 'DU') du++; else dd++; } }
      const target = pr.target.get(w.id);
      devs.push(days - target);
      perWorker.push({ id: w.id, name: w.name, role: role.label, group_id: role.group_id, available: av.size, days, de, du, d: dd, single: Boolean(role.single), deShare: de + du ? Math.round((100 * de) / (de + du)) : null, target: Math.round(target * 10) / 10, weeks: worked, fullWeeks: full, shiftChanges: changes, isolated: iso });
      blocksFull += full; blocksWorked += worked; shiftChanges += changes; isolated += iso;
    }
    const spread = devs.length ? Math.max(...devs) - Math.min(...devs) : 0;
    const maxDev = devs.length ? Math.max(...devs.map(Math.abs)) : 0;
    const shares = perWorker.filter((x) => x.group_id === role.group_id && x.deShare != null).map((x) => x.deShare);
    perRole.push({ group_id: role.group_id, role: role.label, spread: Math.round(spread * 10) / 10, maxDev: Math.round(maxDev * 10) / 10, deShareSpread: shares.length && !role.single ? Math.max(...shares) - Math.min(...shares) : 0 });
  }
  let surplusCells = 0, surplusPersons = 0, approvedSurplus = 0;
  for (const { role, workers } of staffByRole(plan)) for (const d of cal.workdays) for (const sh of shiftsOf(role)) {
    const n = workers.filter((w) => grid?.[w.id]?.[d] === sh && !isAbsent(absMap, w.id, d)).length;
    const opt = role.opt?.[sh] ?? role.min[sh];
    if (n > opt) { surplusCells++; surplusPersons += n - opt; if (plan.approvals?.[approvalKey(d, sh, role.group_id)]) approvedSurplus++; }
  }
  const pr = pairReport(plan, cal, absMap, grid);
  const yes = pr.filter((x) => x.score > 0), no = pr.filter((x) => x.score < 0);
  return {
    pairYes: yes.length ? Math.round((100 * yes.reduce((t, x) => t + x.together, 0)) / Math.max(1, yes.reduce((t, x) => t + x.both, 0))) : null,
    pairNoDays: no.length ? no.reduce((t, x) => t + x.together, 0) : null,
    fullBlockRate: blocksWorked ? Math.round((1000 * blocksFull) / blocksWorked) / 10 : 100,
    blocksFull, blocksWorked, shiftChanges, isolated, surplusCells, surplusPersons, approvedSurplus,
    maxSpread: perRole.length ? Math.max(...perRole.map((r) => r.spread)) : 0,
    deShareSpread: perRole.length ? Math.max(...perRole.map((r) => r.deShareSpread)) : 0,
    perRole, perWorker,
  };
}

// ---------- Excel/CSV import ----------
const HEADERS = {
  id: ['dolgozoazonosito', 'azonosito', 'dolgozo azonosito', 'id', 'torzsszam'],
  name: ['dolgozo neve', 'nev', 'dolgozo', 'teljes nev'],
  from: ['szabadsag kezdete', 'kezdete', 'kezdo datum', 'kezdes', 'tol', 'datumtol', 'datum tol', 'kezdonap'],
  to: ['szabadsag vege', 'vege', 'zaro datum', 'befejezes', 'ig', 'datumig', 'datum ig', 'utolso nap', 'zaronap'],
  kind: ['tipus', 'tavollet tipusa', 'jelleg'],
  status: ['statusz', 'allapot'],
  note: ['megjegyzes', 'megj', 'indoklas'],
};

// Dátum értelmezése: Excel-dátum (Date vagy sorszám) és a gyakori magyar írásmódok
export function parseDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v)) {
    // a SheetJS a helyi éjfélt adja vissza; a helyi naptári napot vesszük
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) { // Excel sorszám (1900-as rendszer)
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return S(d);
  }
  const s = String(v).trim().replace(/\.$/, '');
  const m = s.match(/^(\d{4})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})$/);
  if (m) { const r = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`; return isDate(r) ? r : 'invalid'; }
  const e = s.match(/^(\d{1,2})\s*[./]\s*(\d{1,2})\s*[./]\s*(\d{4})$/); // NN.HH.ÉÉÉÉ (európai)
  if (e) { const r = `${e[3]}-${e[2].padStart(2, '0')}-${e[1].padStart(2, '0')}`; return isDate(r) ? r : 'invalid'; }
  return 'invalid';
}

// rows: tömbök tömbje, az első nem üres sor a fejléc. Visszaad: { records, issues, columns }
// issues: { row, level:'error'|'warning', msg }
export function parseAbsenceRows(rows, plan) {
  const issues = [], records = [];
  const hi = rows.findIndex((r) => r && r.some((c) => String(c ?? '').trim() !== ''));
  if (hi < 0) return { records, issues: [{ row: 0, level: 'error', msg: 'A fájl üres.' }], columns: {} };
  const header = rows[hi].map(norm);
  const col = {};
  for (const [key, names] of Object.entries(HEADERS)) {
    const i = header.findIndex((h) => names.includes(h));
    if (i >= 0) col[key] = i;
  }
  if (col.id == null && col.name == null) issues.push({ row: hi + 1, level: 'error', msg: 'Nincs „Dolgozóazonosító” vagy „Dolgozó neve” oszlop.' });
  if (col.from == null) issues.push({ row: hi + 1, level: 'error', msg: 'Nincs „Szabadság kezdete” oszlop.' });
  if (col.to == null) issues.push({ row: hi + 1, level: 'error', msg: 'Nincs „Szabadság vége” oszlop.' });
  if (issues.length) return { records, issues, columns: col };
  const byId = new Map(plan.staff.map((s) => [s.id, s]));
  const byName = new Map();
  for (const s of plan.staff) { const k = nameKey(s.name); byName.set(k, byName.has(k) ? 'dup' : s); }
  const seen = new Map();
  for (let i = hi + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    const rowNo = i + 1;
    const get = (k) => (col[k] == null ? '' : r[col[k]]);
    const rawId = String(get('id') ?? '').trim(), rawName = String(get('name') ?? '').trim();
    const rawFrom = get('from'), rawTo = get('to');
    const empty = (x) => x == null || String(x).trim() === '';
    if (empty(rawFrom) && empty(rawTo)) {
      if (rawId || rawName) continue; // sablon kitöltetlen sora: nem hiba
      if (r.every((c) => empty(c))) continue;
    }
    let worker = null;
    if (rawId) {
      const idNum = Number(rawId);
      worker = Number.isInteger(idNum) ? byId.get(idNum) : null;
      if (!worker) { issues.push({ row: rowNo, level: 'error', msg: `Ismeretlen dolgozóazonosító: „${rawId}”${rawName ? ` (${rawName})` : ''}` }); continue; }
      if (rawName && nameKey(rawName) !== nameKey(worker.name)) issues.push({ row: rowNo, level: 'warning', msg: `Az azonosító (${rawId}) ${worker.name} dolgozóé, de a sorban „${rawName}” szerepel. Az azonosító alapján vettem fel.` });
    } else if (rawName) {
      const hit = byName.get(nameKey(rawName));
      if (hit === 'dup') { issues.push({ row: rowNo, level: 'error', msg: `„${rawName}” név többször szerepel a dolgozók között, adj meg azonosítót.` }); continue; }
      if (!hit) { issues.push({ row: rowNo, level: 'error', msg: `Ismeretlen dolgozó: „${rawName}”` }); continue; }
      worker = hit;
    } else { issues.push({ row: rowNo, level: 'error', msg: 'Hiányzik a dolgozó azonosítója és neve.' }); continue; }
    const from = parseDate(rawFrom), to = parseDate(rawTo);
    if (!from) { issues.push({ row: rowNo, level: 'error', msg: `${worker.name}: hiányzik a kezdő dátum.` }); continue; }
    if (!to) { issues.push({ row: rowNo, level: 'error', msg: `${worker.name}: hiányzik a záró dátum (egynapos távollétnél ugyanaz, mint a kezdő).` }); continue; }
    if (from === 'invalid') { issues.push({ row: rowNo, level: 'error', msg: `${worker.name}: hibás kezdő dátum: „${rawFrom}”` }); continue; }
    if (to === 'invalid') { issues.push({ row: rowNo, level: 'error', msg: `${worker.name}: hibás záró dátum: „${rawTo}”` }); continue; }
    if (to < from) { issues.push({ row: rowNo, level: 'error', msg: `${worker.name}: a záró dátum (${dotted(to)}) a kezdő (${dotted(from)}) előtt van.` }); continue; }
    if (to < plan.period.from || from > plan.period.to) issues.push({ row: rowNo, level: 'warning', msg: `${worker.name}: ${dotted(from)} – ${dotted(to)} teljesen a tervezési időszakon kívül esik, nem befolyásolja a beosztást.` });
    else if (from < plan.period.from || to > plan.period.to) issues.push({ row: rowNo, level: 'warning', msg: `${worker.name}: ${dotted(from)} – ${dotted(to)} részben az időszakon kívül esik, csak az időszakba eső napok számítanak.` });
    const k = norm(get('kind'));
    const kind = !k || k === 'szabadsag' || k.startsWith('szabadsag') || k === 'sz' ? 'szabadsag'
      : k.startsWith('beteg') || k === 'b' || k === 'tappenz' ? 'beteg'
      : k.includes('plusz') || k.startsWith('szabadnap') || k === 'pl' ? 'pluszora' : 'egyeb';
    const st = norm(get('status'));
    const status = st.startsWith('jova') || st.startsWith('enged') ? 'jovahagyott' : 'igenyelt';
    if (st && !st.startsWith('jova') && !st.startsWith('enged') && !st.startsWith('igeny')) issues.push({ row: rowNo, level: 'warning', msg: `${worker.name}: ismeretlen státusz „${get('status')}”, igényeltként vettem fel.` });
    const dkey = `${worker.id}|${from}|${to}|${kind}`;
    if (seen.has(dkey)) { issues.push({ row: rowNo, level: 'warning', msg: `${worker.name}: ugyanez a távollét már szerepel a(z) ${seen.get(dkey)}. sorban, kihagytam.` }); continue; }
    const overlap = records.find((x) => x.worker_id === worker.id && x.from <= to && from <= x.to);
    if (overlap) issues.push({ row: rowNo, level: 'warning', msg: `${worker.name}: átfedés a(z) ${overlap.row}. sorral (${dotted(overlap.from)} – ${dotted(overlap.to)}).` });
    seen.set(dkey, rowNo);
    records.push({ row: rowNo, worker_id: worker.id, name: worker.name, from, to, kind, status, note: String(get('note') ?? '').trim().slice(0, 200) });
  }
  return { records, issues, columns: col };
}

// Munkakörönkénti összesítő a generálás előtt (mennyi munkanap szükséges, mennyi az elérhető)
export function capacitySummary(plan, cal, absMap) {
  return plan.roles.map((role) => {
    const pr = roleProblem(plan, cal, absMap, role);
    const need = cal.workdays.length * minSum(role);
    const avail = pr.workers.reduce((a, w) => a + pr.avail.get(w.id).size, 0);
    return { role: role.label, group_id: role.group_id, workers: pr.workers.length, need, planned: pr.demand, avail, perWorker: pr.workers.length ? Math.round((pr.demand / pr.workers.length) * 10) / 10 : 0 };
  });
}

let idc = 0;
export const uid = () => `${Date.now().toString(36)}${(idc++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Egyszerű CSV-olvasó: idézőjelek, ; , vagy tabulátor elválasztó (a magyar Excel pontosvesszőt ment)
export function parseCSV(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/)[0] || '';
  const delim = [';', '\t', ','].map((d) => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// A generálás bemeneteinek ujjlenyomata: ha változik, a korábbi változatok elavultak
// (a kézi rögzítések nincsenek benne: azok a kiválasztott beosztásban már szerepelnek)
export function fingerprint(plan, holidays = []) {
  const s = JSON.stringify([plan.prefs || {}, plan.children || {}, plan.settings?.groupMax, plan.period, plan.closed, plan.roles, plan.staff.map((x) => [x.id, x.group_id, x.include]),
    plan.absences.map((a) => [a.worker_id, a.from, a.to]), holidays.filter((h) => h.date >= plan.period.from && h.date <= plan.period.to)]);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// Munkanapok száma egy távollétben (a tervezési időszakon belül)
export const workdaysIn = (cal, from, to) => cal.workdays.filter((d) => d >= from && d <= to).length;

// Két rács eltérése: a valamelyikben beosztott cellák hány százaléka különbözik (nap vagy műszak)
export function gridDiff(a, b) {
  const keys = new Set();
  for (const g of [a, b]) for (const [w, days] of Object.entries(g || {})) for (const d of Object.keys(days)) keys.add(`${w}|${d}`);
  if (!keys.size) return 0;
  let diff = 0;
  for (const k of keys) { const [w, d] = k.split('|'); if ((a?.[w]?.[d] || null) !== (b?.[w]?.[d] || null)) diff++; }
  return Math.round((100 * diff) / keys.size);
}

// ---------- „ki kivel dolgozik szívesen” ----------
// plan.prefs: { 'a|b': 'I' | 'N' } – a sor dolgozója (a) szívesen / nem szívesen van egy műszakban b-vel; hiányzó = semleges.
export function pairList(plan) {
  const val = (x) => (x === 'I' ? 1 : x === 'N' ? -1 : 0);
  const out = new Map();
  for (const [k, v] of Object.entries(plan.prefs || {})) {
    const [a, b] = k.split('|').map(Number);
    if (a === b || !val(v)) continue;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    out.set(key, (out.get(key) || 0) + val(v));
  }
  return [...out].filter(([, s]) => s).map(([k, score]) => { const [a, b] = k.split('|').map(Number); return { a, b, score }; });
}

// Együtt töltött napok egy műszakban (egy műszakos „D” dolgozó mindkét műszakkal együtt van)
export function togetherDays(grid, absMap, a, b, workdays) {
  let n = 0;
  for (const d of workdays) {
    const x = grid?.[a]?.[d], y = grid?.[b]?.[d];
    if (!x || !y || isAbsent(absMap, a, d) || isAbsent(absMap, b, d)) continue;
    if (x === y || x === 'D' || y === 'D') n++;
  }
  return n;
}
export function pairReport(plan, cal, absMap, grid) {
  const name = new Map(plan.staff.map((s) => [s.id, s.name]));
  const inc = new Set(plan.staff.filter((s) => s.include).map((s) => s.id));
  return pairList(plan).filter((p) => inc.has(p.a) && inc.has(p.b)).map((p) => {
    const both = cal.workdays.filter((d) => !isAbsent(absMap, p.a, d) && !isAbsent(absMap, p.b, d)).length;
    return { ...p, aName: name.get(p.a), bName: name.get(p.b), together: togetherDays(grid, absMap, p.a, p.b, cal.workdays), both };
  });
}
