'use strict';
const test = require('node:test'), assert = require('node:assert');
const U = require('./undersleep.js');

const world = () => U.newWorld(U.recall(''));
const run = (w, n) => { while (n--) U.step(w); };

test('every place renders at every size, in both colour modes', () => {
  for (const [W, H] of [[20, 8], [80, 24], [200, 60]]) {
    for (let d = 0; d <= U.LAST; d++) {
      const w = world(), s = U.newScreen(W, H);
      w.W = W; w.H = H;
      U.enter(w, d);
      for (let i = 0; i < 5; i++) { run(w, 5); U.frame(w, s); }
      for (const deep of [true, false]) {
        const out = U.paint(s, deep);
        assert.ok(!/NaN|undefined/.test(out));
        assert.strictEqual(out.replace(/\x1b\[[?0-9;]*[A-Za-z]/g, '').split('\r\n').map(l => l.length).join(), Array(H).fill(W).join());
      }
    }
  }
});

test('standing still lets it arrive', () => {
  const w = world();
  U.enter(w, 1);
  run(w, U.HZ * 5);
  assert.strictEqual(w.mode, 'dead');
  assert.strictEqual(w.save.graves.length, 1);
});

test('an echo is where you were', () => {
  const w = world();
  U.enter(w, 1);
  w.lights = [{ x: 0.01, y: 0.01 }]; w.lookT = 1e9;
  U.press(w, '\x1b[C');
  run(w, 200);
  const e = w.echoes[0], i = w.tick - Math.floor(e.delay);
  assert.strictEqual(U.echoAt(w, e).x, w.path[i][0]);
});

test('moving while it looks brings the echoes closer; stillness does not', () => {
  for (const [key, learns] of [['d', true], [' ', false]]) {
    const w = world();
    U.enter(w, 1);
    w.look = 2; w.lookT = U.HZ; w.lights = [{ x: 0.01, y: 0.01 }];
    U.press(w, key);
    run(w, 20);
    assert.strictEqual(w.haste < 1, learns);
  }
});

test('ignoring it every time is fatal', () => {
  const w = world();
  U.enter(w, 1);
  w.lights = [{ x: 0.01, y: 0.01 }];
  U.press(w, 'd');
  for (let i = 0; i < U.HZ * 60 && w.mode === 'play'; i++) U.step(w);
  assert.strictEqual(w.mode, 'dead');
});

test('taking every light opens the way down, all the way to the bottom', () => {
  const w = world();
  U.enter(w, 0);
  for (let d = 0; d < U.LAST; d++) {
    assert.strictEqual(w.depth, d);
    while (w.lights.length) { const n = w.lights.length; [w.x, w.y] = [w.lights[0].x, w.lights[0].y]; U.step(w); assert.ok(w.lights.length < n); }
    assert.ok(w.hole);
    w.x = w.y = 0.5;
    U.step(w);
    assert.strictEqual(w.mode, 'fall');
    run(w, U.HZ * 2);
  }
  assert.strictEqual(w.depth, U.LAST);
  U.press(w, 'd');
  run(w, U.HZ * 60);
  assert.strictEqual(w.mode, 'play', 'running never ends it');
  U.press(w, ' ');
  run(w, U.HZ * 10);
  assert.strictEqual(w.mode, 'end');
  run(w, U.HZ * 20);
  assert.ok(w.quit);
});

test('a click walks you there, the short way round, and stops', () => {
  const w = world();
  U.enter(w, 1);
  w.lights = [{ x: 0.99, y: 0.99 }]; w.lookT = 1e9; w.echoes = [];
  [w.x, w.y] = [0.5, 0.5];
  U.press(w, `\x1b[<0;${Math.round(0.8 * w.W)};${Math.round(0.5 * w.H)}M`);
  assert.ok(w.goal && w.said.hand, 'it noticed the pointer');
  run(w, U.HZ * 4);
  assert.ok(!w.goal && w.dx === 0 && w.dy === 0, 'and stood still on arrival');
  assert.ok(Math.abs(w.x - 0.79) < 0.02, `x=${w.x}`);
  U.press(w, `\x1b[<0;${Math.round(0.02 * w.W)};${Math.round(0.5 * w.H)}M`);
  U.step(w);
  assert.strictEqual(w.dx, 1, 'across the edge is shorter than back through the middle');
});

test('the pointer: drags, wheels and releases only look; the other button is stillness', () => {
  const w = world();
  U.enter(w, 1);
  for (const k of ['\x1b[<32;5;5M', '\x1b[<64;5;5M', '\x1b[<0;5;5m']) { U.press(w, k); assert.strictEqual(w.goal, null, k); }
  assert.ok(w.mouse);
  U.press(w, '\x1b[<0;5;5M');
  assert.ok(w.goal);
  U.press(w, '\x1b[<2;5;5M');
  assert.ok(!w.goal && !w.dx && !w.dy);
  U.press(w, 'd');
  assert.strictEqual(w.dx, 1, 'keys still steer');
  const t = world();
  U.press(t, '\x1b[<0;1;1M');
  assert.strictEqual(t.mode, 'play', 'a click starts it');
  assert.ok(!t.quit, 'a mouse report is not an escape');
});

test('a damaged memory is not fatal', () => {
  for (const bad of ['', '{', 'null', '[]', '{"graves":[[9,9],"x",null,[0.5,0.5]]}', '{"visits":"x"}']) {
    const s = U.recall(bad);
    assert.ok(Number.isFinite(s.visits) && s.graves.length <= 1);
  }
});
