import * as THREE from './lib/three.module.js';
import { VM, WM as WMAT, merge, pickaxeGeo, weaponGeo, weaponModel, MUZZLE, RARMAT, BPGEO, itemGeo, chestModel, ammoBoxModel, dropModel, vanModel, cardGeo, rocketGeo, bushGeo, makeChar as buildChar, disposeChar, carModel, CARSEAT, natureGeos, houseDeco, streakGeo, makeSky, makeClouds, pieceMaterials, stormTexture } from './models.js';
import { U, quality, TIER, makePost, groundTextures, terrainMaterial, waterMaterial, windMaterial, Particles } from './gfx.js';
const S = window.S, G = S.G, H = S.H, HP = Math.PI / 2;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TOUCH = /[?&]touch=1/.test(location.search) || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
if (TOUCH) document.body.classList.add('touch');
const QL = quality(TOUCH), QT = TIER[QL];
let SENS = 1, T = 0, shake = 0;

// ================= Renderer / Szene =================
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, QT.pr));
renderer.shadowMap.enabled = QT.shadow > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb4d6f5, QT.view * 0.4, QT.view * 1.7);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3000);
camera.rotation.order = 'YXZ';
let post = null;
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (post) post.resize(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0xdcefff, 0x5a6a3c, 0.6));
const sun = new THREE.DirectionalLight(0xfff0d6, 2.7);
sun.castShadow = QT.shadow > 0; sun.shadow.mapSize.set(QT.shadow || 512, QT.shadow || 512); sun.shadow.radius = 3;
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 320 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const SUNDIR = new THREE.Vector3(70, 120, 45).normalize();
const sky = makeSky(SUNDIR); scene.add(sky);
{ // Umgebungslicht aus dem Himmel (Spiegelungen und weiches Licht)
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(makeSky(SUNDIR));
  scene.environment = pm.fromScene(es, 0, 1, 3000).texture; scene.environmentIntensity = 0.65; pm.dispose();
}
post = makePost(renderer, scene, camera, QL);
const dbs = new THREE.Vector2();
function draw() { if (window.__nodraw) return; U.time.value = T; renderer.getDrawingBufferSize(dbs); fx.scale.value = dbs.y / (2 * Math.tan(camera.fov * Math.PI / 360)); if (post) post.comp.render(); else renderer.render(scene, camera); }
const clouds = makeClouds(70); scene.add(clouds);
const fx = new Particles(scene); fx.ground = S.height;
const dummy = new THREE.Object3D();

// ---- Gelände
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
function groundColor(x, z, h) {
  if (h < 0.7) return [0.87, 0.81, 0.58];
  const n = hash(Math.round(x / 6), Math.round(z / 6));
  if (S.poiAt(x, z, 3)) return [0.6 + n * 0.06, 0.57 + n * 0.06, 0.48];
  if (h > 21.5) return [0.92 + n * 0.05, 0.94 + n * 0.04, 0.97];
  if (h > 16.5) return [0.52 + n * 0.07, 0.53 + n * 0.07, 0.5];
  if (S.roadDist(x, z) < 3.4) return [0.66 + n * 0.06, 0.55 + n * 0.05, 0.38];
  const dry = 0.5 + 0.5 * Math.sin(x * 0.013 + 2) * Math.cos(z * 0.011);
  return [0.26 + n * 0.1 + dry * 0.1, 0.6 + n * 0.12, 0.22 + n * 0.05];
}
let water;
function waterNormals() {
  const N = 128, c = document.createElement('canvas'); c.width = c.height = N; const g = c.getContext('2d'), im = g.createImageData(N, N);
  const W = [[1, 2, 0.3], [3, 1, 1.7], [2, -3, 4.1], [5, 2, 2.2], [-4, 5, 0.9], [7, -2, 3.3]];
  const h = (x, y) => { let s = 0; for (const [a, b, p] of W) s += Math.sin(2 * Math.PI * (a * x + b * y) / N + p) / Math.hypot(a, b); return s; };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const nx = -(h(x + 1, y) - h(x - 1, y)) * 2.5, ny = -(h(x, y + 1) - h(x, y - 1)) * 2.5, l = Math.hypot(nx, ny, 1); im.data.set([(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (1 / l * 0.5 + 0.5) * 255, 255], (y * N + x) * 4); }
  g.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(180, 180); return t;
}
const E = S.R + 30;
const TG = (() => { // Höhenraster einmal berechnen (Gelände, Wasser, Karte)
  const SEG = QT.seg, R = SEG + 1, st = 2 * E / SEG, hs = new Float32Array(R * R);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) hs[j * R + i] = S.height(-E + i * st, -E + j * st);
  return { SEG, R, st, hs, spl: new Float32Array(R * R * 4) };
})();
function gridH(x, z) {
  const { SEG, R, st, hs } = TG, fx = clamp((x + E) / st, 0, SEG - 0.001), fz = clamp((z + E) / st, 0, SEG - 0.001), i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, k = j * R + i;
  return (hs[k] * (1 - u) + hs[k + 1] * u) * (1 - v) + (hs[k + R] * (1 - u) + hs[k + R + 1] * u) * v;
}
{
  const { SEG, R, st, hs, spl } = TG, at = (i, j) => hs[clamp(j, 0, SEG) * R + clamp(i, 0, SEG)];
  const nor = new Float32Array(R * R * 3), col = new Float32Array(R * R * 3);
  for (let j = 0; j < R; j++) for (let i = 0; i < R; i++) {
    const k = j * R + i, x = -E + i * st, z = -E + j * st, h = hs[k];
    const dx = at(i + 1, j) - at(i - 1, j), dz = at(i, j + 1) - at(i, j - 1), nl = Math.hypot(dx, 2 * st, dz);
    nor[k * 3] = -dx / nl; nor[k * 3 + 1] = 2 * st / nl; nor[k * 3 + 2] = -dz / nl;
    const slope = Math.hypot(dx, dz) / (2 * st), avg = (at(i + 2, j) + at(i - 2, j) + at(i, j + 2) + at(i, j - 2)) / 4, ao = clamp(1 + (h - avg) * 0.08, 0.7, 1.06);
    col[k * 3] = col[k * 3 + 1] = col[k * 3 + 2] = ao;
    let town = 0; for (const p of S.POIS) { const d = Math.abs(x - p.x) + Math.abs(z - p.z); if (d < (p.r + 4) * 1.5) town = Math.max(town, 1 - S.sm(p.r - 1, p.r + 4, Math.hypot(x - p.x, z - p.z))); }
    const path = h > 0.4 && town < 1 ? (1 - S.sm(2.2, 3.9, S.roadDist(x, z))) * (1 - town) : 0;
    const sand = (1 - S.sm(0.35, 1.4, h)) * Math.max(0, 1 - town - path);
    const rock = Math.min(1, S.sm(0.42, 0.8, slope) + S.sm(15.5, 17.5, h)) * Math.max(0, 1 - town - path - sand);
    spl[k * 4] = sand; spl[k * 4 + 1] = rock; spl[k * 4 + 2] = path; spl[k * 4 + 3] = town;
  }
  const tmat = terrainMaterial(groundTextures()), TN = 8, cs = SEG / TN, cR = cs + 1, idx = [];
  for (let j = 0; j < cs; j++) for (let i = 0; i < cs; i++) { const a = j * cR + i; idx.push(a, a + cR, a + 1, a + 1, a + cR, a + cR + 1); }
  const index = new THREE.BufferAttribute(new Uint16Array(idx), 1);
  for (let ty = 0; ty < TN; ty++) for (let tx2 = 0; tx2 < TN; tx2++) {
    const n = cR * cR, P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3), SP = new Float32Array(n * 4);
    for (let j = 0; j < cR; j++) for (let i = 0; i < cR; i++) {
      const gi = tx2 * cs + i, gj = ty * cs + j, g = gj * R + gi, l = j * cR + i;
      P[l * 3] = -E + gi * st; P[l * 3 + 1] = hs[g]; P[l * 3 + 2] = -E + gj * st;
      for (let c = 0; c < 3; c++) { N[l * 3 + c] = nor[g * 3 + c]; C[l * 3 + c] = col[g * 3 + c]; }
      for (let c = 0; c < 4; c++) SP[l * 4 + c] = spl[g * 4 + c];
    }
    const tg = new THREE.BufferGeometry(); tg.setIndex(index);
    tg.setAttribute('position', new THREE.BufferAttribute(P, 3)); tg.setAttribute('normal', new THREE.BufferAttribute(N, 3)); tg.setAttribute('color', new THREE.BufferAttribute(C, 3)); tg.setAttribute('splat', new THREE.BufferAttribute(SP, 4));
    tg.computeBoundingSphere();
    const t = new THREE.Mesh(tg, tmat); t.receiveShadow = true; scene.add(t);
  }
  water = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), waterMaterial(gridH, waterNormals(), E)); water.renderOrder = 1;
  water.rotation.x = -Math.PI / 2; scene.add(water);
}
// ---- Deko
const NG = natureGeos();
const VEG = { tree: windMaterial(VM, 0.007), bush: windMaterial(VM, 0.09), grass: windMaterial(VM, 0.42) };
{
  let seed = 1337; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const c = new THREE.Color(), n = QT.bush, im = new THREE.InstancedMesh(NG.bush, VEG.bush, n); let k = 0;
  for (let i = 0; i < n * 4 && k < n; i++) {
    const x = (rnd() * 2 - 1) * S.R, z = (rnd() * 2 - 1) * S.R, h = S.height(x, z);
    if (h < 1 || h > 21 || S.poiAt(x, z, 1)) continue;
    dummy.position.set(x, h - 0.03, z); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.scale.setScalar(0.7 + rnd() * 0.8); dummy.updateMatrix();
    im.setMatrixAt(k, dummy.matrix); im.setColorAt(k, c.setRGB(0.85 + rnd() * 0.25, 0.9 + rnd() * 0.2, 0.85 + rnd() * 0.2)); k++;
  }
  im.count = k; im.receiveShadow = true; im.frustumCulled = false; scene.add(im);
}
const GR = { cell: 32, cx: 1e9, cz: 1e9, g: new THREE.InstancedMesh(NG.grass, VEG.grass, QT.grass), f: new THREE.InstancedMesh(NG.flower, VEG.grass, QT.flowers) };
for (const m of [GR.g, GR.f]) { m.frustumCulled = false; m.receiveShadow = true; m.count = 0; scene.add(m); }
function regrass(cx, cz) {
  GR.cx = cx; GR.cz = cz; const c = new THREE.Color();
  for (const [m, tot, fl] of [[GR.g, QT.grass, 0], [GR.f, QT.flowers, 1]]) {
    const per = Math.floor(tot / 25); let k = 0;
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) {
      let seed = (((cx + a) * 73856093) ^ ((cz + b) * 19349663) ^ (fl * 83492791)) >>> 0 || 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < per && k < tot; i++) {
        const x = (cx + a + rnd()) * GR.cell, z = (cz + b + rnd()) * GR.cell, sc = 0.8 + rnd() * (fl ? 0.6 : 1), ry = rnd() * 6.28, cr = rnd(), cg = rnd(), cb = rnd(), h = S.height(x, z);
        if (h < 1 || h > 21 || S.poiAt(x, z, 1) || S.roadDist(x, z) < 4) continue;
        dummy.position.set(x, h - 0.03, z); dummy.rotation.set(0, ry, 0); dummy.scale.setScalar(sc); dummy.updateMatrix(); m.setMatrixAt(k, dummy.matrix);
        m.setColorAt(k, fl ? c.setHSL(cr, 0.9, 0.72) : c.setRGB(0.85 + cr * 0.3, 0.9 + cg * 0.2, 0.8 + cb * 0.3)); k++;
      }
    }
    m.count = k; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }
}
const pieceMat = pieceMaterials();
const MATCOL = { wood: '#b9824a', stone: '#9c9c9c', metal: '#6d8296' };
const RL = Math.hypot(G, H);
const pieceGeo = { w: new THREE.BoxGeometry(G, H, 0.24), f: new THREE.BoxGeometry(G, 0.24, G), r: new THREE.BoxGeometry(G, 0.2, RL), c: new THREE.ConeGeometry(G / Math.SQRT2, 1.6, 4, 1).rotateY(Math.PI / 4).translate(0, 0.8, 0) };
// ---- Inventar-Symbole: die echten 3D-Modelle einmal in kleine Bilder rendern
const IC = {};
function renderIcons() {
  const cvs = document.createElement('canvas'); let r;
  try { r = new THREE.WebGLRenderer({ canvas: cvs, alpha: true, antialias: true, preserveDrawingBuffer: true }); } catch (e) { return; }
  r.setClearColor(0x000000, 0);
  const sc = new THREE.Scene(); sc.add(new THREE.HemisphereLight(0xffffff, 0x7f8fa8, 1.9));
  const dl = new THREE.DirectionalLight(0xffffff, 2.6); dl.position.set(-2, 3, 1.5); sc.add(dl);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 40), bx = new THREE.Box3(), ctr = new THREE.Vector3(), v = new THREE.Vector3();
  const shot = (obj, w, h, d) => {
    r.setSize(w, h, false); sc.add(obj); obj.updateMatrixWorld(true); bx.setFromObject(obj); bx.getCenter(ctr);
    cam.position.copy(ctr).addScaledVector(d, 12); cam.lookAt(ctr); cam.updateMatrixWorld(true);
    let mx = 0, my = 0;
    for (let i = 0; i < 8; i++) { v.set(i & 1 ? bx.max.x : bx.min.x, i & 2 ? bx.max.y : bx.min.y, i & 4 ? bx.max.z : bx.min.z).applyMatrix4(cam.matrixWorldInverse); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)); }
    const hw = Math.max(mx, my * w / h) * 1.05; cam.left = -hw; cam.right = hw; cam.top = hw * h / w; cam.bottom = -hw * h / w; cam.updateProjectionMatrix();
    r.render(sc, cam); const url = cvs.toDataURL(); sc.remove(obj); return url;
  };
  const side = new THREE.Vector3(-1, 0.2, 0.3).normalize(), iso = new THREE.Vector3(-0.8, 0.65, 1).normalize();
  for (const w in S.W) for (let q = 0; q < S.RAR.length; q++) IC[w + q] = shot(weaponModel(w, q), 288, 144, side);
  IC.pick = shot(new THREE.Mesh(pickaxeGeo(), VM), 288, 144, new THREE.Vector3(-1, 0.25, -0.2).normalize());
  for (const c in S.CONS) IC[c] = shot(new THREE.Mesh(itemGeo({ k: 'c', c }), VM), 144, 144, iso);
  for (const m in S.MATS) IC[m] = shot(new THREE.Mesh(itemGeo({ k: 'm', m }), VM), 96, 96, iso);
  for (const k of ['w', 'f', 'r', 'c']) { const m = new THREE.Mesh(pieceGeo[k], pieceMat.wood[0]); if (k === 'r') m.rotation.x = -Math.atan2(H, G); IC['b' + k] = shot(m, 128, 96, k === 'r' ? new THREE.Vector3(-0.9, 0.6, -1).normalize() : iso); }
  r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
}
try { renderIcons(); } catch (e) { console.warn(e); }
const pic = (k, alt) => (IC[k] ? '<img draggable="false" src="' + IC[k] + '">' : alt || '');
function placePiece(m, p) {
  m.rotation.set(0, 0, 0);
  if (p.t === 'w') { if (p.d === 0) m.position.set((p.ix + 0.5) * G, (p.iy + 0.5) * H, p.iz * G); else { m.position.set(p.ix * G, (p.iy + 0.5) * H, (p.iz + 0.5) * G); m.rotation.y = Math.PI / 2; } }
  else if (p.t === 'f' || p.t === 'c') m.position.set((p.ix + 0.5) * G, p.iy * H, (p.iz + 0.5) * G);
  else { m.position.set((p.ix + 0.5) * G, (p.iy + 0.5) * H, (p.iz + 0.5) * G); m.rotation.order = 'YXZ'; m.rotation.y = p.rot * Math.PI / 2; m.rotation.x = -Math.atan2(H, G); }
}

// ================= Welt =================
const worldGroup = new THREE.Group(); scene.add(worldGroup);
const pieces = new Map(), loot = new Map(), chests = new Map(), objs = new Map(), cars = new Map(), cards = new Map();
const pgrid = new S.PGrid();
let objList = [], objGrid = new Map(), inst = {}, pops = [], worldGeos = [], vans = [], gases = [], objC = { x: 1e9, z: 1e9 };
const PGR = new Map(), pdum = new THREE.Object3D();
function clearWorld() {
  for (const c of cars.values()) c.geo.dispose();
  for (const g of worldGeos) g.dispose();
  worldGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  worldGroup.clear(); PGR.clear(); pieces.clear(); pgrid.clear(); loot.clear(); chests.clear(); objs.clear(); cars.clear(); cards.clear(); objList = []; objGrid = new Map(); pops = []; worldGeos = []; vans = []; gases = []; objC.x = 1e9;
  for (const n of nades) scene.remove(n.mesh); nades.length = 0;
  for (const r of rockets) scene.remove(r.mesh); rockets.length = 0;
  bullets.length = 0;
}
function pgroup(p) {
  const v = p.t === 'w' ? p.v | 0 : 0, k = p.t + p.mat + v;
  let g = PGR.get(k); if (!g) { g = { geo: pieceGeo[p.t], mat: pieceMat[p.mat][v], items: [], im: null, cap: 0 }; PGR.set(k, g); }
  if (g.cap < g.items.length + 1) {
    const cap = Math.max(64, (g.items.length + 1) * 2), im = new THREE.InstancedMesh(g.geo, g.mat, cap);
    im.castShadow = im.receiveShadow = true; im.frustumCulled = false;
    if (g.im) { im.instanceMatrix.array.set(g.im.instanceMatrix.array.subarray(0, g.items.length * 16)); worldGroup.remove(g.im); g.im.dispose(); }
    im.count = g.items.length; g.im = im; g.cap = cap; worldGroup.add(im);
  }
  return g;
}
function setPM(p, sc) { if (!p.grp) return; placePiece(pdum, p); pdum.scale.setScalar(sc); pdum.updateMatrix(); p.grp.im.setMatrixAt(p.idx, pdum.matrix); p.grp.im.instanceMatrix.needsUpdate = true; }
function linkPiece(p, sc) { const g = pgroup(p); p.grp = g; p.idx = g.items.length; g.items.push(p); g.im.count = g.items.length; setPM(p, sc); }
function unlinkPiece(p) {
  const g = p.grp; if (!g) return; const last = g.items.pop();
  if (last !== p) { g.items[p.idx] = last; last.idx = p.idx; g.im.instanceMatrix.array.copyWithin(p.idx * 16, g.items.length * 16, g.items.length * 16 + 16); }
  g.im.count = g.items.length; g.im.instanceMatrix.needsUpdate = true; p.grp = null;
}
function pcenter(p) { placePiece(pdum, p); return pdum.position; }
function addPieceMesh(p, pop) {
  if (pieces.has(p.key)) return;
  linkPiece(p, pop ? 0.6 : 1); pieces.set(p.key, p); pgrid.add(p);
  if (pop) pops.push({ p, t: 0, rate: 1 / Math.min(2, S.MATS[p.mat].bt || 1) });
}
function editPiece(k, v) { const p = pieces.get(k); if (!p || p.t !== 'w' || (p.v | 0) === v) return; unlinkPiece(p); p.v = v; linkPiece(p, 1); }
function removePiece(k, boom) {
  const p = pieces.get(k); if (!p) return;
  if (boom) { const q = pcenter(p); fx.burst(q.x, q.y, q.z, MATCOL[p.mat], 16, 5, 0.24, 1.0, 14, true); if (Math.hypot(q.x - me.x, q.z - me.z) < 50) noise(0.18, 700, 0.25); }
  unlinkPiece(p); pieces.delete(k); pgrid.remove(p);
}
const ringGeo = new THREE.RingGeometry(0.45, 0.62, 24), beamGeo = new THREE.CylinderGeometry(0.07, 0.07, 5, 6, 1, true).translate(0, 2.5, 0);
function itemColor(i) { return i.k === 'w' ? S.RAR[i.r].c : i.k === 'c' ? S.CONS[i.c].col : i.k === 'a' ? '#c9b458' : MATCOL[i.m]; }
function itemName(i) { return i.k === 'w' ? S.W[i.w].n + ' (' + S.RAR[i.r].n + ')' : i.k === 'c' ? S.CONS[i.c].n + (i.n > 1 ? ' ×' + i.n : '') : i.k === 'a' ? S.AMMO[i.a] + ' ×' + i.n : S.MATS[i.m].n + ' ×' + i.n; }
function addLootMesh(l, from) {
  const g = new THREE.Group(), col = new THREE.Color(itemColor(l.i));
  let m;
  if (l.i.k === 'w') { m = weaponModel(l.i.w, l.i.r); m.scale.setScalar(1.7); m.rotation.x = -0.35; m.position.y = 0.75; }
  else { m = new THREE.Mesh(itemGeo(l.i), VM); m.castShadow = true; m.scale.setScalar(1.25); m.position.y = 0.3; }
  g.add(m);
  const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  if (l.i.k === 'w' && l.i.r >= 2) g.add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(1.8), transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
  g.position.set(l.x, l.y, l.z); l.mesh = g; l.spin = m; l.ph = Math.random() * 6; worldGroup.add(g); loot.set(l.id, l);
  if (from) { l.pop = 0; l.from = from; g.position.set(from[0], from[1], from[2]); }
}
function addChestMesh(c) {
  const m = c.k === 'a' ? ammoBoxModel() : c.k === 'd' ? dropModel() : chestModel(); m.g.position.set(c.x, c.y, c.z); m.g.rotation.y = hash(c.x, c.z) * 6.28;
  c.mesh = m.g; c.lid = m.lid; c.bal = m.bal; c.light = m.light; worldGroup.add(m.g); chests.set(c.id, c);
  if (c.open) { c.lid.rotation.x = -1.25; c.lid.material = VM; if (c.light) c.light.visible = false; }
}
function openChest(c) { if (c.open) return; c.open = 1; c.lid.material = VM; c.anim = 0; if (c.light) c.light.visible = false; }
function addCard(cd) {
  if (cd.team !== myTeam || cards.has(cd.id)) return;
  const m = new THREE.Mesh(cardGeo, new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(1.6, 1.6, 1.8) })); m.position.set(cd.x, cd.y + 0.9, cd.z);
  cd.mesh = m; worldGroup.add(m); cards.set(cd.id, cd);
}
function removeCard(id) { const c = cards.get(id); if (c) { worldGroup.remove(c.mesh); c.mesh.material.dispose(); cards.delete(id); } }
function placeCar(c, k) {
  const fx2 = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  const hf = S.height(c.x + fx2 * 1.5, c.z + fz * 1.5), hb = S.height(c.x - fx2 * 1.5, c.z - fz * 1.5), hl = S.height(c.x - rx, c.z - rz), hr = S.height(c.x + rx, c.z + rz);
  const air = c.air, tp = air ? clamp(c.vy * 0.03, -0.5, 0.35) : -Math.atan2(hf - hb, 3), tr = (air ? 0 : Math.atan2(hl - hr, 2)) - (c.roll || 0);
  c.mesh.position.set(c.x, air ? c.y : Math.max(c.y, (hf + hb) / 2), c.z);
  const r = c.mesh.rotation; k = k || 1;
  r.set(r.x + (tp - r.x) * k, c.yaw + Math.PI, r.z + (tr - r.z) * k);
}
function addCar(c) {
  const m = carModel(c.v, c.hue); c.mesh = m.g; c.wheels = m.wheels; c.geo = m.geo; c.tx = c.x; c.ty = c.y; c.tz = c.z; c.tyaw = c.yaw; c.sp = 0; c.vd = c.yaw; c.vy = 0; c.steer = 0;
  for (const w of c.wheels) w.rotation.order = 'YXZ';
  worldGroup.add(m.g); cars.set(c.id, c); placeCar(c);
}
const OBJ = { pine: [0.45, 7, 0.55, 6], oak: [0.5, 7, 0.6, 6], birch: [0.32, 6.5, 0.4, 6], palm: [0.38, 6, 0.42, 5], rock: [1.25, 1.5, 1.15, 1.4], crate: [0.78, 1.25, 0.6, 1.2], barrel: [0.58, 1.25, 0.48, 1.2] };
const OTN = ['tree', 'rock', 'crate', 'barrel'], MTN = ['wood', 'stone', 'metal'], PTN = ['w', 'f', 'r', 'c'];
function buildWorld(w) {
  clearWorld();
  const kind = (o) => (o.t !== 'tree' ? o.t : S.height(o.x, o.z) < 2.7 ? 'palm' : o.id % 5 < 2 ? 'pine' : o.id % 5 < 4 ? 'oak' : 'birch');
  const list = w.objs.map((a) => (Array.isArray(a) ? { id: a[0], t: OTN[a[1]], x: a[2], z: a[3], s: a[4] } : a));
  const count = {}; for (const k in OBJ) count[k] = 0;
  for (const o of list) count[kind(o)]++;
  inst = {};
  for (const k in count) { inst[k] = new THREE.InstancedMesh(NG[k], k === 'rock' || k === 'crate' || k === 'barrel' ? VM : VEG.tree, Math.max(1, count[k])); inst[k].count = 0; inst[k].castShadow = inst[k].receiveShadow = true; inst[k].frustumCulled = false; worldGroup.add(inst[k]); }
  const c = new THREE.Color();
  for (const o of list) {
    const k = kind(o), D = OBJ[k]; o.k = k; o.y = S.height(o.x, o.z); objs.set(o.id, o); objList.push(o); o.i = -1;
    o.rot = k === 'crate' ? 0 : hash(o.x, o.z) * 6.28;
    dummy.position.set(o.x, o.y - 0.1, o.z); dummy.rotation.set(0, o.rot, 0); dummy.scale.setScalar(o.s); dummy.updateMatrix(); o.mtx = dummy.matrix.toArray(new Float32Array(16));
    const v = 0.85 + hash(o.z, o.x) * 0.3; o.col = o.t === 'tree' ? [v, 0.9 + hash(o.x, o.z) * 0.2, v] : [v, v, v];
    o.rad = D[0] * o.s; o.top = D[1] * o.s; const hw = D[2] * o.s; o.box = [o.x - hw, o.y, o.z - hw, o.x + hw, o.y + D[3] * o.s, o.z + hw];
    const gk = Math.floor(o.x / 16) + ',' + Math.floor(o.z / 16);
    if (!objGrid.has(gk)) objGrid.set(gk, []); objGrid.get(gk).push(o);
  }
  for (const a of w.pieces) {
    const p = Array.isArray(a) ? { t: PTN[a[0]], ix: a[1], iy: a[2], iz: a[3], mat: MTN[a[5]] } : a;
    if (Array.isArray(a)) { if (p.t === 'w') { p.d = a[4]; if (a[6]) p.v = a[6]; } else if (p.t === 'r') p.rot = a[4]; p.key = S.pkey(p); p.hp = S.MATS[p.mat].hp; }
    addPieceMesh(p);
  }
  for (const l of w.loot) addLootMesh(l);
  for (const ch of w.chests) addChestMesh(ch);
  for (const car of w.cars || []) addCar(car);
  const hg = new Map();
  for (const h of w.houses || []) { const x = (h[0] + h[2] / 2) * G, z = (h[1] + h[3] / 2) * G, p = S.poiAt(x, z, 40), key = p ? p.n : Math.round(x / 200) + ',' + Math.round(z / 200); if (!hg.has(key)) hg.set(key, []); hg.get(key).push(houseDeco(h, G, H)); }
  for (const arr of hg.values()) { const geo = merge(arr); geo.computeBoundingSphere(); worldGeos.push(geo); const m = new THREE.Mesh(geo, VM); m.castShadow = m.receiveShadow = true; worldGroup.add(m); }
  const vg = vanModel(); vg.geometry.computeBoundingSphere(); worldGeos.push(vg.geometry);
  for (const v of w.vans || []) { const m = new THREE.Mesh(vg.geometry, VM); m.castShadow = true; m.position.set(v.x, v.y, v.z); m.rotation.y = v.yaw || 0; worldGroup.add(m); vans.push(v); }
  for (const cd of w.cards || []) addCard(cd);
}
// nur Bäume/Steine im Umkreis der Kamera an die Grafikkarte geben
function relayoutObjs(cx, cz) {
  objC.x = cx; objC.z = cz; const R2 = QT.view * QT.view, n = {};
  for (const k in inst) n[k] = 0;
  for (const o of objList) {
    o.i = -1; if (o.dead) continue;
    const dx = o.x - cx, dz = o.z - cz; if (dx * dx + dz * dz > R2) continue;
    const im = inst[o.k], i = (o.i = n[o.k]++);
    im.instanceMatrix.array.set(o.mtx, i * 16); im.setColorAt(i, _oc.setRGB(o.col[0], o.col[1], o.col[2]));
  }
  for (const k in inst) { inst[k].count = n[k]; inst[k].instanceMatrix.needsUpdate = true; if (inst[k].instanceColor) inst[k].instanceColor.needsUpdate = true; }
}
const _oc = new THREE.Color();
function setInst(o, scale, tilt) { if (o.i < 0) return; dummy.position.set(o.x, scale ? o.y - 0.1 : -500, o.z); dummy.rotation.set(tilt || 0, o.rot, 0); dummy.scale.setScalar(scale ? o.s * scale : 0.001); dummy.updateMatrix(); inst[o.k].setMatrixAt(o.i, dummy.matrix); inst[o.k].instanceMatrix.needsUpdate = true; }
const wobbles = [];
function removeObj(id) {
  const o = objs.get(id); if (!o) return; o.dead = true; objs.delete(id);
  const tree = o.t === 'tree';
  fx.burst(o.x, o.y + (tree ? 3.5 : 0.7), o.z, tree ? '#4c9632' : o.t === 'rock' ? '#8d8f94' : o.t === 'crate' ? '#b9824a' : '#3f6f9a', 24, 6, 0.3, 1.0, 12, true);
  if (tree) fx.burst(o.x, o.y + 1.2, o.z, '#6b4526', 10, 4, 0.25, 0.9, 12, true);
  setInst(o, 0);
}

// ---- Sturmwand + Luftschiff
const stormTex = stormTexture();
const stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 700, 96, 1, true), new THREE.MeshBasicMaterial({ map: stormTex, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false, fog: false }));
stormMesh.visible = false; scene.add(stormMesh);
const shipMesh = new THREE.Group();
{
  const L = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), L(0xff7a2f)); hull.scale.set(7, 6, 17);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.01, 24, 16, 0, 6.3, 1.35, 0.4), L(0xffe066)); stripe.scale.set(7, 6, 17);
  const gond = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 9), L(0x3a4a6b)); gond.position.y = -7;
  const win = new THREE.Mesh(new THREE.BoxGeometry(4.1, 0.9, 7), L(0xa9dcff)); win.position.y = -6.6;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 5), L(0x3a4a6b)); fin.position.set(0, 0, 15);
  const fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2;
  const prop = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, 0.2), L(0x22252b)); prop.position.set(0, -7, 5); shipMesh.userData.prop = prop;
  shipMesh.add(hull, stripe, gond, win, fin, fin2, prop); shipMesh.visible = false; scene.add(shipMesh);
}

// ================= Figuren + Animation =================
function newChar(hue, style) { const ch = buildChar(hue, style); Object.assign(ch, { sinceShot: 9, flashT: 0, ph: Math.random() * 6 }); scene.add(ch.g); return ch; }
function makeChar(id) { const r = rosterMap.get(id) || { hue: 200, style: 0 }; return newChar(r.hue, r.style); }
function setWeapon(ch, w, wr) {
  if (ch.w === w && ch.wr === wr) return;
  if (ch.w !== w) ch.draw = 0;
  ch.w = w; ch.wr = wr;
  if (S.W[w]) { const g = weaponGeo(w); ch.gunMain.geometry = g.main; ch.gunMove.geometry = g.move; ch.gunAcc.geometry = g.acc; ch.gunAcc.material = RARMAT[wr] || RARMAT[0]; ch.flash.position.set(0, 0.08, MUZZLE[w] + 0.22); }
  else if (w === 'build') { ch.held.geometry = BPGEO; ch.held.scale.setScalar(1); ch.held.rotation.set(-1.1, 0, 0); ch.held.position.set(0, -0.42, 0.14); }
  else if (S.CONS[w]) { ch.held.geometry = itemGeo({ k: 'c', c: w }); ch.held.scale.setScalar(0.62); ch.held.rotation.set(HP, 0, 0); ch.held.position.set(0, -0.36, 0.06); }
}
const PK = ['drop', 'dive', 'bpy', 'bx', 'by', 'bz', 'hx', 'hy', 'aLx', 'aLz', 'aLe', 'aRx', 'aRz', 'aRe', 'lLx', 'lLk', 'lRx', 'lRk'];
const P = {};
function poseChar(ch, o, dt) {
  setWeapon(ch, o.w, o.wr | 0);
  const heavy = HEAVY.has(o.w), hv = heavy ? 2.2 : 1, isGun = !!S.W[o.w];
  ch.draw = Math.min(1, ch.draw + dt * 4.5); ch.kick = Math.max(0, ch.kick - dt * (heavy ? 4.5 : 10)); ch.sinceShot += dt; ch.flashT -= dt;
  ch.flinch = Math.max(0, ch.flinch - dt * 5); ch.land = Math.max(0, ch.land - dt * 4);
  const g = ch.g; g.position.set(o.x, o.y, o.z); g.scale.set(-1, 1, 1); // gespiegelt: Waffe in der rechten Hand, Kamera über der rechten Schulter
  const air = o.fl & 6, crouch = (o.fl & 8) && !o.sit && !air;
  const sp = Math.min(o.speed, 8); ch.walk += dt * sp * 1.55;
  const mv = Math.min(1, sp / 4), run = clamp((sp - 5.8) / 1.6, 0, 1), s = Math.sin(ch.walk), c = Math.cos(ch.walk), br = Math.sin(T * 1.9 + ch.ph);
  for (const k of PK) P[k] = 0;
  const A = (0.25 + 0.085 * sp) * (crouch ? 0.6 : 1) * mv, K = (0.5 + run * 0.7) * mv;
  P.lLx = s * A; P.lLk = Math.max(0, -c) * K + 0.08; P.lRx = -s * A; P.lRk = Math.max(0, c) * K + 0.08;
  P.bpy = Math.abs(s) * 0.04 * mv + br * 0.01; P.bz = s * 0.04 * mv; P.by = -s * 0.08 * mv; P.bx = run * 0.2 - o.pitch * 0.12; P.hx = -o.pitch * 0.45 - run * 0.15;
  P.aLx = -s * A * 0.8; P.aRx = s * A * 0.8; P.aLe = P.aRe = -0.2 - mv * 0.5 - run * 0.5; P.aLz = -0.08; P.aRz = 0.08;
  let tilt = 0;
  if (o.sit) { P.lLx = P.lRx = -1.45; P.lLk = P.lRk = 1.3; P.aLx = P.aRx = -0.95; P.aLe = P.aRe = -0.6; P.aLz = 0.2; P.aRz = -0.2; P.bx = -0.1; P.hx = P.bpy = P.by = P.bz = 0; }
  else if (o.fl & 2048) { const q = Math.sin(T * 5 + ch.ph); P.dive = 1.2; P.aLx = -2.6 + q * 0.9; P.aRx = -2.6 - q * 0.9; P.aLz = -0.4; P.aRz = 0.4; P.aLe = P.aRe = -0.3; P.lLx = 0.2 + q * 0.35; P.lRx = 0.2 - q * 0.35; P.lLk = P.lRk = 0.3; P.hx = -0.9; P.bx = P.by = P.bz = 0; }
  else if (o.fl & 512) { const cs = Math.sin(ch.walk * 1.7) * Math.min(1, sp / 1.2); P.dive = 1.38; P.aLx = -2.75 + cs * 0.45; P.aRx = -2.75 - cs * 0.45; P.aLe = P.aRe = -0.35; P.aLz = -0.3; P.aRz = 0.3; P.lLx = 0.1 + cs * 0.3; P.lRx = 0.1 - cs * 0.3; P.lLk = P.lRk = 0.35; P.bx = 0; P.by = cs * 0.12; P.bz = 0; P.bpy = 0; P.hx = -1.05; P.hy = 0; }
  else if (o.fl & 4) { P.aLx = P.aRx = Math.PI - 0.15; P.aLz = -0.28; P.aRz = 0.28; P.aLe = P.aRe = -0.1; P.lLx = 0.2; P.lRx = 0.05; P.lLk = 0.35; P.lRk = 0.2; P.bx = P.by = 0; P.bz = Math.sin(T * 1.3) * 0.05; P.hx = 0.2; }
  else if (o.fl & 2) { P.dive = 1.15; P.aLx = P.aRx = -0.3; P.aLz = -1.15; P.aRz = 1.15; P.aLe = P.aRe = -0.35; P.lLx = 0.25 + Math.sin(T * 9) * 0.08; P.lRx = 0.25 - Math.sin(T * 9) * 0.08; P.lLk = P.lRk = 0.5; P.bx = 0; P.hx = -0.5; }
  else {
    if (crouch) { P.drop = 0.33; P.lLx = -1.0 + s * A; P.lLk = 1.7; P.lRx = -0.25 - s * A; P.lRk = 1.45; P.bx += 0.28; }
    if (o.jump) { P.lLx = -0.75; P.lLk = 1.0; P.lRx = 0.25; P.lRk = 0.6; P.aLz = -0.5; P.aRz = 0.5; }
    if (o.emote) {
      const t = T * 7, q = Math.sin(t);
      P.by = Math.sin(t / 2) * 0.7; P.bz = q * 0.18; P.bpy = Math.abs(q) * 0.1; P.aLx = -2.7 + q * 0.5; P.aRx = -2.7 - q * 0.5; P.aLz = -0.5; P.aRz = 0.5; P.aLe = P.aRe = -0.6 - Math.cos(t) * 0.4;
      P.lLx = -Math.max(0, q) * 0.6; P.lLk = Math.max(0, q) * 1.1; P.lRx = -Math.max(0, -q) * 0.6; P.lRk = Math.max(0, -q) * 1.1; P.hx = Math.sin(t * 2) * 0.15; P.hy = Math.sin(t / 2) * 0.4; P.bx = 0;
    } else if (isGun) {
      const aim = -(HP + o.pitch) - P.bx, sprint = run > 0.5 && !o.ads && o.rl < 0 && ch.sinceShot > 0.45;
      if (sprint) { P.aRx = -0.45 + s * 0.25; P.aRe = -1.25; P.aRz = -0.4; P.aLx = -0.7 - s * 0.25; P.aLe = -1.2; P.aLz = 0.45; }
      else { const e = o.ads ? 0.82 : 0.6, lo = o.ads ? 0 : 0.4; P.aRx = aim + e + lo; P.aRe = -e - lo * 1.2; P.aRz = o.ads ? -0.22 : -0.1; P.aLx = aim + 0.32; P.aLe = -0.42; P.aLz = 0.62; P.by += o.ads ? 0.18 : 0.1; P.hy = -(o.ads ? 0.18 : 0.1); if (o.ads) P.bz -= 0.06; }
      if (o.rl >= 0) {
        const r = o.rl; tilt = Math.min(1, r / 0.12) * (r > 0.86 ? (1 - r) / 0.14 : 1);
        P.aRx += 0.4 * tilt; P.aRe -= 0.25 * tilt; P.hx += 0.25 * tilt;
        if (!SHELL.has(o.w)) { const hand = r > 0.25 && r < 0.65 ? Math.sin((r - 0.25) / 0.4 * Math.PI) : 0; P.aLx = lerp(P.aLx, 0.15, hand); P.aLe = lerp(P.aLe, -0.9, hand); P.aLz = lerp(P.aLz, 0.15, hand); }
      }
    } else if (o.w === 'pick') {
      const q = o.swing || 0; let a = -0.5 + s * A * 0.4, e = -0.9;
      if (q > 0) {
        if (q < 0.35) { a = lerp(-0.5, -2.6, q / 0.35); e = lerp(-0.9, -1.5, q / 0.35); } else if (q < 0.6) { const k = (q - 0.35) / 0.25; a = lerp(-2.6, -0.35, k); e = lerp(-1.5, -0.25, k); } else { const k = (q - 0.6) / 0.4; a = lerp(-0.35, -0.5, k); e = lerp(-0.25, -0.9, k); }
        P.by = -Math.sin(q * Math.PI) * 0.4; if (q > 0.35 && q < 0.8) P.bx += 0.22; P.aLx = a * 0.5; P.aLe = -0.8;
      }
      P.aRx = a; P.aRe = e;
    } else if (o.w === 'build') { P.aRx = -1.0; P.aRe = -0.7; P.aRz = -0.15; P.aLx = -0.9; P.aLe = -0.8; P.aLz = 0.3; }
    else if (THROW[o.w]) { if (ch.sinceShot < 0.3) { P.aRx = -1.7; P.aRe = -0.1; P.bx += 0.2; P.by = 0.3; } else { P.aRx = -0.9; P.aRe = -1.5; P.aRz = 0.15; } }
    else if (S.CONS[o.w]) { if (o.using) { P.aRx = -1.15 + Math.sin(T * 9) * 0.05; P.aRe = -1.75; P.aRz = -0.4; P.hx = -0.25; } else { P.aRx = -0.45; P.aRe = -1.0; } }
  }
  if (o.rev) { P.aLx = -1.05; P.aRx = -1.15; P.aLe = P.aRe = -0.7; P.aLz = 0.2; P.aRz = -0.2; P.bx += 0.35; P.hx = 0.4; }
  const cur = ch.cur || (ch.cur = { ...P }), kb = Math.min(1, dt * (q4(o) ? 30 : 15));
  for (const k of PK) cur[k] += (P[k] - cur[k]) * kb;
  const kick = ch.kick * hv * 1.3, fl = ch.flinch, ld = ch.land, dr = isGun || o.w === 'pick' ? (1 - ch.draw) * 1.1 : 0;
  g.rotation.set(cur.dive, (o.sit ? o.carYaw : o.yaw) + Math.PI, 0);
  if (o.fl & 512) g.position.y += 0.3 * Math.min(1, cur.dive / 1.38);
  if (o.fl & 2048) g.position.y += 0.55;
  if (o.fl & 1024) { if (!ch.bushM) { ch.bushM = new THREE.Mesh(bushGeo, VM); ch.bushM.castShadow = true; ch.g.add(ch.bushM); } ch.bushM.visible = true; ch.bushM.rotation.set(-cur.dive, 0, 0); } else if (ch.bushM) ch.bushM.visible = false;
  ch.body.position.y = 0.8 - cur.drop + cur.bpy - ld * 0.12; ch.body.rotation.set(cur.bx - (isGun ? kick * 0.03 : 0) + fl * 0.3, cur.by + fl * 0.25, cur.bz);
  ch.head.rotation.set(cur.hx - fl * 0.3, cur.hy, 0);
  ch.lL.up.position.y = ch.lR.up.position.y = 0.78 - cur.drop - ld * 0.1;
  ch.lL.up.rotation.x = cur.lLx - ld * 0.35; ch.lL.low.rotation.x = cur.lLk + ld * 0.7; ch.lR.up.rotation.x = cur.lRx - ld * 0.35; ch.lR.low.rotation.x = cur.lRk + ld * 0.7;
  ch.aL.up.rotation.set(cur.aLx - (isGun ? kick * 0.07 : 0), 0, cur.aLz); ch.aL.low.rotation.x = cur.aLe;
  ch.aR.up.rotation.set(cur.aRx - (isGun ? kick * 0.08 : 0) + dr, 0, cur.aRz); ch.aR.low.rotation.x = cur.aRe;
  const vis = !air && !o.sit && !o.emote && !(o.fl & 2560) && !o.rev;
  ch.gun.visible = isGun && vis; ch.pick.visible = o.w === 'pick' && vis; ch.held.visible = (o.w === 'build' || !!S.CONS[o.w]) && vis && !(THROW[o.w] && ch.sinceShot < 0.5);
  ch.glider.visible = !!(o.fl & 4);
  const dk = 1 - ch.draw, ease = dk * dk;
  ch.gun.position.set(0, -0.33 + kick * 0.1 + ease * 0.12, 0.07 - ease * 0.1); ch.gun.rotation.set(HP + kick * 0.12 - ease * 1.4, isGun && !o.ads && o.rl < 0 ? 0.25 : 0, 0.5 * tilt + ease * 0.9); ch.gunMove.position.set(0, 0, 0); ch.gunMove.visible = true;
  ch.gun.scale.setScalar(1 - ease * 0.35);
  if (isGun && o.rl >= 0) { if ((ch.prl ?? -1) < 0.3 && o.rl >= 0.3 && !SHELL.has(o.w)) dropMag(ch, o.w); if (SHELL.has(o.w) && Math.floor(o.rl * 5) !== Math.floor((ch.prl ?? 0) * 5) && o.rl > 0.05) shellIn(ch); }
  ch.prl = isGun ? o.rl : -1;
  ch.flash.visible = ch.flashT > 0 && ch.gun.visible;
  if (ch.flash.visible) { ch.flash.rotation.z = Math.random() * 6; ch.flash.scale.setScalar(0.9 + Math.random() * 0.9); }
  if (isGun) {
    if (heavy && ch.sinceShot > 0.18 && ch.sinceShot < 0.6) { const k = Math.sin((ch.sinceShot - 0.18) / 0.42 * Math.PI); if (o.w === 'shotgun') ch.gunMove.position.z = -0.13 * k; else ch.gun.rotation.z = 0.25 * k; ch.aL.up.rotation.x += k * 0.2; }
    if (o.rl >= 0) {
      const r = o.rl;
      if (SHELL.has(o.w)) { const k = Math.abs(Math.sin(r * Math.PI * 5)); ch.gunMove.position.z = -0.12 * k; ch.aL.up.rotation.x -= 0.15 * k; }
      else { let my = 0; if (r > 0.1 && r < 0.35) my = (r - 0.1) / 0.25; else if (r >= 0.35 && r < 0.55) my = 1; else if (r >= 0.55 && r < 0.8) my = 1 - (r - 0.55) / 0.25; ch.gunMove.position.y = -0.32 * my; ch.gunMove.visible = !(r > 0.33 && r < 0.57); }
    }
  }
}
const HEAVY = new Set(['sniper', 'shotgun', 'tac', 'hunt', 'rpg']), SHELL = new Set(['shotgun', 'tac']), THROW = { gren: 1, stink: 1 }, SNIP = new Set(['sniper', 'hunt']);
const mags = [], _mv = new THREE.Vector3(), _mq = new THREE.Quaternion();
function nearCam(ch) { return ch.g.position.distanceToSquared(camera.position) < 1600; }
function dropMag(ch, w) {
  if (!nearCam(ch) || !S.W[w]) return;
  ch.g.updateMatrixWorld(true); const m = new THREE.Mesh(weaponGeo(w).move, WMAT); ch.gunMove.getWorldPosition(m.position); ch.gunMove.getWorldQuaternion(m.quaternion); scene.add(m);
  mags.push({ m, vx: (Math.random() - 0.5) * 1.2, vy: -0.5, vz: (Math.random() - 0.5) * 1.2, sp: (Math.random() - 0.5) * 8, t: 2.5, rest: false });
  noise(0.06, 1800, 0.05);
}
function shellIn(ch) { if (!nearCam(ch)) return; noise(0.05, 2400, 0.06); tone(900, 700, 0.03, 0.04, 'square'); }
function ejectShell(ch, w) {
  if (!ch || !S.W[w] || w === 'rpg' || !nearCam(ch)) return;
  ch.g.updateMatrixWorld(true); _mv.set(0.05, 0.1, 0.05); ch.gun.localToWorld(_mv);
  fx.burst(_mv.x, _mv.y, _mv.z, SHELL.has(w) ? '#c23b2e' : '#e0b23c', SHELL.has(w) ? 1 : 2, 2.6, SHELL.has(w) ? 0.08 : 0.05, 1.1, 14, true);
  fx.burst(_mv.x, _mv.y + 0.05, _mv.z, '#cfcfcf', 1, 0.6, 0.18, 0.5, -1.5);
}
function updateMags(dt) {
  for (let i = mags.length - 1; i >= 0; i--) {
    const g = mags[i]; g.t -= dt;
    if (g.t <= 0) { scene.remove(g.m); mags.splice(i, 1); continue; }
    if (!g.rest) {
      g.vy -= 16 * dt; g.m.position.x += g.vx * dt; g.m.position.y += g.vy * dt; g.m.position.z += g.vz * dt; g.m.rotation.x += g.sp * dt;
      const gh = groundAt(g.m.position.x, g.m.position.z, g.m.position.y) + 0.03;
      if (g.m.position.y < gh) { g.m.position.y = gh; if (g.vy < -2.5) { g.vy *= -0.3; g.vx *= 0.5; g.vz *= 0.5; } else g.rest = true; }
    }
    if (g.t < 0.4) g.m.scale.setScalar(g.t / 0.4);
  }
}
const q4 = (o) => (o.swing || 0) > 0 || o.snap;
function deathPose(ch, t) { const k = Math.min(1, (1 - t) * 2.2); ch.g.visible = true; ch.g.rotation.x = -k * 1.5; ch.g.position.y += k * 0.15; if (t < 0.25) { const q = Math.max(0.01, t / 0.25); ch.g.scale.set(-q, q, q); } ch.glider.visible = false; }

// ================= Zustand =================
let rbState = null, jumpEdge = false, joyM = 0;
let matchMode = 'solo', myTeam = 0, mateId = 0, teamsN = 0, revState = null, myMark = null, mateMark = null, shipLine = null, lastSpec = -1, prefMode = 'solo';
const revivers = new Map();
let ws, myId = 0, phase = 'menu', rosterMap = new Map(), stormS = null, shipS = null, aliveN = 0, gameT = 0, stateTick = 0, specId = 0, myCar = 0, curPoi = null;
const ents = new Map(), killsBy = new Map(), deadSet = new Set();
const me = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, onGround: false, hp: 100, sh: 0, alive: false, st: 'ship', crouch: false, slot: 0, inv: [null, null, null, null, null], ammo: {}, mats: {}, build: null, bmat: 'wood', lastShot: 0, reload: null, using: null, kills: 0, swing: 1, lastSwing: 0, lastBuild: 0, speed: 0, ch: null, ads: false, fl: 0, deadT: 0, bloom: 0, kx: 0, kz: 0, emote: 0, dmg: 0, lastThrow: 0, down: false, stepA: 0, swim: false, slide: 0, slideV: [0, 0], mantle: null, sprint: false, bush: false, card: false };
const rec = { p: 0, y: 0, tp: 0, ty: 0 };
const VP = () => clamp(me.pitch + rec.p, -1.5, 1.5), VY = () => me.yaw + rec.y;
function resetMe() {
  Object.assign(me, { vy: 0, pitch: -0.2, onGround: false, hp: 100, sh: 0, alive: true, st: 'ship', crouch: false, slot: 0, inv: [null, null, null, null, null], ammo: { light: 0, medium: 0, shells: 0, heavy: 0, rockets: 0 }, mats: { wood: 0, stone: 0, metal: 0 }, build: null, bmat: 'wood', reload: null, using: null, kills: 0, deadT: 0, bloom: 0, kx: 0, kz: 0, emote: 0, dmg: 0, swim: false, slide: 0, mantle: null, bush: false, card: false });
  rbState = null;
  rec.p = rec.y = rec.tp = rec.ty = 0; myCar = 0; hudDirty = true; killsBy.clear(); deadSet.clear();
  me.down = false; revState = null; myMark = mateMark = null; revivers.clear(); placeBeam(beamA, null); placeBeam(beamB, null); document.body.classList.remove('down');
}
const keys = {}; const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }; let autoFire = false, autoT = 0;
let mouseL = false, mouseR = false, locked = TOUCH, hudDirty = true, pending = new Set();
const tx = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

// ================= Kollision / Raycast =================
function groundAt(x, z, feet) {
  let g = S.height(x, z);
  const ix = Math.floor(x / G), iz = Math.floor(z / G), b = Math.floor(feet / H);
  for (let iy = b - 1; iy <= b + 2; iy++) {
    if (pieces.has('f:' + ix + ':' + iy + ':' + iz)) { const fy = iy * H + 0.12; if (fy <= feet + 0.6 && fy > g) g = fy; }
    const r = pieces.get('r:' + ix + ':' + iy + ':' + iz);
    if (r) { const ry = S.rampY(r, x, z) + 0.1; if (ry <= feet + 0.75 && ry > g) g = ry; }
    const c = pieces.get('c:' + ix + ':' + iy + ':' + iz);
    if (c) { const ry = S.roofY(c, x, z) + 0.05; if (ry <= feet + 0.75 && ry > g) g = ry; }
  }
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
    const arr = objGrid.get(a + ',' + b); if (!arr) continue;
    for (const o of arr) { if (o.dead || o.t === 'tree') continue; const dx = x - o.x, dz = z - o.z, r = o.rad * 0.85; if (dx * dx + dz * dz < r * r) { const ty = o.y + o.top - 0.05; if (ty <= feet + 0.6 && ty > g) g = ty; } }
  }
  return g;
}
const inW0 = (x, z, ix, iz) => x > ix * G - 0.4 && x < ix * G + G + 0.4 && Math.abs(z - iz * G) < 0.52;
const inW1 = (x, z, ix, iz) => z > iz * G - 0.4 && z < iz * G + G + 0.4 && Math.abs(x - ix * G) < 0.52;
function wallAt(x, z, y, ox, oz) {
  const cx = Math.floor(x / G), cz = Math.floor(z / G), y0 = Math.floor((y + 0.5) / H), y1 = Math.floor((y + 1.7) / H);
  for (let iy = y0; iy <= y1; iy++) for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
    const b = ':' + ix + ':' + iy + ':' + iz;
    const p0 = pieces.get('w' + b + ':0'), p1 = pieces.get('w' + b + ':1');
    if (p0 && p0.v !== 2 && inW0(x, z, ix, iz) && !inW0(ox, oz, ix, iz)) return p0.key;
    if (p1 && p1.v !== 2 && inW1(x, z, ix, iz) && !inW1(ox, oz, ix, iz)) return p1.key;
  }
  return null;
}
function objAt(x, z, y, ox, oz, pad) {
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
    const arr = objGrid.get(a + ',' + b); if (!arr) continue;
    for (const o of arr) {
      if (o.dead || y > o.y + o.top - 0.2) continue;
      const r = o.rad + pad, dx = x - o.x, dz = z - o.z, d = dx * dx + dz * dz;
      if (d < r * r) { const ex = ox - o.x, ez = oz - o.z; if (ex * ex + ez * ez >= d) return o; }
    }
  }
  for (const c of cars.values()) {
    if (c.id === myCar || Math.abs(y - c.y) > 2.2) continue;
    const r = 1.75 + pad, dx = x - c.x, dz = z - c.z, d = dx * dx + dz * dz;
    if (d < r * r) { const ex = ox - c.x, ez = oz - c.z; if (ex * ex + ez * ez >= d) return c; }
  }
  return null;
}
function blocked(x, z, y, ox, oz) { return x * x + z * z > (S.R + 10) * (S.R + 10) || !!wallAt(x, z, y, ox, oz) || !!objAt(x, z, y, ox, oz, 0.35); }
function ceiling(x, z, y, ny) {
  const iy = Math.ceil((y + 1.8) / H);
  return pieces.has('f:' + Math.floor(x / G) + ':' + iy + ':' + Math.floor(z / G)) && ny + 1.8 >= iy * H - 0.12;
}
const tb = [0, 0, 0, 0, 0, 0];
function raycast(ox, oy, oz, dx, dy, dz, max, noPlayers) {
  let best = max, res = { kind: null };
  const ph = pgrid.ray(ox, oy, oz, dx, dy, dz, best);
  if (ph) { best = ph.t; res = { kind: 'piece', key: ph.key }; }
  for (const o of objList) {
    if (o.dead) continue;
    const ex = o.x - ox, ez = o.z - oz, lim = best + 4;
    if (ex * ex + ez * ez > lim * lim) continue;
    const t = S.rayBox(ox, oy, oz, dx, dy, dz, o.box);
    if (t !== null && t < best) { best = t; res = { kind: 'obj', id: o.id }; }
  }
  for (const c of cars.values()) {
    if (c.id === myCar) continue;
    const ex = ox - c.x, ez = oz - c.z, lim = best + 4;
    if (ex * ex + ez * ez > lim * lim) continue;
    const cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
    tb[0] = -1.05; tb[1] = c.y + 0.3; tb[2] = -2.2; tb[3] = 1.05; tb[4] = c.y + 1.9; tb[5] = 2.2;
    const t = S.rayBox(ex * cs - ez * sn, oy, -ex * sn - ez * cs, dx * cs - dz * sn, dy, -dx * sn - dz * cs, tb);
    if (t !== null && t < best) { best = t; res = { kind: 'car', id: c.id }; }
  }
  if (!noPlayers) for (const e of ents.values()) {
    if (!e.alive || (e.fl & 1) || e.mate || T - e.lastSeen > 2.5) continue;
    if (e.fl & 512) { tb[0] = e.x - 0.9; tb[1] = e.y; tb[2] = e.z - 0.9; tb[3] = e.x + 0.9; tb[4] = e.y + 0.75; tb[5] = e.z + 0.9; const t = S.rayBox(ox, oy, oz, dx, dy, dz, tb); if (t !== null && t < best) { best = t; res = { kind: 'player', id: e.id, head: false }; } continue; }
    const cr = e.fl & 8 ? 0.35 : e.fl & 16 ? 0.3 : 0;
    const cx = e.x - ox, cy = e.y + 1.68 - cr - oy, cz = e.z - oz, tca = cx * dx + cy * dy + cz * dz;
    if (tca > 0 && tca < best + 1) {
      const d2 = cx * cx + cy * cy + cz * cz - tca * tca;
      if (d2 < 0.075) { const t = tca - Math.sqrt(0.075 - d2); if (t > 0 && t < best) { best = t; res = { kind: 'player', id: e.id, head: true }; } }
    }
    tb[0] = e.x - 0.4; tb[1] = e.y + 0.05; tb[2] = e.z - 0.4; tb[3] = e.x + 0.4; tb[4] = e.y + 1.46 - cr; tb[5] = e.z + 0.4;
    const t = S.rayBox(ox, oy, oz, dx, dy, dz, tb);
    if (t !== null && t < best) { best = t; res = { kind: 'player', id: e.id, head: false }; }
  }
  let t = 0, prev = 0, step = Math.min(1, Math.max(0.25, max / 4));
  while (t < best) {
    t = Math.min(best, t + step);
    if (oy + dy * t < S.height(ox + dx * t, oz + dz * t)) {
      let a = prev, b = t;
      for (let i = 0; i < 6; i++) { const m = (a + b) / 2; if (oy + dy * m < S.height(ox + dx * m, oz + dz * m)) b = m; else a = m; }
      best = b; res = { kind: 'terrain' }; break;
    }
    prev = t; if (t > 50) step = 2.5;
  }
  res.dist = best; res.x = ox + dx * best; res.y = oy + dy * best; res.z = oz + dz * best;
  return res;
}
function hitNormal(h, dx, dy, dz) {
  let n;
  if (h.kind === 'piece') {
    const p = pieces.get(h.key);
    if (!p || p.t === 'f' || p.t === 'c') n = [0, dy > 0 ? -1 : 1, 0];
    else if (p.t === 'w') n = p.d === 0 ? [0, 0, dz > 0 ? -1 : 1] : [dx > 0 ? -1 : 1, 0, 0];
    else { n = [[0, G, -H], [-H, G, 0], [0, G, H], [H, G, 0]][p.rot]; if (n[0] * dx + n[1] * dy + n[2] * dz > 0) n = [-n[0], -n[1], -n[2]]; }
  } else if (h.kind === 'obj' || h.kind === 'car') { const o = h.kind === 'obj' ? objs.get(h.id) : cars.get(h.id); n = o ? [h.x - o.x, 0.3, h.z - o.z] : [0, 1, 0]; }
  else { const e = 0.5; n = [-(S.height(h.x + e, h.z) - S.height(h.x - e, h.z)), 2 * e, -(S.height(h.x, h.z + e) - S.height(h.x, h.z - e))]; }
  const l = Math.hypot(n[0], n[1], n[2]) || 1; return [n[0] / l, n[1] / l, n[2] / l];
}

// ================= Ton =================
let AC = null, noiseBuf = null, engine = null;
function initAudio() {
  if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.8, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}
function noise(dur, freq, vol) {
  if (!AC || vol < 0.01) return; const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; f.type = 'lowpass'; f.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(AC.destination); s.start(t); s.stop(t + dur);
}
function tone(f0, f1, dur, vol, type) {
  if (!AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + dur);
}
function shotSound(w, vol) { const p = { ar: [0.16, 1700], smg: [0.1, 2600], shotgun: [0.32, 900], pistol: [0.12, 2200], sniper: [0.5, 650], tac: [0.26, 1100], hunt: [0.45, 800], rpg: [0.6, 420] }[w] || [0.1, 2000]; noise(p[0], p[1], 0.5 * vol); if (vol > 0.3) tone(170, 50, p[0] * 0.8, 0.22 * vol, 'sawtooth'); }
function engineSound(on, sp) {
  if (!AC) return;
  if (on && !engine) { const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.05; o.connect(f); f.connect(g); g.connect(AC.destination); o.start(); engine = { o, g }; }
  if (!on && engine) { engine.o.stop(); engine = null; }
  if (engine) engine.o.frequency.setTargetAtTime(48 + Math.abs(sp) * 6.5, AC.currentTime, 0.08);
}

// ================= Effekte =================
const tracers = [], booms = [];
function tracer(a, b, col, wd, life) {
  const m = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: col || 0xffe9a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.material.color.multiplyScalar(3.4);
  m.position.set(a[0], a[1], a[2]); m.lookAt(b[0], b[1], b[2]); const w = wd || 0.045; m.scale.set(w, w, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  scene.add(m); tracers.push({ m, t: life || 0.1, l: life || 0.1 });
}
const boomGeo = new THREE.SphereGeometry(1, 14, 10), shockGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-HP);
function explode(x, y, z, big) {
  const s = big || 1;
  fx.burst(x, y, z, '#ff9a2e', 46, 12 * s, 0.4, 0.9, 6); fx.burst(x, y, z, '#ffe27a', 22, 16 * s, 0.22, 0.5, 4); fx.burst(x, y + 0.5, z, '#2b2b2b', 30, 5, 0.6, 1.8, -1.5); fx.burst(x, y, z, '#6b5a3a', 18, 9, 0.2, 1.4, 16, true);
  const f = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.7, 0.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const r = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  f.position.set(x, y, z); r.position.set(x, y + 0.15, z); scene.add(f, r); booms.push({ f, r, t: 0, s });
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  noise(0.75, 320, clamp(1.3 - d / 110, 0, 1)); tone(95, 28, 0.55, clamp(0.5 - d / 150, 0, 0.4), 'sine');
  shake = Math.max(shake, clamp(1.2 - d / 28, 0, 1) * 0.07);
}
let bannerT = 0, elimT = 0, hurtT = 0, gainT = 0;
function banner(txt, dur) { const b = $('banner'); b.textContent = txt; b.style.opacity = 1; bannerT = dur || 3; }
function feed(html, mine) { const d = document.createElement('div'); if (mine) d.className = 'me'; d.innerHTML = html; $('feed').prepend(d); setTimeout(() => d.remove(), 6500); while ($('feed').children.length > (TOUCH ? 4 : 6)) $('feed').lastChild.remove(); }
function pickLog(txt, col) { const d = document.createElement('div'); d.textContent = txt; d.style.borderColor = col || '#fff'; $('picks').prepend(d); setTimeout(() => d.remove(), 3200); while ($('picks').children.length > 5) $('picks').lastChild.remove(); }
function gain(txt) { const g = $('gain'); g.textContent = txt; g.style.opacity = 1; gainT = 1.2; }
const nameOf = (id) => (rosterMap.get(id) || {}).name || '???';
const esc = (s) => String(s).replace(/[<>&]/g, '');
const v3 = new THREE.Vector3();
function dmgNumber(e, n, head, sh) {
  v3.set(e.x, e.y + 2.1, e.z).project(camera); if (v3.z > 1) return;
  const d = document.createElement('div'); d.className = 'dn'; d.textContent = n;
  d.style.color = head ? '#ffe23a' : sh ? '#5cc4ff' : '#fff'; if (head) d.style.fontSize = '32px';
  d.style.left = ((v3.x + 1) / 2 * innerWidth + (Math.random() - 0.5) * 34) + 'px'; d.style.top = ((1 - v3.y) / 2 * innerHeight) + 'px';
  document.body.appendChild(d); requestAnimationFrame(() => { d.style.transform = 'translateY(-64px) scale(' + (head ? 1.25 : 1) + ')'; d.style.opacity = 0; }); setTimeout(() => d.remove(), 750);
}
function show(id, on) { $(id).classList.toggle('on', on); }

// ================= HUD =================
const svg = (d, vb) => '<svg viewBox="' + (vb || '0 0 64 28') + '">' + d + '</svg>';
const ICON = {
  pick: svg('<path d="M8 7c13-6 31-6 47 2l-3 5c-8-4-14-5-19-5v17h-5V9c-6 0-11 1-17 4z"/>'),
  ar: svg('<path d="M1 12h20V9h20v3h14v-2h3v2h5v3h-5v1H44v3h-7l-2 7h-6l1-7h-8l-4 6h-5l3-6H9l-8 3z"/>'),
  smg: svg('<path d="M8 9h34v3h9v3h-9v3H33v9h-6v-9h-6l-2 6h-5l1-6H8z"/>'),
  shotgun: svg('<path d="M1 13l14-3h47v3H40v2h20v2H30v3h-8v-3h-6L2 21z"/>'),
  pistol: svg('<path d="M15 7h33v7H37v3h-6l-2 9h-9l2-12h-7z"/>'),
  sniper: svg('<path d="M0 14h14v-2h10V7h16v5h4v2h20v2H44v3h-6l-2 6h-5l1-6H20l-6 5H9l3-6H0z"/>'),
  med: svg('<path fill-rule="evenodd" d="M16 3h32v22H16zM29 7h6v4h5v6h-5v4h-6v-4h-5v-6h5z"/>'),
  band: svg('<circle cx="32" cy="14" r="11"/><circle cx="32" cy="14" r="4" fill="rgba(0,0,0,.5)"/>'),
  pot: svg('<path d="M27 1h10v6l6 6v11a3 3 0 0 1-3 3H24a3 3 0 0 1-3-3V13l6-6z"/>'),
  mini: svg('<path d="M28 6h8v5l4 4v8a2 2 0 0 1-2 2H26a2 2 0 0 1-2-2v-8l4-4z"/>'),
  gren: svg('<path d="M27 2h8v4h5v3h-4c5 2 8 6 8 10a12 9 0 0 1-24 0c0-4 3-8 8-10h-1z"/>'),
  tac: svg('<path d="M1 13l14-3h40v4H40v2h16v2H30v3h-8v-3h-6L2 21z"/>'),
  hunt: svg('<path d="M0 15h16l10-2h38v3H40v3h-6l-2 5h-5l1-5H18l-8 5H6l3-5H0z"/>'),
  rpg: svg('<path d="M4 9h48l8-3v14l-8-3H4zM20 17h6v9h-6zM34 17h5v6h-5z"/>'),
  stink: svg('<circle cx="32" cy="16" r="10"/><path d="M29 2h6v5h-6z"/>'),
  chug: svg('<path d="M20 4h24v22H20z"/>'),
  bush: svg('<circle cx="24" cy="16" r="9"/><circle cx="38" cy="14" r="10"/><circle cx="32" cy="8" r="7"/>'),
  c: svg('<path d="M2 15L16 2l14 13z"/>', '0 0 32 16'),
  car: svg('<path d="M8 16l6-8h24l8 6 10 2v6h-6a5 5 0 0 1-10 0H24a5 5 0 0 1-10 0H8z"/>'),
  storm: svg('<path d="M34 1L18 15h10l-6 12 20-16H32z"/>'),
  w: svg('<rect x="3" y="1" width="26" height="14" rx="2"/>', '0 0 32 16'), f: svg('<path d="M2 14l8-11h20l-8 11z"/>', '0 0 32 16'), r: svg('<path d="M2 15h28V2z"/>', '0 0 32 16'),
};
function renderBars() {
  const f = focus(), hp = f === me ? me.hp : f.hp || 0, sh = f === me ? me.sh : f.sh || 0;
  for (const [id, v] of [['shb', sh], ['hpb', hp]]) { const tr = $(id).children[1]; tr.children[0].style.width = v + '%'; tr.children[1].style.width = v + '%'; $(id).lastChild.textContent = v; }
  $('bars').classList.toggle('low', hp > 0 && hp <= 30);
  $('hurt').style.opacity = me.alive && me.hp <= 30 ? 0.45 : 0;
}
function renderHud() {
  hudDirty = false; renderBars();
  let h = '<div data-slot="0" class="slot pk' + (me.slot === 0 && !me.build ? ' sel' : '') + '"><span class="k">1</span>' + pic('pick', ICON.pick) + '</div>';
  me.inv.forEach((it, i) => {
    const sel = me.slot === i + 1 && !me.build ? ' sel' : '', ds = '<div data-slot="' + (i + 1) + '" class="slot', k = '<span class="k">' + (i + 2) + '</span>';
    if (!it) h += ds + sel + '">' + k + '</div>';
    else if (it.k === 'w') h += ds + ' r' + it.r + sel + '">' + k + pic(it.w + it.r, ICON[it.w]) + '<span class="a">' + it.mag + '</span><i class="rl"></i></div>';
    else h += ds + ' cs' + sel + '" style="--c:' + S.CONS[it.c].col + '">' + k + pic(it.c, ICON[it.c]) + '<span class="a">' + it.n + '</span></div>';
  });
  $('inv').innerHTML = h;
  const bn = { w: 'Q', f: 'F', r: 'C', c: 'V' };
  let b = '';
  for (const k in bn) b += '<div data-b="' + k + '" class="bs' + (me.build === k ? ' sel' : '') + '">' + pic('b' + k, ICON[k]) + (TOUCH ? '' : '<span>' + bn[k] + '</span>') + '</div>';
  for (const m in S.MATS) b += '<div data-m="' + m + '" class="mat' + (me.bmat === m && me.build ? ' sel' : '') + '">' + pic(m, '<i style="background:' + MATCOL[m] + '"></i>') + me.mats[m] + '</div>';
  $('build').innerHTML = b;
  const it = me.slot > 0 ? me.inv[me.slot - 1] : null;
  let low = '';
  if (!me.build && it && it.k === 'w') {
    const W = S.W[it.w], pool = me.ammo[W.ammo];
    $('ammo').innerHTML = '<div id="wname" style="color:' + S.RAR[it.r].c + '">' + W.n + '</div>' + it.mag + ' <small>/ ' + pool + '</small>';
    if (it.mag === 0 && pool === 0) low = 'KEINE MUNITION'; else if (it.mag <= W.mag * 0.2 && pool > 0 && !me.reload) low = TOUCH ? 'NACHLADEN' : 'NACHLADEN [R]';
  } else if (!me.build && it && it.k === 'c') $('ammo').innerHTML = '<div id="wname" style="color:' + S.CONS[it.c].col + '">' + S.CONS[it.c].n + '</div>' + it.n;
  else $('ammo').innerHTML = '';
  $('lowammo').textContent = low; $('lowammo').style.display = low && me.alive ? 'block' : 'none';
}
let lastGap = -1;
function updateCross(spread, mode) {
  const gap = mode === 'dot' ? 3 : Math.round(4 + Math.tan(spread) / Math.tan(camera.fov * Math.PI / 360) * innerHeight / 2);
  const key = gap + mode; if (key === lastGap) return; lastGap = key;
  const c = $('cross').children; $('cross').style.display = mode === 'none' ? 'none' : 'block';
  c[0].style.top = -(gap + 9) + 'px'; c[1].style.top = gap + 'px'; c[2].style.left = -(gap + 9) + 'px'; c[3].style.left = gap + 'px';
  for (let i = 0; i < 4; i++) c[i].style.display = mode === 'dot' ? 'none' : 'block';
}
function hitMarker(cls) { const h = $('hitm'); h.className = cls || ''; h.style.opacity = 1; h.style.transform = 'rotate(45deg) scale(' + (cls === 'kill' ? 1.5 : 1) + ')'; clearTimeout(hitMarker.t); hitMarker.t = setTimeout(() => (h.style.opacity = 0), cls === 'kill' ? 320 : 120); }
function renderScore() {
  const rows = [...rosterMap.entries()].map(([id, r]) => ({ id, n: r.name, k: killsBy.get(id) || 0, dead: deadSet.has(id) })).sort((a, b) => a.dead - b.dead || b.k - a.k);
  const extra = rows.length > 24 ? '<div style="opacity:.6">… und ' + (rows.length - 24) + ' weitere</div>' : '';
  $('score').innerHTML = '<h3>SPIELER · ' + aliveN + ' am Leben</h3>' + rows.slice(0, 24).map((r) => '<div class="' + (r.dead ? 'dead' : '') + (r.id === myId ? ' self' : '') + '"><span>' + esc(r.n) + '</span><span>☠ ' + r.k + '</span></div>').join('') + extra;
}
const chips = (a) => '<div class="chips">' + a.map(([v, l]) => '<span><b>' + v + '</b>' + l + '</span>').join('') + '</div>';
const fmtT = (s) => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
// ---- Kompass + Karte
const CN = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
function drawCompass(f) {
  const g = $('compass').getContext('2d'), W = 840; g.clearRect(0, 0, W, 68);
  const b = (((-f.yaw * 180 / Math.PI) % 360) + 360) % 360;
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, 'rgba(12,18,34,0)'); gr.addColorStop(0.2, 'rgba(12,18,34,.55)'); gr.addColorStop(0.8, 'rgba(12,18,34,.55)'); gr.addColorStop(1, 'rgba(12,18,34,0)');
  g.fillStyle = gr; g.fillRect(0, 0, W, 68); g.textAlign = 'center';
  for (let d = -64; d <= 64; d++) {
    const deg = Math.round(b) + d, x = W / 2 + (deg - b) * 6.2, dd = ((deg % 360) + 360) % 360;
    if (dd % 15) continue;
    const big = dd % 45 === 0, a = 1 - Math.abs(d) / 70;
    g.fillStyle = 'rgba(255,255,255,' + a + ')'; g.fillRect(x - 1, big ? 44 : 50, 2, big ? 18 : 10);
    if (big) { g.font = '800 28px Bahnschrift,Segoe UI,Arial'; g.fillStyle = dd === 0 ? 'rgba(255,216,58,' + a + ')' : 'rgba(255,255,255,' + a + ')'; g.fillText(CN[dd / 45], x, 34); }
    else { g.font = '600 17px Bahnschrift,Segoe UI,Arial'; g.fillStyle = 'rgba(255,255,255,' + a * 0.7 + ')'; g.fillText(dd, x, 36); }
  }
  if (stormS && !stormS[9]) { // Richtung zur sicheren Zone
    const zb = ((Math.atan2(stormS[3] - f.x, -(stormS[4] - f.z)) * 180 / Math.PI) + 360) % 360; let d = zb - b; d = ((d + 540) % 360) - 180;
    const x = W / 2 + clamp(d, -64, 64) * 6.2; g.fillStyle = '#c9a2ff'; g.beginPath(); g.moveTo(x, 44); g.lineTo(x + 9, 56); g.lineTo(x, 68); g.lineTo(x - 9, 56); g.fill();
  }
  const mark = (wx, wz, col) => { const zb = ((Math.atan2(wx - f.x, -(wz - f.z)) * 180 / Math.PI) + 360) % 360, d = ((zb - b + 540) % 360) - 180; if (Math.abs(d) > 64) return; g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(W / 2 + d * 6.2, 55, 7, 0, 6.3); g.fill(); g.stroke(); };
  if (myMark) mark(myMark.x, myMark.z, '#ffd83a'); if (mateMark) mark(mateMark.x, mateMark.z, '#59b7ff');
  const mt = mateId && ents.get(mateId); if (mt && mt.alive && f !== mt) mark(mt.x, mt.z, '#9fd4ff');
  g.fillStyle = '#ffd83a'; g.beginPath(); g.moveTo(W / 2 - 9, 0); g.lineTo(W / 2 + 9, 0); g.lineTo(W / 2, 12); g.fill();
}
const mapC = document.createElement('canvas'); mapC.width = mapC.height = 512;
{
  const N = 512, g = mapC.getContext('2d'), im = g.createImageData(N, N), { SEG, R, hs, spl } = TG;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const gi = Math.round(i / (N - 1) * SEG), gj = Math.round(j / (N - 1) * SEG), k = gj * R + gi, h = hs[k];
    let c;
    if (h < 0) c = h < -3 ? [0.12, 0.42, 0.76] : [0.2, 0.6, 0.82];
    else {
      const n = hash(gi >> 1, gj >> 1) * 0.06, sa = spl[k * 4], ro = spl[k * 4 + 1], pa = spl[k * 4 + 2], to = spl[k * 4 + 3], gr = Math.max(0, 1 - sa - ro - pa - to);
      c = [0.3 * gr + 0.87 * sa + 0.52 * ro + 0.68 * pa + 0.62 * to + n, 0.62 * gr + 0.81 * sa + 0.53 * ro + 0.56 * pa + 0.58 * to + n, 0.24 * gr + 0.58 * sa + 0.5 * ro + 0.38 * pa + 0.5 * to + n];
      if (h > 22.5 && to < 0.5) c = [0.93, 0.95, 0.98];
    }
    const sh = h < 0 ? 1 : 0.82 + clamp((hs[Math.max(0, k - R - 1)] - h) * -0.06 + 0.15, -0.2, 0.3);
    im.data.set([c[0] * 255 * sh, c[1] * 255 * sh, c[2] * 255 * sh, 255], (j * N + i) * 4);
  }
  g.putImageData(im, 0, 0);
}
function drawMap(cv2, cx, cz, span, big) {
  const g = cv2.getContext('2d'), W = cv2.width, k = W / span, px = (x) => (x - cx) * k + W / 2, pz = (z) => (z - cz) * k + W / 2;
  g.fillStyle = '#2d8fd6'; g.fillRect(0, 0, W, W);
  g.drawImage(mapC, px(-E), pz(-E), 2 * E * k, 2 * E * k);
  g.fillStyle = 'rgba(70,60,50,.85)'; const lim = span * 0.75;
  for (const p of pieces.values()) if (p.t === 'f' && Math.abs(p.ix * G - cx) < lim && Math.abs(p.iz * G - cz) < lim) g.fillRect(px(p.ix * G), pz(p.iz * G), G * k + 0.5, G * k + 0.5);
  for (const c of chests.values()) if (c.k === 'd' && !c.open) { g.fillStyle = '#3a86ff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.fillRect(px(c.x) - 5, pz(c.z) - 5, 10, 10); g.strokeRect(px(c.x) - 5, pz(c.z) - 5, 10, 10); }
  if (me.card || big) for (const v of vans) { g.fillStyle = me.card ? '#59b7ff' : 'rgba(89,183,255,.55)'; g.beginPath(); g.arc(px(v.x), pz(v.z), me.card ? 5 : 3, 0, 6.3); g.fill(); }
  if (!big) { g.fillStyle = '#ffd83a'; for (const c of cars.values()) if (Math.abs(c.x - cx) < lim && Math.abs(c.z - cz) < lim) { g.beginPath(); g.arc(px(c.x), pz(c.z), 2.5, 0, 6.3); g.fill(); } }
  if (big) { g.font = '800 13px Bahnschrift,Segoe UI,Arial'; g.textAlign = 'center'; g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff'; for (const p of S.POIS) { g.strokeText(p.n, px(p.x), pz(p.z - p.r - 3)); g.fillText(p.n, px(p.x), pz(p.z - p.r - 3)); } }
  if (stormS) {
    g.fillStyle = 'rgba(140,60,230,.45)'; g.beginPath(); g.rect(0, 0, W, W); g.arc(px(stormS[0]), pz(stormS[1]), Math.max(0.1, stormS[2] * k), 0, 6.3, true); g.fill('evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(px(stormS[3]), pz(stormS[4]), Math.max(0.1, stormS[5] * k), 0, 6.3); g.stroke();
    const f0 = focus(), dz0 = Math.hypot(f0.x - stormS[3], f0.z - stormS[4]);
    if (dz0 > stormS[5]) { g.setLineDash([5, 5]); g.beginPath(); g.moveTo(px(f0.x), pz(f0.z)); g.lineTo(px(stormS[3]), pz(stormS[4])); g.stroke(); g.setLineDash([]); }
  }
  if (shipLine && shipS) { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.setLineDash([6, 6]); g.beginPath(); g.moveTo(px(shipLine.ax), pz(shipLine.az)); g.lineTo(px(shipLine.bx), pz(shipLine.bz)); g.stroke(); g.setLineDash([]); }
  if (shipS) { g.fillStyle = '#ff7a2f'; g.beginPath(); g.arc(px(shipS[0]), pz(shipS[1]), 6, 0, 6.3); g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
  const pin = (mk, col) => { if (!mk) return; const X = px(mk.x), Z = pz(mk.z); g.fillStyle = col; g.strokeStyle = '#000'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X, Z); g.lineTo(X - 5, Z - 10); g.lineTo(X + 5, Z - 10); g.closePath(); g.fill(); g.stroke(); g.beginPath(); g.arc(X, Z - 12, 6, 0, 6.3); g.fill(); g.stroke(); };
  pin(myMark, '#ffd83a'); pin(mateMark, '#59b7ff');
  const mt = mateId && ents.get(mateId);
  if (mt && mt.alive && !(mt.fl & 1)) { g.fillStyle = mt.fl & 512 ? '#ff5a4d' : '#59b7ff'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(px(mt.x), pz(mt.z), 5, 0, 6.3); g.fill(); g.stroke(); }
  const f = focus();
  g.save(); g.translate(px(f.x), pz(f.z)); g.rotate(-f.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
}
const focus = () => (me.alive ? me : ents.get(specId) || me);

// ================= Menü-Vorschau =================
const HUES = [205, 0, 28, 48, 95, 150, 180, 262, 292, 325], HEADS = ['Helm', 'Kappe', 'Frisur', 'Mütze'];
const PV = { x: 75, z: -25, yaw: 2.2, ch: null, hi: 0, st: 0, skin: 0 };
{ // Menü-Figur an einen Strand mit Blick aufs Meer stellen
  let ok = false;
  for (let r = S.R - 10; r >= S.R - 300 && !ok; r -= 4) for (let a = 0; a < 6.28; a += 0.05) { const x = Math.cos(a) * r, z = Math.sin(a) * r, h = S.height(x, z); if (h > 0.9 && h < 4 && Math.abs(S.height(x * 0.97, z * 0.97) - h) < 1.2 && !S.poiAt(x, z, 8)) { PV.x = x; PV.z = z; PV.yaw = Math.atan2(x, z); ok = true; break; } }
}
function pvBuild() {
  if (PV.ch) { scene.remove(PV.ch.g); disposeChar(PV.ch); }
  PV.ch = newChar(HUES[PV.hi], PV.st | (PV.skin << 2)); $('cHead').textContent = HEADS[PV.st];
  try { localStorage.setItem('sf_skin', [PV.hi, PV.st, PV.skin].join(',')); } catch (e) {}
}
try { const a = (localStorage.getItem('sf_skin') || '').split(',').map(Number); if (a.length === 3 && a.every((v) => v >= 0)) { PV.hi = a[0] % HUES.length; PV.st = a[1] & 3; PV.skin = a[2] & 3; } } catch (e) {}
pvBuild();
document.querySelector('.cust').addEventListener('click', (e) => {
  const c = e.target.dataset && e.target.dataset.c; if (!c) return;
  const d = c.endsWith('+') ? 1 : -1;
  if (c.startsWith('out')) PV.hi = (PV.hi + d + HUES.length) % HUES.length; else if (c.startsWith('head')) PV.st = (PV.st + d + 4) % 4; else PV.skin = (PV.skin + d + 4) % 4;
  pvBuild();
});
const pvo = { fl: 0, w: 'ar', wr: 3, speed: 0, rl: -1, pitch: 0 };

// ================= Netzwerk =================
function setRoster(r) {
  rosterMap = new Map(r.map((a) => [a[0], { name: a[1], hue: a[2], bot: a[3], style: a[4] | 0, team: a[5] }]));
  const mine = rosterMap.get(myId); myTeam = mine ? mine.team : 0; mateId = 0;
  if (matchMode === 'duo' && mine) for (const [id, q] of rosterMap) if (id !== myId && q.team === myTeam) mateId = id;
  for (const e of ents.values()) e.mate = e.id === mateId;
}
function dropEnts() { for (const e of ents.values()) { scene.remove(e.ch.g); disposeChar(e.ch); } ents.clear(); if (me.ch) { scene.remove(me.ch.g); disposeChar(me.ch); me.ch = null; } }
function connect(name) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => tx({ t: 'join', name, hue: HUES[PV.hi], style: PV.st | (PV.skin << 2), mode: prefMode });
  ws.onclose = () => { banner('Verbindung getrennt – Seite neu laden', 999); };
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
}
function leaveCar() { myCar = 0; engineSound(false); $('speed').style.display = 'none'; document.body.classList.remove('driving'); }
function endStats(place) { return chips([['#' + place, 'Platz'], [me.kills, 'Eliminierungen'], [Math.round(me.dmg), 'Schaden'], [fmtT(me.surv || gameT), 'Überlebt']]); }
function onMsg(m) {
  switch (m.t) {
    case 'init':
      myId = m.id; matchMode = m.mode || 'solo'; setRoster(m.roster);
      if (m.world) { shipLine = m.ship; buildWorld(m.world); phase = 'game'; me.alive = false; PV.ch.g.visible = false; show('hud', true); show('dead', true); $('deadT').textContent = 'Runde läuft'; $('deadS').textContent = 'Du schaust zu – in der nächsten Runde bist du dabei. ' + (TOUCH ? 'Tippen' : 'Klick') + ': Spieler wechseln'; }
      else { phase = 'lobby'; show('lobby', true); }
      break;
    case 'lobby':
      phase = 'lobby'; leaveCar(); clearWorld(); dropEnts(); stormS = shipS = null; me.alive = false; me.down = false; revState = null; revivers.clear(); PV.ch.g.visible = true; document.body.classList.remove('down'); $('team').style.display = 'none'; $('tag').style.display = 'none'; placeBeam(beamA, null); placeBeam(beamB, null);
      show('lobby', true); show('dead', false); show('win', false); show('hud', false); stormMesh.visible = shipMesh.visible = false; $('tint').style.opacity = 0; $('score').style.display = 'none';
      break;
    case 'start':
      matchMode = m.mode || 'solo'; shipLine = m.ship; lastSpec = -1; dropEnts(); setRoster(m.roster); leaveCar(); buildWorld(m.world); resetMe(); phase = 'game'; gameT = 0; shipS = [m.ship.ax, m.ship.az]; me.x = m.ship.ax; me.z = m.ship.az; me.y = S.SHIPY - 8; $('feed').innerHTML = ''; $('picks').innerHTML = '';
      show('lobby', false); show('dead', false); show('win', false); show('hud', true); PV.ch.g.visible = false;
      me.ch = makeChar(myId);
      banner(matchMode === 'duo' && mateId ? 'DUO · Teammate: ' + nameOf(mateId) : TOUCH ? 'SPRUNG-Taste: Abspringen!' : 'Leertaste: Abspringen!', 5);
      break;
    case 's': onState(m); break;
    case 'pc+': addPieceMesh(m.p, true); if (Math.hypot((m.p.ix + 0.5) * G - me.x, (m.p.iz + 0.5) * G - me.z) < 40) tone(140, 90, 0.08, 0.12, 'triangle'); break;
    case 'pc-': removePiece(m.k, true); break;
    case 'pchp': { const p = pieces.get(m.k); if (p) { p.hp = m.hp; const q = pcenter(p); fx.burst(q.x, q.y, q.z, MATCOL[p.mat], 3, 3, 0.12, 0.5); if (!pops.some((o) => o.p === p)) pops.push({ p, t: 0.5, hit: 1 }); } break; }
    case 'pcv': editPiece(m.k, m.v); break;
    case 'obj-': removeObj(m.id); break;
    case 'loot+': addLootMesh(m.l, m.o); break;
    case 'loot-': { const l = loot.get(m.id); if (l) { worldGroup.remove(l.mesh); loot.delete(m.id); } pending.delete(m.id); break; }
    case 'chest': { const c = chests.get(m.id); if (c) { openChest(c); fx.burst(c.x, c.y + 0.8, c.z, '#ffd83a', 26, 5, 0.12, 0.9, 6); if (Math.hypot(c.x - me.x, c.z - me.z) < 30) tone(500, 1100, 0.25, 0.12, 'triangle'); } break; }
    case 'got': gotItem(m.i); break;
    case 'mat': me.mats[m.m] = Math.min(1000, me.mats[m.m] + m.n); gain('+' + m.n + ' ' + S.MATS[m.m].n); hudDirty = true; break;
    case 'dmg': {
      const e = ents.get(m.id); me.dmg += m.n; hitMarker(m.head ? 'head' : ''); tone(m.head ? 1500 : 950, m.head ? 1200 : 700, 0.07, 0.14, 'square');
      if (e) { dmgNumber(e, m.n, m.head, m.sh); e.ch.flinch = 1; if (m.brk) { fx.burst(e.x, e.y + 1.2, e.z, '#5cc4ff', 22, 6, 0.1, 0.6, 5); tone(1800, 500, 0.25, 0.12, 'triangle'); } }
      break;
    }
    case 'hurt':
      $('hurt').style.opacity = 0.9; setTimeout(() => (hudDirty = true), 180); noise(0.12, 500, 0.3); shake = Math.max(shake, 0.02); if (me.ch) me.ch.flinch = 1;
      if (m.kb) { me.kx += m.kb[0]; me.kz += m.kb[2]; me.vy = Math.max(me.vy, m.kb[1]); me.onGround = false; }
      if (m.ax !== null) { const dx = m.ax - me.x, dz = m.az - me.z, a = Math.atan2(dx * Math.cos(me.yaw) - dz * Math.sin(me.yaw), -dx * Math.sin(me.yaw) - dz * Math.cos(me.yaw)); $('hurtdir').style.transform = 'rotate(' + a + 'rad)'; $('hurtdir').style.opacity = 1; hurtT = 1; }
      break;
    case 'shot': {
      tracer(m.o, m.e, 0, m.w === 'sniper' ? 0.08 : 0, m.w === 'sniper' ? 0.25 : 0); const d = Math.hypot(m.o[0] - camera.position.x, m.o[2] - camera.position.z); shotSound(m.w, clamp(1 - d / 160, 0, 0.8));
      const e = ents.get(m.id); if (e) { e.ch.kick = 1; e.ch.flashT = 0.05; e.ch.sinceShot = 0; if (d < 40) ejectShell(e.ch, m.w); }
      fx.burst(m.e[0], m.e[1], m.e[2], '#d8c9a0', 3, 2.5, 0.07, 0.35);
      break;
    }
    case 'nade': {
      const e = ents.get(m.id);
      if (m.k === 'rocket') { spawnRocket(m.o, m.v, false); if (e) { e.ch.kick = 1; e.ch.flashT = 0.06; e.ch.sinceShot = 0; } shotSound('rpg', clamp(1 - Math.hypot(m.o[0] - camera.position.x, m.o[2] - camera.position.z) / 160, 0, 0.8)); }
      else { spawnNade(m.o, m.v, false, m.k); if (e) e.ch.sinceShot = 0; }
      break;
    }
    case 'gas': gases.push({ x: m.x, y: m.y, z: m.z, until: T + (m.d || 8) }); noise(0.5, 260, clamp(1 - Math.hypot(m.x - me.x, m.z - me.z) / 60, 0, 0.3)); break;
    case 'sd': addChestMesh(m.c); banner('Versorgungsabwurf im Anflug!', 3); tone(300, 600, 0.5, 0.1, 'triangle'); break;
    case 'card+': addCard(m.c); if (m.c.team === myTeam && m.c.o === mateId) banner('Hol die Reboot-Karte von ' + nameOf(mateId) + '!', 3); break;
    case 'card-': removeCard(m.id); if (m.by === myId) { me.card = true; banner('Karte aufgehoben – bring sie zu einem Reboot-Funkmast (Karte: blaue Punkte)', 4); tone(600, 1200, 0.2, 0.12, 'triangle'); } break;
    case 'rbt': if (m.by === myId) rbState = m.on ? { t0: performance.now() } : null; break;
    case 'rebooted':
      if (m.by === myId) { me.card = false; rbState = null; tone(500, 1200, 0.4, 0.14, 'sine'); }
      deadSet.delete(m.v); feed('<b>' + esc(nameOf(m.by)) + '</b> hat <b>' + esc(nameOf(m.v)) + '</b> zurückgeholt', m.by === myId || m.v === myId);
      break;
    case 'reborn': rebornMe(m); break;
    case 'boom': explode(m.x, m.y, m.z); break;
    case 'car': myCar = m.id; me.build = null; me.reload = me.using = null; mouseR = false; me.emote = 0; document.body.classList.add('driving'); hudDirty = true; break;
    case 'car-': {
      const c = cars.get(m.id); if (!c) break;
      explode(c.x, c.y + 1, c.z, 1.2);
      worldGroup.remove(c.mesh); c.geo.dispose(); cars.delete(m.id); if (m.id === myCar) leaveCar();
      break;
    }
    case 'roster': setRoster(m.r); break;
    case 'knock': {
      const v = esc(nameOf(m.v)), k = m.k ? esc(nameOf(m.k)) : '', ic = S.W[m.w] ? pic(m.w + '0', ICON[m.w]) : m.w === 'gren' ? pic('gren', ICON.gren) : m.w === 'pick' ? pic('pick', ICON.pick) : ' ⟶ ';
      if (m.k === myId) { $('elim').innerHTML = '⬇ NIEDERGESCHLAGEN &nbsp;<b>' + v + '</b>'; $('elim').style.opacity = 1; elimT = 2.2; hitMarker('kill'); tone(520, 780, 0.15, 0.12, 'triangle'); }
      if (m.v === myId) meKnocked();
      if (m.v === mateId) { banner(nameOf(mateId) + ' liegt am Boden – hilf!', 3); tone(400, 260, 0.3, 0.12, 'sawtooth'); }
      break;
    }
    case 'rev':
      if (m.on) revivers.set(m.by, m.v); else revivers.delete(m.by);
      if (m.v === myId || m.by === myId) revState = m.on ? { v: m.v, by: m.by, t0: performance.now() } : null;
      break;
    case 'revd':
      revivers.delete(m.by);
      if (revState && (revState.v === m.v || revState.by === m.by)) revState = null;
      if (m.v === myId) { me.down = false; document.body.classList.remove('down'); banner('Wiederbelebt!', 2); tone(500, 1000, 0.35, 0.15, 'sine'); hudDirty = true; }
      if (m.by === myId) { banner(nameOf(m.v) + ' ist wieder auf den Beinen', 2); tone(500, 1000, 0.35, 0.15, 'sine'); }
      break;
    case 'mark': mateMark = m.clear ? null : { x: m.x, z: m.z }; placeBeam(beamB, mateMark); if (!m.clear) tone(990, 1480, 0.1, 0.08, 'triangle'); break;
    case 'kill': {
      const v = esc(nameOf(m.v)), k = m.k ? esc(nameOf(m.k)) : '';
      const kw = m.w === 'rocket' ? 'rpg' : m.w, ic = S.W[kw] ? pic(kw + '0', ICON[kw]) : m.w === 'pick' ? pic('pick', ICON.pick) : THROW[m.w] ? pic(m.w, ICON[m.w]) : ICON[m.w === 'car' ? 'car' : 'storm'];
      const ve = m.v === myId ? me : ents.get(m.v), ke = m.k === myId ? me : ents.get(m.k);
      const dist = ve && ke && m.k ? ' <span style="opacity:.6">' + Math.round(Math.hypot(ve.x - ke.x, ve.z - ke.z)) + ' m</span>' : '';
      feed(m.w === 'bleed' ? (k ? '<b>' + k + '</b> ⟶ ' : '') + '<b>' + v + '</b>' : m.w === 'storm' ? ic + '<b>' + v + '</b> wurde vom Sturm erwischt' : m.w === 'fall' ? '<b>' + v + '</b> ist zu tief gefallen' : m.w === 'quit' ? '<b>' + v + '</b> hat das Spiel verlassen' : !m.k ? '<b>' + v + '</b> wurde eliminiert' : '<b>' + k + '</b>' + ic + '<b>' + v + '</b>' + dist, m.k === myId || m.v === myId);
      deadSet.add(m.v); if (m.k) killsBy.set(m.k, m.kills);
      if (m.k === myId) { me.kills = m.kills; $('elim').innerHTML = '☠ ELIMINIERT &nbsp;<b>' + v + '</b>'; $('elim').style.opacity = 1; elimT = 2.6; hitMarker('kill'); tone(660, 990, 0.18, 0.14, 'triangle'); }
      { const ve2 = ents.get(m.v); if (ve2) { ve2.deadT = 1; ve2.alive = false; } } revivers.delete(m.v);
      if (revState && (revState.v === m.v || revState.by === m.v)) revState = null;
      if (m.v === myId) die(m);
      else if (m.v === specId && m.k) specId = m.k;
      break;
    }
    case 'win':
      phase = 'end'; show('dead', false); show('win', true); leaveCar();
      const won = Array.isArray(m.ids) && m.ids.includes(myId);
      if (!me.alive && Array.isArray(m.ids)) { const w0 = m.ids.find((id) => ents.get(id) && ents.get(id).alive); if (w0) specId = w0; }
      if (won) { me.surv = me.surv || gameT; $('winT').textContent = '#1 EPISCHER SIEG!'; $('winS').innerHTML = endStats(1); tone(520, 1040, 0.6, 0.2, 'triangle'); if (me.alive) me.emote = 99; for (let i = 0; i < 6; i++) fx.burst(me.x + (Math.random() - 0.5) * 6, me.y + 3, me.z + (Math.random() - 0.5) * 6, ['#ffd83a', '#ff5a4d', '#59b7ff', '#5be05a', '#fff', '#b04dff'][i], 30, 8, 0.14, 1.8, 6); }
      else { $('winT').textContent = (m.name || 'Niemand') + ' gewinnt'; $('winS').innerHTML = 'Neue Runde startet gleich …' + (me.place ? endStats(me.place) : ''); }
      break;
  }
}
function onState(m) {
  if (m.ph === 'lobby') { $('lobbyT').textContent = m.tm; $('lobbyN').innerHTML = m.names.map((n) => '<span>' + esc(n) + '</span>').join(''); if (m.v) $('lobbyV').textContent = 'Nächste Runde: ' + (m.mode === 'duo' ? 'DUO' : 'SOLO') + ' · Stimmen Solo ' + m.v[0] + ' / Duo ' + m.v[1]; return; }
  if (stormS && m.st[7] && !stormS[7]) { banner('Der Sturm zieht sich zusammen!', 3.5); tone(200, 90, 0.8, 0.12, 'sawtooth'); }
  stormS = m.st; shipS = m.ship; aliveN = m.al; teamsN = m.tl || 0; gameT = m.gt; stateTick++;
  for (const a of m.p) {
    if (a[0] === myId) { if (me.hp !== a[6] || me.sh !== a[7]) { me.hp = a[6]; me.sh = a[7]; hudDirty = true; } me.bush = !!(a[8] & 1024); me.card = !!(a[8] & 4096); continue; }
    let e = ents.get(a[0]);
    if (!e) { e = { id: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], tx: a[1], ty: a[2], tz: a[3], tyaw: a[4], speed: 0, rlT: 0, swT: 9, deadT: 0, fl: 0, lod: 0, pdt: 0, stepA: 0, mate: a[0] === mateId, ch: makeChar(a[0]) }; ents.set(a[0], e); }
    e.tx = a[1]; e.ty = a[2]; e.tz = a[3]; e.tyaw = a[4]; e.pitch = a[5]; e.hp = a[6]; e.sh = a[7];
    if ((a[8] & 128) && !(e.fl & 128)) e.swT = 0;
    e.fl = a[8]; e.w = a[9]; e.wr = a[10] | 0; e.seen = stateTick; e.lastSeen = T; if (!e.alive) e.deadT = 0; e.alive = true;
  }
  if (m.cs) for (const a of m.cs) { const c = cars.get(a[0]); if (!c) continue; c.drv = a[5]; if (c.id === myCar) continue; c.tx = a[1]; c.ty = a[2]; c.tz = a[3]; c.tyaw = a[4]; }
  if (!me.alive) renderBars();
}

// ================= Inventar =================
const curItem = () => (me.slot > 0 ? me.inv[me.slot - 1] : null);
function hasRoom(i) {
  if (i.k === 'a' || i.k === 'm') return true;
  if (i.k === 'c' && me.inv.some((s) => s && s.k === 'c' && s.c === i.c && s.n < S.CONS[i.c].max)) return true;
  return me.inv.includes(null) || me.slot > 0;
}
function gotItem(i) {
  tone(700, 1200, 0.09, 0.1, 'triangle'); hudDirty = true; pickLog('+ ' + itemName(i), itemColor(i));
  if (i.k === 'a') { me.ammo[i.a] = (me.ammo[i.a] || 0) + i.n; return; }
  if (i.k === 'm') { me.mats[i.m] = Math.min(1000, me.mats[i.m] + i.n); return; }
  if (i.k === 'a' && !(i.a in me.ammo)) me.ammo[i.a] = 0;
  if (i.k === 'c') {
    const s = me.inv.find((q) => q && q.k === 'c' && q.c === i.c && q.n < S.CONS[i.c].max);
    if (s) { const add = Math.min(i.n, S.CONS[i.c].max - s.n); s.n += add; i.n -= add; if (i.n <= 0) return; }
  }
  let e = me.inv.indexOf(null);
  if (e < 0) { if (me.slot === 0) { tx({ t: 'drop', i }); return; } e = me.slot - 1; tx({ t: 'drop', i: me.inv[e] }); me.reload = me.using = null; }
  me.inv[e] = i;
  if (i.k === 'w' && me.slot === 0 && !me.build) setSlot(e + 1);
}
function setSlot(n) { if (myCar) return; if (n !== me.slot) { noise(0.05, 1500, 0.07); setTimeout(() => noise(0.04, 2600, 0.06), 120); } me.slot = n; me.build = null; me.reload = null; me.using = null; me.emote = 0; hudDirty = true; }
function startReload() {
  const it = curItem(); if (!it || it.k !== 'w' || me.reload || myCar) return;
  const W = S.W[it.w]; if (it.mag >= W.mag || me.ammo[W.ammo] <= 0) return;
  me.reload = { t: W.rel, total: W.rel }; hudDirty = true; tone(300, 200, 0.06, 0.08, 'square'); setTimeout(() => tone(240, 300, 0.05, 0.08, 'square'), W.rel * 650);
}
function die(m) {
  me.alive = false; me.build = null; me.deadT = 1; me.place = m.place; me.surv = gameT; mouseL = mouseR = false; leaveCar(); if (!TOUCH && document.exitPointerLock) document.exitPointerLock();
  const items = me.inv.filter(Boolean);
  for (const a in me.ammo) if (me.ammo[a] > 0) items.push({ k: 'a', a, n: me.ammo[a] });
  for (const k in me.mats) if (me.mats[k] > 0) items.push({ k: 'm', m: k, n: me.mats[k] });
  tx({ t: 'dropall', items });
  me.down = false; document.body.classList.remove('down'); if (revState && revState.by === myId) tx({ t: 'rev', on: 0 }); revState = null;
  const mt = mateId && ents.get(mateId), mateOn = !!(mt && mt.alive);
  specId = mateOn ? mateId : m.k || 0;
  show('dead', true); $('deadT').textContent = m.k ? 'Eliminiert von ' + nameOf(m.k) : m.w === 'storm' ? 'Vom Sturm erwischt' : 'Ausgeschieden';
  $('deadS').innerHTML = (mateOn ? '<div style="color:#59b7ff;font-size:20px">Dein Teammate kämpft weiter!</div>' : '') + endStats(m.place) + '<div style="margin-top:10px;opacity:.8">' + (TOUCH ? 'Tippen' : 'Klick') + ': Spieler wechseln</div>';
  noise(0.5, 300, 0.4); hudDirty = true; $('lowammo').style.display = 'none'; arcLine.visible = false;
}

function meKnocked() {
  if (myCar) exitCar();
  me.down = true; me.build = null; me.reload = me.using = null; me.ads = false; mouseL = mouseR = false; me.crouch = false; me.emote = 0; hudDirty = true; arcLine.visible = false;
  document.body.classList.add('down'); banner('NIEDERGESCHLAGEN!', 2.5); noise(0.4, 300, 0.35); shake = Math.max(shake, 0.04);
}
function rebornMe(m) {
  Object.assign(me, { alive: true, st: 'ground', x: m.x, y: m.y, z: m.z, vy: 0, hp: 100, sh: 0, down: false, slot: 1, build: null, reload: null, using: null, deadT: 0, bush: false, card: false, swim: false, slide: 0, mantle: null, crouch: false, emote: 0, kx: 0, kz: 0 });
  me.inv = [{ k: 'w', w: 'pistol', r: 0, mag: S.W.pistol.mag }, null, null, null, null];
  me.ammo = { light: 36, medium: 0, shells: 0, heavy: 0, rockets: 0 }; me.mats = { wood: 100, stone: 0, metal: 0 };
  deadSet.delete(myId); revState = rbState = null; show('dead', false); document.body.classList.remove('down'); hudDirty = true;
  if (!me.ch) me.ch = makeChar(myId); me.ch.g.visible = true; me.ch.g.scale.set(-1, 1, 1);
  banner('Du bist zurück im Spiel!', 3); tone(500, 1200, 0.5, 0.15, 'sine'); fx.burst(me.x, me.y + 1, me.z, '#59b7ff', 40, 6, 0.14, 1.2, 4);
}
function releaseUse() { if (revState && revState.by === myId) tx({ t: 'rev', on: 0 }); if (rbState) { tx({ t: 'rbt', on: 0 }); rbState = null; } }
function editWall() {
  if (!me.alive || me.down || me.st !== 'ground' || myCar) return;
  aimDir(dir); const h = raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, 9, true);
  let p = h.kind === 'piece' ? pieces.get(h.key) : null;
  if (!p) { // durch ein Fenster/eine Tür schauen: nächste Wand vor dir
    for (let t = 0.5; t < 8 && !p; t += 0.5) { const x = pivot.x + dir.x * t, y = pivot.y + dir.y * t, z = pivot.z + dir.z * t, ix = Math.floor(x / G), iy = Math.floor(y / H), iz = Math.floor(z / G); for (const k of ['w:' + ix + ':' + iy + ':' + iz + ':0', 'w:' + ix + ':' + iy + ':' + iz + ':1', 'w:' + ix + ':' + iy + ':' + (iz + 1) + ':0', 'w:' + (ix + 1) + ':' + iy + ':' + iz + ':1']) { const q = pieces.get(k); if (q && Math.hypot(pcenter(q).x - x, pcenter(q).z - z) < 1.4) { p = q; break; } } }
  }
  if (!p || p.t !== 'w') { banner('Nur Wände lassen sich bearbeiten', 1.2); return; }
  const v = ((p.v | 0) + 1) % 3; editPiece(p.key, v); tx({ t: 'edit', k: p.key, v }); tone(700, 500, 0.06, 0.08, 'square');
  gain(['Wand', 'Fenster', 'Tür'][v]);
}

// ================= Eingabe =================
const cv = $('c');
function cycleSpec() { const a = [...ents.values()].filter((e) => e.alive); if (a.length) specId = a[(a.findIndex((e) => e.id === specId) + 1) % a.length].id; }
function toggleBuild(b) { if (myCar) return; me.build = me.build === b ? null : b; me.reload = me.using = null; me.emote = 0; hudDirty = true; }
function crouchKey() {
  if (me.down || myCar) return;
  if (!me.crouch && me.sprint && me.onGround && me.st === 'ground' && !me.swim) { const l = Math.hypot(me.vx || 0, me.vz || 0) || 1; me.slide = 0.95; me.slideV = [(me.vx || 0) / l * 11, (me.vz || 0) / l * 11]; noise(0.5, 700, 0.12); }
  me.crouch = !me.crouch; if (!me.crouch) me.slide = 0;
  if (TOUCH) $('bCrouch').classList.toggle('act', me.crouch);
}
function toggleMap() { $('bigmap').style.display = $('bigmap').style.display === 'block' ? 'none' : 'block'; }
cv.addEventListener('click', () => { initAudio(); if (TOUCH) return; if (phase === 'game' && me.alive && !locked) cv.requestPointerLock(); else if (!me.alive && phase === 'game') cycleSpec(); });
document.addEventListener('pointerlockchange', () => { if (TOUCH) return; locked = document.pointerLockElement === cv; if (!locked) { mouseL = mouseR = false; for (const k in keys) keys[k] = false; $('score').style.display = 'none'; } });
document.addEventListener('mousemove', (e) => {
  if (!locked || TOUCH) return;
  const it = curItem(), s = 0.0022 * SENS * (me.ads ? (it && it.w === 'sniper' ? 0.22 : it && it.w === 'hunt' ? 0.4 : 0.6) : 1);
  me.yaw -= e.movementX * s; me.pitch = clamp(me.pitch - e.movementY * s, -1.5, 1.5);
});
cv.addEventListener('mousedown', (e) => {
  if (!locked || TOUCH) return;
  if (e.button === 0) mouseL = true;
  if (e.button === 2) { if (me.build) { const ms = Object.keys(S.MATS); me.bmat = ms[(ms.indexOf(me.bmat) + 1) % 3]; hudDirty = true; } else mouseR = true; }
});
addEventListener('mouseup', (e) => { if (TOUCH) return; if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (!locked || !me.alive) return; setSlot((me.slot + (e.deltaY > 0 ? 1 : 5)) % 6); });
addEventListener('keydown', (e) => {
  if (document.activeElement === $('name')) { if (e.code === 'Enter') $('play').click(); return; }
  if (e.code === 'KeyM') { toggleMap(); return; }
  if (e.code === 'Tab' && phase !== 'menu' && phase !== 'lobby') { e.preventDefault(); renderScore(); $('score').style.display = 'block'; return; }
  if (!locked) return;
  if (['Space', 'KeyF', 'ControlLeft', 'KeyQ', 'KeyC', 'KeyV', 'KeyG', 'KeyT', 'KeyR', 'KeyE', 'KeyB', 'F1', 'F3'].includes(e.code) || e.ctrlKey) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true; if (e.code === 'Space') jumpEdge = true;
  if (!me.alive) return;
  if (e.code.startsWith('Digit')) { const n = +e.code[5]; if (n >= 1 && n <= 6) setSlot(n - 1); }
  else if (e.code === 'KeyQ' || e.code === 'KeyF' || e.code === 'KeyC' || e.code === 'KeyV') toggleBuild({ KeyQ: 'w', KeyF: 'f', KeyC: 'r', KeyV: 'c' }[e.code]);
  else if (e.code === 'KeyG') editWall();
  else if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyE') interact();
  else if (e.code === 'KeyT') { const mk = { x: me.x - Math.sin(me.yaw) * 60, z: me.z - Math.cos(me.yaw) * 60 }; setMark(myMark && Math.hypot(myMark.x - mk.x, myMark.z - mk.z) < 30 ? null : mk); }
  else if (e.code === 'KeyB') { if (me.st === 'ground' && !myCar) me.emote = me.emote > 0 ? 0 : 6; }
  else if (e.code === 'ControlLeft') crouchKey();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') $('score').style.display = 'none'; if (e.code === 'KeyE') releaseUse(); });
function leaveMatch() {
  if (ws) { ws.onclose = null; try { ws.close(); } catch (e) {} ws = null; }
  phase = 'menu'; leaveCar(); clearWorld(); dropEnts(); stormS = shipS = null; me.alive = false; me.down = false; revState = rbState = null; revivers.clear();
  for (const id of ['dead', 'win', 'hud', 'lobby']) show(id, false); show('menu', true);
  PV.ch.g.visible = true; stormMesh.visible = shipMesh.visible = false; $('tint').style.opacity = 0; $('score').style.display = 'none'; $('bigmap').style.display = 'none';
  $('team').style.display = 'none'; $('tag').style.display = 'none'; $('spec').style.display = 'none'; placeBeam(beamA, null); placeBeam(beamB, null);
  document.body.classList.remove('down', 'ingame', 'driving'); if (document.exitPointerLock) document.exitPointerLock();
}
for (const id of ['leaveD', 'leaveW']) $(id).addEventListener('click', (e) => { e.stopPropagation(); leaveMatch(); });
$('play').onclick = () => {
  initAudio();
  const n = $('name').value.trim() || 'Spieler' + Math.floor(Math.random() * 900 + 100);
  try { localStorage.setItem('sf_name', n); localStorage.setItem('sf_sens', SENS); localStorage.setItem('sf_shad', $('shad').checked ? 1 : 0); } catch (e) {}
  show('menu', false); connect(n);
  if (TOUCH) { try { const el = document.documentElement; const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) {} }
};
$('sens').oninput = () => { SENS = +$('sens').value; };
document.querySelectorAll('[data-gfx]').forEach((b) => { b.classList.toggle('sel', b.dataset.gfx === QL); b.addEventListener('click', () => { if (b.dataset.gfx === QL) return; try { localStorage.setItem('sf_gfx', b.dataset.gfx); localStorage.setItem('sf_name', $('name').value.trim()); } catch (e) {} location.reload(); }); });
try { if (localStorage.getItem('sf_mode') === 'duo') prefMode = 'duo'; } catch (e) {}
function setModeUI() { document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('sel', b.dataset.mode === prefMode)); }
document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => { initAudio(); prefMode = b.dataset.mode; try { localStorage.setItem('sf_mode', prefMode); } catch (e) {} setModeUI(); tx({ t: 'mode', m: prefMode }); tone(600, 900, 0.06, 0.06, 'triangle'); }));
setModeUI();
$('shad').onchange = () => { sun.castShadow = $('shad').checked; };
try { $('name').value = localStorage.getItem('sf_name') || ''; const s = +localStorage.getItem('sf_sens'); if (s >= 0.3 && s <= 3) { SENS = s; $('sens').value = s; } if (localStorage.getItem('sf_shad') === '0') { $('shad').checked = false; sun.castShadow = false; } } catch (e) {}

// ================= Touch-Steuerung =================
// Alle Finger laufen über einen einzigen Handler, Knöpfe werden über ihre Position erkannt (großzügige Trefferfläche)
if (TOUCH) {
  const stick = $('stick'), knob = $('knob'), ptr = new Map();
  const BTN = ['bFire', 'bFire2', 'bJump', 'bAds', 'bRel', 'bCrouch', 'bEmote', 'bEdit'].map((id) => ({ id, el: $(id) }));
  const SKIP = '#inv,#build,#prompt,#mini,#info,#bigmap,#score,[data-mode],input,button';
  const hitBtn = (x, y) => {
    let best = null, bd = 1e9;
    for (const b of BTN) {
      if (!b.el || b.el.offsetParent === null) continue;
      const r = b.el.getBoundingClientRect(); if (!r.width) continue;
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2)), rad = r.width / 2 * 1.3 + 8;
      if (d < rad && d < bd) { bd = d; best = b; }
    }
    return best;
  };
  const press = (id, on) => {
    if (id === 'bFire' || id === 'bFire2') { mouseL = on; return; }
    if (id === 'bJump') { keys.Space = on; if (on) jumpEdge = true; return; }
    if (!on) return;
    if (id === 'bAds') { mouseR = !mouseR; $('bAds').classList.toggle('act', mouseR); }
    else if (id === 'bRel') startReload();
    else if (id === 'bCrouch') crouchKey();
    else if (id === 'bEdit') editWall();
    else if (id === 'bEmote') { if (me.st === 'ground' && !myCar && !me.down) me.emote = me.emote > 0 ? 0 : 6; }
  };
  const look = (p, x, y) => {
    const it = curItem(), s = 0.0058 * SENS * (me.ads ? (it && it.w === 'sniper' ? 0.22 : it && it.w === 'hunt' ? 0.4 : 0.55) : 1);
    me.yaw -= (x - p.x) * s; me.pitch = clamp(me.pitch - (y - p.y) * s, -1.5, 1.5); p.x = x; p.y = y;
  };
  const release = (id) => {
    const p = ptr.get(id); if (!p) return; ptr.delete(id);
    if (p.k === 'joy') { joy.id = null; joy.x = joy.y = 0; joyM = 0; stick.style.display = 'none'; }
    else if (p.k === 'btn') { press(p.b.id, false); if (![...ptr.values()].some((q) => q.k === 'btn' && q.b === p.b)) p.b.el.classList.remove('on'); }
  };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || (phase !== 'game' && phase !== 'end')) return;
    if (e.target.closest && e.target.closest(SKIP)) return;
    e.preventDefault(); initAudio();
    if (!me.alive) { cycleSpec(); return; }
    const b = hitBtn(e.clientX, e.clientY);
    if (b) { ptr.set(e.pointerId, { k: 'btn', b, x: e.clientX, y: e.clientY }); b.el.classList.add('on'); press(b.id, true); return; }
    if (e.clientX < innerWidth * 0.42 && joy.id === null) {
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0; ptr.set(e.pointerId, { k: 'joy' });
      stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = 'translate(0,0)';
    } else ptr.set(e.pointerId, { k: 'look', x: e.clientX, y: e.clientY });
  }, { capture: true, passive: false });
  document.addEventListener('pointermove', (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    if (p.k === 'joy') {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const m = Math.hypot(dx, dy), R = 52;
      if (m > R) { dx *= R / m; dy *= R / m; }
      joy.x = dx / R; joy.y = dy / R; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    } else if (p.k === 'look' || (p.k === 'btn' && (p.b.id === 'bFire' || p.b.id === 'bFire2' || p.b.id === 'bJump'))) look(p, e.clientX, e.clientY);
  }, { capture: true, passive: true });
  for (const ev of ['pointerup', 'pointercancel']) document.addEventListener(ev, (e) => release(e.pointerId), { capture: true });
  addEventListener('blur', () => { for (const id of [...ptr.keys()]) release(id); });
  const hudTap = (e) => {
    const t = e.target.closest('[data-slot],[data-b],[data-m]'); if (!t || !me.alive || me.down) return;
    e.preventDefault(); e.stopPropagation(); initAudio();
    if (t.dataset.slot !== undefined) { setSlot(+t.dataset.slot); mouseR = false; $('bAds').classList.remove('act'); }
    else if (t.dataset.b) toggleBuild(t.dataset.b);
    else { me.bmat = t.dataset.m; hudDirty = true; }
  };
  $('inv').addEventListener('pointerdown', hudTap); $('build').addEventListener('pointerdown', hudTap);
  $('prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); interact(); });
  for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) $('prompt').addEventListener(ev, () => releaseUse());
  $('mini').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toggleMap(); });
  $('info').style.pointerEvents = 'auto';
  $('info').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const s = $('score'); if (s.style.display === 'block') s.style.display = 'none'; else { renderScore(); s.style.display = 'block'; } });
  addEventListener('touchmove', (e) => { if (phase === 'game' || phase === 'end') e.preventDefault(); }, { passive: false });
  addEventListener('gesturestart', (e) => e.preventDefault());
}
// Karte: Markierung setzen (Klick/Tipp), entfernen (Rechtsklick oder erneut auf die Markierung)
$('bigmap').addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  const r = $('bigmap').getBoundingClientRect(), x = (e.clientX - r.left) / r.width * 2 * E - E, z = (e.clientY - r.top) / r.height * 2 * E - E;
  if (phase === 'game' && me.alive) setMark(e.button === 2 || (myMark && Math.hypot(myMark.x - x, myMark.z - z) < 30) ? null : { x, z });
  if (TOUCH) toggleMap();
});
$('score').addEventListener('pointerdown', () => ($('score').style.display = 'none'));
const markGeo = new THREE.CylinderGeometry(0.4, 0.4, 400, 8, 1, true).translate(0, 200, 0);
const mkBeam = (c) => { const m = new THREE.Mesh(markGeo, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.5, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })); m.visible = false; scene.add(m); return m; };
const beamA = mkBeam(0xffd83a), beamB = mkBeam(0x59b7ff);
function placeBeam(b, mk) { b.visible = !!mk; if (mk) b.position.set(mk.x, S.height(mk.x, mk.z), mk.z); }
function setMark(mk) { myMark = mk; placeBeam(beamA, mk); tx(mk ? { t: 'mark', x: +mk.x.toFixed(1), z: +mk.z.toFixed(1) } : { t: 'mark', clear: 1 }); tone(mk ? 880 : 600, mk ? 1320 : 400, 0.08, 0.08, 'triangle'); }

// ================= Interaktion =================
let nearLoot = null, nearChest = null, nearCar = null, nearMate = null, nearCard = null, nearVan = null;
const KE = TOUCH ? 'Tippen' : 'E';
function scanNear() {
  const p = $('prompt');
  nearCard = nearVan = null;
  if (me.down) { p.style.display = 'none'; nearLoot = nearChest = nearCar = nearMate = null; return; }
  if (myCar) { p.innerHTML = '<b>' + KE + '</b>Aussteigen'; p.style.display = 'block'; return; }
  const mt = mateId && ents.get(mateId);
  nearMate = mt && mt.alive && (mt.fl & 512) && Math.hypot(mt.x - me.x, mt.z - me.z) < 2.6 && Math.abs(mt.y - me.y) < 2 ? mt : null;
  if (nearMate) { p.innerHTML = '<b>' + (TOUCH ? 'Halten' : 'E halten') + '</b>' + esc(nameOf(mateId)) + ' wiederbeleben'; p.style.display = 'block'; return; }
  if (!me.card) for (const c of cards.values()) if (Math.hypot(c.x - me.x, c.z - me.z) < 3 && Math.abs(c.y - me.y) < 3) { nearCard = c; break; }
  if (nearCard) { p.innerHTML = '<b>' + KE + '</b>Reboot-Karte von ' + esc(nameOf(nearCard.o)) + ' aufheben'; p.style.display = 'block'; return; }
  if (me.card) for (const v of vans) if (Math.hypot(v.x - me.x, v.z - me.z) < 4.5) { nearVan = v; break; }
  if (nearVan) { p.innerHTML = '<b>' + (TOUCH ? 'Halten' : 'E halten') + '</b>' + esc(nameOf(mateId)) + ' zurückholen'; p.style.display = 'block'; return; }
  nearLoot = nearChest = nearCar = null; let bd = 2.8;
  for (const l of loot.values()) {
    if (l.pop !== undefined) continue;
    const d = Math.hypot(l.x - me.x, l.z - me.z); if (Math.abs(l.y - me.y) > 2.5) continue;
    if ((l.i.k === 'a' || l.i.k === 'm') && d < 2 && !pending.has(l.id)) { pending.add(l.id); tx({ t: 'pickup', id: l.id }); continue; }
    if (l.i.k !== 'a' && l.i.k !== 'm' && d < bd) { bd = d; nearLoot = l; }
  }
  let cd = 2.8;
  for (const c of chests.values()) { if (c.open || Math.abs(c.y - me.y) > 2.5 || (c.k === 'd' && gameT < c.land)) continue; const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < cd) { cd = d; nearChest = c; } }
  let kd = 3.6;
  for (const c of cars.values()) { if (c.drv || Math.abs(c.y - me.y) > 2.5) continue; const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < kd) { kd = d; nearCar = c; } }
  if (nearChest && cd <= bd) { p.innerHTML = '<b>' + KE + '</b>' + (nearChest.k === 'a' ? 'Munitionskiste öffnen' : nearChest.k === 'd' ? 'Versorgungskiste öffnen' : 'Truhe öffnen'); nearLoot = nearCar = null; }
  else if (nearLoot) { p.innerHTML = '<b>' + KE + '</b><span style="color:' + itemColor(nearLoot.i) + '">' + itemName(nearLoot.i) + '</span>'; nearChest = nearCar = null; }
  else if (nearCar) p.innerHTML = '<b>' + KE + '</b>Einsteigen';
  else { p.style.display = 'none'; return; }
  p.style.display = 'block';
}
function interact() {
  if (me.st !== 'ground' || me.down) return;
  if (myCar) { exitCar(); return; }
  if (nearMate) { if (!revState) tx({ t: 'rev', id: nearMate.id, on: 1 }); return; }
  if (nearCard) { tx({ t: 'card', id: nearCard.id }); return; }
  if (nearVan) { if (!rbState) { tx({ t: 'rbt', id: nearVan.id, on: 1 }); rbState = { t0: performance.now() }; } return; }
  if (nearChest) { tx({ t: 'open', id: nearChest.id }); return; }
  if (nearLoot && !pending.has(nearLoot.id)) {
    if (!hasRoom(nearLoot.i)) { banner('Inventar voll – wähle einen Platz zum Tauschen', 2); return; }
    pending.add(nearLoot.id); tx({ t: 'pickup', id: nearLoot.id }); return;
  }
  if (nearCar) { tx({ t: 'enter', id: nearCar.id }); tone(180, 320, 0.2, 0.1, 'sawtooth'); }
}

// ================= Autos =================
function exitCar() {
  const c = cars.get(myCar); tx({ t: 'exit' });
  if (c) {
    c.sp = 0; const rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
    for (const s of [-1, 1]) { const x = c.x + rx * 2.3 * s, z = c.z + rz * 2.3 * s; if (!wallAt(x, z, c.y, c.x, c.z) && S.height(x, z) > -1) { me.x = x; me.z = z; break; } }
    me.y = groundAt(me.x, me.z, c.y + 1); me.vy = 0; c.tx = c.x; c.ty = c.y; c.tz = c.z; c.tyaw = c.yaw; c.drv = 0; c.roll = 0; c.air = false;
  }
  leaveCar(); hudDirty = true;
}
const ramT = new Map(); let skidT = 0;
function updateCar(dt, now) {
  const c = cars.get(myCar); if (!c) { leaveCar(); return; }
  let thr = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), st = (keys.KeyA ? 1 : 0) - (keys.KeyD ? 1 : 0);
  if (joy.id !== null) { thr = Math.abs(joy.y) > 0.2 ? -joy.y : 0; st = Math.abs(joy.x) > 0.2 ? -joy.x : 0; }
  const hb = !!keys.Space, wet = S.height(c.x, c.z) < -0.3;
  if (!c.air) {
    c.sp += thr * (thr * c.sp < 0 ? 32 : 15) * dt;
    c.sp -= c.sp * 0.55 * dt; if (!thr) c.sp -= Math.sign(c.sp) * Math.min(Math.abs(c.sp), 7 * dt);
    if (hb) c.sp -= Math.sign(c.sp) * Math.min(Math.abs(c.sp), 11 * dt);
  }
  c.sp = clamp(c.sp, -9, wet ? 7 : 26);
  c.steer += (st - c.steer) * Math.min(1, dt * 9);
  c.yaw += c.steer * (hb ? 2.5 : 1.9) * clamp(Math.abs(c.sp) / 6, 0, 1) * (c.sp < 0 ? -1 : 1) * (c.air ? 0.3 : 1) * dt;
  // Haftung: Fahrtrichtung folgt der Ausrichtung verzögert (Drift)
  let dv = c.yaw - c.vd; dv = Math.atan2(Math.sin(dv), Math.cos(dv));
  c.vd += dv * Math.min(1, dt * (hb ? 1.6 : Math.abs(c.sp) > 18 ? 4.5 : 8));
  const slip = Math.abs(dv);
  c.roll = lerp(c.roll || 0, c.steer * Math.min(1, Math.abs(c.sp) / 20) * 0.16, Math.min(1, dt * 6));
  const fx2 = -Math.sin(c.vd), fz = -Math.cos(c.vd), hx = -Math.sin(c.yaw), hz = -Math.cos(c.yaw), s = Math.sign(c.sp) || 1;
  const nx = c.x + fx2 * c.sp * dt, nz = c.z + fz * c.sp * dt, px = nx + hx * 2.1 * s, pz = nz + hz * 2.1 * s;
  let ok = true;
  const wk = wallAt(px, pz, c.y, c.x, c.z) || wallAt(nx, nz, c.y, c.x, c.z);
  if (wk) { ok = false; if (Math.abs(c.sp) > 6) { tx({ t: 'rampc', k: wk }); noise(0.2, 500, 0.4); shake = Math.max(shake, 0.03); c.sp *= 0.6; } else c.sp = 0; }
  else {
    const o = objAt(px, pz, c.y, c.x, c.z, 0.5);
    if (o || px * px + pz * pz > S.R * S.R || S.height(nx, nz) < -1.6) { ok = false; if (Math.abs(c.sp) > 5) { noise(0.2, 400, 0.4); shake = Math.max(shake, 0.035); } c.sp *= -0.3; c.vd = c.yaw; }
  }
  if (ok) { c.x = nx; c.z = nz; }
  // Federung / Sprünge
  const gh = S.height(c.x, c.z);
  if (c.air) { c.vy -= 24 * dt; c.y += c.vy * dt; if (c.y <= gh) { if (c.vy < -7) { shake = Math.max(shake, 0.04); noise(0.2, 300, 0.4); fx.burst(c.x, gh + 0.2, c.z, '#b9a47a', 14, 4, 0.25, 0.6, 3); } c.y = gh; c.air = false; c.vy = 0; c.pv = 0; } }
  else { const sv = (gh - c.y) / Math.max(dt, 0.001); if (c.pv !== undefined && c.pv - sv > 7 && Math.abs(c.sp) > 12) { c.air = true; c.vy = Math.min(c.pv, 9); } else c.y = gh; c.pv = sv; }
  if (Math.abs(c.sp) > 8) for (const e of ents.values()) {
    if (!e.alive || (e.fl & 7) || Math.abs(e.y - c.y) > 2) continue;
    if (Math.hypot(e.x - px, e.z - pz) < 1.9 && now - (ramT.get(e.id) || 0) > 550) { ramT.set(e.id, now); tx({ t: 'ram', id: e.id }); noise(0.15, 600, 0.4); shake = Math.max(shake, 0.03); }
  }
  c.wheels.forEach((w, i) => { w.rotation.x += c.sp * dt / 0.48; w.rotation.y = i % 2 ? c.steer * 0.45 : 0; });
  placeCar(c, Math.min(1, dt * 10));
  me.x = c.x; me.z = c.z; me.y = c.y; me.vy = 0; me.onGround = true; me.speed = Math.abs(c.sp);
  engineSound(true, c.sp);
  const sd = $('speed'); sd.style.display = 'block'; sd.innerHTML = Math.round(Math.abs(c.sp) * 3.6) + ' <small>km/h</small>';
  if (!c.air && (slip > 0.22 && Math.abs(c.sp) > 8 || Math.abs(c.sp) > 10 && Math.random() < dt * 20)) {
    fx.burst(c.x - hx * 2, c.y + 0.2, c.z - hz * 2, slip > 0.22 ? '#d8d2c4' : '#b9a47a', slip > 0.22 ? 2 : 1, 1.5, 0.3, 0.6, -1);
    if (slip > 0.22 && now - skidT > 180) { skidT = now; noise(0.2, 2400, 0.08); }
  }
}

// ================= Bauen =================
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x4db2ff, transparent: true, opacity: 0.42, depthWrite: false });
const ghosts = { w: new THREE.Mesh(pieceGeo.w, ghostMat), f: new THREE.Mesh(pieceGeo.f, ghostMat), r: new THREE.Mesh(pieceGeo.r, ghostMat), c: new THREE.Mesh(pieceGeo.c, ghostMat) };
for (const k in ghosts) { ghosts[k].visible = false; scene.add(ghosts[k]); }
function buildSpot() {
  const fx2 = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), ax = Math.abs(fx2) > Math.abs(fz);
  const pcx = Math.floor(me.x / G), pcz = Math.floor(me.z / G), base = Math.floor((me.y + 0.4) / H);
  let p;
  if (me.build === 'w') {
    p = ax ? { t: 'w', d: 1, ix: fx2 > 0 ? pcx + 1 : pcx, iz: pcz } : { t: 'w', d: 0, ix: pcx, iz: fz > 0 ? pcz + 1 : pcz };
    p.iy = base + (me.pitch > 0.7 ? 1 : me.pitch < -1.0 ? -1 : 0);
    if (pieces.has(S.pkey(p))) { const q = { ...p }; if (ax) q.ix += fx2 > 0 ? 1 : -1; else q.iz += fz > 0 ? 1 : -1; if (me.pitch > 0.25) p.iy++; else p = q; }
  } else if (me.build === 'f') {
    const px = me.x + fx2 * 2.6, pz = me.z + fz * 2.6;
    p = { t: 'f', ix: Math.floor(px / G), iz: Math.floor(pz / G), iy: Math.round(me.y / H) + (me.pitch > 0.45 ? 1 : 0) };
    if (pieces.has(S.pkey(p)) && me.pitch <= 0.45) { p.ix = Math.floor((me.x + fx2 * 5.5) / G); p.iz = Math.floor((me.z + fz * 5.5) / G); }
  } else if (me.build === 'c') {
    const px = me.x + fx2 * (me.pitch > 0.6 ? 0.5 : 2.6), pz = me.z + fz * (me.pitch > 0.6 ? 0.5 : 2.6);
    p = { t: 'c', ix: Math.floor(px / G), iz: Math.floor(pz / G), iy: Math.floor((me.y + 0.4) / H) + 1 };
  } else {
    const px = me.x + fx2 * 2.3, pz = me.z + fz * 2.3;
    p = { t: 'r', ix: Math.floor(px / G), iz: Math.floor(pz / G), iy: base, rot: ax ? (fx2 > 0 ? 1 : 3) : fz > 0 ? 0 : 2 };
    if (pieces.has(S.pkey(p))) { if (ax) p.ix += fx2 > 0 ? 1 : -1; else p.iz += fz > 0 ? 1 : -1; p.iy++; }
  }
  p.mat = me.bmat; p.key = S.pkey(p);
  return p;
}

// ================= Waffen-Physik =================
const dir = new THREE.Vector3(), camPos = new THREE.Vector3(), pivot = new THREE.Vector3(), mzv = new THREE.Vector3();
const IMPACT = { terrain: '#9a8a60', obj: '#7a5a34', car: '#ffd76a', player: '#ffffff' };
function aimDir(out) { const p = VP(), y = VY(), cp = Math.cos(p); return out.set(-Math.sin(y) * cp, Math.sin(p), -Math.cos(y) * cp); }
function curSpread(it) {
  const W = S.W[it.w];
  let s = W.spread * (me.ads ? (SNIP.has(it.w) ? 0 : 0.35) : 1) * (me.crouch ? 0.75 : 1) * (me.speed > 1 ? 1.35 : 1) * (me.onGround ? 1 : 1.7);
  if (me.bloom === 0 && me.speed < 1 && me.onGround && W.pellets === 1 && !SNIP.has(it.w)) s *= 0.3; // erster Schuss genau
  return s + me.bloom * (me.ads ? 0.5 : 1);
}
function tally(h, agg) {
  if (h.kind === 'player') { const q = agg.hits.get(h.id) || { n: 0, head: 0 }; q.n++; if (h.head) q.head++; agg.hits.set(h.id, q); }
  else if (h.kind === 'piece') agg.pcs.set(h.key, (agg.pcs.get(h.key) || 0) + 1);
  else if (h.kind === 'car') agg.cars.set(h.id, (agg.cars.get(h.id) || 0) + 1);
  if (h.kind) { const pc = h.kind === 'piece' ? pieces.get(h.key) : null; fx.burst(h.x, h.y, h.z, pc ? MATCOL[pc.mat] : IMPACT[h.kind], h.kind === 'player' ? 5 : 4, 3.2, 0.08, 0.45, 12, true); }
}
function sendHits(agg, w, r) {
  for (const [id, q] of agg.hits) tx({ t: 'hit', id, n: q.n, head: q.head * 2 >= q.n ? 1 : 0, w, r });
  for (const [k, n] of agg.pcs) tx({ t: 'hitpc', k, n, w, r });
  for (const [id, n] of agg.cars) tx({ t: 'hitcar', id, n, w, r });
}
const newAgg = () => ({ hits: new Map(), pcs: new Map(), cars: new Map() });
const bullets = [], nades = [];
function fire(it, now) {
  const W = S.W[it.w];
  me.lastShot = now; it.mag--; hudDirty = true; me.emote = 0;
  const sp = curSpread(it);
  aimDir(dir);
  const o = camPos.clone().addScaledVector(dir, Math.max(0.2, pivot.clone().sub(camPos).dot(dir)));
  const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(dir, up).normalize(), u2 = new THREE.Vector3().crossVectors(right, dir);
  const ch = me.ch; ch.kick = 1; ch.flashT = 0.05; ch.sinceShot = 0;
  ch.g.updateMatrixWorld(true); mzv.set(0, 0.08, MUZZLE[it.w]); ch.gun.localToWorld(mzv);
  const mz = [mzv.x, mzv.y, mzv.z], agg = newAgg(); let end = null;
  if (it.w === 'rpg') {
    const v = [dir.x * 62, dir.y * 62, dir.z * 62], o2 = [o.x + dir.x * 0.8, o.y + dir.y * 0.8, o.z + dir.z * 0.8];
    spawnRocket(o2, v, true); tx({ t: 'nade', k: 'rocket', o: o2.map((q) => +q.toFixed(2)), v: v.map((q) => +q.toFixed(2)) });
    shotSound('rpg', 1); fx.burst(mz[0], mz[1], mz[2], '#cfcfcf', 8, 2, 0.3, 0.8, -2);
    rec.tp += W.rec; shake = Math.max(shake, 0.03); return;
  }
  for (let i = 0; i < W.pellets; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sp;
    const d = dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(u2, Math.sin(a) * r).normalize();
    if (SNIP.has(it.w)) { const bs = it.w === 'sniper' ? 300 : 230; bullets.push({ x: o.x, y: o.y, z: o.z, vx: d.x * bs, vy: d.y * bs, vz: d.z * bs, t: 2.2, w: it.w, r: it.r, first: mz }); end = [o.x + d.x * 220, o.y + d.y * 220, o.z + d.z * 220]; continue; }
    const h = raycast(o.x, o.y, o.z, d.x, d.y, d.z, 500);
    if (!end) end = [h.x, h.y, h.z];
    tally(h, agg);
    if (W.pellets > 1 && i) tracer(mz, [h.x, h.y, h.z], 0, 0.025, 0.07);
  }
  if (!SNIP.has(it.w)) tracer(mz, end);
  shotSound(it.w, 1);
  ejectShell(me.ch, it.w);
  fx.burst(mz[0], mz[1], mz[2], '#cfcfcf', 2, 0.8, 0.12, 0.35, -2);
  tx({ t: 'shot', o: mz, e: end, w: it.w });
  sendHits(agg, it.w, it.r);
  // Rückstoß + Streuungszuwachs
  rec.tp += W.rec * (me.ads ? 0.7 : 1) * (me.crouch ? 0.8 : 1); rec.ty += (Math.random() - 0.5) * W.rec * 0.7;
  me.bloom = Math.min(0.05, me.bloom + W.bloom);
  shake = Math.max(shake, W.rec * 0.25);
}
function updateBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; b.vy -= 9.8 * dt; b.t -= dt;
    const sp = Math.hypot(b.vx, b.vy, b.vz), len = sp * dt, dx = b.vx / sp, dy = b.vy / sp, dz = b.vz / sp;
    const h = raycast(b.x, b.y, b.z, dx, dy, dz, len);
    const a = b.first || [b.x - dx * 14, b.y - dy * 14, b.z - dz * 14]; b.first = null;
    tracer(a, [h.x, h.y, h.z], 0xfff6c8, 0.07, 0.12);
    if (h.kind || b.t <= 0) { if (h.kind) { const agg = newAgg(); tally(h, agg); sendHits(agg, b.w, b.r); } bullets.splice(i, 1); continue; }
    b.x = h.x; b.y = h.y; b.z = h.z;
  }
}
const rockets = [];
function spawnNade(o, v, mine, k) {
  k = k === 'stink' ? 'stink' : 'gren';
  const m = new THREE.Mesh(itemGeo({ k: 'c', c: k }), VM); m.castShadow = true; m.scale.setScalar(0.75); m.position.set(o[0], o[1], o[2]); scene.add(m);
  nades.push({ x: o[0], y: o[1], z: o[2], vx: v[0], vy: v[1], vz: v[2], t: k === 'stink' ? 1.6 : 2.4, mine, mesh: m, rest: false, k });
}
function spawnRocket(o, v, mine) {
  const m = new THREE.Mesh(rocketGeo, VM); m.position.set(o[0], o[1], o[2]); scene.add(m);
  rockets.push({ x: o[0], y: o[1], z: o[2], vx: v[0], vy: v[1], vz: v[2], t: 4, mine, mesh: m });
}
function updateRockets(dt) {
  for (let i = rockets.length - 1; i >= 0; i--) {
    const r = rockets[i]; r.t -= dt; r.vy -= 2.5 * dt;
    const sp = Math.hypot(r.vx, r.vy, r.vz), dx = r.vx / sp, dy = r.vy / sp, dz = r.vz / sp, h = raycast(r.x, r.y, r.z, dx, dy, dz, sp * dt + 0.2, !r.mine);
    if (h.kind || r.t <= 0) {
      scene.remove(r.mesh); rockets.splice(i, 1);
      const x = h.kind ? h.x - dx * 0.3 : r.x, y = h.kind ? h.y - dy * 0.3 : r.y, z = h.kind ? h.z - dz * 0.3 : r.z;
      if (r.mine) { explode(x, y, z, 1.3); tx({ t: 'boom', k: 'rocket', x: +x.toFixed(2), y: +y.toFixed(2), z: +z.toFixed(2) }); }
      continue;
    }
    r.x += r.vx * dt; r.y += r.vy * dt; r.z += r.vz * dt;
    r.mesh.position.set(r.x, r.y, r.z); r.mesh.lookAt(r.x + dx, r.y + dy, r.z + dz);
    fx.burst(r.x - dx * 0.4, r.y - dy * 0.4, r.z - dz * 0.4, '#bdbdbd', 1, 0.6, 0.35, 1.0, -1); if (Math.random() < 0.6) fx.burst(r.x - dx * 0.4, r.y - dy * 0.4, r.z - dz * 0.4, '#ff9a2e', 1, 0.5, 0.12, 0.15, 0);
  }
}
function stepNade(n, dt) {
  if (n.rest) return;
  n.vy -= 20 * dt;
  const sp = Math.hypot(n.vx, n.vy, n.vz); if (sp < 0.01) return;
  const dx = n.vx / sp, dy = n.vy / sp, dz = n.vz / sp, h = raycast(n.x, n.y, n.z, dx, dy, dz, sp * dt + 0.12, true);
  if (h.kind) {
    const nm = hitNormal(h, dx, dy, dz), dot = n.vx * nm[0] + n.vy * nm[1] + n.vz * nm[2];
    n.vx = (n.vx - 2 * dot * nm[0]) * 0.45; n.vy = (n.vy - 2 * dot * nm[1]) * 0.45; n.vz = (n.vz - 2 * dot * nm[2]) * 0.45;
    n.x = h.x + nm[0] * 0.14; n.y = h.y + nm[1] * 0.14; n.z = h.z + nm[2] * 0.14;
    if (Math.hypot(n.vx, n.vy, n.vz) < 1.3 && nm[1] > 0.6) { n.rest = true; n.vx = n.vy = n.vz = 0; }
    return true;
  }
  n.x += n.vx * dt; n.y += n.vy * dt; n.z += n.vz * dt;
}
function updateNades(dt) {
  for (let i = nades.length - 1; i >= 0; i--) {
    const n = nades[i]; n.t -= dt;
    if (stepNade(n, dt) && Math.hypot(n.x - me.x, n.z - me.z) < 40) tone(900, 500, 0.04, 0.06, 'square');
    n.mesh.position.set(n.x, n.y - 0.1, n.z); if (!n.rest) { n.mesh.rotation.x += dt * 9; n.mesh.rotation.z += dt * 6; }
    if (n.t < 0.8 && Math.random() < dt * 14) fx.burst(n.x, n.y + 0.2, n.z, n.k === 'stink' ? '#b5d93a' : '#ff5a4d', 1, 1, 0.08, 0.25, -2);
    if (n.t <= 0) { scene.remove(n.mesh); nades.splice(i, 1); if (n.k === 'stink') { if (n.mine) tx({ t: 'boom', k: 'stink', x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2) }); } else if (n.mine) { explode(n.x, n.y, n.z); tx({ t: 'boom', k: 'gren', x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2) }); } }
  }
}
const arcLine = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(40 * 3), 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, fog: false }));
arcLine.frustumCulled = false; arcLine.visible = false; scene.add(arcLine);
function throwVec() { aimDir(dir); return { o: [me.x + dir.x * 0.5 + Math.cos(me.yaw) * 0.35, me.y + 1.55, me.z + dir.z * 0.5 - Math.sin(me.yaw) * 0.35], v: [dir.x * 19, dir.y * 19 + 3.5, dir.z * 19] }; }
function updateArc() {
  const t = throwVec(), n = { x: t.o[0], y: t.o[1], z: t.o[2], vx: t.v[0], vy: t.v[1], vz: t.v[2], rest: false }, pos = arcLine.geometry.attributes.position; let k = 0;
  for (; k < 40; k++) { pos.setXYZ(k, n.x, n.y, n.z); if (stepNade(n, 0.045)) { k++; pos.setXYZ(Math.min(39, k), n.x, n.y, n.z); break; } }
  arcLine.geometry.setDrawRange(0, Math.min(40, k + 1)); pos.needsUpdate = true; arcLine.visible = true;
}
function actions(dt, now) {
  const it = curItem();
  me.ads = mouseR && !me.build && me.st === 'ground' && !myCar && !me.down && !(revState && revState.by === myId) && !!it && it.k === 'w';
  if (me.reload) {
    me.reload.t -= dt;
    if (me.reload.t <= 0) { if (it && it.k === 'w') { const W = S.W[it.w], n = Math.min(W.mag - it.mag, me.ammo[W.ammo]); it.mag += n; me.ammo[W.ammo] -= n; } me.reload = null; hudDirty = true; }
  }
  if (me.using) {
    me.using.t -= dt;
    if (me.using.t <= 0) { if (it && it.k === 'c') { tx({ t: 'heal', c: it.c }); it.n--; if (it.n <= 0) me.inv[me.slot - 1] = null; tone(400, 900, 0.3, 0.12, 'sine'); fx.burst(me.x, me.y + 1.2, me.z, S.CONS[it.c].col, 14, 2.5, 0.08, 0.8, -3); } me.using = null; hudDirty = true; }
  }
  const u = $('use'), rv = revState ? { t: Math.max(0, 5 - (performance.now() - revState.t0) / 1000), total: 5 } : rbState ? { t: Math.max(0, 5 - (performance.now() - rbState.t0) / 1000), total: 5 } : null, prog = rv || me.using || me.reload;
  if (prog) { u.style.display = 'block'; u.firstChild.style.width = (1 - prog.t / prog.total) * 100 + '%'; $('useL').style.display = 'block'; $('useL').textContent = rv ? (rbState && !revState ? 'Zurückholen …' : revState.by === myId ? 'Wiederbeleben …' : 'Du wirst wiederbelebt …') : me.using ? S.CONS[it.c].n + ' …' : 'Nachladen …'; } else { u.style.display = 'none'; $('useL').style.display = 'none'; }
  if (me.reload) { const el = document.querySelector('#inv .sel .rl'); if (el) el.style.height = (me.reload.t / me.reload.total) * 100 + '%'; }
  if (me.down || (revState && revState.by === myId)) { arcLine.visible = false; return; }
  const gren = !me.build && it && it.k === 'c' && THROW[it.c] && me.st === 'ground' && !myCar && !me.swim;
  if (gren) updateArc(); else arcLine.visible = false;
  if (me.st !== 'ground' || myCar || me.swim || me.mantle) return;
  if (me.build) {
    const p = buildSpot(), gh = ghosts[me.build]; gh.visible = true; placePiece(gh, p);
    const ok = !pieces.has(p.key) && me.mats[me.bmat] >= S.COST;
    ghostMat.color.set(ok ? 0x4db2ff : 0xff5a4d);
    if (mouseL && ok && now - me.lastBuild > 130) { me.lastBuild = now; me.mats[me.bmat] -= S.COST; hudDirty = true; me.emote = 0; tx({ t: 'build', p: { t: p.t, ix: p.ix, iy: p.iy, iz: p.iz, d: p.d, rot: p.rot, mat: p.mat } }); addPieceMesh({ ...p, hp: S.MATS[p.mat].hp }, true); fx.burst(gh.position.x, gh.position.y, gh.position.z, MATCOL[p.mat], 6, 2.5, 0.1, 0.4); }
    return;
  }
  if (TOUCH && it && it.k === 'w' && !mouseL) {
    if (now - autoT > 90) {
      autoT = now; autoFire = false;
      if (!SNIP.has(it.w) || me.ads) { aimDir(dir); const o = camPos.clone().addScaledVector(dir, Math.max(0.2, pivot.clone().sub(camPos).dot(dir))); const h = raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, S.W[it.w].range[1]); autoFire = h.kind === 'player'; }
    }
  } else autoFire = false;
  if (!mouseL && !autoFire) return;
  me.emote = 0;
  if (me.slot === 0) {
    if (now - me.lastSwing < 440) return;
    me.lastSwing = now; noise(0.07, 900, 0.1);
    setTimeout(() => {
      if (!me.alive || me.slot !== 0) return;
      aimDir(dir);
      const h = raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, 4.6);
      if (h.kind) shake = Math.max(shake, 0.012);
      if (h.kind === 'obj') { tx({ t: 'harvest', k: 'o', id: h.id }); tone(220, 120, 0.08, 0.2, 'square'); const o = objs.get(h.id); if (o) { wobbles.push({ o, t: 0.35 }); fx.burst(h.x, h.y, h.z, o.t === 'rock' ? '#9c9c9c' : o.t === 'barrel' ? '#9aa3ad' : '#a87238', 9, 4, 0.1, 0.6, 12, true); } }
      else if (h.kind === 'piece') { tx({ t: 'harvest', k: 'p', key: h.key }); tone(260, 150, 0.08, 0.2, 'square'); }
      else if (h.kind === 'car') { tx({ t: 'harvest', k: 'c', id: h.id }); tone(900, 500, 0.08, 0.15, 'square'); fx.burst(h.x, h.y, h.z, '#ffd76a', 8, 4, 0.07, 0.4); }
      else if (h.kind === 'player') tx({ t: 'harvest', k: 'e', id: h.id });
      else if (h.kind === 'terrain') fx.burst(h.x, h.y, h.z, '#9a8a60', 5, 3, 0.09, 0.4);
    }, 190);
  } else if (it && it.k === 'w') {
    if (me.reload) return;
    if (it.mag <= 0) { startReload(); return; }
    if (now - me.lastShot >= S.W[it.w].rate && me.ch.draw > 0.8) fire(it, now);
  } else if (gren) {
    if (now - me.lastThrow < 900) return;
    me.lastThrow = now; const t = throwVec(); spawnNade(t.o, t.v, true, it.c); tx({ t: 'nade', k: it.c, o: t.o, v: t.v }); me.ch.sinceShot = 0; noise(0.1, 1200, 0.15);
    it.n--; if (it.n <= 0) me.inv[me.slot - 1] = null; hudDirty = true;
  } else if (it && it.k === 'c' && !me.using) {
    const full = it.c === 'med' ? me.hp >= 100 : it.c === 'band' ? me.hp >= 75 : it.c === 'pot' ? me.sh >= 100 : it.c === 'chug' ? me.hp >= 100 && me.sh >= 100 : it.c === 'bush' ? me.bush : me.sh >= 50;
    if (full) { if (now - me.lastBuild > 900) { me.lastBuild = now; banner(it.c === 'bush' ? 'Du trägst schon einen Busch' : it.c === 'chug' ? 'Leben und Schild sind voll' : it.c === 'med' || it.c === 'band' ? 'Leben ist bereits voll genug' : 'Schild ist bereits voll genug', 1.5); } }
    else me.using = { t: S.CONS[it.c].t, total: S.CONS[it.c].t };
  }
}

// ================= Bewegung =================
function wish() {
  let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (joy.id !== null) { f = -joy.y; r = joy.x; joyM = Math.hypot(f, r); if (joyM < 0.18) return [0, 0, 0]; }
  else { const l = Math.hypot(f, r); if (!l) return [0, 0, 0]; f /= l; r /= l; }
  return [-Math.sin(me.yaw) * f + Math.cos(me.yaw) * r, -Math.cos(me.yaw) * f - Math.sin(me.yaw) * r, f];
}
// Klettern: Kante vor dir zwischen 0,6 und 2,5 m Höhe
function tryMantle(wx, wz) {
  if (me.mantle || me.down || me.vy > 4) return false;
  const l = Math.hypot(wx, wz); if (l < 0.3) return false;
  const ux = wx / l, uz = wz / l;
  for (const d of [0.8, 1.3]) {
    const ax = me.x + ux * d, az = me.z + uz * d, top = groundAt(ax, az, me.y + 1.9), dh = top - me.y;
    if (dh < 0.6 || dh > 2.5) continue;
    if (wallAt(ax, az, top + 0.05, me.x, me.z) || ceiling(ax, az, top, top) || objAt(ax, az, top + 0.1, ax + ux * 3, az + uz * 3, 0.2)) continue;
    me.mantle = { t: 0, x0: me.x, y0: me.y, z0: me.z, x1: ax, y1: top + 0.02, z1: az }; me.vy = 0; me.slide = 0; me.swim = false; noise(0.15, 600, 0.12);
    return true;
  }
  return false;
}
function updateMe(dt, now) {
  rec.p += (rec.tp - rec.p) * Math.min(1, dt * 28); rec.y += (rec.ty - rec.y) * Math.min(1, dt * 28);
  const dk = Math.exp(-dt * 5.5); rec.tp *= dk; rec.ty *= dk;
  me.bloom = Math.max(0, me.bloom - dt * (performance.now() - me.lastShot > 250 ? 0.09 : 0.02));
  if (me.emote > 0) me.emote -= dt;
  const jump = jumpEdge; jumpEdge = false;
  if (myCar) { updateCar(dt, now); return; }
  let [wx, wz, fw] = wish();
  if ((revState && revState.by === myId) || rbState) wx = wz = 0;
  if (wx || wz) me.emote = 0;
  if (me.st === 'ship') {
    if (shipS) { me.x = shipS[0]; me.z = shipS[1]; me.y = S.SHIPY - 8; }
    const auto = shipLine && shipLine.dur ? shipLine.dur - 3 : 50;
    if ((jump && gameT > 2.5) || gameT > auto || (!shipS && gameT > 5)) { me.st = 'dive'; keys.Space = false; banner('', 0.01); }
    return;
  }
  if (me.st === 'dive' || me.st === 'glide') {
    const g = groundAt(me.x, me.z, me.y);
    if (me.st === 'dive' && (me.y - g < 55 || jump)) { me.st = 'glide'; noise(0.3, 900, 0.2); }
    const hs = me.st === 'dive' ? 24 : 15, vs = me.st === 'dive' ? 32 + (me.pitch < -0.5 ? 18 : 0) : 6.5;
    const nx = me.x + wx * hs * dt, nz = me.z + wz * hs * dt;
    if (nx * nx + nz * nz < (S.R + 60) * (S.R + 60)) { me.x = nx; me.z = nz; }
    me.y -= vs * dt; me.speed = 0;
    const g2 = Math.max(groundAt(me.x, me.z, me.y + 1), S.height(me.x, me.z) < -1.15 ? -1.05 : -1e9);
    if (me.y <= g2) { me.y = g2; me.st = 'ground'; me.vy = 0; me.onGround = true; me.swim = S.height(me.x, me.z) < -1.15 && g2 === -1.05; me.ch.land = 1; fx.burst(me.x, me.y + 0.1, me.z, me.swim ? '#dff2ff' : '#b9a47a', 10, 2.5, 0.15, 0.5, 2); }
    return;
  }
  if (me.mantle) {
    const m = me.mantle; m.t += dt / 0.3; const k = Math.min(1, m.t), ky = Math.min(1, k * 1.7), kx = Math.max(0, (k - 0.3) / 0.7);
    me.x = lerp(m.x0, m.x1, kx); me.z = lerp(m.z0, m.z1, kx); me.y = lerp(m.y0, m.y1, ky); me.speed = 3;
    if (k >= 1) { me.mantle = null; me.onGround = true; me.vy = 0; }
    return;
  }
  me.sprint = !!(wx || wz) && fw > 0.3 && !me.ads && !me.crouch && !me.using && !me.down && !me.swim && (joy.id !== null ? joyM > 0.62 : !keys.ShiftLeft);
  let sp = me.down ? 1.7 : me.swim ? (me.sprint ? 4.6 : 3.4) : me.crouch ? 3 : me.sprint ? 7.6 : 5.6;
  if (me.ads) sp *= 0.6; if (me.using) sp *= 0.5;
  if (!me.swim && S.height(me.x, me.z) < -0.6) sp *= 0.6;
  let vx = wx * sp, vz = wz * sp;
  if (me.slide > 0) {
    me.slide -= dt; const k = 0.35 + 0.65 * Math.max(0, me.slide / 0.95);
    vx = me.slideV[0] * k + wx * 1.5; vz = me.slideV[1] * k + wz * 1.5;
    if (!me.crouch || !me.onGround && me.vy < -3) me.slide = 0;
    if (Math.random() < dt * 25) fx.burst(me.x, me.y + 0.1, me.z, '#b9a47a', 1, 1.2, 0.18, 0.45, 2);
  }
  me.vx = vx; me.vz = vz;
  const ox = me.x, oz = me.z;
  const steps = Math.max(1, Math.ceil(dt / 0.016)), h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = me.x + (vx + me.kx) * h; if (!blocked(nx, me.z, me.y, me.x, me.z)) me.x = nx; else { me.kx = 0; if ((keys.Space || !me.onGround || me.swim) && tryMantle(wx, wz)) return; }
    const nz = me.z + (vz + me.kz) * h; if (!blocked(me.x, nz, me.y, me.x, me.z)) me.z = nz; else { me.kz = 0; if ((keys.Space || !me.onGround || me.swim) && tryMantle(wx, wz)) return; }
    if (keys.Space && me.onGround && !me.down) { me.vy = me.swim ? 5.5 : 7.6; me.onGround = false; me.emote = 0; me.slide = 0; if (me.swim) fx.burst(me.x, me.y + 0.9, me.z, '#dff2ff', 6, 2, 0.12, 0.4, 6); }
    me.vy -= 22 * h;
    let ny = me.y + me.vy * h;
    if (me.vy > 0 && ceiling(me.x, me.z, me.y, ny)) { me.vy = 0; ny = me.y; }
    const g = groundAt(me.x, me.z, me.y), wtr = S.height(me.x, me.z) < -1.15 ? -1.05 : -1e9, floor = Math.max(g, wtr), wet = wtr > g;
    if (ny <= floor || (me.onGround && me.vy <= 0 && ny - floor < 0.4)) {
      if (!wet) {
        if (me.vy < -19) tx({ t: 'fall', d: Math.round((-me.vy - 19) * 7) });
        if (me.vy < -8) { fx.burst(me.x, floor + 0.1, me.z, '#b9a47a', 6, 2, 0.12, 0.4, 2); me.ch.land = clamp(-me.vy / 16, 0.4, 1); shake = Math.max(shake, 0.012); }
      } else if (!me.swim && me.vy < -4) { fx.burst(me.x, floor + 1, me.z, '#dff2ff', 22, 4, 0.16, 0.7, 9); noise(0.4, 900, 0.2); }
      ny = floor; me.vy = 0; me.onGround = true; me.swim = wet;
    } else { me.onGround = false; me.swim = false; }
    me.y = ny;
  }
  // Gleiter neu öffnen, wenn du tief fällst (kein Fallschaden)
  if (jump && !me.onGround && !me.down && me.vy < -5 && me.y - groundAt(me.x, me.z, me.y) > 10) { me.st = 'glide'; me.slide = 0; noise(0.3, 900, 0.2); }
  if (me.swim && me.crouch) me.crouch = false;
  const kd = Math.exp(-dt * (me.onGround ? 6 : 1.5)); me.kx *= kd; me.kz *= kd;
  me.speed = Math.hypot(me.x - ox, me.z - oz) / dt;
}
function updateCamera(dt) {
  const f = focus(), spec = f !== me, drive = !spec && myCar;
  const yaw = spec ? f.yaw : VY(), pitch = spec ? clamp(f.pitch || 0, -0.6, 0.6) - 0.15 : VP();
  const it = curItem(), scoped = !spec && me.ads && it && it.w === 'sniper';
  const cr = !spec && me.crouch ? 0.35 : 0;
  const cp = Math.cos(pitch); dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  const side = scoped || drive ? 0 : me.ads && !spec ? 0.72 : 0.98;
  pivot.set(f.x + Math.cos(yaw) * side, f.y + (drive ? 2.3 : (spec ? f.fl & 512 : me.down) ? 0.95 : me.ads && !spec ? 1.68 : 1.8) - cr, f.z - Math.sin(yaw) * side);
  let dist = scoped ? 0 : drive ? 8.5 : me.ads && !spec ? 2.1 : me.st === 'ship' && !spec ? 26 : (f.fl & 6) || (!spec && me.st !== 'ground') ? 7 : (f.fl & 16) ? 8 : !spec && me.emote > 0 ? 5.5 : 3.5;
  if (dist > 0 && !(me.st === 'ship' && !spec)) {
    const h = raycast(pivot.x, pivot.y, pivot.z, -dir.x, -dir.y, -dir.z, dist + 0.3, true);
    if (h.kind && h.kind !== 'obj' && h.kind !== 'car') dist = Math.max(0.4, h.dist - 0.3);
  }
  camPos.copy(pivot).addScaledVector(dir, -dist);
  camera.position.copy(camPos); camera.rotation.set(pitch + (Math.random() - 0.5) * shake, yaw + (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.6);
  shake *= Math.exp(-dt * 9);
  if (window.__camHook) window.__camHook(camera, f);
  const fov = scoped ? 14 : me.ads && !spec ? (it && it.w === 'hunt' ? 38 : 48) : drive ? 70 + Math.min(14, me.speed * 0.6) : me.sprint && me.speed > 6 ? 76 : 70;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 14)); camera.updateProjectionMatrix(); lastGap = -1; }
  $('scope').style.display = scoped ? 'block' : 'none';
  if (me.ch && me.alive) me.ch.g.visible = me.st !== 'ship' && !scoped;
  sun.position.set(f.x + 70, f.y + 120, f.z + 45); sun.target.position.set(f.x, f.y, f.z);
  if (spec || !me.alive || me.down) updateCross(0, 'none');
  else if (scoped) updateCross(0, 'none');
  else if (it && it.k === 'w' && !me.build && !myCar) updateCross(curSpread(it), SNIP.has(it.w) && !me.ads ? 'wide' : 'x');
  else updateCross(0, 'dot');
}
function sitPose(o, c) {
  const s = CARSEAT[c.v], cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  o.x = c.x - cs * s[0] - sn * s[2]; o.z = c.z + sn * s[0] - cs * s[2];
  o.y = c.mesh.position.y + s[1] - 0.37; o.sit = true; o.carYaw = c.yaw;
}

function setShadow(ch, on) { if (ch.shadow === on) return; ch.shadow = on; ch.g.traverse((o) => { if (o.isMesh && o !== ch.flash) o.castShadow = on; }); }
function step(dx, dz, d) {
  if (!AC || !noiseBuf) return; const vol = clamp(1 - d / 30, 0, 1) * (d > 20 ? 0.12 : 0.16); if (vol < 0.01) return;
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain(), p = AC.createStereoPanner ? AC.createStereoPanner() : null;
  s.buffer = noiseBuf; f.type = 'bandpass'; f.frequency.value = 330 + Math.random() * 180; f.Q.value = 1.3;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  s.connect(f); f.connect(g);
  if (p && d > 1) { const yaw = camera.rotation.y; p.pan.value = clamp((dx * Math.cos(yaw) - dz * Math.sin(yaw)) / d, -1, 1) * 0.85; g.connect(p); p.connect(AC.destination); } else g.connect(AC.destination);
  s.start(t, Math.random() * 0.5); s.stop(t + 0.1);
}
function renderTeam() {
  const el = $('team');
  if (matchMode !== 'duo' || !mateId || phase === 'lobby') { el.style.display = 'none'; return; }
  const e = ents.get(mateId), dead = deadSet.has(mateId) || (e && !e.alive), down = e && e.alive && (e.fl & 512);
  const hp = e && !dead ? e.hp : 0, sh = e && !dead && !down ? e.sh : 0, d = e && !dead && me.alive ? Math.round(Math.hypot(e.x - me.x, e.z - me.z)) + ' m' : '';
  el.style.display = 'block'; el.className = dead ? 'dead' : down ? 'down' : '';
  el.innerHTML = '<div class="tn"><span>' + esc(nameOf(mateId)) + '</span><small>' + (dead ? 'eliminiert' : down ? 'am Boden' : d) + '</small></div><div class="tb2"><i style="width:' + sh + '%"></i></div><div class="tb1"><i style="width:' + Math.max(0, hp) + '%"></i></div>';
}
function updateTag() {
  const el = $('tag'), e = mateId && ents.get(mateId);
  if (matchMode !== 'duo' || !e || !e.alive || (e.fl & 1) || T - e.lastSeen > 2.5 || focus() === e) { el.style.display = 'none'; return; }
  v3.set(e.x, e.y + (e.fl & 512 ? 1.1 : 2.3), e.z).project(camera);
  if (v3.z > 1) { el.style.display = 'none'; return; }
  const x = clamp((v3.x + 1) / 2 * innerWidth, 40, innerWidth - 40), y = clamp((1 - v3.y) / 2 * innerHeight, 30, innerHeight - 30);
  el.style.display = 'block'; el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
  const txt = (e.fl & 512 ? '⬇ ' : '') + nameOf(mateId) + ' · ' + Math.round(Math.hypot(e.x - me.x, e.z - me.z)) + ' m';
  if (el.textContent !== txt) el.textContent = txt;
  el.classList.toggle('down', !!(e.fl & 512));
}

// ================= Hauptschleife =================
let lodAcc = 0, lastT = performance.now(), sendAcc = 0, scanAcc = 0, mapAcc = 0, scoreAcc = 0;
const po = {};
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (nowMs - lastT) / 1000); lastT = nowMs; T += dt;
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = 0; }
  if (gainT > 0) { gainT -= dt; if (gainT <= 0) $('gain').style.opacity = 0; }
  if (elimT > 0) { elimT -= dt; if (elimT <= 0) $('elim').style.opacity = 0; }
  if (hurtT > 0) { hurtT -= dt; if (hurtT <= 0) $('hurtdir').style.opacity = 0; }
  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.t -= dt; t.m.material.opacity = Math.max(0, t.t / t.l); if (t.t <= 0) { scene.remove(t.m); t.m.material.dispose(); tracers.splice(i, 1); } }
  for (let i = booms.length - 1; i >= 0; i--) { const b = booms[i]; b.t += dt; const k = b.t / 0.32; b.f.scale.setScalar((0.6 + k * 5.5) * b.s); b.f.material.opacity = Math.max(0, 0.9 * (1 - k)); b.r.scale.setScalar((1 + k * 8) * b.s); b.r.material.opacity = Math.max(0, 0.7 * (1 - k * 0.8)); if (k >= 1.25) { scene.remove(b.f, b.r); b.f.material.dispose(); b.r.material.dispose(); booms.splice(i, 1); } }
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; if (!p.p.grp) { pops.splice(i, 1); continue; } if (p.hit) { p.t -= dt * 4; setPM(p.p, 1 + Math.sin(Math.max(0, p.t) * 12) * 0.03); if (p.t <= 0) { setPM(p.p, 1); pops.splice(i, 1); } } else { p.t += dt * p.rate; const k = Math.min(1, p.t); setPM(p.p, 0.6 + 0.4 * (k + Math.sin(k * Math.PI) * 0.12)); if (k >= 1) { setPM(p.p, 1); pops.splice(i, 1); } } }
  for (let i = wobbles.length - 1; i >= 0; i--) { const w = wobbles[i]; w.t -= dt; if (w.o.dead) { wobbles.splice(i, 1); continue; } setInst(w.o, 1, w.t > 0 ? Math.sin(w.t * 40) * 0.06 * (w.t / 0.35) : 0); if (w.t <= 0) wobbles.splice(i, 1); }
  const cl = clouds.userData.list;
  for (let i = 0; i < cl.length; i++) { const c = cl[i]; c.x += dt * 2.2; if (c.x > 1300) c.x = -1300; dummy.position.set(c.x, c.y, c.z); dummy.rotation.set(0, c.r, 0); dummy.scale.set(c.s, c.s * 0.8, c.s); dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix); }
  clouds.instanceMatrix.needsUpdate = true;
  water.position.y = Math.sin(T * 0.7) * 0.07; water.material.normalMap.offset.set(T * 0.004, T * 0.0025); stormTex.offset.x = T * 0.02; stormTex.offset.y = -T * 0.05;
  fx.update(dt);
  if (phase === 'menu' || phase === 'lobby') {
    const py = S.height(PV.x, PV.z), fxv = -Math.sin(PV.yaw), fzv = -Math.cos(PV.yaw), rx = Math.cos(PV.yaw), rz = -Math.sin(PV.yaw), side = phase === 'lobby' ? 0 : innerWidth / innerHeight > 1.3 ? 1.45 : 0.3;
    const cxp = PV.x + fxv * 4.4 + rx * side, czp = PV.z + fzv * 4.4 + rz * side;
    camera.position.set(cxp, Math.max(py, S.height(cxp, czp)) + 1.55, czp); camera.lookAt(PV.x + rx * side, py + 1.05, PV.z + rz * side); camera.rotation.order = 'YXZ';
    if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = 55; camera.updateProjectionMatrix(); }
    Object.assign(pvo, { x: PV.x, y: py, z: PV.z, yaw: PV.yaw + 0.55 + Math.sin(T * 0.6) * 0.25, emote: phase === 'lobby' && Math.sin(T * 0.25) > 0.75 });
    poseChar(PV.ch, pvo, dt);
    sun.position.set(PV.x + 70, py + 120, PV.z + 45); sun.target.position.set(PV.x, py, PV.z); sky.position.copy(camera.position);
    draw(); return;
  }
  for (const k in ghosts) ghosts[k].visible = false;
  updateBullets(dt); updateNades(dt); updateRockets(dt); updateMags(dt);
  { const cp = camera.position; if (Math.abs(cp.x - objC.x) + Math.abs(cp.z - objC.z) > 40 && objList.length) relayoutObjs(cp.x, cp.z); const gx = Math.floor(cp.x / GR.cell), gz = Math.floor(cp.z / GR.cell); if ((gx !== GR.cx || gz !== GR.cz) && cp.y < 120) regrass(gx, gz); }
  for (let i = gases.length - 1; i >= 0; i--) { const g = gases[i]; if (T > g.until) { gases.splice(i, 1); continue; } if (Math.random() < dt * 22) { const a = Math.random() * 6.28, r = Math.random() * 4.5; fx.burst(g.x + Math.cos(a) * r, g.y + 0.4, g.z + Math.sin(a) * r, '#9fc23a', 1, 0.8, 1.1, 1.8, -0.5); } }
  if (me.alive) {
    updateMe(dt, nowMs);
    updateCamera(dt);
    if (locked) actions(dt, nowMs); else { $('use').style.display = 'none'; arcLine.visible = false; }
    me.swing = clamp((nowMs - me.lastSwing) / 440, 0, 1);
    const reviving = !!(revState && revState.by === myId) || !!rbState, it = curItem(), w = me.down || reviving || me.swim ? 'none' : me.build ? 'build' : me.slot === 0 ? 'pick' : it ? (it.k === 'w' ? it.w : it.c) : 'none';
    const emote = me.emote > 0 && me.st === 'ground' && !myCar && !me.down;
    const fl = (me.st === 'ship' ? 1 : me.st === 'dive' ? 2 : me.st === 'glide' ? 4 : 0) | (me.swim ? 2048 : 0) | ((me.crouch && !myCar && !me.down && !me.swim) || reviving || me.slide > 0 ? 8 : 0) | (myCar ? 16 : 0) | (me.reload ? 32 : 0) | (me.ads ? 64 : 0) | (me.swing < 1 && me.slot === 0 && !me.down ? 128 : 0) | (emote ? 256 : 0) | (me.down ? 512 : 0);
    me.fl = fl;
    Object.assign(po, { x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: VP(), fl: fl | (me.bush ? 1024 : 0), w, wr: it && it.k === 'w' ? it.r : 0, speed: myCar ? 0 : me.speed, swing: me.swing < 1 ? me.swing : 0, jump: (!me.onGround || !!me.mantle) && me.st === 'ground' && !me.swim, using: !!me.using, rl: me.reload ? 1 - me.reload.t / me.reload.total : -1, ads: me.ads, sit: false, emote, rev: reviving });
    const car = myCar && cars.get(myCar); if (car) sitPose(po, car);
    poseChar(me.ch, po, dt);
    if (me.st === 'ground' && me.onGround && !myCar && !me.crouch && !me.swim && me.speed > 2.4) { me.stepA += dt * me.speed / 2.4; if (me.stepA > 1) { me.stepA = 0; step(0, 0, 24); } }
    sendAcc += dt;
    if (sendAcc > 0.066) { sendAcc = 0; tx({ t: 'pos', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +VP().toFixed(3), fl, w, wr: po.wr, cy: car ? +car.yaw.toFixed(3) : undefined }); }
    scanAcc += dt;
    if (scanAcc > 0.12) {
      scanAcc = 0; if (me.st === 'ground') scanNear(); else $('prompt').style.display = 'none';
      const poi = me.st === 'ground' ? S.poiAt(me.x, me.z) : null; if (poi !== curPoi) { curPoi = poi; if (poi && bannerT <= 0) banner(poi.n, 2.2); }
    }
  } else {
    updateCamera(dt); $('prompt').style.display = 'none'; $('use').style.display = 'none';
    if (me.ch) { if (me.deadT > 0) { me.deadT -= dt; po.speed = 0; po.emote = false; poseChar(me.ch, po, dt); deathPose(me.ch, me.deadT); } else me.ch.g.visible = phase === 'end' && me.emote > 50; if (me.ch.g.visible && me.deadT <= 0) { po.emote = true; po.fl = 0; poseChar(me.ch, po, dt); } }
    if (!ents.get(specId) || !ents.get(specId).alive) { const mt = ents.get(mateId), a = mt && mt.alive ? mt : [...ents.values()].find((e) => e.alive && T - e.lastSeen < 2); if (a) specId = a.id; }
    if (specId !== lastSpec) { lastSpec = specId; tx({ t: 'spec', id: specId }); }
  }
  sky.position.copy(camera.position);
  $('lock').style.display = me.alive && !locked && phase === 'game' ? 'block' : 'none';
  if (TOUCH) { const ig = me.alive && (phase === 'game' || phase === 'end'); if (ig !== document.body.classList.contains('ingame')) { document.body.classList.toggle('ingame', ig); if (!ig) { joy.id = null; joy.x = joy.y = 0; $('stick').style.display = 'none'; } } }
  const k = Math.min(1, dt * 13);
  for (const c of cars.values()) {
    if (c.id === myCar) continue;
    const d = Math.hypot(c.tx - c.x, c.tz - c.z);
    if (d < 0.01 && Math.abs(c.tyaw - c.yaw) < 0.01) continue;
    if (d > 30) { c.x = c.tx; c.z = c.tz; c.y = c.ty; c.yaw = c.tyaw; }
    else { c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k; let dy = c.tyaw - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); c.yaw += dy * k; }
    for (const w of c.wheels) w.rotation.x += d * 1.5;
    c.air = c.y > S.height(c.x, c.z) + 0.3; placeCar(c, k);
  }
  const ccx = camera.position.x, ccz = camera.position.z, LV = TOUCH ? 125 : 175;
  for (const e of ents.values()) {
    if (!e.alive) {
      if (e.deadT > 0) { e.deadT -= dt; e.speed = 0; e.emote = false; e.rev = false; poseChar(e.ch, e, dt); deathPose(e.ch, e.deadT); } else e.ch.g.visible = false;
      continue;
    }
    const stale = T - e.lastSeen > 2.5, dc = Math.hypot(e.tx - ccx, e.tz - ccz);
    if (stale || (e.fl & 1) || dc > LV) { e.ch.g.visible = false; e.x = e.tx; e.y = e.ty; e.z = e.tz; e.yaw = e.tyaw; continue; }
    e.ch.g.visible = true; setShadow(e.ch, dc < 45);
    const px = e.x, pz = e.z, py = e.y;
    if (Math.hypot(e.tx - e.x, e.tz - e.z) > 25) { e.x = e.tx; e.y = e.ty; e.z = e.tz; }
    e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k;
    let dy = e.tyaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * k;
    e.speed = lerp(e.speed, Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 0.001), 0.2);
    e.rlT = e.fl & 32 ? e.rlT + dt : 0; e.swT += dt;
    e.rl = (e.fl & 32) && S.W[e.w] ? Math.min(0.99, e.rlT / S.W[e.w].rel) : -1;
    e.ads = !!(e.fl & 64); e.swing = e.swT < 0.44 ? e.swT / 0.44 : 0; e.emote = !!(e.fl & 256); e.sit = false; e.rev = revivers.has(e.id);
    e.jump = !(e.fl & 6) && e.y - S.height(e.x, e.z) > 0.35 && Math.abs(e.y - py) / Math.max(dt, 0.001) > 1.5;
    if (dc < 30 && !(e.fl & 2078) && e.speed > 2.4) { e.stepA += dt * e.speed / 2.4; if (e.stepA > 1) { e.stepA = 0; step(e.x - ccx, e.z - ccz, dc); } }
    if (e.fl & 16) { let car = null; for (const c of cars.values()) if (c.drv === e.id) { car = c; break; } if (car) { const sx = e.x, sy = e.y, sz = e.z; sitPose(e, car); poseChar(e.ch, e, dt); e.x = sx; e.y = sy; e.z = sz; continue; } }
    e.pdt += dt;
    if (dc > 70 && (e.lod = (e.lod + 1) % 3)) { e.ch.g.position.set(e.x, e.y + (e.fl & 512 ? 0.3 : 0), e.z); continue; }
    poseChar(e.ch, e, e.pdt); e.pdt = 0;
  }
  updateTag();
  lodAcc += dt;
  if (lodAcc > 0.25) {
    lodAcc = 0; const cx = camera.position.x, cz = camera.position.z;
    for (const l of loot.values()) l.mesh.visible = Math.abs(l.x - cx) < 75 && Math.abs(l.z - cz) < 75;
    for (const c of chests.values()) c.mesh.visible = c.k === 'd' || (Math.abs(c.x - cx) < 150 && Math.abs(c.z - cz) < 150);
    for (const c of cars.values()) c.mesh.visible = c.drv || (Math.abs(c.x - cx) < 320 && Math.abs(c.z - cz) < 320);
  }
  for (const cd of cards.values()) { cd.mesh.rotation.y += dt * 2; cd.mesh.position.y = cd.y + 0.9 + Math.sin(T * 3) * 0.12; if (Math.random() < dt * 6) fx.burst(cd.x, cd.y + 0.9, cd.z, '#59b7ff', 1, 0.6, 0.1, 0.6, -1); }
  for (const c of chests.values()) if (c.k === 'd' && c.bal) {
    const left = Math.max(0, c.land - gameT); c.mesh.position.y = c.y + left * 6; c.mesh.rotation.y += dt * 0.3;
    if (left <= 0 && c.bal.visible) { c.bal.position.y += dt * 9; if (c.bal.position.y > 60) c.bal.visible = false; }
  }
  for (const l of loot.values()) {
    if (!l.mesh.visible && l.pop === undefined) continue;
    l.spin.rotation.y += dt * 1.8; l.spin.position.y = (l.i.k === 'w' ? 0.75 : 0.3) + Math.sin(T * 2.2 + l.ph) * 0.08;
    if (l.pop !== undefined) { l.pop += dt * 2.4; const q = Math.min(1, l.pop); l.mesh.position.set(lerp(l.from[0], l.x, q), lerp(l.from[1], l.y, q) + Math.sin(q * Math.PI) * 1.5, lerp(l.from[2], l.z, q)); if (q >= 1) { delete l.pop; fx.burst(l.x, l.y + 0.1, l.z, itemColor(l.i), 5, 1.5, 0.08, 0.35, 3); } }
  }
  for (const c of chests.values()) if (c.anim !== undefined) { c.anim = Math.min(1, c.anim + dt * 3.5); const q = c.anim; c.lid.rotation.x = -1.25 * (q + Math.sin(q * Math.PI) * 0.25); if (q >= 1) delete c.anim; }
  if (stormS) {
    stormMesh.visible = stormS[2] < S.R + 200; stormMesh.position.set(stormS[0], 200, stormS[1]); stormMesh.scale.set(Math.max(0.5, stormS[2]), 1, Math.max(0.5, stormS[2]));
    const f = focus(); $('tint').style.opacity = Math.hypot(f.x - stormS[0], f.z - stormS[1]) > stormS[2] ? 1 : 0;
  }
  shipMesh.visible = !!shipS;
  if (shipS) { shipMesh.position.set(shipS[0], S.SHIPY, shipS[1]); shipMesh.userData.prop.rotation.z += dt * 25; if (shipMesh.userData.px !== undefined) { const dx = shipS[0] - shipMesh.userData.px, dz = shipS[1] - shipMesh.userData.pz; if (dx || dz) shipMesh.rotation.y = Math.atan2(-dx, -dz); } shipMesh.userData.px = shipS[0]; shipMesh.userData.pz = shipS[1]; }
  if (hudDirty) renderHud();
  mapAcc += dt;
  if (mapAcc > 0.1) {
    mapAcc = 0; const f = focus();
    drawMap($('mini'), f.x, f.z, 260);
    if (!TOUCH) drawCompass(f);
    if ($('bigmap').style.display === 'block') drawMap($('bigmap'), 0, 0, 2 * E, true);
    $('info').innerHTML = '<span>👥 ' + aliveN + '</span>' + (matchMode === 'duo' ? '<span>🤝 ' + teamsN + '</span>' : '') + '<span>☠ ' + me.kills + '</span>';
    renderTeam();
    if (stormS) {
      const st = S.STORM[stormS[8]], tot = stormS[7] ? st.shrink : st.wait;
      $('stormTxt').textContent = stormS[9] ? 'Sturm geschlossen' : (stormS[7] ? 'Sturm schrumpft ' : 'Sturm in ') + fmtT(stormS[6]);
      $('stormBar').firstChild.style.width = (stormS[9] ? 100 : clamp(1 - stormS[6] / tot, 0, 1) * 100) + '%';
      const dz = Math.hypot(f.x - stormS[3], f.z - stormS[4]) - stormS[5];
      $('zone').textContent = dz > 0 ? '→ ' + Math.round(dz) + ' m' : '✓ sicher'; $('zone').style.color = dz > 0 ? '#ffb347' : '#7df07a';
    }
    const sp = $('spec');
    if (me.alive && me.st === 'ship') { sp.style.display = 'block'; sp.innerHTML = (gameT < 2.5 ? 'Gleich geht es los …' : '<b>' + (TOUCH ? 'SPRUNG' : 'LEERTASTE') + '</b> zum Abspringen') + ' · automatisch in ' + Math.max(0, Math.ceil((shipLine && shipLine.dur ? shipLine.dur - 3 : 50) - gameT)) + ' s'; }
    else if (me.alive && me.card && !rbState) { sp.style.display = 'block'; sp.innerHTML = '<b style="color:#59b7ff">REBOOT-KARTE</b> · bring sie zu einem Funkmast (blau auf der Karte)'; }
    else if (me.alive && me.down) { sp.style.display = 'block'; sp.innerHTML = '<b style="color:#ff5a4d">NIEDERGESCHLAGEN</b> · ' + (revState ? 'du wirst wiederbelebt' : 'kriech zu ' + esc(nameOf(mateId))); }
    else if (!me.alive && ents.get(specId) && ents.get(specId).alive) { sp.style.display = 'block'; sp.innerHTML = 'Du beobachtest <b>' + esc(nameOf(specId)) + '</b>'; }
    else sp.style.display = 'none';
    scoreAcc += 1; if (scoreAcc > 5 && $('score').style.display === 'block') { scoreAcc = 0; renderScore(); }
  }
  draw();
}
requestAnimationFrame(frame);
window.__dbg = { info: () => ({ ...renderer.info.render, geo: renderer.info.memory.geometries }), me, ents, pieces, cards, get vans() { return vans; }, editWall, relayoutObjs, inst: () => inst, PGR, loot, chests, cars, objs, nades, keys, tx, S, rec, get phase() { return phase; }, get myCar() { return myCar; }, set locked(v) { locked = v; }, setMouse(l, r) { mouseL = l; mouseR = r; }, setSlot, interact, onMsg, get myId() { return myId; }, get mateId() { return mateId; }, get revState() { return revState; } };
