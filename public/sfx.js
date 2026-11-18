// Sturmfall – Klangsystem (alles per Web Audio erzeugt, keine Stimmen)
let C = null, master, comp, buses = {}, revIn, NB = null, NB2 = null;
const L = { x: 0, y: 0, z: 0, fx: 0, fz: -1 };
const VOL = { m: 0.8, s: 1, a: 0.6, u: 0.8 };
const loops = {};
export const ready = () => !!C;

export function init() {
  if (C) { if (C.state === 'suspended') C.resume(); return; }
  try { C = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return; }
  comp = C.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.18;
  master = C.createGain(); master.connect(comp); comp.connect(C.destination);
  for (const k of ['s', 'a', 'u']) { buses[k] = C.createGain(); buses[k].connect(master); }
  // Rauschen (weiß + rosa)
  const n = C.sampleRate * 2; NB = C.createBuffer(1, n, C.sampleRate); NB2 = C.createBuffer(1, n, C.sampleRate);
  const d = NB.getChannelData(0), p = NB2.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; d[i] = w; b0 = 0.99765 * b0 + w * 0.099; b1 = 0.963 * b1 + w * 0.2965; b2 = 0.57 * b2 + w * 1.0527; p[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
  // Hall
  const rl = C.sampleRate * 2.4, ir = C.createBuffer(2, rl, C.sampleRate);
  for (let c = 0; c < 2; c++) { const a = ir.getChannelData(c); for (let i = 0; i < rl; i++) a[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2); }
  const conv = C.createConvolver(); conv.buffer = ir; revIn = C.createGain(); revIn.gain.value = 0.5; revIn.connect(conv); conv.connect(buses.s);
  setVol(VOL); loadSamples();
}
export function setVol(v) {
  Object.assign(VOL, v); if (!C) return;
  master.gain.value = VOL.m; buses.s.gain.value = VOL.s; buses.a.gain.value = VOL.a; buses.u.gain.value = VOL.u;
}
export function listen(x, y, z, yaw) {
  L.x = x; L.y = y; L.z = z; L.fx = -Math.sin(yaw); L.fz = -Math.cos(yaw);
  if (!C) return; const l = C.listener, t = C.currentTime;
  if (l.positionX) { l.positionX.setValueAtTime(x, t); l.positionY.setValueAtTime(y, t); l.positionZ.setValueAtTime(z, t); l.forwardX.setValueAtTime(L.fx, t); l.forwardY.setValueAtTime(0, t); l.forwardZ.setValueAtTime(L.fz, t); l.upX.setValueAtTime(0, t); l.upY.setValueAtTime(1, t); l.upZ.setValueAtTime(0, t); }
  else { l.setPosition(x, y, z); l.setOrientation(L.fx, 0, L.fz, 0, 1, 0); }
}
const dist = (p) => (p ? Math.hypot(p[0] - L.x, p[1] - L.y, p[2] - L.z) : 0);

// Ausgang: optional 3D, Luftdämpfung und Hall je nach Entfernung
function out(p, o = {}) {
  const bus = buses[o.bus || 's'], t = C.currentTime;
  const g = C.createGain(); g.gain.value = 1;
  if (!p) { g.connect(bus); if (o.rev) { const r = C.createGain(); r.gain.value = o.rev; g.connect(r); r.connect(revIn); } return g; }
  const d = dist(p), pan = C.createPanner(); pan.panningModel = 'equalpower'; pan.distanceModel = 'inverse'; pan.refDistance = o.ref || 3; pan.rolloffFactor = o.roll || 1.1; pan.maxDistance = 10000;
  if (pan.positionX) { pan.positionX.setValueAtTime(p[0], t); pan.positionY.setValueAtTime(p[1], t); pan.positionZ.setValueAtTime(p[2], t); } else pan.setPosition(p[0], p[1], p[2]);
  const lp = C.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(500, 18000 * Math.exp(-d / (o.air || 90)));
  g.connect(lp); lp.connect(pan); pan.connect(bus);
  const r = C.createGain(); r.gain.value = Math.min(0.9, (o.rev || 0.08) + d / (o.revD || 140)); pan.connect(r); r.connect(revIn);
  return g;
}
// Bausteine
function nz(dst, t, dur, f, o = {}) {
  const s = C.createBufferSource(), fl = C.createBiquadFilter(), g = C.createGain();
  s.buffer = o.pink ? NB2 : NB; fl.type = o.type || 'lowpass'; fl.frequency.setValueAtTime(f, t); if (o.f2) fl.frequency.exponentialRampToValueAtTime(o.f2, t + dur); fl.Q.value = o.q || 0.8;
  const v = o.vol ?? 0.5, a = o.a || 0.002; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(dst); s.start(t, Math.random() * 1.2); s.stop(t + dur + 0.05);
}
function os(dst, t, dur, f0, f1, o = {}) {
  const s = C.createOscillator(), g = C.createGain(); s.type = o.type || 'sine';
  s.frequency.setValueAtTime(f0, t); if (f1 && f1 !== f0) s.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const v = o.vol ?? 0.3, a = o.a || 0.003; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(g); g.connect(dst); s.start(t); s.stop(t + dur + 0.05);
}
const ok = (p, max) => C && (!p || dist(p) < max);

// ---------------- Waffen
const GUN = {
  //       Knall-Dauer, Knall-Filter, Lautstärke, Körper f0,f1,dur, Mechanik, Nachhall
  ar:     [0.11, 4200, 0.75, 140, 55, 0.14, 2600, 0.5],
  smg:    [0.07, 5200, 0.6, 180, 80, 0.08, 3400, 0.35],
  pistol: [0.09, 4800, 0.65, 160, 70, 0.1, 3000, 0.4],
  shotgun:[0.22, 2600, 0.95, 110, 38, 0.26, 1800, 0.8],
  tac:    [0.18, 3000, 0.85, 120, 42, 0.2, 2200, 0.7],
  sniper: [0.3, 3400, 1.0, 95, 30, 0.36, 1500, 1.2],
  hunt:   [0.26, 3000, 0.95, 105, 34, 0.3, 1700, 1.0],
};
// ---------------- Echte Aufnahmen (public/snd)
const SMP = {}, SFILES = ['ar', 'ar2', 'ar3', 'smg', 'smg2', 'smg3', 'pistol', 'pistol2', 'pistol3', 'shotgun', 'pump', 'sniper', 'bolt', 'boom_b2', 'boom_b3', 'boom_b4', 'boom_low', 'boom_heavy', 'boom_distant'];
function loadSamples() {
  for (const k of SFILES) fetch('/snd/' + k + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => b && new Promise((res, rej) => C.decodeAudioData(b, res, rej))).then((buf) => { if (buf) SMP[k] = buf; }).catch(() => {});
}
// Waffe -> Aufnahme, Lautstärke, Tonhöhe
const GMAP = { ar: ['ar', 0.95, 1], smg: ['smg', 0.72, 1], pistol: ['pistol', 0.88, 1], shotgun: ['shotgun', 1.15, 1], tac: ['shotgun', 1.05, 1.12], sniper: ['sniper', 1.15, 1], hunt: ['sniper', 1, 1.12] };
let rr = 0;
function sample(k, p, vol, rate, o) {
  const vs = [k, k + '2', k + '3'].filter((x) => SMP[x]), buf = vs.length ? SMP[vs[rr++ % vs.length]] : null; if (!buf) return false;
  const src = C.createBufferSource(), g = C.createGain(); src.buffer = buf; src.playbackRate.value = rate * (0.97 + Math.random() * 0.06);
  g.gain.value = vol; src.connect(g); g.connect(out(p, o)); src.start(C.currentTime + ((o && o.delay) || 0)); return true;
}
export function gun(w, p) {
  if (C && GMAP[w] && SMP[GMAP[w][0]] && (!p || dist(p) < 700)) {
    // Entfernung hörbar: Schall braucht Zeit (343 m/s), klingt dumpfer, mehr Hall und ein Echo
    const m = GMAP[w], d = p ? dist(p) : 0, far = d > 150, delay = Math.min(1.4, d / 343);
    sample(m[0], p, m[1] * (far ? 1.4 : 1), m[2] * (far ? 0.93 : 1), { ref: 6, roll: 0.72, air: 120, rev: p ? 0.15 : 0.06, revD: 180, delay });
    if (d > 60) sample(m[0], p, m[1] * Math.min(0.5, d / 400), m[2] * 0.95, { ref: 6, roll: 0.6, air: 70, rev: 0.6, revD: 120, delay: delay + 0.25 + Math.random() * 0.35 });
    if (!p) { const g = GUN[w], t = C.currentTime, o = out(null); os(o, t, g[5] * 0.9, g[3] * 0.8, 38, { vol: g[2] * 0.55 }); nz(o, t, 0.02, 7000, { type: 'highpass', vol: g[2] * 0.25 }); }
    return; }
  if (!ok(p, 600)) return; const g = GUN[w]; if (!g) return rocketLaunch(p);
  const t = C.currentTime, d = dist(p), o = out(p, { ref: 6, roll: 0.75, air: 140, rev: p ? 0.15 : 0.12, revD: 220 }), far = d > 120;
  nz(o, t, g[0] * (far ? 1.6 : 1), far ? 1400 : g[1], { vol: g[2], f2: 300, q: 0.5 });
  nz(o, t, 0.012, 9000, { type: 'highpass', vol: g[2] * (far ? 0.1 : 0.6) });
  os(o, t, g[5], g[3], g[4], { vol: g[2] * 0.9, type: 'sine' });
  os(o, t, g[5] * 0.6, g[3] * 2, g[4] * 1.5, { vol: g[2] * 0.25, type: 'triangle' });
  if (!p) { os(o, t + 0.02, 0.02, g[6], g[6] * 0.7, { vol: 0.05, type: 'square' }); }
  nz(o, t + 0.03, g[7], 900, { vol: g[2] * 0.15, f2: 200, pink: true, a: 0.02 });
}
export function rocketLaunch(p) {
  if (!ok(p, 500)) return; const t = C.currentTime, o = out(p, { ref: 6, roll: 0.8, air: 160 });
  if (SMP.boom_heavy) sample('boom_heavy', p, 1, 0.8, { ref: 6, roll: 0.8, air: 160 });
  nz(o, t, 0.9, 600, { vol: 0.7, f2: 3500, type: 'bandpass', q: 0.6, a: 0.03 }); os(o, t, 0.4, 90, 40, { vol: 0.5 }); nz(o, t, 0.15, 3000, { vol: 0.4 });
}
export function boom(p, big) {
  if (!ok(p, 900)) return;
  if (SMP.boom_b3) { // echte Aufnahmen (CC0): nah krachend, fern dumpf
    const d = dist(p), o = { ref: 10, roll: 0.6, air: 260, rev: 0.3, revD: 250 };
    o.delay = Math.min(2, d / 343);
    if (d < 140) { sample(['boom_b2', 'boom_b3', 'boom_b4'][rr++ % 3], p, big ? 1.2 : 1, big ? 0.85 : 1, o); sample('boom_low', p, 0.9, 1, o); }
    else sample('boom_distant', p, 1.3, 1, o);
    return;
  } const t = C.currentTime, o = out(p, { ref: 10, roll: 0.6, air: 220, rev: 0.3, revD: 250 }), k = big ? 1.3 : 1;
  os(o, t, 1.1 * k, 80, 22, { vol: 0.9 }); nz(o, t, 1.4 * k, 1800, { vol: 0.9, f2: 120, pink: true }); nz(o, t, 0.06, 6000, { vol: 0.5, type: 'highpass' });
  for (let i = 0; i < 5; i++) nz(o, t + 0.15 + Math.random() * 0.5, 0.25, 2500 + Math.random() * 2000, { vol: 0.08, type: 'bandpass', q: 2 });
}
export function dry(p) { if (!ok(p, 30)) return; const t = C.currentTime, o = out(p); os(o, t, 0.03, 2400, 1800, { vol: 0.12, type: 'square' }); }
export function reload(w, phase, p) {
  if (!ok(p, 25)) return; const t = C.currentTime, o = out(p, { ref: 2 });
  if (phase === 'out') { nz(o, t, 0.05, 2600, { type: 'bandpass', q: 3, vol: 0.35 }); os(o, t + 0.01, 0.05, 900, 600, { vol: 0.12, type: 'square' }); }
  else if (phase === 'in') { nz(o, t, 0.06, 1800, { type: 'bandpass', q: 3, vol: 0.4 }); os(o, t + 0.04, 0.04, 1400, 1100, { vol: 0.18, type: 'square' }); }
  else if (phase === 'shell') { nz(o, t, 0.04, 2200, { type: 'bandpass', q: 4, vol: 0.3 }); os(o, t, 0.05, 700, 500, { vol: 0.1, type: 'triangle' }); }
  else if (phase === 'boltr') { if (!sample('bolt', p, 0.85, 1.1, { ref: 2 })) reload(w, 'in', p); }
  else if (phase === 'pump' && SMP.pump) sample('pump', p, 0.8, 1.05, { ref: 2 });
  else if (phase === 'bolt') { nz(o, t, 0.05, 3200, { type: 'bandpass', q: 3, vol: 0.3 }); nz(o, t + 0.16, 0.06, 2400, { type: 'bandpass', q: 3, vol: 0.35 }); }
  else if (phase === 'pump') { nz(o, t, 0.07, 1300, { type: 'bandpass', q: 2, vol: 0.45 }); nz(o, t + 0.15, 0.07, 1700, { type: 'bandpass', q: 2, vol: 0.45 }); }
}
export function equip(w) { if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' }); nz(o, t, 0.06, 1400, { type: 'bandpass', q: 1.5, vol: 0.25, pink: true }); os(o, t + 0.09, 0.03, 2600, 2000, { vol: 0.1, type: 'square' }); }

// ---------------- Treffer & Kampf
export function hit(head) {
  if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' });
  if (head) { os(o, t, 0.35, 1760, 1760, { vol: 0.22 }); os(o, t, 0.25, 2640, 2640, { vol: 0.1 }); nz(o, t, 0.03, 6000, { type: 'highpass', vol: 0.15 }); }
  else { nz(o, t, 0.04, 3500, { type: 'bandpass', q: 2, vol: 0.35 }); os(o, t, 0.05, 700, 400, { vol: 0.12, type: 'triangle' }); }
}
export function shieldHit() { if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' }); os(o, t, 0.12, 2200, 1500, { vol: 0.08, type: 'triangle' }); }
export function shieldBreak(p) {
  if (!C) return; const t = C.currentTime, o = out(p, { bus: p ? 's' : 'u' });
  nz(o, t, 0.4, 6000, { type: 'highpass', vol: 0.4 }); for (let i = 0; i < 6; i++) os(o, t + i * 0.035, 0.25, 3000 - i * 300, 1200, { vol: 0.07, type: 'triangle' });
}
export function hurt(shield) {
  if (!C) return; const t = C.currentTime, o = out(null);
  if (shield) { os(o, t, 0.15, 1300, 700, { vol: 0.1, type: 'triangle' }); nz(o, t, 0.08, 4000, { type: 'highpass', vol: 0.12 }); }
  else { os(o, t, 0.18, 110, 50, { vol: 0.4 }); nz(o, t, 0.12, 700, { vol: 0.25 }); }
}
export function elim(knock) {
  if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' });
  const ch = knock ? [523, 659] : [523, 659, 784, 1047];
  ch.forEach((f, i) => os(o, t + i * 0.06, 0.4, f, f, { vol: 0.12, type: 'triangle' }));
}
export function downed() { if (!C) return; const t = C.currentTime, o = out(null); os(o, t, 0.6, 300, 90, { vol: 0.2, type: 'sawtooth' }); nz(o, t, 0.4, 400, { vol: 0.3 }); }
export function heartbeat() { if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' }); os(o, t, 0.12, 60, 45, { vol: 0.35 }); os(o, t + 0.18, 0.12, 55, 40, { vol: 0.25 }); }

// ---------------- Bewegung
const SURF = {
  grass: (o, t, v) => { nz(o, t, 0.09, 900, { vol: v * 0.6, pink: true, a: 0.01 }); nz(o, t + 0.01, 0.05, 3500, { type: 'highpass', vol: v * 0.12 }); },
  sand: (o, t, v) => { nz(o, t, 0.11, 2200, { type: 'bandpass', q: 0.7, vol: v * 0.45, a: 0.015 }); },
  stone: (o, t, v) => { nz(o, t, 0.05, 1500, { type: 'bandpass', q: 1.2, vol: v * 0.7 }); os(o, t, 0.04, 220, 160, { vol: v * 0.2 }); },
  wood: (o, t, v) => { nz(o, t, 0.06, 700, { type: 'bandpass', q: 2, vol: v * 0.7 }); os(o, t, 0.08, 170, 120, { vol: v * 0.35, type: 'triangle' }); },
  metal: (o, t, v) => { nz(o, t, 0.05, 2500, { type: 'bandpass', q: 3, vol: v * 0.5 }); os(o, t, 0.18, 620, 600, { vol: v * 0.1, type: 'triangle' }); os(o, t, 0.15, 1430, 1400, { vol: v * 0.05 }); },
  water: (o, t, v) => { nz(o, t, 0.2, 800, { f2: 2500, type: 'bandpass', q: 0.8, vol: v * 0.6, a: 0.02 }); },
};
export function step(surf, p, v = 1) {
  if (!ok(p, 40)) return; const t = C.currentTime, o = out(p, { ref: 2, roll: 1.4, air: 40 });
  (SURF[surf] || SURF.grass)(o, t, v * (0.8 + Math.random() * 0.4));
}
export function land(surf, hard) { if (!C) return; const t = C.currentTime, o = out(null); (SURF[surf] || SURF.grass)(o, t, 1.4); os(o, t, 0.15, 90, 45, { vol: hard ? 0.45 : 0.2 }); }
export function jump() { if (!C) return; const t = C.currentTime, o = out(null); nz(o, t, 0.15, 1200, { type: 'bandpass', q: 0.7, vol: 0.12, pink: true, a: 0.03 }); }
export function slide() { if (!C) return; const t = C.currentTime, o = out(null); nz(o, t, 0.7, 1800, { f2: 600, type: 'bandpass', q: 0.6, vol: 0.3, a: 0.04 }); }
export function mantle() { if (!C) return; const t = C.currentTime, o = out(null); nz(o, t, 0.12, 900, { vol: 0.2, pink: true }); os(o, t + 0.1, 0.08, 150, 100, { vol: 0.15 }); }
export function glideOpen() { if (!C) return; const t = C.currentTime, o = out(null); nz(o, t, 0.35, 400, { f2: 2400, type: 'bandpass', q: 0.8, vol: 0.5, a: 0.02 }); os(o, t + 0.25, 0.1, 120, 80, { vol: 0.2 }); }
export function splash(p, big) { if (!ok(p, 60)) return; const t = C.currentTime, o = out(p); nz(o, t, big ? 0.7 : 0.35, 600, { f2: 3500, type: 'bandpass', q: 0.6, vol: big ? 0.7 : 0.4 }); }

// ---------------- Bauen & Abbauen
const MAT = { wood: [180, 650, 2], stone: [120, 1100, 1.2], metal: [420, 2400, 5] };
export function build(mat, p) {
  if (!ok(p, 60)) return; const m = MAT[mat] || MAT.wood, t = C.currentTime, o = out(p, { ref: 4 });
  nz(o, t, 0.08, m[1], { type: 'bandpass', q: m[2], vol: 0.6 }); os(o, t, 0.12, m[0], m[0] * 0.7, { vol: 0.35, type: mat === 'metal' ? 'triangle' : 'sine' });
  if (mat === 'metal') os(o, t, 0.4, m[0] * 2.7, m[0] * 2.6, { vol: 0.06 });
  nz(o, t + 0.05, 0.12, 2000, { type: 'highpass', vol: 0.08 });
}
export function pieceHit(mat, p) {
  if (!ok(p, 60)) return; const m = MAT[mat] || MAT.wood, t = C.currentTime, o = out(p, { ref: 3 });
  nz(o, t, 0.06, m[1] * 1.3, { type: 'bandpass', q: m[2], vol: 0.45 }); os(o, t, 0.07, m[0] * 1.2, m[0], { vol: 0.2, type: 'triangle' });
}
export function pieceBreak(mat, p) {
  if (!ok(p, 80)) return; const m = MAT[mat] || MAT.wood, t = C.currentTime, o = out(p, { ref: 4 });
  nz(o, t, 0.45, m[1], { f2: 200, vol: 0.6, pink: true }); for (let i = 0; i < 4; i++) nz(o, t + 0.05 + i * 0.07, 0.08, m[1] * (0.8 + Math.random()), { type: 'bandpass', q: 3, vol: 0.2 });
  os(o, t, 0.3, m[0] * 0.6, m[0] * 0.3, { vol: 0.3 });
}
export function edit() { if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' }); os(o, t, 0.05, 1200, 900, { vol: 0.1, type: 'square' }); nz(o, t, 0.05, 2000, { type: 'bandpass', q: 3, vol: 0.2 }); }
export function swing() { if (!C) return; const t = C.currentTime, o = out(null); nz(o, t, 0.16, 500, { f2: 2000, type: 'bandpass', q: 1, vol: 0.18, a: 0.04 }); }
export function chop(kind, p) {
  if (!ok(p, 50)) return; const t = C.currentTime, o = out(p, { ref: 3 });
  if (kind === 'tree') { nz(o, t, 0.1, 600, { type: 'bandpass', q: 2.5, vol: 0.7 }); os(o, t, 0.12, 160, 110, { vol: 0.3, type: 'triangle' }); }
  else if (kind === 'rock') { nz(o, t, 0.08, 1800, { type: 'bandpass', q: 1.5, vol: 0.6 }); os(o, t, 0.05, 900, 500, { vol: 0.15, type: 'square' }); }
  else { nz(o, t, 0.06, 2600, { type: 'bandpass', q: 5, vol: 0.5 }); os(o, t, 0.3, 880, 860, { vol: 0.1, type: 'triangle' }); }
}
export function harvestTick() { if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' }); os(o, t, 0.06, 1500, 1900, { vol: 0.06, type: 'triangle' }); }

// ---------------- Gegenstände & Oberfläche
export function pickup(kind) {
  if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' });
  if (kind === 'w') { nz(o, t, 0.08, 1500, { type: 'bandpass', q: 2, vol: 0.3 }); os(o, t + 0.06, 0.06, 2200, 1800, { vol: 0.1, type: 'square' }); }
  else if (kind === 'a') { for (let i = 0; i < 3; i++) os(o, t + i * 0.04, 0.05, 2800 + i * 300, 2500, { vol: 0.06, type: 'triangle' }); }
  else if (kind === 'm') { nz(o, t, 0.07, 800, { type: 'bandpass', q: 2, vol: 0.25 }); os(o, t, 0.08, 300, 260, { vol: 0.12, type: 'triangle' }); }
  else { os(o, t, 0.12, 900, 1400, { vol: 0.1, type: 'triangle' }); }
}
export function chestOpen(p) {
  if (!ok(p, 40)) return; const t = C.currentTime, o = out(p, { ref: 3 });
  nz(o, t, 0.25, 500, { type: 'bandpass', q: 1.5, vol: 0.4, pink: true });
  [784, 988, 1175, 1568].forEach((f, i) => os(o, t + 0.12 + i * 0.07, 0.6, f, f, { vol: 0.08, type: 'triangle' }));
}
export function heal(kind, phase) {
  if (!C) return; const t = C.currentTime, o = out(null);
  if (phase === 'done') { [660, 880, 1320].forEach((f, i) => os(o, t + i * 0.05, 0.4, f, f, { vol: 0.07, type: kind === 'pot' || kind === 'mini' || kind === 'chug' ? 'sine' : 'triangle' })); return; }
  if (kind === 'band') nz(o, t, 0.25, 3000, { type: 'bandpass', q: 1, vol: 0.18, a: 0.05 });
  else if (kind === 'med') { nz(o, t, 0.2, 5000, { type: 'highpass', vol: 0.12, a: 0.05 }); os(o, t, 0.15, 400, 600, { vol: 0.05, type: 'triangle' }); }
  else if (kind === 'bush') nz(o, t, 0.4, 1500, { type: 'bandpass', q: 0.6, vol: 0.25, pink: true, a: 0.05 });
  else { nz(o, t, 0.12, 700, { type: 'bandpass', q: 4, vol: 0.25 }); os(o, t, 0.1, 300, 180, { vol: 0.12 }); }
}
export function ui(kind) {
  if (!C) return; const t = C.currentTime, o = out(null, { bus: 'u' });
  if (kind === 'click') os(o, t, 0.04, 1400, 1100, { vol: 0.08, type: 'triangle' });
  else if (kind === 'storm') { os(o, t, 1.2, 220, 110, { vol: 0.15, type: 'sawtooth' }); os(o, t, 1.2, 330, 165, { vol: 0.08, type: 'sawtooth' }); }
  else if (kind === 'drop') { [392, 523, 659].forEach((f, i) => os(o, t + i * 0.12, 0.5, f, f, { vol: 0.1, type: 'triangle' })); }
  else if (kind === 'win') { [523, 659, 784, 1047, 1319].forEach((f, i) => os(o, t + i * 0.1, 0.9, f, f, { vol: 0.12, type: 'triangle' })); }
  else if (kind === 'good') { os(o, t, 0.35, 500, 1100, { vol: 0.12 }); }
  else if (kind === 'bad') { os(o, t, 0.35, 400, 240, { vol: 0.12, type: 'sawtooth' }); }
  else if (kind === 'mark') { os(o, t, 0.1, 990, 1480, { vol: 0.08, type: 'triangle' }); }
  else if (kind === 'beep') { os(o, t, 0.08, 880, 880, { vol: 0.1, type: 'square' }); }
}
export function car(kind, p) {
  if (!ok(p, 60)) return; const t = C.currentTime, o = out(p, { ref: 4 });
  if (kind === 'crash') { nz(o, t, 0.35, 1200, { f2: 200, vol: 0.7 }); os(o, t, 0.25, 120, 50, { vol: 0.4 }); nz(o, t + 0.05, 0.2, 4000, { type: 'highpass', vol: 0.2 }); }
  else if (kind === 'skid') nz(o, t, 0.25, 2600, { type: 'bandpass', q: 4, vol: 0.12 });
  else if (kind === 'door') { nz(o, t, 0.08, 900, { type: 'bandpass', q: 2, vol: 0.4 }); os(o, t, 0.1, 140, 90, { vol: 0.25 }); }
}
export function nadeBounce(p) { if (!ok(p, 40)) return; const t = C.currentTime, o = out(p); os(o, t, 0.05, 900, 600, { vol: 0.15, type: 'triangle' }); }
export function gas(p) { if (!ok(p, 80)) return; const t = C.currentTime, o = out(p, { ref: 5 }); nz(o, t, 1.5, 300, { f2: 1200, vol: 0.5, pink: true, a: 0.1 }); }
export function rebootBeep(p) { if (!ok(p, 40)) return; const t = C.currentTime, o = out(p); os(o, t, 0.12, 1200, 1200, { vol: 0.08, type: 'square' }); }

// ---------------- Dauerschleifen (Wind, Sturm, Motor, Truhe, Umgebung)
function mkLoop(name) {
  if (loops[name]) return loops[name];
  const g = C.createGain(); g.gain.value = 0; let lp = { g };
  if (name === 'wind' || name === 'amb' || name === 'storm' || name === 'water') {
    const s = C.createBufferSource(); s.buffer = name === 'wind' ? NB : NB2; s.loop = true;
    const f = C.createBiquadFilter(); f.type = name === 'wind' ? 'bandpass' : 'lowpass'; f.frequency.value = name === 'storm' ? 160 : name === 'water' ? 700 : 500; f.Q.value = 0.6;
    s.connect(f); f.connect(g); s.start(); lp.f = f;
    if (name === 'storm') { const o = C.createOscillator(); o.frequency.value = 42; const og = C.createGain(); og.gain.value = 0.35; o.connect(og); og.connect(g); o.start(); }
    if (name === 'water') { const l = C.createOscillator(), lg = C.createGain(); l.frequency.value = 0.12; lg.gain.value = 300; l.connect(lg); lg.connect(f.frequency); l.start(); }
    g.connect(buses[name === 'amb' || name === 'water' ? 'a' : 's']);
  } else if (name === 'engine') {
    const o1 = C.createOscillator(), o2 = C.createOscillator(), f = C.createBiquadFilter(); o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 500; f.Q.value = 2;
    o1.connect(f); o2.connect(f); f.connect(g); o1.start(); o2.start(); g.connect(buses.s); lp.o1 = o1; lp.o2 = o2; lp.f = f;
  } else if (name === 'hum') {
    const pan = C.createPanner(); pan.panningModel = 'equalpower'; pan.refDistance = 2; pan.rolloffFactor = 1.6;
    const tr = C.createGain(), lfo = C.createOscillator(), lg = C.createGain(); lfo.frequency.value = 5; lg.gain.value = 0.35; lfo.connect(lg); lg.connect(tr.gain); tr.gain.value = 0.65; lfo.start();
    for (const f of [523.25, 659.25, 783.99, 1046.5]) { const o = C.createOscillator(); o.type = 'sine'; o.frequency.value = f; const og = C.createGain(); og.gain.value = 0.08; o.connect(og); og.connect(tr); o.start(); }
    tr.connect(g); g.connect(pan); pan.connect(buses.s); lp.pan = pan;
  }
  loops[name] = lp; return lp;
}
export function loop(name, vol, p) {
  if (!C) return; const l = mkLoop(name), t = C.currentTime;
  l.g.gain.setTargetAtTime(Math.max(0, vol), t, 0.12);
  if (name === 'wind' && l.f) l.f.frequency.setTargetAtTime(300 + vol * 2600, t, 0.2);
  if (name === 'engine' && p != null) { const f = 38 + p * 7; l.o1.frequency.setTargetAtTime(f, t, 0.05); l.o2.frequency.setTargetAtTime(f * 0.501, t, 0.05); l.f.frequency.setTargetAtTime(350 + p * 90, t, 0.05); }
  if (name === 'hum' && p && l.pan) { if (l.pan.positionX) { l.pan.positionX.setTargetAtTime(p[0], t, 0.05); l.pan.positionY.setTargetAtTime(p[1], t, 0.05); l.pan.positionZ.setTargetAtTime(p[2], t, 0.05); } else l.pan.setPosition(p[0], p[1], p[2]); }
}
export function stopLoops() { for (const k in loops) loops[k].g.gain.setTargetAtTime(0, C.currentTime, 0.1); }
// Vögel & Natur (zufällig)
export function bird(p) {
  if (!ok(p, 80)) return; const t = C.currentTime, o = out(p, { bus: 'a', ref: 8, roll: 0.6 }), b = 2200 + Math.random() * 1800, n = 2 + (Math.random() * 4 | 0);
  for (let i = 0; i < n; i++) { const tt = t + i * (0.09 + Math.random() * 0.05); os(o, tt, 0.07, b * (1 + Math.random() * 0.3), b * (0.7 + Math.random() * 0.2), { vol: 0.05, a: 0.01 }); }
}
export function leaves(p) { if (!ok(p, 60)) return; const t = C.currentTime, o = out(p, { bus: 'a', ref: 6 }); nz(o, t, 1.2, 3500, { type: 'highpass', vol: 0.05, a: 0.4 }); }
// einfache Töne für Hinweise
export function blip(f0, f1, dur, vol, type) { if (!C) return; os(out(null, { bus: 'u' }), C.currentTime, dur, f0, f1, { vol, type: type || 'square' }); }
export function hiss(dur, f, vol, p) { if (!C || vol < 0.01) return; nz(out(p || null), C.currentTime, dur, f, { vol }); }
