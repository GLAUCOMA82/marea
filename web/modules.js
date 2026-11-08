// The panels. To add a module, write a function that returns a page and add it to M.pages in buildPanel().
'use strict';
// Flat colour pictograms drawn for Marea on a 24-unit grid. An icon is a list of [path, colour] layers;
// 'ink' follows the theme's text colour, the rest are fixed signal colours. fill-rule evenodd cuts holes.
const IC = { R: '#e8401c', P: '#c4468e', B: '#4a8ec4', O: '#f2622e', T: '#e6a96b', W: '#f6f4ee', G: '#8b8b94', ink: 'currentColor' };
const pic = layers => `<svg viewBox="0 0 24 24" aria-hidden="true">${(typeof layers === 'string' ? [[layers, 'ink']] : layers).map(([d, c]) => `<path fill-rule="evenodd" fill="${IC[c] || c}" d="${d}"/>`).join('')}</svg>`;
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0z`;
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h${-w}z`;
const ICONS = {
  // bass drum from the front: blue shell, light head, red beater spot
  kick: [[circle(12, 12, 11) + circle(12, 12, 7.5), 'B'], [circle(12, 12, 7.5), 'ink'], [circle(12, 12, 2.6), 'R']],
  // snare: red rim on a light shell, two orange sticks
  snare: [[rect(3, 12, 18, 9), 'ink'], [rect(2, 9, 20, 3.5), 'R'], ['M3.5 1.5l1.4-1.4 9 8-1.4 1.4z', 'O'], ['M20.5 1.5l-1.4-1.4-9 8 1.4 1.4z', 'O']],
  // rim: a quarter of a drum edge and a stick laid across it
  rim: [['M2 22A20 20 0 0 1 22 2v4A16 16 0 0 0 6 22z', 'B'], ['M7 9l1.6-1.6 12 12L19 21z', 'O'], [circle(19.5, 19.5, 2.2), 'R']],
  // clap: two pink palms with a red spark
  clap: [['M4 22l-2-10 3-1 2 5 0-12 3 0 1 9 1 9z', 'P'], ['M20 22l2-10-3-1-2 5 0-12-3 0-1 9-1 9z', 'ink'], [rect(11, 0, 2, 4), 'R'], ['M5 2l1.6-1.2 2.6 3.4-1.6 1.2z', 'R'], ['M19 2l-1.6-1.2-2.6 3.4 1.6 1.2z', 'R']],
  // closed hat: two cymbals pressed together on a blue stand
  hat: [[rect(11, 10, 2, 13) + rect(6, 21, 12, 2), 'B'], ['M1 7c4-3 18-3 22 0z', 'O'], ['M1 8h22c-4 2.5-18 2.5-22 0z', 'ink']],
  // open hat: the top cymbal lifted
  open: [[rect(11, 3, 2, 20) + rect(6, 21, 12, 2), 'B'], ['M1 5c4-4 18-4 22 0z', 'O'], ['M1 12h22c-4 3-18 3-22 0z', 'ink']],
  // tom: blue body, light top, red lugs
  tom: [[rect(3, 8, 18, 13), 'B'], ['M3 8c0-3.5 18-3.5 18 0s-18 3.5-18 0z', 'ink'], [rect(5, 13, 2, 5) + rect(11, 13, 2, 5) + rect(17, 13, 2, 5), 'R']],
  // cowbell: tan bell, red clapper
  bell: [['M7 2h10l5 18H2z', 'T'], [rect(9, 4, 6, 2) + rect(9, 8, 6, 1.6) + rect(9, 11, 6, 1.6), 'W'], [circle(12, 21.5, 2.2), 'R']],
  // bass: a sound system, two speaker cabinets side by side
  bass: [[rect(1, 2, 10, 21) + rect(13, 2, 10, 21), 'G'], [circle(6, 15, 4) + circle(18, 15, 4), 'W'], [circle(6, 15, 1.8) + circle(18, 15, 1.8), 'B'], [circle(6, 6, 1.8) + circle(18, 6, 1.8), 'R']],
  // chop: red scissors over a dotted cut line
  chop: [[circle(6, 6, 3.6) + circle(6, 6, 1.8) + circle(6, 15, 3.6) + circle(6, 15, 1.8), 'R'], ['M8.8 7.6l13-6.6.8 1.6-12.2 7.6zM8.8 13.4l13 6.6.8-1.6-12.2-7.6z', 'R'], [rect(1, 21, 3, 3) + rect(6, 21, 3, 3) + rect(11, 21, 3, 3) + rect(16, 21, 3, 3) + rect(21, 21, 3, 3), 'ink']],
  // pads: four squares
  pads: [[rect(1, 1, 10, 10), 'R'], [rect(13, 1, 10, 10), 'B'], [rect(1, 13, 10, 10), 'G'], [rect(13, 13, 10, 10), 'ink']],
  // siren: red dome on a light base, orange rays
  siren: [['M5 17v-6a7 7 0 0 1 14 0v6z', 'R'], [rect(3, 18, 18, 4), 'ink'], [rect(11, 0, 2, 3), 'O'], ['M2.4 4l1.4-1.4 2.2 2.2-1.4 1.4zM21.6 4l-1.4-1.4-2.2 2.2 1.4 1.4z', 'O'], [rect(10.5, 9, 3, 5), 'W']],
  // library: two light record sleeves and one pulled out in red
  lib: [[rect(1, 3, 4, 19) + rect(7, 3, 4, 19), 'ink'], ['M13 4l4-1 5 18-4 1z', 'R'], [circle(17.4, 12.5, 1.4), 'W']],
  // pulse: a blue drum with a light head and two red sticks
  grid: [[rect(2, 11, 20, 11), 'B'], [rect(1, 9, 22, 3), 'ink'], [rect(4, 14, 2, 6) + rect(11, 14, 2, 6) + rect(18, 14, 2, 6), 'G'], ['M3 1.4l1.4-1.4 8.6 8-1.4 1.4z', 'R'], ['M21 1.4l-1.4-1.4-8.6 8 1.4 1.4z', 'R']],
  // dub: a blue speaker throwing red echoes
  dub: [['M1 8h5l6-6v20l-6-6H1z', 'B'], ['M15 6.5a8 8 0 0 1 0 11l-1.6-1.6a5.8 5.8 0 0 0 0-7.8z', 'R'], ['M18.6 3a13 13 0 0 1 0 18L17 19.4a10.6 10.6 0 0 0 0-14.8z', 'R']],
  // mic: tan grille, light body, red stand
  mic: [['M7 6a5 5 0 0 1 10 0v4H7z', 'T'], [rect(8.5, 4, 7, 1.2) + rect(8.5, 7, 7, 1.2), 'W'], [rect(8, 10, 8, 5), 'ink'], [rect(11, 15, 2, 5) + rect(6, 20, 12, 3), 'R']],
  // click: a light metronome with a red arm
  click: [['M8 1h8l6 22H2zM9.6 3.4L5 20.6h14L14.4 3.4z', 'ink'], ['M11 18l7.4-15 1.8.9L12.8 19z', 'R'], [circle(12, 18.5, 2.4), 'R']],
  // mix: three faders with coloured caps
  mix: [[rect(3, 1, 2, 22) + rect(11, 1, 2, 22) + rect(19, 1, 2, 22), 'ink'], [rect(0, 13, 8, 5), 'R'], [rect(8, 4, 8, 5), 'B'], [rect(16, 15, 8, 5), 'G']],
};
const Sampler_N = 24;
const TRACKS = [['kick', 'KICK', 'var(--c0)'], ['snare', 'SNARE', 'var(--c1)'], ['rim', 'RIM', 'var(--c2)'], ['clap', 'CLAP', 'var(--c3)'], ['hat', 'HAT', 'var(--c4)'], ['open', 'OPEN', 'var(--c5)'], ['tom', 'TOM', 'var(--c6)'], ['bell', 'BELL', 'var(--c7)']];
const BASS_COLOR = 'var(--salmon)';
const ENC = ['var(--enc-g)', 'var(--enc-b)', 'var(--enc-y)', 'var(--enc-r)'];   // the four encoder colours, the same on every page
const BASS_VOICES = ['ACID', 'SUB', 'REESE', 'FM', 'WOBBLE', 'ORGAN', 'REED'];
const SCALES = [['MINOR', [0, 2, 3, 5, 7, 8, 10]], ['PENTA', [0, 3, 5, 7, 10]], ['DORIAN', [0, 2, 3, 5, 7, 9, 10]], ['PHRYG', [0, 1, 3, 5, 7, 8, 10]], ['MAJOR', [0, 2, 4, 5, 7, 9, 11]], ['CHROM', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]]];
const sliceVar = i => `var(--c${i % 8})`;
const sliceHex = i => T(`--c${i % 8}`);

function setStep(t, s, val) {
  const i = M.pattern * 8 + t;
  let v = M.steps[i] >>> 0;
  v &= ~((1 << s) | (1 << (s + 16)));
  if (val >= 1) v |= 1 << s;
  if (val >= 2) v |= 1 << (s + 16);
  M.steps[i] = v >>> 0;
  send(`s ${M.pattern} ${t} ${s} ${val}`);
  M.onSteps.forEach(f => f());
}
function setBass(s, v) { M.bs[M.pattern * 16 + s] = v >>> 0; send(`b ${M.pattern} ${s} ${v >>> 0}`); M.onSteps.forEach(f => f()); }
function setChop(s, v) { M.cs[M.pattern * 16 + s] = v; send(`cs ${M.pattern} ${s} ${v}`); M.onSteps.forEach(f => f()); }
function gridStep() {
  // Which step a key press belongs to: while running, the nearest one; when stopped, a moving cursor.
  if (M.step >= 0) {
    // You press along with what you hear, so the output's own delay is taken off the press.
    const stepMs = 60000 / M.bpm / 4, into = performance.now() - M.stepAt - (M.x[11] || 0);
    return (((M.step + Math.round(into / stepMs)) % 16) + 16) % 16;
  }
  const s = M.cursor || 0;
  M.cursor = (s + 1) % 16;
  return s;
}

// ================= shared motion: one loop, 30 frames a second, so touches stay first in line =================
const OL = { bg: '#050608', ink: '#eef1f5', dim: '#3d4452', mid: '#7d8696', blue: '#4f8cff', green: '#35e08a', orange: '#ff7a33', red: '#ff3d4a', yellow: '#ffb000', amber: '#ffb000', amberOff: '#1c1404', inkOff: '#16171c', violet: '#b48cff', cyan: '#3cc8ea' };
const OLC = ['#ff3d6a', '#ff7a33', '#ffb000', '#5fe05a', '#2fe0b0', '#3cc8ea', '#6a8cff', '#c98cff'];
M.anim = [];
let animLast = 0;
function animate(now) {
  requestAnimationFrame(animate);
  if (now - animLast < 31) return;
  const dt = Math.min(.1, (now - animLast) / 1000); animLast = now;
  for (const f of M.anim) f(now, dt);
}
requestAnimationFrame(animate);
// Where we are inside the current beat, smooth between ticks. -1 when stopped.
function beatPos(now) {
  if (M.step < 0) return -1;
  const stepMs = 60000 / M.bpm / 4;
  return M.step + Math.min(1, (now - M.stepAt) / stepMs);
}
function oledText(c, s, x, y, size, color, align, weight) {
  c.font = `${weight || 500} ${size}px "Plex Mono","SF Mono",Menlo,monospace`;
  c.textAlign = align || 'left'; c.fillStyle = color; c.fillText(s, x, y);
}
// Tell the iPad's native touch layer where the keys and pads are, so they can fire straight from the touch.
// Draw at a fixed design size, centred and scaled to whatever the screen is. Returns the scale.
function vbox(c, W, H, vw, vh) { const u = Math.min(W / vw, H / vh); c.setTransform(u, 0, 0, u, (W - vw * u) / 2, (H - vh * u) / 2); return u; }
// Dot-matrix numbers for the black screens, 5 dots wide and 7 tall. Unlit dots show faintly when off is given.
const DOTS = { '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111', '3': '11110000010000101110000010000111110', '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110', '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000', '8': '01110100011000101110100011000101110', '9': '01110100011000101111000010001001100', ':': '00000001000010000000001000010000000', '.': '00000000000000000000000000110001100', '/': '00001000010001000100010001000010000', '-': '00000000000000011111000000000000000', '+': '00000001000010011111001000010000000', '%': '11001110010001000100010001001110011', '#': '11111111111111111111111111111111111', ' ': '00000000000000000000000000000000000' };
// Letters, so short labels can be dot matrix too.
Object.assign(DOTS, {'A': '01110100011000111111100011000110001', 'B': '11110100011000111110100011000111110', 'C': '01110100011000010000100001000101110', 'D': '11110100011000110001100011000111110', 'E': '11111100001000011110100001000011111', 'F': '11111100001000011110100001000010000', 'G': '01110100011000010111100011000101111', 'H': '10001100011000111111100011000110001', 'I': '01110001000010000100001000010001110', 'J': '00111000100001000010000101001001100', 'K': '10001100101010011000101001001010001', 'L': '10000100001000010000100001000011111', 'M': '10001110111010110101100011000110001', 'N': '10001100011100110101100111000110001', 'O': '01110100011000110001100011000101110', 'P': '11110100011000111110100001000010000', 'Q': '01110100011000110001101011001001101', 'R': '11110100011000111110101001001010001', 'S': '01111100001000001110000010000111110', 'T': '11111001000010000100001000010000100', 'U': '10001100011000110001100011000101110', 'V': '10001100011000110001100010101000100', 'W': '10001100011000110101101011010101010', 'X': '10001100010101000100010101000110001', 'Y': '10001100010101000100001000010000100', 'Z': '11111000010001000100010001000011111'});
function dots(c, s, x, y, d, col, off, align) {
  const w = s.length * d * 6 - d;
  if (align === 'center') x -= w / 2; else if (align === 'right') x -= w;
  for (const ch of s) {
    const g = DOTS[ch] || DOTS[' '];
    for (let i = 0; i < 35; i++) {
      const on = g[i] === '1';
      if (!on && !off) continue;
      c.fillStyle = on ? col : off; c.fillRect(x + (i % 5) * d, y + Math.floor(i / 5) * d, d * .74, d * .74);
    }
    x += d * 6;
  }
  return w;
}
// A short label in dot matrix that takes the element's own text colour, so it follows .on states and themes.
const dotLabels = [];
function DotLabel(text, d) {
  const cv = el('canvas', 'dotlabel'); cv.setAttribute('aria-hidden', 'true');
  cv.text = text; cv.d = d; cv.col = '';
  dotLabels.push(cv);
  return cv;
}
function drawDotLabel(cv) {
  const col = getComputedStyle(cv).color;
  if (col === cv.col && cv.width) return;
  cv.col = col;
  const s = cv.text, d = cv.d, dpr = Math.min(3, window.devicePixelRatio || 1), w = s.length * d * 6 - d, h = d * 7;
  cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
  const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
  dots(c, s, 0, 0, d, col);
}
// Swap a button's text for its dot-matrix version, keeping the words for screen readers.
function dotify(node, d) { const t = node.textContent.trim().toUpperCase(); if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', t); node.textContent = ''; node.append(DotLabel(t, d)); return node; }
// Dot-matrix number on the instrument body, in a theme colour. set() redraws only when the text changes.
function DotNum(d, colorVar, minChars) {
  const cv = el('canvas', 'dotnum'); cv.setAttribute('aria-hidden', 'true');
  let shown = null;
  const draw = () => {
    const s = shown || '', n = Math.max(minChars || 1, s.length), dpr = Math.min(3, window.devicePixelRatio || 1);
    const w = n * d * 6 - d, h = d * 7;
    cv.style.width = w + 'px'; cv.style.height = h + 'px'; cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = T(colorVar);
    c.globalAlpha = .09; dots(c, '#'.repeat(n), 0, 0, d, col);
    c.globalAlpha = 1; dots(c, s.padStart(n, ' '), 0, 0, d, col);
  };
  cv.set = s => { s = String(s); if (s !== shown) { shown = s; draw(); } };
  M.onTheme = M.onTheme || []; M.onTheme.push(draw);
  return cv;
}
// "432 Hz" -> ["432", "Hz"], "3/16" -> ["3/16", ""]
function splitNum(s) { const m = String(s).match(/^([+\-]?[\d.\/:]+%?)\s*(.*)$/); return m ? [m[1], m[2]] : ['--', String(s)]; }
function zone(node, m, i, vel, pid, pval) { node.dataset.z = [m, i, vel, pid == null ? -1 : pid, pval == null ? 0 : pval].join(' '); scheduleZones(); }
let zoneTimer = 0;
function scheduleZones() {
  if (!(window.webkit && webkit.messageHandlers && webkit.messageHandlers.zones)) return;
  clearTimeout(zoneTimer);
  zoneTimer = setTimeout(() => {
    const out = [];
    document.querySelectorAll('[data-z]').forEach(n => {
      if (!n.offsetParent) return;
      const r = n.getBoundingClientRect(), z = n.dataset.z.split(' ').map(Number);
      out.push([r.left, r.top, r.width, r.height, z[0], z[1], z[2], z[3], z[4]]);
    });
    webkit.messageHandlers.zones.postMessage(out);
  }, 40);
}

// ================= HEADER =================
function Header() {
  const h = el('div'); h.id = 'head';
  h.append(dotify(el('div', 'logo', 'MAREA'), 2.2));
  const pc = el('div', 'playcell'); pc.append(PlayButton(), TakeButton(), MetroButton()); h.append(pc);
  const bpm = el('div', 'bpm', '<div class="n"></div><div class="s"><span>BPM</span><span class="link">LINK</span><span class="rtt"></span></div>');
  h.append(bpm);
  const bpmDots = DotNum(4.4, '--text', 3); bpm.querySelector('.n').append(bpmDots);
  const num = { set textContent(v) { bpmDots.set(v); } }, link = bpm.querySelector('.link'), rtt = bpm.querySelector('.rtt');
  let shown = '';
  M.onTick.push(() => {
    num.textContent = M.bpm.toFixed(0);
    link.classList.toggle('on', M.run === 2);
    const t = M.x[11] > 0 ? `OUT ${M.x[11]} MS` : (!LOCAL && !Q.has('app') ? Math.round(M.rtt) + ' MS' : '');
    if (t !== shown) { shown = t; rtt.textContent = t; rtt.classList.toggle('slow', M.x[11] > 60); }
  });
  rtt.setAttribute('aria-label', 'Delay added by the current audio output');
  const pat = el('div', 'patcell'); pat.append(PatternButtons()); h.append(pat);
  const seq = el('div', 'kcell');
  const tempo = Knob('seq.bpm', 'TEMPO', { size: 40, color: ENC[0] });
  M.onHello.push(() => { tempo.style.display = M.host === 'Live' ? 'none' : ''; });
  seq.append(tempo, Knob('seq.swing', 'SWING', { size: 40, color: ENC[1] }), Knob('seq.vary', 'VARY', { size: 40, color: ENC[2], sens: 1 / 300 }));
  h.append(seq);
  const sc = el('div', 'sceneCell oled'); const cv = el('canvas'); cv.id = 'scene'; cv.setAttribute('aria-label', 'A gorilla drummer and a donkey that react to the music'); sc.append(cv); h.append(sc);
  Scene(cv);
  const mc = el('div', 'kcell');
  mc.append(Knob('mst.sweep', 'SWEEP', { size: 40, color: ENC[3], sens: 1 / 130 }), Knob('mst.drive', 'DRIVE', { size: 40, color: ENC[2] }), Knob('mst.volume', 'VOL', { size: 40, color: ENC[0] }));
  const lad = el('div', 'ladder', '<i></i>'); mc.append(lad);
  h.append(mc);
  M.onTick.push(() => { if (M.levels) lad.firstChild.style.height = Math.min(100, Math.max(M.levels[0], M.levels[1]) * 100) + '%'; });
  const util = el('div', 'utilcol');
  const th = el('button', '', '<span class="themeglyph"></span>');
  th.setAttribute('aria-label', 'Switch between light and dark');
  press(th, () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
  util.append(th);
  if (LOCAL && !Q.has('app')) {
    const ip = el('button', '', 'iPAD');
    ip.setAttribute('aria-label', 'Connect an iPad');
    press(ip, openIPad);
    util.append(ip);
  } else {
    const sv = el('button', '', 'SAVE'); press(sv, openSave); util.append(sv);
  }
  h.append(util);
  return h;
}
function TakeButton() {
  const b = el('button', 'takebtn', '<i></i><span>REC</span>');
  b.setAttribute('aria-label', 'Record everything Marea plays to a file');
  press(b, () => send(M.x[9] ? 'takestop' : 'takestart'));
  const label = b.querySelector('span');
  M.onTick.push(() => {
    const on = !!M.x[9];
    b.classList.toggle('on', on);
    const t = M.x[10] || 0, txt = on ? `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}` : 'REC';
    if (label.textContent !== txt) label.textContent = txt;
  });
  return b;
}
// The metronome: a little machine whose arm really swings with the beat. Tap to hear it.
function MetroButton() {
  const b = el('button', 'metro', '<canvas></canvas>');
  b.setAttribute('aria-label', 'Metronome');
  const cv = b.firstChild;
  press(b, () => setParam('met.on', pv('met.on') >= .5 ? 0 : 1, true, true));
  watch('met.on', v => { b.classList.toggle('on', v >= .5); b.setAttribute('aria-pressed', v >= .5); });
  M.anim.push(now => {
    if (!cv.clientWidth) return;
    const [W, H, dpr] = fitCanvas(cv), c = cv.getContext('2d'), on = pv('met.on') >= .5;
    c.clearRect(0, 0, W, H);
    const bx = W / 2, by = H * .78, top = H * .1;
    c.fillStyle = on ? '#141414' : T('--dim');
    c.beginPath(); c.moveTo(bx - W * .13, top); c.lineTo(bx + W * .13, top); c.lineTo(bx + W * .32, H * .94); c.lineTo(bx - W * .32, H * .94); c.fill();
    const p = beatPos(now);
    // A real pendulum: at one end on each click, crossing the middle between clicks, left then right.
    const a = on && p >= 0 ? Math.cos(p / 4 * Math.PI) * .42 : -.3;
    c.strokeStyle = on ? OL.red : T('--bg'); c.lineWidth = 2 * dpr; c.lineCap = 'round';
    c.beginPath(); c.moveTo(bx, by); c.lineTo(bx + Math.sin(a) * H * .68, by - Math.cos(a) * H * .68); c.stroke();
    c.fillStyle = on ? OL.ink : T('--bg');
    const wy = .48; c.fillRect(bx + Math.sin(a) * H * wy - 3 * dpr, by - Math.cos(a) * H * wy - 2 * dpr, 6 * dpr, 4 * dpr);
  });
  return b;
}

// A little harbour that plays along: an original scene for a machine named after the tide.
// Moon rings = kick. Fish = snare and clap. Stars = hats. Whale = tom. Lighthouse = siren.
// Sea swell = bass and overall level. Ghost boats = echo. Dots on top = the current step.
// The header screen: a gorilla on drums, the pattern grid, and a donkey whose tongue is the siren.
// Drums swing the gorilla's arms, the siren pokes the donkey's tongue out in its own wave shape, and
// when the randomizer changes a step they raise their eyebrows.
function Scene(cv) {
  const PINK = '#ff4f7b', BLUE = '#6f7cff';
  let sirT = 0, gLift = 0, dLift = 0, earFlick = 0, blink = 0, blinkT = 2, lastMutStep = -1, mood = 0;
  const hit = new Array(8).fill(0), prevA = new Array(8).fill(0);
  const tongue = [];
  const shape = (mode, x) => {
    x -= Math.floor(x);
    if (mode === 0) return Math.sin(x * 6.283);
    if (mode === 1) return x < .5 ? x * 4 - 1 : 3 - x * 4;
    if (mode === 2) return 1 - x * 2;
    if (mode === 3) return x * 2 - 1;
    return x < .5 ? 1 : -1;
  };
  function frame(now, dt) {
    if (!cv.clientWidth) return;
    const [W, H, dpr] = fitCanvas(cv), c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    const u = vbox(c, W, H, 300, 110), px = dpr / u;
    c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 1.6 * px;
    const a = M.activity || [];
    for (let i = 0; i < 8; i++) {
      const v = (a[i] || 0) / 99;
      if (v > prevA[i] + .12) { hit[i] = 1; if (i === 1) earFlick = 1; }
      prevA[i] = v;
      hit[i] *= Math.pow(.004, dt);
    }
    // the randomizer changed something on this step: eyebrows up
    if (M.step >= 0 && M.step !== lastMutStep && M.x[7]) {
      lastMutStep = M.step;
      if (M.x[7] & 255) gLift = 1;
      if (M.x[7] & 768) dLift = 1;
    }
    gLift *= Math.pow(.06, dt); dLift *= Math.pow(.06, dt); earFlick *= Math.pow(.01, dt);
    blinkT -= dt; if (blinkT < 0) { blink = 1; blinkT = 2 + Math.random() * 3; } blink *= Math.pow(.0001, dt);
    const beat = M.run ? beatPos(now) : -1, bob = beat >= 0 ? Math.abs(Math.sin(beat / 4 * Math.PI)) * 2 : 0;
    const S = (col, w) => { c.strokeStyle = col; c.lineWidth = (w || 1.6) * px; };
    const P = pts => { c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke(); };
    const E = (x, y, rx, ry, rot, fill) => { c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, 6.2832); if (fill) { c.fillStyle = fill; c.fill(); } c.stroke(); };
    const dot = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 6.2832); c.fill(); };

    // ---------- gorilla ----------
    const gx = 58, gy = 36 + bob;
    // torso and shoulders, behind the kit
    S(PINK); P([[gx - 14, gy + 16], [gx - 27, gy + 25], [gx - 29, gy + 50]]); P([[gx + 14, gy + 16], [gx + 27, gy + 25], [gx + 29, gy + 50]]);
    // arms: each hand swings to the drum it just played, then comes back up
    const lT = hit[4] + hit[5] > hit[1] + hit[2] ? [14, 58] : [24, 72], lA = Math.max(hit[1], hit[2], hit[4], hit[5]);
    const rT = hit[6] > hit[7] ? [88, 70] : [100, 54], rA = Math.max(hit[6], hit[7], hit[3] * .6);
    const arm = (sx, sy, rest, tgt, amt, side) => {
      const hx = rest[0] + (tgt[0] - rest[0]) * amt, hy = rest[1] + (tgt[1] - rest[1]) * amt - (1 - amt) * bob;
      const ex = (sx + hx) / 2 + side * 7, ey = (sy + hy) / 2 + 4;
      S(PINK, 2.2); P([[sx, sy], [ex, ey], [hx, hy]]);
      dot(hx, hy, 2.6, PINK);
      S(OL.ink, 1.2); P([[hx, hy], [hx + side * -2 + (tgt[0] - sx) * .12, hy - 13 + amt * 6]]);
    };
    arm(gx - 26, gy + 26, [28, 60], lT, lA, -1);
    arm(gx + 26, gy + 26, [90, 60], rT, rA, 1);
    // head
    S(PINK); c.fillStyle = OL.bg;
    c.beginPath(); c.moveTo(gx - 15, gy + 6); c.bezierCurveTo(gx - 18, gy - 16, gx + 18, gy - 16, gx + 15, gy + 6); c.bezierCurveTo(gx + 16, gy + 19, gx - 16, gy + 19, gx - 15, gy + 6); c.fill(); c.stroke();
    E(gx - 16, gy + 2, 3, 4); E(gx + 16, gy + 2, 3, 4);
    const lift = gLift * 4;
    S(PINK, 2); c.beginPath(); c.moveTo(gx - 11, gy - 2 - lift * .6); c.quadraticCurveTo(gx - 5.5, gy - 5 - lift, gx, gy - 2.5 - lift * .4); c.quadraticCurveTo(gx + 5.5, gy - 5 - lift, gx + 11, gy - 2 - lift * .6); c.stroke();
    const eyeR = 1.5 + gLift * 1.2;
    if (gLift > .2) { S(OL.ink, 1); E(gx - 5.5, gy + 1.5, eyeR + 1.2, eyeR + 1.2); E(gx + 5.5, gy + 1.5, eyeR + 1.2, eyeR + 1.2); }
    dot(gx - 5.5, gy + 1.5, eyeR, OL.ink); dot(gx + 5.5, gy + 1.5, eyeR, OL.ink);
    S(PINK); E(gx, gy + 10, 9, 5.5);
    dot(gx - 2.4, gy + 8.5, .9, PINK); dot(gx + 2.4, gy + 8.5, .9, PINK);
    const mo = hit[0] * 2.5;
    S(OL.ink, 1.2); E(gx, gy + 12.5, 3.5, .3 + mo * .6);
    // the kit
    S(BLUE); c.fillStyle = OL.bg;
    E(14, 58, 9, 2.4); E(14, 61 - hit[4] * 2 - hit[5] * 3, 9, 2.4); P([[14, 61], [14, 104]]); P([[8, 104], [14, 96], [20, 104]]);
    E(100, 54 + hit[7] * 2, 13, 3, -.15); P([[100, 56], [100, 104]]);
    c.beginPath(); c.ellipse(88, 70, 9, 3, 0, 0, 6.28); c.fill(); c.stroke(); P([[79, 70], [79, 79]]); P([[97, 70], [97, 79]]); c.beginPath(); c.ellipse(88, 79, 9, 3, 0, 0, 3.14); c.stroke();
    c.beginPath(); c.ellipse(24, 74, 12, 3.5, 0, 0, 6.28); c.fill(); c.stroke(); P([[12, 74], [12, 82]]); P([[36, 74], [36, 82]]); c.beginPath(); c.ellipse(24, 82, 12, 3.5, 0, 0, 3.14); c.stroke(); P([[16, 85], [12, 104]]); P([[32, 85], [36, 104]]);
    const kr = 20 + hit[0] * 1.5;
    c.beginPath(); c.arc(gx, 88, kr, 0, 6.28); c.fill(); c.stroke();
    if (hit[0] > .05) { c.fillStyle = PINK; c.globalAlpha = hit[0] * .45; c.beginPath(); c.arc(gx, 88, kr, 0, 6.28); c.fill(); c.globalAlpha = 1; }
    S(BLUE, 1.2); c.beginPath(); c.arc(gx, 88, 12, 0, 6.28); c.stroke();
    for (let i = 0; i < 8; i++) { const an = i / 8 * 6.283; dot(gx + Math.cos(an) * (kr - 2.5), 88 + Math.sin(an) * (kr - 2.5), .9, BLUE); }

    // ---------- pattern grid ----------
    const x0 = 116, y0 = 8, cw = 5, rh = 8, rows = 4;
    S(BLUE, 1); c.globalAlpha = .55;
    for (let i = 0; i <= 16; i++) P([[x0 + i * cw, y0], [x0 + i * cw, y0 + rows * rh]]);
    for (let r = 0; r <= rows; r++) P([[x0, y0 + r * rh], [x0 + 16 * cw, y0 + r * rh]]);
    c.globalAlpha = 1;
    const laneBits = [M.steps[M.pattern * 8] >>> 0, M.steps[M.pattern * 8 + 1] >>> 0, (M.steps[M.pattern * 8 + 4] | M.steps[M.pattern * 8 + 5]) >>> 0];
    S(OL.ink, 1.1);
    for (let s = 0; s < 16; s++) {
      for (let r = 0; r < rows; r++) {
        const on = r < 3 ? laneBits[r] & (1 << s) : (M.bs[M.pattern * 16 + s] & 256);
        if (!on) continue;
        const cx = x0 + s * cw + cw / 2, cy = y0 + r * rh + rh / 2;
        if (r === 3) { dot(cx, cy, 1.5, BASS_DISP); continue; }
        P([[cx - 1.5, cy - 1.5], [cx + 1.5, cy + 1.5]]); P([[cx + 1.5, cy - 1.5], [cx - 1.5, cy + 1.5]]);
      }
    }
    if (M.step >= 0) { S(OL.ink, 1.4); c.strokeRect(x0 + M.step * cw, y0 - 1, cw, rows * rh + 2); }
    const letter = 'ABCDEFGH'[M.pattern] || 'A';
    S(OL.amber, 1.2); c.strokeRect(x0, 46, 14, 12);
    dots(c, letter, x0 + 7, 48.5, 1.1, OL.amber, null, 'center');
    dots(c, String(Math.max(1, M.step + 1)).padStart(2, '0'), x0 + 80, 47, 1.5, OL.amber, OL.amberOff, 'right');

    // ---------- donkey ----------
    const env = M.sirenEnv || 0, mode = Math.round(pv('sir.mode') * 4), rate = expMap(pv('sir.rate'), .12, 26), depth = pv('sir.depth'), pitch = pv('sir.pitch'), rep = pv('sir.echo');
    sirT += dt * rate;
    const chew = Math.max(hit[3] * .3, 0), open = Math.max(env, chew), dy = bob * .5;
    // tongue: the siren wave, sticking out of the mouth while it sounds, faint echoes behind
    const mx = 224, my = 72 + dy, len = 104 * env;
    tongue.unshift(env > .02 ? shape(mode, sirT) : NaN); if (tongue.length > 60) tongue.pop();
    if (env > .02) {
      for (let k = rep > .03 ? 2 : 0; k >= 0; k--) {
        S(k ? BLUE : '#ff3d4a', k ? 1.2 : 3.2); c.globalAlpha = k ? rep * .6 / k : 1;
        c.beginPath();
        const base = my + 2 - pitch * 4 + k * 5;
        let tip = null;
        for (let i = 0; i <= 40; i++) {
          const t = i / 40, x = mx - t * len, v = tongue[Math.floor(t * (tongue.length - 1))];
          if (isNaN(v)) break;
          const y = base + v * (2 + depth * 9) * Math.min(1, t * 4);
          i ? c.lineTo(x, y) : c.moveTo(x, y); tip = [x, y];
        }
        c.stroke();
        if (!k && tip) dot(tip[0], tip[1], 2.4, '#ff3d4a');
      }
      c.globalAlpha = 1;
    }
    // ears: they flick on the snare and perk up when surprised
    S(PINK); c.fillStyle = OL.bg;
    const perk = dLift * .25, fl = earFlick * Math.sin(now * .04) * .2;
    c.beginPath(); c.ellipse(276, 16 + dy, 4.5, 13, .45 - perk + fl, 0, 6.28); c.fill(); c.stroke();
    c.beginPath(); c.ellipse(265, 14 + dy, 4.5, 13, .12 - perk, 0, 6.28); c.fill(); c.stroke();
    // head and neck, facing the grid
    c.beginPath();
    c.moveTo(270, 26 + dy); c.quadraticCurveTo(248, 25 + dy, 234, 40 + dy); c.quadraticCurveTo(219, 50 + dy, 215, 58 + dy);
    c.quadraticCurveTo(213, 66 + dy, 221, 66 + dy); c.lineTo(240, 64 + dy);
    c.lineTo(224, 70 + dy + open * 7); c.quadraticCurveTo(222, 76 + dy + open * 7, 230, 77 + dy + open * 4); c.quadraticCurveTo(246, 78 + dy, 256, 72 + dy);
    c.lineTo(258, 106); c.moveTo(288, 106); c.lineTo(284, 46 + dy); c.quadraticCurveTo(283, 27 + dy, 270, 26 + dy);
    c.fill(); c.stroke();
    // mane
    S(PINK, 1.2); for (let i = 0; i < 7; i++) { const y = 34 + i * 9 + dy; P([[284 - i * .2, y], [290 - i * .2, y + 3], [285 - i * .2, y + 6]]); }
    // teeth while the mouth is open
    if (open > .3) { c.fillStyle = OL.ink; for (let i = 0; i < 3; i++) c.fillRect(224 + i * 4.5, 66 + dy, 3.4, 2.4); }
    // nostril, eye, eyebrow
    S(PINK, 1.3); c.beginPath(); c.arc(220, 57 + dy, 2, 3.4, 6); c.stroke();
    const eh = Math.max(.25, 1 - blink) * (1.6 + dLift * 1.2);
    c.fillStyle = OL.ink; c.beginPath(); c.ellipse(247, 40 + dy, 1.6 + dLift, eh, 0, 0, 6.28); c.fill();
    if (dLift > .2) { S(OL.ink, 1); E(247, 40 + dy, 3 + dLift, 3 + dLift); }
    S(PINK, 2); P([[241, 34 + dy - dLift * 4], [247, 32 + dy - dLift * 6], [253, 34 + dy - dLift * 3]]);
  }
  M.anim.push(frame);
}

// ================= CHAIN + bar tools =================
function ChainBar() {
  const b = el('div'); b.id = 'chainbar';
  const on = el('button', 'chtool', 'CHAIN');
  on.setAttribute('aria-label', 'Play the chain of patterns');
  const edit = el('button', 'chtool', 'ADD');
  edit.setAttribute('aria-label', 'Tap pattern letters to add them to the chain');
  const undo = el('button', 'chtool', '⌫'); undo.setAttribute('aria-label', 'Remove the last pattern from the chain');
  const slots = el('div', 'slots');
  const hint = el('div', 'hint');
  const rnd = el('button', 'chtool go', 'RANDOM'), dup = el('button', 'chtool', 'DUPLICATE'), back = el('button', 'chtool', 'UNDO'), clear = el('button', 'chtool', 'CLEAR');
  rnd.setAttribute('aria-label', 'Randomise the sequence on this page');
  dup.setAttribute('aria-label', 'Copy this bar onto another letter');
  back.setAttribute('aria-label', 'Undo the last random, duplicate, clear or load');
  b.append(on, edit, undo, slots, hint, rnd, dup, back, clear);
  const push = list => send(`chain ${list.length && M.cn.on ? 1 : 0} ${list.join(' ')}`.trim());
  press(on, () => { if (!M.cn.list.length) { M.chainEdit = true; M.dupArmed = false; refresh(); return; } send(`chain ${M.cn.on ? 0 : 1} ${M.cn.list.join(' ')}`); });
  press(edit, () => { M.chainEdit = !M.chainEdit; M.dupArmed = false; refresh(); });
  press(undo, () => { const l = M.cn.list.slice(0, -1); M.cn.list = l; push(l); refresh(); });
  M.chainAdd = p => { const l = M.cn.list.concat([p]); M.cn.list = l; push(l); refresh(); };
  press(rnd, () => { send('snapshot'); generate(); });
  press(dup, () => { M.dupArmed = !M.dupArmed; M.chainEdit = false; refresh(); });
  press(back, () => { send('undo'); showToast('Back to what you had', 1800); });
  let armed = 0;
  press(clear, () => {
    if (performance.now() - armed < 2000) { send('snapshot'); send('clear ' + M.pattern); clear.textContent = 'CLEAR'; armed = 0; }
    else { armed = performance.now(); clear.textContent = 'SURE?'; setTimeout(() => { clear.textContent = 'CLEAR'; }, 2000); }
  });
  // DUPLICATE, then tap a letter: this bar is copied there and you land on the copy, ready to change it.
  M.dupTo = p => {
    M.dupArmed = false;
    if (p !== M.pattern) { send('snapshot'); send(`copy ${M.pattern} ${p}`); send('pat ' + p); showToast(`${'ABCDEFGH'[M.pattern]} copied to ${'ABCDEFGH'[p]}`, 1800); }
    refresh();
  };
  let shown = '', cur = -2;
  function refresh() {
    on.classList.toggle('on', !!M.cn.on);
    edit.classList.toggle('on', !!M.chainEdit);
    dup.classList.toggle('on', !!M.dupArmed);
    document.body.classList.toggle('armed', !!(M.dupArmed || M.chainEdit));
    const key = M.cn.list.join(',');
    if (key !== shown) {
      shown = key;
      slots.innerHTML = '';
      M.cn.list.forEach((p, i) => {
        const s = el('button', 'slot', 'ABCDEFGH'[p]);
        s.setAttribute('aria-label', `Chain step ${i + 1}: pattern ${'ABCDEFGH'[p]}. Tap to remove.`);
        press(s, () => { const l = M.cn.list.slice(); l.splice(i, 1); M.cn.list = l; push(l); refresh(); });
        slots.append(s);
      });
    }
    hint.textContent = M.dupArmed ? 'TAP THE LETTER TO COPY THIS BAR TO' : M.chainEdit ? 'TAP LETTERS TO ADD BARS' : M.cn.list.length ? '' : 'PRESS ADD, THEN TAP LETTERS';
    cur = -2;
  }
  M.onChain = M.onChain || []; M.onChain.push(refresh);
  M.onHello.push(refresh);
  M.onTick.push(() => {
    const n = M.x[8];
    if (n === cur) return;
    cur = n;
    [...slots.children].forEach((s, i) => s.classList.toggle('now', i === n && !!M.cn.on));
  });
  return b;
}

// One control bar for every page, so a knob or a button is always in the same place.
function Bar(label, color, knobs, tools) {
  const set = el('div', 'encset');
  const l = el('div', 'enclabel', label); if (color) l.style.color = color; if (label && label.length <= 7) dotify(l, 2.4);
  const k = el('div', 'encknobs'); knobs.forEach(n => k.append(n));
  const t = el('div', 'enctools'); (tools || []).forEach(n => t.append(n));
  set.append(l, k, t);
  return set;
}
const barKnob = (key, label, i, opts) => Knob(key, label, Object.assign({ color: ENC[i % ENC.length], size: 44 }, opts || {}));

// ================= LIBRARY =================
function LibPage() {
  const p = el('div', 'page');
  const wrap = el('div', 'libwrap');
  const grid = el('div', 'genres');
  const cards = [];
  GENRES.sort((a, b) => a.bpm - b.bpm);
  GENRES.forEach(g => {
    const c = el('button', 'gcard', `<b>${g.name}</b><canvas></canvas><span>${g.bpm} BPM</span>`);
    c.setAttribute('aria-label', `Load ${g.name} sequences`);
    press(c, () => { loadGenre(g); cards.forEach(x => x.classList.toggle('on', x === c)); drawAll(); });
    grid.append(c); cards.push(c);
  });
  // Each card's picture is its own rhythm, one dot per hit.
  function drawCard(cv, g, sel) {
    const [W, H, dpr] = fitCanvas(cv);
    const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, W, H);
    const rows = ['k', 's', 'c', 'r', 'h', 't'].filter(k => g.a[k] && g.a[k].includes('x') || g.a[k] && g.a[k].includes('X'));
    const cw = W / 16, rh = H / Math.max(rows.length, 1);
    rows.forEach((k, r) => {
      const col = sel ? T('--onfill') : T(`--c${LANE_KEYS.indexOf(k)}`);
      ctx.fillStyle = col;
      for (let s = 0; s < 16; s++) {
        const ch = g.a[k][s];
        if (ch !== 'x' && ch !== 'X') continue;
        ctx.beginPath(); ctx.arc((s + .5) * cw, (r + .5) * rh, Math.min(cw, rh) * (ch === 'X' ? .36 : .24), 0, 7); ctx.fill();
      }
    });
    void dpr;
  }
  function drawAll() { cards.forEach((c, i) => { if (c.clientWidth) drawCard(c.querySelector('canvas'), GENRES[i], c.classList.contains('on')); }); }
  wrap.append(grid);
  const side = el('div', 'libside');
  side.append(el('div', 't', 'SOUNDS'));
  const synth = el('button', 'tool', 'ORIGINAL'), rid = el('button', 'tool', 'RIDDIM');
  synth.setAttribute('aria-label', 'Use Marea\'s own synthesized sounds'); rid.setAttribute('aria-label', 'Use your Riddim sounds on the lanes and pads');
  press(synth, () => send('kit synth')); press(rid, () => { send('kit riddim'); showToast('Loading your Riddim sounds…', 2000); });
  side.append(synth, rid, el('div', 't', 'SONG'));
  const sv = el('button', 'tool', 'SAVE'), op = el('button', 'tool', 'OPEN'), un = el('button', 'tool', 'UNDO LOAD');
  press(sv, openSave); press(op, openSongs); press(un, () => { send('undo'); showToast('Back to what you had', 2000); });
  side.append(sv, op, un);
  p.draw = () => {};
  wrap.append(side);
  p.append(wrap);
  p.draw = drawAll;
  M.onLanes = M.onLanes || [];
  M.onLanes.push(() => { const u = (M.lanes || []).some(n => n); rid.classList.toggle('on', u); synth.classList.toggle('on', !u); });
  return p;
}

// ================= PULSE =================
let selLane = 0;
function PulsePage() {
  const p = el('div', 'page');
  const nums = el('div', 'nums', '<div class="row"></div>');
  const numRow = nums.firstChild, numEls = [];
  for (let i = 0; i < 16; i++) { const s = el('span', '', i + 1); s.style.setProperty('--gc', `var(--g${Math.floor(i / 4)})`); numRow.append(s); numEls.push(s); }
  p.append(nums);
  const lanes = el('div', 'lanes'); p.append(lanes);
  const cells = [], heads = [];
  const bar = el('div', 'encbar');
  const encSets = [];
  const select = t => { selLane = t; heads.forEach((h, i) => h.classList.toggle('sel', i === t)); encSets.forEach((s, i) => { s.style.display = i === t ? 'flex' : 'none'; }); if (M.layoutKeys) M.layoutKeys(); };
  TRACKS.forEach(([key, name, color], t) => {
    const row = el('div', 'lane');
    row.style.setProperty('--c', color);
    const head = el('button', 'lhead', `${pic(ICONS[key])}${name}<small></small>`);
    head.setAttribute('aria-label', 'Play and select ' + name);
    zone(head, 0, t, .95);
    press(head, () => { send(`hit 0 ${t} .95`); select(t); head.style.setProperty('--a', .7); });
    watch(`pul.${key}.key`, v => { const st = Math.round((v - .5) * 48); head.querySelector('small').textContent = st ? NOTE_NAMES[(st % 12 + 12) % 12] : ''; });
    heads[t] = head;
    row.append(head, Toggle(`pul.${key}.mute`, 'M', 'mini m'), Toggle(`pul.${key}.solo`, 'S', 'mini s'));
    const rowCells = el('div', 'cells');
    cells[t] = [];
    for (let s = 0; s < 16; s++) {
      const b = el('button', 'cell' + (Math.floor(s / 4) % 2 === 0 ? ' q' : ''));
      b.setAttribute('aria-label', `${name} step ${s + 1}`);
      stepPress(b, t, s);
      rowCells.append(b); cells[t][s] = b;
    }
    row.append(rowCells);
    lanes.append(row);
    M.onTick.push(() => { if (!head.classList.contains('sel')) head.style.setProperty('--a', (M.activity[t] / 99 * .5).toFixed(2)); else head.style.setProperty('--a', 0); });
    const lo = el('button', 'tool', 'LOAD'); lo.setAttribute('aria-label', `Load a sample onto ${name}`);
    press(lo, () => openLoader(200 + t));
    const sy = el('button', 'tool', 'SYNTH'); sy.setAttribute('aria-label', `Back to the synthesized ${name}`);
    press(sy, () => send('lanesynth ' + t));
    const note = el('div', 'encnote');
    const set = Bar(name, color, ['key', 'tune', 'decay', 'tone', 'echo', 'level'].map((x, i) => barKnob(`pul.${key}.${x}`, x.toUpperCase(), i)), [lo, sy, Toggle(`pul.${key}.mute`, 'MUTE', 'tool'), Toggle(`pul.${key}.solo`, 'SOLO', 'tool')]);
    set.style.display = 'none';
    set.append(note);
    M.onLanes = M.onLanes || [];
    M.onLanes.push(() => { const n = M.lanes[t]; note.textContent = n ? n.toUpperCase() : ''; sy.classList.toggle('on', !n); head.querySelector('em') && head.querySelector('em').remove(); if (n) head.append(el('em')); });
    encSets[t] = set; bar.append(set);
  });
  p.append(bar);
  M.onSteps.push(() => {
    for (let t = 0; t < 8; t++) {
      const v = M.steps[M.pattern * 8 + t] >>> 0;
      for (let s = 0; s < 16; s++) {
        cells[t][s].classList.toggle('on', !!(v & (1 << s)));
        cells[t][s].classList.toggle('acc', !!(v & (1 << (s + 16))));
      }
    }
  });
  let prev = -1;
  M.onTick.push(() => {
    if (M.step !== prev) {
      if (prev >= 0) { numEls[prev].classList.remove('now'); for (let t = 0; t < 8; t++) { cells[t][prev].classList.remove('head'); cells[t][prev].classList.remove('mut'); } }
      if (M.step >= 0) { numEls[M.step].classList.add('now'); for (let t = 0; t < 8; t++) cells[t][M.step].classList.add('head'); }
      prev = M.step;
    }
    // Marks where the randomizer played something different this pass.
    if (M.step >= 0 && M.x[7]) for (let t = 0; t < 8; t++) if (M.x[7] & (1 << t)) cells[t][M.step].classList.add('mut');
  });
  select(0);
  return p;
}
function stepPress(b, t, s) {
  const stateOf = () => { const v = M.steps[M.pattern * 8 + t] >>> 0; return (v & (1 << (s + 16))) ? 2 : (v & (1 << s)) ? 1 : 0; };
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    const before = stateOf();
    let longPress = false;
    if (before === 0) setStep(t, s, 1);
    const timer = setTimeout(() => { longPress = true; setStep(t, s, stateOf() === 2 ? 1 : 2); }, 340);
    const cleanup = () => { clearTimeout(timer); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', cleanup); };
    const up = () => { cleanup(); if (!longPress && before !== 0) setStep(t, s, 0); };
    b.setPointerCapture(e.pointerId);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', cleanup);
  });
}

// ================= BASS =================
function scaleNotes() {
  const root = Math.round(pv('bas.root') * 11), sc = SCALES[Math.round(pv('bas.scale') * 5)][1];
  const base = 24 + root, out = [];
  for (let o = 0; o < 3; o++) for (const n of sc) { const m = base + 12 * o + n; if (m <= base + 24) out.push(m); }
  return out;
}
function BassPage() {
  const p = el('div', 'page');
  const roll = el('canvas'); roll.id = 'roll'; roll.setAttribute('aria-label', 'Bass melody grid');
  const accs = [], slides = [];
  const wrap = el('div', 'rollwrap');
  const side = el('div', 'keyscale');
  const rootRow = el('div', 'rootrow', '<button aria-label="Root down">‹</button><span></span><button aria-label="Root up">›</button>');
  const rb = rootRow.querySelectorAll('button');
  const shift = d => setParam('bas.root', (Math.round(pv('bas.root') * 11) + d + 12) % 12 / 11, true);
  press(rb[0], () => shift(-1)); press(rb[1], () => shift(1));
  watch('bas.root', v => { rootRow.querySelector('span').textContent = NOTE_NAMES[Math.round(v * 11)]; drawRoll(); });
  const sg = el('div', 'sg');
  Radio('bas.scale', 6, i => { const b = el('button', 'smallbtn', SCALES[i][0]); sg.append(b); return b; });
  watch('bas.scale', () => drawRoll());
  const vg = el('div', 'sg voices');
  Radio('bas.voice', 7, i => { const b = el('button', 'smallbtn', BASS_VOICES[i]); vg.append(b); return b; });
  side.append(rootRow, sg, Toggle('bas.mute', 'MUTE', 'smallbtn'));
  const vcol = el('div', 'keyscale'); vcol.append(el('div', 'vtitle', 'VOICE'), vg);
  const col = el('div', 'rollcol');
  const accRow = el('div', 'flagrow'), slideRow = el('div', 'flagrow');
  accRow.style.setProperty('--c', 'var(--red)'); slideRow.style.setProperty('--c', 'var(--green)');
  const toggleFlag = (s, bit) => { const v = M.bs[M.pattern * 16 + s] >>> 0; if (v & 256) setBass(s, v ^ bit); };
  for (let s = 0; s < 16; s++) {
    const a = el('button', 'flag', 'A'), l = el('button', 'flag', 'S');
    a.setAttribute('aria-label', `Accent step ${s + 1}`); l.setAttribute('aria-label', `Slide from step ${s + 1}`);
    press(a, () => toggleFlag(s, 512)); press(l, () => toggleFlag(s, 1024));
    accRow.append(a); slideRow.append(l); accs[s] = a; slides[s] = l;
  }
  col.append(roll, accRow, slideRow);
  wrap.append(vcol, side, col); p.append(wrap);
  const bar = el('div', 'encbar');
  bar.append(Bar('BASS', BASS_COLOR, [['cutoff', 'CUT'], ['reso', 'RESO'], ['env', 'ENV'], ['decay', 'DECAY'], ['accent', 'ACCENT'], ['drive', 'DRIVE'], ['wave', 'WAVE'], ['sub', 'SUB'], ['detune', 'DETUNE'], ['slide', 'SLIDE'], ['level', 'LEVEL'], ['echo', 'ECHO']].map(([k, l], i) => barKnob('bas.' + k, l, i))));
  p.append(bar);

  function noteAt(rows, e) {
    const r = roll.getBoundingClientRect();
    const s = Math.min(15, Math.max(0, Math.floor((e.clientX - r.left) / r.width * 16)));
    const row = Math.min(rows.length - 1, Math.max(0, Math.floor((1 - (e.clientY - r.top) / r.height) * rows.length)));
    return [s, rows[row]];
  }
  // Bits 11-14 of a bass step are its length in steps minus one.
  const lenOf = v => 1 + ((v >>> 11) & 15);
  const withLen = (v, l) => ((v & ~(15 << 11)) | ((Math.max(1, Math.min(16, l)) - 1) << 11)) >>> 0;
  // A note placed inside an earlier long note shortens that note so they don't overlap.
  const trimCover = s => {
    for (let a = s - 1; a >= 0; a--) {
      const v = M.bs[M.pattern * 16 + a] >>> 0;
      if (!(v & 256)) continue;
      if (a + lenOf(v) > s) setBass(a, withLen(v, s - a));
      return;
    }
  };
  roll.addEventListener('pointerdown', e => {
    e.preventDefault();
    const rows = scaleNotes();
    const [s, n] = noteAt(rows, e);
    const cur = M.bs[M.pattern * 16 + s] >>> 0;
    const same = (cur & 256) && (cur & 255) === n;
    if (!same) { trimCover(s); setBass(s, (cur & 1536) | 256 | n); audition(n); }
    let lastS = s, mode = 'tap', len0 = same ? lenOf(cur) : 1;
    roll.setPointerCapture(e.pointerId);
    const move = ev => {
      if (ev.pointerId !== e.pointerId) return;
      const [s2, n2] = noteAt(rows, ev);
      if (mode === 'tap' && s2 === s && n2 === n) return;
      // Dragging along the same row stretches the note; moving to another row paints a melody.
      if (mode === 'tap') mode = n2 === n && s2 > s ? 'len' : 'paint';
      if (mode === 'len') {
        const end = Math.max(s, s2), v = M.bs[M.pattern * 16 + s] >>> 0;
        for (let k = s + 1; k <= end; k++) if (M.bs[M.pattern * 16 + k] & 256) setBass(k, 0);
        if (lenOf(v) !== end - s + 1) setBass(s, withLen(v, end - s + 1));
        return;
      }
      const c2 = M.bs[M.pattern * 16 + s2] >>> 0;
      if (s2 !== lastS || (c2 & 255) !== n2) { trimCover(s2); setBass(s2, (c2 & 1536) | 256 | n2); lastS = s2; }
    };
    const up = () => {
      roll.removeEventListener('pointermove', move); roll.removeEventListener('pointerup', up); roll.removeEventListener('pointercancel', up);
      // Tapping a note that was already there removes it.
      if (mode === 'tap' && same) setBass(s, 0);
    };
    roll.addEventListener('pointermove', move); roll.addEventListener('pointerup', up); roll.addEventListener('pointercancel', up);
  });
  function drawRoll() {
    if (!roll.clientWidth || !M.bs.length) return;
    const [W, H, dpr] = fitCanvas(roll);
    const c = roll.getContext('2d'), rows = scaleNotes();
    const rh = H / rows.length, cw = W / 16, sal = T('--salmon'), lineC = T('--line'), line2 = T('--line2'), cell = T('--cell');
    c.clearRect(0, 0, W, H);
    const root = Math.round(pv('bas.root') * 11);
    rows.forEach((n, i) => {
      const y = H - (i + 1) * rh;
      c.fillStyle = cell; c.globalAlpha = (n - 24 - root) % 12 === 0 ? 1 : i % 2 ? .35 : .6;
      c.fillRect(0, y + 1, W, rh - 1);
      if ((n - 24 - root) % 12 === 0) { c.globalAlpha = .3; c.fillStyle = sal; c.fillRect(0, y + 1, W, rh - 1); }
    });
    c.globalAlpha = 1;
    for (let s = 0; s <= 16; s++) { c.fillStyle = s % 4 === 0 ? line2 : lineC; c.fillRect(s * cw - dpr * .5, 0, dpr, H); }
    if (M.step >= 0) { c.fillStyle = T('--text'); c.globalAlpha = .1; c.fillRect(M.step * cw, 0, cw, H); c.globalAlpha = 1; }
    const yOf = n => { const i = rows.indexOf(nearest(rows, n)); return H - (i + .5) * rh; };
    c.lineWidth = 1.5 * dpr;
    let last = null;
    for (let s = 0; s < 16; s++) {
      const v = M.bs[M.pattern * 16 + s] >>> 0;
      if (!(v & 256)) { last = null; continue; }
      const y = yOf(v & 255), x = s * cw;
      if (last) {
        c.beginPath(); c.moveTo(last[0], last[1]); c.lineTo(x + cw * .08, y);
        c.strokeStyle = last[2] ? T('--green') : sal; c.setLineDash(last[2] ? [] : [3 * dpr, 3 * dpr]); c.globalAlpha = last[2] ? 1 : .55; c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      }
      const L = lenOf(v), acc = v & 512, playing = M.step >= s && M.step < s + L;
      c.fillStyle = playing ? T('--text') : acc ? T('--red') : sal;
      const barH = Math.max(rh - 3 * dpr, 4 * dpr), w = cw * (L - 1) + cw * ((v & 1024) ? .92 : L > 1 ? .84 : .68);
      c.fillRect(x + cw * .08, y - barH / 2, w, barH);
      last = [x + cw * .08 + w + cw * ((v & 1024) ? 0 : .08), y, v & 1024];
      s += L - 1;
    }
    for (let s = 0; s < 16; s++) {
      const v = M.bs[M.pattern * 16 + s] >>> 0;
      accs[s].classList.toggle('on', !!(v & 512) && !!(v & 256));
      slides[s].classList.toggle('on', !!(v & 1024) && !!(v & 256));
    }
  }
  p.draw = drawRoll;
  M.onSteps.push(drawRoll);
  let prevStep = -2;
  M.onTick.push(() => { if (M.page === 'bass' && M.step !== prevStep) { prevStep = M.step; drawRoll(); } });
  return p;
}
function nearest(rows, n) { let b = rows[0]; for (const r of rows) if (Math.abs(r - n) < Math.abs(b - n)) b = r; return b; }
function audition(n) {
  if (M.run) return;
  send(`hit 2 ${n} .8`);
  setTimeout(() => send(`rel 2 ${n}`), 170);
}

// ================= CHOP =================
let selSlice = 0, slicePage = 0;
function RecButton(label, dest, source) {
  const b = el('button', 'recbtn', '● ' + label);
  b.setAttribute('aria-label', 'Record from ' + label);
  let mine = false;
  press(b, () => {
    if (M.x[4]) { send('recstop'); mine = false; return; }
    mine = true;
    send(`rec ${typeof dest === 'function' ? dest() : dest} ${source}`);
  });
  M.onTick.push(() => {
    const on = !!M.x[4] && mine;
    b.classList.toggle('on', on);
    b.textContent = on ? `■ ${M.x[6].toFixed(1)} S` : '● ' + label;
    if (!M.x[4]) mine = false;
  });
  return b;
}
// Effects are applied to what the microphone records, cycling on each tap.
function MicFxButton() {
  const b = el('button', 'tool', '');
  b.setAttribute('aria-label', 'Microphone effect');
  press(b, () => setParam('rec.fx', ((Math.round(pv('rec.fx') * 5) + 1) % 6) / 5, true));
  watch('rec.fx', v => { b.textContent = v > .01 ? MIC_FX[Math.round(v * 5)] : 'FX'; b.classList.toggle('on', v > .01); });
  return b;
}
function ChopPage() {
  const p = el('div', 'page');
  const top = el('div', 'choptop');
  const name = el('div', 'chopname', 'NOTHING LOADED');
  const info = el('div', 'chopinfo', '');
  top.append(name, info, el('div', 'spacer'));
  p.append(top);
  const wave = el('canvas'); wave.id = 'chopwave'; wave.setAttribute('aria-label', 'Sliced waveform; tap a slice to play it');
  p.append(wave);
  p.addEventListener('dragover', e => e.preventDefault());
  p.addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files[0]) { showToast('Chopping ' + e.dataTransfer.files[0].name + '…'); uploadFile(e.dataTransfer.files[0], 100, r => { if (r !== 'LOADED') showToast(r); }); } });

  p.append(el('div', 'rowlabel', 'SEQUENCE: TAP A STEP TO PLACE THE SELECTED SLICE'));
  const strip = el('div', 'stepstrip');
  const stepCells = [];
  for (let s = 0; s < 16; s++) {
    const b = el('button', 'slicecell');
    b.setAttribute('aria-label', `Chop step ${s + 1}`);
    press(b, () => {
      const cur = M.cs[M.pattern * 16 + s];
      setChop(s, cur === selSlice + 1 ? 0 : selSlice + 1);
    });
    strip.append(b); stepCells[s] = b;
  }
  p.append(strip);
  p.append(el('div', 'rowlabel', 'SLICES'));
  const padsRow = el('div', 'slicepads'), padCells = [];
  for (let i = 0; i < 16; i++) {
    const b = el('button', 'slicepad');
    zone(b, 3, i, .95);
    press(b, () => { const n = slicePage * 16 + i; if (M.chop && n < M.chop.starts.length) { selSlice = n; send(`hit 3 ${n} .95`); refresh(); drawWaveNow(); } });
    padsRow.append(b); padCells[i] = b;
  }
  p.append(padsRow);
  const load = el('button', 'tool', 'LOAD'); press(load, () => openLoader(100));
  const half = el('button', 'tool', '÷2'), dbl = el('button', 'tool', '×2');
  half.setAttribute('aria-label', 'Half the tempo guess'); dbl.setAttribute('aria-label', 'Double the tempo guess');
  press(half, () => send('chopmul 0.5')); press(dbl, () => send('chopmul 2'));
  const divs = [];
  Radio('cho.div', 4, i => { const b = el('button', 'tool', ['1/4', '1/8', '1/16', '1/32'][i]); divs.push(b); b.addEventListener('pointerup', () => setTimeout(() => send('rechop 1'), 30)); return b; });
  const hits = Toggle('cho.mode', 'HITS', 'tool');
  hits.addEventListener('pointerup', () => setTimeout(() => send('rechop 1'), 30));
  const pagesBtn = el('button', 'tool', '1-16');
  press(pagesBtn, () => { slicePage = slicePage ? 0 : 1; pagesBtn.textContent = slicePage ? '17-32' : '1-16'; refresh(); });
  const bar = el('div', 'encbar');
  bar.append(Bar('CHOP', 'var(--c5)', [['pitch', 'PITCH'], ['gate', 'LENGTH'], ['level', 'LEVEL'], ['echo', 'ECHO']].map(([k, l], i) => barKnob('cho.' + k, l, i)),
    [load, Toggle('cho.mute', 'MUTE', 'tool'), Toggle('cho.rev', 'REV', 'tool'), MicFxButton(), RecButton('MIC', 100, 0), RecButton('OUT', 100, 1), hits, Toggle('cho.fit', 'SPEED', 'tool'), half, dbl, divs[0], divs[1], divs[2], divs[3], pagesBtn]));
  p.append(bar);

  function refresh() {
    const d = M.chop, n = d ? d.starts.length : 0;
    for (let i = 0; i < 16; i++) {
      const idx = slicePage * 16 + i, b = padCells[i];
      b.textContent = idx + 1;
      b.style.setProperty('--c', sliceVar(idx));
      b.classList.toggle('off', idx >= n);
      b.classList.toggle('sel', idx === selSlice && idx < n);
    }
    for (let s = 0; s < 16; s++) {
      const v = M.cs[M.pattern * 16 + s], b = stepCells[s];
      b.classList.toggle('on', v > 0);
      b.textContent = v > 0 ? v : '';
      if (v > 0) b.style.setProperty('--c', sliceVar(v - 1));
    }
    if (d) {
      name.textContent = d.name.toUpperCase();
      const bpmTxt = d.bpm > 1 ? `${d.bpm.toFixed(d.bpm % 1 ? 1 : 0)} BPM${d.named ? '' : ' DETECTED'}` : 'TEMPO UNKNOWN';
      info.textContent = `${bpmTxt}  ${n} SLICES`;
    } else { name.textContent = 'NOTHING LOADED'; info.textContent = ''; }
  }
  function drawWaveNow() {
    if (!wave.clientWidth) return;
    const [W, H, dpr] = fitCanvas(wave);
    const c = wave.getContext('2d');
    c.clearRect(0, 0, W, H);
    const d = M.chop;
    c.strokeStyle = T('--line'); c.lineWidth = dpr; c.strokeRect(dpr / 2, dpr / 2, W - dpr, H - dpr);
    if (!d) {
      c.fillStyle = T('--line2'); c.font = `400 ${17 * dpr}px "Plex Mono",Menlo,monospace`; c.textAlign = 'center';
      c.fillText('DROP A FILE. IT CUTS ITSELF TO THE BEAT.', W / 2, H / 2 + 10 * dpr);
      return;
    }
    const N = d.wave.length, st = d.starts, cur = M.x[2], mid = H / 2;
    let si = 0;
    for (let i = 0; i < N; i++) {
      const pos = i / N;
      while (si + 1 < st.length && st[si + 1] <= pos) si++;
      const h = Math.max(dpr, d.wave[i] / 99 * H * .46);
      c.fillStyle = sliceHex(si);
      c.globalAlpha = si === cur ? 1 : si === selSlice ? .95 : .62;
      c.fillRect(pos * W, mid - h, Math.max(dpr, W / N * .62), h * 2);
    }
    c.globalAlpha = 1;
    st.forEach((s, i) => {
      c.fillStyle = sliceHex(i);
      c.fillRect(s * W, 0, dpr, H);
      c.font = `500 ${11 * dpr}px "Plex Mono",Menlo,monospace`; c.textAlign = 'left'; c.fillText(i + 1, s * W + 3 * dpr, 13 * dpr);
    });
    if (cur >= 0 && cur < st.length) {
      const a = st[cur], z = cur + 1 < st.length ? st[cur + 1] : 1;
      c.fillStyle = T('--text'); c.globalAlpha = .12; c.fillRect(a * W, 0, (z - a) * W, H); c.globalAlpha = 1;
    }
  }
  wave.addEventListener('pointerdown', e => {
    e.preventDefault();
    const d = M.chop; if (!d) { openLoader(100); return; }
    const r = wave.getBoundingClientRect(), pos = (e.clientX - r.left) / r.width;
    let i = 0; while (i + 1 < d.starts.length && d.starts[i + 1] <= pos) i++;
    selSlice = i; slicePage = i >= 16 ? 1 : 0;
    pagesBtn.textContent = slicePage ? '17-32' : '1-16';
    send(`hit 3 ${i} .95`); refresh(); drawWaveNow();
  });
  p.draw = () => { refresh(); drawWaveNow(); };
  M.onChop.push(() => { if (selSlice >= (M.chop ? M.chop.starts.length : 1)) selSlice = 0; refresh(); drawWaveNow(); });
  M.onSteps.push(refresh);
  let prevH = -1, prevSl = -2;
  M.onTick.push(() => {
    if (M.step !== prevH) {
      if (prevH >= 0) stepCells[prevH].classList.remove('head');
      if (M.step >= 0) stepCells[M.step].classList.add('head');
      prevH = M.step;
    }
    if (M.page === 'chop' && M.x[2] !== prevSl) { prevSl = M.x[2]; drawWaveNow(); }
  });
  return p;
}

// ================= PADS: 24 square pads, your library beside them, one sequence underneath =================
let selPad = 0;
const padVar = i => `var(--c${Math.floor(i / 4) % 8})`;
function setPadStep(i, s, val) {
  const a = M.pattern * Sampler_N + i;
  let v = M.ps[a] >>> 0;
  v &= ~((1 << s) | (1 << (s + 16)));
  if (val >= 1) v |= 1 << s;
  if (val >= 2) v |= 1 << (s + 16);
  M.ps[a] = v >>> 0;
  send(`ps ${M.pattern} ${i} ${v >>> 0}`);
  M.onSteps.forEach(f => f());
}
function PadsPage() {
  const p = el('div', 'page');
  const top = el('div', 'padtop');
  const padsEl = el('div', 'pads');
  const padEls = [], sets = [];
  const stepCells = [];
  const selectPad = i => {
    selPad = i;
    padEls.forEach((e, n) => e.classList.toggle('sel', n === i));
    sets.forEach((s, n) => { s.style.display = n === i ? 'flex' : 'none'; });
    title.textContent = `PAD ${i + 1}: TAP A STEP TO PLAY IT THERE`;
    refreshSteps();
    if (M.layoutKeys) M.layoutKeys();
  };
  M.selectPad = selectPad;
  for (let i = 0; i < Sampler_N; i++) {
    const b = el('button', 'smppad', `<canvas></canvas><b></b><em>${i + 1}</em><u></u>`);
    b.style.setProperty('--c', padVar(i));
    b.dataset.pad = i;
    zone(b, 1, i, .95);
    press(b, () => { send(`hit 1 ${i} .95`); selectPad(i); });
    b.addEventListener('dragover', e => e.preventDefault());
    b.addEventListener('drop', e => { e.preventDefault(); selectPad(i); if (e.dataTransfer.files[0]) uploadFile(e.dataTransfer.files[0], i, r => { if (r !== 'LOADED') showToast(r); }); });
    padsEl.append(b); padEls[i] = b;
  }
  M.onTick.push(() => { if (M.page === 'pads') padEls.forEach((b, i) => b.style.setProperty('--a', ((M.padAct[i] || 0) / 99 * .6).toFixed(2))); });
  top.append(padsEl, SoundBrowser((path, name) => {
    send(`loadpath ${selPad} ${path}`);
    showToast(`${name} on pad ${selPad + 1}`, 1400);
  }));
  p.append(top);
  const title = el('div', 'rowlabel');
  p.append(title);
  const strip = el('div', 'stepstrip');
  for (let s = 0; s < 16; s++) {
    const b = el('button', 'slicecell padstep');
    b.setAttribute('aria-label', `Pad step ${s + 1}`);
    const q = Math.floor(s / 4) % 2 === 0; if (q) b.classList.add('q');
    b.addEventListener('pointerdown', e => {
      e.preventDefault();
      const cur = M.ps[M.pattern * Sampler_N + selPad] >>> 0;
      const before = (cur & (1 << (s + 16))) ? 2 : (cur & (1 << s)) ? 1 : 0;
      let long = false;
      if (before === 0) setPadStep(selPad, s, 1);
      const t = setTimeout(() => { long = true; setPadStep(selPad, s, 2); }, 340);
      b.setPointerCapture(e.pointerId);
      const up = () => { clearTimeout(t); b.removeEventListener('pointerup', up); b.removeEventListener('pointercancel', up); if (!long && before !== 0) setPadStep(selPad, s, 0); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
    });
    strip.append(b); stepCells[s] = b;
  }
  p.append(strip);
  function refreshSteps() {
    if (!M.ps.length) return;
    const v = M.ps[M.pattern * Sampler_N + selPad] >>> 0;
    const col = padVar(selPad);
    for (let s = 0; s < 16; s++) {
      const b = stepCells[s], others = (() => { let n = 0; for (let i = 0; i < Sampler_N; i++) if (i !== selPad && (M.ps[M.pattern * Sampler_N + i] & (1 << s))) n++; return n; })();
      b.style.setProperty('--c', col);
      b.classList.toggle('on', !!(v & (1 << s)));
      b.classList.toggle('acc', !!(v & (1 << (s + 16))));
      b.textContent = others ? '·'.repeat(Math.min(3, others)) : '';
    }
    padEls.forEach((e, i) => e.classList.toggle('seq', !!(M.ps[M.pattern * Sampler_N + i] & 0xFFFF)));
  }
  M.onSteps.push(refreshSteps);
  let prevH = -1;
  M.onTick.push(() => {
    if (M.step !== prevH) {
      if (prevH >= 0) stepCells[prevH].classList.remove('head');
      if (M.step >= 0) stepCells[M.step].classList.add('head');
      prevH = M.step;
    }
  });
  const bar = el('div', 'encbar');
  for (let i = 0; i < Sampler_N; i++) {
    const key = `smp.${i + 1}.`;
    const lo = el('button', 'tool', 'LOAD'); press(lo, () => openLoader(selPad));
    const or = el('button', 'tool', i < 6 ? 'ORIG' : 'EMPTY'); or.setAttribute('aria-label', 'Back to the original pad sound'); press(or, () => send('builtin ' + selPad));
    const s = Bar(`PAD ${i + 1}`, padVar(i), [barKnob(key + 'pitch', 'PITCH', 0), barKnob(key + 'decay', 'LENGTH', 1), barKnob(key + 'level', 'LEVEL', 2), barKnob(key + 'echo', 'ECHO', 3)],
      [lo, or, Toggle(key + 'rev', 'REV', 'tool'), MicFxButton(), RecButton('MIC', () => selPad, 0), RecButton('OUT', () => selPad, 1)]);
    s.style.display = 'none';
    bar.append(s); sets[i] = s;
  }
  p.append(bar);
  const draw = () => padEls.forEach((b, i) => {
    const d = M.pads[i]; if (!d) return;
    const n = d.name || '';
    b.querySelector('b').textContent = n.replace(/^\d+\s+/, '');
    b.classList.toggle('empty', !n);
    if (b.clientWidth) drawWave(b.querySelector('canvas'), d.wave, sliceHex(Math.floor(i / 4)));
  });
  p.draw = () => { draw(); refreshSteps(); scheduleZones(); };
  M.onPads.push(draw);
  selectPad(0);
  return p;
}

// Your files, one tap away. Tap to hear a sound, tap again to put it on the selected pad, or drag it onto any pad.
function SoundBrowser(onLoad) {
  const b = el('div', 'browser');
  const head = el('div', 'bhead', '<button class="tool" aria-label="Up one folder">‹</button><span></span>');
  const cols = el('div', 'bcols'), dirs = el('div', 'blist dirs'), files = el('div', 'blist files');
  cols.append(dirs, files); b.append(head, cols);
  const crumb = head.querySelector('span');
  let path = null, parent = null, roots = [], picked = '';
  press(head.querySelector('button'), () => go(parent));
  const row = (cls, label) => { const r = el('div', 'brow ' + cls); r.textContent = label; return r; };
  async function go(where) {
    const r = await fetch(`/browse?k=${TOKEN}` + (where ? `&path=${encodeURIComponent(where)}` : ''));
    if (!r.ok) { if (where) go(null); return; }
    const j = await r.json();
    dirs.innerHTML = ''; files.innerHTML = '';
    if (j.roots) {
      roots = j.roots; path = null; parent = null;
      crumb.textContent = 'ALL FOLDERS';
      j.roots.forEach(root => { const d = row('dir', root.split('/').pop() || root); tapRow(d, () => go(root)); dirs.append(d); });
      files.append(el('div', 'bnote', 'CHOOSE A FOLDER'));
      return;
    }
    path = j.path;
    parent = roots.includes(path) ? null : path.replace(/\/[^/]+$/, '');
    crumb.textContent = path.split('/').slice(-2).join(' / ').toUpperCase();
    try { localStorage.setItem('marea.lib', path); } catch (e) {}
    j.dirs.forEach(n => { const d = row('dir', n); tapRow(d, () => go(path + '/' + n)); dirs.append(d); });
    // Inside a last folder, keep its neighbours listed so you can hop between categories with one tap.
    if (!j.dirs.length && parent) {
      const up = await (await fetch(`/browse?k=${TOKEN}&path=${encodeURIComponent(parent)}`)).json();
      (up.dirs || []).forEach(n => { const d = row('dir' + (parent + '/' + n === path ? ' here' : ''), n); tapRow(d, () => go(parent + '/' + n)); dirs.append(d); });
      const here = dirs.querySelector('.here'); if (here) here.scrollIntoView({ block: 'nearest' });
    }
    j.files.forEach(n => files.append(fileRow(n)));
    if (!j.files.length) files.append(el('div', 'bnote', j.dirs.length ? 'OPEN A FOLDER' : 'NO SOUNDS HERE'));
  }
  // Rows scroll with a vertical swipe, so a press only counts if the finger stays put.
  function tapRow(r, fn) {
    let x = 0, y = 0, live = false;
    r.addEventListener('pointerdown', e => { x = e.clientX; y = e.clientY; live = true; });
    r.addEventListener('pointercancel', () => { live = false; });
    r.addEventListener('pointerup', e => { if (live && Math.abs(e.clientX - x) < 10 && Math.abs(e.clientY - y) < 10) fn(); live = false; });
  }
  function fileRow(n) {
    const r = row('file', n.replace(/\.[^.]+$/, '').replace(/^\d+\s+/, ''));
    const full = path + '/' + n;
    r.draggable = false;
    let sx = 0, sy = 0, ghost = null, over = null, live = false;
    const clearOver = () => { if (over) over.classList.remove('dropping'); over = null; };
    const end = () => { if (ghost) { ghost.remove(); ghost = null; } clearOver(); live = false; };
    r.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; live = true; try { r.setPointerCapture(e.pointerId); } catch (err) {} });
    r.addEventListener('pointermove', e => {
      if (!live) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (!ghost && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
        ghost = el('div', 'dragghost'); ghost.textContent = r.textContent;
        document.body.append(ghost);
      }
      if (!ghost) return;
      ghost.style.transform = `translate(${e.clientX - 60}px,${e.clientY - 22}px)`;
      const t = document.elementFromPoint(e.clientX, e.clientY), pad = t && t.closest && t.closest('[data-pad]');
      if (pad !== over) { clearOver(); over = pad; if (over) over.classList.add('dropping'); }
    });
    r.addEventListener('pointercancel', end);
    r.addEventListener('pointerup', e => {
      const moved = Math.abs(e.clientX - sx) >= 10 || Math.abs(e.clientY - sy) >= 10;
      if (ghost) {
        if (over) { const i = +over.dataset.pad; M.selectPad(i); onLoad(full, r.textContent); }
        end();
        return;
      }
      if (!live || moved) { end(); return; }
      live = false;
      if (picked === full) { onLoad(full, r.textContent); return; }
      picked = full;
      files.querySelectorAll('.picked').forEach(x => x.classList.remove('picked'));
      r.classList.add('picked');
      send('preview ' + full);
    });
    return r;
  }
  let saved = null;
  try { saved = localStorage.getItem('marea.lib'); } catch (e) {}
  M.onHello.push(async () => {
    if (path) return;
    await go(null);
    if (saved) { go(saved); return; }
    const r = roots[0]; if (!r) return;
    const q = await (await fetch(`/browse?k=${TOKEN}&path=${encodeURIComponent(r)}`)).json();
    go(q.dirs && q.dirs.includes('Riddim') ? r + '/Riddim' : r);
  });
  return b;
}

// ================= DUB =================
const MODE_GLYPHS = ['M1 13 C5 13 5 2 9 2 S13 13 17 13 21 2 25 2', 'M1 13 L6 2 L11 13 L16 2 L21 13 L25 5', 'M1 2 L9 13 V2 L17 13 V2 L25 13', 'M1 13 L9 2 V13 L17 2 V13 L25 2', 'M1 13 H7 V2 H13 V13 H19 V2 H25'];
function DubPage() {
  const p = el('div', 'page');
  const g = el('div', 'dubgrid');

  // ----- siren -----
  const sir = el('div', 'dubcol');
  const sw = el('div', 'oled dubscreen'); const scv = el('canvas'); scv.setAttribute('aria-label', 'Siren pitch drawn over time'); sw.append(scv);
  const modes = el('div', 'modes');
  Radio('sir.mode', 5, i => { const b = el('button', 'modebtn', `<svg viewBox="0 0 26 15"><path d="${MODE_GLYPHS[i]}"/></svg>${MODE_NAMES[i]}`); modes.append(b); return b; });
  const sk = el('div', 'dubknobs');
  [['pitch', 'PITCH'], ['rate', 'RATE'], ['depth', 'DEPTH'], ['tone', 'TONE'], ['tail', 'TAIL'], ['echo', 'ECHO'], ['level', 'LEVEL']].forEach(([k, l], i) => sk.append(barKnob('sir.' + k, l, i)));
  sir.append(sw, modes, sk);

  // ----- tape echo -----
  const ech = el('div', 'dubcol');
  const tw = el('div', 'oled dubscreen'); const tape = el('canvas'); tape.id = 'tape'; tape.setAttribute('aria-label', 'Tape machine. Drag sideways to change the echo time.'); tw.append(tape);
  const ek = el('div', 'dubknobs');
  [['time', 'TIME'], ['feedback', 'REPEATS'], ['tone', 'TONE'], ['wobble', 'WOBBLE'], ['spring', 'SPRING'], ['return', 'RETURN']].forEach(([k, l], i) => ek.append(barKnob('ech.' + k, l, i)));
  ek.append(Toggle('ech.sync', 'SYNC', 'tool syncbtn'));
  ech.append(tw, ek);
  g.append(sir, ech); p.append(g);

  // ----- live mic: talk over the mix -----
  const bar = el('div', 'encbar');
  const open = el('button', 'tool micopen', 'OPEN');
  open.setAttribute('aria-label', 'Open the microphone and talk over the mix');
  press(open, () => {
    const was = pv('mic.on') >= .5;
    send('micon ' + (was ? 0 : 1));
    if (!was) showToast('Mic open. Use headphones or the speaker will feed back.', 3500);
  });
  watch('mic.on', v => open.classList.toggle('on', v >= .5));
  const fx = [];
  for (let i = 0; i < 6; i++) { const b = el('button', 'tool', MIC_FX[i]); fx.push(b); }
  Radio('mic.fx', 6, i => fx[i]);
  bar.append(Bar('MIC', 'var(--red)', [barKnob('mic.level', 'LEVEL', 0), barKnob('mic.echo', 'ECHO', 1)], [open, Toggle('mic.mute', 'MUTE', 'tool'), ...fx]));
  p.append(bar);

  // The siren: three gauges for PITCH, RATE and ECHO, a horn that throws rings while it sounds,
  // and the pitch drawn as it moves. Every knob reshapes something you can see.
  const trace = new Array(150).fill(NaN);
  let sirT = 0, rings = [], ringT = 0;
  const lfoShape = (mode, x) => {
    x = x - Math.floor(x);
    if (mode === 0) return Math.sin(x * 6.283) * .5 + .5;
    if (mode === 1) return x < .5 ? x * 2 : 2 - x * 2;
    if (mode === 2) return 1 - x;
    if (mode === 3) return x;
    return x < .5 ? 1 : 0;
  };
  M.anim.push((now, dt) => {
    if (M.page !== 'dub' || !scv.clientWidth) return;
    const [W, H, dpr] = fitCanvas(scv), c = scv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    const u = vbox(c, W, H, 560, 300), px = dpr / u;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const env = M.sirenEnv || 0, mode = Math.round(pv('sir.mode') * 4), rate = pv('sir.rate'), hz = expMap(rate, .12, 26), depth = pv('sir.depth'), centre = pv('sir.pitch'), rep = pv('sir.echo');
    const live = env > .01;
    sirT += dt * hz;
    const head = lfoShape(mode, sirT);
    trace.shift(); trace.push(live ? head : NaN);
    dots(c, 'SIREN', 18, 14, 2, live ? OL.red : OL.mid);
    dots(c, MODE_NAMES[mode], 542, 14, 2, OL.amber, null, 'right');
    // gauges: dots light up to the value, the needle points at it
    [['PITCH', centre, OL.blue], ['RATE', rate, OL.green], ['ECHO', rep, OL.ink]].forEach(([n, val, col], i) => {
      const gx = 250 + i * 110, gy = 82, r = 38;
      c.strokeStyle = OL.dim; c.lineWidth = 2 * px; c.beginPath(); c.arc(gx, gy, r, Math.PI, 0); c.stroke();
      for (let k = 0; k < 7; k++) {
        const a = Math.PI + k / 6 * Math.PI;
        c.fillStyle = [OL.blue, OL.blue, OL.green, OL.green, OL.ink, OL.red, OL.red][k]; c.globalAlpha = k / 6 <= val + .01 ? 1 : .22;
        c.beginPath(); c.arc(gx + Math.cos(a) * r * .78, gy + Math.sin(a) * r * .78, 2.6, 0, 7); c.fill();
      }
      c.globalAlpha = 1;
      const a = Math.PI + val * Math.PI, nx = gx + Math.cos(a) * r * .5, ny = gy + Math.sin(a) * r * .5;
      c.strokeStyle = col; c.lineWidth = 3 * px; c.beginPath(); c.moveTo(gx - r * .5, gy); c.lineTo(nx, ny); c.stroke();
      c.fillStyle = col; c.beginPath(); c.arc(nx, ny, 5, 0, 7); c.fill(); c.beginPath(); c.arc(gx - r * .5, gy, 3.5, 0, 7); c.fill();
      oledText(c, n, gx, gy + 22, 11, OL.mid, 'center');
    });
    // the horn, throwing rings while it sounds; faster rate, quicker rings
    const hx = 62, hy = 150;
    c.strokeStyle = live ? OL.red : OL.ink; c.lineWidth = 2 * px;
    c.beginPath(); [[-22, -9], [-9, -9], [11, -26], [11, 26], [-9, 9], [-22, 9], [-22, -9]].forEach(([x, y], i) => i ? c.lineTo(hx + x, hy + y) : c.moveTo(hx + x, hy + y)); c.stroke();
    ringT += dt * Math.max(2.5, hz * 1.5);
    if (live && ringT > 1) { ringT = 0; rings.push({ r: 0, a: env }); }
    rings = rings.filter(g => { g.r += dt * 120; g.a *= Math.pow(.2, dt); return g.a > .04 && g.r < 110; });
    rings.forEach(g => { c.strokeStyle = OL.red; c.globalAlpha = g.a * (1 - g.r / 110); c.beginPath(); c.arc(hx + 11, hy, 18 + g.r, -.7, .7); c.stroke(); });
    c.globalAlpha = 1;
    // pitch now, in dot-matrix numbers under the horn
    const [num, unit] = splitNum(fmt('sir.pitch', centre));
    dots(c, num, hx, 210, 3, OL.amber, OL.amberOff, 'center');
    oledText(c, unit.toUpperCase(), hx, 252, 11, OL.amber, 'center');
    // the pitch line: what played in red, echo repeats trailing in blue, what will play in grey
    const x0 = 160, x1 = 470, top = 140, bot = 270;
    const toY = v => bot - (bot - top) * Math.max(0, Math.min(1, centre * .55 + (v - .5) * depth * .8 + .22));
    c.strokeStyle = OL.dim; c.lineWidth = 1.5 * px; c.beginPath(); c.moveTo(x0, bot + 4); c.lineTo(530, bot + 4); c.stroke();
    c.beginPath();
    for (let i = 0; i <= 60; i++) { const x = x1 + (530 - x1) * i / 60, y = toY(lfoShape(mode, sirT + i / 60 * Math.max(.6, Math.min(3, hz / 2)))); i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    for (let k = 2; k >= 0; k--) {
      if (k && rep < .03) continue;
      c.strokeStyle = k ? OL.blue : OL.red; c.globalAlpha = k ? rep * (.55 / k) : 1; c.lineWidth = (k ? 1.5 : 2.5) * px;
      c.beginPath(); let pen = false;
      for (let i = 0; i < trace.length; i++) {
        const v = trace[i], x = x0 + (x1 - x0) * i / (trace.length - 1) - k * 14;
        if (isNaN(v)) { pen = false; continue; }
        const y = toY(v) - k * 4; pen ? c.lineTo(x, y) : c.moveTo(x, y); pen = true;
      }
      c.stroke();
    }
    c.globalAlpha = 1;
    c.strokeStyle = OL.ink; c.lineWidth = 1.5 * px; c.beginPath(); c.moveTo(x1, top - 8); c.lineTo(x1, bot + 4); c.stroke();
    c.fillStyle = live ? OL.ink : OL.mid; c.beginPath(); c.arc(x1, toY(head), live ? 5 + env * 2 : 3.5, 0, 7); c.fill();
    c.setTransform(1, 0, 0, 1, 0, 0);
  });

  // The tape machine. Sound is written at the head block, the repeat lands where TIME says, and each
  // repeat comes round again fainter, by REPEATS. HOLD keeps them going. Drag sideways to change TIME.
  let ang = 0, wound = .5, blips = [], lastEmit = 0, roll = 0, hist = [], histT = 0;
  M.anim.push((now, dt) => {
    if (M.page !== 'dub' || !tape.clientWidth) return;
    const [W, H, dpr] = fitCanvas(tape), c = tape.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H);
    const u = vbox(c, W, H, 680, 360), px = dpr / u;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const sec = Math.max(.03, M.delaySec || .25), held = pv('ech.hold') >= .5, thrown = pv('ech.throw') >= .5, crash = pv('ech.crash') >= .5, lvl = Math.min(1, (M.echoLevel || 0) * 2.4);
    const running = M.run || lvl > .01 || held;
    const speed = running ? 1 : .08;
    ang += dt * speed * (1.4 + 1.2 / Math.max(.15, sec));
    roll += dt * speed * 40;
    wound += dt * (running ? .004 : 0); if (wound > .85) wound = .15;
    const wob = pv('ech.wobble'), fb = held ? 1 : Math.min(1, pv('ech.feedback') * 1.12), tone = pv('ech.tone'), spring = pv('ech.spring');
    const inLevel = thrown ? 1 : lvl;
    const reps = held ? 99 : Math.max(0, Math.round(Math.log(.03) / Math.log(Math.max(.01, Math.min(.98, fb)))));
    // echo time on top, in dot-matrix numbers, over a ruler that rolls with the tape
    const [num, unit] = splitNum(fmt('ech.time', pv('ech.time')));
    dots(c, num, 340, 14, 4.6, OL.amber, OL.amberOff, 'center');
    oledText(c, unit.toUpperCase(), 340 + num.length * 14 + 10, 44, 13, OL.amber);
    c.strokeStyle = OL.dim; c.lineWidth = 1.5 * px;
    for (let i = -6; i <= 6; i++) { const x = 340 + i * 13 - (roll % 13); c.beginPath(); c.moveTo(x, 62); c.lineTo(x, 68); c.stroke(); }
    c.strokeStyle = OL.ink; c.beginPath(); c.moveTo(340, 58); c.lineTo(340, 72); c.stroke();
    // repeats count in a box, top left
    c.strokeStyle = OL.ink; c.lineWidth = 1.5 * px; c.strokeRect(26, 18, 66, 46);
    dots(c, held ? '--' : String(Math.min(99, reps)).padStart(2, '0'), 59, 27, 3.6, held ? OL.amber : OL.ink, OL.inkOff, 'center');
    dots(c, 'REPEATS', 59, 72, 1.3, OL.mid, null, 'center');
    // reels: a tape pack that grows on one side as it shrinks on the other
    const R = 84, ry = 156, xa = 140, xb = 540;
    const reel = (x, rot, full) => {
      c.strokeStyle = '#23252f'; c.lineWidth = R * .5 * full; c.beginPath(); c.arc(x, ry, R * .32 + R * .25 * full, 0, 7); c.stroke();
      c.strokeStyle = OL.ink; c.lineWidth = 2 * px; c.beginPath(); c.arc(x, ry, R, 0, 7); c.stroke();
      for (let i = 0; i < 3; i++) { const a = rot + i * 2.094; c.beginPath(); c.moveTo(x + Math.cos(a) * R * .5, ry + Math.sin(a) * R * .5); c.lineTo(x + Math.cos(a) * R * .86, ry + Math.sin(a) * R * .86); c.stroke(); }
      [.27, .17, .07].forEach(k => { c.beginPath(); c.arc(x, ry, R * k, 0, 7); c.stroke(); });
      for (let i = 0; i < 3; i++) { const a = rot + i * 2.094 + 1; c.beginPath(); c.moveTo(x + Math.cos(a) * R * .27, ry + Math.sin(a) * R * .27); c.lineTo(x + Math.cos(a) * R * .34, ry + Math.sin(a) * R * .34); c.stroke(); }
    };
    reel(xa, ang, 1 - wound); reel(xb, ang * .9, wound);
    // loop arrow between the reels: lit while repeats are coming round, amber on HOLD
    c.strokeStyle = held ? OL.amber : blips.length ? OL.ink : OL.dim; c.lineWidth = 2 * px;
    const lx = 340, ly = 140;
    c.beginPath(); c.moveTo(lx - 10, ly - 14); c.lineTo(lx + 20, ly - 14); c.arc(lx + 20, ly, 14, -1.5708, 1.5708); c.lineTo(lx - 20, ly + 14); c.arc(lx - 20, ly, 14, 1.5708, 4.712); c.stroke();
    c.beginPath(); c.moveTo(lx - 3, ly - 21); c.lineTo(lx - 10, ly - 14); c.lineTo(lx - 3, ly - 7); c.stroke();
    if (held || thrown) dots(c, held ? 'HOLD' : 'THROW', lx, ly + 30, 2, held ? OL.amber : OL.orange, null, 'center');
    // tape path: off each reel, over the guides, through the head block; it shivers with WOBBLE
    const gy = 262, g = [110, 190, 340, 480, 568], sh = Math.sin(now * .012) * wob * 3 * (running ? 1 : .2);
    c.strokeStyle = OL.dim; c.lineWidth = 1.5 * px; c.beginPath();
    [[xa - R * .55, ry + R * .8], [g[0], gy - 12 + sh], [g[1], gy - sh], [g[2], gy - 6], [g[3], gy + sh], [g[4], gy - 12 - sh], [xb + R * .5, ry + R * .82]].forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
    c.stroke();
    c.strokeStyle = OL.ink; c.lineWidth = 2 * px; c.fillStyle = OL.bg;
    const disc = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.stroke(); };
    disc(g[0], gy - 12, 7); disc(g[4], gy - 12, 7); disc(g[1], gy, 11); disc(g[3], gy, 11);
    c.fillStyle = OL.ink; c.beginPath(); c.arc(g[1], gy, 3, 0, 7); c.fill();
    const ra = ang * 3; c.beginPath(); c.moveTo(g[3] - Math.cos(ra) * 7, gy - Math.sin(ra) * 7); c.lineTo(g[3] + Math.cos(ra) * 7, gy + Math.sin(ra) * 7); c.stroke();
    c.fillStyle = OL.bg; c.fillRect(g[2] - 16, gy - 26, 32, 28); c.strokeStyle = inLevel > .05 ? OL.red : OL.ink; c.strokeRect(g[2] - 16, gy - 26, 32, 28);
    c.strokeStyle = OL.ink; c.beginPath(); c.moveTo(g[2], gy - 8); c.lineTo(g[2], 350); c.stroke();
    // tracks: what went onto the tape scrolls left of the head (red), the echo coming back (blue)
    histT += dt;
    if (histT > 1 / 30) { histT = 0; hist.push([inLevel, Math.min(1, Math.max(...(M.levels || [0, 0])) / 99)]); if (hist.length > 80) hist.shift(); }
    const ty = 306;
    hist.forEach(([a, b], i) => {
      const x = 340 - (hist.length - 1 - i) * 3.6;
      if (a > .05) { c.fillStyle = OL.red; c.globalAlpha = Math.min(1, a + .2); c.fillRect(x - 3.6, ty - 1.5, 3.6, 3); }
      if (b > .05) { c.fillStyle = OL.blue; c.globalAlpha = Math.min(1, b + .2); c.fillRect(x - 3.6, ty + 6.5, 3.6, 3); }
    });
    c.globalAlpha = 1;
    c.strokeStyle = OL.dim; c.lineWidth = 1.5 * px;
    for (let i = 0; i < 10; i++) { const x = 40 + ((i * 66 - roll) % 660 + 660) % 660; c.beginPath(); c.moveTo(x, ty - 14); c.lineTo(x, ty - 8); c.stroke(); }
    // repeats: written at the head, they ride the green span to where TIME lands them, then go round again
    lastEmit += dt;
    if (!held && inLevel > .04 && lastEmit > .06) { lastEmit = 0; blips.push({ x: 0, a: inLevel, n: 0 }); if (blips.length > 120) blips.shift(); }
    blips = blips.filter(b => { b.x += dt / sec; if (b.x >= 1) { b.x -= 1; b.n++; b.a *= fb; } return b.a > .05 && b.n < 12; });
    const tt = Math.min(1, Math.log(sec / .03) / Math.log(1.8 / .03)), x1 = 380 + 240 * tt, rcol = held ? OL.amber : OL.green;
    c.strokeStyle = rcol; c.lineWidth = 2 * px; c.globalAlpha = .25 + fb * .6;
    c.beginPath(); c.moveTo(340, ty - 22); c.lineTo(x1, ty - 22); c.stroke(); c.globalAlpha = 1;
    c.fillStyle = rcol; c.beginPath(); c.arc(340, ty - 22, 4, 0, 7); c.fill(); c.beginPath(); c.arc(x1, ty - 22, 4, 0, 7); c.fill();
    blips.forEach(b => { c.fillStyle = b.n ? rcol : OL.red; c.globalAlpha = Math.min(1, b.a + .15); c.beginPath(); c.arc(340 + (x1 - 340) * b.x, ty - 22, 2 + b.a * 3, 0, 7); c.fill(); });
    c.globalAlpha = 1;
    // right: input level bar in red, the amber dot is how much comes back (REPEATS)
    const fx = 650, top = 40, bot = 262;
    c.strokeStyle = '#23252f'; c.lineWidth = 2 * px; c.beginPath(); c.moveTo(fx, top); c.lineTo(fx, bot); c.stroke();
    c.strokeStyle = OL.red; c.beginPath(); c.moveTo(fx, bot - (bot - top) * inLevel); c.lineTo(fx, bot); c.stroke();
    c.fillStyle = OL.amber; c.beginPath(); c.arc(fx, bot - (bot - top) * fb, 5.5, 0, 7); c.fill();
    // left: spring and tone, small glyphs
    const sa = (spring + (crash ? 1 : 0)) * inLevel * 4 + (crash ? 3 : 0);
    c.strokeStyle = crash ? OL.amber : spring > .02 ? OL.violet : OL.dim; c.lineWidth = 1.5 * px; c.beginPath();
    for (let i = 0; i <= 20; i++) { const x = 20 + i * 2, y = 304 + Math.sin(i * 1.9) * 6 + Math.sin(now * .03 + i) * sa; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
    c.strokeStyle = OL.cyan; c.beginPath(); c.moveTo(20, 336); c.lineTo(36, 336); c.lineTo(60, 330 + (1 - tone) * 14); c.stroke();
    c.setTransform(1, 0, 0, 1, 0, 0);
  });
  tape.addEventListener('pointerdown', e => {
    e.preventDefault();
    tape.setPointerCapture(e.pointerId);
    const p0 = M.params['ech.time']; send(`pb ${p0.i}`);
    let lastX = e.clientX, v = p0.v;
    const r = tape.getBoundingClientRect();
    const move = ev => { v = Math.min(1, Math.max(0, v + (ev.clientX - lastX) / r.width)); lastX = ev.clientX; setParam('ech.time', v); };
    const up = () => { send(`pe ${p0.i}`); tape.removeEventListener('pointermove', move); tape.removeEventListener('pointerup', up); tape.removeEventListener('pointercancel', up); };
    tape.addEventListener('pointermove', move); tape.addEventListener('pointerup', up); tape.addEventListener('pointercancel', up);
  });
  p.draw = scheduleZones;
  return p;
}

// ================= MIX =================
function MixPage() {
  const p = el('div', 'page');
  const g = el('div', 'mixgrid');
  const DRUM = 'var(--enc-g)', SYN = 'var(--enc-b)', PERF = 'var(--enc-y)', VOX = 'var(--enc-r)';
  const strips = TRACKS.map(([k, n], i) => ({ icon: k, name: n, color: DRUM, level: `pul.${k}.level`, echo: `pul.${k}.echo`, mute: `pul.${k}.mute`, act: () => M.activity[i] / 99 }));
  strips.push({ icon: 'bass', name: 'BASS', color: SYN, level: 'bas.level', echo: 'bas.echo', mute: 'bas.mute', act: () => M.x[1] / 99 },
    { icon: 'chop', name: 'CHOP', color: SYN, level: 'cho.level', echo: 'cho.echo', mute: 'cho.mute', act: () => M.x[3] / 99 },
    { icon: 'pads', name: 'PADS', color: SYN, level: 'smp.master', mute: 'smp.mute', act: () => Math.max(...M.padAct) / 99 },
    { icon: 'siren', name: 'SIREN', color: PERF, level: 'sir.level', echo: 'sir.echo', act: () => M.sirenEnv },
    { icon: 'mic', name: 'MIC', color: VOX, level: 'mic.level', echo: 'mic.echo', mute: 'mic.mute', act: () => M.x[12] / 99 },
    { icon: 'click', name: 'CLICK', color: PERF, level: 'met.level', mute: null, act: () => 0 });
  // SOLO keeps one channel and mutes the rest; pressing it again puts every mute back as it was.
  let solo = -1, saved = null;
  const soloBtns = [];
  const setSolo = i => {
    if (i === solo) { strips.forEach(x => { if (x.mute) setParam(x.mute, saved[x.mute], true, true); }); solo = -1; saved = null; }
    else {
      if (solo < 0) { saved = {}; strips.forEach(x => { if (x.mute) saved[x.mute] = pv(x.mute); }); }
      strips.forEach((x, n) => { if (x.mute) setParam(x.mute, n === i ? 0 : 1, true, true); });
      solo = i;
    }
    soloBtns.forEach((b, n) => b && b.classList.toggle('on', n === solo));
  };
  const dials = [];
  strips.forEach((s, si) => {
    const st = el('div', 'strip'); st.style.setProperty('--c', s.color);
    const num = el('div', 'num'); const numDots = DotNum(2.3, '--text', 3); num.append(numDots);
    st.innerHTML = `<div class="shead">${pic(ICONS[s.icon])}<span>${s.name}</span></div>`;
    // A small meter dial: the needle swings with what the channel is playing, the red dot holds the last peak.
    const dial = el('canvas', 'mdial'); dial.setAttribute('aria-hidden', 'true');
    dials.push({ c: dial, s, v: 0, peak: 0, hold: 0 });
    st.append(dial, num);
    const f = el('div', 'tfader', '<i class="stem"></i><i class="live"></i><i class="cap"></i>');
    f.setAttribute('role', 'slider'); f.setAttribute('aria-label', s.name + ' level');
    dragValue(f, s.level, 1 / 220);
    hoverShow(f, s.level);
    watch(s.level, v => { f.style.setProperty('--v', v); numDots.set(Math.round(v * 100)); });
    M.onTick.push(() => { if (M.page === 'mix') f.style.setProperty('--a', Math.min(1, (s.act() || 0) * pv(s.level)).toFixed(2)); });
    st.append(f);
    const foot = el('div', 'sfoot');
    if (s.echo) foot.append(Knob(s.echo, '', { color: s.color, size: 30 })); else foot.append(el('div', 'knobgap'));
    if (s.mute) foot.append(Toggle(s.mute, 'M', 'mini m')); else foot.append(el('div', 'minigap'));
    if (s.mute) {
      const sb = el('button', 'mini s', 'S'); sb.setAttribute('aria-label', 'Solo ' + s.name);
      press(sb, () => setSolo(si)); soloBtns[si] = sb; foot.append(sb);
    } else foot.append(el('div', 'minigap'));
    st.append(foot);
    g.append(st);
  });
  p.append(g);
  M.onTick.push(() => {
    if (M.page !== 'mix') return;
    const dim = T('--line2'), txt = T('--text'), red = T('--red');
    dials.forEach(d => {
      const a = Math.min(1, (d.s.act() || 0) * pv(d.s.level));
      d.v = a > d.v ? a : d.v * .86;
      if (d.v >= d.peak) { d.peak = d.v; d.hold = 30; } else if (--d.hold < 0) d.peak *= .97;
      if (!d.c.clientWidth) return;
      const [W, H, dpr] = fitCanvas(d.c), c = d.c.getContext('2d');
      c.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H - 3 * dpr, r = Math.min(W / 2 - 4 * dpr, H - 6 * dpr);
      const ang = v => Math.PI * (1.15 + .7 * v);
      c.lineWidth = 1.5 * dpr; c.strokeStyle = dim;
      c.beginPath(); c.arc(cx, cy, r, ang(0), ang(1)); c.stroke();
      c.strokeStyle = red; c.beginPath(); c.arc(cx, cy, r, ang(.82), ang(1)); c.stroke();
      if (d.peak > .02) { const pa = ang(d.peak); c.fillStyle = red; c.beginPath(); c.arc(cx + Math.cos(pa) * r * .78, cy + Math.sin(pa) * r * .78, 2.2 * dpr, 0, 7); c.fill(); }
      const na = ang(d.v);
      c.strokeStyle = txt; c.lineWidth = 2 * dpr; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(na) * r * 1.02, cy + Math.sin(na) * r * 1.02); c.stroke();
      c.fillStyle = txt; c.beginPath(); c.arc(cx, cy, 2.6 * dpr, 0, 7); c.fill();
    });
  });
  const bar = el('div', 'encbar');
  // CLOCK sends Marea's tempo, start and stop to connected MIDI gear. Inside Live, Live does that job.
  const clock = el('button', 'tool', 'CLOCK');
  clock.setAttribute('aria-label', 'Send MIDI clock, start and stop to connected MIDI gear');
  press(clock, () => {
    const on = pv('midi.clock') < .5;
    setParam('midi.clock', on ? 1 : 0, true, true);
    if (on) showToast(M.x[13] === 0 ? 'No MIDI output found. Connect a USB MIDI interface.' : 'Sending MIDI clock. Gear starts on the next bar.', 3500);
  });
  watch('midi.clock', v => clock.classList.toggle('on', v >= .5));
  M.onHello.push(() => { clock.style.display = M.host === 'Live' ? 'none' : ''; });
  bar.append(Bar('MASTER', '', [barKnob('ech.return', 'ECHO', 0), barKnob('ech.spring', 'SPRING', 1), barKnob('mst.drive', 'DRIVE', 2), barKnob('mst.sweep', 'SWEEP', 3, { sens: 1 / 130 }), barKnob('mst.volume', 'VOL', 0)], [clock]));
  p.append(bar);
  return p;
}

// ================= DECK: performance buttons and keyboard =================
function Deck() {
  const d = el('div'); d.id = 'deck';
  const perf = el('div', 'perf');
  const fire = dotify(Momentary('sir.fire', 'FIRE', 'fire'), 4.4);
  fire.setAttribute('aria-label', 'Fire the siren');
  const paintFire = () => fire.classList.toggle('on', pv('sir.latch') >= .5 || pv('sir.fire') >= .5);
  watch('sir.latch', paintFire); watch('sir.fire', paintFire);
  M.onTick.push(() => fire.style.setProperty('--g', M.sirenEnv.toFixed(2)));
  M.onHello.push(() => zone(fire, -1, 0, 0, M.params['sir.fire'].i, 1));
  const col = el('div', 'perfcol');
  const pb = (k, l, c) => { const b = dotify(Momentary(k, l, 'pbtn'), 1.6); b.style.setProperty('--c', c); M.onHello.push(() => zone(b, -1, 0, 0, M.params[k].i, 1)); return b; };
  col.append(pb('ech.throw', 'THROW', 'var(--enc-b)'), pb('ech.hold', 'HOLD', 'var(--enc-g)'), pb('ech.crash', 'CRASH', 'var(--enc-y)'), pb('seq.drop', 'DROP', 'var(--enc-r)'));
  perf.append(fire, col);
  d.append(perf);
  const keys = el('div'); keys.id = 'keys'; keys.setAttribute('aria-label', 'Keyboard');
  d.append(keys);
  const side = el('div', 'kside');
  const rec = el('button', 'tbtn rec', 'KEY REC');
  rec.setAttribute('aria-label', 'Record keyboard presses into the sequence');
  press(rec, () => { M.keyRec = !M.keyRec; M.cursor = 0; rec.classList.toggle('on', M.keyRec); });
  const names = ['BASS', 'CHOP', 'PADS', 'SOUND'];
  const tg = names.map((l, i) => { const b = el('button', 'tbtn tgt', l); press(b, () => setTarget(i)); return b; });
  tg[3].setAttribute('aria-label', 'Play the selected sound across the keyboard and set its key');
  const zero = el('button', 'tbtn', 'KEY 0'); zero.setAttribute('aria-label', 'Put the selected sound back in its original key');
  press(zero, () => { const s = soundTarget(); if (s) { setParam(s.key, s.zero, true); layout(); } });
  const dn = el('button', 'tbtn', 'OCT−'), up = el('button', 'tbtn', 'OCT+');
  press(dn, () => { M.keyOct = Math.max(-1, (M.keyOct || 0) - 1); layout(); }); press(up, () => { M.keyOct = Math.min(3, (M.keyOct || 0) + 1); layout(); });
  side.append(rec, tg[3], tg[0], tg[1], tg[2], zero, dn, up);
  d.append(side);
  M.target = 0; M.keyOct = 1;
  function setTarget(i) { M.target = i; tg.forEach((b, n) => b.classList.toggle('on', n === i)); layout(); }
  M.setTarget = setTarget;
  // The sound the keyboard is tuning: the selected pad on PADS, the slices on CHOP, otherwise the selected lane.
  function soundTarget() {
    if (M.page === 'pads') return { kind: 'pad', idx: selPad, key: `smp.${selPad + 1}.pitch`, range: 24, zero: .5, color: padVar(selPad), name: 'PAD ' + (selPad + 1) };
    if (M.page === 'chop') return { kind: 'chopkey', idx: selSlice, key: 'cho.pitch', range: 12, zero: .5, color: sliceVar(selSlice), name: 'SLICE ' + (selSlice + 1) };
    return { kind: 'lane', idx: selLane, key: `pul.${TRACKS[selLane][0]}.key`, range: 24, zero: .5, color: TRACKS[selLane][2], name: TRACKS[selLane][1] };
  }

  // 3 octaves: the first 8 semitones are the drum lanes, the rest play the target.
  const TOTAL = 36, WHITE = [0, 2, 4, 5, 7, 9, 11], whites = [], nodes = [];
  for (let i = 0; i < TOTAL; i++) if (WHITE.includes(i % 12)) whites.push(i);
  const pct = 100 / whites.length;
  for (let i = 0; i < TOTAL; i++) {
    const isW = WHITE.includes(i % 12);
    const n = el('button', isW ? 'wkey' : 'bkey');
    if (isW) { const w = whites.indexOf(i); n.style.left = `calc(${w * pct}% + 1px)`; n.style.width = `calc(${pct}% - 2px)`; }
    else { const w = whites.indexOf(i - 1); n.style.left = `calc(${(w + 1) * pct}% - ${pct * .31}%)`; n.style.width = `${pct * .62}%`; }
    keyPress(n, i);
    keys.append(n); nodes[i] = n;
  }
  function action(i) {
    if (i < 8) return { kind: 'drum', idx: i, color: TRACKS[i][2], label: TRACKS[i][1] };
    if (i < 12) return { kind: 'none' };
    const j = i - 12;
    if (M.target === 0) return { kind: 'bass', note: 24 + 12 * M.keyOct + j, color: BASS_COLOR, label: j % 12 === 0 ? 'C' + (M.keyOct + j / 12) : '' };
    if (M.target === 1) { const n = M.chop ? M.chop.starts.length : 0; return j < n ? { kind: 'chop', idx: j, color: sliceVar(j), label: j + 1 } : { kind: 'none' }; }
    if (M.target === 2) return { kind: 'pad', idx: j, color: padVar(j), label: j + 1 };
    const s = soundTarget(), semi = j - 12 + (M.keyOct - 1) * 12;
    if (Math.abs(semi) > s.range) return { kind: 'none' };
    return { kind: 'sound', sound: s, semi, value: (semi + s.range) / (2 * s.range), color: s.color, label: NOTE_NAMES[(semi % 12 + 12) % 12].length === 1 ? NOTE_NAMES[(semi % 12 + 12) % 12] : '' };
  }
  function layout() {
    const s = M.target === 3 ? soundTarget() : null;
    const curSemi = s ? Math.round((pv(s.key) - .5) * 2 * s.range) : null;
    for (let i = 0; i < TOTAL; i++) {
      const a = action(i), n = nodes[i];
      n.style.setProperty('--c', a.color || 'transparent');
      n.classList.toggle('keyon', a.kind === 'sound' && a.semi === curSemi);
      if (WHITE.includes(i % 12)) n.lastChild && n.lastChild.nodeType === 3 ? n.lastChild.textContent = a.label || '' : n.append(document.createTextNode(a.label || ''));
      n.setAttribute('aria-label', a.kind === 'none' ? 'Unused key' : `${a.kind} ${a.label || ''}`);
      if (!M.params['seq.bpm']) continue;
      if (a.kind === 'drum') zone(n, 0, a.idx, .95);
      else if (a.kind === 'bass') zone(n, 2, a.note, .8);
      else if (a.kind === 'chop') zone(n, 3, a.idx, .95);
      else if (a.kind === 'pad') zone(n, 1, a.idx, .95);
      else if (a.kind === 'sound') {
        const m = a.sound.kind === 'lane' ? 0 : a.sound.kind === 'pad' ? 1 : 3;
        zone(n, m, a.sound.idx, .95, M.params[a.sound.key].i, a.value);
      } else delete n.dataset.z;
    }
    scheduleZones();
  }
  M.layoutKeys = layout;
  M.onChop.push(layout);
  function keyPress(n, i) {
    n.addEventListener('pointerdown', e => {
      e.preventDefault();
      n.setPointerCapture(e.pointerId);
      const a = action(i);
      if (a.kind === 'none') return;
      n.classList.add('down');
      noteDown(a);
      const up = ev => {
        if (ev.pointerId !== e.pointerId) return;
        n.classList.remove('down');
        if (a.kind === 'bass') send(`rel 2 ${a.note}`);
        n.removeEventListener('pointerup', up); n.removeEventListener('pointercancel', up);
      };
      n.addEventListener('pointerup', up); n.addEventListener('pointercancel', up);
    });
    n.addEventListener('contextmenu', e => e.preventDefault());
  }
  function noteDown(a) {
    if (a.kind === 'drum') {
      send(`hit 0 ${a.idx} .95`);
      if (M.keyRec) setStep(a.idx, gridStep(), 1);
    } else if (a.kind === 'bass') {
      send(`hit 2 ${a.note} .8`);
      if (M.keyRec) { const s = gridStep(); setBass(s, 256 | a.note); }
    } else if (a.kind === 'chop') {
      selSlice = a.idx;
      send(`hit 3 ${a.idx} .95`);
      if (M.keyRec) setChop(gridStep(), a.idx + 1);
    } else if (a.kind === 'pad') {
      send(`hit 1 ${a.idx} .95`);
      if (M.selectPad && M.page === 'pads') M.selectPad(a.idx);
      if (M.keyRec) setPadStep(a.idx, gridStep(), 1);
    } else if (a.kind === 'sound') {
      // Press a key: the sound plays at that pitch and stays in that key.
      setParam(a.sound.key, a.value, true);
      const s = a.sound;
      if (s.kind === 'lane') { send(`hit 0 ${s.idx} .95`); if (M.keyRec) setStep(s.idx, gridStep(), 1); }
      else if (s.kind === 'pad') { send(`hit 1 ${s.idx} .95`); if (M.keyRec) setPadStep(s.idx, gridStep(), 1); }
      else { send(`hit 3 ${s.idx} .95`); if (M.keyRec) setChop(gridStep(), s.idx + 1); }
      layout();
    }
  }
  M.playKey = i => { const a = action(i); if (a.kind !== 'none') noteDown(a); return a; };
  setTarget(3);
  M.onHello.push(layout);
  return d;
}

// Random beats that still feel like beats: strong positions are more likely, per lane.
function generate() {
  const density = .45 + Math.random() * .35;
  if (M.page === 'bass') {
    const root0 = 24 + Math.round(pv('bas.root') * 11);
    const rows = scaleNotes().filter(n => n <= root0 + 19), root = rows[0];
    for (let s = 0; s < 16; s++) {
      const on = s === 0 || Math.random() < (s % 4 === 0 ? .55 : s % 2 === 0 ? .4 : .28) * (density + .4);
      if (!on) { setBass(s, 0); continue; }
      const n = Math.random() < .45 ? root : rows[Math.floor(Math.random() * rows.length)];
      // Now and then a held note, two to four steps long.
      const L = s < 14 && Math.random() < .18 ? 2 + Math.floor(Math.random() * Math.min(3, 15 - s)) : 1;
      setBass(s, 256 | n | (Math.random() < .2 ? 512 : 0) | (L === 1 && Math.random() < .14 ? 1024 : 0) | ((L - 1) << 11));
      for (let k = 1; k < L; k++) setBass(s + k, 0);
      s += L - 1;
    }
    return;
  }
  if (M.page === 'chop') {
    const n = M.chop ? M.chop.starts.length : 0;
    if (!n) { showToast('Load or record a sound first'); return; }
    for (let s = 0; s < 16; s++) {
      const keep = s % 4 === 0 ? Math.min(s, n - 1) : Math.floor(Math.random() * n);
      setChop(s, Math.random() < .86 ? keep + 1 : 0);
    }
    return;
  }
  if (M.page === 'pads') {
    const used = M.pads.map((d, i) => (d && d.name ? i : -1)).filter(i => i >= 0);
    if (!used.length) { showToast('Put a sound on a pad first'); return; }
    for (let i = 0; i < Sampler_N; i++) { M.ps[M.pattern * Sampler_N + i] = 0; send(`ps ${M.pattern} ${i} 0`); }
    const n = Math.min(used.length, 3 + Math.floor(Math.random() * 3));
    for (let k = 0; k < n; k++) {
      const i = used.splice(Math.floor(Math.random() * used.length), 1)[0];
      let v = 0;
      for (let s = 0; s < 16; s++) if (Math.random() < (s % 4 === 0 ? .26 : s % 2 === 0 ? .16 : .09) * (density + .4)) v |= 1 << s;
      M.ps[M.pattern * Sampler_N + i] = v >>> 0;
      send(`ps ${M.pattern} ${i} ${v >>> 0}`);
    }
    M.onSteps.forEach(f => f());
    return;
  }
  const W = {
    kick: s => s === 0 ? 1 : s === 8 ? .55 : s % 4 === 0 ? .35 : s % 2 === 0 ? .1 : .05,
    snare: s => s === 4 || s === 12 ? .75 : s % 2 ? .08 : .1,
    rim: s => (s % 16) % 3 === 0 ? .4 : .1,
    clap: s => s === 12 ? .4 : s === 4 ? .25 : .03,
    hat: s => s % 2 === 0 ? .85 : .4,
    open: s => s % 4 === 2 ? .35 : .03,
    tom: s => s > 11 ? .22 : .04,
    bell: s => s % 3 === 2 ? .28 : .05,
  };
  TRACKS.forEach(([k], t) => {
    let v = 0;
    for (let s = 0; s < 16; s++) if (Math.random() < W[k](s) * (density + .25)) { v |= 1 << s; if (Math.random() < .22) v |= 1 << (s + 16); }
    send(`st ${M.pattern} ${t} ${v >>> 0}`);
    M.steps[M.pattern * 8 + t] = v >>> 0;
  });
  M.onSteps.forEach(f => f());
}

// ================= DISPLAY: a small black screen at the end of every control bar =================
// It draws the sound you are shaping, so turning a knob visibly bends something.
function Display() {
  const ro = el('div', 'oled'); ro.id = 'readout';
  const cv = el('canvas'); ro.append(cv);
  let ball = 0, prevA = 0;
  const ripple = new Array(8).fill(0);
  function ring(c, W, H, dpr, now) {
    const cx = H * .5 + 2 * dpr, cy = H * .5, rMax = H * .46, rMin = H * .1, p = beatPos(now);
    for (let t = 0; t < 8; t++) {
      const v = M.steps[M.pattern * 8 + t] >>> 0, r = rMax - (rMax - rMin) * t / 7;
      ripple[t] = Math.max((M.activity[t] || 0) / 99, ripple[t] * .75);
      for (let s = 0; s < 16; s++) {
        const a = s / 16 * 6.283 - 1.571, on = v & (1 << s), hit = on && p >= 0 && Math.floor(p) === s;
        c.fillStyle = on ? OLC[t] : OL.dim;
        c.globalAlpha = on ? (t === selLane ? 1 : .75) : .35;
        const d = (on ? (hit ? 2.6 + ripple[t] * 1.6 : 1.5) : .7) * dpr;
        c.beginPath(); c.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, d, 0, 7); c.fill();
      }
    }
    c.globalAlpha = 1;
    if (p >= 0) {
      const a = p / 16 * 6.283 - 1.571;
      c.strokeStyle = OL.ink; c.lineWidth = 1 * dpr; c.beginPath();
      c.moveTo(cx + Math.cos(a) * rMin * .6, cy + Math.sin(a) * rMin * .6); c.lineTo(cx + Math.cos(a) * rMax * 1.04, cy + Math.sin(a) * rMax * 1.04); c.stroke();
    }
    return cx + rMax + 8 * dpr;
  }
  // The selected drum: DECAY stretches it, TUNE and KEY pack the cycles tighter, TONE roughens it, LEVEL lifts it.
  function lane(c, x0, W, H, dpr, dt) {
    const [k, name] = TRACKS[selLane], col = OLC[selLane];
    const d = pv(`pul.${k}.decay`), tu = pv(`pul.${k}.tune`), ke = pv(`pul.${k}.key`), to = pv(`pul.${k}.tone`), le = pv(`pul.${k}.level`);
    const act = (M.activity[selLane] || 0) / 99;
    if (act > prevA + .1) ball = 0;
    prevA = act;
    ball = Math.min(1, ball + dt * (1.2 - d * .9));
    const w = W - x0 - 6 * dpr, mid = H * .58, amp = H * .36 * (.35 + le * .65);
    const cycles = (5 + tu * 18) * Math.pow(2, (ke - .5) * 4), tau = .12 + d * .5;
    c.strokeStyle = col; c.lineWidth = 1.2 * dpr; c.beginPath();
    for (let i = 0; i <= 120; i++) {
      const u = i / 120, e = Math.exp(-u / tau), w1 = Math.sin(u * cycles * 6.283), w2 = Math.sin(u * cycles * 3.3 * 6.283) * to * .6;
      const y = mid - (w1 + w2) / (1 + to * .6) * e * amp;
      i ? c.lineTo(x0 + u * w, y) : c.moveTo(x0 + u * w, y);
    }
    c.stroke();
    c.strokeStyle = OL.ink; c.lineWidth = 1 * dpr; c.beginPath();
    for (let i = 0; i <= 60; i++) { const u = i / 60, y = mid - Math.exp(-u / tau) * amp; i ? c.lineTo(x0 + u * w, y) : c.moveTo(x0 + u * w, y); }
    c.stroke();
    if (ball < 1) { c.fillStyle = OL.ink; c.beginPath(); c.arc(x0 + ball * w, mid - Math.exp(-ball / tau) * amp, 2.6 * dpr, 0, 7); c.fill(); }
    oledText(c, name, x0, 13 * dpr, 12 * dpr, col);
    if (Math.round((ke - .5) * 48)) oledText(c, fmt(`pul.${k}.key`, ke), W - 6 * dpr, 13 * dpr, 12 * dpr, OL.yellow, 'right');
  }
  // The bass: one cycle of the voice beside the filter curve, which jumps when a note fires.
  function bass(c, W, H, dpr) {
    const vc = Math.round(pv('bas.voice') * 6), wv = pv('bas.wave'), lvl = (M.x[1] || 0) / 99;
    const wW = W * .36, mid = H * .56, a = H * .3;
    c.strokeStyle = BASS_DISP; c.lineWidth = 1.4 * dpr; c.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80, ph = u * 2 % 1; let y;
      if (vc === 1) y = Math.sin(ph * 6.283) + Math.sin(ph * 12.566) * wv * .3;
      else if (vc === 2) y = ((ph * 2 - 1) + ((ph * 1.02 + .3) % 1 * 2 - 1)) * .5;
      else if (vc === 3) y = Math.sin(ph * 6.283 + (1 + lvl * 3) * Math.sin(ph * 6.283 * (1 + Math.floor(wv * 3.99))));
      else if (vc === 5) y = (Math.sin(ph * 6.283) + Math.sin(ph * 12.566) * .5 + Math.sin(ph * 18.85) * (.1 + wv * .5)) * .65;
      else if (vc === 6) y = ph < .12 + wv * .35 ? 1 : -1;
      else y = (ph * 2 - 1) * (1 - wv) + (ph < .5 ? 1 : -1) * wv;
      const x = 6 * dpr + u * wW; i ? c.lineTo(x, mid - y * a) : c.moveTo(x, mid - y * a);
    }
    c.stroke();
    const cut = Math.min(1, pv('bas.cutoff') + pv('bas.env') * lvl * .5), Q = pv('bas.reso'), x0 = wW + 16 * dpr, w = W - x0 - 6 * dpr;
    c.strokeStyle = OL.green; c.lineWidth = 1.4 * dpr; c.beginPath();
    for (let i = 0; i <= 70; i++) {
      const u = i / 70, d = (u - cut) * 5, gain = d < 0 ? 1 : Math.exp(-d * 2), peak = Q * Q * 1.3 * Math.exp(-d * d * 18);
      const y = H * .88 - (gain * .5 + peak * .4) * H * .72;
      i ? c.lineTo(x0 + u * w, y) : c.moveTo(x0 + u * w, y);
    }
    c.stroke();
    oledText(c, BASS_VOICES[vc], 6 * dpr, 13 * dpr, 12 * dpr, BASS_DISP);
    if (M.x[0] >= 0) oledText(c, NOTE_NAMES[M.x[0] % 12] + (Math.floor(M.x[0] / 12) - 1), W - 6 * dpr, 13 * dpr, 12 * dpr, OL.ink, 'right');
  }
  // A pad or slice: PITCH squeezes the picture, LENGTH cuts it, REV turns it round.
  function sample(c, W, H, dpr, data, col, pitch, len, rev, active, label) {
    if (!data || !data.length) { oledText(c, 'EMPTY', W / 2, H / 2 + 4 * dpr, 13 * dpr, OL.dim, 'center'); return; }
    const sq = Math.pow(2, -(pitch - .5) * 2), w = (W - 12 * dpr) * Math.min(1, sq), mid = H * .58, a = H * .34;
    c.fillStyle = col;
    for (let i = 0; i < data.length; i++) {
      const u = i / data.length, x = rev ? 6 * dpr + w * (1 - u) : 6 * dpr + w * u, h = Math.max(.5 * dpr, data[i] / 99 * a);
      c.globalAlpha = u > len ? .18 : .6 + active * .4;
      c.fillRect(x, mid - h, Math.max(dpr, w / data.length * .6), h * 2);
    }
    c.globalAlpha = 1;
    if (len < .99) { c.fillStyle = OL.red; c.fillRect(6 * dpr + w * len, H * .2, 1.2 * dpr, H * .72); }
    oledText(c, label, 6 * dpr, 13 * dpr, 12 * dpr, col);
  }
  function scope(c, W, H, dpr) {
    const o = M.scope || [];
    c.strokeStyle = OL.cyan; c.lineWidth = 1.3 * dpr; c.beginPath();
    for (let i = 0; i < o.length; i++) { const x = i / (o.length - 1) * W, y = H / 2 - o[i] / 99 * H * .44; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
  M.anim.push((now, dt) => {
    if (!cv.clientWidth) return;
    const [W, H, dpr] = fitCanvas(cv), c = cv.getContext('2d');
    c.clearRect(0, 0, W, H); c.lineCap = 'round'; c.lineJoin = 'round';
    const pg = M.page;
    if (pg === 'pulse') { const x0 = ring(c, W, H, dpr, now); lane(c, x0, W, H, dpr, dt); }
    else if (pg === 'bass') bass(c, W, H, dpr);
    else if (pg === 'pads') {
      const d = M.pads[selPad], k = `smp.${selPad + 1}.`;
      sample(c, W, H, dpr, d && d.wave, OLC[Math.floor(selPad / 4) % 8], pv(k + 'pitch'), pv(k + 'decay') >= .99 ? 1 : pv(k + 'decay'), pv(k + 'rev') >= .5, (M.padAct[selPad] || 0) / 99, d && d.name ? d.name.toUpperCase() : 'PAD ' + (selPad + 1));
    } else if (pg === 'chop') {
      const d = M.chop; let data = null;
      if (d) { const a = d.starts[selSlice] || 0, z = selSlice + 1 < d.starts.length ? d.starts[selSlice + 1] : 1; data = d.wave.slice(Math.floor(a * d.wave.length), Math.max(Math.floor(a * d.wave.length) + 2, Math.ceil(z * d.wave.length))); }
      sample(c, W, H, dpr, data, OLC[selSlice % 8], pv('cho.pitch'), 1, pv('cho.rev') >= .5, (M.x[3] || 0) / 99, 'SLICE ' + (selSlice + 1));
    } else scope(c, W, H, dpr);
    // What you are touching, large, then it gets out of the way.
    const t = M.touched;
    if (t && now - t.t < 1400 && M.params[t.key]) {
      c.fillStyle = OL.bg; c.globalAlpha = .82; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
      oledText(c, M.params[t.key].n.toUpperCase(), 8 * dpr, 16 * dpr, 12 * dpr, OL.mid);
      const val = fmt(t.key, M.params[t.key].v), [vn, vu] = splitNum(val);
      if (vn !== '--' && vn.length <= 7) { dots(c, vn, 8 * dpr, H - 44 * dpr, 4 * dpr, OL.amber, OL.amberOff); if (vu) oledText(c, vu.toUpperCase(), 8 * dpr + vn.length * 24 * dpr + 6 * dpr, H - 17 * dpr, 13 * dpr, OL.amber); }
      else oledText(c, val, 8 * dpr, H - 16 * dpr, 30 * dpr, OL.amber, 'left', 400);
      c.fillStyle = OL.dim; c.fillRect(8 * dpr, H - 8 * dpr, W - 16 * dpr, 2 * dpr);
      c.fillStyle = OL.orange; c.fillRect(8 * dpr, H - 8 * dpr, (W - 16 * dpr) * M.params[t.key].v, 2 * dpr);
    }
  });
  return ro;
}
const BASS_DISP = '#e0649f';

// ================= dialogs =================
function closeOverlay() { const o = document.getElementById('overlay'); o.hidden = true; o.innerHTML = ''; }
function openOverlay(node) {
  const o = document.getElementById('overlay');
  o.innerHTML = ''; o.append(node); o.hidden = false;
  o.onpointerdown = e => { if (e.target === o) closeOverlay(); };
}
function openSave() {
  const d = el('div', 'dialog');
  d.innerHTML = `<h2>SAVE THIS SONG</h2><p>Saves your patterns, chain, sounds and every knob.</p>
    <div class="row"><input type="text" placeholder="Song name" autocomplete="off" autocapitalize="words" aria-label="Song name"><button class="dbtn pri" data-a="save">Save</button></div>
    <div class="row" style="justify-content:flex-end"><button class="dbtn" data-a="close">Cancel</button></div>`;
  const inp = d.querySelector('input');
  inp.value = M.songName || '';
  const save = () => { const n = inp.value.trim(); if (!n) { inp.focus(); return; } M.songName = n; send('save ' + n); closeOverlay(); showToast(`Saved ${n}`); };
  d.querySelector('[data-a=save]').onclick = save;
  d.querySelector('[data-a=close]').onclick = closeOverlay;
  inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') save(); });
  openOverlay(d);
  inp.focus();
}
async function openSongs() {
  const d = el('div', 'dialog');
  d.innerHTML = `<h2>OPEN A SONG</h2><div class="flist"></div><div class="row" style="justify-content:flex-end"><button class="dbtn pri">Close</button></div>`;
  d.querySelector('.dbtn').onclick = closeOverlay;
  const list = d.querySelector('.flist');
  openOverlay(d);
  const names = await (await fetch(`/songs?k=${TOKEN}`)).json();
  if (!names.length) list.append(el('div', 'fitem', 'No saved songs yet.'));
  names.forEach(n => { const b = el('button', 'fitem'); b.textContent = n; b.onclick = () => { M.songName = n; send('open ' + n); closeOverlay(); showToast(`Opened ${n}. UNDO LOAD brings back what you had.`); }; list.append(b); });
}
function openIPad() {
  const d = el('div', 'dialog');
  d.innerHTML = `<h2>PLAY FROM THE iPAD</h2>
    <div class="ipadbox"><img src="/qr.png" alt="QR code with the iPad address"><div>
    <p>Join the same Wi-Fi as this Mac, then point the iPad camera at this code and open the link in Safari.</p>
    <p style="margin-top:9px">In Safari use Share, then Add to Home Screen, for a full-screen Marea icon.</p></div></div>
    <div class="urlbox"></div>
    <div class="row" style="justify-content:flex-end"><button class="dbtn pri">Done</button></div>`;
  d.querySelector('.urlbox').textContent = M.url;
  d.querySelector('.dbtn').onclick = closeOverlay;
  openOverlay(d);
}
function uploadFile(file, pad, done) {
  fetch(`/upload?k=${TOKEN}&pad=${pad}&name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file })
    .then(async r => done(r.ok ? 'LOADED' : await r.text()))
    .catch(() => done('Upload failed'));
}
function openLoader(pad) {
  const isChop = pad === 100, isLane = pad >= 200;
  const d = el('div', 'dialog');
  d.innerHTML = `<h2>${isChop ? 'CHOP A FILE' : isLane ? 'LOAD ONTO ' + TRACKS[pad - 200][1] : 'LOAD ONTO PAD ' + (pad + 1)}</h2><div class="crumb"></div><div class="flist"></div>
    <div class="notice"></div>
    <div class="row"><label class="dbtn" style="display:flex;align-items:center;cursor:pointer">From this device…<input type="file" accept="audio/*,.wav,.aif,.aiff,.mp3,.flac,.m4a" style="display:none"></label>
    ${isChop || isLane ? '' : '<button class="dbtn" data-a="builtin">Original sound</button>'}<span class="spacer" style="flex:1"></span><button class="dbtn pri" data-a="close">Close</button></div>`;
  const list = d.querySelector('.flist'), crumb = d.querySelector('.crumb'), notice = d.querySelector('.notice');
  d.querySelector('[data-a=close]').onclick = closeOverlay;
  const bi = d.querySelector('[data-a=builtin]');
  if (bi) bi.onclick = () => { send('builtin ' + pad); closeOverlay(); };
  d.querySelector('input').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    notice.textContent = 'Sending ' + f.name + '…';
    uploadFile(f, pad, r => { if (r === 'LOADED') closeOverlay(); else notice.textContent = r; });
  };
  const item = (label, cls, fn) => { const b = el('button', 'fitem ' + cls); b.textContent = label; b.onclick = fn; list.append(b); };
  const browse = async path => {
    list.innerHTML = '';
    const r = await fetch(`/browse?k=${TOKEN}` + (path ? `&path=${encodeURIComponent(path)}` : ''));
    const j = await r.json();
    if (j.roots) {
      crumb.textContent = 'Choose a folder';
      j.roots.forEach(root => item(root.replace(/^.*\/(Documents|Desktop\/music|Music|Downloads|Library\/Application Support\/Marea\/Samples)/, '$1'), 'dir', () => browse(root)));
      return;
    }
    crumb.textContent = j.path.replace(/^\/Users\/[^/]+\//, '~/');
    item('‹ All folders', 'dir', () => browse(null));
    j.dirs.forEach(n => item(n, 'dir', () => browse(j.path + '/' + n)));
    j.files.forEach(n => item(n, '', () => {
      if (isChop) { send(`chopfile ${j.path}/${n}`); closeOverlay(); }
      else if (isLane) { send(`lanefile ${pad - 200} ${j.path}/${n}`); send(`hit 0 ${pad - 200} .95`); notice.textContent = 'Loaded ' + n + '. Tap another to swap, or Close.'; }
      else { send(`loadpath ${pad} ${j.path}/${n}`); notice.textContent = 'Loaded ' + n + '. Tap another to swap, or Close.'; }
    }));
    if (!j.dirs.length && !j.files.length) notice.textContent = 'No audio files in this folder.';
  };
  openOverlay(d);
  browse(null);
}

// ================= build =================
const PAGE_DEFS = { lib: ['LIB', ICONS.lib, 'var(--accent)'], pulse: ['PULSE', ICONS.grid, 'var(--c0)'], bass: ['BASS', ICONS.bass, 'var(--salmon)'], chop: ['CHOP', ICONS.chop, 'var(--c5)'], pads: ['PADS', ICONS.pads, 'var(--amber)'], dub: ['DUB', ICONS.dub, 'var(--red)'], mix: ['MIX', ICONS.mix, 'var(--c6)'] };
function setPage(name) {
  M.page = name;
  for (const k in M.pages) M.pages[k].hidden = k !== name;
  M.readoutEl.hidden = name === 'lib';
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('on', t.dataset.v === name));
  // What a connected MIDI keyboard plays follows the page you're on.
  if (name === 'pulse') { setParam('key.target', 0, true, true); M.setTarget(3); }
  if (name === 'bass') { setParam('key.target', .5, true, true); M.setTarget(0); }
  if (name === 'chop') { setParam('key.target', 1, true, true); M.setTarget(1); }
  if (name === 'pads') M.setTarget(2);
  if (M.layoutKeys) M.layoutKeys();
  if (M.pages[name].draw) M.pages[name].draw();
  scheduleZones();
  try { localStorage.setItem('marea.page', name); } catch (e) {}
}
// Fill the screen exactly, whatever its shape, keeping controls at their designed size.
function fit() {
  const vp = document.getElementById('viewport'), s = document.getElementById('stage');
  const W = vp.clientWidth, H = vp.clientHeight;
  if (!W || !H) return;
  const k = Math.min(W / 1240, H / 800);
  s.style.width = (W / k) + 'px';
  s.style.height = (H / k) + 'px';
  s.style.transform = `scale(${k})`;
  if (M.page && M.pages[M.page].draw) M.pages[M.page].draw();
  scheduleZones();
}
window.onThemeChange = () => { if (M.page && M.pages[M.page].draw) M.pages[M.page].draw(); };
window.buildPanel = function () {
  M.anim.push(() => dotLabels.forEach(cv => { if (cv.offsetParent) drawDotLabel(cv); }));
  const stage = document.getElementById('stage');
  stage.append(Header(), ChainBar());
  const tabs = el('div'); tabs.id = 'tabs';
  const screen = el('div'); screen.id = 'screen';
  M.pages = { lib: LibPage(), pulse: PulsePage(), bass: BassPage(), chop: ChopPage(), pads: PadsPage(), dub: DubPage(), mix: MixPage() };   // <- new modules join here
  const ro = Display();
  M.readoutEl = ro;
  for (const k in M.pages) {
    screen.append(M.pages[k]);
    const [lab, icon, col] = PAGE_DEFS[k];
    const b = el('button', 'tab', `${pic(icon)}${lab}`);
    b.dataset.v = k; b.style.setProperty('--tc', col);
    press(b, () => setPage(k));
    tabs.append(b);
  }
  screen.append(ro);
  const toast = el('div'); toast.id = 'toast'; toast.hidden = true; screen.append(toast);
  stage.append(tabs, screen, Deck());
  // Chain ADD mode turns pattern letters into "add this bar".
  document.querySelectorAll('.patbtn').forEach((b, i) => b.addEventListener('pointerdown', () => { if (M.dupArmed) M.dupTo(i); else if (M.chainEdit) M.chainAdd(i); }));
  // Mac typing keys: A S D F G H J K play the drum lanes.
  document.addEventListener('keydown', e => {
    if (e.repeat || e.metaKey || e.ctrlKey) return;
    if (document.getElementById('overlay').children.length) return;
    if (e.code === 'Space') { e.preventDefault(); send('play'); return; }
    const i = 'asdfghjk'.indexOf(e.key.toLowerCase());
    if (i >= 0) M.playKey(i);
  });
  window.addEventListener('resize', fit);
  // iOS can change the safe area without a resize event, so watch the box itself.
  if (window.ResizeObserver) new ResizeObserver(fit).observe(document.getElementById('viewport'));
  fit();
  let saved = null;
  try { saved = localStorage.getItem('marea.page'); } catch (e) {}
  setPage(M.pages[saved] ? saved : 'lib');
  (M.onLanes || []).forEach(f => f());
};
