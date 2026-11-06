// Every course can be beaten: the pilot drives the long run and every Police Chase map at every tier on the shared physics, headless,
// with the stock car on Normal, at full speed and at the slowest bot's speed, at the client's 60 steps a second and the server's 20.
// On a chase map the full-speed pilot also has to stay ahead of the cops all the way: a chase has to be escapable, not just finishable.
// node tests/courses.mjs [speeds] [main|chase] (START=i: from checkpoint i; VERBOSE=1: every crash; HZ=20: the server's step)
import { mainCourse, raceCourse, courseClock } from '../shared/course.js';
import { newBody, stepBody, placeBody, EV } from '../shared/physics.js';
import { newPilot, pilotStep, resetPilot } from '../shared/pilot.js';
import { CFG, WORLDS, CHASE_TIERS, copS } from '../shared/config.js';

const SPEEDS = (process.argv[2] || '1,0.86').split(',').map(Number);
const DT = 1 / (+process.env.HZ || 60);
let ST = { top: CFG.top, jet: 1, tank: CFG.tank, boostSecs: CFG.boostSecs };
// (a chase tier comes with the levels that unlock it, and a car upgraded about as far as a player there has: the stock car on the first tiers)
const statsFor = (tier) => ({ top: CFG.top * (1 + 0.035 * Math.max(0, tier - 2)), jet: 1 + 0.045 * Math.max(0, tier - 2), tank: CFG.tank * (1 + 0.12 * Math.max(0, tier - 2)), boostSecs: CFG.boostSecs });
function run(c, speed, verbose, k) {
    const sp = c.main ? c.respawnOf(-1) : c.startSpot(1), b = newBody(sp.x, sp.y, sp.z, sp.ry), pl = newPilot({ speed, slip: 0 });
    resetPilot(pl, 0);
    let t = 7, cp = -1, deaths = 0, simT = 0, stuck = 0, caught = -1, air = 0, airs = 0, rings = 0;
    if (process.env.START && c.main) { cp = +process.env.START; const s = c.respawnOf(cp); placeBody(b, s.x, s.y, s.z, s.ry); resetPilot(pl, c.routeOf(cp)); }
    const perCp = {}, MAX = (1 / DT) * 60 * (c.main ? 90 : 12), stage0 = {};
    let px = b.x, py = b.y, pz = b.z;
    for (let f = 0; f < MAX; f++) {
        t += DT; simT += DT;
        c.setTime(courseClock(t * 1000), DT);
        const P = pilotStep(pl, b, c, courseClock(t * 1000), DT, ST);
        const ev = stepBody(b, { thr: P.thr, steer: P.steer, fly: P.fly, boost: P.boost, top: ST.top, jet: ST.jet, tank: ST.tank, boostSecs: ST.boostSecs, burnK: 1 }, DT, c);
        if (!b.onGround) air += DT; else { if (air > 1.4) airs++; air = 0; }
        if (c.ringCross(px, py, pz, b.x, b.y, b.z, 0, 0) >= 0) rings++;
        px = b.x; py = b.y; pz = b.z;
        const pad = c.padAt(b.x, b.y, b.z, cp + 1, 2);
        if (pad > cp) { cp = pad; stage0[cp] = simT; }
        if (k && caught < 0 && c.sAt(cp, b.x, b.y, b.z) < copS(simT - 7 + 7, k) && simT > 0) caught = cp;
        if (c.atEnd(cp, b.x, b.y, b.z)) return { ok: true, secs: simT, deaths, stuck, perCp, caught, airs, rings, stage0 };
        if (ev === EV.LETHAL || P.respawn) {
            if (P.respawn) stuck++; else deaths++;
            perCp[cp] = (perCp[cp] || 0) + 1;
            if (verbose) console.log('   back at', cp, ev === EV.LETHAL ? 'crashed' : 'stuck', 'at', b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1), 'route', pl.i, c.route[pl.i] && c.route[pl.i].k, c.cps[cp + 1] && c.cps[Math.max(0, cp)].kind, 'gas', b.gas.toFixed(0), 'spd', b.spd.toFixed(1));
            if (perCp[cp] > 12) return { ok: false, airs, rings, secs: simT, deaths, stuck, perCp, caught, at: cp, why: 'stage ' + (cp + 2) + ' can\'t be beaten (route ' + pl.i + ' ' + (c.route[pl.i] && c.route[pl.i].k) + ')' };
            const s = c.respawnOf(cp);
            placeBody(b, s.x, s.y, s.z, s.ry); b.safeT = 0.5;
            px = b.x; py = b.y; pz = b.z;
            resetPilot(pl, c.routeOf(cp));
        }
        if (pl.done) return { ok: false, airs, rings, secs: simT, deaths, stuck, perCp, caught, why: 'route ended at cp ' + cp + ' at ' + [b.x, b.y, b.z].map((v) => v.toFixed(1)) };
    }
    return { ok: false, airs, rings, secs: simT, deaths, stuck, perCp, caught, why: 'timed out at cp ' + cp + ' route ' + pl.i + ' ' + (c.route[pl.i] && c.route[pl.i].k) };
}
let fails = 0;
const report = (name, c, sp, k, tier) => {
    ST = tier === undefined ? statsFor(0) : statsFor(tier);
    const r = run(c, sp, !!process.env.VERBOSE, k);
    const copped = k && sp >= 1 && r.caught >= 0;
    if (!r.ok || copped) fails++;
    const worst = Object.entries(r.perCp).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([q, v]) => '#' + (+q + 2) + 'x' + v).join(' ');
    console.log((r.ok && !copped ? 'ok  ' : 'FAIL') + ' ' + name + ' x' + sp + ': ' + (r.secs / 60).toFixed(1) + ' min, ' + r.deaths + ' crashes, ' + r.stuck + ' stuck, ' + c.cps.length + ' stages, ' + c.parts.length + ' parts, ' + c.total.toFixed(0) + ' studs, ' + (r.airs || 0) + ' big airs, ' + (r.rings || 0) + '/' + c.rings.length + ' rings' + (worst ? ', worst ' + worst : '') + (r.caught >= 0 ? ', the cops caught it at stage ' + (r.caught + 2) : '') + (r.why ? ' -- ' + r.why : ''));
    if (process.env.TIMES && r.stage0) { const ks = Object.keys(r.stage0).map(Number).sort((a, b) => a - b); console.log('   stage times:', ks.map((q, i) => (i ? (r.stage0[q] - r.stage0[ks[i - 1]]).toFixed(0) : '-')).join(' ')); }
    return r;
};
const only = process.argv[3] || '';
for (const sp of SPEEDS) {
    if (!only || only === 'main') report('long run', mainCourse(), sp);
    if (only !== 'main') for (let w = 0; w < WORLDS.length; w++) for (let t = 0; t < CHASE_TIERS.length; t++) report(WORLDS[w].id + ' tier ' + t, raceCourse(w, t), sp, CHASE_TIERS[t].k * (WORLDS[w].chase || 1), t);
}
if (!only || only === 'main') { const c = mainCourse(); console.log('the long run: ' + c.movers.length + ' movers, ' + c.rings.length + ' rings, ' + c.keys.length + ' keys, ends at y ' + c.finish.y.toFixed(0) + ', x ' + c.finish.x.toFixed(0) + ' z ' + c.finish.z.toFixed(0) + ', ' + c.chunks + ' pieces'); }
console.log(fails ? fails + ' FAILED' : 'every course beaten');
process.exit(fails ? 1 : 0);
