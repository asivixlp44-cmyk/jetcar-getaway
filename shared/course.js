// The courses: one long sky road of 100 stages through four worlds, and the shorter Police Chase maps. Both sides build the same course
// from the same numbers: the client draws it and drives you on it, the server runs its bots on it and checks where you say you are.
// A course is a list of parts: boxes turned about the vertical (a ramp when y0 and y1 differ), round discs, and what makes them obstacles:
// moving, spinning, blinking, deadly, slippery, a speed pad. Everything that moves is a pure function of one clock, so the client's
// picture (moved in the vertex shader), its physics and the server's bots all agree with no messages at all. The rings and keys float
// over the gaps; the city is far below.
import { rngFrom, clamp, STAGES, STAGES_PER_WORLD, WORLDS, CHASE_TIERS, worldOfStage, stageD } from './config.js';

export const TAU = Math.PI * 2;
export const RB = 1.7, PH = 2.3;      // a car's radius and height
export const GROUND_Y = -70;          // the city's streets
const CELL = 24;
// the clock everything moves by: it wraps every two minutes, and every period below divides that exactly, so nothing ever jumps
export const WRAP = 120;
export const courseClock = (ms) => (ms % (WRAP * 1000)) / 1000;
// the Garage Deck: where you start, on a rooftop high over the city
export const HUB = {
    spawn: { x: 0, z: -46 }, yaw: 0,
    w: 150, l: 170, z0: -80,
    gate: { x: 0, z: 84 },
    cars: { x: -50, z: -6 }, paint: { x: 50, z: -6 }, crates: { x: -50, z: 44 }, ups: { x: 50, z: 44 }, chase: { x: 46, z: 76 }, board: { x: -58, z: 76 },
};
export const HUB_R = 100;
// how far in front of each stall its show car turns
export const SHOW_DZ = 17;

// ----- what's standing where: the parts -----
const fract = (v) => v - Math.floor(v);
const lerp = (a, b, k) => a + (b - a) * clamp(k, 0, 1);
const MK = { SLIDE: 0, SPIN: 1, BLINK: 2, SWING: 3 };
export { MK };

export class Course {
    constructor(id, world) {
        this.id = id; this.world = world;
        this.parts = []; this.cps = []; this.route = []; this.deco = []; this.movers = []; this.signs = []; this.rings = []; this.keys = [];
        this.chunks = 1;
        this.grid = new Map();
        this.time = 0; this.prevTime = 0; this.tick = 0;
        this.groundY = GROUND_Y; this.total = 1; this.main = false;
        this.start = null; this.finish = null;
    }
    setTime(t, dt) { this.prevTime = t - (dt || 0); this.time = t; this.tick++; }
    // where a moving part is right now (at most once a tick, and only the ones someone's near)
    pose(p) {
        if (p.tk === this.tick) return;
        p.tk = this.tick;
        const m = p.mv, t = this.time;
        if (m.k === MK.SLIDE) {
            const a = TAU * (t / m.P + m.ph), s = Math.sin(a), co = Math.cos(a);
            p.x = p.x0 + m.ax * s + m.bx * co; p.z = p.z0 + m.az * s + m.bz * co;
            const dy = m.ay * s;
            p.top = p.top0 + dy;
            if (p.y1 !== undefined) { p.y0 = p.y00 + dy; p.y1 = p.y10 + dy; }
        } else if (m.k === MK.SPIN) {
            const a = p.ry0 + TAU * (t / m.P + m.ph) * m.dir;
            p.ca = Math.cos(a); p.sa = Math.sin(a);
        } else if (m.k === MK.BLINK) {
            p.on = fract(t / m.P + m.ph) < m.duty;
        }
    }
    // is a blinking part there at time t?
    onAt(p, t) { const m = p.mv; return !m || m.k !== MK.BLINK || fract(t / m.P + m.ph) < m.duty; }
    near(x, z) { return this.grid.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL))); }
    index() {
        for (const p of this.parts) {
            let ex = Math.abs(p.hx * p.ca) + Math.abs(p.hz * p.sa), ez = Math.abs(p.hx * p.sa) + Math.abs(p.hz * p.ca);
            if (p.r) ex = ez = p.r;
            let xr = ex, zr = ez;
            const m = p.mv;
            if (m) {
                if (m.k === MK.SLIDE) { xr += Math.abs(m.ax) + Math.abs(m.bx); zr += Math.abs(m.az) + Math.abs(m.bz); }
                else if (m.k === MK.SPIN) { xr = zr = Math.hypot(p.hx, p.hz); if (p.r) xr = zr = p.r; }
            }
            const pad = RB + 1, i0 = Math.floor((p.x - xr - pad) / CELL), i1 = Math.floor((p.x + xr + pad) / CELL), j0 = Math.floor((p.z - zr - pad) / CELL), j1 = Math.floor((p.z + zr + pad) / CELL);
            for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
                const k = cellKey(i, j);
                let l = this.grid.get(k);
                if (!l) { l = []; this.grid.set(k, l); }
                l.push(p);
            }
        }
        if (this.finish) this.total = this.finish.s;
    }
    // the top of a part at this point (ramps), or -Infinity if the point isn't over it
    topAt(p, x, z, m) {
        m = m || 0;
        const dx = x - p.x, dz = z - p.z;
        if (p.r) { if (dx * dx + dz * dz > (p.r + m) * (p.r + m)) return -Infinity; return p.top; }
        const lx = dx * p.ca - dz * p.sa, lz = dx * p.sa + dz * p.ca;
        if (lx > p.hx + m || lx < -p.hx - m || lz > p.hz + m || lz < -p.hz - m) return -Infinity;
        if (p.y1 !== undefined) { const f = clamp((lz + p.hz) / (2 * p.hz), 0, 1); return p.y0 + (p.y1 - p.y0) * f; }
        return p.top;
    }
    // the highest thing under (x, y, z) a car could stand on; -Infinity when nothing's there. Far from a mover, its whole sweep counts (the server's lenient: your clock isn't quite its clock)
    groundBelow(x, y, z, reach, sweep) {
        const l = this.near(x, z);
        let best = -Infinity;
        if (!l) return best;
        for (let i = 0; i < l.length; i++) {
            const p = l[i];
            if (p.noFloor || p.lethal || p.knock || p.ghost) continue;
            if (p.mv) {
                if (sweep && p.mv.k === MK.BLINK) { const top = this.topAt(p, x, z, RB + 1); if (top <= y + (reach ?? 0.5) && top > best) best = top; continue; }
                this.pose(p);
                if (p.on === false) continue;
            }
            const top = this.topAt(p, x, z, RB);
            if (top <= y + (reach ?? 0.5) && top > best) best = top;
        }
        return best;
    }
    // is this spot inside something solid? (the camera's ray asks)
    solidAt(x, y, z) {
        const l = this.near(x, z);
        if (!l) return false;
        for (let i = 0; i < l.length; i++) {
            const p = l[i];
            if (p.noCam || p.noFloor || p.mv) continue;
            const top = this.topAt(p, x, z);
            if (top === -Infinity) continue;
            if (y < top && y > top - p.h) return true;
        }
        return false;
    }
    // where you come back from checkpoint i (-1: the start)
    respawnOf(i) {
        if (i < 0 || !this.cps.length) return { x: this.start.x, y: this.start.y + 0.2, z: this.start.z, ry: this.start.ry, s: 0 };
        const c = this.cps[clamp(i, 0, this.cps.length - 1)];
        return { x: c.x - Math.sin(c.ry) * 3, y: c.y + 0.2, z: c.z - Math.cos(c.ry) * 3, ry: c.ry, s: c.s };
    }
    // a place on a chase's start line (spot from 0), or the start of the long run
    startSpot(spot) {
        const b = this.start, sp = spot || 0, col = sp % 3, row = Math.floor(sp / 3), lat = (col - 1) * 8, back = row * 11;
        return { x: b.x + b.rx * lat - b.fx * back, y: b.y + 0.2, z: b.z + b.rz * lat - b.fz * back, ry: b.ry, s: 0 };
    }
    // how far along: i is the last checkpoint you've touched
    sAt(i, x, y, z) {
        const a = i >= 0 ? this.cps[i] : this.start, b = i + 1 < this.cps.length ? this.cps[i + 1] : this.finish;
        if (!a || !b) return this.total;
        const sa = i >= 0 ? a.s : 0, dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz, f = l2 > 0 ? clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1) : 0;
        return sa + (b.s - sa) * f;
    }
    // the point at a distance along the course, and which way it's heading there (the cops)
    pointAt(s, out) {
        const n = this.cps.length, st = this.start;
        let ax = st.x, ay = st.y, az = st.z, as = 0, bx = st.x, by = st.y, bz = st.z, bs = 0;
        for (let i = 0; i <= n; i++) {
            const c = i < n ? this.cps[i] : this.finish;
            bx = c.x; by = c.y; bz = c.z; bs = c.s;
            if (s <= bs || i === n) break;
            ax = bx; ay = by; az = bz; as = bs;
        }
        const f = bs > as ? clamp((s - as) / (bs - as), -3, 1) : 0;
        out.x = ax + (bx - ax) * f; out.y = ay + (by - ay) * Math.max(0, f); out.z = az + (bz - az) * f;
        out.ry = Math.atan2(bx - ax, bz - az);
        return out;
    }
    // the first route node of checkpoint i
    routeOf(i) { return i < 0 ? 0 : this.cps[clamp(i, 0, this.cps.length - 1)].routeI; }
    facing(i) { return i < 0 ? this.start.ry : this.cps[clamp(i, 0, this.cps.length - 1)].ry; }
    // the checkpoint pad you're on (or just over), within a few of the one you last touched
    padAt(x, y, z, from, ahead) {
        const a = Math.max(0, from), b = Math.min(this.cps.length - 1, from + (ahead ?? 3));
        for (let i = b; i >= a; i--) {
            const c = this.cps[i];
            if (Math.abs(x - c.x) <= c.hw + 5 && Math.abs(z - c.z) <= c.hw + 5 && y - c.y <= 14 && y - c.y >= -2) return i;
        }
        return -1;
    }
    atFinish(x, y, z) { const f = this.finish; return f && Math.hypot(x - f.x, z - f.z) <= f.r && Math.abs(y - f.y) <= 8; }
    // at the end of the road having come along it: the last pad, or only the last one missed (a corner cut over)
    atEnd(cp, x, y, z) { return cp >= this.cps.length - 2 && this.atFinish(x, y, z); }
    // a ring flown through between two points (its index, or -1): the line crosses its plane inside it
    ringCross(x0, y0, z0, x1, y1, z1, from, slack) {
        for (let i = from || 0; i < this.rings.length; i++) {
            const r = this.rings[i];
            if (Math.abs(r.x - x1) > 140 || Math.abs(r.z - z1) > 140) continue;
            const d0 = (x0 - r.x) * r.ax + (z0 - r.z) * r.az, d1 = (x1 - r.x) * r.ax + (z1 - r.z) * r.az;
            if (d0 > 0 || d1 < 0 || d1 === d0) continue;
            const f = -d0 / (d1 - d0), x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f + 1.1, z = z0 + (z1 - z0) * f;
            if (Math.hypot(x - r.x, y - r.y, z - r.z) <= r.r + (slack || 0)) return i;
        }
        return -1;
    }
    keyNear(x, y, z, reach) {
        for (const k of this.keys) if (Math.abs(k.x - x) < reach && Math.abs(k.z - z) < reach && Math.abs(k.y - (y + 1.1)) < reach) return k;
        return null;
    }
}
const cellKey = (i, j) => (i + 8192) * 16384 + (j + 8192);

// ----- building a course: a cursor driving through the sky -----
class Builder {
    constructor(c, seed, world) {
        this.c = c; this.R = rngFrom(seed); this.x = 0; this.y = 0; this.z = 0; this.h = 0; this.world = world; this.chunk = 0; this.W = 16; this.stage = -1; this.rails = true;
        this.turnTo(0);
    }
    turnTo(h) { this.h = (h + 4) % 4; this.ry = this.h * TAU / 4; this.fx = Math.round(Math.sin(this.ry)); this.fz = Math.round(Math.cos(this.ry)); this.rx = this.fz; this.rz = -this.fx; }
    wx(u, v) { return this.x + this.fx * u + this.rx * v; }
    wz(u, v) { return this.z + this.fz * u + this.rz * v; }
    adv(u, v) { this.x = this.wx(u, v || 0); this.z = this.wz(u, v || 0); }
    // o: u, v (centre), y (its top; y1: the top at its far end, a ramp), w (across), l (along), h (thick), rot, look, tone, and what makes it an obstacle
    part(o) {
        const c = this.c, ry = this.ry + (o.rot || 0), x = this.wx(o.u || 0, o.v || 0), z = this.wz(o.u || 0, o.v || 0);
        const p = {
            id: c.parts.length, x, z, x0: x, z0: z, top: o.y, top0: o.y, h: o.h ?? 3, hx: (o.w || 1) / 2, hz: (o.l || 1) / 2, r: o.r || 0, ry, ry0: ry, ca: Math.cos(ry), sa: Math.sin(ry),
            look: o.look || 'road', tone: o.tone || 0, chunk: this.chunk, world: this.world, tk: -1, on: true,
        };
        if (o.y1 !== undefined) { p.y0 = o.y; p.y1 = o.y1; p.y00 = o.y; p.y10 = o.y1; p.top = Math.max(o.y, o.y1); p.top0 = p.top; }
        for (const k of ['lethal', 'knock', 'bounce', 'ice', 'noCam', 'noFloor', 'ghost', 'small', 'label', 'boost', 'deep']) if (o[k] !== undefined) p[k] = o[k];
        if (o.mv) {
            const m = o.mv;
            if (m.k === MK.SLIDE) p.mv = { k: m.k, ax: this.fx * (m.u || 0) + this.rx * (m.v || 0), ay: m.y || 0, az: this.fz * (m.u || 0) + this.rz * (m.v || 0), bx: 0, bz: 0, P: m.P, ph: m.ph || 0 };
            else if (m.k === MK.SPIN) p.mv = { k: m.k, P: m.P, ph: m.ph || 0, dir: m.dir || 1 };
            else if (m.k === MK.BLINK) p.mv = { k: m.k, P: m.P, ph: m.ph || 0, duty: m.duty };
            p.mi = c.movers.push(p);
        }
        c.parts.push(p);
        return p;
    }
    // a thing to look at, nothing to drive on: o: kind, u, v, y, s (size), ...
    deco(o) {
        const c = this.c;
        const d = { ...o, x: this.wx(o.u || 0, o.v || 0), y: o.y ?? this.y, z: this.wz(o.u || 0, o.v || 0), ry: this.ry + (o.rot || 0), chunk: this.chunk, world: this.world };
        delete d.u; delete d.v;
        c.deco.push(d);
        return d;
    }
    // route nodes, in the cursor's frame. drive: on the road (the pilot flies only if it must); fly: be at least this high when you get there
    drive(u, v, y, sp) { this.c.route.push({ k: 'd', x: this.wx(u, v), z: this.wz(u, v), y: y ?? this.y, v: sp || 0 }); }
    fly(u, v, y, hi, sp) { this.c.route.push({ k: 'f', x: this.wx(u, v), z: this.wz(u, v), y, hi: hi || 0, v: sp || 0 }); }
    guard(u, v, tu, tv) { this.c.route.push({ k: 'g', x: this.wx(u, v), z: this.wz(u, v), y: this.y, tx: this.wx(tu, tv), tz: this.wz(tu, tv) }); }
    wave(u, v, parts, dist) { this.c.route.push({ k: 'w', x: this.wx(u, v), z: this.wz(u, v), y: this.y, parts: parts.map((p) => p.id), dist }); }
    ring(u, v, y, r) {
        const c = this.c, x = this.wx(u, v), z = this.wz(u, v);
        c.rings.push({ i: c.rings.length, x, y, z, r, ax: this.fx, az: this.fz, ry: this.ry, stage: this.stage, chunk: this.chunk, world: this.world });
    }
    key(u, v, y) {
        const c = this.c;
        c.keys.push({ i: c.keys.length, x: this.wx(u, v), y, z: this.wz(u, v), stage: this.stage, chunk: this.chunk, world: this.world });
    }
    // a stretch of road, with low walls along it
    road(l, o) {
        o = o || {};
        const w = o.w ?? this.W, y = this.y;
        if (o.y1 !== undefined) this.part({ u: l / 2, y, y1: o.y1, w, l, h: 4, look: o.look || 'road', ice: o.ice });
        else this.part({ u: l / 2, y, w, l, h: 3.5, look: o.look || 'road', ice: o.ice, tone: o.tone });
        if (o.rails !== false && this.rails) for (const sg of [-1, 1]) {
            if (o.y1 !== undefined) this.part({ u: l / 2, v: sg * (w / 2 + 0.6), y: y + 1.9, y1: o.y1 + 1.9, w: 1.2, l, h: 5.5, look: 'rail', noCam: true });
            else this.part({ u: l / 2, v: sg * (w / 2 + 0.6), y: y + 1.9, w: 1.2, l, h: 5.4, look: 'rail', noCam: true });
        }
        if (o.y1 !== undefined) this.y = o.y1;
        this.drive(l - 2, 0, this.y, o.v);
        this.adv(l);
    }
    // a ramp up off the end of the road
    ramp(l, rise, w) {
        this.part({ u: l / 2, y: this.y, y1: this.y + rise, w: w ?? this.W, l, h: 4, look: 'ramp' });
        this.drive(l, 0, this.y + rise);
        this.adv(l); this.y += rise;
    }
    // a checkpoint pad here: the stage starts on it. turn: which way the course goes on from it
    pad(i, turn, slow) {
        const c = this.c, hw = 12, x = this.wx(hw, 0), z = this.wz(hw, 0), last = c.cps[c.cps.length - 1];
        this.part({ u: hw, y: this.y, w: hw * 2, l: hw * 2, h: 4, look: 'pad', tone: i });
        const ax = last ? last.x : c.start.x, az = last ? last.z : c.start.z;
        const s = (last ? last.s : 0) + Math.hypot(x - ax, z - az);
        c.route.push({ k: 'd', x, z, y: this.y, cp: c.cps.length, v: turn || slow ? 22 : 0 });
        this.x = x; this.z = z;
        if (turn) this.turnTo(this.h + turn);
        c.parts[c.parts.length - 1].exit = this.ry;
        const cp = { i: c.cps.length, x, y: this.y, z, hw, s, ry: this.ry, routeI: c.route.length - 1, world: this.world, chunk: this.chunk };
        c.cps.push(cp);
        this.adv(hw);
        return cp;
    }
}

// ----- the obstacles. Each starts at the cursor (on the road, the course going on ahead), ends at the far edge of what it built.
// d is how hard: about 0 on the first stage, 1 near the end of Neon Nightway, 1.3 the very end of the run. Each number has a limit, so the
// stock car on Normal can still do it (a tank of gas is a bit over three seconds of flight) -----
const dn = (d) => Math.min(d, 1.3);
const OB = {
    // up a ramp and over a gap: a short one jumps it, a long one wants the jets
    ramp(b, d) {
        const G = lerp(0.3, 0.42, d), Lr = 24, gap = lerp(24, 74, dn(d) / 1.3), dh = b.bias * lerp(3, 8, d);
        b.road(60);
        b.ramp(Lr, Lr * G);
        const land = b.y + dh;
        b.drive(gap + 8, 0, land);
        b.adv(gap); b.y = land;
        b.road(44);
    },
    // the road ends; the far side is higher: FLY
    gapUp(b, d) {
        const gap = lerp(22, 58, dn(d) / 1.3), dh = lerp(5, 15, d);
        b.road(64);
        if (b.stage === 1) b.deco({ kind: 'billboard', u: -10, v: b.W / 2 + 9, y: b.y, text: 'HOLD FLY', sub: 'to jet across the gap', rot: -Math.PI / 2 });
        b.fly(gap * 0.6, 0, b.y + dh + 3);
        b.adv(gap); b.y += dh;
        b.drive(10, 0, b.y);
        b.road(44);
    },
    // a long jump with rings to fly through on the way (each pays)
    rings(b, d) {
        const R = b.R, n = 3 + Math.round(dn(d)), gap = lerp(78, 128, dn(d) / 1.3), wob = lerp(1, 9, d), lift = lerp(6, 16, d), rr = lerp(6.8, 5.2, d);
        b.road(56);
        b.ramp(18, 5);
        const y0 = b.y, land = y0 + b.bias * lerp(2, 8, d);
        for (let i = 0; i < n; i++) {
            const f = (i + 1) / (n + 1), u = gap * f, v = i === n - 1 ? 0 : (R() - 0.5) * 2 * wob, y = y0 + 4 + Math.sin(Math.PI * f) * lift;
            b.ring(u, v, y, rr);
            b.fly(u, v, y - 1.4, y + rr * 0.45);
        }
        b.drive(gap + 8, 0, land);
        b.adv(gap); b.y = land;
        b.road(40);
    },
    // walls across the road with a window in each: fly up through it
    frames(b, d) {
        const R = b.R, n = 1 + Math.round(dn(d) * 1.5), W = b.W + 2, gapU = 74, l = 36 + n * gapU, y = b.y;
        b.part({ u: l / 2, y, w: W, l, h: 3.5, look: 'road' });
        for (const sg of [-1, 1]) b.part({ u: l / 2, v: sg * (W / 2 + 0.6), y: y + 1.9, w: 1.2, l, h: 5.4, look: 'rail', noCam: true });
        let lastWy = 0;
        for (let i = 0; i < n; i++) {
            const u = 30 + i * gapU, wy = i === 0 && d < 0.1 ? 0.6 : lerp(1.5, 9, d) * (0.6 + R() * 0.5), ww = lerp(13, 8.6, d), wh = lerp(9, 6.6, d), wv = (R() - 0.5) * Math.max(0, W - ww - 2), T = 3, out = 9, H = wy + wh + 12;
            const L0 = -W / 2 - out, L1 = wv - ww / 2, R0 = wv + ww / 2, R1 = W / 2 + out;
            b.part({ u, v: (L0 + L1) / 2, y: y + H, w: L1 - L0, l: T, h: H + 4, look: 'frame', tone: i });
            b.part({ u, v: (R0 + R1) / 2, y: y + H, w: R1 - R0, l: T, h: H + 4, look: 'frame', tone: i });
            b.part({ u, v: wv, y: y + H, w: ww, l: T, h: H - wy - wh, look: 'frame', tone: i });
            if (wy > 0.7) b.part({ u, v: wv, y: y + wy, w: ww, l: T, h: wy + 4, look: 'frame', tone: i });
            b.deco({ kind: 'window', u, v: wv, y: y + wy, w: ww, h: wh });
            // (aim the car's floor at the middle of the window's free height)
            const cy = y + wy + (wh - PH) / 2;
            b.fly(u - 12, wv, cy - 1.1, cy + 0.9, 40);
            b.fly(u + 5, wv, cy - 1.1, cy + 0.9, 40);
            // (down onto the road again between windows: the tank fills)
            b.drive(u + 30, 0, y);
            lastWy = wy;
        }
        void lastWy;
        b.drive(l - 2, 0, y);
        b.adv(l);
    },
    // across the rooftops of the towers: drive each roof, jet over the gaps between
    towers(b, d) {
        const R = b.R, n = 2 + Math.round(dn(d)), W = lerp(24, 16, d);
        b.road(40);
        let cu = 0, y = b.y, cv = 0;
        for (let i = 0; i < n; i++) {
            const gap = lerp(16, 46, dn(d) / 1.3) * (0.85 + R() * 0.3), dy = (R() - 0.45 + b.bias * 0.3) * lerp(5, 16, d), len = lerp(46, 32, d), nv = clamp(cv + (R() - 0.5) * lerp(0, 14, d), -10, 10), y2 = y + dy;
            const u = cu + gap + len / 2;
            b.part({ u, v: nv, y: y2, w: W, l: len, h: y2 - GROUND_Y, look: 'tower', tone: i + b.stage, noCam: false, deep: 1 });
            if (dy > 1.5) b.fly(cu + gap * 0.55, (cv + nv) / 2, y2 + 3); else b.drive(cu + gap + 6, nv, y2);
            b.drive(cu + gap + len - 4, nv, y2);
            cu += gap + len; y = y2; cv = nv;
        }
        // and back onto a road
        const gap = lerp(14, 30, d);
        b.drive(cu + gap + 6, 0, y);
        b.adv(cu + gap); b.y = y;
        b.road(30);
    },
    // concrete blocks, one side and then the other: weave between them
    slalom(b, d) {
        const n = 3 + Math.round(dn(d) * 1.5), W = b.W + 6, S = 50, l = 40 + (n - 1) * S + 30, bw = W * lerp(0.48, 0.6, d), y = b.y, lane = W - bw;
        b.part({ u: l / 2, y, w: W, l, h: 3.5, look: 'road' });
        for (const sg of [-1, 1]) b.part({ u: l / 2, v: sg * (W / 2 + 0.6), y: y + 1.9, w: 1.2, l, h: 5.4, look: 'rail', noCam: true });
        for (let i = 0; i < n; i++) {
            const u = 40 + i * S, side = i % 2 ? 1 : -1, bv = side * (W / 2 - bw / 2), fv = -side * (W / 2 - lane / 2);
            b.part({ u, v: bv, y: y + 3.4, w: bw, l: 3, h: 3.4, look: 'barrier', tone: i });
            b.drive(u - 2, fv, y, lerp(46, 40, d));
        }
        b.drive(l - 2, 0, y);
        b.adv(l);
    },
    // trucks shuttling across the road: jet over them (or time it)
    traffic(b, d) {
        const n = 2 + Math.round(dn(d)), W = b.W + 4, gapU = 56, l = 30 + n * gapU, y = b.y, P = d > 1 ? 4 : d > 0.5 ? 5 : 6;
        b.part({ u: l / 2, y, w: W, l, h: 3.5, look: 'road', tone: 1 });
        for (let i = 0; i < n; i++) {
            const u = 26 + i * gapU, A = W / 2 - 1;
            b.part({ u, v: 0, y: y + 6, w: 11, l: 4.6, h: 6, look: 'truck', tone: i, knock: 1, noCam: true, noFloor: true, mv: { k: MK.SLIDE, v: A, P, ph: i * 0.37 } });
            b.fly(u - 12, 0, y + 7.4, y + 11, 46);
            b.fly(u + 5, 0, y + 7, y + 11, 46);
            b.drive(u + 24, 0, y);
        }
        b.deco({ kind: 'trafficLights', u: 10, v: W / 2 + 2, y });
        b.drive(l - 2, 0, y);
        b.adv(l);
    },
    // a narrow bridge with no walls, zigzagging
    narrow(b, d) {
        const n = 2 + Math.round(dn(d)), w = lerp(10, 6.2, dn(d) / 1.3), segL = 44, ang = lerp(0.2, 0.36, d);
        b.road(34);
        let cu = 0, cv = 0;
        const y = b.y, sp = lerp(44, 34, d);
        b.part({ u: 0, v: 0, y, w: w + 2, l: w + 2, h: 3, look: 'bridge' });
        for (let i = 0; i < n; i++) {
            const a = (i % 2 ? -1 : 1) * ang * (i === 0 ? 0.7 : 1), du = Math.cos(a) * segL, dv = Math.sin(a) * segL;
            b.part({ u: cu + du / 2, v: cv + dv / 2, y, w, l: segL + 1, h: 2.6, rot: a, look: 'bridge', tone: i });
            cu += du; cv += dv;
            b.part({ u: cu, v: cv, y, w: w + 0.6, l: w + 0.6, h: 2.6, look: 'bridge', tone: i + 1 });
            b.drive(cu, cv, y, sp);
        }
        // back to the middle
        const du = 30;
        b.part({ u: cu + du / 2, v: cv / 2, y, w: Math.abs(cv) + w, l: du, h: 2.6, look: 'bridge', tone: 0 });
        b.drive(cu + du - 2, 0, y, sp);
        b.adv(cu + du);
    },
    // gates of laser light, on and off: drive through while they're off
    lasers(b, d) {
        const n = 2 + Math.round(dn(d) * 1.5), W = b.W, gapU = 32, l = 22 + n * gapU, y = b.y, P = d > 1.05 ? 2.4 : d > 0.6 ? 3 : 4, duty = lerp(0.36, 0.55, d);
        b.part({ u: l / 2, y, w: W, l, h: 3.5, look: 'road', tone: 1 });
        for (const sg of [-1, 1]) b.part({ u: l / 2, v: sg * (W / 2 + 0.6), y: y + 1.9, w: 1.2, l, h: 5.4, look: 'rail', noCam: true });
        for (let i = 0; i < n; i++) {
            const u = 20 + i * gapU, H = 34;
            b.part({ u, y: y + H, w: W + 1, l: 1, h: H, look: 'laser', lethal: 1, noCam: true, noFloor: true, mv: { k: MK.BLINK, P, ph: i * 0.29, duty } });
            for (const sg of [-1, 1]) b.part({ u, v: sg * (W / 2 + 2.2), y: y + H + 2, w: 3, l: 3, h: H + 6, look: 'pylon' });
            b.part({ u, y: y + H + 4, w: W + 7, l: 3, h: 2.4, look: 'pylon' });
            b.guard(u - 10, 0, u + 6, 0);
        }
        b.drive(l - 2, 0, y);
        b.adv(l);
    },
    // a broad disc with a bar sweeping round it: time it, or jet over the bar
    sweeper(b, d) {
        const rr = 24, two = d > 1.05, P = two ? 6 : d > 0.6 ? 5 : 6, u = rr + 6, dir = b.R() < 0.5 ? 1 : -1, y = b.y;
        b.road(30, { rails: false });
        b.part({ u, y, r: rr, h: 3.5, look: 'disc', tone: 1 });
        b.part({ u, y: y + 3.6, r: 2.6, h: 3.6, look: 'hub', tone: 0, noCam: true });
        b.part({ u, y: y + 3.2, w: 2, l: 2 * rr - 1, h: 3, look: 'bar', knock: 1, noCam: true, noFloor: true, mv: { k: MK.SPIN, P, dir } });
        if (two) b.part({ u, y: y + 3.2, rot: Math.PI / 2, w: 2, l: 2 * rr - 1, h: 3, look: 'bar', knock: 1, noCam: true, noFloor: true, mv: { k: MK.SPIN, P, dir } });
        b.part({ u: u + rr + 6, y, w: b.W, l: 14, h: 3.5, look: 'road' });
        b.drive(u - rr - 2, rr * 0.4, y, 40);
        b.fly(u - rr + 6, rr * 0.4, y + 6.5, y + 9.5, 40);
        b.fly(u + rr - 6, rr * 0.4, y + 6.5, y + 9.5, 40);
        b.drive(u + rr + 10, 0, y);
        b.adv(u + rr + 13);
    },
    // a speed pad, a steep ramp and a long, long jump down
    boostJump(b, d) {
        const gap = lerp(70, 118, dn(d) / 1.3), drop = lerp(5, 14, d) * (b.bias < -0.3 ? 1.5 : 1);
        b.road(30);
        b.part({ u: 10, y: b.y + 0.02, w: b.W - 2, l: 12, h: 0.4, look: 'boostPad', boost: 84 });
        b.road(36);
        b.ramp(28, 28 * 0.38);
        const land = b.y - drop;
        b.drive(gap + 10, 0, land);
        b.adv(gap); b.y = land;
        b.road(46);
    },
    // a long fast road down
    drop(b, d) {
        const len = 64, fall = lerp(14, 26, d) * (b.bias > 0.4 ? 0.5 : 1);
        b.road(30);
        b.road(len, { y1: b.y - fall, look: 'ramp' });
        b.road(36);
    },
    // a road that falls away behind you: keep your foot down
    crumble(b, d) {
        const n = 7 + Math.round(dn(d) * 3), S = 13, W = b.W, vw = 78, P = 6, duty = 0.66, y = b.y, parts = [];
        b.road(60);
        for (let i = 0; i < n; i++) {
            const u = (i + 0.5) * S, ph = fract(-u / (vw * P));
            parts.push(b.part({ u, y, w: W, l: S - 0.3, h: 2.6, look: 'crumble', tone: i, mv: { k: MK.BLINK, P, ph, duty } }));
        }
        // (the pilot waits back on the solid road, so it's flat out by the first stone)
        b.c.route.splice(b.c.route.length - 1, 0, { k: 'w', x: b.wx(-46, 0), z: b.wz(-46, 0), y, parts: parts.map((p) => p.id), dist: 46, S });
        b.drive(n * S + 6, 0, y);
        b.part({ u: n * S + 10, y, w: W, l: 20, h: 3.5, look: 'road' });
        b.adv(n * S + 20);
    },
    // two great walls with a slot between them: thread it
    corridor(b, d) {
        const gap = lerp(56, 92, dn(d) / 1.3), slot = lerp(17, 10.5, dn(d) / 1.3), sv = (b.R() - 0.5) * lerp(0, 16, d), y = b.y, H = 60, T = 10, dh = b.bias * lerp(2, 6, d);
        b.road(64);
        const u = gap * 0.5;
        for (const sg of [-1, 1]) b.part({ u, v: sv + sg * (slot / 2 + 30), y: y + H, w: 60, l: T, h: H * 2.2, look: 'wall', tone: sg > 0 ? 1 : 0 });
        b.fly(u - 16, sv, y + 4, y + 14, 44);
        b.fly(u + 8, sv, y + 3, y + 14, 44);
        b.drive(gap + 8, 0, y + dh);
        b.adv(gap); b.y = y + dh;
        b.road(40);
    },
    // a slippery road with bends: easy on the throttle
    ice(b, d) {
        const n = 2 + Math.round(dn(d)), w = lerp(18, 13, d), segL = 50, ang = lerp(0.22, 0.38, d), y = b.y, sp = lerp(40, 32, d);
        b.road(30);
        let cu = 0, cv = 0;
        b.part({ u: 0, y, w: w + 2, l: w + 2, h: 3, look: 'iceRoad', ice: 1 });
        for (let i = 0; i < n; i++) {
            const a = (i % 2 ? -1 : 1) * ang * (i === 0 ? 0.7 : 1), du = Math.cos(a) * segL, dv = Math.sin(a) * segL;
            b.part({ u: cu + du / 2, v: cv + dv / 2, y, w, l: segL + 1, h: 3, rot: a, look: 'iceRoad', ice: 1, tone: i });
            for (const sg of [-1, 1]) b.part({ u: cu + du / 2 + Math.sin(a) * -sg * (w / 2 + 0.6), v: cv + dv / 2 + Math.cos(a) * sg * (w / 2 + 0.6), y: y + 1.9, w: 1.2, l: segL - 2, h: 5.4, rot: a, look: 'rail', noCam: true });
            cu += du; cv += dv;
            b.part({ u: cu, v: cv, y, w: w + 0.6, l: w + 0.6, h: 3, look: 'iceRoad', ice: 1 });
            b.drive(cu, cv, y, sp);
        }
        const du = 30;
        b.part({ u: cu + du / 2, v: cv / 2, y, w: Math.abs(cv) + w, l: du, h: 3, look: 'iceRoad', ice: 1 });
        b.drive(cu + du - 2, 0, y, sp);
        b.adv(cu + du);
    },
    // the big one: a speed pad, a towering ramp and a drop to a road far below (lots of air)
    bigAir(b, d) {
        const gap = lerp(92, 132, dn(d) / 1.3), drop = lerp(18, 30, d);
        b.road(36);
        b.part({ u: 10, y: b.y + 0.02, w: b.W - 2, l: 12, h: 0.4, look: 'boostPad', boost: 88 });
        b.road(40);
        b.ramp(34, 34 * 0.46);
        const land = b.y - drop;
        b.deco({ kind: 'billboard', u: 30, v: b.W / 2 + 14, y: land, text: 'BIG AIR!', sub: 'Coins for every second off the road', rot: -Math.PI / 2 });
        b.drive(gap + 12, 0, land);
        b.adv(gap); b.y = land;
        b.road(52);
    },
};

// which obstacles each world has, in the order you meet them; a list inside the list is a gauntlet (a world's last stage)
const LISTS = {
    city: ['ramp', 'gapUp', 'slalom', 'rings', 'ramp', 'frames', 'towers', 'drop', 'traffic', 'rings', 'boostJump', 'frames', 'gapUp', 'towers', 'narrow', 'bigAir', 'rings', 'slalom', 'frames', 'towers', 'traffic', 'corridor', 'rings', 'boostJump', ['frames', 'rings', 'towers']],
    mesa: ['boostJump', 'narrow', 'gapUp', 'crumble', 'rings', 'towers', 'corridor', 'ramp', 'narrow', 'frames', 'crumble', 'bigAir', 'gapUp', 'rings', 'narrow', 'traffic', 'towers', 'crumble', 'corridor', 'frames', 'boostJump', 'rings', 'narrow', 'bigAir', ['crumble', 'narrow', 'rings']],
    neon: ['lasers', 'frames', 'traffic', 'rings', 'sweeper', 'corridor', 'lasers', 'towers', 'crumble', 'frames', 'traffic', 'bigAir', 'lasers', 'sweeper', 'rings', 'narrow', 'frames', 'corridor', 'lasers', 'towers', 'traffic', 'sweeper', 'rings', 'boostJump', ['lasers', 'frames', 'traffic']],
    glacier: ['ice', 'rings', 'narrow', 'crumble', 'frames', 'towers', 'ice', 'gapUp', 'sweeper', 'corridor', 'ice', 'bigAir', 'rings', 'lasers', 'narrow', 'crumble', 'ice', 'frames', 'towers', 'traffic', 'ice', 'corridor', 'rings', 'boostJump', ['ice', 'rings', 'frames', 'towers']],
};
export const OBSTACLES = Object.keys(OB);
// a stage's obstacle, or a gauntlet of them
function buildStage(b, kind, d, nextChunk) {
    b.W = lerp(18, 12.5, dn(d) / 1.3);
    if (!Array.isArray(kind)) { OB[kind](b, d); return; }
    kind.forEach((k, j) => { if (j) b.chunk = nextChunk(); OB[k](b, d); });
}
// the height the run likes to be at, stage by stage: climbing slowly into the sky
const wantY = (i) => 8 + i * 1.3;

// a course's scenery along the way: billboards and arches, none of them in the way
function dressStage(b, kind, i, R) {
    const side = i % 2 ? 1 : -1;
    if (i % 4 === 1) b.deco({ kind: 'lamp', u: 14, v: side * (b.W / 2 + 3), y: b.y });
    if (i % 4 === 3) b.deco({ kind: 'lamp', u: 14, v: -side * (b.W / 2 + 3), y: b.y });
    if (R() < 0.35) b.deco({ kind: 'arrowSign', u: 30, v: side * (b.W / 2 + 6), y: b.y, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
    void kind;
}

// ----- the long run -----
function buildMain() {
    const c = new Course('main', 0);
    c.main = true;
    const b = new Builder(c, 51177, 0), R = rngFrom(8842);
    // the Garage Deck: one great rooftop to drive about on; what stands on it is drawn by hub.js
    b.x = 0; b.z = 0; b.y = 0;
    b.part({ u: HUB.z0 + HUB.l / 2, v: 0, y: 0, w: HUB.w, l: HUB.l, h: 10, look: 'hub_ground', noCam: true });
    // the deck's edge walls (a gap where the road leaves)
    const z1 = HUB.z0 + HUB.l;
    for (const sg of [-1, 1]) b.part({ u: HUB.z0 + HUB.l / 2, v: sg * (HUB.w / 2 + 0.8), y: 2.2, w: 1.6, l: HUB.l, h: 6, look: 'solid' });
    b.part({ u: HUB.z0 - 0.8, v: 0, y: 2.2, w: HUB.w, l: 1.6, h: 6, look: 'solid' });
    for (const sg of [-1, 1]) b.part({ u: z1 + 0.8, v: sg * (HUB.w / 4 + 6), y: 2.2, w: HUB.w / 2 - 12, l: 1.6, h: 6, look: 'solid' });
    // the stalls: drive up to them (hub.js draws them)
    for (const k of ['cars', 'paint', 'crates', 'ups']) b.part({ u: HUB[k].z, v: HUB[k].x + Math.sign(HUB[k].x) * 12, y: 9, w: 10, l: 18, h: 9, look: 'solid' });
    // the show cars' turntables, beside each stall
    for (const k of ['cars', 'paint', 'crates', 'ups']) b.part({ u: HUB[k].z - SHOW_DZ, v: HUB[k].x, y: 2.6, r: 5.6, h: 3, look: 'solid' });
    c.start = { x: HUB.spawn.x, y: 0, z: HUB.spawn.z, ry: 0, fx: 0, fz: 1, rx: 1, rz: 0 };
    c.route.push({ k: 'd', x: 0, z: HUB.gate.z - 20, y: 0, v: 0 });
    b.x = 0; b.z = z1; b.y = 0;
    b.road(26, { w: 22 });
    // the turns: three stages on, three across, three on, three back: a long staircase that never meets itself
    const TURNS = [0, 0, 1, 0, 0, -1, 0, 0, -1, 0, 0, 1];
    let ck = 0;
    const nextChunk = () => ++ck;
    for (let i = 0; i < STAGES; i++) {
        const w = worldOfStage(i), list = LISTS[WORLDS[w].id];
        b.world = w; b.chunk = nextChunk(); b.stage = i;
        const turn = TURNS[i % TURNS.length], kind = list[i % list.length], d = stageD(i);
        if (i && i % STAGES_PER_WORLD === 0) { // a world's gate
            b.deco({ kind: 'worldGate', u: 2, v: 0, y: b.y, w: 34, world: w });
            c.signs.push({ text: WORLDS[w].name, world: w, x: b.wx(2, 0), y: b.y + 27, z: b.wz(2, 0), size: 26 });
        }
        b.pad(i, turn, Array.isArray(kind)).kind = String(kind);
        // which way it should drift: up if it's sunk below where the run wants to be, down if it's floated above
        b.bias = clamp((wantY(i + 1) - b.y) / 26, -1, 1);
        dressStage(b, kind, i, R);
        buildStage(b, kind, d, nextChunk);
        // a key, floating high over every third stage's road (fly up for it)
        if (i % 3 === 1) { const back = 18, ky = b.y + 15; b.key(-back, (R() - 0.5) * 6, ky); }
        if (i === 0) c.signs.push({ text: 'DRIVE, THEN FLY!', world: 0, x: c.cps[0].x, y: c.cps[0].y + 16, z: c.cps[0].z + 34, size: 16 });
    }
    // the end: the Getaway Tower's helipad
    b.chunk = nextChunk(); b.world = WORLDS.length - 1;
    b.road(30);
    b.part({ u: 30, y: b.y, r: 30, h: 8, look: 'summit' });
    const fx = b.wx(30, 0), fz = b.wz(30, 0), last = c.cps[c.cps.length - 1];
    b.drive(30, 0, b.y, 20);
    c.finish = { x: fx, y: b.y, z: fz, r: 12, s: last.s + Math.hypot(fx - last.x, fz - last.z) };
    b.deco({ kind: 'trophy', u: 30, v: 0, y: b.y, s: 1 });
    // Stage 1's pad: two slanted rails from the wide deck road (22) in to the course road (16), so a car coming down it off-centre slides
    // in instead of meeting a rail end head-on. Added last so every other part keeps its id
    b.x = 0; b.z = z1 + 26; b.y = 0; b.turnTo(0); b.chunk = 1; b.world = 0;
    const fa = Math.atan2(3, 24);
    for (const sg of [-1, 1]) b.part({ u: 12, v: sg * 10.1, y: 1.9, w: 1.2, l: Math.hypot(3, 24), h: 5.4, rot: -sg * fa, look: 'rail', noCam: true });
    c.chunks = ck + 1;
    c.index();
    return c;
}

// ----- a Police Chase map: a world's obstacles, as long and as hard as the tier -----
function buildRace(world, tier) {
    const T = CHASE_TIERS[tier], c = new Course('r' + world + '.' + tier, world), b = new Builder(c, 7301 + world * 97 + tier * 13, world), R = rngFrom(9100 + world * 31 + tier);
    // the start: a wide deck for six cars, and a stretch of road behind it for the cops
    b.x = 0; b.z = 0; b.y = 40; b.chunk = 0;
    b.part({ u: -40, y: 40, w: 22, l: 60, h: 4, look: 'road', tone: 1 });
    b.part({ u: 0, y: 40, w: 34, l: 40, h: 4, look: 'startDeck' });
    c.start = { x: 0, y: 40, z: 6, ry: 0, fx: 0, fz: 1, rx: 1, rz: 0 };
    c.route.push({ k: 'd', x: 0, z: 18, y: 40, v: 0 });
    c.barrierZ = 14;
    b.adv(20);
    b.road(30, { w: 24 });
    const list = LISTS[WORLDS[world].id].filter((k) => !Array.isArray(k)), TURNS = [0, 1, 0, -1, 0, -1, 0, 1];
    let ck = 0;
    const nextChunk = () => ++ck;
    for (let i = 0; i < T.stages; i++) {
        b.chunk = nextChunk(); b.stage = i;
        const turn = TURNS[i % TURNS.length], kind = list[(i * 3 + tier * 2 + 1) % list.length];
        b.pad(i, turn);
        b.bias = clamp((40 + i - b.y) / 26, -1, 1);
        dressStage(b, kind, i, R);
        buildStage(b, kind, T.d + i / T.stages * 0.12, nextChunk);
    }
    b.chunk = nextChunk();
    b.road(30);
    b.part({ u: 24, y: b.y, w: 40, l: 48, h: 6, look: 'safehouse' });
    const fx = b.wx(24, 0), fz = b.wz(24, 0), last = c.cps[c.cps.length - 1];
    b.drive(24, 0, b.y, 24);
    c.finish = { x: fx, y: b.y, z: fz, r: 16, s: last.s + Math.hypot(fx - last.x, fz - last.z) };
    b.deco({ kind: 'safehouse', u: 24, v: 0, y: b.y });
    c.chunks = ck + 1;
    c.index();
    return c;
}

// the courses are built once on each side, on the first asking
const cache = new Map();
export function mainCourse() { let c = cache.get('main'); if (!c) { c = buildMain(); cache.set('main', c); } return c; }
export function raceCourse(world, tier) {
    const k = world + '.' + tier;
    let c = cache.get(k);
    if (!c) { c = buildRace(world, tier); cache.set(k, c); }
    return c;
}
// a server's own copy for a live match: the same parts, its own clock
export function freshRace(world, tier) { return buildRace(world, tier); }
