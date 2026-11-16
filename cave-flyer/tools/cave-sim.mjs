// Cave fairness + feel check. Run with Node (no browser needed):
//
//   node cave-flyer/tools/cave-sim.mjs [runs=20] [js dir=cave-flyer/js]
//
// 1) Fairness: a "perfect pilot" keeps pace with the scroll and steers only
//    vertically, at 80% of the ship's top speed. For each generated cave it
//    tracks every height the ship could be at; if that set ever goes empty,
//    the cave had an impossible spot and the run is reported as STUCK.
// 2) Feel, per 15 s of flying: average and tightest opening, share of tight
//    cave (< 150 px), and rocks per minute. Plus the share of 240 px stretches
//    where the opening's width barely changes (walls running parallel).
//
// Random numbers are seeded, so results are repeatable.

import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';

const RUNS = Number(process.argv[2] || 20);
const jsDir = resolve(process.argv[3] || resolve(dirname(fileURLToPath(import.meta.url)), '../js'));
let seed = 7;
Math.random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const { Cave, speedAt } = await import(pathToFileURL(jsDir + '/cave.js'));
const { Ship, SHIP_MAX_VY } = await import(pathToFileURL(jsDir + '/ship.js'));

const H = 540;
const STEP = 8;      // px of travel per simulation step
const YB = 2;        // px per height bucket
const SECONDS = 240; // flying time per run
const PILOT = 0.8;   // share of top vertical speed the pilot uses

let fails = 0;
const buckets = [];
const flat = { n: 0, flat: 0 };

for (let run = 0; run < RUNS; run++) {
  const cave = new Cave(H);
  cave.ensure(1200);
  const ship = new Ship();
  const clear = (x, y) => {
    ship.x = 0;
    ship.y = y;
    return !ship.hitCircles(x).some(([cx, cy, r]) => cave.hitsCircle(cx, cy, r));
  };
  let reach = new Set();
  for (let b = 0; b * YB < H; b++) if (clear(150, b * YB)) reach.add(b);

  let x = 150;
  let t = 0;
  const rocksSeen = new Set();
  const win = [];
  for (; t < SECONDS; x += STEP) {
    cave.ensure(x + 1200);
    cave.prune(x - 300);
    const v = speedAt(x);
    t += STEP / v;
    const k = Math.floor((SHIP_MAX_VY * PILOT * STEP) / v / YB);
    const next = new Set();
    for (const b of reach) {
      for (let j = -k; j <= k; j++) {
        const nb = b + j;
        if (nb < 0 || nb * YB >= H || next.has(nb)) continue;
        if (clear(x + STEP, nb * YB)) next.add(nb);
      }
    }
    reach = next;

    const gap = cave.botAt(x) - cave.topAt(x);
    const B = (buckets[Math.floor(t / 15)] ||= { n: 0, gap: 0, tight: 0, rocks: 0, minGap: Infinity });
    B.n++;
    B.gap += gap;
    if (gap < 150) B.tight++;
    B.minGap = Math.min(B.minGap, gap);
    for (const o of cave.obstacles) {
      if (o.minX < x && !rocksSeen.has(o)) {
        rocksSeen.add(o);
        B.rocks++;
      }
    }
    win.push(gap);
    if (win.length > 30) win.shift();
    if (x % 48 === 6 && win.length === 30 && t > 5) {
      flat.n++;
      if (Math.max(...win) - Math.min(...win) < 12) flat.flat++;
    }
    if (!reach.size) break;
  }
  if (!reach.size) {
    fails++;
    console.log(`run ${run}: STUCK at x=${x | 0} (t=${t.toFixed(0)}s)`);
  }
}

console.log(`impossible caves: ${fails}/${RUNS}`);
console.log(`parallel stretches (240 px where the width varies < 12 px): ${((100 * flat.flat) / flat.n).toFixed(0)}%`);
console.log('time       avgGap  minGap  tight(<150)  rocks/min');
buckets.forEach((B, i) => {
  if (B.n < 100) return;
  console.log(
    `${String(i * 15).padStart(3)}-${String(i * 15 + 15).padEnd(4)}s  ${(B.gap / B.n).toFixed(0).padStart(6)}  ` +
    `${B.minGap.toFixed(0).padStart(6)}  ${((100 * B.tight) / B.n).toFixed(0).padStart(10)}%  ${((B.rocks / RUNS) * 4).toFixed(1).padStart(9)}`,
  );
});
