// Far from the server: everything through a relay that adds 175 ms each way (a 350 ms round trip), two real browser players pressing
// CHASE together. The clock: corrected for the round trip. The queue shows both, and both chase together. Others: smooth on the server's
// clock. Coins: the counter never jumps back. Nobody snapped back. Run: node tests/latency.mjs
import net from 'node:net';
import { startServer, startGame, stopAll, launch, open, qa, sleep } from './lib.mjs';

const ONE_WAY = Number(process.env.ONE_WAY) || 175;
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
// the relay: 3013 (where the dev client looks) to the server on 3014, every chunk held back ONE_WAY ms, in order
const relay = net.createServer((a) => {
    const b = net.connect(3014, '127.0.0.1');
    const pipe = (from, to) => { from.on('data', (d) => { setTimeout(() => { if (!to.destroyed) to.write(d); }, ONE_WAY); }); from.on('close', () => setTimeout(() => to.destroy(), ONE_WAY)); from.on('error', () => to.destroy()); };
    pipe(a, b); pipe(b, a);
}).listen(3013);

// (the client built to look for its server at the relay)
process.env.VITE_SERVER_URL = 'http://localhost:3013';
await startGame();
delete process.env.VITE_SERVER_URL;
await startServer(3014, { QA: '1' });
const browser = await launch();
try {
    const A = await open(browser, 'http://localhost:3014/', { w: 960, h: 540, q: 'low', uid: 'latA' + Date.now() });
    const B = await open(browser, 'http://localhost:3014/', { w: 960, h: 540, q: 'low', uid: 'latB' + Date.now() });
    for (const p of [A, B]) await qa(p, () => window.__qa.noWatch(true));
    await sleep(2000);
    for (const p of [A, B]) await qa(p, () => window.__qa.close());
    await sleep(3000);
    const rtt = await qa(A, () => window.__qa.net.rtt);
    check(rtt > ONE_WAY * 1.8 && rtt < ONE_WAY * 3, 'the round trip measured: ' + rtt + ' ms');
    const clk = await qa(A, async () => { const q = window.__qa, r = q.net.room; const a = q.net.now(), s = r.state.now; return a - s; });
    check(Math.abs(clk) < rtt, 'the client\'s server clock against the last state it got: ' + Math.round(clk) + ' ms ahead (a one-way trip or so)');
    // PLAY, about the same time
    await qa(A, () => window.__qa.play());
    await sleep(700);
    const queueA = await qa(A, () => document.querySelector('#queueTxt').textContent);
    await qa(B, () => window.__qa.play());
    await sleep(1400);
    const queue2 = await qa(A, () => document.querySelector('#queueTxt').textContent);
    check(/^2 \/ 6/.test(queue2), 'the queue shows who\'s been found: "' + queueA + '" then "' + queue2 + '"');
    await A.waitForFunction(() => window.__qa.state().inRace, { timeout: 20000, polling: 200 });
    await B.waitForFunction(() => window.__qa.state().inRace, { timeout: 20000, polling: 200 });
    const ctxA = await qa(A, () => window.__qa.net.room.state.players.get(window.__qa.net.room.sessionId).ctx), ctxB = await qa(B, () => window.__qa.net.room.state.players.get(window.__qa.net.room.sessionId).ctx);
    check(ctxA === ctxB && !!ctxA, 'both in the same race: ' + ctxA);
    await A.waitForFunction(() => window.__qa.state().t > 0.5, { timeout: 15000, polling: 200 });
    await sleep(3000);
    const peers = await qa(A, () => window.__qa.state());
    check(peers.peers === 1, 'each sees the other: ' + peers.peers + ' real player in view, ' + peers.others + ' others');
    // the coins while running
    await qa(A, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
    const series = await qa(A, async () => { const out = []; const t0 = performance.now(); await new Promise((res) => { const f = () => { out.push(window.__qa.S.coins); if (performance.now() - t0 < 12000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); }); return out; });
    let back = 0, worst = 0;
    for (let i = 1; i < series.length; i++) { const d = series[i] - series[i - 1]; if (d < -0.01) { back++; worst = Math.min(worst, d); } }
    check(back === 0, 'the counter doesn\'t jump back: ' + back + ' dips, worst ' + worst);
    // others, smooth: a real player and a bot, each seen from B
    for (const [who, wantBot] of [['the other player', false], ['a bot', true]]) {
        const smooth = await qa(B, async (wantBot) => {
            const q = window.__qa;
            let r = null;
            for (const o of q.remotes().values()) if (!!o.p.bot === wantBot && o.x !== undefined && o.p.st === 0) r = o;
            if (!r) return null;
            const out = [], stamps = []; let last = null, lastT = 0; const t0 = performance.now();
            await new Promise((res) => { let tl = performance.now(); const f = (n) => { const dt = (n - tl) / 1000; tl = n; if (r.x !== undefined) { if (last) out.push({ d: Math.hypot(r.x - last[0], r.z - last[1]), dt }); last = [r.x, r.z]; } if (r.track.lt !== lastT) { stamps.push(r.track.lt); lastT = r.track.lt; } if (performance.now() - t0 < 6000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
            const step = out.map((o) => o.d).sort((a, b) => a - b), secs = out.reduce((a, o) => a + o.dt, 0), dist = out.reduce((a, o) => a + o.d, 0);
            const pop = Math.max(...out.map((o) => o.d - 115 * o.dt)), longest = Math.max(...out.map((o) => o.dt));
            const gaps = stamps.slice(1).map((v, i) => v - stamps[i]).sort((a, b) => a - b);
            return { frames: out.length, speed: dist / secs, p99: step[Math.floor(step.length * 0.99)], max: step[step.length - 1], pop, longest, delay: r.track.delay, name: r.p.name, gap: gaps[gaps.length >> 1] };
        }, wantBot);
        check(smooth && smooth.pop < 1.5, who + ' moves smoothly from far away (' + (smooth && smooth.name) + '): ' + (smooth && smooth.speed.toFixed(1)) + ' studs/s, a frame\'s step p99 ' + (smooth && smooth.p99.toFixed(2)) + ', largest ' + (smooth && smooth.max.toFixed(2)) + ' studs (longest frame ' + (smooth && Math.round(smooth.longest * 1000)) + ' ms), drawn ' + (smooth && Math.round(smooth.delay)) + ' ms in the past');
        check(smooth && smooth.gap < 90, who + ': a new snapshot every ' + (smooth && Math.round(smooth.gap)) + ' ms');
    }
    await qa(A, () => window.__qa.auto(false));
    const sF = await qa(A, () => window.__qa.state()), sG = await qa(B, () => window.__qa.state());
    check(sF.snaps === 0 && sG.snaps === 0, 'nobody snapped back: ' + sF.snaps + ', ' + sG.snaps);
    const errs = [...A.errors, ...B.errors, ...(await qa(A, () => window.__qa.errors())), ...(await qa(B, () => window.__qa.errors()))];
    check(errs.length === 0, 'no console errors: ' + JSON.stringify(errs.slice(0, 4)));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); relay.close(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
