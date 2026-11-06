// Every word on every screen, at every size: is it on top of other words or an icon, spilling out of its box, cut off, or off the screen?
// screens.mjs measures the HUD's boxes; this looks inside them, at the text itself. Run: node tests/textfit.mjs [size] [screen filter]; saves a picture of whatever it flags.
import { startServer, startVite, startGame, stopAll, launch, open, qa, shot, sleep, OUT } from './lib.mjs';

const ALL = [
    { name: '390x844', w: 390, h: 844, dpr: 2, touch: true },
    { name: '360x800', w: 360, h: 800, dpr: 2, touch: true },
    { name: '320x568', w: 320, h: 568, dpr: 2, touch: true },
    { name: '375x667', w: 375, h: 667, dpr: 2, touch: true },
    { name: '844x390', w: 844, h: 390, dpr: 2, touch: true },
    { name: '667x375', w: 667, h: 375, dpr: 2, touch: true },
    { name: '768x1024', w: 768, h: 1024, dpr: 1, touch: true },
    { name: '1024x768', w: 1024, h: 768, dpr: 1, touch: false },
    { name: '1280x720', w: 1280, h: 720, dpr: 1, touch: false },
    { name: '1366x768', w: 1366, h: 768, dpr: 1, touch: false },
    { name: '1920x1080', w: 1920, h: 1080, dpr: 1, touch: false },
];
const SIZES = process.argv[2] && process.argv[2] !== 'all' ? ALL.filter((s) => s.name === process.argv[2]) : ALL;
const ONLY = process.argv[3] || '';

const audit = (page) => page.evaluate(() => {
    const W = innerWidth, H = innerHeight, out = [];
    const shown = (e) => { for (let x = e; x && x !== document.documentElement; x = x.parentElement) { if (x.hidden) return false; const c = getComputedStyle(x); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.08) return false; } return true; };
    const modal = document.querySelector('#modal'), confirm = document.querySelector('#confirm');
    const modalOn = modal && !modal.hidden && modal.children.length > 0, confirmOn = confirm && confirm.children.length > 0 && !confirm.hidden;
    // a screen that's up covers what's behind it
    const covered = (e) => (confirmOn && !confirm.contains(e)) || (modalOn && !modal.contains(e) && !(confirm && confirm.contains(e)) && !e.closest('#toasts'));
    const nameOf = (e) => e.id ? '#' + e.id : e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.split(/\s+/)[0] : '');
    const where = (e) => { const p = e.closest('[id]'); return nameOf(e) + (p && p !== e ? ' in #' + p.id : ''); };
    // the part of a rectangle its scrolling or clipping parents let you see: null when none
    const seen = (q, e) => {
        let l = q.left, t = q.top, r = q.right, b = q.bottom, cut = false, clipped = null;
        for (let x = e; x && x !== document.body; x = x.parentElement) {
            const c = getComputedStyle(x);
            if (c.overflowX === 'visible' && c.overflowY === 'visible') continue;
            const R = x.getBoundingClientRect(), L2 = Math.max(l, R.left), T2 = Math.max(t, R.top), R2 = Math.min(r, R.right), B2 = Math.min(b, R.bottom);
            if (R2 - L2 < 1 || B2 - T2 < 1) return null;
            const scrolls = /auto|scroll/.test(c.overflowX + c.overflowY);
            // (a name cut short with dots is meant to be)
            if (!scrolls && c.textOverflow !== 'ellipsis' && (L2 > l + 1.5 || R2 < r - 1.5 || T2 > t + 1.5 || B2 < b - 1.5)) { cut = true; clipped = x; }
            l = L2; t = T2; r = R2; b = B2;
        }
        return { l, t, r, b, cut, clipped };
    };
    const runs = [], walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const text = n.textContent.replace(/\s+/g, ' ').trim(), e = n.parentElement;
        if (!text || !e || /^(SCRIPT|STYLE|NOSCRIPT|OPTION|TITLE)$/.test(e.tagName) || e.closest('#start') || e.closest('.warmui') || !shown(e) || covered(e)) continue;
        const range = document.createRange();
        range.selectNodeContents(n);
        for (const q of range.getClientRects()) {
            if (q.width < 2 || q.height < 2) continue;
            const v = seen(q, e);
            if (!v) continue;
            // (a line's box is taller than its letters)
            const pad = (q.height) * 0.16;
            runs.push({ text: text.slice(0, 26), e, l: v.l, t: v.t + pad, r: v.r, b: v.b - pad });
            if (v.cut) out.push('CUT "' + text.slice(0, 26) + '" by ' + nameOf(v.clipped));
            if (q.left < -1 || q.right > W + 1 || q.top < -1 || q.bottom > H + 1) out.push('OFF SCREEN "' + text.slice(0, 26) + '" ' + where(e));
            // spilling out of the box it's in: the nearest parent that draws something
            for (let x = e; x && x !== document.body; x = x.parentElement) {
                const c = getComputedStyle(x), drawn = c.backgroundColor !== 'rgba(0, 0, 0, 0)' || c.backgroundImage !== 'none' || parseFloat(c.borderTopWidth) > 0 || x.tagName === 'BUTTON';
                if (!drawn) continue;
                const R = x.getBoundingClientRect();
                if (q.left < R.left - 1.5 || q.right > R.right + 1.5 || q.top + pad < R.top - 1.5 || q.bottom - pad > R.bottom + 1.5) out.push('SPILLS "' + text.slice(0, 26) + '" out of ' + nameOf(x) + ' by ' + Math.round(Math.max(R.left - q.left, q.right - R.right, R.top - q.top - pad, q.bottom - pad - R.bottom)) + 'px');
                break;
            }
        }
    }
    // words on words
    for (let i = 0; i < runs.length; i++) for (let j = i + 1; j < runs.length; j++) {
        const a = runs[i], b = runs[j];
        if (a.e === b.e) continue;
        const ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (ox > 2 && oy > 2) out.push('WORDS "' + a.text + '" (' + where(a.e) + ') x "' + b.text + '" (' + where(b.e) + ')');
    }
    // words on a drawn icon that isn't their own
    for (const ic of document.querySelectorAll('i.ic, i.cc, canvas.ic, img')) {
        if (!shown(ic) || covered(ic) || ic.closest('#start') || ic.closest('.warmui')) continue;
        const q = ic.getBoundingClientRect();
        if (q.width < 6 || q.height < 6) continue;
        const v = seen(q, ic);
        if (!v) continue;
        for (const a of runs) {
            const ox = Math.min(a.r, v.r) - Math.max(a.l, v.l), oy = Math.min(a.b, v.b) - Math.max(a.t, v.t);
            if (ox > 3 && oy > 3 && !a.e.classList.contains('badge') && a.e.parentElement !== ic.parentElement) out.push('ICON ' + nameOf(ic) + ' x "' + a.text + '" (' + where(a.e) + ')');
        }
    }
    return [...new Set(out)];
});

let bad = 0, seenAll = new Map();
const GAME = await startGame();
await startServer(3013, { QA: '1' });
const browser = await launch();
try {
    for (const S of SIZES) {
        console.log('\n=== ' + S.name);
        const page = await open(browser, GAME, { ...S, q: 'low', uid: 'fit' + S.name + Date.now() });
        await qa(page, () => window.__qa.noWatch(true));
        await sleep(1400);
        const look = async (tag) => {
            if (ONLY && !tag.includes(ONLY)) return;
            await sleep(330);
            const a = (await audit(page)).filter((x) => !x.startsWith('SPILLS "Daily Rewards')); // (that heading hangs above its panel on purpose)
            if (process.env.ALWAYS) await shot(page, 'all-' + S.name + '-' + tag);
            if (a.length) {
                bad += a.length;
                console.log('  ' + tag + ':'); for (const x of a.slice(0, 14)) console.log('     ' + x);
                for (const x of a) { const k = x.replace(/ by \d+px/, ''); seenAll.set(k, (seenAll.get(k) || 0) + 1); }
                await shot(page, 'fit-' + S.name + '-' + tag);
            }
        };
        await look('daily-first');
        await qa(page, () => window.__qa.close());
        await sleep(500);
        await look('hud-new');
        // the biggest numbers and the longest words anyone will see
        await qa(page, () => { window.__qa.give({ coins: 987654321, gems: 98765, keys: 9876, stars: 123, playSecs: 3000, lv: 88, stage: 88 }); window.__qa.send('upgrade', { id: 'engine' }); });
        await sleep(500);
        await look('hud-rich');
        await qa(page, () => window.__qa.close());
        await qa(page, () => window.__qa.send('warp', { to: 'last' }));
        await sleep(1300);
        await qa(page, () => { window.__qa.close(); window.__qa.auto(); });
        await sleep(1800);
        await look('run');
        await qa(page, () => window.__qa.auto(false));
        await sleep(900);
        await look('stop');
        // what comes up in the middle of a run, all at once
        await qa(page, () => { const m = window.__qa.msg; m.cpWord('Stage 88 reached!'); m.toast('🎯 Quest complete! Claim it in Quests', '#7dff6b'); m.toast('+1,234 Coins and a very long note'); });
        await sleep(200);
        await look('messages');
        // the words a stage, a new world and a level bring, the clock of a run that's taken hours
        await qa(page, () => { const m = window.__qa.msg; m.bigText('NEW BEST TIME!'); m.levelUp(87, 88); m.toast('🎯 Quest complete! Claim it in Quests', '#7dff6b'); m.cpWord('Stage 88!'); document.querySelector('#timerTxt').textContent = '12:34:56'; });
        await sleep(200);
        await look('big-words');
        await qa(page, () => { const m = window.__qa.msg; m.popup('⭐', 'LEVEL UP!', 'You reached Level 88 and unlocked something new', '#7dff6b'); m.cpWord('Stage 89 reached!'); m.toast('🎯 Quest complete! Claim it in Quests', '#7dff6b'); });
        await sleep(200);
        await look('popup');
        await sleep(2600);
        await qa(page, () => window.__qa.send('warp', { to: 'home' }));
        await sleep(900);
        await look('deck');
        for (const [k, t] of [['garage', 'cars'], ['garage', 'ups'], ['garage', 'paint'], ['crates'], ['crates', 'mine'], ['crate', 'street'], ['crate', 'ice'], ['quests'], ['rewards', 'daily'], ['rewards', 'gifts'], ['rewards', 'codes'], ['teleport'], ['boards'], ['settings'], ['tower']]) {
            await qa(page, (a) => { window.__qa.close(); window.__qa.panel(a.k, a.t); }, { k, t });
            await sleep(150);
            await look('panel-' + k + (t ? '-' + t : ''));
            // and scrolled to its end
            const more = await page.evaluate(() => { let n = 0; for (const e of document.querySelectorAll('#modal *')) { const c = getComputedStyle(e); if (/auto|scroll/.test(c.overflowY) && e.scrollHeight > e.clientHeight + 4) { e.scrollTop = e.scrollHeight; n++; } } return n; });
            if (more) await look('panel-' + k + (t ? '-' + t : '') + '-end');
        }
        await qa(page, () => window.__qa.close());
        if (!process.env.NORACE && (!ONLY || ONLY === 'race')) {
            await qa(page, () => window.__qa.play());
            await sleep(700);
            await look('queue');
            await page.waitForFunction(() => { const s = window.__qa.state(); return s.inRace && s.t > -5; }, { timeout: 40000, polling: 150 });
            await sleep(500);
            await look('card');
            await page.waitForFunction(() => window.__qa.state().t > -2.4, { timeout: 15000, polling: 100 });
            await look('count');
            await page.waitForFunction(() => window.__qa.state().t > 0.2, { timeout: 15000, polling: 100 });
            await qa(page, () => { window.__qa.P.pilot = null; window.__qa.auto(); });
            await sleep(6000);
            await look('race');
            await page.waitForFunction(() => window.__qa.state().results, { timeout: 200000, polling: 300 });
            await sleep(500);
            await look('results');
        }
        const errs = [...page.errors, ...(await qa(page, () => window.__qa.errors()))];
        if (errs.length) { bad += errs.length; console.log('  errors:', errs.slice(0, 4)); }
        await page.close();
    }
} catch (e) { console.error(e); bad++; } finally { await browser.close(); stopAll(); }
console.log('\n----- the most common, across every size -----');
for (const [k, n] of [...seenAll.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(String(n).padStart(4) + '  ' + k);
console.log('\n' + (bad ? bad + ' problems' : 'all clean') + '; pictures in', OUT);
process.exit(bad ? 1 : 0);
