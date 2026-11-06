import { Client } from '@colyseus/sdk';
import { T, V3, $, canvas, scene, camera, sun, renderer, updateSky, SUN_DIRECTION, GPU_NAME, setMood, updateEffects, billboard, prompts, moodFog } from './engine.js';
import { S, actions, net, prof } from './state.js';
import { CU, setEpoch, rel } from './clock.js';
import { initAudio, resumeAudio, audioDebug, startMusic, sfx, setVolume, audioSuspended, setMusicMode, setMusicIntensity, toggleMusic, playAsmr, prerenderMusic, allowLiveMusic } from './audio.js';
import { buildAsmr } from './asmr.js';
import { buildMotor, updateMotor } from './motor.js';
import * as BX from './bloxity.js';
import { createAvatar, loadBase, packAvatar } from './avatar.js';
import { pad, pollGamepad, rumble } from './gamepad.js';
import * as FX from './fx.js';
import { render, updateFx, setQuality, getQuality, autoQualityAllowed, shadowDue, setResScale, getResScale, fxWarmGroup, fxShowAll, updateAmbient, setSpeedLines, confetti, screenConfetti } from './fx.js';
import { buildCourseView } from './world.js';
import { setCityWorld, updateGround } from './city.js';
import { tileTexture, uClock } from './surfaces.js';
import { hubDecorate } from './hub.js';
import { installIcons } from './icons.js';
import * as SH from './shadows.js';
import { Car, beginCars, endCars, carsWarm, addCop, addShowCar, updateShowCars, pumpAvatars, avatarsPending } from './car.js';
import { Track, pingSend, onPong, pingEvery } from './smooth.js';
import {
    toast, bigText, popup, notEnough, animateCounters, bump, updateHud, openPanel, panelIs, refreshPanels, closeTop, anyPopup, codeResult, warmPanels, levelUp, measureHud, flyCoins,
    showCrate, countText, showCard, hideCard, raceReset, raceDot, raceInfo, showResults, closeResults, playersList, showTower, closeTower, showTrophy, hudGas, hudSpeed, hudBoost, airWord,
} from './ui.js';
import { CFG, TASKS, WORLDS, STAGES, STAGES_PER_WORLD, exhaustById, dailyStatus, clamp, xpNeed, statsOf, diffOf, copS, clock, worldOfStage, skipCost, KMH } from '../../shared/config.js';
import { newBody, stepBody, placeBody, EV } from '../../shared/physics.js';
import { mainCourse, raceCourse, courseClock, HUB, TAU, GROUND_Y, SHOW_DZ } from '../../shared/course.js';
import { newPilot, pilotStep, resetPilot } from '../../shared/pilot.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
function storageGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function storageSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pause = () => new Promise((r) => setTimeout(r, 0));
const RND = Math.random;
const wrapA = (a) => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };

// =====================================================================================
// What's on screen: the long run, or a chase's course
// =====================================================================================
let view = null, world = null, mainView = null, raceView = null, raceKey = '', hubBits = null, switching = false, worldNow = -1;
function buildMainView() {
    const low = getQuality() === 'low', G = mainCourse();
    hubBits = hubDecorate({ course: G, low, open: (k, t) => openPanel(k, t), chase: () => startQueue(), onHub: () => !match });
    mainView = buildCourseView(G, { low, decorate: hubBits.decorate, extras: hubBits.extras });
    hubBits.after(mainView.group, camera);
    // a show car turning beside each stall
    [['cars', 'zephyr', 'sky'], ['paint', 'hornet', 'racer'], ['crates', 'tidal', 'mint'], ['ups', 'blaze', 'flame']].forEach(([k, car, paint], i) => addShowCar(HUB[k].x, 0.66, HUB[k].z - SHOW_DZ, i, car, paint, 0.5));
    view = mainView; world = G;
    scene.add(mainView.group);
    view.activate();
    applyWorld(0, true);
}
function raceViewFor(w, tier) {
    const key = w + '.' + tier;
    if (raceKey === key && raceView) return raceView;
    if (raceView) raceView.dispose();
    raceKey = key;
    raceView = buildCourseView(raceCourse(w, tier), { low: getQuality() === 'low' });
    return raceView;
}
function showView(v) {
    if (view === v) return;
    if (view) { view.group.visible = false; if (view.group.parent) scene.remove(view.group); }
    view = v; world = v.c;
    scene.add(v.group);
    v.group.visible = true;
    v.activate();
}
// each world has its sky, its city, what drifts in the air
const AMB = {
    city: { color: 0xffffff, dir: 0.25, snow: false }, mesa: { color: 0xffe0b0, dir: 0.5, snow: false },
    neon: { color: 0x5af4ff, dir: 0.4, snow: false }, glacier: { color: 0xffffff, dir: -0.6, snow: true },
};
let ambNow = AMB.city;
function applyWorld(w, now) {
    if (w === worldNow) return;
    worldNow = w;
    const id = WORLDS[w].id;
    setMood(id, now);
    setCityWorld(w, now);
    ambNow = AMB[id] || AMB.city;
    void moodFog;
}

// =====================================================================================
// You: the shared physics (shared/physics.js) on your screen, every frame
// =====================================================================================
const P = {
    b: newBody(HUB.spawn.x, 0, HUB.spawn.z, 0), moving: false, auto: null, pilot: null, frozen: false, snaps: 0, cp: -1, finished: false, out: false, hits: 0, respawns: 0,
    bestS: 0, flyHeld: false, boostPress: -9, flipPress: -9, flipT: 0, airT: 0, lastLandAt: 0, crashT: 0, steer: 0, thr: 0,
};
let me = null, localAvatarReq = 0, match = null, queued = false;
function buildMe() {
    if (me) me.dispose();
    me = new Car({ name: S.name, lv: S.lv, wins: S.laps, noLabel: true, car: S.car, paint: S.paint, exh: S.exhaust });
    setupLocalAvatar();
}
async function setupLocalAvatar() {
    const req = ++localAvatarReq;
    const a = await createAvatar(BX.currentAvatar(), BX.getSkinTextureUrl());
    if (!a) return;
    if (req !== localAvatarReq || !me) { a.dispose(); return; }
    me.wear(a);
}
function syncMyAvatar() {
    const av = BX.currentAvatar();
    if (me && me.blox && av) { me.blox.setProportions(av.proportions); me.blox.setEquipped(av, BX.getSkinTextureUrl()); }
    net.send('avatar', { av: packAvatar(av) });
}
function teleport(x, y, z, yaw) {
    const b = P.b;
    placeBody(b, x, y, z, yaw ?? b.yaw);
    b.tank = myStats().tank; b.gas = b.tank;
    camSnap = true;
    if (view) view.prepareAt(x, y, z);
    if (yaw !== undefined) cam.yaw = yaw;
    sendMove(true);
}
const courseTime = () => courseClock(net.now());
function panOf(x, z) {
    const dx = x - camera.position.x, dz = z - camera.position.z;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    return clamp(-(dx * rx + dz * rz) / 40, -0.8, 0.8);
}
let statsKey = '', statsNow = statsOf(S);
function myStats() {
    const k = S.car + '|' + JSON.stringify(S.ups || {});
    if (k !== statsKey) { statsKey = k; statsNow = statsOf(S); }
    return statsNow;
}
// back to your checkpoint: a crash, a laser, or you asked
function doRespawn(why) {
    if (P.out || P.finished || switching) return;
    const c = world, b = P.b;
    if (why === 'fall') { sfx('whoosh'); } else if (why === 'trap') { sfx('crash'); FX.poofFx(b); } else sfx('whoosh');
    P.respawns++;
    net.send('respawn', {});
    if (match && match.phase0) { const sp = c.startSpot(match.spot); teleport(sp.x, sp.y, sp.z, sp.ry); return; }
    const sp = P.cp >= 0 || !c.main ? c.respawnOf(P.cp) : { x: HUB.spawn.x, y: 0.2, z: HUB.spawn.z, ry: 0 };
    teleport(sp.x, sp.y, sp.z, sp.ry);
    b.safeT = 1.2;
    const f = $('#fade');
    f.style.transition = 'none'; f.style.opacity = 0.75; requestAnimationFrame(() => { f.style.transition = ''; f.style.opacity = 0; });
    if (P.pilot) resetPilot(P.pilot, c.routeOf(P.cp));
    sfx('respawn');
}
const stepInp = { thr: 0, steer: 0, fly: false, boost: false, top: CFG.top, jet: 1, tank: CFG.tank, boostSecs: CFG.boostSecs, burnK: 1 };
const carSt = { x: 0, y: 0, z: 0, yaw: 0, spd: 0, vy: 0, air: false, fly: false, boost: false, steer: 0, knocked: false, far: false, local: true, flyHeld: false, grade: 0, snap: false, lowFx: false };
function updateMe(dt) {
    const t = clockT, b = P.b, c = world, ct = courseTime(), st = myStats();
    c.setTime(ct, dt);
    uClock.value = ct;
    let thr = 0, steer = 0;
    if (keys.KeyW || keys.ArrowUp) thr += 1;
    if (keys.KeyS || keys.ArrowDown) thr -= 1;
    if (keys.KeyD || keys.ArrowRight) steer += 1;
    if (keys.KeyA || keys.ArrowLeft) steer -= 1;
    // the stick: up drives, down brakes, across steers (a dead zone in the middle; a push mostly sideways still drives a little)
    if (touchMove.on) {
        const ty = -touchMove.y, tx = touchMove.x;
        steer += Math.abs(tx) > 0.12 ? Math.sign(tx) * Math.min(1, (Math.abs(tx) - 0.12) / 0.7) : 0;
        thr += ty > 0.2 ? 1 : ty < -0.45 ? -1 : (Math.abs(tx) > 0.3 ? 0.85 : 0);
    }
    steer += pad.lx;
    thr += pad.rt - pad.lt + (pad.held.has('A') && !pad.rt ? 0 : 0);
    let fly = !!(keys.Space || touchFly || (pad.held && pad.held.has('A')));
    let boost = t - P.boostPress < 0.12;
    if (P.auto) {
        P.auto(dt, ct);
        const a = P.autoInp;
        thr = a.thr; steer = a.steer; fly = a.fly; boost = a.boost;
    }
    P.frozen = anyPopup() || switching || P.out;
    if (P.frozen && !P.auto) { thr = 0; steer = 0; fly = false; boost = false; }
    // before GO: the engine revs, the car stays put
    if (match && match.phase0) thr = Math.min(0, thr);
    P.thr = clamp(thr, -1, 1); P.steer = clamp(steer, -1, 1); P.flyHeld = fly;
    stepInp.thr = P.thr; stepInp.steer = P.steer; stepInp.fly = fly; stepInp.boost = boost; stepInp.top = st.top; stepInp.jet = st.jet; stepInp.tank = st.tank; stepInp.boostSecs = st.boost; stepInp.burnK = diffOf(S.diff ?? 1).burn;
    const was = b.onGround, vy0 = b.vy, spd0 = b.spd;
    const ev = P.out ? 0 : stepBody(b, stepInp, dt, c);
    if (boost && ev === EV.BOOST) P.boostPress = -9;
    // the line before GO
    if (match && match.phase0 && c.barrierZ !== undefined && b.z > c.start.z + c.barrierZ - 2.5) { b.z = c.start.z + c.barrierZ - 2.5; b.spd = Math.min(b.spd, 0); b.vz = Math.min(0, b.vz); }
    if (!b.onGround) P.airT += dt; else P.airT = 0;
    if (ev === EV.TAKEOFF) { sfx('takeoff'); FX.dust(FX.tmpV.set(b.x, b.y + 0.3, b.z), 6, 1, 0xe8ecf4); fovKick = Math.max(fovKick, 2); rumble(0.2, 80); }
    else if (ev === EV.BOOST || ev === EV.PAD) { sfx('boost'); fovKick = 7; shake = Math.max(shake, 0.12); rumble(0.4, 160); }
    else if (ev === EV.LAND) {
        const k = clamp(-vy0 / 40, 0.15, 1.5);
        if (me) me.squash(k);
        playAsmr('land', 0.25 + k * 0.35, 0.8 + RND() * 0.1);
        if (k > 0.5) { FX.dust(FX.tmpV.set(b.x, b.y + 0.2, b.z), 10, k, 0xd8dce4); shake = Math.max(shake, 0.1 * k); rumble(0.3 * k, 120); }
        P.lastLandAt = t;
    } else if (ev === EV.BUMP) { sfx('crash'); shake = Math.max(shake, 0.25); if (me) me.squash(0.8); rumble(0.5, 140); FX.popSpark(FX.tmpV.set(b.x + Math.sin(b.yaw) * 3, b.y + 1.2, b.z + Math.cos(b.yaw) * 3), 0xffe24a); P.hits++; }
    else if (ev === EV.KNOCK) { P.hits++; sfx('crash'); shake = Math.max(shake, 0.35); rumble(0.7, 200); FX.popSpark(FX.tmpV.set(b.x, b.y + 2, b.z), 0xffe24a); }
    else if (ev === EV.LETHAL) { doRespawn(b.y < c.groundY + 4 || b.y < b.fromY - CFG.fallKill ? 'fall' : 'trap'); return; }
    // tyre smoke on a hard turn at speed
    if (b.onGround && Math.abs(P.steer) > 0.8 && Math.abs(b.spd) > 38 && getQuality() !== 'low' && RND() < 0.35) FX.skidPuff(b.x - Math.sin(b.yaw) * 2.5, b.y + 0.3, b.z - Math.cos(b.yaw) * 2.5, 1.1);
    // a flip in the air, for the fun of it
    if (P.flipT > 0) { P.flipT -= dt; if (b.onGround) P.flipT = 0; }
    if (t - P.flipPress < 0.15 && !b.onGround && P.flipT <= 0 && P.airT > 0.15) { P.flipPress = -9; P.flipT = 0.7; sfx('whoosh'); airWord('FLIP!'); }
    P.moving = Math.abs(b.spd) > 1 || !b.onGround;
    if (me) {
        carSt.x = b.x; carSt.y = b.y; carSt.z = b.z; carSt.yaw = b.yaw; carSt.spd = b.spd; carSt.vy = b.vy; carSt.air = !b.onGround; carSt.fly = b.flying; carSt.boost = b.boostT > 0;
        carSt.steer = P.steer; carSt.knocked = b.knockT > 0; carSt.flyHeld = fly && b.gas > 0; carSt.grade = b.grade; carSt.snap = true; carSt.lowFx = getQuality() === 'low';
        me.update(dt, t, carSt);
        if (P.flipT > 0) me.tilt.rotation.z += (1 - P.flipT / 0.7) * TAU;
    }
    void was; void spd0;
    sendMove(false);
}

// =====================================================================================
// The camera: behind you, a little above, easing round to look the way you're heading; drag to look about
// =====================================================================================
const cam = { yaw: 0, pitch: 0.2, dist: 15, look: 0, lookP: 0 };
let camD = 15, camSens = 1, camSnap = true, shake = 0, fovKick = 0, dragAt = -9, camFollow = storageGet('jc1_camfollow') !== '0';
actions.camFollow = () => camFollow;
actions.toggleCam = () => { camFollow = !camFollow; storageSet('jc1_camfollow', camFollow ? '1' : '0'); };
const pivotV = new V3(), camPos = new V3(), lookV = new V3(), dirV = new V3();
let pivotY = 4;
const LZD = SUN_DIRECTION.clone().normalize(), LX = new V3(0, 1, 0).cross(LZD).normalize(), LY = LZD.clone().cross(LX), snapV = new V3();
function snapShadow(p) {
    const c = sun.shadow.camera, texel = (c.right - c.left) / sun.shadow.mapSize.x;
    const a = Math.round(p.dot(LX) / texel) * texel, b = Math.round(p.dot(LY) / texel) * texel;
    snapV.copy(LX).multiplyScalar(a).addScaledVector(LY, b).addScaledVector(LZD, p.dot(LZD));
    sun.target.position.copy(snapV);
    sun.position.copy(snapV).addScaledVector(LZD, 200);
}
function rayHit(o, d, maxT) {
    const c = world;
    for (let s = 3; s < maxT; s += 2) if (c.solidAt(o.x + d.x * s, o.y + d.y * s, o.z + d.z * s)) return s - 1.4;
    return maxT;
}
function updateCamera(dt) {
    const b = P.b, portrait = innerWidth < innerHeight;
    // the way you're heading (where you're going, when you're going fast; where the car points at a crawl)
    const hv = Math.hypot(b.vx, b.vz), head = hv > 12 ? Math.atan2(b.vx, b.vz) : b.yaw;
    const free = clockT - dragAt < 1.6;
    if (!free && camFollow) { cam.look *= Math.exp(-dt * 3); cam.lookP *= Math.exp(-dt * 3); }
    const want = head + cam.look;
    if (camSnap) cam.yaw = want; else cam.yaw += wrapA(want - cam.yaw) * (1 - Math.exp(-dt * (b.onGround ? 4.5 : 2.6)));
    const gy = b.y + 2.4;
    if (camSnap || pivotV.distanceToSquared(FX.tmpV.set(b.x, gy, b.z)) > 900) { pivotV.set(b.x, gy, b.z); pivotY = gy; }
    else {
        const kx = 1 - Math.exp(-dt * 20);
        pivotV.x += (b.x - pivotV.x) * kx; pivotV.z += (b.z - pivotV.z) * kx;
        pivotY += (gy - pivotY) * (1 - Math.exp(-dt * (b.onGround ? 12 : 7)));
        pivotV.y = pivotY;
    }
    const spdK = clamp(Math.abs(b.spd) / CFG.top, 0, 1.4);
    const pitch = clamp(cam.pitch + cam.lookP + (b.onGround ? 0 : 0.06) + spdK * 0.02, -0.25, 1.2);
    let dist = cam.dist + spdK * 2.6 + (portrait ? 3.5 : 0);
    const cp = Math.cos(pitch);
    dirV.set(-Math.sin(cam.yaw) * cp, Math.sin(pitch), -Math.cos(cam.yaw) * cp);
    dist = Math.max(4, Math.min(dist, rayHit(pivotV, dirV, dist + 1) - 0.6));
    camD = dist < camD || camSnap ? dist : camD + (dist - camD) * (1 - Math.exp(-dt * 4));
    camPos.copy(pivotV).addScaledVector(dirV, camD);
    if (camPos.y < GROUND_Y + 3) camPos.y = GROUND_Y + 3;
    camera.position.copy(camPos);
    lookV.set(pivotV.x + Math.sin(cam.yaw) * 8, pivotV.y + 0.6 - (portrait ? 0.4 : 0), pivotV.z + Math.cos(cam.yaw) * 8);
    camera.lookAt(lookV);
    if (shake > 0.001) { const s = shake * shake * 0.8; camera.position.x += (RND() * 2 - 1) * s; camera.position.y += (RND() * 2 - 1) * s; shake = Math.max(0, shake - dt * 2.4); }
    // faster: the view widens a touch; a boost widens it more, easing back
    fovKick = Math.max(0, fovKick - dt * 6);
    const want2 = (portrait ? 80 : 64) + spdK * 8 + fovKick + (b.boostT > 0 ? 4 : 0);
    if (Math.abs(camera.fov - want2) > 0.01) { camera.fov += (want2 - camera.fov) * Math.min(1, dt * 6); camera.updateProjectionMatrix(); }
    if (P.photo) P.photo(camera);
    camera.updateMatrixWorld();
    camSnap = false;
    setSpeedLines(clamp((Math.abs(b.spd) - 52) / 30, 0, 1) + (b.boostT > 0 ? 0.4 : 0), dt);
}

// =====================================================================================
// Input
// =====================================================================================
const keys = {};
const touchMove = { x: 0, y: 0, on: false };
let running = false, touchFly = false;
actions.onPanel = () => { for (const k in keys) keys[k] = false; touchFly = false; };
const pressBoost = () => { P.boostPress = clockT; };
const pressFlip = () => { P.flipPress = clockT; };
addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) { if (e.key === 'Enter') e.target.blur(); return; }
    if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
    if (!running) return;
    if (e.code === 'Escape' && !e.repeat) { if (closeTop()) return; if (BX.isEmbedded()) BX.showPortalMenu(); else openPanel('settings'); return; }
    keys[e.code] = true;
    if (e.repeat || anyPopup()) return;
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') pressBoost();
    if (e.code === 'KeyF') pressFlip();
    if (e.code === 'KeyE') { if (activePrompt) usePrompt(); }
    if (e.code === 'KeyR') backToCheckpoint();
    if (e.code === 'KeyQ') openPanel('quests');
    if (e.code === 'KeyG') openPanel('garage');
    if (e.code === 'KeyT') openPanel('teleport');
    if (e.code === 'Enter' && !match) { if (queued) cancelQueue(); else startQueue(); }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touchFly = false; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const drags = new Map();
canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    if (!running || anyPopup()) return;
    canvas.setPointerCapture(e.pointerId);
    drags.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false });
});
canvas.addEventListener('pointermove', (e) => {
    const d = drags.get(e.pointerId);
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 6) d.moved = true;
    if (d.moved) {
        const k = (e.pointerType === 'touch' ? 0.0068 : 0.0045) * camSens;
        cam.look = clamp(cam.look - (e.clientX - d.x) * k, -2.6, 2.6);
        cam.lookP = clamp(cam.lookP + (e.clientY - d.y) * k, -0.4, 0.9);
        dragAt = clockT;
    }
    d.x = e.clientX; d.y = e.clientY;
});
const endDrag = (e) => { drags.delete(e.pointerId); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 1.5, 9, 30); e.preventDefault(); }, { passive: false });
(function touchControls() {
    const stick = $('#stick'), knob = $('#knob');
    let id = null, cx = 0, cy = 0, R = 50;
    const set = (e) => {
        let dx = e.clientX - cx, dy = e.clientY - cy;
        const l = Math.hypot(dx, dy);
        if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`;
        touchMove.x = dx / R; touchMove.y = dy / R;
    };
    // (where the stick is, read once as the finger lands: never in the frame loop)
    stick.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = stick.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; R = r.width / 2; stick.setPointerCapture(id); touchMove.on = true; set(e); });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId !== id) return; id = null; knob.style.transform = ''; touchMove.x = touchMove.y = 0; touchMove.on = false; };
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end);
    const hold = (el, on, off) => {
        el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); on(); });
        const up = () => { el.classList.remove('on'); if (off) off(); };
        el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    hold($('#flyBtn'), () => { touchFly = true; }, () => { touchFly = false; });
    hold($('#boostBtn'), pressBoost);
    hold($('#flipBtn'), pressFlip);
})();

// ----- proximity prompts (the stalls, the chase gate) -----
let activePrompt = null, autoDone = null;
const pv = new V3();
function updatePrompt() {
    let best = null, bd = 1e9;
    const b = P.b;
    if (!anyPopup() && b.y < 6 && !match && world && world.main) for (const p of prompts) { if (p.on && !p.on()) continue; const d = Math.hypot(p.pos.x - b.x, p.pos.z - b.z); if (d < p.r && d < bd) { bd = d; best = p; } }
    // driving into the chase gate's ring queues you (once each time you drive in)
    if (best && best.auto) { if (autoDone !== best && !queued) { autoDone = best; best.act(); } best = null; } else if (!best || !best.auto) { if (!best) autoDone = null; }
    activePrompt = best;
    const el = $('#promptBtn');
    if (!best) { if (!el.hidden) el.hidden = true; return; }
    pv.copy(best.pos).setY(best.pos.y + 6).project(camera);
    if (pv.z > 1) { el.hidden = true; return; }
    el.hidden = false;
    const lbl = best.label();
    if ($('#promptTxt').textContent !== lbl) $('#promptTxt').textContent = lbl;
    el.style.transform = `translate(${((pv.x + 1) / 2 * innerWidth).toFixed(0)}px, ${((1 - pv.y) / 2 * innerHeight).toFixed(0)}px) translate(-50%, -110%)`;
}
function usePrompt() { if (activePrompt) { sfx('click'); activePrompt.act(); } }
$('#promptBtn').addEventListener('click', usePrompt);

// ----- controller -----
function padButtons() {
    if (!pad.connected || !running) return;
    if (pad.pressed.has('BACK') || pad.pressed.has('START')) { if (!closeTop()) openPanel('settings'); return; }
    if (anyPopup()) { if (pad.pressed.has('B')) closeTop(); return; }
    if (pad.pressed.has('X')) pressBoost();
    if (pad.pressed.has('Y')) pressFlip();
    if (pad.pressed.has('B')) { if (activePrompt) usePrompt(); else backToCheckpoint(); }
    if (pad.pressed.has('LB')) openPanel('quests');
    if (pad.pressed.has('RB')) openPanel('garage');
}

// =====================================================================================
// Everyone else you can see (smoothed on the server's clock)
// =====================================================================================
const remotes = new Map(), byPid = new Map();
const smp = { x: 0, y: 0, z: 0, ry: 0, a: 0, speed: 0 };
const rSt = { x: 0, y: 0, z: 0, yaw: 0, spd: 0, vy: 0, air: false, fly: false, boost: false, steer: 0, knocked: false, far: false, local: false, grade: 0, snap: false, lowFx: false };
class Remote {
    constructor(p, id) {
        this.id = id; this.p = p; this.pid = p.pid;
        this.car = new Car({ name: p.name, lv: p.lv, wins: p.wins, car: p.car, paint: p.paint, exh: p.exh });
        this.car.setAvatar(p.av);
        this.car.setVisible(false);
        this.av = p.av; this.track = new Track(); this.air = false; this.prevY = 0; this.vy = 0; this.minVy = 0; this.prevYaw = 0; this.steer = 0;
    }
    update(dt, t, now) {
        const p = this.p;
        if (switching || !this.track.sample(now - this.track.delayFor(dt), smp, dt)) { this.car.setVisible(false); return; }
        const knocked = smp.a === 3, air = smp.a === 2 || smp.a === 4 || knocked, vy = dt > 0 ? (smp.y - this.prevY) / dt : 0;
        this.vy += (vy - this.vy) * Math.min(1, dt * 10);
        if (air) this.minVy = Math.min(this.minVy, this.vy);
        if (this.air && !air) { this.car.squash(clamp(-this.minVy / 40, 0.15, 1)); this.minVy = 0; landAt(smp.x, smp.y, smp.z); }
        this.air = air; this.prevY = smp.y;
        // how hard they're turning, from how fast their heading changes
        const turn = dt > 0 ? wrapA(smp.ry - this.prevYaw) / dt : 0;
        this.prevYaw = smp.ry;
        this.steer += (clamp(-turn / 1.6, -1, 1) - this.steer) * Math.min(1, dt * 6);
        if (p.av !== this.av) { this.av = p.av; this.car.setAvatar(p.av); }
        this.car.setCar(p.car, p.paint); this.car.setExhaust(p.exh);
        const d2 = camera.position.distanceToSquared(FX.tmpV.set(smp.x, smp.y, smp.z)), near = d2 < 520 * 520 && d2 > (this.car.shown ? 70 : 110) && p.st !== 2;
        this.car.setVisible(near);
        this.x = smp.x; this.y = smp.y; this.z = smp.z;
        if (near) {
            const far = d2 > 160 * 160;
            if (!far) this.car.setLabel(p.name, p.lv, p.wins);
            rSt.x = smp.x; rSt.y = smp.y; rSt.z = smp.z; rSt.yaw = smp.ry; rSt.spd = smp.speed; rSt.vy = this.vy; rSt.air = air; rSt.fly = smp.a === 4; rSt.boost = false; rSt.steer = this.steer; rSt.knocked = knocked; rSt.far = far; rSt.lowFx = getQuality() === 'low';
            this.car.update(dt, t, rSt);
        }
    }
    dispose() { this.car.dispose(); byPid.delete(this.pid); }
}
function landAt(x, y, z) {
    const d = Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z);
    if (d < 80) playAsmr('land', 0.22 * (1 - d / 80), 0.85, panOf(x, z));
}
let rosterT = 0;
const seenIds = new Set();
function updateRoster() {
    const room = net.room;
    if (!room || !room.state || !room.state.players) return;
    const ctx = match ? match.id : '';
    seenIds.clear();
    room.state.players.forEach((p, id) => {
        if (id === room.sessionId) {
            if (S.name !== p.name) S.name = p.name;
            P.pid = p.pid; P.pub = p;
            return;
        }
        if (p.ctx !== ctx) return;
        seenIds.add(id);
        let r = remotes.get(id);
        if (!r) { r = new Remote(p, id); remotes.set(id, r); byPid.set(p.pid, r); }
    });
    for (const [id, r] of remotes) if (!seenIds.has(id)) { r.dispose(); remotes.delete(id); }
}
function onSnaps(m) {
    const l = m.l, t0 = m.t;
    for (let i = 0; i + 6 < l.length; i += 7) {
        const r = byPid.get(l[i]);
        if (r) r.track.push(t0 - l[i + 6], l[i + 1] / 20, l[i + 2] / 20, l[i + 3] / 20, l[i + 4] / 100, l[i + 5]);
    }
}
function updateRemotes(dt, t) {
    rosterT -= dt;
    if (rosterT <= 0) { rosterT = 0.25; updateRoster(); }
    const now = net.now();
    for (const r of remotes.values()) r.update(dt, t, now);
}

// =====================================================================================
// The queue and the chase
// =====================================================================================
let qaWorld;
function startQueue() {
    if (match || queued || switching) return;
    net.send('queue', { on: true, world: qaWorld });
    setQueued(true);
}
function cancelQueue() { net.send('queue', { on: false }); setQueued(false); }
function setQueued(on) {
    queued = on;
    document.body.classList.toggle('queued', on);
    const d = $('#queueDots');
    if (on && !d.children.length) d.innerHTML = '<i></i>'.repeat(CFG.racers);
    queueShown = '';
    updateQueue();
}
let queueShown = '', dismissed = 0;
function updateQueue() {
    if (!net.room || !net.room.state) return;
    const st = net.room.state, end = st.queueEnd || 0, leftMs = end - net.now(), open = !match && !switching && (queued || (leftMs > 0 && dismissed !== end)), box = $('#queueBox');
    if (box.hidden === open) box.hidden = !open;
    if (!open) return;
    const n = clamp(st.queueN || (queued ? 1 : 0), 0, CFG.racers), left = Math.max(0, Math.ceil(leftMs / 1000));
    const key = n + '|' + left + '|' + queued;
    if (key === queueShown) return;
    queueShown = key;
    const dots = $('#queueDots').children;
    for (let i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i < n);
    $('#queueLeft').textContent = left > 0 ? 'Starts in ' + clock(left) : 'Here we go!';
    $('#queueTxt').textContent = queued ? n + ' / ' + CFG.racers + ' drivers found' : 'Your stage is saved. Outrun the cops for Coins!';
    $('#bQueueJoin').textContent = queued ? 'Joined ✓ (' + n + ')' : 'Join (' + n + ')';
    $('#bQueueOff').textContent = queued ? 'Leave' : 'Dismiss';
}
async function enterRace(m) {
    switching = true;
    setQueued(false);
    closeTop(); closeTop();
    closeTower();
    holdFpsWatch(4);
    await fadeOut();
    try {
        const v = raceViewFor(m.world, m.tier);
        showView(v);
        const c = v.c;
        match = { ...m, c, phase0: true, lastCount: 99, place: m.spot + 1, copYaw: [], sirenK: 0 };
        P.cp = -1; P.finished = false; P.out = false; P.bestS = 0;
        v.setBarrier(true);
        v.padsFrom(0);
        v.ringsReset();
        const sp = c.startSpot(m.spot);
        c.setTime(courseTime(), 0.016);
        applyWorld(m.world, true);
        teleport(sp.x, sp.y, sp.z, sp.ry);
        document.body.classList.add('inrace');
        document.body.classList.remove('running');
        runningNow = false;
        raceReset(m.size);
        for (const r of remotes.values()) r.dispose();
        remotes.clear();
        updateRoster();
        const t0 = performance.now();
        while (avatarsPending() && performance.now() - t0 < 1400) { pumpAvatars(); await sleep(16); }
    } catch (e) { console.error('[race]', e); noteError('[race] ' + (e && e.message)); }
    switching = false;
    fadeIn();
    showCard('🚨 ' + WORLDS[m.world].name, 'Police Chase · ' + match.c.cps.length + ' stages · ' + m.cops + ' cops', 'Reach the Safehouse before the cops catch you!');
    setMusicMode('climb');
    setMusicIntensity(2);
    camSnap = true;
    if (P.pilot) resetPilot(P.pilot, 0);
}
async function exitRace(m) {
    switching = true;
    closeResults();
    holdFpsWatch(4);
    await fadeOut();
    match = null;
    document.body.classList.remove('inrace');
    hideCard();
    $('#copEdge').style.opacity = 0;
    edgeShown = 0;
    showView(mainView);
    P.cp = (S.stage || 0) - 1; P.finished = false; P.out = false;
    view.padsFrom(S.stage || 0);
    view.ringsReset();
    applyWorld(worldOfStage(Math.max(0, P.cp)), true);
    teleport(m.x, m.y ?? 0.2, m.z, m.ry ?? 0);
    for (const r of remotes.values()) r.dispose();
    remotes.clear();
    updateRoster();
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 800) { pumpAvatars(); await sleep(16); } }
    switching = false;
    fadeIn();
    setMusicMode(P.cp >= 0 ? 'climb' : 'plaza');
    setMusicIntensity(1);
    if (P.pilot) resetPilot(P.pilot, world.routeOf(P.cp));
    if (m.again) setQueued(true); else if (offerDaily.done !== true) setTimeout(offerDaily, 1500);
}
actions.playAgain = () => net.send('leave', { again: true });
actions.leaveRace = () => net.send('leave', {});
function backToCheckpoint() {
    if (P.finished || P.out || switching) return;
    if (!match && P.cp < 0 && P.b.y < 3 && P.b.y > -1) { teleport(HUB.spawn.x, 0.2, HUB.spawn.z, 0); net.send('respawn', {}); return; }
    doRespawn('asked');
}
// ----- the cops: jet cruisers along the course behind the leader of the pack, weaving, lights flashing; the screen's edge goes red as they close in -----
const copPt = { x: 0, y: 0, z: 0, ry: 0 };
let raceT = 0, edgeShown = 0;
function drawCops(m, t) {
    const c = m.c, s0 = copS(Math.max(0, t), m.k);
    for (let i = 0; i < m.cops; i++) {
        const s = s0 - i * 15 - (i % 2) * 6;
        c.pointAt(s, copPt);
        const lat = ((i % 3) - 1) * 5.5 + Math.sin(t * 1.3 + i * 2.1) * 2.2, rx = Math.cos(copPt.ry), rz = -Math.sin(copPt.ry);
        const yaw = m.copYaw[i] = m.copYaw[i] === undefined ? copPt.ry : m.copYaw[i] + wrapA(copPt.ry - m.copYaw[i]) * 0.08;
        addCop(copPt.x + rx * lat, copPt.y + 1.4 + Math.sin(t * 2.4 + i) * 0.5, copPt.z + rz * lat, yaw, -0.05, Math.sin(t * 1.3 + i * 2.1) * 0.12, t);
    }
}
function updateRace(dt) {
    const m = match, c = world, t = (net.now() - m.t0) / 1000;
    // 3, 2, 1, GO
    if (t < 0) {
        const n = Math.ceil(-t);
        if (n !== m.lastCount) { m.lastCount = n; if (n <= 3) { countText(String(n), n === 1 ? '#ff9a8a' : n === 2 ? '#ffe24a' : '#ffffff'); sfx('beep'); } }
    } else if (m.phase0) {
        m.phase0 = false;
        countText('GO!', '#7dff6b');
        sfx('go');
        hideCard();
        view.setBarrier(false);
        shake = Math.max(shake, 0.12);
    }
    drawCops(m, t);
    const ss = copS(Math.max(0, t), m.k), myS = c.sAt(P.cp, P.b.x, P.b.y, P.b.z), gap = myS - ss, k = gap < 70 && !P.finished && !P.out ? clamp(1 - gap / 70, 0, 1) : 0, K = Math.round(k * 10) / 10;
    if (K !== edgeShown) { edgeShown = K; $('#copEdge').style.opacity = K; }
    m.sirenK = clamp(1 - gap / 160, 0, 1) * (t > 0 ? 1 : 0.3);
    raceT -= dt;
    if (raceT > 0) return;
    raceT = 0.2;
    const room = net.room, tot = c.total;
    P.bestS = Math.max(P.bestS, myS);
    let i = 0, place = m.place, alive = 0;
    if (room && room.state && room.state.players) {
        room.state.players.forEach((p) => { if (p.ctx === m.id && p.st !== 2) alive++; });
        room.state.players.forEach((p, id) => {
            if (p.ctx !== m.id) return;
            if (id === room.sessionId) { place = p.place || place; raceDot(i++, clamp(P.bestS / tot, 0, 1), true, true, p.st === 2); } else raceDot(i++, clamp(p.prog, 0, 1), false, !p.bot, p.st === 2);
        });
    }
    m.place = place;
    raceInfo(place, Math.max(0, t), alive, clamp(P.bestS / tot, 0, 1), clamp(ss / tot, 0, 1));
    if (P.pub && P.pub.st === 2 && !P.out) P.out = true;
}
// the long run: which stage, how far through it, the clock, the menu when you stop, who's here
let runT = 0, stillT = 0, ranT = 0, runningNow = false, playersT = 0, stageShown = -2, fillShown = -1, hintShown = '';
function updateRun(dt) {
    const c = world, b = P.b, moving = Math.abs(b.spd) > 3 || !b.onGround;
    if (moving) { ranT += dt; stillT = 0; } else { stillT += dt; ranT = 0; }
    const run = (runningNow && stillT < 0.8) || ranT > 0.5;
    if (run !== runningNow) { runningNow = run; document.body.classList.toggle('running', run); }
    runT -= dt;
    if (runT > 0) return;
    runT = 0.2;
    // a new player's hint: how to drive, and to hold FLY when the car's falling short of the far side
    {
        let h = '';
        if ((S.bestStage || 0) < 4 && !anyPopup() && !switching) {
            if (b.onGround && Math.abs(b.spd) < 2 && P.cp < 1 && clockT - P.lastLandAt > 1.5) h = isTouch ? 'Push the stick up to drive!' : 'Hold W to drive!';
            else if (!b.onGround && !b.flying && b.gas > 15 && b.vy < -4 && b.y < b.fromY + 2) h = isTouch ? 'HOLD FLY!' : 'Hold SPACE to FLY!';
        }
        if (h !== hintShown) { hintShown = h; const el = $('#hint'); el.hidden = !h; if (h) el.textContent = h; }
    }
    const stage = P.cp + 1;
    if (stage !== stageShown) {
        stageShown = stage;
        const w = WORLDS[worldOfStage(Math.max(0, stage - 1))];
        $('#progTxt').textContent = stage > 0 ? 'Stage ' + stage + ' / ' + STAGES + ' · ' + w.name : 'Garage Deck · drive to START';
        $('#bSkip').hidden = stage <= 0 || stage >= STAGES;
        $('#skipTxt').textContent = 'Skip · ' + skipCost(stage) + ' 💎';
    }
    const f = Math.floor(clamp(c.sAt(P.cp, b.x, b.y, b.z) / c.total, 0, 1) * 1000) / 1000;
    if (f !== fillShown) { fillShown = f; $('#progFill').style.transform = 'scaleX(' + f + ')'; }
    // the clock: from Stage 1, until the Getaway Tower
    const secs = P.climbT0 ? ((P.climbEnd || net.now()) - P.climbT0) / 1000 : 0, tx = clock(secs);
    if (S.climbShown !== tx) { S.climbShown = tx; $('#timerTxt').textContent = tx; }
    if (c.main) applyWorld(P.cp >= 0 ? c.cps[P.cp].world : 0, false);
    playersT -= 0.2;
    if (playersT <= 0 && net.room && net.room.state && net.room.state.players) {
        playersT = 1;
        const rows = [];
        net.room.state.players.forEach((p, id) => { if (p.ctx === '') rows.push({ n: p.name, c: id === net.room.sessionId ? S.coins : p.coins, g: id === net.room.sessionId ? (S.bestStage || 0) : p.stage, l: p.lv, me: id === net.room.sessionId }); });
        rows.sort((a2, b2) => (b2.me ? 1 : 0) - (a2.me ? 1 : 0) || b2.g - a2.g);
        playersList(rows.slice(0, 9));
    }
}
// the gauges: speed, gas, nitro (written only when they change, moved with transforms)
function updateGauges() {
    const b = P.b;
    hudSpeed(Math.round(Math.abs(b.spd) * KMH));
    hudGas(b.tank ? b.gas / b.tank : 0, b.flying);
    hudBoost(b.boostT > 0 ? 1 : b.boostCool > 0 ? 1 - b.boostCool / (CFG.boostCool + myStats().boost) : 1, b.boostT > 0);
}

// =====================================================================================
// HUD buttons
// =====================================================================================
const bind = (sel, fn) => $(sel).addEventListener('click', (e) => { sfx('click'); e.currentTarget.blur(); fn(); });
bind('#bGarage', () => openPanel('garage'));
bind('#bCrates', () => openPanel('crates'));
bind('#bQuests', () => openPanel('quests'));
bind('#bTeleport', () => openPanel('teleport'));
bind('#bRewards', () => openPanel('rewards'));
bind('#bSettings', () => openPanel('settings'));
bind('#bChase', () => startQueue());
bind('#coinBox', () => openPanel('boards'));
bind('#gemsBox', () => openPanel('boards'));
bind('#keyBox', () => openPanel('crates'));
bind('#giftPill', () => openPanel('rewards', 'gifts'));
bind('#questPill', () => openPanel('quests'));
bind('#bDiff', () => { const i = ((S.diff ?? 1) + 1) % 3; S.diff = i; net.send('diff', { i }); updateHud(); toast('Difficulty: ' + diffOf(i).name + (i === 0 ? ' · the jets last longer, the pay is less' : i === 2 ? ' · the jets burn fast, the pay is 1.5x' : ''), diffOf(i).color); });
bind('#bQueueJoin', () => { if (queued) return; startQueue(); });
bind('#bQueueOff', () => { if (queued) cancelQueue(); else { dismissed = net.room.state.queueEnd; updateQueue(); } });
bind('#bPlayersX', () => { $('#players').classList.remove('open'); $('#players').hidden = true; $('#bPlayersShow').hidden = false; });
bind('#bPlayersShow', () => { $('#players').hidden = false; $('#players').classList.add('open'); $('#bPlayersShow').hidden = true; });
if (innerWidth < innerHeight || innerWidth < 900) { $('#bPlayersShow').hidden = false; $('#players').hidden = true; }
bind('#bBack', () => backToCheckpoint());
bind('#bLeave', () => net.send('leave', {}));
bind('#bSkip', () => { if (!match && P.cp + 1 < STAGES) net.send('skip', {}); });
function fadeOut() { $('#fade').style.opacity = 1; return sleep(260); }
function fadeIn() { $('#fade').style.opacity = 0; }
let showFps = false;
actions.fpsOn = () => showFps;
actions.toggleFps = () => { showFps = !showFps; $('#fps').hidden = !showFps; };
let boards = { stage: [], wins: [], time: [] };
actions.boards = () => boards;
actions.goHome = () => { if (match) net.send('leave', {}); else net.send('warp', { to: 'home' }); };
actions.warpWorld = (w) => { if (!match) net.send('warp', { to: 'world', w }); };
actions.warpLast = () => { if (!match) net.send('warp', { to: 'last' }); };
actions.toggleMusic = () => toggleMusic();
actions.claim = () => net.send('claim', {});
actions.crate = (c, n, useKeys) => net.send('crate', { c, n, keys: !!useKeys });
actions.onOpened = (out) => {
    screenConfetti(40);
    const best = out.slice().sort((a, b) => exhaustById[b.id].bonus - exhaustById[a.id].bonus)[0], k = exhaustById[best.id];
    if (k.rarity === 'legendary' || k.rarity === 'mythic') { sfx('rankup'); screenConfetti(90); }
    if (me) FX.sparkleColumn(P.b, k.flame);
};
addEventListener('resize', () => measureHud());

// =====================================================================================
// Networking
// =====================================================================================
const BLOXITY_GAME_ID = import.meta.env.VITE_BLOXITY_GAME_ID || '';
const ON_BLOXITY_HOST = /\.play\.bloxity\.io$/.test(location.hostname);
const DEV_CHANNEL = /\.dev\.play\.bloxity\.io$/.test(location.hostname);
const SERVER_URL = import.meta.env.VITE_SERVER_URL
    || (ON_BLOXITY_HOST ? `https://${location.hostname.replace(/\.play\.bloxity\.io$/, '.host.bloxity.io')}`
        : BLOXITY_GAME_ID ? `https://${BLOXITY_GAME_ID}.host.bloxity.io`
        : import.meta.env.DEV ? `${location.protocol}//${location.hostname}:3003` : location.origin);
async function serverEndpoint() {
    let url = SERVER_URL;
    if (BLOXITY_GAME_ID) {
        const r = await BX.resolveEndpoint(BLOXITY_GAME_ID, DEV_CHANNEL ? 'preview' : undefined);
        if (r && r.cold) loadingText('Waking up a server…');
        url = (r && r.endpoint) || SERVER_URL;
    }
    if (!/^https?:/i.test(url)) return url;
    if (!(await serverUp(url))) {
        loadingText('Waking up a server…');
        const until = Date.now() + 60000;
        while (Date.now() < until) { await sleep(2000); if (await serverUp(url)) break; }
    }
    return url;
}
async function serverUp(url) {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 4000);
        const r = await fetch(url.replace(/\/$/, '') + '/health', { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        return r.ok;
    } catch (e) { return false; }
}
let lastMoveSent = 0, lastMoveKey = '';
function sendMove(force) {
    if (switching) return;
    const now = performance.now();
    if (!force && now - lastMoveSent < 50) return;
    const b = P.b;
    const a = b.knockT > 0 ? 3 : b.flying ? 4 : !b.onGround ? 2 : Math.abs(b.spd) > 1 ? 1 : 0;
    const m = { x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ry: +b.yaw.toFixed(3), a };
    const key = m.x + ',' + m.y + ',' + m.z + ',' + m.ry + ',' + a;
    if (!force && key === lastMoveKey && now - lastMoveSent < 500) return;
    lastMoveKey = key; lastMoveSent = now;
    m.ts = Math.round(net.now());
    net.send('move', m);
}
function playerUid() {
    let uid = storageGet('jc1_uid');
    if (!uid) { uid = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now()); storageSet('jc1_uid', uid); }
    return uid;
}
let gotProfile = false, lastGems = 0, joinSpot = null, ringCombo = 0, ringAt = 0;
async function connect(name, endpoint) {
    const url = endpoint || await serverEndpoint();
    const client = new Client(url);
    const id = BX.identity();
    const room = await client.joinOrCreate('jetcar', { uid: playerUid(), name: name || id.name, token: id.token, av: packAvatar(BX.currentAvatar()), save: storageGet('jc1_save') || '' });
    net.room = room;
    net.bloxity = false;
    BX.updateRoom(room.roomId);
    room.onMessage('hello', (m) => { net.offset = m.now - Date.now(); setEpoch(m.now); net.bloxity = !!m.bloxity; if (m.x !== undefined) joinSpot = m; pingSend(); });
    room.onMessage('pong', onPong);
    room.onMessage('profile', (m) => {
        const first = !gotProfile;
        if (m.save) storageSet('jc1_save', m.save);
        delete m.now; delete m.ack;
        const coinsBefore = S.coins;
        Object.assign(S, m);
        S.profileAt = Date.now();
        gotProfile = true;
        if (!first && m.gems > lastGems) { bump('#gemsBox'); sfx('gem'); }
        if (!first && S.coins > coinsBefore + 0.5) bump('#coinBox');
        lastGems = m.gems;
        if (me) { me.setCar(S.car, S.paint); me.setExhaust(S.exhaust); }
        if (mainView) mainView.keysGot(S.keysGot);
        if (!match) P.cp = (S.stage || 0) - 1;
        refreshPanels();
        updateHud();
    });
    room.onMessage('lite', (m) => {
        S.coins = m.coins; S.totalCoins = m.totalCoins; S.xp = m.xp; S.lv = m.lv; S.need = m.need; S.gems = m.gems; S.keys = m.keys; S.ringsAll = m.ringsAll; S.airs = m.airs;
        if (m.qv !== undefined) S.qv = m.qv;
        S.profileAt = S.profileAt || Date.now();
        updateHud();
    });
    room.onMessage('toast', (m) => toast(m.text, m.color));
    room.onMessage('toastreward', (m) => { toast(m.text, '#7dff6b'); sfx('gem'); });
    room.onMessage('broke', (m) => notEnough(m));
    room.onMessage('code', (m) => codeResult(m));
    room.onMessage('boards', (m) => { boards = m; if (hubBits) hubBits.extras.setBoards(m); if (panelIs('boards')) refreshPanels(); });
    room.onMessage('reward', (m) => { popup(m.gems && !m.coins ? '💎' : '🎁', m.why || 'Reward!', m.text, '#ffe24a', true); sfx('reward'); confetti(P.b); if (m.coins) flyCoins(Math.min(30, m.coins)); });
    room.onMessage('levelup', (m) => {
        const was = S.lv;
        S.lv = m.lv; S.need = xpNeed(m.lv); S.xp = 0;
        sfx('levelup');
        levelUp(was, m.lv);
        if (me) FX.sparkleColumn(P.b, 0x5ac8ff);
        updateHud();
    });
    room.onMessage('snaps', onSnaps);
    room.onMessage('queued', (m) => { if (!match) setQueued(!!m.on); });
    room.onMessage('match', (m) => enterRace(m));
    room.onMessage('home', (m) => exitRace(m));
    // ----- a chase -----
    room.onMessage('chasecp', (m) => {
        P.cp = Math.max(P.cp, m.i);
        if (view) view.padTouch(m.i);
        sfx('checkpoint');
        const sp = world.cps[m.i];
        if (sp) FX.sparkleColumn(FX.tmpV.set(sp.x, sp.y, sp.z), 0x7dff6b);
    });
    room.onMessage('escaped', (m) => {
        P.finished = true;
        sfx('win');
        bigText(m.n === 1 ? 'GOT AWAY FIRST!' : 'YOU GOT AWAY!', '#ffe24a');
        screenConfetti(140);
        confetti(P.b);
    });
    room.onMessage('busted', () => { P.out = true; bigText('BUSTED!', '#ff6a7a'); sfx('busted'); FX.poofFx(P.b); shake = 0.4; });
    room.onMessage('caught', (m) => { const r = byPid.get(m.p); if (r && r.x !== undefined) { FX.poofFx(FX.tmpV.set(r.x, r.y, r.z)); sfx('busted'); } });
    room.onMessage('results', (m) => {
        const until = Date.now() + CFG.resultsSecs * 1000;
        setMusicIntensity(1);
        if (m.me.coins > 0) flyCoins(Math.min(40, m.me.coins));
        setTimeout(() => { if (match && !switching) showResults(m, S.name, until); }, 900);
    });
    // ----- the long run -----
    room.onMessage('runstart', () => { P.climbT0 = net.now(); P.climbEnd = 0; view.padsFrom(0); view.ringsReset(); });
    room.onMessage('stage', (m) => {
        P.cp = Math.max(P.cp, m.i);
        S.stage = m.i + 1;
        if (m.first) S.bestStage = Math.max(S.bestStage || 0, m.i + 1);
        view.padTouch(m.i);
        sfx('checkpoint');
        const sp = world.cps[m.i];
        if (sp) FX.sparkleColumn(FX.tmpV.set(sp.x, sp.y, sp.z), 0xffd23a);
        flyCoins(Math.min(8, m.coins));
        document.body.classList.add('coinflash');
        clearTimeout(padCoinT); padCoinT = setTimeout(() => document.body.classList.remove('coinflash'), 2600);
        cpWord('Stage ' + (m.i + 1) + '!  +' + m.coins);
        updateHud();
    });
    room.onMessage('world', (m) => {
        if (m.w === 0) return;
        const W = WORLDS[m.w];
        sfx('rankup');
        bigText(W.icon + ' ' + W.name.toUpperCase(), '#ffe24a');
        toast(W.text, '#ffffff');
        screenConfetti(50);
    });
    room.onMessage('ring', (m) => {
        const now = performance.now();
        ringCombo = now - ringAt < 2500 ? ringCombo + 1 : 0; ringAt = now;
        sfx('ring', ringCombo);
        if (view) view.ringTouch(m.i);
        const r = world.rings[m.i];
        if (r) FX.ring(FX.tmpV.set(r.x, r.y, r.z), 0xffd23a, r.r * 1.6, 0.4);
        airWord('+' + m.coins + ' RING' + (ringCombo ? ' x' + (ringCombo + 1) : ''), '#ffd23a');
        flyCoins(m.coins);
    });
    room.onMessage('key', (m) => { sfx('key'); S.keys = m.keys; S.keysGot = { ...(S.keysGot || {}), [m.i]: 1 }; if (mainView) mainView.keysGot(S.keysGot); popup('🔑', 'KEY FOUND!', 'Open crates with it in Crates', '#ffd23a'); bump('#keyBox'); updateHud(); });
    room.onMessage('air', (m) => { sfx('bigair', Math.round(m.secs)); airWord('BIG AIR ' + m.secs.toFixed(1) + 's  +' + m.coins, '#7de8ff'); flyCoins(m.coins); });
    room.onMessage('tower', (m) => { if (m.on) showTower(); else closeTower(); });
    room.onMessage('trophy', (m) => trophyAt(m));
    room.onMessage('skipped', (m) => { sfx('whoosh'); P.cp = m.i; S.stage = m.i + 1; view.padTouch(m.i); warpTo(m); toast('✈️ Skipped to Stage ' + (m.i + 1), '#7dff6b'); });
    room.onMessage('warped', (m) => { if (m.stage !== undefined) S.stage = m.stage; warpTo(m); });
    room.onMessage('bought', (m) => {
        sfx('buy');
        screenConfetti(60);
        if (m.what === 'upgrade') { S.ups = { ...S.ups, [m.id]: m.n }; updateHud(); }
        if (m.what === 'car') popup('🚗', 'NEW CAR!', 'It\'s parked in your garage and you\'re driving it', '#7de8ff');
    });
    room.onMessage('opened', (m) => showCrate(m.c, m.out));
    room.onMessage('taskdone', () => { sfx('task'); toast('✅ Daily task done! Claim it in Quests', '#7dff6b'); });
    room.onMessage('questdone', () => { sfx('task'); toast('🎯 Quest complete! Claim it in Quests', '#7dff6b'); updateHud(); });
    room.onMessage('authed', (m) => { S.name = m.name; });
    room.onMessage('snap', (m) => { P.snaps++; const b = P.b; b.x = m.x; b.y = m.y; b.z = m.z; b.vx = b.vz = 0; b.vy = 0; b.spd *= 0.5; sendMove(true); });
    room.onMessage('emote', () => {});
    room.onMessage('chat', (m) => { const r = remotes.get(m.s); if (r) chatBubble(r.car.root, m.text); else if (m.s === room.sessionId && me) chatBubble(me.root, m.text); });
    room.onLeave((code) => {
        if (code === 4000) { $('#connectErr').textContent = 'You joined from somewhere else.'; }
        else $('#connectErr').textContent = 'Lost the connection to the server.';
        $('#start').hidden = false; $('#connectErr').hidden = false; $('#retryBtn').hidden = false; $('#loading').textContent = '';
        running = false;
    });
    return room;
}
// the Getaway Tower: a Trophy, a big word, and a new run with bigger pay
async function trophyAt(m) {
    closeTower();
    switching = true;
    sfx('win');
    screenConfetti(160);
    FX.fireworks(FX.tmpV.set(P.b.x, P.b.y + 8, P.b.z), 8);
    await fadeOut();
    switching = false;
    P.cp = -1; P.climbT0 = 0; P.climbEnd = 0; S.climbShown = ''; $('#timerTxt').textContent = '00:00';
    view.padsFrom(0); view.ringsReset();
    teleport(m.x, 0.2, m.z, HUB.yaw);
    applyWorld(0, true);
    setMusicMode('plaza');
    fadeIn();
    showTrophy(m);
    if (m.reward.coins) flyCoins(30);
    FX.sparkleColumn(P.b, 0xffd23a);
}
async function warpTo(m) {
    switching = true;
    await fadeOut();
    switching = false;
    teleport(m.x, m.y ?? 0.2, m.z, m.ry ?? 0);
    if (!match) P.cp = (S.stage || 0) - 1;
    if (world.main) applyWorld(P.cp >= 0 ? world.cps[P.cp].world : 0, true);
    setMusicMode(P.cp >= 0 ? 'climb' : 'plaza');
    fadeIn();
    FX.sparkleColumn(P.b, 0x7dff6b);
    if (P.pilot) resetPilot(P.pilot, world.routeOf(P.cp));
}
let padCoinT = 0;
function cpWord(text) { const el = $('#cpWord'); el.textContent = text; el.hidden = false; el.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go'))); clearTimeout(cpWord.t); cpWord.t = setTimeout(() => { el.hidden = true; }, 1700); }
function offerDaily() {
    if (!running || anyPopup() || offerDaily.done || match) return;
    if (!dailyStatus(S.daily, net.now()).can) return;
    offerDaily.done = true;
    openPanel('rewards', 'daily');
}
function chatBubble(group, text) {
    if (!group) return;
    if (group.userData.bubbleLbl) { group.remove(group.userData.bubbleLbl); group.userData.bubbleLbl.material.map.dispose(); }
    const lb = billboard([{ t: '💬 ' + text, c: '#ffffff', s: '#10203a', px: 44 }], 9, 1024, new V3(0, 8, 0), group);
    group.userData.bubbleLbl = lb;
    setTimeout(() => { if (group.userData.bubbleLbl === lb) { group.remove(lb); lb.material.map.dispose(); group.userData.bubbleLbl = null; } }, 5000);
}

// =====================================================================================
// Every frame
// =====================================================================================
let clockT = 0, slowT = 0, pingT = 0, metaT = 20, qT = 0, songUp = false, gaugeT = 0;
function update(dt) {
    clockT += dt;
    const t = clockT;
    CU.uNow.value = rel(net.now());
    pumpAvatars();
    beginCars();
    if (world) updateMe(dt);
    updatePrompt();
    updateRemotes(dt, t);
    if (match) updateRace(dt); else { updateRun(dt); updateShowCars(dt, camera.position); }
    endCars();
    contactShadows();
    updateEffects(dt);
    updateFx(dt);
    updateGround(dt);
    animateCounters(dt);
    gaugeT -= dt;
    if (gaugeT <= 0) { gaugeT = 0.05; updateGauges(); }
    const b = P.b;
    updateMotor({ on: running && !switching, spd: Math.abs(b.spd) / CFG.top, thr: P.thr, fly: b.flying, air: !b.onGround, boost: b.boostT > 0, siren: match ? match.sirenK : 0 });
    qT -= dt;
    if (qT <= 0) { qT = 0.25; updateQueue(); }
    slowT -= dt;
    if (slowT <= 0) { slowT = 1; updateHud(); }
    if (!match) { const up = P.cp >= 0; if (up !== songUp) { songUp = up; setMusicMode(up ? 'climb' : 'plaza'); } }
    pingT -= dt;
    if (pingT <= 0) { pingT = pingEvery(); pingSend(); }
    metaT -= dt;
    if (metaT <= 0) { metaT = 30; sendMeta(); }
}
// the contact shadows (Low quality)
function contactShadows() {
    SH.shadowsOn(getQuality() === 'low');
    SH.begin();
    const b = P.b;
    if (world) {
        const g = world.groundBelow(b.x, b.y + 0.3, b.z);
        if (g > -1e6) SH.add(b.x, g, b.z, b.y - g, 4.4);
        for (const r of remotes.values()) if (r.x !== undefined && r.car.shown) { const g2 = world.groundBelow(r.x, r.y + 0.3, r.z); if (g2 > -1e6) SH.add(r.x, g2, r.z, r.y - g2, 4.4); }
    }
    SH.end();
}
function updateCameraAll(dt) {
    updateCamera(dt);
    const t = clockT;
    if (shadowDue()) snapShadow(FX.tmpV.set(P.b.x, P.b.y, P.b.z));
    if (view) view.update(dt, courseTime(), camera, renderer.shadowMap.enabled ? sun.shadow.camera : null, P.b.x, P.b.y, P.b.z);
    updateSky(camera.position, t, dt);
    updateAmbient(camera.position, t, ambNow);
}

// ----- play stats: how the game runs on this device and any error it hit -----
const fpsWin = { sum: 0, n: 0 }, errSeen = new Set(), errQueue = [];
let metaFirst = true, loadSecs = 0, lastFps = 60;
function noteError(msg, src, line, col) {
    const file = src ? String(src).split('/').pop().split('?')[0] : '';
    const k = String(msg || '?').slice(0, 150) + (file ? ' @' + file + ':' + (line || 0) + ':' + (col || 0) : '');
    if (errSeen.has(k) || errSeen.size >= 20) return;
    errSeen.add(k); errQueue.push(k);
}
window.addEventListener('error', (e) => noteError(e.message, e.filename, e.lineno, e.colno));
window.addEventListener('unhandledrejection', (e) => noteError('promise: ' + ((e.reason && e.reason.message) || e.reason)));
addEventListener('pagehide', () => { if (running) sendMeta(); });
let gpuNameCache = null;
function gpuName() {
    if (gpuNameCache !== null) return gpuNameCache;
    gpuNameCache = GPU_NAME.slice(0, 90) + (renderer.getContext().getContextAttributes().antialias ? '' : ' (no AA)');
    return gpuNameCache;
}
function sendMeta() {
    const m = { touch: isTouch, fps: fpsWin.n ? Math.round(fpsWin.sum / fpsWin.n) : lastFps, q: getQuality(), errs: errQueue.splice(0, 5) };
    fpsWin.sum = 0; fpsWin.n = 0;
    if (metaFirst) { metaFirst = false; Object.assign(m, { gpu: gpuName(), load: loadSecs, dpr: Math.round(devicePixelRatio * 100) / 100, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 }); }
    net.send('meta', m);
}

// ----- the smoothness watch (every half second): the resolution adapts first, then the quality -----
const fpsWatch = { t: 0, avg: 60, low: 0, good: 0, trial: null, cpuUntil: 0, fails: 0, upAt: -99, upFrom: 1, ceil: 1, ceilUntil: 0, holdUntil: 0, lows: 0 };
function holdFpsWatch(secs) { fpsWatch.holdUntil = fpsWatch.t + (secs || 4); fpsWatch.avg = Math.max(fpsWatch.avg, 58); }
let watchOff = false;
function watchFps(fps) {
    if (!running || document.hidden || watchOff) return;
    const w = fpsWatch;
    w.t += 0.5;
    w.lows = fps < 45 ? w.lows + 1 : 0;
    if (w.lows === 1 && fps < 45) return;
    w.avg += (fps - w.avg) * 0.35;
    if (w.t < 3 || w.t < w.holdUntil) return;
    if (w.t > w.ceilUntil) w.ceil = 1;
    if (w.trial) {
        if (w.t - w.trial.at < 2) return;
        if (w.avg < w.trial.fps * 1.06) { setResScale(w.trial.prev); w.fails++; w.cpuUntil = w.t + Math.min(240, 30 * w.fails); } else w.fails = 0;
        w.trial = null;
        return;
    }
    const scale = getResScale();
    if (w.avg < 54 && w.t > w.cpuUntil && scale > 0.56) {
        if (w.t - w.upAt < 6) { w.ceil = w.upFrom; w.ceilUntil = w.t + 60; }
        w.trial = { at: w.t, fps: w.avg, prev: scale };
        setResScale(scale * 0.85);
        w.good = 0;
        return;
    }
    if (w.avg >= 57) {
        w.good += 0.5;
        if (w.good >= 6 && scale < w.ceil - 0.01) { w.good = 0; w.upAt = w.t; w.upFrom = scale; setResScale(Math.min(w.ceil, scale / 0.88)); }
    } else w.good = 0;
    if (!autoQualityAllowed()) return;
    w.low = w.avg < 45 && (scale <= 0.56 || w.t < w.cpuUntil) ? w.low + 0.5 : 0;
    if (w.low < 3) return;
    w.low = 0;
    const next = { high: 'medium', medium: 'low' }[getQuality()];
    if (!next) return;
    setQuality(next, true, w.t < 45);
    toast('⚙️ Graphics set to ' + (next === 'medium' ? 'Medium' : 'Low') + ' for smoother play', '#7de8ff');
}
// Even frame pacing on fast screens: when most frames miss and some don't, it draws every other refresh instead
const ivs = [];
let refreshMs = 0, paceN = 0, strikes = 0, pacedAt = 0, paced = false, trial = false;
function noteInterval(ms) { if (ms > 2 && ms < 60 && ivs.length < 400) ivs.push(ms); }
function paceFrames() {
    if (!running || document.hidden || isTouch) return;
    const now = performance.now();
    if (paced) { if (now - pacedAt > 30000) { paced = false; skipOdd = false; trial = true; ivs.length = 0; } return; }
    if (ivs.length < 200) return;
    paceN++;
    const s = ivs.slice().sort((a, b) => a - b), p10 = s[Math.floor(s.length * 0.1)];
    refreshMs = refreshMs ? Math.min(refreshMs, p10) : p10;
    const late = s.filter((v) => v > refreshMs * 1.5).length / s.length;
    ivs.length = 0;
    const uneven = refreshMs < 9 && late > 0.25 && late < 0.9;
    strikes = uneven ? strikes + 1 : 0;
    if ((trial && uneven) || (paceN > 3 && strikes >= 2 && fpsWatch.t >= fpsWatch.holdUntil)) {
        paced = true; skipOdd = true; pacedAt = now; strikes = 0;
        console.info('[pace] every other refresh (' + Math.round(500 / refreshMs) + ' FPS), ' + Math.round(late * 100) + '% of frames were late');
    }
    trial = false;
}
const perf = { n: 0, sum: 0, max: 0, last: 0 };
const spikes = [], slowParts = [];
let secAvg = {};
let frameErrors = 0, lastFrame = 0, loadingSignaled = false, fpsAcc = 0, fpsFrames = 0, skipOdd = false, oddFrame = false;
let rafN = 0;
function frame(now) {
    requestAnimationFrame(frame);
    rafN++;
    if (skipOdd) { oddFrame = !oddFrame; if (oddFrame) return; }
    const dt = Math.min(0.05, (now - (lastFrame || now)) / 1000);
    if (lastFrame && !skipOdd) noteInterval(now - lastFrame);
    fpsAcc += (now - (lastFrame || now)) / 1000; fpsFrames++;
    if (fpsAcc >= 0.5) {
        const fps = fpsFrames / fpsAcc;
        lastFps = Math.round(fps);
        if (running && !document.hidden) { fpsWin.sum += fps; fpsWin.n++; }
        if (showFps) $('#fps').textContent = lastFps + ' FPS';
        if (isTouch && !skipOdd && fps > 100) skipOdd = true;
        if (skipOdd && rafN / fpsAcc < 95) { skipOdd = false; paced = false; pacedAt = 0; }
        rafN = 0;
        paceFrames();
        watchFps(fps); fpsAcc = 0; fpsFrames = 0;
    }
    if (lastFrame && now - lastFrame > 45 && spikes.length < 60) spikes.push({ at: Math.round(now), ms: Math.round(now - lastFrame), work: +perf.last.toFixed(1), res: getResScale() });
    lastFrame = now;
    if (!loadingSignaled) { loadingSignaled = true; BX.triggerAllSettings(); }
    pollGamepad();
    padButtons();
    if (running) {
        const w0 = performance.now();
        try {
            prof.start();
            update(dt);
            prof.mark('update');
            updateCameraAll(dt);
            prof.mark('camera+sky');
            render();
            prof.mark('render');
        } catch (e) {
            if (frameErrors++ < 5) console.error('[frame]', e);
            const at = String((e && e.stack) || '').split('\n').find((l) => /:\d+:\d+/.test(l)) || '';
            noteError('[frame] ' + ((e && e.message) || e), '', 0, 0);
            if (at) noteError('[frame at] ' + at.trim().slice(-120));
        }
        const w = performance.now() - w0;
        perf.n++; perf.sum += w; perf.max = Math.max(perf.max, w); perf.last = w;
        for (let i = 0; i < prof.parts.length; i += 2) secAvg[prof.parts[i]] = (secAvg[prof.parts[i]] || 0) + prof.parts[i + 1];
        secAvg.n = (secAvg.n || 0) + 1;
        if (w > 50 && slowParts.length < 20) { const o = {}; for (let i = 0; i < prof.parts.length; i += 2) o[prof.parts[i]] = +(o[prof.parts[i]] || 0) + +prof.parts[i + 1].toFixed(1); slowParts.push({ at: Math.round(now), ms: Math.round(w), calls: renderer.info.render.calls, ...o }); }
    }
}

// =====================================================================================
// Boot: build everything behind the loading screen, join, play (no start menu)
// =====================================================================================
function loadingText(t) { $('#loading').textContent = t; }
let joining = false, joinTask = null, worldReady = null;
async function joinServer() {
    const endpointTask = serverEndpoint();
    endpointTask.catch(() => {});
    await waitForLogin(400);
    const saved = (storageGet('jc1_name') || '').slice(0, 20);
    for (let attempt = 0; ; attempt++) {
        try { return await connect(BX.identity().loggedIn ? '' : saved, attempt === 0 ? await endpointTask : null); } catch (e) {
            if (attempt >= 4) throw e;
            console.warn('[join] attempt', attempt + 1, 'failed:', e && e.message);
            loadingText('Waking up a server…');
            await sleep(2000 * (attempt + 1));
        }
    }
}
function waitForLogin(ms) {
    if (!BX.bloxity.ready || BX.identity().loggedIn) return Promise.resolve();
    return new Promise((res) => { const t0 = performance.now(); (function check() { if (BX.identity().loggedIn || performance.now() - t0 > ms) res(); else setTimeout(check, 100); })(); });
}
async function play() {
    if (joining || running) return;
    joining = true;
    $('#connectErr').hidden = true; $('#retryBtn').hidden = true;
    if (!joinTask) joinTask = joinServer();
    initAudio();
    try {
        await worldReady;
        loadingText('Joining a server…');
        $('#loadBar').style.width = '92%';
        BX.loadingStep('Joining a server…');
        await joinTask;
        const t0 = performance.now();
        while (!gotProfile && performance.now() - t0 < 6000) await sleep(50);
    } catch (e) {
        joinTask = null;
        console.error(e);
        joining = false;
        loadingText('');
        $('#connectErr').hidden = false;
        $('#connectErr').textContent = 'Could not reach the game server. Check your connection and try again.';
        $('#retryBtn').hidden = false;
        BX.loadingEnd();
        return;
    }
    joining = false;
    running = true;
    S.joinedAt = Date.now();
    if (!me) buildMe();
    me.setCar(S.car, S.paint); me.setExhaust(S.exhaust);
    P.cp = (S.stage || 0) - 1;
    view.padsFrom(S.stage || 0);
    view.keysGot(S.keysGot);
    const js = joinSpot || { x: HUB.spawn.x, y: 0.2, z: HUB.spawn.z, ry: 0 };
    uClock.value = courseTime();
    world.setTime(uClock.value, 0.016);
    applyWorld(P.cp >= 0 ? world.cps[P.cp].world : 0, true);
    teleport(js.x, (js.y || 0) + 0.2, js.z, js.ry || 0);
    loadingText('Almost there…');
    $('#loadBar').style.width = '100%';
    await primeFrames();
    updateRoster();
    { const t0 = performance.now(); while (avatarsPending() && performance.now() - t0 < 2000) { pumpAvatars(); await sleep(30); } }
    fpsAcc = 0; fpsFrames = 0;
    allowLiveMusic(typeof OfflineAudioContext === 'undefined');
    startMusic();
    setMusicMode(P.cp >= 0 ? 'climb' : 'plaza');
    $('#start').hidden = true;
    $('#start').style.opacity = '';
    $('#hud').hidden = false;
    measureHud();
    updateHud();
    setTimeout(greet, 700);
    canvas.focus();
    loadSecs = Math.round(performance.now() / 100) / 10;
    metaT = 8;
    BX.loadingEnd();
}
async function primeFrames() {
    $('#start').style.opacity = '0.985';
    $('#hud').hidden = false;
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* compiles on first use */ }
    for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
    const gl = renderer.getContext();
    if (!gl.fenceSync) return;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const t0 = performance.now();
    while (gl.clientWaitSync(sync, 0, 0) === gl.TIMEOUT_EXPIRED && performance.now() - t0 < 1500) await sleep(15);
    gl.deleteSync(sync);
}
function greet() {
    offerDaily();
    if (anyPopup()) { setTimeout(greet, 300); return; }
    showTips();
    setTimeout(() => { if (audioSuspended()) toast('🔊 Tap anywhere for sound!', '#7de8ff'); }, 3000);
}
function showTips() {
    const el = $('#tips');
    const k = (key, what) => `<span><kbd>${key}</kbd>${what}</span>`;
    el.innerHTML = isTouch ? k('Stick', 'Drive & steer') + k('FLY', 'Hold to jet') + k('BOOST', 'Nitro') : k('W / ↑', 'Drive') + k('A D', 'Steer') + k('Space', 'Hold to FLY') + k('Shift', 'Nitro') + k('F', 'Flip') + k('R', 'Checkpoint');
    el.hidden = false; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 12000);
    setTimeout(() => { el.hidden = true; }, 12900);
}
function unlockAudioOnGesture() {
    const unlock = () => { resumeAudio(); if (!audioSuspended()) for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) removeEventListener(ev, unlock, true); };
    for (const ev of ['pointerdown', 'pointerup', 'keydown', 'touchstart', 'touchend', 'click']) addEventListener(ev, unlock, true);
}
function wirePortalSettings() {
    const embedded = (fn) => (v) => { if (BX.isEmbedded()) fn(v); };
    const pct = (v) => { const n = parseFloat(String(v)); if (!isFinite(n)) return undefined; return clamp(n > 1 ? n / 100 : n, 0, 1); };
    BX.listenSetting('master_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('master', p); }));
    BX.listenSetting('music_volume', embedded((v) => { const p = pct(v); if (p !== undefined) setVolume('music', p); }));
    BX.listenSetting('graphics_quality', embedded((v) => setQuality(v === 'Low' ? 'low' : v === 'Medium' ? 'medium' : 'high', true)));
    BX.listenSetting('camera_sensitivity', embedded((v) => { camSens = clamp(parseFloat(v) || 1, 0.1, 5); }));
    BX.listenSetting('show_fps', (v) => { showFps = v === 'true'; $('#fps').hidden = !showFps; });
}
function wirePortalEvents() {
    BX.onPortalEvent((event, data) => {
        if (event === 'respawn_request') { if (running) backToCheckpoint(); }
        else if (event === 'open_daily') openPanel('rewards', 'daily');
        else if (event === 'chat_message_sent' && data) net.send('chat', { text: String(data) });
    });
    BX.onAvatarChanged(() => syncMyAvatar());
    BX.onProportionsChanged(() => syncMyAvatar());
}
// The HUD's words and emoji painted for a few frames behind the loading screen, in the fonts and sizes the game uses
async function warmHudText() {
    const lines = [['🛒📋🔄✨📅🌈🌍⚙️🎁💎🔑📦🪙🟡🏙️🏜️🌃🏔️🚗🚨🏁🚩🚀⭕🔥🔧📈✈️🏆', 2.3], ['🔊🔇🏆🔥🎯✅⭐🚩🏁👑🌙🥉🥈🥇💠🔒⏱💬👋', 1.8], ['🥉🥈🥇💠🔒⏱💬👋🚗🚨🔑📦', 1.4], ['💰🎟️🎉🎊🛞⛽', 1.2]];
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;left:0;top:0;width:3000px;opacity:0.01;pointer-events:none;z-index:1';
    d.innerHTML = lines.map(([em, s]) => `<div style="font-size:${s}rem;white-space:nowrap">${em}</div>`).join('')
        + [['var(--chunky)', 3, 400, 'o'], ['var(--chunky)', 2, 400, 'o'], ['var(--font)', 2.3, 700, 'o'], ['var(--font)', 1.1, 700, 'o1']]
            .map(([f, s, w, c]) => `<div class="${c}" style="font-family:${f};font-size:${s}rem;font-weight:${w};white-space:nowrap">Level Up! Coins Stage BIG AIR RING FLIP BUSTED! GOT AWAY GO! Quests Garage Crates Teleport Rewards Chase km/h 0123456789 % st nd rd th K M B</div>`).join('');
    document.body.appendChild(d);
    for (let i = 0; i < 3; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 150); });
    d.remove();
    const cv = document.createElement('canvas'); cv.width = 1200; cv.height = 140;
    const cx = cv.getContext('2d');
    for (const px of [40, 44, 52, 70, 76]) { cx.font = '700 ' + px + 'px Fredoka, "Arial Rounded MT Bold", sans-serif'; cx.fillText('💬🚗🥉🥈🥇💠💎👑🔒🏆✓ Lv. 0123456789 Coins Wins', 4, 100); }
}
async function prepareWorld() {
    const step = (t, k) => { loadingText(t); BX.loadingStep(t); if (k) $('#loadBar').style.width = Math.round(k * 100) + '%'; };
    step('Loading fonts…', 0.08);
    try { await Promise.race([Promise.all([document.fonts.load('700 40px Fredoka'), document.fonts.load('400 40px "Luckiest Guy"')]), sleep(2500)]); } catch (e) { /* fallback font */ }
    await warmHudText();
    step('Paving the sky roads…', 0.18);
    tileTexture();
    await pause();
    buildMainView();
    SH.initShadows();
    await pause();
    step('Fuelling the jets…', 0.36);
    await buildAsmr(pause);
    buildMotor();
    prerenderMusic();
    step('Polishing the cars…', 0.55);
    {
        const hud = $('#hud');
        hud.hidden = false; hud.classList.add('warmui');
        measureHud();
        const endPanels = warmPanels();
        for (let i = 0; i < 4; i++) await new Promise((r) => { requestAnimationFrame(r); setTimeout(r, 120); });
        endPanels();
        hud.classList.remove('warmui'); hud.hidden = true;
    }
    // the warm-up: every shader the game uses (the course, the city, the cars, the cops, every effect) compiled and drawn once now, not in play
    step('Warming up the engines…', 0.75);
    const blank = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    blank.needsUpdate = true;
    const extras = [fxWarmGroup(), new T.Sprite(new T.SpriteMaterial({ map: blank, transparent: true, depthWrite: false, toneMapped: false }))];
    for (const g of extras) { g.position.set(0, -200, 0); scene.add(g); }
    carsWarm();
    const warmCar = new Car({ name: 'warm', lv: 1, wins: 0, car: 'comet' });
    warmCar.root.position.set(0, -200, 0);
    mainView.prepareAt(HUB.spawn.x, 0, HUB.spawn.z);
    mainView.warm(true);
    try {
        const base = await Promise.race([loadBase(), sleep(4000)]);
        const a = base ? await createAvatar(null) : null;
        if (a) { a.root.position.set(0, -200, 10); a.update(1 / 60, { t: 0, pose: 'kart' }); scene.add(a.root); extras.push(a.root); }
    } catch (e) { /* the avatar's shaders compile when it first shows */ }
    fxShowAll(true);
    camera.position.set(HUB.spawn.x, 30, HUB.spawn.z - 40); camera.lookAt(0, 0, 100); camera.updateMatrixWorld();
    gpuName();
    mainView.update(0, courseClock(Date.now()), camera, null, HUB.spawn.x, 0, HUB.spawn.z);
    try { await Promise.race([renderer.compileAsync(scene, camera), sleep(1500)]); } catch (e) { /* later */ }
    const culled = [];
    scene.traverse((o) => { if ((o.isMesh || o.isPoints || o.isSprite || o.isLine) && o.frustumCulled) { o.frustumCulled = false; culled.push(o); } });
    render();
    for (const o of culled) o.frustumCulled = true;
    await pause();
    fxShowAll(false);
    for (const g of extras) scene.remove(g);
    warmCar.dispose();
    mainView.warm(false);
    beginCars(); endCars();
    console.info('[prewarm] ready,', renderer.info.programs.length, 'shaders');
}
async function boot() {
    installIcons();
    BX.initBloxity();
    joinTask = joinServer();
    joinTask.catch(() => {});
    loadBase().catch(() => {});
    worldReady = prepareWorld();
    wirePortalSettings();
    wirePortalEvents();
    BX.onIdentity((id) => {
        if (net.room && id.loggedIn && id.token && !net.bloxity) net.send('auth', { token: id.token });
        if (net.room) { setupLocalAvatar(); syncMyAvatar(); }
    });
    addEventListener('pagehide', () => { try { if (net.room) net.room.leave(true); } catch (e) { /* closing anyway */ } });
    $('#retryBtn').addEventListener('click', () => location.reload());
    unlockAudioOnGesture();
    requestAnimationFrame(frame);
    play();
}
boot();

// =====================================================================================
// QA: the autopilot drives the course on the bots' pilot, the same input and physics as you
// =====================================================================================
function autoStep(dt, ct) {
    const out = P.autoInp || (P.autoInp = { thr: 0, steer: 0, fly: false, boost: false });
    out.thr = 0; out.steer = 0; out.fly = false; out.boost = false;
    if (!world || switching || anyPopup() || P.finished || P.out) return;
    if (match && match.phase0) return;
    // on the Garage Deck: out through START first
    if (world.main && P.cp < 0 && !P.pilot) { P.pilot = newPilot({ speed: 1, slip: 0 }); resetPilot(P.pilot, 0); }
    if (!P.pilot) { P.pilot = newPilot({ speed: 1, slip: 0 }); resetPilot(P.pilot, world.routeOf(P.cp)); }
    const st = myStats(), a = pilotStep(P.pilot, P.b, world, ct, dt, { top: st.top, jet: st.jet });
    if (a.respawn) { doRespawn('asked'); return; }
    out.thr = a.thr; out.steer = a.steer; out.fly = a.fly; out.boost = a.boost;
}
if (import.meta.env.DEV || import.meta.env.VITE_QA) {
    window.__qa = {
        P, S, cam, net, scene, camera, renderer: () => renderer, audio: () => audioDebug(), actions, view: () => view, world: () => world,
        state: () => ({ x: +P.b.x.toFixed(2), y: +P.b.y.toFixed(2), z: +P.b.z.toFixed(2), onGround: P.b.onGround, spd: +P.b.spd.toFixed(1), gas: Math.round(P.b.gas), coins: S.coins, gems: S.gems, keys: S.keys, stars: S.stars, lv: S.lv, xp: S.xp, races: S.races, wins: S.wins, cp: P.cp, stage: S.stage, bestStage: S.bestStage, match: !!match, phase0: match ? match.phase0 : null, finished: P.finished, out: P.out, snaps: P.snaps, respawns: P.respawns, queued, running, switching, car: S.car, inRace: !!match, t: match ? (net.now() - match.t0) / 1000 : null, results: panelIs('results'), tower: panelIs('tower'), laps: S.laps, hits: P.hits, peers: [...remotes.values()].filter((r) => !r.p.bot && r.car.shown).length, others: remotes.size, kmh: Math.round(Math.abs(P.b.spd) * KMH) }),
        auto: (on) => { P.auto = on === false ? null : autoStep; if (on === false) P.pilot = null; },
        play: (w) => { qaWorld = w; startQueue(); },
        queueOff: () => cancelQueue(),
        again: () => actions.playAgain(),
        leave: () => actions.leaveRace(),
        key: (code, down) => { keys[code] = !!down; },
        boost: () => pressBoost(),
        teleport: (x, y, z, yaw) => { net.send('qa', { tp: [x, y, z] }); teleport(x, y, z, yaw); },
        toStage: (i) => { const c = world, sp = c.respawnOf(i); if (c.main) net.send('qa', { stage: i + 1, tp: [sp.x, sp.y, sp.z] }); else net.send('qa', { tp: [sp.x, sp.y, sp.z] }); P.cp = i; teleport(sp.x, sp.y, sp.z, sp.ry); if (P.pilot) resetPilot(P.pilot, c.routeOf(i)); },
        look: (yaw, pitch, dist) => { cam.look = yaw; cam.lookP = pitch; if (dist !== undefined) cam.dist = dist; dragAt = clockT + 1e6; },
        quality: (q) => setQuality(q),
        give: (o) => net.send('qa', o),
        send: (type, m) => net.send(type, m || {}),
        panel: (k, tab) => openPanel(k, tab),
        close: () => { let n = 0; while (closeTop() && n < 9) n++; return n; },
        perf: (reset) => { const r = { frames: perf.n, avgMs: +(perf.sum / Math.max(1, perf.n)).toFixed(2), maxMs: +perf.max.toFixed(1), fps: lastFps, calls: renderer.info.render.calls, tris: renderer.info.render.triangles, paced: skipOdd }; if (reset) { perf.n = 0; perf.sum = 0; perf.max = 0; } return r; },
        diag: () => { renderer.info.reset(); renderer.info.autoReset = false; render(); const r = { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, ratio: renderer.getPixelRatio(), programs: renderer.info.programs.length }; renderer.info.autoReset = true; return r; },
        errors: () => [...errSeen],
        noWatch: (on) => { watchOff = on === undefined ? true : !!on; },
        hud: (on) => { $('#hud').style.display = on ? '' : 'none'; $('#touch').style.display = on ? '' : 'none'; },
        mood: (m) => setMood(m, true),
        world2: (w) => applyWorld(w, true),
        sizes: () => mainView.sizes(),
        msg: { toast, popup, cpWord, showCard, hideCard, bigText, levelUp, airWord },
        res: (k) => setResScale(k),
        gpu: () => gpuName(),
        spikes: () => spikes.splice(0),
        slow: () => slowParts.splice(0),
        sections: () => { const n = secAvg.n || 1, o = {}; for (const k in secAvg) if (k !== 'n') o[k] = +(secAvg[k] / n).toFixed(2); secAvg = {}; return o; },
        avatars: () => avatarsPending(),
        remotes: () => remotes,
        delay: () => { let most = 0; for (const r of remotes.values()) most = Math.max(most, r.track.delay); return most; },
        flips: () => (view ? view.flips() : 0),
        loadSecs: () => loadSecs,
    };
}
void STAGES_PER_WORLD; void TASKS; void resumeAudio; void moodFog; void autoStep;
