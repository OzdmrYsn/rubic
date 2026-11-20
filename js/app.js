// Ekran akışı: ana ekran → tarama → renk kontrolü → adım adım çözüm.

import { FACES, SCAN_STEPS, applyMove, invertMove, randomMoves, checkColors, isSolvedColors } from './cube.js';
import { COLORS, colorCss, guessColor, clusterScans, looksSame } from './color.js';
import { analyzeScan } from './repair.js';
import { Scanner } from './scanner.js';
import { Cube3D } from './cube3d.js';

const $ = (sel) => document.querySelector(sel);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const css54 = (colors) => colors.map((id) => (id >= 0 ? colorCss(id) : null));

// Elle giriş ve örnek küp için standart renk düzeni: üst beyaz, ön yeşil, sağ kırmızı.
const STANDARD = [0, 2, 4, 1, 3, 5]; // U R F D L B → renk kimliği
const solvedColors = () => Array.from({ length: 54 }, (_, i) => STANDARD[Math.floor(i / 9)]);

// ---- Ekranlar ----------------------------------------------------------------------
let current = 'home';
function show(name) {
  current = name;
  for (const id of ['home', 'scan', 'review', 'solve']) $(`#${id}`).classList.toggle('active', id === name);
  keepAwake(name === 'scan' || name === 'solve');
}

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
    }
  } catch { /* ekranı açık tutmak şart değil */ }
}

// ---- Çözücü (arka planda) ----------------------------------------------------------
const solver = (() => {
  let worker = null;
  let ready = false;
  let nextId = 0;
  const waiting = new Map();
  try {
    worker = new Worker(new URL('./solver-worker.js', import.meta.url));
    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === 'ready') {
        ready = true;
        return;
      }
      const cb = waiting.get(msg.id);
      if (!cb) return;
      waiting.delete(msg.id);
      if (msg.type === 'solution') cb.resolve(msg.solution);
      else cb.reject(new Error(msg.message));
    };
    worker.onerror = () => {
      for (const cb of waiting.values()) cb.reject(new Error('Çözücü yüklenemedi'));
      waiting.clear();
    };
    worker.postMessage({ type: 'init' });
  } catch { /* aşağıda solve() hata verir */ }
  return {
    get ready() { return ready; },
    solve(facelets) {
      if (!worker) return Promise.reject(new Error('Çözücü başlatılamadı'));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        waiting.set(id, { resolve, reject });
        worker.postMessage({ type: 'solve', id, facelets });
      });
    },
  };
})();

// ---- Ana ekran ---------------------------------------------------------------------
const hero = new Cube3D($('#hero-cube'), { fill: 0.5 });
(async function heroLoop() {
  let state = solvedColors();
  hero.setColors(css54(state));
  for (;;) {
    const moves = randomMoves(7);
    const all = [...moves, ...moves.slice().reverse().map(invertMove)];
    for (let i = 0; i < all.length; i++) {
      await sleep(i === moves.length ? 900 : 260);
      while (current !== 'home' || document.hidden) await sleep(400);
      state = applyMove(state, all[i]);
      await hero.turn(all[i], css54(state), 620);
    }
    await sleep(1600);
  }
})();

$('#btn-scan').addEventListener('click', () => startScan());
$('#btn-manual').addEventListener('click', () => openManual());
$('#btn-demo').addEventListener('click', () => {
  const colors = randomMoves(25).reduce((s, mv) => applyMove(s, mv), solvedColors());
  openReview(colors, { note: 'Bu bir örnek küp. Nasıl çalıştığını görmek için Çöz’e bas.' });
});

function openManual() {
  const colors = new Array(54).fill(-1);
  for (let f = 0; f < 6; f++) colors[f * 9 + 4] = STANDARD[f];
  openReview(colors, { tip: 'Alttan rengi seç, sonra o renkteki karelere dokun. Küpü ortadaki renklere göre tut.' });
}

// ---- Tarama ------------------------------------------------------------------------
const SCAN_TEXT = [
  'Küpün bir yüzünü ızgaraya oturt ve <b>çek</b>. Sonra küpü ekrandaki gibi çevireceksin.',
  'Küpü <b>sola çevir</b>: sağdaki yüz kameraya gelsin.',
  'Bir kez daha <b>sola çevir</b>.',
  'Son kez <b>sola çevir</b>.',
  'Şimdi küpü <b>öne yatır</b>: üstteki yüz kameraya gelsin.',
  'Küpü <b>yarım tur döndür</b>: arkada kalan yüz kameraya gelsin.',
];

const scanner = new Scanner($('#cam video'));
const guide = new Cube3D($('#guide-cube'), { interactive: false, rx: -22, ry: -28, fill: 0.56 });
const camEl = $('#cam');
const camCells = [...$('#cam-grid').children];
const scan = { step: 0, raws: [], guesses: [], torch: false };

scanner.onSample = (rgbs) => {
  rgbs.forEach((rgb, j) => camCells[j].style.setProperty('--c', colorCss(guessColor(rgb))));
  camEl.classList.add('live');
  $('#scan-shoot').disabled = false;
};

async function startScan() {
  scan.step = 0;
  scan.raws = [];
  scan.guesses = [];
  show('scan');
  renderScan();
  await openCamera();
}

async function openCamera() {
  camEl.classList.remove('live');
  $('#cam-msg').classList.remove('show');
  $('#scan-shoot').disabled = true;
  scan.torch = false;
  $('#scan-torch').classList.remove('on');
  $('#scan-torch').hidden = true;
  try {
    scanner.stop();
    await scanner.start();
    if (current !== 'scan') return scanner.stop();
    $('#scan-torch').hidden = !scanner.torchSupported;
  } catch (err) {
    const text = {
      NotAllowedError: 'Kamera izni verilmedi. Tarayıcının site ayarlarından kameraya izin verip tekrar dene.',
      NotFoundError: 'Bu cihazda kamera bulunamadı.',
      NotReadableError: 'Kamera başka bir uygulama tarafından kullanılıyor olabilir. Onu kapatıp tekrar dene.',
      NotSupportedError: 'Bu tarayıcı kamerayı açamıyor. Safari ya da Chrome ile dene.',
    }[err && err.name] || 'Kamera açılamadı. Tekrar dene ya da renkleri elle gir.';
    $('#cam-msg-text').textContent = text;
    $('#cam-msg').classList.add('show');
  }
}

function closeCamera() {
  scanner.stop();
  guide.stopPoseLoop();
  camEl.classList.remove('live');
}

function renderScan() {
  const k = scan.step;
  const step = SCAN_STEPS[k];
  [...$('#scan-dots').children].forEach((dot, i) => {
    dot.className = i < k ? 'done' : i === k ? 'now' : '';
  });
  $('#guide-step').textContent = `Yüz ${k + 1} / 6`;
  $('#guide-msg').innerHTML = SCAN_TEXT[k];
  $('#scan-undo').disabled = k === 0;

  // Kılavuz küp: taranan yüzler renkli, kalanlar gri; gereken çevirme hareketi döngüde oynar.
  const colors = new Array(54).fill(null);
  scan.guesses.forEach((g, i) => g.forEach((id, j) => { colors[SCAN_STEPS[i].map[j]] = colorCss(id); }));
  guide.setColors(colors);
  if (step.turn) guide.loopPose(step.prevChain, step.css[0], step.css[1]);
  else guide.setPose('');
}

let toastTimer = null;
function toast(text) {
  const el = $('#scan-toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 4500);
}

function shoot() {
  const raw = scanner.current();
  if (!raw || scan.step > 5) return;
  const repeated = scan.raws.some((g) => looksSame(g[4], raw[4]));
  scan.raws.push(raw);
  scan.guesses.push(raw.map(guessColor));
  scan.step++;

  const flash = $('#cam-flash');
  flash.classList.remove('go');
  void flash.offsetWidth;
  flash.classList.add('go');
  if (navigator.vibrate) navigator.vibrate(15);

  if (scan.step === 6) return finishScan();
  renderScan();
  if (repeated) toast('Bu yüzün ortası daha önce taradığın bir yüze çok benziyor. Aynı yüzü iki kez göstermediğinden emin ol.');
}

function finishScan() {
  closeCamera();
  const grids = clusterScans(scan.raws);
  const res = analyzeScan(grids);
  const note = {
    oriented: 'Bir yüz farklı yönde taranmış; yüzlerin yönü otomatik düzeltildi.',
    recolored: `${res.changed.length} kare küp kurallarına göre otomatik düzeltildi (çerçeveli). Küpünle karşılaştır.`,
  }[res.status];
  openReview(res.colors, { note, marks: res.changed });
}

$('#scan-shoot').addEventListener('click', shoot);
$('#scan-undo').addEventListener('click', () => {
  if (scan.step === 0) return;
  scan.step--;
  scan.raws.pop();
  scan.guesses.pop();
  renderScan();
});
$('#scan-back').addEventListener('click', () => {
  closeCamera();
  show('home');
});
$('#scan-torch').addEventListener('click', async () => {
  const want = !scan.torch;
  if (await scanner.setTorch(want)) scan.torch = want;
  $('#scan-torch').classList.toggle('on', scan.torch);
});
$('#cam-retry').addEventListener('click', openCamera);
$('#cam-manual').addEventListener('click', () => {
  closeCamera();
  openManual();
});

// Sekme arka plana gidince telefon kamerayı kapatabilir; geri dönünce yeniden aç.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (current === 'scan' || current === 'solve') keepAwake(true);
  if (current === 'scan') {
    const track = scanner.track;
    if (!track || track.readyState !== 'live') openCamera();
  }
});

// ---- Renk kontrolü -----------------------------------------------------------------
const FACE_TR = { U: 'Üst', R: 'Sağ', F: 'Ön', D: 'Alt', L: 'Sol', B: 'Arka' };
const NET_POS = { U: [2, 1], L: [1, 2], F: [2, 2], R: [3, 2], B: [4, 2], D: [2, 3] };
const DEFAULT_TIP = 'Küpünle karşılaştır. Yanlış kare varsa alttan rengi seç, kareye dokun.';
const review = { colors: [], selected: 0, marks: new Set(), note: '', busy: false };

const netCells = new Array(54);
FACES.forEach((face, f) => {
  const box = document.createElement('div');
  box.className = 'face';
  box.style.gridColumn = NET_POS[face][0];
  box.style.gridRow = NET_POS[face][1];
  for (let j = 0; j < 9; j++) {
    const i = f * 9 + j;
    const b = document.createElement('button');
    if (j === 4) b.textContent = FACE_TR[face];
    b.addEventListener('click', () => paint(i));
    netCells[i] = b;
    box.append(b);
  }
  $('#net').append(box);
});

const paletteBtns = COLORS.map((c, id) => {
  const b = document.createElement('button');
  b.style.setProperty('--c', c.css);
  b.addEventListener('click', () => {
    review.selected = id;
    renderReview();
  });
  $('#palette').append(b);
  return b;
});

function openReview(colors, { note = '', marks = [], tip = DEFAULT_TIP } = {}) {
  review.colors = colors.slice();
  review.marks = new Set(marks);
  review.note = note;
  review.busy = false;
  $('#review-tip').textContent = tip;
  show('review');
  renderReview();
}

function paint(i) {
  if (review.busy || review.colors[i] === review.selected) return;
  review.colors[i] = review.selected;
  review.marks.delete(i);
  review.note = '';
  renderReview();
}

function reviewProblem() {
  const res = checkColors(review.colors);
  if (!res.error) return null;
  if (res.error === 'unset') return 'Gri kareleri doldur: alttan rengi seç, kareye dokun.';
  if (res.error === 'centers') return 'Her yüzün orta karesi farklı renkte olmalı.';
  if (res.error === 'counts') {
    const off = COLORS.map((c, id) => (res.counts[id] !== 9 ? `${c.name} ${res.counts[id]}` : null)).filter(Boolean);
    return `Her renkten tam 9 kare olmalı. Şu an: ${off.join(', ')}.`;
  }
  return 'Bu dizilim gerçek bir küpte olamaz. Bir-iki kare yanlış okunmuş olabilir: küpünle karşılaştırıp düzelt ya da yeniden tara.';
}

function renderReview() {
  const counts = new Array(6).fill(0);
  review.colors.forEach((id, i) => {
    if (id >= 0) counts[id]++;
    netCells[i].style.setProperty('--c', colorCss(id));
    netCells[i].classList.toggle('marked', review.marks.has(i));
    netCells[i].setAttribute('aria-label', id >= 0 ? COLORS[id].name : 'Boş');
  });
  paletteBtns.forEach((b, id) => {
    b.textContent = counts[id];
    b.classList.toggle('sel', id === review.selected);
    b.classList.toggle('off', counts[id] !== 9);
    b.setAttribute('aria-label', `${COLORS[id].name}: ${counts[id]} kare`);
  });

  const problem = reviewProblem();
  const solved = !problem && isSolvedColors(review.colors);
  const status = $('#review-status');
  status.className = `status ${problem ? 'bad' : 'ok'}`;
  status.textContent = problem
    || (solved ? 'Bu küp zaten çözülmüş.' : review.note || 'Küp geçerli, çözmeye hazır.');
  const btn = $('#review-solve');
  btn.disabled = !!problem || solved || review.busy;
  btn.textContent = review.busy ? (solver.ready ? 'Çözülüyor…' : 'Çözücü hazırlanıyor…') : 'Çöz';
}

$('#review-solve').addEventListener('click', async () => {
  const res = checkColors(review.colors);
  if (res.error || review.busy) return;
  review.busy = true;
  renderReview();
  try {
    const solution = await solver.solve(res.text);
    review.busy = false;
    openSolve(review.colors, solution.split(/\s+/).filter(Boolean));
  } catch {
    review.busy = false;
    renderReview();
    $('#review-status').className = 'status bad';
    $('#review-status').textContent = 'Çözüm hesaplanamadı. Sayfayı yenileyip tekrar dene.';
  }
});
$('#review-rescan').addEventListener('click', () => startScan());
$('#review-back').addEventListener('click', () => show('home'));

// ---- Çözüm -------------------------------------------------------------------------
const MOVE_TEXT = {
  U: 'Üst katmanı sola çevir',
  "U'": 'Üst katmanı sağa çevir',
  U2: 'Üst katmanı yarım tur çevir',
  D: 'Alt katmanı sağa çevir',
  "D'": 'Alt katmanı sola çevir',
  D2: 'Alt katmanı yarım tur çevir',
  R: 'Sağ katmanı yukarı çevir',
  "R'": 'Sağ katmanı aşağı çevir',
  R2: 'Sağ katmanı yarım tur çevir',
  L: 'Sol katmanı aşağı çevir',
  "L'": 'Sol katmanı yukarı çevir',
  L2: 'Sol katmanı yarım tur çevir',
  F: 'Ön yüzü saat yönünde çevir',
  "F'": 'Ön yüzü saat yönünün tersine çevir',
  F2: 'Ön yüzü yarım tur çevir',
  B: 'Arka yüzü çevir: üst kenarı sola gitsin',
  "B'": 'Arka yüzü çevir: üst kenarı sağa gitsin',
  B2: 'Arka yüzü yarım tur çevir',
};

const stage = new Cube3D($('#solve-cube'), { fill: 0.52 });
const sol = { moves: [], states: [], idx: 0 };
let stripBtns = [];

function openSolve(colors, moves) {
  sol.moves = moves;
  sol.states = [colors.slice()];
  for (const mv of moves) sol.states.push(applyMove(sol.states[sol.states.length - 1], mv));
  sol.idx = 0;

  const chip = (id) => `<span class="chip"><i style="--c:${COLORS[id].css}"></i>${COLORS[id].name}</span>`;
  $('#solve-hold').innerHTML = `Küpü böyle tut: üstte ${chip(colors[4])} önde ${chip(colors[22])}`;
  $('#solve-title').textContent = `Çözüm · ${moves.length} hamle`;

  const strip = $('#move-strip');
  strip.textContent = '';
  stripBtns = moves.map((mv, i) => {
    const b = document.createElement('button');
    b.textContent = mv;
    b.setAttribute('aria-label', `${i + 1}. hamle: ${MOVE_TEXT[mv]}`);
    b.addEventListener('click', () => playStep(i + 1));
    strip.append(b);
    return b;
  });

  show('solve');
  stage.finishNow();
  stage.resetView();
  stage.setColors(css54(sol.states[0]));
  renderSolve();
}

function renderSolve() {
  const { idx, moves } = sol;
  const n = moves.length;
  const done = idx === n;
  $('.move-card').classList.toggle('done', done);
  if (idx === 0) {
    $('#move-code').textContent = '?';
    $('#move-step').textContent = 'Başlamadan önce';
    $('#move-desc').textContent = 'Küpünü ekrandaki gibi tut, sonra Başla’ya bas.';
  } else {
    const mv = moves[idx - 1];
    $('#move-code').textContent = mv;
    $('#move-step').textContent = done ? `Son hamle · ${n} / ${n}` : `Hamle ${idx} / ${n}`;
    $('#move-desc').textContent = done ? `${MOVE_TEXT[mv]}. Küp çözüldü!` : MOVE_TEXT[mv];
  }
  $('#solve-progress').style.width = `${n ? (idx / n) * 100 : 100}%`;
  stripBtns.forEach((b, i) => {
    b.className = i + 1 < idx ? 'done' : i + 1 === idx ? 'now' : '';
  });
  if (idx > 0) stripBtns[idx - 1].scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  else $('#move-strip').scrollLeft = 0;
  $('#solve-prev').disabled = idx === 0;
  $('#solve-replay').disabled = idx === 0;
  $('#solve-next').textContent = done ? 'Yeni küp' : idx === 0 ? 'Başla' : 'İleri';
}

/** k. hamleyi (1'den başlar) bir önceki durumdan başlatıp oynatır. */
function playStep(k) {
  stage.finishNow();
  sol.idx = k;
  stage.setColors(css54(sol.states[k - 1]));
  renderSolve();
  stage.turn(sol.moves[k - 1], css54(sol.states[k]));
}

$('#solve-next').addEventListener('click', () => {
  if (sol.idx === sol.moves.length) return show('home');
  playStep(sol.idx + 1);
});
$('#solve-replay').addEventListener('click', () => {
  if (sol.idx > 0) playStep(sol.idx);
});
$('#solve-prev').addEventListener('click', () => {
  if (sol.idx === 0) return;
  stage.finishNow();
  const mv = sol.moves[sol.idx - 1];
  stage.setColors(css54(sol.states[sol.idx]));
  sol.idx--;
  renderSolve();
  stage.turn(invertMove(mv), css54(sol.states[sol.idx]));
});
$('#solve-back').addEventListener('click', () => {
  stage.finishNow();
  show('review');
  renderReview();
});
