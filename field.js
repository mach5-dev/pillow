// Animates a cosmic-microwave-background style noise field across the whole page
// with a WebGL shader. The field slowly boils in place and scrolls with the page.
// Click anywhere (or "New universe") to dissolve into a fresh universe.

(() => {
  const RENDER_SCALE = 0.5; // half resolution; CSS upscaling softens it like dye in fabric
  const RESEED_MS = 1800;

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canvas = document.querySelector('.field');
  const gl = canvas.getContext('webgl', {antialias: false});
  if (!gl) return; // body background colour stands in

  const VERT = `
    attribute vec2 p;
    void main() { gl_Position = vec4(p, 0.0, 1.0); }
  `;

  // 3D simplex noise by Ian McEwan & Stefan Gustavson (webgl-noise, MIT).
  const FRAG = `
    precision highp float;
    uniform vec2 uSize;      // canvas size in pixels
    uniform float uScale;    // canvas pixels per CSS pixel
    uniform float uScroll;   // page scroll in CSS pixels
    uniform float uTime;
    uniform vec2 uSeedA, uSeedB;
    uniform float uMix;

    vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
    vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
    vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

    float snoise(vec3 v) {
      const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
      const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i = floor(v + dot(v, C.yyy));
      vec3 x0 = v - i + dot(i, C.xxx);
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min(g.xyz, l.zxy);
      vec3 i2 = max(g.xyz, l.zxy);
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i);
      vec4 p = permute(permute(permute(
                i.z + vec4(0.0, i1.z, i2.z, 1.0))
              + i.y + vec4(0.0, i1.y, i2.y, 1.0))
              + i.x + vec4(0.0, i1.x, i2.x, 1.0));
      float n_ = 0.142857142857;
      vec3 ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_);
      vec4 x = x_ * ns.x + ns.yyyy;
      vec4 y = y_ * ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4(x.xy, y.xy);
      vec4 b1 = vec4(x.zw, y.zw);
      vec4 s0 = floor(b0) * 2.0 + 1.0;
      vec4 s1 = floor(b1) * 2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
      vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
      vec3 p0 = vec3(a0.xy, h.x);
      vec3 p1 = vec3(a0.zw, h.y);
      vec3 p2 = vec3(a1.xy, h.z);
      vec3 p3 = vec3(a1.zw, h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
      m = m * m;
      return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
    }

    // Wavelengths in CSS px: mostly fine speckle, some large-scale swell.
    // Fine grains boil faster than the broad swells.
    float field(vec2 q, vec2 seed) {
      float t = uTime;
      float v = 0.0;
      v += 0.20 * snoise(vec3(q / 8.0   + seed,       t * 0.22));
      v += 1.00 * snoise(vec3(q / 16.0  + seed * 1.7, t * 0.13));
      v += 0.70 * snoise(vec3(q / 30.0  + seed * 2.3, t * 0.08));
      v += 0.40 * snoise(vec3(q / 70.0  + seed * 3.1, t * 0.05));
      v += 0.35 * snoise(vec3(q / 200.0 + seed * 4.7, t * 0.03));
      return v;
    }

    // Blue -> pale -> orange, sampled from the cushion in the photo.
    vec3 palette(float t) {
      vec3 c0 = vec3(14.0, 64.0, 190.0) / 255.0;
      vec3 c1 = vec3(40.0, 132.0, 230.0) / 255.0;
      vec3 c2 = vec3(86.0, 182.0, 236.0) / 255.0;
      vec3 c3 = vec3(214.0, 232.0, 222.0) / 255.0;
      vec3 c4 = vec3(248.0, 210.0, 160.0) / 255.0;
      vec3 c5 = vec3(241.0, 140.0, 64.0) / 255.0;
      vec3 c6 = vec3(214.0, 72.0, 30.0) / 255.0;
      t = clamp(t, 0.0, 1.0);
      if (t < 0.20) return mix(c0, c1, t / 0.20);
      if (t < 0.38) return mix(c1, c2, (t - 0.20) / 0.18);
      if (t < 0.50) return mix(c2, c3, (t - 0.38) / 0.12);
      if (t < 0.60) return mix(c3, c4, (t - 0.50) / 0.10);
      if (t < 0.78) return mix(c4, c5, (t - 0.60) / 0.18);
      return mix(c5, c6, (t - 0.78) / 0.22);
    }

    void main() {
      vec2 q = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y) / uScale;
      q.y += uScroll;
      float v = field(q, uSeedB);
      if (uMix < 1.0) {
        // Rescale so the blend keeps full contrast instead of greying out halfway.
        float m = smoothstep(0.0, 1.0, uMix);
        v = (field(q, uSeedA) * (1.0 - m) + v * m) / length(vec2(1.0 - m, m));
      }
      gl_FragColor = vec4(palette(0.5 + v / 2.4), 1.0);
    }
  `;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);

  // One oversized triangle covering the screen.
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const u = Object.fromEntries(
    ['uSize', 'uScale', 'uScroll', 'uTime', 'uSeedA', 'uSeedB', 'uMix']
      .map((name) => [name, gl.getUniformLocation(prog, name)]));

  const randomSeed = () => [Math.random() * 500, Math.random() * 500];
  let seedA = [19.65, 3.8], seedB = seedA;
  let reseedAt = -Infinity;

  function resize() {
    const w = Math.max(8, Math.round(innerWidth * RENDER_SCALE));
    const h = Math.max(8, Math.round(innerHeight * RENDER_SCALE));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  // Returns true while a reseed dissolve is still in progress.
  function draw(now) {
    resize();
    const mixT = Math.min(1, (now - reseedAt) / RESEED_MS);
    gl.uniform2f(u.uSize, canvas.width, canvas.height);
    gl.uniform1f(u.uScale, RENDER_SCALE);
    gl.uniform1f(u.uScroll, scrollY);
    gl.uniform1f(u.uTime, reduceMotion ? 0 : now / 1000);
    gl.uniform2fv(u.uSeedA, seedA);
    gl.uniform2fv(u.uSeedB, seedB);
    gl.uniform1f(u.uMix, mixT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return mixT < 1;
  }

  // With reduced motion the field stays still and redraws only when something changes.
  let pending = false;
  function requestStill() {
    if (pending) return;
    pending = true;
    requestAnimationFrame((now) => {
      pending = false;
      if (draw(now)) requestStill();
    });
  }

  // Clicking anywhere on the cloth (including "New universe") reprints it; the label is exempt.
  document.body.addEventListener('click', (e) => {
    if (e.target.closest('.label')) return;
    seedA = seedB;
    seedB = randomSeed();
    reseedAt = performance.now();
    if (reduceMotion) requestStill();
  });

  if (reduceMotion) {
    addEventListener('scroll', requestStill, {passive: true});
    addEventListener('resize', requestStill);
    requestStill();
  } else {
    requestAnimationFrame(function frame(now) {
      draw(now);
      requestAnimationFrame(frame);
    });
  }
})();
