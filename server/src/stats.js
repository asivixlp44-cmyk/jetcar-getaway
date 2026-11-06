// Turns the session records into the numbers that explain playtime: how long sessions last, how soon
// players start their first race and how many they run, how far they progress (levels, the best stage,
// quests), how smoothly the game runs on their devices and which errors they hit.
import { loadSessions } from './profiles.js';

const BUCKETS = [[0, 60, '<1 min'], [60, 180, '1-3 min'], [180, 300, '3-5 min'], [300, 600, '5-10 min'], [600, 900, '10-15 min'], [900, 1800, '15-30 min'], [1800, Infinity, '30+ min']];
const FPS_BUCKETS = [[0, 20, '<20'], [20, 30, '20-30'], [30, 45, '30-45'], [45, 55, '45-55'], [55, Infinity, '55+']];
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const avg = (list, f) => Math.round((list.reduce((a, d) => a + (f(d) || 0), 0) / Math.max(1, list.length)) * 10) / 10;
function quantile(sorted, q) {
    if (!sorted.length) return 0;
    return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}
function lengths(list) {
    const secs = list.map((d) => d.secs).sort((a, b) => a - b);
    const mean = secs.reduce((a, b) => a + b, 0) / Math.max(1, secs.length);
    return {
        sessions: list.length,
        meanMin: Math.round(mean / 6) / 10,
        medianMin: Math.round(quantile(secs, 0.5) / 6) / 10,
        buckets: Object.fromEntries(BUCKETS.map(([a, b, name]) => [name, pct(secs.filter((s) => s >= a && s < b).length, secs.length) + '%'])),
    };
}
function fpsView(list) {
    const withFps = list.filter((d) => d.fps > 0);
    return Object.fromEntries(FPS_BUCKETS.map(([a, b, name]) => {
        const l = withFps.filter((d) => d.fps >= a && d.fps < b);
        return [name, { sessions: pct(l.length, withFps.length) + '%', meanMin: Math.round(avg(l, (d) => d.secs) / 6) / 10 }];
    }));
}
const median = (vals) => quantile(vals.filter((v) => v > 0).sort((a, b) => a - b), 0.5);
function topCounts(values, n) {
    const m = new Map();
    for (const v of values) if (v) m.set(v, (m.get(v) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => ({ n: c, v: k }));
}

export async function statsSummary(days, raw) {
    const since = Date.now() - days * 86400000;
    // Very short visits (under 10 s) are page bounces, counted separately
    const all = await loadSessions(since, 20000);
    const list = all.filter((d) => d.secs >= 10);
    const out = {
        days, since: new Date(since).toISOString(),
        pageBounces: all.length - list.length,
        all: lengths(list),
        newPlayers: lengths(list.filter((d) => d.fresh)),
        returning: lengths(list.filter((d) => !d.fresh)),
        phones: lengths(list.filter((d) => d.touch)),
        desktop: lengths(list.filter((d) => !d.touch)),
        // the loop: races, checkpoints, how far along
        racedPct: pct(list.filter((d) => d.races > 0).length, list.length),
        firstRaceSecs: median(list.map((d) => d.firstRace)),
        avgRaces: avg(list, (d) => d.races),
        avgWins: avg(list, (d) => d.wins),
        avgCheckpoints: avg(list, (d) => d.cps),
        avgBestStage: avg(list, (d) => d.stage),
        avgEggs: avg(list, (d) => d.hatch),
        avgCoins: avg(list, (d) => d.coins),
        boughtSomethingPct: pct(list.filter((d) => d.buys > 0).length, list.length),
        // progress
        levelsGained: avg(list, (d) => (d.lv || 1) - (d.lv0 || 1)),
        questReached: topCounts(list.map((d) => d.qi), 20),
        // how it runs
        avgFps: avg(list.filter((d) => d.fps), (d) => d.fps),
        fpsDesktop: fpsView(list.filter((d) => !d.touch)),
        fpsPhones: fpsView(list.filter((d) => d.touch)),
        quality: topCounts(list.map((d) => d.q), 5),
        slowGpus: topCounts(list.filter((d) => d.fps > 0 && d.fps < 35).map((d) => d.gpu), 12),
        loadSecs: { desktop: median(list.filter((d) => !d.touch).map((d) => d.load || 0)), phones: median(list.filter((d) => d.touch).map((d) => d.load || 0)) },
        errorSessionsPct: pct(list.filter((d) => d.errs && d.errs.length).length, list.length),
        errors: topCounts(list.flatMap((d) => d.errs || []), 25),
    };
    // the newest sessions as they were recorded (no names or ids are stored)
    if (raw) out.raw = all.slice(0, raw);
    return out;
}
