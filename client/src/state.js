// Local mirror of this player's progress. The server owns the real values: who's on the server arrives through the room state,
// where they are in snapshots, private progress in "profile" and "lite" messages.
export const S = {
    coins: 0, totalCoins: 0, gems: 0, stars: 0, xp: 0, lv: 1, need: 60, races: 0, wins: 0, podiums: 0, stage: 0, bestStage: 0, laps: 0, bestTime: 0, skipsUsed: 0,
    ups: {}, trails: {}, trail: 'none', pets: {}, team: [], hatched: 0, upgrades: 0, index: {}, checkpoints: 0,
    qi: 0, qv: 0, jq: { day: '', list: [] }, daily: {}, codes: {}, gifts: {}, seen: {}, tut: 0,
    sessionSecs: 0, playtime: 0, firstPlay: Date.now(),
    joinedAt: Date.now(), profileAt: Date.now(), name: '',
};

// Game actions that world objects and panels trigger; filled in by main.js / ui.js
export const actions = {};

export const net = {
    room: null,
    offset: 0,
    rtt: 0,
    send(type, msg) { if (this.room) this.room.send(type, msg || {}); },
    // Server clock in ms (corrected for the round trip, smooth.js), so timers line up for everyone
    fixedNow: null,
    now() { return this.fixedNow ?? Date.now() + this.offset; },
};

// QA: where a slow frame's time went (sections marked as the frame runs)
export const prof = { t: 0, parts: [], on: true, mark(name) { const n = performance.now(); this.parts.push(name, n - this.t); this.t = n; }, start() { this.parts.length = 0; this.t = performance.now(); } };
