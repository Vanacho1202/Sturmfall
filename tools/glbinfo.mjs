// Listet Kenney-Modelle mit Größe und Eckenzahl
import { NodeIO } from '@gltf-transform/core';
import fs from 'fs'; import path from 'path';
const io = new NodeIO();
const root = process.argv[2], kit = process.argv[3];
for (const f of fs.readdirSync(path.join(root, kit)).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(root, kit, f)); let v = 0, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9], tex = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { const a = p.getAttribute('POSITION'); v += a.getCount(); const bmn = a.getMin([]), bmx = a.getMax([]); for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], bmn[i]); mx[i] = Math.max(mx[i], bmx[i]); } if (p.getMaterial() && p.getMaterial().getBaseColorTexture()) tex = 1; }
  console.log(f.replace('.glb', '').padEnd(34), 'v', String(v).padStart(5), 'size', mx.map((x, i) => (x - mn[i]).toFixed(2)).join('x'), 'y0', mn[1].toFixed(2), tex ? 'tex' : '');
}
