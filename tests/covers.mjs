// The two store covers (1920x1080, 800x800), rendered from the game itself at High: a jetcar mid-flight off a ramp over the city, its
// exhaust burning, the sky road running on ahead, with the title over it in the game's own lettering. Run: node tests/covers.mjs [stage]
import fs from 'node:fs';
import path from 'node:path';
import { startServer, startGame, stopAll, launch, open, qa, sleep, ROOT } from './lib.mjs';

const STAGE = +(process.argv[2] ?? 3);
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
const dir = path.join(ROOT, 'covers');
fs.mkdirSync(dir, { recursive: true });
const SHADE = '#3a0a1a';
const TITLE = (big) => `<div id="ctitle" style="position:fixed;left:0;right:0;top:${big ? '4%' : '5%'};z-index:99;text-align:center;font-family:'Luckiest Guy',sans-serif;line-height:.9;color:#fff;letter-spacing:.02em;text-shadow:0 .09em 0 ${SHADE},.05em 0 0 ${SHADE},-.05em 0 0 ${SHADE},0 -.05em 0 ${SHADE},.05em .05em 0 ${SHADE},-.05em .05em 0 ${SHADE},.05em -.05em 0 ${SHADE},-.05em -.05em 0 ${SHADE},0 0 .5em rgba(255,120,60,.6);font-size:${big ? '170px' : '118px'}">JETCAR <span style="color:#ffd22a">GETAWAY</span></div>`;
const HIDE = () => { window.__qa.hud(false); for (const s of ['#hud', '#toasts', '#bigText', '#popup', '#lvlUp', '#card', '#count', '#touch', '#raceHud', '#flyLayer', '#airWord', '#cpWord']) { const e = document.querySelector(s); if (e) e.style.display = 'none'; } };
// beside and a little behind the car, looking on along the road
const photo = (page, o) => qa(page, (o) => {
    const q = window.__qa;
    q.P.photo = (cam) => {
        const b = q.P.b, ry = b.yaw, fx = Math.sin(ry), fz = Math.cos(ry), rx = fz, rz = -fx;
        cam.position.set(b.x - fx * o.back + rx * o.side, b.y + o.h, b.z - fz * o.back + rz * o.side);
        cam.lookAt(b.x + fx * o.ahead - rx * o.side * 0.25, b.y + o.lh, b.z + fz * o.ahead - rz * o.side * 0.25);
        if (cam.fov !== o.fov) { cam.fov = o.fov; cam.updateProjectionMatrix(); }
    };
}, o);
try {
    for (const [w, h, name, cam] of [
        [1920, 1080, 'cover-1920x1080.png', { back: 11, side: 9, h: 2.4, ahead: 26, lh: 3.2, fov: 56 }],
        [800, 800, 'cover-800x800.png', { back: 12, side: 7, h: 2.8, ahead: 26, lh: 5, fov: 64 }],
    ]) {
        const page = await open(browser, GAME, { w, h, dpr: 1, q: 'high', uid: 'cover' + w + Date.now() });
        await qa(page, () => { const q = window.__qa; q.noWatch(true); q.give({ coins: 900000, lv: 20, stars: 10, keys: 20 }); });
        await sleep(1500);
        await qa(page, () => { const q = window.__qa; q.close(); q.send('car', { id: 'hornet' }); q.send('paint', { id: 'racer' }); q.send('crate', { c: 'street', n: 3 }); });
        await sleep(2600);
        await qa(page, () => { const q = window.__qa; q.close(); const S = q.S; const best = Object.keys(S.exhausts || {}).filter((x) => x !== 'stock')[0]; if (best) q.send('exhaust', { id: best }); });
        await sleep(800);
        await qa(page, HIDE);
        await qa(page, (s) => { const q = window.__qa; q.close(); q.P.pilot = null; q.toStage(s); }, STAGE);
        await sleep(900);
        await qa(page, () => { window.__qa.close(); window.__qa.auto(); });
        await photo(page, cam);
        await page.evaluate((html) => { const d = document.createElement('div'); d.innerHTML = html; document.body.appendChild(d); }, TITLE(w > 1000));
        // in the air on the jets
        await page.waitForFunction(() => { const b = window.__qa.P.b; return b.flying && b.y > 12; }, { timeout: 20000, polling: 16 }).catch(() => {});
        await sleep(120);
        await page.screenshot({ path: path.join(dir, name), type: 'png' });
        console.log('wrote', name, page.errors);
        await page.close();
    }
} catch (e) { console.error(e); } finally { await browser.close(); stopAll(); }
process.exit(0);
