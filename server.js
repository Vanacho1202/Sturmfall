'use strict';
const http = require('http'), fs = require('fs'), path = require('path'), zlib = require('zlib');
const { WebSocketServer } = require('ws');
const S = require('./public/shared.js');
const G = S.G, H = S.H, SHIPY = S.SHIPY;
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const TOTAL = +process.env.TOTAL || 100, LOBBY = +process.env.LOBBY || 15;
const REVIVE = 5, BLEED = 1.6, NEAR = 140, GC = 40;

// ---------- Webserver
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.png': 'image/png' };
const gzCache = new Map();
const server = http.createServer((req, res) => {
  let u;
  try { u = decodeURIComponent(req.url.split('?')[0]); } catch (e) { res.writeHead(400); res.end(); return; }
  if (u === '/') u = '/index.html';
  if (u === '/health') { res.end('ok'); return; }
  const f = path.join(PUB, path.normalize(u));
  if (!f.startsWith(PUB)) { res.writeHead(403); res.end(); return; }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404); res.end('404'); return; }
    const head = { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream', 'Cache-Control': f.includes(path.sep + 'lib' + path.sep) ? 'public, max-age=86400' : 'no-cache' };
    const gz = /gzip/.test(req.headers['accept-encoding'] || '');
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
  const w = wpick({ ar: 30, smg: 22, shotgun: 22, pistol: 16, sniper: 10 });
  const r = Math.max(minR, +wpick({ 0: 40, 1: 30, 2: 18, 3: 9, 4: 3 }));
  return { k: 'w', w, r, mag: S.W[w].mag };
}
function rndCons() { const c = wpick({ band: 30, mini: 26, pot: 17, med: 12, gren: 15 }); return { k: 'c', c, n: c === 'band' ? 5 : c === 'mini' || c === 'gren' ? 2 : 1 }; }
function ammoFor(w) { const a = S.W[w].ammo; return { k: 'a', a, n: { light: 30, medium: 30, shells: 8, heavy: 6 }[a] }; }
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
function addPiece(p, ann) {
  p.key = S.pkey(p);
  if (world.pieces.has(p.key)) return null;
  p.hp = S.MATS[p.mat].hp;
  world.pieces.set(p.key, p); world.pg.add(p);
  if (ann) broadcast({ t: 'pc+', p: S.packPiece(p) });
  return p;
}
function hitPiece(key, dmg) {
  const p = world.pieces.get(key); if (!p) return false;
  p.hp -= dmg;
  if (p.hp <= 0) { world.pieces.delete(key); world.pg.remove(p); broadcast({ t: 'pc-', k: key }); }
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
function genWorld() {
  world = { objs: new Map(), chests: new Map(), pieces: new Map(), pg: new S.PGrid(), loot: new Map(), cars: new Map(), houses: [], grid: new Map() };
  let oid = 1;
  const rects = [];
  for (const poi of S.POIS) {
    const want = 5 + rnd(3);
    const placed = [];
    for (let tries = 0; tries < 120 && placed.length < want; tries++) {
      const big = poi.n === 'Turmstadt' && !placed.length;
      const w = big ? 3 : 2 + rnd(2), d = big ? 3 : 2 + rnd(2);
      const a = Math.random() * 6.283, rr = big ? 0 : Math.random() * (poi.r - 15);
      const cx = Math.floor((poi.x + Math.cos(a) * rr) / G) - (w >> 1), cz = Math.floor((poi.z + Math.sin(a) * rr) / G) - (d >> 1);
      if (placed.some((h) => cx < h.cx + h.w + 2 && cx + w + 2 > h.cx && cz < h.cz + h.d + 2 && cz + d + 2 > h.cz)) continue;
      placed.push({ cx, cz, w, d });
      rects.push({ cx, cz, w, d });
      const mat = big ? 'stone' : wpick({ wood: 45, stone: 40, metal: 15 });
      const storeys = big ? 4 : Math.random() < 0.45 ? 2 : 1;
      const door = rnd(w);
      world.houses.push([cx, cz, w, d, poi.l, storeys, door, mat[0]]);
      for (let s = 0; s < storeys; s++) {
        const iy = poi.l + s;
        for (let i = 0; i < w; i++) {
          if (!(s === 0 && i === door)) addPiece({ t: 'w', ix: cx + i, iy, iz: cz, d: 0, mat, v: Math.random() < 0.3 ? 1 : 0 });
          addPiece({ t: 'w', ix: cx + i, iy, iz: cz + d, d: 0, mat, v: Math.random() < 0.4 ? 1 : 0 });
        }
        for (let j = 0; j < d; j++) {
          addPiece({ t: 'w', ix: cx, iy, iz: cz + j, d: 1, mat, v: Math.random() < 0.4 ? 1 : 0 });
          addPiece({ t: 'w', ix: cx + w, iy, iz: cz + j, d: 1, mat, v: Math.random() < 0.4 ? 1 : 0 });
        }
        const stairs = s < storeys - 1;
        for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) {
          if (stairs && i === 0 && j === d - 1) addPiece({ t: 'r', ix: cx, iy, iz: cz + d - 1, rot: 0, mat });
          else addPiece({ t: 'f', ix: cx + i, iy: iy + 1, iz: cz + j, mat });
        }
      }
      const ci = w - 1, cj = rnd(d), top = storeys === 2 && Math.random() < 0.6;
      const ch = { id: oid++, x: (cx + ci + 0.5) * G, y: (poi.l + (top ? 1 : 0)) * H + (top ? 0.12 : 0), z: (cz + cj + 0.5) * G, open: 0 };
      world.chests.set(ch.id, ch);
      if (big) for (let s2 = 1; s2 <= 4; s2++) { const c2 = { id: oid++, x: (cx + 1 + (s2 % 2) + 0.5) * G, y: (poi.l + s2) * H + 0.12, z: (cz + 0.5) * G, open: 0 }; world.chests.set(c2.id, c2); }
      if (Math.random() < 0.8) {
        const lx = (cx + rnd(w) + 0.5) * G, lz = (cz + 0.5) * G;
        const it = Math.random() < 0.6 ? rndWeapon() : rndCons();
        addLoot(it, lx, poi.l * H, lz);
        if (it.k === 'w') addLoot(ammoFor(it.w), lx + 0.8, poi.l * H, lz + 0.5);
      }
    }
    for (let i = 0, t = 0; i < 7 && t < 60; t++) {
      const a = Math.random() * 6.283, rr = Math.random() * (poi.r - 3);
      const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr, cx = x / G, cz = z / G;
      if (placed.some((h) => cx > h.cx - 0.4 && cx < h.cx + h.w + 0.4 && cz > h.cz - 0.4 && cz < h.cz + h.d + 0.4)) continue;
      const tp = Math.random() < 0.6 ? 'crate' : 'barrel';
      world.objs.set(oid, { id: oid++, t: tp, x: r1(x), z: r1(z), s: tp === 'crate' ? r2(0.8 + Math.random() * 0.5) : 1, hp: 68 }); i++;
    }
    for (let i = 0, t = 0; i < 4 && t < 40; t++) {
      const a = Math.random() * 6.283, rr = Math.random() * (poi.r - 4);
      const x = poi.x + Math.cos(a) * rr, z = poi.z + Math.sin(a) * rr, cx = x / G, cz = z / G;
      if (placed.some((h) => cx > h.cx - 1 && cx < h.cx + h.w + 1 && cz > h.cz - 1 && cz < h.cz + h.d + 1)) continue;
      addCar(oid++, x, z); i++;
    }
  }
  for (let i = 0; i < 440; i++) {
    const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 228, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (S.height(x, z) < 0.8 || S.poiAt(x, z, 5)) continue;
    world.objs.set(oid, { id: oid++, t: 'tree', x: r1(x), z: r1(z), s: r2(0.8 + Math.random() * 0.7), hp: 100 });
  }
  for (let i = 0; i < 150; i++) {
    const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 232, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (S.height(x, z) < 0.3 || S.poiAt(x, z, 2)) continue;
    world.objs.set(oid, { id: oid++, t: 'rock', x: r1(x), z: r1(z), s: r2(0.7 + Math.random() * 0.9), hp: 150 });
  }
  for (let i = 0, t = 0; i < 10 && t < 100; t++) {
    const a = Math.random() * 6.283, rr = 40 + Math.sqrt(Math.random()) * 165, x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = S.height(x, z);
    if (h < 2 || S.poiAt(x, z, 14) || S.roadDist(x, z) < 6) continue;
    const cx = Math.floor(x / G), cz = Math.floor(z / G), l = Math.floor((h + 0.4) / H), mat = Math.random() < 0.5 ? 'wood' : 'metal';
    if (rects.some((r) => Math.abs(r.cx - cx) < 6 && Math.abs(r.cz - cz) < 6)) continue;
    rects.push({ cx, cz, w: 2, d: 2 });
    for (let s = 0; s < 3; s++) addPiece({ t: 'r', ix: cx, iy: l + s, iz: cz, rot: s % 2 ? 2 : 0, mat });
    for (const [a2, b2] of [[0, 1], [1, 1], [1, 0]]) addPiece({ t: 'f', ix: cx + a2, iy: l + 3, iz: cz + b2, mat });
    for (let s = 0; s < 3; s++) { addPiece({ t: 'w', ix: cx + 1, iy: l + s, iz: cz, d: 1, mat }); addPiece({ t: 'w', ix: cx, iy: l + s, iz: cz, d: 1, mat }); }
    const tc = { id: oid++, x: (cx + 1.5) * G, y: (l + 3) * H + 0.12, z: (cz + 1.5) * G, open: 0 }; world.chests.set(tc.id, tc);
    i++;
  }
  for (let i = 0; i < 14; i++) {
    const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 210, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (S.height(x, z) > 1.5 && !S.poiAt(x, z, 4)) addCar(oid++, x, z);
  }
  for (let i = 0; i < 50; i++) {
    const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 215, x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    if (S.height(x, z) < 1 || S.poiAt(x, z, 4)) continue;
    world.chests.set(oid, { id: oid++, x: r1(x), y: S.height(x, z), z: r1(z), open: 0 });
  }
  for (let i = 0; i < 130; i++) {
    const a = Math.random() * 6.283, rr = Math.sqrt(Math.random()) * 215, x = Math.cos(a) * rr, z = Math.sin(a) * rr, y = S.height(x, z);
    if (y < 1) continue;
    const r = Math.random();
    const it = r < 0.5 ? rndWeapon() : r < 0.75 ? rndCons() : { k: 'a', a: pick(Object.keys(S.AMMO)), n: 20 };
    addLoot(it, x, y, z);
    if (it.k === 'w') addLoot(ammoFor(it.w), x + 0.9, S.height(x + 0.9, z), z);
  }
  // Objekte entfernen, die in Gebäuden oder auf Straßen stehen; Raster für Bots
  for (const o of [...world.objs.values()]) {
    const cx = o.x / G, cz = o.z / G;
    if ((o.t === 'tree' || o.t === 'rock') && (S.roadDist(o.x, o.z) < 4.5 || rects.some((r) => cx > r.cx - 0.6 && cx < r.cx + r.w + 0.6 && cz > r.cz - 1.6 && cz < r.cz + r.d + 0.6))) { world.objs.delete(o.id); continue; }
    o.r = o.t === 'tree' ? 0.45 * o.s : o.t === 'rock' ? 1.25 * o.s : o.t === 'crate' ? 0.75 * o.s : 0.55;
    const k = Math.floor(o.x / 16) + ',' + Math.floor(o.z / 16);
    if (!world.grid.has(k)) world.grid.set(k, []); world.grid.get(k).push(o);
  }
}
const packWorld = () => ({
  objs: [...world.objs.values()].map((o) => ({ id: o.id, t: o.t, x: o.x, z: o.z, s: o.s })), chests: [...world.chests.values()].map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z, open: c.open })),
  pieces: [...world.pieces.values()].map(S.packPiece), loot: [...world.loot.values()], houses: world.houses,
  cars: [...world.cars.values()].map((c) => ({ id: c.id, x: c.x, y: c.y, z: c.z, yaw: c.yaw, v: c.v, hue: c.hue, drv: c.drv })),
});

// ---------- Sturm
function chooseNext() {
  const st = S.STORM[storm.i];
  storm.nr = S.R * st.f;
  const a = Math.random() * 6.283, d = Math.random() * Math.max(0, Math.min(storm.r, 225) - storm.nr) * 0.9;
  storm.nx = storm.x + Math.cos(a) * d; storm.nz = storm.z + Math.sin(a) * d;
  const m = Math.hypot(storm.nx, storm.nz), lim = Math.max(0, 215 - storm.nr);
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
      if (S.STORM[storm.i]) { storm.shrink = false; storm.timer = S.STORM[storm.i].wait; chooseNext(); }
      else { storm.done = true; storm.i = S.STORM.length - 1; storm.timer = 0; }
    }
  }
}

// ---------- Schaden, Niederschlagen, Eliminieren
function damage(target, amount, attacker, wname, head, kb) {
  if (phase !== 'game' || !target || !target.alive || (target.fl & 1) || amount <= 0) return;
  if (attacker && attacker !== target && attacker.team === target.team) return;
  if (attacker === target && wname === 'gren') { if (kb) send(target, { t: 'hurt', ax: null, az: null, kb }); return; }
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
    target.threat = attacker; target.threatT = gameT + 5;
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
  const m = target.mate;
  if (m && m.alive && m.down) kill(m, m.knockBy, 'bleed');
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
  Object.assign(e, { inMatch: true, alive: true, hp: 100, sh: 0, fl: 1, kills: 0, x: ship.ax, y: SHIPY, z: ship.az, yaw: 0, pitch: 0, w: 'pick', wr: 0, car: null, down: false, rev: null, knockBy: null, team: 0, mate: null });
}
function makeBot(name) {
  const b = { id: nextId++, bot: true, name, hue: rnd(360), style: rnd(16),
    st: 'ship', jumpAt: 3 + Math.random() * 23, tx: 0, tz: 0, wx: 0, wz: 0, wpn: null, armAt: 0, nextShot: 0, tgt: null, nextScan: Math.random(), strafe: 1, nextStrafe: 0, nextWp: 0, nextHack: 0,
    skill: 0.55 + Math.random() * 0.6, jy: 0, jv: 0, stuck: 0, detourT: 0, detourA: 0, swT: 0, coverT: 0, relT: 0, relDone: false, emoteT: 0, mag: 0, burst: 4, threat: null, threatT: 0, nextWall: 0, seen: null, chest: null, nextChest: 0,
    ox: (Math.random() - 0.5) * 6, oz: (Math.random() - 0.5) * 6, lead: null };
  resetEnt(b);
  return b;
}
function startMatch() {
  genWorld(); gameT = 0; phase = 'game'; noHumansT = 0; stormAcc = 0; matchMode = mode;
  const a = Math.random() * 6.283;
  ship = { ax: -Math.cos(a) * 270, az: -Math.sin(a) * 270, bx: Math.cos(a) * 270, bz: Math.sin(a) * 270, dur: 30 };
  storm = { i: 0, x: 0, z: 0, r: 300, fx: 0, fz: 0, fr: 300, nx: 0, nz: 0, nr: 300, timer: S.STORM[0].wait, shrink: false, done: false };
  chooseNext();
  const hs = humans();
  for (const c of hs) { resetEnt(c); Object.assign(c, { lastShot: {}, lastHarvest: 0, lastRam: 0, nades: 0, lastNade: 0, dropped: false, spec: 0 }); }
  const names = BN.slice().sort(() => Math.random() - 0.5);
  bots = [];
  for (let i = hs.length; i < TOTAL; i++) bots.push(makeBot(names[i % names.length] + (10 + rnd(89))));
  const all = hs.concat(bots);
  if (matchMode === 'duo') {
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
  for (const c of clients.values()) { c.inMatch = false; c.alive = false; c.car = null; c.down = false; c.rev = null; c.mate = null; }
  rebuildEnts();
  broadcast({ t: 'lobby' });
}
function lobbyMode(hs) {
  let d = 0; for (const c of hs) if (c.mode === 'duo') d++;
  const s = hs.length - d;
  return d > s ? 'duo' : s > d ? 'solo' : hs.length ? hs[0].mode : 'solo';
}

// ---------- Bots
function clampLand(o, kx, kz, lim) { const m = Math.hypot(o[kx], o[kz]); if (m > lim) { o[kx] *= lim / m; o[kz] *= lim / m; } }
function newWaypoint(b, force) {
  let cx = storm.x, cz = storm.z, r = storm.r * 0.6;
  if (!force && storm.nr > 0) { cx = storm.nx; cz = storm.nz; r = storm.nr * 0.8; }
  else if (force) { cx = storm.nx; cz = storm.nz; r = storm.nr * 0.6; }
  const a = Math.random() * 6.283, d = Math.sqrt(Math.random()) * Math.min(r, 120);
  b.wx = cx + Math.cos(a) * d; b.wz = cz + Math.sin(a) * d;
  clampLand(b, 'wx', 'wz', 215);
  b.nextWp = gameT + 12 + Math.random() * 15;
}
function los(a, e, d) {
  const dx = e.x - a.x, dy = e.y + 1.2 - (a.y + 1.5), dz = e.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
  return !world.pg.ray(a.x, a.y + 1.5, a.z, dx / l, dy / l, dz / l, l);
}
function blockedObj(x, z) {
  const gx = Math.floor(x / 16), gz = Math.floor(z / 16);
  for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
    const arr = world.grid.get(a + ',' + b); if (!arr) continue;
    for (const o of arr) { if (!world.objs.has(o.id)) continue; const r = o.r + 0.4, dx = x - o.x, dz = z - o.z; if (dx * dx + dz * dz < r * r) return true; }
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
  if (blockedObj(nx, nz)) { if (!(b.detourT > gameT)) { b.detourT = gameT + 0.45; b.detourA = (Math.random() < 0.5 ? 1 : -1) * 1.25; } return false; }
  b.x = nx; b.z = nz; b.stuck = Math.max(0, b.stuck - dt * 2);
  return true;
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
  const w = rndWeapon(Math.random() < 0.35 ? 2 : 0), items = [w, ammoFor(w.w), { k: 'm', m: pick(['wood', 'stone', 'metal']), n: 30 }];
  if (Math.random() < 0.65) items.push(rndCons());
  return items;
}
function botTick(b, dt) {
  const mate = b.mate && b.mate.alive ? b.mate : null;
  if (b.st === 'ship') {
    const p = shipPos(); b.x = p.x; b.z = p.z; b.y = SHIPY;
    let go = gameT >= b.jumpAt || gameT > 27;
    if (mate && !mate.bot) go = gameT > 27 || (gameT > 1.5 && !(mate.fl & 1)) || (gameT >= b.jumpAt && !mate.inMatch);
    if (go) {
      b.st = 'air'; b.fl = 2;
      const cand = S.POIS.filter((p2) => Math.hypot(p2.x - b.x, p2.z - b.z) < 170);
      const a = Math.random() * 6.283;
      if (b.lead && b.lead.st !== 'ship') { b.tx = b.lead.tx + b.ox; b.tz = b.lead.tz + b.oz; }
      else if (cand.length && Math.random() < 0.75) { const p2 = pick(cand), d = Math.random() * p2.r; b.tx = p2.x + Math.cos(a) * d; b.tz = p2.z + Math.sin(a) * d; }
      else { const d = Math.random() * 90; b.tx = b.x + Math.cos(a) * d; b.tz = b.z + Math.sin(a) * d; }
      clampLand(b, 'tx', 'tz', 210);
    }
    return;
  }
  if (b.st === 'air') {
    if (mate && !mate.bot && !(mate.fl & 1)) { b.tx = mate.x + b.ox; b.tz = mate.z + b.oz; clampLand(b, 'tx', 'tz', 215); }
    const dx = b.tx - b.x, dz = b.tz - b.z, l = Math.hypot(dx, dz);
    if (l > 0.5) { const s = Math.min(l, 16 * dt); b.x += (dx / l) * s; b.z += (dz / l) * s; b.yaw = Math.atan2(-dx, -dz); }
    const g = S.height(b.x, b.z), hi = b.y - g > 34;
    b.fl = hi ? 2 : 4; b.y -= (hi ? 28 : 8) * dt;
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
  if (!b.wpn && gameT >= b.armAt) armBot(b, wpick({ ar: 35, smg: 25, shotgun: 25, pistol: 15 }), +wpick({ 0: 50, 1: 30, 2: 15, 3: 5 }));
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
    if (Math.hypot(b.x - storm.x, b.z - storm.z) > storm.r - 5) { newWaypoint(b, true); b.chest = null; }
    if (!b.wpn && !b.chest && gameT >= b.nextChest) {
      b.nextChest = gameT + 3; let cd = 75;
      for (const ch of world.chests.values()) { if (ch.open || (ch.bot && ch.bot !== b.id) || Math.abs(ch.y - S.height(ch.x, ch.z)) > 0.5) continue; const d = Math.hypot(ch.x - b.x, ch.z - b.z); if (d < cd) { cd = d; b.chest = ch; } }
      if (b.chest) b.chest.bot = b.id;
    }
  }
  const t = b.tgt, crouchNow = b.coverT > gameT, reloading = b.relT > gameT;
  let fl = 0;
  if (b.relDone && !reloading) { b.relDone = false; b.mag = S.W[b.wpn.w].mag; }
  if (b.emoteT > gameT && !t) { b.fl = 256; b.pitch = 0; b.y = S.height(b.x, b.z) + b.jy; return; }
  if (t && t.alive && b.wpn) {
    const dx = t.x - b.x, dz = t.z - b.z, d = Math.hypot(dx, dz) || 1, d3 = Math.hypot(dx, t.y - b.y, dz);
    b.yaw = Math.atan2(-dx, -dz); b.pitch = Math.atan2(t.y + (t.down ? 0.3 : 1.2) - b.y - 1.4, d);
    if (gameT >= b.nextStrafe) { b.strafe = Math.random() < 0.5 ? -1 : 1; b.nextStrafe = gameT + 0.7 + Math.random() * 1.3; if (d < 22 && b.jy === 0 && Math.random() < 0.3 * b.skill) b.jv = 7.2; }
    const want = { shotgun: 7, smg: 13, pistol: 16, ar: 22 }[b.wpn.w] || 18;
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
      if (n) damage(t, S.wdmg(b.wpn.w, b.wpn.r, d3, false) * n * (t.bot ? 0.6 : 1), b, b.wpn.w, false);
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
    if (mate && mate.down) { gx = mate.x; gz = mate.z; sp = 5.8; mateGoal = true; }
    else if (!b.wpn && b.chest && !b.chest.open) { gx = b.chest.x; gz = b.chest.z; sp = 5.8; }
    else if (b.seen && gameT - b.seen.t < 4 && b.wpn) { gx = b.seen.x; gz = b.seen.z; sp = 5.6; }
    else if (mate && Math.hypot(mate.x - b.x, mate.z - b.z) > 22) { gx = mate.x + b.ox; gz = mate.z + b.oz; sp = 5.8; mateGoal = true; }
    else if (b.chest) b.chest = null;
    const dx = gx - b.x, dz = gz - b.z, d = Math.hypot(dx, dz);
    if (mate && mate.down && d < 2.2) startRevive(b, mate);
    else if (!mateGoal && b.chest && d < 2.3) {
      const items = openChest(b.chest), w = items.find((i) => i.k === 'w');
      armBot(b, w.w, w.r);
      if (items.some((i) => i.c === 'pot' || i.c === 'mini')) b.sh = Math.min(100, b.sh + 50);
      scatter(items.filter((i) => i !== w && i.c !== 'pot' && i.c !== 'mini'), b.chest.x, b.chest.y, b.chest.z, true);
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
  for (const e of entList) if (e.alive) ents.push([e, JSON.stringify([e.id, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), r2(e.pitch), Math.ceil(e.hp), Math.ceil(e.sh), e.fl | (e.down ? 512 : 0), e.w, e.wr | 0])]);
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
  const now = Date.now(), dt = Math.min(0.2, (now - last) / 1000); last = now; tickN++;
  try {
    const hs = humans();
    if (phase === 'lobby') {
      mode = lobbyMode(hs);
      if (hs.length) { lobbyT -= dt; if (lobbyT <= 0) startMatch(); }
      else lobbyT = LOBBY;
      if (phase === 'lobby' && tickN % 4 === 0) { const d = hs.filter((c) => c.mode === 'duo').length; broadcast({ t: 's', ph: 'lobby', tm: Math.ceil(lobbyT), names: hs.map((c) => c.name), mode, v: [hs.length - d, d] }); }
      return;
    }
    if (!hs.length) { toLobby(); return; }
    if (phase === 'end') { endT -= dt; if (endT <= 0) { toLobby(); return; } }
    rebuildGrid();
    if (phase === 'game') {
      gameT += dt;
      tickStorm(dt);
      for (const b of bots) if (b.alive) botTick(b, dt);
      tickDowned(dt);
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
}, 66);

// ---------- Nachrichten
const WCODES = new Set(['pick', 'build', 'none', ...Object.keys(S.W), ...Object.keys(S.CONS)]);
function cleanItem(it) {
  if (!it || typeof it !== 'object') return null;
  if (it.k === 'w' && S.W[it.w]) return { k: 'w', w: it.w, r: Math.min(4, Math.max(0, it.r | 0)), mag: Math.min(S.W[it.w].mag, Math.max(0, it.mag | 0)) };
  if (it.k === 'c' && S.CONS[it.c]) return { k: 'c', c: it.c, n: Math.min(S.CONS[it.c].max, Math.max(1, it.n | 0)) };
  if (it.k === 'a' && S.AMMO[it.a]) return { k: 'a', a: it.a, n: Math.min(999, Math.max(1, it.n | 0)) };
  if (it.k === 'm' && S.MATS[it.m]) return { k: 'm', m: it.m, n: Math.min(999, Math.max(1, it.n | 0)) };
  return null;
}
function onMsg(c, m) {
  if (m.t === 'join') {
    if (c.joined) return;
    c.name = String(m.name || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 14) || 'Spieler' + c.id;
    c.joined = true; c.hue = Math.min(359, Math.max(0, m.hue | 0)); c.style = (m.style | 0) & 15; c.mode = m.mode === 'duo' ? 'duo' : 'solo';
    send(c, { t: 'init', id: c.id, phase, mode: phase !== 'lobby' ? matchMode : mode, world: phase !== 'lobby' ? packWorld() : null, ship, roster: phase !== 'lobby' ? roster() : [] });
    return;
  }
  if (!c.joined) return;
  if (m.t === 'mode') { c.mode = m.m === 'duo' ? 'duo' : 'solo'; return; }
  if (m.t === 'spec') { c.spec = m.id | 0; return; }
  if (phase === 'lobby' || !c.inMatch) return;
  const live = c.alive && phase === 'game', up = live && !c.down;
  switch (m.t) {
    case 'pos':
      if (!c.alive) return;
      c.x = num(m.x, c.x); c.y = num(m.y, c.y); c.z = num(m.z, c.z); c.yaw = num(m.yaw); c.pitch = num(m.pitch);
      c.fl = (m.fl | 0) & 495; c.wr = Math.min(4, Math.max(0, m.wr | 0)); c.w = WCODES.has(m.w) ? m.w : 'pick';
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
        const o = world.objs.get(m.id | 0); if (!o || Math.hypot(o.x - c.x, o.z - c.z) > 8) return;
        o.hp -= 34;
        const mat = o.t === 'tree' || o.t === 'crate' ? 'wood' : o.t === 'rock' ? 'stone' : 'metal';
        send(c, { t: 'mat', m: mat, n: o.t === 'tree' ? 20 : 15 });
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
      if (p.t === 'w') p.d = q.d ? 1 : 0; else if (p.t === 'r') p.rot = (q.rot | 0) & 3; else if (p.t !== 'f') return;
      if (Math.hypot((p.ix + 0.5) * G - c.x, (p.iy + 0.5) * H - c.y, (p.iz + 0.5) * G - c.z) > 16 || world.pieces.size > 9000) return;
      addPiece(p, true);
      break;
    }
    case 'pickup': {
      const l = world.loot.get(m.id | 0); if (!up || !l || Math.hypot(l.x - c.x, l.y - c.y, l.z - c.z) > 7) return;
      world.loot.delete(l.id); broadcast({ t: 'loot-', id: l.id }); send(c, { t: 'got', i: l.i });
      break;
    }
    case 'open': {
      const ch = world.chests.get(m.id | 0); if (!up || !ch || ch.open || Math.hypot(ch.x - c.x, ch.y - c.y, ch.z - c.z) > 6) return;
      scatter(openChest(ch), ch.x, ch.y, ch.z, true);
      break;
    }
    case 'drop': { const it = cleanItem(m.i); if (live && it) addLoot(it, c.x + (Math.random() - 0.5), c.y, c.z + (Math.random() - 0.5), true); break; }
    case 'dropall':
      if (c.alive || c.dropped || !Array.isArray(m.items) || phase !== 'game') return;
      c.dropped = true;
      scatter(m.items.slice(0, 14).map(cleanItem).filter(Boolean), c.x, c.y, c.z, true);
      break;
    case 'nade':
      if (!up || !Array.isArray(m.o) || !Array.isArray(m.v) || (c.fl & 7)) return;
      c.nades = (c.nades || 0) + 1; c.lastNade = Date.now();
      broadcastNear({ t: 'nade', id: c.id, o: m.o.slice(0, 3).map((v) => r2(num(v))), v: m.v.slice(0, 3).map((v) => r2(Math.max(-40, Math.min(40, num(v))))) }, c.x, c.z, 200, c);
      break;
    case 'boom': {
      if (phase !== 'game' || !(c.nades > 0) || Date.now() - c.lastNade > 8000) return;
      const x = num(m.x), y = num(m.y), z = num(m.z);
      if (Math.hypot(x - c.x, z - c.z) > 80) return;
      c.nades--;
      broadcastNear({ t: 'boom', x, y, z }, x, z, 300, c);
      forNear(x, z, 8, (e) => { if (!e.alive || (e.fl & 1)) return; const d = Math.hypot(e.x - x, e.y + 0.9 - y, e.z - z); if (d < 6.5) damage(e, 12 + 98 * (1 - d / 6.5), c, 'gren', false, [(e.x - x) / (d || 1) * 10, 7.5, (e.z - z) / (d || 1) * 10]); });
      for (const p of [...world.pieces.values()]) if (Math.abs((p.ix + 0.5) * G - x) < 6 && Math.abs((p.iz + 0.5) * G - z) < 6 && Math.hypot((p.ix + 0.5) * G - x, (p.iy + 0.5) * H - y, (p.iz + 0.5) * G - z) < 5) hitPiece(p.key, 330);
      for (const car of [...world.cars.values()]) if (Math.hypot(car.x - x, car.y - y, car.z - z) < 5) { car.hp -= 260; if (car.hp <= 0) explodeCar(car, c); }
      for (const o of [...world.objs.values()]) if ((o.t === 'crate' || o.t === 'barrel') && Math.hypot(o.x - x, o.z - z) < 4.5) { world.objs.delete(o.id); broadcast({ t: 'obj-', id: o.id }); }
      break;
    }
    case 'heal':
      if (!up) return;
      if (m.c === 'med') c.hp = 100; else if (m.c === 'band') c.hp = Math.max(c.hp, Math.min(75, c.hp + 15));
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
    try { if (c.inMatch && c.alive && phase === 'game') kill(c, null, 'quit'); stopRevive(c); releaseCar(c); } catch (e) { console.error(e); }
    clients.delete(c.id);
    if (c.mate && c.mate.mate === c) c.mate.mate = null;
  });
  ws.on('error', () => {});
});
server.listen(PORT, () => console.log('Sturmfall läuft auf Port ' + PORT));
