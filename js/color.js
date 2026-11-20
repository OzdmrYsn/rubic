// Renk işlemleri: kameradan gelen RGB değerlerini 6 küp rengine ayırır.

export const COLORS = [
  { key: 'W', name: 'Beyaz', css: '#f4f5f7', ref: [225, 225, 225] },
  { key: 'Y', name: 'Sarı', css: '#ffd60a', ref: [215, 200, 50] },
  { key: 'R', name: 'Kırmızı', css: '#e5322d', ref: [185, 30, 35] },
  { key: 'O', name: 'Turuncu', css: '#ff8f1f', ref: [235, 110, 30] },
  { key: 'G', name: 'Yeşil', css: '#1fb655', ref: [25, 155, 75] },
  { key: 'B', name: 'Mavi', css: '#2274e6', ref: [20, 75, 180] },
];
export const UNSET_CSS = '#3b404c';
export const colorCss = (id) => (id >= 0 ? COLORS[id].css : UNSET_CSS);

export function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

export function rgbToLab(r, g, b) {
  const lin = (v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [R, G, B] = [lin(r), lin(g), lin(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

// Parlaklık farkı (gölge, parlama) renk tonu farkından daha az önemsenir.
function labDist(p, q) {
  const dl = p[0] - q[0];
  const da = p[1] - q[1];
  const db = p[2] - q[2];
  return Math.sqrt(0.35 * dl * dl + da * da + db * db);
}

/** Tek bir karenin rengini kabaca tahmin eder (canlı önizleme için). */
export function guessColor([r, g, b]) {
  const [h, s] = rgbToHsv(r, g, b);
  if (s < 0.22) return 0;
  if (h < 12 || h >= 330) return 2;
  if (h < 40) return 3;
  if (h < 80) return 1;
  if (h < 170) return 4;
  if (h < 280) return 5;
  return 2;
}

const PERMS6 = (() => {
  const out = [];
  const go = (rest, acc) => {
    if (!rest.length) return void out.push(acc);
    rest.forEach((v, i) => go([...rest.slice(0, i), ...rest.slice(i + 1)], [...acc, v]));
  };
  go([0, 1, 2, 3, 4, 5], []);
  return out;
})();

/** 6 orta karenin her birine farklı bir küp rengi verir (toplam uzaklığı en az olan eşleme). */
export function nameCenters(centersRgb) {
  const labs = centersRgb.map((c) => rgbToLab(...c));
  const refs = COLORS.map((c) => rgbToLab(...c.ref));
  let best = PERMS6[0];
  let bestCost = Infinity;
  for (const perm of PERMS6) {
    let cost = 0;
    for (let i = 0; i < 6 && cost < bestCost; i++) cost += labDist(labs[i], refs[perm[i]]);
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  }
  return best;
}

// Macar algoritması: kare maliyet matrisinde en düşük toplamlı eşleme. sonuç[satır] = sütun
function hungarian(cost) {
  const n = cost.length;
  const u = new Float64Array(n + 1);
  const v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1);
  const way = new Int32Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Float64Array(n + 1).fill(Infinity);
    const used = new Uint8Array(n + 1);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else {
          minv[j] -= delta;
        }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const res = new Int32Array(n);
  for (let j = 1; j <= n; j++) res[p[j] - 1] = j - 1;
  return res;
}

/**
 * 6 taramanın ham renklerini (her biri 9 RGB) küp renklerine ayırır.
 * Orta kareler referans alınır ve her renkten tam 9 kare olacak şekilde dengeli atama yapılır;
 * böylece ışığa göre kayan kırmızı/turuncu ya da beyaz/sarı ayrımı tek tek tahminden çok daha sağlamdır.
 * @returns {number[][]} her tarama için 9 renk kimliği
 */
export function clusterScans(rawGrids) {
  const names = nameCenters(rawGrids.map((g) => g[4]));
  const items = [];
  rawGrids.forEach((g, k) => g.forEach((rgb, j) => {
    if (j !== 4) items.push({ k, j, lab: rgbToLab(...rgb) });
  }));
  const centers = rawGrids.map((g) => rgbToLab(...g[4]));
  let anchors = centers;
  let assign = null;
  for (let iter = 0; iter < 4; iter++) {
    const cost = items.map((it) => {
      const row = new Array(48);
      for (let a = 0; a < 6; a++) {
        const d = labDist(it.lab, anchors[a]);
        for (let s = 0; s < 8; s++) row[a * 8 + s] = d;
      }
      return row;
    });
    const next = Array.from(hungarian(cost), (col) => Math.floor(col / 8));
    if (assign && next.every((a, i) => a === assign[i])) break;
    assign = next;
    anchors = centers.map((c, a) => {
      const sum = [c[0] * 2, c[1] * 2, c[2] * 2];
      let n = 2;
      items.forEach((it, i) => {
        if (assign[i] !== a) return;
        sum[0] += it.lab[0]; sum[1] += it.lab[1]; sum[2] += it.lab[2];
        n++;
      });
      return sum.map((v) => v / n);
    });
  }
  const out = rawGrids.map((g, k) => {
    const row = new Array(9).fill(-1);
    row[4] = names[k];
    return row;
  });
  items.forEach((it, i) => { out[it.k][it.j] = names[assign[i]]; });
  return out;
}

/** İki orta karenin şüpheli derecede benzer olup olmadığı (aynı yüz iki kez mi tarandı?). */
export function looksSame(rgbA, rgbB) {
  return labDist(rgbToLab(...rgbA), rgbToLab(...rgbB)) < 9;
}
