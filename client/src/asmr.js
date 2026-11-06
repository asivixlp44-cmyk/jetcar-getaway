// The game's little sounds, synthesised sample by sample (no files) into short buffers once while the game loads: a footstep for
// every kind of ground, jumps and landings, a thump when something knocks you, a splash, a sizzle, the coin's bling. Playing one
// is a buffer source and a gain (and a pan for someone else's); nothing is built note by note while playing.
const SR = 44100;
const rnd = (a, b) => a + Math.random() * (b - a);
let seed = 12345;
const noiseV = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };

// ----- little DSP kit (in place on Float32Arrays) -----
const buf = (secs) => new Float32Array(Math.max(1, Math.round(secs * SR)));
function biquad(x, type, f, q) {
    const w = 2 * Math.PI * Math.min(f, SR * 0.45) / SR, cs = Math.cos(w), al = Math.sin(w) / (2 * (q || 0.707));
    let b0, b1, b2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; } else { b0 = al; b1 = 0; b2 = -al; }
    const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let i = 0; i < x.length; i++) { const v = x[i], y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
    return x;
}
function addNoise(x, at, len, amp, env, filt) {
    const n = buf(len);
    for (let i = 0; i < n.length; i++) n[i] = noiseV();
    if (filt) for (const f of filt) biquad(n, f[0], f[1], f[2]);
    const i0 = Math.round(at * SR);
    for (let i = 0; i < n.length && i0 + i < x.length; i++) x[i0 + i] += n[i] * amp * env(i / SR, len);
}
// a sine whose frequency follows f(t), amplitude env(t)
function addTone(x, at, len, f, amp, env) {
    const i0 = Math.round(at * SR);
    let ph = 0;
    for (let i = 0; i < len * SR && i0 + i < x.length; i++) { const t = i / SR; ph += 2 * Math.PI * f(t) / SR; x[i0 + i] += Math.sin(ph) * amp * env(t, len); }
}
const dec = (k, a) => (t) => (a && t < a ? t / a : 1) * Math.exp(-(t - (a && t > a ? a : 0)) * k);
function norm(x, peak) {
    let m = 0;
    for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
    const k = m > 0 ? peak / m : 0;
    // a short fade at the end (no click)
    const f = Math.min(x.length, 220);
    for (let i = 0; i < x.length; i++) x[i] *= k * (i > x.length - f ? (x.length - i) / f : 1);
    return x;
}
const MAKE = {
    // footsteps, by the ground under you
    grass() { const x = buf(0.11), p = rnd(0.85, 1.2); addNoise(x, 0, 0.09, 0.8, dec(45, 0.004), [['bp', 2600 * p, 0.7], ['hp', 900, 0.7]]); addNoise(x, 0, 0.05, 0.5, dec(70, 0.002), [['lp', 500 * p, 0.8]]); return norm(x, 0.3); },
    stone() { const x = buf(0.09), p = rnd(0.88, 1.15); addNoise(x, 0, 0.012, 1, dec(280), [['bp', 2200 * p, 1.6]]); addTone(x, 0, 0.05, (t) => 150 * p * (1 - t * 3), 0.5, dec(70, 0.002)); return norm(x, 0.34); },
    wood() { const x = buf(0.11), p = rnd(0.9, 1.15); addTone(x, 0, 0.07, () => 240 * p, 0.8, dec(55, 0.001)); addTone(x, 0, 0.05, () => 480 * p, 0.25, dec(90, 0.001)); addNoise(x, 0, 0.01, 0.5, dec(340), [['bp', 1400 * p, 1.2]]); return norm(x, 0.36); },
    sand() { const x = buf(0.13), p = rnd(0.85, 1.2); addNoise(x, 0, 0.12, 1, (t) => (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 30)), [['hp', 2800 * p, 0.6]]); return norm(x, 0.2); },
    snow() { const x = buf(0.15), p = rnd(0.85, 1.2); addNoise(x, 0, 0.14, 1, (t) => (t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) * 22)) * (0.7 + 0.3 * Math.sin(t * 900)), [['bp', 3400 * p, 0.8]]); addNoise(x, 0, 0.04, 0.4, dec(90), [['lp', 400, 0.8]]); return norm(x, 0.28); },
    metal() { const x = buf(0.14), p = rnd(0.92, 1.1); addTone(x, 0, 0.12, () => 620 * p, 0.5, dec(34, 0.001)); addTone(x, 0, 0.1, () => 1490 * p, 0.3, dec(50, 0.001)); addNoise(x, 0, 0.012, 0.6, dec(300), [['hp', 2600, 0.8]]); return norm(x, 0.3); },
    ice() { const x = buf(0.1), p = rnd(0.95, 1.2); addNoise(x, 0, 0.012, 1, dec(380), [['hp', 3800 * p, 1.1]]); addTone(x, 0, 0.06, () => 2300 * p, 0.18, dec(80, 0.001)); return norm(x, 0.24); },
    // a landing
    land() { const x = buf(0.2), p = rnd(0.9, 1.1); addTone(x, 0, 0.14, (t) => 120 * p * (1 - t * 3.2), 1, dec(26, 0.002)); addNoise(x, 0, 0.09, 0.6, dec(46, 0.002), [['lp', 1200 * p, 0.8]]); return norm(x, 0.55); },
};
// the jump: a soft spring upwards
function makeJump(high) {
    const L = high ? 0.32 : 0.2, x = buf(L);
    addTone(x, 0, L, (t) => (high ? 420 : 300) * (1 + 1.1 * (1 - Math.exp(-t * 20))), 0.6, dec(high ? 11 : 17, 0.004));
    addNoise(x, 0, 0.05, 0.14, dec(70), [['bp', 2200, 1.3]]);
    return norm(x, 0.42);
}
// a bounce pad: a big springy boing
function makeBoing() {
    const L = 0.75, x = buf(L);
    addTone(x, 0, L, (t) => 150 * (1 + 1.4 * (1 - Math.exp(-t * 10))) * (1 + 0.08 * Math.sin(t * 2 * Math.PI * 15) * Math.exp(-t * 4)), 0.6, dec(5, 0.004));
    addTone(x, 0, L * 0.7, (t) => 320 * (1 + 0.9 * (1 - Math.exp(-t * 24))), 0.12, dec(8, 0.004));
    addNoise(x, 0, 0.04, 0.12, dec(80), [['bp', 1800, 1.5]]);
    return norm(x, 0.7);
}
// the coin's bling (played a little higher as they come in a row)
function makeCoin() {
    const x = buf(0.32);
    addTone(x, 0, 0.09, () => 1567, 0.45, dec(30, 0.002));
    addTone(x, 0.06, 0.26, () => 2093, 0.6, dec(14, 0.002));
    addTone(x, 0.06, 0.2, () => 4186, 0.14, dec(24, 0.002));
    return norm(x, 0.44);
}
function makeTick() {
    const x = buf(0.32);
    addTone(x, 0, 0.32, () => 1318.5, 0.6, dec(14, 0.002));
    addTone(x, 0, 0.18, () => 2637, 0.2, dec(26, 0.002));
    addTone(x, 0, 0.12, () => 3956, 0.08, dec(40, 0.002));
    return norm(x, 0.5);
}
// knocked flying
function makeThump() {
    const x = buf(0.32);
    addTone(x, 0, 0.26, (t) => 95 * (1 - t * 2), 1, dec(14, 0.002));
    addNoise(x, 0, 0.1, 0.8, dec(36, 0.001), [['lp', 2200, 0.8]]);
    addNoise(x, 0, 0.012, 0.6, dec(300), [['hp', 3000, 0.8]]);
    return norm(x, 0.72);
}
// into the sea
function makeSplash() {
    const x = buf(0.7);
    addNoise(x, 0, 0.65, 1, (t) => (t < 0.03 ? t / 0.03 : Math.exp(-(t - 0.03) * 7)), [['bp', 1500, 0.5]]);
    for (let k = 0; k < 7; k++) addTone(x, 0.05 + k * 0.07 + rnd(0, 0.04), 0.09, (t) => rnd(500, 800) * (1 + t * 12), 0.16, dec(40, 0.002));
    return norm(x, 0.6);
}
// into lava, or a jet of fire
function makeSizzle() {
    const x = buf(0.6);
    addNoise(x, 0, 0.58, 1, (t) => (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 6)), [['hp', 2400, 0.7]]);
    addNoise(x, 0, 0.3, 0.5, dec(10), [['lp', 500, 0.8]]);
    return norm(x, 0.5);
}
function makeWhoosh() {
    const x = buf(0.36);
    addNoise(x, 0, 0.34, 1, (t) => Math.sin(Math.min(1, t / 0.34) * Math.PI), [['bp', 1100, 0.9]]);
    return norm(x, 0.42);
}

// ----- the bank: made while loading (a few at a time, so the page stays responsive) -----
const VARIANTS = 4;
const bank = {};
export async function buildAsmr(pause) {
    const out = (k, f, n) => { bank[k] = []; for (let i = 0; i < n; i++) bank[k].push(f()); };
    for (const kind of Object.keys(MAKE)) {
        out(kind, () => MAKE[kind](), VARIANTS);
        if (pause) await pause();
    }
    out('jump', () => makeJump(false), 2); out('jump2', () => makeJump(true), 2); out('boing', makeBoing, 2);
    out('coin', makeCoin, 1); out('tick', makeTick, 1); out('thump', makeThump, 2); out('splash', makeSplash, 2); out('sizzle', makeSizzle, 2); out('whoosh', makeWhoosh, 2);
}
// the AudioBuffers (made once the audio context exists)
const ready = {};
export function asmrBuffer(ctx, key) {
    let list = ready[key];
    if (!list) {
        const raw = bank[key];
        if (!raw) return null;
        list = ready[key] = raw.map((a) => { const b = ctx.createBuffer(1, a.length, SR); b.copyToChannel(a, 0); return b; });
    }
    return list[Math.floor(Math.random() * list.length)];
}
export const asmrKinds = () => Object.keys(MAKE);
