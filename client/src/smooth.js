// Other players far away (300-400 ms round trip): the server's clock, corrected for the round trip, and
// every other player or bot drawn a little in the past on that clock, between two of their snapshots.
// A snapshot carries the server time it was taken (the mover's own clock, corrected). How far in the past
// each mover is drawn follows how late their own snapshots arrive: a bot's come straight from the server,
// a player's have crossed the world twice.
import { net } from './state.js';

// ----- the clock: ping the server; the answers with the shortest round trip are the most exact -----
const samples = [];
let pingN = 0;
export function pingSend() { net.send('ping', { c: Date.now() }); pingN++; }
export function onPong(m) {
    const now = Date.now(), rtt = now - m.c;
    if (rtt < 0 || rtt > 10000) return;
    samples.push({ rtt, off: m.s + rtt / 2 - now });
    if (samples.length > 12) samples.shift();
    // the best few samples, averaged
    const best = samples.slice().sort((a, b) => a.rtt - b.rtt).slice(0, 3);
    const off = best.reduce((a, s) => a + s.off, 0) / best.length;
    // the first estimate jumps; later ones glide (no visible hop in the timers)
    net.offset = pingN <= 2 ? off : net.offset + (off - net.offset) * 0.3;
    net.rtt = best[0].rtt;
}
// how often to ping: quickly at first, then every few seconds
export const pingEvery = () => (pingN < 6 ? 0.6 : 3);

// ----- one mover's snapshots -----
const KEEP = 24, NEED = 32;
let typical = 220; // where a new mover's delay starts: what the last one worked out
export class Track {
    constructor() {
        this.q = []; this.lt = -1;
        this.need = new Float32Array(NEED); this.needN = 0; this.want = typical; this.delay = typical; this.settled = false;
        this.wasLate = false; this.dx = 0; this.dy = 0; this.dz = 0; this.ox = 0; this.oy = 0; this.oz = 0;
    }
    add(t, x, y, z, ry, a) {
        const q = this.q, s = q.length >= KEEP ? q.shift() : {};
        s.t = t; s.x = x; s.y = y; s.z = z; s.ry = ry; s.a = a;
        q.push(s);
    }
    // a snapshot (server time t); returns true when it was new
    push(t, x, y, z, ry, a) {
        if (t <= this.lt) return false;
        const q = this.q, last = q[q.length - 1], prev = q[q.length - 2];
        // how late it arrived counts only while they keep moving: the first snapshot, or one after they stood
        // still a while, carries an old stamp that says nothing about the network
        if (this.lt > 0 && t - this.lt < 400) this.noteNeed(net.now() - this.lt);
        // they stood still and now they're off: they stood until just now, not sliding slowly all through the pause
        if (prev && t - last.t > 150 && last.x === prev.x && last.y === prev.y && last.z === prev.z) this.add(t - 70, last.x, last.y, last.z, last.ry, last.a);
        this.lt = t;
        this.add(t, x, y, z, ry, a);
        return true;
    }
    // this snapshot is needed the moment the drawing reaches the one before it: its arrival, less that one's stamp.
    // The third worst of the last few (about the slowest tenth), plus a margin
    noteNeed(ms) {
        const l = this.need;
        l[this.needN++ % NEED] = ms;
        const n = Math.min(this.needN, NEED);
        if (n < 6) return;
        let w1 = 0, w2 = 0, w3 = 0;
        for (let i = 0; i < n; i++) { const v = l[i]; if (v > w1) { w3 = w2; w2 = w1; w1 = v; } else if (v > w2) { w3 = w2; w2 = v; } else if (v > w3) w3 = v; }
        this.want = typical = Math.min(800, Math.max(90, w3 + 20));
        if (!this.settled) { this.settled = true; this.delay = this.want; }
    }
    // how far in the past to draw them: it glides (a step here would be a step in their walk), further back quicker than forward
    delayFor(dt) {
        const d = this.want - this.delay, most = dt * (d > 0 ? 160 : 50);
        this.delay += d > most ? most : d < -most ? -most : d;
        return this.delay;
    }
    // where it was at server time rt (out: { x, y, z, ry, a, speed }); true when that's past the last snapshot
    place(rt, out) {
        const q = this.q;
        let a = q[0], b = q[q.length - 1];
        if (rt >= b.t) {
            // late: carry on along the last movement for a moment, then stop
            const p = q.length > 1 ? q[q.length - 2] : b, dt = Math.max(1, b.t - p.t), ex = Math.min(rt - b.t, 220) / dt;
            out.x = b.x + (b.x - p.x) * ex; out.y = b.y; out.z = b.z + (b.z - p.z) * ex; out.ry = b.ry; out.a = b.a;
            out.speed = Math.hypot(b.x - p.x, b.z - p.z) / dt * 1000 * (rt - b.t < 220 ? 1 : 0);
            return true;
        }
        if (rt <= a.t) { out.x = a.x; out.y = a.y; out.z = a.z; out.ry = a.ry; out.a = a.a; out.speed = 0; return false; }
        for (let i = q.length - 1; i > 0; i--) if (q[i - 1].t <= rt) { a = q[i - 1]; b = q[i]; break; }
        const k = (rt - a.t) / Math.max(1, b.t - a.t);
        if ((b.x - a.x) ** 2 + (b.z - a.z) ** 2 > 900) { out.x = b.x; out.y = b.y; out.z = b.z; out.ry = b.ry; }
        else {
            out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k;
            let d = b.ry - a.ry;
            while (d > Math.PI) d -= Math.PI * 2;
            while (d < -Math.PI) d += Math.PI * 2;
            out.ry = a.ry + d * k;
        }
        out.a = k < 0.5 ? a.a : b.a;
        out.speed = Math.hypot(b.x - a.x, b.z - a.z) / Math.max(1, b.t - a.t) * 1000;
        return false;
    }
    sample(rt, out, dt) {
        if (!this.q.length) return false;
        const late = this.place(rt, out);
        // it ran on past its last snapshot and the next one says otherwise: no jump, the difference fades (a teleport just happens)
        if (this.wasLate && !late) { this.ox = this.dx - out.x; this.oy = this.dy - out.y; this.oz = this.dz - out.z; if (this.ox ** 2 + this.oz ** 2 > 400) this.ox = this.oy = this.oz = 0; }
        this.wasLate = late;
        if (this.ox || this.oy || this.oz) {
            const k = Math.max(0, 1 - dt * 10);
            this.ox *= k; this.oy *= k; this.oz *= k;
            if (this.ox ** 2 + this.oy ** 2 + this.oz ** 2 < 1e-4) this.ox = this.oy = this.oz = 0;
            out.x += this.ox; out.y += this.oy; out.z += this.oz;
        }
        this.dx = out.x; this.dy = out.y; this.dz = out.z;
        return true;
    }
    reset() { this.q.length = 0; this.lt = -1; this.needN = 0; this.settled = false; this.wasLate = false; this.ox = this.oy = this.oz = 0; }
}
