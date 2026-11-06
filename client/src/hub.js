// The Garage Deck: a rooftop car park high over Sunburst City where every run starts. Parking bays, the START arch out to Stage 1, four
// stalls to drive up to (the Car Dealer, the Paint Shop, the Crate Stand, the Tune-Up Garage), the Police Chase gate with its lights
// going round, the leaderboard, and the tower the deck sits on, all the way down to the street. The still things are one mesh (one
// draw); the board is a canvas redrawn only when its rows change.
import { T, texFrom, fitFont, prompts } from './engine.js';
import { L, FX, tileMat } from './surfaces.js';
import { PKit, TAU, col, scale, WHITE } from './kit.js';
import { big, WHITE as WHITE_S, PINK, GOLD, AQUA, LIME, RED } from './signs.js';
import { HUB, GROUND_Y, SHOW_DZ } from '../../shared/course.js';
import { clockMs } from '../../shared/config.js';

const DECK_C = 0xc8ccd4;
// the deck: concrete, parking bays, a lane down the middle to the START arch
function deck(k, low) {
    const z0 = HUB.z0, z1 = HUB.z0 + HUB.l, cz = (z0 + z1) / 2, W = HUB.w;
    k.slab(0, 0, cz, W, 10, HUB.l, DECK_C, { bevel: 0.8, sideC: 0xb8bcc4, layer: L.CONC, tile: 10, topLayer: L.CONC, topTile: 14, grad: 0.4 });
    // the lane to the arch
    k.decal(0, 0.04, (HUB.spawn.z + z1) / 2, 22, z1 - HUB.spawn.z + 10, col(0x5a5e68), L.ROAD, 0, { mode: 0, uv: [0, 0, 1, (z1 - HUB.spawn.z) / 18] });
    // painted bays down both sides
    for (const sg of [-1, 1]) for (let i = 0; i < 9; i++) {
        const z = z0 + 18 + i * 16, x = sg * (W / 2 - 14);
        if (Math.abs(z - HUB.cars.z) < 16 || Math.abs(z - HUB.crates.z) < 16) continue;
        k.box(x, 0.03, z - 8, 18, 0.04, 0.5, WHITE, { noBottom: true });
    }
    // the edge walls (low, striped), the gap where the road leaves
    for (const sg of [-1, 1]) k.slab(sg * (W / 2 + 0.8), 2.2, cz, 1.6, 2.4, HUB.l, 0xeeeae2, { bevel: 0.3, topLayer: L.EDGE, topUv: [0, 0, 1, HUB.l / 4], noBottom: true });
    k.slab(0, 2.2, z0 - 0.8, W, 2.4, 1.6, 0xeeeae2, { bevel: 0.3, topLayer: L.EDGE, topUv: [0, 0, W / 4, 1], noBottom: true });
    for (const sg of [-1, 1]) k.slab(sg * (W / 4 + 6), 2.2, z1 + 0.8, W / 2 - 12, 2.4, 1.6, 0xeeeae2, { bevel: 0.3, topLayer: L.EDGE, topUv: [0, 0, W / 8, 1], noBottom: true });
    // the tower the deck sits on, down to the street
    const H = -10 - GROUND_Y;
    k.box(0, -10 - H / 2, cz, W - 6, H, HUB.l - 6, 0x9ad0f0, { layer: L.GLASS, tile: 12, grad: 0.3, noTop: true, noBottom: true });
    if (!low) for (const sg of [-1, 1]) for (const sz of [-1, 1]) k.cyl(sg * (W / 2 - 2), GROUND_Y, cz + sz * (HUB.l / 2 - 2), 2.6, 2.6, H - 10, 0xe8e4dc, { n: 8, cap: false });
    // lamp posts round the deck
    if (!low) for (const sg of [-1, 1]) for (let i = 0; i < 5; i++) {
        const x = sg * (W / 2 - 3), z = z0 + 20 + i * 34;
        k.cyl(x, 0, z, 0.4, 0.3, 12, 0x3a3e48, { n: 6, cap: false });
        k.tube([x, 12, z], [x - sg * 3, 12.6, z], 0.22, 0x3a3e48, { n: 4 });
        k.blob(x - sg * 3, 12.2, z, 1.6, 0.6, 0.9, 0xfff4c8, { mode: FX.GLOW, far: true });
    }
}
// the START arch over the lane, lights along its beam
function startArch(k, signs) {
    const z = HUB.gate.z, W = 26, H = 14;
    for (const sg of [-1, 1]) k.slab(sg * W / 2, H + 1, z, 2.6, H + 1, 2.6, 0xff4a5a, { bevel: 0.5, topLayer: L.CHECK, topTile: 3, grad: 0.4 });
    k.slab(0, H + 3, z, W + 2.6, 3, 3, 0x2a2e3a, { bevel: 0.5, topLayer: L.CHECK, topTile: 4, grad: 0.3 });
    for (let i = 0; i < 9; i++) k.blob(-W / 2 + 2 + i * (W - 4) / 8, H + 0.6, z - 1.6, 0.9, 0.9, 0.9, i % 2 ? 0xffe24a : 0xffffff, { mode: FX.GLOW, far: true });
    k.decal(0, 0.06, z - 6, 22, 5, col(0xffffff), L.CHECK, 0, { mode: 0, uv: [0, 0, 6, 1.4] });
    signs.add([big('START', GOLD, 110)], 13, new T.Vector3(0, H + 6.5, z - 1.8), false);
}
// a stall: a little garage with a striped awning, a counter, a sign over it
function stall(k, sp, color, signs, word, g, side, low) {
    const x = sp.x + side * 12, z = sp.z, c = col(color);
    k.slab(x, 9, z, 10, 9, 18, 0xf0f0f4, { bevel: 0.4, sideC: 0xe4e4ea, layer: L.CONC, tile: 6, grad: 0.3 });
    k.slab(x - side * 4.6, 11.5, z, 3.4, 0.5, 20, color, { bevel: 0.2, layer: L.STRIPE, tile: 3 });
    k.box(x - side * 5.2, 2.2, z, 1.2, 2.4, 14, scale(c, 0.9), { top: 0xffffff });
    // its glowing doorway
    k.box(x - side * 5.05, 5, z, 0.2, 6, 10, color, { mode: FX.GLOW });
    signs.add([big(word, g, 96)], 12, new T.Vector3(sp.x + side * 6, 16.5, z), false);
    // a ring on the deck: drive into it
    k.torus(sp.x, 0.08, sp.z, 9, 0.38, color, { n: low ? 18 : 32, s: 4, mode: FX.GLOW, flatten: 0.4 });
    k.decal(sp.x, 0.05, sp.z, 14, 14, scale(c, 1), L.PAD, 0, { mode: FX.DECAL });
}
// the Police Chase gate: two posts, a beam with the light bar, a red ring on the deck
function chaseGate(k, signs, low) {
    const { x, z } = HUB.chase, W = 18;
    for (const sg of [-1, 1]) k.slab(x + sg * W / 2, 11, z, 2.2, 11, 2.2, 0x1e2a5a, { bevel: 0.4, topLayer: L.CHECK, topTile: 2, grad: 0.4 });
    k.slab(x, 12.6, z, W + 2.2, 2, 2.4, 0x1e2a5a, { bevel: 0.4, grad: 0.3 });
    for (let i = 0; i < 6; i++) k.blob(x - W / 2 + 2 + i * (W - 4) / 5, 13.8, z, 1.4, 0.7, 1, i % 2 ? 0x2a6aff : 0xff2a3a, { mode: FX.GLOW, far: true });
    k.torus(x, 0.08, z, 10, 0.4, 0xff3a5a, { n: low ? 18 : 32, s: 4, mode: FX.GLOW, flatten: 0.4 });
    k.decal(x, 0.05, z, 15, 15, col(0xff3a5a), L.HAZARD, 0, { mode: 0, uv: [0, 0, 3, 3] });
    signs.add([big('POLICE CHASE', RED, 92), { t: 'escape the cops!', c: '#ffffff', s: '#10203a', px: 34 }], 15, new T.Vector3(x, 19, z), false);
}
export function hubDecorate(o) {
    const extras = { boards: [] };
    const decorate = (k, signs) => {
        deck(k, o.low);
        startArch(k, signs);
        stall(k, HUB.cars, 0x3ab4ff, signs, 'CARS', AQUA, -1, o.low);
        stall(k, HUB.paint, 0xff5ac8, signs, 'PAINT', PINK, 1, o.low);
        stall(k, HUB.crates, 0xffa83a, signs, 'CRATES', GOLD, -1, o.low);
        stall(k, HUB.ups, 0x46e08a, signs, 'TUNE-UP', LIME, 1, o.low);
        chaseGate(k, signs, o.low);
        // the turntables the show cars turn on
        for (const key of ['cars', 'paint', 'crates', 'ups']) {
            const s = HUB[key];
            k.disc(s.x, 0.6, s.z - SHOW_DZ, 5.6, 0.6, 0x30343e, { n: o.low ? 16 : 28, bevel: 0.2, topLayer: L.RADIAL, topTile: 11.2, sideC: 0x24262e, noBottom: true });
            k.torus(s.x, 0.62, s.z - SHOW_DZ, 5.5, 0.18, 0xffd23a, { n: o.low ? 16 : 28, s: 3, mode: FX.GLOW, flatten: 0.4 });
        }
        // the board's frame
        const b = HUB.board;
        for (const a of [-12.6, 12.6]) k.cyl(b.x + a * 0.5, 0, b.z + a * 0.866, 0.5, 0.42, 26, 0xffffff, { n: 6 });
        signs.add([big('JETCAR GETAWAY', GOLD, 86)], 22, new T.Vector3(0, 30, HUB.z0 + 6), true);
    };
    const after = (group) => {
        const b = HUB.board, B = boardTexture('Furthest Drivers');
        drawBoard(B, []);
        const m = new T.Mesh(new T.PlaneGeometry(24, 24), new T.MeshBasicMaterial({ map: B.t, toneMapped: false, transparent: true, alphaTest: 0.4, side: T.DoubleSide }));
        m.position.set(b.x, 14, b.z);
        m.rotation.y = Math.atan2(HUB.spawn.x - b.x, HUB.spawn.z - b.z);
        m.matrixAutoUpdate = false; m.updateMatrix();
        group.add(m);
        extras.boards.push(B);
    };
    extras.setBoards = (m) => { if (extras.boards[0]) drawBoard(extras.boards[0], (m.stage || []).map((r) => ({ n: r.n, v: 'Stage ' + r.v })), null); };
    extras.updateLod = () => {};
    extras.warmAll = () => {};
    // the prompts: drive into the rings
    prompts.length = 0;
    prompts.push({ pos: new T.Vector3(HUB.cars.x, 2, HUB.cars.z), r: 10, label: () => 'Car Dealer', act: () => o.open('garage', 'cars'), on: o.onHub });
    prompts.push({ pos: new T.Vector3(HUB.paint.x, 2, HUB.paint.z), r: 10, label: () => 'Paint Shop', act: () => o.open('garage', 'paint'), on: o.onHub });
    prompts.push({ pos: new T.Vector3(HUB.crates.x, 2, HUB.crates.z), r: 10, label: () => 'Open a crate', act: () => o.open('crates'), on: o.onHub });
    prompts.push({ pos: new T.Vector3(HUB.ups.x, 2, HUB.ups.z), r: 10, label: () => 'Tune up your car', act: () => o.open('garage', 'ups'), on: o.onHub });
    prompts.push({ pos: new T.Vector3(HUB.chase.x, 2, HUB.chase.z), r: 10, label: () => 'Join a Police Chase', act: () => o.chase(), on: o.onHub, auto: true });
    return { decorate, after, extras };
}
// rows that float: a title, and a dark pill for each row; only when the rows changed
function boardTexture(title) { const c = document.createElement('canvas'); c.width = 512; c.height = 512; return { c, t: texFrom(c), title, key: '' }; }
function drawBoard(B, rows, fmt) {
    const key = JSON.stringify(rows || []);
    if (key === B.key) return;
    B.key = key;
    const x = B.c.getContext('2d'), W = 512, list = (rows || []).slice(0, 8);
    x.clearRect(0, 0, W, W);
    x.textBaseline = 'middle'; x.lineJoin = 'round';
    x.textAlign = 'center';
    fitFont(x, B.title, W - 20, 56, 700, 'Fredoka, sans-serif', 0);
    x.lineWidth = 9; x.strokeStyle = '#2a1a00'; x.strokeText(B.title, W / 2, 36); x.fillStyle = '#ffd23a'; x.fillText(B.title, W / 2, 36);
    list.forEach((r, i) => {
        const y = 76 + i * 54;
        x.fillStyle = 'rgba(22, 22, 28, 0.92)';
        x.beginPath(); x.roundRect(14, y, W - 28, 46, 14); x.fill();
        x.textAlign = 'left';
        const name = (i + 1) + '. ' + r.n;
        fitFont(x, name, W - 190, 30, 600, 'Fredoka, sans-serif', 0);
        x.fillStyle = '#ffffff'; x.fillText(name, 30, y + 24);
        x.textAlign = 'right'; x.font = '600 30px Fredoka, sans-serif'; x.fillStyle = r.c || '#ffffff'; x.fillText(fmt ? fmt(r.v) : String(r.v), W - 30, y + 24);
    });
    if (!list.length) { x.fillStyle = 'rgba(22, 22, 28, 0.92)'; x.beginPath(); x.roundRect(14, 76, W - 28, 46, 14); x.fill(); x.textAlign = 'center'; x.font = '600 30px Fredoka, sans-serif'; x.fillStyle = '#ffffff'; x.fillText('Be the first!', W / 2, 100); }
    B.t.needsUpdate = true;
}
void WHITE_S; void TAU; void tileMat; void clockMs;
