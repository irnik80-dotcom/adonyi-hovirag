// Web Worker: egy munkakör változatait számolja HiGHS-szal, hogy a felület közben ne akadjon meg.
import loadHighs from './vendor/highs.mjs';
import { generateRoleAlternatives } from './solver.js';

let highs = null;
const getHighs = async (force) => {
  if (!highs || force) highs = await loadHighs({ locateFile: (f) => new URL('./vendor/' + f, import.meta.url).href });
  return highs;
};

self.onmessage = async (e) => {
  const { id, pr, profiles, timeLimit } = e.data;
  try {
    const res = await generateRoleAlternatives(getHighs, pr, profiles, { timeLimit, onProgress: (ai) => self.postMessage({ id, progress: ai }) });
    self.postMessage({ id, done: res });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message || err) });
  }
};
