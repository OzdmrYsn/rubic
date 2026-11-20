// CSS 3B küp: 27 parça, katman dönüş animasyonu, parmakla çevrilebilir görünüm.

import { faceletAt, moveCss } from './cube.js';

const DIRS = [
  { n: [0, 0, 1], css: (h) => `translateZ(${h}px)` },
  { n: [0, 0, -1], css: (h) => `rotateY(180deg) translateZ(${h}px)` },
  { n: [1, 0, 0], css: (h) => `rotateY(90deg) translateZ(${h}px)` },
  { n: [-1, 0, 0], css: (h) => `rotateY(-90deg) translateZ(${h}px)` },
  { n: [0, 1, 0], css: (h) => `rotateX(90deg) translateZ(${h}px)` },
  { n: [0, -1, 0], css: (h) => `rotateX(-90deg) translateZ(${h}px)` },
];

const div = (cls) => {
  const d = document.createElement('div');
  d.className = cls;
  return d;
};

export class Cube3D {
  /**
   * @param {HTMLElement} host
   * @param {{rx?:number, ry?:number, interactive?:boolean, fill?:number}} opts
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = { rx: -26, ry: -36, interactive: true, fill: 0.54, ...opts };
    this.rx = this.opts.rx;
    this.ry = this.opts.ry;
    this.pending = null;
    this.poseAnim = null;

    this.scene = div('c3d-scene');
    this.cube = div('c3d-cube');
    this.pose = div('c3d-pose');
    this.cubies = [];
    this.stickers = new Array(54).fill(null);
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const el = div('c3d-cubie');
          const faces = DIRS.map((dir) => {
            const f = div('c3d-face');
            const outward = dir.n[0] * x + dir.n[1] * y + dir.n[2] * z === 1;
            if (outward) {
              f.classList.add('sticker');
              this.stickers[faceletAt([x, y, z], dir.n)] = f;
            }
            el.append(f);
            return { el: f, dir };
          });
          this.pose.append(el);
          this.cubies.push({ el, pos: [x, y, z], faces, base: '' });
        }
      }
    }
    this.cube.append(this.pose);
    this.scene.append(this.cube);
    host.append(this.scene);

    this.layout();
    this.applyView();
    if (typeof ResizeObserver !== 'undefined') {
      this.ro = new ResizeObserver(() => this.layout());
      this.ro.observe(host);
    }
    if (this.opts.interactive) this.bindDrag();
  }

  layout() {
    const w = this.host.clientWidth;
    const h = this.host.clientHeight;
    const edge = Math.max(36, Math.floor(Math.min(w, h) * this.opts.fill));
    if (edge === this.edge) return;
    this.edge = edge;
    const s = edge / 3;
    this.scene.style.perspective = `${edge * 4}px`;
    for (const c of this.cubies) {
      const [x, y, z] = c.pos;
      c.base = `translate3d(${x * s}px, ${-y * s}px, ${z * s}px)`;
      c.el.style.width = c.el.style.height = `${s}px`;
      c.el.style.margin = `${-s / 2}px 0 0 ${-s / 2}px`;
      c.el.style.transform = c.base;
      for (const f of c.faces) f.el.style.transform = f.dir.css(s / 2);
    }
  }

  applyView() {
    this.cube.style.transform = `rotateX(${this.rx}deg) rotateY(${this.ry}deg)`;
  }

  resetView() {
    this.rx = this.opts.rx;
    this.ry = this.opts.ry;
    this.applyView();
  }

  bindDrag() {
    let last = null;
    const el = this.scene;
    el.addEventListener('pointerdown', (e) => {
      last = [e.clientX, e.clientY];
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!last) return;
      this.ry += (e.clientX - last[0]) * 0.5;
      this.rx = Math.max(-85, Math.min(85, this.rx - (e.clientY - last[1]) * 0.5));
      last = [e.clientX, e.clientY];
      this.applyView();
    });
    const end = () => { last = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => this.resetView());
  }

  /** @param {(string|null)[]} colors 54 CSS rengi (null = boş) */
  setColors(colors) {
    for (let i = 0; i < 54; i++) {
      const c = colors[i];
      if (c) this.stickers[i].style.setProperty('--c', c);
      else this.stickers[i].style.removeProperty('--c');
    }
  }

  /** Süren katman animasyonu varsa hemen bitirir (son renkler uygulanır). */
  finishNow() {
    if (this.pending) this.pending();
  }

  /**
   * Bir hamleyi canlandırır; bitince küpü `colorsAfter` renklerine geçirir.
   * @returns {Promise<void>}
   */
  turn(move, colorsAfter, duration = 480) {
    this.finishNow();
    const { axisIndex, axis, layer, angle } = moveCss(move);
    const fn = `rotate${axis.toUpperCase()}`;
    const ms = Math.abs(angle) === 180 ? duration * 1.45 : duration;
    const anims = this.cubies
      .filter((c) => c.pos[axisIndex] === layer)
      .map((c) => c.el.animate(
        [{ transform: `${fn}(0deg) ${c.base}` }, { transform: `${fn}(${angle}deg) ${c.base}` }],
        { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
      ));
    return new Promise((resolve) => {
      const done = () => {
        if (this.pending !== done) return;
        this.pending = null;
        this.setColors(colorsAfter);
        anims.forEach((a) => a.cancel());
        resolve();
      };
      this.pending = done;
      Promise.all(anims.map((a) => a.finished)).then(done, () => {});
    });
  }

  /** Küpün bütününe ek bir duruş (CSS dönüş zinciri) verir. */
  setPose(chain) {
    this.stopPoseLoop();
    this.pose.style.transform = chain || 'none';
  }

  /** `prevChain` duruşundan `fn(angle)` kadar dönüşü tekrar tekrar gösterir. */
  loopPose(prevChain, fn, angle) {
    this.stopPoseLoop();
    const from = `${fn}(0deg) ${prevChain}`.trim();
    const to = `${fn}(${angle}deg) ${prevChain}`.trim();
    this.pose.style.transform = to;
    this.poseAnim = this.pose.animate(
      [
        { transform: from, offset: 0 },
        { transform: from, offset: 0.12, easing: 'cubic-bezier(.4,0,.2,1)' },
        { transform: to, offset: 0.52 },
        { transform: to, offset: 1 },
      ],
      { duration: 2600, iterations: Infinity },
    );
  }

  stopPoseLoop() {
    if (this.poseAnim) this.poseAnim.cancel();
    this.poseAnim = null;
  }
}
