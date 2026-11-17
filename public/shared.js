// Gemeinsame Spielregeln für Server und Client
(function () {
  const S = {};
  const G = (S.G = 4), H = (S.H = 3.2);
  S.R = 800;
  S.SHIPY = 260;
  // Orte: t = Art (city, town, farm, factory, harbor, camp, fort)
  S.POIS = [
    { n: 'Turmstadt', t: 'city', x: 0, z: 0, r: 72 },
    { n: 'Nebelhain', t: 'town', x: -120, z: -290, r: 50 },
    { n: 'Rostwerk', t: 'factory', x: 240, z: -200, r: 55 },
    { n: 'Sonnenhof', t: 'farm', x: 300, z: 90, r: 55 },
    { n: 'Moosgrund', t: 'town', x: -280, z: 120, r: 50 },
    { n: 'Eichenruh', t: 'town', x: 60, z: 300, r: 48 },
    { n: 'Zinnenburg', t: 'fort', x: -330, z: -110, r: 46 },
    { n: 'Kieselhafen', t: 'harbor', x: -640, z: -150, r: 50 },
    { n: 'Weidental', t: 'farm', x: -480, z: -470, r: 55 },
    { n: 'Funkenfeld', t: 'factory', x: 60, z: -600, r: 55 },
    { n: 'Krähennest', t: 'camp', x: 420, z: -480, r: 36 },
    { n: 'Ankerbucht', t: 'harbor', x: 640, z: -120, r: 50 },
    { n: 'Glutberg', t: 'camp', x: 560, z: 310, r: 40 },
    { n: 'Neonmarkt', t: 'city', x: 300, z: 560, r: 60 },
    { n: 'Silberbach', t: 'town', x: -150, z: 600, r: 50 },
    { n: 'Seeblick', t: 'town', x: -540, z: 340, r: 50 },
    { n: 'Steinbruch', t: 'factory', x: -650, z: 110, r: 48 },
    { n: 'Kliffkante', t: 'camp', x: 690, z: 140, r: 36 },
  ];
  const MOUNT = [[450, -280, 36, 75], [-430, -330, 32, 65], [180, 470, 28, 55], [-120, -470, 30, 60], [-40, 160, 14, 40]];
  const LAKES = [[-160, 150, 18, 45], [480, -20, 17, 45], [-400, 470, 18, 50], [140, -360, 15, 34]];
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  S.sm = sm;
  S.poiAt = function (x, z, extra) {
    for (const p of S.POIS) { const e = p.r + (extra || 0); if (Math.abs(x - p.x) < e && Math.abs(z - p.z) < e && Math.hypot(x - p.x, z - p.z) < e) return p; }
    return null;
  };
  function raw(x, z) {
    let h = 8 + 4 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4) + 2.6 * Math.sin(x * 0.047 + z * 0.031) + 1.3 * Math.cos(x * 0.09 - z * 0.07 + 2);
    h += 7 * Math.sin(x * 0.0061 + 0.7) * Math.cos(z * 0.0053 - 1.1) + 4 * Math.sin(x * 0.0113 - z * 0.0091 + 2.3);
    for (const m of MOUNT) { const dx = x - m[0], dz = z - m[1]; if (Math.abs(dx) < m[3] * 3 && Math.abs(dz) < m[3] * 3) h += m[2] * Math.exp(-(dx * dx + dz * dz) / (m[3] * m[3])); }
    for (const l of LAKES) { const dx = x - l[0], dz = z - l[1]; if (Math.abs(dx) < l[3] * 3 && Math.abs(dz) < l[3] * 3) h -= l[2] * Math.exp(-(dx * dx + dz * dz) / (l[3] * l[3])); }
    const d = Math.hypot(x, z), a = Math.atan2(z, x), re = S.R - 55 + 38 * Math.sin(a * 3 + 0.8) + 22 * Math.sin(a * 7 - 1.3) + 10 * Math.sin(a * 13 + 2);
    const e = 1 - sm(re - 150, re, d);
    return -7 + (h + 7) * e;
  }
  for (const p of S.POIS) p.l = Math.max(1, Math.round(raw(p.x, p.z) / H));
  S.height = function (x, z) {
    let h = raw(x, z);
    for (const p of S.POIS) {
      const dx = x - p.x, dz = z - p.z, e = p.r + 26;
      if (Math.abs(dx) > e || Math.abs(dz) > e) continue;
      const pd = Math.hypot(dx, dz);
      if (pd < e) { const w = 1 - sm(p.r, e, pd); h += (p.l * H - h) * w; }
    }
    return h;
  };
  // Straßen: minimaler Spannbaum zwischen den Orten plus ein paar Querverbindungen
  S.ROADS = [];
  {
    const P = S.POIS, inT = [0], dist = (a, b) => Math.hypot(P[a].x - P[b].x, P[a].z - P[b].z);
    while (inT.length < P.length) {
      let best = null;
      for (const a of inT) for (let b = 0; b < P.length; b++) if (!inT.includes(b) && (!best || dist(a, b) < best[2])) best = [a, b, dist(a, b)];
      S.ROADS.push([best[0], best[1]]); inT.push(best[1]);
    }
    for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) if (dist(a, b) < 300 && !S.ROADS.some((r) => (r[0] === a && r[1] === b) || (r[0] === b && r[1] === a)) && S.ROADS.length < 26) S.ROADS.push([a, b]);
  }
  S.W = {
    ar: { n: 'Sturmgewehr', s: 'STG', dmg: 30, rate: 180, mag: 30, rel: 2.2, spread: 0.02, head: 1.5, pellets: 1, ammo: 'medium', range: [50, 110, 0.65] },
    smg: { n: 'Maschinenpistole', s: 'MP', dmg: 17, rate: 85, mag: 30, rel: 2.0, spread: 0.038, head: 1.5, pellets: 1, ammo: 'light', range: [22, 50, 0.5] },
    shotgun: { n: 'Pumpgun', s: 'PUMP', dmg: 11, rate: 950, mag: 5, rel: 3.4, spread: 0.07, head: 1.5, pellets: 9, ammo: 'shells', range: [8, 26, 0.15] },
    pistol: { n: 'Pistole', s: 'PIST', dmg: 24, rate: 240, mag: 16, rel: 1.4, spread: 0.018, head: 2, pellets: 1, ammo: 'light', range: [30, 70, 0.6] },
    sniper: { n: 'Scharfschützengewehr', s: 'SNIPER', dmg: 105, rate: 1500, mag: 1, rel: 2.6, spread: 0.06, head: 2.5, pellets: 1, ammo: 'heavy', range: [400, 500, 1] },
    tac: { n: 'Taktische Schrotflinte', s: 'TAKTIK', dmg: 8, rate: 620, mag: 8, rel: 5.2, spread: 0.08, head: 1.6, pellets: 10, ammo: 'shells', range: [7, 22, 0.15] },
    hunt: { n: 'Jagdgewehr', s: 'JAGD', dmg: 86, rate: 1200, mag: 1, rel: 1.7, spread: 0.004, head: 2, pellets: 1, ammo: 'heavy', range: [300, 400, 1] },
    rpg: { n: 'Raketenwerfer', s: 'RAKETE', dmg: 0, rate: 1300, mag: 1, rel: 3.3, spread: 0.01, head: 1, pellets: 1, ammo: 'rockets', range: [500, 600, 1] },
  };
  S.RAR = [
    { n: 'Gewöhnlich', c: '#9aa0a6', m: 1 },
    { n: 'Ungewöhnlich', c: '#3ecf4a', m: 1.06 },
    { n: 'Selten', c: '#3aa0ff', m: 1.12 },
    { n: 'Episch', c: '#b04dff', m: 1.18 },
    { n: 'Legendär', c: '#ffb52e', m: 1.25 },
    { n: 'Mythisch', c: '#ff5f3a', m: 1.33 },
  ];
  S.wdmg = function (w, r, dist, head) {
    const W = S.W[w]; if (!W) return 0;
    const [a, b, f] = W.range;
    const fall = dist <= a ? 1 : dist >= b ? f : 1 + (f - 1) * ((dist - a) / (b - a));
    return W.dmg * S.RAR[r | 0].m * fall * (head ? W.head : 1);
  };
  S.CONS = {
    med: { n: 'Medkit', s: 'MEDKIT', t: 4.5, max: 3, col: '#e74c3c' },
    band: { n: 'Verband', s: 'VERBAND', t: 2.2, max: 15, col: '#f2f2f2' },
    pot: { n: 'Schildtrank', s: 'SCHILD', t: 3.5, max: 3, col: '#2f7bff' },
    mini: { n: 'Kleiner Schildtrank', s: 'MINI', t: 1.8, max: 6, col: '#6fd3ff' },
    gren: { n: 'Granate', s: 'GRANATE', t: 0, max: 6, col: '#8fbf4a' },
    stink: { n: 'Stinkbombe', s: 'STINK', t: 0, max: 5, col: '#b5d93a' },
    chug: { n: 'Schildfass', s: 'FASS', t: 9, max: 1, col: '#4fa3ff' },
    bush: { n: 'Tarnbusch', s: 'BUSCH', t: 0.6, max: 1, col: '#3fae46' },
  };
  S.AMMO = { light: 'Leichte Munition', medium: 'Mittlere Munition', shells: 'Schrot', heavy: 'Schwere Munition', rockets: 'Raketen' };
  S.MATS = { wood: { n: 'Holz', hp: 150, bt: 1.2 }, stone: { n: 'Stein', hp: 300, bt: 2.4 }, metal: { n: 'Metall', hp: 450, bt: 3.8 } };
  S.COST = 10;
  // Rückstoß (rec), Streuungszuwachs pro Schuss (bloom)
  const REC = { ar: [0.011, 0.006], smg: [0.007, 0.005], shotgun: [0.05, 0], pistol: [0.016, 0.009], sniper: [0.075, 0], tac: [0.035, 0], hunt: [0.06, 0], rpg: [0.06, 0] };
  for (const k in REC) { S.W[k].rec = REC[k][0]; S.W[k].bloom = REC[k][1]; }
  S.roadDist = function (x, z) {
    let best = 1e9;
    for (const r of S.ROADS) {
      const a = S.POIS[r[0]], b = S.POIS[r[1]], dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.min(1, Math.max(0, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const px = a.x + dx * t + Math.sin(t * 9 + r[0]) * 10, pz = a.z + dz * t + Math.cos(t * 7 + r[1]) * 10;
      const d = Math.hypot(x - px, z - pz); if (d < best) best = d;
    }
    return best;
  };
  S.STORM = [
    { wait: 70, shrink: 70, f: 0.5, dmg: 1 },
    { wait: 55, shrink: 55, f: 0.3, dmg: 1 },
    { wait: 45, shrink: 45, f: 0.17, dmg: 2 },
    { wait: 40, shrink: 38, f: 0.095, dmg: 5 },
    { wait: 32, shrink: 30, f: 0.05, dmg: 8 },
    { wait: 25, shrink: 25, f: 0.024, dmg: 10 },
    { wait: 15, shrink: 22, f: 0.01, dmg: 10 },
    { wait: 10, shrink: 22, f: 0, dmg: 10 },
  ];


  // Bauteile: t = 'w' Wand (d: 0 entlang x, 1 entlang z), 'f' Boden, 'r' Rampe (rot 0..3)
  S.pkey = (p) => p.t + ':' + p.ix + ':' + p.iy + ':' + p.iz + (p.t === 'w' ? ':' + p.d : '');
  const B = [0, 0, 0, 0, 0, 0];
  S.roofY = (p, x, z) => p.iy * H + 1.6 * (1 - 2 * Math.max(Math.abs((x - p.ix * G) / G - 0.5), Math.abs((z - p.iz * G) / G - 0.5)));
  S.pbox = function (p) {
    if (p.t === 'c') { B[0] = p.ix * G; B[1] = p.iy * H; B[2] = p.iz * G; B[3] = B[0] + G; B[4] = p.iy * H + 1.0; B[5] = B[2] + G; }
    else if (p.t === 'f') { B[0] = p.ix * G; B[1] = p.iy * H - 0.12; B[2] = p.iz * G; B[3] = B[0] + G; B[4] = p.iy * H + 0.12; B[5] = B[2] + G; }
    else if (p.d === 0) { B[0] = p.ix * G; B[1] = p.iy * H; B[2] = p.iz * G - 0.12; B[3] = B[0] + G; B[4] = B[1] + H; B[5] = p.iz * G + 0.12; }
    else { B[0] = p.ix * G - 0.12; B[1] = p.iy * H; B[2] = p.iz * G; B[3] = p.ix * G + 0.12; B[4] = B[1] + H; B[5] = B[2] + G; }
    return B;
  };
  S.rampY = function (p, x, z) {
    let t;
    if (p.rot === 0) t = (z - p.iz * G) / G; else if (p.rot === 1) t = (x - p.ix * G) / G;
    else if (p.rot === 2) t = 1 - (z - p.iz * G) / G; else t = 1 - (x - p.ix * G) / G;
    return p.iy * H + Math.min(1, Math.max(0, t)) * H;
  };
  S.rayBox = function (ox, oy, oz, dx, dy, dz, b) {
    let t0 = 0, t1 = 1e9;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < b[i] || o[i] > b[i + 3]) return null; }
      else {
        let a = (b[i] - o[i]) / d[i], c = (b[i + 3] - o[i]) / d[i];
        if (a > c) { const s = a; a = c; c = s; }
        if (a > t0) t0 = a; if (c < t1) t1 = c;
        if (t0 > t1) return null;
      }
    }
    return t0;
  };
  S.rayPiece = function (p, ox, oy, oz, dx, dy, dz) {
    if (p.t !== 'r') {
      const t = S.rayBox(ox, oy, oz, dx, dy, dz, S.pbox(p));
      if (t === null || p.t !== 'w' || !p.v) return t;
      const u = (p.d === 0 ? ox + dx * t - p.ix * G : oz + dz * t - p.iz * G) / G, w = (oy + dy * t - p.iy * H) / H;
      if (p.v === 1 && u > 0.27 && u < 0.73 && w > 0.3 && w < 0.78) return null;
      if (p.v === 2 && u > 0.3 && u < 0.7 && w < 0.78) return null;
      return t;
    }
    const k = H / G; let a, b = 0, c = 0;
    if (p.rot === 0) { c = k; a = p.iy * H - p.iz * G * c; }
    else if (p.rot === 1) { b = k; a = p.iy * H - p.ix * G * b; }
    else if (p.rot === 2) { c = -k; a = p.iy * H + H - p.iz * G * c; }
    else { b = -k; a = p.iy * H + H - p.ix * G * b; }
    const den = dy - b * dx - c * dz;
    if (Math.abs(den) < 1e-9) return null;
    const tt = (a + b * ox + c * oz - oy) / den;
    if (tt < 0) return null;
    const hx = ox + dx * tt, hz = oz + dz * tt;
    return hx >= p.ix * G && hx <= p.ix * G + G && hz >= p.iz * G && hz <= p.iz * G + G ? tt : null;
  };
  // Raster für Bauteile: Strahltest läuft nur durch die berührten Zellen (schnell auch bei vielen Bauteilen)
  const CK = (ix, iz) => (ix + 600) * 1200 + (iz + 600);
  class PGrid {
    constructor() { this.cells = new Map(); this.stamp = 0; this.marks = new Map(); }
    cellsOf(p) { return p.t === 'w' ? (p.d === 0 ? [CK(p.ix, p.iz), CK(p.ix, p.iz - 1)] : [CK(p.ix, p.iz), CK(p.ix - 1, p.iz)]) : [CK(p.ix, p.iz)]; }
    add(p) { for (const k of this.cellsOf(p)) { let a = this.cells.get(k); if (!a) this.cells.set(k, (a = [])); if (a.indexOf(p) < 0) a.push(p); } }
    remove(p) { for (const k of this.cellsOf(p)) { const a = this.cells.get(k); if (!a) continue; const i = a.indexOf(p); if (i >= 0) { a[i] = a[a.length - 1]; a.pop(); } if (!a.length) this.cells.delete(k); } this.marks.delete(p); }
    clear() { this.cells.clear(); this.marks.clear(); }
    ray(ox, oy, oz, dx, dy, dz, max) {
      const st = ++this.stamp, mk = this.marks; let best = max, key = null;
      let ix = Math.floor(ox / G), iz = Math.floor(oz / G);
      const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1, ax = Math.abs(dx), az = Math.abs(dz);
      let tx = ax < 1e-9 ? Infinity : (sx > 0 ? (ix + 1) * G - ox : ox - ix * G) / ax;
      let tz = az < 1e-9 ? Infinity : (sz > 0 ? (iz + 1) * G - oz : oz - iz * G) / az;
      const ddx = ax < 1e-9 ? Infinity : G / ax, ddz = az < 1e-9 ? Infinity : G / az;
      for (let n = 0; n < 512; n++) {
        const a = this.cells.get(CK(ix, iz));
        if (a) for (let i = 0; i < a.length; i++) {
          const p = a[i]; if (mk.get(p) === st) continue; mk.set(p, st);
          const t = S.rayPiece(p, ox, oy, oz, dx, dy, dz);
          if (t !== null && t < best) { best = t; key = p.key; }
        }
        const nt = Math.min(tx, tz);
        if (nt > best) break;
        if (tx < tz) { ix += sx; tx += ddx; } else { iz += sz; tz += ddz; }
      }
      return key ? { t: best, key } : null;
    }
  }
  S.PGrid = PGrid;
  S.packPiece = (p) => { const o = { t: p.t, ix: p.ix, iy: p.iy, iz: p.iz, mat: p.mat, key: p.key, hp: Math.round(p.hp) }; if (p.t === 'w') { o.d = p.d; if (p.v) o.v = 1; } if (p.t === 'r') o.rot = p.rot; return o; };

  if (typeof module !== 'undefined' && module.exports) module.exports = S; else window.S = S;
})();
