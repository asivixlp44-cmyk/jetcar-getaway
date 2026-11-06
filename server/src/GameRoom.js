import { Room } from 'colyseus';
import { GameState, PlayerState } from './schema.js';
import {
    getProfile, hasProfile, markDirty, saveProfiles, adoptGuestProgress, loadProfile, releaseProfile,
    topProfiles, recordSession, saveSoon, USE_DB,
} from './profiles.js';
import { sealProfile, openSave } from './saves.js';
import { verifyBloxityToken } from './bloxity.js';
import { Match, PH } from './match.js';
import { checkMove, initGuard, sendTo as guardSend } from './guard.js';
import {
    CFG, xpNeed, upgradeById, upgradeCost, CARS, carById, PAINTS, paintById, EXHAUSTS, exhaustById, CRATES, crateById, INDEX_GEMS, WORLDS, STAGES, STAGES_PER_WORLD, skipCost,
    TASKS, tasksFor, dayKey, QUESTS, DAILY, dailyStatus, GIFTS, CODES, rewardText, clamp, stageCoins, stageXp, coinMult, finishReward, rankOfTime, airCoins, RING_COINS, diffOf, DIFFS,
} from '../../shared/config.js';
import { mainCourse, HUB } from '../../shared/course.js';

const GREEN = '#7dff6b', GOLD = '#ffd028', RED = '#ff9a8a';
const cleanName = (name) => String(name || '').replace(/[^\w .\-]/g, '').trim().slice(0, 20);
const randomName = () => 'Driver' + Math.floor(1000 + Math.random() * 9000);
const finite = (v) => typeof v === 'number' && Number.isFinite(v);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const num = (v, d) => (finite(v) ? v : d);
const rnd = (a, b) => a + Math.random() * (b - a);
// Guest ids come from the browser; they can never claim a Bloxity identity
const guestUid = (uid, fallback) => String(uid || fallback).replace(/^legion_/, 'guest_').slice(0, 64);
const cleanAvatar = (av) => (typeof av === 'string' && av.length <= 2000 ? av : '');
// within 5 of the middle: holding W from here goes straight out through START and down Stage 1's road (wider, and a car meets a wall)
const hubSpot = () => ({ x: HUB.spawn.x + rnd(-5, 5), y: 0, z: HUB.spawn.z + rnd(-8, 8), ry: 0 });

export const liveRooms = new Set();

// One server: up to 16 players on the same long sky road, or running from the police. Driving is client-side; every checkpoint, ring,
// key, big air, Coin and everything that earns or costs anything is checked here.
export class GameRoom extends Room {
    maxClients = CFG.maxPlayers;

    onCreate() {
        liveRooms.add(this);
        this.setState(new GameState());
        this.setPatchRate(100);
        this.sessions = new Map();
        this.queue = [];
        this.matches = new Map();
        this.matchN = Math.floor(Math.random() * WORLDS.length);
        this.main = mainCourse();
        this.inviteAt = Date.now() + CFG.inviteEvery * 1000 * 0.5;
        this.inviteEnd = 0;
        const on = (type, fn) => this.onMessage(type, (client, m) => { try { fn.call(this, client, m || {}); } catch (e) { console.warn('[msg]', type, e.message); } });
        on('ping', (client, m) => client.send('pong', { c: num(m.c, 0), s: Date.now() }));
        on('move', this.onMove);
        on('queue', this.onQueue);
        on('leave', this.onLeaveMatch);
        on('respawn', this.onRespawn);
        on('warp', this.onWarp);
        on('skip', this.onSkip);
        on('claim', this.onClaim);
        on('upgrade', this.onUpgrade);
        on('car', this.onCar);
        on('paint', this.onPaint);
        on('crate', this.onCrate);
        on('exhaust', this.onExhaust);
        on('diff', this.onDiff);
        on('qclaim', this.onQuestClaim);
        on('tclaim', this.onTaskClaim);
        on('daily', this.onDaily);
        on('gift', this.onGift);
        on('code', this.onCode);
        on('tut', this.onTut);
        on('meta', this.onMeta);
        on('auth', this.onBloxityLogin);
        on('avatar', this.onAvatar);
        on('emote', this.onEmote);
        on('chat', this.onChat);
        // QA only (QA=1, never on Legion): give yourself Coins, Gems, levels...
        if (process.env.QA === '1' && !process.env.BLOXITY_GAME_ID) on('qa', this.onQa);
        this.lastTick = Date.now();
        this.secAcc = 0;
        this.setSimulationInterval(() => this.update(), 50);
        this.clock.setInterval(() => this.broadcastBoards(), 10000);
    }

    async onAuth(client, options) {
        const legion = options && options.token ? await verifyBloxityToken(options.token) : null;
        return legion ? { legion } : { guest: true };
    }

    async onJoin(client, options, auth) {
        options = options || {};
        const guest = guestUid(options.uid, client.sessionId);
        let uid = guest, name = cleanName(options.name);
        if (auth && auth.legion) {
            uid = 'legion_' + auth.legion.id;
            name = cleanName(auth.legion.name) || name;
            await adoptGuestProgress(uid, guest, name);
        }
        await loadProfile(uid);
        // A fresh server on a temporary disk restores the browser's signed backup (never with a database)
        const restore = !USE_DB && !hasProfile(uid) && openSave(options.save, [uid, guest]);
        const profile = getProfile(uid, name, randomName());
        if (restore) { Object.assign(profile, restore); markDirty(); }
        this.fixProfile(profile);
        kickOthers(uid, null);
        const player = new PlayerState();
        player.name = profile.name;
        player.pid = this.freePid();
        player.av = cleanAvatar(options.av);
        const now = Date.now();
        this.state.players.set(client.sessionId, player);
        // you land where you left off: on your last checkpoint, or, new, on the Garage Deck
        const here = profile.stage > 0 ? this.main.respawnOf(profile.stage - 1) : hubSpot();
        const s = {
            id: client.sessionId, client, profile, player, guest, joinedAt: now, lastChat: 0, playSecs: 0, dirtyAt: 0, sealAt: 0, ack: 0, match: null, snapAt: 0, warpAt: 0,
            gifts: {}, queuedAt: 0, cp: profile.stage - 1, combo: 0, runT0: 0, runClean: false, respawnAt: 0, atFinish: false, skipAt: 0, rings: new Set(), airAt: 0, airPaidAt: 0, diffMin: profile.diff,
            pub: { x: here.x, y: here.y, z: here.z, ry: here.ry || 0, a: 0, t: now },
            stats: {
                fresh: now - (profile.firstPlay || 0) < 60000, races: 0, wins: 0, buys: 0, lv0: profile.lv, cps: 0, opened: 0, coins: 0, falls: 0, laps: 0, airs: 0, rings: 0,
                touch: false, fps: 0, fpsSum: 0, fpsN: 0, fpsMin: 0, q: '', gpu: '', load: 0, dev: null, errs: [], firstRaceAt: 0,
            },
        };
        initGuard(s, here.x, here.y, here.z, now);
        s.homeAt = 0;
        this.sessions.set(client.sessionId, s);
        this.syncPublic(s);
        client.send('hello', { now, bloxity: uid.startsWith('legion_'), x: here.x, y: here.y, z: here.z, ry: here.ry || 0 });
        profile.lastSeen = now;
        this.sendProfile(s, true);
        this.broadcastBoards(client);
    }
    freePid() {
        const used = new Set([...this.state.players.values()].map((p) => p.pid));
        for (let i = 1; i < 255; i++) if (!used.has(i)) return i;
        return 255;
    }
    // Older saves / hand-edited data: keep every field the right shape
    fixProfile(p) {
        for (const k of ['coins', 'totalCoins', 'gems', 'stars', 'xp', 'races', 'wins', 'podiums', 'stage', 'bestStage', 'laps', 'bestTime', 'timeScore', 'skipsUsed', 'opened', 'upgrades', 'playtime', 'lastSeen', 'qi', 'tut', 'checkpoints', 'keys', 'ringsAll', 'airs', 'escapes']) if (!finite(p[k]) || p[k] < 0) p[k] = 0;
        p.gems = Math.floor(p.gems); p.stars = Math.floor(p.stars); p.keys = Math.floor(p.keys);
        p.lv = clamp(Math.floor(num(p.lv, 1)), 1, 9999);
        p.qi = clamp(Math.floor(p.qi), 0, QUESTS.length);
        p.diff = clamp(Math.floor(num(p.diff, 1)), 0, DIFFS.length - 1);
        for (const k of ['daily', 'codes', 'seen', 'jq', 'ups', 'cars', 'paints', 'exhausts', 'index', 'keysGot']) p[k] = obj(p[k]);
        for (const id of Object.keys(p.ups)) { const u = upgradeById[id]; if (!u) delete p.ups[id]; else p.ups[id] = clamp(num(p.ups[id], 0) | 0, 0, u.max); }
        for (const id of Object.keys(p.cars)) if (!carById[id]) delete p.cars[id];
        for (const id of Object.keys(p.paints)) if (!paintById[id]) delete p.paints[id];
        for (const id of Object.keys(p.exhausts)) if (!exhaustById[id]) delete p.exhausts[id];
        p.cars.comet = 1; p.paints.stock = 1; p.exhausts.stock = Math.max(1, p.exhausts.stock | 0);
        if (!carById[p.car] || !p.cars[p.car]) p.car = 'comet';
        if (!paintById[p.paint] || !p.paints[p.paint]) p.paint = 'stock';
        if (!exhaustById[p.exhaust] || !(p.exhausts[p.exhaust] > 0)) p.exhaust = 'stock';
        p.jq = { day: String(p.jq.day || ''), list: (Array.isArray(p.jq.list) ? p.jq.list : []).slice(0, 3).map((q) => ({ k: String(q.k), p: Math.max(0, num(q.p, 0)), c: !!q.c })).filter((q) => TASKS[q.k]) };
        p.stage = clamp(Math.floor(p.stage), 0, STAGES);
        p.bestStage = clamp(Math.floor(p.bestStage), 0, STAGES);
        if (!finite(p.firstPlay)) p.firstPlay = Date.now();
    }

    onDrop(client) { this.allowReconnection(client, 30).catch(() => {}); }
    onReconnect(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        s.client = client;
        client.send('hello', { now: Date.now(), bloxity: s.profile.uid.startsWith('legion_') });
        this.sendProfile(s, true);
        this.broadcastBoards(client);
    }
    onLeave(client) {
        const s = this.sessions.get(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.sessions.delete(client.sessionId);
        this.queue = this.queue.filter((q) => q !== s);
        if (s && s.match) { s.match.humanLeft(s); s.match = null; }
        markDirty();
        if (!s) return;
        const p = s.profile, st = s.stats;
        p.lastSeen = Date.now();
        recordSession({
            at: new Date(), secs: Math.round((Date.now() - s.joinedAt) / 1000), fresh: st.fresh, touch: st.touch,
            fps: st.fpsN ? Math.round(st.fpsSum / st.fpsN) : st.fps, fpsMin: st.fpsMin, q: st.q, gpu: st.gpu, load: st.load, dev: st.dev, errs: st.errs,
            races: st.races, wins: st.wins, cps: st.cps, falls: st.falls, laps: st.laps, buys: st.buys, lv0: st.lv0, lv: p.lv, opened: st.opened, coins: st.coins, stage: p.bestStage, airs: st.airs, rings: st.rings,
            firstRace: st.firstRaceAt ? Math.round((st.firstRaceAt - s.joinedAt) / 1000) : -1, qi: p.qi,
        }).catch((e) => console.warn('[stats]', e.message));
        if (!isOnline(p.uid)) releaseProfile(p.uid, isOnline);
    }
    onDispose() {
        liveRooms.delete(this);
        for (const s of this.sessions.values()) s.profile.lastSeen = Date.now();
        markDirty();
        return saveProfiles();
    }

    // ----- helpers -----
    sendTo(s, type, msg) { try { if (s) s.client.send(type, msg); } catch (e) { /* gone */ } }
    broadcastTo(ctx, type, msg) { for (const s of this.sessions.values()) if ((s.match ? s.match.id : '') === ctx) this.sendTo(s, type, msg); }
    syncPublic(s) {
        const p = s.profile, pl = s.player;
        pl.name = p.name; pl.lv = p.lv; pl.wins = p.laps; pl.coins = Math.floor(p.coins); pl.stage = p.bestStage;
        if (pl.car !== p.car) pl.car = p.car;
        if (pl.paint !== p.paint) pl.paint = p.paint;
        if (pl.exh !== p.exhaust) pl.exh = p.exhaust;
    }
    // The player's private progress: straight away for anything they clicked on; while racing, four times a second, only what changes then
    sendProfile(s, seal) {
        const p = s.profile, now = Date.now();
        s.dirtyAt = 0;
        this.jqOf(p, now);
        this.checkQuests(s);
        const m = {
            coins: Math.floor(p.coins), totalCoins: Math.floor(p.totalCoins), gems: p.gems, stars: p.stars, keys: p.keys, xp: Math.floor(p.xp), lv: p.lv, need: xpNeed(p.lv), ack: s.ack,
            races: p.races, wins: p.wins, podiums: p.podiums, escapes: p.escapes, stage: p.stage, bestStage: p.bestStage, laps: p.laps, bestTime: p.bestTime, skipsUsed: p.skipsUsed,
            ups: p.ups, cars: p.cars, car: p.car, paints: p.paints, paint: p.paint, exhausts: p.exhausts, exhaust: p.exhaust, opened: p.opened, upgrades: p.upgrades, index: p.index, checkpoints: p.checkpoints,
            keysGot: p.keysGot, ringsAll: p.ringsAll, airs: p.airs, diff: p.diff,
            qi: p.qi, qv: p.qi < QUESTS.length ? this.questValue(p, QUESTS[p.qi].kind) : 0, jq: p.jq, daily: p.daily, codes: p.codes,
            gifts: s.gifts, sessionSecs: s.playSecs, playtime: p.playtime, tut: p.tut, seen: p.seen, firstPlay: p.firstPlay, now,
        };
        if (!USE_DB && (seal || now - s.sealAt > 10000)) { s.sealAt = now; m.save = sealProfile(p); }
        this.sendTo(s, 'profile', m);
    }
    sendLite(s) {
        const p = s.profile;
        s.dirtyAt = 0;
        this.checkQuests(s);
        const m = { coins: Math.floor(p.coins), totalCoins: Math.floor(p.totalCoins), xp: Math.floor(p.xp), lv: p.lv, need: xpNeed(p.lv), ack: s.ack, gems: p.gems, keys: p.keys, ringsAll: p.ringsAll, airs: p.airs };
        if (p.qi < QUESTS.length) m.qv = this.questValue(p, QUESTS[p.qi].kind);
        this.sendTo(s, 'lite', m);
    }
    dirty(s) { if (!s.dirtyAt) s.dirtyAt = Date.now(); markDirty(); }
    changed(s) { this.syncPublic(s); this.sendProfile(s); saveSoon(); }
    toast(s, text, color) { this.sendTo(s, 'toast', { text, color: color || '#ffffff' }); }
    broke(s, need, name, cur) { this.sendTo(s, 'broke', { need: Math.ceil(need), name, cur }); }
    pay(s, cur, n, name) { const p = s.profile; if (p[cur] < n) { this.broke(s, n - p[cur], name, cur); return false; } p[cur] -= n; s.stats.buys++; return true; }
    giveReward(s, r, why) {
        const p = s.profile;
        if (r.coins) this.addCoins(s, r.coins);
        if (r.xp) this.addXp(s, r.xp);
        if (r.gems) p.gems += r.gems;
        if (r.stars) p.stars += r.stars;
        if (r.keys) p.keys += r.keys;
        if (why) this.sendTo(s, 'reward', { text: rewardText(r), why, gems: r.gems || 0, coins: r.coins || 0, keys: r.keys || 0 });
        return r;
    }
    addCoins(s, n) {
        const p = s.profile;
        p.coins += n; p.totalCoins += n; s.stats.coins += n;
        this.dirty(s);
    }
    addXp(s, n) {
        const p = s.profile;
        p.xp += n;
        let ups = 0;
        while (p.xp >= xpNeed(p.lv)) { p.xp -= xpNeed(p.lv); p.lv++; ups++; }
        if (ups) { this.sendTo(s, 'levelup', { lv: p.lv, ups }); s.player.lv = p.lv; }
        this.dirty(s);
    }
    // what a stage, a ring or a big air pays you: your exhaust, and Easy / Hard (the easiest you've had it on since your last checkpoint)
    payK(s) { return coinMult(s.profile) * diffOf(Math.min(s.profile.diff, s.diffMin)).pay; }

    // ----- daily tasks, quests -----
    jqOf(p, now) {
        const d = dayKey(now);
        if (p.jq.day !== d) p.jq = { day: d, list: tasksFor(d).map((k) => ({ k, p: 0, c: false })) };
        return p.jq;
    }
    task(s, k, n) {
        const jq = this.jqOf(s.profile, Date.now());
        for (const q of jq.list) {
            if (q.k !== k || q.c) continue;
            const was = q.p;
            q.p = Math.min(TASKS[k].n, q.p + n);
            if (was < TASKS[k].n && q.p >= TASKS[k].n) { this.sendTo(s, 'taskdone', { k }); s.jqDirty = true; }
        }
        this.dirty(s);
    }
    questValue(p, kind) {
        if (kind === 'keys') return Object.keys(p.keysGot).length;
        if (kind === 'cars') return Object.keys(p.cars).length;
        if (kind === 'paints') return Object.keys(p.paints).length - 1;
        return Math.floor(p[kind] || 0);
    }
    checkQuests(s) {
        const p = s.profile;
        if (p.qi >= QUESTS.length) return;
        const Q = QUESTS[p.qi];
        if (this.questValue(p, Q.kind) >= Q.n && s.questAnnounced !== p.qi) { s.questAnnounced = p.qi; this.sendTo(s, 'questdone', { qi: p.qi }); }
    }
    onQuestClaim(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (p.qi >= QUESTS.length) return;
        const Q = QUESTS[p.qi];
        if (this.questValue(p, Q.kind) < Q.n) return;
        p.qi++;
        this.giveReward(s, Q, 'Quest complete!');
        this.changed(s);
    }
    onTaskClaim(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const q = this.jqOf(s.profile, Date.now()).list[m.i | 0];
        if (!q || q.c || q.p < TASKS[q.k].n) return;
        q.c = true;
        this.giveReward(s, TASKS[q.k], 'Daily task done!');
        this.changed(s);
    }

    // ----- 20 times a second: the chases, the queue; every second: playtime -----
    update() {
        const now = Date.now(), dt = Math.min(0.1, (now - this.lastTick) / 1000);
        this.lastTick = now;
        this.state.now = now;
        for (const [id, m] of this.matches) {
            m.update(now, dt);
            if (m.ended) this.endMatch(id, m);
        }
        this.invite(now);
        this.matchmake(now);
        this.secAcc += dt;
        if (this.secAcc >= 1) { this.secAcc -= 1; this.tick(now); }
        this.sendSnaps(now);
        for (const s of this.sessions.values()) if (s.dirtyAt && now - s.dirtyAt > 250) { this.syncPublic(s); if (s.jqDirty) { s.jqDirty = false; this.sendProfile(s); } else this.sendLite(s); }
    }
    tick(now) {
        for (const s of this.sessions.values()) {
            const p = s.profile;
            p.playtime = (p.playtime || 0) + 1;
            p.lastSeen = now;
            s.playSecs++;
            const g = GIFTS.findIndex((x, i) => !s.gifts[i] && s.playSecs >= x.min * 60 && s.playSecs < x.min * 60 + 1);
            if (g >= 0) this.toast(s, '🎁 A FREE gift is ready!', GOLD);
        }
        markDirty();
    }
    // Where everyone is: every tick, to the people who can see them (each stamped with the server time it was true at)
    sendSnaps(now) {
        const hub = [];
        const put = (list, pid, x, y, z, ry, a, t) => { list.push(pid, Math.round(x * 20), Math.round(y * 20), Math.round(z * 20), Math.round(ry * 100), a, Math.min(4000, Math.max(0, now - t))); };
        for (const s of this.sessions.values()) if (!s.match) put(hub, s.player.pid, s.pub.x, s.pub.y, s.pub.z, s.pub.ry, s.pub.a, s.pub.t);
        const hubMsg = { t: now, l: hub };
        if (hub.length > 7) for (const s of this.sessions.values()) if (!s.match) this.sendTo(s, 'snaps', hubMsg);
        for (const m of this.matches.values()) {
            const l = [];
            for (const r of m.racers.values()) {
                if (r.bot) { if (r.body) put(l, r.pl.pid, r.body.x, r.body.y, r.body.z, r.body.yaw, r.a || 0, now); } else { const P = r.s.pub; put(l, r.pl.pid, P.x, P.y, P.z, P.ry, P.a, P.t); }
            }
            const msg = { t: now, l };
            for (const r of m.racers.values()) if (r.s) this.sendTo(r.s, 'snaps', msg);
        }
    }

    // ----- the queue (CHASE, or Join on the invitation): everyone at about the same time goes into the same Police Chase; bots only fill the empty places -----
    invite(now) {
        if (now >= this.inviteAt) {
            this.inviteAt = now + CFG.inviteEvery * 1000;
            if ([...this.sessions.values()].some((s) => !s.match)) this.inviteEnd = now + CFG.inviteSecs * 1000;
        }
        if (this.inviteEnd && now > this.inviteEnd && !this.queue.length) this.inviteEnd = 0;
        if (!this.queue.length) { const e = this.inviteEnd > now ? this.inviteEnd : 0; if (this.state.queueEnd !== e) this.state.queueEnd = e; }
    }
    onQueue(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (s.match) { if (s.match.phase === PH.RESULTS) this.leaveMatch(s, m.on !== false); return; }
        if (m.on === false) { this.unqueue(s); return; }
        if (this.queue.includes(s)) return;
        s.queuedAt = Date.now();
        if (process.env.QA === '1' && finite(m.world)) this.qaWorld = clamp(m.world | 0, 0, WORLDS.length - 1);
        this.queue.push(s);
        this.state.queueN = this.queue.length;
        this.sendTo(s, 'queued', { on: 1 });
    }
    unqueue(s) { this.queue = this.queue.filter((q) => q !== s); this.state.queueN = this.queue.length; this.sendTo(s, 'queued', { on: 0 }); }
    matchmake(now) {
        if (!this.queue.length) { if (this.state.queueN) this.state.queueN = 0; return; }
        // a chase still getting ready takes whoever queues now (each in a bot's place) before a new one is made
        while (this.queue.length) {
            let best = null, most = 0;
            for (const r of this.matches.values()) { const n = r.canJoin(now); if (n > most) { most = n; best = r; } }
            if (!best || !best.joinLate(this.queue[0], now)) break;
            this.seat(this.queue.shift(), best, now);
        }
        if (!this.queue.length) { this.state.queueN = 0; return; }
        // others on the server might press CHASE too: wait for them a little; alone, start almost straight away
        let idle = 0;
        for (const s of this.sessions.values()) if (!s.match && !this.queue.includes(s)) idle++;
        const end = this.inviteEnd > now ? this.inviteEnd : this.queue[0].queuedAt + (idle ? CFG.queueSecs : CFG.soloQueueSecs) * 1000;
        if (this.state.queueEnd !== end) this.state.queueEnd = end;
        if (this.state.queueN !== this.queue.length) this.state.queueN = this.queue.length;
        if (this.queue.length < CFG.racers && now < end) return;
        const list = this.queue.splice(0, CFG.racers);
        this.state.queueN = this.queue.length;
        this.inviteEnd = 0;
        const id = 'r' + (++this.matchN);
        const world = this.qaWorld !== undefined ? this.qaWorld : this.matchN % WORLDS.length;
        const match = new Match(this, id, list, world);
        this.matches.set(id, match);
        for (const s of list) this.seat(s, match, now);
    }
    seat(s, match, now) {
        s.match = match;
        s.airAt = 0;
        if (!s.stats.firstRaceAt) s.stats.firstRaceAt = now;
        this.sendTo(s, 'match', match.info(s));
    }
    endMatch(id, m) {
        this.matches.delete(id);
        for (const r of m.humans()) this.leaveMatch(r.s, false, true);
        m.dispose();
    }
    // back to where you were on the long run (or straight back into the queue: Chase Again)
    leaveMatch(s, again, ended) {
        const m = s.match;
        if (!m) return;
        if (!ended) m.humanLeft(s);
        s.match = null;
        const now = Date.now(), sp = s.cp >= 0 ? this.main.respawnOf(s.cp) : hubSpot();
        Object.assign(s.player, { ctx: '', prog: 0, place: 0, st: 0 });
        guardSend(s, sp.x, sp.y, sp.z, now);
        s.pub = { x: sp.x, y: sp.y, z: sp.z, ry: sp.ry || 0, a: 0, t: now };
        s.runClean = false; s.airAt = 0;
        this.sendTo(s, 'home', { x: sp.x, y: sp.y, z: sp.z, ry: sp.ry || 0, again: !!again });
        this.sendProfile(s);
        if (again && this.sessions.has(s.id)) { s.queuedAt = now; if (!this.queue.includes(s)) this.queue.push(s); this.state.queueN = this.queue.length; this.sendTo(s, 'queued', { on: 1 }); }
    }
    onLeaveMatch(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (s && s.match) this.leaveMatch(s, !!m.again);
    }

    // ----- driving -----
    setPublic(s, m, now) {
        const P = s.pub;
        P.x = m.x; P.y = m.y; P.z = m.z; P.ry = finite(m.ry) ? m.ry : 0; P.a = finite(m.a) ? clamp(m.a | 0, 0, 5) : 0;
        P.t = finite(m.ts) ? clamp(m.ts, now - 1500, now + 50) : now;
    }
    snapBack(s, why, now) {
        if (now - s.snapAt <= 300) return;
        s.snapAt = now;
        const L = s.last;
        this.sendTo(s, 'snap', { x: L.x, y: L.y, z: L.z });
        if (process.env.QA === '1') console.log('[snap]', s.profile.name, why, 'at', [L.x, L.y, L.z].map((v) => +v.toFixed(1)));
    }
    onMove(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.x) || !finite(m.y) || !finite(m.z)) return;
        const now = Date.now();
        if (s.match) { s.match.move(s, m, now); return; }
        const L = s.last, c = this.main;
        // just sent somewhere: the moves still on their way from where you were are dropped (no snap) until you've arrived
        if (s.homeAt) { if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 10) return; s.homeAt = 0; }
        const why = checkMove(s, c, m, now);
        if (why) { this.snapBack(s, why, now); return; }
        const x0 = L.x, y0 = L.y, z0 = L.z;
        L.x = m.x; L.y = m.y; L.z = m.z;
        this.setPublic(s, m, now);
        const t = s.pub.t;
        // the checkpoints: the next one, or a couple further if you've flown past
        const pad = c.padAt(m.x, m.y, m.z, s.cp + 1, 2);
        if (pad > s.cp) this.reachStage(s, pad, now);
        // a ring flown through (each once a run)
        const ri = c.ringCross(x0, y0, z0, m.x, m.y, m.z, 0, 1.2);
        if (ri >= 0 && !s.rings.has(ri)) this.ringPass(s, ri);
        // a key: yours for good
        const k = c.keyNear(m.x, m.y, m.z, 5);
        if (k && !s.profile.keysGot[k.i]) {
            const p = s.profile;
            p.keysGot[k.i] = 1; p.keys++;
            this.sendTo(s, 'key', { i: k.i, keys: p.keys });
            this.changed(s);
        }
        // big air: the time between leaving the road and landing on it again (timed by your own move stamps), paid when you land
        const air = m.a === 2 || m.a === 4 || m.a === 3;
        if (air) { if (!s.airAt) { s.airAt = t; s.airX = m.x; s.airZ = m.z; } }
        else if (s.airAt) {
            const secs = (t - s.airAt) / 1000, d = Math.hypot(m.x - s.airX, m.z - s.airZ);
            s.airAt = 0;
            const coins = Math.round(airCoins(Math.min(secs, 7)) * this.payK(s));
            if (coins > 0 && secs < 15 && d > secs * 14 && now - s.airPaidAt > 1500) {
                const p = s.profile;
                s.airPaidAt = now; p.airs = (p.airs || 0) + 1; s.stats.airs++;
                this.addCoins(s, coins);
                this.task(s, 'bigair', 1);
                this.sendTo(s, 'air', { secs: Math.round(secs * 10) / 10, coins });
            }
        }
        if (air) return;
        // the Getaway Tower: only when you've come all the way
        const at = c.atEnd(s.cp, m.x, m.y, m.z);
        if (at !== s.atFinish) { s.atFinish = at; this.sendTo(s, 'tower', { on: at }); }
    }
    ringPass(s, ri) {
        const p = s.profile, coins = Math.max(1, Math.round(RING_COINS * this.payK(s)));
        s.rings.add(ri);
        p.ringsAll = (p.ringsAll || 0) + 1; s.stats.rings++;
        this.addCoins(s, coins);
        this.task(s, 'rings', 1);
        this.sendTo(s, 'ring', { i: ri, coins });
    }
    // a new checkpoint: Coins, XP, it's where you come back to now
    reachStage(s, i, now) {
        const p = s.profile, c = this.main, first = i + 1 > (p.bestStage || 0), coins = Math.round(stageCoins(i, p.laps) * this.payK(s) * (first ? 1 : 0.5)), xp = Math.round(stageXp(i) * (first ? 1 : 0.5));
        // the clock starts at the first checkpoint of a run
        if (s.cp < 0) { s.runT0 = now; s.runClean = true; s.rings.clear(); this.sendTo(s, 'runstart', { t: now }); }
        s.cp = i;
        p.stage = i + 1;
        p.checkpoints = (p.checkpoints || 0) + 1;
        s.stats.cps++;
        s.combo = (s.combo || 0) + 1;
        s.diffMin = p.diff;
        if (first) { p.bestStage = i + 1; this.task(s, 'best', 1); this.task(s, 'stages', 1); }
        if (s.combo === 3) this.task(s, 'combo', 1);
        this.addCoins(s, coins);
        this.addXp(s, xp);
        this.sendTo(s, 'stage', { i, coins, xp, first });
        if (c.cps[i].world !== (i > 0 ? c.cps[i - 1].world : -1)) this.sendTo(s, 'world', { w: c.cps[i].world });
        this.changed(s);
    }
    // the Getaway Tower: a Trophy, and back to the Garage Deck for another run with bigger pay
    onClaim(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const c = this.main, L = s.last, p = s.profile;
        if (!c.atEnd(s.cp, L.x, L.y, L.z)) { this.toast(s, 'The Getaway Tower is at the end of the road', RED); return; }
        const now = Date.now(), time = s.runClean && s.runT0 ? now - s.runT0 : 0, R = finishReward(p.laps);
        p.laps = (p.laps || 0) + 1;
        s.stats.laps++;
        if (time && (!p.bestTime || time < p.bestTime)) { p.bestTime = time; p.timeScore = 1e9 - time; }
        p.stage = 0; s.cp = -1; s.combo = 0; s.runT0 = 0; s.runClean = false; s.atFinish = false; s.rings.clear();
        this.giveReward(s, R);
        const to = hubSpot();
        guardSend(s, to.x, to.y, to.z, now);
        s.pub = { x: to.x, y: 0, z: to.z, ry: 0, a: 0, t: now };
        this.sendTo(s, 'trophy', { laps: p.laps, time, rank: time ? rankOfTime(time).r : '', reward: R, text: rewardText(R), x: to.x, z: to.z });
        this.changed(s);
        this.broadcastBoards();
    }
    // stuck on a stage: Gems take you past it (no Coins for a stage you skipped, no best time for a run with a skip in it)
    onSkip(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const now = Date.now(), c = this.main;
        if (now - s.skipAt < 500 || s.cp >= c.cps.length - 1) return;
        s.skipAt = now;
        if (!this.pay(s, 'gems', skipCost(s.cp + 1), 'a skip')) return;
        const p = s.profile, i = s.cp + 1;
        s.cp = i; p.stage = i + 1; p.skipsUsed = (p.skipsUsed || 0) + 1; s.runClean = false; s.combo = 0;
        if (i + 1 > (p.bestStage || 0)) p.bestStage = i + 1;
        const sp = c.respawnOf(i);
        guardSend(s, sp.x, sp.y, sp.z, now);
        this.sendTo(s, 'skipped', { i, x: sp.x, y: sp.y, z: sp.z, ry: sp.ry });
        this.changed(s);
    }
    // back to your checkpoint
    onRespawn(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const now = Date.now();
        if (now - s.respawnAt < 100) return;
        s.respawnAt = now;
        s.stats.falls++;
        s.combo = 0; s.airAt = 0;
        if (s.match) { s.match.respawn(s, now); return; }
        const sp = s.cp >= 0 ? this.main.respawnOf(s.cp) : hubSpot();
        guardSend(s, sp.x, sp.y, sp.z, now);
    }
    // the quick ways: the Garage Deck, your last stage, the start of any world you've reached
    onWarp(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || s.match) return;
        const now = Date.now(), c = this.main, p = s.profile;
        if (now - s.warpAt < 500) return;
        s.warpAt = now;
        let to;
        if (m.to === 'last' && s.cp >= 0) { const r = c.respawnOf(s.cp); to = { x: r.x, y: r.y, z: r.z, ry: r.ry }; }
        else if (m.to === 'world' && finite(m.w)) {
            const w = clamp(m.w | 0, 0, WORLDS.length - 1), i = w * STAGES_PER_WORLD;
            if (i > 0 && p.bestStage < i + 1) { this.toast(s, '🔒 Reach ' + WORLDS[w].name + ' first', RED); return; }
            if (i === 0) { to = hubSpot(); s.cp = -1; p.stage = 0; } else { const r = c.respawnOf(i); to = { x: r.x, y: r.y, z: r.z, ry: r.ry }; s.cp = i; p.stage = i + 1; }
            s.runClean = false; s.diffMin = p.diff;
        } else to = hubSpot();
        s.runClean = false; s.airAt = 0;
        guardSend(s, to.x, to.y, to.z, now);
        this.sendTo(s, 'warped', { ...to, stage: p.stage });
        this.changed(s);
    }
    // ----- spending: upgrades, cars, paint, crates -----
    onUpgrade(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, u = upgradeById[m.id];
        if (!u) return;
        const n = p.ups[u.id] || 0;
        if (n >= u.max) return;
        if (p.lv < u.lv) { this.toast(s, '🔒 ' + u.name + ' opens at Level ' + u.lv, RED); return; }
        if (!this.pay(s, 'coins', upgradeCost(u, n), u.name)) return;
        p.ups[u.id] = n + 1; p.upgrades++;
        this.task(s, 'upgrade', 1);
        this.sendTo(s, 'bought', { what: 'upgrade', id: u.id, n: n + 1 });
        this.changed(s);
    }
    onCar(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, c = carById[m.id];
        if (!c) return;
        if (!p.cars[c.id]) {
            if (p.lv < c.lv) { this.toast(s, '🔒 The ' + c.name + ' opens at Level ' + c.lv, RED); return; }
            if (c.stars) { if (!this.pay(s, 'stars', c.stars, 'the ' + c.name)) return; } else if (!this.pay(s, 'coins', c.coins, 'the ' + c.name)) return;
            p.cars[c.id] = 1;
            this.sendTo(s, 'bought', { what: 'car', id: c.id });
        }
        p.car = c.id;
        this.changed(s);
    }
    onPaint(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, t = paintById[m.id];
        if (!t) return;
        if (!p.paints[t.id]) {
            if (p.lv < t.lv) { this.toast(s, '🔒 ' + t.name + ' opens at Level ' + t.lv, RED); return; }
            if (t.stars) { if (!this.pay(s, 'stars', t.stars, t.name + ' paint')) return; } else if (!this.pay(s, 'coins', t.coins, t.name + ' paint')) return;
            p.paints[t.id] = 1;
            this.sendTo(s, 'bought', { what: 'paint', id: t.id });
        }
        p.paint = t.id;
        this.changed(s);
    }
    onCrate(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, c = crateById[m.c], n = m.n === 3 ? 3 : 1;
        if (!c) return;
        if (p.lv < c.lv) { this.toast(s, '🔒 The ' + c.name + ' opens at Level ' + c.lv, RED); return; }
        if (m.keys) { if (!this.pay(s, 'keys', c.keys * n, c.name)) return; } else if (!this.pay(s, 'coins', c.coins * n, c.name)) return;
        const out = [];
        for (let i = 0; i < n; i++) {
            let r = Math.random() * c.items.reduce((a, x) => a + x.w, 0), id = c.items[0].id;
            for (const x of c.items) { r -= x.w; if (r < 0) { id = x.id; break; } }
            const isNew = !(p.exhausts[id] > 0);
            p.exhausts[id] = (p.exhausts[id] || 0) + 1;
            p.opened++; s.stats.opened++;
            this.task(s, 'crates', 1);
            out.push({ id, isNew });
            // the best you have goes on by itself
            if ((exhaustById[id].bonus || 0) > (exhaustById[p.exhaust].bonus || 0)) p.exhaust = id;
        }
        // every exhaust of a crate found: Gems, once
        const ci = CRATES.indexOf(c);
        if (!p.index[c.id] && c.items.every((x) => p.exhausts[x.id] > 0)) { p.index[c.id] = 1; p.gems += INDEX_GEMS[ci] || 10; this.sendTo(s, 'toastreward', { text: 'Collection complete: ' + c.name + '! +' + (INDEX_GEMS[ci] || 10) + ' 💎' }); }
        this.sendTo(s, 'opened', { c: c.id, out });
        this.changed(s);
    }
    onExhaust(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, id = String(m.id || '');
        if (!exhaustById[id] || !(p.exhausts[id] > 0)) return;
        p.exhaust = id;
        this.changed(s);
    }
    onDiff(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !finite(m.i)) return;
        const p = s.profile;
        p.diff = clamp(m.i | 0, 0, DIFFS.length - 1);
        s.diffMin = Math.min(s.diffMin, p.diff);
        this.changed(s);
    }
    // ----- rewards -----
    onDaily(client) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile, now = Date.now(), st = dailyStatus(p.daily, now);
        if (!st.can) return;
        p.daily = { last: dayKey(now), streak: st.streak + 1 };
        this.giveReward(s, DAILY[st.day], 'Daily reward: day ' + (st.day + 1) + '!');
        this.changed(s);
    }
    onGift(client, m) {
        const s = this.sessions.get(client.sessionId), i = m.i | 0, g = GIFTS[i];
        if (!s || !g || s.gifts[i] || s.playSecs < g.min * 60 - 2) return;
        s.gifts[i] = true;
        this.giveReward(s, g, 'FREE gift!');
        this.changed(s);
    }
    onCode(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const code = String(m.code || '').trim().toUpperCase().slice(0, 20), r = CODES[code];
        if (!r) { this.sendTo(s, 'code', { ok: false, text: 'That code doesn\'t work' }); return; }
        if (s.profile.codes[code]) { this.sendTo(s, 'code', { ok: false, text: 'You already used that code' }); return; }
        s.profile.codes[code] = true;
        this.giveReward(s, r);
        this.sendTo(s, 'code', { ok: true, text: 'Code redeemed: ' + rewardText(r, true) });
        this.changed(s);
    }
    onTut(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        if (finite(m.tut)) s.profile.tut = clamp(Math.max(s.profile.tut, m.tut | 0), 0, 99);
        if (typeof m.seen === 'string' && m.seen.length < 24) s.profile.seen[m.seen] = 1;
        markDirty();
    }
    onMeta(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const st = s.stats;
        if (typeof m.touch === 'boolean') st.touch = m.touch;
        if (finite(m.fps)) { const f = clamp(Math.round(m.fps), 0, 240); st.fps = f; st.fpsSum += f; st.fpsN++; st.fpsMin = st.fpsN === 1 ? f : Math.min(st.fpsMin, f); }
        if (typeof m.q === 'string') st.q = m.q.slice(0, 8);
        if (typeof m.gpu === 'string' && !st.gpu) st.gpu = m.gpu.slice(0, 90);
        if (finite(m.load) && !st.load) st.load = clamp(Math.round(m.load * 10) / 10, 0, 600);
        if (!st.dev && finite(m.w)) st.dev = { w: clamp(m.w | 0, 0, 9999), h: clamp(m.h | 0, 0, 9999), dpr: clamp(num(m.dpr, 1), 0, 8), cores: clamp(m.cores | 0, 0, 256), mem: clamp(num(m.mem, 0), 0, 1024) };
        for (const e of (Array.isArray(m.errs) ? m.errs : []).slice(0, 5)) if (typeof e === 'string' && st.errs.length < 8) st.errs.push(e.slice(0, 220));
    }
    broadcastBoards(client) {
        const row = (key, v) => topProfiles(key).filter((p) => v(p) > 0).map((p) => ({ n: p.name, v: v(p) }));
        const m = { stage: row('bestStage', (p) => Math.floor(p.bestStage || 0)), wins: row('wins', (p) => Math.floor(p.wins || 0)), time: row('timeScore', (p) => (p.timeScore ? 1e9 - p.timeScore : 0)) };
        if (client) client.send('boards', m); else this.broadcast('boards', m);
    }

    onQa(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s) return;
        const p = s.profile;
        if (finite(m.coins)) { p.coins += m.coins; p.totalCoins += Math.max(0, m.coins); }
        if (finite(m.gems)) p.gems += m.gems;
        if (finite(m.stars)) p.stars += m.stars;
        if (finite(m.keys)) p.keys += m.keys;
        if (finite(m.lv)) { p.lv = clamp(m.lv | 0, 1, 999); p.xp = 0; }
        if (finite(m.xp)) this.addXp(s, m.xp);
        if (finite(m.qi)) p.qi = clamp(m.qi | 0, 0, QUESTS.length);
        if (finite(m.races)) p.races = m.races | 0;
        if (finite(m.playSecs)) s.playSecs = m.playSecs | 0;
        if (m.tasks) { const jq = this.jqOf(p, Date.now()); for (const q of jq.list) q.p = TASKS[q.k].n; }
        if (finite(m.stage)) { p.stage = clamp(m.stage | 0, 0, STAGES); p.bestStage = Math.max(p.bestStage, p.stage); s.cp = p.stage - 1; }
        // a QA teleport: where the next move is checked from
        if (Array.isArray(m.tp) && m.tp.every(finite)) guardSend(s, m.tp[0], m.tp[1], m.tp[2], Date.now());
        this.changed(s);
    }

    // ----- Bloxity -----
    async onBloxityLogin(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || s.authing) return;
        s.authing = true;
        const legion = await verifyBloxityToken(m.token);
        s.authing = false;
        if (!legion || !this.sessions.has(client.sessionId)) return;
        const uid = 'legion_' + legion.id;
        if (s.profile.uid === uid) return;
        const name = cleanName(legion.name) || s.profile.name;
        const guestProfile = s.profile;
        guestProfile.lastSeen = Date.now();
        await adoptGuestProgress(uid, guestProfile.uid, name);
        await loadProfile(uid);
        if (!this.sessions.has(client.sessionId)) return;
        kickOthers(uid, s);
        s.profile = getProfile(uid, name, randomName());
        this.fixProfile(s.profile);
        s.profile.lastSeen = Date.now();
        if (!isOnline(guestProfile.uid)) releaseProfile(guestProfile.uid, isOnline);
        s.player.name = s.profile.name;
        s.cp = s.profile.stage - 1;
        this.changed(s);
        client.send('authed', { name: s.profile.name });
        this.toast(s, 'Logged in as ' + s.profile.name, GREEN);
        this.broadcastBoards();
    }
    onAvatar(client, m) { const s = this.sessions.get(client.sessionId); if (s && m) s.player.av = cleanAvatar(m.av); }
    onEmote(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.id !== 'string' || m.id.length > 40) return;
        this.broadcast('emote', { s: client.sessionId, id: m.id }, { except: client });
    }
    onChat(client, m) {
        const s = this.sessions.get(client.sessionId);
        if (!s || !m || typeof m.text !== 'string') return;
        const now = Date.now();
        if (now - s.lastChat < 800) return;
        s.lastChat = now;
        const text = m.text.replace(/\s+/g, ' ').trim().slice(0, 120);
        if (text) this.broadcast('chat', { s: client.sessionId, name: s.profile.name, text });
    }
}

// the same player somewhere else (another tab, another server): they leave there
function kickOthers(uid, keep) {
    for (const room of liveRooms) for (const o of room.sessions.values()) if (o.profile.uid === uid && o !== keep) { try { o.client.leave(4000); } catch (e) { /* gone */ } }
}
function isOnline(uid) {
    for (const room of liveRooms) for (const s of room.sessions.values()) if (s.profile.uid === uid) return true;
    return false;
}
void CARS; void PAINTS; void EXHAUSTS;
