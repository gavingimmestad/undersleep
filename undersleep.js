#!/usr/bin/env node
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');

const HZ = 30, TAU = Math.PI * 2, LAST = 8;
const { sin: S, cos: C, abs, min, max, hypot, floor, pow, atan2, exp } = Math;
const wrap = n => ((n % 1) + 1) % 1;
const gap = (a, b) => abs(wrap(a - b + 0.5) - 0.5); // distance on a torus
const pick = a => a[floor(Math.random() * a.length)];

// ---------------------------------------------------------------- what it says

const ARRIVE = ['', 'further.', 'you have been here longer than you think.', 'count your hands.',
  'it likes how you move.', 'they are all looking at the same thing.', 'there are more of you in here.',
  'every step is the same step.', 'there is nothing below this.'];
const KEPT = ['again.', 'it kept that one.', 'you left a little of yourself.', 'that was one of the good ones.',
  'do you hear how quiet it got.', 'the next one will be braver.', 'it is wearing you.'];
const TITLES = ['undersleep', 'do not turn around', 'it is open', 'who is moving your hands', 'still', 'it can hear the keys'];
const OUT = ['it is still open.', 'you brought some with you.', 'it saw where you went.', 'check the door.'];

// ---------------------------------------------------------------- the rules

function newWorld(save) {
  return { mode: 'title', t: 0, depth: 0, W: 80, H: 24, x: 0.5, y: 0.8, dx: 0, dy: 0, tick: 0, path: [], lights: [],
    echoes: [], haste: 1, open: 0, look: 0, lookT: 0, hole: false, seen: 0, said: {}, say: null, save, quit: false,
    mouse: null, goal: null, dread: 0, beat: 0, run: { played: false, deepest: 0, stayed: 0, caught: 0 }, caught: false };
}

function whisper(w, text, key) {
  if (key) { if (w.said[key]) return; w.said[key] = true; }
  if (text) w.say = { text, at: w.t };
}

function enter(w, depth) {
  Object.assign(w, { mode: 'play', depth, tick: 0, x: 0.5, y: 0.82, dx: 0, dy: 0, path: [], lights: [], echoes: [],
    haste: 1, look: 0, lookT: HZ * 3, hole: false, seen: 0, goal: null });
  w.run.played = true;
  w.run.deepest = max(w.run.deepest, depth);
  if (depth < LAST) {
    while (w.lights.length < 4 + depth) {
      const l = { x: 0.06 + Math.random() * 0.88, y: 0.1 + Math.random() * 0.8 };
      const near = (o, k) => hypot(gap(l.x, o.x), gap(l.y, o.y)) < k;
      if (!near(w, 0.2) && !near({ x: 0.5, y: 0.5 }, 0.2) && !w.lights.some(o => near(o, 0.12))) w.lights.push(l);
    }
  }
  for (let i = 0; i < (depth === LAST ? 8 : min(depth, 3)); i++) addEcho(w);
  whisper(w, ARRIVE[depth], 'arrive' + depth);
}

function addEcho(w) {
  w.echoes.push({ delay: HZ * (w.depth === LAST ? 4 : 3.1 - 0.18 * w.depth) + HZ * 0.95 * w.echoes.length, born: w.tick });
}

// an echo is only ever you, some seconds ago
function echoAt(w, e) {
  const i = w.tick - floor(e.delay * w.haste);
  if (i < 0 || !w.path[i]) return null;
  return { x: w.path[i][0], y: w.path[i][1], solid: w.tick - max(e.born, e.delay) > HZ * 1.5 };
}

const touching = (w, o, k) =>
  gap(w.x, o.x) * w.W < max(1.3, w.W / 70) * k && gap(w.y, o.y) * w.H < max(0.9, w.W / 140) * k;

// how close the nearest of you is, as a heart rate: 66 at rest, 150 when it is right there
function listen(w) {
  let near = Infinity;
  if (w.mode === 'play') for (const e of w.echoes) {
    const p = echoAt(w, e);
    if (p && p.solid) near = min(near, hypot(gap(w.x, p.x) * w.W, gap(w.y, p.y) * w.H * 2));
  }
  w.dread += (max(0, min(1, 1 - near / (w.W * 0.3))) - w.dread) * 0.08;
  w.beat += (1.1 + 1.4 * w.dread) / HZ;
  if (w.dread > 0.6 && w.depth < LAST) whisper(w, 'do you hear that.', 'heart');
}
const thump = w => w.dread * (pow(max(0, S(TAU * w.beat)), 12) + 0.6 * pow(max(0, S(TAU * w.beat - 0.9)), 12));

function step(w) {
  w.t++;
  w.seen *= 0.94;
  listen(w);
  const target = w.mode === 'title' ? 0.62 + 0.2 * S(w.t / 40)
    : w.hole || w.look === 2 || w.mode === 'dead' ? 1 : w.look === 1 ? 0.07 + 0.04 * S(w.t * 1.7) : 0;
  w.open += (target - w.open) * 0.14;

  if (w.mode === 'title') return;
  if (w.mode === 'dead' || w.mode === 'fall') {
    if (--w.wait <= 0) enter(w, w.mode === 'fall' ? w.depth + 1 : w.depth);
    return;
  }
  w.tick++;
  if (w.mode === 'end') {
    if (w.tick === HZ * 2) whisper(w, 'good.');
    if (w.tick === HZ * 7) whisper(w, 'now you follow.');
    if (w.tick === HZ * 13) whisper(w, 'someone new is here.');
    if (w.tick > HZ * 19) w.quit = true;
    return;
  }

  if (w.goal) { // walking to where you pointed, the short way round, one axis at a time
    const gx = (wrap(w.goal.x - w.x + 0.5) - 0.5) * w.W, gy = (wrap(w.goal.y - w.y + 0.5) - 0.5) * w.H * 2;
    if (abs(gx) < 1 && abs(gy) < 1) { w.dx = w.dy = 0; w.goal = null; }
    else [w.dx, w.dy] = abs(gx) >= abs(gy) ? [Math.sign(gx), 0] : [0, Math.sign(gy)];
  }
  w.x = wrap(w.x + w.dx * 0.2 / HZ);
  w.y = wrap(w.y + w.dy * 0.2 / HZ * w.W / (2 * w.H));
  w.path.push([w.x, w.y]);
  const moving = w.dx || w.dy;

  if (w.depth === 0) {
    if (w.tick === HZ) whisper(w, 'arrows.', 'k1');
    if (w.tick === HZ * 6) whisper(w, 'space, to be still.', 'k2');
  }

  for (const l of w.lights.filter(l => touching(w, l, 1.8))) {
    w.lights.splice(w.lights.indexOf(l), 1);
    addEcho(w);
    whisper(w, 'it felt that.', 'felt');
    if (!w.lights.length) { w.hole = true; w.look = 0; whisper(w, 'it is blind now. go in.', 'hole' + (w.depth > 1 ? 2 : w.depth)); }
  }

  if (w.hole) {
    if (hypot((w.x - 0.5) * w.W / w.H, (w.y - 0.5) * 2) < 0.2) { w.mode = 'fall'; w.wait = HZ * 1.6; return; }
  } else if (w.depth < LAST && (w.depth || w.echoes.length)) {
    if (--w.lookT <= 0) {
      w.look = (w.look + 1) % 3;
      w.lookT = HZ * [2.5 + Math.random() * 3, 1, 1.5][w.look];
      w.caught = false;
      if (w.look === 1) whisper(w, 'when it looks, be still.', 'look');
    }
    const staring = w.look === 2 && w.lookT < HZ * 1.15;
    if (staring && moving) {
      w.haste = max(0, w.haste - 0.012);
      w.seen = min(1, w.seen + 0.12);
      whisper(w, 'it learned something.', 'learned');
      if (!w.caught) { w.caught = true; w.run.caught++; }
    }
  }

  if (w.depth === LAST) {
    if (w.tick % (HZ * 3) === 0 && w.echoes.length < 40) addEcho(w);
    if (w.tick === HZ * 9) whisper(w, 'you can stop.');
    if (w.tick % (HZ * 14) === HZ * 4 && w.tick > HZ * 15) whisper(w, 'let it.');
  }

  for (const e of w.echoes) {
    const p = echoAt(w, e);
    if (!p) continue;
    whisper(w, 'that is you.', 'echo');
    if (!p.solid || !touching(w, p, 1)) continue;
    if (w.depth === LAST) {
      if (moving) continue; // down here it only takes what is offered
      w.mode = 'end'; w.tick = 0; w.say = null; w.save.done = true;
    } else {
      w.mode = 'dead'; w.wait = HZ * 2.6; w.say = null;
      w.run.stayed++;
      w.save.graves.push([w.x, w.y]);
      if (w.save.graves.length > 200) w.save.graves.shift();
      whisper(w, pick(KEPT));
    }
    persist(w.save);
    return;
  }
}

const KEYS = { '\x1b[A': [0, -1], '\x1b[B': [0, 1], '\x1b[C': [1, 0], '\x1b[D': [-1, 0], w: [0, -1], s: [0, 1], d: [1, 0], a: [-1, 0] };
const MOUSE = /^\x1b\[<(\d+);(\d+);(\d+)([Mm])$/; // SGR mouse report: button;column;row, M down, m up
function press(w, k) {
  const m = MOUSE.exec(k);
  if (m) { point(w, +m[1], +m[2], +m[3], m[4] === 'M'); return; }
  if (k === '\x03' || k === '\x1b' || k === 'q') { w.quit = true; return; }
  if (w.mode === 'title') { enter(w, 0); return; }
  if (w.mode !== 'play') return;
  const dir = KEYS[k.replace('\x1bO', '\x1b[')];
  if (dir) { [w.dx, w.dy] = dir; w.goal = null; }
  else if (k === ' ') { w.dx = w.dy = 0; w.goal = null; }
}

// the pointer is a second hand. it watches that one too.
function point(w, b, col, row, down) {
  w.mouse = { x: (min(max(col, 1), w.W) - 0.5) / w.W, y: (min(max(row, 1), w.H) - 0.5) / w.H, at: w.t };
  if (w.mode === 'play' && w.depth < LAST) whisper(w, 'it sees your other hand.', 'hand');
  if (!down || b & 96) return; // a drag, a wheel or a let-go is only looking
  if (w.mode === 'title') { enter(w, 0); return; }
  if (w.mode !== 'play') return;
  if ((b & 3) === 2) { w.dx = w.dy = 0; w.goal = null; } // the other button is stillness
  else if ((b & 3) === 0) w.goal = { x: w.mouse.x, y: w.mouse.y };
}

// ---------------------------------------------------------------- the places

let v = 0, h = 0; // shader outputs; module-level so the per-cell loop never allocates
const hash = (i, j) => { const n = S(i * 127.1 + j * 311.7) * 43758.5453; return n - floor(n); };
const PLACES = [
  (x, y, t, r, a) => { // throat
    const z = 1 / (r + 0.12);
    v = S(z * 3.2 + r * 5 + t * 2.1 + S(a * 3 + t * 0.7) * 1.4) * S(a * 6 + z * 1.4 + r * 3 - t * 0.5) * 1.3;
    h = 0.62 + z * 0.09 + 0.18 * S(t * 0.2 + a) + r * 0.2;
  },
  (x, y, t, r) => { // marsh
    const p = x + 0.5 * S(y * 3 + t * 0.7), q = y + 0.5 * S(x * 2.3 - t * 0.5);
    v = S(S(p * 4 + t) * 2 + S(q * 5 - t * 1.1) * 2 + (p + q) * 3 + r * 5 - t * 1.6);
    h = 0.3 + 0.22 * S(p * 2 + t * 0.3) + 0.35 * r - t * 0.05;
  },
  (x, y, t, r, a) => { // rose window
    const n = TAU / 10, b = abs(((a + t * 0.12) % n + n) % n - n / 2), X = r * C(b), Y = r * S(b);
    v = S(X * 10 - t * 1.6 + S(Y * 14 + t) * 1.5) * C(Y * 9 + t * 0.8 + r * 4);
    h = r * 0.6 - t * 0.09 + v * 0.1;
  },
  (x, y, t) => { // two wounds
    const d = hypot(x - S(t * 0.31) * 0.9, y - C(t * 0.43) * 0.5), e = hypot(x + S(t * 0.37) * 0.8, y + S(t * 0.29) * 0.6);
    v = S(d * 12 - t * 2.2 + S(e * 5) * 1.2) * S(e * 12 + t * 1.5) * 1.3;
    h = 0.97 + 0.5 * S(d * 1.6 - e * 1.3 + t * 0.3);
  },
  (x, y, t) => { // tissue
    x = x * 2.1 + 0.35 * S(y * 3 + t * 0.6); y = y * 2.1 + 0.35 * S(x * 2 - t * 0.5);
    const i = floor(x), j = floor(y);
    let m = 9, k = 9;
    for (let q = -1; q < 2; q++) for (let p = -1; p < 2; p++) {
      const o = hash(i + p, j + q) * TAU, f = hash(j + q, i + p) * 2;
      const d = hypot(i + p + 0.5 + 0.48 * S(t * f + o) - x, j + q + 0.5 + 0.48 * C(t * f * 0.7 + o * 3) - y);
      if (d < m) { k = m; m = d; } else if (d < k) k = d;
    }
    v = 1.2 * exp(-(k - m) * 8) + 0.75 * S(m * 16 - t * 3.4) * (1 - m) * (m < 0.5 ? 1 : 0.5);
    h = 0.9 + m * 0.75 + 0.1 * S(t * 0.5) + x * 0.05;
  },
  (x, y, t, r, a, px, py) => { // congregation
    const gx = 0.62, gy = 0.42, i = floor(x / gx), j = floor(y / gy), cx = (i + 0.5) * gx, cy = (j + 0.5) * gy;
    const lx = x - cx, ly = y - cy, id = hash(i, j);
    const blink = S(t * 0.6 + id * 40) > 0.96 ? 0.1 : 1, lid = 0.16 * blink * (1 - pow(lx / 0.27, 2));
    const far = hypot(px - cx, py - cy) + 1e-3, d = hypot(lx - (px - cx) / far * 0.09, ly - (py - cy) / far * 0.05);
    v = abs(ly) < lid ? (d < 0.045 ? -1 : d < 0.11 ? 0.95 : 0.35) : abs(abs(ly) - lid) < 0.03 && abs(lx) < 0.28 ? 0.6 : S(r * 20 - t * 2 + id) * 0.18;
    h = 0.12 + id * 0.5 + t * 0.05 + d;
  },
  (x, y, t) => { // hall of mirrors
    const c = C(0.62 + 0.12 * S(t * 0.21)), s = S(0.62 + 0.12 * S(t * 0.21));
    let p = x, q = y;
    for (let k = 0; k < 4; k++) { // fold the room into itself, turned a little each time
      p = abs(p) - 0.34 - 0.07 * S(t * 0.4 + k); q = abs(q) - 0.24;
      const np = p * c - q * s; q = p * s + q * c; p = np;
    }
    const d = hypot(p, q);
    v = S(d * 22 - t * 2.4) * C(atan2(q, p) * 3 + t * 0.9) * 1.25;
    h = 0.55 + d * 1.4 + t * 0.07;
  },
  (x, y, t, r, a) => { // the stair
    const z = Math.log(r + 1e-3), arm = pow(abs(S(a * 2 - z * 4.5 + t * 1.3)), 4);
    v = (arm * 0.85 + arm * pow(max(0, S(z * 14 + t * 3)), 8) * 0.9) * min(1, r * 2.5);
    h = 0.08 - z * 0.12 + 0.05 * S(t * 0.3 + a);
  },
  (x, y, t, r, a) => { // the bottom
    v = (Math.random() < 0.06 ? 0.5 : 0) + 0.3 * S(r * 9 - t * 0.7 + S(a * 2 + t * 0.1));
    h = 0.5;
  },
];
const TINT = [[0.9, 0.5, 1], [0.75, 1, 0.8], [1, 0.8, 1], [1, 0.4, 0.75], [1, 0.45, 0.6], [1, 0.95, 0.6],
  [0.6, 0.9, 1], [1, 0.7, 0.35], [0.5, 0.52, 0.6]];
const RAMP = [' .,:;i1tfLCG08@', ' .`\'~-=+*oaO%&$', ' .\':;+*x%X#$&@', ' .|/\\-=+xX%#', ' .,:;coeaOQ8@', ' .-~:=oO0Q@',
  ' .:-=+*#%@', ' ._-~=/|#N', ' .\'`,:;'];

// ---------------------------------------------------------------- the light

function newScreen(W, H) {
  const n = W * H, f = () => new Float32Array(n);
  return { W, H, R: f(), G: f(), B: f(), R2: f(), G2: f(), B2: f(), ch: new Array(n).fill(' '),
    fg: new Uint32Array(n), bg: new Uint32Array(n) };
}
const rgb = (r, g, b) => (r << 16) | (g << 8) | b;
const byte = (n, q) => min(255, max(0, floor(n * 255 / q) * q));

function frame(w, s) {
  const { W, H, R, G, B, R2, G2, B2, ch, fg, bg } = s, t = w.t / HZ, d = w.mode === 'end' ? LAST : w.depth;
  const dead = w.mode === 'dead', fall = w.mode === 'fall', end = w.mode === 'end', title = w.mode === 'title';
  const place = PLACES[d], tint = TINT[d], open = w.open, asp = W / H;
  const px = (w.x - 0.5) * 2 * asp / 2, py = (w.y - 0.5) * 2;
  const pound = thump(w), fear = w.dread;
  const rot = fall ? 0.09 : dead ? -0.03 : 0.03 * S(t * 0.23), zoom = (fall ? 0.93 : dead ? 1.05 : 0.975 + 0.03 * S(t * 0.31)) - pound * 0.03;
  const cr = C(rot) * zoom, sr = S(rot) * zoom, keep = dead ? 0.95 : fall ? 0.93 : 0.72, split = 0.03 + 0.035 * S(t * 0.4) + w.seen * 0.05;
  const gain = dead ? 0.02 : end ? 0.14 : fall ? 0.12 : title ? 0.3 : 0.5, hush = 1 - 0.55 * open;
  const hand = w.mouse && w.t - w.mouse.at < HZ * 4 && !w.hole ? w.mouse : null; // a moving pointer outranks you
  const fx = hand ? (hand.x - 0.5) * asp : px, fy = hand ? (hand.y - 0.5) * 2 : py, idle = title && !hand;
  const ix = idle ? 0.25 * S(t * 0.5) : w.hole ? 0 : max(-0.3, min(0.3, fx * 0.35)), iy = idle || w.hole ? 0 : max(-0.12, min(0.12, fy * 0.2));
  const pupil = dead ? 0.1 + 1.1 * pow(1 - w.wait / (HZ * 2.6), 2) : w.hole ? 0.24 + 0.02 * S(t * 3) : 0.12 + 0.02 * S(t * 2.3);

  for (let j = 0, n = 0; j < H; j++) {
    const y = (j + 0.5) / H * 2 - 1;
    for (let i = 0; i < W; i++, n++) {
      const x = ((i + 0.5) / W * 2 - 1) * asp / 2;
      const r = hypot(x, y);
      place(x, y, t, r, atan2(y, x), px, py);
      let l = v > 0 ? pow(min(1, v), 1.25) * gain * hush : 0;

      // last frame, dragged somewhere slightly wrong
      const u = x * cr - y * sr, q = x * sr + y * cr;
      const ja = (Math.random() - 0.5) * 0.7, jb = (Math.random() - 0.5) * 0.7;
      const at = z => { // each colour is pulled a little differently
        const a = floor((u * z * 2 / asp + 1) / 2 * W + ja), b = floor((q * z + 1) / 2 * H + jb);
        return (b < 0 ? 0 : b >= H ? H - 1 : b) * W + (a < 0 ? 0 : a >= W ? W - 1 : a);
      };
      let cR = R[at(1 + split)] * keep + l * tint[0] * (0.5 + 0.5 * C(TAU * h));
      let cG = G[at(1)] * keep + l * tint[1] * (0.5 + 0.5 * C(TAU * (h + 0.33)));
      let cB = B[at(1 - split)] * keep + l * tint[2] * (0.5 + 0.5 * C(TAU * (h + 0.67)));
      if (w.seen > 0.02) { cR += w.seen * 0.05 * Math.random(); cG *= 1 - w.seen * 0.2; cB *= 1 - w.seen * 0.2; }
      if (dead) cR += 0.006;
      if (fear > 0.02) { // the edges close in and flush with each beat
        const edge = min(1, r * r * 0.6), dim = 1 - fear * 0.5 * edge;
        cR = cR * dim + pound * 0.3 * edge; cG *= dim; cB *= dim;
      }

      // it
      if (open > 0.015) {
        const lid = open * 0.62 * (1 - pow(x / 1.05, 2)), e = lid - abs(y);
        if (abs(x) < 1.05 && e > 0) {
          const ex = x - ix, ey = y - iy, er = hypot(ex, ey), ea = atan2(ey, ex), k = min(1, open * 1.3) * 0.92;
          let eR, eG, eB;
          if (er < pupil) { const z = w.hole ? max(0, S(ea * 3 + 2 / (er + 0.05) + t * 6)) * 0.35 : 0; eR = z; eG = z * 0.9; eB = z; }
          else if (er < 0.42) {
            const z = 0.35 + 0.65 * pow(abs(S(ea * 13 + S(er * 26 - t * 4) * 1.3)), 2) * (0.5 + 0.5 * S(er * 40 - t * 5)), g = h + t * 0.1 + er * 1.6;
            eR = z * (0.55 + 0.45 * C(TAU * g)); eG = z * (0.45 + 0.45 * C(TAU * (g + 0.33))); eB = z * (0.55 + 0.45 * C(TAU * (g + 0.67)));
          } else {
            const vein = abs(S(ea * 9 + S(er * 14) * 2 + S(er * 5 + t * 0.4) * 2)) < 0.14 ? 1 : 0, z = 0.1 + 0.16 * min(1, e * 5);
            eR = z + vein * 0.5; eG = z * 0.9; eB = z * 0.85;
          }
          if (e < 0.05) { eR += 0.5; eG += 0.35; eB += 0.3; }
          cR += (eR - cR) * k; cG += (eG - cG) * k; cB += (eB - cB) * k;
        }
      }
      R2[n] = min(1, cR); G2[n] = min(1, cG); B2[n] = min(1, cB);
    }
  }
  [s.R, s.R2, s.G, s.G2, s.B, s.B2] = [R2, R, G2, G, B2, B];

  // leave a mark in the light itself, so it gets dragged along with everything else
  const stamp = (x, y, r, cR, cG, cB, k) => {
    const X = floor(x * W), Y = floor(y * H), rx = Math.ceil(r * 2);
    for (let j = -Math.ceil(r); j <= r; j++) for (let i = -rx; i <= rx; i++) {
      const f = 1 - hypot(i / 2, j) / (r + 0.5);
      if (f <= 0) continue;
      const n = ((Y + j + H) % H) * W + (X + i + W) % W, g = min(1, f * k);
      R2[n] += (cR - R2[n]) * g; G2[n] += (cG - G2[n]) * g; B2[n] += (cB - B2[n]) * g;
    }
  };
  const play = w.mode === 'play', beat = 0.6 + 0.4 * S(t * 5);
  if (play) {
    for (const l of w.lights) stamp(l.x, l.y, 4, 0, 0, 0, 0.8);
    for (const l of w.lights) stamp(l.x, l.y, 1.6, 1, 0.85 * beat + 0.1, 0.35 * beat, 0.5 * beat + 0.2);
    stamp(w.x, w.y, 1.6, 0.02, 0.02, 0.05, 0.9);
  }

  const ramp = RAMP[d], top = ramp.length - 1;
  for (let n = 0; n < W * H; n++) {
    const r = R2[n], g = G2[n], b = B2[n], l = min(1, max(r, g, b));
    ch[n] = ramp[min(top, floor(pow(l, 0.8) * (top + 0.99)))];
    const k = 1 / (pow(l, 0.45) + 0.08);
    fg[n] = rgb(byte(r * k, 12), byte(g * k, 12), byte(b * k, 12));
    bg[n] = rgb(byte(r * r * 0.3, 10), byte(g * g * 0.3, 10), byte(b * b * 0.3, 10));
  }

  if (fear > 0.55 && pound > 0.25) for (let j = 0; j < H; j++) { // the picture tears on the beat
    if (Math.random() > fear * 0.1) continue;
    const k = j * W, by = 1 + floor(Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1);
    const row = [ch, fg, bg].map(a => a.slice(k, k + W));
    for (let i = 0; i < W; i++) { const o = (i + by + W) % W; ch[k + i] = row[0][o]; fg[k + i] = row[1][o]; bg[k + i] = row[2][o]; }
  }

  const put = (x, y, c, f, b) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const n = floor(y) * W + floor(x);
    ch[n] = c; fg[n] = f; if (b !== undefined) bg[n] = b;
  };
  const scar = (p, solid) => {
    stamp(p.x, p.y, 1.4, solid ? 0.75 : 0.2, 0, 0.05, 0.7);
    put(p.x * W, p.y * H, Math.random() < 0.1 ? pick('QO0&a?') : '@', solid ? 0xffd0d0 : 0x803040, solid ? 0xa00010 : 0x180004);
  };
  if (title || d === LAST) for (const [x, y] of w.save.graves) put(x * W, y * H, '@', 0x503848);
  if (play) {
    for (const l of w.lights) put(l.x * W, l.y * H, '+x*'[floor(t * 6) % 3], 0xffffff, 0x604000);
    for (const e of w.echoes) { const p = echoAt(w, e); if (p) scar(p, p.solid); }
    put(w.x * W, w.y * H, '@', 0xffffff, 0x000000);
  }
  if (end && w.path.length) {
    const at = i => w.path[((i % w.path.length) + w.path.length) % w.path.length];
    for (let k = 70; k > 0; k--) { const p = at(w.tick - k * 5); scar({ x: p[0], y: p[1] }, true); }
    const p = at(w.tick);
    put(p[0] * W, p[1] * H, '@', 0xffffff, 0x000000);
  }

  const line = (text, y, f, n = text.length) => {
    const x = floor((W - text.length) / 2);
    for (let i = 0; i < min(n, text.length); i++) if (text[i] !== ' ') {
      put(x + i, y, Math.random() < 0.015 ? pick('#%?/\\|') : text[i], f, 0x000000);
    }
  };
  if (title) {
    const name = 'undersleep', step_ = max(2, min(6, floor((W - 4) / name.length)));
    for (let i = 0; i < name.length; i++) {
      const x = (W - step_ * (name.length - 1)) / 2 + i * step_, y = H * 0.1 + S(t * 1.2 + i * 0.8) * 1.2;
      const f = 0.5 + 0.5 * S(t * 0.9 + i);
      stamp(x / W, y / H, 1.6, 0.35, 0.05 * f, 0.3 * f, 0.9);
      put(x, y, name[i], 0xffffff, 0x000000);
    }
    const { visits, graves, done } = w.save;
    line(done ? 'you never left.' : graves.length ? (graves.length === 1 ? 'one of you stayed.' : graves.length + ' of you stayed.')
      : visits > 1 ? 'you came back.' : 'press.', floor(H * 0.84), 0xe0d8e8);
    line('(moving, pulsing colour)', H - 1, 0x706878);
  }
  if (w.say) {
    const age = w.t - w.say.at;
    if (age < HZ * 5) line(w.say.text, floor(H * 0.9), age > HZ * 4 ? 0x706878 : 0xf0e8f4, floor(age / 1.6));
  }
}

function paint(s, deep) {
  const { W, H, ch, fg, bg } = s;
  const code = deep ? c => `2;${c >> 16};${(c >> 8) & 255};${c & 255}`
    : c => `5;${16 + 36 * Math.round((c >> 16) / 51) + 6 * Math.round(((c >> 8) & 255) / 51) + Math.round((c & 255) / 51)}`;
  let out = '\x1b[?2026h\x1b[H', f = -1, b = -1;
  for (let j = 0, n = 0; j < H; j++) {
    if (j) out += '\r\n';
    for (let i = 0; i < W; i++, n++) {
      if (bg[n] !== b) out += `\x1b[48;${code(b = bg[n])}m`;
      if (ch[n] !== ' ' && fg[n] !== f) out += `\x1b[38;${code(f = fg[n])}m`;
      out += ch[n];
    }
  }
  return out + '\x1b[?2026l';
}

// what you wake up remembering
function dreamLog(w) {
  const { played, deepest, stayed, caught } = w.run, secs = floor(w.t / HZ), word = n => ['no', 'one', 'two', 'three'][n] || n;
  const lines = [pick(OUT)];
  if (!played) return lines[0];
  lines.push(w.save.done && w.mode === 'end' ? 'you went all the way down. you are still there.'
    : deepest ? `you went ${word(deepest)} down.` : 'you never went down.');
  if (stayed) lines.push(stayed === 1 ? 'one of you stayed there.' : `${word(stayed)} of you stayed there.`);
  if (caught) lines.push(`it caught you moving ${caught === 1 ? 'once' : word(caught) + ' times'}.`);
  lines.push(secs < 60 ? `you were gone ${secs} seconds.` : `you were gone ${floor(secs / 60)} minute${secs < 120 ? '' : 's'}.`);
  return lines[0] + lines.slice(1).map(l => `\n\x1b[2m  ${l}\x1b[0m`).join('');
}

// ---------------------------------------------------------------- what it keeps

const FILE = path.join(os.homedir(), '.undersleep.json');
function recall(text) {
  let s;
  try { s = JSON.parse(text); } catch { s = null; }
  const ok = n => typeof n === 'number' && n >= 0 && n < 1;
  return { visits: s && Number.isFinite(s.visits) ? s.visits : 0, done: !!(s && s.done),
    graves: s && Array.isArray(s.graves) ? s.graves.filter(g => Array.isArray(g) && ok(g[0]) && ok(g[1])).slice(-200) : [] };
}
function persist(save) {
  if (require.main !== module) return;
  try { fs.writeFileSync(FILE, JSON.stringify(save)); } catch { /* it forgets */ }
}

function main() {
  const { stdin, stdout } = process;
  if (!stdin.isTTY || !stdout.isTTY) { console.error('it needs a terminal to look out of.'); process.exit(1); }
  let text = '';
  try { text = fs.readFileSync(FILE, 'utf8'); } catch { /* first time */ }
  const save = recall(text);
  save.visits++;
  persist(save);

  const w = newWorld(save), deep = stdout.getColorDepth({ ...process.env, NO_COLOR: undefined }) === 24;
  let s, name = '';
  const size = () => {
    s = newScreen(max(20, stdout.columns || 80), max(8, stdout.rows || 24));
    w.W = s.W; w.H = s.H;
    stdout.write('\x1b[2J');
  };
  stdout.write('\x1b[22;0t\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?1003h\x1b[?1006h');
  process.on('exit', () => stdout.write(`\x1b[?1006l\x1b[?1003l\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l\x1b]0;\x07\x1b[23;0t${w.quit ? dreamLog(w) + '\n' : ''}`));
  for (const sig of ['SIGTERM', 'SIGHUP', 'SIGINT']) process.on(sig, () => process.exit(0));
  stdin.setRawMode(true);
  stdin.setEncoding('utf8');
  let held = ''; // a sequence cut in two between reads; its lone ESC would otherwise read as q
  stdin.on('data', data => {
    data = held + data;
    const cut = /\x1b\[(<[\d;]*)?$/.exec(data);
    held = cut ? cut[0] : '';
    if (cut) data = data.slice(0, cut.index);
    for (const k of data.match(/\x1b\[<\d+;\d+;\d+[Mm]|\x1b[[O][A-D]|[^]/g) || []) press(w, k.length === 1 ? k.toLowerCase() : k);
  });
  stdout.on('resize', size);
  size();

  let last = Date.now(), owed = 0;
  setInterval(() => {
    const now = Date.now();
    owed = min(owed + (now - last) * HZ / 1000, 4);
    last = now;
    for (; owed >= 1; owed--) step(w);
    if (w.quit) process.exit(0);
    const want = w.dread > 0.5 ? 'it is right behind you' : TITLES[w.mode === 'title' ? 0 : w.look === 2 ? 2 : (w.depth % 5) + 1];
    if (want !== name) stdout.write(`\x1b]0;${name = want}\x07`);
    if (stdout.writableNeedDrain) return; // slow terminal: drop the frame, keep the clock
    frame(w, s);
    stdout.write(paint(s, deep));
  }, 1000 / HZ);
}

if (require.main === module) main();
else module.exports = { newWorld, enter, step, press, frame, paint, newScreen, recall, echoAt, dreamLog, HZ, LAST };
