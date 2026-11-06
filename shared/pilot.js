// The pilot: drives the course on the same physics as everyone else, from the route the course was built with. The server's chase bots
// use it (a little slower, now and then a slip), and so do the game's QA autopilot and the headless test that proves every stage can be
// beaten with the stock car. It steers for the next point, holds the speed the route asks for, and lights the jets only when it must:
// when it's in the air and falling short, or when there's just enough time left to climb to a window or a ledge.
import { CFG } from './config.js';
import { MK, TAU, PH } from './course.js';

export function newPilot(skill) {
    return { i: 0, skill: skill || { speed: 1, slip: 0 }, stuckT: 0, bestI: -1, done: false, waiting: false, dash: null, lazyI: -1, lazy: false, lastD: 1e9 };
}
export function resetPilot(pl, i) { pl.i = i || 0; pl.stuckT = 0; pl.bestI = -1; pl.done = false; pl.waiting = false; pl.dash = null; pl.lazyI = -1; pl.lazy = false; pl.lastD = 1e9; }

const inp = { thr: 0, steer: 0, fly: false, boost: false, respawn: false };
const wrapA = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
function steerTo(b, x, z) {
    const err = wrapA(Math.atan2(x - b.x, z - b.z) - b.yaw);
    inp.steer = Math.max(-1, Math.min(1, -err * 3.2));
    return err;
}
// how long the jets take to lift you dy from here
function climbTime(dy, vy0, jet) {
    if (dy <= 0) return 0;
    const a = CFG.jetUp * jet - CFG.grav, vmax = CFG.climbMax * jet, v0 = Math.max(vy0, 9);
    if (v0 >= vmax) return dy / vmax;
    const t1 = (vmax - v0) / a, d1 = v0 * t1 + 0.5 * a * t1 * t1;
    if (dy <= d1) return (-v0 + Math.sqrt(v0 * v0 + 2 * a * dy)) / a;
    return t1 + (dy - d1) / vmax;
}
// should the jets be on, heading for node n?
function wantFly(b, n, jet, lazy, c) {
    const d = Math.hypot(n.x - b.x, n.z - b.z), hs = Math.max(16, Math.hypot(b.vx, b.vz)), tt = d / hs;
    const need = n.y + (n.k === 'f' ? 0.5 : 0.9) - (lazy ? 2.4 : 0);
    if (n.hi && b.y + Math.max(0, b.vy) * 0.28 > n.hi) return false;
    if ((b.onGround || b.airT < 0.12) && n.k !== 'f' && n.y <= b.y + 0.9) return false;
    const yArr = b.y + b.vy * tt - 0.5 * CFG.grav * tt * tt;
    if (yArr >= need) return false;
    if (n.k === 'd' && !b.onGround) {
        // over the road already, coming down onto it: let it land
        const g1 = c.groundBelow(b.x, b.y, b.z, 0.3), g2 = c.groundBelow(b.x + b.vx * 0.3, b.y, b.z + b.vz * 0.3, 0.3);
        if (g1 >= n.y - 4 && g2 >= n.y - 4) return false;
    }
    if (!b.onGround) return b.airT > 0.12 || b.vy < -4;
    return tt <= climbTime(need - b.y, b.vy, jet) + 0.5;
}
// a run from rest: how long until it's this far along (the throttle flat out)
function arriveTime(dist, top) {
    let v = 0, s = 0, t = 0;
    while (s < dist && t < 8) { v = Math.min(top, v + CFG.acc * (1.3 - 0.8 * Math.min(1, v / top)) * 0.05); s += v * 0.05; t += 0.05; }
    return t;
}
// is the way from here to there free of what moves and hurts, for as long as a standing start takes to cross it?
const hazards = [];
function clear(c, x0, z0, y, x1, z1, t0, top) {
    const d = Math.hypot(x1 - x0, z1 - z0);
    hazards.length = 0;
    for (const [x, z] of [[x0, z0], [(x0 + x1) / 2, (z0 + z1) / 2], [x1, z1]]) {
        const L = c.near(x, z);
        if (L) for (let i = 0; i < L.length; i++) { const p = L[i]; if ((p.lethal || p.knock) && p.mv && hazards.indexOf(p) < 0) hazards.push(p); }
    }
    if (!hazards.length) return true;
    const T = arriveTime(d, top) + 0.45;
    let v = 0, s = 0;
    for (let t = 0; t <= T; t += 0.05) {
        if (t > 0) { v = Math.min(top, v + CFG.acc * (1.3 - 0.8 * Math.min(1, v / top)) * 0.05); s += v * 0.05; }
        const f = Math.min(1, s / d), x = x0 + (x1 - x0) * f, z = z0 + (z1 - z0) * f;
        for (let i = 0; i < hazards.length; i++) if (hitsAt(c, hazards[i], x, y, z, t0 + t)) return false;
    }
    return true;
}
function hitsAt(c, p, x, y, z, t) {
    const m = p.mv;
    let px = p.x0, pz = p.z0, ca = p.ca, sa = p.sa;
    const pad = 3.4;
    if (m.k === MK.BLINK) { if (!c.onAt(p, t)) return false; }
    else if (m.k === MK.SLIDE) { const a = TAU * (t / m.P + m.ph), s = Math.sin(a); px += m.ax * s; pz += m.az * s; }
    else if (m.k === MK.SPIN) { const a = p.ry0 + TAU * (t / m.P + m.ph) * m.dir; ca = Math.cos(a); sa = Math.sin(a); }
    if (y >= p.top0 + 0.2 || y + PH <= p.top0 - p.h) return false;
    const dx = x - px, dz = z - pz, lx = dx * ca - dz * sa, lz = dx * sa + dz * ca;
    return Math.abs(lx) < p.hx + pad && Math.abs(lz) < p.hz + pad;
}

// One step's input. Sets inp.respawn when it wants to go back to its checkpoint. st: { top, jet } the car it's driving
export function pilotStep(pl, b, c, time, dt, st) {
    inp.thr = 0; inp.steer = 0; inp.fly = false; inp.boost = false; inp.respawn = false;
    const sk = pl.skill, route = c.route, top = (st && st.top) || CFG.top, jet = (st && st.jet) || 1;
    if (pl.i >= route.length) { pl.done = true; inp.thr = -1; return inp; }
    let n = route[pl.i];
    // no headway for too long: back to the checkpoint
    if (pl.i > pl.bestI) { pl.bestI = pl.i; pl.stuckT = 0; } else if (!pl.waiting) pl.stuckT += dt;
    if (pl.stuckT > 12) { pl.stuckT = 0; inp.respawn = true; return inp; }
    pl.waiting = false;
    // across a guarded stretch: flat out, no stopping
    if (pl.dash) {
        const D = pl.dash;
        steerTo(b, D.x, D.z);
        inp.thr = 1;
        if (Math.hypot(D.x - b.x, D.z - b.z) < 5 || ((D.x - b.x) * D.ux + (D.z - b.z) * D.uz) < 0) pl.dash = null;
        return inp;
    }
    // reached it (or gone past it): on to the next
    for (let guard = 0; guard < 4; guard++) {
        const d = Math.hypot(n.x - b.x, n.z - b.z), nx = route[pl.i + 1];
        let passed = false;
        if (nx && d < 34) { const ux = nx.x - n.x, uz = nx.z - n.z, ul = Math.hypot(ux, uz); if (ul > 0.5) passed = ((b.x - n.x) * ux + (b.z - n.z) * uz) / ul > 0.5; }
        const reach = n.k === 'g' || n.k === 'w' ? -1 : Math.max(4, Math.abs(b.spd) * 0.1);
        if (n.k !== 'g' && n.k !== 'w' && (d < reach || passed)) { pl.i++; if (pl.i >= route.length) { pl.done = true; return inp; } n = route[pl.i]; continue; }
        break;
    }
    // a slip, now and then (the bots): aim a little low over one gap
    if (pl.lazyI !== pl.i) { pl.lazyI = pl.i; pl.lazy = !!(sk.slip && n.k !== 'd' && Math.random() < sk.slip * 0.5); }
    const nx = route[pl.i + 1];
    switch (n.k) {
        case 'g': {
            // up to the line, stop, then across when the way is clear
            const d = Math.hypot(n.x - b.x, n.z - b.z);
            steerTo(b, d > 3 ? n.x : n.tx, d > 3 ? n.z : n.tz);
            if (d > 3) { inp.thr = b.spd > Math.min(26, d * 1.4 + 4) ? -1 : 1; break; }
            pl.waiting = true;
            if (Math.abs(b.spd) > 1.5) { inp.thr = b.spd > 0 ? -1 : 1; break; }
            if (clear(c, b.x, b.z, b.y, n.tx, n.tz, time, top)) {
                const ux = n.tx - n.x, uz = n.tz - n.z, ul = Math.hypot(ux, uz) || 1;
                pl.dash = { x: n.tx + ux / ul * 4, z: n.tz + uz / ul * 4, ux: ux / ul, uz: uz / ul };
                pl.i++;
                inp.thr = 1;
            }
            return inp;
        }
        case 'w': {
            // a road that falls away: go when every stone will still be there as the car crosses it
            const d = Math.hypot(n.x - b.x, n.z - b.z);
            steerTo(b, n.x + (nx ? (nx.x - n.x) * 0.2 : 0), n.z + (nx ? (nx.z - n.z) * 0.2 : 0));
            if (d > 3) { inp.thr = b.spd > Math.min(26, d * 1.4 + 4) ? -1 : 1; break; }
            pl.waiting = true;
            if (Math.abs(b.spd) > 1.5) { inp.thr = b.spd > 0 ? -1 : 1; break; }
            let ok = true;
            for (let q = 0; q < n.parts.length && ok; q++) {
                const p = c.parts[n.parts[q]], ta = time + arriveTime(n.dist + (q + 0.5) * n.S, top * (sk.speed || 1));
                ok = c.onAt(p, ta - 0.3) && c.onAt(p, ta) && c.onAt(p, ta + 0.45);
            }
            if (ok) { pl.i++; inp.thr = 1; }
            return inp;
        }
        default: {
            // aim a little past the point, toward the one after, so the line through a run of points is smooth
            let ax = n.x, az = n.z;
            if (nx && n.k === 'd' && n.cp === undefined) { const d = Math.hypot(n.x - b.x, n.z - b.z); if (d < 14) { const k = (14 - d) / 14 * 0.5; ax += (nx.x - n.x) * k * 0.3; az += (nx.z - n.z) * k * 0.3; } }
            const err = steerTo(b, ax, az);
            let want = (n.v || top) * (n.v ? 1 : sk.speed || 1);
            // a sharp turn coming: slow for it
            if (Math.abs(err) > 0.5 && b.onGround) want = Math.min(want, 24);
            if (b.onGround) inp.thr = b.spd < want - 1.5 ? 1 : b.spd > want + 7 ? -1 : 0;
            else inp.thr = 1;
            inp.fly = wantFly(b, n, jet, pl.lazy, c);
            // and the point after it: if it's a window, be climbing for it already
            if (!inp.fly && nx && nx.k === 'f' && wantFly(b, nx, jet, pl.lazy, c) && !(n.hi && b.y > n.hi)) inp.fly = true;
            // on the road with the tank low and a climb coming: wait for it to fill
            if (b.onGround && (inp.fly || pl.refuel) && b.gas < (pl.refuel ? 70 : 40)) { pl.refuel = true; pl.waiting = true; inp.fly = false; inp.thr = b.spd > 3 ? -1 : 0; }
            else if (pl.refuel && (b.gas >= 70 || !b.onGround)) pl.refuel = false;
        }
    }
    return inp;
}
