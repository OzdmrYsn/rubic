// Çalıştırmak için: node test/model.test.mjs
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  FACES, GEOM, SCAN_STEPS, CORNER_FACELET, EDGE_FACELET,
  applyMove, invertMove, randomMoves, checkColors, isSolvedColors,
} from '../js/cube.js';
import { analyzeScan, assemble } from '../js/repair.js';

const require = createRequire(import.meta.url);
const Cube = require('../vendor/cubejs/cube.js');
require('../vendor/cubejs/solve.js');

const SOLVED = Array.from({ length: 54 }, (_, i) => Math.floor(i / 9));
const toText = (s) => s.map((v) => FACES[v]).join('');
let passed = 0;
const test = (name, fn) => { fn(); passed++; console.log(`  ok  ${name}`); };

test('köşe ve kenar tabloları geometriyle tutarlı', () => {
  for (const tri of CORNER_FACELET) {
    const p = tri.map((i) => GEOM[i].pos.join(','));
    assert.equal(new Set(p).size, 1);
    assert.equal(GEOM[tri[0]].pos.filter((v) => v !== 0).length, 3);
  }
  for (const pair of EDGE_FACELET) {
    const p = pair.map((i) => GEOM[i].pos.join(','));
    assert.equal(new Set(p).size, 1);
    assert.equal(GEOM[pair[0]].pos.filter((v) => v !== 0).length, 2);
  }
});

test('18 hamlenin tamamı cubejs ile aynı sonucu verir', () => {
  for (const face of FACES) {
    for (const suffix of ['', "'", '2']) {
      const mv = face + suffix;
      assert.equal(toText(applyMove(SOLVED, mv)), new Cube().move(mv).asString(), mv);
    }
  }
});

test('rastgele hamle dizileri cubejs ile aynı sonucu verir', () => {
  for (let t = 0; t < 200; t++) {
    const moves = randomMoves(30);
    let s = SOLVED;
    for (const mv of moves) s = applyMove(s, mv);
    assert.equal(toText(s), new Cube().move(moves.join(' ')).asString());
    for (const mv of moves.slice().reverse()) s = applyMove(s, invertMove(mv));
    assert.ok(isSolvedColors(s));
  }
});

test('tarama adımları doğru yüzleri ve yönleri okur', () => {
  SCAN_STEPS.forEach((step) => {
    const f = FACES.indexOf(step.face);
    assert.deepEqual(new Set(step.map.map((i) => Math.floor(i / 9))), new Set([f]));
    assert.equal(step.map[4], f * 9 + 4);
  });
  // İlk dört yüz dik tutulur: görüntü standart düzenle aynıdır.
  for (let k = 0; k < 4; k++) {
    const f = FACES.indexOf(SCAN_STEPS[k].face);
    assert.deepEqual(SCAN_STEPS[k].map, [0, 1, 2, 3, 4, 5, 6, 7, 8].map((j) => f * 9 + j));
  }
  // Üst yüz, sol yüz öndeyken öne yatırılır: görüntünün alt kenarı L'ye, üst kenarı R'ye komşudur.
  const u = SCAN_STEPS[4].map;
  assert.deepEqual([u[6], u[7], u[8]].sort(), [0, 3, 6]); // U'nun sol sütunu (L komşusu)
  assert.deepEqual([u[0], u[1], u[2]].sort(), [2, 5, 8]); // U'nun sağ sütunu (R komşusu)
  assert.deepEqual([u[2], u[5], u[8]].sort(), [6, 7, 8]); // görüntünün sağı F'ye komşu
  // Alt yüz: yarım tur sonra üst kenar hâlâ R'ye, alt kenar L'ye komşudur; sağ kenar B'ye.
  const d = SCAN_STEPS[5].map.map((i) => i - 27);
  assert.deepEqual([d[0], d[1], d[2]].sort(), [2, 5, 8]); // D'nin sağ sütunu (R komşusu)
  assert.deepEqual([d[6], d[7], d[8]].sort(), [0, 3, 6]); // D'nin sol sütunu (L komşusu)
  assert.deepEqual([d[2], d[5], d[8]].sort(), [6, 7, 8]); // görüntünün sağı B'ye komşu
});

const scramble = (n = 30) => randomMoves(n).reduce((s, mv) => applyMove(s, mv), SOLVED);
const scanOf = (state, order = [0, 1, 2, 3, 4, 5]) => order.map((k) => SCAN_STEPS[k].map.map((i) => state[i]));
const rotateGrid = (g) => [g[6], g[3], g[0], g[7], g[4], g[1], g[8], g[5], g[2]];

test('geçerlilik denetimi: karışık küpler geçerli, bozulmuşlar geçersiz', () => {
  for (let t = 0; t < 300; t++) {
    const s = scramble();
    assert.equal(checkColors(s).error, null);
    assert.equal(checkColors(s).text, toText(s));
    // Tek köşeyi çevir
    const c = CORNER_FACELET[t % 8];
    const twisted = s.slice();
    [twisted[c[0]], twisted[c[1]], twisted[c[2]]] = [s[c[1]], s[c[2]], s[c[0]]];
    assert.equal(checkColors(twisted).error, 'twist');
    // Tek kenarı ters çevir
    const e = EDGE_FACELET[t % 12];
    const flipped = s.slice();
    [flipped[e[0]], flipped[e[1]]] = [s[e[1]], s[e[0]]];
    assert.equal(checkColors(flipped).error, 'flip');
    // İki kenarı yer değiştir
    const e2 = EDGE_FACELET[(t + 5) % 12];
    const swapped = s.slice();
    [swapped[e[0]], swapped[e[1]], swapped[e2[0]], swapped[e2[1]]] = [s[e2[0]], s[e2[1]], s[e[0]], s[e[1]]];
    assert.equal(checkColors(swapped).error, 'parity');
  }
});

test('tarama → küp: doğru tarama aynen geri kurulur', () => {
  for (let t = 0; t < 100; t++) {
    const s = scramble();
    const res = analyzeScan(scanOf(s));
    assert.equal(res.status, 'ok');
    assert.deepEqual(res.colors, s);
    assert.deepEqual(assemble(scanOf(s)), s);
  }
});

test('yanlış yöne çevrilmiş yüzler otomatik düzelir', () => {
  let fixed = 0;
  const N = 60;
  for (let t = 0; t < N; t++) {
    const s = scramble();
    const grids = scanOf(s);
    // Üst ve alt yüz rastgele döndürülmüş, yan yüzlerden biri baş aşağı
    for (let k = 0; k < 1 + (t % 3); k++) grids[4] = rotateGrid(grids[4]);
    if (t % 2) grids[5] = rotateGrid(grids[5]);
    if (t % 5 === 0) grids[2] = rotateGrid(rotateGrid(grids[2]));
    const res = analyzeScan(grids);
    if (res.status === 'oriented') {
      assert.deepEqual(res.colors, s);
      fixed++;
    } else {
      assert.equal(res.status, 'invalid');
    }
  }
  assert.ok(fixed >= N - 1, `yalnızca ${fixed}/${N} düzeldi`);
});

test('küp ters yöne çevrilerek taranmışsa (sağ/sol yer değişmiş) düzelir', () => {
  for (let t = 0; t < 20; t++) {
    const s = scramble();
    const res = analyzeScan(scanOf(s, [0, 3, 2, 1, 4, 5]));
    assert.equal(res.status, 'oriented');
    assert.deepEqual(res.colors, s);
  }
});

test('bir-iki yanlış okunmuş kare otomatik düzelir', () => {
  let fixed = 0;
  const N = 60;
  for (let t = 0; t < N; t++) {
    const s = scramble();
    const bad = s.slice();
    const free = [...Array(54).keys()].filter((i) => i % 9 !== 4);
    const i = free[(t * 7) % free.length];
    let changed;
    if (t % 2) {
      bad[i] = (s[i] + 1 + (t % 5)) % 6; // tek kare yanlış renk
      changed = [i];
    } else {
      const j = free.find((x) => s[x] !== s[i]); // iki kare yer değiştirmiş
      [bad[i], bad[j]] = [s[j], s[i]];
      changed = [i, j].sort((a, b) => a - b);
    }
    const res = analyzeScan(scanOf(bad));
    if (res.status === 'recolored') {
      assert.deepEqual(res.colors, s);
      assert.deepEqual(res.changed.slice().sort((a, b) => a - b), changed);
      fixed++;
    }
  }
  assert.ok(fixed >= N * 0.9, `yalnızca ${fixed}/${N} düzeldi`);
});

test('çözücü: çözüm uygulanınca küp çözülür', () => {
  Cube.initSolver();
  let total = 0;
  const N = 40;
  for (let t = 0; t < N; t++) {
    const s = scramble();
    const { text, error } = checkColors(s);
    assert.equal(error, null);
    const solution = Cube.fromString(text).solve().trim().split(/\s+/);
    assert.ok(solution.every((mv) => /^[URFDLB][2']?$/.test(mv)), solution.join(' '));
    const end = solution.reduce((st, mv) => applyMove(st, mv), s);
    assert.ok(isSolvedColors(end));
    total += solution.length;
  }
  console.log(`      ortalama çözüm uzunluğu: ${(total / N).toFixed(1)} hamle`);
});

console.log(`\n${passed} test geçti`);
