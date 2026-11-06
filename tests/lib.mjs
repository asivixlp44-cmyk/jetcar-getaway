// What the browser runs share: starting the game (the server with QA=1 and the Vite dev client, or the production build),
// a headless Chrome on the real graphics chip, a phone or a weak laptop simulated, console errors collected.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const OUT = process.env.OUT_DIR || path.join(os.tmpdir(), 'jetcar-shots');
fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const procs = [];
const up = async (url) => { for (let i = 0; i < 160; i++) { try { const r = await fetch(url); if (r.ok) return true; } catch (e) { /* not yet */ } await sleep(150); } return false; };
export async function startServer(port, env) {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), 'jetcar-run-'));
    const p = spawn(process.execPath, ['src/index.js'], { cwd: path.join(ROOT, 'server'), env: { ...process.env, PORT: String(port), DATA_DIR: data, ...(env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => { const s = String(d); if (/snap\]/.test(s) || process.env.VERBOSE) process.stdout.write(s); });
    p.stderr.on('data', (d) => process.stderr.write(d));
    procs.push(p);
    if (!(await up('http://localhost:' + port + '/health'))) throw new Error('server did not start');
    return p;
}
export async function startVite() {
    const vite = path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
    const p = spawn(process.execPath, [vite], { cwd: path.join(ROOT, 'client'), env: { ...process.env, VITE_SERVER_URL: 'http://localhost:3013' }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stderr.on('data', (d) => process.stderr.write(d));
    procs.push(p);
    if (!(await up('http://localhost:5565/'))) throw new Error('vite did not start');
    return p;
}
// the game for a browser run: a build with the QA hooks in it, served by the test server (no dev server reloading the page
// while files change). DEV=1: the Vite dev server instead. MINIFY=0: unminified (for a CPU profile). BUILT=1: use the last build
import { spawnSync } from 'node:child_process';
export async function startGame() {
    if (process.env.DEV) { await startVite(); return 'http://localhost:5565/'; }
    if (!process.env.BUILT) {
        const vite = path.join(ROOT, 'client', 'node_modules', 'vite', 'bin', 'vite.js');
        const r = spawnSync(process.execPath, [vite, 'build', ...(process.env.MINIFY === '0' ? ['--minify', 'false'] : [])], { cwd: path.join(ROOT, 'client'), env: { ...process.env, VITE_QA: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
        if (r.status !== 0) throw new Error('the QA build failed');
    }
    return 'http://localhost:3013/';
}
export const stopAll = () => { for (const p of procs) { try { p.kill(); } catch (e) { /* gone */ } } };
export async function launch() {
    const b = await puppeteer.launch({
        executablePath: CHROME, headless: 'new', protocolTimeout: 240000, dumpio: !!process.env.DUMPIO, defaultViewport: null,
        args: ['--no-sandbox', '--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--enable-webgl', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required', '--window-size=1600,900', ...(process.env.LOW_GPU ? ['--force_low_power_gpu'] : []), '--no-first-run', '--no-default-browser-check', '--disable-component-update', '--disable-background-networking', '--disable-sync', '--disable-default-apps', '--disable-features=Translate,OptimizationHints,MediaRouter'],
    });
    const pr = b.process();
    if (pr) pr.on('exit', (code, sig) => console.log('[chrome exited]', code, sig));
    b.on('disconnected', () => console.log('[chrome disconnected]'));
    return b;
}
// o: { w, h, dpr, touch, cpu (throttle), q (quality kept for this page), uid }
export async function open(browser, url, o) {
    o = o || {};
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    const errors = [];
    page.on('error', (e) => console.log('[page crashed]', e.message));
    page.on('framenavigated', (f) => { if (page.loadSecs) console.log('[page navigated]', f.url()); });
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_|net::|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text().slice(0, 300)); });
    // what's slow to arrive while loading (a stalled script or font holds the whole page up)
    const reqAt = new Map();
    page.on('request', (r) => reqAt.set(r, Date.now()));
    const reqDone = (r, how) => { const ms = Date.now() - (reqAt.get(r) || Date.now()); if (ms > 4000) console.log('  [slow request]', Math.round(ms / 1000) + ' s', how, r.url().slice(0, 90)); };
    page.on('requestfinished', (r) => reqDone(r, 'ok'));
    page.on('requestfailed', (r) => reqDone(r, 'failed'));
    await page.setViewport({ width: o.w || 1280, height: o.h || 720, deviceScaleFactor: o.dpr || 1, isMobile: !!o.touch, hasTouch: !!o.touch });
    await page.evaluateOnNewDocument((q, uid) => {
        if (q) localStorage.setItem('jc1_quality', q);
        if (uid) localStorage.setItem('jc1_uid', uid);
    }, o.q || '', o.uid || '');
    if (o.sdkStub) {
        await page.setRequestInterception(true);
        page.on('request', (r) => (r.url().includes('legion-sdk') ? r.respond({ status: 200, contentType: 'application/javascript', body: o.sdkStub }) : r.continue()));
    }
    if (o.cpu) { const c = await page.createCDPSession(); await c.send('Emulation.setCPUThrottlingRate', { rate: o.cpu }); }
    const t0 = Date.now();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await page.waitForFunction(() => !document.querySelector('#start') || document.querySelector('#start').hidden, { timeout: 180000, polling: 200 });
    page.loadSecs = (Date.now() - t0) / 1000;
    page.errors = errors;
    return page;
}
export const qa = (page, fn, ...args) => page.evaluate(fn, ...args);
export async function shot(page, name) { const f = path.join(OUT, name + '.png'); await page.screenshot({ path: f }); return f; }
// FPS over a few seconds, measured in the page; the game's own numbers with it
export async function measure(page, secs) {
    return page.evaluate(async (s) => {
        const q = window.__qa;
        if (q) q.perf(true);
        const ivs = [], t0 = performance.now();
        await new Promise((res) => { let last = t0; const f = (n) => { ivs.push(n - last); last = n; if (n - t0 < s * 1000) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        ivs.shift();
        const secsReal = (performance.now() - t0) / 1000, d = q ? q.perf() : {};
        const sorted = ivs.slice().sort((a, b) => a - b), n = sorted.length, sum = ivs.reduce((a, b) => a + b, 0);
        // refresh: how often the page got a frame; fps: frames the game actually drew (it may draw every other refresh on a fast screen)
        return { refresh: Math.round(n / (sum / 1000)), fps: d.frames ? Math.round(d.frames / secsReal) : Math.round(n / (sum / 1000)), p50: +sorted[Math.floor(n * 0.5)].toFixed(1), p95: +sorted[Math.floor(n * 0.95)].toFixed(1), max: +sorted[n - 1].toFixed(1), over50: sorted.filter((v) => v > 50).length, avgMs: d.avgMs, maxMs: d.maxMs, calls: d.calls, tris: d.tris, paced: d.paced };
    }, secs);
}
