// A course on screen. The near stages are drawn in full from the course's parts, each stage one slot of a single batch (one draw, each slot culled on its
// own, built a little a frame so nothing hitches); the whole course also exists as one plain far mesh, so you can always see where you're going, and
// the stages drawn in detail are left out of it in the vertex shader. Everything that moves is moved in the vertex shader from the movers' table.
// Under it all, the city (city.js): blocks of towers far below, and the streets painted on one plane that follows you.
import { T, scene } from './engine.js';
import { CU } from './clock.js';
import { PKit, TAU, col, scale, WHITE } from './kit.js';
import { L, FX, tileMat, depthMat, farMat, holes, setMovers } from './surfaces.js';
import { Signs, big, GOLD } from './signs.js';
import { buildCity } from './city.js';
import { MK, GROUND_Y } from '../../shared/course.js';
import { WORLDS } from '../../shared/config.js';

// ----- each world's palette -----
const SK = {
    city: { road: 0xc8ccd4, rail: 0xeeeae2, railTop: 0xff4a5a, pad: 0x2ad8ff, padSide: 0xe8f8ff, frame: [0xff7a1a, 0xffc21e], ramp: 0xffc21e, tower: [0x9ad0f0, 0xc8e4f4, 0x7ab0d8, 0xe8f0f8], towerL: L.GLASS, barrier: 0xf0eee8, wall: 0x8ab8d8, wallL: L.GLASS, bridge: 0xeeeae2, disc: 0xd8dce4, glow: 0, tones: [0xff4a5a, 0x3ab4ff, 0xffd23a, 0x46e08a, 0xb45aff, 0xff8a3a] },
    mesa: { road: 0xd8c0a8, rail: 0xf0d4b0, railTop: 0xe8783a, pad: 0xff8a3a, padSide: 0xffe8d0, frame: [0x2ab4ff, 0xffe24a], ramp: 0xffe24a, tower: [0xd8784a, 0xe89060, 0xc8603a, 0xf0a070], towerL: L.MESA, barrier: 0xf0d4b0, wall: 0xd8784a, wallL: L.MESA, bridge: 0xb8885a, disc: 0xe8c8a0, glow: 0, tones: [0xff6a3a, 0x2ab4ff, 0xffd23a, 0x46e08a, 0xff3a6a, 0x9a5aff] },
    neon: { road: 0x6a6a8a, rail: 0x3a2a7a, railTop: 0x2af4ff, pad: 0xff2ae0, padSide: 0x3a1a6a, frame: [0x2af4ff, 0xff2ae0], ramp: 0x7aff4a, tower: [0x2a2a4a, 0x342a5a, 0x1e2040, 0x3a3060], towerL: L.WINN, barrier: 0x3a2a7a, wall: 0x2a2a4a, wallL: L.WINN, bridge: 0x3a2a7a, disc: 0x2a2050, glow: 1, tones: [0xff2ae0, 0x2af4ff, 0xfff02a, 0x7aff4a, 0xff5a2a, 0x8a5aff] },
    glacier: { road: 0xd0dcec, rail: 0xf4faff, railTop: 0x3ab4ff, pad: 0x3ab4ff, padSide: 0xe8f8ff, frame: [0xff3a5a, 0xffffff], ramp: 0xff3a5a, tower: [0xe8f4ff, 0xc8e0f4, 0xb0d0ec, 0xf4faff], towerL: L.WIN, barrier: 0xf4faff, wall: 0xc8e0f4, wallL: L.SNOW, bridge: 0xa8c8e8, disc: 0xe4f0fa, glow: 0, tones: [0xff3a5a, 0x3ab4ff, 0xffd23a, 0x46e08a, 0xb45aff, 0x3affd8] },
};
const skinOf = (w) => SK[WORLDS[Math.max(0, Math.min(WORLDS.length - 1, w))].id];
export { skinOf };

// a road's deck: asphalt with its lines on top, a concrete edge, a dark underside
function roadSlab(k, p, s, low, look) {
    const W = p.hx * 2, Lg = p.hz * 2, ry = p.ry0, ttl = 18;
    const top = look === 'crumble' ? L.CRACKR : look === 'iceRoad' ? L.ICE : look === 'bridge' ? L.CONC : L.ROAD;
    const c = look === 'iceRoad' ? 0xd8eefa : look === 'bridge' ? s.bridge : s.road;
    const uv = top === L.ROAD || top === L.CRACKR ? [0, -Lg / 2 / ttl, 1, Lg / 2 / ttl] : undefined;
    k.slab(p.x, p.y0 ?? p.top, p.z, W, Math.min(p.h, 4), Lg, c, { ry, yb: p.y1, bevel: low ? 0.05 : 0.35, sideC: s.rail, layer: L.CONC, tile: 10, topLayer: top, topUv: uv, topTile: 12, grad: 0.5, mode: 0 });
}
// ----- the parts -----
function drawPart(k, p, low) {
    const s = skinOf(p.world), W = p.hx * 2, Lg = p.hz * 2, y = p.top, ry = p.ry0, cs = Math.cos(ry), sn = Math.sin(ry);
    k.mi = p.mi || 0;
    const tone = (t) => s.tones[((t % s.tones.length) + s.tones.length) % s.tones.length];
    const glow = s.glow ? FX.GLOW : 0;
    const at = (a, d) => [p.x + a * cs + d * sn, p.z - a * sn + d * cs];
    switch (p.look) {
        case 'hub_ground': case 'solid': break; // hub.js draws the Garage Deck and what's on it
        case 'road': case 'crumble': case 'iceRoad': case 'bridge':
            roadSlab(k, p, s, low, p.look);
            if (p.look === 'bridge' && !low) for (const a of [-p.hx + 0.25, p.hx - 0.25]) { const A = at(a, -p.hz), B = at(a, p.hz); k.tube([A[0], y + 0.15, A[1]], [B[0], y + 0.15, B[1]], 0.22, s.railTop, { n: 4, mode: glow }); }
            break;
        case 'ramp': {
            k.slab(p.x, p.y0, p.z, W, Math.min(p.h, 4), Lg, s.ramp, { ry, yb: p.y1, bevel: 0.3, sideC: scale(col(s.ramp), 0.8), layer: L.HAZARD, tile: 6, topLayer: L.ARROW, topUv: [0, -Lg / 12, 1, Lg / 12], grad: 0.4, mode: 0 });
            // the props under its high end
            const H = Math.abs(p.y1 - p.y0);
            if (H > 2 && !low) for (const a of [-p.hx + 1, p.hx - 1]) { const e = at(a, p.hz - 1.5); k.cyl(e[0], Math.min(p.y0, p.y1) - 4, e[1], 0.5, 0.5, H + 3.5, 0x8a8e98, { n: 5, cap: false }); }
            break;
        }
        case 'rail':
            k.slab(p.x, p.y0 ?? y, p.z, W, 2.4, Lg, s.rail, { ry, yb: p.y1 !== undefined ? p.y1 : undefined, bevel: 0.3, sideC: scale(col(s.rail), 0.86), layer: L.CONC, tile: 8, topLayer: L.EDGE, topUv: [0, 0, 1, Lg / 4], grad: 0.3, noBottom: true, mode: glow ? FX.GLOW : 0 });
            break;
        case 'pad': {
            const c = s.pad;
            k.slab(p.x, y, p.z, W, p.h, Lg, s.padSide, { ry, bevel: 0.6, sideC: c, topLayer: L.CHECK, topTile: 6, grad: 0.5, mode: 0 });
            // a glowing rim round the edge, the stage's number, the way on
            const e = 0.9, h2 = y + 0.06;
            for (const [a0, d0, a1, d1] of [[-p.hx + e, -p.hz + e, p.hx - e, -p.hz + e], [p.hx - e, -p.hz + e, p.hx - e, p.hz - e], [p.hx - e, p.hz - e, -p.hx + e, p.hz - e], [-p.hx + e, p.hz - e, -p.hx + e, -p.hz + e]]) {
                const A = at(a0, d0), B = at(a1, d1);
                k.tube([A[0], h2, A[1]], [B[0], h2, B[1]], 0.42, c, { n: 4, mode: FX.GLOW });
            }
            const num = String(p.tone + 1), dw = num.length > 2 ? 4.6 : 5.6, mc = col(c);
            for (let i = 0; i < num.length; i++) { const A = at(((num.length - 1) / 2 - i) * dw * 0.8, -2); k.decal(A[0], y + 0.07, A[1], dw, dw * 1.1, mc, L['D' + num[i]], ry, { mode: FX.DECAL }); }
            if (p.exit !== undefined) { const ca = Math.cos(p.exit), sa = Math.sin(p.exit), ax = p.x + sa * (Lg / 2 - 3.2), az = p.z + ca * (Lg / 2 - 3.2); k.decal(ax, y + 0.08, az, 6, 4.6, mc, L.CHEV, p.exit, { mode: FX.DECAL }); }
            // little posts with lights at the corners
            if (!low) for (const [a, d] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const A = at(a * (p.hx - 0.6), d * (p.hz - 0.6)); k.cyl(A[0], y, A[1], 0.32, 0.26, 3, 0xffffff, { n: 5, cap: true }); k.blob(A[0], y + 3.2, A[1], 0.8, 0.8, 0.8, c, { mode: FX.GLOW, far: true }); }
            break;
        }
        case 'startDeck':
            k.slab(p.x, y, p.z, W, p.h, Lg, 0xf0f0f4, { ry, bevel: 0.6, sideC: s.rail, topLayer: L.CHECK, topTile: 8, grad: 0.5 });
            break;
        case 'frame': {
            // a great painted frame: bands of colour, a bright rim
            const c = s.frame[p.tone % 2], c2 = s.frame[(p.tone + 1) % 2];
            k.box(p.x, y - p.h / 2, p.z, W, p.h, Lg, c, { ry, layer: L.STRIPE, tile: 6, grad: 0.25, top: scale(col(c), 1.1), mode: glow });
            if (!low) { const A = at(-p.hx, -p.hz - 0.06), B = at(p.hx, -p.hz - 0.06); k.tube([A[0], y - 0.4, A[1]], [B[0], y - 0.4, B[1]], 0.36, c2, { n: 4, mode: FX.GLOW }); }
            break;
        }
        case 'tower': {
            // a tower's roof you drive across, and the tower under it all the way down
            const c = s.tower[p.tone % s.tower.length], H = Math.min(p.h, y - GROUND_Y);
            k.box(p.x, y - H / 2 - 0.5, p.z, W - 0.4, H - 1, Lg - 0.4, c, { ry, layer: s.towerL, tile: 12, grad: 0.35, noTop: true, noBottom: true, mode: s.towerL === L.WINN ? FX.GLOW : 0 });
            k.slab(p.x, y, p.z, W, 1.6, Lg, 0xd8d4cc, { ry, bevel: 0.25, sideC: s.rail, topLayer: L.ROOF, topTile: 16, grad: 0.2 });
            // a helipad H, the way across
            const mc = col(s.pad);
            k.decal(p.x, y + 0.05, p.z, Math.min(W, Lg) * 0.55, Math.min(W, Lg) * 0.55, mc, L.PAD, ry, { mode: FX.DECAL });
            if (!low) for (const a of [-1, 1]) { const A = at(a * (p.hx - 1), 0); k.cyl(A[0], y, A[1], 0.6, 0.6, 2.4, 0x9a9aa4, { n: 6 }); k.blob(A[0], y + 2.6, A[1], 1, 1, 1, 0xff3a3a, { mode: FX.GLOW, far: true }); }
            break;
        }
        case 'barrier': {
            const c = s.barrier;
            k.slab(p.x, y, p.z, W, p.h, Lg, c, { ry, bevel: 0.5, sideC: c, layer: L.HAZARD, tile: 4, topLayer: L.EDGE, topUv: [0, 0, W / 3, 1], grad: 0.35, noBottom: true });
            break;
        }
        case 'truck': {
            // a box truck: the cab one way, the box the other (it shuttles across: its long side faces you)
            const c = tone(p.tone), H = p.h, bot = y - H;
            k.slab(p.x, bot + H * 0.92, p.z, W * 0.7, H * 0.78, Lg, 0xf4f4f8, { ry, bevel: 0.35, sideC: 0xe4e6ee, grad: 0.2, layer: L.STRIPE, tile: 6 });
            const cab = at(p.hx * 0.65, 0);
            k.slab(cab[0], bot + H * 0.66, cab[1], W * 0.3, H * 0.5, Lg * 0.96, c, { ry, bevel: 0.4, grad: 0.25 });
            if (!low) { const g2 = at(p.hx * 0.8, 0); k.box(g2[0], bot + H * 0.55, g2[1], W * 0.1, H * 0.2, Lg * 0.9, 0x24303c, { ry }); }
            for (const a of [-p.hx * 0.6, p.hx * 0.1, p.hx * 0.66]) for (const d of [-p.hz - 0.05, p.hz + 0.05]) { const A = at(a, d); k.disc(A[0], bot + 1.1, A[1], 1.1, 0.5, 0x1e1e24, { n: low ? 6 : 10, bevel: 0.1, noBottom: true }); }
            break;
        }
        case 'laser': {
            // a gate of light: bright beams across, a glow between them
            const bot = y - p.h, n = low ? 4 : 7;
            for (let i = 0; i < n; i++) {
                const yy = bot + 1 + i * Math.min(4.6, (p.h - 2) / n), A = at(-p.hx, 0), B = at(p.hx, 0);
                k.tube([A[0], yy, A[1]], [B[0], yy, B[1]], i % 2 ? 0.14 : 0.2, 0xff2a5a, { n: 4, mode: FX.GLOW });
            }
            const A = at(-p.hx, 0), B = at(p.hx, 0), top = bot + Math.min(p.h, n * 4.6);
            k.quad([A[0], bot, A[1]], [B[0], bot, B[1]], [B[0], top, B[1]], [A[0], top, A[1]], [1, 0.25, 0.38], { mode: FX.GLOW });
            k.quad([B[0], bot, B[1]], [A[0], bot, A[1]], [A[0], top, A[1]], [B[0], top, B[1]], [1, 0.25, 0.38], { mode: FX.GLOW });
            break;
        }
        case 'pylon':
            k.box(p.x, y - p.h / 2, p.z, W, p.h, Lg, 0x2a2a3a, { ry, layer: L.HAZARD, tile: 5, grad: 0.3, top: 0xff2a5a, mode: 0 });
            break;
        case 'disc':
            k.disc(p.x, y, p.z, p.r, p.h, s.disc, { n: low ? 14 : 28, bevel: 0.6, topLayer: L.RADIAL, sideC: s.rail, topTile: p.r * 2, layer: L.CONC, grad: 0.4 });
            break;
        case 'hub':
            k.cyl(p.x, y - p.h, p.z, p.r, p.r * 0.85, p.h, 0x3a3a48, { n: 10, capLayer: L.COG });
            break;
        case 'bar':
            k.box(p.x, y - p.h / 2, p.z, W, p.h, Lg, 0xffd21e, { ry, layer: L.HAZARD, tile: 4, mode: 0 });
            k.mi = 0;
            break;
        case 'boostPad':
            k.slab(p.x, y, p.z, W, 0.4, Lg, 0xffffff, { ry, bevel: 0.1, topLayer: L.BOOSTP, topUv: [0, -Lg / 8, W / 8, Lg / 8], mode: FX.GLOW, noBottom: true });
            break;
        case 'wall': {
            // a sheer tower wall (one side of a corridor), its edge lit up
            const c = s.wall, H = p.h;
            k.box(p.x, y - H / 2, p.z, W, H, Lg, c, { ry, layer: s.wallL, tile: 14, grad: 0.3, mode: s.wallL === L.WINN ? FX.GLOW : 0, top: scale(col(c), 1.1) });
            if (!low) { const edge = at(p.tone ? -p.hx : p.hx, -p.hz - 0.1); k.tube([edge[0], y - H + 40, edge[1]], [edge[0], y, edge[1]], 0.5, s.pad, { n: 4, mode: FX.GLOW }); }
            break;
        }
        case 'summit':
            k.disc(p.x, y, p.z, p.r, p.h, 0x30343e, { n: low ? 18 : 36, bevel: 1, topLayer: L.PAD, sideC: 0x24262e, topTile: p.r * 2, layer: L.CONC, r1: p.r * 0.86 });
            if (!low) k.torus(p.x, y + 0.08, p.z, p.r - 1.4, 0.5, 0xffd23a, { n: 36, s: 4, mode: FX.GLOW, flatten: 0.4 });
            break;
        case 'safehouse':
            k.slab(p.x, y, p.z, W, p.h, Lg, 0x3a3e4a, { ry, bevel: 0.5, sideC: 0x2a2c36, topLayer: L.CHECK, topTile: 8 });
            break;
        default:
            k.slab(p.x, y, p.z, W, p.h, Lg, s.road, { ry });
    }
    k.mi = 0;
}

// ----- what's there just to look at -----
const AT = (d, a, v) => [d.x + a * Math.cos(d.ry) + v * Math.sin(d.ry), d.z - a * Math.sin(d.ry) + v * Math.cos(d.ry)];
function drawDeco(k, d, low) {
    const s = skinOf(d.world), x = d.x, y = d.y, z = d.z;
    k.mi = 0;
    switch (d.kind) {
        case 'lamp': {
            // a street lamp leaning over the road
            k.cyl(x, y - 3, z, 0.34, 0.26, 12, 0x3a3e48, { n: 6, cap: false });
            const A = AT(d, 0, 0), dir = d.v > 0 ? -1 : 1, hx = x + Math.cos(d.ry) * dir * 2.4, hz = z - Math.sin(d.ry) * dir * 2.4;
            void A;
            k.tube([x, y + 9, z], [hx, y + 9.6, hz], 0.2, 0x3a3e48, { n: 4 });
            k.blob(hx, y + 9.2, hz, 1.4, 0.6, 0.8, 0xfff4c8, { mode: FX.GLOW, far: true });
            break;
        }
        case 'arrowSign': {
            const c = s.pad, B = AT(d, 0, 0);
            k.cyl(B[0], y - 3, B[1], 0.3, 0.3, 9, 0x5a5e68, { n: 5, cap: false });
            k.box(B[0], y + 7, B[1], 5, 3, 0.4, c, { ry: d.ry, mode: FX.GLOW });
            k.decal(B[0] + Math.sin(d.ry + Math.PI) * 0.25, y + 7, B[1] + Math.cos(d.ry + Math.PI) * 0.25, 3, 2.4, WHITE, L.CHEV, d.ry, { mode: FX.DECAL });
            break;
        }
        case 'billboard': {
            // a big sign on two legs (its words are drawn by the course's signs)
            const B = AT(d, 0, 0);
            for (const a of [-5, 5]) { const P = AT(d, a, 0); k.cyl(P[0], y - 10, P[1], 0.5, 0.5, 22, 0x4a4e58, { n: 6, cap: false }); }
            k.box(B[0], y + 15, B[1], 16, 7, 0.8, 0x1a2a6a, { ry: d.ry, top: 0x3a4a8a, mode: 0 });
            if (!low) { const P = AT(d, 0, 0.5); k.box(P[0], y + 11.2, P[1], 16, 0.3, 1.6, 0x8a8e98, { ry: d.ry }); }
            break;
        }
        case 'window': {
            // the window's lit edge, so you can see where to aim
            const c = skinOf(d.world).frame[1], w = d.w / 2, cs = Math.cos(d.ry), sn = Math.sin(d.ry), P = (a, yy) => [x + a * cs, yy, z - a * sn];
            const pts = [P(-w, y), P(w, y), P(w, y + d.h), P(-w, y + d.h)];
            for (let i = 0; i < 4; i++) k.tube(pts[i], pts[(i + 1) % 4], 0.3, 0xffffff, { n: 4, mode: FX.GLOW });
            void c;
            break;
        }
        case 'trafficLights': {
            const B = AT(d, 0, 0);
            k.cyl(B[0], y - 2, B[1], 0.35, 0.35, 10, 0x2a2a30, { n: 5, cap: false });
            k.box(B[0], y + 9, B[1], 1.4, 3.6, 1.4, 0x1e1e24, { ry: d.ry });
            [0xff3a3a, 0xffc21e, 0x46ec50].forEach((c, i) => k.blob(B[0], y + 10.2 - i * 1.1, B[1], 0.8, 0.8, 0.8, c, { mode: FX.GLOW, far: true }));
            break;
        }
        case 'worldGate': {
            const W = d.w, H = 24, g = skinOf(d.world);
            for (const a of [-W / 2, W / 2]) {
                const P = AT(d, a, 0);
                k.slab(P[0], y + H, P[1], 3.6, H + 8, 3.6, g.tones[0], { ry: d.ry, bevel: 0.6, topLayer: L.CHECK, topTile: 4, grad: 0.5, mode: g.glow ? FX.GLOW : 0 });
            }
            const P = AT(d, 0, 0);
            k.slab(P[0], y + H, P[1], W, 3, 3.2, g.tones[2], { ry: d.ry, bevel: 0.6, grad: 0.4, topLayer: L.CHECK, topTile: 4, mode: g.glow ? FX.GLOW : 0 });
            break;
        }
        case 'trophy': {
            // the Getaway Tower's trophy: a gold cup on a plinth
            k.cyl(x, y, z, 5, 4.4, 3, 0x2a2a34, { n: 16, cap: true });
            k.cyl(x, y + 3, z, 1.2, 1, 5, 0xffc21e, { n: 10 });
            k.cyl(x, y + 8, z, 1.4, 5, 7, 0xffd23a, { n: 18, cap: false, c0: 0xe8a818 });
            k.torus(x, y + 15, z, 5, 0.6, 0xffe88a, { n: 20, s: 5 });
            for (const a of [-1, 1]) k.torus(x + a * 5.6, y + 11.5, z, 1.8, 0.45, 0xffd23a, { up: true, n: 12, s: 4, ry: Math.PI / 2 });
            break;
        }
        case 'safehouse': {
            // a garage with its door up: drive in and you're safe
            const P = AT(d, 0, 6), W = 30, H = 16, cs = Math.cos(d.ry), sn = Math.sin(d.ry);
            for (const a of [-W / 2, W / 2]) { const Q = AT(d, a, 6); k.box(Q[0], y + H / 2, Q[1], 3, H, 22, 0x4a4e5a, { ry: d.ry, layer: L.BRICK, tile: 6, grad: 0.3 }); }
            k.box(P[0], y + H + 1.5, P[1], W + 3, 3, 22, 0x3a3e48, { ry: d.ry, top: 0x2a2c34 });
            const D = AT(d, 0, 16.8);
            k.box(D[0], y + H - 2, D[1], W - 3, 4, 0.6, 0xd8dce4, { ry: d.ry, layer: L.SHUTTER, tile: 4 });
            void cs; void sn;
            break;
        }
    }
    k.mi = 0;
}

// ----- the far picture: every big thing, plainly -----
function addFar(k, c, low, w) {
    const chunkOf = [];
    const put = (ci, v0) => { for (let i = v0; i < k.nv; i++) chunkOf[i] = ci; };
    for (const p of c.parts) {
        if (w >= 0 && p.world !== w) continue;
        if (p.look === 'hub_ground' || p.look === 'solid' || p.look === 'laser' || p.look === 'bar' || p.look === 'rail' || p.look === 'boostPad' || p.look === 'truck' || p.look === 'hub' || p.look === 'pylon') continue;
        if (p.mv) continue;
        const v0 = k.nv, s = skinOf(p.world), W = p.hx * 2, Lg = p.hz * 2, yt = p.y1 !== undefined ? (p.y0 + p.y1) / 2 : p.top;
        if (p.look === 'pad') k.box(p.x, yt - 1.5, p.z, W, 3, Lg, s.pad, { ry: p.ry0, top: s.pad });
        else if (p.look === 'tower') { const H = Math.min(p.h, yt - GROUND_Y); k.box(p.x, yt - H / 2, p.z, W, H, Lg, s.tower[p.tone % s.tower.length], { ry: p.ry0, noBottom: true, top: 0xd8d4cc }); }
        else if (p.look === 'wall') k.box(p.x, yt - p.h / 2, p.z, W, p.h, Lg, s.wall, { ry: p.ry0, noBottom: true });
        else if (p.look === 'frame') k.box(p.x, yt - p.h / 2, p.z, W, p.h, Lg, s.frame[p.tone % 2], { ry: p.ry0, noBottom: true });
        else if (p.r) k.cyl(p.x0, yt - p.h, p.z0, p.r, p.r, p.h, p.look === 'summit' ? 0x30343e : s.disc, { n: low ? 8 : 14 });
        else if (p.y1 !== undefined) k.slab(p.x, p.y0, p.z, W, 2, Lg, p.look === 'ramp' ? s.ramp : s.road, { ry: p.ry0, yb: p.y1, bevel: 0.01, noBottom: true });
        else k.box(p.x, yt - Math.min(p.h, 3) / 2, p.z, W, Math.min(p.h, 3), Lg, p.look === 'barrier' ? s.barrier : s.road, { ry: p.ry0, top: scale(col(s.road), 0.9), noBottom: low });
        put(p.chunk, v0);
    }
    return chunkOf;
}
function farGeometry(c, low, w) {
    const k = new PKit(16000, 24000), chunkOf = addFar(k, c, low, w), nv = k.nv, g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(k.p.slice(0, nv * 3), 3));
    g.setAttribute('normal', new T.BufferAttribute(k.n.slice(0, nv * 3), 3, true));
    g.setAttribute('color', new T.BufferAttribute(k.c.slice(0, nv * 3), 3));
    const ch = new Uint8Array(nv);
    for (let i = 0; i < nv; i++) ch[i] = chunkOf[i] || 0;
    g.setAttribute('aChunk', new T.BufferAttribute(ch, 1));
    g.setIndex(new T.BufferAttribute(nv > 65535 ? k.i.slice(0, k.ni) : new Uint16Array(k.i.subarray(0, k.ni)), 1));
    g.computeBoundingSphere();
    return g;
}

// ----- the rings: gold until you've flown through, faint after; the keys: gold, turning, gone once they're yours -----
function ringGeometry() { const k = new PKit(512, 800); k.torus(0, 0, 0, 1, 0.12, WHITE, { up: true, n: 28, s: 6, mode: FX.GLOW }); return k.geometry(); }
function keyGeometry() {
    const k = new PKit(600, 900), c = 0xffd23a, d = 0xe8a818;
    k.torus(0, 2.2, 0, 1.2, 0.36, c, { up: true, n: 14, s: 5 });
    k.box(0, -0.6, 0, 0.6, 4.2, 0.5, c, { top: 0xffe88a });
    k.box(0.75, -2.0, 0, 1.0, 0.5, 0.5, d, {});
    k.box(0.6, -1.0, 0, 0.7, 0.5, 0.5, d, {});
    return k.geometry();
}

// ----- one course's picture -----
export function buildCourseView(c, opts) {
    const low = !!opts.low, group = new T.Group(), mat = tileMat();
    let seed = 13;
    const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    // what goes in which chunk
    const partsBy = [], decoBy = [], center = [];
    for (let i = 0; i < c.chunks + 1; i++) { partsBy.push([]); decoBy.push([]); center.push({ x: 0, y: 0, z: 0, n: 0 }); }
    for (const p of c.parts) { if (p.look === 'hub_ground' || p.look === 'solid') continue; partsBy[p.chunk].push(p); const C = center[p.chunk]; C.x += p.x0; C.y += p.top0; C.z += p.z0; C.n++; }
    for (const d of c.deco) decoBy[d.chunk].push(d);
    for (const C of center) if (C.n) { C.x /= C.n; C.y /= C.n; C.z /= C.n; }
    // the movers' table
    const table = [];
    for (const p of c.movers) {
        const m = p.mv;
        if (m.k === MK.SLIDE) table.push([m.ax, m.ay, m.az, 0, m.P, m.ph, 0, 0, m.bx, 0, m.bz, 0]);
        else if (m.k === MK.SPIN) table.push([0, 0, 0, 1, m.P, m.ph, m.dir, 0, p.x0, 0, p.z0, 0]);
        else if (m.k === MK.BLINK) table.push([0, 0, 0, 2, m.P, m.ph, m.duty, 0, p.x0, p.top0 - p.h / 2, p.z0, 0]);
        else table.push([0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]);
    }
    // ----- the pool of near stages -----
    const SLOTS = low ? 8 : 12, CAPV = low ? 7000 : 12000, CAPI = low ? 11000 : 19000, BUILD_MS = low ? 1 : 1.6;
    const empty = new PKit(8, 12);
    empty.quad([0, -500, 0], [0.1, -500, 0], [0.1, -500, 0.1], [0, -500, 0.1], WHITE);
    const eg = empty.geometry(), batch = new T.BatchedMesh(SLOTS, SLOTS * CAPV, SLOTS * CAPI, tileMat('batched'));
    batch.perObjectFrustumCulled = false; batch.sortObjects = false; batch.frustumCulled = false;
    batch.customDepthMaterial = depthMat();
    const slots = [];
    for (let i = 0; i < SLOTS; i++) {
        const gid = batch.addGeometry(eg, CAPV, CAPI), inst = batch.addInstance(gid);
        batch.setVisibleAt(inst, false);
        slots.push({ gid, inst, ci: -1, sphere: new T.Sphere(), on: false, used: 0, near: false, empty: false });
    }
    eg.dispose();
    batch.castShadow = !low; batch.receiveShadow = !low;
    batch.matrixAutoUpdate = false; batch.updateMatrix();
    batch.renderOrder = -2;
    group.add(batch);
    const showSlot = (sl, on) => { batch.setVisibleAt(sl.inst, on); };
    const bySlot = new Map(), kit = new PKit(CAPV, CAPI), ATT = [['position', 'p', 3], ['normal', 'n', 3], ['color', 'c', 3], ['uv', 'u', 2], ['aFx', 'f', 2], ['aMi', 'm', 1]], G = batch.geometry;
    let built = 0, tick = 0, job = null, holesDirty = true;
    function* steps(ci) {
        for (const p of partsBy[ci]) {
            if (p.mv) { p.x = p.x0; p.z = p.z0; p.top = p.top0; p.tk = -1; }
            drawPart(kit, p, low);
            yield;
        }
        for (const d of decoBy[ci]) { drawDeco(kit, d, low); yield; }
    }
    function begin(slot, ci) { kit.reset(); job = { slot, ci, it: steps(ci), up: -1 }; }
    function copyStep() {
        const { slot, ci } = job, info = batch._geometryInfo[slot.gid], vs = info.vertexStart, nv = kit.nv, step = job.up++;
        if (step < 0) {
            if (slot.ci >= 0) bySlot.delete(slot.ci);
            slot.ci = -1; slot.near = false;
            if (slot.on) { slot.on = false; showSlot(slot, false); }
            holesDirty = true;
            if (!nv || nv > CAPV || kit.ni > CAPI) { if (nv) console.warn('[world] stage too big', ci, nv, kit.ni); slot.ci = ci; slot.empty = true; bySlot.set(ci, slot); job = null; return; }
            let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
            const p = kit.p;
            for (let i = 0, n = nv * 3; i < n; i += 3) {
                const x = p[i], y = p[i + 1], z = p[i + 2];
                if (x < x0) x0 = x; if (x > x1) x1 = x;
                if (y < y0) y0 = y; if (y > y1) y1 = y;
                if (z < z0) z0 = z; if (z > z1) z1 = z;
            }
            slot.sphere.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
            slot.sphere.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + 24;
            return;
        }
        if (step < ATT.length) {
            const [name, key, item] = ATT[step], at = G.attributes[name];
            at.array.set(kit[key].subarray(0, nv * item), vs * item);
            at.addUpdateRange(vs * item, nv * item);
            at.needsUpdate = true;
            return;
        }
        const idx = G.index, A = idx.array, I = kit.i, is = info.indexStart, ni = kit.ni;
        for (let i = 0; i < ni; i++) A[is + i] = I[i] + vs;
        idx.addUpdateRange(is, ni);
        idx.needsUpdate = true;
        info.vertexCount = nv; info.indexCount = ni; info.start = is; info.count = ni;
        info.boundingBox = null; info.boundingSphere = null;
        batch._visibilityChanged = true;
        slot.ci = ci; slot.empty = false;
        bySlot.set(ci, slot);
        built++;
        holesDirty = true;
        job = null;
    }
    function advance(all) {
        const t0 = performance.now();
        while (job && job.it) {
            if (job.it.next().done) { job.it = null; break; }
            if (!all && performance.now() - t0 > BUILD_MS) return;
        }
        if (all) { while (job) copyStep(); } else if (job) copyStep();
    }
    const order = [];
    for (let i = 0; i < center.length; i++) if (center[i].n) order.push({ i, d: 0 });
    const want = [];
    function wanted(x, y, z) {
        for (const o of order) { const C = center[o.i]; o.d = (C.x - x) * (C.x - x) + (C.y - y) * (C.y - y) * 0.6 + (C.z - z) * (C.z - z); }
        order.sort((a, b) => a.d - b.d);
        want.length = 0;
        for (let i = 0; i < order.length && want.length < SLOTS; i++) want.push(order[i].i);
    }
    function freeSlot() {
        for (const sl of slots) if (sl.ci < 0) return sl;
        let best = null;
        for (const sl of slots) if (want.indexOf(sl.ci) < 0 && (!best || sl.used < best.used)) best = sl;
        return best;
    }
    const runs = [];
    function writeHoles() {
        holesDirty = false;
        runs.length = 0;
        for (const ci of want) { const sl = bySlot.get(ci); if (sl && !sl.empty) runs.push(ci); }
        runs.sort((a, b) => a - b);
        for (const sl of slots) sl.near = false;
        let n = 0;
        for (let i = 0; i < runs.length && n < holes.length;) {
            let e = i;
            while (e + 1 < runs.length && runs[e + 1] === runs[e] + 1) e++;
            holes[n++].set(runs[i], runs[e]);
            for (let q = i; q <= e; q++) bySlot.get(runs[q]).near = true;
            i = e + 1;
        }
        while (n < holes.length) holes[n++].set(-1, -1);
    }
    let wantT = 0;
    function stream(x, y, z, all) {
        wantT--;
        if (all || wantT <= 0) { wantT = 12; const was = want.join(); wanted(x, y, z); if (want.join() !== was) holesDirty = true; }
        for (const ci of want) { const sl = bySlot.get(ci); if (sl) sl.used = tick; }
        if (job) {
            advance(all);
            if (!all) { if (holesDirty) writeHoles(); return; }
        }
        for (const ci of want) {
            if (bySlot.has(ci)) continue;
            const f = freeSlot();
            if (!f) break;
            begin(f, ci);
            f.used = tick;
            advance(all);
            if (!all) break;
        }
        if (holesDirty) writeHoles();
    }
    // ----- the far picture (a piece a world, so what's past the haze isn't drawn at all) -----
    const pieces = [];
    const addPiece = (mesh, order2) => {
        mesh.matrixAutoUpdate = false; mesh.frustumCulled = true; mesh.renderOrder = order2; mesh.castShadow = false;
        mesh.geometry.computeBoundingSphere();
        pieces.push(mesh);
        group.add(mesh);
    };
    for (const w of c.main ? WORLDS.map((_, i) => i) : [c.world]) {
        const far = new T.Mesh(farGeometry(c, low, c.main ? w : -1), farMat());
        far.receiveShadow = false;
        addPiece(far, -3);
    }
    // ----- the Garage Deck and what stands on it (only on the long run) -----
    const baseKit = new PKit(c.main ? 40000 : 6000, c.main ? 60000 : 9000);
    const signs = new Signs(2, 448, 152);
    if (opts.decorate) opts.decorate(baseKit, signs, R);
    for (const S of c.signs) signs.add([big(S.text, GOLD, 92)], S.size, new T.Vector3(S.x, S.y, S.z), true);
    for (const d of c.deco) if (d.kind === 'billboard') { const P = AT(d, 0, -0.6); signs.add([big(d.text, GOLD, 92), { t: d.sub || '', c: '#ffffff', s: '#10203a', px: 30 }], 15, new T.Vector3(P[0], d.y + 15.4, P[1]), false); }
    const baseMesh = new T.Mesh(baseKit.geometry(), mat);
    baseMesh.receiveShadow = !low; baseMesh.castShadow = false; baseMesh.matrixAutoUpdate = false; baseMesh.frustumCulled = false; baseMesh.renderOrder = -1;
    group.add(baseMesh);
    // ----- the city below -----
    const city = buildCity(c, { low, group });
    // ----- the rings over the checkpoints near you: gold until you've touched them, green after -----
    const padKit = new PKit(64, 96);
    padKit.torus(0, 0.28, 0, 9.5, 0.36, WHITE, { n: 20, s: 4, mode: FX.GLOW, flatten: 0.5 });
    const pads = new T.InstancedMesh(padKit.geometry(), tileMat('crowd'), 16);
    pads.frustumCulled = false; pads.count = 0; pads.castShadow = false; pads.receiveShadow = false;
    const padGold = new T.Color(1, 0.84, 0.2), padGreen = new T.Color(0.3, 1, 0.5), mm = new T.Matrix4(), qq = new T.Quaternion(), vv = new T.Vector3(), one = new T.Vector3(1, 1, 1), sc3 = new T.Vector3();
    pads.setColorAt(0, padGold);
    group.add(pads);
    const padOn = new Uint8Array(c.cps.length);
    function writePads(px, py, pz) {
        let n = 0;
        for (let i = 0; i < c.cps.length && n < 16; i++) {
            const p = c.cps[i];
            if (Math.hypot(p.x - px, p.y - py, p.z - pz) > 360) continue;
            pads.setMatrixAt(n, mm.compose(vv.set(p.x, p.y, p.z), qq.identity(), one));
            pads.setColorAt(n, padOn[i] ? padGreen : padGold);
            n++;
        }
        pads.count = n; pads.visible = n > 0;
        pads.instanceMatrix.needsUpdate = true;
        if (pads.instanceColor) pads.instanceColor.needsUpdate = true;
    }
    // the rings to fly through
    const NR = Math.max(1, c.rings.length);
    const rings = new T.InstancedMesh(ringGeometry(), tileMat('crowd'), NR);
    rings.frustumCulled = false; rings.castShadow = false; rings.count = c.rings.length;
    const ringGold = new T.Color(1, 0.8, 0.16), ringDone = new T.Color(0.42, 0.5, 0.62), ringQ = new T.Quaternion(), Y = new T.Vector3(0, 1, 0);
    const ringGot = new Uint8Array(NR);
    function writeRings() {
        c.rings.forEach((r, i) => {
            rings.setMatrixAt(i, mm.compose(vv.set(r.x, r.y, r.z), ringQ.setFromAxisAngle(Y, r.ry), sc3.setScalar(ringGot[i] ? r.r * 0.86 : r.r)));
            rings.setColorAt(i, ringGot[i] ? ringDone : ringGold);
        });
        rings.instanceMatrix.needsUpdate = true;
        if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    }
    if (c.rings.length) { writeRings(); group.add(rings); }
    // the keys, turning slowly where they float
    const NK = Math.max(1, c.keys.length), keys = new T.InstancedMesh(keyGeometry(), tileMat('instanced'), NK), keyGot = new Uint8Array(NK);
    keys.frustumCulled = false; keys.castShadow = !low; keys.count = 0;
    if (c.keys.length) group.add(keys);
    let keyT = 0;
    function writeKeys(px, py, pz, t) {
        let n = 0;
        for (const k of c.keys) {
            if (keyGot[k.i] || Math.abs(k.x - px) > 380 || Math.abs(k.z - pz) > 380) continue;
            keys.setMatrixAt(n++, mm.compose(vv.set(k.x, k.y + Math.sin(t * 2 + k.i) * 0.6, k.z), ringQ.setFromAxisAngle(Y, t * 1.6 + k.i), sc3.setScalar(1.1)));
        }
        keys.count = n; keys.visible = n > 0;
        if (n) keys.instanceMatrix.needsUpdate = true;
    }
    // ----- the line a chase starts from: see-through until GO -----
    let barrier = null;
    if (c.barrierZ !== undefined) {
        const bk = new PKit(8, 12), W = 18, zz = c.start.z + c.barrierZ;
        bk.quad([-W, c.start.y, zz], [W, c.start.y, zz], [W, c.start.y + 14, zz], [-W, c.start.y + 14, zz], WHITE);
        barrier = new T.Mesh(bk.geometry(), new T.MeshBasicMaterial({ color: 0xff3a5a, transparent: true, opacity: 0.3, side: T.DoubleSide, depthWrite: false }));
        barrier.renderOrder = 3; barrier.frustumCulled = false; barrier.visible = false;
        group.add(barrier);
    }
    signs.build(group);
    // ----- culling: each stage on its own -----
    const F = new T.Frustum(), FS = new T.Frustum(), Mx = new T.Matrix4();
    let flipped = 0, padT = 0;
    function pieceCull(x, y, z) {
        const reach = scene.fog.far * 0.98;
        for (const m of pieces) { const S = m.geometry.boundingSphere; m.visible = S.radius > 0 && Math.hypot(S.center.x - x, S.center.y - y, S.center.z - z) - S.radius < reach; }
        if (c.main) baseMesh.visible = Math.hypot(x, y, z) < reach + 120;
    }
    function cull(cam, shadowCam) {
        cam.updateMatrixWorld();
        F.setFromProjectionMatrix(Mx.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        if (shadowCam) FS.setFromProjectionMatrix(Mx.multiplyMatrices(shadowCam.projectionMatrix, shadowCam.matrixWorldInverse));
        for (const sl of slots) {
            if (sl.ci < 0 || sl.empty) continue;
            const vis = sl.near && (F.intersectsSphere(sl.sphere) || (!!shadowCam && FS.intersectsSphere(sl.sphere)));
            if (vis !== sl.on) { sl.on = vis; showSlot(sl, vis); flipped++; }
        }
        city.cull(F, cam.position);
    }
    const view = {
        c, group, signs, batch, extras: opts.extras || null, table, city,
        activate() { setMovers(table); city.activate(); },
        update(dt, time, cam, shadowCam, px, py, pz) {
            tick++;
            stream(px, py, pz, false);
            city.stream(px, pz, false);
            cull(cam, shadowCam);
            padT -= dt;
            if (padT <= 0) { padT = 0.5; writePads(px, py, pz); pieceCull(px, py, pz); }
            keyT -= dt;
            if (keyT <= 0) { keyT = low ? 0.066 : 0.033; writeKeys(px, py, pz, CU.uNow.value); }
            if (barrier && barrier.visible) barrier.material.opacity = 0.24 + 0.1 * Math.sin(CU.uNow.value * 4);
        },
        prepareAt(x, y, z) { tick++; stream(x, y, z, true); city.stream(x, z, true); writePads(x, y, z); pieceCull(x, y, z); writeKeys(x, y, z, 0); },
        sizes() {
            const k2 = new PKit(CAPV, CAPI);
            let nv = 0, ni = 0, over = 0;
            for (let ci = 0; ci < partsBy.length; ci++) {
                k2.reset();
                for (const p of partsBy[ci]) drawPart(k2, p, low);
                for (const d of decoBy[ci]) drawDeco(k2, d, low);
                nv = Math.max(nv, k2.nv); ni = Math.max(ni, k2.ni);
                if (k2.nv > CAPV || k2.ni > CAPI) over++;
            }
            return { nv, ni, over, CAPV, CAPI, pieces: pieces.length, movers: table.length, farVerts: pieces.reduce((a, m) => a + m.geometry.attributes.position.count, 0), city: city.stats() };
        },
        setBarrier(on) { if (barrier) barrier.visible = on; },
        padsFrom(n) { padOn.fill(0); for (let i = 0; i < Math.min(n, padOn.length); i++) padOn[i] = 1; padT = 0; },
        padTouch(i) { padOn[i] = 1; padT = 0; },
        ringsReset() { ringGot.fill(0); if (c.rings.length) writeRings(); },
        ringTouch(i) { if (i >= 0 && i < c.rings.length && !ringGot[i]) { ringGot[i] = 1; writeRings(); } },
        keysGot(got) { keyGot.fill(0); for (const k in got || {}) if (+k < NK) keyGot[+k] = 1; keyT = 0; },
        flips: () => flipped,
        chunksBuilt: () => built,
        warm(on) {
            if (on) { for (const m of pieces) m.visible = true; baseMesh.visible = true; for (const sl of slots) if (sl.ci >= 0 && !sl.empty && !sl.on) { sl.on = true; showSlot(sl, true); } pads.visible = true; pads.count = Math.max(pads.count, 1); keys.visible = true; keys.count = Math.max(1, keys.count); if (barrier) barrier.visible = true; city.warm(true); return; }
            if (barrier) barrier.visible = false;
            city.warm(false);
            for (const [name] of ATT) G.attributes[name].clearUpdateRanges();
            G.index.clearUpdateRanges();
        },
        dispose() {
            if (group.parent) group.parent.remove(group);
            batch.dispose(); for (const m of pieces) m.geometry.dispose(); baseMesh.geometry.dispose(); pads.geometry.dispose(); pads.dispose(); signs.dispose(); rings.geometry.dispose(); rings.dispose(); keys.geometry.dispose(); keys.dispose();
            city.dispose();
            if (barrier) { barrier.geometry.dispose(); barrier.material.dispose(); }
        },
    };
    return view;
}
void scene;
