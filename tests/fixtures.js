// Mesterséges tesztadatok (kitalált nevek – nem valódi dolgozók)
import { newPlan } from '../public/nyar/model.js';

export const GROUPS = [{ id: 1, name: 'Pedagógusok' }, { id: 2, name: 'Pedagógiai asszisztensek' }, { id: 3, name: 'Dajkák' }, { id: 4, name: 'Egyéb' }];
export function makeWorkers({ ped = 11, asz = 4, daj = 8 } = {}) {
  const out = []; let id = 100;
  const add = (n, g, p) => { for (let i = 1; i <= n; i++) out.push({ id: id++, name: `${p} ${String(i).padStart(2, '0')}`, active: 1, group_ids: String(g) }); };
  add(ped, 1, 'Pedagógus'); add(asz, 2, 'Asszisztens'); add(daj, 3, 'Dajka');
  out.push({ id: 999, name: 'Karbantartó', active: 1, group_ids: '4' });
  return out;
}
// 2027-es törvényi ünnepek (a fő app holidaysOf-ja szerint a nyári időszakban csak augusztus 20.)
export const HOLIDAYS_2027 = [{ date: '2027-08-20', kind: 'off', label: 'Államalapítás ünnepe' }];
// mode: a régebbi tesztek a pihenőnapos módot vizsgálják; az új alapértelmezés a 'mindenki'
// sub: a régebbi tesztek helyettesítés nélkül futnak; az új alapértelmezés: az asszisztens helyettesítheti az óvónőt
export function makePlan(opts = {}) {
  const p = newPlan(2027, GROUPS, makeWorkers(opts)); p.mode = opts.mode || 'pihenovel';
  if (!opts.sub) for (const r of p.roles) r.subBy = null;
  return p;
}
