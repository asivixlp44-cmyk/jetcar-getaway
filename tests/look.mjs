// pictures to judge the look by: the deck, stages in every world mid-drive and mid-flight, a car up close
import { startServer, startVite, startGame, launch, open, shot, sleep, stopAll, qa } from './lib.mjs';
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
try {
    const W = +(process.env.W || 1280), H = +(process.env.H || 720);
    const page = await open(browser, GAME, { w: W, h: H, q: process.env.Q || 'high', uid: 'look' + Date.now(), touch: !!process.env.TOUCH, dpr: +(process.env.DPR || 1) });
    const tag = process.env.TAG || 'look';
    await sleep(1200);
    await qa(page, () => window.__qa.close());
    await sleep(600);
    await shot(page, tag + '_deck');
    const stages = (process.env.STAGES || '2,5,30,55,80').split(',').map(Number);
    for (const s of stages) {
        await qa(page, (i) => { window.__qa.close(); window.__qa.toStage(i); }, s);
        await sleep(1200);
        await qa(page, () => window.__qa.auto(true));
        await sleep(+(process.env.T1 || 2600));
        await shot(page, tag + '_s' + (s + 1) + 'a');
        await sleep(+(process.env.T2 || 1400));
        await shot(page, tag + '_s' + (s + 1) + 'b');
        await qa(page, () => window.__qa.auto(false));
    }
    console.log('errors', page.errors.slice(0, 10));
} finally { await browser.close(); stopAll(); }
