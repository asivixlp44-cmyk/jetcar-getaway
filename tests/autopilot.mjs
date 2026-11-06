// Browser runs with the autopilot (the bots' pilot driving through the same input and physics as you): the controls, the long run with
// the stages paying, each world's first stages, a full Police Chase on every map at a different tier each; no snaps, no console errors.
// Run: node tests/autopilot.mjs [full] [maps] (full: the whole long run, Stage 1 to the Getaway Tower; maps: only the chases)
import { startServer, startGame, stopAll, launch, open, qa, sleep, shot } from './lib.mjs';
import { WORLDS, STAGES, STAGES_PER_WORLD, CHASE_TIERS } from '../shared/config.js';

const FULL = process.argv.includes('full'), ONLY_MAPS = process.argv.includes('maps');
let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
try {
    const page = await open(browser, GAME, { w: 1280, h: 720, q: 'medium', uid: 'auto' + Date.now() });
    console.log('loaded in', page.loadSecs, 's');
    await qa(page, () => window.__qa.noWatch(true));
    await sleep(1800);
    await qa(page, () => window.__qa.close());
    await sleep(500);

    console.log('--- the controls');
    const drove = await qa(page, async () => { const q = window.__qa, x0 = q.P.b.x, z0 = q.P.b.z; q.key('KeyW', true); await new Promise((r) => setTimeout(r, 1000)); q.key('KeyW', false); return Math.hypot(q.P.b.x - x0, q.P.b.z - z0); });
    check(drove > 12, 'W drives forward: ' + drove.toFixed(1) + ' studs in 1 s');
    await sleep(1200);
    const lift = await qa(page, async () => { const q = window.__qa, y0 = q.P.b.y; q.key('Space', true); await new Promise((r) => setTimeout(r, 700)); const y = q.P.b.y, gas = q.P.b.gas; q.key('Space', false); return { dy: y - y0, gas }; });
    check(lift.dy > 6 && lift.gas < 100, 'holding FLY lifts the car on the jets: up ' + lift.dy.toFixed(1) + ' studs, gas down to ' + Math.round(lift.gas));
    await sleep(2500);
    const steer = await qa(page, async () => { const q = window.__qa, y0 = q.P.b.yaw; q.key('KeyW', true); q.key('KeyD', true); await new Promise((r) => setTimeout(r, 800)); q.key('KeyD', false); q.key('KeyW', false); return q.P.b.yaw - y0; });
    check(steer < -0.3, 'D steers right: heading ' + steer.toFixed(2) + ' rad');
    const sz = await qa(page, () => window.__qa.sizes());
    check(sz.over === 0, 'every stage fits its slot: the biggest is ' + sz.nv + ' of ' + sz.CAPV + ' vertices, ' + sz.ni + ' of ' + sz.CAPI + ' indices');

    if (!ONLY_MAPS) {
        console.log('--- the long run, ' + (FULL ? 'from Stage 1 to the Getaway Tower' : 'the first stages'));
        await qa(page, () => { const q = window.__qa; q.send('warp', { to: 'home' }); });
        await sleep(1200);
        const goal = FULL ? STAGES : 14, t0 = Date.now();
        await qa(page, () => { window.__qa.close(); window.__qa.P.pilot = null; window.__qa.auto(); });
        let last = -1, stuckAt = Date.now(), s;
        for (;;) {
            await sleep(1000);
            s = await qa(page, () => window.__qa.state());
            if (s.cp > last) { last = s.cp; stuckAt = Date.now(); }
            if (s.cp + 1 >= goal && (!FULL || s.tower)) break;
            if (Date.now() - stuckAt > 90000) break;
            if (Math.floor((Date.now() - t0) / 60000) !== Math.floor((Date.now() - t0 - 1000) / 60000)) console.log('      ' + Math.round((Date.now() - t0) / 60000) + ' min: stage ' + (s.cp + 1) + ', ' + s.respawns + ' crashes');
        }
        check(s.cp + 1 >= goal, 'drove to Stage ' + (s.cp + 1) + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s (' + s.respawns + ' crashes)');
        check(s.stage >= s.cp + 1, 'the server agrees: stage ' + s.stage + ', ' + s.coins + ' Coins, Level ' + s.lv);
        check(s.snaps === 0, 'no snaps in all of that: ' + s.snaps);
        await shot(page, 'auto-run');
        if (FULL) {
            check(s.tower, 'the Getaway Tower offers its Trophy at the end');
            await qa(page, () => window.__qa.actions.claim());
            await sleep(1500);
            const r = await qa(page, () => window.__qa.state());
            check(r.laps === 1 && r.stars === 1 && r.stage === 0, 'a Trophy, and back to the Garage Deck');
            await qa(page, () => window.__qa.close());
        }
        await qa(page, () => window.__qa.auto(false));
        await sleep(600);
        if (!FULL) {
            for (let w = 1; w < WORLDS.length; w++) {
                const from = w * STAGES_PER_WORLD, to = from + 4;
                await qa(page, (i) => { const q = window.__qa; q.close(); q.P.pilot = null; q.toStage(i); }, from);
                await sleep(900);
                await qa(page, () => { window.__qa.close(); window.__qa.auto(); });
                await page.waitForFunction((n) => window.__qa.state().cp >= n, { timeout: 150000, polling: 300 }, to).catch(() => {});
                const r = await qa(page, () => window.__qa.state());
                check(r.cp >= to, WORLDS[w].name + ': through stage ' + (to + 1) + ' (' + r.respawns + ' crashes so far)');
                await shot(page, 'auto-w' + w);
                await qa(page, () => window.__qa.auto(false));
            }
            check((await qa(page, () => window.__qa.state().snaps)) === 0, 'still no snaps');
        }
    }

    console.log('--- a full Police Chase on every map');
    for (let w = 0; w < WORLDS.length; w++) {
        const tier = [0, 2, 3, 5][w];
        await qa(page, (lv) => { const q = window.__qa; q.close(); q.auto(false); q.give({ lv }); }, CHASE_TIERS[tier].lv);
        await sleep(400);
        await qa(page, (ww) => { window.__qa.close(); window.__qa.play(ww); }, w);
        await page.waitForFunction(() => window.__qa.state().inRace, { timeout: 40000, polling: 200 });
        await page.waitForFunction(() => window.__qa.state().t > 0.1, { timeout: 20000, polling: 100 });
        await qa(page, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
        const t0 = Date.now();
        await page.waitForFunction(() => { const s = window.__qa.state(); return s.finished || s.out || s.results; }, { timeout: 200000, polling: 300 }).catch(() => {});
        const r = await qa(page, () => window.__qa.state());
        check(r.finished || r.out, WORLDS[w].name + ' (tier ' + tier + '): ' + (r.finished ? 'got away' : r.out ? 'BUSTED' : 'neither') + ' after ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s, ' + r.respawns + ' crashes so far');
        await shot(page, 'auto-chase-' + w);
        await page.waitForFunction(() => window.__qa.state().results, { timeout: 120000, polling: 300 }).catch(() => {});
        const res = await qa(page, () => window.__qa.state());
        check(res.results, 'the results come up');
        await qa(page, () => { window.__qa.auto(false); window.__qa.leave(); });
        await page.waitForFunction(() => !window.__qa.state().inRace && !window.__qa.state().switching, { timeout: 20000, polling: 200 });
        await sleep(600);
    }
    const st = await qa(page, () => window.__qa.state());
    check(st.races >= WORLDS.length && st.snaps === 0, 'every chase counted (' + st.races + '), no snaps (' + st.snaps + ')');
    const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
    check(!errs.length, 'no console errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
