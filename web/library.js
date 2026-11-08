// Premade sequences, slowest first. Tempos and hit positions were checked against rhythm statistics from
// tracks in Francisco's own library; the patterns themselves are written from scratch and hold no audio.
// Lanes: k kick, s snare, r rim, c clap, h hat, o open hat, t tom, b bell. x = hit, X = accent.
// Bass: MIDI note, a = accent, s = slide into the next note, - = rest. voice: 0 ACID 1 SUB 2 REESE 3 FM 4 WOBBLE 5 ORGAN 6 REED.
const V = n => n / 6;
const GENRES = [
  { name: 'DUB', bpm: 72, swing: .12, a: { k: '........X.......', r: '........X.......', h: 'x.x.x.x.x.x.x.x.', o: '..............x.', b: '....x.......x...', bass: '43a - - 46 - - 43 - - - 41 - 38 - 41 -' },
    v: { k: 'X...x...x...x...', r: '....X.......X...', h: '..x...x...x...x.', b: '....x.......x...', bass: '31a - 43 - 31 - 43 - 34 - 46 - 29 - 41 -' },
    kit: { 'bas.voice': V(1), 'bas.cutoff': .3, 'bas.reso': .15, 'bas.env': .15, 'bas.decay': .6, 'bas.sub': .55, 'ech.feedback': .62, 'pul.rim.echo': .5, 'pul.snare.echo': .3, 'pul.bell.tone': .3, 'pul.bell.echo': .5 } },
  { name: 'TRIP HOP', bpm: 82, swing: .24, a: { k: 'X......x..x.....', s: '....X.......X...', r: '.......x.....x..', h: 'x.x.x.x.x.x.x.x.', o: '..............x.', bass: '31a - - - - - - 34 - - 36 - - - 29 -' },
    v: { k: 'X.....x...x..x..', s: '....X..x....X...', h: 'x.xxx.x.x.xxx.x.', r: '...x.......x....', bass: '31a - - - 38 - - 36 - - 34 - - - 29 -' },
    kit: { 'bas.voice': V(1), 'bas.cutoff': .24, 'bas.reso': .1, 'bas.env': .12, 'bas.decay': .75, 'bas.sub': .4, 'pul.kick.tone': .35, 'pul.kick.decay': .55, 'pul.snare.tone': .3, 'pul.snare.decay': .6, 'pul.snare.tune': .4, 'pul.hat.tone': .3, 'pul.snare.echo': .22, 'mst.drive': .3 } },
  { name: 'DOWNTEMPO', bpm: 92, swing: .18, a: { k: 'X.........x.....', s: '....X.......X...', r: '..x.....x.....x.', h: 'x.x.x.x.x.x.x.x.', bass: '36a - - 36 - - 43 - 41 - - 39 - - 36 -' },
    v: { k: 'X......x..x.....', s: '....X.......X...', h: 'x.xxx.x.x.xxx.x.', t: '..............x.', b: '...x.......x....', bass: '36a - - 48 - - 43 - 41 - - 39 - 34 - -' },
    kit: { 'bas.voice': V(5), 'bas.cutoff': .42, 'bas.reso': .08, 'bas.env': .1, 'bas.decay': .7, 'bas.level': .5, 'pul.kick.tone': .4, 'pul.snare.tone': .4, 'pul.rim.echo': .45, 'pul.bell.echo': .55, 'pul.bell.tone': .35, 'ech.feedback': .5 } },
  { name: 'REGGAETON', bpm: 96, swing: 0, a: { k: 'X...X...X...X...', s: '...X..X....X..X.', h: 'x.x.x.x.x.x.x.x.', bass: '31a - - 31 - - 31 - 29 - - 29 - - 29 -' },
    v: { k: 'X...X...X...X...', s: '...X..X....X.xX.', h: 'x.x.x.x.x.xxx.x.', r: '.x.....x.x.....x', t: '............x.x.', bass: '31a - - 31 - - 34 - 29 - - 29 - - 26 -' },
    kit: { 'bas.voice': V(1), 'bas.cutoff': .3, 'bas.reso': .08, 'bas.env': .12, 'bas.decay': .5, 'bas.sub': .5, 'pul.kick.tone': .55, 'pul.kick.decay': .45, 'pul.snare.tune': .62, 'pul.snare.decay': .3, 'pul.snare.tone': .55 } },
  { name: 'DEMBOW', bpm: 112, swing: 0, a: { k: 'X...X..xX...X..x', s: '...X..X....X..X.', h: 'x.x.x.x.x.x.x.x.', t: '.......x......xx', bass: '31a - - 31 - - 34 - 29 - - 29 - - 34 -' },
    v: { k: 'X...X..xX..xX.x.', s: '...X..X....X.xX.', r: '.x...x...x...x..', h: 'xxx.x.xxx.x.x.xx', t: '............x.xx', bass: '31a - - 43 - - 34 - 29a - - 41 - - 34 -' },
    kit: { 'bas.voice': V(1), 'pul.snare.tune': .6, 'pul.snare.decay': .28, 'pul.kick.tone': .65, 'pul.tom.tune': .6, 'pul.tom.decay': .3, 'bas.cutoff': .3, 'bas.reso': .12, 'bas.sub': .5, 'mst.drive': .3 } },
  { name: 'ACID', bpm: 126, swing: .06, a: { k: 'X...X...X...X...', c: '....X.......X...', o: '..x...x...x...x.', r: '...x.......x....', bass: '31a 31 43a 31 34s 46 31 43a 31 31 41a 31 38s 41 31 43a' },
    v: { k: 'X...X...X...X.x.', c: '....X.......X...', h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.', bass: '31a 43 31 46a 31 41s 43 31 34a 46 31 38s 41 31 43a 50' },
    kit: { 'bas.voice': V(0), 'bas.wave': .1, 'bas.cutoff': .32, 'bas.reso': .82, 'bas.env': .7, 'bas.decay': .28, 'bas.accent': .8, 'bas.drive': .45, 'bas.sub': .05, 'bas.echo': .15 } },
  { name: 'UK FUNKY', bpm: 130, swing: .2, a: { k: 'X..x..x.X..x..x.', c: '....X.......X...', o: '..x...x...x...x.', t: 'x..x..x...x.x...', b: '...x.......x....', bass: '36a - - 36 - - 43 - - 36 - - 39 - 34 -' },
    v: { k: 'X..x..x.X..x..x.', c: '....X...x...X...', h: 'x.x.x.x.x.x.x.x.', t: '..x..x..x..x..x.', r: '.x.....x.x.....x', bass: '36a - 48 - - 36 - 34 - - 46 - 36 - 39 -' },
    kit: { 'bas.voice': V(3), 'pul.tom.tune': .62, 'pul.tom.decay': .35, 'pul.tom.echo': .15, 'pul.open.decay': .3, 'bas.wave': .3, 'bas.cutoff': .35, 'bas.reso': .3, 'bas.env': .35, 'bas.decay': .3 } },
  { name: 'BAILE', bpm: 130, swing: 0, a: { k: 'X..x..x...x..x..', t: '..x...x..x...x..', r: '....x.......x...', bass: '31a - - 31 - - 31 - - - 34 - - 31 - -' },
    v: { k: 'X..x..x...x.x...', t: '..x...x..x..xx.x', c: '....x.......x...', h: 'x...x...x...x...', r: '.x.x...x.x.x...x', bass: '31a - - 31 - - 38 - - - 36 - - 34 - -' },
    kit: { 'bas.voice': V(1), 'pul.tom.tune': .32, 'pul.tom.decay': .45, 'pul.tom.tone': .7, 'pul.tom.level': .8, 'pul.kick.tone': .85, 'pul.kick.decay': .4, 'pul.rim.tune': .7, 'bas.cutoff': .3, 'bas.reso': .1, 'bas.env': .15, 'bas.sub': .6, 'mst.drive': .35 } },
  { name: '2-STEP', bpm: 132, swing: .36, a: { k: 'X.....x...x.....', s: '....X.......X...', h: '..x...x...x...x.', r: '.......x.x......', b: '.....x.......x..', bass: '40a - - 40 - - - 43 - - 45 - - 38 - -' },
    v: { k: 'X.....x..x......', s: '....X.......X..x', h: '..xx..x...x.x.x.', r: '...x.......x....', o: '..............x.', bass: '40a - 52 - - 40 - - 43 - - 45s 47 - 38 -' },
    kit: { 'bas.voice': V(2), 'pul.snare.tune': .62, 'pul.snare.decay': .3, 'pul.rim.echo': .25, 'bas.detune': .3, 'bas.cutoff': .36, 'bas.reso': .3, 'bas.env': .3, 'bas.decay': .4, 'bas.sub': .4 } },
  { name: 'GARAGE', bpm: 134, swing: .42, a: { k: 'X...X...X...X...', c: '....X.......X...', o: '..x...x...x...x.', h: 'x.x.x.x.x.x.x.x.', r: '.......x.....x..', bass: '36a - - 36 - - 39 - - 36 - - 34 - 39 -' },
    v: { k: 'X...X...X.x.X...', c: '....X.......X..x', o: '..x...x...x...x.', h: 'xxx.xxx.xxx.xxx.', b: '...x.....x......', bass: '36a - 48 - 36 - - 39 - 34 - - 46 - 39 -' },
    kit: { 'bas.voice': V(0), 'pul.kick.decay': .4, 'pul.clap.decay': .4, 'pul.open.decay': .25, 'bas.wave': .7, 'bas.cutoff': .32, 'bas.reso': .4, 'bas.env': .35, 'bas.decay': .28, 'bas.detune': .25 } },
  { name: 'GRIME', bpm: 140, swing: 0, a: { k: 'X.....x...x.....', c: '....X.......X...', h: '..x...x...x...x.', b: 'x..x..x.....x.x.', bass: '31a - - - - - 31 - - - 34 - - 29 - -' },
    v: { k: 'X..x..x...x..x..', c: '....X.......X...', h: 'xxx.x.xxx.x.x.xx', t: '..........x.x.x.', b: 'x..x..x...x.....', bass: '31a - - 31 - - 31 - - 37 - - 36 - 34 -' },
    kit: { 'bas.voice': V(0), 'pul.bell.tune': .34, 'pul.bell.tone': .78, 'pul.bell.decay': .3, 'pul.bell.level': .55, 'pul.kick.tone': .7, 'bas.wave': .9, 'bas.cutoff': .3, 'bas.reso': .12, 'bas.env': .12, 'bas.decay': .8, 'bas.sub': .3, 'bas.drive': .6 } },
  { name: 'DUBSTEP', bpm: 140, swing: .05, a: { k: 'X.........X.....', s: '........X.......', h: '..x...x...x...x.', r: '......x.......x.', bass: '31a 31s 43 - 31 - - 41s 31 - 34 - 29a - 31 -' },
    v: { k: 'X..x......X.....', s: '........X.....x.', h: 'x.x.x.x.x.x.x.x.', t: '............x.x.', bass: '31a - 31s 46 31 - 34 - 31a 43s 31 - 29 - 41 -' },
    kit: { 'bas.voice': V(4), 'pul.snare.tone': .55, 'pul.snare.echo': .25, 'bas.wave': .25, 'bas.cutoff': .2, 'bas.reso': .55, 'bas.env': .2, 'bas.decay': .5, 'bas.drive': .7, 'ech.feedback': .55 } },
  { name: 'SPEED DEMBOW', bpm: 150, swing: 0, a: { k: 'X...X...X...X...', s: '...X..X....X..X.', t: '..x...x...x..x..', b: 'x..x..x.x..x..x.', bass: '31a - - 31 - - 31 - 31 - - 34 - - 31 -' },
    v: { k: 'X..xX...X..xX.x.', s: '...X..X....XxxX.', t: '..x..xx...x..xxx', h: 'x.x.x.x.x.x.x.x.', bass: '31a - - 31 - - 38 - 31 - - 36 - - 34 -' },
    kit: { 'bas.voice': V(1), 'pul.snare.tune': .66, 'pul.snare.decay': .2, 'pul.snare.tone': .65, 'pul.kick.tone': .85, 'pul.kick.decay': .32, 'pul.tom.tune': .68, 'pul.tom.decay': .2, 'pul.bell.level': .35, 'pul.bell.decay': .15, 'bas.cutoff': .28, 'bas.sub': .55, 'mst.drive': .42 } },
  { name: 'JUKE', bpm: 160, swing: 0, a: { k: 'X..x..x...x..x..', c: '............X...', h: 'xxx.xxx.xxx.xxx.', r: '...x..x....x..x.', t: '............x.xx', bass: '31a - - 31 - - 31 - - - 31 - - 31 - -' },
    v: { k: 'X..x..x...x..x.x', c: '....x.......X.x.', h: 'x.xxx.xxx.xxx.xx', r: '.x..x..x.x..x...', t: '........x.x.x.x.', bass: '31a - - 31 - - 34 - - 31 - - 29 - 29 -' },
    kit: { 'bas.voice': V(1), 'pul.kick.tone': .8, 'pul.kick.decay': .45, 'pul.clap.tone': .7, 'pul.hat.decay': .22, 'pul.tom.tune': .55, 'bas.cutoff': .28, 'bas.reso': .1, 'bas.env': .15, 'bas.sub': .7 } },
  { name: 'JUNGLE', bpm: 165, swing: .04, a: { k: 'X.x.......X.....', s: '....X..x.x..X..x', r: '.x...x.....x...x', h: 'x.x.x.x.x.x.x.x.', o: '..............x.', bass: '31a - - - - - - 31s 34 - - - 29 - - -' },
    v: { k: 'X.........xx....', s: '....X.x..x..X.xx', r: '..x.....x.......', h: 'xxx.x.xxx.x.x.xx', bass: '31a - - - 38 - - - 36s 34 - - 29 - 31 -' },
    kit: { 'bas.voice': V(1), 'pul.snare.tune': .72, 'pul.snare.tone': .68, 'pul.kick.decay': .34, 'pul.hat.decay': .3, 'bas.cutoff': .24, 'bas.reso': .2, 'bas.env': .2, 'bas.decay': .75, 'bas.sub': .8, 'pul.snare.echo': .12 } },
  { name: 'D&B', bpm: 174, swing: 0, a: { k: 'X.........X.....', s: '....X.......X...', h: 'x.x.x.x.x.x.x.x.', o: '......x.........', bass: '31a - - 31 - - 34 - 31 - - 29s 31 - - -' },
    v: { k: 'X.........X.x...', s: '....X..x....X...', h: 'x.xxx.x.x.xxx.x.', r: '.......x.....x..', bass: '31a - 43 - - 31 - - 34a - 46 - - 29 - -' },
    kit: { 'bas.voice': V(2), 'pul.snare.tune': .66, 'pul.snare.tone': .6, 'pul.kick.tone': .65, 'pul.hat.decay': .25, 'bas.detune': .35, 'bas.cutoff': .25, 'bas.reso': .35, 'bas.env': .35, 'bas.decay': .55, 'bas.drive': .55 } },
];
const LANE_KEYS = ['k', 's', 'r', 'c', 'h', 'o', 't', 'b'];
function laneMask(str) {
  let v = 0;
  for (let i = 0; i < 16 && str && i < str.length; i++) {
    if (str[i] === 'x') v |= 1 << i;
    if (str[i] === 'X') v |= (1 << i) | (1 << (i + 16));
  }
  return v >>> 0;
}
function bassLine(str) {
  const toks = (str || '').trim().split(/\s+/), out = [];
  for (let i = 0; i < 16; i++) {
    const t = toks[i] || '-';
    if (t === '-') { out.push(0); continue; }
    let v = parseInt(t, 10) | 256;
    if (t.includes('a')) v |= 512;
    if (t.includes('s')) v |= 1024;
    out.push(v);
  }
  return out;
}
// C drops the drums for a dub-style breakdown; D adds a roll at the end of the bar.
function deriveDrop(p) { return { h: p.h, o: p.o, b: p.b, r: p.r, bass: '- - - - - - - - - - - - - - - -' }; }
function deriveFill(p) {
  const f = { ...p };
  f.s = (p.s || '................').slice(0, 10) + 'x.xxxX';
  f.t = (p.t || '................').slice(0, 11) + 'x.x.x';
  return f;
}
function loadGenre(g) {
  const lines = ['snapshot'];
  const pats = [g.a, g.v, deriveDrop(g.a), deriveFill(g.a)];
  pats.forEach((p, n) => {
    for (let i = 0; i < 24; i++) lines.push(`ps ${n} ${i} 0`);
    LANE_KEYS.forEach((k, t) => lines.push(`st ${n} ${t} ${laneMask(p[k])}`));
    bassLine(p.bass).forEach((v, s) => lines.push(`b ${n} ${s} ${v}`));
  });
  for (let n = 4; n < 8; n++) lines.push(`clear ${n}`);
  const reset = k => /^pul\.[a-z]+\.(key|tune|decay|tone|echo|level)$|^bas\.(voice|wave|detune|sub|cutoff|reso|env|decay|accent|drive|level|echo|slide)$|^ech\.feedback$|^mst\.drive$/.test(k);
  const push = (k, v) => { const p = M.params[k]; if (p) { p.v = v; lines.push(`p ${p.i} ${v}`); notify(k); } };
  for (const k in M.params) if (reset(k)) push(k, M.params[k].d);
  for (const k in g.kit) push(k, g.kit[k]);
  push('seq.bpm', Math.min(1, Math.max(0, (g.bpm - 60) / 120)));
  push('seq.swing', g.swing);
  lines.push('pat 0', 'chain 1 0 0 0 1 0 0 2 3');
  send(lines.join('\n'));
  M.genre = g.name;
  showToast(M.host === 'Live' ? `${g.name} loaded. Set Live's tempo to ${g.bpm} BPM. UNDO brings back what you had.` : `${g.name} loaded at ${g.bpm} BPM. UNDO brings back what you had.`, 4000);
}
