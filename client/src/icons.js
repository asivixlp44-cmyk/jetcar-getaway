// The HUD's icons, drawn: glossy cartoon art (SVG with gradients, a dark outline and a white shine), made once
// at load and set as CSS classes (.ic-spin, .ic-rebirth...). The menu never shows an emoji.
const O = '#1a1030';
const svg = (body, defs) => `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><defs>${defs || ''}</defs>${body}</svg>`;
const grad = (id, stops, x2, y2) => `<linearGradient id='${id}' x1='0' y1='0' x2='${x2 ?? 0}' y2='${y2 ?? 1}'>${stops.map((c, i) => `<stop offset='${i / (stops.length - 1)}' stop-color='${c}'/>`).join('')}</linearGradient>`;
const shine = (cx, cy, rx, ry, rot) => `<ellipse cx='${cx}' cy='${cy}' rx='${rx}' ry='${ry}' fill='#fff' opacity='.5'${rot ? ` transform='rotate(${rot} ${cx} ${cy})'` : ''}/>`;
const f = (n) => +n.toFixed(2);

function wheel() {
    const C = ['#ff4a6a', '#ffa82a', '#ffe02a', '#46ec50', '#3ab4ff', '#8a5aff', '#ff5ac0', '#2ae8d8'];
    let p = '';
    for (let i = 0; i < 8; i++) {
        const a0 = i / 8 * Math.PI * 2 - Math.PI / 2, a1 = (i + 1) / 8 * Math.PI * 2 - Math.PI / 2;
        p += `<path d='M32 34 L${f(32 + 25 * Math.cos(a0))} ${f(34 + 25 * Math.sin(a0))} A25 25 0 0 1 ${f(32 + 25 * Math.cos(a1))} ${f(34 + 25 * Math.sin(a1))} Z' fill='${C[i]}'/>`;
    }
    return svg(`<circle cx='32' cy='34' r='27' fill='${O}'/>${p}<circle cx='32' cy='34' r='25' fill='none' stroke='#fff' stroke-opacity='.35' stroke-width='2'/>
        ${shine(24, 22, 12, 6, -30)}<circle cx='32' cy='34' r='7' fill='url(#g)' stroke='${O}' stroke-width='3'/>
        <path d='M25 2 L39 2 L32 14 Z' fill='#ff3a4a' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>`, grad('g', ['#fff6a0', '#ffb21e']));
}
const ICONS = {
    spin: wheel(),
    // a chequered flag
    flag: svg(`<rect x='14' y='6' width='5' height='54' rx='2' fill='#c8c8d0' stroke='${O}' stroke-width='3'/><path d='M19 9 H54 V36 H19 Z' fill='#fff' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/><path d='M19 9 H28 V18 H19 Z M37 9 H46 V18 H37 Z M28 18 H37 V27 H28 Z M46 18 H54 V27 H46 Z M19 27 H28 V36 H19 Z M37 27 H46 V36 H37 Z' fill='#1a1030'/>`),
    // someone's head and shoulders
    avatar: svg(`<circle cx='32' cy='32' r='28' fill='url(#b)' stroke='${O}' stroke-width='4'/><circle cx='32' cy='24' r='10' fill='#fff' stroke='${O}' stroke-width='3'/><path d='M13 52 C15 38 49 38 51 52 Z' fill='#fff' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>`, grad('b', ['#7ac8ff', '#1f6fff'])),
    // a note
    music: svg(`<path d='M24 12 L52 6 V42' fill='none' stroke='${O}' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/><path d='M24 12 V50' fill='none' stroke='${O}' stroke-width='9' stroke-linecap='round'/><path d='M24 12 L52 6 V42 M24 12 V50' fill='none' stroke='url(#p)' stroke-width='4.5' stroke-linecap='round' stroke-linejoin='round'/><ellipse cx='17' cy='51' rx='10' ry='8' fill='url(#p)' stroke='${O}' stroke-width='3.5'/><ellipse cx='45' cy='43' rx='10' ry='8' fill='url(#p)' stroke='${O}' stroke-width='3.5'/>`, grad('p', ['#d08aff', '#7a2aff'])),
    // a stopwatch
    clock: svg(`<rect x='27' y='3' width='10' height='9' rx='2' fill='#fff' stroke='${O}' stroke-width='3'/><circle cx='32' cy='36' r='23' fill='#fff' stroke='${O}' stroke-width='5'/><path d='M32 36 L32 20 M32 36 L43 42' stroke='${O}' stroke-width='5' stroke-linecap='round'/><path d='M48 15 L54 21' stroke='${O}' stroke-width='6' stroke-linecap='round'/>`),
    // a figure floating up past a moon
    moon: svg(`<path d='M46 6 A26 26 0 1 0 58 44 A21 21 0 0 1 46 6 Z' fill='url(#m)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><circle cx='27' cy='30' r='4' fill='#7a8aff' opacity='.7'/><circle cx='20' cy='44' r='3' fill='#7a8aff' opacity='.7'/>`, grad('m', ['#e8ecff', '#8a98ff'])),
    // a rainbow carpet
    carpet: svg(`<path d='M6 26 Q20 18 32 26 T58 26 V44 Q44 52 32 44 T6 44 Z' fill='url(#c)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M6 32 Q20 24 32 32 T58 32 M6 38 Q20 30 32 38 T58 38' fill='none' stroke='#fff' stroke-opacity='.7' stroke-width='2.5'/>`, grad('c', ['#ff3a6a', '#ffb02a', '#ffe02a', '#46ec50', '#3ab4ff', '#b45aff'], 1, 0)),
    // rebirth: two arrows chasing each other round a gold star, on a blue orb
    rebirth: svg(`<circle cx='32' cy='32' r='27' fill='url(#b)' stroke='${O}' stroke-width='4'/>
        <path d='M17 30 A15 15 0 0 1 43 20' fill='none' stroke='#fff' stroke-width='6' stroke-linecap='round'/><path d='M38 13 L49 17 L42 27 Z' fill='#fff'/>
        <path d='M47 34 A15 15 0 0 1 21 44' fill='none' stroke='#fff' stroke-width='6' stroke-linecap='round'/><path d='M26 51 L15 47 L22 37 Z' fill='#fff'/>
        <path d='M32 24 L34.4 29.6 L40.4 30 L35.8 34 L37.2 40 L32 36.8 L26.8 40 L28.2 34 L23.6 30 L29.6 29.6 Z' fill='url(#y)' stroke='${O}' stroke-width='2' stroke-linejoin='round'/>
        ${shine(23, 16, 10, 5, -30)}`, grad('b', ['#8ae6ff', '#1f6fff']) + grad('y', ['#fff6a0', '#ffb21e'])),
    // a gift: a red box, a gold ribbon and bow
    gift: svg(`<path d='M20 16 C14 6 26 4 31 16 Z M44 16 C50 6 38 4 33 16 Z' fill='url(#y)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/>
        <rect x='10' y='29' width='44' height='30' rx='3' fill='url(#r)' stroke='${O}' stroke-width='4'/>
        <rect x='6' y='17' width='52' height='14' rx='3' fill='url(#r2)' stroke='${O}' stroke-width='4'/>
        <rect x='27' y='17' width='10' height='42' fill='url(#y)' stroke='${O}' stroke-width='3'/>
        ${shine(17, 22, 7, 2.5)}`, grad('r', ['#ff6a7a', '#d81a3a']) + grad('r2', ['#ff8a9a', '#ff2a4a']) + grad('y', ['#fff6a0', '#ffb21e'])),
    // worlds: a little globe
    world: svg(`<circle cx='32' cy='32' r='27' fill='url(#s)' stroke='${O}' stroke-width='4'/>
        <path d='M14 22 C20 16 28 18 30 24 C32 30 24 32 22 38 C20 44 13 40 11 34 C10 29 11 25 14 22 Z' fill='url(#l)'/>
        <path d='M36 12 C44 12 52 18 54 26 C50 30 44 26 40 30 C36 34 40 42 36 48 C32 46 31 38 34 32 C36 26 32 22 34 16 Z' fill='url(#l)'/>
        <path d='M26 50 C30 48 36 50 38 55 C33 58 28 57 24 55 Z' fill='url(#l)'/>
        ${shine(22, 17, 10, 5, -30)}`, grad('s', ['#7ae0ff', '#1f7fe8']) + grad('l', ['#a8ff7a', '#22b83a'])),
    // quests: a clipboard with a tick
    quest: svg(`<rect x='10' y='8' width='44' height='52' rx='5' fill='url(#w)' stroke='${O}' stroke-width='4'/>
        <rect x='16' y='16' width='32' height='38' rx='2' fill='#fffdf4' stroke='${O}' stroke-width='2.5'/>
        <rect x='22' y='4' width='20' height='10' rx='3' fill='url(#m)' stroke='${O}' stroke-width='3.5'/>
        <path d='M21 33 L28 40 L43 24' fill='none' stroke='#22c73a' stroke-width='6' stroke-linecap='round' stroke-linejoin='round'/>
        <path d='M22 47 L42 47' stroke='#c8c0d8' stroke-width='3' stroke-linecap='round'/>`, grad('w', ['#e8a868', '#a8602a']) + grad('m', ['#e0e4ee', '#8a90a8'])),
    // settings: a gear
    gear: svg(`<g fill='url(#m)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'>${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<rect x='26' y='3' width='12' height='16' rx='3' transform='rotate(${a} 32 32)'/>`).join('')}<circle cx='32' cy='32' r='20'/></g>
        <circle cx='32' cy='32' r='8' fill='#5a5070' stroke='${O}' stroke-width='3.5'/>${shine(25, 22, 7, 3.5, -30)}`, grad('m', ['#f0f2f8', '#8a90a8'])),
    // the shop: a pink shopping bag with a gold star
    shop: svg(`<path d='M22 22 C22 8 42 8 42 22' fill='none' stroke='${O}' stroke-width='5' stroke-linecap='round'/>
        <path d='M10 20 L54 20 L50 60 L14 60 Z' fill='url(#p)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='M32 29 L35 36 L42.5 36.6 L36.8 41.4 L38.6 48.8 L32 44.8 L25.4 48.8 L27.2 41.4 L21.5 36.6 L29 36 Z' fill='url(#y)' stroke='${O}' stroke-width='2.5' stroke-linejoin='round'/>
        ${shine(19, 28, 4, 7)}`, grad('p', ['#ffa8e0', '#ff2a9a']) + grad('y', ['#fff6a0', '#ffb21e'])),
    // a sneaker, for Gear
    shoe: svg(`<path d='M6 24 L6 44 L58 44 L58 38 C58 33 48 30 40 26 L28 16 C24 16 22 22 16 22 C12 22 10 18 8 18 Z' fill='url(#r)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <rect x='4' y='42' width='56' height='11' rx='4' fill='url(#w)' stroke='${O}' stroke-width='4'/>
        <path d='M28 24 L36 19 M33 28 L41 23 M38 32 L45 27' stroke='#fff' stroke-width='3' stroke-linecap='round'/>${shine(16, 28, 7, 3)}`, grad('r', ['#ff7a8a', '#e81a3a']) + grad('w', ['#ffffff', '#c8d0e4'])),
    // an egg with spots
    egg: svg(`<path d='M32 5 C46 5 55 26 55 39 C55 52 45 60 32 60 C19 60 9 52 9 39 C9 26 18 5 32 5 Z' fill='url(#e)' stroke='${O}' stroke-width='4'/>
        <circle cx='24' cy='30' r='6' fill='#46ec50'/><circle cx='41' cy='38' r='7' fill='#3ab4ff'/><circle cx='26' cy='49' r='5' fill='#ff5a9a'/><circle cx='40' cy='19' r='4' fill='#ffd21e'/>${shine(22, 18, 6, 9, 20)}`, grad('e', ['#ffffff', '#e0d4c0'])),
    // the Breakout Balloon
    spire: svg(`<path d='M32 3 C48 3 58 15 58 27 C58 38 44 44 40 50 L24 50 C20 44 6 38 6 27 C6 15 16 3 32 3 Z' fill='url(#b)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='M32 3 C24 12 22 34 27 50 M32 3 C40 12 42 34 37 50' fill='none' stroke='${O}' stroke-width='2.5'/>
        <rect x='25' y='52' width='14' height='10' rx='2' fill='url(#w)' stroke='${O}' stroke-width='3.5'/>${shine(18, 16, 7, 4, -30)}`, grad('b', ['#ff7a8a', '#ffc21e', '#3ab4ff']) + grad('w', ['#e8a868', '#a8602a'])),
    // a Star from a Breakout
    star: svg(`<path d='M32 4 L40.6 22.8 L61 25.2 L46 39.2 L50 59.6 L32 49.4 L14 59.6 L18 39.2 L3 25.2 L23.4 22.8 Z' fill='url(#y)' stroke='${O}' stroke-width='4.5' stroke-linejoin='round'/>${shine(24, 22, 7, 4, -30)}`, grad('y', ['#fff6a0', '#ffb21e'])),
    // Storm Rush: a bolt out of a cloud
    rush: svg(`<path d='M16 34 C6 34 4 22 14 20 C14 8 32 6 36 16 C46 12 56 20 50 32 Z' fill='url(#c)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M34 28 L22 46 L31 46 L26 61 L44 39 L34 39 L40 28 Z' fill='url(#y)' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/>`, grad('c', ['#c8c8f0', '#6a5ac8']) + grad('y', ['#fff6a0', '#ffb21e'])),
    // skip a stage: two arrows on
    skip: svg(`<path d='M6 12 L30 32 L6 52 Z M32 12 L56 32 L32 52 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>`, grad('g', ['#a8ff7a', '#22c73a'])),
    // home: a little island with a palm
    home: svg(`<ellipse cx='32' cy='50' rx='27' ry='9' fill='url(#s)' stroke='${O}' stroke-width='4'/><path d='M33 47 C31 36 33 27 38 18' fill='none' stroke='${O}' stroke-width='6' stroke-linecap='round'/><path d='M38 18 C30 8 18 12 14 22 C24 18 32 18 38 18 C44 8 54 10 58 20 C50 16 44 16 38 18 C34 24 28 30 26 36 C32 30 38 24 38 18 C44 22 48 28 50 36 C46 26 42 22 38 18 Z' fill='url(#l)' stroke='${O}' stroke-width='3' stroke-linejoin='round'/>`, grad('s', ['#fff0b8', '#e8b84a']) + grad('l', ['#a8ff7a', '#22b83a'])),
    // Double Jump: a wing
    wing: svg(`<path d='M8 44 C10 22 28 8 56 8 C54 14 50 18 46 20 C50 20 52 22 52 24 C48 28 44 30 40 30 C44 32 44 34 42 36 C36 42 26 44 8 44 Z' fill='url(#w)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M14 56 L24 50 M28 58 L34 50 M42 56 L44 48' stroke='#3ab4ff' stroke-width='4' stroke-linecap='round'/>`, grad('w', ['#ffffff', '#a8d8ff'])),
    // Spring Soles
    spring: svg(`<path d='M12 54 L52 46 L12 38 L52 30 L12 22 L52 14' fill='none' stroke='${O}' stroke-width='9' stroke-linecap='round' stroke-linejoin='round'/><path d='M12 54 L52 46 L12 38 L52 30 L12 22 L52 14' fill='none' stroke='url(#m)' stroke-width='5' stroke-linecap='round' stroke-linejoin='round'/>`, grad('m', ['#fff0a8', '#ff8a2a'])),
    // Lucky Coins
    clover: svg(`<g fill='url(#g)' stroke='${O}' stroke-width='3.5'><circle cx='22' cy='22' r='12'/><circle cx='42' cy='22' r='12'/><circle cx='22' cy='42' r='12'/><circle cx='42' cy='42' r='12'/></g><path d='M32 32 L44 60' stroke='${O}' stroke-width='6' stroke-linecap='round'/><path d='M32 32 L44 60' stroke='#22b83a' stroke-width='3' stroke-linecap='round'/>`, grad('g', ['#a8ff7a', '#22b83a'])),
    // Coin Magnet
    magnet: svg(`<path d='M10 10 L24 10 L24 34 C24 44 40 44 40 34 L40 10 L54 10 L54 34 C54 62 10 62 10 34 Z' fill='url(#r)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><rect x='10' y='10' width='14' height='10' fill='#e8ecf4' stroke='${O}' stroke-width='3'/><rect x='40' y='10' width='14' height='10' fill='#e8ecf4' stroke='${O}' stroke-width='3'/>`, grad('r', ['#ff7a8a', '#d81a3a'])),
    // Sidekick Slots
    paw: svg(`<g fill='url(#p)' stroke='${O}' stroke-width='3.5'><ellipse cx='32' cy='42' rx='16' ry='14'/><circle cx='13' cy='28' r='7'/><circle cx='25' cy='16' r='7'/><circle cx='40' cy='16' r='7'/><circle cx='51' cy='28' r='7'/></g>`, grad('p', ['#ffd8a8', '#ff8a3a'])),
    // Air Dash
    dash: svg(`<path d='M6 18 L30 18 M2 32 L26 32 M6 46 L30 46' stroke='#3ad8ff' stroke-width='5' stroke-linecap='round'/><path d='M28 8 L60 32 L28 56 L36 32 Z' fill='url(#y)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>`, grad('y', ['#fff6a0', '#ffb21e'])),
    // the Glider
    glide: svg(`<path d='M4 30 C14 12 50 12 60 30 C50 26 44 28 42 32 C38 26 26 26 22 32 C20 28 14 26 4 30 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M22 32 L32 54 L42 32' fill='none' stroke='${O}' stroke-width='3'/><circle cx='32' cy='54' r='4' fill='#ffd21e' stroke='${O}' stroke-width='3'/>`, grad('g', ['#e0a8ff', '#8a2aff'])),
    // a Gem
    gem: svg(`<path d='M14 10 L50 10 L61 26 L32 58 L3 26 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>
        <path d='M3 26 L61 26 M14 10 L22 26 L32 58 L42 26 L50 10 M22 26 L32 10 L42 26' fill='none' stroke='#fff' stroke-opacity='.45' stroke-width='2'/>
        ${shine(20, 17, 6, 3, -20)}`, grad('g', ['#e8b8ff', '#9a4aff', '#6a1ad8'])),
};

// ----- Jetcar Getaway -----
Object.assign(ICONS, {
    // a little roadster, side on
    car: svg(`<path d='M6 40 C6 32 12 30 18 29 L26 21 C28 19 31 18 34 18 L44 18 C48 18 50 21 52 25 L56 30 C60 31 60 35 60 40 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M27 28 L33 22 L42 22 L46 28 Z' fill='#cfeaff' stroke='${O}' stroke-width='3' stroke-linejoin='round'/><circle cx='18' cy='42' r='8' fill='#30323a' stroke='${O}' stroke-width='3'/><circle cx='18' cy='42' r='3' fill='#e8ecf4'/><circle cx='48' cy='42' r='8' fill='#30323a' stroke='${O}' stroke-width='3'/><circle cx='48' cy='42' r='3' fill='#e8ecf4'/><path d='M2 46 L10 46 M0 52 L8 52' stroke='#ffb040' stroke-width='4' stroke-linecap='round'/>${shine(36, 25, 8, 2.5, 0)}`, grad('g', ['#ff8a8a', '#ff2a4a', '#c8102a'])),
    // a wooden crate with a bright band
    crate: svg(`<rect x='8' y='14' width='48' height='42' rx='5' fill='url(#g)' stroke='${O}' stroke-width='4'/><path d='M8 28 H56 M8 42 H56 M22 14 V56 M42 14 V56' stroke='#7a4a1a' stroke-width='2.5' opacity='.55'/><rect x='26' y='10' width='12' height='50' rx='3' fill='#3ab4ff' stroke='${O}' stroke-width='3'/><circle cx='32' cy='35' r='5' fill='#ffe24a' stroke='${O}' stroke-width='2.5'/>${shine(18, 20, 7, 3, -15)}`, grad('g', ['#ffd08a', '#e89a4a', '#c8742a'])),
    // a gold key
    key: svg(`<circle cx='20' cy='22' r='14' fill='url(#g)' stroke='${O}' stroke-width='4'/><circle cx='20' cy='22' r='5' fill='#1a1030'/><path d='M29 31 L54 56 M44 46 L50 40 M50 52 L56 46' stroke='${O}' stroke-width='10' stroke-linecap='round'/><path d='M29 31 L54 56 M44 46 L50 40 M50 52 L56 46' stroke='url(#g)' stroke-width='5' stroke-linecap='round'/>${shine(15, 16, 5, 2.5, -30)}`, grad('g', ['#fff6a0', '#ffc21e', '#e8920a'])),
    // a map pin
    pin: svg(`<path d='M32 60 C20 44 12 34 12 24 C12 12 21 4 32 4 C43 4 52 12 52 24 C52 34 44 44 32 60 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><circle cx='32' cy='24' r='8' fill='#fff' stroke='${O}' stroke-width='3'/>${shine(24, 14, 6, 3, -30)}`, grad('g', ['#7ae8ff', '#2a9aff', '#1a5ad8'])),
    // a wrench
    wrench: svg(`<path d='M44 6 C36 6 30 14 33 22 L8 47 C5 50 5 55 8 58 C11 61 16 61 19 58 L44 33 C52 36 60 30 60 22 L52 26 L44 22 L42 14 L50 8 C48 6 46 6 44 6 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><circle cx='14' cy='52' r='3' fill='${O}'/>${shine(42, 14, 5, 2.5, -40)}`, grad('g', ['#f0f4ff', '#a8b4c8', '#6a7488'])),
    // an engine block
    engine: svg(`<rect x='10' y='20' width='44' height='30' rx='5' fill='url(#g)' stroke='${O}' stroke-width='4'/><rect x='16' y='10' width='32' height='12' rx='3' fill='#ff5a5a' stroke='${O}' stroke-width='3'/><path d='M18 30 H46 M18 38 H46' stroke='${O}' stroke-width='3' opacity='.5'/><path d='M4 30 H10 M54 30 H60' stroke='${O}' stroke-width='4'/>${shine(22, 26, 6, 2.5, 0)}`, grad('g', ['#d8dce8', '#8a92a4', '#5a6274'])),
    // a jet nozzle with its flame
    jet: svg(`<path d='M40 18 L58 14 L58 50 L40 46 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M40 22 C22 22 6 28 4 32 C6 36 22 42 40 42 Z' fill='#ffb040' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/><path d='M40 27 C30 27 20 30 16 32 C20 34 30 37 40 37 Z' fill='#fff6a0'/>${shine(50, 20, 4, 2, 0)}`, grad('g', ['#a8f0ff', '#3ab4ff', '#1a6ad8'])),
    // a fuel can
    tank: svg(`<path d='M14 14 H40 L52 26 V56 H14 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><rect x='42' y='4' width='10' height='12' rx='2' fill='#30323a' stroke='${O}' stroke-width='3'/><path d='M22 28 L36 46 M36 28 L22 46' stroke='#fff' stroke-width='5' stroke-linecap='round' opacity='.8'/>${shine(22, 20, 6, 2.5, 0)}`, grad('g', ['#9aff8a', '#46ec50', '#1aa830'])),
    // a nitro bottle
    nitro: svg(`<rect x='20' y='16' width='24' height='42' rx='10' fill='url(#g)' stroke='${O}' stroke-width='4'/><rect x='26' y='6' width='12' height='12' rx='3' fill='#d8dce8' stroke='${O}' stroke-width='3'/><path d='M34 26 L27 38 H33 L30 50 L38 35 H32 Z' fill='#fff' stroke='${O}' stroke-width='2' stroke-linejoin='round'/>${shine(26, 24, 3, 6, 0)}`, grad('g', ['#ffe88a', '#ffc21e', '#e8820a'])),
    // a paint brush
    brush: svg(`<path d='M38 6 L58 26 L34 40 L24 30 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M24 30 L34 40 C30 50 20 58 6 58 C8 46 14 34 24 30 Z' fill='#ff5ac8' stroke='${O}' stroke-width='4' stroke-linejoin='round'/>${shine(44, 16, 6, 2.5, 45)}`, grad('g', ['#ffe0a0', '#d8a050', '#a8702a'])),
    // a police light
    siren: svg(`<path d='M14 50 V34 C14 22 22 14 32 14 C42 14 50 22 50 34 V50 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><rect x='8' y='48' width='48' height='10' rx='3' fill='#30323a' stroke='${O}' stroke-width='3'/><path d='M32 4 V8 M10 12 L13 15 M54 12 L51 15 M4 32 H8 M56 32 H60' stroke='#ff2a3a' stroke-width='4' stroke-linecap='round'/>${shine(24, 26, 5, 8, 20)}`, grad('g', ['#ff9aa0', '#ff2a3a', '#b8081a'])),
    // a trophy
    trophy: svg(`<path d='M18 8 H46 V24 C46 34 40 40 32 40 C24 40 18 34 18 24 Z' fill='url(#g)' stroke='${O}' stroke-width='4' stroke-linejoin='round'/><path d='M18 14 H8 C8 24 12 28 18 28 M46 14 H56 C56 24 52 28 46 28' fill='none' stroke='${O}' stroke-width='4'/><path d='M28 40 H36 V48 H28 Z' fill='#ffc21e' stroke='${O}' stroke-width='3'/><rect x='18' y='48' width='28' height='10' rx='3' fill='#7a4a1a' stroke='${O}' stroke-width='3'/>${shine(26, 16, 4, 7, 0)}`, grad('g', ['#fff6a0', '#ffc21e', '#e8920a'])),
});
// A Sidekick's picture: its shape in its colour (panels and the egg's reveal)
export function petSvg(k) {
    const col = '#' + k.color.toString(16).padStart(6, '0'), s = k.shape;
    const eyes = (y) => `<ellipse cx='24' cy='${y}' rx='4.5' ry='6' fill='${O}'/><ellipse cx='40' cy='${y}' rx='4.5' ry='6' fill='${O}'/><circle cx='25.5' cy='${y - 2}' r='1.8' fill='#fff'/><circle cx='41.5' cy='${y - 2}' r='1.8' fill='#fff'/>`;
    const P = [
        `<circle cx='32' cy='36' r='24' fill='${col}' stroke='${O}' stroke-width='3.5'/>${eyes(32)}<path d='M26 42 L38 42 L32 50 Z' fill='#ffa82a' stroke='${O}' stroke-width='2.5' stroke-linejoin='round'/><path d='M32 12 Q28 4 24 8 M32 12 Q36 4 40 8' fill='none' stroke='${O}' stroke-width='3'/>`,
        `<ellipse cx='22' cy='14' rx='6' ry='14' fill='${col}' stroke='${O}' stroke-width='3.5'/><ellipse cx='42' cy='14' rx='6' ry='14' fill='${col}' stroke='${O}' stroke-width='3.5'/><circle cx='32' cy='40' r='21' fill='${col}' stroke='${O}' stroke-width='3.5'/>${eyes(37)}<path d='M29 46 Q32 50 35 46' fill='none' stroke='${O}' stroke-width='3' stroke-linecap='round'/>`,
        `<path d='M12 26 L10 4 L26 16 Z M52 26 L54 4 L38 16 Z' fill='${col}' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/><path d='M8 30 C8 14 56 14 56 30 C56 46 44 60 32 60 C20 60 8 46 8 30 Z' fill='${col}' stroke='${O}' stroke-width='3.5'/><path d='M20 44 C24 40 40 40 44 44 C42 54 22 54 20 44 Z' fill='#fff4e8'/>${eyes(32)}<circle cx='32' cy='46' r='3' fill='${O}'/>`,
        `<path d='M18 34 C8 18 4 30 2 42 C8 38 12 42 16 44 Z M46 34 C56 18 60 30 62 42 C56 38 52 42 48 44 Z' fill='${col}' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/><path d='M20 18 L18 6 L28 14 Z M44 18 L46 6 L36 14 Z' fill='${col}' stroke='${O}' stroke-width='3.5' stroke-linejoin='round'/><circle cx='32' cy='36' r='20' fill='${col}' stroke='${O}' stroke-width='3.5'/>${eyes(33)}<path d='M28 44 L30 49 L32 44 L34 49 L36 44' fill='#fff' stroke='${O}' stroke-width='2' stroke-linejoin='round'/>`,
    ];
    return 'data:image/svg+xml,' + encodeURIComponent(svg(P[s] + shine(22, 22, 5, 3, -30)));
}
export function installIcons() {
    const st = document.createElement('style');
    st.textContent = Object.entries(ICONS).map(([k, s]) => `.ic-${k}{background-image:url("data:image/svg+xml,${encodeURIComponent(s.replace(/\s*\n\s*/g, ''))}")}`).join('\n');
    document.head.appendChild(st);
}
