// Web Worker: egy munkakör (vagy preferenciákkal összekötött munkakör-csoport) változatait számolja HiGHS-szal,
// hogy a felület közben ne akadjon meg.
import loadHighs from './vendor/highs.mjs';
import { generateGroupAlternatives } from './solver.js';

let highs = null;
const getHighs = async (force) => {
  if (!highs || force) highs = await loadHighs({ locateFile: (f) => new URL('./vendor/' + f, import.meta.url).href });
  return highs;
};

self.onmessage = async (e) => {
  const { id, prs, pairs, profiles, timeLimit } = e.data;
  try {
    const res = await generateGroupAlternatives(getHighs, prs, pairs || [], profiles, { timeLimit, onProgress: (ai) => self.postMessage({ id, progress: ai }) });
    self.postMessage({ id, done: res });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
