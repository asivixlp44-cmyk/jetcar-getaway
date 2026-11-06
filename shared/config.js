// Jetcar Getaway: the game's data and formulas, shared by the client and the server.
// The loop: drive a jet-powered car along sky-high roads, then hold to FLY across the gaps, through rings and frames. 100 stages through
// four worlds, a checkpoint at the start of every stage, harder all the way. Reach the Getaway Tower at the end, claim a Trophy and run it
// again for bigger pay. Every few minutes a Police Chase: everyone on one course with the cops closing in behind.
// Coins buy cars, upgrades, paint and crates; Keys found on the course open crates too; Gems skip a stage that beat you.
// Everything is bought with what you earn in the game. There are no in-app purchases.
export const lookup = (o) => Object.assign(Object.create(null), o);

export const CFG = {
    maxPlayers: 16,
    // Police Chase: how many drivers (bots fill the empty places), how long the queue waits for others on this server
    racers: 6, queueSecs: 9, soloQueueSecs: 2.2, getReadySecs: 6, joinLateSecs: 1.5, resultsSecs: 14,
    // the invitation to everyone on the server: how often, how long it stays up
    inviteEvery: 180, inviteSecs: 30,
    // driving: gravity, the fastest fall, top speed, how quickly it gets there, brakes, reverse, how fast it turns, grip
    grav: 75, fallMax: 130, top: 62, acc: 30, brake: 80, rev: 18, steer: 2.25, grip: 11, iceGrip: 1.6,
    // the jets: lift while held (more than gravity), the fastest climb, the push forward, the tank, how fast it burns, how fast it fills on the road
    jetUp: 122, climbMax: 27, flyAcc: 26, flyTop: 58, tank: 100, burn: 30, refill: 85,
    // the nitro: how much faster, for how long, how long until it's charged again
    boostK: 1.35, boostSecs: 1.5, boostCool: 5,
    // how far a fall goes before you're back at your checkpoint; the city far below
    fallKill: 95,
    // the bots on the course when it's quiet: none (only real players are ever shown outside a chase)
    hubBots: 0,
    // what a skip costs
    skipGems: 3,
};

// ----- Easy / Normal / Hard: the jets last longer or shorter; the pay goes with it -----
export const DIFFS = [
    { id: 'easy', name: 'Easy', burn: 0.6, pay: 0.8, color: '#46ec50' },
    { id: 'normal', name: 'Normal', burn: 1, pay: 1, color: '#ffd23a' },
    { id: 'hard', name: 'Hard', burn: 1.45, pay: 1.5, color: '#ff5a5a' },
];
export const diffOf = (i) => DIFFS[Math.max(0, Math.min(DIFFS.length - 1, i | 0))];

// ----- the worlds: every 25 stages of the long run, and one Police Chase map each -----
export const WORLDS = [
    { id: 'city', name: 'Sunburst City', mood: 'city', icon: '🏙️', text: 'Glass towers and sky-high roads over the bay' },
    { id: 'mesa', name: 'Mesa Motorway', mood: 'mesa', icon: '🏜️', text: 'Red rock canyons under a blazing sun' },
    { id: 'neon', name: 'Neon Nightway', mood: 'neon', icon: '🌃', text: 'A midnight city of glowing signs and laser gates' },
    { id: 'glacier', name: 'Glacier Pass', mood: 'glacier', icon: '🏔️', text: 'Icy roads over snowy peaks: mind the slide', chase: 0.92 },
];
export const STAGES_PER_WORLD = 25;
export const STAGES = WORLDS.length * STAGES_PER_WORLD;
export const worldOfStage = (i) => Math.min(WORLDS.length - 1, Math.floor(Math.max(0, i) / STAGES_PER_WORLD));
// how hard a stage of the long run is: gentle for the first stages, climbing all the way
export const stageD = (i) => 0.04 + 1.26 * Math.pow(Math.max(0, i) / (STAGES - 1), 0.85);
// a stage that beat you costs more to skip the further on it is
export const skipCost = (i) => CFG.skipGems + Math.floor(Math.max(0, i) / STAGES_PER_WORLD) * 2;

// ----- Police Chase: length, difficulty and how many cops grow with you. t: seconds since GO -----
export const CHASE_TIERS = [
    { lv: 1, stages: 4, d: 0.06, k: 0.8, cops: 2 }, { lv: 3, stages: 5, d: 0.18, k: 0.86, cops: 3 }, { lv: 6, stages: 6, d: 0.32, k: 0.94, cops: 3 },
    { lv: 10, stages: 7, d: 0.48, k: 1, cops: 4 }, { lv: 15, stages: 8, d: 0.66, k: 1.06, cops: 4 }, { lv: 22, stages: 10, d: 0.85, k: 1.12, cops: 5 }, { lv: 30, stages: 12, d: 1.02, k: 1.18, cops: 6 },
];
export const chaseTier = (lv) => { let t = 0; for (let i = 0; i < CHASE_TIERS.length; i++) if ((lv || 1) >= CHASE_TIERS[i].lv) t = i; return t; };
// the lead cop: how far along the course (studs). A head start, then faster and faster up to just under a car's top speed
export const COPS = { head: 5, v0: 14, acc: 0.45, vMax: 33, back: 60 };
export function copS(t, k) {
    const x = Math.max(0, t - COPS.head), v0 = COPS.v0 * (k || 1), a = COPS.acc * (k || 1), vMax = COPS.vMax * Math.min(1.08, k || 1), tMax = Math.max(0, (vMax - v0) / a);
    if (x <= tMax) return -COPS.back + v0 * x + 0.5 * a * x * x;
    return -COPS.back + v0 * tMax + 0.5 * a * tMax * tMax + vMax * (x - tMax);
}
// what it pays: how far you got (0..1), your place, how long the course was
const PLACE_K = [1, 0.8, 0.65, 0.54, 0.45, 0.38, 0.32, 0.28];
export const placeK = (place) => PLACE_K[Math.min(PLACE_K.length - 1, Math.max(0, place))];
export const chaseCoins = (fr, place, stages) => Math.round((50 + 48 * (stages || 4) * Math.min(1, fr)) * placeK(place));
export const chaseXp = (fr, place, stages) => Math.round((30 + 18 * (stages || 4) * Math.min(1, fr)) * (0.55 + 0.45 * placeK(place)));
export const chaseGems = (place, escaped) => (escaped ? (place === 0 ? 4 : place === 1 ? 2 : 1) : 0);

// ----- the long run: every stage you reach pays (more the first time); the Getaway Tower pays a lot, more every time -----
export const lapK = (laps) => 1 + Math.min(40, laps || 0) * 0.25;
export const stageCoins = (i, laps) => Math.round((14 + i * 1.6) * lapK(laps));
export const stageXp = (i) => 14 + i * 2.4;
export const finishReward = (laps) => ({ coins: 3000 + 800 * Math.min(40, laps), gems: 30 + Math.min(30, laps * 5), stars: 1, xp: 1500 + 250 * Math.min(40, laps) });
// big air: Coins for a long time off the ground (the server times it)
export const airCoins = (secs) => (secs < 1.4 ? 0 : Math.min(18, Math.round((secs - 0.8) * 3)));
export const RING_COINS = 2;
// your rank for a whole run, by time
export const TIME_RANKS = [{ r: 'S', mins: 25, color: '#ffd028' }, { r: 'A', mins: 40, color: '#ff5a5a' }, { r: 'B', mins: 70, color: '#46ec50' }, { r: 'C', mins: 140, color: '#3ab4ff' }, { r: 'D', mins: Infinity, color: '#b45aff' }];
export const rankOfTime = (ms) => { for (const x of TIME_RANKS) if (ms < x.mins * 60000) return x; return TIME_RANKS[TIME_RANKS.length - 1]; };

// ----- levels -----
export const xpNeed = (lv) => Math.round(60 * Math.pow(Math.max(1, lv), 1.25) + 10);

// ----- cars, for Coins (the last for Trophies). top: top speed x, jet: lift x, tank: gas x. shape: the body -----
export const CARS = [
    { id: 'comet', name: 'Comet', coins: 0, lv: 1, top: 1, jet: 1, tank: 1, shape: 0, color: 0xff3a4a, text: 'A plucky little roadster with a jet under the seat' },
    { id: 'zephyr', name: 'Zephyr', coins: 600, lv: 2, top: 1.05, jet: 1.04, tank: 1.06, shape: 1, color: 0x2ab4ff, text: 'Light and quick, with a bigger tank' },
    { id: 'hornet', name: 'Hornet', coins: 2000, lv: 4, top: 1.09, jet: 1.08, tank: 1.1, shape: 2, color: 0xffc21e, text: 'A wedge with twin jets' },
    { id: 'tidal', name: 'Tidal GT', coins: 7000, lv: 7, top: 1.13, jet: 1.1, tank: 1.18, shape: 3, color: 0x2ad8a8, text: 'A grand tourer that floats like a gull' },
    { id: 'blaze', name: 'Blaze', coins: 16000, lv: 11, top: 1.18, jet: 1.14, tank: 1.22, shape: 1, color: 0xff6a1a, text: 'All engine, all noise' },
    { id: 'phantom', name: 'Phantom', coins: 38000, lv: 16, top: 1.22, jet: 1.18, tank: 1.3, shape: 2, color: 0x7a5aff, text: 'Low, long and very, very fast' },
    { id: 'nova', name: 'Nova X', stars: 2, lv: 1, top: 1.26, jet: 1.24, tank: 1.4, shape: 3, color: 0xf0f4ff, text: 'The Getaway Tower\'s own: a Trophy car' },
];
export const carById = lookup(Object.fromEntries(CARS.map((c) => [c.id, c])));

// ----- upgrades, for Coins: five levels each (the nitro three) -----
export const UPGRADES = [
    { id: 'engine', name: 'Turbo Engine', ic: 'engine', text: 'Top speed +4%, every level', base: 120, grow: 2.15, max: 5, lv: 1, color: '#ff5a5a' },
    { id: 'jets', name: 'Jet Thrusters', ic: 'jet', text: 'Climb faster when you FLY, every level', base: 160, grow: 2.15, max: 5, lv: 1, color: '#3ad8ff' },
    { id: 'tank', name: 'Fuel Tank', ic: 'tank', text: 'Fly 14% longer, every level', base: 140, grow: 2.15, max: 5, lv: 1, color: '#46ec50' },
    { id: 'nitro', name: 'Nitro', ic: 'nitro', text: 'BOOST lasts longer, every level', base: 450, grow: 2.4, max: 3, lv: 3, color: '#ffc21e' },
];
export const upgradeById = lookup(Object.fromEntries(UPGRADES.map((u) => [u.id, u])));
export const upgradeCost = (u, n) => Math.round(u.base * Math.pow(u.grow, n));
export const upLevel = (p, id) => (p.ups && p.ups[id]) || 0;
// what you drive with: your car, your upgrades
export function statsOf(p) {
    const c = carById[p.car] || CARS[0];
    return {
        top: CFG.top * c.top * (1 + 0.04 * upLevel(p, 'engine')),
        jet: c.jet * (1 + 0.05 * upLevel(p, 'jets')),
        tank: CFG.tank * c.tank * (1 + 0.14 * upLevel(p, 'tank')),
        boost: CFG.boostSecs + 0.35 * upLevel(p, 'nitro'),
    };
}

// ----- paint: your car's colour. Coins for most, Trophies for the best -----
export const PAINTS = [
    { id: 'stock', name: 'Factory', coins: 0, lv: 1, color: 0, finish: 0 },
    { id: 'cherry', name: 'Cherry', coins: 150, lv: 1, color: 0xff2a4a, finish: 0 },
    { id: 'sky', name: 'Sky Blue', coins: 150, lv: 1, color: 0x3ab4ff, finish: 0 },
    { id: 'lime', name: 'Lime Pop', coins: 260, lv: 2, color: 0x8aff3a, finish: 0 },
    { id: 'sun', name: 'Sunshine', coins: 260, lv: 2, color: 0xffd21e, finish: 0 },
    { id: 'grape', name: 'Grape', coins: 420, lv: 3, color: 0x9a4aff, finish: 0 },
    { id: 'snow', name: 'Snow White', coins: 420, lv: 3, color: 0xf4f6ff, finish: 0 },
    { id: 'night', name: 'Midnight', coins: 650, lv: 4, color: 0x22263a, finish: 0 },
    { id: 'racer', name: 'Racing Stripes', coins: 900, lv: 5, color: 0xff3a3a, finish: 1 },
    { id: 'police', name: 'Pursuit', coins: 1400, lv: 6, color: 0xf4f6ff, finish: 2 },
    { id: 'tiger', name: 'Tiger', coins: 2000, lv: 8, color: 0xff8a1a, finish: 1 },
    { id: 'mint', name: 'Mint Chip', coins: 2800, lv: 10, color: 0x5affc8, finish: 1 },
    { id: 'flame', name: 'Hot Rod', coins: 4200, lv: 12, color: 0x2a2030, finish: 3 },
    { id: 'gold', name: 'Gold Rush', stars: 1, lv: 1, color: 0xffc21e, finish: 1 },
    { id: 'chrome', name: 'Moon Dust', stars: 2, lv: 1, color: 0xc8ccd8, finish: 1 },
    { id: 'rainbow', name: 'Rainbow Road', stars: 3, lv: 1, color: 0xff5ac8, finish: 4 },
];
export const paintById = lookup(Object.fromEntries(PAINTS.map((t) => [t.id, t])));

// ----- exhausts: what comes out of your jets. Out of crates; each adds a little to the Coins you get -----
export const RARITIES = lookup({
    common: { name: 'Common', color: '#c8d0dc' }, rare: { name: 'Rare', color: '#3ab4ff' }, epic: { name: 'Epic', color: '#b45aff' },
    legendary: { name: 'Legendary', color: '#ffc42a' }, mythic: { name: 'Mythic', color: '#ff4a8a' },
});
// flame: the jet's colour; smoke: what it leaves behind; style: 0 puffs, 1 sparks, 2 stars, 3 bubbles
const ex = (id, name, flame, smoke, style, bonus, rarity) => ({ id, name, flame, smoke, style, bonus, rarity });
export const EXHAUSTS = [
    ex('stock', 'Stock Jets', 0xffa030, 0xf0f0f0, 0, 0, 'common'),
    ex('ember', 'Ember', 0xff5a1a, 0xc8c0b8, 0, 0.04, 'common'), ex('daylight', 'Daylight', 0xffe06a, 0xffffff, 0, 0.05, 'common'), ex('seafoam', 'Seafoam', 0x5affd0, 0xd8fff4, 3, 0.08, 'rare'), ex('sunset', 'Sunset Streak', 0xff5aa8, 0xffd0e8, 1, 0.14, 'epic'),
    ex('cactus', 'Cactus Bloom', 0x8aff3a, 0xe8ffd0, 0, 0.07, 'common'), ex('dune', 'Dust Devil', 0xffb85a, 0xe8c890, 0, 0.09, 'common'), ex('scorpion', 'Scorpion', 0xff3a3a, 0xffb090, 1, 0.15, 'rare'), ex('mirage', 'Mirage', 0x5ab4ff, 0xffffff, 2, 0.28, 'legendary'),
    ex('volt', 'Volt', 0x3af4ff, 0xb8f8ff, 1, 0.12, 'common'), ex('magenta', 'Magenta Rush', 0xff2ae0, 0xffb0f4, 1, 0.15, 'common'), ex('laser', 'Laser Grid', 0x7aff4a, 0xd0ffc0, 2, 0.26, 'rare'), ex('pulsar', 'Pulsar', 0xb45aff, 0xe8d0ff, 2, 0.48, 'legendary'),
    ex('frost', 'Frostbite', 0xa8f0ff, 0xffffff, 3, 0.22, 'common'), ex('aurora', 'Aurora', 0x5affb0, 0xd0ffe8, 2, 0.32, 'rare'), ex('comet', 'Comet Tail', 0xffffff, 0xd8e0ff, 2, 0.55, 'epic'), ex('supernova', 'Supernova', 0xffc21e, 0xffe8a8, 2, 1.1, 'mythic'),
];
export const exhaustById = lookup(Object.fromEntries(EXHAUSTS.map((k) => [k.id, k])));
const crateOf = (ids, odds) => ids.map((id, i) => ({ id, w: odds[i] }));
export const CRATES = [
    { id: 'street', name: 'Street Crate', coins: 250, keys: 1, lv: 1, color: 0x3ab4ff, items: crateOf(['ember', 'daylight', 'seafoam', 'sunset'], [52, 32, 13, 3]) },
    { id: 'desert', name: 'Desert Crate', coins: 900, keys: 2, lv: 3, color: 0xffa040, items: crateOf(['cactus', 'dune', 'scorpion', 'mirage'], [54, 32, 12, 2]) },
    { id: 'neon', name: 'Neon Crate', coins: 2600, keys: 3, lv: 7, color: 0xff2ae0, items: crateOf(['volt', 'magenta', 'laser', 'pulsar'], [55, 32, 12, 1]) },
    { id: 'ice', name: 'Ice Crate', coins: 7000, keys: 4, lv: 12, color: 0xa8f0ff, items: crateOf(['frost', 'aurora', 'comet', 'supernova'], [58, 30, 11.5, 0.5]) },
];
export const crateById = lookup(Object.fromEntries(CRATES.map((c) => [c.id, c])));
// every exhaust of a crate found: Gems, once
export const INDEX_GEMS = [10, 18, 30, 45];
// your Coins from stages and chases: your exhaust
export const coinMult = (p) => 1 + ((exhaustById[p.exhaust] || EXHAUSTS[0]).bonus || 0);

// ----- daily tasks -----
export const TASKS = lookup({
    stages: { text: 'Clear New Stages', icon: '🚩', n: 8, gems: 5, coins: 60 },
    chase: { text: 'Join a Police Chase', icon: '🚨', n: 2, gems: 6, coins: 80 },
    escape: { text: 'Escape the Police', icon: '🏁', n: 1, gems: 6, coins: 100 },
    bigair: { text: 'Land 5 Big Airs', icon: '🚀', n: 5, gems: 5, coins: 60 },
    rings: { text: 'Fly Through 15 Rings', icon: '⭕', n: 15, gems: 5, coins: 60 },
    combo: { text: 'Clear 3 Stages Without a Crash', icon: '🔥', n: 1, gems: 5, coins: 70 },
    upgrade: { text: 'Upgrade Your Car', icon: '🔧', n: 1, gems: 5, coins: 50 },
    crates: { text: 'Open Crates', icon: '📦', n: 2, gems: 5, coins: 50 },
    best: { text: 'Beat Your Best Stage', icon: '📈', n: 1, gems: 5, coins: 60 },
});
const TASK_POOL = ['chase', 'escape', 'bigair', 'rings', 'combo', 'upgrade', 'crates', 'best'];
export const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);
export const dayLeft = (ms) => 86400 - Math.floor(ms / 1000) % 86400;
export function tasksFor(day) {
    let h = 2166136261;
    for (let i = 0; i < day.length; i++) { h ^= day.charCodeAt(i); h = Math.imul(h, 16777619); }
    const r = rngFrom(h >>> 0), pool = TASK_POOL.slice(), out = ['stages'];
    while (out.length < 3) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    return out;
}

// ----- quests: always a next goal -----
export const QUESTS = [
    { kind: 'bestStage', n: 2, text: 'Reach Stage 2', coins: 40 },
    { kind: 'bestStage', n: 4, text: 'Reach Stage 4', coins: 60 },
    { kind: 'upgrades', n: 1, text: 'Buy any upgrade', coins: 50 },
    { kind: 'airs', n: 3, text: 'Land 3 Big Airs', coins: 60 },
    { kind: 'races', n: 1, text: 'Join a Police Chase', gems: 4 },
    { kind: 'bestStage', n: 8, text: 'Reach Stage 8', coins: 120 },
    { kind: 'opened', n: 1, text: 'Open a crate', coins: 80 },
    { kind: 'keys', n: 2, text: 'Find 2 Keys on the course', gems: 4 },
    { kind: 'cars', n: 2, text: 'Buy a new car', gems: 6 },
    { kind: 'bestStage', n: 12, text: 'Reach Stage 12', coins: 200 },
    { kind: 'lv', n: 4, text: 'Reach Level 4', coins: 150 },
    { kind: 'escapes', n: 1, text: 'Escape a Police Chase', gems: 6 },
    { kind: 'ringsAll', n: 25, text: 'Fly through 25 rings', coins: 200 },
    { kind: 'paints', n: 1, text: 'Paint your car', coins: 120 },
    { kind: 'bestStage', n: 18, text: 'Reach Stage 18', coins: 300 },
    { kind: 'wins', n: 1, text: 'Win a Police Chase', gems: 8 },
    { kind: 'bestStage', n: 25, text: 'Clear Sunburst City: reach Stage 25', gems: 10 },
    { kind: 'cars', n: 3, text: 'Own 3 cars', coins: 600 },
    { kind: 'lv', n: 8, text: 'Reach Level 8', gems: 10 },
    { kind: 'opened', n: 5, text: 'Open 5 crates', gems: 8 },
    { kind: 'bestStage', n: 38, text: 'Reach Stage 38', coins: 1200 },
    { kind: 'bestStage', n: 50, text: 'Clear Mesa Motorway: reach Stage 50', gems: 15 },
    { kind: 'wins', n: 5, text: 'Win 5 Police Chases', gems: 15 },
    { kind: 'cars', n: 5, text: 'Own 5 cars', coins: 3000 },
    { kind: 'bestStage', n: 75, text: 'Clear Neon Nightway: reach Stage 75', gems: 25 },
    { kind: 'lv', n: 16, text: 'Reach Level 16', gems: 20 },
    { kind: 'laps', n: 1, text: 'Reach the Getaway Tower', gems: 50 },
    { kind: 'lv', n: 25, text: 'Reach Level 25', gems: 30 },
    { kind: 'laps', n: 3, text: 'Claim 3 Trophies', gems: 60 },
];

// ----- rewards: the 7-day daily reward, playtime gifts, codes -----
export const DAILY = [
    { coins: 150 }, { coins: 200 }, { gems: 5 }, { coins: 300, keys: 1 }, { coins: 400 }, { gems: 10 }, { coins: 800, gems: 20, keys: 2 },
];
export function dailyStatus(d, now) {
    const today = dayKey(now), yest = dayKey(now - 86400000);
    if (!d || !d.last) return { can: true, day: 0, streak: 0 };
    if (d.last === today) return { can: false, day: d.streak % 7, streak: d.streak };
    const streak = d.last === yest ? d.streak : 0;
    return { can: true, day: streak % 7, streak };
}
// FREE gifts for playing (minutes into this session)
export const GIFTS = [
    { min: 2, coins: 80 }, { min: 5, gems: 5 }, { min: 9, coins: 160, keys: 1 }, { min: 14, gems: 6 }, { min: 20, coins: 350 }, { min: 30, gems: 12, keys: 1 }, { min: 45, coins: 800, gems: 15 },
];
export const CODES = lookup({
    JETCAR: { coins: 150 }, GETAWAY: { gems: 5 }, NITRO: { coins: 250 }, BLOXITY: { coins: 200 }, LEGION: { gems: 5 }, SIREN: { keys: 2 },
});
// HTML: a Coin is drawn (class "cc"), Gems are 💎, Trophies 🏆, Keys 🔑
export function rewardText(r, plain) {
    return [r.coins ? fmtComma(r.coins) + (plain ? ' Coins' : ' <i class="cc"></i>') : '', r.xp ? fmtComma(r.xp) + ' XP' : '', r.gems ? r.gems + ' 💎' : '', r.keys ? r.keys + ' 🔑' : '', r.stars ? r.stars + ' 🏆' : ''].filter(Boolean).join(' + ');
}

// a badge on your name, by Trophies
export const RANKS = [{ wins: 0, name: 'Learner', icon: '🚗' }, { wins: 1, name: 'Street Racer', icon: '🥉' }, { wins: 3, name: 'Sky Driver', icon: '🥈' }, { wins: 8, name: 'Jet Ace', icon: '🥇' }, { wins: 20, name: 'Getaway King', icon: '💠' }, { wins: 50, name: 'Legend', icon: '👑' }];
export const rankOf = (wins) => { let r = RANKS[0]; for (const x of RANKS) if ((wins || 0) >= x.wins) r = x; return r; };

export const BOT_NAMES = [
    'TurboTess', 'SkidMarkSam', 'JetJunie', 'NitroNico', 'xXDriftXx', 'ZoomZara', 'BumperBo', 'RevRiley', 'WheelieWes', 'GasPedalGus',
    'FlyByFin', 'ThrottleThea', 'VroomVik', 'SpoilerSky', 'HoodHopper', 'BrakeLater', 'ApexAndy', 'CruiseCleo', 'PitStopPip', 'LaneLeo',
    'RampRae', 'HoverHal', 'SirenSue', 'GaragePax', 'TailLightTy', 'DriftKing', 'ClutchCass', 'OctaneOz', 'MileMax', 'PistonPia',
];
// how good the bots are: top speed x, how often they slip up
export const BOT_SKILL = [
    { speed: [0.86, 0.92], slip: 0.16 },
    { speed: [0.9, 0.96], slip: 0.1 },
    { speed: [0.94, 1], slip: 0.05 },
];

// ----- helpers -----
export function rngFrom(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function fmt(v) {
    v = Math.floor(v || 0);
    if (v < 1000) return String(v);
    const u = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];
    let i = 0, x = v;
    while (x >= 1000 && i < u.length - 1) { x /= 1000; i++; }
    return (x >= 100 ? Math.floor(x) : Math.floor(x * 100) / 100) + u[i];
}
export const fmtComma = (v) => { const s = String(Math.floor(v || 0)); return s.length < 4 || /e/.test(s) ? s : s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
export function clock(s) {
    s = Math.max(0, Math.floor(s));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
    return (h ? h + ':' + String(m).padStart(2, '0') : String(m).padStart(2, '0')) + ':' + String(x).padStart(2, '0');
}
export const clockMs = (ms) => { const s = Math.floor(ms / 1000), c = Math.floor((ms % 1000) / 10); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0') + '.' + String(c).padStart(2, '0'); };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// km/h on the dial, from studs a second
export const KMH = 1.8;
