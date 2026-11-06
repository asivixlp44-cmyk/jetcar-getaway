// Measured frame rates: desktop, a simulated weak laptop (CPU throttled 4x, 1366x768, Low), a simulated phone (touch, 844x390 and 390x844
// at 2x, Low, CPU 4x), each on the Garage Deck, driving the stages, late in the run (Neon Nightway at night) and in a Police Chase with all six
// cars and the cops together; and a CPU profile of the unminified build. Run with Chrome on the integrated chip: LOW_GPU=1 node tests/perf.mjs [profile]
// node tests/perf.mjs watch: the rule itself, with the game's own watcher on: too slow, and the resolution, then the quality, come down; fast again, and the resolution goes back up.
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startVite, startGame, stopAll, launch, open, qa, sleep, measure, OUT } from './lib.mjs';

const PROFILE = process.argv[2] === 'profile';
if (PROFILE) process.env.MINIFY = '0';
const DEV = [
    { name: 'Desktop 1600x900 Medium', w: 1600, h: 900, q: 'medium' },
    { name: 'Weak laptop 1366x768 Low, CPU 4x', w: 1366, h: 768, q: 'low', cpu: 4 },
    { name: 'Phone 844x390 @2x, Low, CPU 4x', w: 844, h: 390, dpr: 2, q: 'low', cpu: 4, touch: true },
    { name: 'Phone 390x844 @2x, Low, CPU 4x', w: 390, h: 844, dpr: 2, q: 'low', cpu: 4, touch: true },
];
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
if (process.argv[2] === 'watch') {
    let bad = 0;
    try {
        // no quality stored, as a new player's; High so there's room to come down
        const page = await open(browser, GAME, { w: 1600, h: 900, q: 'high', uid: 'watch' + Date.now() });
        await qa(page, () => { window.__qa.close(); window.__qa.quality('high'); });
        const read = () => qa(page, () => ({ fps: window.__qa.perf().fps, ratio: +window.__qa.renderer().getPixelRatio().toFixed(3), q: window.__qa.state().q }));
        await sleep(4000);
        const r0 = await read();
        console.log('  fast:', JSON.stringify(r0));
        const c = await page.createCDPSession();
        // so slow that a lower resolution can't help: it tries that first, finds no gain, and takes the quality down
        await c.send('Emulation.setCPUThrottlingRate', { rate: 26 });
        let low = r0, seenLowerRes = false;
        for (let i = 0; i < 16; i++) { await sleep(5000); low = await read(); if (low.ratio < r0.ratio) seenLowerRes = true; console.log('  CPU 26x, ' + (i + 1) * 5 + ' s:', JSON.stringify(low)); if (low.q === 'low') break; }
        if (low.q === r0.q) { bad++; console.log('FAIL  the quality never came down'); } else console.log('  ok  the quality came down: ' + r0.q + ' to ' + low.q + (seenLowerRes ? ', after trying a lower resolution' : ''));
        console.log('  errors', page.errors);
        await page.close();
    } catch (e) { console.error(e); bad++; } finally { await browser.close(); stopAll(); }
    console.log(bad ? 'FAILED' : 'all good');
    process.exit(bad ? 1 : 0);
}
const results = [];
const fmtM = (m) => `${m.fps} FPS${m.paced ? ' (every other refresh of ' + m.refresh + ')' : ''}, p50 ${m.p50} p95 ${m.p95} worst ${m.max} ms, ${m.over50} over 50 ms, work ${m.avgMs} ms (worst ${m.maxMs}), ${m.calls} calls, ${Math.round(m.tris / 1000)}k tris`;
const startRace = async (page) => {
    await qa(page, () => window.__qa.close());
    await sleep(250);
    await qa(page, () => window.__qa.play());
    await page.waitForFunction(() => { const s = window.__qa.state(); return s.inRace && s.t > -1.5; }, { timeout: 60000, polling: 200 });
};
const endRace = async (page) => { await qa(page, () => { window.__qa.auto(false); window.__qa.leave(); }); await page.waitForFunction(() => !window.__qa.state().inRace, { timeout: 40000, polling: 250 }); await sleep(800); };
try {
    for (const D of (PROFILE ? [DEV[1]] : DEV)) {
        console.log('\n=== ' + D.name);
        const page = await open(browser, GAME, { ...D, uid: 'perf' + Date.now() });
        console.log('  load + join: ' + page.loadSecs + ' s; ' + await qa(page, () => window.__qa.gpu()));
        await qa(page, () => window.__qa.noWatch(true));
        await sleep(1600);
        await qa(page, () => window.__qa.close());
        await sleep(400);
        const row = { name: D.name, load: page.loadSecs };
        // on the Garage Deck, the city all round
        await qa(page, () => window.__qa.perf(true));
        row.camp = await measure(page, 5);
        console.log('  on the deck:   ' + fmtM(row.camp));
        // driving, by autopilot
        await qa(page, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
        await page.waitForFunction(() => window.__qa.state().cp >= 0, { timeout: 60000, polling: 200 });
        await qa(page, () => window.__qa.perf(true));
        row.climb = await measure(page, 6);
        console.log('  driving:       ' + fmtM(row.climb));
        await qa(page, () => window.__qa.auto(false));
        // a Police Chase: six cars and the cops at once
        await startRace(page);
        await qa(page, () => window.__qa.perf(true));
        await qa(page, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
        await sleep(2500);
        if (PROFILE) {
            const c = await page.createCDPSession();
            await c.send('Profiler.enable');
            await c.send('Profiler.setSamplingInterval', { interval: 500 });
            await c.send('Profiler.start');
            await sleep(12000);
            const { profile } = await c.send('Profiler.stop');
            const self = new Map(), total = profile.samples.length;
            const byId = new Map(profile.nodes.map((n) => [n.id, n]));
            for (const s of profile.samples) { const n = byId.get(s).callFrame; const k = n.functionName + ' ' + n.url.split('/').pop().split('?')[0] + ':' + n.lineNumber; self.set(k, (self.get(k) || 0) + 1); }
            const top = [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 26);
            console.log('  CPU profile (self time):');
            for (const [k, v] of top) console.log('   ' + (v / total * 100).toFixed(1).padStart(5) + '%  ' + k);
            fs.writeFileSync(path.join(OUT, 'cpu.cpuprofile'), JSON.stringify(profile));
            console.log('  sections:', JSON.stringify(await qa(page, () => window.__qa.sections())));
        }
        row.race = await measure(page, 6);
        console.log('  in a chase:    ' + fmtM(row.race));
        await endRace(page);
        // late in the run: the neon city at night
        await qa(page, () => { const q = window.__qa; q.close(); q.P.pilot = null; q.toStage(62); });
        await sleep(1500);
        await qa(page, () => { window.__qa.close(); window.__qa.auto(); });
        await sleep(4000);
        await qa(page, () => window.__qa.perf(true));
        row.grand = await measure(page, 5);
        console.log('  late on:       ' + fmtM(row.grand));
        await qa(page, () => window.__qa.auto(false));
        row.spikes = await qa(page, () => window.__qa.spikes());
        row.slow = await qa(page, () => window.__qa.slow());
        console.log('  spikes:', JSON.stringify(row.spikes.slice(-6)), 'slow:', JSON.stringify(row.slow.slice(-3)));
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) console.log('  errors:', errs.slice(0, 4));
        results.push(row);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(results, null, 1));
process.exit(0);
