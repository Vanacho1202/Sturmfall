// Grafik-Bausteine für Sturmfall: Qualitätsstufen, Nachbearbeitung, Bodentexturen, Wasser, Wind, Partikel
import * as THREE from './lib/three.module.js';
import { EffectComposer } from './lib/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from './lib/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from './lib/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from './lib/jsm/postprocessing/UnrealBloomPass.js';

export const U = { time: { value: 0 } };

// ---------- Qualitätsstufe
export function quality(touch) {
  let q = null;
  try { q = localStorage.getItem('sf_gfx'); } catch (e) {}
  return q === 'low' || q === 'med' || q === 'high' ? q : touch ? 'med' : 'high';
}
export const TIER = {
  low: { pr: 1, shadow: 0, post: false, bloom: false, samples: 0, grass: 500, flowers: 120 },
  med: { pr: 1.25, shadow: 1024, post: true, bloom: false, samples: 2, grass: 1800, flowers: 260 },
  high: { pr: 1.5, shadow: 2048, post: true, bloom: true, samples: 4, grass: 5200, flowers: 700 },
};

// ---------- Nachbearbeitung: Tonemapping, Farbabstimmung, Vignette (+ Leuchten auf Hoch)
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uExp: { value: 1.0 }, uSat: { value: 1.12 }, uCon: { value: 1.06 }, uVig: { value: 0.32 }, uWarm: { value: 0.03 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uExp, uSat, uCon, uVig, uWarm; varying vec2 vUv;
    vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * uExp;
      c = aces(c);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);
      c = (c - 0.5) * uCon + 0.5;
      c += vec3(uWarm, uWarm * 0.4, -uWarm) * (1.0 - l);
      vec2 d = vUv - 0.5; c *= 1.0 - uVig * dot(d, d) * 1.7;
      gl_FragColor = vec4(toSRGB(clamp(c, 0.0, 1.0)), 1.0);
    }`,
};
export function makePost(renderer, scene, camera, q) {
  const T = TIER[q];
  if (!T.post) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0; return null; }
  renderer.toneMapping = THREE.NoToneMapping;
  const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(sz.x, sz.y, { type: THREE.HalfFloatType, samples: T.samples });
  const comp = new EffectComposer(renderer, rt);
  comp.setPixelRatio(renderer.getPixelRatio()); comp.setSize(innerWidth, innerHeight);
  comp.addPass(new RenderPass(scene, camera));
  let bloom = null;
  if (T.bloom) { bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.4, 2.4); comp.addPass(bloom); }
  const grade = new ShaderPass(GradeShader); comp.addPass(grade);
  return { comp, grade, bloom, resize() { comp.setPixelRatio(renderer.getPixelRatio()); comp.setSize(innerWidth, innerHeight); } };
}

// ---------- Kachelbares Rauschen
function lattice(P, seed) {
  const g = new Float32Array(P * P); let s = seed % 2147483646 + 1;
  for (let i = 0; i < g.length; i++) g[i] = (s = (s * 16807) % 2147483647) / 2147483647;
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = (X, Y) => g[(((Y % P) + P) % P) * P + (((X % P) + P) % P)];
    return (a(xi, yi) * (1 - u) + a(xi + 1, yi) * u) * (1 - v) + (a(xi, yi + 1) * (1 - u) + a(xi + 1, yi + 1) * u) * v;
  };
}
function fbm(N, periods, seed) {
  const out = new Float32Array(N * N), fns = periods.map((p, i) => [p, lattice(p, seed + i * 7919)]); let wsum = 0;
  fns.forEach((_, i) => (wsum += 1 / (i + 1)));
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let v = 0; fns.forEach(([p, f], i) => (v += f((x / N) * p, (y / N) * p) / (i + 1)));
    out[y * N + x] = v / wsum;
  }
  return out;
}
let _seed = 4242; const rnd = () => (_seed = (_seed * 16807) % 2147483647) / 2147483647;
function canvasFrom(N, fill) {
  const c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) { const [r, gg, b] = fill(i % N, Math.floor(i / N), i); im.data[i * 4] = r; im.data[i * 4 + 1] = gg; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0); return c;
}
function wrapDraw(g, N, fn) { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.save(); g.translate(ox, oy); fn(g); g.restore(); } }
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export function texFromCanvas(c, srgb = true, rep = 1) {
  const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = 8; return t;
}
// Normalenkarte aus der Helligkeit einer Textur (kachelbar)
export function normalFromCanvas(src, strength = 2.5) {
  const N = src.width, d = src.getContext('2d').getImageData(0, 0, N, N).data, L = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  const h = (x, y) => L[((y + N) % N) * N + ((x + N) % N)];
  const c = canvasFrom(N, (x, y) => {
    const dx = (h(x + 1, y) - h(x - 1, y)) * strength, dy = (h(x, y + 1) - h(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1);
    return [(-dx / l * 0.5 + 0.5) * 255, (dy / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255];
  });
  return texFromCanvas(c, false);
}

// ---------- Bodentexturen
export function groundTextures() {
  const N = 256;
  const nG = fbm(N, [4, 8, 16, 32], 11), nS = fbm(N, [8, 32, 64], 23), nR = fbm(N, [4, 8, 16, 32, 64], 37), nP = fbm(N, [8, 16, 64], 41), nT = fbm(N, [16, 64], 53);
  const grass = canvasFrom(N, (x, y, i) => mixc([46, 104, 34], [112, 172, 62], nG[i]));
  wrapDraw(grass.getContext('2d'), N, (g) => {
    _seed = 99;
    for (let k = 0; k < 1400; k++) {
      const x = rnd() * N, y = rnd() * N, l = 3 + rnd() * 6, a = -Math.PI / 2 + (rnd() - 0.5) * 0.9, lt = rnd();
      g.strokeStyle = lt < 0.5 ? `rgba(30,80,22,${0.35 + rnd() * 0.3})` : `rgba(150,205,90,${0.25 + rnd() * 0.3})`; g.lineWidth = 1 + rnd();
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
  const sand = canvasFrom(N, (x, y, i) => { const v = nS[i] + (Math.random() - 0.5) * 0.18; return mixc([168, 142, 96], [206, 182, 128], v); });
  const rock = canvasFrom(N, (x, y, i) => { const v = nR[i]; return mixc([86, 86, 84], [168, 166, 160], v * v * 1.3); });
  wrapDraw(rock.getContext('2d'), N, (g) => {
    _seed = 7;
    for (let k = 0; k < 26; k++) {
      let x = rnd() * N, y = rnd() * N; g.strokeStyle = `rgba(40,40,38,${0.45 + rnd() * 0.3})`; g.lineWidth = 1 + rnd() * 1.5; g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 8; s++) { x += (rnd() - 0.5) * 22; y += (rnd() - 0.3) * 16; g.lineTo(x, y); }
      g.stroke();
    }
  });
  const path = canvasFrom(N, (x, y, i) => mixc([118, 88, 56], [176, 144, 102], nP[i] + (Math.random() - 0.5) * 0.1));
  wrapDraw(path.getContext('2d'), N, (g) => {
    _seed = 13;
    for (let k = 0; k < 160; k++) { const x = rnd() * N, y = rnd() * N, r = 1 + rnd() * 3, v = 120 + rnd() * 90; g.fillStyle = `rgb(${v},${v * 0.92},${v * 0.82})`; g.beginPath(); g.ellipse(x, y, r * 1.3, r, rnd() * 3, 0, 7); g.fill(); }
  });
  const town = canvasFrom(N, (x, y, i) => {
    const s = 64, bx = Math.floor(x / s), off = bx % 2 ? s / 2 : 0, by = Math.floor((y + off) / s), lx = x % s, ly = (y + off) % s;
    const edge = Math.min(lx, ly, s - 1 - lx, s - 1 - ly);
    const tint = lattice(8, 61)(bx + 0.5, by + 0.5), base = mixc([142, 136, 124], [184, 176, 160], tint * 0.8 + nT[i] * 0.4);
    return edge < 3 ? [92, 88, 80] : edge < 5 ? mixc([92, 88, 80], base, (edge - 2) / 3) : base;
  });
  const mk = (c, rep) => texFromCanvas(c, true, rep);
  return { grass: mk(grass), sand: mk(sand), rock: mk(rock), path: mk(path), town: mk(town) };
}
export function terrainMaterial(tx) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tG: { value: tx.grass }, tS: { value: tx.sand }, tR: { value: tx.rock }, tP: { value: tx.path }, tT: { value: tx.town } });
    sh.vertexShader = 'attribute vec4 splat;\nvarying vec4 vSplat;\nvarying vec3 vTW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvSplat = splat; vTW = transformed;');
    sh.fragmentShader = 'uniform sampler2D tG, tS, tR, tP, tT;\nvarying vec4 vSplat;\nvarying vec3 vTW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 tuv = vTW.xz * 0.21;
      vec3 cg = texture2D(tG, tuv).rgb, cs = texture2D(tS, tuv * 1.3).rgb, cr = texture2D(tR, tuv * 0.6).rgb, cp = texture2D(tP, tuv).rgb, ct = texture2D(tT, vTW.xz * 0.25).rgb;
      float wg = max(0.0, 1.0 - vSplat.x - vSplat.y - vSplat.z - vSplat.w);
      vec3 tc = cg * wg + cs * vSplat.x + cr * vSplat.y + cp * vSplat.z + ct * vSplat.w;
      float mac = texture2D(tG, vTW.xz * 0.011).g; tc *= 0.78 + mac * 0.55;
      float snow = smoothstep(22.0, 24.5, vTW.y + (cr.r - 0.4) * 4.0) * (1.0 - vSplat.w);
      tc = mix(tc, vec3(0.72, 0.76, 0.82) * (0.8 + cs.r * 0.35), snow);
      diffuseColor.rgb *= tc;`);
  };
  return m;
}

// ---------- Wasser: türkis im Flachen, dunkelblau in der Tiefe, Schaum an der Küste
export function waterMaterial(heightFn, normalMap) {
  const N = 256, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = (i + 0.5) / N * 560 - 280, z = (j + 0.5) / N * 560 - 280; data[j * N + i] = Math.round(Math.min(1, Math.max(0, -heightFn(x, z) / 8)) * 255); }
  const dt = new THREE.DataTexture(data, N, N, THREE.RedFormat, THREE.UnsignedByteType);
  dt.magFilter = dt.minFilter = THREE.LinearFilter; dt.needsUpdate = true;
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, metalness: 0, transparent: true, normalMap, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tDepth = { value: dt }; sh.uniforms.uTime = U.time;
    sh.vertexShader = 'varying vec3 vWW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvWW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'uniform sampler2D tDepth; uniform float uTime; varying vec3 vWW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec2 duv = (vWW.xz + 280.0) / 560.0;
      float dep = (duv.x < 0.0 || duv.x > 1.0 || duv.y < 0.0 || duv.y > 1.0) ? 8.0 : texture2D(tDepth, duv).r * 8.0;
      vec3 wc = mix(vec3(0.07, 0.52, 0.52), vec3(0.008, 0.10, 0.30), smoothstep(0.0, 5.5, dep));
      float wave = sin(uTime * 1.7 - dep * 9.0 + sin(vWW.x * 0.33) * 1.6 + cos(vWW.z * 0.29) * 1.6);
      float fm = clamp(smoothstep(0.75, 0.05, dep) * (0.55 + 0.45 * wave), 0.0, 1.0);
      diffuseColor.rgb = mix(wc, vec3(0.92, 0.96, 0.98), fm);
      diffuseColor.a = clamp(mix(0.45, 0.93, smoothstep(0.0, 3.0, dep)) + fm * 0.45, 0.0, 1.0);`);
  };
  return m;
}

// ---------- Wind für Bäume, Büsche und Gras
export function windMaterial(base, amp) {
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ipos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ipos = vec3(0.0);
      #endif
      float hgt = max(0.0, position.y);
      float sw = sin(uTime * 1.5 + ipos.x * 0.21 + ipos.z * 0.17) * 0.6 + sin(uTime * 2.9 + ipos.x * 0.53 - ipos.z * 0.31) * 0.3;
      transformed.x += sw * ${amp.toFixed(4)} * hgt * hgt; transformed.z += sw * ${(amp * 0.6).toFixed(4)} * hgt * hgt;`);
  };
  m.customProgramCacheKey = () => 'wind' + amp;
  return m;
}

// ---------- Weiche Partikel (Rauch, Staub, Funken)
const PV = 'attribute float size; attribute vec4 pc; varying vec4 vC; uniform float uScale; void main(){ vC = pc; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(size * uScale / max(0.2, -mv.z), 1.0, 220.0); gl_Position = projectionMatrix * mv; }';
const PF = 'varying vec4 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard; float a = 1.0 - r; gl_FragColor = vec4(vC.rgb, vC.a * a * a);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}';
export class Particles {
  constructor(scene, n = 700) {
    this.n = n; this.list = []; this.scale = { value: 600 }; this.sys = [];
    for (const add of [false, true]) {
      const geo = new THREE.BufferGeometry();
      const pos = new THREE.BufferAttribute(new Float32Array(n * 3), 3), pc = new THREE.BufferAttribute(new Float32Array(n * 4), 4), sz = new THREE.BufferAttribute(new Float32Array(n), 1);
      for (const a of [pos, pc, sz]) a.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('position', pos); geo.setAttribute('pc', pc); geo.setAttribute('size', sz); geo.setDrawRange(0, 0);
      const mat = new THREE.ShaderMaterial({ uniforms: { uScale: this.scale }, vertexShader: PV, fragmentShader: PF, transparent: true, depthWrite: false, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = add ? 3 : 2; scene.add(pts);
      this.sys.push({ geo, pos, pc, sz });
    }
    this.col = new THREE.Color();
  }
  burst(x, y, z, color, n, speed = 4, size = 0.09, life = 0.6, grav = 12, bounce = false, glow = false) {
    this.col.set(color); const r = this.col.r, g = this.col.g, b = this.col.b, gl = glow || GLOW.has(color);
    for (let i = 0; i < n && this.list.length < this.n * 2; i++) {
      const a = Math.random() * 6.283, u = Math.random() * 2 - 1, q = Math.sqrt(1 - u * u), sp = speed * (0.4 + Math.random() * 0.8);
      this.list.push({ x, y, z, vx: Math.cos(a) * q * sp, vy: u * sp + speed * 0.4, vz: Math.sin(a) * q * sp, t: life * (0.6 + Math.random() * 0.6), l: life, s: size * (0.6 + Math.random() * 0.8) * 1.7, r, g, b, gr: grav, bo: bounce, add: gl, smoke: grav < 0 });
    }
  }
  update(dt) {
    const L = this.list, cnt = [0, 0];
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i]; p.t -= dt;
      if (p.t <= 0) { L[i] = L[L.length - 1]; L.pop(); continue; }
      p.vy -= p.gr * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.smoke) { p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5; p.s *= 1 + dt * 0.9; }
      if (p.bo && this.ground) { const gh = this.ground(p.x, p.z) + p.s * 0.3; if (p.y < gh) { p.y = gh; p.vy = -p.vy * 0.4; p.vx *= 0.6; p.vz *= 0.6; } }
    }
    for (const p of L) {
      const k = p.add ? 1 : 0, S = this.sys[k], j = cnt[k]; if (j >= this.n) continue; cnt[k]++;
      const f = Math.min(1, p.t / p.l * 2), m = p.add ? 2.4 : 1;
      S.pos.array[j * 3] = p.x; S.pos.array[j * 3 + 1] = p.y; S.pos.array[j * 3 + 2] = p.z;
      S.pc.array[j * 4] = p.r * m; S.pc.array[j * 4 + 1] = p.g * m; S.pc.array[j * 4 + 2] = p.b * m; S.pc.array[j * 4 + 3] = (p.smoke ? 0.55 : 0.95) * f;
      S.sz.array[j] = p.s * (p.smoke ? 1 : 0.6 + f * 0.4);
    }
    this.sys.forEach((S, k) => { S.geo.setDrawRange(0, cnt[k]); if (cnt[k]) { S.pos.needsUpdate = S.pc.needsUpdate = S.sz.needsUpdate = true; } });
  }
}
const GLOW = new Set(['#ff9a2e', '#ffe27a', '#ffd83a', '#e0b23c', '#ffd76a', '#ff5a4d', '#5cc4ff', '#2f7bff', '#6fd3ff', '#e74c3c', '#b04dff', '#59b7ff', '#5be05a']);
