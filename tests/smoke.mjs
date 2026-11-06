// a quick look: the game loads, joins, drives a few seconds on the autopilot; errors and a screenshot
import { startServer, startVite, startGame, launch, open, shot, sleep, stopAll, qa } from './lib.mjs';
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
try {
    const W = +(process.env.W || 1280), H = +(process.env.H || 720);
    const page = await open(browser, GAME, { w: W, h: H, q: process.env.Q || 'medium', uid: 'smoke' + Date.now(), touch: !!process.env.TOUCH, dpr: +(process.env.DPR || 1) });
    console.log('loaded in', page.loadSecs, 's');
    await sleep(1500);
    console.log(await qa(page, () => window.__qa.state()));
    await shot(page, 'smoke_spawn');
    if (process.env.STAGE) { await qa(page, (i) => window.__qa.toStage(i), +process.env.STAGE); await sleep(1500); }
    await qa(page, () => { window.__qa.close(); window.__qa.auto(true); });
    for (let i = 0; i < (+process.env.SECS || 12); i += 3) { await sleep(3000); console.log(JSON.stringify(await qa(page, () => window.__qa.state()))); }
    await shot(page, 'smoke_drive');
    console.log('perf', JSON.stringify(await qa(page, () => window.__qa.perf())));
    console.log('errors', page.errors.slice(0, 10));
} finally { await browser.close(); stopAll(); }
