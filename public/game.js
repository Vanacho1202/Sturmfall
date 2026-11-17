import * as THREE from './lib/three.module.js';
import { VM, pickaxeGeo, weaponGeo, weaponModel, MUZZLE, RARMAT, BPGEO, itemGeo, chestModel, makeChar as buildChar, disposeChar, carModel, CARSEAT, natureGeos, houseDeco, streakGeo, makeSky, makeClouds, Particles, pieceMaterials, stormTexture } from './models.js';
const S = window.S, G = S.G, H = S.H, HP = Math.PI / 2;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TOUCH = /[?&]touch=1/.test(location.search) || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
if (TOUCH) document.body.classList.add('touch');
let SENS = 1, T = 0, shake = 0;

// ================= Renderer / Szene =================
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb4d6f5, 150, 640);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3000);
camera.rotation.order = 'YXZ';
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5d6b3f, 1.15));
const sun = new THREE.DirectionalLight(0xfff1d0, 2.0);
sun.castShadow = true; sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 320 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);
const sky = makeSky(new THREE.Vector3(70, 120, 45).normalize()); scene.add(sky);
const clouds = makeClouds(26); scene.add(clouds);
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
{
  const tg = new THREE.PlaneGeometry(560, 560, 200, 200); tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) { const x = pos.getX(i), z = pos.getZ(i), h = S.height(x, z); pos.setY(i, h); col.set(groundColor(x, z, h), i * 3); }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true; scene.add(terrain);
  water = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000), new THREE.MeshLambertMaterial({ color: 0x2a86cf, transparent: true, opacity: 0.8 }));
  water.rotation.x = -Math.PI / 2; scene.add(water);
}
// ---- Deko
const NG = natureGeos();
{
  let seed = 1337; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const c = new THREE.Color();
  const scatter = (geo, n, smin, smax, colFn) => {
    const im = new THREE.InstancedMesh(geo, VM, n); let k = 0;
    for (let i = 0; i < n * 3 && k < n; i++) {
      const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 232, x = Math.cos(a) * r, z = Math.sin(a) * r, h = S.height(x, z);
      if (h < 1 || h > 21 || S.poiAt(x, z, 1) || S.roadDist(x, z) < 4) continue;
      dummy.position.set(x, h - 0.03, z); dummy.rotation.set(0, rnd() * 6.28, 0); dummy.scale.setScalar(smin + rnd() * (smax - smin)); dummy.updateMatrix();
      im.setMatrixAt(k, dummy.matrix); im.setColorAt(k, colFn(c, rnd)); k++;
    }
    im.count = k; im.receiveShadow = true; scene.add(im);
  };
  scatter(NG.grass, TOUCH ? 700 : 1700, 0.8, 1.7, (c2, r) => c2.setRGB(0.85 + r() * 0.3, 0.9 + r() * 0.2, 0.8 + r() * 0.3));
  scatter(NG.bush, 220, 0.7, 1.5, (c2, r) => c2.setRGB(0.85 + r() * 0.25, 0.9 + r() * 0.2, 0.85 + r() * 0.2));
  scatter(NG.flower, TOUCH ? 200 : 450, 0.8, 1.4, (c2, r) => c2.setHSL(r(), 0.9, 0.72));
}
const pieceMat = pieceMaterials();
const MATCOL = { wood: '#b9824a', stone: '#9c9c9c', metal: '#6d8296' };
const RL = Math.hypot(G, H);
const pieceGeo = { w: new THREE.BoxGeometry(G, H, 0.24), f: new THREE.BoxGeometry(G, 0.24, G), r: new THREE.BoxGeometry(G, 0.2, RL) };
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
  for (const w in S.W) for (let q = 0; q < 5; q++) IC[w + q] = shot(weaponModel(w, q), 288, 144, side);
  IC.pick = shot(new THREE.Mesh(pickaxeGeo(), VM), 288, 144, new THREE.Vector3(-1, 0.25, -0.2).normalize());
  for (const c in S.CONS) IC[c] = shot(new THREE.Mesh(itemGeo({ k: 'c', c }), VM), 144, 144, iso);
  for (const m in S.MATS) IC[m] = shot(new THREE.Mesh(itemGeo({ k: 'm', m }), VM), 96, 96, iso);
  for (const k of ['w', 'f', 'r']) { const m = new THREE.Mesh(pieceGeo[k], pieceMat.wood[0]); if (k === 'r') m.rotation.x = -Math.atan2(H, G); IC['b' + k] = shot(m, 128, 96, k === 'r' ? new THREE.Vector3(-0.9, 0.6, -1).normalize() : iso); }
  r.dispose(); if (r.forceContextLoss) r.forceContextLoss();
}
try { renderIcons(); } catch (e) { console.warn(e); }
const pic = (k, alt) => (IC[k] ? '<img draggable="false" src="' + IC[k] + '">' : alt || '');
function placePiece(m, p) {
  m.rotation.set(0, 0, 0);
  if (p.t === 'w') { if (p.d === 0) m.position.set((p.ix + 0.5) * G, (p.iy + 0.5) * H, p.iz * G); else { m.position.set(p.ix * G, (p.iy + 0.5) * H, (p.iz + 0.5) * G); m.rotation.y = Math.PI / 2; } }
  else if (p.t === 'f') m.position.set((p.ix + 0.5) * G, p.iy * H, (p.iz + 0.5) * G);
  else { m.position.set((p.ix + 0.5) * G, (p.iy + 0.5) * H, (p.iz + 0.5) * G); m.rotation.order = 'YXZ'; m.rotation.y = p.rot * Math.PI / 2; m.rotation.x = -Math.atan2(H, G); }
}

// ================= Welt =================
const worldGroup = new THREE.Group(); scene.add(worldGroup);
const pieces = new Map(), loot = new Map(), chests = new Map(), objs = new Map(), cars = new Map();
let objList = [], objGrid = new Map(), inst = {}, pops = [], worldGeos = [];
function clearWorld() {
  for (const c of cars.values()) c.geo.dispose();
  for (const g of worldGeos) g.dispose();
  worldGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  worldGroup.clear(); pieces.clear(); loot.clear(); chests.clear(); objs.clear(); cars.clear(); objList = []; objGrid = new Map(); pops = []; worldGeos = [];
  for (const n of nades) scene.remove(n.mesh); nades.length = 0;
  for (const b of bullets) { /* nur Daten */ } bullets.length = 0;
}
function addPieceMesh(p, pop) {
  if (pieces.has(p.key)) return;
  const m = new THREE.Mesh(pieceGeo[p.t], pieceMat[p.mat][p.t === 'w' && p.v ? 1 : 0]); m.castShadow = m.receiveShadow = true;
  placePiece(m, p); p.mesh = m; worldGroup.add(m); pieces.set(p.key, p);
  if (pop) { m.scale.setScalar(0.55); pops.push({ m, t: 0 }); }
}
function removePiece(k, boom) {
  const p = pieces.get(k); if (!p) return;
  if (boom) { const q = p.mesh.position; fx.burst(q.x, q.y, q.z, MATCOL[p.mat], 16, 5, 0.24, 1.0, 14, true); if (Math.hypot(q.x - me.x, q.z - me.z) < 50) noise(0.18, 700, 0.25); }
  worldGroup.remove(p.mesh); pieces.delete(k);
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
  if (l.i.k === 'w' && l.i.r >= 2) g.add(new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide })));
  g.position.set(l.x, l.y, l.z); l.mesh = g; l.spin = m; l.ph = Math.random() * 6; worldGroup.add(g); loot.set(l.id, l);
  if (from) { l.pop = 0; l.from = from; g.position.set(from[0], from[1], from[2]); }
}
function addChestMesh(c) {
  const m = chestModel(); m.g.position.set(c.x, c.y, c.z); m.g.rotation.y = hash(c.x, c.z) * 6.28;
  c.mesh = m.g; c.lid = m.lid; worldGroup.add(m.g); chests.set(c.id, c);
  if (c.open) { c.lid.rotation.x = -1.25; c.lid.material = VM; }
}
function openChest(c) { if (c.open) return; c.open = 1; c.lid.material = VM; c.anim = 0; }
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
function buildWorld(w) {
  clearWorld();
  const kind = (o) => (o.t !== 'tree' ? o.t : S.height(o.x, o.z) < 2.7 ? 'palm' : o.id % 5 < 2 ? 'pine' : o.id % 5 < 4 ? 'oak' : 'birch');
  const count = {}; for (const k in OBJ) count[k] = 0;
  for (const o of w.objs) count[kind(o)]++;
  inst = {};
  for (const k in count) { inst[k] = new THREE.InstancedMesh(NG[k], VM, Math.max(1, count[k])); inst[k].count = count[k]; inst[k].castShadow = inst[k].receiveShadow = true; worldGroup.add(inst[k]); }
  const idx = {}, c = new THREE.Color();
  for (const o of w.objs) {
    const k = kind(o), D = OBJ[k]; o.k = k; o.y = S.height(o.x, o.z); objs.set(o.id, o); objList.push(o);
    const i = (idx[k] = (idx[k] || 0) + 1) - 1; o.i = i; o.rot = k === 'crate' ? 0 : hash(o.x, o.z) * 6.28;
    dummy.position.set(o.x, o.y - 0.1, o.z); dummy.rotation.set(0, o.rot, 0); dummy.scale.setScalar(o.s); dummy.updateMatrix();
    inst[k].setMatrixAt(i, dummy.matrix);
    const v = 0.85 + hash(o.z, o.x) * 0.3; inst[k].setColorAt(i, o.t === 'tree' ? c.setRGB(v, 0.9 + hash(o.x, o.z) * 0.2, v) : c.setRGB(v, v, v));
    o.rad = D[0] * o.s; o.top = D[1] * o.s; const hw = D[2] * o.s; o.box = [o.x - hw, o.y, o.z - hw, o.x + hw, o.y + D[3] * o.s, o.z + hw];
    const gk = Math.floor(o.x / 16) + ',' + Math.floor(o.z / 16);
    if (!objGrid.has(gk)) objGrid.set(gk, []); objGrid.get(gk).push(o);
  }
  for (const p of w.pieces) addPieceMesh(p);
  for (const l of w.loot) addLootMesh(l);
  for (const ch of w.chests) addChestMesh(ch);
  for (const car of w.cars || []) addCar(car);
  for (const h of w.houses || []) { const geo = houseDeco(h, G, H); worldGeos.push(geo); const m = new THREE.Mesh(geo, VM); m.castShadow = m.receiveShadow = true; worldGroup.add(m); }
}
function setInst(o, scale, tilt) { dummy.position.set(o.x, scale ? o.y - 0.1 : -500, o.z); dummy.rotation.set(tilt || 0, o.rot, 0); dummy.scale.setScalar(scale ? o.s * scale : 0.001); dummy.updateMatrix(); inst[o.k].setMatrixAt(o.i, dummy.matrix); inst[o.k].instanceMatrix.needsUpdate = true; }
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
const stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 260, 72, 1, true), new THREE.MeshBasicMaterial({ map: stormTex, transparent: true, opacity: 0.24, side: THREE.DoubleSide, depthWrite: false, fog: false }));
stormMesh.visible = false; scene.add(stormMesh);
const shipMesh = new THREE.Group();
{
  const L = (c) => new THREE.MeshLambertMaterial({ color: c });
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
  const heavy = o.w === 'sniper' || o.w === 'shotgun', hv = heavy ? 2.2 : 1, isGun = !!S.W[o.w];
  ch.draw = Math.min(1, ch.draw + dt * 4.5); ch.kick = Math.max(0, ch.kick - dt * (heavy ? 4.5 : 10)); ch.sinceShot += dt; ch.flashT -= dt;
  ch.flinch = Math.max(0, ch.flinch - dt * 5); ch.land = Math.max(0, ch.land - dt * 4);
  const g = ch.g; g.position.set(o.x, o.y, o.z); g.scale.setScalar(1);
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
      else { const e = o.ads ? 0.82 : 0.6; P.aRx = aim + e; P.aRe = -e; P.aRz = o.ads ? -0.22 : -0.1; P.aLx = aim + 0.32; P.aLe = -0.42; P.aLz = 0.62; P.by += o.ads ? 0.18 : 0.1; P.hy = -(o.ads ? 0.18 : 0.1); if (o.ads) P.bz -= 0.06; }
      if (o.rl >= 0) {
        const r = o.rl; tilt = Math.min(1, r / 0.12) * (r > 0.86 ? (1 - r) / 0.14 : 1);
        P.aRx += 0.4 * tilt; P.aRe -= 0.25 * tilt; P.hx += 0.25 * tilt;
        if (o.w !== 'shotgun') { const hand = r > 0.25 && r < 0.65 ? Math.sin((r - 0.25) / 0.4 * Math.PI) : 0; P.aLx = lerp(P.aLx, 0.15, hand); P.aLe = lerp(P.aLe, -0.9, hand); P.aLz = lerp(P.aLz, 0.15, hand); }
      }
    } else if (o.w === 'pick') {
      const q = o.swing || 0; let a = -0.5 + s * A * 0.4, e = -0.9;
      if (q > 0) {
        if (q < 0.35) { a = lerp(-0.5, -2.6, q / 0.35); e = lerp(-0.9, -1.5, q / 0.35); } else if (q < 0.6) { const k = (q - 0.35) / 0.25; a = lerp(-2.6, -0.35, k); e = lerp(-1.5, -0.25, k); } else { const k = (q - 0.6) / 0.4; a = lerp(-0.35, -0.5, k); e = lerp(-0.25, -0.9, k); }
        P.by = -Math.sin(q * Math.PI) * 0.4; if (q > 0.35 && q < 0.8) P.bx += 0.22; P.aLx = a * 0.5; P.aLe = -0.8;
      }
      P.aRx = a; P.aRe = e;
    } else if (o.w === 'build') { P.aRx = -1.0; P.aRe = -0.7; P.aRz = -0.15; P.aLx = -0.9; P.aLe = -0.8; P.aLz = 0.3; }
    else if (o.w === 'gren') { if (ch.sinceShot < 0.3) { P.aRx = -1.7; P.aRe = -0.1; P.bx += 0.2; P.by = 0.3; } else { P.aRx = -0.9; P.aRe = -1.5; P.aRz = 0.15; } }
    else if (S.CONS[o.w]) { if (o.using) { P.aRx = -1.15 + Math.sin(T * 9) * 0.05; P.aRe = -1.75; P.aRz = -0.4; P.hx = -0.25; } else { P.aRx = -0.45; P.aRe = -1.0; } }
  }
  const cur = ch.cur || (ch.cur = { ...P }), kb = Math.min(1, dt * (q4(o) ? 30 : 15));
  for (const k of PK) cur[k] += (P[k] - cur[k]) * kb;
  const kick = ch.kick * hv, fl = ch.flinch, ld = ch.land, dr = isGun || o.w === 'pick' ? (1 - ch.draw) * 1.1 : 0;
  g.rotation.set(cur.dive, (o.sit ? o.carYaw : o.yaw) + Math.PI, 0);
  ch.body.position.y = 0.8 - cur.drop + cur.bpy - ld * 0.12; ch.body.rotation.set(cur.bx - (isGun ? kick * 0.03 : 0) + fl * 0.3, cur.by + fl * 0.25, cur.bz);
  ch.head.rotation.set(cur.hx - fl * 0.3, cur.hy, 0);
  ch.lL.up.position.y = ch.lR.up.position.y = 0.78 - cur.drop - ld * 0.1;
  ch.lL.up.rotation.x = cur.lLx - ld * 0.35; ch.lL.low.rotation.x = cur.lLk + ld * 0.7; ch.lR.up.rotation.x = cur.lRx - ld * 0.35; ch.lR.low.rotation.x = cur.lRk + ld * 0.7;
  ch.aL.up.rotation.set(cur.aLx - (isGun ? kick * 0.07 : 0), 0, cur.aLz); ch.aL.low.rotation.x = cur.aLe;
  ch.aR.up.rotation.set(cur.aRx - (isGun ? kick * 0.08 : 0) + dr, 0, cur.aRz); ch.aR.low.rotation.x = cur.aRe;
  const vis = !air && !o.sit && !o.emote;
  ch.gun.visible = isGun && vis; ch.pick.visible = o.w === 'pick' && vis; ch.held.visible = (o.w === 'build' || !!S.CONS[o.w]) && vis && !(o.w === 'gren' && ch.sinceShot < 0.5);
  ch.glider.visible = !!(o.fl & 4);
  ch.gun.position.set(0, -0.33 + kick * 0.06, 0.07); ch.gun.rotation.set(HP, 0, 0.5 * tilt); ch.gunMove.position.set(0, 0, 0); ch.gunMove.visible = true;
  ch.flash.visible = ch.flashT > 0 && ch.gun.visible;
  if (ch.flash.visible) { ch.flash.rotation.z = Math.random() * 6; ch.flash.scale.setScalar(0.7 + Math.random() * 0.7); }
  if (isGun) {
    if (heavy && ch.sinceShot > 0.18 && ch.sinceShot < 0.6) { const k = Math.sin((ch.sinceShot - 0.18) / 0.42 * Math.PI); if (o.w === 'shotgun') ch.gunMove.position.z = -0.13 * k; else ch.gun.rotation.z = 0.25 * k; ch.aL.up.rotation.x += k * 0.2; }
    if (o.rl >= 0) {
      const r = o.rl;
      if (o.w === 'shotgun') { const k = Math.abs(Math.sin(r * Math.PI * 5)); ch.gunMove.position.z = -0.12 * k; ch.aL.up.rotation.x -= 0.15 * k; }
      else { let my = 0; if (r > 0.1 && r < 0.35) my = (r - 0.1) / 0.25; else if (r >= 0.35 && r < 0.55) my = 1; else if (r >= 0.55 && r < 0.8) my = 1 - (r - 0.55) / 0.25; ch.gunMove.position.y = -0.32 * my; ch.gunMove.visible = !(r > 0.33 && r < 0.57); }
    }
  }
}
const q4 = (o) => (o.swing || 0) > 0 || o.snap;
function deathPose(ch, t) { const k = Math.min(1, (1 - t) * 2.2); ch.g.visible = true; ch.g.rotation.x = -k * 1.5; ch.g.position.y += k * 0.15; if (t < 0.25) ch.g.scale.setScalar(Math.max(0.01, t / 0.25)); ch.glider.visible = false; }

// ================= Zustand =================
let ws, myId = 0, phase = 'menu', rosterMap = new Map(), stormS = null, shipS = null, aliveN = 0, gameT = 0, stateTick = 0, specId = 0, myCar = 0, curPoi = null;
const ents = new Map(), killsBy = new Map(), deadSet = new Set();
const me = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, onGround: false, hp: 100, sh: 0, alive: false, st: 'ship', crouch: false, slot: 0, inv: [null, null, null, null, null], ammo: {}, mats: {}, build: null, bmat: 'wood', lastShot: 0, reload: null, using: null, kills: 0, swing: 1, lastSwing: 0, lastBuild: 0, speed: 0, ch: null, ads: false, fl: 0, deadT: 0, bloom: 0, kx: 0, kz: 0, emote: 0, dmg: 0, lastThrow: 0 };
const rec = { p: 0, y: 0, tp: 0, ty: 0 };
const VP = () => clamp(me.pitch + rec.p, -1.5, 1.5), VY = () => me.yaw + rec.y;
function resetMe() {
  Object.assign(me, { vy: 0, pitch: -0.2, onGround: false, hp: 100, sh: 0, alive: true, st: 'ship', crouch: false, slot: 0, inv: [null, null, null, null, null], ammo: { light: 0, medium: 0, shells: 0, heavy: 0 }, mats: { wood: 0, stone: 0, metal: 0 }, build: null, bmat: 'wood', reload: null, using: null, kills: 0, deadT: 0, bloom: 0, kx: 0, kz: 0, emote: 0, dmg: 0 });
  rec.p = rec.y = rec.tp = rec.ty = 0; myCar = 0; hudDirty = true; killsBy.clear(); deadSet.clear();
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
  }
  return g;
}
const inW0 = (x, z, ix, iz) => x > ix * G - 0.4 && x < ix * G + G + 0.4 && Math.abs(z - iz * G) < 0.52;
const inW1 = (x, z, ix, iz) => z > iz * G - 0.4 && z < iz * G + G + 0.4 && Math.abs(x - ix * G) < 0.52;
function wallAt(x, z, y, ox, oz) {
  const cx = Math.floor(x / G), cz = Math.floor(z / G), y0 = Math.floor((y + 0.5) / H), y1 = Math.floor((y + 1.7) / H);
  for (let iy = y0; iy <= y1; iy++) for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
    const b = ':' + ix + ':' + iy + ':' + iz;
    if (pieces.has('w' + b + ':0') && inW0(x, z, ix, iz) && !inW0(ox, oz, ix, iz)) return 'w' + b + ':0';
    if (pieces.has('w' + b + ':1') && inW1(x, z, ix, iz) && !inW1(ox, oz, ix, iz)) return 'w' + b + ':1';
  }
  return null;
}
function objAt(x, z, y, ox, oz, pad) {
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
    const arr = objGrid.get(a + ',' + b); if (!arr) continue;
    for (const o of arr) {
      if (o.dead || y > o.y + o.top) continue;
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
function blocked(x, z, y, ox, oz) { return x * x + z * z > 262 * 262 || !!wallAt(x, z, y, ox, oz) || !!objAt(x, z, y, ox, oz, 0.35); }
function ceiling(x, z, y, ny) {
  const iy = Math.ceil((y + 1.8) / H);
  return pieces.has('f:' + Math.floor(x / G) + ':' + iy + ':' + Math.floor(z / G)) && ny + 1.8 >= iy * H - 0.12;
}
const tb = [0, 0, 0, 0, 0, 0];
function raycast(ox, oy, oz, dx, dy, dz, max, noPlayers) {
  let best = max, res = { kind: null };
  const ph = S.rayPieces(ox, oy, oz, dx, dy, dz, best, pieces);
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
    if (!e.alive || (e.fl & 1)) continue;
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
    if (!p || p.t === 'f') n = [0, dy > 0 ? -1 : 1, 0];
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
function shotSound(w, vol) { const p = { ar: [0.16, 1700], smg: [0.1, 2600], shotgun: [0.32, 900], pistol: [0.12, 2200], sniper: [0.5, 650] }[w] || [0.1, 2000]; noise(p[0], p[1], 0.5 * vol); if (vol > 0.3) tone(170, 50, p[0] * 0.8, 0.22 * vol, 'sawtooth'); }
function engineSound(on, sp) {
  if (!AC) return;
  if (on && !engine) { const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain(); o.type = 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 420; g.gain.value = 0.05; o.connect(f); f.connect(g); g.connect(AC.destination); o.start(); engine = { o, g }; }
  if (!on && engine) { engine.o.stop(); engine = null; }
  if (engine) engine.o.frequency.setTargetAtTime(48 + Math.abs(sp) * 6.5, AC.currentTime, 0.08);
}

// ================= Effekte =================
const tracers = [], booms = [];
function tracer(a, b, col, wd, life) {
  const m = new THREE.Mesh(streakGeo, new THREE.MeshBasicMaterial({ color: col || 0xffe9a0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  m.position.set(a[0], a[1], a[2]); m.lookAt(b[0], b[1], b[2]); const w = wd || 0.045; m.scale.set(w, w, Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  scene.add(m); tracers.push({ m, t: life || 0.1, l: life || 0.1 });
}
const boomGeo = new THREE.SphereGeometry(1, 14, 10), shockGeo = new THREE.RingGeometry(0.8, 1, 32).rotateX(-HP);
function explode(x, y, z, big) {
  const s = big || 1;
  fx.burst(x, y, z, '#ff9a2e', 46, 12 * s, 0.4, 0.9, 6); fx.burst(x, y, z, '#ffe27a', 22, 16 * s, 0.22, 0.5, 4); fx.burst(x, y + 0.5, z, '#2b2b2b', 30, 5, 0.6, 1.8, -1.5); fx.burst(x, y, z, '#6b5a3a', 18, 9, 0.2, 1.4, 16, true);
  const f = new THREE.Mesh(boomGeo, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  const r = new THREE.Mesh(shockGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, fog: false }));
  f.position.set(x, y, z); r.position.set(x, y + 0.15, z); scene.add(f, r); booms.push({ f, r, t: 0, s });
  const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
  noise(0.75, 320, clamp(1.3 - d / 110, 0, 1)); tone(95, 28, 0.55, clamp(0.5 - d / 150, 0, 0.4), 'sine');
  shake = Math.max(shake, clamp(1.2 - d / 28, 0, 1) * 0.07);
}
let bannerT = 0, elimT = 0, hurtT = 0, gainT = 0;
function banner(txt, dur) { const b = $('banner'); b.textContent = txt; b.style.opacity = 1; bannerT = dur || 3; }
function feed(html, mine) { const d = document.createElement('div'); if (mine) d.className = 'me'; d.innerHTML = html; $('feed').prepend(d); setTimeout(() => d.remove(), 6500); while ($('feed').children.length > 6) $('feed').lastChild.remove(); }
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
  const bn = { w: 'Q', f: 'F', r: 'C' };
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
  $('score').innerHTML = '<h3>SPIELER · ' + aliveN + ' am Leben</h3>' + rows.map((r) => '<div class="' + (r.dead ? 'dead' : '') + (r.id === myId ? ' self' : '') + '"><span>' + esc(r.n) + '</span><span>☠ ' + r.k + '</span></div>').join('');
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
  g.fillStyle = '#ffd83a'; g.beginPath(); g.moveTo(W / 2 - 9, 0); g.lineTo(W / 2 + 9, 0); g.lineTo(W / 2, 12); g.fill();
}
const mapC = document.createElement('canvas'); mapC.width = mapC.height = 280;
{
  const g = mapC.getContext('2d'), im = g.createImageData(280, 280);
  for (let j = 0; j < 280; j++) for (let i = 0; i < 280; i++) {
    const x = (i / 280) * 560 - 280, z = (j / 280) * 560 - 280, h = S.height(x, z);
    const c = h < 0 ? [0.18, 0.56, 0.84] : groundColor(x, z, h);
    const sh = h < 0 ? 1 : 0.82 + clamp((S.height(x - 3, z - 3) - h) * -0.08 + 0.15, -0.2, 0.3);
    im.data.set([c[0] * 255 * sh, c[1] * 255 * sh, c[2] * 255 * sh, 255], (j * 280 + i) * 4);
  }
  g.putImageData(im, 0, 0);
}
function drawMap(cv2, cx, cz, span, big) {
  const g = cv2.getContext('2d'), W = cv2.width, k = W / span, px = (x) => (x - cx) * k + W / 2, pz = (z) => (z - cz) * k + W / 2;
  g.fillStyle = '#2d8fd6'; g.fillRect(0, 0, W, W);
  g.drawImage(mapC, px(-280), pz(-280), 560 * k, 560 * k);
  g.fillStyle = 'rgba(70,60,50,.85)';
  for (const p of pieces.values()) if (p.t === 'f') g.fillRect(px(p.ix * G), pz(p.iz * G), G * k + 0.5, G * k + 0.5);
  g.fillStyle = '#ffd83a'; for (const c of cars.values()) { g.beginPath(); g.arc(px(c.x), pz(c.z), big ? 3 : 2.5, 0, 6.3); g.fill(); }
  if (big) { g.font = '800 15px Bahnschrift,Segoe UI,Arial'; g.textAlign = 'center'; g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff'; for (const p of S.POIS) { g.strokeText(p.n, px(p.x), pz(p.z - p.r - 3)); g.fillText(p.n, px(p.x), pz(p.z - p.r - 3)); } }
  if (stormS) {
    g.fillStyle = 'rgba(140,60,230,.45)'; g.beginPath(); g.rect(0, 0, W, W); g.arc(px(stormS[0]), pz(stormS[1]), Math.max(0.1, stormS[2] * k), 0, 6.3, true); g.fill('evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(px(stormS[3]), pz(stormS[4]), Math.max(0.1, stormS[5] * k), 0, 6.3); g.stroke();
    const f0 = focus(), dz0 = Math.hypot(f0.x - stormS[3], f0.z - stormS[4]);
    if (dz0 > stormS[5]) { g.setLineDash([5, 5]); g.beginPath(); g.moveTo(px(f0.x), pz(f0.z)); g.lineTo(px(stormS[3]), pz(stormS[4])); g.stroke(); g.setLineDash([]); }
  }
  if (shipS) { g.fillStyle = '#ff7a2f'; g.beginPath(); g.arc(px(shipS[0]), pz(shipS[1]), 6, 0, 6.3); g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
  const f = focus();
  g.save(); g.translate(px(f.x), pz(f.z)); g.rotate(-f.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
}
const focus = () => (me.alive ? me : ents.get(specId) || me);

// ================= Menü-Vorschau =================
const HUES = [205, 0, 28, 48, 95, 150, 180, 262, 292, 325], HEADS = ['Helm', 'Kappe', 'Frisur', 'Mütze'];
const PV = { x: 75, z: -25, yaw: 2.2, ch: null, hi: 0, st: 0, skin: 0 };
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
function setRoster(r) { rosterMap = new Map(r.map((a) => [a[0], { name: a[1], hue: a[2], bot: a[3], style: a[4] | 0 }])); }
function dropEnts() { for (const e of ents.values()) { scene.remove(e.ch.g); disposeChar(e.ch); } ents.clear(); if (me.ch) { scene.remove(me.ch.g); disposeChar(me.ch); me.ch = null; } }
function connect(name) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => tx({ t: 'join', name, hue: HUES[PV.hi], style: PV.st | (PV.skin << 2) });
  ws.onclose = () => { banner('Verbindung getrennt – Seite neu laden', 999); };
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
}
function leaveCar() { myCar = 0; engineSound(false); $('speed').style.display = 'none'; document.body.classList.remove('driving'); }
function endStats(place) { return chips([['#' + place, 'Platz'], [me.kills, 'Eliminierungen'], [Math.round(me.dmg), 'Schaden'], [fmtT(me.surv || gameT), 'Überlebt']]); }
function onMsg(m) {
  switch (m.t) {
    case 'init':
      myId = m.id; setRoster(m.roster);
      if (m.world) { buildWorld(m.world); phase = 'game'; me.alive = false; PV.ch.g.visible = false; show('hud', true); show('dead', true); $('deadT').textContent = 'Runde läuft'; $('deadS').textContent = 'Du schaust zu – in der nächsten Runde bist du dabei. ' + (TOUCH ? 'Tippen' : 'Klick') + ': Spieler wechseln'; }
      else { phase = 'lobby'; show('lobby', true); }
      break;
    case 'lobby':
      phase = 'lobby'; leaveCar(); clearWorld(); dropEnts(); stormS = shipS = null; me.alive = false; PV.ch.g.visible = true;
      show('lobby', true); show('dead', false); show('win', false); show('hud', false); stormMesh.visible = shipMesh.visible = false; $('tint').style.opacity = 0; $('score').style.display = 'none';
      break;
    case 'start':
      setRoster(m.roster); leaveCar(); dropEnts(); buildWorld(m.world); resetMe(); phase = 'game'; gameT = 0; shipS = [m.ship.ax, m.ship.az]; me.x = m.ship.ax; me.z = m.ship.az; me.y = S.SHIPY - 8; $('feed').innerHTML = ''; $('picks').innerHTML = '';
      show('lobby', false); show('dead', false); show('win', false); show('hud', true); PV.ch.g.visible = false;
      me.ch = makeChar(myId);
      banner(TOUCH ? 'SPRUNG-Taste: Abspringen!' : 'Leertaste: Abspringen!', 5);
      break;
    case 's': onState(m); break;
    case 'pc+': addPieceMesh(m.p, true); if (Math.hypot((m.p.ix + 0.5) * G - me.x, (m.p.iz + 0.5) * G - me.z) < 40) tone(140, 90, 0.08, 0.12, 'triangle'); break;
    case 'pc-': removePiece(m.k, true); break;
    case 'pchp': { const p = pieces.get(m.k); if (p) { p.hp = m.hp; const q = p.mesh.position; fx.burst(q.x, q.y, q.z, MATCOL[p.mat], 3, 3, 0.12, 0.5); pops.push({ m: p.mesh, t: 0.5, hit: 1 }); } break; }
    case 'obj-': removeObj(m.id); break;
    case 'loot+': addLootMesh(m.l, m.o); break;
    case 'loot-': { const l = loot.get(m.id); if (l) { worldGroup.remove(l.mesh); loot.delete(m.id); } pending.delete(m.id); break; }
    case 'chest': { const c = chests.get(m.id); if (c) { openChest(c); fx.burst(c.x, c.y + 0.8, c.z, '#ffd83a', 26, 5, 0.12, 0.9, 6); if (Math.hypot(c.x - me.x, c.z - me.z) < 30) tone(500, 1100, 0.25, 0.12, 'triangle'); } break; }
    case 'got': gotItem(m.i); break;
    case 'mat': me.mats[m.m] = Math.min(999, me.mats[m.m] + m.n); gain('+' + m.n + ' ' + S.MATS[m.m].n); hudDirty = true; break;
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
      const e = ents.get(m.id); if (e) { e.ch.kick = 1; e.ch.flashT = 0.05; e.ch.sinceShot = 0; }
      fx.burst(m.e[0], m.e[1], m.e[2], '#d8c9a0', 3, 2.5, 0.07, 0.35);
      break;
    }
    case 'nade': { spawnNade(m.o, m.v, false); const e = ents.get(m.id); if (e) e.ch.sinceShot = 0; break; }
    case 'boom': explode(m.x, m.y, m.z); break;
    case 'car': myCar = m.id; me.build = null; me.reload = me.using = null; mouseR = false; me.emote = 0; document.body.classList.add('driving'); hudDirty = true; break;
    case 'car-': {
      const c = cars.get(m.id); if (!c) break;
      explode(c.x, c.y + 1, c.z, 1.2);
      worldGroup.remove(c.mesh); c.geo.dispose(); cars.delete(m.id); if (m.id === myCar) leaveCar();
      break;
    }
    case 'roster': setRoster(m.r); break;
    case 'kill': {
      const v = esc(nameOf(m.v)), k = m.k ? esc(nameOf(m.k)) : '';
      const ic = S.W[m.w] ? pic(m.w + '0', ICON[m.w]) : m.w === 'pick' ? pic('pick', ICON.pick) : m.w === 'gren' ? pic('gren', ICON.gren) : ICON[m.w === 'car' ? 'car' : 'storm'];
      const ve = m.v === myId ? me : ents.get(m.v), ke = m.k === myId ? me : ents.get(m.k);
      const dist = ve && ke && m.k ? ' <span style="opacity:.6">' + Math.round(Math.hypot(ve.x - ke.x, ve.z - ke.z)) + ' m</span>' : '';
      feed(m.w === 'storm' ? ic + '<b>' + v + '</b> wurde vom Sturm erwischt' : m.w === 'fall' ? '<b>' + v + '</b> ist zu tief gefallen' : m.w === 'quit' ? '<b>' + v + '</b> hat das Spiel verlassen' : !m.k ? '<b>' + v + '</b> wurde eliminiert' : '<b>' + k + '</b>' + ic + '<b>' + v + '</b>' + dist, m.k === myId || m.v === myId);
      deadSet.add(m.v); if (m.k) killsBy.set(m.k, m.kills);
      if (m.k === myId) { me.kills = m.kills; $('elim').innerHTML = '☠ ELIMINIERT &nbsp;<b>' + v + '</b>'; $('elim').style.opacity = 1; elimT = 2.6; hitMarker('kill'); tone(660, 990, 0.18, 0.14, 'triangle'); }
      if (ents.get(m.v)) ents.get(m.v).deadT = 1;
      if (m.v === myId) die(m);
      else if (m.v === specId && m.k) specId = m.k;
      break;
    }
    case 'win':
      phase = 'end'; show('dead', false); show('win', true); leaveCar();
      if (m.id === myId) { me.surv = gameT; $('winT').textContent = '#1 EPISCHER SIEG!'; $('winS').innerHTML = endStats(1); tone(520, 1040, 0.6, 0.2, 'triangle'); me.emote = 99; for (let i = 0; i < 6; i++) fx.burst(me.x + (Math.random() - 0.5) * 6, me.y + 3, me.z + (Math.random() - 0.5) * 6, ['#ffd83a', '#ff5a4d', '#59b7ff', '#5be05a', '#fff', '#b04dff'][i], 30, 8, 0.14, 1.8, 6); }
      else { $('winT').textContent = (m.name || 'Niemand') + ' gewinnt'; $('winS').innerHTML = 'Neue Runde startet gleich …' + (me.place ? endStats(me.place) : ''); }
      break;
  }
}
function onState(m) {
  if (m.ph === 'lobby') { $('lobbyT').textContent = m.tm; $('lobbyN').innerHTML = m.names.map((n) => '<span>' + esc(n) + '</span>').join(''); return; }
  if (stormS && m.st[7] && !stormS[7]) { banner('Der Sturm zieht sich zusammen!', 3.5); tone(200, 90, 0.8, 0.12, 'sawtooth'); }
  stormS = m.st; shipS = m.ship; aliveN = m.al; gameT = m.gt; stateTick++;
  for (const a of m.p) {
    if (a[0] === myId) { if (me.hp !== a[6] || me.sh !== a[7]) { me.hp = a[6]; me.sh = a[7]; hudDirty = true; } continue; }
    let e = ents.get(a[0]);
    if (!e) { e = { id: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], speed: 0, rlT: 0, swT: 9, deadT: 0, fl: 0, ch: makeChar(a[0]) }; ents.set(a[0], e); }
    e.tx = a[1]; e.ty = a[2]; e.tz = a[3]; e.tyaw = a[4]; e.pitch = a[5]; e.hp = a[6]; e.sh = a[7];
    if ((a[8] & 128) && !(e.fl & 128)) e.swT = 0;
    e.fl = a[8]; e.w = a[9]; e.wr = a[10] | 0; e.seen = stateTick; e.alive = true;
  }
  for (const e of ents.values()) if (e.seen !== stateTick) e.alive = false;
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
  if (i.k === 'a') { me.ammo[i.a] += i.n; return; }
  if (i.k === 'm') { me.mats[i.m] = Math.min(999, me.mats[i.m] + i.n); return; }
  if (i.k === 'c') {
    const s = me.inv.find((q) => q && q.k === 'c' && q.c === i.c && q.n < S.CONS[i.c].max);
    if (s) { const add = Math.min(i.n, S.CONS[i.c].max - s.n); s.n += add; i.n -= add; if (i.n <= 0) return; }
  }
  let e = me.inv.indexOf(null);
  if (e < 0) { if (me.slot === 0) { tx({ t: 'drop', i }); return; } e = me.slot - 1; tx({ t: 'drop', i: me.inv[e] }); me.reload = me.using = null; }
  me.inv[e] = i;
  if (i.k === 'w' && me.slot === 0 && !me.build) setSlot(e + 1);
}
function setSlot(n) { if (myCar) return; me.slot = n; me.build = null; me.reload = null; me.using = null; me.emote = 0; hudDirty = true; tone(520, 640, 0.04, 0.05, 'triangle'); }
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
  specId = m.k || 0;
  show('dead', true); $('deadT').textContent = m.k ? 'Eliminiert von ' + nameOf(m.k) : m.w === 'storm' ? 'Vom Sturm erwischt' : 'Ausgeschieden';
  $('deadS').innerHTML = endStats(m.place) + '<div style="margin-top:10px;opacity:.8">' + (TOUCH ? 'Tippen' : 'Klick') + ': Spieler wechseln</div>';
  noise(0.5, 300, 0.4); hudDirty = true; $('lowammo').style.display = 'none'; arcLine.visible = false;
}

// ================= Eingabe =================
const cv = $('c');
function cycleSpec() { const a = [...ents.values()].filter((e) => e.alive); if (a.length) specId = a[(a.findIndex((e) => e.id === specId) + 1) % a.length].id; }
function toggleBuild(b) { if (myCar) return; me.build = me.build === b ? null : b; me.reload = me.using = null; me.emote = 0; hudDirty = true; }
function toggleMap() { $('bigmap').style.display = $('bigmap').style.display === 'block' ? 'none' : 'block'; }
cv.addEventListener('click', () => { initAudio(); if (TOUCH) return; if (phase === 'game' && me.alive && !locked) cv.requestPointerLock(); else if (!me.alive && phase === 'game') cycleSpec(); });
document.addEventListener('pointerlockchange', () => { if (TOUCH) return; locked = document.pointerLockElement === cv; if (!locked) { mouseL = mouseR = false; for (const k in keys) keys[k] = false; $('score').style.display = 'none'; } });
document.addEventListener('mousemove', (e) => {
  if (!locked || TOUCH) return;
  const it = curItem(), s = 0.0022 * SENS * (me.ads ? (it && it.w === 'sniper' ? 0.22 : 0.6) : 1);
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
  if (['Space', 'KeyF', 'ControlLeft', 'KeyQ', 'KeyC', 'KeyR', 'KeyE', 'KeyB', 'F1', 'F3'].includes(e.code) || e.ctrlKey) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (!me.alive) return;
  if (e.code.startsWith('Digit')) { const n = +e.code[5]; if (n >= 1 && n <= 6) setSlot(n - 1); }
  else if (e.code === 'KeyQ' || e.code === 'KeyF' || e.code === 'KeyC') toggleBuild({ KeyQ: 'w', KeyF: 'f', KeyC: 'r' }[e.code]);
  else if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyE') interact();
  else if (e.code === 'KeyB') { if (me.st === 'ground' && !myCar) me.emote = me.emote > 0 ? 0 : 6; }
  else if (e.code === 'ControlLeft') me.crouch = !me.crouch;
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') $('score').style.display = 'none'; });
$('play').onclick = () => {
  initAudio();
  const n = $('name').value.trim() || 'Spieler' + Math.floor(Math.random() * 900 + 100);
  try { localStorage.setItem('sf_name', n); localStorage.setItem('sf_sens', SENS); localStorage.setItem('sf_shad', $('shad').checked ? 1 : 0); } catch (e) {}
  show('menu', false); connect(n);
  if (TOUCH) { try { const el = document.documentElement; const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) {} }
};
$('sens').oninput = () => { SENS = +$('sens').value; };
$('shad').onchange = () => { sun.castShadow = $('shad').checked; };
try { $('name').value = localStorage.getItem('sf_name') || ''; const s = +localStorage.getItem('sf_sens'); if (s >= 0.3 && s <= 3) { SENS = s; $('sens').value = s; } if (localStorage.getItem('sf_shad') === '0') { $('shad').checked = false; sun.castShadow = false; } } catch (e) {}

// ================= Touch-Steuerung =================
if (TOUCH) {
  const tl = $('touch'), stick = $('stick'), knob = $('knob'), looks = new Map();
  const lookMove = (e) => {
    const l = looks.get(e.pointerId); if (!l) return;
    const it = curItem(), s = 0.0058 * SENS * (me.ads ? (it && it.w === 'sniper' ? 0.22 : 0.55) : 1);
    me.yaw -= (e.clientX - l.x) * s; me.pitch = clamp(me.pitch - (e.clientY - l.y) * s, -1.5, 1.5); l.x = e.clientX; l.y = e.clientY;
  };
  tl.addEventListener('pointerdown', (e) => {
    initAudio(); e.preventDefault();
    if (phase !== 'game') return;
    if (!me.alive) { cycleSpec(); return; }
    try { tl.setPointerCapture(e.pointerId); } catch (er) {}
    if (e.clientX < innerWidth * 0.42 && joy.id === null) {
      joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = joy.y = 0;
      stick.style.display = 'block'; stick.style.left = e.clientX + 'px'; stick.style.top = e.clientY + 'px'; knob.style.transform = 'translate(0,0)';
    } else looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  tl.addEventListener('pointermove', (e) => {
    if (e.pointerId === joy.id) {
      let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy; const m = Math.hypot(dx, dy), R = 52;
      if (m > R) { dx *= R / m; dy *= R / m; }
      joy.x = dx / R; joy.y = dy / R; knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    } else lookMove(e);
  });
  const end = (e) => { if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; keys.ShiftLeft = false; stick.style.display = 'none'; } else looks.delete(e.pointerId); };
  tl.addEventListener('pointerup', end); tl.addEventListener('pointercancel', end);
  const btn = (id, down, up, drag) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); initAudio(); try { el.setPointerCapture(e.pointerId); } catch (er) {} el.classList.add('on'); if (drag) looks.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (me.alive && down) down(); });
    if (drag) el.addEventListener('pointermove', lookMove);
    const up2 = (e) => { el.classList.remove('on'); looks.delete(e.pointerId); if (up) up(); };
    el.addEventListener('pointerup', up2); el.addEventListener('pointercancel', up2);
  };
  btn('bFire', () => (mouseL = true), () => (mouseL = false), true);
  btn('bFire2', () => (mouseL = true), () => (mouseL = false), true);
  btn('bJump', () => (keys.Space = true), () => (keys.Space = false), true);
  btn('bAds', () => { mouseR = !mouseR; $('bAds').classList.toggle('act', mouseR); });
  btn('bRel', () => startReload());
  btn('bCrouch', () => { me.crouch = !me.crouch; $('bCrouch').classList.toggle('act', me.crouch); });
  const hudTap = (e) => {
    const t = e.target.closest('[data-slot],[data-b],[data-m]'); if (!t || !me.alive) return;
    e.preventDefault(); e.stopPropagation(); initAudio();
    if (t.dataset.slot !== undefined) { setSlot(+t.dataset.slot); mouseR = false; $('bAds').classList.remove('act'); }
    else if (t.dataset.b) toggleBuild(t.dataset.b);
    else { me.bmat = t.dataset.m; hudDirty = true; }
  };
  $('inv').addEventListener('pointerdown', hudTap); $('build').addEventListener('pointerdown', hudTap);
  $('prompt').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); interact(); });
  $('mini').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); toggleMap(); });
  $('info').style.pointerEvents = 'auto';
  $('info').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); const s = $('score'); if (s.style.display === 'block') s.style.display = 'none'; else { renderScore(); s.style.display = 'block'; } });
  addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  addEventListener('gesturestart', (e) => e.preventDefault());
}
$('bigmap').addEventListener('pointerdown', () => toggleMap());
$('score').addEventListener('pointerdown', () => ($('score').style.display = 'none'));

// ================= Interaktion =================
let nearLoot = null, nearChest = null, nearCar = null;
const KE = TOUCH ? 'Tippen' : 'E';
function scanNear() {
  const p = $('prompt');
  if (myCar) { p.innerHTML = '<b>' + KE + '</b>Aussteigen'; p.style.display = 'block'; return; }
  nearLoot = nearChest = nearCar = null; let bd = 2.8;
  for (const l of loot.values()) {
    if (l.pop !== undefined) continue;
    const d = Math.hypot(l.x - me.x, l.z - me.z); if (Math.abs(l.y - me.y) > 2.5) continue;
    if ((l.i.k === 'a' || l.i.k === 'm') && d < 2 && !pending.has(l.id)) { pending.add(l.id); tx({ t: 'pickup', id: l.id }); continue; }
    if (l.i.k !== 'a' && l.i.k !== 'm' && d < bd) { bd = d; nearLoot = l; }
  }
  let cd = 2.8;
  for (const c of chests.values()) { if (c.open || Math.abs(c.y - me.y) > 2.5) continue; const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < cd) { cd = d; nearChest = c; } }
  let kd = 3.6;
  for (const c of cars.values()) { if (c.drv || Math.abs(c.y - me.y) > 2.5) continue; const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < kd) { kd = d; nearCar = c; } }
  if (nearChest && cd <= bd) { p.innerHTML = '<b>' + KE + '</b>Truhe öffnen'; nearLoot = nearCar = null; }
  else if (nearLoot) { p.innerHTML = '<b>' + KE + '</b><span style="color:' + itemColor(nearLoot.i) + '">' + itemName(nearLoot.i) + '</span>'; nearChest = nearCar = null; }
  else if (nearCar) p.innerHTML = '<b>' + KE + '</b>Einsteigen';
  else { p.style.display = 'none'; return; }
  p.style.display = 'block';
}
function interact() {
  if (me.st !== 'ground') return;
  if (myCar) { exitCar(); return; }
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
    if (o || px * px + pz * pz > 258 * 258 || S.height(nx, nz) < -1.6) { ok = false; if (Math.abs(c.sp) > 5) { noise(0.2, 400, 0.4); shake = Math.max(shake, 0.035); } c.sp *= -0.3; c.vd = c.yaw; }
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
const ghosts = { w: new THREE.Mesh(pieceGeo.w, ghostMat), f: new THREE.Mesh(pieceGeo.f, ghostMat), r: new THREE.Mesh(pieceGeo.r, ghostMat) };
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
  let s = W.spread * (me.ads ? (it.w === 'sniper' ? 0 : 0.35) : 1) * (me.crouch ? 0.75 : 1) * (me.speed > 1 ? 1.35 : 1) * (me.onGround ? 1 : 1.7);
  if (me.bloom === 0 && me.speed < 1 && me.onGround && W.pellets === 1 && it.w !== 'sniper') s *= 0.3; // erster Schuss genau
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
  for (let i = 0; i < W.pellets; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sp;
    const d = dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(u2, Math.sin(a) * r).normalize();
    if (it.w === 'sniper') { bullets.push({ x: o.x, y: o.y, z: o.z, vx: d.x * 300, vy: d.y * 300, vz: d.z * 300, t: 2.2, w: it.w, r: it.r, first: mz }); end = [o.x + d.x * 220, o.y + d.y * 220, o.z + d.z * 220]; continue; }
    const h = raycast(o.x, o.y, o.z, d.x, d.y, d.z, 500);
    if (!end) end = [h.x, h.y, h.z];
    tally(h, agg);
    if (W.pellets > 1 && i) tracer(mz, [h.x, h.y, h.z], 0, 0.025, 0.07);
  }
  if (it.w !== 'sniper') tracer(mz, end);
  shotSound(it.w, 1);
  fx.burst(mz[0], mz[1], mz[2], '#e0b23c', 1, 2.4, 0.05, 1.2, 14, true);
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
const nadeGeo = itemGeo({ k: 'c', c: 'gren' });
function spawnNade(o, v, mine) {
  const m = new THREE.Mesh(nadeGeo, VM); m.castShadow = true; m.scale.setScalar(0.75); m.position.set(o[0], o[1], o[2]); scene.add(m);
  nades.push({ x: o[0], y: o[1], z: o[2], vx: v[0], vy: v[1], vz: v[2], t: 2.4, mine, mesh: m, rest: false });
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
    if (n.t < 0.8 && Math.random() < dt * 14) fx.burst(n.x, n.y + 0.2, n.z, '#ff5a4d', 1, 1, 0.08, 0.25, -2);
    if (n.t <= 0) { scene.remove(n.mesh); nades.splice(i, 1); if (n.mine) { explode(n.x, n.y, n.z); tx({ t: 'boom', x: +n.x.toFixed(2), y: +n.y.toFixed(2), z: +n.z.toFixed(2) }); } }
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
  me.ads = mouseR && !me.build && me.st === 'ground' && !myCar && !!it && it.k === 'w';
  if (me.reload) {
    me.reload.t -= dt;
    if (me.reload.t <= 0) { if (it && it.k === 'w') { const W = S.W[it.w], n = Math.min(W.mag - it.mag, me.ammo[W.ammo]); it.mag += n; me.ammo[W.ammo] -= n; } me.reload = null; hudDirty = true; }
  }
  if (me.using) {
    me.using.t -= dt;
    if (me.using.t <= 0) { if (it && it.k === 'c') { tx({ t: 'heal', c: it.c }); it.n--; if (it.n <= 0) me.inv[me.slot - 1] = null; tone(400, 900, 0.3, 0.12, 'sine'); fx.burst(me.x, me.y + 1.2, me.z, S.CONS[it.c].col, 14, 2.5, 0.08, 0.8, -3); } me.using = null; hudDirty = true; }
  }
  const u = $('use'), prog = me.using || me.reload;
  if (prog) { u.style.display = 'block'; u.firstChild.style.width = (1 - prog.t / prog.total) * 100 + '%'; } else u.style.display = 'none';
  if (me.reload) { const el = document.querySelector('#inv .sel .rl'); if (el) el.style.height = (me.reload.t / me.reload.total) * 100 + '%'; }
  const gren = !me.build && it && it.c === 'gren' && me.st === 'ground' && !myCar;
  if (gren) updateArc(); else arcLine.visible = false;
  if (me.st !== 'ground' || myCar) return;
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
      if (it.w !== 'sniper' || me.ads) { aimDir(dir); const o = camPos.clone().addScaledVector(dir, Math.max(0.2, pivot.clone().sub(camPos).dot(dir))); const h = raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, S.W[it.w].range[1]); autoFire = h.kind === 'player'; }
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
    me.lastThrow = now; const t = throwVec(); spawnNade(t.o, t.v, true); tx({ t: 'nade', o: t.o, v: t.v }); me.ch.sinceShot = 0; noise(0.1, 1200, 0.15);
    it.n--; if (it.n <= 0) me.inv[me.slot - 1] = null; hudDirty = true;
  } else if (it && it.k === 'c' && !me.using) {
    const full = it.c === 'med' ? me.hp >= 100 : it.c === 'band' ? me.hp >= 75 : it.c === 'pot' ? me.sh >= 100 : me.sh >= 50;
    if (full) { if (now - me.lastBuild > 900) { me.lastBuild = now; banner(it.c === 'med' || it.c === 'band' ? 'Leben ist bereits voll genug' : 'Schild ist bereits voll genug', 1.5); } }
    else me.using = { t: S.CONS[it.c].t, total: S.CONS[it.c].t };
  }
}

// ================= Bewegung =================
function wish() {
  let f = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0), r = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0);
  if (joy.id !== null) { f = -joy.y; r = joy.x; const m = Math.hypot(f, r); keys.ShiftLeft = m > 0.93; if (m < 0.18) return [0, 0]; }
  else { const l = Math.hypot(f, r); if (!l) return [0, 0]; f /= l; r /= l; }
  return [-Math.sin(me.yaw) * f + Math.cos(me.yaw) * r, -Math.cos(me.yaw) * f - Math.sin(me.yaw) * r];
}
function updateMe(dt, now) {
  rec.p += (rec.tp - rec.p) * Math.min(1, dt * 28); rec.y += (rec.ty - rec.y) * Math.min(1, dt * 28);
  const dk = Math.exp(-dt * 5.5); rec.tp *= dk; rec.ty *= dk;
  me.bloom = Math.max(0, me.bloom - dt * (performance.now() - me.lastShot > 250 ? 0.09 : 0.02));
  if (me.emote > 0) me.emote -= dt;
  if (myCar) { updateCar(dt, now); return; }
  const [wx, wz] = wish();
  if (wx || wz) me.emote = 0;
  if (me.st === 'ship') {
    if (shipS) { me.x = shipS[0]; me.z = shipS[1]; me.y = S.SHIPY - 8; }
    if ((keys.Space && gameT > 2.5) || gameT > 27 || (!shipS && gameT > 5)) { me.st = 'dive'; keys.Space = false; banner('', 0.01); }
    return;
  }
  if (me.st === 'dive' || me.st === 'glide') {
    const g = groundAt(me.x, me.z, me.y);
    if (me.st === 'dive' && me.y - g < 36) { me.st = 'glide'; noise(0.3, 900, 0.2); }
    const hs = me.st === 'dive' ? 20 : 14, vs = me.st === 'dive' ? 30 + (me.pitch < -0.5 ? 16 : 0) : 7.5;
    const nx = me.x + wx * hs * dt, nz = me.z + wz * hs * dt;
    if (nx * nx + nz * nz < 262 * 262) { me.x = nx; me.z = nz; }
    me.y -= vs * dt; me.speed = 0;
    const g2 = groundAt(me.x, me.z, me.y + 1);
    if (me.y <= g2) { me.y = g2; me.st = 'ground'; me.vy = 0; me.onGround = true; me.ch.land = 1; fx.burst(me.x, me.y + 0.1, me.z, '#b9a47a', 10, 2.5, 0.15, 0.5, 2); }
    return;
  }
  let sp = me.crouch ? 3 : keys.ShiftLeft && !me.ads ? 7.6 : 5.6;
  if (me.ads) sp *= 0.6; if (me.using) sp *= 0.5;
  if (S.height(me.x, me.z) < -0.6) sp *= 0.6;
  const ox = me.x, oz = me.z;
  const steps = Math.max(1, Math.ceil(dt / 0.016)), h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = me.x + (wx * sp + me.kx) * h; if (!blocked(nx, me.z, me.y, me.x, me.z)) me.x = nx; else me.kx = 0;
    const nz = me.z + (wz * sp + me.kz) * h; if (!blocked(me.x, nz, me.y, me.x, me.z)) me.z = nz; else me.kz = 0;
    if (keys.Space && me.onGround) { me.vy = 7.6; me.onGround = false; me.emote = 0; }
    me.vy -= 22 * h;
    let ny = me.y + me.vy * h;
    if (me.vy > 0 && ceiling(me.x, me.z, me.y, ny)) { me.vy = 0; ny = me.y; }
    const g = groundAt(me.x, me.z, me.y);
    if (ny <= g || (me.onGround && me.vy <= 0 && ny - g < 0.4)) {
      if (me.vy < -19) tx({ t: 'fall', d: Math.round((-me.vy - 19) * 7) });
      if (me.vy < -8) { fx.burst(me.x, g + 0.1, me.z, '#b9a47a', 6, 2, 0.12, 0.4, 2); me.ch.land = clamp(-me.vy / 16, 0.4, 1); shake = Math.max(shake, 0.012); }
      ny = g; me.vy = 0; me.onGround = true;
    } else me.onGround = false;
    me.y = ny;
  }
  const kd = Math.exp(-dt * (me.onGround ? 6 : 1.5)); me.kx *= kd; me.kz *= kd;
  me.speed = Math.hypot(me.x - ox, me.z - oz) / dt;
}
function updateCamera(dt) {
  const f = focus(), spec = f !== me, drive = !spec && myCar;
  const yaw = spec ? f.yaw : VY(), pitch = spec ? clamp(f.pitch || 0, -0.6, 0.6) - 0.15 : VP();
  const it = curItem(), scoped = !spec && me.ads && it && it.w === 'sniper';
  const cr = !spec && me.crouch ? 0.35 : 0;
  const cp = Math.cos(pitch); dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  const side = scoped || drive ? 0 : me.ads && !spec ? 0.55 : 0.75;
  pivot.set(f.x + Math.cos(yaw) * side, f.y + (drive ? 2.3 : 1.6) - cr, f.z - Math.sin(yaw) * side);
  let dist = scoped ? 0 : drive ? 8.5 : me.ads && !spec ? 2.1 : me.st === 'ship' && !spec ? 26 : (f.fl & 6) || (!spec && me.st !== 'ground') ? 7 : (f.fl & 16) ? 8 : !spec && me.emote > 0 ? 5.5 : 4.3;
  if (dist > 0 && !(me.st === 'ship' && !spec)) {
    const h = raycast(pivot.x, pivot.y, pivot.z, -dir.x, -dir.y, -dir.z, dist + 0.3, true);
    if (h.kind && h.kind !== 'obj' && h.kind !== 'car') dist = Math.max(0.4, h.dist - 0.3);
  }
  camPos.copy(pivot).addScaledVector(dir, -dist);
  camera.position.copy(camPos); camera.rotation.set(pitch + (Math.random() - 0.5) * shake, yaw + (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake * 0.6);
  shake *= Math.exp(-dt * 9);
  const fov = scoped ? 14 : me.ads && !spec ? 48 : drive ? 70 + Math.min(14, me.speed * 0.6) : keys.ShiftLeft && me.speed > 6 ? 76 : 70;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 14)); camera.updateProjectionMatrix(); lastGap = -1; }
  $('scope').style.display = scoped ? 'block' : 'none';
  if (me.ch && me.alive) me.ch.g.visible = me.st !== 'ship' && !scoped;
  sun.position.set(f.x + 70, f.y + 120, f.z + 45); sun.target.position.set(f.x, f.y, f.z);
  if (spec || !me.alive) updateCross(0, 'none');
  else if (scoped) updateCross(0, 'none');
  else if (it && it.k === 'w' && !me.build && !myCar) updateCross(curSpread(it), it.w === 'sniper' && !me.ads ? 'wide' : 'x');
  else updateCross(0, 'dot');
}
function sitPose(o, c) {
  const s = CARSEAT[c.v], cs = Math.cos(c.yaw), sn = Math.sin(c.yaw);
  o.x = c.x - cs * s[0] - sn * s[2]; o.z = c.z + sn * s[0] - cs * s[2];
  o.y = c.mesh.position.y + s[1] - 0.37; o.sit = true; o.carYaw = c.yaw;
}

// ================= Hauptschleife =================
let lastT = performance.now(), sendAcc = 0, scanAcc = 0, mapAcc = 0, scoreAcc = 0;
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
  for (let i = pops.length - 1; i >= 0; i--) { const p = pops[i]; if (p.hit) { p.t -= dt * 4; p.m.scale.setScalar(1 + Math.sin(Math.max(0, p.t) * 12) * 0.03); if (p.t <= 0) { p.m.scale.setScalar(1); pops.splice(i, 1); } } else { p.t += dt * 7; const k = Math.min(1, p.t); p.m.scale.setScalar(0.55 + 0.45 * (k + Math.sin(k * Math.PI) * 0.25)); if (k >= 1) pops.splice(i, 1); } }
  for (let i = wobbles.length - 1; i >= 0; i--) { const w = wobbles[i]; w.t -= dt; if (w.o.dead) { wobbles.splice(i, 1); continue; } setInst(w.o, 1, w.t > 0 ? Math.sin(w.t * 40) * 0.06 * (w.t / 0.35) : 0); if (w.t <= 0) wobbles.splice(i, 1); }
  const cl = clouds.userData.list;
  for (let i = 0; i < cl.length; i++) { const c = cl[i]; c.x += dt * 2.2; if (c.x > 760) c.x = -760; dummy.position.set(c.x, c.y, c.z); dummy.rotation.set(0, c.r, 0); dummy.scale.set(c.s, c.s * 0.8, c.s); dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix); }
  clouds.instanceMatrix.needsUpdate = true;
  water.position.y = Math.sin(T * 0.7) * 0.07; stormTex.offset.x = T * 0.02; stormTex.offset.y = -T * 0.05;
  fx.update(dt);
  if (phase === 'menu' || phase === 'lobby') {
    const py = S.height(PV.x, PV.z), fxv = -Math.sin(PV.yaw), fzv = -Math.cos(PV.yaw), rx = Math.cos(PV.yaw), rz = -Math.sin(PV.yaw), side = phase === 'lobby' ? 0 : innerWidth / innerHeight > 1.3 ? 1.45 : 0.3;
    camera.position.set(PV.x + fxv * 4.4 + rx * side, py + 1.55, PV.z + fzv * 4.4 + rz * side); camera.lookAt(PV.x + rx * side, py + 1.05, PV.z + rz * side); camera.rotation.order = 'YXZ';
    if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = 55; camera.updateProjectionMatrix(); }
    Object.assign(pvo, { x: PV.x, y: py, z: PV.z, yaw: PV.yaw + Math.sin(T * 0.6) * 0.3, emote: phase === 'lobby' && Math.sin(T * 0.25) > 0.75 });
    poseChar(PV.ch, pvo, dt);
    sun.position.set(PV.x + 70, py + 120, PV.z + 45); sun.target.position.set(PV.x, py, PV.z); sky.position.copy(camera.position);
    renderer.render(scene, camera); return;
  }
  for (const k in ghosts) ghosts[k].visible = false;
  updateBullets(dt); updateNades(dt);
  if (me.alive) {
    updateMe(dt, nowMs);
    updateCamera(dt);
    if (locked) actions(dt, nowMs); else { $('use').style.display = 'none'; arcLine.visible = false; }
    me.swing = clamp((nowMs - me.lastSwing) / 440, 0, 1);
    const it = curItem(), w = me.build ? 'build' : me.slot === 0 ? 'pick' : it ? (it.k === 'w' ? it.w : it.c) : 'none';
    const emote = me.emote > 0 && me.st === 'ground' && !myCar;
    const fl = (me.st === 'ship' ? 1 : me.st === 'dive' ? 2 : me.st === 'glide' ? 4 : 0) | (me.crouch && !myCar ? 8 : 0) | (myCar ? 16 : 0) | (me.reload ? 32 : 0) | (me.ads ? 64 : 0) | (me.swing < 1 && me.slot === 0 ? 128 : 0) | (emote ? 256 : 0);
    me.fl = fl;
    Object.assign(po, { x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: VP(), fl, w, wr: it && it.k === 'w' ? it.r : 0, speed: myCar ? 0 : me.speed, swing: me.swing < 1 ? me.swing : 0, jump: !me.onGround && me.st === 'ground', using: !!me.using, rl: me.reload ? 1 - me.reload.t / me.reload.total : -1, ads: me.ads, sit: false, emote });
    const car = myCar && cars.get(myCar); if (car) sitPose(po, car);
    poseChar(me.ch, po, dt);
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
    if (!ents.get(specId) || !ents.get(specId).alive) { const a = [...ents.values()].find((e) => e.alive); if (a) specId = a.id; }
  }
  sky.position.copy(camera.position);
  $('lock').style.display = me.alive && !locked && phase === 'game' ? 'block' : 'none';
  if (TOUCH) { const ig = me.alive && phase === 'game'; if (ig !== document.body.classList.contains('ingame')) { document.body.classList.toggle('ingame', ig); if (!ig) { joy.id = null; joy.x = joy.y = 0; $('stick').style.display = 'none'; } } }
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
  for (const e of ents.values()) {
    if (!e.alive) {
      if (e.deadT > 0) { e.deadT -= dt; e.speed = 0; e.emote = false; poseChar(e.ch, e, dt); deathPose(e.ch, e.deadT); } else e.ch.g.visible = false;
      continue;
    }
    e.ch.g.visible = !(e.fl & 1);
    const px = e.x, pz = e.z, py = e.y;
    if (Math.hypot(e.tx - e.x, e.tz - e.z) > 25) { e.x = e.tx; e.y = e.ty; e.z = e.tz; }
    e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k;
    let dy = e.tyaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * k;
    e.speed = lerp(e.speed, Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 0.001), 0.2);
    e.rlT = e.fl & 32 ? e.rlT + dt : 0; e.swT += dt;
    e.rl = (e.fl & 32) && S.W[e.w] ? Math.min(0.99, e.rlT / S.W[e.w].rel) : -1;
    e.ads = !!(e.fl & 64); e.swing = e.swT < 0.44 ? e.swT / 0.44 : 0; e.emote = !!(e.fl & 256); e.sit = false;
    e.jump = !(e.fl & 6) && e.y - S.height(e.x, e.z) > 0.35 && Math.abs(e.y - py) / Math.max(dt, 0.001) > 1.5;
    if (e.fl & 16) { let car = null; for (const c of cars.values()) if (c.drv === e.id) { car = c; break; } if (car) { const sx = e.x, sy = e.y, sz = e.z; sitPose(e, car); poseChar(e.ch, e, dt); e.x = sx; e.y = sy; e.z = sz; continue; } }
    poseChar(e.ch, e, dt);
  }
  for (const l of loot.values()) {
    l.spin.rotation.y += dt * 1.8; l.spin.position.y = (l.i.k === 'w' ? 0.75 : 0.3) + Math.sin(T * 2.2 + l.ph) * 0.08;
    if (l.pop !== undefined) { l.pop += dt * 2.4; const q = Math.min(1, l.pop); l.mesh.position.set(lerp(l.from[0], l.x, q), lerp(l.from[1], l.y, q) + Math.sin(q * Math.PI) * 1.5, lerp(l.from[2], l.z, q)); if (q >= 1) { delete l.pop; fx.burst(l.x, l.y + 0.1, l.z, itemColor(l.i), 5, 1.5, 0.08, 0.35, 3); } }
  }
  for (const c of chests.values()) if (c.anim !== undefined) { c.anim = Math.min(1, c.anim + dt * 3.5); const q = c.anim; c.lid.rotation.x = -1.25 * (q + Math.sin(q * Math.PI) * 0.25); if (q >= 1) delete c.anim; }
  if (stormS) {
    stormMesh.visible = stormS[2] < 296; stormMesh.position.set(stormS[0], 120, stormS[1]); stormMesh.scale.set(Math.max(0.5, stormS[2]), 1, Math.max(0.5, stormS[2]));
    const f = focus(); $('tint').style.opacity = Math.hypot(f.x - stormS[0], f.z - stormS[1]) > stormS[2] ? 1 : 0;
  }
  shipMesh.visible = !!shipS;
  if (shipS) { shipMesh.position.set(shipS[0], S.SHIPY, shipS[1]); shipMesh.userData.prop.rotation.z += dt * 25; if (shipMesh.userData.px !== undefined) { const dx = shipS[0] - shipMesh.userData.px, dz = shipS[1] - shipMesh.userData.pz; if (dx || dz) shipMesh.rotation.y = Math.atan2(-dx, -dz); } shipMesh.userData.px = shipS[0]; shipMesh.userData.pz = shipS[1]; }
  if (hudDirty) renderHud();
  mapAcc += dt;
  if (mapAcc > 0.1) {
    mapAcc = 0; const f = focus();
    drawMap($('mini'), f.x, f.z, 190);
    if (!TOUCH) drawCompass(f);
    if ($('bigmap').style.display === 'block') drawMap($('bigmap'), 0, 0, 560, true);
    $('info').innerHTML = '<span>👥 ' + aliveN + '</span><span>☠ ' + me.kills + '</span>';
    if (stormS) {
      const st = S.STORM[stormS[8]], tot = stormS[7] ? st.shrink : st.wait;
      $('stormTxt').textContent = stormS[9] ? 'Sturm geschlossen' : (stormS[7] ? 'Sturm schrumpft ' : 'Sturm in ') + fmtT(stormS[6]);
      $('stormBar').firstChild.style.width = (stormS[9] ? 100 : clamp(1 - stormS[6] / tot, 0, 1) * 100) + '%';
      const dz = Math.hypot(f.x - stormS[3], f.z - stormS[4]) - stormS[5];
      $('zone').textContent = dz > 0 ? '→ ' + Math.round(dz) + ' m' : '✓ sicher'; $('zone').style.color = dz > 0 ? '#ffb347' : '#7df07a';
    }
    const sp = $('spec'); if (!me.alive && ents.get(specId) && ents.get(specId).alive) { sp.style.display = 'block'; sp.innerHTML = 'Du beobachtest <b>' + esc(nameOf(specId)) + '</b>'; } else sp.style.display = 'none';
    scoreAcc += 1; if (scoreAcc > 5 && $('score').style.display === 'block') { scoreAcc = 0; renderScore(); }
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.__dbg = { me, ents, pieces, loot, chests, cars, objs, nades, keys, tx, S, rec, get phase() { return phase; }, get myCar() { return myCar; }, set locked(v) { locked = v; }, setMouse(l, r) { mouseL = l; mouseR = r; }, setSlot, interact };
