// The cars on screen: yours and everyone else's. Four bodies of our own (a roadster, a sports wedge, a hypercar, a grand tourer), painted
// by the paint you bought, with your own Bloxity avatar sat at the wheel (open top, so everyone sees who's driving). The body leans into
// turns, noses up as it climbs, squats on a landing and tumbles when something knocks it flying; the wheels spin with the road and fold
// flat under the car the moment the jets light; the jets burn in your exhaust's colours and leave puffs of smoke.
// Draws: one for a car's body (cached per car and paint), all the wheels in the world in one, all the jet flames in one; far cars lose
// their driver, name tag and smoke. The police: jet cruisers, all in one draw, light bars flashing red and blue.
import { T, V3, scene, billboard, lerpAngle } from './engine.js';
import { createAvatar, unpackAvatar } from './avatar.js';
import { PKit, col, scale, WHITE } from './kit.js';
import { L, FX as MODE, tileMat } from './surfaces.js';
import * as FX from './fx.js';
import { carById, CARS, paintById, exhaustById, rankOf } from '../../shared/config.js';

const TAU = Math.PI * 2;
export const nameLines = (name, lv, wins, color) => [{ t: 'Lv. ' + (lv || 1) + ' ' + rankOf(wins).icon, c: '#ffe24a', s: '#3a2400', px: 40 }, { t: name || ' ', c: color || '#ffffff', s: '#10203a', px: 52 }];
// the size of a car: where its wheels are, its seat, its jets
const WH = { r: 0.66, w: 0.5 };
const SHAPES = [
    { len: 7.4, wid: 3.4, hgt: 1.25, wx: 1.62, wzF: 2.35, wzR: -2.4, seatZ: -0.55, seatY: 0.62, jetY: 0.95, jetX: 0.85 }, // roadster
    { len: 7.8, wid: 3.6, hgt: 1.1, wx: 1.7, wzF: 2.5, wzR: -2.5, seatZ: -0.4, seatY: 0.55, jetY: 0.85, jetX: 1.05 },    // sports wedge
    { len: 8.2, wid: 3.8, hgt: 1.05, wx: 1.78, wzF: 2.6, wzR: -2.6, seatZ: -0.2, seatY: 0.52, jetY: 0.8, jetX: 1.2 },    // hypercar
    { len: 8.4, wid: 3.6, hgt: 1.2, wx: 1.7, wzF: 2.75, wzR: -2.6, seatZ: -0.7, seatY: 0.6, jetY: 0.95, jetX: 0.9 },     // grand tourer
];
export const shapeOf = (carId) => SHAPES[(carById[carId] || CARS[0]).shape];

// ----- a body, built once per car and paint -----
const bodies = new Map();
function bodyGeometry(carId, paintId, police) {
    const key = (police ? 'cop' : carId) + '|' + (police ? '' : paintId);
    let g = bodies.get(key);
    if (g) return g;
    const car = carById[carId] || CARS[0], P = police ? null : paintById[paintId] || paintById.stock, S = police ? SHAPES[3] : SHAPES[car.shape];
    const k = new PKit(3000, 4500), base = police ? 0xf4f6fa : P && P.color ? P.color : car.color, fin = P ? P.finish : 0;
    const paint = col(base), dark = col(0x24262e), trim = col(0x30323a), glass = col(0x1e2e40), hl = 0xfff6d8, tl = 0xff2a3a;
    const L2 = S.len / 2, W2 = S.wid / 2, H = S.hgt, y0 = 0.38;
    const lowC = fin === 2 || police ? dark : paint;
    // the lower body: sills and bumpers (darker toward the road)
    k.slab(0, y0 + 0.5, 0, S.wid, 0.5, S.len, lowC, { bevel: 0.35, grad: 0.5, sideC: lowC, layer: fin === 4 ? L.RAINBOW : L.PLAIN, tile: 3 });
    // the upper body, by shape
    const top = police ? col(0xf4f6fa) : paint;
    if (police || S === SHAPES[3]) {
        // a long bonnet, a fastback
        k.slab(0, H + 0.05, 1.6, S.wid - 0.1, H - y0 - 0.4, 3.6, top, { yb: H - 0.25, bevel: 0.55, grad: 0.3 });
        k.slab(0, H + 0.12, -2.2, S.wid - 0.1, H - y0 - 0.35, 3.0, top, { bevel: 0.55, grad: 0.3 });
    } else if (S === SHAPES[0]) {
        // the roadster: a round nose, a rising rear deck
        k.slab(0, H, 1.7, S.wid - 0.1, H - y0 - 0.4, 3.4, top, { yb: H - 0.3, bevel: 0.6, grad: 0.3 });
        k.slab(0, H + 0.08, -2.3, S.wid - 0.1, H - y0 - 0.35, 2.8, top, { yb: H + 0.02, bevel: 0.6, grad: 0.3 });
        k.blob(0, H + 0.1, -2.8, S.wid * 0.7, 0.5, 1.6, top, { ao: 0.1 });
    } else if (S === SHAPES[1]) {
        // a wedge: low and sharp at the front, high at the back
        k.slab(0, H - 0.05, 1.9, S.wid - 0.1, H - y0 - 0.45, 3.6, top, { yb: H - 0.45, bevel: 0.35, grad: 0.3 });
        k.slab(0, H + 0.15, -2.2, S.wid - 0.1, H - y0 - 0.3, 3.2, top, { bevel: 0.35, grad: 0.3 });
    } else {
        // the hypercar: wide hips, a cockpit forward, deep side intakes
        k.slab(0, H - 0.1, 2.2, S.wid - 0.4, H - y0 - 0.5, 3.6, top, { yb: H - 0.5, bevel: 0.5, grad: 0.3 });
        k.slab(0, H + 0.1, -1.8, S.wid, H - y0 - 0.3, 4.2, top, { bevel: 0.6, grad: 0.3 });
        for (const a of [-1, 1]) k.box(a * (W2 + 0.02), H - 0.35, -0.9, 0.12, 0.42, 1.6, dark, {});
    }
    // the open cockpit: a dark tub, the seat, the wheel, the windscreen
    k.box(0, H - 0.05, S.seatZ + 0.25, S.wid - 1.0, 0.2, 2.4, dark, {});
    k.slab(0, S.seatY + 0.55, S.seatZ - 0.35, 1.3, 0.6, 0.9, trim, { bevel: 0.2 });
    k.slab(0, S.seatY + 1.45, S.seatZ - 0.75, 1.2, 1.2, 0.25, trim, { bevel: 0.1 });
    k.torus(0, H + 0.35, S.seatZ + 1.15, 0.36, 0.07, 0x1a1a20, { up: true, n: 12, s: 4 });
    {
        const wz = S.seatZ + 1.75, wy = H + 0.05;
        k.quad([-W2 + 0.35, wy, wz], [W2 - 0.35, wy, wz], [W2 - 0.45, wy + 0.8, wz - 0.5], [-W2 + 0.45, wy + 0.8, wz - 0.5], glass, { mode: 0 });
        k.quad([W2 - 0.35, wy, wz], [-W2 + 0.35, wy, wz], [-W2 + 0.45, wy + 0.8, wz - 0.5], [W2 - 0.45, wy + 0.8, wz - 0.5], glass, { mode: 0 });
        k.tube([-W2 + 0.45, wy + 0.8, wz - 0.5], [W2 - 0.45, wy + 0.8, wz - 0.5], 0.07, 0x2a2a30, { n: 4 });
    }
    // a roll hoop behind the seat (and on the police car, a roof and the light bar)
    if (police) {
        k.slab(0, H + 1.4, -0.7, S.wid - 0.6, 0.25, 2.6, top, { bevel: 0.2 });
        for (const a of [-1, 1]) for (const d of [0.55, -1.95]) k.tube([a * (W2 - 0.35), H, d], [a * (W2 - 0.35), H + 1.3, d], 0.09, 0x2a2a30, { n: 4 });
        k.box(0, H + 1.6, -0.7, 2.2, 0.24, 0.55, 0x2a2a30, {});
        k.decal(0, H + 0.12 + 0.01, 1.7, 1.6, 1.0, col(0x1a2a6a), L.STAR, 0, { mode: MODE.DECAL });
    } else {
        k.tube([-0.65, H + 0.05, S.seatZ - 0.95], [-0.65, H + 1.05, S.seatZ - 0.95], 0.09, 0x3a3a42, { n: 4 });
        k.tube([0.65, H + 0.05, S.seatZ - 0.95], [0.65, H + 1.05, S.seatZ - 0.95], 0.09, 0x3a3a42, { n: 4 });
        k.tube([-0.65, H + 1.05, S.seatZ - 0.95], [0.65, H + 1.05, S.seatZ - 0.95], 0.09, 0x3a3a42, { n: 4 });
    }
    // a wing at the back (the sports car and the hypercar), fins on the roadster
    if (S === SHAPES[1] || S === SHAPES[2]) {
        k.slab(0, H + 0.95, -L2 + 0.55, S.wid - 0.3, 0.16, 0.9, fin === 1 ? WHITE : dark, { bevel: 0.05 });
        for (const a of [-1, 1]) k.box(a * 1.1, H + 0.5, -L2 + 0.6, 0.12, 0.8, 0.4, dark, {});
    } else if (S === SHAPES[0]) for (const a of [-1, 1]) k.tri3([a * (W2 - 0.3), H + 0.05, -L2 + 0.4], [a * (W2 - 0.3), H + 0.75, -L2 + 0.25], [a * (W2 - 0.3), H + 0.05, -L2 + 1.4], paint);
    // paint: racing stripes, flames
    if (fin === 1) for (const a of [-0.35, 0.35]) { k.box(a, H + 0.135, 1.7, 0.42, 0.04, 3.3, WHITE, {}); k.box(a, H + 0.2, -2.25, 0.42, 0.04, 2.7, WHITE, {}); }
    if (fin === 3) for (const a of [-1, 1]) {
        const x = a * (W2 + 0.03), cs = a > 0 ? -Math.PI / 2 : Math.PI / 2;
        k.quad([x, y0 + 0.3, 2.9], [x, y0 + 0.3, -1.4], [x, H - 0.1, -1.4], [x, H - 0.1, 2.9], WHITE, { layer: L.FLAMES, mode: MODE.DECAL, uv: a > 0 ? [0, 0, 1, 1] : [1, 0, 0, 1] });
        void cs;
    }
    // a light line down each shoulder (the eye reads it as a highlight; no reflections), little mirrors by the windscreen
    if (!police) for (const a of [-1, 1]) {
        k.box(a * (W2 - 0.04), H - 0.32, 0.2, 0.06, 0.1, S.len * 0.78, scale(paint, 1.35), { noBottom: true });
        k.box(a * (W2 + 0.18), H + 0.28, S.seatZ + 1.55, 0.36, 0.22, 0.12, dark, {});
    }
    // the face: a grille, headlights; the tail: lights, the two jet nozzles
    k.box(0, y0 + 0.45, L2 - 0.02, S.wid * 0.5, 0.32, 0.12, dark, {});
    for (const a of [-1, 1]) {
        k.blob(a * (W2 - 0.55), y0 + 0.62, L2 - 0.1, 0.8, 0.32, 0.25, hl, { mode: MODE.GLOW, far: true });
        k.box(a * (W2 - 0.55), y0 + 0.62, -L2 + 0.03, 0.9, 0.22, 0.1, tl, { mode: MODE.GLOW });
        k.tube([a * S.jetX, S.jetY, -L2 + 0.7], [a * S.jetX, S.jetY, -L2 - 0.25], 0.36, 0x4a4c56, { n: 8 });
        k.disc(a * S.jetX, S.jetY, -L2 - 0.27, 0.27, 0.05, 0xffb040, { n: 8, mode: MODE.GLOW, bevel: 0.01, noBottom: true });
        // the wheel arches
        for (const wz of [S.wzF, S.wzR]) k.blob(a * (W2 - 0.25), y0 + 0.55, wz, 0.9, 1.1, 1.9, lowC, { ao: 0.5, far: true });
    }
    // the hover pads under the car, glowing a little
    for (const z of [1.6, -1.6]) k.disc(0, y0 - 0.02, z, 0.55, 0.06, 0x3af4ff, { n: 8, mode: MODE.GLOW, bevel: 0.01, noBottom: true });
    if (police) {
        // the bar's red and blue (they flash: the lights are their own meshes)
        k.decal(0, y0 + 0.82, 0, S.wid + 0.06, 1, col(0x1a2a6a), L.STRIPE, 0, { mode: 0 });
    }
    g = k.geometry();
    bodies.set(key, g);
    return g;
}

// ----- every wheel in the world, in one draw -----
const MAXW = 120;
function wheelGeometry() {
    const k = new PKit(700, 1100);
    // a tyre (a fat torus lying in the y-z plane, its axle along x), a bright hub
    k.torus(0, 0, 0, WH.r * 0.66, WH.r * 0.34, 0x1e1e22, { up: true, n: 14, s: 6, ry: Math.PI / 2 });
    k.torus(0, 0, 0, WH.r * 0.32, WH.r * 0.16, 0xd8dce4, { up: true, n: 10, s: 4, ry: Math.PI / 2 });
    return k.geometry();
}
let wheels = null, flames = null, lightsR = null, lightsB = null, copBodies = null;
let nWheels = 0, nFlames = 0, nCops = 0, nLights = 0;
const M4 = new T.Matrix4(), M5 = new T.Matrix4(), Q = new T.Quaternion(), V = new V3(), SC = new V3(), E = new T.Euler();
function ensure() {
    if (wheels) return;
    const wg = wheelGeometry();
    wheels = new T.InstancedMesh(wg, tileMat('instanced'), MAXW);
    wheels.frustumCulled = false; wheels.castShadow = true; wheels.count = 0;
    scene.add(wheels);
    // a jet's flame: a glowing cone pointing back along -z (and a hot core)
    const fk = new PKit(200, 300);
    fk.cyl(0, 0, 0, 0.42, 0.04, 2.6, 0xffffff, { n: 8, mode: MODE.GLOW, cap: false, c0: 0xffffff, c2: 0xffffff });
    const fg = fk.geometry();
    fg.rotateX(-Math.PI / 2);
    flames = new T.InstancedMesh(fg, tileMat('crowd'), 64);
    flames.frustumCulled = false; flames.castShadow = false; flames.count = 0;
    flames.setColorAt(0, new T.Color(1, 0.6, 0.2));
    scene.add(flames);
    const lk = new PKit(200, 300);
    lk.blob(0, 0, 0, 0.9, 0.36, 0.55, 0xffffff, { mode: MODE.GLOW, far: true });
    const lg = lk.geometry();
    lightsR = new T.InstancedMesh(lg, tileMat('crowd'), 16); lightsB = new T.InstancedMesh(lg, tileMat('crowd'), 16);
    for (const [m, c] of [[lightsR, 0xff2a3a], [lightsB, 0x2a6aff]]) { m.frustumCulled = false; m.castShadow = false; m.count = 0; for (let i = 0; i < 16; i++) m.setColorAt(i, new T.Color(c)); scene.add(m); }
    copBodies = new T.InstancedMesh(bodyGeometry('tidal', '', true), tileMat('instanced'), 8);
    copBodies.frustumCulled = false; copBodies.castShadow = true; copBodies.count = 0;
    scene.add(copBodies);
}
export function beginCars() { ensure(); nWheels = 0; nFlames = 0; nCops = 0; nLights = 0; }
export function endCars() {
    wheels.count = nWheels; wheels.visible = nWheels > 0; if (nWheels) wheels.instanceMatrix.needsUpdate = true;
    flames.count = nFlames; flames.visible = nFlames > 0; if (nFlames) { flames.instanceMatrix.needsUpdate = true; if (flames.instanceColor) flames.instanceColor.needsUpdate = true; }
    copBodies.count = nCops; copBodies.visible = nCops > 0; if (nCops) copBodies.instanceMatrix.needsUpdate = true;
    const t = performance.now() / 1000, on = Math.floor(t * 7) % 2;
    lightsR.count = nLights; lightsB.count = nLights;
    lightsR.visible = nLights > 0 && on === 0; lightsB.visible = nLights > 0 && on === 1;
    if (nLights) { lightsR.instanceMatrix.needsUpdate = true; lightsB.instanceMatrix.needsUpdate = true; }
}
// the warm-up: one of each drawn
export function carsWarm() { ensure(); for (const m of [wheels, flames, lightsR, lightsB, copBodies]) { m.count = 1; m.visible = true; m.setMatrixAt(0, M4.makeTranslation(0, -300, 0)); m.instanceMatrix.needsUpdate = true; } }
const flameC = new T.Color();
function addFlame(m, len, color) {
    if (nFlames >= 64) return;
    M5.makeScale(1, 1, len);
    flames.setMatrixAt(nFlames, M4.multiplyMatrices(m, M5));
    flameC.set(color);
    flames.setColorAt(nFlames, flameC);
    nFlames++;
}
// show cars on the Garage Deck's turntables: a body each, their wheels in the shared batch while you're near
const shows = [];
export function addShowCar(x, y, z, yaw, carId, paintId, spin) {
    ensure();
    const m = new T.Mesh(bodyGeometry(carId, paintId), tileMat('instanced'));
    m.position.set(x, y, z); m.rotation.y = yaw; m.castShadow = true;
    scene.add(m);
    shows.push({ m, S: SHAPES[(carById[carId] || CARS[0]).shape], spin: spin || 0 });
}
export function updateShowCars(dt, cam) {
    for (const s of shows) {
        const near = Math.abs(s.m.position.y - cam.y) < 120 && Math.hypot(s.m.position.x - cam.x, s.m.position.z - cam.z) < 260;
        if (s.m.visible !== near) s.m.visible = near;
        if (!near) continue;
        s.m.rotation.y += s.spin * dt;
        s.m.updateMatrixWorld();
        for (const sx of [-1, 1]) for (const wz of [s.S.wzF, s.S.wzR]) {
            if (nWheels >= MAXW) break;
            M5.compose(V.set(sx * s.S.wx, WH.r - 0.05, wz), Q.identity(), SC.set(1, 1, 1));
            wheels.setMatrixAt(nWheels++, M5.premultiply(s.m.matrixWorld));
        }
    }
}
// a police jet cruiser at (x, y, z) heading yaw, its jets lit
export function addCop(x, y, z, yaw, pitch, roll, t) {
    if (nCops >= 8) return;
    Q.setFromEuler(E.set(pitch, yaw, roll, 'YXZ'));
    M4.compose(V.set(x, y + 0.2, z), Q, SC.set(1, 1, 1));
    copBodies.setMatrixAt(nCops++, M4);
    const S = SHAPES[3];
    // its lights: left red, right blue (they take turns)
    if (nLights < 16) {
        M5.makeTranslation(0.6, S.hgt + 1.62, -0.7); lightsR.setMatrixAt(nLights, M5.premultiply(M4));
        M5.makeTranslation(-0.6, S.hgt + 1.62, -0.7); lightsB.setMatrixAt(nLights, M5.premultiply(M4));
        nLights++;
    }
    for (const a of [-1, 1]) { M5.makeTranslation(a * S.jetX, S.jetY, -S.len / 2 - 0.2); M5.premultiply(M4); addFlame(M5, 0.8 + Math.sin(t * 40 + a) * 0.15, 0x6ab4ff); }
    // the wheels, folded flat
    for (const sx of [-1, 1]) for (const wz of [S.wzF, S.wzR]) {
        if (nWheels >= MAXW) break;
        M5.compose(V.set(sx * S.wx, 0.5, wz), Q.setFromEuler(E.set(0, 0, sx * Math.PI / 2)), SC.set(1, 1, 1));
        wheels.setMatrixAt(nWheels++, M5.premultiply(M4));
    }
}

// Avatars are built one a frame at most; main.js pumps the queue every frame, and waits for it behind the fade
const avQueue = [];
let avBusy = false;
export function pumpAvatars() {
    if (avBusy || !avQueue.length) return;
    const job = avQueue.shift();
    if (job.car.dead) return;
    avBusy = true;
    createAvatar(job.data).then((a) => { avBusy = false; job.done(a); }, () => { avBusy = false; job.done(null); });
}
export const avatarsPending = () => avQueue.length + (avBusy ? 1 : 0);

const AV_SCALE = 0.44;
export class Car {
    // o: { name, lv, wins, noLabel, car, paint, exh }
    constructor(o) {
        o = o || {};
        ensure();
        this.root = new T.Group();
        this.tilt = new T.Group();           // pitch and roll, the suspension's bob
        this.root.add(this.tilt);
        this.body = new T.Mesh(bodyGeometry('comet', 'stock'), tileMat('instanced'));
        this.body.castShadow = true; this.body.receiveShadow = false;
        this.tilt.add(this.body);
        this.seat = new T.Group();
        this.tilt.add(this.seat);
        scene.add(this.root);
        this.blox = null; this.av = null; this.loading = false; this.dead = false;
        this.labelKey = '';
        this.label = o.noLabel ? null : billboard(nameLines(o.name, o.lv, o.wins), 3.3, 512, new V3(0, 5.2, 0), this.root);
        if (this.label) this.label.renderOrder = 9;
        this.carId = ''; this.paintId = ''; this.exhId = 'stock'; this.S = SHAPES[0];
        this.spin = 0; this.fold = 0; this.pitch = 0; this.roll = 0; this.bob = 0; this.bobV = 0; this.tumble = 0; this.puffT = 0; this.flameK = 0; this.boostK = 0; this.steerV = 0;
        this.shown = true;
        this.setCar(o.car || 'comet', o.paint || 'stock');
        this.setExhaust(o.exh || 'stock');
    }
    setCar(carId, paintId) {
        carId = carById[carId] ? carId : 'comet';
        paintId = paintById[paintId] ? paintId : 'stock';
        if (carId === this.carId && paintId === this.paintId) return;
        this.carId = carId; this.paintId = paintId;
        this.S = SHAPES[carById[carId].shape];
        this.body.geometry = bodyGeometry(carId, paintId);
        this.seat.position.set(0, this.S.seatY, this.S.seatZ);
    }
    setExhaust(id) { this.exhId = exhaustById[id] ? id : 'stock'; this.ex = exhaustById[this.exhId]; }
    setLabel(name, lv, wins, color) {
        if (!this.label) return;
        const k = name + '|' + lv + '|' + rankOf(wins).name + '|' + (color || '');
        if (k === this.labelKey) return;
        this.labelKey = k;
        this.label.userData.set(nameLines(name, lv, wins, color));
    }
    // a packed avatar (someone else's), or an avatar object made already (yours): the driver
    setAvatar(packed) {
        if (packed === this.av && (this.blox || this.loading)) return;
        this.av = packed;
        const data = packed ? unpackAvatar(packed) : null;
        if (this.blox) { this.blox.setProportions(data && data.proportions); this.blox.setEquipped(data || {}); return; }
        if (this.loading) return;
        this.loading = true;
        avQueue.push({ car: this, data, done: (a) => {
            this.loading = false;
            if (!a) return;
            if (this.dead) { a.dispose(); return; }
            this.wear(a);
            if (this.av !== packed) this.setAvatar(this.av);
        } });
    }
    wear(a) {
        if (this.blox && this.blox !== a) this.blox.dispose();
        this.blox = a;
        a.root.scale.setScalar(AV_SCALE);
        a.root.position.set(0, -0.62, 0.05);
        this.seat.add(a.root);
    }
    // a landing: the body squats on its springs (k 0..1.5); a knock: it tumbles over
    squash(k) { this.bobV = -4 * Math.min(1.5, k); }
    // st: { x, y, z, yaw, spd, vy, air, fly, boost, steer, knocked, far, local }
    update(dt, t, st) {
        const r = this.root, S = this.S;
        r.position.set(st.x, st.y, st.z);
        r.rotation.y = st.snap ? st.yaw : lerpAngle(r.rotation.y, st.yaw, 1 - Math.exp(-dt * (st.local ? 40 : 14)));
        // the springs: a bob that settles
        this.bobV += (-this.bob * 160 - this.bobV * 14) * dt;
        this.bob += this.bobV * dt;
        // the body's lean: nose up as it climbs, down as it dives (in the air); into the turns on the road
        const air = !!st.air, spd = st.spd || 0;
        const wantP = air ? Math.max(-0.5, Math.min(0.42, -(st.vy || 0) * 0.016)) : -(st.grade || 0) * 0.8;
        this.pitch += (wantP - this.pitch) * Math.min(1, dt * (air ? 4 : 10));
        this.steerV += ((st.steer || 0) - this.steerV) * Math.min(1, dt * 8);
        const wantR = (air ? -0.24 : 0.06) * this.steerV * Math.min(1, Math.abs(spd) / 30);
        this.roll += (wantR - this.roll) * Math.min(1, dt * 6);
        if (st.knocked) this.tumble += dt * 9; else if (this.tumble) { const to = Math.round(this.tumble / TAU) * TAU; this.tumble += (to - this.tumble) * Math.min(1, dt * 8); if (Math.abs(to - this.tumble) < 0.01) this.tumble = 0; }
        this.tilt.rotation.set(this.pitch, 0, this.roll + this.tumble, 'YXZ');
        this.tilt.position.y = Math.max(-0.35, Math.min(0.3, this.bob * 0.06)) + (air ? 0 : 0);
        // the wheels: spinning with the road, folding flat as the jets light
        this.spin += spd * dt / WH.r;
        this.fold += ((st.fly || (air && st.local && st.flyHeld)) ? 1 - this.fold : -this.fold) * Math.min(1, dt * 7);
        this.flameK += ((st.fly ? 1 : 0) - this.flameK) * Math.min(1, dt * 14);
        this.boostK += ((st.boost ? 1 : 0) - this.boostK) * Math.min(1, dt * 10);
        this.skip = st.far ? !this.skip : false;
        if (this.blox && !this.skip) { this.animDt = (this.animDt || 0) + dt; this.blox.update(this.animDt, { pose: 'kart', steer: this.steerV, bump: Math.max(0, -this.bob * 0.1), t, moving: false, air: false, vy: 0, speed: 0 }); this.animDt = 0; }
        if (this.blox && this.blox.setFar) this.blox.setFar(!!st.far);
        // far off: no driver at all (a car's few parts are all there is to see from there)
        if (this.seat.visible === !!st.far) this.seat.visible = !st.far;
        if (this.label && this.label.visible === !!st.far) this.label.visible = !st.far;
        if (!this.shown) return;
        r.updateMatrixWorld(true);
        const TM = this.tilt.matrixWorld;
        // four wheels into the shared batch
        for (const sx of [-1, 1]) for (const wz of [S.wzF, S.wzR]) {
            if (nWheels >= MAXW) break;
            const steerA = wz > 0 && !air ? -this.steerV * 0.42 : 0;
            const f = this.fold, drop = f * 0.15;
            M5.compose(V.set(sx * (S.wx - f * 0.25), WH.r - 0.05 - drop + f * 0.18, wz), Q.setFromEuler(E.set(this.spin * (1 - f), steerA, sx * f * Math.PI / 2, 'ZYX')), SC.set(1, 1, 1));
            wheels.setMatrixAt(nWheels++, M5.premultiply(TM));
        }
        // the jets: flames out of the back (bigger on the nitro), puffs of smoke behind
        const ex = this.ex, burn = Math.max(this.flameK, this.boostK * 0.8, 0.12 * Math.min(1, Math.abs(spd) / 20));
        if (burn > 0.05) for (const a of [-1, 1]) {
            M5.makeTranslation(a * S.jetX, S.jetY, -S.len / 2 - 0.25);
            M5.premultiply(TM);
            addFlame(M5, (0.35 + burn * 1.1 + this.boostK * 0.5) * (0.9 + Math.sin(t * 47 + a * 2) * 0.12), ex.flame);
        }
        if (!st.far && (this.flameK > 0.4 || this.boostK > 0.4)) {
            this.puffT -= dt;
            if (this.puffT <= 0) {
                this.puffT = st.lowFx ? 0.07 : 0.035;
                const fx = Math.sin(r.rotation.y), fz = Math.cos(r.rotation.y);
                for (const a of [-1, 1]) {
                    V.set(a * S.jetX, S.jetY, -S.len / 2 - 0.9).applyMatrix4(TM);
                    FX.jetPuff(V.x, V.y, V.z, -fx * 6 + (Math.random() - 0.5) * 3, -2 - Math.random() * 3, -fz * 6 + (Math.random() - 0.5) * 3, ex.smoke, 1.6 + Math.random() * 0.8);
                    if (ex.style >= 1) FX.jetSpark(V.x, V.y, V.z, -fx * 10 + (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, -fz * 10 + (Math.random() - 0.5) * 6, ex.flame, ex.style === 2 ? 1.1 : 0.7, ex.style === 2);
                }
            }
        }
    }
    // hidden (far off, another chase): out of the scene too
    setVisible(on) {
        if (on === this.shown) return;
        this.shown = on;
        this.root.visible = on;
        if (on && !this.root.parent && !this.dead) scene.add(this.root); else if (!on && this.root.parent) scene.remove(this.root);
    }
    dispose() {
        this.dead = true;
        if (this.blox) this.blox.dispose();
        scene.remove(this.root);
        if (this.label && this.label.userData.ownTex) this.label.material.map.dispose();
    }
}
void scale;
