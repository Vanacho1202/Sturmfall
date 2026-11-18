'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { WebSocketServer } = require('ws');
const S = require('./public/shared.js');
const G = S.G, H = S.H, SHIPY = S.SHIPY;
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const TOTAL = +process.env.TOTAL || 100, LOBBY = +process.env.LOBBY || 15, SPEED = +process.env.SPEED || 1, GOD = !!process.env.GOD; // SPEED/GOD nur für Tests
const REVIVE = 5, BLEED = 1.6, NEAR = 140, GC = 40, LIM = S.R * 0.86, REBOOT = 5;
const OT = ['tree', 'rock', 'crate', 'barrel', 'prop'], MT = ['wood', 'stone', 'metal'], PTY = ['w', 'f', 'r', 'c'];

// ---------- Webserver
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png', '.mp3': 'audio/mpeg', '.apk': 'application/vnd.android.package-archive', '.json': 'application/json', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const gzCache = new Map();
const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); res.end(); return; }
  if (u === '/') u = '/index.html';
  if (u === '/health') { res.end('ok'); return; }
  if (u === '/app' || u === '/apk' || u === '/download') u = '/Sturmfall.apk';
  const f = path.join(PUB, path.normalize(u));
  if (!f.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
    const ext = path.extname(f), etag = '"' + st.size.toString(36) + '-' + Math.floor(st.mtimeMs).toString(36) + '"';
    const head = { 'Content-Type': mime[ext] || 'application/octet-stream', 'Cache-Control': f.includes(path.sep + 'lib' + path.sep) || f.includes(path.sep + 'snd' + path.sep) ? 'public, max-age=86400' : 'no-cache', ETag: etag };
    if (ext === '.apk') head['Content-Disposition'] = 'attachment; filename="Sturmfall.apk"';
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); res.end(); return; }
    const gz = /gzip/.test(req.headers['accept-encoding'] || '') && !/\.(mp3|apk|png|jpg|webp|ogg)$/.test(f);
    const k = f + st.mtimeMs;
    if (gz && gzCache.has(k)) { head['Content-Encoding'] = 'gzip'; res.writeHead(200, head); res.end(gzCache.get(k)); return; }
    fs.readFile(f, (e2, d) => {
      if (e2) { res.writeHead(500); res.end(); return; }
      if (gz) { const z = zlib.gzipSync(d); gzCache.set(k, z); head['Content-Encoding'] = 'gzip'; res.writeHead(200, head); res.end(z); }
      else { res.writeHead(200, head); res.end(d); }
    });
  });
});
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024, perMessageDeflate: { threshold: 16384, zlibDeflateOptions: { level: 3 } } });

// ---------- Zustand
let nextId = 1, lootId = 1, tickN = 0;
const clients = new Map();
let bots = [], entList = [], entMap = new Map();
const eGrid = new Map();
let phase = 'lobby', lobbyT = LOBBY, gameT = 0, endT = 0, noHumansT = 0, stormAcc = 0, mode = 'solo', matchMode = 'solo';
let world = null, storm = null, ship = null;

const rnd = (n) => Math.floor(Math.random() * n);
const pick = (a) => a[rnd(a.length)];
const lerp = (a, b, k) => a + (b - a) * k;
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
function wpick(o) { let t = 0; for (const k in o) t += o[k]; let r = Math.random() * t; for (const k in o) { r -= o[k]; if (r <= 0) return k; } return Object.keys(o)[0]; }
function sendStr(c, s) { if (c.ws && c.ws.readyState === 1) c.ws.send(s); }
function send(c, m) { if (c && !c.bot) sendStr(c, JSON.stringify(m)); }
function broadcast(m, except) { const s = JSON.stringify(m); for (const c of clients.values()) if (c !== except && c.joined) sendStr(c, s); }
function viewOf(c) { if (c.inMatch && c.alive) return c; const s = entMap.get(c.spec); return s && s.alive ? s : c; }
function broadcastNear(m, x, z, r, except) {
  let s = null;
  for (const c of clients.values()) {
    if (c === except || !c.joined) continue;
    const v = viewOf(c); if (Math.abs(v.x - x) > r || Math.abs(v.z - z) > r) continue;
    sendStr(c, s || (s = JSON.stringify(m)));
  }
}
const humans = () => [...clients.values()].filter((c) => c.joined);
const ent = (id) => entMap.get(id);
const standing = (e) => !!e && e.alive && !e.down;
function rebuildEnts() { entList = humans().filter((c) => c.inMatch).concat(bots); entMap = new Map(entList.map((e) => [e.id, e])); }
const roster = () => entList.map((e) => [e.id, e.name, e.hue, e.bot ? 1 : 0, e.style | 0, e.team]);
const gk = (a, b) => (a + 60) * 200 + (b + 60);
function rebuildGrid() {
  eGrid.clear();
  for (const e of entList) { if (!e.alive) continue; const k = gk(Math.floor(e.x / GC), Math.floor(e.z / GC)); let a = eGrid.get(k); if (!a) eGrid.set(k, (a = [])); a.push(e); }
}
function forNear(x, z, r, fn) {
  const x0 = Math.floor((x - r) / GC), x1 = Math.floor((x + r) / GC), z0 = Math.floor((z - r) / GC), z1 = Math.floor((z + r) / GC);
  for (let a = x0; a <= x1; a++) for (let b = z0; b <= z1; b++) { const arr = eGrid.get(gk(a, b)); if (arr) for (let i = 0; i < arr.length; i++) fn(arr[i]); }
}
function teamsAlive() { const t = new Set(); for (const e of entList) if (e.alive) t.add(e.team); return t; }

// ---------- Beute
function rndWeapon(minR = 0) {
  const w = wpick({ ar: 28, smg: 20, shotgun: 18, pistol: 14, sniper: 7, tac: 10, hunt: 6, rpg: 3 });
  const r = Math.min(4, Math.max(minR, +wpick({ 0: 40, 1: 30, 2: 18, 3: 9, 4: 3 }), w === 'rpg' ? 2 : 0));
  return { k: 'w', w, r, mag: S.W[w].mag };
}
function rndCons() { const c = wpick({ band: 28, mini: 24, pot: 15, med: 11, gren: 12, stink: 6, chug: 3, bush: 4 }); return { k: 'c', c, n: c === 'band' ? 5 : c === 'mini' || c === 'gren' || c === 'stink' ? 2 : 1 }; }
const AMMO_N = { light: 30, medium: 30, shells: 8, heavy: 6, rockets: 3 };
function ammoFor(w) { const a = S.W[w].ammo; return { k: 'a', a, n: AMMO_N[a] }; }
function addLoot(item, x, y, z, ann) {
  const l = { id: lootId++, x: r2(x), y: r2(y), z: r2(z), i: item };
  world.loot.set(l.id, l);
  if (ann) broadcast({ t: 'loot+', l, o: ann === true ? null : ann });
  return l;
}
function scatter(items, x, y, z, ann) {
  items.forEach((it, i) => {
    const a = (i / items.length) * 6.283 + Math.random(), r = 1.2 + Math.random() * 0.6;
    const lx = x + Math.cos(a) * r, lz = z + Math.sin(a) * r;
    addLoot(it, lx, Math.max(y, S.height(lx, lz)), lz, ann ? [r1(x), r1(y + 0.6), r1(z)] : false);
  });
}

// ---------- Welt
function addPiece(p, ann, grow) {
  p.key = S.pkey(p);
  if (world.pieces.has(p.key)) return null;
  const M = S.MATS[p.mat]; p.hp = M.hp;
  if (grow) { p.hp = M.hp * 0.25; p.rate = (M.hp * 0.75) / M.bt; world.growing.add(p); }
  world.pieces.set(p.key, p); world.pg.add(p);
  if (ann) broadcast({ t: 'pc+', p: S.packPiece(p) });
  return p;
}
function hitPiece(key, dmg) {
  const p = world.pieces.get(key); if (!p) return false;
  p.hp -= dmg;
  if (p.hp <= 0) {
    world.pieces.delete(key); world.pg.remove(p); world.growing.delete(p); broadcast({ t: 'pc-', k: key });
    if (p.t === 'f' && world.onFloor) { const l = world.onFloor.get(key); if (l) { for (const o of l) if (world.objs.delete(o.id)) broadcast({ t: 'obj-', id: o.id }); world.onFloor.delete(key); } }
  }
  else broadcastNear({ t: 'pchp', k: key, hp: Math.round(p.hp) }, (p.ix + 0.5) * G, (p.iz + 0.5) * G, 160);
  return true;
}
function addCar(id, x, z) { world.cars.set(id, { id, x: r1(x), y: r2(S.height(x, z)), z: r1(z), yaw: r2(Math.random() * 6.283), hp: 400, drv: 0, v: rnd(2), hue: rnd(360), dirty: 0 }); }
function releaseCar(c) { if (!c.car) return; const car = world && world.cars.get(c.car); if (car) { car.drv = 0; car.dirty = 3; } c.car = null; c.fl &= ~16; }
function explodeCar(car, attacker) {
  world.cars.delete(car.id); broadcast({ t: 'car-', id: car.id, x: car.x, y: car.y, z: car.z });
  for (const e of entList) if (e.car === car.id) e.car = null;
  forNear(car.x, car.z, 8, (e) => { const d = Math.hypot(e.x - car.x, e.y - car.y, e.z - car.z); if (e.alive && d < 6.5) damage(e, e.id === car.drv ? 60 : 40, attacker, 'car', false, [(e.x - car.x) / (d || 1) * 9, 7, (e.z - car.z) / (d || 1) * 9]); });
}
const PT = {
  city: { want: 9, w: [3, 3], s: [3, 5], mats: { stone: 5, metal: 4, wood: 1 } },
  town: { want: 7, w: [2, 3], s: [1, 2], mats: { wood: 5, stone: 4, metal: 1 } },
  farm: { want: 4, w: [2, 4], s: [1, 2], mats: { wood: 8, stone: 2 } },
  factory: { want: 4, w: [3, 4], s: [2, 2], mats: { metal: 7, stone: 3 } },
  harbor: { want: 6, w: [2, 2], s: [1, 1], mats: { wood: 9, metal: 1 } },
  camp: { want: 3, w: [2, 2], s: [1, 1], mats: { wood: 1 } },
  fort: { want: 4, w: [3, 3], s: [2, 3], mats: { stone: 1 } },
};
// ---------- Requisiten (Kenney-Modelle, CC0): Einrichtung, Stadt, Hafen, Industrie, Natur
const PJ = JSON.parse(fs.readFileSync(path.join(PUB, 'props', 'props.json'), 'utf8')), PR = {};
PJ.forEach((m, i) => (PR[m.n] = { ...m, i }));
function addProp(name, x, z, yaw = 0, y = null, on = null, grid = true) {
  const d = PR[name]; if (!d) return null;
  const q = d.c === 'b' || d.c === 's' ? ((Math.round(yaw / (Math.PI / 2)) % 4) + 4) % 4 : -1, ya = q >= 0 ? q * Math.PI / 2 : yaw;
  const sw = q % 2 === 1, hx = (sw ? d.s[2] : d.s[0]) / 2, hz = (sw ? d.s[0] : d.s[2]) / 2;
  const o = { id: world.oid++, t: 'prop', p: d.i, n: name, x: r1(x), z: r1(z), y: r2(y == null ? S.height(x, z) : y), yaw: r2(ya), s: 1, hp: d.hp || 1e9, c: d.c, hx: r2(hx), hz: r2(hz), h: d.s[1], on };
  o.r = d.c === 'r' ? Math.max(hx, hz) * 0.7 : d.c === 'b' ? Math.max(hx, hz) : 0;
  world.objs.set(o.id, o);
  if (on) { if (!world.onFloor.has(on)) world.onFloor.set(on, []); world.onFloor.get(on).push(o); }
  return o;
}
const ROOMS = {
  living: [['sofa', 2], ['ctable', 1], ['tvcab', 2], ['plant', 0], ['lamp', 0], ['books', 2], ['rug', 1]],
  bedroom: [['bed', 2], ['lamp', 0], ['shelf', 2], ['plant', 0], ['rug', 1], ['bedS', 2]],
  kitchen: [['fridge', 2], ['stove', 2], ['cabinet', 2], ['sink', 2], ['table', 1], ['chair', 1]],
  bath: [['tub', 2], ['toilet', 2], ['washer', 2], ['plant', 0]],
  office: [['desk', 2], ['deskChair', 1], ['shelf', 2], ['boxes', 0], ['plant', 0]],
  storage: [['boxes', 0], ['boxes', 0], ['shelf', 2], ['sbox', 2], ['pbarrel', 0]],
};
// Möbel in ein Stockwerk stellen: an die Wände, Treppe/Tür/Truhe frei lassen
function furnish(cx, cz, w, d, iy, st, kind, reserved) {
  const list = ROOMS[kind], cells = [];
  for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) if (!reserved.has(i + ',' + j)) cells.push([i, j]);
  for (let k = cells.length - 1; k > 0; k--) { const r = rnd(k + 1); [cells[k], cells[r]] = [cells[r], cells[k]]; }
  const y = iy * H + (st ? 0.12 : 0.02), n = Math.min(cells.length, list.length, 2 + rnd(3));
  for (let k = 0; k < n; k++) {
    const [i, j] = cells[k], [name, mode] = list[k], dm = PR[name]; if (!dm) continue;
    let x = (cx + i + 0.5) * G, z = (cz + j + 0.5) * G, yaw = 0;
    if (mode === 2) { // an die nächste Außenwand
      const opts = []; if (i === 0) opts.push([-1, 0]); if (i === w - 1) opts.push([1, 0]); if (j === 0) opts.push([0, -1]); if (j === d - 1) opts.push([0, 1]);
      if (!opts.length) opts.push([[-1, 0], [1, 0], [0, -1], [0, 1]][rnd(4)]);
      const [ox, oz] = opts[rnd(opts.length)], depth = dm.s[2] / 2;
      x += ox * (G / 2 - depth - 0.2); z += oz * (G / 2 - depth - 0.2); yaw = Math.atan2(-ox, -oz);
    } else if (mode === 1) yaw = rnd(4) * Math.PI / 2;
    else { x += (Math.random() - 0.5) * 2; z += (Math.random() - 0.5) * 2; yaw = Math.random() * 6.28; }
    addProp(name, x, z, yaw, y, st ? S.pkey({ t: 'f', ix: cx + i, iy, iz: cz + j }) : null);
  }
}
const sideOf = (x, z, w, d) => [x, z];
function nearRoad(poi, rmin, rmax, dmin, dmax, tries = 60) {
  for (let t = 0; t < tries; t++) {
    const a = Math.random() * 6.283, r = rmin + Math.random() * (rmax - rmin), x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r, rd = S.roadDist(x, z);
    if (rd > dmin && rd < dmax && S.height(x, z) > 0.4) return [x, z];
  }
  return null;
}
function roadYaw(x, z) { const e = 1.5, gx = S.roadDist(x + e, z) - S.roadDist(x - e, z), gz = S.roadDist(x, z + e) - S.roadDist(x, z - e); return Math.atan2(gx, gz); }
// Ortsgestaltung je nach Art des Ortes
function decorate(poi, free, rects) {
  const P = (n, pr = 0) => { const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * (poi.r + pr); return [poi.x + Math.cos(a) * r, poi.z + Math.sin(a) * r]; };
  const ok = (x, z, hw, pad = 0.5, road = 3.5) => S.height(x, z) > 0.4 && S.roadDist(x, z) > road && free(x / G - hw / G, z / G - hw / G, 2 * hw / G, 2 * hw / G, pad);
  const block = (x, z, hw) => rects.push({ cx: x / G - hw / G, cz: z / G - hw / G, w: 2 * hw / G, d: 2 * hw / G });
  const put = (name, n, rr, opts = {}) => {
    for (let i = 0, t = 0; i < n && t < n * 25; t++) {
      const [x, z] = opts.at ? opts.at() || [1e9, 1e9] : P(name, rr); if (x > 1e8) continue;
      const d = PR[name]; if (!d) return; const hw = Math.max(d.s[0], d.s[2]) / 2 + (opts.pad ?? 0.4);
      if (!ok(x, z, opts.noFree ? 0.01 : hw, 0.3, opts.road ?? 3.5)) continue;
      const yaw = opts.yaw ? opts.yaw(x, z) : rnd(4) * Math.PI / 2;
      addProp(name, x, z, yaw, opts.y ? opts.y(x, z) : null); if (!opts.noBlock) block(x, z, hw); i++;
    }
  };
  const t = poi.t, lampAt = () => nearRoad(poi, 0, poi.r + 30, 4.2, 5.6), roadSide = (x, z) => roadYaw(x, z);
  if (t === 'city') {
    put(pick(['sky1', 'sky2', 'sky3', 'sky4', 'sky5']), 1, 0, { at: () => P(0, 14), pad: 2 });
    for (let k = 0; k < 4; k++) put(pick(['sky1', 'sky2', 'sky3', 'sky4', 'sky5', 'shopA', 'shopC', 'shopE', 'shopH']), 1, 16, { pad: 2 });
    put('light', 12, 0, { at: lampAt, yaw: roadSide, noBlock: 1 }); put(pick(['sedan', 'taxi', 'police', 'suv', 'van']), 3, 0, { at: () => nearRoad(poi, 0, poi.r + 10, 3.6, 5), yaw: roadSide });
    put('taxi', 2, 0, { at: () => nearRoad(poi, 0, poi.r + 10, 3.6, 5), yaw: roadSide }); put('dumpster', 4, 0); put('parasol', 4, 0); put('hydrant', 4, 0, { noBlock: 1 }); put('barrier', 4, 0); put('ccone', 8, 0, { noBlock: 1 }); put('stop', 3, 0, { at: lampAt, noBlock: 1 }); put('planter', 4, 0);
  } else if (t === 'town') {
    put('lightC', 7, 0, { at: lampAt, yaw: roadSide, noBlock: 1 }); put('planter', 6, 0); put('gfence', 10, 0, { yaw: () => rnd(4) * Math.PI / 2 });
    put(pick(['sedan', 'suv', 'van', 'truck']), 2, 0, { at: () => nearRoad(poi, 0, poi.r + 10, 3.6, 5), yaw: roadSide }); put('sedan', 2, 0); put('flowers', 10, 0, { noBlock: 1 }); put('flowersY', 8, 0, { noBlock: 1 }); put('dumpster', 1, 0); put('plant', 3, 0, { noBlock: 1 });
  } else if (t === 'farm') {
    put('windmill', 1, 4, { pad: 1.5 }); put('wtower', 1, 4, { pad: 1 }); put('tractor', 2, 0); put('pumpkin', 10, 6, { noBlock: 1 });
    for (let f = 0; f < 3; f++) { // Felder mit Reihen
      for (let tries = 0; tries < 40; tries++) {
        const [x0, z0] = P(0, 6), nx = 4 + rnd(3), nz = 4 + rnd(3), sp = 3.4, crop = pick(['corn', 'corn', 'wheat']);
        const hw = Math.max(nx, nz) * sp / 2 + 1; if (!ok(x0, z0, hw, 0.5)) continue;
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) { const x = x0 + (a - nx / 2 + 0.5) * sp, z = z0 + (b - nz / 2 + 0.5) * sp; addProp('dirt', x, z, 0); addProp(crop, x + (Math.random() - 0.5) * 0.6, z + (Math.random() - 0.5) * 0.6, Math.random() * 6.28); }
        for (let a = 0; a < nx; a++) { addProp('hfence', x0 + (a - nx / 2 + 0.5) * sp, z0 - nz * sp / 2 - 0.8, 0); addProp('hfence', x0 + (a - nx / 2 + 0.5) * sp, z0 + nz * sp / 2 + 0.8, 0); }
        block(x0, z0, hw); break;
      }
    }
    put('logs', 4, 0); put('fence', 8, 4, { yaw: () => rnd(4) * Math.PI / 2 });
  } else if (t === 'factory') {
    for (let k = 0; k < 14; k++) put(pick(['cont1', 'cont2', 'cont3']), 1, 4, { pad: 0.6 });
    // gestapelte Container
    for (let k = 0, tr = 0; k < 4 && tr < 60; tr++) { const [x, z] = P(0, 2); if (!ok(x, z, 4.6, 0.5)) continue; const yaw = rnd(2) * Math.PI / 2, n = pick(['cont1', 'cont2', 'cont3']); addProp(n, x, z, yaw); addProp(pick(['cont1', 'cont2', 'cont3']), x, z, yaw, S.height(x, z) + PR[n].s[1]); block(x, z, 4.6); k++; }
    put('tankL', 2, 6, { pad: 1 }); put('tank', 3, 4); put('chimney', 2, 8, { pad: 1 }); put(pick(['hall', 'hall2']), 1, 18, { pad: 2 }); put('solar', 2, 8); put('delivery', 1, 0); put('garbage', 1, 0); put('barrier', 5, 0); put('ccone', 8, 0, { noBlock: 1 }); put('wtower', 1, 10, { pad: 1 }); put('dumpster', 2, 0);
  } else if (t === 'harbor') {
    // Stege am Ufer: Punkt an Land, Richtung Wasser
    for (let k = 0, tr = 0; k < 4 && tr < 300; tr++) {
      const a = Math.random() * 6.283, r = poi.r * 0.4 + Math.random() * (poi.r + 40), x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r, h = S.height(x, z);
      if (h < 0.1 || h > 1.2) continue;
      let best = null; for (let q = 0; q < 8; q++) { const b2 = q * Math.PI / 4, wx = x + Math.sin(b2) * 7, wz = z + Math.cos(b2) * 7; if (S.height(wx, wz) < -1.5) { best = b2; break; } }
      if (best == null) continue; const yaw = Math.round(best / (Math.PI / 2)) * Math.PI / 2, dx = Math.sin(yaw), dz = Math.cos(yaw);
      for (let s2 = 0; s2 < 3; s2++) addProp('dock', x + dx * (2 + s2 * 5.3), z + dz * (2 + s2 * 5.3), yaw, 1.0 - 2.9);
      addProp('rowboat', x + dx * 9 + dz * 4.5, z + dz * 9 - dx * 4.5, yaw + 0.4, -0.35); k++;
    }
    for (let k = 0, tr = 0; k < 1 && tr < 200; tr++) { const a = Math.random() * 6.283, r = poi.r + 30 + Math.random() * 50, x = poi.x + Math.cos(a) * r, z = poi.z + Math.sin(a) * r; if (S.height(x, z) > -6 || S.height(x + 8, z + 8) > -4 || S.height(x - 8, z - 8) > -4) continue; addProp('ship', x, z, Math.random() * 6.28, -1.6); k++; }
    put('pcrate', 8, 0); put('pbarrel', 8, 0); put('palm', 6, 10, { noBlock: 1 }); put('palmB', 4, 10, { noBlock: 1 }); put('cannon', 2, 0); put('flag', 2, 0); put(pick(['cont1', 'cont2']), 3, 0); put('lightC', 4, 0, { at: lampAt, yaw: roadSide, noBlock: 1 });
  } else if (t === 'camp') {
    for (let k = 0; k < 5; k++) { const a = k / 5 * 6.283 + Math.random() * 0.4, x = poi.x + Math.cos(a) * poi.r * 0.55, z = poi.z + Math.sin(a) * poi.r * 0.55; if (ok(x, z, 2.4, 0.3, 2)) { addProp(k % 2 ? 'tent' : 'tentC', x, z, Math.atan2(poi.x - x, poi.z - z)); block(x, z, 2.4); } }
    addProp('camp', poi.x + 3, poi.z + 2, 0); put('bedroll', 4, -poi.r * 0.3, { noBlock: 1 }); put('bench', 2, 0); put('sbox', 4, 0); put('logs', 3, 0); put('fishrack', 1, 0); put('sign', 2, 6);
    for (let k = 0; k < 16; k++) { const a = k / 16 * 6.283, x = poi.x + Math.cos(a) * (poi.r + 3), z = poi.z + Math.sin(a) * (poi.r + 3); if (k % 5 === 2 || S.height(x, z) < 0.3 || S.roadDist(x, z) < 4) continue; addProp('palisade', x, z, Math.round((a + Math.PI / 2) / (Math.PI / 2)) * Math.PI / 2); }
  } else if (t === 'fort') {
    for (let k = 0; k < 18; k++) { const a = k / 18 * 6.283, x = poi.x + Math.cos(a) * (poi.r - 2), z = poi.z + Math.sin(a) * (poi.r - 2); if (S.height(x, z) < 0.3) continue; if (k === 0) { addProp('gate', x, z, Math.atan2(poi.x - x, poi.z - z)); continue; } if (S.roadDist(x, z) < 4 || !free(x / G - 0.6, z / G - 0.6, 1.2, 1.2, 0)) continue; addProp('wall', x, z, Math.atan2(poi.x - x, poi.z - z)); }
    put('tower', 2, -4, { pad: 1 }); put('cannon', 4, 0); put('flag', 3, 0); put('pbarrel', 5, 0); put('pcrate', 4, 0); put('column', 3, 10);
  }
}
function ringPos(rmax, rmin = 0) { const a = Math.random() * 6.283, r = rmin + Math.sqrt(Math.random()) * (rmax - rmin); return [Math.cos(a) * r, Math.sin(a) * r]; }
function genWorld() {
  world = { objs: new Map(), chests: new Map(), pieces: new Map(), pg: new S.PGrid(), loot: new Map(), cars: new Map(), houses: [], grid: new Map(), vans: [], cards: new Map(), gas: [], growing: new Set(), oid: 1, onFloor: new Map() };
  const nid = () => world.oid++;
  const rects = [];
  const free = (cx, cz, w, d, pad) => !rects.some((h) => cx < h.cx + h.w + pad && cx + w + pad > h.cx && cz < h.cz + h.d + pad && cz + d + pad > h.cz);
  for (const poi of S.POIS) {
    const T = PT[poi.t], placed = [];
    for (let tries = 0; tries < 160 && placed.length < T.want; tries++) {
      const big = poi.t === 'city' && !placed.length;
      const w = big ? 4 : T.w[0] + rnd(T.w[1] - T.w[0] + 1), d = big ? 4 : Math.max(2, T.w[0] + rnd(T.w[1] - T.w[0] + 1) - (poi.t === 'farm' ? 1 : 0));
      const a = Math.random() * 6.283, rr = big ? 0 : Math.random() * (poi.r - 14);
      const cx = Math.floor((poi.x + Math.cos(a) * rr) / G) - (w >> 1), cz = Math.floor((poi.z + Math.sin(a) * rr) / G) - (d >> 1);
      if (!free(cx, cz, w, d, 2)) continue;
      placed.push(1); rects.push({ cx, cz, w, d });
      const mat = wpick(T.mats), storeys = big ? 6 : T.s[0] + rnd(T.s[1] - T.s[0] + 1), door = rnd(w);
      world.houses.push([cx, cz, w, d, poi.l, storeys, door, mat[0]]);
      for (let st = 0; st < storeys; st++) {
        const iy = poi.l + st;
        for (let i = 0; i < w; i++) {
          addPiece({ t: 'w', ix: cx + i, iy, iz: cz, d: 0, mat, v: st === 0 && i === door ? 2 : Math.random() < 0.3 ? 1 : 0 });
          addPiece({ t: 'w', ix: cx + i, iy, iz: cz + d, d: 0, mat, v: Math.random() < 0.4 ? 1 : 0 });
        }
        for (let j = 0; j < d; j++) {
          addPiece({ t: 'w', ix: cx, iy, iz: cz + j, d: 1, mat, v: Math.random() < 0.4 ? 1 : 0 });
          addPiece({ t: 'w', ix: cx + w, iy, iz: cz + j, d: 1, mat, v: Math.random() < 0.4 ? 1 : 0 });
        }
        const stairs = st < storeys - 1;
        for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
          if (stairs && i === 0 && j === d - 1) addPiece({ t: 'r', ix: cx, iy, iz: cz + d - 1, rot: 0, mat });
          else addPiece({ t: 'f', ix: cx + i, iy: iy + 1, iz: cz + j, mat });
        }
      }
      const fl = Math.min(storeys - 1, rnd(storeys)), ci = w - 1, cj = rnd(d);
      const ch = { id: nid(), x: (cx + ci + 0.5) * G, y: (poi.l + fl) * H + (fl ? 0.12 : 0), z: (cz + cj + 0.5) * G, open: 0, k: 'c' };
      world.chests.set(ch.id, ch);
      { // Einrichtung
        const kinds = poi.t === 'factory' ? ['office', 'storage'] : poi.t === 'fort' || poi.t === 'camp' ? ['storage'] : poi.t === 'harbor' ? ['storage', 'kitchen', 'bedroom'] : ['living', 'kitchen', 'bedroom', 'bath', 'office'];
        for (let st = 0; st < storeys; st++) {
          const res = new Set();
          if (st === 0) { res.add(door + ',0'); res.add('0,0'); }
          if (st < storeys - 1 || st > 0) { res.add('0,' + (d - 1)); res.add('0,' + (d - 2)); res.add('1,' + (d - 1)); }
          if (st === fl) res.add(ci + ',' + cj);
          if (big) for (let i = 1; i < 4; i++) res.add(i + ',0');
          furnish(cx, cz, w, d, poi.l + st, st, kinds[(st + rnd(kinds.length)) % kinds.length], res);
        }
      }
      if (big) for (let s2 = 1; s2 < storeys; s2 += 1) { const c2 = { id: nid(), x: (cx + 1 + (s2 % 3) + 0.5) * G, y: (poi.l + s2) * H + 0.12, z: (cz + 0.5) * G, open: 0, k: 'c' }; world.chests.set(c2.id, c2); }
      if (Math.random() < 0.45 && w > 1) { const ab = { id: nid(), x: (cx + 0.5) * G, y: poi.l * H, z: (cz + 0.5) * G, open: 0, k: 'a' }; world.chests.set(ab.id, ab); }
      if (Math.random() < 0.8) {
        const lx = (cx + rnd(w) + 0.5) * G, lz = (cz + d - 0.5) * G;
        const it = Math.random() < 0.6 ? rndWeapon() : rndCons();
        addLoot(it, lx, poi.l * H, lz);
        if (it.k === 'w') addLoot(ammoFor(it.w), lx + 0.8, poi.l * H, lz - 0.5);
      }
    }
    for (let i = 0, t = 0; i < 8 && t < 60; t++) {
      const a = Math.random() * 6.283, rr = Math.random() * (poi.r - 3), x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
      if (!free(x / G - 0.3, z / G - 0.3, 0.6, 0.6, 0.4)) continue;
      const tp = Math.random() < 0.6 ? 'crate' : 'barrel';
      world.objs.set(world.oid, { id: nid(), t: tp, x: r1(x), z: r1(z), s: tp === 'crate' ? r2(0.8 + Math.random() * 0.5) : 1, hp: 68 }); i++;
    }
    for (let i = 0, t = 0; i < 3 && t < 40; t++) {
      const a = Math.random() * 6.283, rr = Math.random() * (poi.r - 4), x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr;
      if (!free(x / G - 1, z / G - 1, 2, 2, 0.5)) continue;
      addCar(nid(), x, z); i++;
    }
    decorate(poi, free, rects);
  }
  // Rückkehr-Stationen am Rand einiger Orte
  S.POIS.forEach((p, i) => {
    if (i % 2) return;
    for (let t = 0; t < 30; t++) {
      const a = Math.random() * 6.283, x = p.x + Math.cos(a) * (p.r + 10), z = p.z + Math.sin(a) * (p.r + 10), h = S.height(x, z);
      if (h < 1 || !free(x / G - 1, z / G - 1, 2, 2, 1)) continue;
      rects.push({ cx: Math.floor(x / G) - 1, cz: Math.floor(z / G) - 1, w: 2, d: 2 });
      world.vans.push({ id: nid(), x: r1(x), y: r2(h), z: r1(z), yaw: r2(Math.atan2(p.x - x, p.z - z)) }); break;
    }
  });
  // Wachtürme
  for (let i = 0, t = 0; i < 30 && t < 300; t++) {
    const [x, z] = ringPos(S.R * 0.82, 40), h = S.height(x, z);
    if (h < 2 || S.poiAt(x, z, 14) || S.roadDist(x, z) < 6) continue;
    const cx = Math.floor(x / G), cz = Math.floor(z / G), l = Math.floor((h + 0.4) / H), mat = Math.random() < 0.5 ? 'wood' : 'metal';
    if (!free(cx - 4, cz - 4, 10, 10, 0)) continue;
    rects.push({ cx, cz, w: 2, d: 2 });
    for (let st = 0; st < 3; st++) addPiece({ t: 'r', ix: cx, iy: l + st, iz: cz, rot: st % 2 ? 2 : 0, mat });
    for (const [a2, b2] of [[0, 1], [1, 1], [1, 0]]) addPiece({ t: 'f', ix: cx + a2, iy: l + 3, iz: cz + b2, mat });
    for (let st = 0; st < 3; st++) { addPiece({ t: 'w', ix: cx + 1, iy: l + st, iz: cz, d: 1, mat }); addPiece({ t: 'w', ix: cx, iy: l + st, iz: cz, d: 1, mat }); }
    const tc = { id: nid(), x: (cx + 1.5) * G, y: (l + 3) * H + 0.12, z: (cz + 1.5) * G, open: 0, k: 'c' }; world.chests.set(tc.id, tc);
    i++;
  }
  for (let i = 0; i < 4400; i++) {
    const [x, z] = ringPos(S.R * 0.93);
    if (S.height(x, z) < 0.8 || S.poiAt(x, z, 5)) continue;
    world.objs.set(world.oid, { id: nid(), t: 'tree', x: r1(x), z: r1(z), s: r2(0.8 + Math.random() * 0.7), hp: 100 });
  }
  for (let i = 0; i < 1400; i++) {
    const [x, z] = ringPos(S.R * 0.95);
    if (S.height(x, z) < 0.3 || S.poiAt(x, z, 2)) continue;
    world.objs.set(world.oid, { id: nid(), t: 'rock', x: r1(x), z: r1(z), s: r2(0.7 + Math.random() * 0.9), hp: 150 });
  }
  const scatter = (name, n, cond, ymode) => { for (let i = 0, t = 0; i < n && t < n * 6; t++) { const [x, z] = ringPos(S.R * 0.93), h = S.height(x, z); if (!cond(h, x, z) || S.poiAt(x, z, 4) || S.roadDist(x, z) < 4) continue; addProp(name, x, z, Math.random() * 6.28, ymode === 'water' ? -0.05 : null); i++; } };
  const land = (h) => h > 1 && h < 18;
  scatter('stump', 260, land); scatter('log', 160, land); scatter('mush', 260, land); scatter('flowers', 300, land); scatter('flowersY', 260, land); scatter('flowersP', 220, land); scatter('bush2', 300, land);
  scatter('rockT', 50, (h) => h > 4); scatter('rockL', 50, (h) => h > 2); scatter('palm', 70, (h) => h > 0.3 && h < 1.6); scatter('palmB', 50, (h) => h > 0.3 && h < 1.6); scatter('cactus', 30, (h) => h > 0.3 && h < 1.2);
  scatter('lily', 120, (h, x, z) => h < -0.3 && h > -2.5 && Math.hypot(x, z) < S.R * 0.8, 'water');
  for (let k = 0; k < 6; k++) { const [x0, z0] = ringPos(S.R * 0.8, 100); if (S.height(x0, z0) < 2 || S.poiAt(x0, z0, 20)) continue; addProp('obelisk', x0, z0, 0); for (let c = 0; c < 6; c++) { const a = c / 6 * 6.283; addProp('column', x0 + Math.cos(a) * 9, z0 + Math.sin(a) * 9, Math.random() * 6.28); } }
  // Strommasten und Laternen an den Straßen außerhalb der Orte
  for (let i = 0, t = 0; i < 160 && t < 3000; t++) { const [x, z] = ringPos(S.R * 0.9), rd = S.roadDist(x, z); if (rd < 5.5 || rd > 7 || S.height(x, z) < 0.5 || S.poiAt(x, z, 10)) continue; addProp('pole', x, z, roadYaw(x, z)); i++; }
  for (let i = 0; i < 40; i++) { const [x, z] = ringPos(S.R * 0.85); if (S.height(x, z) > 1.5 && !S.poiAt(x, z, 4)) addCar(nid(), x, z); }
  for (let i = 0; i < 300; i++) {
    const [x, z] = ringPos(S.R * 0.88);
    if (S.height(x, z) < 1 || S.poiAt(x, z, 4)) continue;
    world.chests.set(world.oid, { id: nid(), x: r1(x), y: S.height(x, z), z: r1(z), open: 0, k: Math.random() < 0.3 ? 'a' : 'c' });
  }
  for (let i = 0; i < 900; i++) {
    const [x, z] = ringPos(S.R * 0.88), y = S.height(x, z);
    if (y < 1) continue;
    const r = Math.random();
    const it = r < 0.5 ? rndWeapon() : r < 0.75 ? rndCons() : { k: 'a', a: pick(['light', 'medium', 'shells', 'heavy']), n: 20 };
    addLoot(it, x, y, z);
    if (it.k === 'w') addLoot(ammoFor(it.w), x + 0.9, S.height(x + 0.9, z), z);
  }
  for (const o of [...world.objs.values()]) {
    const cx = o.x / G, cz = o.z / G;
    if ((o.t === 'tree' || o.t === 'rock') && (S.roadDist(o.x, o.z) < 4.5 || rects.some((r) => cx > r.cx - 0.6 && cx < r.cx + r.w + 0.6 && cz > r.cz - 1.6 && cz < r.cz + r.d + 0.6))) { world.objs.delete(o.id); continue; }
    if (o.t === 'prop') { if (o.c !== 'b' && o.c !== 'r') continue; if (!o.on && S.roadDist(o.x, o.z) < 2.4 && o.h < 4) { world.objs.delete(o.id); continue; } }
    else o.r = o.t === 'tree' ? 0.45 * o.s : o.t === 'rock' ? 1.25 * o.s : o.t === 'crate' ? 0.75 * o.s : 0.55;
    const k = Math.floor(o.x / 16) + ',' + Math.floor(o.z / 16);
    if (!world.grid.has(k)) world.grid.set(k, []); world.grid.get(k).push(o);
  }
}
const packChest = (c) => { const o = { id: c.id, x: r2(c.x), y: r2(c.y), z: r2(c.z), open: c.open, k: c.k }; if (c.k === 'd') { o.sp = r1(c.sp); o.land = r1(c.land); } return o; };
const packCard = (c) => ({ id: c.id, x: r2(c.x), y: r2(c.y), z: r2(c.z), o: c.o, team: c.team });
const packWorld = () => ({
  objs: [...world.objs.values()].map((o) => (o.t === 'prop' ? [o.id, 4, o.x, o.z, 1, o.p, o.yaw, o.y, o.on ? 1 : 0] : [o.id, OT.indexOf(o.t), o.x, o.z, o.s])), chests: [...world.chests.values()].map(packChest),
  pieces: [...world.pieces.values()].map((p) => [PTY.indexOf(p.t), p.ix, p.iy, p.iz, p.t === 'w' ? p.d : p.rot | 0, MT.indexOf(p.mat), p.v | 0]),
  loot: [...world.loot.values()], houses: world.houses, vans: world.vans, cards: [...world.cards.values()].map(packCard),
  cars: [...world.cars.values()].map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z, yaw: c.yaw, v: c.v, hue: c.hue, drv: c.drv })),
});

// ---------- Sturm
function chooseNext() {
  const st = S.STORM[storm.i];
  storm.nr = S.R * st.f;
  const a = Math.random() * 6.283, d = Math.random() * Math.max(0, Math.min(storm.r, S.R * 0.9) - storm.nr) * 0.9;
  storm.nx = storm.x + Math.cos(a) * d; storm.nz = storm.z + Math.sin(a) * d;
  const m = Math.hypot(storm.nx, storm.nz), lim = Math.max(0, S.R * 0.8 - storm.nr);
  if (m > lim && m > 0) { storm.nx *= lim / m; storm.nz *= lim / m; }
}
function tickStorm(dt) {
  if (storm.done) return;
  const st = S.STORM[storm.i];
  storm.timer -= dt;
  if (!storm.shrink) {
    if (storm.timer <= 0) { storm.shrink = true; storm.timer = st.shrink; storm.fx = storm.x; storm.fz = storm.z; storm.fr = storm.r; }
  } else {
    const k = 1 - Math.max(0, storm.timer) / st.shrink;
    storm.x = lerp(storm.fx, storm.nx, k); storm.z = lerp(storm.fz, storm.nz, k); storm.r = lerp(storm.fr, storm.nr, k);
    if (storm.timer <= 0) {
      storm.i++;
      if (S.STORM[storm.i]) { storm.shrink = false; storm.timer = S.STORM[storm.i].wait; chooseNext(); if (storm.i <= 6) spawnDrop(); }
      else { storm.done = true; storm.i = S.STORM.length - 1; storm.timer = 0; }
    }
  }
}

function spawnDrop() {
  for (let t = 0; t < 25; t++) {
    const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * Math.max(10, storm.nr * 0.75), x = storm.nx + Math.cos(a) * d, z = storm.nz + Math.sin(a) * d, h = S.height(x, z);
    if (h < 1 || S.poiAt(x, z, 2)) continue;
    const ch = { id: world.oid++, x, y: h, z, open: 0, k: 'd', sp: gameT, land: gameT + 22 };
    world.chests.set(ch.id, ch); broadcast({ t: 'sd', c: packChest(ch) }); return;
  }
}
// ---------- Schaden, Niederschlagen, Eliminieren
function damage(target, amount, attacker, wname, head, kb) {
  if (phase !== 'game' || !target || !target.alive || (target.fl & 1) || amount <= 0 || (GOD && !target.bot)) return;
  if (attacker && attacker !== target && attacker.team === target.team) return;
  if (attacker === target && (wname === 'gren' || wname === 'rocket' || wname === 'stink')) { if (kb) send(target, { t: 'hurt', ax: null, az: null, kb }); return; }
  if (target.bush && wname !== 'storm') target.bush = false;
  const sh0 = target.sh;
  let d = amount;
  if (!target.down) { const s = Math.min(target.sh, d); target.sh -= s; d -= s; }
  target.hp -= d;
  if (attacker && attacker !== target) send(attacker, { t: 'dmg', id: target.id, n: Math.round(amount), head: head ? 1 : 0, sh: sh0 > 0 && !target.down ? 1 : 0, brk: sh0 > 0 && target.sh <= 0 && !target.down ? 1 : 0 });
  send(target, { t: 'hurt', ax: attacker ? attacker.x : null, az: attacker ? attacker.z : null, kb: kb || null });
  if (target.hp <= 0) {
    if (!target.down && matchMode === 'duo' && standing(target.mate)) knock(target, attacker, wname);
    else kill(target, attacker, wname);
    return;
  }
  if (target.bot && !target.down && attacker && attacker !== target && target.st === 'ground') {
    target.threat = attacker; target.threatT = gameT + 5; target.lastHurt = gameT;
    if (target.healT > gameT) target.healT = 0;
    if (gameT >= target.nextWall && wname !== 'pick' && wname !== 'car' && Math.random() < 0.45 * target.skill) { target.nextWall = gameT + 4 + Math.random() * 5; botWall(target, attacker); }
  }
}
function knock(t, attacker, wname) {
  t.down = true; t.hp = 100; t.sh = 0; t.knockBy = attacker && attacker !== t ? attacker : null; t.rev = null;
  releaseCar(t); t.tgt = null;
  broadcast({ t: 'knock', v: t.id, k: t.knockBy ? t.knockBy.id : 0, w: wname });
}
function kill(target, attacker, wname) {
  if (!target.alive) return;
  const killer = wname === 'quit' ? null : attacker && attacker !== target ? attacker : target.knockBy || null;
  target.alive = false; target.hp = 0; target.down = false; target.rev = null;
  if (killer) { killer.kills++; if (killer.bot && killer.alive) killer.emoteT = gameT + 2.4; }
  releaseCar(target);
  const tl = teamsAlive(), out = !tl.has(target.team);
  broadcast({ t: 'kill', v: target.id, k: killer ? killer.id : 0, w: wname, place: tl.size + (out ? 1 : 0), kills: killer ? killer.kills : 0, out: out ? 1 : 0 });
  if (target.bot && phase === 'game') {
    const items = [{ k: 'm', m: 'wood', n: 40 + rnd(60) }];
    if (target.wpn) items.push({ k: 'w', w: target.wpn.w, r: target.wpn.r, mag: S.W[target.wpn.w].mag }, ammoFor(target.wpn.w));
    if (Math.random() < 0.5) items.push(rndCons());
    scatter(items, target.x, target.y, target.z, true);
  }
  // Teammate liegt am Boden und niemand steht mehr: Team ist raus
  target.card = null; target.rbt = null;
  const m = target.mate;
  if (m && m.alive && m.down) kill(m, m.knockBy, 'bleed');
  if (m && m.alive && phase === 'game' && wname !== 'quit' && matchMode === 'duo') {
    const cd = { id: world.oid++, x: target.x, y: Math.max(target.y, S.height(target.x, target.z)), z: target.z, o: target.id, team: target.team, until: gameT + 90 };
    world.cards.set(cd.id, cd); broadcast({ t: 'card+', c: packCard(cd) });
  }
  checkWin();
}
function finish(team) {
  if (phase !== 'game') return;
  phase = 'end'; endT = 10;
  const w = team != null ? entList.filter((e) => e.team === team) : [];
  broadcast({ t: 'win', team: team == null ? null : team, ids: w.map((e) => e.id), name: w.map((e) => e.name).join(' & ') });
}
function checkWin() { if (phase !== 'game') return; const t = teamsAlive(); if (t.size <= 1) finish(t.size ? [...t][0] : null); }
function startRevive(e, v) {
  if (!standing(e) || !v || !v.alive || !v.down || v.team !== e.team || Math.hypot(v.x - e.x, v.z - e.z) > 3.2 || e.rev) return;
  e.rev = { v, t: gameT }; releaseCar(e);
  broadcast({ t: 'rev', v: v.id, by: e.id, on: 1 });
}
function stopRevive(e) { if (!e.rev) return; broadcast({ t: 'rev', v: e.rev.v.id, by: e.id, on: 0 }); e.rev = null; }
function stopReboot(e) { if (!e.rbt) return; broadcast({ t: 'rbt', by: e.id, on: 0 }); e.rbt = null; }
function startReboot(e, van) {
  if (!standing(e) || !e.card || !van || e.rbt || Math.hypot(van.x - e.x, van.z - e.z) > 5) return;
  e.rbt = { van, t: gameT }; releaseCar(e); broadcast({ t: 'rbt', by: e.id, on: 1, v: e.card });
}
function reboot(o, van, by) {
  if (!o || o.alive || o.team !== by.team || (!o.bot && !clients.has(o.id))) return false;
  Object.assign(o, { alive: true, hp: 100, sh: 0, down: false, rev: null, knockBy: null, car: null, fl: 0, bush: false, card: null, rbt: null, x: van.x + 1.5, y: van.y, z: van.z + 1.5, dropped: false });
  if (o.bot) { Object.assign(o, { st: 'ground', tgt: null, chest: null, jy: 0, jv: 0, emoteT: 0 }); armBot(o, 'pistol', 0); newWaypoint(o); }
  else send(o, { t: 'reborn', x: o.x, y: o.y, z: o.z });
  broadcast({ t: 'rebooted', v: o.id, by: by.id });
  return true;
}
function tickWorld(dt) {
  for (const p of world.growing) { if (!world.pieces.has(p.key)) { world.growing.delete(p); continue; } const mx = S.MATS[p.mat].hp; p.hp = Math.min(mx, p.hp + p.rate * dt); if (p.hp >= mx) world.growing.delete(p); }
  for (const [id, c] of world.cards) if (gameT > c.until || !entMap.get(c.o) || entMap.get(c.o).alive) { world.cards.delete(id); broadcast({ t: 'card-', id, by: 0 }); }
  for (let i = world.gas.length - 1; i >= 0; i--) {
    const g = world.gas[i]; g.acc += dt;
    if (g.acc >= 0.5) { g.acc = 0; forNear(g.x, g.z, 8, (e) => { if (e.alive && !(e.fl & 1) && e !== g.by && Math.hypot(e.x - g.x, e.y + 0.9 - g.y, e.z - g.z) < 5.5) damage(e, 5, g.by, 'stink'); }); }
    if (gameT > g.until) world.gas.splice(i, 1);
  }
  for (const e of entList) if (e.rbt) {
    const v = e.rbt.van;
    if (!standing(e) || !e.card || Math.hypot(v.x - e.x, v.z - e.z) > 5.5) stopReboot(e);
    else if (gameT - e.rbt.t >= REBOOT) { const o = entMap.get(e.card); e.rbt = null; if (reboot(o, v, e)) e.card = null; else { e.card = null; broadcast({ t: 'rbt', by: e.id, on: 0 }); } }
  }
}
function tickDowned(dt) {
  for (const e of entList) {
    if (e.rev) {
      const v = e.rev.v;
      if (!standing(e) || !v.alive || !v.down || Math.hypot(v.x - e.x, v.z - e.z) > 3.4) stopRevive(e);
      else if (gameT - e.rev.t >= REVIVE) { v.down = false; v.hp = 30; v.sh = 0; v.knockBy = null; e.rev = null; broadcast({ t: 'revd', v: v.id, by: e.id }); }
    }
    if (e.alive && e.down) { e.hp -= BLEED * dt; if (e.hp <= 0) kill(e, null, 'bleed'); }
  }
}

// ---------- Rundenablauf
const BN = ['Flitzer', 'Keks', 'Wolke', 'Pixel', 'Brumm', 'Zack', 'Mango', 'Nebel', 'Turbo', 'Fuchs', 'Kiesel', 'Rakete', 'Socke', 'Blitz', 'Krümel', 'Otter', 'Zimt', 'Kaktus', 'Nudel', 'Falke', 'Kobold', 'Pfeffer', 'Schnecke', 'Dino', 'Komet', 'Ninja', 'Waffel', 'Panda', 'Gecko', 'Sturmi'];
function shipPos() { const k = Math.min(1.15, gameT / ship.dur); return { x: lerp(ship.ax, ship.bx, k), z: lerp(ship.az, ship.bz, k) }; }
function resetEnt(e) {
  Object.assign(e, { inMatch: true, alive: true, hp: 100, sh: 0, fl: 1, kills: 0, x: ship.ax, y: SHIPY, z: ship.az, yaw: 0, pitch: 0, w: 'pick', wr: 0, car: null, down: false, rev: null, knockBy: null, team: 0, mate: null, bush: false, card: null, rbt: null, proj: {} });
}
function makeBot(name) {
  const b = { id: nextId++, bot: true, name, hue: rnd(360), style: rnd(16),
    st: 'ship', jumpAt: 3 + Math.random() * 46, tx: 0, tz: 0, wx: 0, wz: 0, wpn: null, armAt: 0, nextShot: 0, tgt: null, nextScan: Math.random(), strafe: 1, nextStrafe: 0, nextWp: 0, nextHack: 0,
    skill: 0.55 + Math.random() * 0.6, jy: 0, jv: 0, stuck: 0, detourT: 0, detourA: 0, swT: 0, coverT: 0, relT: 0, relDone: false, emoteT: 0, mag: 0, burst: 4, threat: null, threatT: 0, nextWall: 0, seen: null, chest: null, nextChest: 0, heals: rnd(2), nades: 0, healT: 0, healK: null, nextNade: 0, lastHurt: 0, boxed: 0,
    ox: (Math.random() - 0.5) * 6, oz: (Math.random() - 0.5) * 6, lead: null };
  resetEnt(b);
  return b;
}
function startMatch() {
  genWorld(); gameT = 0; phase = 'game'; noHumansT = 0; stormAcc = 0; matchMode = mode;
  const a = Math.random() * 6.283;
  const off = (Math.random() - 0.5) * S.R * 0.5, L = S.R + 90, px = -Math.sin(a) * off, pz = Math.cos(a) * off;
  ship = { ax: px - Math.cos(a) * L, az: pz - Math.sin(a) * L, bx: px + Math.cos(a) * L, bz: pz + Math.sin(a) * L, dur: 54 };
  const R0 = S.R + 140;
  storm = { i: 0, x: 0, z: 0, r: R0, fx: 0, fz: 0, fr: R0, nx: 0, nz: 0, nr: R0, timer: S.STORM[0].wait, shrink: false, done: false };
  chooseNext();
  const hs = humans();
  for (const c of hs) { resetEnt(c); Object.assign(c, { lastShot: {}, lastHarvest: 0, lastRam: 0, lastNade: 0, dropped: false, spec: 0 }); }
  const names = BN.slice().sort(() => Math.random() - 0.5);
  bots = [];
  for (let i = hs.length; i < TOTAL; i++) bots.push(makeBot(names[i % names.length] + (10 + rnd(89))));
  let all = hs.concat(bots);
  if (matchMode === 'duo') {
    const used = new Set(), bq = bots.slice(), order = [];
    for (const h of hs) { if (used.has(h)) continue; used.add(h); order.push(h); const p = h.party && clients.get(h.party); if (p && hs.includes(p) && !used.has(p)) { used.add(p); order.push(p); } else order.push(bq.shift()); }
    all = order.concat(bq).filter(Boolean);
    for (let i = 0; i < all.length; i += 2) {
      const p = all[i], q = all[i + 1], t = i / 2 + 1; p.team = t; p.mate = q || null;
      if (q) { q.team = t; q.mate = p; if (q.bot && p.bot) { q.lead = p; q.jumpAt = p.jumpAt + 0.4; } }
    }
  } else for (const e of all) { e.team = e.id; e.mate = null; }
  rebuildEnts();
  broadcast({ t: 'start', world: packWorld(), ship, roster: roster(), mode: matchMode });
}
function toLobby() {
  phase = 'lobby'; lobbyT = LOBBY; bots = [];
  for (const c of clients.values()) { c.inMatch = false; c.alive = false; c.car = null; c.down = false; c.rev = null; c.mate = null; c.card = null; c.rbt = null; c.bush = false; }
  rebuildEnts();
  broadcast({ t: 'lobby' });
}
function lobbyMode(hs) {
  let d = 0; for (const c of hs) if (c.mode === 'duo' || c.party) d++;
  if (hs.some((c) => c.party)) return 'duo';
  const s = hs.length - d;
  return d > s ? 'duo' : s > d ? 'solo' : hs.length ? hs[0].mode : 'solo';
}

// ---------- Bots
function clampLand(o, kx, kz, lim) { const m = Math.hypot(o[kx], o[kz]); if (m > lim) { o[kx] *= lim / m; o[kz] *= lim / m; } }
function newWaypoint(b, force) {
  let cx = storm.x, cz = storm.z, r = storm.r * 0.6;
  if (!force && storm.nr > 0) { cx = storm.nx; cz = storm.nz; r = storm.nr * 0.8; }
  else if (force) { cx = storm.nx; cz = storm.nz; r = storm.nr * 0.6; }
  const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * Math.min(r, 260);
  b.wx = cx + Math.cos(a) * d; b.wz = cz + Math.sin(a) * d;
  clampLand(b, 'wx', 'wz', LIM);
  b.nextWp = gameT + 12 + Math.random() * 15;
}
function los(a, e, d) {
  const dx = e.x - a.x, dy = e.y + 1.2 - (a.y + 1.5), dz = e.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
  // Gelände (Berge/Hügel) blockiert die Sicht – Bots schießen nicht mehr durch Berge
  const n = Math.ceil(l / 2.5);
  for (let i = 1; i < n; i++) { const f = i / n, y = a.y + 1.5 + dy * f; if (y < S.height(a.x + dx * f, a.z + dz * f) - 0.2) return false; }
  return !world.pg.ray(a.x, a.y + 1.5, a.z, dx / l, dy / l, dz / l, l);
}
function blockedObj(x, z, y) {
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
    const arr = world.grid.get(a + ',' + b); if (!arr) continue;
    for (const o of arr) {
      if (!world.objs.has(o.id)) continue; const dx = x - o.x, dz = z - o.z;
      if (o.t === 'prop') { if (y != null && (o.y > y + 1.8 || o.y + o.h < y + 0.3)) continue; if (o.c === 'b') { if (Math.abs(dx) < o.hx + 0.4 && Math.abs(dz) < o.hz + 0.4) return true; continue; } }
      const r = o.r + 0.4; if (dx * dx + dz * dz < r * r) return true;
    }
  }
  for (const c of world.cars.values()) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < 4.4) return true; }
  return false;
}
function moveBot(b, dx, dz, speed, dt, noHack) {
  const l = Math.hypot(dx, dz); if (l < 1e-6) return false;
  dx /= l; dz /= l;
  if (b.detourT > gameT) { const cs = Math.cos(b.detourA), sn = Math.sin(b.detourA), x = dx * cs - dz * sn; dz = dx * sn + dz * cs; dx = x; }
  const step = speed * dt;
  const hit = world.pg.ray(b.x, b.y - b.jy + 1, b.z, dx, 0, dz, step + 0.7);
  if (hit) {
    b.stuck += dt;
    if (b.stuck > 1.3 && !noHack) { if (gameT >= b.nextHack) { b.nextHack = gameT + 0.45; b.swT = gameT + 0.3; hitPiece(hit.key, 50); } }
    else if (!(b.detourT > gameT)) { b.detourT = gameT + 0.9; b.detourA = (Math.random() < 0.5 ? 1 : -1) * 1.45; }
    return false;
  }
  const nx = b.x + dx * step, nz = b.z + dz * step;
  if (S.height(nx, nz) < 0.15) { if (!b.down) newWaypoint(b, true); if (!(b.detourT > gameT)) { b.detourT = gameT + 1.2; b.detourA = Math.PI * (0.6 + Math.random() * 0.8); } return false; }
  if (blockedObj(nx, nz, b.y)) { if (!(b.detourT > gameT)) { b.detourT = gameT + 0.45; b.detourA = (Math.random() < 0.5 ? 1 : -1) * 1.25; } return false; }
  b.x = nx; b.z = nz; b.stuck = Math.max(0, b.stuck - dt * 2);
  return true;
}
function botBoom(b, x, y, z) {
  if (phase !== 'game') return;
  broadcastNear({ t: 'boom', x, y, z }, x, z, 320);
  forNear(x, z, 8, (e) => { if (!e.alive || (e.fl & 1)) return; const d = Math.hypot(e.x - x, e.y + 0.9 - y, e.z - z); if (d < 6.5) damage(e, (12 + 98 * (1 - d / 6.5)) * (e.bot ? 0.6 : 1), b, 'gren', false, [(e.x - x) / (d || 1) * 10, 7.5, (e.z - z) / (d || 1) * 10]); });
  for (const p of [...world.pieces.values()]) if (Math.abs((p.ix + 0.5) * G - x) < 6 && Math.abs((p.iz + 0.5) * G - z) < 6 && Math.hypot((p.ix + 0.5) * G - x, (p.iy + 0.5) * H - y, (p.iz + 0.5) * G - z) < 5) hitPiece(p.key, 330);
}
function armBot(b, w, r) { b.wpn = { w, r }; b.w = w; b.wr = r; b.mag = S.W[w].mag; b.burst = 3 + rnd(5); }
function botWall(b, a) {
  const dx = a.x - b.x, dz = a.z - b.z, ax = Math.abs(dx) > Math.abs(dz), pcx = Math.floor(b.x / G), pcz = Math.floor(b.z / G);
  const p = ax ? { t: 'w', d: 1, ix: dx > 0 ? pcx + 1 : pcx, iz: pcz } : { t: 'w', d: 0, ix: pcx, iz: dz > 0 ? pcz + 1 : pcz };
  p.iy = Math.floor((b.y - b.jy + 0.4) / H); p.mat = Math.random() < 0.7 ? 'wood' : 'stone';
  if (addPiece(p, true)) { b.coverT = gameT + 1.6 + Math.random() * 1.6; b.swT = gameT + 0.2; }
}
function openChest(ch) {
  ch.open = 1; broadcast({ t: 'chest', id: ch.id });
  if (ch.k === 'a') {
    const a = pick(['light', 'medium', 'shells', 'heavy']), b = pick(['light', 'medium', 'shells', 'heavy', 'rockets']);
    const items = [{ k: 'a', a, n: AMMO_N[a] * 2 }, { k: 'a', a: b, n: AMMO_N[b] }];
    if (Math.random() < 0.45) items.push({ k: 'c', c: Math.random() < 0.7 ? 'gren' : 'stink', n: 2 });
    return items;
  }
  if (ch.k === 'd') {
    const w1 = rndWeapon(3), w2 = rndWeapon(3);
    w1.r = Math.random() < 0.25 ? 5 : Math.max(w1.r, 4);
    return [w1, ammoFor(w1.w), w2, ammoFor(w2.w), { k: 'c', c: Math.random() < 0.5 ? 'chug' : 'pot', n: 1 }, { k: 'm', m: 'metal', n: 100 }, { k: 'm', m: 'wood', n: 100 }];
  }
  const w = rndWeapon(Math.random() < 0.35 ? 2 : 0), items = [w, ammoFor(w.w), { k: 'm', m: pick(['wood', 'stone', 'metal']), n: 30 }];
  if (Math.random() < 0.65) items.push(rndCons());
  return items;
}
function botTick(b, dt) {
  const mate = b.mate && b.mate.alive ? b.mate : null;
  if (b.st === 'ship') {
    const p = shipPos(); b.x = p.x; b.z = p.z; b.y = SHIPY;
    const last = ship.dur - 2;
    let go = gameT >= b.jumpAt || gameT > last;
    if (mate && !mate.bot) go = gameT > last || (gameT > 1.5 && !(mate.fl & 1)) || (gameT >= b.jumpAt && !mate.inMatch);
    if (go) {
      b.st = 'air'; b.fl = 2;
      const cand = S.POIS.filter((p2) => Math.hypot(p2.x - b.x, p2.z - b.z) < 380);
      const a = Math.random() * 6.283;
      if (b.lead && b.lead.st !== 'ship') { b.tx = b.lead.tx + b.ox; b.tz = b.lead.tz + b.oz; }
      else if (cand.length && Math.random() < 0.75) { const p2 = pick(cand), d = Math.random() * p2.r; b.tx = p2.x + Math.cos(a) * d; b.tz = p2.z + Math.sin(a) * d; }
      else { const d = Math.random() * 200; b.tx = b.x + Math.cos(a) * d; b.tz = b.z + Math.sin(a) * d; }
      clampLand(b, 'tx', 'tz', LIM);
    }
    return;
  }
  if (b.st === 'air') {
    if (mate && !mate.bot && !(mate.fl & 1)) { b.tx = mate.x + b.ox; b.tz = mate.z + b.oz; clampLand(b, 'tx', 'tz', LIM); }
    const dx = b.tx - b.x, dz = b.tz - b.z, l = Math.hypot(dx, dz), g = S.height(b.x, b.z), above = b.y - g;
    if (b.fl === 2 && above < 220 && l > above * 1.9) b.fl = 4;
    if (above < 36) b.fl = 4;
    const glide = b.fl === 4;
    if (l > 0.5) { const s = Math.min(l, (glide ? 15 : 24) * dt); b.x += (dx / l) * s; b.z += (dz / l) * s; b.yaw = Math.atan2(-dx, -dz); }
    b.y -= (glide ? 6.5 : 32) * dt;
    if (b.y <= g) { b.y = g; b.st = 'ground'; b.fl = 0; b.armAt = gameT + 14 + Math.random() * 10; b.chest = null; b.nextChest = 0; newWaypoint(b); }
    return;
  }
  if (b.down) {
    b.jy = b.jv = 0; b.tgt = null; b.pitch = 0; b.w = 'none'; b.fl = 512;
    const m = standing(mate) ? mate : null;
    if (m && !(m.rev && m.rev.v === b)) { const dx = m.x - b.x, dz = m.z - b.z; if (Math.hypot(dx, dz) > 1.6) { b.yaw = Math.atan2(-dx, -dz); moveBot(b, dx, dz, 1.6, dt, true); } }
    b.y = S.height(b.x, b.z);
    return;
  }
  if (b.jy > 0 || b.jv > 0) { b.jv -= 22 * dt; b.jy += b.jv * dt; if (b.jy <= 0) { b.jy = 0; b.jv = 0; } }
  if (!b.wpn && gameT >= b.armAt) armBot(b, wpick({ ar: 32, smg: 22, shotgun: 20, pistol: 13, tac: 9, hunt: 4 }), +wpick({ 0: 50, 1: 30, 2: 15, 3: 5 }));
  if (b.rbt) { const v = b.rbt.van; b.yaw = Math.atan2(-(v.x - b.x), -(v.z - b.z)); b.fl = 8; b.w = 'none'; b.pitch = 0; b.y = S.height(b.x, b.z); return; }
  if (b.rev) { const v = b.rev.v; b.yaw = Math.atan2(-(v.x - b.x), -(v.z - b.z)); b.fl = 8; b.w = 'none'; b.pitch = -0.4; b.y = S.height(b.x, b.z); return; }
  if (gameT >= b.nextScan) {
    b.nextScan = gameT + 0.45;
    let best = null, bd = 72;
    forNear(b.x, b.z, 72, (e) => {
      if (e === b || !e.alive || e.team === b.team || (e.fl & 7)) return;
      const d = Math.hypot(e.x - b.x, e.y - b.y, e.z - b.z) + (e.down ? 12 : 0);
      if (d < bd && los(b, e, d)) { bd = d; best = e; }
    });
    const th = b.threat;
    if (th && th.alive && b.threatT > gameT && th !== best && th.team !== b.team) { const d = Math.hypot(th.x - b.x, th.y - b.y, th.z - b.z); if (d < 95 && los(b, th, d)) best = th; }
    if (best !== b.tgt) { b.tgt = best; b.nextShot = Math.max(b.nextShot, gameT + (0.6 + Math.random() * 0.5) / b.skill); }
    if (best) b.seen = { x: best.x, z: best.z, t: gameT };
    if (Math.hypot(b.x - storm.x, b.z - storm.z) > storm.r - 5 || (storm.nr && !storm.shrink && storm.timer < 25 + b.skill * 10 && Math.hypot(b.x - storm.nx, b.z - storm.nz) > storm.nr - 8 && b.toNext !== storm.i)) { newWaypoint(b, true); b.toNext = storm.i; b.chest = null; }
    if ((!b.wpn || (b.wpn.r < 3 && !best)) && !b.chest && gameT >= b.nextChest) {
      b.nextChest = gameT + 3; let cd = b.wpn ? 32 : 75;
      for (const ch of world.chests.values()) { if (ch.open || (ch.bot && ch.bot !== b.id) || Math.abs(ch.y - S.height(ch.x, ch.z)) > 0.5) continue; const d = Math.hypot(ch.x - b.x, ch.z - b.z); if (d < cd) { cd = d; b.chest = ch; } }
      if (b.chest) b.chest.bot = b.id;
    }
  }
  const t = b.tgt, crouchNow = b.coverT > gameT, reloading = b.relT > gameT;
  let fl = 0;
  // Heilen (mit Animation), nur wenn gerade niemand schießt
  if (b.healT > gameT) {
    if (t && t.alive && gameT - b.lastHurt < 1) b.healT = 0;
    else { b.fl = 8192 | (b.boxed > gameT ? 8 : 0); b.w = b.healK; b.pitch = 0; b.y = S.height(b.x, b.z) + b.jy; return; }
  } else if (b.healK) {
    if (b.healK === 'med') b.hp = 100; else b.sh = Math.min(100, b.sh + 50);
    b.healK = null; b.heals = Math.max(0, b.heals - 1);
  }
  if (b.heals > 0 && !b.healK && gameT - b.lastHurt > (t ? 6 : 2.5) && (b.hp < 70 || (b.sh < 50 && !t))) {
    b.healK = b.hp < 70 ? 'med' : 'pot'; b.healT = gameT + (b.healK === 'med' ? 6 : 3.5);
  }
  // wenig Leben im Kampf: Kasten bauen und heilen
  if (t && b.hp < 45 && b.heals > 0 && b.boxed < gameT - 15 && Math.random() < 0.6 * b.skill) {
    b.boxed = gameT + 7; const pcx = Math.floor(b.x / G), pcz = Math.floor(b.z / G), iy = Math.floor((b.y - b.jy + 0.4) / H), mat = Math.random() < 0.5 ? 'stone' : 'wood';
    for (const p of [{ t: 'w', d: 0, ix: pcx, iz: pcz }, { t: 'w', d: 0, ix: pcx, iz: pcz + 1 }, { t: 'w', d: 1, ix: pcx, iz: pcz }, { t: 'w', d: 1, ix: pcx + 1, iz: pcz }, { t: 'c', ix: pcx, iz: pcz, iy: iy + 1 }]) addPiece({ ...p, iy: p.iy ?? iy, mat }, true, true);
    b.x = (pcx + 0.5) * G; b.z = (pcz + 0.5) * G; b.healK = 'med'; b.healT = gameT + 6; b.coverT = gameT + 6;
  }
  // Granate werfen, wenn der Gegner hinter Deckung steckt
  if (t && t.alive && b.nades > 0 && gameT >= b.nextNade && b.wpn) {
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz);
    if (d > 8 && d < 30 && !los(b, t, d) && Math.random() < 0.5) {
      b.nades--; b.nextNade = gameT + 6 + Math.random() * 5; b.swT = gameT + 0.3;
      const ft = 0.6 + d / 30, o = [r2(b.x), r2(b.y + 1.6), r2(b.z)], v = [r2(dx / ft), r2((t.y - b.y - 0.4) / ft + 10 * ft), r2(dz / ft)];
      broadcastNear({ t: 'nade', id: b.id, k: 'gren', o, v }, b.x, b.z, 260);
      const tx = t.x + (Math.random() - 0.5) * 3, tz = t.z + (Math.random() - 0.5) * 3, ty = S.height(tx, tz);
      world.timers = world.timers || []; world.timers.push({ at: gameT + 2.4, f: () => botBoom(b, tx, ty + 0.3, tz) });
    }
  }
  if (b.relDone && !reloading) { b.relDone = false; b.mag = S.W[b.wpn.w].mag; }
  if (b.emoteT > gameT && !t) { b.fl = 256; b.pitch = 0; b.y = S.height(b.x, b.z) + b.jy; return; }
  if (t && t.alive && b.wpn) {
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1, d3 = Math.hypot(dx, t.y - b.y, dz);
    b.yaw = Math.atan2(-dx, -dz); b.pitch = Math.atan2(t.y + (t.down ? 0.3 : 1.2) - b.y - 1.4, d);
    if (gameT >= b.nextStrafe) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.nextStrafe = gameT + 0.7 + Math.random() * 1.3; if (d < 22 && b.jy === 0 && Math.random() < 0.3 * b.skill) b.jv = 7.2; }
    const want = { shotgun: 7, tac: 7, smg: 13, pistol: 16, ar: 22, hunt: 40, sniper: 45 }[b.wpn.w] || 18;
    const f = crouchNow ? 0 : d > want + 3 ? 1 : d < want - 3 ? -0.7 : 0, sf = crouchNow ? 0.25 : 0.75;
    moveBot(b, (dx / d) * f + (-dz / d) * b.strafe * sf, (dz / d) * f + (dx / d) * b.strafe * sf, crouchNow ? 2 : 4.4, dt);
    if (crouchNow) fl |= 8;
    if (d3 > 24 && !reloading) fl |= 64;
    if (crouchNow && b.hp < 75) b.hp = Math.min(75, b.hp + 9 * dt);
    if (gameT >= b.nextShot && !reloading && !crouchNow) {
      const W = S.W[b.wpn.w];
      b.nextShot = gameT + (W.rate / 1000) * 1.5 + Math.random() * 0.1;
      if (--b.burst <= 0 && W.rate < 300) { b.burst = 3 + rnd(6); b.nextShot += 0.35 + Math.random() * 0.6; }
      if (--b.mag <= 0) { b.relT = gameT + W.rel; b.relDone = true; }
      const clear = los(b, t, d3);
      let p = Math.min(0.26, Math.max(0.04, 0.34 - d3 / 160)) * b.skill;
      if (t.fl & 8) p *= 0.8; if (t.fl & 16) p *= 0.6;
      let n = 0;
      if (clear) for (let i = 0; i < W.pellets; i++) if (Math.random() < p) n++;
      const miss = n ? 0 : 1.5, ty = t.y + (t.down ? 0.35 : 1.2);
      broadcastNear({ t: 'shot', id: b.id, o: [r1(b.x), r1(b.y + 1.4), r1(b.z)], e: [r1(t.x + (Math.random() - 0.5) * miss * 2), r1(ty + (Math.random() - 0.3) * miss), r1(t.z + (Math.random() - 0.5) * miss * 2)], w: b.wpn.w }, b.x, b.z, 230);
      const head = n > 0 && W.pellets === 1 && Math.random() < 0.12 * b.skill;
      if (n) damage(t, S.wdmg(b.wpn.w, b.wpn.r, d3, head) * n * (t.bot ? 0.6 : 1), b, b.wpn.w, head);
      else if (!clear) { const l = d3 || 1, h = world.pg.ray(b.x, b.y + 1.5, b.z, dx / l, (ty - b.y - 1.5) / l, dz / l, l); if (h) hitPiece(h.key, W.dmg * W.pellets * 0.5); }
    }
  } else if (t && t.alive && !b.wpn && Math.hypot(t.x - b.x, t.z - b.z) < 9) {
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1;
    b.yaw = Math.atan2(-dx, -dz); b.pitch = 0;
    if (d > 1.8) moveBot(b, dx, dz, 5.6, dt);
    else if (gameT >= b.nextHack) { b.nextHack = gameT + 0.55; b.swT = gameT + 0.3; damage(t, 20 * (t.bot ? 0.5 : 1), b, 'pick'); }
  } else {
    b.pitch = 0;
    let gx = b.wx, gz = b.wz, sp = 5, mateGoal = false;
    let card = null, van = null;
    if (b.card) { let vd = 1e9; for (const v of world.vans) { const dd = Math.hypot(v.x - b.x, v.z - b.z); if (dd < vd) { vd = dd; van = v; } } }
    else if (matchMode === 'duo' && b.mate && !b.mate.alive) for (const c of world.cards.values()) if (c.team === b.team) { card = c; break; }
    if (mate && mate.down) { gx = mate.x; gz = mate.z; sp = 5.8; mateGoal = true; }
    else if (van) { gx = van.x; gz = van.z; sp = 5.8; mateGoal = true; if (Math.hypot(gx - b.x, gz - b.z) < 3.5) startReboot(b, van); }
    else if (card) { gx = card.x; gz = card.z; sp = 5.8; mateGoal = true; if (Math.hypot(gx - b.x, gz - b.z) < 2.5) { world.cards.delete(card.id); b.card = card.o; broadcast({ t: 'card-', id: card.id, by: b.id }); } }
    else if (b.chest && !b.chest.open) { gx = b.chest.x; gz = b.chest.z; sp = 5.8; }
    else if (b.seen && gameT - b.seen.t < 4 && b.wpn) { gx = b.seen.x; gz = b.seen.z; sp = 5.6; }
    else if (mate && Math.hypot(mate.x - b.x, mate.z - b.z) > 22) { gx = mate.x + b.ox; gz = mate.z + b.oz; sp = 5.8; mateGoal = true; }
    else if (b.chest) b.chest = null;
    const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz);
    if (mate && mate.down && d < 2.2) startRevive(b, mate);
    else if (!mateGoal && b.chest && d < 2.3) {
      const items = openChest(b.chest), w = items.find((i) => i.k === 'w' && i.w !== 'rpg');
      if (w && (!b.wpn || w.r > b.wpn.r)) armBot(b, w.w, w.r); else if (!b.wpn) armBot(b, 'pistol', 0);
      if (items.some((i) => i.c === 'pot' || i.c === 'mini')) b.sh = Math.min(100, b.sh + 50);
      for (const i of items) { if (i.c === 'band' || i.c === 'med' || i.c === 'chug') b.heals = Math.min(4, b.heals + 1); if (i.c === 'gren') b.nades = Math.min(3, b.nades + (i.n || 1)); }
      if (w && b.wpn && w.r <= b.wpn.r && w.w !== b.wpn.w) scatter([w], b.chest.x, b.chest.y, b.chest.z, true);
      scatter(items.filter((i) => i !== w && i.c !== 'pot' && i.c !== 'mini' && i.c !== 'band' && i.c !== 'med' && i.c !== 'chug' && i.c !== 'gren'), b.chest.x, b.chest.y, b.chest.z, true);
      b.chest = null;
    } else if (!mateGoal && (d < 2.5 || gameT >= b.nextWp)) { if (!b.chest) newWaypoint(b); b.seen = null; }
    else if (d > 1.2) { b.yaw = Math.atan2(-dx, -dz); moveBot(b, dx, dz, sp, dt); }
    if (b.hp < 75) b.hp = Math.min(75, b.hp + 5 * dt);
  }
  if (reloading) fl |= 32;
  if (b.swT > gameT) fl |= 128;
  b.fl = fl; b.w = b.swT > gameT || !b.wpn ? 'pick' : b.wpn.w;
  b.y = S.height(b.x, b.z) + b.jy;
}

// ---------- Tick
function sendStates() {
  const ents = [];
  for (const e of entList) if (e.alive) ents.push([e, JSON.stringify([e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.pitch), Math.ceil(e.hp), Math.ceil(e.sh), e.fl | (e.down ? 512 : 0) | (e.bush ? 1024 : 0) | (e.card ? 4096 : 0), e.w, e.wr | 0])]);
  const sp = shipPos(), cs = [];
  for (const c of world.cars.values()) if (c.dirty > 0) { c.dirty--; cs.push([c.id, r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), c.drv]); }
  const head = JSON.stringify({ t: 's', ph: phase, al: ents.length, tl: teamsAlive().size, gt: r1(gameT),
    st: [r1(storm.x), r1(storm.z), r1(storm.r), r1(storm.nx), r1(storm.nz), r1(storm.nr), Math.ceil(storm.timer), storm.shrink ? 1 : 0, storm.i, storm.done ? 1 : 0],
    ship: gameT < ship.dur * 1.15 ? [r1(sp.x), r1(sp.z)] : null, cs }).slice(0, -1) + ',"p":[';
  const all = tickN % 4 === 0;
  for (const c of clients.values()) {
    if (!c.joined || !c.ws || c.ws.readyState !== 1) continue;
    const v = viewOf(c), parts = [];
    for (const [e, s] of ents) if (all || e === c || (c.inMatch && e.team === c.team) || (Math.abs(e.x - v.x) < NEAR && Math.abs(e.z - v.z) < NEAR)) parts.push(s);
    c.ws.send(head + parts.join(',') + ']}');
  }
}
let last = Date.now();
setInterval(() => {
  const now = Date.now(), dt = SPEED > 1 ? 0.066 : Math.min(0.2, (now - last) / 1000); last = now; tickN++;
  try {
    const hs = humans();
    if (phase === 'lobby') {
      mode = lobbyMode(hs);
      if (hs.length) { lobbyT -= dt; if (lobbyT <= 0) startMatch(); }
      else lobbyT = LOBBY;
      if (phase === 'lobby' && tickN % 4 === 0) { const d = hs.filter((c) => c.mode === 'duo').length; broadcast({ t: 's', ph: 'lobby', tm: Math.ceil(lobbyT), names: hs.map((c) => c.name), pl: hs.map((c) => [c.id, c.name, c.party || 0]), mode, v: [hs.length - d, d] }); }
      return;
    }
    if (!hs.length || !hs.some((c) => c.inMatch)) { toLobby(); return; }
    if (phase === 'end') { endT -= dt; if (endT <= 0) { toLobby(); return; } }
    rebuildGrid();
    if (phase === 'game') {
      gameT += dt;
      tickStorm(dt);
      for (const b of bots) if (b.alive) botTick(b, dt);
      tickDowned(dt);
      tickWorld(dt);
      if (world.timers && world.timers.length) { const due = world.timers.filter((x) => x.at <= gameT); world.timers = world.timers.filter((x) => x.at > gameT); for (const x of due) try { x.f(); } catch (e) { console.error(e); } }
      stormAcc += dt;
      if (stormAcc >= 1) {
        stormAcc -= 1;
        const dmg = S.STORM[storm.i].dmg;
        for (const e of entList) if (e.alive && !(e.fl & 1) && Math.hypot(e.x - storm.x, e.z - storm.z) > storm.r) damage(e, dmg, null, 'storm');
      }
      if (phase === 'game') {
        const ht = new Set(hs.filter((c) => c.inMatch).map((c) => c.team));
        if (!entList.some((e) => e.alive && ht.has(e.team))) {
          noHumansT += dt;
          if (noHumansT > 6) { const sc = new Map(); for (const e of entList) if (e.alive) sc.set(e.team, (sc.get(e.team) || 0) + e.kills + 0.01); let bt = null, bv = -1; for (const [t, v] of sc) if (v > bv) { bv = v; bt = t; } finish(bt); }
        } else noHumansT = 0;
      }
    }
    sendStates();
  } catch (e) { console.error('Tick-Fehler', e); }
}, 66 / SPEED);

// ---------- Nachrichten
const WCODES = new Set(['pick', 'build', 'none', ...Object.keys(S.W), ...Object.keys(S.CONS)]);
function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.k === 'w' && S.W[it.w]) return { k: 'w', w: it.w, r: Math.min(5, Math.max(0, it.r | 0)), mag: Math.min(S.W[it.w].mag, Math.max(0, it.mag | 0)) };
  if (it.k === 'c' && S.CONS[it.c]) return { k: 'c', c: it.c, n: Math.min(S.CONS[it.c].max, Math.max(1, it.n | 0)) };
  if (it.k === 'a' && S.AMMO[it.a]) return { k: 'a', a: it.a, n: Math.min(999, Math.max(1, it.n | 0)) };
  if (it.k === 'm' && S.MATS[it.m]) return { k: 'm', m: it.m, n: Math.min(1000, Math.max(1, it.n | 0)) };
  return null;
}
function onMsg(c, m) {
  if (m.t === 'join') {
    if (c.joined) return;
    c.name = String(m.name || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 14) || 'Spieler' + c.id;
    c.joined = true; c.hue = Math.min(359, Math.max(0, m.hue | 0)); c.style = (m.style | 0) & 15; c.mode = m.mode === 'duo' ? 'duo' : 'solo';
    // Läuft nur noch eine Runde mit Bots (kein Mensch mehr drin)? Dann gleich neue Runde statt Zuschauen.
    if (phase !== 'lobby' && ![...clients.values()].some((o) => o !== c && o.joined && o.inMatch && o.alive)) toLobby();
    send(c, { t: 'init', id: c.id, phase, mode: phase !== 'lobby' ? matchMode : mode, world: phase !== 'lobby' ? packWorld() : null, ship, roster: phase !== 'lobby' ? roster() : [] });
    return;
  }
  if (!c.joined) return;
  if (m.t === 'mode') { c.mode = m.m === 'duo' ? 'duo' : 'solo'; return; }
  if (m.t === 'spec') { c.spec = m.id | 0; return; }
  if (m.t === 'inv') { const o = clients.get(m.id | 0); if (o && o !== c && o.joined && !o.inMatch && o.party !== c.id) send(o, { t: 'inv', from: c.id, name: c.name }); return; }
  if (m.t === 'invok') {
    const o = clients.get(m.id | 0); if (!o || o === c || !o.joined) return;
    for (const x of [c, o]) { const old = x.party && clients.get(x.party); if (old && old.party === x.id) { old.party = 0; send(old, { t: 'party', id: 0 }); } }
    c.party = o.id; o.party = c.id; c.mode = o.mode = 'duo';
    send(c, { t: 'party', id: o.id, name: o.name }); send(o, { t: 'party', id: c.id, name: c.name }); return;
  }
  if (m.t === 'invno') { const o = clients.get(m.id | 0); if (o) send(o, { t: 'invno', name: c.name }); return; }
  if (m.t === 'unparty') { const o = c.party && clients.get(c.party); if (o && o.party === c.id) { o.party = 0; send(o, { t: 'party', id: 0, left: c.name }); } c.party = 0; send(c, { t: 'party', id: 0 }); return; }
  if (phase === 'lobby' || !c.inMatch) return;
  const live = c.alive && phase === 'game', up = live && !c.down;
  switch (m.t) {
    case 'pos':
      if (!c.alive) return;
      c.x = num(m.x, c.x); c.y = num(m.y, c.y); c.z = num(m.z, c.z); c.yaw = num(m.yaw); c.pitch = num(m.pitch);
      c.fl = (m.fl | 0) & (495 | 2048 | 8192 | 16384 | 32768); c.wr = Math.min(5, Math.max(0, m.wr | 0)); c.w = WCODES.has(m.w) ? m.w : 'pick';
      if (gameT > ship.dur + 2) c.fl &= ~1;
      if (c.down) c.fl &= ~(1 | 2 | 4 | 64 | 128 | 256);
      if (c.car) { const car = world.cars.get(c.car); if (car) { c.fl |= 16; car.x = c.x; car.y = c.y; car.z = c.z; car.yaw = num(m.cy); car.dirty = 2; } else c.car = null; }
      break;
    case 'shot':
      if (!up || !S.W[m.w] || !Array.isArray(m.o) || !Array.isArray(m.e)) return;
      broadcastNear({ t: 'shot', id: c.id, o: m.o.slice(0, 3).map((v) => r1(num(v))), e: m.e.slice(0, 3).map((v) => r1(num(v))), w: m.w }, c.x, c.z, 230, c);
      break;
    case 'hit': {
      const W = S.W[m.w], tg = ent(m.id | 0);
      if (!up || !W || !tg || tg === c || (c.fl & 7)) return;
      const now = Date.now();
      if (now - (c.lastShot[m.w] || 0) < W.rate * 0.6) return;
      c.lastShot[m.w] = now;
      const n = Math.min(W.pellets, Math.max(1, m.n | 0)), d = Math.hypot(tg.x - c.x, tg.y - c.y, tg.z - c.z);
      damage(tg, S.wdmg(m.w, m.r | 0, d, !!m.head) * n, c, m.w, !!m.head);
      break;
    }
    case 'hitpc': { const W = S.W[m.w]; if (!up || !W) return; hitPiece(String(m.k), S.wdmg(m.w, m.r | 0, 0, false) * Math.min(W.pellets, Math.max(1, m.n | 0))); break; }
    case 'harvest': {
      if (!up) return;
      const now = Date.now(); if (now - c.lastHarvest < 300) return; c.lastHarvest = now;
      if (m.k === 'o') {
        const o = world.objs.get(m.id | 0); if (!o || Math.hypot(o.x - c.x, o.z - c.z) > 8 + (o.hx || 0)) return;
        if (o.t === 'prop' && !PJ[o.p].hp) return;
        o.hp -= 34;
        const mat = o.t === 'prop' ? PJ[o.p].m : o.t === 'tree' || o.t === 'crate' ? 'wood' : o.t === 'rock' ? 'stone' : 'metal';
        send(c, { t: 'mat', m: mat, n: o.t === 'tree' ? 20 : o.t === 'prop' ? 12 : 15 });
        if (o.hp <= 0) { world.objs.delete(o.id); broadcast({ t: 'obj-', id: o.id }); }
      } else if (m.k === 'p') {
        const p = world.pieces.get(String(m.key)); if (!p) return;
        send(c, { t: 'mat', m: p.mat, n: 5 }); hitPiece(p.key, 50);
      } else if (m.k === 'c') {
        const car = world.cars.get(m.id | 0); if (!car || Math.hypot(car.x - c.x, car.z - c.z) > 8) return;
        car.hp -= 34; send(c, { t: 'mat', m: 'metal', n: 15 });
        if (car.hp <= 0) explodeCar(car, c);
      } else if (m.k === 'e') {
        const tg = ent(m.id | 0); if (tg && tg !== c && Math.hypot(tg.x - c.x, tg.y - c.y, tg.z - c.z) < 5) damage(tg, 20, c, 'pick');
      }
      break;
    }
    case 'build': {
      const q = m.p; if (!up || !q || (c.fl & 7) || !S.MATS[q.mat] || c.car) return;
      const p = { t: q.t, ix: q.ix | 0, iy: q.iy | 0, iz: q.iz | 0, mat: q.mat };
      if (p.t === 'w') p.d = q.d ? 1 : 0; else if (p.t === 'r') p.rot = (q.rot | 0) & 3; else if (p.t !== 'f' && p.t !== 'c') return;
      if (Math.hypot((p.ix + 0.5) * G - c.x, (p.iy + 0.5) * H - c.y, (p.iz + 0.5) * G - c.z) > 16 || world.pieces.size > 16000) return;
      addPiece(p, true, true);
      break;
    }
    case 'pickup': {
      const l = world.loot.get(m.id | 0); if (!up || !l || Math.hypot(l.x - c.x, l.y - c.y, l.z - c.z) > 7) return;
      world.loot.delete(l.id); broadcast({ t: 'loot-', id: l.id }); send(c, { t: 'got', i: l.i });
      break;
    }
    case 'open': {
      const ch = world.chests.get(m.id | 0); if (!up || !ch || ch.open || (ch.k === 'd' && gameT < ch.land) || Math.hypot(ch.x - c.x, ch.y - c.y, ch.z - c.z) > 6) return;
      scatter(openChest(ch), ch.x, ch.y, ch.z, true);
      break;
    }
    case 'drop': { const it = cleanItem(m.i); if (live && it) addLoot(it, c.x + (Math.random() - 0.5), c.y, c.z + (Math.random() - 0.5), true); break; }
    case 'dropall':
      if (c.alive || c.dropped || !Array.isArray(m.items) || phase !== 'game') return;
      c.dropped = true;
      scatter(m.items.slice(0, 14).map(cleanItem).filter(Boolean), c.x, c.y, c.z, true);
      break;
    case 'nade': {
      const k = m.k === 'stink' || m.k === 'rocket' ? m.k : 'gren';
      if (!up || !Array.isArray(m.o) || !Array.isArray(m.v) || (c.fl & 7)) return;
      c.proj[k] = (c.proj[k] || 0) + 1; c.lastNade = Date.now();
      broadcastNear({ t: 'nade', id: c.id, k, o: m.o.slice(0, 3).map((v) => r2(num(v))), v: m.v.slice(0, 3).map((v) => r2(Math.max(-90, Math.min(90, num(v))))) }, c.x, c.z, 260, c);
      break;
    }
    case 'boom': {
      const k = m.k === 'stink' || m.k === 'rocket' ? m.k : 'gren';
      if (phase !== 'game' || !(c.proj[k] > 0) || Date.now() - c.lastNade > 12000) return;
      const x = num(m.x), y = num(m.y), z = num(m.z);
      if (Math.hypot(x - c.x, z - c.z) > 250) return;
      c.proj[k]--;
      if (k === 'stink') { world.gas.push({ x, y, z, until: gameT + 8, by: c, acc: 0 }); broadcastNear({ t: 'gas', x, y, z, d: 8 }, x, z, 300); break; }
      const R = k === 'rocket' ? 5.5 : 6.5, D = k === 'rocket' ? 95 : 98, P = k === 'rocket' ? 600 : 330;
      broadcastNear({ t: 'boom', x, y, z }, x, z, 320, c);
      forNear(x, z, 8, (e) => { if (!e.alive || (e.fl & 1)) return; const d = Math.hypot(e.x - x, e.y + 0.9 - y, e.z - z); if (d < R) damage(e, 12 + D * (1 - d / R), c, k, false, [(e.x - x) / (d || 1) * 10, 7.5, (e.z - z) / (d || 1) * 10]); });
      for (const p of [...world.pieces.values()]) if (Math.abs((p.ix + 0.5) * G - x) < 6 && Math.abs((p.iz + 0.5) * G - z) < 6 && Math.hypot((p.ix + 0.5) * G - x, (p.iy + 0.5) * H - y, (p.iz + 0.5) * G - z) < 5) hitPiece(p.key, P);
      for (const car of [...world.cars.values()]) if (Math.hypot(car.x - x, car.y - y, car.z - z) < 5) { car.hp -= k === 'rocket' ? 400 : 260; if (car.hp <= 0) explodeCar(car, c); }
      for (const o of [...world.objs.values()]) if ((o.t === 'crate' || o.t === 'barrel') && Math.abs(o.x - x) < 5 && Math.abs(o.z - z) < 5 && Math.hypot(o.x - x, o.z - z) < 4.5) { world.objs.delete(o.id); broadcast({ t: 'obj-', id: o.id }); }
      break;
    }
    case 'edit': {
      const p = world.pieces.get(String(m.k)); if (!up || !p || p.t !== 'w') return;
      if (Math.hypot((p.ix + 0.5) * G - c.x, (p.iz + 0.5) * G - c.z) > 9) return;
      p.v = Math.min(2, Math.max(0, m.v | 0)); broadcast({ t: 'pcv', k: p.key, v: p.v });
      break;
    }
    case 'card': {
      const cd = world.cards.get(m.id | 0); if (!up || !cd || cd.team !== c.team || c.card || Math.hypot(cd.x - c.x, cd.z - c.z) > 4) return;
      world.cards.delete(cd.id); c.card = cd.o; broadcast({ t: 'card-', id: cd.id, by: c.id });
      break;
    }
    case 'rbt': if (m.on) { if (up) startReboot(c, world.vans.find((v) => v.id === (m.id | 0))); } else stopReboot(c); break;
    case 'heal':
      if (!up) return;
      if (m.c === 'chug') { c.hp = 100; c.sh = 100; } else if (m.c === 'bush') c.bush = true;
      else if (m.c === 'med') c.hp = 100; else if (m.c === 'band') c.hp = Math.max(c.hp, Math.min(75, c.hp + 15));
      else if (m.c === 'pot') c.sh = Math.min(100, c.sh + 50); else if (m.c === 'mini') c.sh = Math.max(c.sh, Math.min(50, c.sh + 25));
      break;
    case 'enter': {
      const car = world.cars.get(m.id | 0); if (!up || !car || car.drv || c.car || c.rev || (c.fl & 7) || Math.hypot(car.x - c.x, car.z - c.z) > 8) return;
      car.drv = c.id; c.car = car.id; car.dirty = 3; send(c, { t: 'car', id: car.id });
      break;
    }
    case 'exit': releaseCar(c); break;
    case 'hitcar': {
      const W = S.W[m.w], car = world.cars.get(m.id | 0); if (!up || !W || !car) return;
      car.hp -= S.wdmg(m.w, m.r | 0, 0, false) * Math.min(W.pellets, Math.max(1, m.n | 0));
      if (car.hp <= 0) explodeCar(car, c);
      break;
    }
    case 'hitobj': { // Schüsse beschädigen Bäume, Möbel, Gebäude usw. (ohne Material)
      const W = S.W[m.w], o = world.objs.get(m.id | 0); if (!up || !W || !o || (o.t === 'prop' && !PJ[o.p].hp)) return;
      o.hp -= S.wdmg(m.w, m.r | 0, 0, false) * Math.min(W.pellets, Math.max(1, m.n | 0)) * 0.6;
      if (o.hp <= 0) { world.objs.delete(o.id); broadcast({ t: 'obj-', id: o.id }); }
      break;
    }
    case 'ram': {
      const tg = ent(m.id | 0), now = Date.now(); if (!up || !c.car || !tg || tg === c || now - c.lastRam < 500) return;
      if (Math.hypot(tg.x - c.x, tg.y - c.y, tg.z - c.z) < 7) { c.lastRam = now; damage(tg, 35, c, 'car'); }
      break;
    }
    case 'rampc': { const now = Date.now(); if (up && c.car && now - c.lastRam > 150) { c.lastRam = now; hitPiece(String(m.k), 170); } break; }
    case 'fall': if (live) damage(c, Math.min(300, Math.max(0, num(m.d))), null, 'fall'); break;
    case 'rev': if (m.on) { if (up) startRevive(c, ent(m.id | 0)); } else stopRevive(c); break;
    case 'mark': {
      if (!c.mate || c.mate.bot) return;
      send(c.mate, m.clear ? { t: 'mark', id: c.id, clear: 1 } : { t: 'mark', id: c.id, x: r1(num(m.x)), z: r1(num(m.z)) });
      break;
    }
  }
}
wss.on('connection', (ws) => {
  const c = { ws, id: nextId++, joined: false, inMatch: false, alive: false, name: '', hue: rnd(360), mode: 'solo', x: 0, y: 0, z: 0, yaw: 0, pitch: 0, fl: 0, w: 'pick', wr: 0, hp: 100, sh: 0, kills: 0, lastShot: {}, lastHarvest: 0, car: null, lastRam: 0, team: 0, mate: null, spec: 0 };
  clients.set(c.id, c);
  ws.on('message', (d) => { let m; try { m = JSON.parse(d); } catch (e) { return; } if (m && typeof m === 'object') { try { onMsg(c, m); } catch (e) { console.error(e); } } });
  ws.on('close', () => {
    try { if (c.inMatch && c.alive && phase === 'game') kill(c, null, 'quit'); stopRevive(c); stopReboot(c); releaseCar(c); } catch (e) { console.error(e); }
    clients.delete(c.id);
    if (c.mate && c.mate.mate === c) c.mate.mate = null;
    const pa = c.party && clients.get(c.party); if (pa && pa.party === c.id) { pa.party = 0; send(pa, { t: 'party', id: 0, left: c.name }); }
  });
  ws.on('error', () => {});
});
server.listen(PORT, () => console.log('Sturmfall läuft auf Port ' + PORT));
