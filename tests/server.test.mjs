// The whole loop and its guards, headless: starts its own server (QA=1, a temporary data folder) and plays it over the network as real
// clients do (the shared physics and pilot sending real moves): the stages, rings, keys, big air, a skip, the Getaway Tower, the shops,
// the rewards, and a Police Chase with the cops catching whoever stands still. Run: node tests/server.test.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@colyseus/sdk';
import { CFG, UPGRADES, upgradeCost, CARS, PAINTS, CRATES, CODES, QUESTS, GIFTS, stageCoins, finishReward, CHASE_TIERS, chaseTier, STAGES, copS, airCoins, skipCost, statsOf } from '../shared/config.js';
import { mainCourse, raceCourse, HUB, courseClock } from '../shared/course.js';
import { newBody, stepBody, placeBody, EV } from '../shared/physics.js';
import { newPilot, pilotStep, resetPilot } from '../shared/pilot.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 3011, URL_ = 'http://localhost:' + PORT;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jetcar-test-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
function ok(cond, what) { if (cond) { pass++; console.log('  ok  ' + what); } else { fail++; console.log('FAIL  ' + what); } }
const TYPES = ['hello', 'pong', 'toast', 'broke', 'code', 'boards', 'reward', 'levelup', 'warped', 'bought', 'opened', 'taskdone', 'questdone', 'toastreward', 'authed', 'emote', 'chat', 'queued', 'match', 'chasecp', 'escaped', 'busted', 'caught', 'results', 'runstart', 'stage', 'world', 'ring', 'key', 'air', 'tower', 'trophy', 'skipped', 'snaps'];

class Tester {
    constructor(name) { this.name = name; this.msgs = {}; this.p = {}; this.x = 0; this.z = HUB.spawn.z; this.y = 0; this.snaps = 0; }
    async join(extra) {
        const c = new Client(URL_);
        this.room = await c.joinOrCreate('jetcar', { uid: 'test_' + this.name, name: this.name, ...(extra || {}) });
        const R = this.room;
        for (const t of TYPES) R.onMessage(t, (m) => { (this.msgs[t] = this.msgs[t] || []).push(m); });
        R.onMessage('profile', (m) => { Object.assign(this.p, m); });
        R.onMessage('lite', (m) => { Object.assign(this.p, m); });
        R.onMessage('snap', (m) => { this.snaps++; this.x = m.x; this.y = m.y; this.z = m.z; });
        R.onMessage('home', (m) => { this.x = m.x; this.y = m.y; this.z = m.z; (this.msgs.home = this.msgs.home || []).push(m); });
        await this.wait(() => this.p.now);
        const h = this.last('hello');
        this.x = h.x; this.y = h.y; this.z = h.z;
        return this;
    }
    send(t, m) { this.room.send(t, m || {}); }
    async wait(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < (ms ?? 5000)) { const v = fn(); if (v) return v; await sleep(15); } return null; }
    got(t) { return (this.msgs[t] || []).length; }
    last(t) { const l = this.msgs[t]; return l && l[l.length - 1]; }
    clear(t) { this.msgs[t] = []; }
    move(x, y, z, a, ts) { this.x = x; this.y = y; this.z = z; this.send('move', { x, y, z, ry: 0, a: a ?? 1, ts: ts ?? Date.now() }); }
    async tp(x, y, z) { this.send('qa', { tp: [x, y, z] }); this.x = x; this.z = z; this.y = y; await sleep(60); this.move(x, y, z, 2); await sleep(60); this.snaps = 0; }
    me() { return this.room.state.players.get(this.room.sessionId); }
    leave() { return this.room.leave(); }
}
// drives like a real client: the shared physics and pilot, real moves 20 a second, until told to stop
async function runner(T, c, from, opts) {
    opts = opts || {};
    const st = statsOf(T.p), b = newBody(from.x, from.y, from.z, from.ry || 0), P = newPilot({ speed: 1, slip: 0 });
    placeBody(b, from.x, from.y, from.z, from.ry || 0); b.tank = st.tank; b.gas = st.tank;
    resetPilot(P, opts.route ?? 0);
    const end = Date.now() + (opts.secs || 60) * 1000;
    let lastSent = 0, last = Date.now(), cp = opts.cp ?? -1;
    while (Date.now() < end) {
        await sleep(16);
        const now = Date.now(), dt = Math.min(0.05, (now - last) / 1000), t = courseClock(now);
        last = now;
        c.setTime(t, dt);
        if (opts.stopAt && opts.stopAt(b, cp)) break;
        const hold = opts.startAt && now < opts.startAt, inp = hold ? { thr: 0, steer: 0, fly: false } : pilotStep(P, b, c, t, dt, st);
        const ev = stepBody(b, { thr: inp.thr, steer: inp.steer, fly: inp.fly, boost: false, top: st.top, jet: st.jet, tank: st.tank, burnK: 1 }, dt, c);
        const pad = c.padAt(b.x, b.y, b.z, cp + 1, 2); if (pad > cp) cp = pad;
        if (ev === EV.LETHAL || inp.respawn) { T.send('respawn', {}); const r = c.respawnOf(cp); placeBody(b, r.x, r.y, r.z, r.ry); b.safeT = 0.5; resetPilot(P, c.routeOf(cp)); await sleep(120); }
        if (now - lastSent >= 50) { lastSent = now; T.move(+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), b.knockT > 0 ? 3 : b.flying ? 4 : !b.onGround ? 2 : 1, now); }
    }
    T.move(+b.x.toFixed(2), +b.y.toFixed(2), +b.z.toFixed(2), b.onGround ? 1 : 2);
    return { b, cp };
}

const srv = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(PORT), QA: '1', DATA_DIR: dataDir }, stdio: ['ignore', 'pipe', 'pipe'] });
srv.stdout.on('data', (d) => { if (process.env.VERBOSE) process.stdout.write(d); });
srv.stderr.on('data', (d) => process.stderr.write(d));
for (let i = 0; i < 120; i++) { try { const r = await fetch(URL_ + '/health'); if (r.ok) break; } catch (e) { /* not yet */ } await sleep(100); }
const main = mainCourse();

try {
    console.log('A new player');
    const A = await new Tester('Ann').join();
    ok(A.p.coins === 0 && A.p.gems === 0 && A.p.stars === 0 && A.p.keys === 0, 'starts with nothing');
    ok(A.p.stage === 0 && A.p.lv === 1 && A.p.car === 'comet', 'on no stage yet, at Level 1, in the stock car');
    ok(Math.hypot(A.x - HUB.spawn.x, A.z - HUB.spawn.z) < 20 && Math.abs(A.y) < 1, 'lands on the Garage Deck');
    await A.wait(() => A.got('boards'));
    ok(A.got('boards') >= 1, 'gets the leaderboards');
    A.send('ping', { c: 42 });
    const pg = await A.wait(() => A.last('pong'));
    ok(pg && pg.c === 42 && pg.s > 0, 'ping comes back with the server\'s clock');
    let bots = 0;
    A.room.state.players.forEach((p) => { if (p.bot) bots++; });
    ok(bots === 0, 'no bots outside a chase: only real players are shown');

    console.log('The guards');
    await A.tp(HUB.spawn.x, 0, HUB.spawn.z);
    A.move(HUB.spawn.x + 600, 0, HUB.spawn.z, 1);
    await A.wait(() => A.snaps > 0, 1500);
    ok(A.snaps > 0, 'too far in one move: put back');
    await A.tp(0, 0, 0);
    await sleep(350);
    A.move(0, 220, 0, 4);
    await A.wait(() => A.snaps > 0, 1500);
    ok(A.snaps > 0, 'higher than a whole tank of jets could lift you: put back');
    // driving far too fast for five seconds, in moves each small enough to pass on its own
    {
        let z = -70, snapped = false;
        await A.tp(0, 0, z);
        const t0 = Date.now();
        while (Date.now() - t0 < 5800 && !snapped) { z += 7.4; if (z > 80) z = -70 + (z - 80); A.move(0, 0, z, 1); await sleep(66); if (A.snaps > 0) snapped = true; }
        ok(snapped, 'a speed hack: put back');
    }
    // on the road, with no road there
    {
        const g = main.cps[0];
        await A.tp(g.x + 90, g.y + 1, g.z);
        A.snaps = 0;
        let i = 0;
        while (i++ < 12 && !A.snaps) { A.move(g.x + 90, g.y + 1, g.z, 0); await sleep(70); }
        ok(A.snaps > 0, 'driving on thin air: put back');
    }

    console.log('The stages, by really driving them');
    const sp0 = main.respawnOf(-1);
    await A.tp(sp0.x, sp0.y, sp0.z);
    A.clear('stage');
    const coins0 = A.p.coins;
    const R1 = await runner(A, main, sp0, { route: 0, secs: 60, stopAt: (b, cp) => cp >= 4 });
    ok(R1.cp >= 4, 'the shared physics drives to Stage 5 on its own');
    await A.wait(() => A.got('stage') >= 5, 2500);
    ok(A.got('stage') >= 5 && A.msgs.stage[0].i === 0, 'each checkpoint is announced, from Stage 1');
    ok(A.got('runstart') === 1, 'the run\'s clock starts at Stage 1');
    await A.wait(() => A.p.coins > coins0, 1000);
    ok(A.p.coins >= coins0 + stageCoins(0, 0) + stageCoins(1, 0), 'stages pay Coins');
    ok(A.p.stage >= 5 && A.p.bestStage >= 5, 'your stage and best stage are saved');
    ok(A.got('ring') >= 1 && A.last('ring').coins >= 1, 'flying through a ring pays');
    ok(A.got('air') >= 1 && A.last('air').coins >= 1, 'a big air pays when you land');
    // not twice
    {
        const n = A.got('stage'), c = A.p.coins, g = main.cps[0];
        await A.tp(g.x, g.y + 0.1, g.z);
        A.move(g.x, g.y, g.z, 0);
        await sleep(200);
        ok(A.got('stage') === n && A.p.coins === c, 'a checkpoint you\'ve passed pays nothing again');
    }
    // a pad a long way ahead: nobody gets there from here
    {
        const n = A.got('stage'), g = main.cps[30];
        await A.tp(g.x, g.y + 0.1, g.z);
        A.move(g.x, g.y, g.z, 0);
        await sleep(200);
        ok(A.got('stage') === n && A.p.stage < 20, 'a checkpoint far ahead doesn\'t count');
    }
    // the same ring again: nothing
    {
        const n = A.got('ring'), r = main.rings[A.last('ring').i];
        await A.tp(r.x - r.ax * 6, r.y - 1, r.z - r.az * 6);
        A.move(r.x + r.ax * 3, r.y - 1, r.z + r.az * 3, 4);
        await sleep(200);
        ok(A.got('ring') === n, 'each ring pays once a run');
    }
    // a big air that isn't: hovering in one spot
    {
        const n = A.got('air'), g = main.cps[A.p.stage - 1];
        await A.tp(g.x, g.y + 0.1, g.z);
        A.move(g.x, g.y, g.z, 1); await sleep(80);
        for (let i = 0; i < 12; i++) { A.move(g.x, g.y + 3, g.z, 4); await sleep(170); }
        A.move(g.x, g.y, g.z, 1);
        await sleep(250);
        ok(A.got('air') === n, 'hanging in the air without going anywhere isn\'t big air');
    }
    // a key: fly up to it
    {
        const k = main.keys[0], k0 = A.p.keys;
        await A.tp(k.x, k.y - 1.1, k.z);
        A.move(k.x, k.y - 1.1, k.z, 4);
        await A.wait(() => A.got('key'), 1500);
        ok(A.got('key') === 1 && A.last('key').i === k.i, 'a key floating over the road: yours');
        await A.wait(() => A.p.keys === k0 + 1, 1000);
        ok(A.p.keys === k0 + 1 && A.p.keysGot[k.i], 'and kept');
        A.move(k.x, k.y - 1.1, k.z + 0.5, 4);
        await sleep(200);
        ok(A.got('key') === 1, 'only once');
    }

    console.log('Easy, Normal, Hard');
    {
        A.send('diff', { i: 2 });
        await A.wait(() => A.p.diff === 2);
        ok(A.p.diff === 2, 'Hard is saved');
        A.send('diff', { i: 9 });
        await sleep(120);
        ok(A.p.diff === 2, 'nonsense is refused');
        A.send('diff', { i: 1 });
        await A.wait(() => A.p.diff === 1);
    }

    console.log('Skipping, warping');
    A.send('qa', { gems: 30 });
    await A.wait(() => A.p.gems >= 30);
    {
        const g0 = A.p.gems, s0 = A.p.stage;
        A.clear('skipped');
        A.send('skip');
        await A.wait(() => A.got('skipped'));
        ok(A.got('skipped') === 1 && A.last('skipped').i === s0, 'a skip takes you to the next stage');
        await A.wait(() => A.p.gems === g0 - skipCost(s0));
        ok(A.p.gems === g0 - skipCost(s0) && A.p.stage === s0 + 1, 'and costs Gems');
    }
    {
        const B = await new Tester('Bea').join();
        B.send('skip');
        await sleep(200);
        B.send('qa', { stage: 1 });
        await sleep(100);
        B.send('skip');
        await B.wait(() => B.got('broke'));
        ok(B.got('broke') >= 1 && B.p.stage === 1, 'no Gems, no skip');
        B.send('warp', { to: 'world', w: 2 });
        await B.wait(() => B.got('toast'), 1500);
        ok(B.got('warped') === 0, 'a world you haven\'t reached is locked');
        await B.leave();
    }
    A.clear('warped');
    await sleep(550);
    A.send('warp', { to: 'home' });
    await A.wait(() => A.got('warped'));
    ok(A.last('warped') && Math.hypot(A.last('warped').x - HUB.spawn.x, A.last('warped').z - HUB.spawn.z) < 20, 'home goes to the Garage Deck');
    await sleep(550);
    A.send('warp', { to: 'last' });
    await A.wait(() => A.got('warped') >= 2);
    ok(A.got('warped') >= 2 && Math.hypot(A.last('warped').x - main.cps[A.p.stage - 1].x, A.last('warped').z - main.cps[A.p.stage - 1].z) < 6, 'last goes back to your stage');

    console.log('The Getaway Tower');
    A.send('claim');
    await sleep(150);
    ok(A.got('trophy') === 0, 'no claiming it from anywhere else');
    {
        const last = main.cps[main.cps.length - 1];
        A.send('qa', { stage: STAGES, coins: 0 });
        await sleep(80);
        const r = main.respawnOf(last.i);
        await A.tp(r.x, r.y, r.z);
        const R = await runner(A, main, r, { route: main.routeOf(last.i), cp: last.i, secs: 70, stopAt: (b) => main.atFinish(b.x, b.y, b.z) && b.onGround && Math.abs(b.spd) < 30 });
        for (let i = 0; i < 4; i++) { A.move(+R.b.x.toFixed(2), +R.b.y.toFixed(2), +R.b.z.toFixed(2), 0); await sleep(70); }
        await A.wait(() => A.got('tower'), 2000);
        ok(A.last('tower') && A.last('tower').on, 'at the Getaway Tower: the Trophy is offered');
        const c0 = A.p.coins, st0 = A.p.stars, g0 = A.p.gems, R0 = finishReward(A.p.laps);
        A.send('claim');
        await A.wait(() => A.got('trophy'));
        const bo = A.last('trophy');
        ok(bo && bo.laps === 1, 'a Trophy!');
        await A.wait(() => A.p.laps === 1);
        ok(A.p.stars === st0 + 1 && A.p.gems === g0 + R0.gems && A.p.coins === c0 + R0.coins, 'pays Coins, Gems and a Trophy');
        ok(A.p.stage === 0 && A.p.laps === 1, 'and you start again from Stage 1');
        ok(stageCoins(5, 1) > stageCoins(5, 0), 'for bigger pay');
        A.send('claim');
        await sleep(150);
        ok(A.got('trophy') === 1, 'only once');
        A.x = bo.x; A.y = 0.2; A.z = bo.z;
    }

    console.log('Spending');
    A.send('qa', { coins: 200000, stars: 10, keys: 6 });
    await A.wait(() => A.p.coins >= 200000);
    {
        const u = UPGRADES[0], c0 = A.p.coins;
        A.send('upgrade', { id: u.id });
        await A.wait(() => A.p.ups && A.p.ups[u.id] === 1);
        ok(A.p.ups[u.id] === 1 && A.p.coins === c0 - upgradeCost(u, 0), 'an upgrade costs Coins');
        ok(statsOf(A.p).top > CFG.top, 'and makes the car faster');
        const nitro = UPGRADES.find((x) => x.id === 'nitro');
        A.send('qa', { lv: 1 });
        await A.wait(() => A.p.lv === 1);
        A.clear('bought');
        A.send('upgrade', { id: nitro.id });
        await sleep(150);
        ok(A.got('bought') === 0, 'an upgrade above your level stays locked');
        const car = CARS.find((c) => c.coins > 0 && c.lv <= 1) || CARS[1], hi = CARS.find((c) => c.lv > 3);
        A.send('qa', { lv: car.lv });
        await sleep(100);
        const c1 = A.p.coins;
        A.send('car', { id: car.id });
        await A.wait(() => A.p.car === car.id);
        ok(A.p.car === car.id && A.p.cars[car.id] && A.p.coins === c1 - car.coins, 'a new car for Coins, and you drive it');
        ok(await A.wait(() => A.me().car === car.id, 1500), 'everyone sees it');
        A.send('car', { id: hi.id });
        await sleep(150);
        ok(A.p.car === car.id && !A.p.cars[hi.id], 'a car above your level stays locked');
        A.send('car', { id: 'comet' });
        await A.wait(() => A.p.car === 'comet');
        ok(A.p.car === 'comet', 'back in the old one, for free');
        const pt = PAINTS.find((x) => x.coins > 0);
        A.send('paint', { id: pt.id });
        await A.wait(() => A.p.paint === pt.id);
        ok(A.p.paint === pt.id && A.p.paints[pt.id], 'paint for Coins');
        const ps = PAINTS.find((x) => x.stars), s0 = A.p.stars;
        A.send('paint', { id: ps.id });
        await A.wait(() => A.p.paint === ps.id);
        ok(A.p.paint === ps.id && A.p.stars === s0 - ps.stars, 'the best paint for Trophies');
        A.send('crate', { c: CRATES[0].id, n: 3 });
        await A.wait(() => A.got('opened'));
        ok(A.last('opened').out.length === 3 && A.p.opened === 3, 'crates open for Coins');
        const k0 = A.p.keys;
        A.clear('opened');
        A.send('crate', { c: CRATES[0].id, n: 1, keys: true });
        await A.wait(() => A.got('opened'));
        ok(A.got('opened') === 1 && A.p.keys === k0 - CRATES[0].keys, 'or for Keys');
        const lock = CRATES[CRATES.length - 1];
        A.clear('opened');
        A.send('crate', { c: lock.id });
        await sleep(150);
        ok(A.got('opened') === 0, 'a crate above your level stays shut');
        const got = Object.keys(A.p.exhausts).find((id) => id !== 'stock');
        A.send('exhaust', { id: got });
        await A.wait(() => A.p.exhaust === got && A.me()?.exh === got);
        ok(A.p.exhaust === got && A.me().exh === got, 'an exhaust fitted (everyone sees it)');
        A.send('exhaust', { id: 'supernova' });
        await sleep(120);
        ok(A.p.exhaust === got, 'not one you don\'t have');
    }

    console.log('Rewards, once each');
    {
        const code = Object.keys(CODES)[0];
        A.send('code', { code });
        await A.wait(() => A.got('code'));
        ok(A.last('code').ok, 'a code works');
        A.clear('code');
        A.send('code', { code });
        await A.wait(() => A.got('code'));
        ok(!A.last('code').ok, 'not twice');
        A.clear('code');
        A.send('code', { code: 'NOPE' });
        await A.wait(() => A.got('code'));
        ok(!A.last('code').ok, 'a wrong code doesn\'t');
        A.clear('reward');
        A.send('daily');
        await A.wait(() => A.got('reward'));
        ok(A.got('reward') === 1, 'the daily reward');
        A.send('daily');
        await sleep(120);
        ok(A.got('reward') === 1, 'once a day');
        A.clear('reward');
        A.send('gift', { i: 0 });
        await sleep(120);
        ok(A.got('reward') === 0, 'a gift isn\'t early');
        A.send('qa', { playSecs: GIFTS[0].min * 60 });
        await sleep(80);
        A.send('gift', { i: 0 });
        await A.wait(() => A.got('reward'));
        ok(A.got('reward') === 1, 'a gift on time');
        A.send('gift', { i: 0 });
        await sleep(120);
        ok(A.got('reward') === 1, 'once');
    }
    console.log('Quests and tasks');
    {
        A.send('qa', { tasks: 1 });
        await sleep(100);
        ok(A.p.jq.list.length === 3, 'three daily tasks');
        A.clear('reward');
        A.send('tclaim', { i: 0 });
        await A.wait(() => A.got('reward'));
        ok(A.got('reward') === 1, 'a finished task pays');
        A.send('tclaim', { i: 0 });
        await sleep(100);
        ok(A.got('reward') === 1, 'once');
        const qi = A.p.qi;
        A.send('qclaim');
        await sleep(150);
        ok(A.p.qi === qi + 1, 'a done quest pays and moves on');
        void QUESTS;
    }

    console.log('The queue and a Police Chase');
    const C = await new Tester('Cal').join();
    const D = await new Tester('Dee').join();
    A.send('qa', { lv: 1 });
    await sleep(100);
    A.clear('match'); C.clear('match'); D.clear('match');
    C.send('queue', { on: true });
    await C.wait(() => C.got('queued'));
    await sleep(120);
    ok(C.room.state.queueN >= 1, 'the queue shows who\'s been found');
    D.send('queue', { on: true });
    await D.wait(() => D.room.state.queueN >= 2, 2000);
    ok(D.room.state.queueN === 2, 'and counts up');
    await D.wait(() => D.got('match') && C.got('match'), 14000);
    const mc = C.last('match'), md = D.last('match');
    ok(mc && md && mc.id === md.id, 'everyone at about the same time goes into the same chase');
    const mcN = () => { let n = 0; C.room.state.players.forEach((p) => { if (p.ctx === mc.id) n++; }); return n; };
    await sleep(120);
    ok(mcN() === CFG.racers, 'bots fill only the empty places');
    let realIn = 0;
    C.room.state.players.forEach((p) => { if (p.ctx === mc.id && !p.bot) realIn++; });
    ok(realIn === 2, 'the real ones are really in it');
    A.send('queue', { on: true });
    await A.wait(() => A.got('match'), 3000);
    ok(A.last('match') && A.last('match').id === mc.id, 'a late player joins a chase that hasn\'t really started');
    await sleep(120);
    ok(mcN() === CFG.racers, 'in a bot\'s place');
    const rc = raceCourse(mc.world, mc.tier);
    ok(mc.tier === chaseTier(1) && rc.cps.length === CHASE_TIERS[mc.tier].stages && mc.cops === CHASE_TIERS[mc.tier].cops, 'the course and the cops are as many as a new player\'s level says');
    ok(raceCourse(0, 5).cps.length > raceCourse(0, 0).cps.length, 'and longer and harder further up');
    // over the line before GO
    {
        const sp = rc.startSpot(mc.spot);
        C.x = sp.x; C.y = sp.y; C.z = sp.z;
        await sleep(60);
        C.snaps = 0;
        for (let z = sp.z + 4; z < sp.z + 50 && !C.snaps && Date.now() < mc.t0 - 300; z += 4) { C.move(sp.x, sp.y, z, 1); await sleep(100); }
        ok(C.snaps > 0, 'over the line before GO: put back');
    }
    D.leave();
    await sleep(250);
    {
        let found = null;
        C.room.state.players.forEach((p) => { if (p.name === 'Dee') found = p; });
        ok(found && found.bot && found.ctx === mc.id, 'a bot carries on for a player who leaves');
    }
    await A.wait(() => Date.now() > mc.t0 + 200, 9000);
    const sp = rc.startSpot(mc.spot);
    const tA = A.last('match');
    { const a = rc.startSpot(tA.spot); A.x = a.x; A.y = a.y; A.z = a.z; }
    const standing = (async () => { const t0 = Date.now(); while (Date.now() - t0 < 150000 && !A.got('busted') && !A.got('results')) { A.move(A.x, A.y, A.z, 0); await sleep(250); } })();
    const R2 = await runner(C, rc, sp, { route: 0, secs: 130, stopAt: () => C.got('escaped') || C.got('busted') || C.got('results') });
    ok(C.got('escaped') >= 1, 'driving it for real gets you to the Safehouse');
    ok(R2.cp >= rc.cps.length - 1, 'through every stage');
    await A.wait(() => A.got('busted'), 80000);
    ok(A.got('busted') >= 1, 'whoever stands still, the cops catch');
    ok(copS(30, 1) > copS(10, 1) && copS(60, 1.18) > copS(60, 1), 'they come faster and faster, faster for the bigger levels');
    await C.wait(() => C.got('results'), 60000);
    await standing;
    const res = C.last('results');
    ok(res && res.me.coins > 0 && res.rows.length === CFG.racers, 'results for everyone, and Coins');
    ok(res && res.me.finished && res.me.gems > 0, 'you\'re marked as escaped, and escaping pays Gems');
    const resA = await A.wait(() => A.last('results'), 3000);
    ok(resA && res.me.coins > resA.me.coins && resA.me.out, 'escaping pays more than getting busted');
    ok(C.p.races === 1 && C.p.escapes === 1, 'it counts as a chase, and an escape');
    C.clear('home');
    C.send('leave');
    await C.wait(() => C.got('home') && C.me().ctx === '', 4000);
    ok(C.got('home') === 1 && C.me().ctx === '', 'back from the chase to where you were');
    await A.leave();
    await C.leave();

    console.log('The save');
    await sleep(600);
    const A2 = await new Tester('Ann').join();
    ok(A2.p.laps === 1 && A2.p.stars >= 1 && A2.p.ups[UPGRADES[0].id] === 1 && Object.keys(A2.p.keysGot).length >= 1, 'coming back: Trophies, upgrades and keys are all still there');
    const B2 = await new Tester('Eve').join();
    B2.send('qa', { stage: 12 });
    await sleep(600);
    await B2.leave();
    await sleep(300);
    const B3 = await new Tester('Eve').join();
    const h = B3.last('hello');
    ok(B3.p.stage === 12 && Math.hypot(h.x - main.cps[11].x, h.z - main.cps[11].z) < 6, 'and you land on your last checkpoint');
    await B3.leave();
    await A2.leave();
    void airCoins;
} catch (e) {
    fail++;
    console.log('FAIL  threw: ' + (e && e.stack || e));
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
srv.kill();
process.exit(fail ? 1 : 0);
