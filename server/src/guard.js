// Your own car runs on your device; the server checks every move against what's possible: how far you could have driven (a budget earned
// by time at your car's top speed with the nitro on, spent by moving), how high you could have got above the last road you were on (a
// ramp's launch plus a full tank of jets climbing flat out), and whether there's road under you when you say you're on it. Impossible
// moves are refused and you're put back.
import { CFG, statsOf, diffOf } from '../../shared/config.js';
import { GROUND_Y } from '../../shared/course.js';

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export function initGuard(s, x, y, z, now) {
    s.last = { x, y, z }; s.lastAt = now; s.moveB = 20; s.win = { t: now, d: 0 }; s.airBase = y; s.strikes = 0; s.homeAt = now;
}
// just sent somewhere: the moves still on their way from where you were are dropped until you've arrived there
export function sendTo(s, x, y, z, now) { s.last = { x, y, z }; s.lastAt = now; s.airBase = y; s.homeAt = now; s.moveB = 20; s.strikes = 0; s.win = { t: now, d: 0 }; }

// the highest a car could get above the last road it was on: off the lip of a steep ramp, then the whole tank climbing
export function reachOf(p) {
    const st = statsOf(p), burn = CFG.burn * diffOf(p.diff).burn;
    return 48 * 48 / (2 * CFG.grav) + CFG.climbMax * st.jet * (st.tank / burn) + 8;
}
// returns null when the move is fine, else why not. c: the course
export function checkMove(s, c, m, now) {
    if (!finite(m.x) || !finite(m.y) || !finite(m.z)) return 'bad';
    const L = s.last, p = s.profile, dt = Math.max(0, (now - s.lastAt) / 1000), dist = Math.hypot(m.x - L.x, m.z - L.z);
    s.lastAt = now;
    // top speed with the nitro on (or a speed pad), with a little give
    const st = statsOf(p), top = Math.max(st.top * CFG.boostK, 92) * 1.18 + 10;
    s.moveB = Math.min((s.moveB ?? top) + dt * top, top * 1.4 + 12);
    if (dist > s.moveB) return 'far';
    s.moveB -= dist;
    // over a few seconds it has to average out at about top speed
    s.win.d += dist;
    if (now - s.win.t > 5000) {
        const avg = s.win.d / ((now - s.win.t) / 1000);
        s.win.t = now; s.win.d = 0;
        if (avg > st.top * 1.3 + 12) return 'speed';
    }
    if (m.y < GROUND_Y - 30) return 'deep';
    // how high: from the last road you were on
    const grounded = m.a === 0 || m.a === 1;
    if (m.y - s.airBase > reachOf(p)) return 'high';
    const gb = c.groundBelow(m.x, m.y + 0.5, m.z, 1.5, true);
    // right over some road: that's your new base
    if (gb > -Infinity && m.y - gb <= 4) s.airBase = gb;
    if (grounded) {
        // on the road, with no road there?
        if (m.y - gb > 4 || gb === -Infinity) { if (++s.strikes >= 6) { s.strikes = 0; return 'air'; } } else s.strikes = 0;
    }
    return null;
}
