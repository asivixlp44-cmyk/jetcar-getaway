import { startServer, startVite, startGame, launch, open, shot, sleep, stopAll, qa } from './lib.mjs';
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
try {
    const page = await open(browser, GAME, { w: 1280, h: 720, q: 'high', uid: 'car' + Date.now() });
    await sleep(1500);
    await qa(page, () => window.__qa.close());
    const views = [[2.4, 0.15, 9, 'side'], [0, 0.35, 9, 'back'], [3.3, 0.25, 10, 'front']];
    for (const car of (process.env.CARS || 'comet,zephyr,hornet,tidal').split(',')) {
        await qa(page, (c) => { window.__qa.S.car = c; window.__qa.P && 0; }, car);
        await qa(page, (c) => { const q = window.__qa; q.give({ coins: 99999, lv: 30 }); q.send('car', { id: c }); }, car);
        await sleep(700);
        for (const [y, p, d, n] of views) { await qa(page, (a) => window.__qa.look(a[0], a[1], a[2]), [y, p, d]); await sleep(500); await shot(page, 'car_' + car + '_' + n); }
    }
    // flying: hold space for a moment
    await qa(page, () => { window.__qa.look(2.2, 0.2, 11); window.__qa.key('KeyW', true); });
    await sleep(1500);
    await qa(page, () => window.__qa.key('Space', true));
    await sleep(700);
    await shot(page, 'car_fly');
    await qa(page, () => { window.__qa.key('Space', false); window.__qa.key('KeyW', false); });
    console.log('errors', page.errors.slice(0, 10));
} finally { await browser.close(); stopAll(); }
