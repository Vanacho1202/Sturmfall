// Sturmfall – Einstellungen (Spiel, Steuerung, Tasten, Audio, Grafik, Knöpfe)
const TOUCH0 = matchMedia('(pointer: coarse)').matches || /[?&]touch=1/.test(location.search);
const DEF = {
  v: 3, fullscreen: true, auto: TOUCH0, sens: 1, ads: 0.6, scope: 0.22, invY: false, fov: 72, shake: true, bob: true, dmgNum: true, crouchToggle: true, autoSprint: false,
  vol: { m: 0.8, s: 1, a: 0.6, u: 0.8 }, binds: { ControlLeft: 'ShiftLeft', ShiftLeft: 'ControlLeft', KeyX: 'KeyG', KeyG: 'KeyX' }, hud: {}, pad: {}, kit: false, padSens: 1, hudScale: 1, hudAlpha: 0.85, shad: true,
};
export const ACTIONS = [
  ['KeyW', 'Vorwärts'], ['KeyS', 'Rückwärts'], ['KeyA', 'Links'], ['KeyD', 'Rechts'], ['Space', 'Springen / Gleiter'], ['ControlLeft', 'Ducken / Rutschen'], ['ShiftLeft', 'Sprinten (halten)'],
  ['KeyR', 'Nachladen'], ['KeyE', 'Benutzen / Aufheben'], ['KeyX', 'Gegenstand fallen lassen'], ['KeyQ', 'Wand'], ['KeyF', 'Boden'], ['KeyC', 'Rampe'], ['KeyV', 'Dach'], ['KeyG', 'Wand bearbeiten'],
  ['KeyH', 'Inventar sortieren'], ['KeyM', 'Karte'], ['KeyT', 'Markieren'], ['KeyB', 'Tanzen'], ['Tab', 'Spielerliste'], ['KeyP', 'Einstellungen'],
];
// Controller (PS4/PS5/Xbox per Bluetooth) – Standard wie im Battle-Royale-Gewohnten, unter ⚙ umbelegbar
export const PAD_ACTIONS = [
  ['fire', 'Schießen', 7], ['ads', 'Zielen', 6], ['Space', 'Springen / Gleiter', 0], ['ControlLeft', 'Ducken / Rutschen', 1], ['KeyR', 'Nachladen', 2],
  ['KeyE', 'Benutzen / Aufheben', 3], ['prev', 'Vorheriger Slot', 4], ['next', 'Nächster Slot', 5], ['ShiftLeft', 'Sprinten (halten)', 10], ['KeyX', 'Wand bearbeiten', 11],
  ['KeyQ', 'Wand', 12], ['KeyF', 'Boden', 13], ['KeyC', 'Rampe', 14], ['KeyV', 'Dach', 15], ['KeyM', 'Karte', 8], ['KeyP', 'Einstellungen', 9], ['KeyH', 'Inventar', 17], ['KeyG', 'Fallen lassen', -1],
];
export const PAD_NAMES = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'Share', 'Options', 'L3', 'R3', '↑', '↓', '←', '→', 'PS', 'Touchpad'];
export const padSeen = () => { try { return [...(navigator.getGamepads ? navigator.getGamepads() : [])].some(Boolean); } catch (e) { return false; } };
export const padBtn = (a) => { const v = CFG.pad[a]; return v != null ? v : PAD_ACTIONS.find((x) => x[0] === a)[2]; };
export const CFG = JSON.parse(JSON.stringify(DEF));
try { const s = JSON.parse(localStorage.getItem('sf_cfg') || '{}'); for (const k in s) if (k in DEF) CFG[k] = typeof DEF[k] === 'object' && !Array.isArray(DEF[k]) ? { ...DEF[k], ...s[k] } : s[k]; } catch (e) {}
// Version 3: G = fallen lassen, X = Wand bearbeiten (wenn nicht selbst belegt)
if (CFG.v === 2) { CFG.v = 3; if (!CFG.binds.KeyX && !CFG.binds.KeyG) { CFG.binds.KeyX = 'KeyG'; CFG.binds.KeyG = 'KeyX'; } }
// Umstellung auf Version 2: Shift = Ducken, Strg = Sprinten, kein Auto-Sprint am PC
if (!(CFG.v >= 2)) { CFG.v = 3; if (!Object.keys(CFG.binds).length) CFG.binds = { ...DEF.binds }; CFG.autoSprint = false; if (CFG.fullscreen == null) CFG.fullscreen = true; }
try { const o = +localStorage.getItem('sf_sens'); if (!localStorage.getItem('sf_cfg') && o >= 0.3 && o <= 3) CFG.sens = o; if (localStorage.getItem('sf_shad') === '0') CFG.shad = false; } catch (e) {}
export function save() { try { localStorage.setItem('sf_cfg', JSON.stringify(CFG)); } catch (e) {} }

// Tastenbelegung: gedrückte Taste -> Standard-Code der Aktion
let REMAP = {};
function buildRemap() {
  REMAP = {}; const used = new Set();
  for (const [def] of ACTIONS) { const b = CFG.binds[def]; if (b && b !== def) { REMAP[b] = def; used.add(b); } }
  for (const [def] of ACTIONS) { const b = CFG.binds[def]; if (b && b !== def && !used.has(def) && !(def in REMAP)) REMAP[def] = '-'; }
}
buildRemap();
export const remap = (code) => REMAP[code] || code;
const keyName = (c) => !c ? '–' : c.replace(/^Key/, '').replace(/^Digit/, '').replace('ControlLeft', 'Strg').replace('ControlRight', 'Strg R').replace('ShiftLeft', 'Shift').replace('ShiftRight', 'Shift R').replace('Space', 'Leertaste').replace('AltLeft', 'Alt').replace('CapsLock', 'Feststell').replace(/^Arrow/, '↑').replace('Backquote', '^');
export const bindName = (def) => keyName(CFG.binds[def] || def);

let open = false, onApply = () => {}, ctx = {};
export const isOpen = () => open || editing;
const $ = (id) => document.getElementById(id);

const CSS = `
#settings{position:fixed;inset:0;z-index:60;display:none;align-items:center;justify-content:center;background:rgba(4,8,18,.72);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font-family:var(--f);color:#fff}
#settings.on{display:flex}
#settings .sp{width:min(760px,94vw);height:min(560px,90vh);display:flex;flex-direction:column;background:linear-gradient(180deg,rgba(26,36,64,.97),rgba(12,18,34,.97));border:1px solid rgba(255,255,255,.18);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.55);overflow:hidden}
#settings .sh{display:flex;align-items:center;gap:6px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.12);flex-wrap:wrap}
#settings .sh b{font:900 italic 20px var(--f);letter-spacing:1px;margin-right:auto}
#settings .tabs button,#settings .x{font:800 13px var(--f);padding:7px 12px;border-radius:8px;border:none;background:rgba(255,255,255,.08);color:#fff;cursor:pointer}
#settings .tabs button.sel{background:var(--y);color:#111}
#settings .x{background:rgba(255,90,77,.85);font-size:15px}
#settings .sb{flex:1;overflow:auto;padding:10px 18px 18px;-webkit-overflow-scrolling:touch}
#settings .r{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.07);font-weight:600;font-size:14px}
#settings .r span{flex:1}#settings .r small{display:block;opacity:.6;font-weight:500;font-size:11.5px}
#settings .r input[type=range]{width:min(260px,38vw);accent-color:var(--y)}
#settings .r output{min-width:44px;text-align:right;font-variant-numeric:tabular-nums;opacity:.85}
#settings .tg{width:52px;height:28px;border-radius:14px;background:rgba(255,255,255,.18);position:relative;cursor:pointer;flex:none;transition:background .15s}
#settings .tg:after{content:"";position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:left .15s}
#settings .tg.on{background:#3ecf4a}#settings .tg.on:after{left:27px}
#settings .kb{min-width:110px;font:800 13px var(--f);padding:7px 10px;border-radius:8px;border:1px solid rgba(255,255,255,.25);background:rgba(0,0,0,.3);color:#fff;cursor:pointer}
#settings .kb.wait{background:var(--y);color:#111}
#settings .bt{font:800 13px var(--f);padding:8px 14px;border-radius:8px;border:none;background:rgba(255,255,255,.12);color:#fff;cursor:pointer;margin:10px 8px 0 0}
#settings .bt.y{background:var(--y);color:#111}
#gear{position:fixed;z-index:12;top:calc(8px + env(safe-area-inset-top));left:calc(8px + env(safe-area-inset-left));width:38px;height:38px;border-radius:10px;border:1px solid rgba(255,255,255,.3);background:rgba(10,16,30,.5);color:#fff;font-size:20px;line-height:36px;text-align:center;cursor:pointer;display:none;padding:0}
body.ingame #gear{display:block}
body.hudedit #touch{display:block!important;background:rgba(0,0,0,.25);z-index:70}
body.hudedit .tb{display:flex!important;pointer-events:auto;outline:2px dashed rgba(255,216,58,.8);outline-offset:3px}
body.hudedit .tb.esel{outline:3px solid var(--y);background:rgba(255,216,58,.35)}
#hudbar{position:fixed;z-index:71;left:50%;top:12px;transform:translateX(-50%);display:none;gap:8px;align-items:center;background:rgba(12,18,34,.92);padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.2);font:700 13px var(--f);color:#fff}
body.hudedit #hudbar{display:flex}
#hudbar button{font:800 13px var(--f);padding:7px 12px;border-radius:8px;border:none;background:rgba(255,255,255,.14);color:#fff}
#hudbar button.y{background:var(--y);color:#111}
`;

function row(label, sub, ctl) { return `<div class="r"><span>${label}${sub ? `<small>${sub}</small>` : ''}</span>${ctl}</div>`; }
const tg = (k) => `<div class="tg${CFG[k] ? ' on' : ''}" data-tg="${k}"></div>`;
const rg = (k, min, max, step, fmt, sub) => `<input type="range" data-rg="${k}" min="${min}" max="${max}" step="${step}" value="${sub ? CFG[k][sub] : CFG[k]}" ${sub ? `data-sub="${sub}"` : ''}><output data-fmt="${fmt}"></output>`;

const TABS = {
  spiel: () =>
    row('Test-Ausrüstung', 'Jede Runde mit legendärem Sturmgewehr, Jagdgewehr, Sniper, 2 Medkits und voller Munition', tg('kit')) +
    row('Auto-Feuer', 'Schießt automatisch, wenn das Fadenkreuz auf einem Gegner liegt', tg('auto')) +
    row('Auto-Sprint', 'An: immer rennen, Sprint-Taste = gehen. Aus: Sprint-Taste halten', tg('autoSprint')) +
    (ctx.touch ? '' : row('Vollbild beim Spielen', 'Verhindert, dass Strg+W den Tab schließt', tg('fullscreen'))) +
    row('Ducken umschalten', 'Aus: Ducken nur, solange die Taste gedrückt ist', tg('crouchToggle')) +
    row('Schadenszahlen', '', tg('dmgNum')) +
    row('Kamera-Wackeln', 'Bei Treffern, Explosionen und Landungen', tg('shake')) +
    row('Laufbewegung der Kamera', '', tg('bob')),
  steuerung: () =>
    row('Empfindlichkeit', 'Umsehen ohne Zielen', rg('sens', 0.2, 3, 0.05, 'x')) +
    row('Empfindlichkeit beim Zielen', 'Anteil der normalen Empfindlichkeit', rg('ads', 0.2, 1.2, 0.02, '%')) +
    row('Empfindlichkeit im Zielfernrohr', '', rg('scope', 0.08, 0.8, 0.01, '%')) +
    row('Y-Achse umkehren', '', tg('invY')) +
    row('Sichtfeld (FOV)', '', rg('fov', 60, 100, 1, '°')),
  controller: () => row('Controller', 'PS4/PS5/Xbox per Bluetooth verbinden und eine Taste drücken. Linker Stick = Laufen (ganz drücken = Sprinten), rechter Stick = Umsehen', '') + row('Stick-Empfindlichkeit', '', rg('padSens', 0.3, 3, 0.05, 'x')) + PAD_ACTIONS.map(([a, n]) => row(n, '', `<button class="kb" data-pb="${a}">${padBtn(a) < 0 ? '–' : PAD_NAMES[padBtn(a)] || 'B' + padBtn(a)}</button>`)).join('') + `<button class="bt" data-act="resetPad">Standard wiederherstellen</button>`,
  tasten: () => ACTIONS.map(([d, n]) => row(n, '', `<button class="kb" data-kb="${d}">${bindName(d)}</button>`)).join('') + `<button class="bt" data-act="resetKeys">Standard wiederherstellen</button>`,
  audio: () =>
    row('Gesamtlautstärke', '', rg('vol', 0, 1, 0.01, '%', 'm')) +
    row('Effekte', 'Schüsse, Schritte, Bauen, Fahrzeuge', rg('vol', 0, 1.5, 0.01, '%', 's')) +
    row('Umgebung', 'Wind, Vögel, Wasser', rg('vol', 0, 1.5, 0.01, '%', 'a')) +
    row('Oberfläche', 'Treffer, Aufheben, Hinweise', rg('vol', 0, 1.5, 0.01, '%', 'u')),
  grafik: () =>
    row('Qualität', 'Lädt das Spiel neu, wenn du sie änderst', `<span class="seg">${['low', 'med', 'high'].map((q) => `<button data-q="${q}" class="${ctx.quality === q ? 'sel' : ''}">${{ low: 'Niedrig', med: 'Mittel', high: 'Hoch' }[q]}</button>`).join('')}</span>`) +
    row('Schatten', '', tg('shad')),
  knoepfe: () =>
    row('Knopfgröße', 'Alle Touch-Knöpfe', rg('hudScale', 0.6, 1.6, 0.05, '%')) +
    row('Deckkraft', '', rg('hudAlpha', 0.2, 1, 0.05, '%')) +
    `<button class="bt y" data-act="editHud">Knöpfe verschieben</button><button class="bt" data-act="resetHud">Standard-Layout</button>`,
};
const TABN = { spiel: 'Spiel', steuerung: 'Maus & Touch', tasten: 'Tasten', controller: 'Controller', audio: 'Audio', grafik: 'Grafik', knoepfe: 'Knöpfe' };
let tab = 'spiel', waitKey = null;

export function initSettings(o) {
  ctx = o; onApply = o.onApply;
  const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  const d = document.createElement('div'); d.id = 'settings'; d.innerHTML = '<div class="sp"><div class="sh"><b>EINSTELLUNGEN</b><span class="tabs"></span><button class="x">✕</button></div><div class="sb"></div></div>'; document.body.appendChild(d);
  const g = document.createElement('button'); g.id = 'gear'; g.textContent = '⚙'; document.body.appendChild(g);
  const hb = document.createElement('div'); hb.id = 'hudbar'; hb.innerHTML = '<span id="hbSel">Knopf antippen &amp; ziehen</span><button data-h="-">−</button><button data-h="+">+</button><button data-h="r">Zurücksetzen</button><button class="y" data-h="ok">Fertig</button>'; document.body.appendChild(hb);
  for (const ev of ['pointerdown', 'touchstart', 'mousedown']) g.addEventListener(ev, (e) => e.stopPropagation(), true);
  g.addEventListener('click', (e) => { e.stopPropagation(); openSettings(); });
  d.querySelector('.x').onclick = closeSettings;
  d.addEventListener('pointerdown', (e) => e.stopPropagation()); d.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  d.addEventListener('click', (e) => { if (e.target === d) closeSettings(); });
  window.addEventListener('keydown', (e) => {
    if (waitKey) { e.preventDefault(); e.stopImmediatePropagation(); if (e.code !== 'Escape') setBind(waitKey, e.code); waitKey = null; render(); return; }
    if (open && (e.code === 'Escape' || remap(e.code) === 'KeyP')) { e.preventDefault(); e.stopImmediatePropagation(); closeSettings(); return; }
    if (open) { e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('keyup', (e) => { if (open) e.stopImmediatePropagation(); }, true);
  hudEditor(hb);
  applyHud(); onApply(CFG);
}
function setBind(def, code) {
  const cur = CFG.binds[def] || def;
  for (const [d2] of ACTIONS) if (d2 !== def && (CFG.binds[d2] || d2) === code) CFG.binds[d2] = cur; // Tausch bei Doppelbelegung
  CFG.binds[def] = code;
  for (const k in CFG.binds) if (CFG.binds[k] === k) delete CFG.binds[k];
  buildRemap(); save(); ctx.sfx && ctx.sfx.ui('click');
}
function render() {
  const d = $('settings'), tabs = d.querySelector('.tabs');
  const list = Object.keys(TABS).filter((k) => !(k === 'tasten' && ctx.touch && !padSeen()) && !(k === 'knoepfe' && !ctx.touch));
  tabs.innerHTML = list.map((k) => `<button data-tab="${k}" class="${k === tab ? 'sel' : ''}">${TABN[k]}</button>`).join('');
  tabs.querySelectorAll('[data-tab]').forEach((b) => (b.onclick = () => { tab = b.dataset.tab; render(); ctx.sfx && ctx.sfx.ui('click'); }));
  const sb = d.querySelector('.sb'); sb.innerHTML = TABS[tab]();
  sb.querySelectorAll('[data-tg]').forEach((t) => (t.onclick = () => { const k = t.dataset.tg; CFG[k] = !CFG[k]; t.classList.toggle('on', CFG[k]); changed(); }));
  sb.querySelectorAll('[data-rg]').forEach((r) => {
    const out = r.nextElementSibling, k = r.dataset.rg, sub = r.dataset.sub, show = () => { const v = +r.value, f = out.dataset.fmt; out.textContent = f === '%' ? Math.round(v * 100) + '%' : f === '°' ? v + '°' : v.toFixed(2) + '×'; };
    show(); r.oninput = () => { if (sub) CFG[k][sub] = +r.value; else CFG[k] = +r.value; show(); changed(); };
  });
  sb.querySelectorAll('[data-kb]').forEach((b) => (b.onclick = () => { waitKey = b.dataset.kb; b.classList.add('wait'); b.textContent = 'Taste drücken …'; }));
  sb.querySelectorAll('[data-pb]').forEach((b) => (b.onclick = () => {
    b.classList.add('wait'); b.textContent = 'Controller-Taste …'; const a = b.dataset.pb, t0 = performance.now();
    const held = new Set(); for (const g of navigator.getGamepads ? navigator.getGamepads() : []) if (g) g.buttons.forEach((x, i) => x.pressed && held.add(i));
    const iv = setInterval(() => {
      if (!open || performance.now() - t0 > 8000) { clearInterval(iv); render(); return; }
      for (const g of navigator.getGamepads()) if (g) for (let i = 0; i < g.buttons.length; i++) {
        if (!g.buttons[i].pressed) { held.delete(i); continue; } if (held.has(i)) continue;
        clearInterval(iv); for (const [a2] of PAD_ACTIONS) if (a2 !== a && padBtn(a2) === i) CFG.pad[a2] = padBtn(a); CFG.pad[a] = i; save(); render(); return;
      }
    }, 50);
  }));
  sb.querySelectorAll('[data-q]').forEach((b) => (b.onclick = () => ctx.setQuality(b.dataset.q)));
  sb.querySelectorAll('[data-act]').forEach((b) => (b.onclick = () => {
    const a = b.dataset.act;
    if (a === 'resetPad') { CFG.pad = {}; render(); }
    if (a === 'resetKeys') { CFG.binds = { ...DEF.binds }; buildRemap(); render(); }
    if (a === 'resetHud') { CFG.hud = {}; CFG.hudScale = 1; CFG.hudAlpha = 0.85; render(); }
    if (a === 'editHud') { closeSettings(); startHudEdit(); }
    changed();
  }));
}
function changed() { save(); applyHud(); onApply(CFG); }
export function openSettings() { if (open) return; open = true; render(); $('settings').classList.add('on'); ctx.onOpen && ctx.onOpen(); ctx.sfx && ctx.sfx.ui('click'); }
export function closeSettings() { if (!open) return; open = false; waitKey = null; $('settings').classList.remove('on'); ctx.onClose && ctx.onClose(); ctx.sfx && ctx.sfx.ui('click'); }

// ---------- Touch-Knöpfe verschieben
const HB = ['bFire', 'bFire2', 'bJump', 'bAds', 'bRel', 'bCrouch', 'bEmote', 'bEdit', 'bDrop', 'bInv'];
const base = {};
export function applyHud() {
  for (const id of HB) {
    const el = $(id); if (!el) continue;
    if (!base[id]) { const cs = getComputedStyle(el); base[id] = { w: parseFloat(cs.width) || 56, f: parseFloat(cs.fontSize) || 11 }; }
    const h = CFG.hud[id] || {}, s = (h.s || 1) * CFG.hudScale, w = base[id].w * s;
    el.style.width = el.style.height = w + 'px'; el.style.fontSize = base[id].f * Math.sqrt(s) + 'px'; el.style.opacity = CFG.hudAlpha;
    if (h.x != null) { el.style.left = `calc(${(h.x * 100).toFixed(2)}vw - ${w / 2}px)`; el.style.top = `calc(${(h.y * 100).toFixed(2)}vh - ${w / 2}px)`; el.style.right = el.style.bottom = 'auto'; }
    else { el.style.left = el.style.top = el.style.right = el.style.bottom = ''; }
  }
}
let editing = false, sel = null;
function startHudEdit() { editing = true; document.body.classList.add('hudedit'); sel = null; $('hbSel').textContent = 'Knopf antippen & ziehen'; }
function stopHudEdit() { editing = false; document.body.classList.remove('hudedit'); HB.forEach((id) => $(id) && $(id).classList.remove('esel')); save(); applyHud(); }
function hudEditor(hb) {
  let drag = null;
  window.addEventListener('pointerdown', (e) => {
    if (!editing) return;
    if (hb.contains(e.target)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const el = e.target.closest && e.target.closest('.tb'); if (!el) return;
    HB.forEach((id) => $(id) && $(id).classList.remove('esel')); el.classList.add('esel'); sel = el.id;
    $('hbSel').textContent = el.textContent + ' (' + Math.round(((CFG.hud[sel] || {}).s || 1) * 100) + '%)';
    const r = el.getBoundingClientRect(); drag = { id: el.id, pid: e.pointerId, dx: e.clientX - (r.left + r.width / 2), dy: e.clientY - (r.top + r.height / 2) };
  }, true);
  window.addEventListener('pointermove', (e) => {
    if (!editing || !drag || e.pointerId !== drag.pid) return; e.preventDefault(); e.stopImmediatePropagation();
    const h = CFG.hud[drag.id] || (CFG.hud[drag.id] = {}); h.x = Math.min(0.98, Math.max(0.02, (e.clientX - drag.dx) / innerWidth)); h.y = Math.min(0.98, Math.max(0.02, (e.clientY - drag.dy) / innerHeight)); applyHud();
  }, true);
  window.addEventListener('pointerup', (e) => { if (editing && drag && e.pointerId === drag.pid) { drag = null; save(); } }, true);
  for (const ev of ['touchstart', 'touchmove', 'touchend']) window.addEventListener(ev, (e) => { if (editing && !hb.contains(e.target)) e.stopImmediatePropagation(); }, { capture: true, passive: true });
  hb.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation(); const a = b.dataset.h;
    if (a === 'ok') { stopHudEdit(); return; }
    if (a === 'r') { if (sel) delete CFG.hud[sel]; else CFG.hud = {}; applyHud(); return; }
    if (!sel) return; const h = CFG.hud[sel] || (CFG.hud[sel] = {}); h.s = Math.min(2, Math.max(0.5, (h.s || 1) + (a === '+' ? 0.1 : -0.1)));
    $('hbSel').textContent = $(sel).textContent + ' (' + Math.round(h.s * 100) + '%)'; applyHud();
  }));
}
