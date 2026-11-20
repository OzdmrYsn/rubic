// Kamera: arka kamerayı açar ve ekrandaki 3x3 kılavuzun altındaki 9 karenin rengini okur.

/** Kılavuz ızgarasının, kare kamera görüntüsü içindeki kenar boşluğu (oran). CSS ile aynı olmalı. */
export const GRID_INSET = 0.17;
const N = 240; // örnekleme tuvali kenarı (piksel)
const PATCH = 0.2; // her hücrenin ortasından okunan bölgenin yarı genişliği (hücreye oranla)
const HISTORY = 5;

function median(arr) {
  // Tipli diziler sayısal sıralanır; normal dizilerde karşılaştırıcı şart.
  if (ArrayBuffer.isView(arr)) arr.sort();
  else arr.sort((a, b) => a - b);
  return arr[arr.length >> 1];
}

export class Scanner {
  constructor(video) {
    this.video = video;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = N;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.history = [];
    this.onSample = null;
    this.stream = null;
    this.timer = null;
  }

  async start() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const err = new Error('Kamera desteklenmiyor');
      err.name = 'NotSupportedError';
      throw err;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    });
    this.video.srcObject = this.stream;
    await this.video.play().catch(() => {});
    this.history = [];
    this.timer = setInterval(() => this.tick(), 100);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.video.srcObject = null;
    this.history = [];
  }

  get running() {
    return !!this.stream;
  }

  get track() {
    return this.stream ? this.stream.getVideoTracks()[0] : null;
  }

  get torchSupported() {
    const t = this.track;
    return !!(t && t.getCapabilities && t.getCapabilities().torch);
  }

  async setTorch(on) {
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch {
      return false;
    }
  }

  tick() {
    const v = this.video;
    if (!this.stream || v.readyState < 2 || !v.videoWidth) return;
    this.history.push(this.readFrame());
    if (this.history.length > HISTORY) this.history.shift();
    if (this.onSample) this.onSample(this.current());
  }

  /** Görüntünün ortasındaki kareyi (ekranda görünen kısım) alıp 9 hücrenin ortanca rengini okur. */
  readFrame() {
    const v = this.video;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const sx = (v.videoWidth - side) / 2;
    const sy = (v.videoHeight - side) / 2;
    this.ctx.drawImage(v, sx, sy, side, side, 0, 0, N, N);
    const cell = (N * (1 - 2 * GRID_INSET)) / 3;
    const half = Math.max(2, Math.round(cell * PATCH));
    const out = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const cx = Math.round(N * GRID_INSET + (c + 0.5) * cell);
        const cy = Math.round(N * GRID_INSET + (r + 0.5) * cell);
        const size = half * 2;
        const { data } = this.ctx.getImageData(cx - half, cy - half, size, size);
        const n = size * size;
        const rs = new Uint8Array(n);
        const gs = new Uint8Array(n);
        const bs = new Uint8Array(n);
        for (let i = 0; i < n; i++) {
          rs[i] = data[i * 4];
          gs[i] = data[i * 4 + 1];
          bs[i] = data[i * 4 + 2];
        }
        out.push([median(rs), median(gs), median(bs)]);
      }
    }
    return out;
  }

  /** Son birkaç karenin ortancası: titreme ve anlık parlamalara karşı daha kararlı. */
  current() {
    if (!this.history.length) return null;
    const out = [];
    for (let j = 0; j < 9; j++) {
      const rgb = [0, 1, 2].map((ch) => median(this.history.map((f) => f[j][ch])));
      out.push(rgb);
    }
    return out;
  }
}
