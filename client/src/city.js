// The city far below the roads: a street grid painted on one plane that follows you (asphalt, lane lines, pavements, lots and parks,
// each world's own colours), and blocks of towers on it. The towers are built a district at a time (six blocks square) as you come near,
// a little a frame, into one batch: one draw for the whole city, each district culled on its own. A tower never pokes up into the
// course: near the roads it's kept well below them; away from them it can stand tall beside you.
import { T, scene } from './engine.js';
import { PKit, TAU, col, scale, WHITE } from './kit.js';
import { L, FX, tileMat } from './surfaces.js';
import { GROUND_Y } from '../../shared/course.js';
import { WORLDS } from '../../shared/config.js';

const BLOCK = 96, STREET = 24, DIST = 6, DSIZE = BLOCK * DIST;
// each world's city: lots, pavements, roads, lines, parks; the towers' colours and faces
export const CITY = {
    city: { lot: 0xb8bcc4, walk: 0xd8d8d4, road: 0x4a4e58, line: 0xf4f0e0, park: 0x6ac04a, glow: 0, faces: [L.WIN, L.GLASS, L.WIN, L.BRICK], cols: [0xe8e4dc, 0x9ad0f0, 0xf0e0c8, 0xc8a890, 0xd8dce8, 0x8ab8e0], roof: 0x9a9aa4, tree: 0x4ab04a, maxH: 150 },
    mesa: { lot: 0xe8c8a0, walk: 0xf0dcc0, road: 0x8a7464, line: 0xfff0d8, park: 0xc8a870, glow: 0, faces: [L.SANDST, L.SANDST, L.WIN, L.MESA], cols: [0xf0d4b0, 0xe8b890, 0xf8e0c8, 0xd8a078, 0xffe8d0, 0xe89a6a], roof: 0xc89a78, tree: 0x6a9a3a, maxH: 70 },
    neon: { lot: 0x24203a, walk: 0x3a3458, road: 0x14121e, line: 0x2af4ff, park: 0x1a3a3a, glow: 1, faces: [L.WINN, L.WINN, L.WINN, L.GRID], cols: [0x9a8aff, 0x6a5ad8, 0xff8ae8, 0x5ad8ff, 0x8a7ab8, 0xc8a8ff], roof: 0x2a2440, tree: 0x2a8a6a, maxH: 170 },
    glacier: { lot: 0xf0f6fc, walk: 0xffffff, road: 0x8a96a8, line: 0xffffff, park: 0xe4f0f8, glow: 0, faces: [L.WIN, L.WIN, L.SNOW, L.BRICK], cols: [0xe8f0f8, 0xc8d8e8, 0xf4f4f8, 0xb8c8d8, 0xd8e4f0, 0xa8c0d8], roof: 0xf8fcff, tree: 0x2a6a4a, maxH: 110 },
};
const hash2 = (i, j) => { let h = (i * 374761393 + j * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const rngOf = (i, j) => { let s = (Math.floor(hash2(i, j) * 4294967295) >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

// ----- the ground: streets, pavements, lots and parks, painted in the shader -----
export const groundU = {
    uLot: { value: new T.Color(0xb8bcc4) }, uWalk: { value: new T.Color(0xd8d8d4) }, uRoad: { value: new T.Color(0x4a4e58) }, uLine: { value: new T.Color(0xf4f0e0) }, uPark: { value: new T.Color(0x6ac04a) },
    uHaze: { value: new T.Color(0xc8e8ff) }, uGlow: { value: 0 }, uNear: { value: 300 }, uFar: { value: 1500 },
};
const want = { lot: new T.Color(), walk: new T.Color(), road: new T.Color(), line: new T.Color(), park: new T.Color() };
let groundK = 1, glowWant = 0;
export function setCityWorld(w, now) {
    const C = CITY[WORLDS[w].id];
    want.lot.set(C.lot); want.walk.set(C.walk); want.road.set(C.road); want.line.set(C.line); want.park.set(C.park); glowWant = C.glow;
    groundK = now ? 1 : 0;
    if (now) { groundU.uLot.value.copy(want.lot); groundU.uWalk.value.copy(want.walk); groundU.uRoad.value.copy(want.road); groundU.uLine.value.copy(want.line); groundU.uPark.value.copy(want.park); groundU.uGlow.value = glowWant; }
}
export function updateGround(dt) {
    const f = scene.fog;
    groundU.uHaze.value.copy(f.color); groundU.uNear.value = f.near; groundU.uFar.value = f.far;
    if (groundK >= 1) return;
    groundK = Math.min(1, groundK + dt * 0.9);
    const k = groundK >= 1 ? 1 : Math.min(1, dt * 3);
    groundU.uLot.value.lerp(want.lot, k); groundU.uWalk.value.lerp(want.walk, k); groundU.uRoad.value.lerp(want.road, k); groundU.uLine.value.lerp(want.line, k); groundU.uPark.value.lerp(want.park, k);
    groundU.uGlow.value += (glowWant - groundU.uGlow.value) * k;
}
function groundMaterial() {
    return new T.ShaderMaterial({
        uniforms: groundU,
        vertexShader: 'varying vec3 vP; void main() { vP = (modelMatrix * vec4(position, 1.0)).xyz; gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0); }',
        fragmentShader: `uniform vec3 uLot; uniform vec3 uWalk; uniform vec3 uRoad; uniform vec3 uLine; uniform vec3 uPark; uniform vec3 uHaze; uniform float uGlow; uniform float uNear; uniform float uFar; varying vec3 vP;
            float h2(vec2 q) { return fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453); }
            void main() {
                const float B = ${BLOCK.toFixed(1)}, S = ${(STREET / 2).toFixed(1)};
                vec2 p = vP.xz, cell = floor(p / B), f = mod(p, B), d = min(f, B - f);
                float m = min(d.x, d.y), road = 1.0 - step(S, m), walk = (1.0 - step(S + 4.5, m)) * (1.0 - road);
                float park = 1.0 - step(0.5, mod(cell.x * 7.0 + cell.y * 11.0, 9.0));
                vec3 c = mix(uLot, uPark, park);
                // a little texture in the lots, so they don't look painted flat
                c *= 0.94 + 0.08 * h2(floor(p / 6.0));
                c = mix(c, uWalk, walk);
                c = mix(c, uRoad, road);
                // the centre lines, dashed, down every street; a crossing at every corner
                float onX = (1.0 - step(0.5, d.y)) * step(0.5, fract(p.x / 12.0)) * step(S + 4.0, d.x);
                float onZ = (1.0 - step(0.5, d.x)) * step(0.5, fract(p.y / 12.0)) * step(S + 4.0, d.y);
                float zebra = road * step(S, max(d.x, d.y)) * (1.0 - step(S + 4.0, max(d.x, d.y))) * step(0.5, fract((d.x + d.y) / 2.4));
                float ln = max(max(onX, onZ), zebra * 0.8);
                c = mix(c, uLine, ln * 0.9);
                c += uLine * ln * uGlow * 0.6;
                float dist = length(vP.xz - cameraPosition.xz);
                c = mix(c, uHaze, smoothstep(uNear, uFar, dist));
                gl_FragColor = vec4(c, 1.0);
                #include <colorspace_fragment>
            }`,
    });
}

// ----- the towers of one block's lot -----
function tower(k, x, z, w, l, h, C, R, low, glow) {
    const face = C.faces[Math.floor(R() * C.faces.length)], c = C.cols[Math.floor(R() * C.cols.length)], y0 = GROUND_Y, mode = glow && face === L.WINN ? FX.GLOW : 0;
    // the main block, then (often) a narrower top and something on the roof
    const h1 = R() < 0.45 && h > 40 ? h * (0.62 + R() * 0.15) : h;
    k.box(x, y0 + h1 / 2, z, w, h1, l, c, { layer: face, tile: 12, grad: 0.3, noBottom: true, top: C.roof, mode });
    if (h1 < h) {
        const w2 = w * (0.6 + R() * 0.2), l2 = l * (0.6 + R() * 0.2);
        k.box(x, y0 + h1 + (h - h1) / 2, z, w2, h - h1, l2, scale(col(c), 0.95), { layer: face, tile: 12, grad: 0.15, noBottom: true, top: C.roof, mode });
    }
    if (!low && R() < 0.5) k.box(x + (R() - 0.5) * w * 0.3, y0 + h + 2, z + (R() - 0.5) * l * 0.3, w * 0.22, 4, l * 0.22, C.roof, { noBottom: true });
    if (!low && h > 90 && R() < 0.5) { k.cyl(x, y0 + h, z, 0.5, 0.3, 14, 0xd8d8e0, { n: 4, cap: false }); k.blob(x, y0 + h + 14.5, z, 1.4, 1.4, 1.4, 0xff3a3a, { mode: FX.GLOW, far: true }); }
}
function tree(k, x, z, C, s, low, kind) {
    const y0 = GROUND_Y;
    if (kind === 'glacier') { k.cyl(x, y0, z, 0.7 * s, 0.5 * s, 2 * s, 0x6a4a3a, { n: 4, cap: false }); k.cyl(x, y0 + 1.6 * s, z, 3.4 * s, 0, 7 * s, C.tree, { n: low ? 5 : 7, cap: false }); k.cyl(x, y0 + 5.6 * s, z, 2.2 * s, 0, 3.4 * s, 0xf4faff, { n: low ? 5 : 7, cap: false }); return; }
    if (kind === 'mesa') { k.cyl(x, y0, z, 0.9 * s, 0.8 * s, 6 * s, 0x5a9a4a, { n: 6 }); if (!low) { k.cyl(x + 1.4 * s, y0 + 2.4 * s, z, 0.5 * s, 0.5 * s, 2.4 * s, 0x5a9a4a, { n: 5 }); } return; }
    k.cyl(x, y0, z, 0.6 * s, 0.45 * s, 3 * s, 0x7a5a3a, { n: 4, cap: false });
    k.blob(x, y0 + 4.4 * s, z, 6 * s, 5 * s, 6 * s, C.tree, { far: low, ao: 0.35, mode: kind === 'neon' ? FX.GLOW : 0 });
}
// a rock mesa standing out of the desert
function mesaRock(k, x, z, s, R) {
    const y0 = GROUND_Y, c = [0xd8784a, 0xc8603a, 0xe89060][Math.floor(R() * 3)];
    let w = s * (1 + R() * 0.4), y = y0, l = s * (1 + R() * 0.4);
    for (let i = 0; i < 3; i++) {
        const h = s * (0.5 + R() * 0.6);
        k.box(x + (R() - 0.5) * s * 0.2, y + h / 2, z + (R() - 0.5) * s * 0.2, w, h, l, c, { layer: L.MESA, tile: 14, grad: 0.35, noBottom: true, top: 0xe8a070 });
        y += h; w *= 0.6 + R() * 0.2; l *= 0.6 + R() * 0.2;
    }
}

export function buildCity(c, o) {
    const low = !!o.low, group = o.group;
    // which districts there are: every one near the course, with its world (the nearest checkpoint's)
    const pts = [{ x: c.start.x, z: c.start.z, y: c.start.y, w: c.world || 0 }].concat(c.cps.map((p) => ({ x: p.x, z: p.z, y: p.y, w: p.world })));
    const dmap = new Map();
    const reach = c.main ? 1100 : 900;
    for (const p of pts) {
        const i0 = Math.floor((p.x - reach) / DSIZE), i1 = Math.floor((p.x + reach) / DSIZE), j0 = Math.floor((p.z - reach) / DSIZE), j1 = Math.floor((p.z + reach) / DSIZE);
        for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
            const key = i + ',' + j, cx = (i + 0.5) * DSIZE, cz = (j + 0.5) * DSIZE, d = Math.hypot(cx - p.x, cz - p.z);
            const e = dmap.get(key);
            if (!e) dmap.set(key, { i, j, cx, cz, d, w: c.main ? p.w : c.world }); else if (d < e.d) { e.d = d; e.w = c.main ? p.w : c.world; }
        }
    }
    const districts = [...dmap.values()];
    // how tall a tower may be here: under the course (and well clear of it), or free
    const topLimit = (x, z, w2, l2) => {
        let lim = Infinity;
        for (const [ax, az] of [[0, 0], [-w2, -l2], [w2, -l2], [w2, l2], [-w2, l2], [-w2 - 26, 0], [w2 + 26, 0], [0, -l2 - 26], [0, l2 + 26]]) {
            const L2 = c.near(x + ax, z + az);
            if (L2) for (const p of L2) lim = Math.min(lim, p.top - p.h - 22);
        }
        return lim;
    };
    function* districtSteps(D, k) {
        const W = WORLDS[D.w].id, C = CITY[W];
        for (let bi = 0; bi < DIST; bi++) {
            for (let bj = 0; bj < DIST; bj++) {
                const I = D.i * DIST + bi, J = D.j * DIST + bj, R = rngOf(I, J), x0 = I * BLOCK + STREET / 2 + 4.5, z0 = J * BLOCK + STREET / 2 + 4.5, lot = BLOCK - STREET - 9;
                // (the park blocks: the ground shader paints them green; trees here)
                if (isPark(I, J)) {
                    const n = low ? 3 : 7;
                    for (let t = 0; t < n; t++) tree(k, x0 + 6 + R() * (lot - 12), z0 + 6 + R() * (lot - 12), C, 0.9 + R() * 0.7, low, W);
                    yield;
                    continue;
                }
                if (W === 'mesa' && R() < 0.3) { const lim = topLimit(x0 + lot / 2, z0 + lot / 2, lot / 2, lot / 2) - GROUND_Y; if (lim > 30) mesaRock(k, x0 + lot / 2, z0 + lot / 2, Math.min(lim / 2.2, 22 + R() * 22), R); yield; continue; }
                // one, two or four towers on the lot
                const split = R(), parts = split < 0.3 ? [[0, 0, 1, 1]] : split < 0.65 ? [[0, 0, 0.5, 1], [0.5, 0, 1, 1]] : [[0, 0, 0.5, 0.5], [0.5, 0, 1, 0.5], [0, 0.5, 0.5, 1], [0.5, 0.5, 1, 1]];
                for (const [a, b, e, f] of parts) {
                    const w2 = (e - a) * lot - 5, l2 = (f - b) * lot - 5, x = x0 + (a + e) / 2 * lot, z = z0 + (b + f) / 2 * lot;
                    const lim = topLimit(x, z, w2 / 2, l2 / 2) - GROUND_Y;
                    let h = (12 + Math.pow(R(), 1.6) * C.maxH) * (W === 'mesa' ? 0.7 : 1);
                    if (h > lim) h = lim;
                    if (h < 8) continue;
                    tower(k, x, z, w2, l2, h, C, R, low, C.glow);
                }
                yield;
            }
        }
    }
    // the same park test as the ground shader (it must agree, so the trees stand on the green)
    function isPark(I, J) { return (((I * 7 + J * 11) % 9) + 9) % 9 === 0; }
    // ----- the batch -----
    const SLOTS = low ? 14 : 26, CAPV = low ? 7000 : 12000, CAPI = low ? 10500 : 18000, BUILD_MS = low ? 1.2 : 2;
    const empty = new PKit(8, 12);
    empty.quad([0, -900, 0], [0.1, -900, 0], [0.1, -900, 0.1], [0, -900, 0.1], WHITE);
    const eg = empty.geometry(), batch = new T.BatchedMesh(SLOTS, SLOTS * CAPV, SLOTS * CAPI, tileMat('city'));
    batch.perObjectFrustumCulled = false; batch.sortObjects = false; batch.frustumCulled = false;
    batch.castShadow = false; batch.receiveShadow = false;
    batch.matrixAutoUpdate = false; batch.updateMatrix();
    batch.renderOrder = -4;
    const slots = [];
    for (let i = 0; i < SLOTS; i++) { const gid = batch.addGeometry(eg, CAPV, CAPI), inst = batch.addInstance(gid); batch.setVisibleAt(inst, false); slots.push({ gid, inst, di: -1, sphere: new T.Sphere(), on: false, used: 0 }); }
    eg.dispose();
    group.add(batch);
    const ground = new T.Mesh(new T.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), groundMaterial());
    ground.position.set(0, GROUND_Y, 0); ground.renderOrder = -5; ground.frustumCulled = false; ground.matrixAutoUpdate = false; ground.updateMatrix();
    group.add(ground);
    const kit = new PKit(CAPV, CAPI), ATT = [['position', 'p', 3], ['normal', 'n', 3], ['color', 'c', 3], ['uv', 'u', 2], ['aFx', 'f', 2], ['aMi', 'm', 1]], G = batch.geometry, byD = new Map();
    let job = null, tick = 0, built = 0, gx = 0, gz = 0;
    function* copy(slot, di) {
        const info = batch._geometryInfo[slot.gid], vs = info.vertexStart, nv = Math.min(kit.nv, CAPV);
        if (slot.di >= 0) byD.delete(slot.di);
        slot.di = -1;
        if (slot.on) { slot.on = false; batch.setVisibleAt(slot.inst, false); }
        if (kit.nv > CAPV || kit.ni > CAPI) console.warn('[city] district too big', kit.nv, kit.ni);
        yield;
        for (const [name, key, item] of ATT) { const at = G.attributes[name]; at.array.set(kit[key].subarray(0, nv * item), vs * item); at.addUpdateRange(vs * item, nv * item); at.needsUpdate = true; yield; }
        const idx = G.index, A = idx.array, I = kit.i, is = info.indexStart;
        let ni = Math.min(kit.ni, CAPI);
        ni -= ni % 3;
        for (let i = 0; i < ni; i++) A[is + i] = Math.min(I[i], nv - 1) + vs;
        idx.addUpdateRange(is, ni); idx.needsUpdate = true;
        info.vertexCount = nv; info.indexCount = ni; info.start = is; info.count = ni; info.boundingBox = null; info.boundingSphere = null;
        batch._visibilityChanged = true;
        const D = districts[di];
        slot.sphere.center.set(D.cx, GROUND_Y + 60, D.cz); slot.sphere.radius = DSIZE * 0.75 + 90;
        slot.di = di; slot.on = false; batch.setVisibleAt(slot.inst, false);
        byD.set(di, slot);
        built++;
    }
    const order = districts.map((D, i) => ({ i, d: 0 })), wantL = [];
    function stream(x, z, all) {
        tick++;
        if (all || tick % 15 === 1) {
            for (const q of order) { const D = districts[q.i]; q.d = (D.cx - x) ** 2 + (D.cz - z) ** 2; }
            order.sort((a, b) => a.d - b.d);
            wantL.length = 0;
            for (let i = 0; i < order.length && wantL.length < SLOTS; i++) wantL.push(order[i].i);
        }
        // the ground goes with you (painted by where it is, so it never looks to move)
        const sx = Math.round(x / 400) * 400, sz = Math.round(z / 400) * 400;
        if (sx !== gx || sz !== gz) { gx = sx; gz = sz; ground.position.set(sx, GROUND_Y, sz); ground.updateMatrix(); }
        for (const di of wantL) { const sl = byD.get(di); if (sl) sl.used = tick; }
        const t0 = performance.now();
        for (;;) {
            if (!job) {
                const di = wantL.find((d) => !byD.has(d));
                if (di === undefined) return;
                let slot = slots.find((s) => s.di < 0);
                if (!slot) { slot = null; for (const s of slots) if (wantL.indexOf(s.di) < 0 && (!slot || s.used < slot.used)) slot = s; }
                if (!slot) return;
                kit.reset();
                job = { di, slot, it: districtSteps(districts[di], kit), cp: null };
            }
            // copying it in: a step a frame
            if (job.cp) {
                for (;;) { if (job.cp.next().done) { job = null; break; } if (!all) return; }
                if (!all) return;
                continue;
            }
            while (true) {
                if (job.it.next().done) { job.cp = copy(job.slot, job.di); break; }
                if (!all && performance.now() - t0 > BUILD_MS) return;
            }
            if (!all) return;
        }
    }
    function cull(F, camPos) {
        const reach = scene.fog.far + DSIZE * 0.5;
        for (const sl of slots) {
            if (sl.di < 0) continue;
            const vis = F.intersectsSphere(sl.sphere) && Math.hypot(sl.sphere.center.x - camPos.x, sl.sphere.center.z - camPos.z) < reach;
            if (vis !== sl.on) { sl.on = vis; batch.setVisibleAt(sl.inst, vis); }
        }
    }
    return {
        stream, cull,
        activate() {},
        warm(on) { if (on) { for (const sl of slots) if (sl.di >= 0 && !sl.on) { sl.on = true; batch.setVisibleAt(sl.inst, true); } } else { for (const [name] of ATT) G.attributes[name].clearUpdateRanges(); G.index.clearUpdateRanges(); } },
        stats: () => ({ districts: districts.length, slots: SLOTS, built }),
        dispose() { batch.dispose(); ground.geometry.dispose(); ground.material.dispose(); },
    };
}
void TAU;
