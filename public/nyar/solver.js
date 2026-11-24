// Nyári beosztás – optimalizáló modell (HiGHS, vegyes egészértékű lineáris programozás).
// A munkakörök egymástól függetlenek (nincs helyettesítés), ezért munkakörönként külön modellt oldunk meg.
//
// KÖTELEZŐ feltételek (hard):
//   - egy dolgozó naponta legfeljebb egy műszakban dolgozik
//   - távollét napján nincs változó, tehát nem osztható be
//   - minden munkanapon, műszakban a munkakör minimumlétszáma teljesül
//   - a kézzel rögzített cellák értéke rögzített
// PREFERENCIÁK (soft, súlyozott büntetés a célfüggvényben):
//   - tervezett (optimális) létszám alá menés                     W.opt
//   - nem teljes heti blokk (a héten elérhető napok egy része)      W.block
//   - műszakváltás egy héten belül                                W.shift
//   - munkanapok eltérése az arányos (elérhető napok szerinti) céltól  W.fair, W.fairMax
//   - egy héten belüli több, széttört szakasz                      W.run
//   - tervezett létszám feletti többlet                           W.surplus

import { shiftsOf, roleProblem, lockKey, pairList } from './model.js';
export { pairList };

export const PROFILES = {
  ajanlott: { label: 'Ajánlott', desc: 'A fontossági sorrend szerint: ötnapos blokkok, azonos műszak a héten, majd a lehető legegyenletesebb terhelés, fölösleges többlet nélkül.', descAll: 'Pihenőnap nélkül: a dolgozó egész héten ugyanabban a műszakban, a délelőttök és délutánok aránya dolgozónként kiegyenlített.',
    W: { opt: 400, block: 60, shift: 25, fair: 6, fairMax: 14, run: 12, surplus: 14, pairYes: 6, pairNo: 12 } },
  blokk: { label: 'Erős blokkok', labelAll: 'Heti azonos műszak', desc: 'Mindennél fontosabb a teljes hét és az azonos műszak; a terhelés kicsit kevésbé egyenletes.', descAll: 'Pihenőnap nélkül: a heti azonos műszak mindennél fontosabb; a délelőtt–délután arány dolgozónként kevésbé kiegyenlített.',
    W: { opt: 400, block: 150, shift: 70, fair: 2, fairMax: 5, run: 30, surplus: 14, pairYes: 3, pairNo: 6 } },
  egyenletes: { label: 'Egyenletes terhelés', labelAll: 'Egyenletes DE/DU arány', desc: 'A dolgozók közötti napszám-eltérést csökkenti; ehhez rövidebb blokkot vagy létszámtöbbletet is elfogad.', descAll: 'Pihenőnap nélkül: mindenki közel ugyanannyi délelőttöt és délutánt kap, ehhez ritkán héten belüli műszakváltást is elfogad.',
    W: { opt: 400, block: 35, shift: 15, fair: 20, fairMax: 50, run: 8, surplus: 4, pairYes: 6, pairNo: 12 } },
};
export const PROFILE_ORDER = ['ajanlott', 'blokk', 'egyenletes'];

// avoid: korábbi megoldások rácsa ({wid:{date:shift}}); minDiff: a korábbi munkanapok legalább ekkora hányada legyen más
// Egy munkakör modellrészei (célfüggvénytagok, feltételek, változók)
export function buildParts(pr, W, avoid = [], minDiff = 0) {
  const { workers, avail, target, workdays, weeks, role, locks, allWork, share } = pr;
  const SH = shiftsOf(role);
  const obj = [];         // [coef, var]
  const rows = [];        // szöveges feltételek
  const bins = [], bounds = [];
  const X = new Map();    // `${wi}|${di}|${s}` -> név
  const dIdx = new Map(workdays.map((d, i) => [d, i]));
  const term = (c, v) => (c === 1 ? `+ ${v}` : c === -1 ? `- ${v}` : `${c >= 0 ? '+' : '-'} ${Math.abs(c)} ${v}`);
  const neg = (t) => (t[0] === '+' ? '-' : '+') + t.slice(1);
  const row = (name, terms, op, rhs) => { if (terms.length) rows.push(` ${name}: ${terms.join(' ')} ${op} ${rhs}`); };

  workers.forEach((w, wi) => {
    for (const d of workdays) {
      if (!avail.get(w.id).has(d)) continue;
      const di = dIdx.get(d);
      const lk = locks[lockKey(w.id, d)];
      for (const s of SH) {
        const v = `x_${wi}_${di}_${s}`; X.set(`${wi}|${di}|${s}`, v); bins.push(v);
        if (lk) bounds.push(` ${v} = ${lk === s ? 1 : 0}`);
      }
      // pihenőnap nélküli módban aki nincs távol, dolgozik (kivéve, ha kézzel pihenőre rögzítették)
      if (allWork && lk !== 'P') row(`one_${wi}_${di}`, SH.map((s) => `+ x_${wi}_${di}_${s}`), '=', 1);
      else if (SH.length > 1) row(`one_${wi}_${di}`, SH.map((s) => `+ x_${wi}_${di}_${s}`), '<=', 1);
    }
  });
  const workTerms = (wi, di, c = 1) => SH.map((s) => X.get(`${wi}|${di}|${s}`)).filter(Boolean).map((v) => term(c, v));

  // létszám
  workdays.forEach((d, di) => {
    for (const s of SH) {
      const t = workers.map((w, wi) => X.get(`${wi}|${di}|${s}`)).filter(Boolean).map((v) => `+ ${v}`);
      const min = pr.minEff?.[d]?.[s] ?? role.min[s];
      const opt = Math.max(role.opt?.[s] ?? role.min[s], pr.dayMins?.[d]?.[s] ?? 0);
      if (min > 0) row(`min_${di}_${s}`, t, '>=', min);
      if (opt > min) { const u = `u_${di}_${s}`; obj.push([W.opt, u]); row(`opt_${di}_${s}`, [`+ ${u}`, ...t], '>=', opt); }
      if (t.length > opt) {
        const o = `o_${di}_${s}`;
        // pihenőnap nélkül a többlet szükségszerű: ott a két műszak közötti egyenletes elosztást büntetjük (a nagyobbikat)
        if (allWork && SH.length > 1) row(`ob_${di}_${s}`, [`+ ob_${di}`, `- ${o}`], '>=', 0);
        else obj.push([W.surplus, o]);
        row(`sur_${di}_${s}`, [`+ ${o}`, ...t.map(neg)], '>=', -opt);
      }
    }
    if (allWork && SH.length > 1 && rows.some((r) => r.startsWith(` ob_${di}_`))) obj.push([W.surplus, `ob_${di}`]);
  });

  // heti blokkok, műszak-állandóság, széttöredezettség
  workers.forEach((w, wi) => {
    weeks.forEach((wk, ki) => {
      const ad = wk.days.filter((d) => avail.get(w.id).has(d));
      const F = ad.length;
      if (!F) return;
      const nT = ad.flatMap((d) => workTerms(wi, dIdx.get(d)));
      const z = `z_${wi}_${ki}`, dev = `dev_${wi}_${ki}`, a = `a_${wi}_${ki}`;
      if (!allWork) {
        bins.push(z);
        obj.push([W.block, dev]);
        // dev ≥ F·z − n   és   dev ≥ n − F·z
        row(`dv1_${wi}_${ki}`, [`+ ${dev}`, term(-F, z), ...nT], '>=', 0);
        row(`dv2_${wi}_${ki}`, [`+ ${dev}`, term(F, z), ...nT.map(neg)], '>=', 0);
      }
      // a = 1: délelőttös hét. mDE ≥ nDE − F·a ; mDU ≥ nDU − F·(1−a)
      const twoShift = SH.length > 1;
      if (twoShift) bins.push(a);
      const deT = !twoShift ? [] : ad.map((d) => X.get(`${wi}|${dIdx.get(d)}|DE`)).map((v) => `- ${v}`);
      const duT = !twoShift ? [] : ad.map((d) => X.get(`${wi}|${dIdx.get(d)}|DU`)).map((v) => `- ${v}`);
      if (F > 1) {
        if (twoShift) {
          obj.push([W.shift, `mde_${wi}_${ki}`], [W.shift, `mdu_${wi}_${ki}`]);
          row(`sh1_${wi}_${ki}`, [`+ mde_${wi}_${ki}`, term(F, a), ...deT], '>=', 0);
          row(`sh2_${wi}_${ki}`, [`+ mdu_${wi}_${ki}`, term(-F, a), ...duT], '>=', -F);
        }
        if (allWork) return;
        // szakaszkezdések: s_d ≥ work_d − work_előző elérhető nap
        const st = [];
        ad.forEach((d, j) => {
          const sv = `s_${wi}_${dIdx.get(d)}`; st.push(`- ${sv}`);
          const cur = workTerms(wi, dIdx.get(d), -1);
          const prev = j ? workTerms(wi, dIdx.get(ad[j - 1]), 1) : [];
          row(`st_${wi}_${dIdx.get(d)}`, [`+ ${sv}`, ...cur, ...prev], '>=', 0);
        });
        const r = `r_${wi}_${ki}`; obj.push([W.run, r]);
        row(`rn_${wi}_${ki}`, [`+ ${r}`, ...st], '>=', -1);
      }
    });
    // arányos terhelés: pihenőnap nélkül a napszám adott, ott a délelőttök arányát egyenlítjük ki
    if (allWork && SH.length < 2) return;
    const all = allWork ? workdays.map((d) => X.get(`${wi}|${dIdx.get(d)}|DE`)).filter(Boolean).map((v) => `+ ${v}`) : workdays.flatMap((d) => workTerms(wi, dIdx.get(d)));
    const nAv = workdays.filter((d) => avail.get(w.id).has(d) && locks[lockKey(w.id, d)] !== 'P').length;
    const t = Math.round((allWork ? share * nAv : target.get(w.id)) * 100) / 100;
    obj.push([W.fair, `fp_${wi}`], [W.fair, `fn_${wi}`]);
    row(`fp_${wi}`, [`+ fp_${wi}`, ...all.map(neg)], '>=', -t);
    row(`fn_${wi}`, [`+ fn_${wi}`, ...all], '>=', t);
    row(`fm1_${wi}`, ['+ fmax', `- fp_${wi}`], '>=', 0);
    row(`fm2_${wi}`, ['+ fmax', `- fn_${wi}`], '>=', 0);
  });
  if (workers.length) obj.push([W.fairMax, 'fmax']);

  // eltérés a korábbi változatoktól (csak a nem rögzített munkanapokon)
  avoid.forEach((g, ai) => {
    if (!minDiff) return;
    const t = []; let n = 0;
    workers.forEach((w, wi) => workdays.forEach((d, di) => {
      if (locks[lockKey(w.id, d)]) return;
      const code = g?.[w.id]?.[d];
      if (!code || !avail.get(w.id).has(d)) return;
      if (allWork) { if (SH.length < 2) return; const v = X.get(`${wi}|${di}|${code}`); if (v) { t.push(`+ ${v}`); n++; } }
      else { t.push(...workTerms(wi, di)); n++; }
    }));
    if (n) row(`div_${ai}`, t, '<=', n - Math.max(1, Math.ceil(minDiff * n)));
  });

  return { obj, rows, bins, bounds, X, dIdx, fmax: workers.length > 0 && obj.some(([, v]) => v === 'fmax') };
}

const term = (c, v) => (c === 1 ? `+ ${v}` : c === -1 ? `- ${v}` : `${c >= 0 ? '+' : '-'} ${Math.abs(c)} ${v}`);
const NAME = /\b([a-z]+[0-9]?_[0-9A-Za-z_]+|fmax)\b/g;
// Több munkakör közös modelljéhez: a nevek munkakörönkénti előtagot kapnak
function withPrefix(parts, P) {
  if (!P) return parts;
  const ren = (t) => t.replace(NAME, `${P}$1`);
  return { ...parts, obj: parts.obj.map(([c, v]) => [c, ren(v)]), rows: parts.rows.map(ren), bins: parts.bins.map(ren), bounds: parts.bounds.map(ren),
    X: new Map([...parts.X].map(([k, v]) => [k, ren(v)])), fmaxName: ren('fmax') };
}
function assemble(list, extra = { obj: [], rows: [], bins: [] }) {
  const wrap = (arr) => { const out = []; for (let i = 0; i < arr.length; i += 12) out.push(arr.slice(i, i + 12).join(' ')); return out.join('\n   '); };
  const obj = [...list.flatMap((p) => p.obj), ...extra.obj];
  const objTerms = obj.map(([c, v]) => term(c, v));
  const rows = [...list.flatMap((p) => p.rows), ...extra.rows];
  const bins = [...list.flatMap((p) => p.bins), ...extra.bins];
  return [
    'Minimize',
    ` obj: ${objTerms.length ? wrap(objTerms) : '0 fmax'}`,
    'Subject To',
    ...rows.map((r) => { const m = r.match(/^( \w+: )(.*) (>=|<=|=) (-?[\d.]+)$/); if (!m) return r; return `${m[1]}${wrap(m[2].split(/ (?=[+-] )/))} ${m[3]} ${m[4]}`; }),
    'Bounds',
    ...list.flatMap((p) => p.bounds),
    ...list.filter((p) => p.fmax).map((p) => ` ${p.fmaxName || 'fmax'} >= 0`),
    'Binary',
    ...(bins.length ? [wrap(bins)] : []),
    'End',
  ].join('\n');
}

export function buildModel(pr, W, avoid = [], minDiff = 0) {
  const parts = buildParts(pr, W, avoid, minDiff);
  return { lp: assemble([parts]), X: parts.X, dIdx: parts.dIdx };
}

// ---------- „ki kivel dolgozik szívesen” preferenciák ----------
// pairs: [{ a, b, score }] – score > 0: szívesen egy műszakban, < 0: nem szívesen (a két irány összege)
// Közös modell: a munkakörök (a párjaikkal összekötve) együtt; naponta jutalom / büntetés, ha egy műszakban vannak.
export function buildJointModel(prs, W, avoids = [], minDiff = 0, pairs = []) {
  const parts = prs.map((pr, k) => withPrefix(buildParts(pr, W, avoids[k] || [], minDiff), prs.length > 1 ? `r${k}_` : ''));
  const where = new Map(); // worker id -> [k, wi]
  prs.forEach((pr, k) => pr.workers.forEach((w, wi) => where.set(w.id, [k, wi])));
  const extra = { obj: [], rows: [], bins: [] };
  let n = 0;
  for (const { a, b, score } of pairs) {
    if (!score || !where.has(a) || !where.has(b)) continue;
    const [ka, wa] = where.get(a), [kb, wb] = where.get(b);
    const A = prs[ka], Bp = prs[kb];
    const xs = (k, wi, di, s) => parts[k].X.get(`${wi}|${di}|${s}`);
    A.workdays.forEach((d) => {
      const dia = parts[ka].dIdx.get(d), dib = parts[kb].dIdx.get(d);
      if (dia == null || dib == null) return;
      // közös műszakok: egy műszakos (D) dolgozó egész nap bent van, mindkét műszakkal „együtt” van
      const shA = shiftsOf(A.role), shB = shiftsOf(Bp.role);
      const combos = [];
      if (shA.length > 1 && shB.length > 1) for (const s of ['DE', 'DU']) combos.push([[xs(ka, wa, dia, s)], [xs(kb, wb, dib, s)]]);
      else combos.push([shA.map((s) => xs(ka, wa, dia, s)), shB.map((s) => xs(kb, wb, dib, s))]);
      for (const [va, vb] of combos) {
        const ta = va.filter(Boolean), tb = vb.filter(Boolean);
        if (!ta.length || !tb.length) continue;
        const y = `pp_${n++}`;
        if (score > 0) {
          // jutalom: y ≤ A jelen, y ≤ B jelen (y csak akkor lehet 1, ha együtt vannak)
          extra.obj.push([-W.pairYes * score, y]);
          extra.rows.push(` py1_${n}: + ${y} ${ta.map((v) => `- ${v}`).join(' ')} <= 0`, ` py2_${n}: + ${y} ${tb.map((v) => `- ${v}`).join(' ')} <= 0`);
          extra.bins.push(y);
        } else {
          // büntetés: y ≥ A + B − 1
          extra.obj.push([W.pairNo * -score, y]);
          extra.rows.push(` pn_${n}: + ${y} ${ta.map((v) => `- ${v}`).join(' ')} ${tb.map((v) => `- ${v}`).join(' ')} >= -1`);
        }
      }
    });
  }
  return { lp: assemble(parts, extra), parts };
}


// Munkakör-csoportok: azok a munkakörök, amelyek között van preferencia, együtt oldódnak meg
export function roleComponents(prs, pairs) {
  const parent = prs.map((_, i) => i);
  const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const roleOf = new Map(); prs.forEach((pr, k) => pr.workers.forEach((w) => roleOf.set(w.id, k)));
  for (const { a, b } of pairs) { const ka = roleOf.get(a), kb = roleOf.get(b); if (ka != null && kb != null) parent[find(ka)] = find(kb); }
  const groups = new Map(); prs.forEach((_, k) => { const r = find(k); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(k); });
  return [...groups.values()];
}

export function extractGrid(pr, X, cols) {
  const grid = {};
  pr.workers.forEach((w, wi) => {
    pr.workdays.forEach((d, di) => {
      for (const s of shiftsOf(pr.role)) {
        const v = X.get(`${wi}|${di}|${s}`);
        if (v && (cols[v]?.Primal ?? 0) > 0.5) { grid[w.id] ||= {}; grid[w.id][d] = s; }
      }
    });
  });
  return grid;
}

// Egy munkakör megoldása. Visszaad: { status: 'ok'|'infeasible'|'error'|'timeout', grid, objective, gap }
export function solveRole(highs, pr, W, { avoid = [], minDiff = 0, timeLimit = 12, gap = 0.01 } = {}) {
  if (!pr.workers.length) return { status: 'ok', grid: {}, objective: 0 };
  const { lp, X } = buildModel(pr, W, avoid, minDiff);
  let res;
  try {
    res = highs.solve(lp, { output_flag: false, time_limit: timeLimit, mip_rel_gap: gap, presolve: 'on' });
  } catch (e) {
    return { status: 'error', error: String(e?.message || e) };
  }
  const st = res.Status;
  if (st === 'Infeasible' || st === 'Primal infeasible') return { status: 'infeasible' };
  const hasSol = res.Columns && Object.values(res.Columns).some((c) => typeof c.Primal === 'number');
  if (st !== 'Optimal' && !hasSol) return { status: st === 'Time limit reached' ? 'timeout' : 'error', error: st };
  return { status: st === 'Optimal' ? 'ok' : 'timeout_ok', grid: extractGrid(pr, X, res.Columns), objective: res.ObjectiveValue };
}

// Egy munkakör összes változata: mindegyik más profil (súlyozás), és a korábbiaktól lehetőleg legalább 20%-ban eltér.
// getHighs(force): HiGHS példány (WASM-hiba után újraindítható). Visszaad: [{ grid, status, notes }] változatonként.
export async function generateRoleAlternatives(getHighs, pr, profiles, { onProgress = () => {}, timeLimit = 10 } = {}) {
  const out = [];
  for (let ai = 0; ai < profiles.length; ai++) {
    const W = PROFILES[profiles[ai]].W;
    onProgress(ai);
    const avoid = out.filter((a) => a.grid).map((a) => a.grid);
    const notes = [];
    let r = null;
    for (const md of ai ? [0.2, 0.1, 0.04, 0] : [0]) {
      let highs = await getHighs();
      r = solveRole(highs, pr, W, { avoid, minDiff: md, timeLimit });
      if (r.status === 'error') { highs = await getHighs(true); r = solveRole(highs, pr, W, { avoid, minDiff: md, timeLimit }); }
      if (r.grid) { if (ai && md < 0.2) notes.push(md ? `${pr.role.label}: csak ${Math.round(md * 100)}%-os eltérés volt elérhető az előző változat(ok)tól` : `${pr.role.label}: nem találtam az előzőtől eltérő megoldást`); break; }
    }
    if (!r?.grid) { out.push({ grid: null, notes: [`${pr.role.label}: nem sikerült megoldást találni (${r?.status}${r?.error ? ': ' + r.error : ''})`] }); continue; }
    if (r.status === 'timeout_ok') notes.push(`${pr.role.label}: az időkorlát miatt jó, de nem bizonyítottan a legjobb megoldás`);
    out.push({ grid: r.grid, notes });
  }
  return out;
}

export const profileList = (count) => Array.from({ length: count }, (_, i) => PROFILE_ORDER[i % PROFILE_ORDER.length]);

// Munkakörönkénti eredmények összefésülése változatokká
export function combine(profiles, perRole) {
  return profiles.map((key, ai) => {
    const grid = {}; const notes = []; let failed = false;
    for (const res of perRole) { const r = res[ai]; notes.push(...r.notes); if (!r.grid) failed = true; else Object.assign(grid, r.grid); }
    return { profile: key, label: PROFILES[key].label, desc: PROFILES[key].desc, grid: failed ? null : grid, failed, notes };
  });
}

// Egyszálú változat (Node-teszt, illetve tartalék, ha a böngésző nem tud modul-workert)
export async function generateAlternatives(getHighs, plan, cal, absMap, { count = 3, locks = {}, onProgress = () => {}, timeLimit = 10 } = {}) {
  const profiles = profileList(count);
  const prs = plan.roles.map((role) => roleProblem(plan, cal, absMap, role, locks));
  const pairs = pairList(plan);
  const perGroup = [];
  for (const comp of roleComponents(prs, pairs)) {
    const sub = comp.map((k) => prs[k]);
    const ids = new Set(sub.flatMap((p) => p.workers.map((w) => w.id)));
    const pp = pairs.filter((x) => ids.has(x.a) && ids.has(x.b));
    perGroup.push(await generateGroupAlternatives(getHighs, sub, pp, profiles, { timeLimit: comp.length > 1 ? timeLimit * 1.5 : timeLimit, onProgress: (ai) => onProgress(`${ai + 1}. változat · ${sub.map((p) => p.role.label).join(' + ')}`) }));
  }
  return combine(profiles, perGroup);
}

// Munkakör-csoport közös megoldása (preferenciákkal). Visszaad: { status, grid }
export function solveJoint(highs, prs, W, { avoids = [], minDiff = 0, timeLimit = 15, gap = 0.01, pairs = [] } = {}) {
  if (prs.length === 1 && !pairs.length) return solveRole(highs, prs[0], W, { avoid: avoids[0] || [], minDiff, timeLimit, gap });
  const { lp, parts } = buildJointModel(prs, W, avoids, minDiff, pairs);
  let res;
  try { res = highs.solve(lp, { output_flag: false, time_limit: timeLimit, mip_rel_gap: gap, presolve: 'on' }); }
  catch (e) { return { status: 'error', error: String(e?.message || e) }; }
  const st = res.Status;
  if (st === 'Infeasible' || st === 'Primal infeasible') return { status: 'infeasible' };
  const hasSol = res.Columns && Object.values(res.Columns).some((c) => typeof c.Primal === 'number');
  if (st !== 'Optimal' && !hasSol) return { status: st === 'Time limit reached' ? 'timeout' : 'error', error: st };
  const grid = {};
  prs.forEach((pr, k) => Object.assign(grid, extractGrid(pr, parts[k].X, res.Columns)));
  return { status: st === 'Optimal' ? 'ok' : 'timeout_ok', grid, objective: res.ObjectiveValue };
}

// Egy munkakör-csoport összes változata (a generateRoleAlternatives közös változata)
export async function generateGroupAlternatives(getHighs, prs, pairs, profiles, { onProgress = () => {}, timeLimit = 15 } = {}) {
  const out = [];
  const label = prs.map((p) => p.role.label).join(' + ');
  const ids = prs.map((pr) => new Set(pr.workers.map((w) => String(w.id))));
  const split = (g) => ids.map((set) => Object.fromEntries(Object.entries(g).filter(([w]) => set.has(String(w)))));
  for (let ai = 0; ai < profiles.length; ai++) {
    const W = PROFILES[profiles[ai]].W;
    onProgress(ai);
    const prev = out.filter((a) => a.grid).map((a) => split(a.grid));
    const avoids = prs.map((_, k) => prev.map((p) => p[k]));
    const notes = [];
    let r = null;
    for (const md of ai ? [0.2, 0.1, 0.04, 0] : [0]) {
      let highs = await getHighs();
      r = solveJoint(highs, prs, W, { avoids, minDiff: md, timeLimit, pairs });
      if (r.status === 'error') { highs = await getHighs(true); r = solveJoint(highs, prs, W, { avoids, minDiff: md, timeLimit, pairs }); }
      if (r.grid) { if (ai && md < 0.2) notes.push(md ? `${label}: csak ${Math.round(md * 100)}%-os eltérés volt elérhető az előző változat(ok)tól` : `${label}: nem találtam az előzőtől eltérő megoldást`); break; }
    }
    if (!r?.grid) { out.push({ grid: null, notes: [`${label}: nem sikerült megoldást találni (${r?.status}${r?.error ? ': ' + r.error : ''})`] }); continue; }
    if (r.status === 'timeout_ok') notes.push(`${label}: az időkorlát miatt jó, de nem bizonyítottan a legjobb megoldás`);
    out.push({ grid: r.grid, notes });
  }
  return out;
}
