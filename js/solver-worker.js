// Çözücü ayrı bir iş parçacığında çalışır; tabloların hazırlanması birkaç saniye
// sürdüğü için arayüzü dondurmaz. (Kociemba iki aşamalı algoritması — cubejs)
/* global Cube, importScripts */
importScripts('../vendor/cubejs/cube.js', '../vendor/cubejs/solve.js');

let ready = false;
function ensureReady() {
  if (ready) return;
  Cube.initSolver();
  ready = true;
  self.postMessage({ type: 'ready' });
}

self.onmessage = (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'init') {
      ensureReady();
    } else if (msg.type === 'solve') {
      ensureReady();
      const solution = Cube.fromString(msg.facelets).solve();
      self.postMessage({ type: 'solution', id: msg.id, solution: solution.trim() });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String((err && err.message) || err) });
  }
};
