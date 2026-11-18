// Baut aus Kenney-Modellen (CC0) eine kompakte Datei für das Spiel:
// alle Farben als Vertex-Farben (aus colormap/Materialfarbe), Maßstab eingebrannt, Positionen als Int16.
import { NodeIO } from '@gltf-transform/core';
import { PNG } from 'pngjs';
import fs from 'fs';
const SRC = process.argv[2] || '/tmp/kn', OUT = new URL('../public/props/', import.meta.url).pathname;
// name: [kit/datei, maßstab, kollision (0 | 'r' rund | 'b' kasten), lp (0 = unzerstörbar), material]
export const CAT = {
  // Einrichtung
  bed: ['furniture-kit/bedDouble', 2.2, 'b', 120, 'wood'], bedS: ['furniture-kit/bedSingle', 2.2, 'b', 100, 'wood'],
  sofa: ['furniture-kit/loungeSofa', 1.9, 'b', 100, 'wood'], sofaL: ['furniture-kit/loungeSofaLong', 1.8, 'b', 120, 'wood'],
  ctable: ['furniture-kit/tableCoffee', 1.8, 'b', 60, 'wood'], table: ['furniture-kit/table', 1.9, 'b', 80, 'wood'], chair: ['furniture-kit/chair', 1.9, 'r', 40, 'wood'],
  fridge: ['furniture-kit/kitchenFridge', 2.1, 'b', 150, 'metal'], stove: ['furniture-kit/kitchenStove', 2.0, 'b', 120, 'metal'], cabinet: ['furniture-kit/kitchenCabinet', 2.0, 'b', 80, 'wood'], sink: ['furniture-kit/kitchenSink', 2.0, 'b', 80, 'metal'],
  books: ['furniture-kit/bookcaseOpen', 2.2, 'b', 80, 'wood'], tv: ['furniture-kit/televisionModern', 1.9, 0, 40, 'metal'], tvcab: ['furniture-kit/cabinetTelevision', 1.9, 'b', 80, 'wood'],
  plant: ['furniture-kit/pottedPlant', 2.2, 'r', 30, 'wood'], lamp: ['furniture-kit/lampRoundFloor', 2.0, 0, 30, 'metal'], desk: ['furniture-kit/desk', 1.9, 'b', 80, 'wood'], deskChair: ['furniture-kit/chairDesk', 1.9, 'r', 40, 'metal'],
  rug: ['furniture-kit/rugRectangle', 1.8, 0, 0, 'wood'], toilet: ['furniture-kit/toilet', 2.2, 'r', 60, 'stone'], tub: ['furniture-kit/bathtub', 2.0, 'b', 100, 'stone'], washer: ['furniture-kit/washer', 2.0, 'b', 100, 'metal'],
  boxes: ['furniture-kit/cardboardBoxClosed', 3, 'r', 30, 'wood'], radio: ['furniture-kit/radio', 2.2, 0, 20, 'metal'], shelf: ['furniture-kit/bookcaseClosedWide', 2.0, 'b', 90, 'wood'],
  // Fahrzeuge (abgestellt)
  sedan: ['car-kit/sedan', 1.75, 'b', 300, 'metal'], taxi: ['car-kit/taxi', 1.7, 'b', 300, 'metal'], police: ['car-kit/police', 1.7, 'b', 300, 'metal'], suv: ['car-kit/suv', 1.8, 'b', 320, 'metal'],
  van: ['car-kit/van', 1.8, 'b', 320, 'metal'], truck: ['car-kit/truck', 1.8, 'b', 350, 'metal'], fire: ['car-kit/firetruck', 1.9, 'b', 400, 'metal'], ambu: ['car-kit/ambulance', 1.8, 'b', 380, 'metal'],
  garbage: ['car-kit/garbage-truck', 1.8, 'b', 400, 'metal'], delivery: ['car-kit/delivery', 1.8, 'b', 380, 'metal'], tractor: ['car-kit/tractor', 1.9, 'b', 300, 'metal'], cone: ['car-kit/cone', 1.4, 0, 10, 'metal'],
  // Stadt
  sky1: ['city-kit-commercial/building-skyscraper-a', 11, 'b', 0, 'stone'], sky2: ['city-kit-commercial/building-skyscraper-b', 11, 'b', 0, 'stone'], sky3: ['city-kit-commercial/building-skyscraper-c', 11, 'b', 0, 'stone'],
  sky4: ['city-kit-commercial/building-skyscraper-d', 10, 'b', 0, 'stone'], sky5: ['city-kit-commercial/building-skyscraper-e', 11, 'b', 0, 'stone'],
  shopA: ['city-kit-commercial/building-a', 10, 'b', 0, 'stone'], shopC: ['city-kit-commercial/building-c', 10, 'b', 0, 'stone'], shopE: ['city-kit-commercial/building-e', 10, 'b', 0, 'stone'], shopH: ['city-kit-commercial/building-h', 10, 'b', 0, 'stone'],
  parasol: ['city-kit-commercial/detail-parasol-a', 8, 0, 30, 'wood'], light: ['city-kit-roads/light-square', 9, 'r', 0, 'metal'], lightC: ['city-kit-roads/light-curved', 9, 'r', 0, 'metal'],
  dumpster: ['city-kit-roads/dumpster', 6, 'b', 200, 'metal'], pole: ['city-kit-roads/electricity-pole', 12, 'r', 0, 'wood'], stop: ['city-kit-roads/road-sign-stop', 6, 'r', 0, 'metal'],
  barrier: ['city-kit-roads/construction-barrier', 7, 'b', 60, 'metal'], ccone: ['city-kit-roads/construction-cone', 7, 0, 10, 'metal'], hydrant: ['city-kit-roads/construction-light', 6, 0, 30, 'metal'],
  // Industrie
  cont1: ['city-kit-industrial/shipping-container-a', 8.5, 'b', 500, 'metal'], cont2: ['city-kit-industrial/shipping-container-b', 8.5, 'b', 500, 'metal'], cont3: ['city-kit-industrial/shipping-container-c', 8.5, 'b', 500, 'metal'],
  tankL: ['city-kit-industrial/detail-tank-large', 5, 'b', 0, 'metal'], tank: ['city-kit-industrial/detail-tank', 6, 'b', 400, 'metal'], chimney: ['city-kit-industrial/chimney-large', 7, 'r', 0, 'stone'],
  wtower: ['city-kit-industrial/water-tower', 7, 'r', 0, 'metal'], windmill: ['city-kit-industrial/windmill', 9, 'r', 0, 'metal'], solar: ['city-kit-industrial/solar-panel-landscape-group', 5, 0, 200, 'metal'],
  hall: ['city-kit-industrial/building-c', 9, 'b', 0, 'metal'], hall2: ['city-kit-industrial/building-q', 9, 'b', 0, 'metal'],
  // Hafen
  dock: ['pirate-kit/structure-platform-dock', 2.2, 's', 0, 'wood'], dockS: ['pirate-kit/structure-platform-dock-small', 2.2, 's', 0, 'wood'], rowboat: ['pirate-kit/boat-row-large', 1.6, 'b', 150, 'wood'],
  ship: ['pirate-kit/ship-medium', 1.5, 'b', 0, 'wood'], pcrate: ['pirate-kit/crate', 1.4, 'b', 80, 'wood'], pbarrel: ['pirate-kit/barrel', 1.1, 'r', 80, 'wood'], palm: ['pirate-kit/palm-detailed-straight', 2.2, 'r', 120, 'wood'],
  palmB: ['pirate-kit/palm-detailed-bend', 2.2, 'r', 120, 'wood'], flag: ['pirate-kit/flag', 2.4, 'r', 60, 'wood'], cannon: ['pirate-kit/cannon', 1.6, 'b', 200, 'metal'],
  wall: ['pirate-kit/castle-wall', 1.6, 'b', 0, 'stone'], gate: ['pirate-kit/castle-gate', 1.6, 0, 0, 'stone'], tower: ['pirate-kit/tower-watch', 2.0, 'b', 0, 'wood'], srocks: ['pirate-kit/rocks-sand-b', 1.2, 'r', 0, 'stone'],
  // Lager
  tent: ['nature-kit/tent_detailedOpen', 4.5, 'b', 80, 'wood'], tentC: ['nature-kit/tent_detailedClosed', 4.5, 'b', 80, 'wood'], camp: ['survival-kit/campfire-pit', 6, 0, 0, 'stone'], bedroll: ['survival-kit/bedroll', 5, 0, 20, 'wood'],
  bench: ['survival-kit/workbench', 5.5, 'b', 80, 'wood'], sign: ['survival-kit/signpost', 5, 'r', 40, 'wood'], sbox: ['survival-kit/box-large', 5, 'b', 60, 'wood'], palisade: ['survival-kit/fence-fortified', 6, 'b', 120, 'wood'],
  logs: ['survival-kit/resource-wood', 6, 0, 30, 'wood'], fishrack: ['survival-kit/campfire-fishing-stand', 5, 0, 30, 'wood'],
  // Hof & Natur
  pumpkin: ['nature-kit/crop_pumpkin', 3, 0, 30, 'wood'], dirt: ['nature-kit/crops_dirtDoubleRow', 4, 0, 0, 'wood'], hfence: ['nature-kit/fence_planks', 4, 0, 40, 'wood'], obelisk: ['nature-kit/statue_obelisk', 4, 'r', 0, 'stone'], column: ['nature-kit/statue_columnDamaged', 4, 'r', 0, 'stone'],
  corn: ['nature-kit/crops_cornStageD', 2.6, 0, 0, 'wood'], wheat: ['nature-kit/crops_wheatStageB', 2.6, 0, 0, 'wood'], fence: ['nature-kit/fence_simple', 4, 0, 40, 'wood'],
  stump: ['nature-kit/stump_round', 3, 'r', 40, 'wood'], log: ['nature-kit/log', 4, 'b', 60, 'wood'], mush: ['nature-kit/mushroom_red', 3, 0, 0, 'wood'], flowers: ['nature-kit/flower_redA', 3, 0, 0, 'wood'],
  flowersY: ['nature-kit/flower_yellowA', 3, 0, 0, 'wood'], flowersP: ['nature-kit/flower_purpleA', 3, 0, 0, 'wood'], lily: ['nature-kit/lily_large', 4, 0, 0, 'wood'], cactus: ['nature-kit/cactus_tall', 4, 'r', 60, 'wood'],
  bush2: ['nature-kit/plant_bushLarge', 3, 0, 0, 'wood'], rockT: ['nature-kit/rock_tallA', 4, 'r', 0, 'stone'], rockL: ['nature-kit/rock_largeA', 5, 'b', 0, 'stone'],
  gfence: ['city-kit-suburban/fence-1x3', 4, 0, 40, 'wood'], planter: ['city-kit-suburban/planter', 5, 'b', 40, 'wood'], path: ['city-kit-suburban/path-stones-long', 7, 0, 0, 'stone'],
};
const io = new NodeIO(); const texCache = {};
function tex(kit) {
  if (texCache[kit] !== undefined) return texCache[kit];
  const p = `${SRC}/${kit}/Textures/colormap.png`; texCache[kit] = fs.existsSync(p) ? PNG.sync.read(fs.readFileSync(p)) : null; return texCache[kit];
}
const lin2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
function mul(a, b) { const o = new Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
const models = [], parts = [];
for (const [name, [file, sc, coll, hp, mat]] of Object.entries(CAT)) {
  const kit = file.split('/')[0], path = `${SRC}/${file}.glb`;
  if (!fs.existsSync(path)) { console.log('FEHLT', name, file); continue; }
  const doc = await io.read(path), img = tex(kit);
  const P = [], N = [], Cc = [], I = [];
  const visit = (node, M) => {
    const L = node.getMatrix(), W = mul(M, L), mesh = node.getMesh();
    if (mesh) for (const pr of mesh.listPrimitives()) {
      const pos = pr.getAttribute('POSITION'), nor = pr.getAttribute('NORMAL'), uv = pr.getAttribute('TEXCOORD_0'), ind = pr.getIndices(), m = pr.getMaterial();
      const f = m ? m.getBaseColorFactor() : [1, 1, 1, 1], useTex = img && m && m.getBaseColorTexture() && uv, base = P.length / 3;
      const v = [0, 0, 0], n = [0, 0, 0], t = [0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v); nor ? nor.getElement(i, n) : (n[0] = 0, n[1] = 1, n[2] = 0);
        P.push((W[0] * v[0] + W[4] * v[1] + W[8] * v[2] + W[12]) * sc, (W[1] * v[0] + W[5] * v[1] + W[9] * v[2] + W[13]) * sc, (W[2] * v[0] + W[6] * v[1] + W[10] * v[2] + W[14]) * sc);
        const nx = W[0] * n[0] + W[4] * n[1] + W[8] * n[2], ny = W[1] * n[0] + W[5] * n[1] + W[9] * n[2], nz = W[2] * n[0] + W[6] * n[1] + W[10] * n[2], nl = Math.hypot(nx, ny, nz) || 1;
        N.push(nx / nl, ny / nl, nz / nl);
        let r = lin2s(f[0]), g = lin2s(f[1]), b = lin2s(f[2]);
        if (useTex) { uv.getElement(i, t); const px = Math.min(img.width - 1, Math.max(0, Math.floor((t[0] - Math.floor(t[0])) * img.width))), py = Math.min(img.height - 1, Math.max(0, Math.floor((t[1] - Math.floor(t[1])) * img.height))), o = (py * img.width + px) * 4; r *= img.data[o] / 255; g *= img.data[o + 1] / 255; b *= img.data[o + 2] / 255; }
        Cc.push(r, g, b);
      }
      if (ind) for (let i = 0; i < ind.getCount(); i++) I.push(base + ind.getScalar(i)); else for (let i = 0; i < pos.getCount(); i++) I.push(base + i);
    }
    for (const c of node.listChildren()) visit(c, W);
  };
  const ID = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const sc0 of doc.getRoot().listScenes()) for (const nd of sc0.listChildren()) visit(nd, ID);
  // Boden auf y = 0, Mitte auf x/z = 0 (Kenney-Modelle stehen meist schon so)
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], P[i + k]); mx[k] = Math.max(mx[k], P[i + k]); }
  const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, y0 = mn[1];
  for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= y0; P[i + 2] -= cz; }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]], q = Math.max(...size) / 2 / 32000 || 1e-4;
  // Doppelte Ecken zusammenführen spart Platz
  const key = new Map(), P2 = [], N2 = [], C2 = [], remap = [];
  for (let i = 0; i < P.length / 3; i++) {
    const k = [0, 1, 2].map((j) => Math.round(P[i * 3 + j] / q)).join(',') + '|' + [0, 1, 2].map((j) => Math.round(N[i * 3 + j] * 100)).join(',') + '|' + [0, 1, 2].map((j) => Math.round(Cc[i * 3 + j] * 255)).join(',');
    let id = key.get(k); if (id === undefined) { id = P2.length / 3; key.set(k, id); P2.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); N2.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); C2.push(Cc[i * 3], Cc[i * 3 + 1], Cc[i * 3 + 2]); }
    remap.push(id);
  }
  const vc = P2.length / 3, pb = Buffer.alloc(vc * 6), nb = Buffer.alloc(vc * 3), cb = Buffer.alloc(vc * 3), ib = Buffer.alloc(I.length * (vc > 65535 ? 4 : 2));
  for (let i = 0; i < vc; i++) {
    pb.writeInt16LE(Math.round((P2[i * 3]) / q), i * 6); pb.writeInt16LE(Math.round((P2[i * 3 + 1] - size[1] / 2) / q), i * 6 + 2); pb.writeInt16LE(Math.round(P2[i * 3 + 2] / q), i * 6 + 4);
    for (let k = 0; k < 3; k++) { nb.writeInt8(Math.round(N2[i * 3 + k] * 127), i * 3 + k); cb.writeUInt8(Math.min(255, Math.round(C2[i * 3 + k] * 255)), i * 3 + k); }
  }
  I.forEach((v, i) => (vc > 65535 ? ib.writeUInt32LE(remap[v], i * 4) : ib.writeUInt16LE(remap[v], i * 2)));
  models.push({ n: name, v: vc, i: I.length, q, oy: size[1] / 2, s: size.map((x) => +x.toFixed(2)), c: coll, hp, m: mat, i32: vc > 65535 ? 1 : 0 });
  parts.push(pb, nb, cb, ib);
}
let off = 0; const bufs = [];
for (let i = 0; i < models.length; i++) {
  const m = models[i];
  for (const [k, b] of [['po', parts[i * 4]], ['no', parts[i * 4 + 1]], ['co', parts[i * 4 + 2]], ['io', parts[i * 4 + 3]]]) { const pad = (4 - (off % 4)) % 4; if (pad) { bufs.push(Buffer.alloc(pad)); off += pad; } m[k] = off; bufs.push(b); off += b.length; }
}
fs.writeFileSync(OUT + 'props.bin', Buffer.concat(bufs));
fs.writeFileSync(OUT + 'props.json', JSON.stringify(models));
console.log('Modelle', models.length, 'Bytes', off, 'Ecken', models.reduce((a, m) => a + m.v, 0));
