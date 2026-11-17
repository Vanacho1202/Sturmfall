// Eigene, prozedural gebaute Modelle für Sturmfall
import * as THREE from './lib/three.module.js';
import { normalFromCanvas } from './gfx.js';
const _c = new THREE.Color();
export const VM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0 });
export const WM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.35 });
export const CARM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.25 });

function mk(geo, o) {
  if (o.s) geo.scale(o.s[0], o.s[1], o.s[2]);
  if (o.r) { if (o.r[0]) geo.rotateX(o.r[0]); if (o.r[1]) geo.rotateY(o.r[1]); if (o.r[2]) geo.rotateZ(o.r[2]); }
  if (o.p) geo.translate(o.p[0], o.p[1], o.p[2]);
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (o.flat) g.computeVertexNormals();
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  if (o.c && o.c.isColor) _c.copy(o.c); else _c.set(o.c);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.deleteAttribute('uv');
  return g;
}
const box = (w, h, d, o) => mk(new THREE.BoxGeometry(w, h, d), o);
const cyl = (rt, rb, h, seg, o) => mk(new THREE.CylinderGeometry(rt, rb, h, seg), o);
const sph = (r, o, ws = 12, hs = 9, th = Math.PI) => mk(new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, th), o);
const cone = (r, h, seg, o) => mk(new THREE.ConeGeometry(r, h, seg), o);
const ico = (r, d, o) => mk(new THREE.IcosahedronGeometry(r, d), o);
export function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); col.set(g.attributes.color.array, o); o += g.attributes.position.count * 3; g.dispose(); }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}
const mesh = (list, shadow = true, mat = VM) => { const m = new THREE.Mesh(merge(list), mat); m.castShadow = shadow; return m; };
const hsl = (h, s, l) => new THREE.Color().setHSL((((h % 360) + 360) % 360) / 360, s, l);
const HP = Math.PI / 2;

// ================= Waffen (Griff im Ursprung, Lauf zeigt nach +z) =================
const D = 0x24272d, D2 = 0x15171a, M = 0x555c66, SV = 0x98a1ab, TAN = 0x9a7d55, WOOD = 0x7a4a22, OLIVE = 0x4d5c3c, WH = 0xffffff;
// Seitenprofil (u = Laufrichtung, v = oben) wird in der Breite extrudiert
function prof(pts, w, c, bev = 0.006) {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath();
  const d = Math.max(0.002, w - 2 * bev);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: 1, steps: 1, curveSegments: 1 });
  g.translate(0, 0, -d / 2); g.rotateY(-HP);
  return mk(g, { c });
}
const zc = (rf, rb, len, u0, v, c, seg = 10, x = 0) => cyl(rf, rb, len, seg, { r: [HP, 0, 0], p: [x, v, u0 + len / 2], c });
const GRIP = [[-0.035, 0.022], [0.03, 0.022], [0.008, -0.13], [-0.06, -0.118]];
const guard = (u0, v0) => prof([[u0, v0], [u0 + 0.06, v0], [u0 + 0.06, v0 - 0.042], [u0 + 0.048, v0 - 0.042], [u0 + 0.048, v0 - 0.012], [u0, v0 - 0.012]], 0.014, D, 0);
const WDEF = {
  ar: () => [
    prof([[-0.1, 0.02], [-0.1, 0.112], [0.26, 0.112], [0.26, 0.05], [0.2, 0.02]], 0.058, D),
    prof([[0.07, 0.025], [0.2, 0.025], [0.19, -0.035], [0.08, -0.035]], 0.05, D),
    prof(GRIP, 0.044, D2), guard(0.03, 0.02),
    zc(0.019, 0.019, 0.2, -0.3, 0.082, M),
    prof([[-0.38, 0.118], [-0.2, 0.118], [-0.19, 0.095], [-0.25, 0.055], [-0.27, -0.015], [-0.38, -0.03]], 0.046, TAN),
    box(0.05, 0.15, 0.016, { p: [0, 0.045, -0.386], c: D2 }),
    prof([[0.26, 0.042], [0.26, 0.116], [0.57, 0.112], [0.57, 0.05]], 0.056, TAN),
    ...[0.32, 0.39, 0.46].map((u) => box(0.06, 0.018, 0.04, { p: [0, 0.084, u], c: D2 })),
    box(0.026, 0.012, 0.62, { p: [0, 0.124, 0.22], c: D }),
    zc(0.013, 0.013, 0.2, 0.57, 0.082, D), zc(0.021, 0.021, 0.07, 0.74, 0.082, M, 8), box(0.03, 0.05, 0.04, { p: [0, 0.1, 0.6], c: D }),
    box(0.046, 0.014, 0.09, { p: [0, 0.136, 0.08], c: D }), box(0.008, 0.05, 0.09, { p: [-0.02, 0.165, 0.08], c: D }), box(0.008, 0.05, 0.09, { p: [0.02, 0.165, 0.08], c: D }), box(0.046, 0.008, 0.09, { p: [0, 0.192, 0.08], c: D }),
    box(0.012, 0.03, 0.07, { p: [0.034, 0.085, 0.11], c: M }), box(0.014, 0.014, 0.03, { p: [0.036, 0.06, -0.02], c: SV }),
  ],
  smg: () => [
    prof([[-0.09, 0.02], [-0.09, 0.108], [0.22, 0.108], [0.25, 0.085], [0.25, 0.03], [0.17, 0.02]], 0.056, D),
    prof(GRIP, 0.044, D2), guard(0.028, 0.02),
    box(0.024, 0.012, 0.26, { p: [0, 0.118, 0.06], c: D }),
    zc(0.027, 0.027, 0.13, 0.25, 0.062, M, 10), ...[0.275, 0.31, 0.345].map((u) => zc(0.029, 0.029, 0.012, u, 0.062, D2, 10)), zc(0.016, 0.016, 0.06, 0.38, 0.062, D, 8),
    box(0.012, 0.012, 0.25, { p: [-0.022, 0.1, -0.21], c: M }), box(0.012, 0.012, 0.25, { p: [0.022, 0.1, -0.21], c: M }), box(0.06, 0.11, 0.018, { p: [0, 0.065, -0.34], c: D2 }),
    prof([[0.17, 0.02], [0.225, 0.02], [0.215, -0.075], [0.18, -0.075]], 0.036, D2),
    box(0.012, 0.03, 0.012, { p: [0, 0.137, 0.2], c: D2 }), box(0.03, 0.026, 0.012, { p: [0, 0.135, -0.06], c: D2 }), box(0.012, 0.025, 0.06, { p: [0.03, 0.08, 0.08], c: M }),
  ],
  shotgun: () => [
    prof([[-0.06, 0.022], [-0.06, 0.112], [0.2, 0.112], [0.2, 0.03], [0.1, 0.022]], 0.054, D),
    prof([[-0.06, 0.105], [-0.06, 0.03], [-0.13, 0.01], [-0.4, -0.045], [-0.43, -0.04], [-0.43, 0.075], [-0.2, 0.1]], 0.046, WOOD),
    box(0.05, 0.125, 0.016, { p: [0, 0.017, -0.438], c: D2 }),
    prof([[-0.05, 0.03], [0.02, 0.03], [-0.01, -0.1], [-0.085, -0.085]], 0.042, WOOD), guard(0.02, 0.022),
    zc(0.021, 0.022, 0.6, 0.2, 0.09, D), zc(0.019, 0.019, 0.5, 0.2, 0.046, M), box(0.03, 0.07, 0.02, { p: [0, 0.068, 0.69], c: D }), zc(0.022, 0.022, 0.012, 0.7, 0.046, D2),
    box(0.008, 0.012, 0.008, { p: [0, 0.117, 0.78], c: 0xd8b24a }), box(0.012, 0.03, 0.08, { p: [0.028, 0.08, 0.08], c: M }),
    ...[0, 1, 2, 3].map((i) => cyl(0.011, 0.011, 0.05, 6, { p: [-0.035, 0.07, -0.03 + i * 0.035], c: 0xc23b2e })), box(0.01, 0.02, 0.15, { p: [-0.03, 0.05, 0.022], c: D2 }),
  ],
  pistol: () => [
    prof([[-0.075, 0.058], [-0.075, 0.116], [0.15, 0.116], [0.168, 0.1], [0.168, 0.058]], 0.034, SV),
    prof([[-0.065, 0.03], [-0.065, 0.06], [0.165, 0.06], [0.165, 0.04], [0.07, 0.03]], 0.03, D),
    prof([[-0.055, 0.035], [0.02, 0.035], [0.0, -0.105], [-0.08, -0.095]], 0.034, D2), guard(0.02, 0.032),
    zc(0.009, 0.009, 0.02, 0.165, 0.092, D2, 8), box(0.006, 0.012, 0.012, { p: [0, 0.124, 0.15], c: D2 }), box(0.022, 0.012, 0.012, { p: [0, 0.124, -0.06], c: D2 }),
    box(0.012, 0.02, 0.02, { p: [0, 0.105, -0.084], c: D2 }), ...[0, 1, 2, 3].map((i) => box(0.036, 0.04, 0.006, { p: [0, 0.088, -0.06 + i * 0.012], c: M })),
  ],
  sniper: () => [
    prof([[-0.47, 0.085], [-0.47, -0.035], [-0.39, -0.05], [-0.3, -0.005], [-0.13, 0.018], [0.3, 0.028], [0.44, 0.045], [0.44, 0.085], [-0.1, 0.09], [-0.2, 0.102], [-0.32, 0.108]], 0.05, OLIVE),
    box(0.052, 0.13, 0.018, { p: [0, 0.025, -0.478], c: D2 }), box(0.04, 0.03, 0.14, { p: [0, 0.118, -0.3], c: D2 }),
    prof([[-0.075, 0.03], [-0.01, 0.03], [-0.04, -0.1], [-0.105, -0.085]], 0.044, OLIVE), guard(-0.01, 0.022),
    zc(0.024, 0.024, 0.36, -0.1, 0.108, D, 10), zc(0.013, 0.018, 0.74, 0.26, 0.108, D, 8), box(0.04, 0.036, 0.08, { p: [0, 0.108, 1.03], c: D2 }),
    cyl(0.008, 0.008, 0.07, 6, { r: [0, 0, HP], p: [0.05, 0.108, -0.03], c: SV }), sph(0.016, { p: [0.09, 0.1, -0.03], c: D2 }, 6, 5),
    zc(0.021, 0.021, 0.36, -0.04, 0.185, D, 10), zc(0.036, 0.024, 0.09, 0.32, 0.185, D, 12), zc(0.027, 0.03, 0.06, -0.1, 0.185, D, 10),
    cyl(0.014, 0.014, 0.03, 8, { p: [0, 0.215, 0.12], c: M }), cyl(0.014, 0.014, 0.03, 8, { r: [0, 0, HP], p: [0.03, 0.185, 0.12], c: M }),
    box(0.02, 0.05, 0.025, { p: [0, 0.15, 0.03], c: D2 }), box(0.02, 0.05, 0.025, { p: [0, 0.15, 0.22], c: D2 }),
    box(0.01, 0.01, 0.24, { p: [-0.03, 0.014, 0.3], c: D2 }), box(0.01, 0.01, 0.24, { p: [0.03, 0.014, 0.3], c: D2 }),
  ],
  tac: () => [
    prof([[-0.08, 0.02], [-0.08, 0.118], [0.24, 0.118], [0.24, 0.03], [0.12, 0.02]], 0.06, D2),
    prof([[-0.08, 0.1], [-0.08, 0.035], [-0.16, 0.02], [-0.36, -0.03], [-0.38, 0.09], [-0.2, 0.108]], 0.05, D),
    box(0.05, 0.13, 0.016, { p: [0, 0.03, -0.39], c: D2 }),
    prof([[-0.05, 0.03], [0.02, 0.03], [-0.01, -0.1], [-0.085, -0.085]], 0.044, D2), guard(0.02, 0.022),
    zc(0.024, 0.024, 0.5, 0.24, 0.09, D), zc(0.03, 0.03, 0.06, 0.7, 0.09, M, 8), box(0.034, 0.03, 0.42, { p: [0, 0.046, 0.46], c: D2 }),
    box(0.018, 0.024, 0.28, { p: [0, 0.135, 0.1], c: D }), box(0.012, 0.03, 0.08, { p: [0.032, 0.08, 0.1], c: M }),
    ...[0, 1, 2, 3, 4].map((i) => cyl(0.012, 0.012, 0.055, 6, { p: [0.036, 0.07, -0.05 + i * 0.03], c: 0x2a6fd0 })),
  ],
  hunt: () => [
    prof([[-0.5, 0.085], [-0.5, -0.04], [-0.42, -0.05], [-0.3, 0.0], [-0.1, 0.02], [0.32, 0.03], [0.32, 0.075], [-0.1, 0.09], [-0.22, 0.1], [-0.36, 0.104]], 0.05, WOOD),
    box(0.052, 0.13, 0.018, { p: [0, 0.022, -0.505], c: D2 }),
    prof([[-0.075, 0.03], [-0.01, 0.03], [-0.04, -0.1], [-0.105, -0.085]], 0.044, WOOD), guard(-0.01, 0.022),
    zc(0.024, 0.024, 0.32, -0.08, 0.1, D, 10), zc(0.014, 0.017, 0.82, 0.24, 0.1, D, 8), box(0.02, 0.04, 0.02, { p: [0, 0.13, 1.03], c: D2 }),
    cyl(0.008, 0.008, 0.07, 6, { r: [0, 0, HP], p: [0.05, 0.1, -0.02], c: SV }), sph(0.016, { p: [0.09, 0.094, -0.02], c: D2 }, 6, 5),
    box(0.012, 0.03, 0.012, { p: [0, 0.13, 0.25], c: D2 }),
  ],
  rpg: () => [
    zc(0.07, 0.07, 1.1, -0.45, 0.13, OLIVE, 14), zc(0.085, 0.07, 0.14, 0.65, 0.13, D, 14), zc(0.078, 0.09, 0.12, -0.57, 0.13, D, 14),
    prof([[-0.055, 0.07], [0.02, 0.07], [-0.005, -0.08], [-0.08, -0.07]], 0.04, D2), guard(-0.01, 0.07),
    prof([[0.2, 0.07], [0.26, 0.07], [0.25, -0.06], [0.2, -0.05]], 0.04, D2),
    box(0.03, 0.09, 0.12, { p: [-0.08, 0.24, 0.12], c: D }), zc(0.025, 0.025, 0.14, 0.05, 0.3, D2, 8, -0.08),
  ],
};
// bewegliche Teile (Magazin / Pumpe) als eigene Geometrie für Animationen
const WMOVE = {
  ar: () => [prof([[0.09, -0.03], [0.18, -0.03], [0.205, -0.2], [0.125, -0.21]], 0.036, M)],
  smg: () => [prof([[0.085, 0.02], [0.145, 0.02], [0.14, -0.2], [0.08, -0.2]], 0.034, M)],
  shotgun: () => [zc(0.034, 0.034, 0.2, 0.32, 0.046, WOOD, 8), ...[0.35, 0.4, 0.45].map((u) => zc(0.036, 0.036, 0.012, u, 0.046, D2, 8))],
  pistol: () => [box(0.03, 0.016, 0.064, { r: [-0.14, 0, 0], p: [0, -0.107, -0.04], c: M })],
  sniper: () => [prof([[0.05, 0.025], [0.15, 0.025], [0.15, -0.03], [0.06, -0.03]], 0.036, D2)],
  tac: () => [box(0.04, 0.14, 0.07, { r: [-0.1, 0, 0], p: [0, -0.05, 0.14], c: D2 })],
  hunt: () => [box(0.012, 0.03, 0.05, { p: [0.03, 0.1, -0.02], c: SV })],
  rpg: () => [cone(0.065, 0.2, 10, { r: [HP, 0, 0], p: [0, 0.13, 0.82], c: 0x6f7d4a }), zc(0.04, 0.05, 0.12, 0.62, 0.13, 0x6f7d4a, 10)],
};
const WACC = {
  ar: () => [box(0.03, 0.04, 0.006, { p: [0, 0.165, 0.1], c: WH }), box(0.06, 0.014, 0.24, { p: [0, 0.058, 0.41], c: WH }), box(0.05, 0.012, 0.12, { p: [0, 0.1, -0.3], c: WH })],
  smg: () => [box(0.059, 0.016, 0.24, { p: [0, 0.09, 0.07], c: WH }), box(0.036, 0.016, 0.062, { p: [0, -0.205, 0.112], c: WH })],
  shotgun: () => [box(0.057, 0.03, 0.16, { p: [0, 0.058, 0.07], c: WH }), zc(0.024, 0.024, 0.016, 0.76, 0.09, WH, 10)],
  pistol: () => [box(0.037, 0.012, 0.15, { p: [0, 0.074, 0.06], c: WH })],
  sniper: () => [zc(0.038, 0.038, 0.012, 0.404, 0.185, WH, 12), box(0.053, 0.014, 0.3, { p: [0, 0.056, 0.14], c: WH }), zc(0.031, 0.031, 0.01, -0.105, 0.185, WH, 10)],
  tac: () => [box(0.062, 0.02, 0.3, { p: [0, 0.07, 0.04], c: WH }), zc(0.032, 0.032, 0.014, 0.66, 0.09, WH, 10)],
  hunt: () => [box(0.052, 0.014, 0.36, { p: [0, 0.06, 0.08], c: WH }), zc(0.018, 0.018, 0.02, 1.0, 0.1, WH, 8)],
  rpg: () => [zc(0.073, 0.073, 0.05, 0.2, 0.13, WH, 14), zc(0.073, 0.073, 0.05, -0.3, 0.13, WH, 14)],
};
export const MUZZLE = { ar: 0.82, smg: 0.45, shotgun: 0.82, pistol: 0.2, sniper: 1.08, tac: 0.76, hunt: 1.06, rpg: 0.8 };
export const RARMAT = ['#9aa0a6', '#3ecf4a', '#3aa0ff', '#b04dff', '#ffb52e', '#ff5f3a'].map((c) => new THREE.MeshStandardMaterial({ vertexColors: true, color: c, emissive: c, emissiveIntensity: 0.9, roughness: 0.35, metalness: 0.2 }));
const wcache = {};
export function weaponGeo(w) { return wcache[w] || (wcache[w] = { main: merge(WDEF[w]()), move: merge(WMOVE[w]()), acc: merge(WACC[w]()) }); }
export function weaponModel(w, r) {
  const g = new THREE.Group(), geo = weaponGeo(w);
  const a = new THREE.Mesh(geo.main, WM), b = new THREE.Mesh(geo.move, WM), c = new THREE.Mesh(geo.acc, RARMAT[r | 0]); a.castShadow = b.castShadow = true; g.add(a, b, c);
  return g;
}
let pickGeo = null;
export function pickaxeGeo() {
  return pickGeo || (pickGeo = merge([
    zc(0.022, 0.03, 0.92, -0.02, 0, 0x8a5a2b, 8), zc(0.034, 0.034, 0.2, -0.04, 0, D2, 8), zc(0.036, 0.036, 0.02, -0.05, 0, 0xffc83a, 8),
    prof([[0.8, -0.32], [0.875, -0.13], [0.892, 0], [0.875, 0.13], [0.8, 0.32], [0.775, 0.28], [0.828, 0.11], [0.842, 0], [0.828, -0.11], [0.775, -0.28]], 0.05, 0xc9d2da, 0.008),
    box(0.07, 0.1, 0.075, { p: [0, 0, 0.86], c: M }), box(0.074, 0.03, 0.08, { p: [0, 0, 0.86], c: 0xffc83a }),
  ]));
}

// ================= Beute-Modelle =================
const lcache = {};
export function itemGeo(i) {
  const k = i.k === 'w' ? null : i.k + (i.c || i.a || i.m);
  if (!k) return null;
  if (lcache[k]) return lcache[k];
  let l;
  if (i.k === 'c') {
    if (i.c === 'med') l = [box(0.46, 0.3, 0.3, { p: [0, 0.15, 0], c: 0xe23b2e }), box(0.2, 0.06, 0.02, { p: [0, 0.16, 0.155], c: 0xffffff }), box(0.06, 0.2, 0.02, { p: [0, 0.16, 0.155], c: 0xffffff }), box(0.2, 0.03, 0.06, { p: [0, 0.33, 0], c: 0xf2f2f2 })];
    else if (i.c === 'band') l = [cyl(0.16, 0.16, 0.2, 14, { r: [HP, 0, 0], p: [0, 0.16, 0], c: 0xf4f1e6 }), cyl(0.165, 0.165, 0.05, 14, { r: [HP, 0, 0], p: [0, 0.16, 0], c: 0xe23b2e }), cyl(0.05, 0.05, 0.21, 8, { r: [HP, 0, 0], p: [0, 0.16, 0], c: 0x9a8f7a })];
    else if (i.c === 'gren') l = [sph(0.15, { s: [1, 1.15, 1], p: [0, 0.18, 0], c: 0x4f6b2f }, 10, 8), cyl(0.155, 0.155, 0.03, 10, { p: [0, 0.18, 0], c: 0x3a4f22 }), cyl(0.155, 0.155, 0.03, 10, { p: [0, 0.26, 0], c: 0x3a4f22 }), cyl(0.155, 0.155, 0.03, 10, { p: [0, 0.1, 0], c: 0x3a4f22 }), cyl(0.05, 0.05, 0.08, 8, { p: [0, 0.38, 0], c: 0x9aa3ad }), box(0.03, 0.2, 0.05, { r: [0, 0, -0.35], p: [0.09, 0.33, 0], c: 0x9aa3ad }), cyl(0.045, 0.045, 0.012, 8, { r: [HP, 0, 0], p: [-0.07, 0.4, 0], c: 0xffc83a })];
    else if (i.c === 'stink') l = [sph(0.15, { p: [0, 0.17, 0], c: 0x8faa2a }, 10, 8), cyl(0.06, 0.07, 0.08, 8, { p: [0, 0.33, 0], c: 0x5a4a2a }), cyl(0.02, 0.02, 0.1, 6, { p: [0, 0.42, 0], c: 0xd8d0b0 }), sph(0.05, { p: [0.08, 0.26, 0.09], c: 0xb5d93a }, 6, 5), sph(0.04, { p: [-0.1, 0.2, 0.06], c: 0xb5d93a }, 6, 5)];
    else if (i.c === 'chug') l = [cyl(0.26, 0.26, 0.5, 14, { p: [0, 0.25, 0], c: 0x2f6fd0 }), cyl(0.27, 0.27, 0.05, 14, { p: [0, 0.08, 0], c: 0x9aa3ad }), cyl(0.27, 0.27, 0.05, 14, { p: [0, 0.42, 0], c: 0x9aa3ad }), cyl(0.08, 0.08, 0.08, 8, { p: [0, 0.54, 0], c: 0xdfeaf5 }), box(0.3, 0.16, 0.02, { p: [0, 0.27, 0.262], c: 0x8fd0ff })];
    else if (i.c === 'bush') l = [ico(0.26, 1, { p: [0, 0.26, 0], c: 0x3a8f3a, flat: 1 }), ico(0.18, 1, { p: [0.15, 0.36, 0.05], c: 0x4fae46, flat: 1 }), ico(0.16, 1, { p: [-0.14, 0.34, -0.06], c: 0x3f9a3f, flat: 1 }), box(0.06, 0.08, 0.06, { p: [0, 0.03, 0], c: 0x6b4526 })];
    else { const s = i.c === 'pot' ? 1 : 0.7, c = i.c === 'pot' ? 0x2f7bff : 0x6fd3ff; l = [cyl(0.16 * s, 0.18 * s, 0.3 * s, 12, { p: [0, 0.15 * s, 0], c }), cone(0.16 * s, 0.14 * s, 12, { p: [0, 0.37 * s, 0], c }), cyl(0.06 * s, 0.06 * s, 0.1 * s, 8, { p: [0, 0.46 * s, 0], c: 0xdfeaf5 }), cyl(0.07 * s, 0.07 * s, 0.05 * s, 8, { p: [0, 0.53 * s, 0], c: 0x8a5a2b })]; }
  } else if (i.k === 'a') {
    const c = { light: 0xd0b24a, medium: 0x5f7d3a, shells: 0xc23b2e, heavy: 0x3a4a6b, rockets: 0x6f7d4a }[i.a];
    l = [box(0.36, 0.2, 0.24, { p: [0, 0.1, 0], c }), box(0.38, 0.05, 0.26, { p: [0, 0.21, 0], c: 0x2a2d33 })];
    for (let n = -1; n <= 1; n++) l.push(cyl(0.03, 0.03, 0.12, 6, { p: [n * 0.09, 0.29, 0], c: 0xe0b23c }));
  } else if (i.m === 'wood') l = [box(0.5, 0.07, 0.14, { p: [0, 0.05, -0.08], c: 0xb9824a }), box(0.5, 0.07, 0.14, { p: [0, 0.05, 0.08], c: 0xa87238 }), box(0.5, 0.07, 0.14, { r: [0, 0.3, 0], p: [0, 0.13, 0], c: 0xc48f55 })];
  else if (i.m === 'stone') l = [box(0.26, 0.14, 0.16, { p: [-0.14, 0.07, 0], c: 0x9c9c9c }), box(0.26, 0.14, 0.16, { p: [0.14, 0.07, 0], c: 0x8a8a8a }), box(0.26, 0.14, 0.16, { p: [0, 0.21, 0], c: 0xa8a8a8 })];
  else l = [box(0.3, 0.1, 0.16, { p: [0, 0.05, 0], c: 0x6d8296 }), box(0.3, 0.1, 0.16, { r: [0, 0.5, 0], p: [0, 0.15, 0], c: 0x8ea3b6 })];
  return (lcache[k] = merge(l));
}
export function chestModel() {
  const g = new THREE.Group();
  const base = mesh([box(1.2, 0.55, 0.8, { p: [0, 0.28, 0], c: 0x7a4a22 }), box(1.24, 0.08, 0.84, { p: [0, 0.52, 0], c: 0xe0a92e }), box(0.1, 0.56, 0.84, { p: [-0.45, 0.28, 0], c: 0xe0a92e }), box(0.1, 0.56, 0.84, { p: [0.45, 0.28, 0], c: 0xe0a92e })]);
  const lid = new THREE.Mesh(merge([cyl(0.4, 0.4, 1.2, 12, { r: [0, 0, HP], s: [1, 0.75, 1], p: [0, 0, 0.4], c: 0x8a5526 }), cyl(0.415, 0.415, 0.1, 12, { r: [0, 0, HP], s: [1, 0.75, 1], p: [-0.45, 0, 0.4], c: 0xffc83a }), cyl(0.415, 0.415, 0.1, 12, { r: [0, 0, HP], s: [1, 0.75, 1], p: [0.45, 0, 0.4], c: 0xffc83a }), box(0.16, 0.2, 0.06, { p: [0, 0, 0.82], c: 0xffe27a })]),
    new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffa500, emissiveIntensity: 0.8, roughness: 0.35, metalness: 0.5 }));
  lid.position.set(0, 0.56, -0.4); lid.castShadow = true;
  g.add(base, lid);
  return { g, lid };
}
// Munitionskiste (flach, grün, Deckel klappt auf)
export function ammoBoxModel() {
  const g = new THREE.Group();
  const base = mesh([box(1.0, 0.38, 0.55, { p: [0, 0.19, 0], c: 0x4d5c3c }), box(1.04, 0.06, 0.59, { p: [0, 0.06, 0], c: 0x2f3a26 }), box(0.18, 0.12, 0.04, { p: [-0.3, 0.22, 0.29], c: 0xe0b23c }), box(0.18, 0.12, 0.04, { p: [0.3, 0.22, 0.29], c: 0xe0b23c })]);
  const lid = new THREE.Mesh(merge([box(1.04, 0.1, 0.59, { p: [0, 0.05, 0.295], c: 0x5a6b46 }), box(0.3, 0.04, 0.2, { p: [0, 0.11, 0.3], c: 0xd0b24a })]), new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x88aa44, emissiveIntensity: 0.35, roughness: 0.6 }));
  lid.position.set(0, 0.38, -0.295); lid.castShadow = true; g.add(base, lid);
  return { g, lid };
}
// Versorgungskiste mit Ballon
export function dropModel() {
  const g = new THREE.Group();
  const base = mesh([box(1.5, 1.1, 1.5, { p: [0, 0.55, 0], c: 0x2f6fd0 }), box(1.56, 0.12, 1.56, { p: [0, 0.06, 0], c: 0x1d3f7a }), box(1.56, 0.12, 1.56, { p: [0, 1.04, 0], c: 0x1d3f7a }),
    ...[[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]].map(([x, z]) => box(0.14, 1.12, 0.14, { p: [x, 0.56, z], c: 0xffc83a })), box(0.6, 0.6, 0.02, { p: [0, 0.6, 0.76], c: 0xffffff }), box(0.12, 0.4, 0.03, { p: [0, 0.6, 0.77], c: 0x2f6fd0 }), box(0.4, 0.12, 0.03, { p: [0, 0.6, 0.77], c: 0x2f6fd0 })]);
  const lid = new THREE.Mesh(merge([box(1.5, 0.14, 1.5, { p: [0, 0.07, 0.75], c: 0x3a86ff })]), new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0x3a86ff, emissiveIntensity: 0.6, roughness: 0.4 }));
  lid.position.set(0, 1.1, -0.75); lid.castShadow = true;
  const bal = mesh([sph(1.6, { s: [1, 1.15, 1], p: [0, 7.2, 0], c: 0x3aa0ff }, 16, 12), sph(1.62, { s: [1, 1.15, 1], p: [0, 7.2, 0], c: 0xffffff }, 16, 12, 0.5), ...[[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]].map(([x, z]) => cyl(0.02, 0.02, 4.6, 4, { r: [x > 0 ? -0.18 : 0.18, 0, 0], p: [x * 0.6, 3.6, z * 0.6], c: 0xdddddd }))], false);
  const light = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 140, 8, 1, true).translate(0, 70, 0), new THREE.MeshBasicMaterial({ color: 0x59b7ff, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  g.add(base, lid, bal, light);
  return { g, lid, bal, light };
}
// Reboot-Station (eigenes Design: Funkmast mit Lichtring)
export function vanModel() {
  return mesh([box(3.2, 1.9, 1.8, { p: [0, 0.95, 0], c: 0xe8e4da }), box(3.24, 0.4, 1.84, { p: [0, 0.4, 0], c: 0x2f7bd0 }), box(1.0, 1.0, 1.84, { p: [1.25, 1.5, 0], c: 0x7fb8e6 }),
    ...[[-1.1, 0.95], [1.1, 0.95], [-1.1, -0.95], [1.1, -0.95]].map(([x, z]) => cyl(0.36, 0.36, 0.3, 12, { r: [HP, 0, 0], p: [x, 0.36, z], c: 0x1a1c20 })),
    cyl(0.06, 0.06, 2.6, 6, { p: [-0.8, 3.2, 0], c: 0x9aa3ad }), sph(0.22, { p: [-0.8, 4.55, 0], c: 0x59b7ff }, 10, 8), box(1.6, 0.08, 1.2, { p: [-0.6, 1.95, 0], c: 0x2f7bd0 }),
    cyl(0.5, 0.5, 0.06, 16, { r: [0, 0, 0.6], p: [-0.2, 2.3, 0], c: 0xdfe6ee })]);
}
export const cardGeo = merge([box(0.5, 0.7, 0.04, { c: 0x59b7ff }), box(0.38, 0.12, 0.05, { p: [0, 0.18, 0], c: 0xffffff }), box(0.12, 0.3, 0.05, { p: [-0.08, -0.12, 0], c: 0xffd83a })]);
export const rocketGeo = merge([cyl(0.07, 0.07, 0.5, 8, { r: [HP, 0, 0], c: 0x6f7d4a }), cone(0.07, 0.2, 8, { r: [HP, 0, 0], p: [0, 0, 0.35], c: 0xd0392e }), box(0.3, 0.02, 0.1, { p: [0, 0, -0.2], c: 0x2a2d33 }), box(0.02, 0.3, 0.1, { p: [0, 0, -0.2], c: 0x2a2d33 })]);
export const bushGeo = merge([ico(0.9, 1, { s: [1, 0.9, 1], p: [0, 0.75, 0], c: 0x3f8f36, flat: 1 }), ico(0.65, 1, { p: [0.45, 1.25, 0.15], c: 0x4fa640, flat: 1 }), ico(0.6, 1, { p: [-0.45, 1.15, -0.1], c: 0x3a8532, flat: 1 }), ico(0.55, 1, { p: [0.05, 1.55, -0.2], c: 0x5bb44a, flat: 1 })]);

// ================= Figur (mit Ellbogen, Knien und beweglichem Kopf) =================
export const BPGEO = merge([box(0.34, 0.02, 0.44, { p: [0, 0, 0.1], c: 0x8fd0ff }), box(0.26, 0.022, 0.03, { p: [0, 0, 0.2], c: 0xffffff }), box(0.26, 0.022, 0.03, { p: [0, 0, 0.08], c: 0xffffff }), box(0.03, 0.022, 0.3, { p: [-0.1, 0, 0.1], c: 0xffffff })]);
const FLASHM = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.8, 1.1), transparent: true, opacity: 0.95, fog: false, blending: THREE.AdditiveBlending, depthWrite: false });
export function makeChar(hue, style) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const c1 = hsl(hue, 0.72, 0.5), c1d = hsl(hue, 0.65, 0.36), c2 = hsl(hue + 25, 0.42, 0.2), c3 = hsl(hue + 170, 0.85, 0.58);
  const st = style & 3, skin = [0xf0c8a0, 0xd9a577, 0xb07a52, 0x7a4f33][(style >> 2) & 3], dark = 0x22252b;
  const geos = [];
  const add = (geo, par) => { const m = new THREE.Mesh(geo, VM); m.castShadow = true; par.add(m); return m; };
  const G1 = (list) => { const x = merge(list); geos.push(x); return x; };
  const body = new THREE.Group(); body.position.y = 0.8; g.add(body);
  add(G1([
    cyl(0.31, 0.245, 0.6, 10, { s: [1, 1, 0.66], p: [0, 0.32, 0], c: c1 }), box(0.12, 0.44, 0.03, { p: [0, 0.34, 0.192], c: c3 }),
    box(0.16, 0.12, 0.03, { p: [-0.16, 0.2, 0.185], c: c1d }), box(0.16, 0.12, 0.03, { p: [0.16, 0.2, 0.185], c: c1d }),
    box(0.06, 0.62, 0.03, { r: [0, 0, 0.55], p: [0, 0.34, 0.2], c: dark }),
    cyl(0.262, 0.262, 0.07, 10, { s: [1, 1, 0.68], p: [0, 0.03, 0], c: dark }), box(0.09, 0.07, 0.03, { p: [0, 0.03, 0.18], c: c3 }),
    box(0.1, 0.12, 0.08, { p: [0.24, -0.02, 0.06], c: 0x6b5a3a }), box(0.42, 0.2, 0.26, { p: [0, -0.08, 0], c: c2 }),
    cyl(0.07, 0.08, 0.1, 8, { p: [0, 0.66, 0], c: skin }), cyl(0.12, 0.14, 0.06, 8, { s: [1, 1, 0.8], p: [0, 0.62, 0], c: c1d }),
    box(0.36, 0.42, 0.18, { p: [0, 0.33, -0.27], c: c2 }), box(0.37, 0.1, 0.2, { p: [0, 0.52, -0.27], c: c3 }), box(0.2, 0.16, 0.05, { p: [0, 0.26, -0.37], c: c1d }),
    cyl(0.08, 0.08, 0.42, 8, { r: [0, 0, HP], p: [0, 0.62, -0.27], c: 0x6b5a3a }),
  ]), body);
  const head = new THREE.Group(); head.position.y = 0.68; body.add(head);
  const hp = [sph(0.2, { s: [1, 1.1, 1], p: [0, 0.19, 0], c: skin }, 14, 10),
    box(0.05, 0.05, 0.02, { p: [-0.075, 0.21, 0.187], c: dark }), box(0.05, 0.05, 0.02, { p: [0.075, 0.21, 0.187], c: dark }),
    box(0.07, 0.016, 0.02, { r: [0, 0, -0.12], p: [-0.075, 0.255, 0.188], c: dark }), box(0.07, 0.016, 0.02, { r: [0, 0, 0.12], p: [0.075, 0.255, 0.188], c: dark }),
    box(0.04, 0.05, 0.04, { p: [0, 0.165, 0.2], c: skin }), box(0.08, 0.016, 0.02, { p: [0, 0.1, 0.186], c: 0x8a3b3b }),
    box(0.03, 0.07, 0.05, { p: [-0.2, 0.19, 0], c: skin }), box(0.03, 0.07, 0.05, { p: [0.2, 0.19, 0], c: skin })];
  if (st === 0) hp.push(sph(0.228, { p: [0, 0.21, 0], c: c2 }, 14, 8, 1.75), box(0.3, 0.04, 0.12, { p: [0, 0.25, 0.2], c: c3 }), box(0.06, 0.03, 0.3, { p: [0, 0.43, 0], c: c3 }));
  else if (st === 1) hp.push(sph(0.218, { p: [0, 0.22, 0], c: c1 }, 14, 8, 1.4), box(0.26, 0.03, 0.2, { p: [0, 0.27, 0.25], c: c2 }), sph(0.03, { p: [0, 0.44, 0], c: c3 }, 6, 4));
  else if (st === 2) { const hc = hsl(hue + 40, 0.5, 0.22); hp.push(sph(0.218, { p: [0, 0.21, -0.01], c: hc }, 14, 8, 1.8), cone(0.07, 0.18, 5, { r: [0.5, 0, 0], p: [0, 0.43, 0.08], c: hc }), cone(0.07, 0.16, 5, { r: [0.2, 0, 0.5], p: [-0.08, 0.43, 0], c: hc }), cone(0.07, 0.16, 5, { r: [0.2, 0, -0.5], p: [0.08, 0.43, 0], c: hc }), cone(0.06, 0.14, 5, { r: [-0.4, 0, 0], p: [0, 0.42, -0.08], c: hc })); }
  else hp.push(sph(0.222, { p: [0, 0.22, 0], c: c3 }, 14, 8, 1.5), sph(0.06, { p: [0, 0.46, 0], c: 0xffffff }, 8, 6), cyl(0.225, 0.225, 0.05, 14, { p: [0, 0.2, 0], c: 0xffffff }), box(0.34, 0.08, 0.06, { p: [0, 0.22, 0.17], c: dark }), box(0.12, 0.05, 0.065, { p: [-0.08, 0.22, 0.172], c: 0x7fd6ff }), box(0.12, 0.05, 0.065, { p: [0.08, 0.22, 0.172], c: 0x7fd6ff }));
  add(G1(hp), head);
  const aUp = G1([sph(0.115, { c: c2 }, 8, 6), cyl(0.088, 0.078, 0.32, 8, { p: [0, -0.16, 0], c: c1 })]);
  const aLow = G1([sph(0.08, { c: c1 }, 8, 6), cyl(0.076, 0.066, 0.28, 8, { p: [0, -0.14, 0], c: c1 }), cyl(0.078, 0.078, 0.06, 8, { p: [0, -0.25, 0], c: c3 }), box(0.1, 0.11, 0.11, { p: [0, -0.33, 0], c: st & 1 ? dark : skin })]);
  const lUp = G1([cyl(0.12, 0.1, 0.4, 8, { p: [0, -0.2, 0], c: c2 }), box(0.08, 0.14, 0.04, { p: [0.1, -0.16, 0], c: c1d })]);
  const lLow = G1([sph(0.1, { c: c2 }, 8, 6), cyl(0.095, 0.085, 0.34, 8, { p: [0, -0.17, 0], c: c2 }), box(0.14, 0.12, 0.06, { p: [0, -0.03, 0.09], c: c3 }), cyl(0.1, 0.1, 0.08, 8, { p: [0, -0.3, 0], c: dark }), box(0.19, 0.14, 0.3, { p: [0, -0.37, 0.05], c: dark }), box(0.2, 0.04, 0.32, { p: [0, -0.43, 0.05], c: 0x111317 })]);
  const limb = (gu, gl, x, y, len, par) => { const up = new THREE.Group(); up.position.set(x, y, 0); add(gu, up); const low = new THREE.Group(); low.position.y = -len; add(gl, low); up.add(low); par.add(up); return { up, low }; };
  const aL = limb(aUp, aLow, -0.4, 0.58, 0.3, body), aR = limb(aUp, aLow, 0.4, 0.58, 0.3, body);
  const lL = limb(lUp, lLow, -0.13, 0.78, 0.38, g), lR = limb(lUp, lLow, 0.13, 0.78, 0.38, g);
  const gun = new THREE.Group(); gun.rotation.x = HP; gun.position.set(0, -0.33, 0.07);
  const wg = weaponGeo('ar');
  const gunMain = add(wg.main, gun), gunMove = add(wg.move, gun); gunMain.material = gunMove.material = WM; const gunAcc = new THREE.Mesh(wg.acc, RARMAT[0]); gun.add(gunAcc);
  const flash = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.46, 6).rotateX(HP), FLASHM); flash.visible = false; gun.add(flash);
  aR.low.add(gun);
  const pick = add(pickaxeGeo(), aR.low); pick.position.set(0, -0.33, 0);
  const held = add(BPGEO, aR.low); held.position.set(0, -0.42, 0.06); held.visible = false;
  const glider = new THREE.Group();
  const canopy = [];
  for (let i = -3; i <= 3; i++) canopy.push(box(0.6, 0.07, 1.7 - Math.abs(i) * 0.12, { r: [0, 0, -i * 0.15], p: [i * 0.57, 3.25 - i * i * 0.05, 0], c: i % 2 ? 0xffffff : c1 }));
  canopy.push(cyl(0.02, 0.02, 1.6, 5, { r: [0, 0, 0.5], p: [-0.55, 2.55, 0], c: dark }), cyl(0.02, 0.02, 1.6, 5, { r: [0, 0, -0.5], p: [0.55, 2.55, 0], c: dark }), cyl(0.02, 0.02, 1.9, 5, { r: [0, 0, 0.95], p: [-1.0, 2.6, 0], c: dark }), cyl(0.02, 0.02, 1.9, 5, { r: [0, 0, -0.95], p: [1.0, 2.6, 0], c: dark }), box(1.0, 0.05, 0.05, { p: [0, 1.95, 0], c: dark }));
  add(G1(canopy), glider); glider.visible = false; g.add(glider);
  return { g, body, head, aL, aR, lL, lR, gun, gunMain, gunMove, gunAcc, flash, pick, held, glider, geos, walk: 0, w: '', wr: -1, kick: 0, draw: 1, flinch: 0, land: 0, cur: null };
}
export function disposeChar(ch) { for (const g of ch.geos) g.dispose(); }

// ================= Autos (Front zeigt nach +z) =================
export const CARSEAT = [[-0.38, 0.5, -0.25], [-0.44, 0.55, 0.1]];
let wheelGeo = null;
export function carModel(v, hue) {
  const paint = hsl(hue, 0.75, 0.48), p2 = hsl(hue, 0.6, 0.3), G = 0x30343b, L = 0xfff2a8, R = 0xe02b2b;
  let l, wy, wx, wz;
  if (v === 0) {
    wy = 0.48; wx = 0.95; wz = 1.25;
    l = [box(1.5, 0.28, 3.5, { p: [0, 0.62, 0], c: paint }), box(1.3, 0.3, 1.1, { p: [0, 0.86, 1.15], c: paint }), box(1.1, 0.22, 0.4, { r: [0.3, 0, 0], p: [0, 0.8, 1.8], c: p2 }),
      box(1.2, 0.45, 0.8, { p: [0, 0.95, -1.3], c: G }), cyl(0.06, 0.06, 0.5, 6, { r: [HP, 0, 0], p: [-0.35, 1.0, -1.85], c: 0x9aa3ad }), cyl(0.06, 0.06, 0.5, 6, { r: [HP, 0, 0], p: [0.35, 1.0, -1.85], c: 0x9aa3ad }),
      box(0.22, 0.3, 1.6, { p: [-0.86, 0.7, 0], c: p2 }), box(0.22, 0.3, 1.6, { p: [0.86, 0.7, 0], c: p2 }),
      box(0.5, 0.6, 0.14, { r: [-0.15, 0, 0], p: [-0.38, 1.1, -0.6], c: G }), box(0.5, 0.6, 0.14, { r: [-0.15, 0, 0], p: [0.38, 1.1, -0.6], c: G }),
      box(0.5, 0.1, 0.5, { p: [-0.38, 0.82, -0.32], c: G }), box(0.5, 0.1, 0.5, { p: [0.38, 0.82, -0.32], c: G }),
      cyl(0.04, 0.04, 1.2, 6, { p: [-0.7, 1.36, -0.78], c: G }), cyl(0.04, 0.04, 1.2, 6, { p: [0.7, 1.36, -0.78], c: G }),
      cyl(0.04, 0.04, 1.05, 6, { r: [0.5, 0, 0], p: [-0.7, 1.45, 0.42], c: G }), cyl(0.04, 0.04, 1.05, 6, { r: [0.5, 0, 0], p: [0.7, 1.45, 0.42], c: G }),
      box(0.07, 0.07, 1.0, { p: [-0.7, 1.93, -0.3], c: G }), box(0.07, 0.07, 1.0, { p: [0.7, 1.93, -0.3], c: G }), box(1.46, 0.07, 0.07, { p: [0, 1.93, -0.78], c: G }), box(1.46, 0.07, 0.07, { p: [0, 1.9, 0.18], c: G }),
      box(0.22, 0.14, 0.06, { p: [-0.42, 0.92, 1.72], c: L }), box(0.22, 0.14, 0.06, { p: [0.42, 0.92, 1.72], c: L }), box(0.2, 0.1, 0.05, { p: [-0.45, 0.98, -1.72], c: R }), box(0.2, 0.1, 0.05, { p: [0.45, 0.98, -1.72], c: R }),
      box(1.6, 0.12, 0.12, { p: [0, 0.5, 1.98], c: 0x9aa3ad }), box(1.6, 0.12, 0.12, { p: [0, 0.5, -1.8], c: 0x9aa3ad }),
      cyl(0.17, 0.17, 0.04, 10, { r: [1.1, 0, 0], p: [-0.38, 1.22, 0.3], c: G }), box(1.3, 0.25, 0.08, { r: [-0.3, 0, 0], p: [0, 1.05, 0.55], c: p2 }),
      box(0.42, 0.07, 1.0, { p: [-0.95, 1.02, 1.25], c: paint }), box(0.42, 0.07, 1.0, { p: [0.95, 1.02, 1.25], c: paint }), box(0.42, 0.07, 1.0, { p: [-0.95, 1.02, -1.25], c: paint }), box(0.42, 0.07, 1.0, { p: [0.95, 1.02, -1.25], c: paint }),
      box(1.5, 0.06, 0.5, { p: [0, 1.5, -1.75], c: paint }), box(0.06, 0.35, 0.3, { p: [-0.6, 1.32, -1.7], c: G }), box(0.06, 0.35, 0.3, { p: [0.6, 1.32, -1.7], c: G })];
  } else {
    wy = 0.46; wx = 0.98; wz = 1.4;
    l = [box(1.9, 0.55, 4.3, { p: [0, 0.82, 0], c: paint }), box(1.8, 0.1, 1.3, { r: [0.05, 0, 0], p: [0, 1.13, 1.45], c: paint }),
      box(0.1, 0.78, 0.1, { r: [0.3, 0, 0], p: [-0.86, 1.5, 0.72], c: paint }), box(0.1, 0.78, 0.1, { r: [0.3, 0, 0], p: [0.86, 1.5, 0.72], c: paint }),
      box(0.1, 0.8, 0.1, { p: [-0.86, 1.5, -0.4], c: paint }), box(0.1, 0.8, 0.1, { p: [0.86, 1.5, -0.4], c: paint }),
      box(1.86, 0.1, 1.1, { p: [0, 1.92, 0.08], c: paint }), box(1.7, 0.72, 0.04, { r: [0.3, 0, 0], p: [0, 1.5, 0.74], c: 0xa9dcff }), box(1.7, 0.6, 0.04, { p: [0, 1.58, -0.42], c: 0xa9dcff }),
      box(0.1, 0.4, 1.65, { p: [-0.9, 1.28, -1.3], c: paint }), box(0.1, 0.4, 1.65, { p: [0.9, 1.28, -1.3], c: paint }), box(1.9, 0.4, 0.1, { p: [0, 1.28, -2.1], c: p2 }), box(1.7, 0.05, 1.6, { p: [0, 1.11, -1.3], c: G }),
      box(1.5, 0.3, 0.06, { p: [0, 0.88, 2.16], c: G }), box(0.3, 0.16, 0.06, { p: [-0.72, 0.95, 2.17], c: L }), box(0.3, 0.16, 0.06, { p: [0.72, 0.95, 2.17], c: L }),
      box(0.26, 0.14, 0.05, { p: [-0.75, 0.95, -2.16], c: R }), box(0.26, 0.14, 0.05, { p: [0.75, 0.95, -2.16], c: R }),
      box(2.0, 0.16, 0.16, { p: [0, 0.56, 2.2], c: 0x9aa3ad }), box(2.0, 0.16, 0.16, { p: [0, 0.56, -2.2], c: 0x9aa3ad }),
      box(0.5, 0.55, 0.14, { p: [-0.44, 1.35, -0.2], c: G }), box(0.5, 0.55, 0.14, { p: [0.44, 1.35, -0.2], c: G }), cyl(0.17, 0.17, 0.04, 10, { r: [1.2, 0, 0], p: [-0.44, 1.38, 0.52], c: G }),
      box(1.94, 0.1, 0.9, { p: [0, 0.62, 1.4], c: G }), box(1.94, 0.1, 0.9, { p: [0, 0.62, -1.4], c: G }), box(1.7, 0.06, 0.06, { p: [0, 2.0, -0.3], c: 0xffc83a })];
  }
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const body = mesh(l, true, CARM); body.receiveShadow = true; g.add(body);
  if (!wheelGeo) wheelGeo = merge([cyl(0.48, 0.48, 0.36, 14, { r: [0, 0, HP], c: 0x17181b }), cyl(0.26, 0.26, 0.38, 8, { r: [0, 0, HP], c: 0xb9c2cc }), cyl(0.1, 0.1, 0.4, 6, { r: [0, 0, HP], c: 0x555b63 })]);
  const wheels = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const w = new THREE.Mesh(wheelGeo, VM); w.castShadow = true; w.position.set(sx * wx, wy, sz * wz); w.scale.setScalar(wy / 0.48); g.add(w); wheels.push(w); }
  return { g, wheels, geo: body.geometry };
}

// ================= Natur =================
export function natureGeos() {
  return {
    pine: merge([cyl(0.22, 0.4, 3.0, 6, { p: [0, 1.5, 0], c: 0x6b4526, flat: 1 }), cone(2.2, 2.7, 7, { p: [0, 3.5, 0], c: 0x2f7d3a, flat: 1 }), cone(1.75, 2.4, 7, { r: [0, 0.4, 0], p: [0, 5.0, 0], c: 0x389447, flat: 1 }), cone(1.2, 2.1, 7, { r: [0, 0.8, 0], p: [0, 6.4, 0], c: 0x46a855, flat: 1 })]),
    oak: merge([cyl(0.3, 0.5, 2.9, 6, { p: [0, 1.45, 0], c: 0x7a5230, flat: 1 }), cyl(0.12, 0.2, 1.4, 5, { r: [0, 0, -0.8], p: [0.6, 2.6, 0], c: 0x7a5230, flat: 1 }),
      ico(1.75, 1, { p: [0, 4.4, 0], c: 0x5aa83a, flat: 1 }), ico(1.3, 1, { p: [1.25, 3.6, 0.4], c: 0x4c9632, flat: 1 }), ico(1.2, 1, { p: [-1.1, 3.8, -0.5], c: 0x68b844, flat: 1 }), ico(1.05, 1, { p: [0.2, 5.6, -0.3], c: 0x74c44e, flat: 1 })]),
    rock: merge([mk(new THREE.DodecahedronGeometry(1.3), { s: [1, 0.75, 1.1], p: [0, 0.45, 0], c: 0x8d8f94, flat: 1 }), mk(new THREE.DodecahedronGeometry(0.7), { r: [0.4, 0.7, 0], p: [0.95, 0.25, 0.5], c: 0x76787d, flat: 1 }), mk(new THREE.DodecahedronGeometry(0.5), { r: [0.2, 0.3, 0.6], p: [-0.8, 0.2, -0.6], c: 0x9c9ea3, flat: 1 })]),
    bush: merge([ico(0.7, 0, { s: [1.2, 0.75, 1.2], p: [0, 0.38, 0], c: 0x3f8f3a, flat: 1 }), ico(0.5, 0, { p: [0.55, 0.3, 0.2], c: 0x4fa246, flat: 1 }), ico(0.4, 0, { p: [-0.5, 0.25, -0.25], c: 0x357a31, flat: 1 })]),
    grass: merge([cone(0.07, 0.55, 4, { r: [0.15, 0, 0.1], p: [0, 0.27, 0], c: 0x6fc24a, flat: 1 }), cone(0.06, 0.45, 4, { r: [-0.2, 0, -0.3], p: [0.12, 0.22, 0.05], c: 0x5fae3c, flat: 1 }), cone(0.06, 0.4, 4, { r: [0.25, 0, 0.35], p: [-0.1, 0.2, -0.06], c: 0x7fce58, flat: 1 })]),
    birch: merge([cyl(0.16, 0.24, 4.2, 6, { p: [0, 2.1, 0], c: 0xe9e5d8, flat: 1 }), box(0.3, 0.08, 0.3, { p: [0, 1.0, 0], c: 0x3a3a36 }), box(0.26, 0.07, 0.26, { p: [0, 2.1, 0], c: 0x3a3a36 }), box(0.22, 0.06, 0.22, { p: [0, 3.0, 0], c: 0x3a3a36 }),
      ico(1.25, 1, { s: [1, 1.25, 1], p: [0, 5.0, 0], c: 0x9fcf4a, flat: 1 }), ico(0.95, 1, { p: [0.8, 4.2, 0.3], c: 0xb5dc5a, flat: 1 }), ico(0.9, 1, { p: [-0.7, 4.4, -0.4], c: 0x8cc040, flat: 1 })]),
    palm: merge([cyl(0.2, 0.3, 1.6, 6, { r: [0, 0, 0.1], p: [0, 0.8, 0], c: 0x9a7b4f, flat: 1 }), cyl(0.18, 0.21, 1.6, 6, { r: [0, 0, 0.2], p: [-0.24, 2.3, 0], c: 0x8a6c42, flat: 1 }), cyl(0.15, 0.19, 1.6, 6, { r: [0, 0, 0.3], p: [-0.62, 3.75, 0], c: 0x9a7b4f, flat: 1 }), cyl(0.13, 0.16, 1.4, 6, { r: [0, 0, 0.38], p: [-1.1, 5.1, 0], c: 0x8a6c42, flat: 1 }),
      sph(0.18, { p: [-1.25, 5.6, 0.2], c: 0x5a3a1a }, 6, 5), sph(0.18, { p: [-1.5, 5.6, -0.15], c: 0x5a3a1a }, 6, 5),
      ...[0, 1, 2, 3, 4, 5, 6].map((i) => { const a = i * 0.898; return box(0.55, 0.05, 2.6, { r: [0.55, a, 0], p: [-1.36 + Math.sin(a) * 1.1, 5.55, Math.cos(a) * 1.1], c: i % 2 ? 0x3f9a3a : 0x4fae46, flat: 1 }); })]),
    crate: merge([box(1.2, 1.2, 1.2, { p: [0, 0.6, 0], c: 0xb9824a }), ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => box(0.14, 1.24, 0.14, { p: [a * 0.56, 0.6, b * 0.56], c: 0x7d5226 })), box(1.24, 0.14, 1.24, { p: [0, 0.07, 0], c: 0x7d5226 }), box(1.24, 0.14, 1.24, { p: [0, 1.13, 0], c: 0x7d5226 }), box(1.22, 0.1, 0.1, { r: [0, 0, 0.78], p: [0, 0.6, 0.6], c: 0x8a5a2b }), box(1.22, 0.1, 0.1, { r: [0, 0, 0.78], p: [0, 0.6, -0.6], c: 0x8a5a2b })]),
    barrel: merge([cyl(0.48, 0.48, 1.2, 12, { p: [0, 0.6, 0], c: 0x3f6f9a }), cyl(0.5, 0.5, 0.07, 12, { p: [0, 0.2, 0], c: 0x9aa3ad }), cyl(0.5, 0.5, 0.07, 12, { p: [0, 0.6, 0], c: 0x9aa3ad }), cyl(0.5, 0.5, 0.07, 12, { p: [0, 1.0, 0], c: 0x9aa3ad }), cyl(0.44, 0.44, 0.04, 12, { p: [0, 1.21, 0], c: 0x2f5578 }), cyl(0.06, 0.06, 0.06, 6, { p: [0.25, 1.24, 0], c: 0x22252b })]),
    flower: merge([cyl(0.015, 0.015, 0.4, 4, { p: [0, 0.2, 0], c: 0x4c9632 }), sph(0.09, { s: [1, 0.6, 1], p: [0, 0.42, 0], c: 0xffffff }, 6, 4)]),
  };
}

export function houseDeco(h, G, H) {
  const [cx, cz, w, d, l, st, door, mt] = h;
  const x0 = cx * G, z0 = cz * G, x1 = (cx + w) * G, z1 = (cz + d) * G, mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, y0 = l * H, top = (l + st) * H + 0.12;
  const trim = mt === 'w' ? 0x6f4a22 : mt === 's' ? 0xd8d4c8 : 0x3f5062, floor = mt === 'w' ? 0xa87238 : mt === 's' ? 0x8f8f8a : 0x56687a;
  const aw = [0xd0392e, 0x2f7bd0, 0x3a9a4a, 0xe0a92e][(cx * 7 + cz * 13 & 0x7fffffff) % 4], dx = (cx + door + 0.5) * G;
  const l2 = [
    box(x1 - x0 + 0.6, 0.12, z1 - z0 + 0.6, { p: [mx, y0 + 0.01, mz], c: floor }),
    box(x1 - x0 + 0.5, 0.45, 0.3, { p: [mx, top + 0.2, z0], c: trim }), box(x1 - x0 + 0.5, 0.45, 0.3, { p: [mx, top + 0.2, z1], c: trim }),
    box(0.3, 0.45, z1 - z0 + 0.5, { p: [x0, top + 0.2, mz], c: trim }), box(0.3, 0.45, z1 - z0 + 0.5, { p: [x1, top + 0.2, mz], c: trim }),
    box(0.3, 0.3, 0.34, { p: [dx - G / 2 + 0.1, y0 + H / 2, z0], s: [1, H / 0.3, 1], c: trim }), box(0.3, 0.3, 0.34, { p: [dx + G / 2 - 0.1, y0 + H / 2, z0], s: [1, H / 0.3, 1], c: trim }),
    box(G, 0.3, 0.34, { p: [dx, y0 + H - 0.15, z0], c: trim }), box(G + 0.5, 0.08, 1.3, { r: [-0.28, 0, 0], p: [dx, y0 + H + 0.12, z0 - 0.62], c: aw }),
    box(0.7, 1.3, 0.7, { p: [x1 - 0.85, top + 0.65, z1 - 0.85], c: 0x8a5a4a }), box(0.86, 0.14, 0.86, { p: [x1 - 0.85, top + 1.3, z1 - 0.85], c: 0x4a3a34 }),
  ];
  for (const [px, pz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) l2.push(box(0.42, 1, 0.42, { s: [1, st * H + 0.5, 1], p: [px, y0 + (st * H + 0.5) / 2, pz], c: trim }));
  return merge(l2);
}
export const streakGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);

// ================= Himmel / Wolken =================
export function makeSky(sunDir) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(2600, 24, 14), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms: { sun: { value: sunDir } },
    vertexShader: 'varying vec3 vp; void main(){ vp=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vp; uniform vec3 sun; void main(){ vec3 d=normalize(vp); float h=max(d.y,0.0); vec3 c=mix(vec3(0.52,0.74,0.95),vec3(0.07,0.25,0.68),pow(h,0.6)); float s=max(dot(d,sun),0.0); c+=vec3(1.0,0.85,0.55)*pow(s,350.0)*2.0+vec3(1.0,0.75,0.45)*pow(s,10.0)*0.18; gl_FragColor=vec4(c,1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  }));
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}
export function makeClouds(n) {
  const geo = merge([ico(1, 1, { s: [1.6, 0.55, 1], c: 0xffffff, flat: 1 }), ico(0.8, 1, { s: [1.3, 0.6, 1], p: [1.3, 0.1, 0.3], c: 0xf4f8ff, flat: 1 }), ico(0.7, 1, { s: [1.2, 0.55, 1], p: [-1.3, 0.05, -0.2], c: 0xeef4ff, flat: 1 }), ico(0.6, 1, { p: [0.2, 0.35, -0.3], c: 0xffffff, flat: 1 })]);
  const im = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.25, 1.25, 1.3), fog: false, transparent: true, opacity: 0.95 }), n);
  const list = [];
  for (let i = 0; i < n; i++) list.push({ x: (Math.random() - 0.5) * 2600, y: 230 + Math.random() * 110, z: (Math.random() - 0.5) * 2600, s: 18 + Math.random() * 30, r: Math.random() * 6.28 });
  im.frustumCulled = false; im.userData.list = list;
  return im;
}

// ================= Partikel =================

// ================= Bau-Texturen =================
function tex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); draw(g);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function speckle(g, n, a) { for (let i = 0; i < n; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * a})`; g.fillRect(Math.random() * 256, Math.random() * 256, 2 + Math.random() * 5, 2); } }
function win(g, frame) {
  g.fillStyle = frame; g.fillRect(70, 56, 116, 124);
  const gr = g.createLinearGradient(80, 66, 176, 170); gr.addColorStop(0, '#bfe6ff'); gr.addColorStop(0.5, '#6fb4e6'); gr.addColorStop(1, '#9ad2f5');
  g.fillStyle = gr; g.fillRect(80, 66, 96, 104); g.fillStyle = frame; g.fillRect(125, 66, 6, 104); g.fillRect(80, 114, 96, 6);
  g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.moveTo(86, 104); g.lineTo(118, 70); g.lineTo(124, 70); g.lineTo(86, 112); g.fill();
}
const DRAW = {
  wood: (g) => { g.fillStyle = '#b9824a'; g.fillRect(0, 0, 256, 256); for (let i = 0; i < 4; i++) { g.fillStyle = ['#c08a50', '#b17a42', '#bd8549', '#a97440'][i]; g.fillRect(0, i * 64, 256, 62); g.fillStyle = '#6f4a22'; g.fillRect(0, i * 64 + 62, 256, 2); g.fillStyle = '#5a3a1a'; for (const x of [10, 246]) { g.beginPath(); g.arc(x, i * 64 + 31, 3, 0, 7); g.fill(); } } speckle(g, 500, 0.1); g.strokeStyle = '#7d5226'; g.lineWidth = 12; g.strokeRect(6, 6, 244, 244); g.lineWidth = 9; g.beginPath(); g.moveTo(6, 250); g.lineTo(250, 6); g.stroke(); },
  stone: (g) => { g.fillStyle = '#77777a'; g.fillRect(0, 0, 256, 256); for (let r = 0; r < 6; r++) for (let c = -1; c < 4; c++) { const x = c * 86 + (r % 2 ? 43 : 0), v = 140 + Math.floor(Math.random() * 40); g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(x + 2, r * 43 + 2, 82, 39); g.fillStyle = 'rgba(255,255,255,.13)'; g.fillRect(x + 2, r * 43 + 2, 82, 4); } speckle(g, 600, 0.09); },
  metal: (g) => { const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, '#7f95a9'); gr.addColorStop(0.5, '#62788c'); gr.addColorStop(1, '#75899c'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); speckle(g, 300, 0.07); g.strokeStyle = '#3f5062'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246); g.lineWidth = 6; g.strokeRect(5, 5, 123, 246); g.fillStyle = '#d2dde7'; for (const [x, y] of [[20, 20], [236, 20], [20, 236], [236, 236], [128, 20], [128, 236], [20, 128], [236, 128]]) { g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill(); } },
};
export function pieceMaterials() {
  const out = {};
  const P = { wood: [0.8, 0], stone: [0.9, 0], metal: [0.45, 0.55] };
  for (const k in DRAW) out[k] = [0, 1, 2].map((w) => {
    const fr = k === 'wood' ? '#5a3a1a' : k === 'stone' ? '#e8e4da' : '#2c3945';
    const map = tex((g) => {
      DRAW[k](g);
      if (w === 1) { g.fillStyle = fr; g.fillRect(64, 50, 128, 132); g.clearRect(74, 60, 108, 112); }
      if (w === 2) { g.fillStyle = fr; g.fillRect(70, 48, 116, 208); g.clearRect(80, 58, 96, 198); }
    });
    return new THREE.MeshStandardMaterial({ map, normalMap: normalFromCanvas(map.image, k === 'metal' ? 2 : 4), roughness: P[k][0], metalness: P[k][1], alphaTest: w ? 0.5 : 0, side: w ? THREE.DoubleSide : THREE.FrontSide });
  });
  return out;
}
export function stormTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#8b3dff'; g.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '210,170,255' : '70,20,160'},${0.15 + Math.random() * 0.35})`; g.fillRect(Math.random() * 256, 0, 1 + Math.random() * 5, 64); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(24, 1); t.colorSpace = THREE.SRGBColorSpace; return t;
}
