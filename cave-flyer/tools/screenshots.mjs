// Takes screenshots of Cave Flyer in headless Chrome, for eyeballing changes.
//
//   node cave-flyer/tools/screenshots.mjs <output dir>
//
// Serves the repo on a local port, opens the game, starts a run, then jumps
// the camera to several distances (early, mid, hard, and the longest squeeze
// it can find) and saves a PNG of each. Prints any console errors.

import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const OUT = resolve(process.argv[2] || 'cave-flyer-shots');
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

await mkdir(OUT, { recursive: true });
const server = createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(ROOT, path);
  if (!file.startsWith(ROOT)) return res.writeHead(403).end();
  let body;
  try {
    body = await readFile(file);
  } catch {
    return res.writeHead(404).end();
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(body);
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const url = `http://127.0.0.1:${server.address().port}/cave-flyer/`;

const profile = await mkdtemp(join(tmpdir(), 'cave-flyer-chrome-'));
const PORT = 9333;
const chrome = spawn('google-chrome', ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=1280,720', 'about:blank'], { stdio: 'ignore' });

try {
  let targets;
  for (let i = 0; i < 50 && !targets; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(200); }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
  const run = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true })).result?.result?.value;
  const shot = async (name) => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(join(OUT, name + '.png'), Buffer.from(r.result.data, 'base64'));
    console.log('saved', join(OUT, name + '.png'));
  };
  const key = (type) => send('Input.dispatchKeyEvent', { type, code: 'Space', key: ' ', windowsVirtualKeyCode: 32 });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(1500);
  await shot('0-title');
  await key('keyDown');
  await sleep(60);
  await key('keyUp');
  await sleep(800);

  // Swap in a freshly generated cave already scrolled to world x = X. The
  // ship is made a long-lived ghost so it doesn't crash while we look.
  const jumpTo = (X) => run(`{
    const g = window.caveFlyer; g.ship.invuln = 999;
    const c = new (g.cave.constructor)(540); c.ensure(${X} + 1300); c.prune(${X} - 200);
    g.cave = c; g.camX = ${X}; } 1`);
  for (const [name, X] of [['1-early', 2000], ['2-mid', 7000], ['3-hard', 18000], ['4-hard', 24000]]) {
    await jumpTo(X);
    await sleep(700);
    await shot(name);
  }

  // Find the stretch with the most tight points and look at it.
  const at = await run(`{
    const g = window.caveFlyer; const c = new (g.cave.constructor)(540); c.ensure(32000);
    let best = 0, bx = 0;
    for (let X = 16000; X < 30000; X += 48) {
      let n = 0; for (const p of c.points) if (p.x > X && p.x < X + 700 && p.bot - p.top < 130) n++;
      if (n > best) { best = n; bx = X; }
    }
    c.prune(bx - 400); g.cave = c; g.camX = bx - 200; bx }`);
  await sleep(500);
  await shot('5-squeeze');
  console.log(`squeeze view at x=${at}`);
  console.log(errors.length ? 'console errors:\n' + errors.join('\n') : 'no console errors');
  ws.close();
} finally {
  chrome.kill();
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}
