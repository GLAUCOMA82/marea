// Marea panel core: connection, parameter store, and the knob / fader / button widgets.
// The same page runs in the plugin window, the standalone app and Safari on the iPad.
'use strict';
const Q = new URLSearchParams(location.search);
const LOCAL = Q.has('local');
function readToken() {
  const m = location.hash.match(/k=([0-9a-f]+)/);
  try {
    if (m) localStorage.setItem('marea.k', m[1]);
    return m ? m[1] : localStorage.getItem('marea.k');
  } catch (e) { return m ? m[1] : null; }
}
const TOKEN = readToken();

// Light or dark, remembered on each device.
let themeCache = {};
function T(name) {
  if (themeCache[name] === undefined) themeCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return themeCache[name];
}
function setTheme(t) {
  document.documentElement.dataset.theme = t;
  themeCache = {};
  try { localStorage.setItem('marea.theme', t); } catch (e) {}
  if (window.onThemeChange) window.onThemeChange();
  if (typeof M !== "undefined" && M.onTheme) M.onTheme.forEach(f => f());
}
try { const t = localStorage.getItem('marea.theme'); if (t) document.documentElement.dataset.theme = t; } catch (e) {}

const M = {
  params: {}, byId: {}, watchers: {}, held: new Set(), ws: null, steps: [], bs: [], cs: [], ps: [], pads: [], chop: null, patNames: [], pattern: 0, queued: -1,
  step: -1, run: 0, bpm: 120, host: '', url: '', delaySec: .25, echoLevel: 0, sirenEnv: 0, activity: new Array(8).fill(0), padAct: new Array(24).fill(0),
  x: [-1, 0, -1, 0, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1], lanes: [], cn: { on: 0, list: [] }, rtt: 0, stepAt: 0,
  onHello: [], onTick: [], onSteps: [], onPads: [], onChop: [],
};
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function send(line) { if (M.ws && M.ws.readyState === 1) M.ws.send(line); }

// --------------- parameters ---------------
const pendingP = new Map();
let flushQueued = false;
function flushParams() {
  flushQueued = false;
  let out = '';
  for (const [id, v] of pendingP) out += `p ${id} ${v.toFixed(4)}\n`;
  pendingP.clear();
  if (out) send(out);
}
function setParam(key, v, now, quiet) {
  const p = M.params[key];
  if (!p) return;
  v = Math.min(1, Math.max(0, v));
  if (p.s > 1) v = Math.round(v * (p.s - 1)) / (p.s - 1);
  p.v = v;
  pendingP.set(p.i, v);
  if (now) flushParams();
  else if (!flushQueued) { flushQueued = true; requestAnimationFrame(flushParams); }
  notify(key);
  if (!quiet) showParam(key);
}
function notify(key) { const w = M.watchers[key]; if (w) for (const f of w) f(M.params[key].v); }
function watch(key, fn) { (M.watchers[key] = M.watchers[key] || []).push(fn); if (M.params[key]) fn(M.params[key].v); }
function pv(key) { return M.params[key] ? M.params[key].v : 0; }

const expMap = (t, a, b) => a * Math.pow(b / a, t);
const SYNC_NAMES = ['1/16', '1/8', '3/16', '1/4', '3/8', '1/2'];
const MODE_NAMES = ['WAIL', 'YELP', 'DIVE', 'RISE', 'ALARM'];
const MIC_FX = ['CLEAN', 'RADIO', 'CRUSH', 'ROBOT', 'SQUEAK', 'GIANT'];
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
function fmtHz(f) { return f >= 1000 ? (f / 1000).toFixed(2) + 'k' : (f >= 10 ? f.toFixed(0) : f.toFixed(1)) + ' Hz'; }
function fmt(key, v) {
  const p = M.params[key];
  if (p && p.s === 2) return v >= .5 ? 'ON' : 'OFF';
  if (key === 'sir.pitch') return fmtHz(expMap(v, 90, 2100));
  if (key === 'sir.rate') return fmtHz(expMap(v, .12, 26));
  if (key === 'sir.depth') return (v * 3.2).toFixed(1) + ' oct';
  if (key === 'sir.tail') { const s = expMap(v, .01, 3.5); return s < 1 ? (s * 1000).toFixed(0) + ' ms' : s.toFixed(1) + ' s'; }
  if (key === 'sir.mode') return MODE_NAMES[Math.round(v * 4)];
  if (key === 'ech.time') return pv('ech.sync') >= .5 ? SYNC_NAMES[Math.min(5, Math.floor(v * 5.999))] : (expMap(v, .03, 1.8) * 1000).toFixed(0) + ' ms';
  if (key === 'seq.bpm') return (60 + v * 120).toFixed(0);
  if (key === 'rec.fx' || key === 'mic.fx') return MIC_FX[Math.round(v * 5)];
  if (key === 'bas.voice') return BASS_VOICES[Math.round(v * 6)];
  if (/\.key$/.test(key)) { const st = Math.round((v - .5) * 48); return NOTE_NAMES[(st % 12 + 12) % 12] + (st ? (st > 0 ? ' +' : ' ') + st : ''); }
  if (key === 'seq.vary') return Math.round(v * 100) + '%';
  if (key === 'mst.sweep') {
    if (v > .48 && v < .52) return 'OPEN';
    return v < .5 ? 'LP ' + fmtHz(expMap(v / .48, 140, 20000)) : 'HP ' + fmtHz(expMap((v - .52) / .48, 20, 5200));
  }
  if (key === 'bas.cutoff') return fmtHz(38 * Math.pow(2, v * 7.2));
  if (key === 'bas.decay') return (expMap(v, .035, 1.3) * 1000).toFixed(0) + ' ms';
  if (key === 'bas.root') return NOTE_NAMES[Math.round(v * 11)];
  if (/^smp\.\d+\.pitch$|^cho\.pitch$/.test(key)) { const r = key === 'cho.pitch' ? 24 : 48; const st = Math.round((v - .5) * r); return (st > 0 ? '+' : '') + st + ' st'; }
  if (/^smp\.\d+\.decay$/.test(key)) return v >= .99 ? 'FULL' : expMap(v, .03, 6).toFixed(2) + ' s';
  return String(Math.round(v * 100));
}
// The display shows what you just touched for a moment. Only knobs and faders report here.
function showParam(key) { if (M.params[key] && M.params[key].s !== 2) M.touched = { key, t: performance.now() }; }
function showToast(text, ms) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text; t.hidden = false;
  clearTimeout(t._t);
  t._t = setTimeout(() => { t.hidden = true; }, ms || 3500);
}

// --------------- widgets ---------------
function hoverShow(node, key) { node.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') showParam(key); }); }
function dragValue(node, key, sens, onlyX) {
  let lastTap = 0;
  node.addEventListener('pointerdown', e => {
    e.preventDefault();
    const k = typeof key === 'function' ? key() : key;
    const p = M.params[k];
    if (!p) return;
    const now = performance.now();
    if (now - lastTap < 300) { setParam(k, p.d, true); lastTap = 0; return; }  // double tap = back to default
    lastTap = now;
    node.setPointerCapture(e.pointerId);
    let lastX = e.clientX, lastY = e.clientY, val = p.v;
    M.held.add(k);
    send(`pb ${p.i}`);
    showParam(k);
    node.classList.add('lit');
    const move = ev => {
      if (ev.pointerId !== e.pointerId) return;
      const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
      lastX = ev.clientX; lastY = ev.clientY;
      const scale = (ev.shiftKey ? .2 : 1) * sens;
      val = Math.min(1, Math.max(0, val + (onlyX ? dx : dx * .5 - dy) * scale));
      setParam(k, val);
    };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
      M.held.delete(k);
      send(`pe ${p.i}`);
      node.classList.remove('lit');
    };
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', up);
    node.addEventListener('pointercancel', up);
  });
  node.addEventListener('wheel', e => { e.preventDefault(); const k = typeof key === 'function' ? key() : key; setParam(k, pv(k) - e.deltaY * .0016); }, { passive: false });
}
function Knob(key, label, opts) {
  opts = opts || {};
  const k = el('div', 'knob');
  if (opts.size) k.style.setProperty('--s', opts.size + 'px');
  if (opts.color) k.style.setProperty('--c', opts.color);
  k.innerHTML = `<div class="kwrap"><div class="kring"></div><div class="kptr"></div></div>` + (label ? `<div class="klabel">${label}</div>` : '');
  k.tabIndex = 0;
  k.setAttribute('role', 'slider');
  k.setAttribute('aria-label', label || key);
  dragValue(k, key, opts.sens || 1 / 170);
  hoverShow(k, key);
  k.addEventListener('keydown', e => {
    const d = { ArrowUp: .02, ArrowRight: .02, ArrowDown: -.02, ArrowLeft: -.02 }[e.key];
    if (d) { e.preventDefault(); setParam(key, pv(key) + d); }
  });
  watch(key, v => { k.style.setProperty('--v', v); k.setAttribute('aria-valuetext', fmt(key, v)); });
  return k;
}
function press(node, fn) {
  node.addEventListener('pointerdown', e => { e.preventDefault(); fn(e); });
  node.addEventListener('contextmenu', e => e.preventDefault());
  return node;
}
function Toggle(key, label, cls) {
  const b = el('button', cls, label);
  press(b, () => setParam(key, pv(key) >= .5 ? 0 : 1, true, true));
  b.setAttribute('aria-label', (M.params[key] && M.params[key].n) || key);
  watch(key, v => { b.classList.toggle('on', v >= .5); b.setAttribute('aria-pressed', v >= .5); });
  return b;
}
// Press and hold: on while your finger is down. Works with several fingers at once.
function Momentary(key, label, cls) {
  const b = el('button', cls, label);
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    b.setPointerCapture(e.pointerId);
    M.held.add(key);
    setParam(key, 1, true, true);
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      b.removeEventListener('pointerup', up);
      b.removeEventListener('pointercancel', up);
      M.held.delete(key);
      setParam(key, 0, true, true);
    };
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
  });
  watch(key, v => b.classList.toggle('on', v >= .5));
  b.addEventListener('contextmenu', e => e.preventDefault());
  return b;
}
function Radio(key, count, make) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    const b = make(i);
    press(b, () => setParam(key, i / (count - 1), true));
    nodes.push(b);
  }
  watch(key, v => { const idx = Math.round(v * (count - 1)); nodes.forEach((n, i) => n.classList.toggle('on', i === idx)); });
  return nodes;
}
function PlayButton() {
  const b = el('button', 'play', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3.5v17l15-8.5z"/></svg>');
  b.setAttribute('aria-label', 'Play or stop');
  press(b, () => send('play'));
  M.onTick.push(() => { b.classList.toggle('on', M.run === 1); b.classList.toggle('linked', M.run === 2); });
  return b;
}
function PatternButtons() {
  const wrap = el('div', 'patterns');
  const btns = [];
  for (let i = 0; i < 8; i++) {
    const b = el('button', 'patbtn', 'ABCDEFGH'[i]);
    b.setAttribute('aria-label', 'Pattern ' + 'ABCDEFGH'[i]);
    press(b, () => { if (!M.chainEdit) send("pat " + i); });
    wrap.append(b); btns.push(b);
  }
  M.onTick.push(() => btns.forEach((b, i) => {
    b.classList.toggle('on', i === M.pattern);
    b.classList.toggle('queued', i === M.queued && i !== M.pattern);
  }));
  return wrap;
}
function fitCanvas(c) {
  const dpr = window.devicePixelRatio || 2;
  const W = Math.max(10, Math.round(c.clientWidth * dpr)), H = Math.max(10, Math.round(c.clientHeight * dpr));
  if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
  return [W, H, dpr];
}
function drawWave(canvas, wave, color) {
  const [W, H] = fitCanvas(canvas);
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, W, H);
  if (!wave || !wave.length) return;
  c.fillStyle = color;
  const mid = H * .6, amp = H * .34, bw = W / wave.length;
  for (let i = 0; i < wave.length; i++) {
    const h = Math.max(1, wave[i] / 99 * amp);
    c.fillRect(i * bw, mid - h, Math.max(1, bw * .55), h * 2);
  }
}

// --------------- connection ---------------
let reconnect = 0;
function connect() {
  const off = document.getElementById('offline');
  if (!TOKEN) {
    document.getElementById('offTitle').textContent = 'SCAN THE CODE AGAIN';
    document.getElementById('offText').textContent = 'This page is missing its access code. On the Mac, press iPAD on the Marea panel and scan the QR code.';
    off.hidden = false;
    return;
  }
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${scheme}://${location.host}/ws?k=${TOKEN}`);
  M.ws = ws;
  ws.onopen = () => { reconnect = 0; };
  ws.onclose = () => {
    M.ws = null;
    off.hidden = false;
    setTimeout(connect, Math.min(2000, 300 + reconnect++ * 300));
  };
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.hello) { hello(m); off.hidden = true; return; }
    if (m.pong) { M.rtt = performance.now() - m.pong; return; }
    tick(m);
  };
}
setInterval(() => send('ping ' + performance.now().toFixed(1)), 2000);
let built = false;
function hello(m) {
  M.host = m.host; M.store = !!m.store; M.url = m.url; M.patNames = m.patNames;
  for (const p of m.params) { M.params[p.k] = p; M.byId[p.i] = p; }
  M.steps = m.steps; M.bs = m.bs; M.cs = m.cs; M.ps = m.ps;
  M.pads = m.pads; M.chop = m.chop; M.lanes = m.lanes; M.cn = m.cn;
  if (!built) { built = true; window.buildPanel(); }
  for (const k in M.params) notify(k);
  M.onSteps.forEach(f => f());
  M.onPads.forEach(f => f());
  M.onChop.forEach(f => f());
  M.onHello.forEach(f => f());
}
function tick(m) {
  const t = m.t;
  const oldStep = M.step, oldPat = M.pattern;
  M.step = t[0]; M.pattern = t[1]; M.queued = t[2]; M.run = t[3]; M.bpm = t[4];
  M.levels = [t[5], t[6]]; M.echoLevel = t[7]; M.sirenEnv = t[8]; M.delaySec = t[9];
  M.activity = m.a; M.padAct = m.b; M.scope = m.o; M.x = m.x;
  if (oldStep !== M.step) M.stepAt = performance.now();
  if (m.p) for (const [id, v] of m.p) {
    const p = M.byId[id];
    if (!p || M.held.has(p.k)) continue;
    if (pendingP.has(id)) continue;
    p.v = v;
    notify(p.k);
  }
  let stepsDirty = oldPat !== M.pattern;
  if (m.s) { for (const [a, tr, v] of m.s) M.steps[a * 8 + tr] = v >>> 0; stepsDirty = true; }
  if (m.bs) { for (const [a, st, v] of m.bs) M.bs[a * 16 + st] = v >>> 0; stepsDirty = true; }
  if (m.cs) { for (const [a, st, v] of m.cs) M.cs[a * 16 + st] = v >>> 0; stepsDirty = true; }
  if (m.ps) { for (const [a, i, v] of m.ps) M.ps[a * 24 + i] = v >>> 0; stepsDirty = true; }
  if (stepsDirty) M.onSteps.forEach(f => f());
  if (m.pads) { M.pads = m.pads; M.onPads.forEach(f => f()); }
  if (m.chop !== undefined) { M.chop = m.chop; M.onChop.forEach(f => f()); }
  if (m.lanes) { M.lanes = m.lanes; (M.onLanes || []).forEach(f => f()); }
  if (m.cn) { M.cn = m.cn; (M.onChain || []).forEach(f => f()); }
  if (m.takeDone) showToast('Saved ' + m.takeDone + ' in the Takes folder', 6000);
  if (m.recErr) showToast(m.recErr, 6000);
  M.onTick.forEach(f => f());
}
window.addEventListener('load', connect);
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
