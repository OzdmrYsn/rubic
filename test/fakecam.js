// Tarayıcı testi için sahte kamera: bilinen bir karışık küpün yüzlerini tuvale çizer.
// Konsolda: await import('./test/fakecam.js'); await __runScan()
const cube = await import('../js/cube.js');
const CAM = [[200, 205, 210], [190, 180, 40], [170, 25, 30], [220, 95, 20], [20, 140, 70], [15, 60, 160]];
const STD = [0, 2, 4, 1, 3, 5];
let state = Array.from({ length: 54 }, (_, i) => STD[Math.floor(i / 9)]);
for (const mv of cube.randomMoves(25)) state = cube.applyMove(state, mv);
const cv = document.createElement('canvas');
cv.width = cv.height = 720;
const ctx = cv.getContext('2d');
const rotG = (g) => [g[6], g[3], g[0], g[7], g[4], g[1], g[8], g[5], g[2]];
window.__rot = [0, 0, 0, 0, 0, 0];
window.__order = [0, 1, 2, 3, 4, 5];
window.__wrong = null; // {step, cell, color}
window.__draw = (k) => {
  ctx.fillStyle = '#5a5046';
  ctx.fillRect(0, 0, 720, 720);
  const inset = 720 * 0.17;
  const cell = (720 * 0.66) / 3;
  ctx.fillStyle = '#111';
  ctx.fillRect(inset - 6, inset - 6, cell * 3 + 12, cell * 3 + 12);
  let grid = cube.SCAN_STEPS[window.__order[k]].map.map((i) => state[i]);
  for (let t = 0; t < window.__rot[k]; t++) grid = rotG(grid);
  if (window.__wrong && window.__wrong.step === k) grid[window.__wrong.cell] = window.__wrong.color;
  for (let j = 0; j < 9; j++) {
    const r = Math.floor(j / 3);
    const c = j % 3;
    const f = 0.8 + Math.random() * 0.35;
    ctx.fillStyle = `rgb(${CAM[grid[j]].map((v) => Math.min(255, Math.round(v * f))).join(',')})`;
    ctx.fillRect(inset + c * cell + 8, inset + r * cell + 8, cell - 16, cell - 16);
  }
};
window.__state = state;
window.__k = 0;
window.__draw(0);
clearInterval(window.__timer);
window.__timer = setInterval(() => window.__draw(window.__k), 80);
navigator.mediaDevices.getUserMedia = async () => cv.captureStream(15);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const q = (s) => document.querySelector(s);
window.__runScan = async (pause = 900) => {
  if (q('.screen.active').id !== 'home') {
    q(`#${q('.screen.active').id}-back`).click();
    await wait(100);
    if (q('.screen.active').id !== 'home') { q(`#${q('.screen.active').id}-back`).click(); await wait(100); }
  }
  q('#btn-scan').click();
  await wait(300);
  const guide = [];
  for (let k = 0; k < 6; k++) {
    window.__k = k;
    await wait(pause);
    guide.push(q('#guide-step').textContent + ' ' + (q('#scan-shoot').disabled ? 'disabled' : 'ok'));
    q('#scan-shoot').click();
    await wait(150);
  }
  await wait(500);
  const hex = ['#f4f5f7', '#ffd60a', '#e5322d', '#ff8f1f', '#1fb655', '#2274e6'];
  const cells = [...document.querySelectorAll('#net button')];
  const got = cells.map((b) => hex.indexOf(b.style.getPropertyValue('--c')));
  let diff = 0;
  got.forEach((c, i) => { if (c !== window.__state[i]) diff++; });
  return {
    screen: q('.screen.active').id,
    diff,
    marked: cells.filter((b) => b.classList.contains('marked')).length,
    status: q('#review-status').textContent,
    solveDisabled: q('#review-solve').disabled,
    guide,
  };
};
