// The production build with real input only: no QA hooks, the keyboard, mouse and touch as a player uses them, the game's own words on
// screen as the only way to know what happened. Run: npm run build, then node tests/prod.mjs
import { startServer, stopAll, launch, open, sleep, shot } from './lib.mjs';

let fails = 0;
const check = (c, what) => { console.log((c ? '  ok  ' : 'FAIL  ') + what); if (!c) fails++; };
const text = (page, sel) => page.$eval(sel, (e) => e.textContent);
const num = async (page, sel) => { const t = await text(page, sel); const n = parseFloat(t.replace(/,/g, '')); return /K$/.test(t) ? n * 1000 : /M$/.test(t) ? n * 1e6 : n; };
const visible = (page, sel) => page.$eval(sel, (e) => !e.hidden && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0).catch(() => false);
const opened = (page) => page.$eval('#modal', (e) => !e.hidden);
async function waitFor(fn, secs) { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const v = await fn(); if (v) return v; await sleep(150); } return null; }
const stageOf = async (page) => { const m = /Stage (\d+)/.exec(await text(page, '#progTxt')); return m ? +m[1] : 0; };
const center = (page, sel) => page.$eval(sel, (e) => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; });

await startServer(3013, {});
const browser = await launch();
try {
    console.log('--- desktop, keyboard and mouse');
    const url = 'http://localhost:3013/';
    const page = await open(browser, url, { w: 1280, h: 720, uid: 'prod' + Date.now() });
    console.log('  load + join', page.loadSecs, 's');
    check(await page.evaluate(() => !window.__qa), 'no QA hooks in the build');
    check(await visible(page, '#hud') && await visible(page, '#menu'), 'no start menu: straight in the world, the HUD up');
    check(/Garage Deck/.test(await text(page, '#progTxt')), 'a new player lands on the Garage Deck');
    await waitFor(() => opened(page), 4);
    check(await opened(page) && /Ready to claim/.test(await text(page, '#modal')), 'the daily reward pops up: ready to claim');
    await page.click('#modal [data-act="daily"]'); await sleep(500);
    check(/Come back tomorrow/.test(await text(page, '#modal')), 'and is claimed by its button');
    await waitFor(async () => await num(page, '#coinVal') >= 150, 3);
    check(await num(page, '#coinVal') >= 150, 'the Coins: ' + await text(page, '#coinVal'));
    await page.click('#modal [data-close]'); await sleep(300);
    // out through START and on: W held, the jets held now and then across the gaps, as someone would
    await page.keyboard.down('KeyW');
    const t0 = Date.now();
    let started = false, seen = false, stage = 0, kmh = 0;
    while (Date.now() - t0 < 50000) {
        await sleep(900);
        kmh = Math.max(kmh, +(await text(page, '#spdVal')) || 0);
        if ((await text(page, '#timerTxt')) !== '00:00') started = true;
        stage = Math.max(stage, await stageOf(page));
        if (await visible(page, '#cpWord')) seen = true;
        if (seen && stage >= 3) break;
        if (stage >= 2) { await page.keyboard.down('Space'); await sleep(600); await page.keyboard.up('Space'); }
    }
    await page.keyboard.up('KeyW');
    await shot(page, 'prod-run');
    check(kmh > 60, 'holding W: the speedometer climbs to ' + kmh + ' km/h');
    check(started, 'out through START to Stage 1, and the clock runs: ' + await text(page, '#timerTxt'));
    check(stage >= 2 && seen, 'the bar says which stage: ' + stage + ', and a checkpoint says so');
    // every menu button opens its panel
    for (const [sel, word] of [['#bGarage', 'Garage'], ['#bCrates', 'Crates'], ['#bQuests', 'Quests'], ['#bTeleport', 'Teleport'], ['#bRewards', 'Rewards'], ['#bSettings', 'Options'], ['#coinBox', 'Leaderboards'], ['#keyBox', 'Crates'], ['#giftPill', 'Rewards']]) {
        await page.click(sel); await sleep(260);
        const h = await page.$eval('#modal h2', (e) => e.textContent).catch(() => '');
        check(h.includes(word), sel + ' opens ' + word);
        await page.click('#modal [data-close]'); await sleep(180);
    }
    // a typed code
    await page.click('#bRewards'); await sleep(250);
    await page.click('#modal [data-tab="codes"]'); await sleep(250);
    await page.type('#codeIn', 'nitro');
    await page.click('#modal [data-act="code"]');
    const coded = await waitFor(async () => /redeemed/i.test(await text(page, '#toasts')), 3);
    check(!!coded, 'a code typed in: ' + (await text(page, '#toasts')));
    await page.click('#modal [data-close]'); await sleep(200);
    // a tune-up with the Coins you earned
    await page.click('#bGarage'); await sleep(250);
    await page.click('#modal [data-tab="ups"]'); await sleep(250);
    const before = await num(page, '#coinVal');
    await page.click('#modal [data-act="upgrade"][data-id="engine"]');
    await sleep(800);
    const after = await num(page, '#coinVal');
    check(after < before, 'the Turbo Engine bought: Coins ' + before + ' → ' + after);
    await page.click('#modal [data-close]'); await sleep(200);
    // Easy / Normal / Hard
    await page.click('#bDiff'); await sleep(300);
    check(/Hard/.test(await text(page, '#diffTxt')), 'the mode button: ' + await text(page, '#diffTxt'));
    await page.click('#bDiff'); await sleep(300); await page.click('#bDiff'); await sleep(300);
    // CHASE: the queue, a Police Chase, the cops
    await page.click('#bChase');
    const qTxt = await waitFor(async () => (await visible(page, '#queueBox')) && text(page, '#queueTxt'), 2);
    check(/1 \/ 6/.test(String(qTxt)), 'CHASE: the queue, how many found: "' + qTxt + '"');
    await shot(page, 'prod-queue');
    const inrace = await waitFor(() => page.evaluate(() => document.body.classList.contains('inrace')), 12);
    check(!!inrace, 'then a Police Chase: bots fill the empty places');
    const card = await waitFor(async () => (await visible(page, '#card')) && text(page, '#cardS'), 3);
    check(/Police Chase/.test(String(card)), 'the card says what: ' + card);
    const count = await waitFor(async () => { const t = await text(page, '#count'); return /GO/.test(t) && t; }, 14);
    check(!!count, 'the countdown: GO!');
    await shot(page, 'prod-race');
    const busted = await waitFor(async () => /BUSTED/.test(await text(page, '#bigText')), 120);
    check(!!busted, 'stand still and the cops catch you: BUSTED!');
    const res = await waitFor(() => page.$eval('#modal', (e) => !e.hidden && /Police Chase/.test(e.textContent)), 120);
    check(!!res, 'the results come up');
    await shot(page, 'prod-results');
    check(/XP/.test(await text(page, '#modal')), 'with what it paid');
    await page.click('#modal [data-act="camp"]');
    const home = await waitFor(async () => (await page.evaluate(() => !document.body.classList.contains('inrace'))) && visible(page, '#menu'), 8);
    check(!!home, 'Back to My Run by its button');
    check(/Stage/.test(await text(page, '#progTxt')), 'back on your stage: ' + await text(page, '#progTxt'));
    check(page.errors.length === 0, 'no console errors: ' + JSON.stringify(page.errors.slice(0, 3)));
    await page.close();

    console.log('--- what the game tells Bloxity (an SDK stand-in)');
    const STUB = 'window.__log = []; window.Legion = { SDK: { init() { window.__log.push("init"); }, portal: { isEmbeddedInLegion() { return false; } }, game: { loadingStep() {}, updateRoom(r) { window.__log.push("room:" + (r ? "yes" : "no")); }, loadingEnd() { window.__log.push("loadingEnd"); window.__startHidden = document.querySelector("#start").hidden; } } } };';
    const sdkPage = await open(browser, url, { w: 1280, h: 720, uid: 'prodsdk' + Date.now(), sdkStub: STUB });
    await sleep(800);
    const lg = await sdkPage.evaluate(() => window.__log);
    check(lg.filter((x) => x === 'loadingEnd').length === 1, 'loadingEnd() is called once: ' + lg.join(', '));
    check(lg.indexOf('room:yes') >= 0 && lg.indexOf('room:yes') < lg.indexOf('loadingEnd'), 'after it has joined a server, with no menu in between');
    check(await sdkPage.evaluate(() => window.__startHidden === true), 'with the loading screen already gone');
    check(sdkPage.errors.length === 0, 'no console errors: ' + JSON.stringify(sdkPage.errors.slice(0, 4)));
    await sdkPage.close();

    for (const [w, h, name] of [[390, 844, 'portrait'], [844, 390, 'landscape']]) {
        console.log('--- a ' + name + ' phone, touch only');
        const ph = await open(browser, url, { w, h, dpr: 2, touch: true, q: 'low', uid: 'prodph' + name + Date.now() });
        await sleep(1600);
        if (await opened(ph)) { const x = await center(ph, '#modal [data-close]'); await ph.touchscreen.tap(x.x, x.y); await sleep(400); }
        check(await visible(ph, '#stick') && await visible(ph, '#flyBtn') && await visible(ph, '#boostBtn'), 'the stick, FLY and BOOST are up');
        const box = await center(ph, '#stick'), fb = await center(ph, '#flyBtn');
        // both thumbs, as a player's: the stick held forward, FLY held now and then with the other
        const thumb = await ph.touchscreen.touchStart(box.x, box.y);
        await thumb.move(box.x, box.y - box.w * 0.42);
        let kmh = 0;
        for (let i = 0; i < 16; i++) { await sleep(900); kmh = Math.max(kmh, +(await text(ph, '#spdVal')) || 0); if (i > 3) { const other = await ph.touchscreen.touchStart(fb.x, fb.y); await sleep(450); await other.end(); } }
        await shot(ph, 'prod-phone-' + name);
        const held = await ph.$eval('#knob', (e) => e.style.transform);
        await thumb.end();
        check(/-\d/.test(held), 'the stick stays held while the other thumb holds FLY: ' + held);
        check(kmh > 60 && (await text(ph, '#timerTxt')) !== '00:00', 'both thumbs drive you out to Stage 1 at ' + kmh + ' km/h: ' + await text(ph, '#timerTxt') + ', ' + await text(ph, '#progTxt'));
        await sleep(900);
        const pb = await center(ph, '#bChase');
        await ph.touchscreen.tap(pb.x, pb.y);
        check(!!(await waitFor(() => visible(ph, '#queueBox'), 2)), 'CHASE by touch: the queue');
        check(!!(await waitFor(() => ph.evaluate(() => document.body.classList.contains('inrace')), 14)), 'and a Police Chase');
        await shot(ph, 'prod-phone-' + name + '-chase');
        check(ph.errors.length === 0, 'no console errors: ' + JSON.stringify(ph.errors.slice(0, 3)));
        await ph.close();
    }
} catch (e) { console.error(e); fails++; } finally { await browser.close(); stopAll(); }
console.log(fails ? fails + ' FAILED' : 'all good');
process.exit(fails ? 1 : 0);
