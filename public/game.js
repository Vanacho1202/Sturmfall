import * as THREE from './lib/three.module.js';
const S = window.S, G = S.G, H = S.H;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const TOUCH = /[?&]touch=1/.test(location.search) || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);
if (TOUCH) document.body.classList.add('touch');

// ================= Renderer / Szene =================
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.25 : 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ecbff);
scene.fog = new THREE.Fog(0xa9d6ff, 140, 620);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 1500);
camera.rotation.order = 'YXZ';
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
scene.add(new THREE.HemisphereLight(0xd6ecff, 0x5d6b3f, 1.15));
const sun = new THREE.DirectionalLight(0xfff1d0, 1.9);
sun.castShadow = true; sun.shadow.mapSize.set(TOUCH ? 1024 : 2048, TOUCH ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -65, right: 65, top: 65, bottom: -65, near: 1, far: 320 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.05;
scene.add(sun, sun.target);

// ---- Gelände
const hash = (x, z) => { const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453; return s - Math.floor(s); };
function groundColor(x, z, h) {
  if (h < 0.7) return [0.87, 0.81, 0.58];
  const n = hash(Math.round(x / 6), Math.round(z / 6));
  if (S.poiAt(x, z, 3)) return [0.62 + n * 0.05, 0.6 + n * 0.05, 0.52];
  if (h > 17) return [0.55 + n * 0.06, 0.56 + n * 0.06, 0.52];
  return [0.3 + n * 0.1, 0.62 + n * 0.12, 0.24 + n * 0.05];
}
{
  const tg = new THREE.PlaneGeometry(560, 560, 186, 186); tg.rotateX(-Math.PI / 2);
  const pos = tg.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = S.height(x, z);
    pos.setY(i, h); col.set(groundColor(x, z, h), i * 3);
  }
  tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.computeVertexNormals();
  const terrain = new THREE.Mesh(tg, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true; scene.add(terrain);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ color: 0x2f8fd6, transparent: true, opacity: 0.86 }));
  water.rotation.x = -Math.PI / 2; scene.add(water);
}
// ---- Texturen
function tex(draw) {
  const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d'));
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const MATCOL = { wood: '#b9824a', stone: '#9c9c9c', metal: '#6d8296' };
const pieceMat = {
  wood: new THREE.MeshLambertMaterial({ map: tex((g) => { g.fillStyle = '#b9824a'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#7d5226'; g.lineWidth = 3; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(128, i * 32); g.stroke(); } g.lineWidth = 6; g.strokeRect(3, 3, 122, 122); g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 128); g.stroke(); }) }),
  stone: new THREE.MeshLambertMaterial({ map: tex((g) => { g.fillStyle = '#9c9c9c'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#6f6f6f'; g.lineWidth = 3; for (let r = 0; r < 4; r++) { g.beginPath(); g.moveTo(0, r * 32); g.lineTo(128, r * 32); g.stroke(); for (let c = 0; c < 3; c++) { const x = c * 64 + (r % 2 ? 32 : 0); g.beginPath(); g.moveTo(x, r * 32); g.lineTo(x, r * 32 + 32); g.stroke(); } } g.lineWidth = 5; g.strokeRect(2, 2, 124, 124); }) }),
  metal: new THREE.MeshLambertMaterial({ map: tex((g) => { g.fillStyle = '#6d8296'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#46586a'; g.lineWidth = 5; g.strokeRect(3, 3, 122, 122); g.strokeRect(3, 3, 61, 122); g.fillStyle = '#c3d0db'; for (const [x, y] of [[12, 12], [116, 12], [12, 116], [116, 116], [64, 12], [64, 116]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); } }) }),
};
const RL = Math.hypot(G, H);
const pieceGeo = { w: new THREE.BoxGeometry(G, H, 0.24), f: new THREE.BoxGeometry(G, 0.24, G), r: new THREE.BoxGeometry(G, 0.2, RL) };
function placePiece(m, p) {
  m.rotation.set(0, 0, 0);
  if (p.t === 'w') { if (p.d === 0) m.position.set((p.ix + 0.5) * G, (p.iy + 0.5) * H, p.iz * G); else { m.position.set(p.ix * G, (p.iy + 0.5) * H, (p.iz + 0.5) * G); m.rotation.y = Math.PI / 2; } }
  else if (p.t === 'f') m.position.set((p.ix + 0.5) * G, p.iy * H, (p.iz + 0.5) * G);
  else { m.position.set((p.ix + 0.5) * G, (p.iy + 0.5) * H, (p.iz + 0.5) * G); m.rotation.order = 'YXZ'; m.rotation.y = p.rot * Math.PI / 2; m.rotation.x = -Math.atan2(H, G); }
}

// ================= Welt =================
const worldGroup = new THREE.Group(); scene.add(worldGroup);
const pieces = new Map(), loot = new Map(), chests = new Map(), objs = new Map();
let objList = [], objGrid = new Map(), inst = {};
const dummy = new THREE.Object3D();
function clearWorld() {
  worldGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); });
  worldGroup.clear(); pieces.clear(); loot.clear(); chests.clear(); objs.clear(); objList = []; objGrid = new Map();
}
function addPieceMesh(p) {
  if (pieces.has(p.key)) return;
  const m = new THREE.Mesh(pieceGeo[p.t], pieceMat[p.mat]); m.castShadow = m.receiveShadow = true;
  placePiece(m, p); p.mesh = m; worldGroup.add(m); pieces.set(p.key, p);
}
function removePiece(k) { const p = pieces.get(k); if (!p) return; worldGroup.remove(p.mesh); pieces.delete(k); }
const lootGeo = { gun: new THREE.BoxGeometry(0.16, 0.2, 0.9), can: new THREE.CylinderGeometry(0.2, 0.2, 0.42, 10), box: new THREE.BoxGeometry(0.4, 0.3, 0.4), ring: new THREE.RingGeometry(0.45, 0.6, 20) };
function itemColor(i) { return i.k === 'w' ? S.RAR[i.r].c : i.k === 'c' ? S.CONS[i.c].col : i.k === 'a' ? '#c9b458' : MATCOL[i.m]; }
function itemName(i) { return i.k === 'w' ? S.W[i.w].n + ' (' + S.RAR[i.r].n + ')' : i.k === 'c' ? S.CONS[i.c].n + (i.n > 1 ? ' ×' + i.n : '') : i.k === 'a' ? S.AMMO[i.a] + ' ×' + i.n : S.MATS[i.m].n + ' ×' + i.n; }
function addLootMesh(l) {
  const g = new THREE.Group(), col = new THREE.Color(itemColor(l.i));
  const m = new THREE.Mesh(l.i.k === 'w' ? lootGeo.gun : l.i.k === 'c' ? lootGeo.can : lootGeo.box, new THREE.MeshLambertMaterial({ color: l.i.k === 'w' ? 0x2a2d33 : col, emissive: col, emissiveIntensity: l.i.k === 'w' ? 0.55 : 0.25 }));
  if (l.i.k === 'w') { m.scale.z = { ar: 1.1, smg: 0.75, shotgun: 1.15, pistol: 0.45, sniper: 1.5 }[l.i.w]; m.rotation.z = 0.5; }
  m.position.y = 0.65; g.add(m);
  const ring = new THREE.Mesh(lootGeo.ring, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; g.add(ring);
  g.position.set(l.x, l.y, l.z); l.mesh = g; l.spin = m; worldGroup.add(g); loot.set(l.id, l);
}
function addChestMesh(c) {
  const g = new THREE.Group();
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), new THREE.MeshLambertMaterial({ color: 0x8a5a2b })); b.position.y = 0.3; b.castShadow = true;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.26, 0.86), new THREE.MeshLambertMaterial({ color: 0xffc83a, emissive: 0xffa500, emissiveIntensity: 0.5 })); lid.position.y = 0.72;
  g.add(b, lid); g.position.set(c.x, c.y, c.z); c.mesh = g; c.lid = lid; worldGroup.add(g); chests.set(c.id, c);
  if (c.open) openChest(c);
}
function openChest(c) { c.open = 1; c.lid.position.set(0, 0.85, -0.5); c.lid.rotation.x = -1.1; c.lid.material.emissiveIntensity = 0; c.lid.material.color.set(0x8a6a2b); }
function buildWorld(w) {
  clearWorld();
  const count = { tree: 0, rock: 0 };
  for (const o of w.objs) if (count[o.t] !== undefined) count[o.t]++;
  const flat = { flatShading: true };
  inst = {
    trunk: new THREE.InstancedMesh(new THREE.CylinderGeometry(0.28, 0.42, 3.2, 6).translate(0, 1.6, 0), new THREE.MeshLambertMaterial({ color: 0x6b4526, ...flat }), count.tree),
    crown: new THREE.InstancedMesh(new THREE.ConeGeometry(2.1, 5, 7).translate(0, 5.2, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, ...flat }), count.tree),
    rock: new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1.3).scale(1, 0.8, 1).translate(0, 0.5, 0), new THREE.MeshLambertMaterial({ color: 0x8d8f94, ...flat }), count.rock),
  };
  for (const k in inst) { inst[k].castShadow = true; inst[k].receiveShadow = true; worldGroup.add(inst[k]); }
  const idx = { tree: 0, rock: 0 }, c = new THREE.Color();
  for (const o of w.objs) {
    o.y = S.height(o.x, o.z); objs.set(o.id, o); objList.push(o);
    if (o.t === 'car') {
      const g = new THREE.Group(), cm = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hash(o.x, o.z), 0.6, 0.45) });
      const b = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.8, 2), cm); b.position.y = 0.75;
      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.7, 1.8), new THREE.MeshLambertMaterial({ color: 0x29323c })); cab.position.set(-0.2, 1.45, 0);
      const wh = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.6, 2.15), new THREE.MeshLambertMaterial({ color: 0x151515 })); wh.position.y = 0.32;
      b.castShadow = cab.castShadow = true; g.add(b, cab, wh); g.position.set(o.x, o.y, o.z); g.rotation.y = o.r ? Math.PI / 2 : 0;
      worldGroup.add(g); o.mesh = g; o.rad = 1.7; o.top = 1.8;
      const hx = o.r ? 1.0 : 2.1, hz = o.r ? 2.1 : 1.0; o.box = [o.x - hx, o.y, o.z - hz, o.x + hx, o.y + 1.8, o.z + hz];
    } else {
      const i = idx[o.t]++; o.i = i;
      dummy.position.set(o.x, o.y - 0.1, o.z); dummy.rotation.set(0, hash(o.x, o.z) * 6.28, 0); dummy.scale.setScalar(o.s); dummy.updateMatrix();
      if (o.t === 'tree') {
        inst.trunk.setMatrixAt(i, dummy.matrix); inst.crown.setMatrixAt(i, dummy.matrix);
        inst.crown.setColorAt(i, c.setHSL(0.27 + hash(o.z, o.x) * 0.1, 0.6, 0.27 + hash(o.x, o.z) * 0.1));
        o.rad = 0.45 * o.s; o.top = 7 * o.s; const hw = 0.55 * o.s; o.box = [o.x - hw, o.y, o.z - hw, o.x + hw, o.y + 6 * o.s, o.z + hw];
      } else {
        inst.rock.setMatrixAt(i, dummy.matrix);
        o.rad = 1.2 * o.s; o.top = 1.5 * o.s; const hw = 1.1 * o.s; o.box = [o.x - hw, o.y, o.z - hw, o.x + hw, o.y + 1.5 * o.s, o.z + hw];
      }
    }
    const k = Math.floor(o.x / 16) + ',' + Math.floor(o.z / 16);
    if (!objGrid.has(k)) objGrid.set(k, []); objGrid.get(k).push(o);
  }
  for (const p of w.pieces) addPieceMesh(p);
  for (const l of w.loot) addLootMesh(l);
  for (const ch of w.chests) addChestMesh(ch);
}
function removeObj(id) {
  const o = objs.get(id); if (!o) return; o.dead = true; objs.delete(id);
  if (o.mesh) worldGroup.remove(o.mesh);
  else { dummy.position.set(0, -500, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix(); if (o.t === 'tree') { inst.trunk.setMatrixAt(o.i, dummy.matrix); inst.crown.setMatrixAt(o.i, dummy.matrix); inst.trunk.instanceMatrix.needsUpdate = inst.crown.instanceMatrix.needsUpdate = true; } else { inst.rock.setMatrixAt(o.i, dummy.matrix); inst.rock.instanceMatrix.needsUpdate = true; } }
}

// ---- Sturmwand + Luftschiff
const stormMesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 400, 72, 1, true), new THREE.MeshBasicMaterial({ color: 0x8b3dff, transparent: true, opacity: 0.33, side: THREE.DoubleSide, depthWrite: false, fog: false }));
stormMesh.visible = false; scene.add(stormMesh);
const shipMesh = new THREE.Group();
{
  const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshLambertMaterial({ color: 0xff7a2f })); hull.scale.set(7, 6, 17);
  const stripe = new THREE.Mesh(new THREE.SphereGeometry(1.01, 20, 14, 0, 6.3, 1.35, 0.4), new THREE.MeshLambertMaterial({ color: 0xffe066 })); stripe.scale.set(7, 6, 17);
  const gond = new THREE.Mesh(new THREE.BoxGeometry(4, 2.6, 9), new THREE.MeshLambertMaterial({ color: 0x3a4a6b })); gond.position.y = -7;
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.4, 7, 5), new THREE.MeshLambertMaterial({ color: 0x3a4a6b })); fin.position.set(0, 0, 15);
  const fin2 = fin.clone(); fin2.rotation.z = Math.PI / 2;
  shipMesh.add(hull, stripe, gond, fin, fin2); shipMesh.visible = false; scene.add(shipMesh);
}

// ================= Figuren =================
function makeChar(hue) {
  const g = new THREE.Group(); g.rotation.order = 'YXZ';
  const skin = new THREE.MeshLambertMaterial({ color: 0xe8b990 });
  const c1 = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(hue / 360, 0.7, 0.5) });
  const c2 = new THREE.MeshLambertMaterial({ color: new THREE.Color().setHSL(((hue + 30) % 360) / 360, 0.45, 0.22) });
  const dark = new THREE.MeshLambertMaterial({ color: 0x23262b });
  const box = (w, h, d, m, x, y, z, par) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; par.add(b); return b; };
  const body = new THREE.Group(); g.add(body);
  box(0.56, 0.62, 0.3, c1, 0, 1.1, 0, body);
  box(0.36, 0.36, 0.36, skin, 0, 1.62, 0, body);
  box(0.4, 0.13, 0.4, c2, 0, 1.83, 0, body);
  box(0.3, 0.08, 0.06, dark, 0, 1.66, 0.17, body);
  box(0.4, 0.46, 0.18, c2, 0, 1.12, -0.24, body);
  const limb = (x, y, len, m, par) => { const p = new THREE.Group(); p.position.set(x, y, 0); box(0.2, len, 0.22, m, 0, -len / 2, 0, p); par.add(p); return p; };
  const legL = limb(-0.15, 0.8, 0.8, c2, g), legR = limb(0.15, 0.8, 0.8, c2, g);
  const armL = limb(-0.39, 1.38, 0.62, c1, body), armR = limb(0.39, 1.38, 0.62, c1, body);
  const gun = new THREE.Group(); box(0.1, 0.75, 0.14, dark, 0, -0.85, 0.08, gun); box(0.08, 0.14, 0.24, dark, 0, -0.62, 0.22, gun); armR.add(gun);
  const pick = new THREE.Group(); box(0.07, 0.07, 1.0, new THREE.MeshLambertMaterial({ color: 0x8a5a2b }), 0, -0.6, 0.42, pick); box(0.62, 0.1, 0.1, new THREE.MeshLambertMaterial({ color: 0xc9d2da }), 0, -0.6, 0.9, pick); armR.add(pick);
  const glider = new THREE.Group(); box(3.2, 0.1, 1.5, c1, 0, 3.1, 0, glider); box(1.0, 0.11, 1.5, new THREE.MeshLambertMaterial({ color: 0xffffff }), 0, 3.1, 0, glider);
  box(0.04, 1.3, 0.04, dark, -0.5, 2.5, 0, glider); box(0.04, 1.3, 0.04, dark, 0.5, 2.5, 0, glider); glider.visible = false; g.add(glider);
  scene.add(g);
  return { g, body, legL, legR, armL, armR, gun, pick, glider, walk: 0 };
}
function poseChar(ch, o, dt) {
  // o: x,y,z,yaw,pitch,fl,w,speed,swing
  ch.g.position.set(o.x, o.y, o.z); ch.g.rotation.y = o.yaw + Math.PI;
  const air = o.fl & 6, crouch = o.fl & 8;
  ch.g.rotation.x = o.fl & 2 ? 1.15 : 0;
  ch.glider.visible = !!(o.fl & 4);
  ch.body.position.y = crouch ? -0.32 : 0; ch.body.rotation.x = crouch ? 0.3 : 0;
  ch.walk += dt * Math.min(o.speed, 8) * 1.9;
  const sw = air ? 0 : Math.sin(ch.walk) * Math.min(1, o.speed / 4) * (crouch ? 0.5 : 0.85);
  ch.legL.rotation.x = sw + (crouch ? -0.7 : 0); ch.legR.rotation.x = -sw + (crouch ? 0.5 : 0);
  ch.legL.position.y = ch.legR.position.y = crouch ? 0.62 : 0.8;
  const isGun = !!S.W[o.w];
  ch.gun.visible = isGun; ch.pick.visible = o.w === 'pick' && !air;
  if (o.fl & 4) { ch.armL.rotation.x = ch.armR.rotation.x = Math.PI; }
  else if (isGun) { ch.armR.rotation.x = -(Math.PI / 2 + o.pitch); ch.armL.rotation.x = -(Math.PI / 2 + o.pitch) + 0.15; ch.armL.rotation.z = 0.5; ch.armR.rotation.z = 0; return; }
  else if (o.w === 'pick') { const s = o.swing || 0; ch.armR.rotation.x = -0.6 - Math.sin(s * Math.PI) * 1.5; ch.armL.rotation.x = -sw; }
  else { ch.armR.rotation.x = -1.2; ch.armL.rotation.x = -1.2; }
  ch.armL.rotation.z = 0; ch.armR.rotation.z = 0;
}

// ================= Zustand =================
let ws, myId = 0, phase = 'menu', rosterMap = new Map(), stormS = null, shipS = null, aliveN = 0, gameT = 0, stateTick = 0, specId = 0;
const ents = new Map();
const me = { x: 0, y: 0, z: 0, vy: 0, yaw: 0, pitch: 0, onGround: false, hp: 100, sh: 0, alive: false, st: 'ship', crouch: false, slot: 0, inv: [null, null, null, null, null], ammo: {}, mats: {}, build: null, bmat: 'wood', lastShot: 0, reload: null, using: null, kills: 0, swing: 0, lastSwing: 0, lastBuild: 0, speed: 0, ch: null, ads: false };
function resetMe() {
  Object.assign(me, { vy: 0, pitch: -0.2, onGround: false, hp: 100, sh: 0, alive: true, st: 'ship', crouch: false, slot: 0, inv: [null, null, null, null, null], ammo: { light: 0, medium: 0, shells: 0, heavy: 0 }, mats: { wood: 0, stone: 0, metal: 0 }, build: null, bmat: 'wood', reload: null, using: null, kills: 0 });
  hudDirty = true;
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
function blocked(x, z, y, ox, oz) {
  if (x * x + z * z > 262 * 262) return true;
  const cx = Math.floor(x / G), cz = Math.floor(z / G), y0 = Math.floor((y + 0.5) / H), y1 = Math.floor((y + 1.7) / H);
  for (let iy = y0; iy <= y1; iy++) for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
    const b = ':' + ix + ':' + iy + ':' + iz;
    if (pieces.has('w' + b + ':0') && inW0(x, z, ix, iz) && !inW0(ox, oz, ix, iz)) return true;
    if (pieces.has('w' + b + ':1') && inW1(x, z, ix, iz) && !inW1(ox, oz, ix, iz)) return true;
  }
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
    const arr = objGrid.get(a + ',' + b); if (!arr) continue;
    for (const o of arr) {
      if (o.dead || y > o.y + o.top) continue;
      const r = o.rad + 0.35, dx = x - o.x, dz = z - o.z, d = dx * dx + dz * dz;
      if (d < r * r) { const ex = ox - o.x, ez = oz - o.z; if (ex * ex + ez * ez >= d) return true; }
    }
  }
  return false;
}
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
  if (!noPlayers) for (const e of ents.values()) {
    if (!e.alive || (e.fl & 1)) continue;
    const cr = e.fl & 8 ? 0.35 : 0;
    const cx = e.x - ox, cy = e.y + 1.62 - cr - oy, cz = e.z - oz, tca = cx * dx + cy * dy + cz * dz;
    if (tca > 0 && tca < best + 1) {
      const d2 = cx * cx + cy * cy + cz * cz - tca * tca;
      if (d2 < 0.075) { const t = tca - Math.sqrt(0.075 - d2); if (t > 0 && t < best) { best = t; res = { kind: 'player', id: e.id, head: true }; } }
    }
    tb[0] = e.x - 0.4; tb[1] = e.y + 0.05; tb[2] = e.z - 0.4; tb[3] = e.x + 0.4; tb[4] = e.y + 1.42 - cr; tb[5] = e.z + 0.4;
    const t = S.rayBox(ox, oy, oz, dx, dy, dz, tb);
    if (t !== null && t < best) { best = t; res = { kind: 'player', id: e.id, head: false }; }
  }
  let t = 0, prev = 0, step = 1;
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

// ================= Ton =================
let AC = null, noiseBuf = null;
function initAudio() {
  if (AC) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.4, AC.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
function shotSound(w, vol) { const p = { ar: [0.16, 1700], smg: [0.1, 2600], shotgun: [0.32, 900], pistol: [0.12, 2200], sniper: [0.4, 700] }[w] || [0.1, 2000]; noise(p[0], p[1], 0.5 * vol); if (vol > 0.3) tone(170, 50, p[0] * 0.8, 0.22 * vol, 'sawtooth'); }

// ================= Effekte / HUD =================
const tracers = [];
function tracer(a, b, col) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color: col || 0xfff2a8, transparent: true, opacity: 0.9 }));
  scene.add(l); tracers.push({ l, t: 0.09 });
}
let bannerT = 0;
function banner(txt, dur) { const b = $('banner'); b.textContent = txt; b.style.opacity = 1; bannerT = dur || 3; }
function feed(html) { const d = document.createElement('div'); d.innerHTML = html; $('feed').prepend(d); setTimeout(() => d.remove(), 6500); while ($('feed').children.length > 6) $('feed').lastChild.remove(); }
let gainT = 0;
function gain(txt) { const g = $('gain'); g.textContent = txt; g.style.opacity = 1; gainT = 1.2; }
const nameOf = (id) => (rosterMap.get(id) || {}).name || '???';
const esc = (s) => String(s).replace(/[<>&]/g, '');
const v3 = new THREE.Vector3();
function dmgNumber(e, n, head, sh) {
  v3.set(e.x, e.y + 2.1, e.z).project(camera); if (v3.z > 1) return;
  const d = document.createElement('div'); d.className = 'dn'; d.textContent = n;
  d.style.color = head ? '#ffe23a' : sh ? '#5cc4ff' : '#fff';
  d.style.left = ((v3.x + 1) / 2 * innerWidth + (Math.random() - 0.5) * 30) + 'px'; d.style.top = ((1 - v3.y) / 2 * innerHeight) + 'px';
  document.body.appendChild(d); requestAnimationFrame(() => { d.style.transform = 'translateY(-60px)'; d.style.opacity = 0; }); setTimeout(() => d.remove(), 750);
}
function show(id, on) { $(id).classList.toggle('on', on); }
function renderHud() {
  hudDirty = false;
  $('shb').firstChild.style.width = me.sh + '%'; $('shb').lastChild.textContent = me.sh;
  $('hpb').firstChild.style.width = me.hp + '%'; $('hpb').lastChild.textContent = me.hp;
  let h = '<div data-slot="0" class="slot' + (me.slot === 0 && !me.build ? ' sel' : '') + '"><span class="k">1</span>⛏<br>HACKE</div>';
  me.inv.forEach((it, i) => {
    const sel = me.slot === i + 1 && !me.build ? ' sel' : '';
    const ds = '<div data-slot="' + (i + 1) + '" class="slot';
    if (!it) h += ds + sel + '"><span class="k">' + (i + 2) + '</span></div>';
    else if (it.k === 'w') h += ds + sel + '" style="background:' + S.RAR[it.r].c + 'cc"><span class="k">' + (i + 2) + '</span>' + S.W[it.w].s + '<span class="a">' + it.mag + '</span></div>';
    else h += ds + sel + '" style="background:#3d4756cc"><span class="k">' + (i + 2) + '</span><span style="color:' + S.CONS[it.c].col + '">' + S.CONS[it.c].s + '</span><span class="a">' + it.n + '</span></div>';
  });
  $('inv').innerHTML = h;
  const bn = { w: ['Q', 'Wand'], f: ['F', 'Boden'], r: ['C', 'Rampe'] };
  let b = '';
  for (const k in bn) b += '<div data-b="' + k + '" class="bs' + (me.build === k ? ' sel' : '') + '">' + (TOUCH ? '' : bn[k][0] + ' ') + bn[k][1] + '</div>';
  for (const m in S.MATS) b += '<div data-m="' + m + '" class="mat' + (me.bmat === m && me.build ? ' sel' : '') + '" style="color:' + MATCOL[m] + '">■ <span style="color:#fff">' + me.mats[m] + '</span></div>';
  $('build').innerHTML = b;
  const it = me.slot > 0 ? me.inv[me.slot - 1] : null;
  $('ammo').innerHTML = !me.build && it && it.k === 'w' ? it.mag + ' <small>/ ' + me.ammo[S.W[it.w].ammo] + '</small>' : '';
}

// ---- Karte
const mapC = document.createElement('canvas'); mapC.width = mapC.height = 280;
{
  const g = mapC.getContext('2d'), im = g.createImageData(280, 280);
  for (let j = 0; j < 280; j++) for (let i = 0; i < 280; i++) {
    const x = (i / 280) * 560 - 280, z = (j / 280) * 560 - 280, h = S.height(x, z);
    let c = h < 0 ? [0.18, 0.56, 0.84] : groundColor(x, z, h);
    const sh = h < 0 ? 1 : 0.82 + clamp((S.height(x - 3, z - 3) - h) * -0.08 + 0.15, -0.2, 0.3);
    im.data.set([c[0] * 255 * sh, c[1] * 255 * sh, c[2] * 255 * sh, 255], (j * 280 + i) * 4);
  }
  g.putImageData(im, 0, 0);
}
function drawMap(cv, cx, cz, span, big) {
  const g = cv.getContext('2d'), W = cv.width, k = W / span, px = (x) => (x - cx) * k + W / 2, pz = (z) => (z - cz) * k + W / 2;
  g.fillStyle = '#2d8fd6'; g.fillRect(0, 0, W, W);
  g.imageSmoothingEnabled = true;
  g.drawImage(mapC, px(-280), pz(-280), 560 * k, 560 * k);
  if (big) { g.font = '800 15px Segoe UI,Arial'; g.textAlign = 'center'; g.lineWidth = 4; g.lineJoin = 'round'; g.strokeStyle = 'rgba(0,0,0,.7)'; g.fillStyle = '#fff'; for (const p of S.POIS) { g.strokeText(p.n, px(p.x), pz(p.z)); g.fillText(p.n, px(p.x), pz(p.z)); } }
  if (stormS) {
    g.fillStyle = 'rgba(140,60,230,.45)'; g.beginPath(); g.rect(0, 0, W, W); g.arc(px(stormS[0]), pz(stormS[1]), Math.max(0.1, stormS[2] * k), 0, 6.3, true); g.fill('evenodd');
    g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(px(stormS[3]), pz(stormS[4]), Math.max(0.1, stormS[5] * k), 0, 6.3); g.stroke();
  }
  if (shipS) { g.fillStyle = '#ff7a2f'; g.beginPath(); g.arc(px(shipS[0]), pz(shipS[1]), 6, 0, 6.3); g.fill(); g.strokeStyle = '#fff'; g.stroke(); }
  const f = focus();
  g.save(); g.translate(px(f.x), pz(f.z)); g.rotate(-f.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 7); g.lineTo(0, 3); g.lineTo(-6, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
}
const focus = () => (me.alive ? me : ents.get(specId) || me);

// ================= Netzwerk =================
function setRoster(r) { rosterMap = new Map(r.map((a) => [a[0], { name: a[1], hue: a[2], bot: a[3] }])); }
function dropEnts() { for (const e of ents.values()) scene.remove(e.ch.g); ents.clear(); }
function connect(name) {
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  ws.onopen = () => tx({ t: 'join', name });
  ws.onclose = () => { banner('Verbindung getrennt – Seite neu laden', 999); };
  ws.onmessage = (ev) => onMsg(JSON.parse(ev.data));
}
function onMsg(m) {
  switch (m.t) {
    case 'init':
      myId = m.id; setRoster(m.roster);
      if (m.world) { buildWorld(m.world); phase = 'game'; me.alive = false; show('hud', true); show('dead', true); $('deadT').textContent = 'Runde läuft'; $('deadS').textContent = 'Du schaust zu – in der nächsten Runde bist du dabei. ' + (TOUCH ? 'Tippen' : 'Klick') + ': Spieler wechseln'; }
      else { phase = 'lobby'; show('lobby', true); }
      break;
    case 'lobby':
      phase = 'lobby'; clearWorld(); dropEnts(); stormS = shipS = null; me.alive = false; if (me.ch) me.ch.g.visible = false;
      show('lobby', true); show('dead', false); show('win', false); show('hud', false); stormMesh.visible = shipMesh.visible = false; $('tint').style.opacity = 0;
      break;
    case 'start':
      setRoster(m.roster); dropEnts(); buildWorld(m.world); resetMe(); phase = 'game'; $('feed').innerHTML = '';
      show('lobby', false); show('dead', false); show('win', false); show('hud', true);
      if (!me.ch) me.ch = makeChar((rosterMap.get(myId) || { hue: 200 }).hue);
      banner(TOUCH ? 'SPRUNG-Taste: Abspringen!' : 'Leertaste: Abspringen!', 5);
      break;
    case 's': onState(m); break;
    case 'pc+': addPieceMesh(m.p); if (Math.hypot((m.p.ix + 0.5) * G - me.x, (m.p.iz + 0.5) * G - me.z) < 40) tone(140, 90, 0.08, 0.12, 'triangle'); break;
    case 'pc-': removePiece(m.k); break;
    case 'pchp': { const p = pieces.get(m.k); if (p) p.hp = m.hp; break; }
    case 'obj-': removeObj(m.id); break;
    case 'loot+': addLootMesh(m.l); break;
    case 'loot-': { const l = loot.get(m.id); if (l) { worldGroup.remove(l.mesh); loot.delete(m.id); } pending.delete(m.id); break; }
    case 'chest': { const c = chests.get(m.id); if (c) { openChest(c); if (Math.hypot(c.x - me.x, c.z - me.z) < 30) tone(500, 1100, 0.25, 0.12, 'triangle'); } break; }
    case 'got': gotItem(m.i); break;
    case 'mat': me.mats[m.m] = Math.min(999, me.mats[m.m] + m.n); gain('+' + m.n + ' ' + S.MATS[m.m].n); hudDirty = true; break;
    case 'dmg': { const e = ents.get(m.id); $('hitm').style.opacity = 1; setTimeout(() => ($('hitm').style.opacity = 0), 110); tone(m.head ? 1500 : 950, m.head ? 1200 : 700, 0.07, 0.14, 'square'); if (e) dmgNumber(e, m.n, m.head, m.sh); break; }
    case 'hurt': $('hurt').style.opacity = 0.9; setTimeout(() => ($('hurt').style.opacity = 0), 160); noise(0.12, 500, 0.3); break;
    case 'shot': { tracer(m.o, m.e); const d = Math.hypot(m.o[0] - camera.position.x, m.o[2] - camera.position.z); shotSound(m.w, clamp(1 - d / 160, 0, 0.8)); break; }
    case 'roster': setRoster(m.r); break;
    case 'kill': {
      const v = esc(nameOf(m.v)), k = m.k ? esc(nameOf(m.k)) : '';
      const wn = S.W[m.w] ? S.W[m.w].n : m.w === 'pick' ? 'Spitzhacke' : '';
      feed(m.w === 'storm' ? '<b>' + v + '</b> wurde vom Sturm erwischt' : m.w === 'fall' ? '<b>' + v + '</b> ist zu tief gefallen' : m.w === 'quit' ? '<b>' + v + '</b> hat das Spiel verlassen' : '<b>' + k + '</b> ⟶ <b>' + v + '</b> <span style="opacity:.75">(' + wn + ')</span>');
      if (m.k === myId) { me.kills = m.kills; banner('Eliminiert: ' + nameOf(m.v), 2.5); }
      if (m.v === myId) die(m);
      else if (m.v === specId && m.k) specId = m.k;
      break;
    }
    case 'win':
      phase = 'end'; show('dead', false); show('win', true);
      if (m.id === myId) { $('winT').textContent = '#1 EPISCHER SIEG!'; $('winS').textContent = me.kills + ' Eliminierungen'; tone(520, 1040, 0.6, 0.2, 'triangle'); }
      else { $('winT').textContent = (m.name || 'Niemand') + ' gewinnt'; $('winS').textContent = 'Neue Runde startet gleich …'; }
      break;
  }
}
function onState(m) {
  if (m.ph === 'lobby') { $('lobbyT').textContent = m.tm; $('lobbyN').textContent = 'In der Lobby: ' + m.names.join(', '); return; }
  if (stormS && m.st[7] && !stormS[7]) banner('Der Sturm zieht sich zusammen!', 3.5);
  stormS = m.st; shipS = m.ship; aliveN = m.al; gameT = m.gt; stateTick++;
  for (const a of m.p) {
    if (a[0] === myId) { if (me.hp !== a[6] || me.sh !== a[7]) { me.hp = a[6]; me.sh = a[7]; hudDirty = true; } continue; }
    let e = ents.get(a[0]);
    if (!e) { e = { id: a[0], x: a[1], y: a[2], z: a[3], yaw: a[4], speed: 0, ch: makeChar((rosterMap.get(a[0]) || { hue: 0 }).hue) }; ents.set(a[0], e); }
    e.tx = a[1]; e.ty = a[2]; e.tz = a[3]; e.tyaw = a[4]; e.pitch = a[5]; e.hp = a[6]; e.sh = a[7]; e.fl = a[8]; e.w = a[9]; e.seen = stateTick; e.alive = true;
  }
  for (const e of ents.values()) if (e.seen !== stateTick) e.alive = false;
}

// ================= Inventar =================
const curItem = () => (me.slot > 0 ? me.inv[me.slot - 1] : null);
function hasRoom(i) {
  if (i.k === 'a' || i.k === 'm') return true;
  if (i.k === 'c' && me.inv.some((s) => s && s.k === 'c' && s.c === i.c && s.n < S.CONS[i.c].max)) return true;
  return me.inv.includes(null) || me.slot > 0;
}
function gotItem(i) {
  tone(700, 1200, 0.09, 0.1, 'triangle'); hudDirty = true;
  if (i.k === 'a') { me.ammo[i.a] += i.n; return; }
  if (i.k === 'm') { me.mats[i.m] = Math.min(999, me.mats[i.m] + i.n); return; }
  if (i.k === 'c') {
    const s = me.inv.find((q) => q && q.k === 'c' && q.c === i.c && q.n < S.CONS[i.c].max);
    if (s) { const add = Math.min(i.n, S.CONS[i.c].max - s.n); s.n += add; i.n -= add; if (i.n <= 0) return; }
  }
  let e = me.inv.indexOf(null);
  if (e < 0) { if (me.slot === 0) { tx({ t: 'drop', i }); return; } e = me.slot - 1; tx({ t: 'drop', i: me.inv[e] }); me.reload = me.using = null; }
  me.inv[e] = i;
}
function setSlot(n) { me.slot = n; me.build = null; me.reload = null; me.using = null; hudDirty = true; }
function startReload() {
  const it = curItem(); if (!it || it.k !== 'w' || me.reload) return;
  const W = S.W[it.w]; if (it.mag >= W.mag || me.ammo[W.ammo] <= 0) return;
  me.reload = { t: W.rel, total: W.rel }; tone(300, 200, 0.06, 0.08, 'square');
}
function die(m) {
  me.alive = false; me.build = null; mouseL = mouseR = false; if (!TOUCH && document.exitPointerLock) document.exitPointerLock();
  const items = me.inv.filter(Boolean);
  for (const a in me.ammo) if (me.ammo[a] > 0) items.push({ k: 'a', a, n: me.ammo[a] });
  for (const k in me.mats) if (me.mats[k] > 0) items.push({ k: 'm', m: k, n: me.mats[k] });
  tx({ t: 'dropall', items });
  specId = m.k || 0;
  show('dead', true); $('deadT').textContent = 'Platz #' + m.place;
  $('deadS').textContent = (m.k ? 'Eliminiert von ' + nameOf(m.k) : m.w === 'storm' ? 'Der Sturm hat dich erwischt' : 'Ausgeschieden') + ' · ' + me.kills + ' Eliminierungen · ' + (TOUCH ? 'Tippen' : 'Klick') + ': Spieler wechseln';
  noise(0.5, 300, 0.4);
}

// ================= Eingabe =================
const cv = $('c');
function cycleSpec() { const a = [...ents.values()].filter((e) => e.alive); if (a.length) specId = a[(a.findIndex((e) => e.id === specId) + 1) % a.length].id; }
function toggleBuild(b) { me.build = me.build === b ? null : b; me.reload = me.using = null; hudDirty = true; }
function toggleMap() { $('bigmap').style.display = $('bigmap').style.display === 'block' ? 'none' : 'block'; }
cv.addEventListener('click', () => { initAudio(); if (TOUCH) return; if (phase === 'game' && me.alive && !locked) cv.requestPointerLock(); else if (!me.alive && phase === 'game') cycleSpec(); });
document.addEventListener('pointerlockchange', () => { if (TOUCH) return; locked = document.pointerLockElement === cv; if (!locked) { mouseL = mouseR = false; for (const k in keys) keys[k] = false; } });
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  const it = curItem(), s = 0.0022 * (me.ads ? (it && it.w === 'sniper' ? 0.22 : 0.6) : 1);
  me.yaw -= e.movementX * s; me.pitch = clamp(me.pitch - e.movementY * s, -1.5, 1.5);
});
cv.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) mouseL = true;
  if (e.button === 2) { if (me.build) { const ms = Object.keys(S.MATS); me.bmat = ms[(ms.indexOf(me.bmat) + 1) % 3]; hudDirty = true; } else mouseR = true; }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('wheel', (e) => { if (!locked || !me.alive) return; setSlot((me.slot + (e.deltaY > 0 ? 1 : 5)) % 6); });
addEventListener('keydown', (e) => {
  if (document.activeElement === $('name')) { if (e.code === 'Enter') $('play').click(); return; }
  if (e.code === 'KeyM') { toggleMap(); return; }
  if (!locked) return;
  if (['Space', 'Tab', 'KeyF', 'ControlLeft', 'KeyQ', 'KeyC', 'KeyR', 'KeyE', 'F1', 'F3'].includes(e.code) || e.ctrlKey) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (!me.alive) return;
  if (e.code.startsWith('Digit')) { const n = +e.code[5]; if (n >= 1 && n <= 6) setSlot(n - 1); }
  else if (e.code === 'KeyQ' || e.code === 'KeyF' || e.code === 'KeyC') toggleBuild({ KeyQ: 'w', KeyF: 'f', KeyC: 'r' }[e.code]);
  else if (e.code === 'KeyR') startReload();
  else if (e.code === 'KeyE') interact();
  else if (e.code === 'ControlLeft') me.crouch = !me.crouch;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
$('play').onclick = () => {
  initAudio();
  const n = $('name').value.trim() || 'Spieler' + Math.floor(Math.random() * 900 + 100);
  try { localStorage.setItem('sf_name', n); } catch (e) {}
  show('menu', false); connect(n);
  if (TOUCH) { try { const el = document.documentElement; const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); if (p && p.then) p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) {} }
};
try { $('name').value = localStorage.getItem('sf_name') || ''; } catch (e) {}

// ================= Touch-Steuerung =================
if (TOUCH) {
  const tl = $('touch'), stick = $('stick'), knob = $('knob'), looks = new Map();
  const lookMove = (e) => {
    const l = looks.get(e.pointerId); if (!l) return;
    const it = curItem(), s = 0.0058 * (me.ads ? (it && it.w === 'sniper' ? 0.22 : 0.55) : 1);
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
  addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  addEventListener('gesturestart', (e) => e.preventDefault());
}
$('bigmap').addEventListener('pointerdown', () => toggleMap());

// ================= Interaktion =================
let nearLoot = null, nearChest = null;
const KE = TOUCH ? 'Tippen' : 'E';
function scanNear() {
  nearLoot = nearChest = null; let bd = 2.8;
  for (const l of loot.values()) {
    const d = Math.hypot(l.x - me.x, l.z - me.z); if (Math.abs(l.y - me.y) > 2.5) continue;
    if ((l.i.k === 'a' || l.i.k === 'm') && d < 2 && !pending.has(l.id)) { pending.add(l.id); tx({ t: 'pickup', id: l.id }); continue; }
    if (l.i.k !== 'a' && l.i.k !== 'm' && d < bd) { bd = d; nearLoot = l; }
  }
  let cd = 2.8;
  for (const c of chests.values()) { if (c.open || Math.abs(c.y - me.y) > 2.5) continue; const d = Math.hypot(c.x - me.x, c.z - me.z); if (d < cd) { cd = d; nearChest = c; } }
  const p = $('prompt');
  if (nearChest && cd <= bd) { p.innerHTML = '<b>' + KE + '</b>Truhe öffnen'; p.style.display = 'block'; nearLoot = null; }
  else if (nearLoot) { p.innerHTML = '<b>' + KE + '</b><span style="color:' + itemColor(nearLoot.i) + '">' + itemName(nearLoot.i) + '</span>'; p.style.display = 'block'; nearChest = null; }
  else p.style.display = 'none';
}
function interact() {
  if (me.st !== 'ground') return;
  if (nearChest) { tx({ t: 'open', id: nearChest.id }); return; }
  if (nearLoot && !pending.has(nearLoot.id)) {
    if (!hasRoom(nearLoot.i)) { banner('Inventar voll – wähle einen Platz zum Tauschen', 2); return; }
    pending.add(nearLoot.id); tx({ t: 'pickup', id: nearLoot.id });
  }
}

// ================= Bauen =================
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x4db2ff, transparent: true, opacity: 0.42, depthWrite: false });
const ghosts = { w: new THREE.Mesh(pieceGeo.w, ghostMat), f: new THREE.Mesh(pieceGeo.f, ghostMat), r: new THREE.Mesh(pieceGeo.r, ghostMat) };
for (const k in ghosts) { ghosts[k].visible = false; scene.add(ghosts[k]); }
function buildSpot() {
  const fx = -Math.sin(me.yaw), fz = -Math.cos(me.yaw), ax = Math.abs(fx) > Math.abs(fz);
  const pcx = Math.floor(me.x / G), pcz = Math.floor(me.z / G), base = Math.floor((me.y + 0.4) / H);
  let p;
  if (me.build === 'w') {
    p = ax ? { t: 'w', d: 1, ix: fx > 0 ? pcx + 1 : pcx, iz: pcz } : { t: 'w', d: 0, ix: pcx, iz: fz > 0 ? pcz + 1 : pcz };
    p.iy = base + (me.pitch > 0.7 ? 1 : me.pitch < -1.0 ? -1 : 0);
    if (pieces.has(S.pkey(p))) { // schon belegt: nächste Zelle in Blickrichtung
      const q = { ...p }; if (ax) q.ix += fx > 0 ? 1 : -1; else q.iz += fz > 0 ? 1 : -1;
      if (me.pitch > 0.25) p.iy++; else p = q;
    }
  } else if (me.build === 'f') {
    const px = me.x + fx * 2.6, pz = me.z + fz * 2.6;
    p = { t: 'f', ix: Math.floor(px / G), iz: Math.floor(pz / G), iy: Math.round(me.y / H) + (me.pitch > 0.45 ? 1 : 0) };
    if (pieces.has(S.pkey(p)) && me.pitch <= 0.45) { p.ix = Math.floor((me.x + fx * 5.5) / G); p.iz = Math.floor((me.z + fz * 5.5) / G); }
  } else {
    const px = me.x + fx * 2.3, pz = me.z + fz * 2.3;
    p = { t: 'r', ix: Math.floor(px / G), iz: Math.floor(pz / G), iy: base, rot: ax ? (fx > 0 ? 1 : 3) : fz > 0 ? 0 : 2 };
    if (pieces.has(S.pkey(p))) { // Rampe weiterbauen: eine Zelle weiter und höher
      if (ax) p.ix += fx > 0 ? 1 : -1; else p.iz += fz > 0 ? 1 : -1; p.iy++;
    }
  }
  p.mat = me.bmat; p.key = S.pkey(p);
  return p;
}

// ================= Schießen =================
const dir = new THREE.Vector3(), camPos = new THREE.Vector3(), pivot = new THREE.Vector3();
function aimDir(out) { const cp = Math.cos(me.pitch); return out.set(-Math.sin(me.yaw) * cp, Math.sin(me.pitch), -Math.cos(me.yaw) * cp); }
function fire(it, now) {
  const W = S.W[it.w];
  me.lastShot = now; it.mag--; hudDirty = true;
  let sp = W.spread * (me.ads ? (it.w === 'sniper' ? 0 : 0.35) : 1) * (me.crouch ? 0.75 : 1) * (me.speed > 1 ? 1.35 : 1) * (me.onGround ? 1 : 1.7);
  aimDir(dir);
  const o = camPos.clone().addScaledVector(dir, Math.max(0.2, pivot.clone().sub(camPos).dot(dir)));
  const hits = new Map(), pcs = new Map(); let end = null;
  for (let i = 0; i < W.pellets; i++) {
    const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * sp;
    const up = new THREE.Vector3(0, 1, 0), right = new THREE.Vector3().crossVectors(dir, up).normalize(), u2 = new THREE.Vector3().crossVectors(right, dir);
    const d = dir.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(u2, Math.sin(a) * r).normalize();
    const h = raycast(o.x, o.y, o.z, d.x, d.y, d.z, 500);
    if (!end) end = [h.x, h.y, h.z];
    if (h.kind === 'player') { const q = hits.get(h.id) || { n: 0, head: 0 }; q.n++; if (h.head) q.head++; hits.set(h.id, q); }
    else if (h.kind === 'piece') pcs.set(h.key, (pcs.get(h.key) || 0) + 1);
    else if (h.kind === 'obj' && i === 0) { /* Kugeln stoppen an Objekten */ }
  }
  const mz = [me.x + Math.cos(me.yaw) * 0.4 - Math.sin(me.yaw) * 0.6, me.y + 1.35 - (me.crouch ? 0.3 : 0), me.z - Math.sin(me.yaw) * 0.4 - Math.cos(me.yaw) * 0.6];
  tracer(mz, end); shotSound(it.w, 1);
  tx({ t: 'shot', o: mz, e: end, w: it.w });
  for (const [id, q] of hits) tx({ t: 'hit', id, n: q.n, head: q.head * 2 >= q.n ? 1 : 0, w: it.w, r: it.r });
  for (const [k, n] of pcs) tx({ t: 'hitpc', k, n, w: it.w, r: it.r });
  me.pitch = clamp(me.pitch + (it.w === 'sniper' ? 0.05 : it.w === 'shotgun' ? 0.04 : 0.008), -1.5, 1.5);
}
function actions(dt, now) {
  me.ads = mouseR && !me.build && me.st === 'ground' && !!curItem() && curItem().k === 'w';
  if (me.reload) {
    me.reload.t -= dt;
    if (me.reload.t <= 0) { const it = curItem(); if (it && it.k === 'w') { const W = S.W[it.w], n = Math.min(W.mag - it.mag, me.ammo[W.ammo]); it.mag += n; me.ammo[W.ammo] -= n; } me.reload = null; hudDirty = true; }
  }
  if (me.using) {
    me.using.t -= dt;
    if (me.using.t <= 0) { const it = curItem(); if (it && it.k === 'c') { tx({ t: 'heal', c: it.c }); it.n--; if (it.n <= 0) me.inv[me.slot - 1] = null; tone(400, 900, 0.3, 0.12, 'sine'); } me.using = null; hudDirty = true; }
  }
  const u = $('use'), prog = me.using || me.reload;
  if (prog) { u.style.display = 'block'; u.firstChild.style.width = (1 - prog.t / prog.total) * 100 + '%'; } else u.style.display = 'none';
  if (me.st !== 'ground') return;
  if (me.build) {
    const p = buildSpot(), gh = ghosts[me.build]; gh.visible = true; placePiece(gh, p);
    const ok = !pieces.has(p.key) && me.mats[me.bmat] >= S.COST;
    ghostMat.color.set(ok ? 0x4db2ff : 0xff5a4d);
    if (mouseL && ok && now - me.lastBuild > 130) { me.lastBuild = now; me.mats[me.bmat] -= S.COST; hudDirty = true; tx({ t: 'build', p: { t: p.t, ix: p.ix, iy: p.iy, iz: p.iz, d: p.d, rot: p.rot, mat: p.mat } }); addPieceMesh({ ...p, hp: S.MATS[p.mat].hp }); }
    return;
  }
  const it = curItem();
  if (TOUCH && it && it.k === 'w' && !mouseL) {
    if (now - autoT > 90) {
      autoT = now; autoFire = false;
      if (it.w !== 'sniper' || me.ads) { aimDir(dir); const o = camPos.clone().addScaledVector(dir, Math.max(0.2, pivot.clone().sub(camPos).dot(dir))); const h = raycast(o.x, o.y, o.z, dir.x, dir.y, dir.z, S.W[it.w].range[1]); autoFire = h.kind === 'player'; }
    }
  } else autoFire = false;
  if (!mouseL && !autoFire) return;
  if (me.slot === 0) {
    if (now - me.lastSwing < 420) return;
    me.lastSwing = now; noise(0.07, 900, 0.12);
    aimDir(dir);
    const h = raycast(pivot.x, pivot.y, pivot.z, dir.x, dir.y, dir.z, 4.6);
    if (h.kind === 'obj') { tx({ t: 'harvest', k: 'o', id: h.id }); tone(220, 120, 0.08, 0.2, 'square'); }
    else if (h.kind === 'piece') { tx({ t: 'harvest', k: 'p', key: h.key }); tone(260, 150, 0.08, 0.2, 'square'); }
    else if (h.kind === 'player') tx({ t: 'harvest', k: 'e', id: h.id });
  } else if (it && it.k === 'w') {
    if (me.reload) return;
    if (it.mag <= 0) { startReload(); return; }
    if (now - me.lastShot >= S.W[it.w].rate) fire(it, now);
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
function updateMe(dt) {
  const [wx, wz] = wish();
  if (me.st === 'ship') {
    if (shipS) { me.x = shipS[0]; me.z = shipS[1]; me.y = S.SHIPY - 8; }
    if ((keys.Space && gameT > 2.5) || gameT > 27 || !shipS) { me.st = 'dive'; keys.Space = false; banner('', 0.01); }
    return;
  }
  if (me.st === 'dive' || me.st === 'glide') {
    const g = groundAt(me.x, me.z, me.y);
    if (me.st === 'dive' && me.y - g < 36) me.st = 'glide';
    const hs = me.st === 'dive' ? 20 : 14, vs = me.st === 'dive' ? 30 + (me.pitch < -0.5 ? 16 : 0) : 7.5;
    const nx = me.x + wx * hs * dt, nz = me.z + wz * hs * dt;
    if (nx * nx + nz * nz < 262 * 262) { me.x = nx; me.z = nz; }
    me.y -= vs * dt; me.speed = 0;
    const g2 = groundAt(me.x, me.z, me.y + 1);
    if (me.y <= g2) { me.y = g2; me.st = 'ground'; me.vy = 0; me.onGround = true; }
    return;
  }
  const it = curItem();
  let sp = me.crouch ? 3 : keys.ShiftLeft && !me.ads ? 7.6 : 5.6;
  if (me.ads) sp *= 0.6; if (me.using) sp *= 0.5;
  if (S.height(me.x, me.z) < -0.6) sp *= 0.6;
  const ox = me.x, oz = me.z;
  const steps = Math.max(1, Math.ceil(dt / 0.016)), h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const nx = me.x + wx * sp * h; if (!blocked(nx, me.z, me.y, me.x, me.z)) me.x = nx;
    const nz = me.z + wz * sp * h; if (!blocked(me.x, nz, me.y, me.x, me.z)) me.z = nz;
    if (keys.Space && me.onGround) { me.vy = 7.6; me.onGround = false; }
    me.vy -= 22 * h;
    let ny = me.y + me.vy * h;
    if (me.vy > 0 && ceiling(me.x, me.z, me.y, ny)) { me.vy = 0; ny = me.y; }
    const g = groundAt(me.x, me.z, me.y);
    if (ny <= g || (me.onGround && me.vy <= 0 && ny - g < 0.4)) {
      if (me.vy < -19) tx({ t: 'fall', d: Math.round((-me.vy - 19) * 7) });
      ny = g; me.vy = 0; me.onGround = true;
    } else me.onGround = false;
    me.y = ny;
  }
  me.speed = Math.hypot(me.x - ox, me.z - oz) / dt;
}
function updateCamera(dt) {
  const f = focus(), spec = f !== me;
  const yaw = f.yaw, pitch = spec ? clamp(f.pitch || 0, -0.6, 0.6) - 0.15 : me.pitch;
  const it = curItem(), scoped = !spec && me.ads && it && it.w === 'sniper';
  const cr = !spec && me.crouch ? 0.35 : 0;
  const cp = Math.cos(pitch); dir.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  const side = scoped ? 0 : me.ads && !spec ? 0.55 : 0.75;
  pivot.set(f.x + Math.cos(yaw) * side, f.y + 1.6 - cr, f.z - Math.sin(yaw) * side);
  let dist = scoped ? 0 : me.ads && !spec ? 2.1 : me.st === 'ship' && !spec ? 26 : (f.fl & 6) || (!spec && me.st !== 'ground') ? 7 : 4.3;
  if (dist > 0 && !(me.st === 'ship' && !spec)) {
    const h = raycast(pivot.x, pivot.y, pivot.z, -dir.x, -dir.y, -dir.z, dist + 0.3, true);
    if (h.kind && h.kind !== 'obj') dist = Math.max(0.4, h.dist - 0.3);
  }
  camPos.copy(pivot).addScaledVector(dir, -dist);
  camera.position.copy(camPos); camera.rotation.set(pitch, yaw, 0);
  const fov = scoped ? 14 : me.ads && !spec ? 48 : keys.ShiftLeft && me.speed > 6 ? 76 : 70;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov = lerp(camera.fov, fov, Math.min(1, dt * 14)); camera.updateProjectionMatrix(); }
  $('scope').style.display = scoped ? 'block' : 'none';
  if (me.ch) me.ch.g.visible = me.alive && me.st !== 'ship' && !scoped;
  sun.position.set(f.x + 70, f.y + 120, f.z + 45); sun.target.position.set(f.x, f.y, f.z);
}

// ================= Hauptschleife =================
let lastT = performance.now(), sendAcc = 0, scanAcc = 0, mapAcc = 0, orbit = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (nowMs - lastT) / 1000); lastT = nowMs;
  if (bannerT > 0) { bannerT -= dt; if (bannerT <= 0) $('banner').style.opacity = 0; }
  if (gainT > 0) { gainT -= dt; if (gainT <= 0) $('gain').style.opacity = 0; }
  for (let i = tracers.length - 1; i >= 0; i--) { const t = tracers[i]; t.t -= dt; t.l.material.opacity = Math.max(0, t.t / 0.09); if (t.t <= 0) { scene.remove(t.l); t.l.geometry.dispose(); t.l.material.dispose(); tracers.splice(i, 1); } }
  if (phase === 'menu' || phase === 'lobby') {
    orbit += dt * 0.07; camera.position.set(Math.cos(orbit) * 330, 150, Math.sin(orbit) * 330); camera.lookAt(0, 0, 0); camera.rotation.order = 'YXZ';
    sun.position.set(70, 120, 45); sun.target.position.set(0, 0, 0);
    renderer.render(scene, camera); return;
  }
  for (const k in ghosts) ghosts[k].visible = false;
  if (me.alive && phase !== 'lobby') {
    updateMe(dt);
    updateCamera(dt);
    if (locked) actions(dt, nowMs); else { $('use').style.display = 'none'; }
    me.swing = clamp((nowMs - me.lastSwing) / 300, 0, 1);
    const fl = (me.st === 'ship' ? 1 : me.st === 'dive' ? 2 : me.st === 'glide' ? 4 : 0) | (me.crouch ? 8 : 0);
    const it = curItem(), w = me.build ? 'build' : me.slot === 0 ? 'pick' : it ? (it.k === 'w' ? it.w : 'heal') : 'none';
    me.fl = fl;
    poseChar(me.ch, { x: me.x, y: me.y, z: me.z, yaw: me.yaw, pitch: me.pitch, fl, w, speed: me.speed, swing: me.swing < 1 ? me.swing : 0 }, dt);
    sendAcc += dt;
    if (sendAcc > 0.066) { sendAcc = 0; tx({ t: 'pos', x: +me.x.toFixed(2), y: +me.y.toFixed(2), z: +me.z.toFixed(2), yaw: +me.yaw.toFixed(3), pitch: +me.pitch.toFixed(3), fl, w }); }
    scanAcc += dt; if (scanAcc > 0.12) { scanAcc = 0; if (me.st === 'ground') scanNear(); else $('prompt').style.display = 'none'; }
  } else { updateCamera(dt); $('prompt').style.display = 'none'; $('use').style.display = 'none'; if (!ents.get(specId) || !ents.get(specId).alive) { const a = [...ents.values()].find((e) => e.alive); if (a) specId = a.id; } }
  $('lock').style.display = me.alive && !locked && phase === 'game' ? 'block' : 'none';
  if (TOUCH) { const ig = me.alive && phase === 'game'; if (ig !== document.body.classList.contains('ingame')) { document.body.classList.toggle('ingame', ig); if (!ig) { joy.id = null; joy.x = joy.y = 0; $('stick').style.display = 'none'; } } }
  // andere Spieler
  const k = Math.min(1, dt * 13);
  for (const e of ents.values()) {
    e.ch.g.visible = e.alive && !(e.fl & 1);
    if (!e.alive) continue;
    const px = e.x, pz = e.z;
    if (Math.hypot(e.tx - e.x, e.tz - e.z) > 25) { e.x = e.tx; e.y = e.ty; e.z = e.tz; }
    e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k;
    let dy = e.tyaw - e.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); e.yaw += dy * k;
    e.speed = lerp(e.speed, Math.hypot(e.x - px, e.z - pz) / Math.max(dt, 0.001), 0.2);
    poseChar(e.ch, e, dt);
  }
  for (const l of loot.values()) l.spin.rotation.y += dt * 1.8;
  if (stormS) {
    stormMesh.visible = true; stormMesh.position.set(stormS[0], 100, stormS[1]); stormMesh.scale.set(Math.max(0.5, stormS[2]), 1, Math.max(0.5, stormS[2]));
    const f = focus(); $('tint').style.opacity = Math.hypot(f.x - stormS[0], f.z - stormS[1]) > stormS[2] ? 1 : 0;
  }
  shipMesh.visible = !!shipS;
  if (shipS) { shipMesh.position.set(shipS[0], S.SHIPY, shipS[1]); if (shipMesh.userData.px !== undefined) { const dx = shipS[0] - shipMesh.userData.px, dz = shipS[1] - shipMesh.userData.pz; if (dx || dz) shipMesh.rotation.y = Math.atan2(-dx, -dz); } shipMesh.userData.px = shipS[0]; shipMesh.userData.pz = shipS[1]; }
  if (hudDirty) renderHud();
  mapAcc += dt;
  if (mapAcc > 0.1) {
    mapAcc = 0; const f = focus();
    drawMap($('mini'), f.x, f.z, 190);
    if ($('bigmap').style.display === 'block') drawMap($('bigmap'), 0, 0, 560, true);
    let st = '';
    if (stormS) { const mm = Math.floor(stormS[6] / 60), ss = String(stormS[6] % 60).padStart(2, '0'); st = stormS[9] ? 'Sturm geschlossen' : (stormS[7] ? 'Sturm schrumpft ' : 'Sturm in ') + mm + ':' + ss; }
    $('info').innerHTML = '👥 ' + aliveN + ' &nbsp; ☠ ' + me.kills + '<div class="st">🌀 ' + st + '</div>';
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.__dbg = { me, ents, pieces, loot, chests, keys, tx, S, get phase() { return phase; }, set locked(v) { locked = v; }, setMouse(l, r) { mouseL = l; mouseR = r; }, setSlot };
