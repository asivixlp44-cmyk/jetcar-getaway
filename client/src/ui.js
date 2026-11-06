// The HUD (the stage bar and the clock, who's here, your Coins, Gems and Keys, the speedometer, the gas and the nitro, the menu; in a
// Police Chase: everyone's place on the bar and the cops' light behind them, your place, the clock, how many are still free), the crate
// reveal and every panel: the garage (cars, tune-ups, paint), crates and exhausts, quests, the daily reward, gifts, codes, teleports,
// leaderboards, options, a chase's results, the Getaway Tower. Prices are Coins, Gems, Keys or Trophies, all earned in the game.
import { $ } from './engine.js';
import { S, net, actions } from './state.js';
import { sfx, setMusicDuck, getVolumes, setVolume, playAsmr } from './audio.js';
import { setQuality, getQuality } from './fx.js';
import {
    CFG, RARITIES, UPGRADES, upgradeCost, CARS, carById, PAINTS, EXHAUSTS, exhaustById, CRATES, crateById, statsOf, xpNeed, TIME_RANKS, STAGES, STAGES_PER_WORLD, WORLDS, finishReward,
    TASKS, QUESTS, DAILY, dailyStatus, dayLeft, GIFTS, rewardText, clock, clockMs, fmtComma, fmt, rankOf, rankOfTime, diffOf, KMH, coinMult,
} from '../../shared/config.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const rar = (r) => `<span class="rar" style="color:${RARITIES[r].color}">${RARITIES[r].name}</span>`;
const hex = (c) => '#' + (c >>> 0).toString(16).padStart(6, '0');
const CC = '<i class="cc"></i>';
const IC = (k) => '<i class="ic ic-' + k + ' pic"></i>';
const sessionSecs = () => (S.sessionSecs || 0) + (Date.now() - S.profileAt) / 1000;
export const ordinal = (n) => { const j = n % 10, k = n % 100; return n + (j === 1 && k !== 11 ? 'st' : j === 2 && k !== 12 ? 'nd' : j === 3 && k !== 13 ? 'rd' : 'th'); };

// =====================================================================================
// Small things: toasts, big words, pop-ups, level ups, Coins
// =====================================================================================
function replay(el) { el.classList.remove('go'); requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('go'))); }
export function toast(text, color) {
    const box = $('#toasts'), el = document.createElement('div');
    el.className = 'toast o1'; el.textContent = text; el.style.color = color || '#fff';
    box.appendChild(el);
    while (box.children.length > 2) box.firstChild.remove();
    setTimeout(() => el.remove(), 3300);
}
export function bigText(text, color) {
    const el = $('#bigText');
    el.textContent = text; el.style.color = color || '#ffe24a';
    el.hidden = false; replay(el);
    clearTimeout(bigText.t); bigText.t = setTimeout(() => { el.hidden = true; }, 2400);
}
// a quick word by the car: a ring, big air, a flip (one at a time, the newest wins)
export function airWord(text, color) {
    const el = $('#airWord');
    el.textContent = text; el.style.color = color || '#ffffff';
    el.hidden = false; replay(el);
    clearTimeout(airWord.t); airWord.t = setTimeout(() => { el.hidden = true; }, 1300);
}
export function countText(text, color) {
    const el = $('#count');
    el.textContent = text; el.style.color = color || '#ffffff';
    el.hidden = false; replay(el);
    clearTimeout(countText.t); countText.t = setTimeout(() => { el.hidden = true; }, 950);
}
export function showCard(t, s, e) { $('#cardT').textContent = t; $('#cardS').textContent = s; $('#cardE').textContent = e; $('#card').hidden = false; }
export function hideCard() { $('#card').hidden = true; }
export function popup(icon, title, sub, color, html) {
    const el = $('#popup');
    $('#popIc').textContent = icon; $('#popT').textContent = title; $('#popT').style.color = color || '#ffe24a';
    if (html) $('#popS').innerHTML = sub || ''; else $('#popS').textContent = sub || '';
    el.hidden = false; replay(el);
    clearTimeout(popup.t); popup.t = setTimeout(() => { el.hidden = true; }, 3000);
}
export function levelUp(lv0, lv1) {
    const el = $('#lvlUp');
    $('#lu1').textContent = `Level Up! (${lv0} → ${lv1})`;
    $('#lu2').textContent = 'Bigger prizes, new cars';
    el.hidden = false; replay(el);
    clearTimeout(levelUp.t); levelUp.t = setTimeout(() => { el.hidden = true; }, 2600);
    bump('#lvBar');
}
export function notEnough(m) {
    sfx('denied');
    const word = { gems: 'Gems', stars: 'Trophies', keys: 'Keys', coins: 'Coins' }[m.cur] || 'Coins', ic = { gems: '💎', stars: '🏆', keys: '🔑', coins: '🪙' }[m.cur] || '🪙';
    const how = m.cur === 'gems' ? 'Gems come from Police Chases, quests, daily tasks, gifts and the daily reward.' : m.cur === 'stars' ? 'Every trip to the Getaway Tower at the end of the road earns a Trophy.' : m.cur === 'keys' ? 'Keys float high over every third stage: fly up for them. Gifts and the daily reward give some too.' : 'Clear stages, fly through rings, land big airs and outrun the police.';
    askConfirm(ic, 'Not enough ' + word, `You need ${fmtComma(m.need)} more ${word} for ${esc(m.name)}.<br><small>${how}</small>`, m.cur === 'gems' ? 'Quests' : 'OK', () => { if (m.cur === 'gems') openPanel('quests'); });
}
export function codeResult(m) { toast(m.ok ? '🎟️ ' + m.text : m.text, m.ok ? '#7dff6b' : '#ff7a8a'); if (m.ok) sfx('reward'); else sfx('denied'); }

// =====================================================================================
// The HUD (written only when a value changes; the bars move with transforms)
// =====================================================================================
const shown = { c: 0, g: 0, k: 0 }, shownTxt = { c: '', g: '', k: '' };
let lvFillShown = -1;
export function animateCounters(dt) {
    const kf = Math.min(1, dt * 7);
    for (const [key, v, sel, f] of [['c', S.coins, '#coinVal', fmt], ['g', S.gems, '#gemVal', fmtComma], ['k', S.keys, '#keyVal', fmtComma]]) {
        const target = v || 0;
        shown[key] += (target - shown[key]) * kf;
        if (Math.abs(target - shown[key]) < 0.3) shown[key] = target;
        const txt = f(Math.round(shown[key]));
        if (txt !== shownTxt[key]) { shownTxt[key] = txt; $(sel).textContent = txt; }
    }
    const f = Math.min(1, (S.xp || 0) / (S.need || xpNeed(S.lv)));
    if (Math.abs(f - lvFillShown) > 0.002) { lvFillShown = f; $('#lvFill').style.transform = 'scaleX(' + f.toFixed(3) + ')'; put('#lvNum', fmt(Math.floor(S.xp || 0)) + '/' + fmt(S.need || xpNeed(S.lv))); }
}
const POP = [{ transform: 'scale(1)' }, { transform: 'scale(1.22)', offset: 0.35 }, { transform: 'scale(1)' }];
export function bump(sel) { const el = $(sel); if (el && el.animate) el.animate(POP, { duration: 420, easing: 'cubic-bezier(0.34, 1.6, 0.5, 1)' }); }
let coinAt = null, flying = 0;
export function flyCoins(n) {
    if (!coinAt || flying > 24) return;
    const box = $('#flyLayer'), k = Math.min(10, Math.max(3, Math.round(Math.sqrt(n) * 1.6)));
    const fx = innerWidth / 2, fy = innerHeight * 0.42;
    for (let i = 0; i < k; i++) {
        const el = document.createElement('i');
        el.className = 'cc';
        box.appendChild(el);
        flying++;
        const a = Math.random() * Math.PI * 2, r = 50 + Math.random() * 80, sx = fx + Math.cos(a) * r, sy = fy + Math.sin(a) * r * 0.7;
        const at = (x, y, sc) => 'translate(' + x.toFixed(0) + 'px,' + y.toFixed(0) + 'px) translate(-50%,-50%) scale(' + sc + ')';
        const anim = el.animate([
            { transform: at(fx, fy, 0.2), opacity: 0 },
            { transform: at(sx, sy, 1.3), opacity: 1, offset: 0.3 },
            { transform: at(coinAt.x, coinAt.y, 0.75), opacity: 1 },
        ], { duration: 820 + i * 60, delay: i * 50, easing: 'cubic-bezier(0.45, 0, 0.65, 1)', fill: 'both' });
        anim.onfinish = () => { el.remove(); flying--; bump('#coinBox'); playAsmr('tick', 0.14, 1.5 + i * 0.06); };
    }
}
const put = (sel, v, html) => { const el = $(sel); if (!el) return; if (html) { if (el.innerHTML !== v) el.innerHTML = v; } else if (el.textContent !== v) el.textContent = v; };
// ----- the gauges -----
let spdShown = -1, gasShown = -1, gasFly = null, boostShown = -1, boostOn = null;
export function hudSpeed(kmh) { if (kmh !== spdShown) { spdShown = kmh; $('#spdVal').textContent = String(kmh); } }
// (a short landscape screen lays the gas gauge across: told by the media query's own event, never asked in the frame loop)
const gasAcross = matchMedia('(max-height: 560px) and (min-aspect-ratio: 1/1)');
let across = gasAcross.matches;
gasAcross.addEventListener('change', (e) => { across = e.matches; gasShown = -1; });
export function hudGas(f, fly) {
    const q = Math.round(f * 100) / 100;
    if (q !== gasShown) { gasShown = q; $('#gasFill').style.transform = (across ? 'scaleX(' : 'scaleY(') + q.toFixed(2) + ')'; $('#gasBox').classList.toggle('low', q < 0.25); }
    if (fly !== gasFly) { gasFly = fly; $('#gasBox').classList.toggle('burn', !!fly); }
}
export function hudBoost(f, on) {
    const q = Math.round(f * 50) / 50;
    if (q !== boostShown) { boostShown = q; $('#boostFill').style.transform = 'scaleX(' + q.toFixed(2) + ')'; $('#boostBtn').classList.toggle('ready', q >= 1); }
    if (on !== boostOn) { boostOn = on; $('#boostBtn').classList.toggle('lit', !!on); }
}
export function updateHud() {
    put('#lvCircle', String(S.lv));
    put('#lvNum', fmt(Math.floor(S.xp || 0)) + '/' + fmt(S.need || xpNeed(S.lv)));
    const d = diffOf(S.diff ?? 1);
    put('#diffTxt', d.name);
    $('#bDiff').style.setProperty('--dc', d.color);
    // badges: something to do
    const ds = dailyStatus(S.daily, net.now()), gi = GIFTS.findIndex((g, i) => !S.gifts[i]), giftLeft = gi >= 0 ? GIFTS[gi].min * 60 - sessionSecs() : Infinity;
    const list = (S.jq && S.jq.list) || [], Q = QUESTS[S.qi];
    setBadge('#bQuests', (list.some((q) => !q.c && TASKS[q.k] && q.p >= TASKS[q.k].n) || (Q && (S.qv || 0) >= Q.n)) ? '!' : '');
    setBadge('#bRewards', ds.can || giftLeft <= 0 ? '!' : '');
    setBadge('#bCrates', CRATES.some((c) => S.lv >= c.lv && (S.keys || 0) >= c.keys) ? '!' : '');
    setBadge('#bGarage', UPGRADES.some((u) => S.lv >= u.lv && ((S.ups || {})[u.id] || 0) < u.max && S.coins >= upgradeCost(u, (S.ups || {})[u.id] || 0)) || CARS.some((c) => !(S.cars || {})[c.id] && S.lv >= c.lv && c.coins && S.coins >= c.coins) ? '!' : '');
    // the next quest, always in sight (wider screens)
    {
        const qp = $('#questPill');
        if (!Q) { if (!qp.hidden) qp.hidden = true; }
        else { const p = Math.min(Q.n, S.qv || 0), ready = p >= Q.n; put('#questTxt', ready ? 'Quest done: ' + Q.text + ' · claim it!' : 'Next: ' + Q.text + ' · ' + fmt(p) + '/' + fmt(Q.n)); qp.classList.toggle('ready', ready); if (qp.hidden) qp.hidden = false; }
    }
    // the next free gift's countdown
    const pill = $('#giftPill');
    if (gi < 0) { if (!pill.hidden) pill.hidden = true; }
    else { if (pill.hidden) pill.hidden = false; put('#giftTxt', giftLeft <= 0 ? 'FREE gift ready!' : rewardText(GIFTS[gi], true) + ' in ' + clock(giftLeft)); pill.classList.toggle('ready', giftLeft <= 0); }
    tickPanel();
}
function tickPanel() {
    const m = $('#modal');
    if (m.hidden || !panelKind) return;
    const set = (sel, text) => { const el = m.querySelector(sel); if (el && el.textContent !== text) el.textContent = text; };
    if (panelKind === 'quests') set('[data-t="day"]', 'Resets in ' + clock(dayLeft(net.now())));
    else if (panelKind === 'daily' || (panelKind === 'rewards' && (panelTab || 'daily') === 'daily')) set('[data-t="daily"]', 'Next reward in ' + clock(dayLeft(net.now())));
    if (panelKind === 'rewards' && panelTab === 'gifts') {
        const secs = sessionSecs();
        for (let i = 0; i < GIFTS.length; i++) {
            if (S.gifts[i]) continue;
            const left = GIFTS[i].min * 60 - secs, b = m.querySelector('[data-act="gift"][data-i="' + i + '"]');
            if (!b) continue;
            if (left <= 0 && b.disabled) { renderPanel(); return; }
            if (left > 0) set('[data-act="gift"][data-i="' + i + '"]', clock(left));
        }
    } else if (panelKind === 'results' && results) {
        const left = Math.max(0, Math.ceil((results.until - Date.now()) / 1000));
        set('[data-t="res"]', left > 0 ? 'Back to your run in ' + left : '');
    }
}
function setBadge(sel, text) {
    const el = $(sel);
    let b = el.querySelector('.badge');
    if (!text) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'badge'; el.appendChild(b); }
    if (b.textContent !== text) b.textContent = text;
}
export function measureHud() {
    const w = $('#coinBox .cc').getBoundingClientRect(); if (w.width > 0) coinAt = { x: w.left + w.width / 2, y: w.top + w.height / 2 };
    measureDots();
}
// ----- in a chase -----
const dots = [];
let placeShown = 0, timeShown = '', leftShown = -1, fillShown = -1, copShown = -1;
export function raceReset(n) {
    const box = $('#raceDots');
    box.innerHTML = '';
    dots.length = 0;
    for (let i = 0; i < n; i++) { const el = document.createElement('i'); box.appendChild(el); dots.push({ el, x: -1, k: '' }); }
    placeShown = 0; timeShown = ''; leftShown = -1; fillShown = -1; copShown = -1;
    measureDots();
}
let raceDotsPx = 300;
function measureDots() { const w = $('#raceDots').getBoundingClientRect().width; if (w > 0) raceDotsPx = w; }
addEventListener('resize', () => { measureDots(); dots.forEach((d) => { d.x = -1; }); copShown = -1; });
export function raceDot(i, fr, me, real, out) {
    const d = dots[i];
    if (!d) return;
    const px = Math.round(fr * raceDotsPx), k = (me ? 'me ' : '') + (real ? 'real ' : '') + (out ? 'out' : '');
    if (k !== d.k) { d.k = k; d.el.className = k; }
    if (px !== d.x) { d.x = px; d.el.style.transform = 'translateX(' + px + 'px)'; }
}
export function raceInfo(place, secs, left, fr, copFr) {
    if (place !== placeShown) { placeShown = place; $('#racePlace').innerHTML = place + '<small>' + ordinal(place).slice(String(place).length) + '</small>'; bump('#racePlace'); }
    const t = clock(Math.max(0, secs));
    if (t !== timeShown) { timeShown = t; $('#raceTime').textContent = t; }
    if (left !== leftShown) { leftShown = left; $('#raceLeft').textContent = left + ' free'; }
    const f = Math.round(fr * 400) / 400;
    if (f !== fillShown) { fillShown = f; $('#raceFill').style.transform = 'scaleX(' + f + ')'; }
    const c = Math.round(Math.max(0, copFr) * raceDotsPx);
    if (c !== copShown) { copShown = c; $('#copDot').style.transform = 'translateX(' + c + 'px)'; }
}
let playersShown = '';
export function playersList(rows) {
    const h = rows.map((r) => '<div class="plr"><span>' + esc(r.n) + '</span><u><i class="cc"></i>' + fmt(r.c) + '</u><u>🚩' + fmt(r.g) + '</u><u><i class="lv"></i>' + r.l + '</u></div>').join('');
    if (h !== playersShown) { playersShown = h; $('#playersList').innerHTML = h; }
}
// =====================================================================================
// A crate opening: it rattles, it bursts open, your exhaust
// =====================================================================================
let crateT = 0;
const exSwatch = (k) => `<span class="exs" style="--f:${hex(k.flame)};--s:${hex(k.smoke)}"><i></i><i></i><i></i></span>`;
export function showCrate(crateId, out) {
    const c = crateById[crateId], box = $('#hatchCaps'), H = $('#hatch');
    clearTimeout(crateT);
    box.innerHTML = out.map(() => `<div class="hc"><div class="crt" style="--cc:${hex(c.color)}"></div></div>`).join('');
    $('#hatchOk').hidden = true;
    H.hidden = false;
    sfx('shake');
    crateT = setTimeout(() => {
        sfx('crack');
        box.innerHTML = out.map((o) => { const k = exhaustById[o.id]; return `<div class="hc">${o.isNew ? '<span class="newb o1">NEW!</span>' : ''}${exSwatch(k)}<b class="o">${esc(k.name)}</b><small class="o1">${rar(k.rarity)} · +${Math.round(k.bonus * 100)}% Coins</small></div>`; }).join('');
        $('#hatchOk').hidden = false;
        if (actions.onOpened) actions.onOpened(out);
    }, 820);
}
export function closeHatch() { clearTimeout(crateT); $('#hatch').hidden = true; }
$('#hatchOk').addEventListener('click', () => { sfx('click'); closeHatch(); });

// =====================================================================================
// Panels
// =====================================================================================
let panelKind = null, panelTab = null, panelArg = null, results = null;
export function openPanel(kind, tab) {
    panelKind = kind; panelTab = tab || null;
    if (kind === 'crate') { panelArg = tab; panelTab = null; }
    $('#modal').hidden = false;
    renderPanel();
    sfx('open');
    setMusicDuck(true);
    if (actions.onPanel) actions.onPanel(true);
}
export function closePanel() {
    if ($('#modal').hidden) return false;
    $('#modal').hidden = true; panelKind = null; renderedKind = null;
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    setMusicDuck(false);
    if (actions.onPanel) actions.onPanel(false);
    sfx('close');
    return true;
}
export const panelIs = (k) => !$('#modal').hidden && panelKind === k;
export function refreshPanels() { if (!$('#modal').hidden) renderPanel(); }
function frame(title, icon, body, opts) {
    opts = opts || {};
    return `<div class="panel ${opts.cls || ''}"${opts.w ? ` style="width:min(${opts.w}rem,94vw)"` : ''}>
        <header><h2 class="o">${icon} ${title}</h2><div class="hx">${opts.hx || ''}<button class="btn g-red o x" data-close>✕</button></div></header>
        ${opts.tabs ? `<div class="tabs">${opts.tabs.map(([k, l]) => `<button class="tab o1${k === opts.tab ? ' on' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>` : '<div></div>'}
        <div class="body">${body}</div>${opts.foot ? `<div class="foot">${opts.foot}</div>` : '<div></div>'}</div>`;
}
let renderedKind = null, renderedHtml = '';
function renderPanel() {
    const m = $('#modal');
    const again = renderedKind === panelKind && !m.hidden && m.firstElementChild;
    const html = PANELS[panelKind] ? PANELS[panelKind]() : '';
    if (again && html === renderedHtml) return;
    renderedHtml = html;
    const scroller = again && m.querySelector('.body'), keep = scroller ? scroller.scrollTop : 0;
    m.innerHTML = html;
    renderedKind = panelKind;
    if (again && m.firstElementChild) { m.firstElementChild.classList.add('still'); const b2 = m.querySelector('.body'); if (b2 && keep) b2.scrollTop = keep; }
    const x = m.querySelector('[data-close]');
    if (x) x.onclick = () => (panelKind === 'results' ? doAct('camp', {}) : closePanel());
    m.onclick = (e) => { if (e.target === m && panelKind !== 'results') closePanel(); };
    for (const b of m.querySelectorAll('[data-tab]')) b.onclick = () => { panelTab = b.dataset.tab; sfx('click'); renderPanel(); };
    for (const b of m.querySelectorAll('[data-act]')) b.onclick = (e) => { e.stopPropagation(); doAct(b.dataset.act, b.dataset); };
    const code = m.querySelector('#codeIn');
    if (code) code.onkeydown = (e) => { if (e.key === 'Enter') doAct('code', {}); };
    for (const r of m.querySelectorAll('input[type=range]')) r.oninput = () => setVolume(r.dataset.vol, r.value / 100);
}
const bar = (v, max, c) => `<span class="sbar"><i style="width:${Math.round(Math.min(1, v / max) * 100)}%;background:${c}"></i></span>`;
// a car's card: its colour, its numbers, buy / drive
function carCard(c) {
    const own = !!(S.cars || {})[c.id], on = S.car === c.id, locked = !own && S.lv < c.lv, can = c.stars ? (S.stars || 0) >= c.stars : S.coins >= c.coins;
    const price = c.stars ? '🏆 ' + c.stars : CC + ' ' + fmtComma(c.coins);
    const btn = on ? '<button class="btn g-grey o1" disabled>Driving</button>' : own ? `<button class="btn g-blue o1" data-act="car" data-id="${c.id}">Drive</button>` : locked ? `<button class="btn g-grey o1" disabled>🔒 Lv ${c.lv}</button>` : `<button class="btn ${can ? 'g-green' : 'g-grey'} o1" data-act="car" data-id="${c.id}">${price}</button>`;
    return `<div class="card car${on ? ' on' : ''}"><div class="ci"><i class="carPic sh${c.shape}" style="--c:${hex(c.color)}"></i></div><b class="o1">${esc(c.name)}</b><small>${esc(c.text)}</small>
        <div class="stats"><span>Speed</span>${bar(c.top - 0.85, 0.45, '#ff5a5a')}<span>Jets</span>${bar(c.jet - 0.85, 0.45, '#3ad8ff')}<span>Tank</span>${bar(c.tank - 0.85, 0.6, '#46ec50')}</div>${btn}</div>`;
}
const PANELS = {
    garage() {
        const tab = panelTab || 'cars';
        let body = '';
        if (tab === 'cars') body = '<div class="grid">' + CARS.map(carCard).join('') + '</div>';
        else if (tab === 'ups') {
            const st = statsOf(S);
            body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">Your ${esc((carById[S.car] || CARS[0]).name)}: ${Math.round(st.top * KMH)} km/h top · ${(st.tank / (CFG.burn * diffOf(S.diff ?? 1).burn)).toFixed(1)} s of jets · ${st.boost.toFixed(1)} s of nitro</p>`;
            body += UPGRADES.map((u) => {
                const n = (S.ups && S.ups[u.id]) || 0, max = n >= u.max, cost = upgradeCost(u, n), can = !max && S.coins >= cost, locked = S.lv < u.lv;
                const lvl = ` <span style="opacity:.8;font-size:.85em">Lv ${n}/${u.max}</span>`;
                const btn = max ? '<button class="btn g-grey o1" disabled>Max!</button>' : locked ? `<button class="btn g-grey o1" disabled>🔒 Lv ${u.lv}</button>` : `<button class="btn ${can ? 'g-green' : 'g-grey'} o1" data-act="upgrade" data-id="${u.id}">${CC} ${fmtComma(cost)}</button>`;
                return `<div class="row"><div class="ri"><i class="ic ic-${u.ic}"></i></div><div class="rt"><b class="o1" style="color:${u.color}">${esc(u.name)}${lvl}</b><small>${esc(u.text)}</small><div class="prog"><i style="width:${(n / u.max * 100).toFixed(0)}%;background:${u.color}"></i></div></div><div class="rb">${btn}</div></div>`;
            }).join('');
        } else {
            body = '<div class="grid">' + PAINTS.map((t) => {
                const owned = t.id === 'stock' || (S.paints && S.paints[t.id]), on = (S.paint || 'stock') === t.id, locked = !owned && S.lv < t.lv;
                const can = t.stars ? (S.stars || 0) >= t.stars : S.coins >= t.coins, price = t.stars ? '🏆 ' + t.stars : CC + ' ' + fmtComma(t.coins);
                const btn = on ? '<button class="btn g-grey o1" disabled>On</button>' : owned ? `<button class="btn g-blue o1" data-act="paint" data-id="${t.id}">Paint</button>` : locked ? `<button class="btn g-grey o1" disabled>🔒 Lv ${t.lv}</button>` : `<button class="btn ${can ? 'g-green' : 'g-grey'} o1" data-act="paint" data-id="${t.id}">${price}</button>`;
                const c = t.color || (carById[S.car] || CARS[0]).color;
                return `<div class="card${on ? ' on' : ''}"><div class="ci"><i class="sw f${t.finish}" style="background:${hex(c)}"></i></div><b class="o1">${esc(t.name)}</b>${btn}</div>`;
            }).join('') + '</div>';
        }
        return frame('Garage', IC('car'), body, { tabs: [['cars', 'Cars'], ['ups', 'Tune-Up'], ['paint', 'Paint']], tab, hx: `<span class="o1">${CC} ${fmtComma(S.coins)} · 🏆 ${fmtComma(S.stars || 0)}</span>`, foot: tab === 'ups' ? 'Bought with the Coins you earn on the road. The stock car can beat every stage.' : 'The best cars and paints cost Trophies: drive all the way to the Getaway Tower.' });
    },
    crates() {
        const tab = panelTab || 'crates';
        let body = '';
        if (tab === 'crates') {
            body = CRATES.map((c) => {
                const locked = S.lv < c.lv, found = c.items.filter((x) => (S.exhausts || {})[x.id] > 0).length;
                return `<div class="row"><div class="ri"><span class="crt mini" style="--cc:${hex(c.color)}"></span></div><div class="rt"><b class="o1">${esc(c.name)} ${found === c.items.length ? '✅' : ''}</b><small>${found} / ${c.items.length} exhausts found</small></div><div class="rb">${locked ? `<button class="btn g-grey o1" disabled>🔒 Lv ${c.lv}</button>` : `<button class="btn g-green o1" data-act="crate" data-c="${c.id}">Open</button>`}</div></div>`;
            }).join('');
        } else {
            const own = EXHAUSTS.filter((k) => (S.exhausts || {})[k.id] > 0).sort((a, b) => b.bonus - a.bonus);
            body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">Fitted: ${esc((exhaustById[S.exhaust] || EXHAUSTS[0]).name)} · +${Math.round((coinMult(S) - 1) * 100)}% Coins</p>`;
            body += '<div class="grid">' + own.map((k) => { const on = S.exhaust === k.id; return `<div class="card${on ? ' on' : ''}">${S.exhausts[k.id] > 1 ? `<span class="palN o1">x${S.exhausts[k.id]}</span>` : ''}<div class="ci">${exSwatch(k)}</div><b class="o1">${esc(k.name)}</b><small>${rar(k.rarity)}</small><span class="palX o1">+${Math.round(k.bonus * 100)}%</span>${on ? '<button class="btn g-grey o1" disabled>Fitted</button>' : `<button class="btn g-blue o1" data-act="exhaust" data-id="${k.id}">Fit</button>`}</div>`; }).join('') + '</div>';
        }
        return frame('Crates', IC('crate'), body, { tabs: [['crates', 'Crates'], ['mine', 'My Exhausts']], tab, hx: `<span class="o1">${CC} ${fmtComma(S.coins)} · 🔑 ${fmtComma(S.keys || 0)}</span>`, foot: 'Open crates with Coins or Keys. An exhaust colours your jets and adds to the Coins you get.' });
    },
    crate() {
        const c = crateById[panelArg];
        if (!c) return '';
        const total = c.items.reduce((a, x) => a + x.w, 0);
        const odds = c.items.map((x) => { const k = exhaustById[x.id], got = (S.exhausts || {})[k.id] > 0; return `<div class="card"><div class="ci${got ? '' : ' dim'}">${exSwatch(k)}</div><b class="o1">${got ? esc(k.name) : '???'}</b><small>${rar(k.rarity)}</small><span class="palX o1">+${Math.round(k.bonus * 100)}% · ${Math.round(x.w / total * 1000) / 10}%</span></div>`; }).join('');
        const can1 = S.coins >= c.coins, can3 = S.coins >= c.coins * 3, canK = (S.keys || 0) >= c.keys;
        const body = `<div class="capOdds">${odds}</div><div class="capBtns"><button class="btn ${can1 ? 'g-green' : 'g-grey'} o" data-act="open1" data-n="1">Open 1 · ${CC} ${fmtComma(c.coins)}</button><button class="btn ${can3 ? 'g-yellow' : 'g-grey'} o" data-act="open1" data-n="3">Open 3 · ${CC} ${fmtComma(c.coins * 3)}</button><button class="btn ${canK ? 'g-blue' : 'g-grey'} o" data-act="openKey">Open 1 · 🔑 ${c.keys}</button></div>
            <p class="o1" style="margin:.6rem 0 0;text-align:center;font-weight:700">You have ${CC} ${fmtComma(S.coins)} · 🔑 ${fmtComma(S.keys || 0)}</p>`;
        return frame(esc(c.name), IC('crate'), body, { w: 40 });
    },
    quests() {
        const Q = QUESTS[S.qi];
        let body = `<div class="qlinks"><button class="btn g-blue o1" data-act="open" data-k="boards">🏆 Leaderboards</button><button class="btn g-pink o1" data-act="open" data-k="rewards">🎁 Rewards</button></div>`;
        if (Q) {
            const p = Math.min(Q.n, S.qv || 0), ready = p >= Q.n;
            body += `<div class="row${ready ? ' feat' : ''}"><div class="ri"><span class="ci" style="font-size:2.4rem">🎯</span></div><div class="rt"><small style="color:#7af4ff;font-weight:700">QUEST ${S.qi + 1} / ${QUESTS.length}</small><b class="o1">${esc(Q.text)}</b><div class="prog"><i style="width:${(p / Q.n * 100).toFixed(0)}%"></i></div><em>${fmt(p)} / ${fmt(Q.n)} · Reward: ${rewardText(Q)}</em></div><div class="rb"><button class="btn ${ready ? 'g-green' : 'g-grey'} o" data-act="qclaim" ${ready ? '' : 'disabled'}>${ready ? 'Claim!' : 'Go!'}</button></div></div>`;
        } else body += '<div class="row"><div class="rt"><b>🏆 Every quest done! Nobody drives like you.</b></div></div>';
        body += `<h3 style="margin:.9rem 0 .4rem">🔥 Daily Tasks <small data-t="day" style="opacity:.75;font-size:.85rem">Resets in ${clock(dayLeft(net.now()))}</small></h3>`;
        body += ((S.jq && S.jq.list) || []).map((q, i) => {
            const T = TASKS[q.k], done = q.p >= T.n;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.2rem">${T.icon}</span></div><div class="rt"><b class="o1">${esc(T.text)}</b><div class="prog"><i style="width:${Math.min(100, q.p / T.n * 100).toFixed(0)}%"></i></div><em>${fmt(q.p)} / ${fmt(T.n)} · ${rewardText(T)}</em></div><div class="rb"><button class="btn ${done && !q.c ? 'g-green' : 'g-grey'} o" data-act="tclaim" data-i="${i}" ${done && !q.c ? '' : 'disabled'}>${q.c ? 'Done ✓' : done ? 'Claim!' : 'Go!'}</button></div></div>`;
        }).join('');
        return frame('Quests', IC('quest'), body);
    },
    daily() { return PANELS.rewards('daily'); },
    rewards(force) {
        const tab = force || panelTab || 'daily';
        let body = '';
        if (tab === 'daily') {
            const st = dailyStatus(S.daily, net.now());
            const ic = (r) => (r.gems && !r.coins ? '💎' : r.keys ? '🔑' : CC);
            const days = DAILY.map((r, i) => `<div class="day${i === 6 ? ' big' : ''}${i < st.day ? ' got' : ''}${i === st.day && st.can ? ' now' : ''}${i > st.day || (i === st.day && !st.can) ? ' lock' : ''}"><span>DAY ${i + 1}</span><span class="di">${i < st.day ? '✅' : ic(r)}</span><span>${rewardText(r)}</span></div>`).join('');
            body = `<p class="dailyTop" style="color:${st.can ? '#58e04a' : '#fff'}">${st.can ? 'Ready to claim!' : 'Come back tomorrow'}</p><div class="days">${days}</div><div style="text-align:center;margin-top:1rem"><button class="btn ${st.can ? 'g-green' : 'g-grey'} o" data-act="daily" ${st.can ? '' : 'disabled'} ${st.can ? '' : 'data-t="daily"'} style="min-width:12rem;height:3rem;font-size:1.25rem">${st.can ? 'Claim Day ' + (st.day + 1) : 'Next reward in ' + clock(dayLeft(net.now()))}</button></div>`;
        } else if (tab === 'gifts') {
            const secs = sessionSecs();
            body = GIFTS.map((g, i) => {
                const left = g.min * 60 - secs, got = S.gifts[i];
                return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.4rem">${got ? '✅' : '🎁'}</span></div><div class="rt"><b class="o1">${rewardText(g)}</b><small>After ${g.min} minutes of play</small></div><div class="rb"><button class="btn ${!got && left <= 0 ? 'g-green' : 'g-grey'} o" data-act="gift" data-i="${i}" ${!got && left <= 0 ? '' : 'disabled'}>${got ? 'Claimed' : left <= 0 ? 'Claim!' : clock(left)}</button></div></div>`;
            }).join('');
        } else {
            body = `<p class="o1" style="font-weight:700;margin:0 0 .8rem">Got a code? Type it in for free Coins, Gems or Keys.</p><div style="display:flex;gap:.4rem"><input class="code" id="codeIn" maxlength="20" placeholder="Enter a code" style="flex:1;min-width:0"><button class="btn g-green o" data-act="code" style="min-width:6rem">Redeem</button></div>`;
        }
        return frame('Rewards', IC('gift'), body, { tabs: [['daily', 'Daily'], ['gifts', 'FREE Gifts'], ['codes', 'Codes']], tab, w: 38 });
    },
    teleport() {
        const best = S.bestStage || 0;
        let body = `<div class="row"><div class="ri"><i class="ic ic-home"></i></div><div class="rt"><b class="o1">Garage Deck</b><small>Cars, paint, crates, tune-ups and the Police Chase</small></div><div class="rb"><button class="btn g-blue o1" data-act="home">Go</button></div></div>`;
        if ((S.stage || 0) > 0) body += `<div class="row"><div class="ri"><i class="ic ic-flag"></i></div><div class="rt"><b class="o1">Your last checkpoint</b><small>Stage ${S.stage}</small></div><div class="rb"><button class="btn g-green o1" data-act="last">Go</button></div></div>`;
        body += WORLDS.map((W, w) => {
            const i = w * STAGES_PER_WORLD, open = w === 0 || best >= i + 1;
            return `<div class="row"><div class="ri"><span class="ci" style="font-size:2.2rem">${W.icon}</span></div><div class="rt"><b class="o1">${esc(W.name)}</b><small>Stages ${i + 1}–${i + STAGES_PER_WORLD} · ${esc(W.text)}</small></div><div class="rb">${open ? `<button class="btn g-blue o1" data-act="world" data-w="${w}">Go</button>` : `<button class="btn g-grey o1" disabled>🔒 Stage ${i + 1}</button>`}</div></div>`;
        }).join('');
        return frame('Teleport', IC('pin'), body, { w: 38, foot: 'A world opens here once you\'ve driven there.' });
    },
    boards() {
        const b = actions.boards ? actions.boards() : { stage: [], wins: [], time: [] };
        const col = (title, rows, f) => `<div><h3 style="margin:.2rem 0 .5rem">${title}</h3>${(rows || []).map((r, i) => `<div class="row" style="padding:.35rem .6rem;margin-bottom:.3rem"><b style="width:2rem">${['🥇', '🥈', '🥉'][i] || i + 1}</b><div class="rt"><b style="font-size:1rem">${esc(r.n)}</b></div><b>${f(r.v)}</b></div>`).join('') || '<p>Be the first!</p>'}</div>`;
        const r = rankOf(S.laps), tr = S.bestTime ? rankOfTime(S.bestTime) : null;
        const body = `<p class="o1" style="margin:0 0 .6rem;font-weight:700">You: best stage ${S.bestStage || 0} / ${STAGES} · ${S.bestTime ? 'fastest run ' + clockMs(S.bestTime) + ' (rank ' + tr.r + ')' : 'no full run yet'} · ${fmtComma(S.laps || 0)} Trophies ${r.icon} · ${fmtComma(S.wins || 0)} chase wins</p><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));gap:.8rem">${col('🚩 Furthest', b.stage, (v) => 'Stage ' + v)}${col('🚨 Chase Wins', b.wins, (v) => fmtComma(v))}${col('⏱ Fastest Run', b.time, (v) => clockMs(v))}</div>`;
        return frame('Leaderboards', IC('trophy'), body, { w: 46 });
    },
    settings() {
        const v = getVolumes(), q = getQuality();
        const body = `<div class="vol"><span>Graphics</span><div class="qbtns">${['low', 'medium', 'high'].map((k) => `<button class="btn g-blue o${q === k ? ' on' : ''}" data-act="quality" data-q="${k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
            <div class="vol"><span>Music</span><input type="range" min="0" max="100" value="${Math.round(v.music * 100)}" data-vol="music"></div>
            <div class="vol"><span>Sounds</span><input type="range" min="0" max="100" value="${Math.round((v.asmr ?? 0.9) * 100)}" data-vol="asmr"></div>
            <div class="vol"><span>Effects</span><input type="range" min="0" max="100" value="${Math.round(v.sfx * 100)}" data-vol="sfx"></div>
            <div class="vol"><span>Camera follows</span><div class="qbtns"><button class="btn g-grey o" data-act="camfollow">${actions.camFollow && actions.camFollow() ? 'On' : 'Off'}</button></div></div>
            <div class="vol"><span>Show FPS</span><div class="qbtns"><button class="btn g-grey o" data-act="fps">${actions.fpsOn && actions.fpsOn() ? 'On' : 'Off'}</button></div></div>
            <div class="vol"><span>Stuck?</span><div class="qbtns"><button class="btn g-blue o" data-act="home">Garage Deck</button></div></div>
            <p style="margin:1rem 0 0;font-weight:600;opacity:.8">${isTouch ? 'The stick drives (push up) and steers. Hold FLY to jet into the air, BOOST for the nitro, FLIP for a trick. Drag the screen to look round.' : 'W / ↑ drive · S brake · A D steer · hold SPACE to FLY · SHIFT nitro · F flip · R back to your checkpoint · E use · Enter Police Chase · G garage · T teleport'}</p>`;
        return frame('Options', IC('gear'), body, { w: 38 });
    },
    results() {
        const R0 = results;
        if (!R0) return '';
        const me = R0.me, won = me.place === 0 && me.finished, title = won ? 'FIRST TO ESCAPE!' : me.finished ? 'YOU GOT AWAY!' : me.out ? 'BUSTED!' : ordinal(me.place + 1) + ' PLACE';
        const sub = (me.finished ? 'Safe in ' + clock(me.secs) : me.out ? 'The cops caught you after ' + clock(me.secs) : 'Out of time') + ' · ' + me.pct + '% of ' + me.stages + ' stages · ' + ordinal(me.place + 1);
        const got = `<div class="resGot"><span class="o1">${CC} +${fmtComma(me.coins)}</span><span class="o1">⭐ +${fmtComma(me.xp)} XP</span>${me.gems ? `<span class="o1">💎 +${me.gems}</span>` : ''}</div>`;
        const rows = R0.rows.map((r) => `<div class="resRow${r.me ? ' me' : ''}"><b>${r.p}</b><span>${esc(r.n)}</span><span>${r.f ? '🏁 ' + clock(r.t) : r.out ? '🚨 ' + r.pr + '%' : r.pr + '%'}</span></div>`).join('');
        const left = Math.max(0, Math.ceil((R0.until - Date.now()) / 1000));
        const body = `<div class="resTop"><b class="o">${title}</b><small class="o1">${sub}</small></div>${got}${rows}<div class="resBtns"><button class="btn g-green o" data-act="again">Chase Again</button><button class="btn g-blue o" data-act="camp">Back to My Run</button></div><p class="o1" data-t="res" style="margin:.4rem 0 0;text-align:center;font-weight:600;font-size:.9rem;opacity:.85">${left > 0 ? 'Back to your run in ' + left : ''}</p>`;
        return frame('Police Chase', IC('siren'), body, { w: 36 });
    },
    // the Getaway Tower at the end of the road
    tower() {
        const R = finishReward(S.laps || 0);
        const body = `<div class="resTop"><b class="o">YOU MADE IT!</b><small class="o1">Claim your Trophy: a big prize, and your next run pays more.</small></div><div class="resGot"><span class="o1">${CC} +${fmtComma(R.coins)}</span><span class="o1">💎 +${R.gems}</span><span class="o1">🏆 +${R.stars}</span></div><p class="o1" style="margin:.2rem 0 .4rem;text-align:center;font-weight:600">You'll start again from the Garage Deck, with every stage paying 25% more.</p><div class="resBtns"><button class="btn g-green o" data-act="claim">Claim the Trophy</button><button class="btn g-grey o" data-close2>Not yet</button></div>`;
        return frame('The Getaway Tower', IC('trophy'), body, { w: 36 });
    },
    trophy() {
        const m = tr;
        if (!m) return '';
        const body = `<div class="resTop"><b class="o">TROPHY #${m.laps}!</b><small class="o1">${m.time ? 'Your run took ' + clockMs(m.time) + ' · Rank ' + m.rank : 'Drive it clean, without a skip, for a time and a rank'}</small></div><div class="resGot"><span class="o1">${CC} +${fmtComma(m.reward.coins)}</span><span class="o1">💎 +${m.reward.gems}</span><span class="o1">🏆 +${m.reward.stars}</span></div><div class="resBtns"><button class="btn g-green o" data-close2>Drive again!</button></div>`;
        return frame('You Got Away!', IC('trophy'), body, { w: 34 });
    },
};
export function showResults(m, myName, until) {
    results = { ...m, until };
    results.rows = m.rows.map((r) => ({ ...r, me: !r.bot && r.n === myName }));
    openPanel('results');
}
export function closeResults() { if (panelIs('results')) { results = null; closePanel(); } }
export function showTower() { openPanel('tower'); }
export function closeTower() { if (panelIs('tower')) closePanel(); }
let tr = null;
export function showTrophy(m) { tr = m; openPanel('trophy'); }

// =====================================================================================
// What the buttons do
// =====================================================================================
function doAct(act, d) {
    sfx('click');
    switch (act) {
        case 'code': { const v = ($('#codeIn') || {}).value || ''; if (v.trim()) net.send('code', { code: v.trim() }); break; }
        case 'qclaim': net.send('qclaim', {}); break;
        case 'tclaim': net.send('tclaim', { i: +d.i }); break;
        case 'daily': net.send('daily', {}); break;
        case 'gift': net.send('gift', { i: +d.i }); break;
        case 'quality': setQuality(d.q); renderPanel(); break;
        case 'fps': if (actions.toggleFps) actions.toggleFps(); renderPanel(); break;
        case 'camfollow': if (actions.toggleCam) actions.toggleCam(); renderPanel(); break;
        case 'home': closePanel(); if (actions.goHome) actions.goHome(); break;
        case 'last': closePanel(); if (actions.warpLast) actions.warpLast(); break;
        case 'world': closePanel(); if (actions.warpWorld) actions.warpWorld(+d.w); break;
        case 'upgrade': net.send('upgrade', { id: d.id }); break;
        case 'car': net.send('car', { id: d.id }); sfx('equip'); break;
        case 'paint': net.send('paint', { id: d.id }); sfx('equip'); break;
        case 'exhaust': net.send('exhaust', { id: d.id }); sfx('equip'); break;
        case 'crate': openPanel('crate', d.c); break;
        case 'open1': if (actions.crate) actions.crate(panelArg, +d.n, false); break;
        case 'openKey': if (actions.crate) actions.crate(panelArg, 1, true); break;
        case 'claim': if (actions.claim) actions.claim(); break;
        case 'open': openPanel(d.k); break;
        case 'again': results = null; closePanel(); if (actions.playAgain) actions.playAgain(); break;
        case 'camp': results = null; closePanel(); if (actions.leaveRace) actions.leaveRace(); break;
    }
}
$('#modal').addEventListener('click', (e) => { const t = e.target.closest && e.target.closest('[data-close2]'); if (t) { sfx('click'); closePanel(); } });
export function askConfirm(icon, title, text, yes, act) {
    const c = $('#confirm');
    c.innerHTML = `<div class="panel"><header><h2 class="o">${title}</h2><div class="hx"><button class="btn g-red o x" data-no>✕</button></div></header><div></div><div class="cbody"><span class="bi">${icon}</span><p>${text}</p><div class="btns"><button class="btn g-green o" data-yes>${yes}</button><button class="btn g-grey o" data-no>Cancel</button></div></div><div></div></div>`;
    c.hidden = false;
    for (const b of c.querySelectorAll('[data-no]')) b.onclick = () => { c.hidden = true; sfx('close'); };
    c.querySelector('[data-yes]').onclick = () => { c.hidden = true; act(); };
    c.onclick = (e) => { if (e.target === c) c.hidden = true; };
}
export function closeTop() {
    if (!$('#hatch').hidden) { closeHatch(); return true; }
    if (!$('#confirm').hidden) { $('#confirm').hidden = true; return true; }
    if (panelIs('results')) return false;
    if (closePanel()) return true;
    return false;
}
// the panels with their real content, for the loading warm-up; returns the clean-up
export function warmPanels() {
    const m = $('#modal');
    panelKind = 'rewards'; panelArg = 'street';
    tr = { laps: 1, time: 60000, rank: 'S', reward: { coins: 500, gems: 12, stars: 1, xp: 500 } };
    results = { rows: [{ n: 'Sample', p: 1, t: 12, f: false, pr: 10 }], me: { place: 0, finished: false, out: true, secs: 12, coins: 10, xp: 10, gems: 1, pct: 10, stages: 6 }, until: Date.now() };
    const html = [];
    for (const t of ['cars', 'ups', 'paint']) { panelTab = t; html.push(PANELS.garage()); }
    for (const t of ['crates', 'mine']) { panelTab = t; html.push(PANELS.crates()); }
    for (const t of ['daily', 'gifts', 'codes']) { panelTab = t; html.push(PANELS.rewards()); }
    panelTab = null;
    html.push(PANELS.crate(), PANELS.quests(), PANELS.teleport(), PANELS.boards(), PANELS.settings(), PANELS.results(), PANELS.tower(), PANELS.trophy());
    m.innerHTML = html.join('');
    results = null;
    m.hidden = false; m.classList.add('warmui');
    $('#confirm').innerHTML = '<div class="panel"><header><h2 class="o">Buy?</h2></header><div></div><div class="cbody"><span class="bi">🪙</span><p>Sample</p><div class="btns"><button class="btn g-green o">Yes</button></div></div><div></div></div>';
    $('#confirm').hidden = false; $('#confirm').classList.add('warmui');
    popup('🔑', 'KEY FOUND!', 'Sample', '#ffe24a'); $('#popup').classList.add('warmui');
    levelUp(1, 2); $('#lvlUp').classList.add('warmui');
    countText('3'); $('#count').classList.add('warmui');
    airWord('BIG AIR 2.4s +5'); $('#airWord').classList.add('warmui');
    showCard('Police Chase', 'Police Chase', 'Reach the Safehouse!'); $('#card').classList.add('warmui');
    $('#queueBox').hidden = false; $('#queueBox').classList.add('warmui');
    document.body.classList.add('inrace');
    toast('Sample', '#ffffff');
    const H = $('#hatch'), C = $('#hatchCaps');
    C.innerHTML = '<div class="hc"><div class="crt" style="--cc:#3ab4ff"></div></div><div class="hc">' + exSwatch(EXHAUSTS[1]) + '<b class="o">Ember</b><small class="o1">Common</small></div>';
    H.hidden = false; H.classList.add('warmui');
    return () => {
        for (const s of ['#modal', '#confirm', '#popup', '#lvlUp', '#hatch', '#count', '#card', '#queueBox', '#airWord']) { $(s).classList.remove('warmui'); $(s).hidden = true; }
        document.body.classList.remove('inrace');
        m.innerHTML = ''; $('#confirm').innerHTML = ''; panelKind = null; $('#toasts').innerHTML = ''; C.innerHTML = '';
    };
}
export const anyPopup = () => !$('#confirm').hidden || !$('#modal').hidden || !$('#hatch').hidden;
void TIME_RANKS;
