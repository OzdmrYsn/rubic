// Küp modeli: 54 kare, geometri, hamleler, tarama sırası ve geçerlilik denetimi.
//
// Kare sırası Kociemba düzenindedir: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53).
// Koordinatlar: x sağa, y yukarı, z izleyiciye doğru (sağ el sistemi).

export const FACES = ['U', 'R', 'F', 'D', 'L', 'B'];
const AXIS_INDEX = { x: 0, y: 1, z: 2 };

function geomOf(i) {
  const f = Math.floor(i / 9);
  const r = Math.floor((i % 9) / 3);
  const c = i % 3;
  switch (f) {
    case 0: return { pos: [c - 1, 1, r - 1], n: [0, 1, 0] };
    case 1: return { pos: [1, 1 - r, 1 - c], n: [1, 0, 0] };
    case 2: return { pos: [c - 1, 1 - r, 1], n: [0, 0, 1] };
    case 3: return { pos: [c - 1, -1, 1 - r], n: [0, -1, 0] };
    case 4: return { pos: [-1, 1 - r, c - 1], n: [-1, 0, 0] };
    default: return { pos: [1 - c, 1 - r, -1], n: [0, 0, -1] };
  }
}

export const GEOM = Array.from({ length: 54 }, (_, i) => geomOf(i));
export const geomKey = (pos, n) => `${pos.join(',')}|${n.join(',')}`;
const INDEX = new Map(GEOM.map((g, i) => [geomKey(g.pos, g.n), i]));
export const faceletAt = (pos, n) => INDEX.get(geomKey(pos, n));

// ---- 3x3 tamsayı dönme matrisleri -------------------------------------------------
const I3 = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
// Pozitif eksen etrafında +90° (sağ el kuralı)
const QUARTER = {
  x: [[1, 0, 0], [0, 0, -1], [0, 1, 0]],
  y: [[0, 0, 1], [0, 1, 0], [-1, 0, 0]],
  z: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
};
const matMul = (a, b) => a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const matVec = (m, v) => m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
const transpose = (m) => [0, 1, 2].map((i) => [0, 1, 2].map((j) => m[j][i]));
function rot(axis, quarters) {
  let m = I3;
  for (let k = ((quarters % 4) + 4) % 4; k > 0; k--) m = matMul(QUARTER[axis], m);
  return m;
}

// ---- Hamleler ---------------------------------------------------------------------
// q: saat yönündeki (yüze dışarıdan bakınca) tek hamlenin, pozitif eksen etrafındaki
// çeyrek tur sayısı.
export const MOVE_DEF = {
  U: { axis: 'y', layer: 1, q: -1 },
  D: { axis: 'y', layer: -1, q: 1 },
  R: { axis: 'x', layer: 1, q: -1 },
  L: { axis: 'x', layer: -1, q: 1 },
  F: { axis: 'z', layer: 1, q: -1 },
  B: { axis: 'z', layer: -1, q: 1 },
};

const PERM = {};
for (const face of FACES) {
  const { axis, layer, q } = MOVE_DEF[face];
  const m = rot(axis, q);
  const ai = AXIS_INDEX[axis];
  PERM[face] = GEOM.map((g, i) => (g.pos[ai] === layer ? faceletAt(matVec(m, g.pos), matVec(m, g.n)) : i));
}

export function parseMove(mv) {
  const face = mv[0];
  const turns = mv[1] === '2' ? 2 : mv[1] === "'" ? 3 : 1;
  return { face, turns };
}

export function invertMove(mv) {
  const { face, turns } = parseMove(mv);
  return turns === 2 ? `${face}2` : turns === 1 ? `${face}'` : face;
}

/** Hamleyi 54'lük bir diziye uygular; yeni dizi döndürür. */
export function applyMove(state, mv) {
  const { face, turns } = parseMove(mv);
  const perm = PERM[face];
  let s = state;
  for (let t = 0; t < turns; t++) {
    const next = new Array(54);
    for (let i = 0; i < 54; i++) next[perm[i]] = s[i];
    s = next;
  }
  return s;
}

/** Hamlenin CSS animasyonu için eksen, katman ve açı (derece). */
export function moveCss(mv) {
  const { face, turns } = parseMove(mv);
  const { axis, layer, q } = MOVE_DEF[face];
  const count = turns === 3 ? -1 : turns;
  // CSS'te y ekseni aşağı baktığı için x ve z dönüşlerinin işareti ters çevrilir.
  const angle = (axis === 'y' ? q : -q) * 90 * count;
  return { axis, axisIndex: AXIS_INDEX[axis], layer, angle };
}

export function randomMoves(n = 25) {
  const out = [];
  let last = '';
  while (out.length < n) {
    const face = FACES[Math.floor(Math.random() * 6)];
    if (face === last) continue;
    last = face;
    out.push(face + ['', "'", '2'][Math.floor(Math.random() * 3)]);
  }
  return out;
}

// ---- Tarama sırası -----------------------------------------------------------------
// Kullanıcı küpü kameranın önünde çevirir. Her adımda kameraya bakan yüzün 9 karesinin
// (görüntüde soldan sağa, yukarıdan aşağı) hangi kare indeksine denk geldiği hesaplanır.
const TURN = {
  left: { m: rot('y', -1), css: ['rotateY', -90] }, // ön yüz sola gider, sağ yüz öne gelir
  down: { m: rot('x', 1), css: ['rotateX', -90] }, // üst yüz öne gelir
  flip: { m: rot('y', 2), css: ['rotateY', -180] }, // arka yüz öne gelir
};

export const SCAN_STEPS = [
  { face: 'F', turn: null },
  { face: 'R', turn: 'left' },
  { face: 'B', turn: 'left' },
  { face: 'L', turn: 'left' },
  { face: 'U', turn: 'down' },
  { face: 'D', turn: 'flip' },
];

{
  let pose = I3;
  let chain = '';
  for (const step of SCAN_STEPS) {
    step.prevChain = chain;
    if (step.turn) {
      const t = TURN[step.turn];
      pose = matMul(t.m, pose);
      step.css = t.css;
      chain = `${t.css[0]}(${t.css[1]}deg) ${chain}`.trim();
    }
    step.chain = chain;
    const inv = transpose(pose);
    step.map = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        step.map.push(faceletAt(matVec(inv, [c - 1, 1 - r, 1]), matVec(inv, [0, 0, 1])));
      }
    }
  }
}

// ---- Geçerlilik --------------------------------------------------------------------
const [U, R, F, D, L, B] = [0, 1, 2, 3, 4, 5];
export const CORNER_FACELET = [
  [8, 9, 20], [6, 18, 38], [0, 36, 47], [2, 45, 11],
  [29, 26, 15], [27, 44, 24], [33, 53, 42], [35, 17, 51],
];
const CORNER_COLOR = [
  [U, R, F], [U, F, L], [U, L, B], [U, B, R],
  [D, F, R], [D, L, F], [D, B, L], [D, R, B],
];
export const EDGE_FACELET = [
  [5, 10], [7, 19], [3, 37], [1, 46], [32, 16], [28, 25],
  [30, 43], [34, 52], [23, 12], [21, 41], [50, 39], [48, 14],
];
const EDGE_COLOR = [
  [U, R], [U, F], [U, L], [U, B], [D, R], [D, F],
  [D, L], [D, B], [F, R], [F, L], [B, L], [B, R],
];

function permParity(p) {
  let s = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) s ^= 1;
  return s;
}

/**
 * Yüz indeksleriyle (0-5) verilen 54 karenin gerçek bir küp olup olmadığına bakar.
 * Geçerliyse null, değilse sorunun kodunu döndürür.
 */
export function validateFacelets(f) {
  for (let i = 0; i < 6; i++) if (f[i * 9 + 4] !== i) return 'centers';

  const cp = new Array(8);
  let cmask = 0;
  let twist = 0;
  for (let i = 0; i < 8; i++) {
    const cf = CORNER_FACELET[i];
    let ori = -1;
    for (let o = 0; o < 3; o++) {
      const v = f[cf[o]];
      if (v === U || v === D) { ori = o; break; }
    }
    if (ori < 0) return 'corner';
    const ud = f[cf[ori]];
    const c1 = f[cf[(ori + 1) % 3]];
    const c2 = f[cf[(ori + 2) % 3]];
    let found = -1;
    for (let j = 0; j < 8; j++) {
      const cc = CORNER_COLOR[j];
      if (cc[0] === ud && cc[1] === c1 && cc[2] === c2) { found = j; break; }
    }
    if (found < 0 || (cmask >> found) & 1) return 'corner';
    cmask |= 1 << found;
    cp[i] = found;
    twist += ori;
  }

  const ep = new Array(12);
  let emask = 0;
  let flip = 0;
  for (let i = 0; i < 12; i++) {
    const a = f[EDGE_FACELET[i][0]];
    const b = f[EDGE_FACELET[i][1]];
    let found = -1;
    for (let j = 0; j < 12; j++) {
      const ec = EDGE_COLOR[j];
      if (ec[0] === a && ec[1] === b) { found = j; break; }
      if (ec[0] === b && ec[1] === a) { found = j; flip ^= 1; break; }
    }
    if (found < 0 || (emask >> found) & 1) return 'edge';
    emask |= 1 << found;
    ep[i] = found;
  }

  if (twist % 3 !== 0) return 'twist';
  if (flip !== 0) return 'flip';
  if (permParity(cp) !== permParity(ep)) return 'parity';
  return null;
}

/**
 * Renk kimlikleriyle (0-5, boş = -1) verilen küpü denetler.
 * { error, facelets, text } döndürür; error null ise text çözücüye verilecek dizgidir.
 */
export function checkColors(colors) {
  for (let i = 0; i < 54; i++) if (!(colors[i] >= 0)) return { error: 'unset' };
  const faceOf = new Array(6).fill(-1);
  for (let f = 0; f < 6; f++) {
    const c = colors[f * 9 + 4];
    if (faceOf[c] !== -1) return { error: 'centers' };
    faceOf[c] = f;
  }
  const counts = new Array(6).fill(0);
  const facelets = new Array(54);
  for (let i = 0; i < 54; i++) {
    counts[colors[i]]++;
    facelets[i] = faceOf[colors[i]];
  }
  if (counts.some((n) => n !== 9)) return { error: 'counts', counts };
  const error = validateFacelets(facelets);
  if (error) return { error };
  return { error: null, facelets, text: facelets.map((v) => FACES[v]).join('') };
}

export const isValidColors = (colors) => checkColors(colors).error === null;

export function isSolvedColors(colors) {
  for (let i = 0; i < 54; i++) if (colors[i] !== colors[Math.floor(i / 9) * 9 + 4]) return false;
  return true;
}
