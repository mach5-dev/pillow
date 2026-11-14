// Prints a cosmic-microwave-background style noise field across the whole page.
// Click anywhere (or "New universe") to reprint it with a fresh seed.

(() => {
  // Blue -> pale -> orange, sampled from the cushion in the photo.
  const PALETTE = [
    [0.00, [14, 64, 190]],
    [0.20, [40, 132, 230]],
    [0.38, [86, 182, 236]],
    [0.50, [214, 232, 222]],
    [0.60, [248, 210, 160]],
    [0.78, [241, 140, 64]],
    [1.00, [214, 72, 30]],
  ];

  // Wavelength in CSS pixels and weight: mostly fine speckle, some large-scale swell.
  const OCTAVES = [
    [6, 0.3],
    [12, 1.0],
    [22, 0.7],
    [55, 0.4],
    [170, 0.35],
  ];

  const RENDER_SCALE = 0.5; // render at half resolution; CSS upscaling softens it like dye in fabric
  const DRIFT_MS = 15000;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function mulberry32(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Classic 2D gradient noise with a seeded permutation table.
  function makeNoise(rand) {
    const perm = new Uint8Array(512);
    const p = Array.from({length: 256}, (_, i) => i);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const gx = new Float32Array(256), gy = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const a = rand() * Math.PI * 2;
      gx[i] = Math.cos(a); gy[i] = Math.sin(a);
    }
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    return (x, y) => {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const X = xi & 255, Y = yi & 255;
      const dot = (h, dx, dy) => gx[h] * dx + gy[h] * dy;
      const aa = perm[perm[X] + Y], ab = perm[perm[X] + Y + 1];
      const ba = perm[perm[X + 1] + Y], bb = perm[perm[X + 1] + Y + 1];
      const u = fade(xf), v = fade(yf);
      const x1 = dot(aa, xf, yf) + u * (dot(ba, xf - 1, yf) - dot(aa, xf, yf));
      const x2 = dot(ab, xf, yf - 1) + u * (dot(bb, xf - 1, yf - 1) - dot(ab, xf, yf - 1));
      return x1 + v * (x2 - x1);
    };
  }

  function colourAt(t, out) {
    let i = 1;
    while (i < PALETTE.length - 1 && t > PALETTE[i][0]) i++;
    const [t0, c0] = PALETTE[i - 1], [t1, c1] = PALETTE[i];
    const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    out[0] = c0[0] + (c1[0] - c0[0]) * k;
    out[1] = c0[1] + (c1[1] - c0[1]) * k;
    out[2] = c0[2] + (c1[2] - c0[2]) * k;
  }

  function paint(canvas, seed) {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(8, Math.round(rect.width * RENDER_SCALE));
    const h = Math.max(8, Math.round(rect.height * RENDER_SCALE));
    canvas.width = w;
    canvas.height = h;

    const rand = mulberry32(seed);
    const layers = OCTAVES.map(([wavelength, weight]) => ({
      noise: makeNoise(rand),
      freq: 1 / (wavelength * RENDER_SCALE),
      weight,
      ox: rand() * 1000,
      oy: rand() * 1000,
    }));

    const values = new Float32Array(w * h);
    let sum = 0, sumSq = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (const L of layers) v += L.weight * L.noise(x * L.freq + L.ox, y * L.freq + L.oy);
        values[y * w + x] = v;
        sum += v; sumSq += v * v;
      }
    }
    const mean = sum / values.length;
    const std = Math.sqrt(Math.max(1e-9, sumSq / values.length - mean * mean));

    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(w, h);
    const rgb = [0, 0, 0];
    for (let i = 0; i < values.length; i++) {
      colourAt(0.5 + (values[i] - mean) / (std * 5.2), rgb);
      img.data[i * 4] = rgb[0];
      img.data[i * 4 + 1] = rgb[1];
      img.data[i * 4 + 2] = rgb[2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }

  const cloth = document.querySelector('.cloth');

  // Lay a freshly printed canvas over the old one and fade it in.
  function reprint(seed) {
    const old = cloth.querySelector('.field:last-of-type');
    const next = old.cloneNode(false);
    next.dataset.seed = seed;
    next.style.opacity = '0';
    old.after(next);
    paint(next, seed);
    requestAnimationFrame(() => requestAnimationFrame(() => { next.style.opacity = '1'; }));
    const cleanup = () => cloth.querySelectorAll('.field').forEach((c) => c !== next && c.remove());
    if (reduceMotion) cleanup();
    else next.addEventListener('transitionend', cleanup, {once: true});
  }

  const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
  const first = cloth.querySelector('.field');
  paint(first, Number(first.dataset.seed));

  // Clicking anywhere on the cloth (including "New universe") reprints it; the label is exempt.
  document.body.addEventListener('click', (e) => {
    if (!e.target.closest('.label')) reprint(randomSeed());
  });

  // The cloth slowly keeps changing on its own.
  if (!reduceMotion) {
    setInterval(() => { if (!document.hidden) reprint(randomSeed()); }, DRIFT_MS);
  }

  // Repaint when the page changes size. Ignore small height changes so
  // mobile toolbars sliding in and out don't trigger a repaint.
  let resizeTimer, lastW = cloth.clientWidth, lastH = cloth.clientHeight;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = cloth.clientWidth, h = cloth.clientHeight;
      if (w === lastW && Math.abs(h - lastH) < 120) return;
      lastW = w; lastH = h;
      const canvas = cloth.querySelector('.field:last-of-type');
      paint(canvas, Number(canvas.dataset.seed));
    }, 250);
  }).observe(cloth);
})();
