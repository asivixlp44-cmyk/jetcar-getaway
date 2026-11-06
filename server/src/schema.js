import { schema, t } from '@colyseus/schema';

// Public, synced to every client: the server's clock, the queue, and everyone on this server (players and bots): who they are, what
// they drive, which chase they're in. Where they are goes in snapshots to the people who can see them ('snaps', stamped with server
// time: other clients smooth them on that timeline). Private progress (quests...) goes only to its owner in "profile".
export const PlayerState = schema({
    name: t.string().default(''),
    pid: t.uint8().default(0),
    bot: t.boolean().default(false),
    ctx: t.string().default(''),      // the Police Chase they're in ('' on the long run)
    lv: t.uint16().default(1),
    wins: t.uint32().default(0),      // Trophies: the badge on their name
    stage: t.uint8().default(0),      // how far along the long run, for the Players list
    coins: t.uint32().default(0),
    car: t.string().default('comet'), // what they drive
    paint: t.string().default('stock'),
    exh: t.string().default('stock'), // what comes out of their jets
    av: t.string().default(''),       // packed Bloxity avatar (equipped ids + proportions): the driver
    prog: t.float32().default(0),     // how far along the chase, 0..1
    place: t.uint8().default(0),      // in their chase, from 1
    st: t.uint8().default(0),         // 0 driving, 1 escaped, 2 busted
}, 'PlayerState');

export const GameState = schema({
    now: t.float64().default(0),      // the server's clock, every patch
    queueN: t.uint8().default(0),     // how many have joined the next Police Chase
    queueEnd: t.float64().default(0), // when it starts (an invitation to everyone, or someone pressed CHASE)
    players: t.map(PlayerState),
}, 'GameState');
