// Writes bloxity-setup.html: every field of Bloxity's Create New Game form, top to bottom, with copy buttons.
// Run: node tests/setup-page.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'jetcar-getaway', NAME = 'Jetcar Getaway', PROD = `https://${SLUG}.play.bloxity.io/`;
const SEO = `${NAME} - Flying Car Obby & Police Chase | Free 3D Multiplayer Game`;
const SHORT = 'Drive it, then FLY it! Jet your car over gaps, through rings and windows across 100 stages above the city, and outrun the police in Police Chases against other players.';
const LONG = 'Your car has a jet under the seat. Drive along sky-high roads over the city, then hold FLY to jet across the gaps, up through the windows in great painted frames, through rings for Coins and across the rooftops of the towers, all on one tank of gas that fills again on the road. 100 stages through four worlds, harder all the way: Sunburst City, Mesa Motorway, Neon Nightway and Glacier Pass, with ramps, big air, laser gates, crumbling roads, trucks to jet over and icy bends. Every few minutes a Police Chase: race the other players to the Safehouse while the cops close in behind you; whoever they catch is BUSTED. Earn Coins, Gems and Keys to buy 7 cars, tune-ups, 16 paints and crates of jet exhausts. Easy, Normal and Hard modes, daily tasks, quests, FREE gifts, a daily reward, codes and leaderboards. Play on a phone (upright or sideways), a tablet or a computer.';
const TAGS = ['Obby', 'Racing', 'Driving', 'Cars', 'Flying', 'Parkour', 'Multiplayer', 'Police', 'Casual', '3D', 'Roblox-style', 'Family-friendly', 'Kid-friendly', 'In-game Currency', 'Leaderboards', 'Long Session'];
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const field = (label, value, o) => {
    o = o || {};
    const cls = o.mono ? 'val mono' : 'val';
    if (o.plain) return `<div class="field"><div class="label">${esc(label)}</div><div class="val">${value}</div><span></span></div>`;
    return `<div class="field"><div class="label">${esc(label)}</div><div class="${cls}">${esc(value)}</div><button class="copy" data-v="${esc(value)}">Copy</button></div>`;
};
const opt = (name, on, why) => `<tr><td>${esc(name)}</td><td class="${on ? 'on' : 'off'}">${on ? '&#9745; ON' : '&#9744; OFF'}</td><td class="why">${esc(why || '')}</td></tr>`;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Jetcar Getaway Setup</title>
<style>
:root { --bg: #f4f6fb; --card: #ffffff; --ink: #1b1d2a; --muted: #5d6478; --line: #e1e5ef; --accent: #2a7cff; --ok: #1e9e4a; --chip: #eef3ff; --off: #9aa0b0; --warn: #b86a00; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #12141c; --card: #1b1e29; --ink: #eef0f7; --muted: #a2a9bd; --line: #2c3142; --accent: #5aa0ff; --ok: #4cd37c; --chip: #23293a; --off: #6c7386; --warn: #ffb44a; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { max-width: 1060px; margin: 0 auto; padding: 28px 16px 60px; }
h1 { font-size: 28px; margin: 0 0 4px; }
h2 { font-size: 19px; margin: 34px 0 10px; }
h2 small { font-size: 13px; color: var(--muted); font-weight: 500; }
p.sub { color: var(--muted); margin: 0 0 8px; }
p.warn { color: var(--warn); font-weight: 600; margin: 8px 0; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 6px 16px; }
.field { display: grid; grid-template-columns: 210px 1fr auto; gap: 12px; align-items: start; padding: 10px 0; border-bottom: 1px solid var(--line); }
.field:last-child { border-bottom: none; }
.label { color: var(--muted); font-weight: 600; padding-top: 2px; }
.val { white-space: pre-wrap; word-break: break-word; }
.mono, code { font-family: ui-monospace, "Cascadia Mono", Consolas, monospace; font-size: 13.5px; }
button.copy { border: 1px solid var(--line); background: var(--chip); color: var(--ink); border-radius: 8px; padding: 4px 10px; font: 600 13px system-ui, sans-serif; cursor: pointer; }
button.copy:hover { border-color: var(--accent); }
button.copy.done { color: var(--ok); border-color: var(--ok); }
.tablewrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
table { border-collapse: collapse; width: 100%; min-width: 640px; }
th, td { text-align: left; padding: 9px 12px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { color: var(--muted); font-size: 13px; font-weight: 600; background: var(--chip); }
tr:last-child td { border-bottom: none; }
td.on { color: var(--ok); font-weight: 700; white-space: nowrap; }
td.off { color: var(--off); white-space: nowrap; }
td.why { color: var(--muted); }
.tags { display: flex; flex-wrap: wrap; gap: 6px; padding: 12px 0; }
.tag { border: 1px solid var(--line); background: var(--chip); border-radius: 7px; padding: 2px 9px; font-size: 13px; font-weight: 600; }
ol.steps { padding-left: 20px; margin: 0; } ol.steps li { margin: 6px 0; }
@media (max-width: 640px) { .field { grid-template-columns: 1fr auto; } .label { grid-column: 1 / -1; } }
.covers { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; align-items: start; }
.covers figure { margin: 0; }
.covers img { width: 100%; border-radius: 10px; border: 2px solid rgba(255,255,255,0.18); display: block; }
.covers figcaption { margin-top: 6px; font-size: 13px; opacity: 0.85; display: flex; justify-content: space-between; gap: 8px; }
.covers a { color: inherit; font-weight: 700; }
@media (max-width: 700px) { .covers { grid-template-columns: 1fr; } }
</style>
</head>
<body>
<main>
    <h1>${esc(NAME)}: Create New Game</h1>
    <p class="sub">Every field of the dev.bloxity.io Manage Games &rarr; <b>Create New Game</b> form, top to bottom. Click Copy to copy a value. This game has <b>no in-app purchases</b>: cars, upgrades, paint, crates and skips all cost Coins, Gems, Keys or Trophies earned in the game.</p>
    <p class="warn">Use the <b>prod</b> URL (${PROD}) everywhere, never a .dev.play.bloxity.io one. It works once the game is hosted (see Hosting steps).</p>
    <p class="warn">If the form opens with another game's values already in it (slug, name, webhook URL, release date), replace or clear every one of them.</p>

    <h2>Basic Info</h2>
    <div class="card">
    ${field('Slug *', SLUG, { mono: true })}
    ${field('Name *', NAME)}
    ${field('SEO Name (optional)', SEO)}
    ${field('Developer', 'Your choice (Show developer and the community)', { plain: true })}
    ${field('Game Source *', 'Choose <b>External URL</b> (not Upload ZIP): the game is hosted by Legion.', { plain: true })}
    ${field('Game URL', PROD, { mono: true })}
    ${field('Raw URL (optional)', PROD, { mono: true })}
    ${field('CG URL (optional)', '<span style="color:var(--off)">Leave empty</span>', { plain: true })}
    ${field('Additional Game Domains', `${SLUG}.play.bloxity.io\n${SLUG}.host.bloxity.io`, { mono: true })}
    ${field('Short Description', SHORT)}
    ${field('Description', LONG)}
    </div>

    <h2>Checkboxes</h2>
    <div class="tablewrap"><table><thead><tr><th>Option</th><th>Set to</th><th>Why</th></tr></thead><tbody>
        ${opt('SDK Support', true, 'The game loads the Bloxity SDK (login, avatars, chat, emotes, settings).')}
        ${opt('LoadingEnd Support', true, 'The game calls loadingEnd() as soon as it has joined a server (no start menu).')}
        ${opt('Active', true, 'So players can find it.')}
        ${opt('Disable from Discovery', false, 'Only if you want to share the link before it is listed.')}
        ${opt('Disable on New Games category', false)}
        ${opt('Add to Pre Release category', false)}
        ${opt('Under Maintenance', false)}
        ${opt('Show Boxity Chat', true, 'Chat bubbles appear over players in the world.')}
        ${opt('In-game Voice', true, 'The game reports its room, so players on the same server can talk.')}
        ${opt('Show Missions Button', false, 'The game has its own daily tasks and quests.')}
        ${opt('Mobile Force Landscape', false, 'The game is built to play held upright (the vertical feed) as well as sideways.')}
        ${opt('Disable for CG', false)}
        ${opt('Disable for MSN', false)}
        ${opt('Enable New ESC Menu', true, 'ESC opens the portal menu; the game reports its room id.')}
    </tbody></table></div>
    <div class="card" style="margin-top:12px">
    ${field('Engine', 'three.js (only an admin can set this)', { plain: true })}
    ${field('Page Layout', 'Classic', { plain: true })}
    </div>

    <h2>Cover Images</h2>
    <div class="card">
        <div class="covers">
            <figure><img src="covers/cover-1920x1080.png" alt="${esc(NAME)} landscape cover"><figcaption><span>Landscape 16:9 * · 1920 x 1080</span><a href="covers/cover-1920x1080.png" download>Download</a></figcaption></figure>
            <figure><img src="covers/cover-800x800.png" alt="${esc(NAME)} square cover"><figcaption><span>Square 1:1 * · 800 x 800</span><a href="covers/cover-800x800.png" download>Download</a></figcaption></figure>
        </div>
        <p class="sub" style="margin-top:8px">Both are rendered from the game itself (a jetcar mid-flight over the city, the sky road running on ahead). Files: <code>covers/cover-1920x1080.png</code>, <code>covers/cover-800x800.png</code>. To make them again: <code>node tests/covers.mjs</code>.</p>
    </div>

    <h2>Tags <small>(${TAGS.length})</small></h2>
    <div class="card"><div class="tags">${TAGS.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div></div>
    <p class="sub" style="margin-top:8px">Pick each from the form's tag bank; if one isn't there, use the closest it has (Adventure for Obby or Flying).</p>

    <h2>In-App Purchases <small>(none)</small></h2>
    <div class="card">
    ${field('IAPs', 'Leave empty. Everything is bought with Coins, Gems, Keys or Trophies earned inside the game.', { plain: true })}
    ${field('Default Webhook URL', '<span style="color:var(--off)">Clear it (no purchases, no webhook)</span>', { plain: true })}
    </div>

    <h2>Release</h2>
    <div class="card">
    ${field('Release date &amp; time', 'Click <b>Clear</b> so it publishes as soon as it is Active.', { plain: true }).replace('&amp;amp;', '&amp;')}
    </div>
    <p class="sub" style="margin-top:10px">Then click <b>Create Game</b>.</p>

    <h2>Hosting steps</h2>
    <div class="card" style="padding:14px 16px"><ol class="steps">
        <li>GitHub: create the empty repo <code>LEGiON-Platforms/${SLUG}</code> (no README) and add the repo secret <code>LEGION_DEPLOY_TOKEN</code>.</li>
        <li>hosting.bloxity.io: the app <code>${SLUG}</code> must exist (its id is <code>GAME_ID</code> in <code>.github/workflows/deploy.yml</code>).</li>
        <li>Push the code to <code>main</code> (as <code>asivixlp44-cmyk</code>): the workflow builds the server image and the client and deploys both.</li>
        <li>Check <code>https://${SLUG}.host.bloxity.io/health</code> (it should say <code>"db": true</code>: Legion provides <code>MONGODB_URI</code>) and play at <code>https://${SLUG}.play.bloxity.io</code>.</li>
        <li>Create the game in Manage Games with the values above (slug exactly <code>${SLUG}</code>).</li>
    </ol></div>
</main>
<script>
document.addEventListener('click', async (e) => {
    const b = e.target.closest('button.copy');
    if (!b || !b.dataset.v) return;
    try { await navigator.clipboard.writeText(b.dataset.v); }
    catch (err) { const t = document.createElement('textarea'); t.value = b.dataset.v; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    const old = b.textContent; b.textContent = '✓'; b.classList.add('done');
    setTimeout(() => { b.textContent = old; b.classList.remove('done'); }, 1200);
});
</script>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'bloxity-setup.html'), html);
console.log('wrote bloxity-setup.html');
