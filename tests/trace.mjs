// one stage, traced: node tests/trace.mjs <checkpoint> [seconds]
import { mainCourse, courseClock } from '../shared/course.js';
import { newBody, stepBody, placeBody, EV } from '../shared/physics.js';
import { newPilot, pilotStep, resetPilot } from '../shared/pilot.js';
import { CFG } from '../shared/config.js';
const c = mainCourse(), cp0 = +process.argv[2], secs = +(process.argv[3] || 14), DT = 1 / 60;
const s = c.respawnOf(cp0), b = newBody(s.x, s.y, s.z, s.ry), pl = newPilot({ speed: 1, slip: 0 });
placeBody(b, s.x, s.y, s.z, s.ry); resetPilot(pl, c.routeOf(cp0));
const r0 = c.routeOf(cp0), r1 = c.routeOf(cp0 + 1);
console.log('route', r0, '..', r1, c.route.slice(r0, r1 + 1).map((n, i) => (r0 + i) + ':' + n.k + '(' + n.x.toFixed(0) + ',' + n.y.toFixed(1) + ',' + n.z.toFixed(0) + (n.hi ? ' hi ' + n.hi.toFixed(1) : '') + (n.v ? ' v' + n.v : '') + ')').join(' '));
console.log('rings', c.rings.filter((r) => r.stage === cp0).map((r) => [r.x, r.y, r.z, r.r].map((v) => v.toFixed(1)).join(',')).join(' | '));
let t = 7, px = b.x, py = b.y, pz = b.z;
for (let f = 0; f < secs / DT; f++) {
    t += DT;
    c.setTime(courseClock(t * 1000), DT);
    const P = pilotStep(pl, b, c, courseClock(t * 1000), DT, { top: CFG.top, jet: 1 });
    const ev = stepBody(b, { thr: P.thr, steer: P.steer, fly: P.fly, boost: P.boost, top: CFG.top, jet: 1, tank: CFG.tank }, DT, c);
    const rc = c.ringCross(px, py, pz, b.x, b.y, b.z, 0, 0); px = b.x; py = b.y; pz = b.z;
    if (f % 6 === 0 || ev || rc >= 0) console.log(f / 60 .toFixed ? (f / 60).toFixed(2) : '', 'pos', b.x.toFixed(1), b.y.toFixed(1), b.z.toFixed(1), 'spd', b.spd.toFixed(1), 'vy', b.vy.toFixed(1), b.onGround ? 'G' : 'A', 'fly', P.fly ? 1 : 0, 'thr', P.thr, 'st', P.steer.toFixed(2), 'gas', b.gas.toFixed(0), 'node', pl.i, c.route[pl.i] && c.route[pl.i].k, ev ? 'EV' + ev : '', rc >= 0 ? 'RING ' + rc : '');
    if (ev === EV.LETHAL) break;
    if (c.padAt(b.x, b.y, b.z, cp0 + 1, 1) > cp0) { console.log('reached next pad'); break; }
}
