// Taranan 6 yüzü küpe yerleştirir; küp geçersiz çıkarsa yaygın tarama hatalarını
// (yanlış yöne çevrilmiş yüz, bir-iki yanlış okunmuş kare) tek anlamlı ise düzeltir.

import { SCAN_STEPS, isValidColors } from './cube.js';

function rotateGrid(grid, times) {
  let a = grid;
  for (let k = 0; k < times; k++) {
    const b = new Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) b[r * 3 + c] = a[(2 - c) * 3 + r];
    a = b;
  }
  return a;
}

/** grids[k]: k. taramanın görüntü sırasındaki 9 rengi. order[k]: o taramanın oturduğu adım. */
export function assemble(grids, order = [0, 1, 2, 3, 4, 5], rots = [0, 0, 0, 0, 0, 0]) {
  const colors = new Array(54).fill(-1);
  for (let k = 0; k < grids.length; k++) {
    const map = SCAN_STEPS[order[k]].map;
    const g = rots[k] ? rotateGrid(grids[k], rots[k]) : grids[k];
    for (let j = 0; j < 9; j++) colors[map[j]] = g[j];
  }
  return colors;
}

// Olası yer karışıklıkları: küp sola yerine sağa çevrilmiş (R ile L yer değiştirir),
// üst yerine alt gösterilmiş (U ile D yer değiştirir) ya da ikisi birden.
const ORDERS = [
  { order: [0, 1, 2, 3, 4, 5], cost: 0 },
  { order: [0, 3, 2, 1, 4, 5], cost: 2 },
  { order: [0, 1, 2, 3, 5, 4], cost: 2 },
  { order: [0, 3, 2, 1, 5, 4], cost: 4 },
];

function fixOrientation(grids) {
  let bestCost = Infinity;
  let best = new Map();
  for (const { order, cost: orderCost } of ORDERS) {
    for (let code = 0; code < 1024; code++) {
      const rots = [0, code & 3, (code >> 2) & 3, (code >> 4) & 3, (code >> 6) & 3, (code >> 8) & 3];
      const cost = orderCost + rots.reduce((n, r) => n + (r ? 1 : 0), 0);
      if (cost > bestCost) continue;
      const colors = assemble(grids, order, rots);
      if (!isValidColors(colors)) continue;
      if (cost < bestCost) {
        bestCost = cost;
        best = new Map();
      }
      best.set(colors.join(''), colors);
    }
  }
  return best.size === 1 ? [...best.values()][0] : null;
}

function fixColors(base) {
  const found = new Map();
  const tryIt = (colors, changed) => {
    if (isValidColors(colors)) found.set(colors.join(''), { colors, changed });
  };
  const free = [];
  for (let i = 0; i < 54; i++) if (i % 9 !== 4) free.push(i);

  for (const i of free) {
    for (let c = 0; c < 6; c++) {
      if (c === base[i]) continue;
      const t = base.slice();
      t[i] = c;
      tryIt(t, [i]);
    }
  }
  for (let a = 0; a < free.length; a++) {
    for (let b = a + 1; b < free.length; b++) {
      const i = free[a];
      const j = free[b];
      if (base[i] === base[j]) continue;
      const t = base.slice();
      t[i] = base[j];
      t[j] = base[i];
      tryIt(t, [i, j]);
    }
  }
  return found.size === 1 ? [...found.values()][0] : null;
}

/**
 * @returns {{colors:number[], status:'ok'|'oriented'|'recolored'|'invalid', changed:number[]}}
 */
export function analyzeScan(grids) {
  const base = assemble(grids);
  if (isValidColors(base)) return { colors: base, status: 'ok', changed: [] };

  const oriented = fixOrientation(grids);
  if (oriented) return { colors: oriented, status: 'oriented', changed: [] };

  const recolored = fixColors(base);
  if (recolored) return { colors: recolored.colors, status: 'recolored', changed: recolored.changed };

  return { colors: base, status: 'invalid', changed: [] };
}
