// Lädt die Kenney-Modelle (CC0, kenney.nl) aus props.bin – eine Geometrie pro Modell, Farben als Vertex-Farben
import * as THREE from 'three';
export const PROPS = { list: [], by: {}, ready: false };
const s2l = new Float32Array(256);
for (let i = 0; i < 256; i++) { const c = i / 255; s2l[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
export async function loadProps() {
  const [meta, bin] = await Promise.all([fetch('/props/props.json').then((r) => r.json()), fetch('/props/props.bin').then((r) => r.arrayBuffer())]);
  for (const m of meta) {
    const p16 = new Int16Array(bin, m.po, m.v * 3), n8 = new Int8Array(bin, m.no, m.v * 3), c8 = new Uint8Array(bin, m.co, m.v * 3);
    const pos = new Float32Array(m.v * 3), col = new Float32Array(m.v * 3);
    for (let i = 0; i < m.v * 3; i++) { pos[i] = p16[i] * m.q; col[i] = s2l[c8[i]]; }
    for (let i = 1; i < m.v * 3; i += 3) pos[i] += m.oy;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Int8Array(n8), 3, true));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(new THREE.BufferAttribute(m.i32 ? new Uint32Array(bin.slice(m.io, m.io + m.i * 4)) : new Uint16Array(bin.slice(m.io, m.io + m.i * 2)), 1));
    g.computeBoundingSphere();
    const e = { ...m, geo: g, idx: PROPS.list.length };
    PROPS.list.push(e); PROPS.by[m.n] = e;
  }
  PROPS.ready = true;
  return PROPS;
}
