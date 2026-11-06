// Every screen, at every size: three portrait phones, a landscape phone, a desktop. Measures the HUD's boxes and the touch controls for
// overlaps and things cut off, and saves a screenshot of each. Run: node tests/screens.mjs [one]
import { startServer, startVite, startGame, stopAll, launch, open, qa, shot, sleep, OUT } from './lib.mjs';

const ALL = [
    { name: '390x844', w: 390, h: 844, dpr: 2, touch: true },
    { name: '360x800', w: 360, h: 800, dpr: 2, touch: true },
    { name: '375x667', w: 375, h: 667, dpr: 2, touch: true },
    { name: '844x390', w: 844, h: 390, dpr: 2, touch: true },
    { name: '1280x720', w: 1280, h: 720, dpr: 1, touch: false },
];
const SIZES = process.argv[2] ? ALL.filter((s) => s.name === process.argv[2]) : ALL;
const HUD = ['#progress', '#timerBox', '#giftPill', '#questPill', '#menu', '#coinBox', '#gemsBox', '#keyBox', '#bPlayersShow', '#players', '#gasBox', '#speedo', '#boostBar', '#lvBar', '#stick', '#flyBtn', '#boostBtn', '#flipBtn', '#queueBox', '#bBack', '#hint'];
const RACE = ['#raceBar', '#raceInfo', '#bLeave', '#bBack', '#gasBox', '#speedo', '#lvBar', '#stick', '#flyBtn', '#boostBtn', '#flipBtn'];
const RUN = HUD;
// the boxes on screen: which overlap, and what's cut off
const audit = (page, sels) => page.evaluate((list) => {
    const out = { off: [], over: [], corner: [] }, boxes = [], W = innerWidth, H = innerHeight;
    for (const s of list) {
        const e = document.querySelector(s);
        if (!e || e.hidden) continue;
        const cs = getComputedStyle(e);
        if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
        // (a parent that's hidden in a race)
        if (e.offsetParent === null && cs.position !== 'fixed') continue;
        const r = e.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        boxes.push({ s, l: r.left, t: r.top, r: r.right, b: r.bottom });
        if (r.left < -1 || r.top < -1 || r.right > W + 1 || r.bottom > H + 1) out.off.push(s + ' ' + [r.left, r.top, r.right, r.bottom].map(Math.round));
        // the Bloxity overlay's corner: top-left stays free
        if (r.left < 100 && r.top < 60) out.corner.push(s);
    }
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j], ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 1.5 && oy > 1.5) out.over.push(a.s + ' x ' + b.s + ' (' + Math.round(ox) + 'x' + Math.round(oy) + ')');
    }
    return out;
}, sels);
let bad = 0;
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
try {
    for (const S of SIZES) {
        console.log('\n=== ' + S.name);
        const page = await open(browser, GAME, { ...S, q: 'low', uid: 'scr' + S.name + Date.now() });
        await qa(page, () => window.__qa.noWatch(true));
        await sleep(1500);
        await shot(page, S.name + '-panel-daily-first');
        await qa(page, () => window.__qa.close());
        await sleep(600);
        const report = async (tag, sels) => {
            await sleep(450);
            await shot(page, S.name + '-' + tag);
            if (!sels) return;
            const a = await audit(page, sels);
            const msg = [...a.off.map((x) => 'CUT ' + x), ...a.over.map((x) => 'OVER ' + x), ...a.corner.map((x) => 'CORNER ' + x)];
            if (msg.length) { bad += msg.length; console.log('  ' + tag + ': ' + msg.join(' · ')); } else console.log('  ' + tag + ': clean');
        };
        await report('hud', HUD);
        await qa(page, () => { window.__qa.give({ coins: 9876543, gems: 2000, keys: 88, stars: 12, playSecs: 200, lv: 12, stage: 3 }); window.__qa.send('upgrade', { id: 'engine' }); });
        await sleep(400);
        await report('hud2', HUD);
        await qa(page, () => window.__qa.close());
        await sleep(300);
        // on the course, running: the bar, the clock, nothing else
        await qa(page, () => { window.__qa.send('warp', { to: 'last' }); });
        await sleep(1300);
        await qa(page, () => { window.__qa.close(); window.__qa.auto(); });
        await sleep(2200);
        await report('run', RUN);
        await qa(page, () => window.__qa.auto(false));
        await sleep(900);
        await report('stop', HUD);
        await qa(page, () => window.__qa.send('warp', { to: 'home' }));
        await sleep(900);
        await report('deck', HUD);
        for (const [k, t] of [['garage', 'cars'], ['garage', 'ups'], ['garage', 'paint'], ['crates'], ['crates', 'mine'], ['crate', 'street'], ['quests'], ['rewards', 'daily'], ['rewards', 'gifts'], ['rewards', 'codes'], ['teleport'], ['boards'], ['settings'], ['tower']]) {
            await qa(page, (a) => { window.__qa.close(); window.__qa.panel(a.k, a.t); }, { k, t });
            await sleep(120);
            await shot(page, S.name + '-panel-' + k + (t ? '-' + t : ''));
            const fit = await page.evaluate(() => { const p = document.querySelector('#modal .panel'); if (!p) return 'none'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'panel cut: ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
            if (fit) { bad++; console.log('  ' + k + ': ' + fit); }
        }
        await qa(page, () => window.__qa.close());
        // a crate opening
        await qa(page, () => window.__qa.send('crate', { c: 'street', n: 3 }));
        await sleep(350);
        await shot(page, S.name + '-hatch-a');
        await sleep(900);
        await shot(page, S.name + '-hatch-b');
        await qa(page, () => window.__qa.close());
        await sleep(600);
        // the queue, the card and countdown, the race, the results
        await qa(page, () => window.__qa.play());
        await sleep(700);
        await report('queue', HUD);
        await page.waitForFunction(() => { const s = window.__qa.state(); return s.inRace && s.t > -5; }, { timeout: 40000, polling: 150 });
        await sleep(600);
        await report('card', RACE);
        await page.waitForFunction(() => window.__qa.state().t > -2.4, { timeout: 15000, polling: 100 });
        await shot(page, S.name + '-count');
        await page.waitForFunction(() => window.__qa.state().t > 0.2, { timeout: 15000, polling: 100 });
        await qa(page, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
        await sleep(9000);
        await report('race', RACE);
        await qa(page, () => window.__qa.auto(false));
        await page.waitForFunction(() => { const s = window.__qa.state(); return s.results; }, { timeout: 240000, polling: 400 });
        await sleep(400);
        await shot(page, S.name + '-results');
        const fit = await page.evaluate(() => { const p = document.querySelector('#modal .panel'); if (!p) return 'none'; const r = p.getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 ? '' : 'results cut: ' + [r.left, r.top, r.right, r.bottom].map(Math.round); });
        if (fit) { bad++; console.log('  results: ' + fit); } else console.log('  results: clean');
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) { bad += errs.length; console.log('  errors:', errs.slice(0, 4)); }
        await page.close();
    }
} catch (e) { console.error(e); bad++; } finally { await browser.close(); stopAll(); }
console.log('\n' + (bad ? bad + ' problems' : 'all clean') + '; shots in', OUT);
process.exit(bad ? 1 : 0);
