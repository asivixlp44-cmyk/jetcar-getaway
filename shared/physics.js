// Driving and flying, shared: your own car runs it on your screen every frame, the server runs it for the bots, the course test runs it
// headless. A car is an upright cylinder against the course's parts with a heading and a speed along it: the throttle pushes the speed
// toward the top (quickly at first, then tapering), the brakes stop it, steering turns the heading (less at a crawl, a touch less flat out),
// the velocity follows the heading with grip (ice lets it slide). Up a ramp the road lifts you; off its lip you keep that lift and fly
// on. Hold FLY and the jets lift you (more than gravity) and push you on while the gas lasts; on the road the tank fills again.
import { CFG, clamp } from './config.js';
import { RB, PH, MK, TAU } from './course.js';

export const STEP = 1.05, CATCH = 1.7;
// what stepBody says happened
export const EV = { NONE: 0, TAKEOFF: 1, BOOST: 2, LAND: 3, BOUNCE: 4, KNOCK: 5, LETHAL: 6, BUMP: 7, PAD: 8 };

export function newBody(x, y, z, yaw) {
    return {
        x, y, z, vx: 0, vy: 0, vz: 0, yaw: yaw || 0, spd: 0, onGround: true, ground: null, gas: CFG.tank, tank: CFG.tank, boostT: 0, boostCool: 0,
        airT: 0, safeT: 0, knockT: 0, fromY: y, flying: false, gvy: 0, grade: 0, lastHit: null, padT: 0,
    };
}
// put a car somewhere, at rest
export function placeBody(b, x, y, z, yaw) {
    b.x = x; b.y = y; b.z = z; b.vx = b.vy = b.vz = 0; b.spd = 0; b.yaw = yaw ?? b.yaw; b.onGround = false; b.ground = null; b.fromY = y;
    b.knockT = 0; b.boostT = 0; b.airT = 0; b.gvy = 0; b.grade = 0; b.gas = b.tank; b.flying = false;
}

// after moving sideways: out of whatever you've driven into (or up onto it, if it's a kerb)
function resolveH(b, w, list) {
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.lethal || p.ghost) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        if (p.knock) continue;
        const dx = b.x - p.x, dz = b.z - p.z;
        if (p.r) {
            const d2 = dx * dx + dz * dz, m = p.r + RB;
            if (d2 >= m * m || b.y >= p.top - 1e-3 || b.y + PH <= p.top - p.h) continue;
            const rise = p.top - b.y;
            if (rise <= STEP || (rise <= CATCH && b.vy <= 0)) { b.y = p.top + 1e-3; continue; }
            const d = Math.sqrt(d2) || 1e-4, nx = dx / d, nz = dz / d;
            b.x = p.x + nx * m; b.z = p.z + nz * m;
            const vn = b.vx * nx + b.vz * nz;
            if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
            continue;
        }
        const ca = p.ca, sa = p.sa, lx = dx * ca - dz * sa, lz = dx * sa + dz * ca, ex = p.hx + RB, ez = p.hz + RB;
        if (lx >= ex || lx <= -ex || lz >= ez || lz <= -ez) continue;
        let top = p.top;
        if (p.y1 !== undefined) { const f = (lz + p.hz) / (2 * p.hz); top = p.y0 + (p.y1 - p.y0) * (f < 0 ? 0 : f > 1 ? 1 : f); }
        if (b.y >= top - 1e-3 || b.y + PH <= top - p.h) continue;
        const rise = top - b.y;
        // up a slope (or a kerb): the road lifts you
        if (p.y1 !== undefined ? rise <= STEP * 3 : (rise <= STEP || (rise <= CATCH && b.vy <= 0))) { b.y = top + 1e-3; continue; }
        // the shortest way out
        const px = ex - Math.abs(lx), pz = ez - Math.abs(lz);
        if (px < pz) {
            const sg = lx >= 0 ? 1 : -1, nx = ca * sg, nz = -sa * sg;
            b.x += nx * px; b.z += nz * px;
            const vn = b.vx * nx + b.vz * nz;
            if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
        } else {
            const sg = lz >= 0 ? 1 : -1, nx = sa * sg, nz = ca * sg;
            b.x += nx * pz; b.z += nz * pz;
            const vn = b.vx * nx + b.vz * nz;
            if (vn < 0) { b.vx -= vn * nx; b.vz -= vn * nz; }
        }
    }
}
function resolveV(b, w, list, d) {
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.lethal || p.knock || p.noFloor || p.ghost) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        const top = w.topAt(p, b.x, b.z, RB * 0.6);
        if (top === -Infinity) continue;
        const bot = top - p.h;
        if (b.y >= top || b.y + PH <= bot) continue;
        if (d < 0) {
            const pen = top - b.y;
            if (pen <= Math.max(STEP, -d + 0.05)) { b.y = top; if (b.vy < 0) b.vy = 0; b.onGround = true; b.ground = p; }
        } else {
            const pen = b.y + PH - bot;
            if (pen <= d + 0.05) { b.y = bot - PH - 1e-4; if (b.vy > 0) b.vy = 0; }
        }
    }
}
// a little way down to the road under you (driving down a slope stays on it)
function groundProbe(b, w, list, maxDrop) {
    let best = -Infinity, bt = null;
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.lethal || p.knock || p.noFloor || p.ghost) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        const top = w.topAt(p, b.x, b.z, RB * 0.6);
        if (top === -Infinity) continue;
        if (top <= b.y + 0.02 && top >= b.y - maxDrop && top > best) { best = top; bt = p; }
    }
    if (bt) { b.y = best; b.onGround = true; b.ground = bt; if (b.vy < 0) b.vy = 0; }
}
// what you stand on carries you
function carry(b, w) {
    const g = b.ground;
    if (!g || !g.mv || !b.onGround) return;
    const m = g.mv;
    if (m.k === MK.SLIDE) {
        const a = TAU * (w.prevTime / m.P + m.ph), c = TAU * (w.time / m.P + m.ph), d = Math.sin(c) - Math.sin(a), e = Math.cos(c) - Math.cos(a);
        b.x += m.ax * d + m.bx * e; b.z += m.az * d + m.bz * e; b.y += m.ay * d;
    } else if (m.k === MK.SPIN) {
        const da = TAU * (w.time - w.prevTime) / m.P * m.dir, cs = Math.cos(da), sn = Math.sin(da), dx = b.x - g.x0, dz = b.z - g.z0;
        b.x = g.x0 + dx * cs + dz * sn; b.z = g.z0 - dx * sn + dz * cs; b.yaw += da;
    }
}
// how fast the road under you lifts you, and how steep it is along your heading
function slopeOf(b, p) {
    if (!p || p.y1 === undefined) { b.gvy = 0; b.grade = 0; return; }
    const k = (p.y1 - p.y0) / (2 * p.hz), ax = p.sa, az = p.ca;
    b.gvy = k * (b.vx * ax + b.vz * az);
    b.grade = k * (Math.sin(b.yaw) * ax + Math.cos(b.yaw) * az);
}

// One step. inp: { thr (-1..1), steer (-1..1, right is +), fly (held), boost (pressed this step), top (top speed), jet (lift x), tank (gas),
// boostSecs, burnK (Easy / Hard) }. w: the course. Returns what happened (EV).
export function stepBody(b, inp, dt, w) {
    let ev = EV.NONE;
    const grav = CFG.grav;
    carry(b, w);
    if (b.safeT > 0) b.safeT -= dt;
    if (b.knockT > 0) b.knockT -= dt;
    if (b.boostCool > 0) b.boostCool -= dt;
    if (b.padT > 0) b.padT -= dt;
    b.tank = inp.tank || CFG.tank;
    if (b.gas > b.tank) b.gas = b.tank;
    const g0 = b.ground, wasOn = b.onGround, top0 = inp.top || CFG.top;
    if (wasOn) { b.airT = 0; b.fromY = b.y; } else b.airT += dt;
    // the nitro
    if (inp.boost && b.boostCool <= 0 && b.boostT <= 0) { b.boostT = inp.boostSecs || CFG.boostSecs; b.boostCool = CFG.boostCool + b.boostT; ev = EV.BOOST; }
    const boosting = b.boostT > 0;
    if (boosting) b.boostT -= dt;
    const top = top0 * (boosting ? CFG.boostK : 1);
    const thr = b.knockT > 0 ? 0 : clamp(inp.thr || 0, -1, 1), st = clamp(inp.steer || 0, -1, 1), ice = wasOn && g0 && g0.ice;
    // ----- speed along the heading -----
    if (wasOn) {
        if (thr > 0) {
            if (b.spd < 0) b.spd = Math.min(0, b.spd + CFG.brake * dt);
            else if (b.spd < top * thr) b.spd = Math.min(top * thr, b.spd + CFG.acc * (boosting ? 1.9 : 1) * (1.3 - 0.8 * Math.min(1, b.spd / top)) * dt * (ice ? 0.6 : 1));
        } else if (thr < 0) {
            if (b.spd > 0.5) b.spd = Math.max(0, b.spd + CFG.brake * thr * dt * (ice ? 0.35 : 1));
            else b.spd = Math.max(-CFG.rev, b.spd + CFG.acc * 0.7 * thr * dt);
        } else {
            const c = (5 + Math.abs(b.spd) * 0.22) * dt * (ice ? 0.3 : 1);
            b.spd = Math.abs(b.spd) <= c ? 0 : b.spd - Math.sign(b.spd) * c;
        }
        // uphill slows you, downhill speeds you up
        b.spd -= b.grade * grav * 0.32 * dt;
    } else if (b.spd > 0) b.spd -= b.spd * 0.05 * dt;
    // past the top (the nitro's over, or downhill): back down to it
    if (b.spd > top) b.spd -= (b.spd - top) * Math.min(1, (wasOn ? 1.6 : 0.5) * dt);
    // ----- the jets -----
    b.flying = false;
    // (off the road the jets need a little in the tank to lift you; in the air they burn to the last drop)
    if (inp.fly && b.gas > (wasOn ? 12 : 0) && b.knockT <= 0) {
        b.flying = true;
        b.gas = Math.max(0, b.gas - CFG.burn * (inp.burnK ?? 1) * dt);
        const jet = inp.jet || 1;
        if (wasOn) { b.vy = Math.max(b.vy, 9); b.onGround = false; b.ground = null; ev = ev || EV.TAKEOFF; }
        b.vy = Math.min(CFG.climbMax * jet, b.vy + CFG.jetUp * jet * dt);
        const ft = CFG.flyTop * (top0 / CFG.top);
        if (b.spd < ft) b.spd = Math.min(ft, b.spd + CFG.flyAcc * dt);
    } else if (wasOn) b.gas = Math.min(b.tank, b.gas + CFG.refill * dt);
    // ----- steering: none standing still, quickest at a run, a touch less flat out; less in the air -----
    const sp = Math.abs(b.spd), turnK = Math.min(1, sp / 12) * (1 - 0.34 * Math.min(1, sp / (CFG.top * 1.25)));
    b.yaw -= st * CFG.steer * turnK * (b.onGround ? (ice ? 0.75 : 1) : 0.72) * (b.spd < -0.5 ? -1 : 1) * dt;
    if (b.yaw > Math.PI) b.yaw -= TAU; else if (b.yaw < -Math.PI) b.yaw += TAU;
    // ----- the velocity follows the heading (grip; ice slides; in the air only the jets steer it, and slowly) -----
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw), grip = b.onGround ? (ice ? CFG.iceGrip : CFG.grip) : (b.flying ? 3.2 : 1.1);
    const k = Math.min(1, dt * grip * (b.knockT > 0 ? 0.15 : 1));
    b.vx += (fx * b.spd - b.vx) * k;
    b.vz += (fz * b.spd - b.vz) * k;
    if (!b.onGround || b.flying) b.vy = Math.max(-CFG.fallMax, b.vy - grav * dt);
    // ----- move, out of what's in the way -----
    const vx = b.vx, vz = b.vz, n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vz), Math.abs(b.vy)) * dt / 0.5)), sdt = dt / n;
    b.onGround = false; b.ground = null;
    let list = NONE;
    let hurt = null;
    for (let i = 0; i < n; i++) {
        b.x += b.vx * sdt; b.z += b.vz * sdt;
        list = w.near(b.x, b.z) || NONE;
        resolveH(b, w, list);
        const dy = b.vy * sdt;
        b.y += dy;
        resolveV(b, w, list, dy);
        // (what hurts is looked for every sub-step: a fast car would skip clean through a thin beam of light)
        if (!hurt) hurt = hazardAt(b, w, list);
    }
    list = w.near(b.x, b.z) || NONE;
    if (!b.onGround && b.vy <= 0.01 && !b.flying) groundProbe(b, w, list, wasOn ? 0.9 + Math.abs(b.spd) * dt * 0.9 : 0.05);
    // what the walls took off you
    const lost = (vx - b.vx) * fx + (vz - b.vz) * fz;
    if (lost > 0.01 && b.spd > 0) { b.spd = Math.max(0, b.spd - lost); if (lost > 20) ev = ev || EV.BUMP; }
    // ----- on the road: its slope (to launch you off its lip), a landing, the pads -----
    const G = b.ground;
    if (b.onGround) {
        slopeOf(b, G);
        if (!wasOn) { ev = ev || EV.LAND; b.flying = false; }
        if (G.bounce) { b.vy = G.bounce; b.onGround = false; b.ground = null; ev = EV.BOUNCE; b.fromY = b.y; }
        else if (G.boost && b.padT <= 0) { b.spd = Math.max(b.spd, G.boost); b.boostT = Math.max(b.boostT, 0.9); b.padT = 0.5; ev = ev || EV.PAD; }
    } else if (wasOn && b.vy <= 0.01 && b.gvy > 0) {
        // off the lip of a ramp: the lift it gave you carries on
        b.vy = Math.min(48, b.gvy);
        b.gvy = 0;
    }
    // ----- what can hurt you: anywhere the car touches it -----
    const p = hurt;
    if (p && p.lethal) { if (b.safeT <= 0) ev = EV.LETHAL; }
    else if (p && b.safeT <= 0 && b.knockT <= 0) {
        // a blow: away from it and up, the speed knocked off you
        const dx = b.x - p.x, dz = b.z - p.z, lz = dx * p.sa + dz * p.ca;
        let nx = dx, nz = dz;
        const m0 = p.mv;
        if (m0 && m0.k === MK.SPIN) { const sg = m0.dir * (lz >= 0 ? 1 : -1); nx = p.ca * sg; nz = -p.sa * sg; }
        else if (m0 && m0.k === MK.SLIDE) { const c = TAU * (w.time / m0.P + m0.ph), d = Math.cos(c); nx = m0.ax * d; nz = m0.az * d; if (Math.hypot(nx, nz) < 0.5) { nx = dx; nz = dz; } }
        const l = Math.hypot(nx, nz) || 1;
        b.vx = nx / l * 30; b.vz = nz / l * 30; b.spd *= 0.25; b.vy = 18; b.onGround = false; b.ground = null; b.knockT = 0.6; b.lastHit = p;
        ev = EV.KNOCK;
    }
    // down to the city, or a long way below the last road you were on
    if (b.y < w.groundY + 2 || (!b.onGround && b.y < b.fromY - CFG.fallKill)) ev = EV.LETHAL;
    return ev;
}
const NONE = [];
// the first thing here that hurts: a laser (deadly) or something that knocks you flying
function hazardAt(b, w, list) {
    for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (!p.lethal && !p.knock) continue;
        if (p.mv) { w.pose(p); if (p.on === false) continue; }
        const top = p.top, bot = top - p.h;
        if (b.y >= top - 0.01 || b.y + PH <= bot) continue;
        const dx = b.x - p.x, dz = b.z - p.z, lx = dx * p.ca - dz * p.sa, lz = dx * p.sa + dz * p.ca, m = p.lethal ? RB * 0.5 : RB;
        if (Math.abs(lx) > p.hx + m || Math.abs(lz) > p.hz + m) continue;
        return p;
    }
    return null;
}
