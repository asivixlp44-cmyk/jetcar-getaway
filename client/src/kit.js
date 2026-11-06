// Building geometry by hand: a growing set of typed arrays, written quickly, turned into one mesh (or copied into a batch slot). Rounded boxes
// and discs with soft edges are what make the matte plastic look expensive: the bevel catches the light, the colour fades darker toward the bottom.
import { T } from './engine.js';
import { L, TILE } from './surfaces.js';

export const TAU = Math.PI * 2;
const C_CACHE = new Map();
export const col = (hex) => { let c = C_CACHE.get(hex); if (!c) { const t = new T.Color(hex); c = [t.r, t.g, t.b]; C_CACHE.set(hex, c); } return c; };
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const WHITE = [1, 1, 1];
const asCol = (c) => (typeof c === 'number' ? col(c) : c);

export class PKit {
    constructor(capV = 2048, capI = 3072) {
        this.capV = capV; this.capI = capI; this.nv = 0; this.ni = 0; this.mi = 0;
        this.p = new Float32Array(capV * 3); this.n = new Int8Array(capV * 3); this.c = new Float32Array(capV * 3); this.u = new Float32Array(capV * 2); this.f = new Uint8Array(capV * 2); this.m = new Uint16Array(capV);
        this.i = new Uint32Array(capI);
    }
    get count() { return this.nv; }
    reset() { this.nv = 0; this.ni = 0; this.mi = 0; }
    growV() {
        const cap = this.capV *= 2;
        for (const [key, item] of [['p', 3], ['n', 3], ['c', 3], ['u', 2], ['f', 2], ['m', 1]]) { const a = new this[key].constructor(cap * item); a.set(this[key]); this[key] = a; }
    }
    growI() { const a = new Uint32Array(this.capI *= 2); a.set(this.i); this.i = a; }
    vc(x, y, z, nx, ny, nz, r, g, b, u, v, layer, mode) {
        const n = this.nv;
        if (n === this.capV) this.growV();
        const a = n * 3, d = n * 2, P = this.p, N = this.n, C = this.c, U = this.u, F = this.f;
        P[a] = x; P[a + 1] = y; P[a + 2] = z;
        N[a] = nx * 127; N[a + 1] = ny * 127; N[a + 2] = nz * 127;
        C[a] = r; C[a + 1] = g; C[a + 2] = b;
        U[d] = u; U[d + 1] = v;
        F[d] = layer; F[d + 1] = mode;
        this.m[n] = this.mi;
        return this.nv++;
    }
    v(x, y, z, nx, ny, nz, c, u, v, layer, mode) { return this.vc(x, y, z, nx, ny, nz, c[0], c[1], c[2], u, v, layer, mode); }
    tri(a, b, c) {
        if (this.ni + 3 > this.capI) this.growI();
        const I = this.i, m = this.ni;
        I[m] = a; I[m + 1] = b; I[m + 2] = c;
        this.ni = m + 3;
    }
    qi(a, b, c, d) {
        if (this.ni + 6 > this.capI) this.growI();
        const I = this.i, m = this.ni;
        I[m] = a; I[m + 1] = b; I[m + 2] = c; I[m + 3] = a; I[m + 4] = c; I[m + 5] = d;
        this.ni = m + 6;
    }
    // a quad through four points (counter-clockwise seen from its front) with one flat normal
    quad(a, b, c, d, co, o) {
        o = o || {};
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const uv = o.uv || [0, 0, 1, 1], ly = o.layer ?? L.PLAIN, m = o.mode ?? 0, co0 = asCol(co), c2 = o.c2 ? asCol(o.c2) : co0;
        const i0 = this.v(a[0], a[1], a[2], nx, ny, nz, co0, uv[0], uv[1], ly, m);
        this.v(b[0], b[1], b[2], nx, ny, nz, co0, uv[2], uv[1], ly, m);
        this.v(c[0], c[1], c[2], nx, ny, nz, c2, uv[2], uv[3], ly, m);
        this.v(d[0], d[1], d[2], nx, ny, nz, c2, uv[0], uv[3], ly, m);
        this.qi(i0, i0 + 1, i0 + 2, i0 + 3);
        return this;
    }
    // a triangle through three points (counter-clockwise from its front), its own flat normal
    tri3(a, b, c, co, o) {
        o = o || {};
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
        const ly = o.layer ?? L.PLAIN, m = o.mode ?? 0, c0 = asCol(co), i0 = this.v(a[0], a[1], a[2], nx, ny, nz, c0, 0, 0, ly, m);
        this.v(b[0], b[1], b[2], nx, ny, nz, c0, 1, 0, ly, m);
        this.v(c[0], c[1], c[2], nx, ny, nz, c0, 0, 1, ly, m);
        this.tri(i0, i0 + 1, i0 + 2);
        return this;
    }
    // a plain box centred at (x, y, z); o: { ry, layer, mode, top (colour), tile, noTop, noBottom, grad (how much darker its sides are at the bottom) }
    box(x, y, z, sx, sy, sz, c, o) {
        o = o || {};
        const co = asCol(c), top = o.top !== undefined ? asCol(o.top) : scale(co, 1.06), under = o.under !== undefined ? asCol(o.under) : scale(co, 0.6), hx = sx / 2, hy = sy / 2, hz = sz / 2;
        const cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
        const P = (a, b, d) => [x + a * cs + d * sn, y + b, z - a * sn + d * cs];
        const tl = o.tile || TILE, ly = o.layer ?? L.PLAIN, m = o.mode ?? 0, gb = o.grad ? 1 - o.grad : 0;
        const q = (a, b, cc, d, co2, ax, ay, co3, l2) => this.quad(a, b, cc, d, co2, { layer: l2 ?? ly, mode: m, uv: [0, 0, ax / tl, ay / tl], c2: co3 });
        if (!o.noTop) q(P(-hx, hy, hz), P(hx, hy, hz), P(hx, hy, -hz), P(-hx, hy, -hz), top, sx, sz, undefined, o.topLayer);
        if (!o.noBottom) q(P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), under, sx, sz);
        const s1 = o.flat ? co : scale(co, 0.98), s2 = o.flat ? co : scale(co, 0.9), b1 = gb ? scale(s1, gb) : s1, b2 = gb ? scale(s2, gb) : s2;
        q(P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz), b1, sx, sy, s1);
        q(P(hx, -hy, -hz), P(-hx, -hy, -hz), P(-hx, hy, -hz), P(hx, hy, -hz), b2, sx, sy, s2);
        q(P(hx, -hy, hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), b2, sz, sy, s2);
        q(P(-hx, -hy, -hz), P(-hx, -hy, hz), P(-hx, hy, hz), P(-hx, hy, -hz), b1, sz, sy, s1);
        return this;
    }
    // a rounded slab: top y (ya at local -z, yb at +z for a slope), soft chamfered edges, the sides fading dark toward the bottom.
    // o: { ry, bevel, layer (sides), topLayer, tile, topTile, mode, grad, sideC, noBottom, rim (how much lighter the top edge is), topUv: [u0, v0, u1, v1] }
    slab(x, ya, z, sx, h, sz, c, o) {
        o = o || {};
        const yb = o.yb ?? ya, hx = sx / 2, hz = sz / 2, B = Math.min(o.bevel ?? 0.45, hx * 0.8, hz * 0.8, h * 0.6), cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
        const co = asCol(c), sc = o.sideC !== undefined ? asCol(o.sideC) : co, m = o.mode ?? 0, ly = o.layer ?? L.PLAIN, tly = o.topLayer ?? ly, tl = o.tile || TILE, ttl = o.topTile || tl, gr = 1 - (o.grad ?? 0.42), rim = o.rim ?? 1.12;
        const X = (a, d) => x + a * cs + d * sn, Z = (a, d) => z - a * sn + d * cs, Yt = (d) => ya + (yb - ya) * (d + hz) / (2 * hz);
        // the top
        const ix = hx - B, iz = hz - B, tu = o.topUv || [-ix / ttl, -iz / ttl, ix / ttl, iz / ttl];
        const T0 = this.nv, ctop = scale(co, o.topK ?? 1);
        this.v(X(-ix, iz), Yt(iz), Z(-ix, iz), 0, 1, 0, ctop, tu[0], tu[3], tly, m);
        this.v(X(ix, iz), Yt(iz), Z(ix, iz), 0, 1, 0, ctop, tu[2], tu[3], tly, m);
        this.v(X(ix, -iz), Yt(-iz), Z(ix, -iz), 0, 1, 0, ctop, tu[2], tu[1], tly, m);
        this.v(X(-ix, -iz), Yt(-iz), Z(-ix, -iz), 0, 1, 0, ctop, tu[0], tu[1], tly, m);
        this.qi(T0, T0 + 1, T0 + 2, T0 + 3);
        // four sides: chamfer, then the wall
        const rimC = scale(sc, rim), lo = scale(sc, gr);
        const side = (a0, d0, a1, d1, nxL, nzL, oa0, od0, oa1, od1) => {
            const nx = nxL * cs + nzL * sn, nz = -nxL * sn + nzL * cs, kn = 0.72;
            const y0 = Yt(d0), y1 = Yt(d1), i0 = this.nv, lenU = Math.hypot(a1 - a0, d1 - d0);
            // chamfer: from the top's edge out and down (normals half up, half out: a soft highlight)
            this.v(X(oa0, od0), Yt(od0), Z(oa0, od0), nx * (1 - kn), kn, nz * (1 - kn), rimC, 0, 1, ly, m);
            this.v(X(oa1, od1), Yt(od1), Z(oa1, od1), nx * (1 - kn), kn, nz * (1 - kn), rimC, lenU / tl, 1, ly, m);
            this.v(X(a1, d1), y1 - B, Z(a1, d1), nx * kn, 1 - kn, nz * kn, sc, lenU / tl, 0.95, ly, m);
            this.v(X(a0, d0), y0 - B, Z(a0, d0), nx * kn, 1 - kn, nz * kn, sc, 0, 0.95, ly, m);
            this.qi(i0, i0 + 3, i0 + 2, i0 + 1);
            // the wall
            const i1 = this.nv, H = h - B;
            this.v(X(a0, d0), y0 - B, Z(a0, d0), nx, 0, nz, sc, 0, 0.95, ly, m);
            this.v(X(a1, d1), y1 - B, Z(a1, d1), nx, 0, nz, sc, lenU / tl, 0.95, ly, m);
            this.v(X(a1, d1), y1 - h, Z(a1, d1), nx, -0.2, nz, lo, lenU / tl, 0.95 - H / tl, ly, m);
            this.v(X(a0, d0), y0 - h, Z(a0, d0), nx, -0.2, nz, lo, 0, 0.95 - H / tl, ly, m);
            this.qi(i1, i1 + 3, i1 + 2, i1 + 1);
        };
        side(-hx, hz, hx, hz, 0, 1, -ix, iz, ix, iz);
        side(hx, hz, hx, -hz, 1, 0, ix, iz, ix, -iz);
        side(hx, -hz, -hx, -hz, 0, -1, ix, -iz, -ix, -iz);
        side(-hx, -hz, -hx, hz, -1, 0, -ix, -iz, -ix, iz);
        // the four little corner triangles
        const corner = (ta, td, a0, d0, a1, d1, nxL, nzL) => {
            const nx = nxL * cs + nzL * sn, nz = -nxL * sn + nzL * cs, q = this.nv;
            this.v(X(ta, td), Yt(td), Z(ta, td), nx * 0.3, 0.72, nz * 0.3, rimC, 0, 1, ly, m);
            this.v(X(a0, d0), Yt(d0) - B, Z(a0, d0), nx * 0.7, 0.3, nz * 0.7, sc, 0, 0.95, ly, m);
            this.v(X(a1, d1), Yt(d1) - B, Z(a1, d1), nx * 0.7, 0.3, nz * 0.7, sc, 0.1, 0.95, ly, m);
            this.tri(q, q + 1, q + 2);
        };
        corner(ix, iz, hx, hz, hx, hz, 0.7, 0.7);
        corner(ix, -iz, hx, -hz, hx, -hz, 0.7, -0.7);
        corner(-ix, -iz, -hx, -hz, -hx, -hz, -0.7, -0.7);
        corner(-ix, iz, -hx, hz, -hx, hz, -0.7, 0.7);
        if (!o.noBottom) {
            const u = scale(sc, gr * 0.72), q = this.nv;
            this.v(X(-hx, -hz), Yt(-hz) - h, Z(-hx, -hz), 0, -1, 0, u, 0, 0, ly, m);
            this.v(X(hx, -hz), Yt(-hz) - h, Z(hx, -hz), 0, -1, 0, u, 1, 0, ly, m);
            this.v(X(hx, hz), Yt(hz) - h, Z(hx, hz), 0, -1, 0, u, 1, 1, ly, m);
            this.v(X(-hx, hz), Yt(hz) - h, Z(-hx, hz), 0, -1, 0, u, 0, 1, ly, m);
            this.qi(q, q + 3, q + 2, q + 1);
        }
        return this;
    }
    // a rounded disc: top at y; o: { n, bevel, layer, topLayer, tile, topTile, mode, grad, sideC, noBottom, r1 (the bottom's radius), ring (a dark groove) }
    disc(x, y, z, r, h, c, o) {
        o = o || {};
        const n = o.n || 18, B = Math.min(o.bevel ?? 0.5, h * 0.6, r * 0.4), co = asCol(c), sc = o.sideC !== undefined ? asCol(o.sideC) : co, m = o.mode ?? 0, ly = o.layer ?? L.PLAIN, tly = o.topLayer ?? ly, tl = o.tile || TILE, ttl = o.topTile || r * 2, gr = 1 - (o.grad ?? 0.42), rimC = scale(sc, o.rim ?? 1.12), lo = scale(sc, gr), r1 = o.r1 ?? r, ri = r - B;
        const cc = this.nv;
        this.v(x, y, z, 0, 1, 0, co, 0.5, 0.5, tly, m);
        for (let i = 0; i <= n; i++) { const a = i / n * TAU, cs = Math.cos(a), sn = Math.sin(a); this.v(x + cs * ri, y, z + sn * ri, 0, 1, 0, co, 0.5 + cs * ri / ttl, 0.5 + sn * ri / ttl, tly, m); }
        for (let i = 0; i < n; i++) this.tri(cc, cc + 2 + i, cc + 1 + i);
        const base = this.nv, circ = TAU * r;
        for (let i = 0; i <= n; i++) {
            const a = i / n * TAU, cs = Math.cos(a), sn = Math.sin(a), u = i / n * circ / tl;
            this.v(x + cs * ri, y, z + sn * ri, cs * 0.28, 0.72, sn * 0.28, rimC, u, 1, ly, m);
            this.v(x + cs * r, y - B, z + sn * r, cs * 0.72, 0.28, sn * 0.72, sc, u, 0.95, ly, m);
            this.v(x + cs * r, y - B, z + sn * r, cs, 0, sn, sc, u, 0.95, ly, m);
            this.v(x + cs * r1, y - h, z + sn * r1, cs, -0.2, sn, lo, u, 0.95 - (h - B) / tl, ly, m);
        }
        for (let i = 0; i < n; i++) {
            const a = base + i * 4, b = a + 4;
            this.qi(a, b, b + 1, a + 1);
            this.qi(a + 2, b + 2, b + 3, a + 3);
        }
        if (!o.noBottom) {
            const u = scale(sc, gr * 0.72), q = this.nv;
            this.v(x, y - h, z, 0, -1, 0, u, 0.5, 0.5, ly, m);
            for (let i = 0; i <= n; i++) { const a = i / n * TAU; this.v(x + Math.cos(a) * r1, y - h, z + Math.sin(a) * r1, 0, -1, 0, u, 0.5, 0.5, ly, m); }
            for (let i = 0; i < n; i++) this.tri(q, q + 1 + i, q + 2 + i);
        }
        return this;
    }
    // a tapered upright cylinder from y up h; n sides; open-ended unless o.cap
    cyl(x, y, z, r0, r1, h, c, o) {
        o = o || {};
        const n = o.n || 8, co = asCol(c), c2 = o.c2 !== undefined ? asCol(o.c2) : scale(co, 1.05), c0 = o.c0 !== undefined ? asCol(o.c0) : scale(co, 0.82), m = o.mode ?? 0, ly = o.layer ?? L.PLAIN, base = this.nv, tl = o.tile || TILE, slope = (r0 - r1) / Math.max(0.01, h);
        for (let i = 0; i <= n; i++) {
            const a = i / n * TAU, cs = Math.cos(a), sn = Math.sin(a), u = i / n * Math.max(1, Math.round(TAU * Math.max(r0, r1) / tl));
            this.v(x + cs * r0, y, z + sn * r0, cs, slope, sn, c0, u, 0, ly, m);
            this.v(x + cs * r1, y + h, z + sn * r1, cs, slope, sn, c2, u, h / tl, ly, m);
        }
        for (let i = 0; i < n; i++) { const a = base + i * 2; this.tri(a + 1, a + 2, a); this.tri(a + 1, a + 3, a + 2); }
        if (o.cap !== false && r1 > 0.01) {
            const cc = this.v(x, y + h, z, 0, 1, 0, c2, 0.5, 0.5, o.capLayer ?? ly, m);
            for (let i = 0; i <= n; i++) { const a = i / n * TAU; this.v(x + Math.cos(a) * r1, y + h, z + Math.sin(a) * r1, 0, 1, 0, c2, 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5, o.capLayer ?? ly, m); }
            for (let i = 0; i < n; i++) this.tri(cc, cc + 2 + i, cc + 1 + i);
        }
        return this;
    }
    // a rounded lump: an icosphere, darker underneath. o.far: the plainest one; o.layer: painted in (u, v from where it points)
    blob(x, y, z, sx, sy, sz, c, o) {
        o = o || {};
        const tp = o.far ? ICO0 : ICO1(o.fine), co = asCol(c), base = this.nv, m = o.mode ?? 0, ly = o.layer ?? L.PLAIN, ao = o.ao ?? 0.3;
        const cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0);
        for (let i = 0; i < tp.n; i++) {
            const a = tp.pos[i * 3], b = tp.pos[i * 3 + 1], d = tp.pos[i * 3 + 2];
            const lx = a * sx * 0.5, lz = d * sz * 0.5, k = 1 - ao + ao * (b * 0.5 + 0.5);
            const nx = a * cs + d * sn, nz = -a * sn + d * cs;
            const uu = o.uvBall ? 0.5 + Math.atan2(a, d) / TAU * 2 : 0.5 + a * 0.5, vv = o.uvBall ? 0.5 + b * 0.5 : 0.5 + d * 0.5;
            this.v(x + lx * cs + lz * sn, y + b * sy * 0.5, z - lx * sn + lz * cs, nx, b, nz, scale(co, k), uu, vv, ly, m);
        }
        for (let i = 0; i < tp.idx.length; i += 3) this.tri(base + tp.idx[i], base + tp.idx[i + 1], base + tp.idx[i + 2]);
        return this;
    }
    // a torus lying flat (o.up: standing, its hole along the local z); R the ring, r the tube
    torus(x, y, z, R, r, c, o) {
        o = o || {};
        const n = o.n || 16, s = o.s || 8, co = asCol(c), alt = o.alt !== undefined ? asCol(o.alt) : null, m = o.mode ?? 0, ly = o.layer ?? L.PLAIN, base = this.nv;
        const cs = Math.cos(o.ry || 0), sn = Math.sin(o.ry || 0), bands = o.bands || 2, sy = o.flatten ?? 1;
        for (let i = 0; i <= n; i++) {
            const a = i / n * TAU, ca = Math.cos(a), sa = Math.sin(a);
            for (let j = 0; j <= s; j++) {
                const b = j / s * TAU, cb = Math.cos(b), sb = Math.sin(b), rr = R + r * cb;
                // local: flat in x, z with y up; standing swaps y and z
                let lx = ca * rr, ly2 = sb * r * sy, lz = sa * rr, nx = ca * cb, ny = sb, nz = sa * cb;
                if (o.up) { const t = ly2; ly2 = lz; lz = t; const t2 = ny; ny = nz; nz = t2; }
                const shade = 0.82 + 0.26 * (o.up ? ca * 0 + sa * 0.3 + 0.7 : sb * 0.5 + 0.5), c0 = alt && (Math.floor(i / n * bands * 2) % 2) ? alt : co;
                this.v(x + lx * cs + lz * sn, y + ly2, z - lx * sn + lz * cs, nx * cs + nz * sn, ny, -nx * sn + nz * cs, scale(c0, shade), i / n * 4, j / s, ly, m);
            }
        }
        const row = s + 1;
        for (let i = 0; i < n; i++) for (let j = 0; j < s; j++) { const a = base + i * row + j, b = a + row; this.qi(a, a + 1, b + 1, b); }
        return this;
    }
    // a thin tube between two points (a rope, a post leaning): n sides
    tube(a, b, r, c, o) {
        o = o || {};
        const n = o.n || 5, co = asCol(c), m = o.mode ?? 0, ly = o.layer ?? L.PLAIN, base = this.nv;
        const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz) || 1, ux = dx / l, uy = dy / l, uz = dz / l;
        let px = uy, py = -ux, pz = 0;
        if (Math.abs(ux) + Math.abs(uy) < 0.01) { px = 1; py = 0; pz = 0; }
        const pl = Math.hypot(px, py, pz) || 1; px /= pl; py /= pl; pz /= pl;
        const qx = uy * pz - uz * py, qy = uz * px - ux * pz, qz = ux * py - uy * px;
        for (let i = 0; i <= n; i++) {
            const t = i / n * TAU, cs = Math.cos(t), sn = Math.sin(t), nx = px * cs + qx * sn, ny = py * cs + qy * sn, nz = pz * cs + qz * sn;
            this.v(a[0] + nx * r, a[1] + ny * r, a[2] + nz * r, nx, ny, nz, co, i / n, 0, ly, m);
            this.v(b[0] + nx * r, b[1] + ny * r, b[2] + nz * r, nx, ny, nz, co, i / n, l / TILE, ly, m);
        }
        for (let i = 0; i < n; i++) { const q = base + i * 2; this.qi(q, q + 2, q + 3, q + 1); }
        return this;
    }
    // a flat decal just above the ground, centred at (x, y, z), turned by ry: (w across, l along)
    decal(x, y, z, w, l, c, layer, ry, o) {
        o = o || {};
        const cs = Math.cos(ry || 0), sn = Math.sin(ry || 0), P = (a, d) => [x + a * cs + d * sn, y, z - a * sn + d * cs], uv = o.uv || [0, 0, 1, 1];
        // (read from behind it, looking the way ry points: the top of the picture is the far edge)
        return this.quad(P(-w / 2, l / 2), P(w / 2, l / 2), P(w / 2, -l / 2), P(-w / 2, -l / 2), c, { layer, mode: o.mode ?? 0, uv: [uv[2], uv[1], uv[0], uv[3]] });
    }
    // an upright card facing -z in its own frame (turned by ry), o: seen from both sides unless o.single
    card(x, y, z, w, h, c, layer, ry, o) {
        o = o || {};
        const cs = Math.cos(ry || 0), sn = Math.sin(ry || 0), P = (a, b) => [x + a * cs, y + b, z - a * sn];
        void sn;
        const q = (flip) => {
            const u0 = flip ? 1 : 0, u1 = flip ? 0 : 1;
            if (!flip) this.quad(P(w / 2, 0), P(-w / 2, 0), P(-w / 2, h), P(w / 2, h), c, { layer, mode: o.mode ?? 0, uv: [u0, 0, u1, 1] });
            else this.quad(P(-w / 2, 0), P(w / 2, 0), P(w / 2, h), P(-w / 2, h), c, { layer, mode: o.mode ?? 0, uv: [0, 0, 1, 1] });
        };
        q(false);
        if (!o.single) q(true);
        return this;
    }
    geometry() {
        const g = new T.BufferGeometry(), nv = this.nv;
        g.setAttribute('position', new T.BufferAttribute(this.p.slice(0, nv * 3), 3));
        g.setAttribute('normal', new T.BufferAttribute(this.n.slice(0, nv * 3), 3, true));
        g.setAttribute('color', new T.BufferAttribute(this.c.slice(0, nv * 3), 3));
        g.setAttribute('uv', new T.BufferAttribute(this.u.slice(0, nv * 2), 2));
        g.setAttribute('aFx', new T.BufferAttribute(this.f.slice(0, nv * 2), 2));
        g.setAttribute('aMi', new T.BufferAttribute(this.m.slice(0, nv), 1));
        const idx = this.i.subarray(0, this.ni);
        g.setIndex(new T.BufferAttribute(nv > 65535 ? idx.slice() : new Uint16Array(idx), 1));
        g.computeBoundingSphere();
        return g;
    }
}
function icosphere(sub) {
    const g = new T.IcosahedronGeometry(1, sub), p = g.attributes.position, map = new Map(), pos = [], idx = [];
    for (let i = 0; i < p.count; i++) {
        const k = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
        if (!map.has(k)) { map.set(k, pos.length / 3); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
        idx.push(map.get(k));
    }
    g.dispose();
    return { pos, idx, n: pos.length / 3 };
}
const ICO0 = icosphere(0), ICO_1 = icosphere(1), ICO_2 = icosphere(2);
const ICO1 = (fine) => (fine ? ICO_2 : ICO_1);
