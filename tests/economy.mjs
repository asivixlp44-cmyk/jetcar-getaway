// A simulated typical first session, for the pacing: driving the stages at a real player's pace (crashes, a few tries at a gap, the later
// stages take longer), rings and big airs on the way, keys picked up now and then, a Police Chase every few minutes, quests claimed when done,
// gifts claimed on time, spending in the order a new player might. Numbers move a little between runs. It's a simulation, not a person's
// session. Run: node tests/economy.mjs [minutes]
import { CFG, UPGRADES, upgradeCost, CARS, PAINTS, CRATES, QUESTS, GIFTS, DAILY, CHASE_TIERS, chaseTier, stageCoins, stageXp, chaseCoins, chaseXp, chaseGems, xpNeed, coinMult, finishReward, STAGES, STAGES_PER_WORLD, RING_COINS, airCoins } from '../shared/config.js';
import { mainCourse } from '../shared/course.js';

const MINS = +(process.argv[2] ?? 60);
const main = mainCourse();
const p = { lv: 1, xp: 0, coins: 0, gems: 0, stars: 0, keys: 0, ups: {}, cars: { comet: 1 }, car: 'comet', paints: { stock: 1 }, exhausts: { stock: 1 }, exhaust: 'stock', races: 0, wins: 0, escapes: 0, opened: 0, upgrades: 0, bestStage: 0, laps: 0, airs: 0, ringsAll: 0, keysGot: {}, qi: 0 };
let t = 0, stage = 0, giftI = 0, nextChase = 240, stageT = 0, events = 0;
const log = (w) => { events++; console.log(String(Math.floor(t / 60)).padStart(3) + ':' + String(Math.floor(t % 60)).padStart(2, '0') + '  ' + w); };
const addXp = (n) => { p.xp += n; while (p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; log('Level ' + p.lv); } };
const qv = (k) => (k === 'keys' ? Object.keys(p.keysGot).length : k === 'cars' ? Object.keys(p.cars).length : k === 'paints' ? Object.keys(p.paints).length - 1 : p[k] || 0);
function quests() { while (p.qi < QUESTS.length && qv(QUESTS[p.qi].kind) >= QUESTS[p.qi].n) { const Q = QUESTS[p.qi]; log('quest: ' + Q.text + (Q.coins ? ' (+' + Q.coins + ' Coins)' : '') + (Q.gems ? ' (+' + Q.gems + ' Gems)' : '')); p.coins += Q.coins || 0; p.gems += Q.gems || 0; p.qi++; } }
function shop() {
    // keys go on crates
    { const cr = CRATES.filter((c) => p.lv >= c.lv && p.keys >= c.keys).pop(); if (cr) { p.keys -= cr.keys; p.opened++; log('opens a ' + cr.name + ' with Keys'); } }
    for (let go = 0; go < 4; go++) {
        const opts = [];
        for (const u of UPGRADES) { const n = p.ups[u.id] || 0; if (n < u.max && p.lv >= u.lv) opts.push({ k: 'up', u, n, c: upgradeCost(u, n) * 0.8, real: upgradeCost(u, n) }); }
        for (const c of CARS) if (c.coins && !p.cars[c.id] && p.lv >= c.lv) { opts.push({ k: 'car', car: c, c: c.coins * 0.45, real: c.coins }); break; }
        for (const pt of PAINTS) if (pt.coins && !p.paints[pt.id] && p.lv >= pt.lv) { opts.push({ k: 'paint', pt, c: pt.coins * 2.2, real: pt.coins }); break; }
        for (const cr of CRATES) if (p.lv >= cr.lv && p.opened < 2 + CRATES.indexOf(cr) * 3) opts.push({ k: 'crate', cr, c: cr.coins * 1.2, real: cr.coins });
        for (const o of opts) if (o.c === undefined) o.c = o.w;
        opts.sort((a, b) => a.c - b.c);
        const o = opts[0];
        if (!o || p.coins < o.real) return;
        p.coins -= o.real;
        if (o.k === 'up') { p.ups[o.u.id] = o.n + 1; p.upgrades++; log('buys ' + o.u.name + ' Lv ' + (o.n + 1)); }
        else if (o.k === 'car') { p.cars[o.car.id] = 1; p.car = o.car.id; log('buys the ' + o.car.name); }
        else if (o.k === 'paint') { p.paints[o.pt.id] = 1; log('paints the car ' + o.pt.name); }
        else { p.opened++; log('opens a ' + o.cr.name); }
    }
}
p.coins += DAILY[0].coins || 0;
log('the daily reward: +' + (DAILY[0].coins || 0) + ' Coins');
while (t < MINS * 60) {
    while (giftI < GIFTS.length && t >= GIFTS[giftI].min * 60) { const g = GIFTS[giftI++]; p.coins += g.coins || 0; p.gems += g.gems || 0; p.keys += g.keys || 0; log('FREE gift at ' + g.min + ' min'); }
    shop(); quests();
    if (t >= nextChase) {
        // a Police Chase: how far you get and whether you get away grows a little with practice
        const T = CHASE_TIERS[chaseTier(p.lv)], secs = T.stages * (8 + Math.random() * 5), escaped = Math.random() < Math.min(0.8, 0.35 + p.races * 0.08), place = escaped ? Math.max(0, Math.min(5, Math.round(2.4 - p.races * 0.2 + Math.random() * 2 - 1))) : 3 + Math.floor(Math.random() * 3), fr = escaped ? 1 : 0.35 + Math.random() * 0.5;
        const got = Math.round(chaseCoins(fr, place, T.stages) * coinMult(p));
        t += CFG.queueSecs + CFG.getReadySecs + secs + 8;
        p.coins += got; addXp(chaseXp(fr, place, T.stages)); p.gems += chaseGems(place, escaped);
        p.races++; if (escaped) p.escapes++; if (escaped && place === 0) p.wins++;
        log('Police Chase: ' + T.stages + ' stages, ' + (escaped ? 'got away, place ' + (place + 1) : 'BUSTED') + ', +' + got + ' Coins');
        nextChase = t + CFG.inviteEvery * (0.6 + Math.random() * 0.6);
        continue;
    }
    // a slice of driving: each stage takes a person a few tries, more as the course gets harder; upgrades help a little
    const dt = 5;
    t += dt; stageT += dt;
    const needs = (16 + stage * 0.9 + Math.random() * 16) * (1 - Math.min(0.25, (p.upgrades || 0) * 0.015));
    if (stageT >= needs) {
        stageT = 0;
        p.coins += Math.round(stageCoins(stage, p.laps) * coinMult(p));
        addXp(stage + 1 > p.bestStage ? stageXp(stage) : Math.round(stageXp(stage) * 0.5));
        // the stage's rings (most of them), a big air or two, its key (if there's one and they go for it)
        const rings = main.rings.filter((r) => r.stage === stage).length, gotR = Math.round(rings * (0.5 + Math.random() * 0.4));
        p.coins += gotR * Math.round(RING_COINS * coinMult(p)); p.ringsAll += gotR;
        if (Math.random() < 0.7) { p.coins += Math.round(airCoins(1.6 + Math.random() * 1.6) * coinMult(p)); p.airs++; }
        const k = main.keys.find((x) => x.stage === stage);
        if (k && Math.random() < 0.55) { p.keysGot[k.i] = 1; p.keys++; }
        p.bestStage = Math.max(p.bestStage, stage + 1);
        stage++;
        if (stage % STAGES_PER_WORLD === 0 && stage < STAGES) log('reaches Stage ' + (stage + 1));
        if (stage >= STAGES) {
            const R = finishReward(p.laps);
            p.coins += R.coins; p.gems += R.gems; p.stars += R.stars; addXp(R.xp); p.laps++; stage = 0;
            log('GETAWAY TOWER #' + p.laps + ': +' + R.coins + ' Coins, +' + R.gems + ' Gems, a Trophy');
        }
    }
    if (t % 600 < 5) log('-- at ' + Math.round(t / 60) + ' min: stage ' + (stage + 1) + ', Level ' + p.lv + ', ' + p.coins + ' Coins, ' + p.gems + ' Gems, ' + p.keys + ' Keys, quest ' + (p.qi + 1) + ', ' + Object.keys(p.cars).length + ' cars');
}
console.log('\nafter ' + MINS + ' min: best stage ' + p.bestStage + ', Level ' + p.lv + ', ' + p.races + ' chases (' + p.escapes + ' escapes), ' + p.qi + ' quests, ' + Object.keys(p.cars).length + ' cars, ' + p.upgrades + ' upgrades, ' + p.opened + ' crates, ' + events + ' things happened');
