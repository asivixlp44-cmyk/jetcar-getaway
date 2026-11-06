// One Police Chase on this server: up to 6 drivers on one course, the police closing in behind them, faster and faster. First to the
// Safehouse wins; whoever the cops catch is BUSTED. The phases: get ready (players can still take a bot's place), the chase, results.
// Humans drive on their own screens and send where they are; the server checks it, drives the bots, decides who's been caught and pays
// out. A player who leaves is taken over by a bot where they were. The course comes from the lowest level here: longer and harder as you level.
import { PlayerState } from './schema.js';
import { CFG, WORLDS, BOT_NAMES, BOT_SKILL, CHASE_TIERS, chaseTier, copS, chaseCoins, chaseXp, chaseGems, coinMult, CARS, PAINTS, EXHAUSTS, clamp } from '../../shared/config.js';
import { raceCourse, courseClock } from '../../shared/course.js';
import { newBody, stepBody, placeBody, EV } from '../../shared/physics.js';
import { newPilot, pilotStep, resetPilot } from '../../shared/pilot.js';
import { checkMove, initGuard, sendTo } from './guard.js';

export const PH = { READY: 0, RACE: 1, RESULTS: 2 };
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const botAvatar = () => JSON.stringify({ e: { skinId: String(Math.floor(Math.random() * 21)) }, p: { height: Math.round(rnd(0.92, 1.08) * 100) / 100 } });
const botSkill = (sk) => ({ speed: rnd(sk.speed[0], sk.speed[1]), slip: sk.slip });
// who starts where: the front row first (players, then bots)
const SEATS = [1, 0, 2, 4, 3, 5];

export class Match {
    constructor(room, id, humans, world) {
        this.room = room; this.id = id;
        this.world = world;
        // harder as the lowest level here goes up
        this.tier = chaseTier(Math.min(...humans.map((s) => s.profile.lv)));
        this.k = CHASE_TIERS[this.tier].k * (WORLDS[world].chase || 1);
        this.cops = CHASE_TIERS[this.tier].cops;
        this.stages = CHASE_TIERS[this.tier].stages;
        this.c = raceCourse(world, this.tier);
        // the bots drive a car about as good as a player at this tier has
        const t = Math.max(0, this.tier - 2);
        this.botStats = { top: CFG.top * (1 + 0.035 * t), jet: 1 + 0.045 * t, tank: CFG.tank * (1 + 0.12 * t), boostSecs: CFG.boostSecs };
        const now = Date.now();
        this.t0 = now + CFG.getReadySecs * 1000;
        this.phase = PH.READY;
        this.racers = new Map();
        this.size = Math.max(CFG.racers, humans.length);
        this.posT = 0; this.ended = false; this.resultsAt = 0; this.botN = 0; this.endAt = 0; this.finN = 0;
        humans.forEach((s, i) => this.addHuman(s, SEATS[i], now));
        const used = new Set(humans.map((s) => s.profile.name));
        for (let i = humans.length; i < this.size; i++) this.addBot(SEATS[i], used, now);
    }
    get time() { return (Date.now() - this.t0) / 1000; }
    info(s) { return { id: this.id, t0: this.t0, size: this.size, k: this.k, world: this.world, tier: this.tier, cops: this.cops, spot: s ? this.racerOf(s).spot : 0 }; }

    // ----- drivers -----
    newRacer(key, pl, spot, bot) {
        const r = { key, pl, spot, bot, s: null, cp: -1, sNow: 0, best: 0, finished: false, out: false, outAt: 0, place: 0, time: 0, falls: 0, finN: 0, body: null, pilot: null, dead: 0, a: 0 };
        this.racers.set(key, r);
        return r;
    }
    addHuman(s, spot, now) {
        const r = this.newRacer(s.id, s.player, spot, false);
        r.s = s; s.match = this;
        const sp = this.c.startSpot(spot);
        s.player.ctx = this.id; s.player.prog = 0; s.player.place = spot + 1; s.player.st = 0;
        initGuard(s, sp.x, sp.y, sp.z, now);
        s.spot = sp;
        return r;
    }
    addBot(spot, used) {
        let name;
        for (let k = 0; k < 20 && (!name || used.has(name)); k++) name = pick(BOT_NAMES) + (k > 12 ? k : '');
        used.add(name);
        const key = this.id + 'b' + (++this.botN), pl = new PlayerState(), sp = this.c.startSpot(spot);
        Object.assign(pl, { name, bot: true, pid: this.room.freePid(), ctx: this.id, lv: Math.floor(rnd(1, 24)), wins: Math.floor(rnd(0, 6)), place: spot + 1, coins: Math.floor(rnd(60, 3000)) });
        pl.car = pick(CARS.slice(0, 5)).id;
        pl.paint = Math.random() < 0.5 ? pick(PAINTS.slice(1, 12)).id : 'stock';
        pl.exh = Math.random() < 0.5 ? pick(EXHAUSTS.slice(1, 10)).id : 'stock';
        pl.av = botAvatar();
        this.room.state.players.set(key, pl);
        const r = this.newRacer(key, pl, spot, true);
        r.body = newBody(sp.x, sp.y, sp.z, sp.ry);
        r.pilot = newPilot(botSkill(BOT_SKILL[Math.floor(Math.random() * BOT_SKILL.length)]));
        // the start: not everyone's quick off the line
        r.startDelay = rnd(0.1, 0.7);
        return r;
    }
    racerOf(s) { return this.racers.get(s.id); }
    // a bot's place a late player can take
    canJoin(now) {
        if (this.phase > PH.RACE || now > this.t0 + CFG.joinLateSecs * 1000) return 0;
        let n = 0;
        for (const r of this.racers.values()) if (r.bot && !r.tookOver) n++;
        return n;
    }
    joinLate(s, now) {
        // the bot in the best place gives up its place (and its spot on the line)
        let pick2 = null;
        for (const r of this.racers.values()) if (r.bot && !r.tookOver && (!pick2 || SEATS.indexOf(r.spot) < SEATS.indexOf(pick2.spot))) pick2 = r;
        if (!pick2) return false;
        this.room.state.players.delete(pick2.key);
        this.racers.delete(pick2.key);
        this.addHuman(s, pick2.spot, now);
        return true;
    }
    humans() { const a = []; for (const r of this.racers.values()) if (!r.bot) a.push(r); return a; }
    // a player's gone: a bot carries on from where they were, under their name
    humanLeft(s) {
        const r = this.racers.get(s.id);
        if (!r) return;
        this.racers.delete(s.id);
        if (this.phase === PH.RESULTS || this.ended) return;
        const key = this.id + 'b' + (++this.botN), pl = new PlayerState();
        Object.assign(pl, { name: r.pl.name, bot: true, pid: this.room.freePid(), ctx: this.id, lv: r.pl.lv, wins: r.pl.wins, car: r.pl.car, paint: r.pl.paint, exh: r.pl.exh, av: r.pl.av, prog: r.pl.prog, place: r.pl.place, st: r.pl.st, coins: r.pl.coins });
        this.room.state.players.set(key, pl);
        const L = s.last, nr = this.newRacer(key, pl, r.spot, true);
        Object.assign(nr, { cp: r.cp, sNow: r.sNow, best: r.best, finished: r.finished, out: r.out, outAt: r.outAt, place: r.place, time: r.time, finN: r.finN, tookOver: true, startDelay: 0 });
        nr.body = newBody(L.x, L.y, L.z, s.pub.ry || 0);
        nr.body.onGround = false;
        nr.pilot = newPilot(botSkill(BOT_SKILL[1]));
        // on from the last checkpoint's route
        resetPilot(nr.pilot, this.c.routeOf(r.cp));
    }

    // ----- a human's move -----
    move(s, m, now) {
        const r = this.racers.get(s.id), c = this.c;
        if (!r) return;
        const L = s.last;
        if (s.homeAt) { if (now - s.homeAt < 30000 && Math.hypot(m.x - L.x, m.z - L.z) > 10) return; s.homeAt = 0; }
        const why = checkMove(s, c, m, now);
        // over the line before GO
        const st = c.start, ahead = (m.x - st.x) * st.fx + (m.z - st.z) * st.fz, before = this.phase === PH.READY && now < this.t0 - 100;
        if (why || (before && ahead > (c.barrierZ || 14) + 3)) { this.room.snapBack(s, why || 'early', now); return; }
        L.x = m.x; L.y = m.y; L.z = m.z;
        this.room.setPublic(s, m, now);
        if (r.finished || r.out) return;
        this.track(r, m.x, m.y, m.z, now);
    }
    // which checkpoint, how far along, the Safehouse
    track(r, x, y, z, now) {
        const c = this.c;
        const pad = c.padAt(x, y, z, r.cp + 1, 2);
        if (pad > r.cp) { r.cp = pad; if (r.s) this.room.sendTo(r.s, 'chasecp', { i: pad }); }
        const sn = c.sAt(r.cp, x, y, z);
        r.sNow = sn;
        if (sn > r.best) r.best = sn;
        if (this.phase !== PH.READY && c.atEnd(r.cp, x, y, z)) this.finish(r, now);
    }
    // back to your checkpoint (a crash, or you asked); before the chase, your place on the line
    respawn(s, now) {
        const r = this.racers.get(s.id);
        if (!r || r.out || r.finished) return;
        r.falls++;
        if (this.phase === PH.READY) { const sp = this.c.startSpot(r.spot); sendTo(s, sp.x, sp.y, sp.z, now); return; }
        const b = this.c.respawnOf(r.cp);
        sendTo(s, b.x, b.y, b.z, now);
    }
    finish(r, now) {
        if (r.finished || r.out) return;
        r.finished = true;
        r.finN = ++this.finN;
        r.time = Math.max(0, now - this.t0);
        r.pl.st = 1; r.pl.prog = 1;
        if (r.s) this.room.sendTo(r.s, 'escaped', { time: r.time, n: r.finN });
    }

    // ----- 20 times a second -----
    update(now, dt) {
        const t = (now - this.t0) / 1000, c = this.c;
        c.setTime(courseClock(now), dt);
        if (this.phase === PH.READY && now >= this.t0) this.phase = PH.RACE;
        for (const r of this.racers.values()) if (r.bot) this.driveBot(r, t, dt, now);
        if (this.phase === PH.RACE) this.copTick(t, now);
        this.posT -= dt;
        if (this.posT <= 0) { this.posT = 0.25; this.positions(); }
        if (this.phase === PH.RACE) {
            const hs = this.humans(), left = hs.filter((r) => !r.finished && !r.out).length;
            // everyone real is done: wind it up quickly
            if (hs.length && !left && !this.endAt) this.endAt = now + 1800;
            if (this.endAt && now >= this.endAt) this.results(now);
            if (!hs.length) this.ended = true;
        } else if (this.phase === PH.RESULTS) {
            if (now >= this.resultsAt) this.ended = true;
        }
    }
    // the lead cop's bumper: anyone it reaches is BUSTED
    copTick(t, now) {
        const s = copS(t, this.k);
        let left = 0;
        for (const r of this.racers.values()) {
            if (r.finished || r.out) continue;
            if (r.sNow < s) {
                r.out = true; r.outAt = now; r.pl.st = 2;
                this.room.broadcastTo(this.id, 'caught', { p: r.pl.pid });
                if (r.s) this.room.sendTo(r.s, 'busted', { secs: t });
            } else left++;
        }
        if (!left) this.results(now);
    }
    // the escaped by when, the driving by how far, the busted: the last caught first
    positions() {
        const list = [...this.racers.values()];
        list.sort((a, b) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished) return a.finN - b.finN;
            if (a.out !== b.out) return a.out ? 1 : -1;
            if (a.out) return b.outAt - a.outAt;
            return b.sNow - a.sNow;
        });
        const tot = this.c.total;
        list.forEach((r, i) => {
            if (r.pl.place !== i + 1) r.pl.place = i + 1;
            const pr = r.finished ? 1 : clamp(r.best / tot, 0, 1);
            if (Math.abs(pr - r.pl.prog) > 0.001) r.pl.prog = pr;
        });
    }
    // ----- the bots -----
    driveBot(r, t, dt, now) {
        const c = this.c, b = r.body, st = this.botStats;
        if (r.dead > 0) { r.dead -= dt; return; }
        if (r.out) return;
        if (r.finished) { b.spd *= 0.9; stepBody(b, { thr: -1, steer: 0, fly: false, top: st.top, jet: st.jet, tank: st.tank }, dt, c); this.pubBot(r); return; }
        if (this.phase === PH.READY || t < (r.startDelay || 0)) {
            // on the line, engine revving
            stepBody(b, { thr: 0, steer: 0, fly: false, top: st.top, jet: st.jet, tank: st.tank }, dt, c);
            b.yaw = c.start.ry;
            this.pubBot(r);
            return;
        }
        const P = pilotStep(r.pilot, b, c, c.time, dt, st);
        const ev = stepBody(b, { thr: P.thr, steer: P.steer, fly: P.fly, boost: P.boost, top: st.top * r.pilot.skill.speed, jet: st.jet, tank: st.tank, boostSecs: st.boostSecs, burnK: 1 }, dt, c);
        this.track(r, b.x, b.y, b.z, now);
        if (ev === EV.LETHAL || P.respawn) {
            const sp = c.respawnOf(r.cp);
            placeBody(b, sp.x, sp.y, sp.z, sp.ry); b.safeT = 0.5;
            resetPilot(r.pilot, c.routeOf(r.cp));
            r.dead = 0.6;
        }
        this.pubBot(r);
    }
    pubBot(r) {
        const b = r.body;
        r.a = b.knockT > 0 ? 3 : b.flying ? 4 : !b.onGround ? 2 : Math.abs(b.spd) > 2 ? 1 : 0;
    }
    // ----- the results: places, Coins, XP -----
    results(now) {
        if (this.phase === PH.RESULTS) return;
        this.phase = PH.RESULTS;
        this.resultsAt = now + CFG.resultsSecs * 1000;
        this.positions();
        const list = [...this.racers.values()].sort((a, b) => a.pl.place - b.pl.place), tot = this.c.total;
        const secsOf = (r) => (r.finished ? r.time : r.outAt ? r.outAt - this.t0 : now - this.t0) / 1000;
        const rows = list.map((r) => ({ n: r.pl.name, bot: r.bot, p: r.pl.place, t: Math.round(secsOf(r) * 10) / 10, f: r.finished, out: r.out, pr: Math.round(clamp(r.best / tot, 0, 1) * 1000) / 10, pid: r.pl.pid }));
        for (const r of list) {
            if (!r.s) continue;
            const s = r.s, p = s.profile, place = r.pl.place - 1, fr = r.finished ? 1 : clamp(r.best / tot, 0, 1), secs = secsOf(r);
            const got = Math.round(chaseCoins(fr, place, this.stages) * coinMult(p)), xp = chaseXp(fr, place, this.stages), gems = chaseGems(place, r.finished);
            p.races = (p.races || 0) + 1;
            this.room.task(s, 'chase', 1);
            if (r.finished) { p.escapes = (p.escapes || 0) + 1; this.room.task(s, 'escape', 1); }
            if (place < 3) p.podiums = (p.podiums || 0) + 1;
            if (place === 0 && r.finished) p.wins = (p.wins || 0) + 1;
            p.gems += gems;
            s.stats.races++;
            if (place === 0 && r.finished) s.stats.wins++;
            this.room.addCoins(s, got);
            this.room.addXp(s, xp);
            this.room.sendTo(s, 'results', { rows, me: { place, finished: r.finished, out: r.out, secs, coins: got, xp, gems, pct: Math.round(fr * 1000) / 10, stages: this.stages } });
            this.room.changed(s);
        }
    }
    dispose() {
        for (const r of this.racers.values()) if (r.bot) this.room.state.players.delete(r.key);
        this.racers.clear();
    }
}
