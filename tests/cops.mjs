// Pictures of a Police Chase: the start line, the cops coming up behind (the camera turned round), the pack mid-chase.
// Run: node tests/cops.mjs [world]
import { startServer, startGame, launch, open, shot, sleep, stopAll, qa } from './lib.mjs';
const W = +(process.argv[2] || 0);
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
try {
    const page = await open(browser, GAME, { w: 1280, h: 720, q: 'high', uid: 'cops' + Date.now() });
    await sleep(1200);
    await qa(page, (w) => { const q = window.__qa; q.close(); q.give({ lv: 6 }); q.play(w); }, W);
    await page.waitForFunction(() => window.__qa.state().inRace, { timeout: 40000, polling: 200 });
    await page.waitForFunction(() => window.__qa.state().t > -3, { timeout: 20000, polling: 100 });
    await shot(page, 'cops-line');
    await page.waitForFunction(() => window.__qa.state().t > 0.1, { timeout: 20000, polling: 100 });
    // sit still a moment so they catch up, looking back
    await qa(page, () => window.__qa.look(Math.PI, 0.25, 22));
    await page.waitForFunction(() => window.__qa.state().t > 9, { timeout: 20000, polling: 100 });
    await shot(page, 'cops-behind');
    await qa(page, () => { const q = window.__qa; q.look(0, 0, 15); q.P.pilot = null; q.auto(); });
    await sleep(4000);
    await shot(page, 'cops-pack');
    await qa(page, () => window.__qa.look(2.6, 0.3, 26));
    await sleep(300);
    await shot(page, 'cops-pack-side');
    console.log('errors', page.errors.slice(0, 6));
} finally { await browser.close(); stopAll(); }
