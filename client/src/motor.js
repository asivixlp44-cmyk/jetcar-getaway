// The motor sounds: your engine (its pitch follows your speed, a growl on the throttle), the jets' roar while you FLY, the wind at speed,
// and the police sirens getting louder as the cops close in. Each is one loop synthesised sample by sample at load and played as one
// looping buffer source; every frame only its rate and volume move (smoothly, on the audio clock). Nothing is built while playing.
import { audioCtx, asmrOut } from './audio.js';

const SR = 22050;
let seed = 777;
const nz = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2147483648 - 1; };
// a loop of exactly n samples (its end meets its start)
function engineLoop() {
    // a four-cylinder burble: a 55 Hz fundamental with its harmonics, a little roughness on each firing
    const n = SR, x = new Float32Array(n), f = 55;
    for (let i = 0; i < n; i++) {
        const t = i / SR, ph = 2 * Math.PI * f * t;
        let v = Math.sin(ph) * 0.5 + Math.sin(ph * 2) * 0.32 + Math.sin(ph * 3 + 0.4) * 0.2 + Math.sin(ph * 4 + 1.1) * 0.12 + Math.sin(ph * 6) * 0.06;
        const fire = Math.pow(Math.max(0, Math.sin(ph * 2)), 6);
        v += fire * 0.25 + nz() * 0.05 * (0.4 + fire);
        x[i] = v;
    }
    return x;
}
function noiseLoop(lp, hp, wob) {
    const n = SR * 2, x = new Float32Array(n);
    let a = 0, b = 0, lo = 0;
    for (let i = 0; i < n; i++) { const w = nz(); a += (w - a) * lp; b += (a - b) * lp; lo += (b - lo) * hp; x[i] = (b - lo) * (1 + wob * Math.sin(i / SR * Math.PI * 2 * 3)); }
    // the loop's seam: cross-faded
    const F = 800;
    for (let i = 0; i < F; i++) { const k = i / F; x[i] = x[i] * k + x[n - F + i] * (1 - k); }
    return x.subarray(0, n - F);
}
function sirenLoop() {
    // a wail between two notes, a second a cycle
    const n = SR, x = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) { const t = i / SR, f = 760 + 380 * (0.5 - 0.5 * Math.cos(t * Math.PI * 2)); ph += 2 * Math.PI * f / SR; x[i] = Math.sin(ph) * 0.6 + Math.sin(ph * 2) * 0.15 + (Math.sin(ph) > 0 ? 0.1 : -0.1); }
    return x;
}
function norm(x, peak) { let m = 0; for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); const k = m ? peak / m : 0; for (let i = 0; i < x.length; i++) x[i] *= k; return x; }

let loops = null, built = false;
export function buildMotor() {
    if (built) return;
    built = true;
    loops = { engine: norm(engineLoop(), 0.9), jet: norm(noiseLoop(0.16, 0.02, 0.15), 0.9), wind: norm(noiseLoop(0.05, 0.002, 0.3), 0.8), siren: norm(sirenLoop(), 0.7) };
}
const voices = {};
function voice(name) {
    const ctx = audioCtx();
    if (!ctx || !loops) return null;
    let v = voices[name];
    if (v && v.ctx === ctx) return v;
    const b = ctx.createBuffer(1, loops[name].length, SR);
    b.copyToChannel(loops[name], 0);
    const src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = b; src.loop = true; g.gain.value = 0;
    let out = g;
    if (name === 'engine') { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; g.connect(f); out = f; v = { f }; } else v = {};
    src.connect(g); out.connect(asmrOut());
    src.start();
    Object.assign(v, { ctx, src, g, gain: 0, rate: 1 });
    voices[name] = v;
    return v;
}
// every frame: st { on, spd (0..1.4 of top), thr, fly, air, boost, siren (0..1: how close the cops are) }
export function updateMotor(st) {
    const ctx = audioCtx();
    if (!ctx || ctx.state !== 'running' || !loops) return;
    const now = ctx.currentTime, set = (v, gain, rate, cut) => {
        if (!v) return;
        if (Math.abs(gain - v.gain) > 0.003) { v.g.gain.setTargetAtTime(gain, now, 0.06); v.gain = gain; }
        if (rate && Math.abs(rate - v.rate) > 0.004) { v.src.playbackRate.setTargetAtTime(rate, now, 0.05); v.rate = rate; }
        if (cut && v.f) v.f.frequency.setTargetAtTime(cut, now, 0.08);
    };
    const on = st.on ? 1 : 0, s = Math.max(0, Math.min(1.5, st.spd || 0));
    set(voice('engine'), on * (0.06 + 0.1 * Math.min(1, s) + (st.thr > 0 ? 0.05 : 0)) * (st.air && !st.fly ? 0.6 : 1), 0.62 + s * 1.15 + (st.boost ? 0.2 : 0), 500 + s * 1400 + (st.thr > 0 ? 400 : 0));
    set(voice('jet'), on * (st.fly ? 0.24 : st.boost ? 0.16 : 0), 0.9 + (st.fly ? 0.15 : 0) + s * 0.1);
    set(voice('wind'), on * Math.min(0.14, 0.02 + s * 0.08 + (st.air ? 0.04 : 0)), 0.8 + s * 0.5);
    set(voice('siren'), on * Math.max(0, Math.min(1, st.siren || 0)) * 0.16, 1);
}
export function motorOff() { updateMotor({ on: false }); }
