// Gemeinsame Spielregeln für Server und Client
(function () {
  const S = {};
  const G = (S.G = 4), H = (S.H = 3.2);
  S.R = 250;
  S.SHIPY = 115;
  S.POIS = [
    { n: 'Kieselhafen', x: -140, z: -70, r: 40, l: 1 },
    { n: 'Nebelhain', x: -40, z: -150, r: 36, l: 2 },
    { n: 'Rostwerk', x: 110, z: -110, r: 40, l: 2 },
    { n: 'Sonnenhof', x: 150, z: 30, r: 38, l: 3 },
    { n: 'Turmstadt', x: 5, z: 10, r: 46, l: 2 },
    { n: 'Moosgrund', x: -110, z: 90, r: 38, l: 2 },
    { n: 'Kliffkante', x: 60, z: 150, r: 36, l: 3 },
  ];
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  S.sm = sm;
  S.poiAt = function (x, z, extra) {
    for (const p of S.POIS) if (Math.hypot(x - p.x, z - p.z) < p.r + (extra || 0)) return p;
    return null;
  };
  S.height = function (x, z) {
    let h = 7.5 + 4 * Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4) + 2.6 * Math.sin(x * 0.047 + z * 0.031) + 1.3 * Math.cos(x * 0.09 - z * 0.07 + 2);
    const mx = x - 75, mz = z + 25;
    h += 15 * Math.exp(-(mx * mx + mz * mz) / 1500);
    const d = Math.hypot(x, z);
    const e = 1 - sm(S.R - 75, S.R - 8, d);
    h = -5 + (h + 5) * e;
    for (const p of S.POIS) {
      const pd = Math.hypot(x - p.x, z - p.z);
      if (pd < p.r + 20) { const w = 1 - sm(p.r, p.r + 20, pd); h += (p.l * H - h) * w; }
    }
    return h;
  };

  S.W = {
    ar: { n: 'Sturmgewehr', s: 'STG', dmg: 30, rate: 180, mag: 30, rel: 2.2, spread: 0.02, head: 1.5, pellets: 1, ammo: 'medium', range: [50, 110, 0.65] },
    smg: { n: 'Maschinenpistole', s: 'MP', dmg: 17, rate: 85, mag: 30, rel: 2.0, spread: 0.038, head: 1.5, pellets: 1, ammo: 'light', range: [22, 50, 0.5] },
    shotgun: { n: 'Pumpgun', s: 'PUMP', dmg: 11, rate: 950, mag: 5, rel: 3.4, spread: 0.07, head: 1.5, pellets: 9, ammo: 'shells', range: [8, 26, 0.15] },
    pistol: { n: 'Pistole', s: 'PIST', dmg: 24, rate: 240, mag: 16, rel: 1.4, spread: 0.018, head: 2, pellets: 1, ammo: 'light', range: [30, 70, 0.6] },
    sniper: { n: 'Scharfschützengewehr', s: 'SNIPER', dmg: 105, rate: 1500, mag: 1, rel: 2.6, spread: 0.06, head: 2.5, pellets: 1, ammo: 'heavy', range: [400, 500, 1] },
  };
  S.RAR = [
    { n: 'Gewöhnlich', c: '#9aa0a6', m: 1 },
    { n: 'Ungewöhnlich', c: '#3ecf4a', m: 1.06 },
    { n: 'Selten', c: '#3aa0ff', m: 1.12 },
    { n: 'Episch', c: '#b04dff', m: 1.18 },
    { n: 'Legendär', c: '#ffb52e', m: 1.25 },
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
  };
  S.AMMO = { light: 'Leichte Munition', medium: 'Mittlere Munition', shells: 'Schrot', heavy: 'Schwere Munition' };
  S.MATS = { wood: { n: 'Holz', hp: 150 }, stone: { n: 'Stein', hp: 300 }, metal: { n: 'Metall', hp: 450 } };
  S.COST = 10;
  S.STORM = [
    { wait: 75, shrink: 40, f: 0.5, dmg: 1 },
    { wait: 40, shrink: 30, f: 0.27, dmg: 2 },
    { wait: 30, shrink: 25, f: 0.12, dmg: 4 },
    { wait: 20, shrink: 20, f: 0.04, dmg: 7 },
    { wait: 10, shrink: 20, f: 0, dmg: 10 },
  ];

  // Bauteile: t = 'w' Wand (d: 0 entlang x, 1 entlang z), 'f' Boden, 'r' Rampe (rot 0..3)
  S.pkey = (p) => p.t + ':' + p.ix + ':' + p.iy + ':' + p.iz + (p.t === 'w' ? ':' + p.d : '');
  const B = [0, 0, 0, 0, 0, 0];
  S.pbox = function (p) {
    if (p.t === 'f') { B[0] = p.ix * G; B[1] = p.iy * H - 0.12; B[2] = p.iz * G; B[3] = B[0] + G; B[4] = p.iy * H + 0.12; B[5] = B[2] + G; }
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
  S.rayPieces = function (ox, oy, oz, dx, dy, dz, max, pieces) {
    let best = max, key = null;
    for (const p of pieces.values()) {
      const cx = (p.ix + 0.5) * G - ox, cz = (p.iz + 0.5) * G - oz, lim = best + 5;
      if (cx * cx + cz * cz > lim * lim) continue;
      let t = null;
      if (p.t === 'r') {
        const k = H / G; let a, b = 0, c = 0;
        if (p.rot === 0) { c = k; a = p.iy * H - p.iz * G * c; }
        else if (p.rot === 1) { b = k; a = p.iy * H - p.ix * G * b; }
        else if (p.rot === 2) { c = -k; a = p.iy * H + H - p.iz * G * c; }
        else { b = -k; a = p.iy * H + H - p.ix * G * b; }
        const den = dy - b * dx - c * dz;
        if (Math.abs(den) > 1e-9) {
          const tt = (a + b * ox + c * oz - oy) / den;
          if (tt > 0) {
            const hx = ox + dx * tt, hz = oz + dz * tt;
            if (hx >= p.ix * G && hx <= p.ix * G + G && hz >= p.iz * G && hz <= p.iz * G + G) t = tt;
          }
        }
      } else t = S.rayBox(ox, oy, oz, dx, dy, dz, S.pbox(p));
      if (t !== null && t < best) { best = t; key = p.key; }
    }
    return key ? { t: best, key } : null;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = S; else window.S = S;
})();
