# Jetcar Getaway

A multiplayer flying-car obby for the browser, built with **Three.js** and **Colyseus** for Bloxity. **Your car has a jet under the seat: drive it along sky-high roads over the city, then hold FLY to jet across the gaps.** 100 stages through four worlds, harder all the way, a checkpoint at the start of every stage. Fly through rings for Coins, land big airs, find the Keys floating high over the road, reach the Getaway Tower at the end for a Trophy, and run it again for bigger pay. Every few minutes everyone is invited to a **Police Chase**: six drivers on one course with the cops closing in behind them.

The genre, the core loop and the pacing follow the Roblox game *[🚨CHASE] [Roadster🚀] Flying car obby* (see the video in `reference/`). The name, the worlds, the cars, the art, the items and the wording are all our own, drawn by this game's code; nothing is taken from the reference.

**There are no in-app purchases.** Everything costs Coins (stages, rings, big airs, chases, quests), Gems (chases, quests, daily tasks, gifts, the daily reward, codes), Keys (found on the course, gifts, the daily reward, codes) or Trophies (one each time you reach the Getaway Tower), all earned in the game.

It shares its engine with the other Legion games: the server, Bloxity login and avatars, the top games' character animation, the camera and lighting rig, the quality system, profiles, saves and play stats. It was forked from Escape Parkour Obby (Sky Breakout), the newest game in the folder closest in genre (a staged obby with a queued match, shared physics and an autopilot), with the newer fixes from +1 Lick Per Click pulled in.

## Project layout

| Folder | What it is |
|---|---|
| `client/` | Vite + Three.js client: `main.js` (boot and warm-up, your car on the shared physics, the chase camera, keyboard / touch / controller, other players' cars smoothed on the server's clock, the queue and the Police Chase with its cops, the network, the QA autopilot), `car.js` (the four car bodies, paint, your Bloxity avatar at the wheel, wheels that fold flat when the jets light, flames and smoke, the police cruisers), `world.js` (a course on screen: every part's look, the near stages batched into one draw, the far picture, rings and keys), `city.js` (the city far below: the street grid painted on one plane, blocks of towers streamed a district at a time into one batched draw), `surfaces.js` (one array of painted tiles, the one material the course and city are drawn with, everything that moves moved in the vertex shader), `kit.js` (rounded boxes, discs, tori, tubes), `hub.js` (the Garage Deck: stalls, the START arch, the Police Chase gate, the leaderboard), `motor.js` (engine, jets, wind and sirens: loops synthesised at load, only their rate and volume moving), `signs.js`, `asmr.js`, `smooth.js`, `icons.js`, `ui.js` + `index.html` (HUD and panels), `audio.js`, `fx.js`, `engine.js`, `geo.js`, `blobs.js`, `avatar.js`, `animator.js` |
| `server/` | Colyseus 0.18 server: the `jetcar` room (`GameRoom.js`: the stages, rings, keys, big air, the Getaway Tower, the queue and invitations, cars, upgrades, paint, crates, tasks, quests, rewards, codes), `match.js` (one Police Chase: phases, drivers, bots, the cops, the pay), `guard.js` (what moves are possible), profiles (MongoDB on Legion), leaderboards, play stats |
| `shared/` | `config.js` (levels, pay, cars, upgrades, paint, exhausts, crates, tasks, quests, rewards, codes, the cops), `course.js` (the courses: the 16 obstacles, the 100-stage run, the Police Chase maps; both sides build the same course from the same numbers), `physics.js` (driving and flying: your screen runs it for you, the server for the bots), `pilot.js` (drives a course: the bots, the QA autopilot and the headless tests all use it) |
| `tests/` | The test scripts (see Testing) and the setup-page generator |
| `covers/` | The two store covers (1920x1080, 800x800), rendered from the game |

## Run it locally

Needs Node 20 or newer. Double-click `start-local.bat`, or:

```sh
npm install          # installs client and server too
npm run build        # builds the client into client/dist
npm start            # server + game on http://localhost:3003
```

For development run `npm run dev:server` and `npm run dev:client`, then open http://localhost:5565 (the client talks to the server on port 3003; `VITE_SERVER_URL` overrides that). Dev builds (or a build with `VITE_QA=1`) expose `window.__qa` (the autopilot, perf readings, teleports). Restart the server after changing `shared/`. For testing only, `QA=1` lets the client give itself Coins, Gems, Keys and levels (`__qa.give`); it is refused on Legion.

## Gameplay

- **No start menu.** A new player lands on the Garage Deck, a rooftop car park high over Sunburst City; the daily reward offers itself, and a hint says how to drive. Coming back, you land on your last checkpoint.
- **Drive it, then FLY it.** Throttle, brake and steer on the road; hold **FLY** and the jets lift you (more than gravity) and push you on, while the gas lasts. The gauge fills again the moment you're back on the road. Off the lip of a ramp you keep its lift. **BOOST** is a nitro (it charges again in a few seconds); **FLIP** is a trick in the air. The wheels fold flat under the car as the jets light.
- **The long run.** 100 stages, about 24,000 studs of road over the city, climbing slowly into the sky. The bar at the top says which stage you're on and how far through it you are.
- **16 kinds of obstacle**, our own: ramps over gaps, gaps to a higher far side, long jumps through rings, walls with a window in each to fly up through, rooftop hops across the towers, concrete slaloms, trucks shuttling across the road (jet over them), narrow bridges with no walls, laser gates going on and off, a disc with a bar sweeping round it, speed pads into giant ramps, long fast roads down, roads that crumble away behind you, a slot between two towers to thread, icy bends, and the big one: a towering ramp and a drop far below (lots of air). A world's last stage is a **gauntlet** of three or four in a row.
- **Harder all the way**, by one formula (`stageD` in `shared/config.js`): longer gaps, narrower roads and windows, more of everything, quicker lasers. `tests/courses.mjs` proves the stock car on Normal can beat every stage.
- **Four worlds**, 25 stages each, each with its own sky, city and colours: **Sunburst City** (glass towers by day), **Mesa Motorway** (red rock and sandstone under a blazing sun), **Neon Nightway** (a midnight city of glowing windows and laser gates), **Glacier Pass** (snowy towers, icy roads, the aurora).
- **Checkpoints** are every stage's start: they pay Coins and XP (more the first time), and it's where you come back to. Fall to the city, or into a laser, and you're back on your last one. **Stuck?** A skip past the stage costs Gems you earned.
- **Rings** pay every time you fly through one (once a run each), **big air** pays for every second off the road when you land, and a **Key** floats high over every third stage's road: fly up for it.
- **Easy / Normal / Hard**: the jets burn slower or faster; the pay goes with it (0.8x, 1x, 1.5x; a stage pays at the easiest you've had it on since its checkpoint).
- **The Getaway Tower** at the end: claim a **Trophy**, Coins and Gems, then start again from the Garage Deck with every stage paying 25% more. A run without a skip gets a time and a rank from S to D.
- **Police Chase**: every few minutes a card comes up for everyone (`Starts in 0:30`, `Join`, `Dismiss`); **CHASE** (or Enter, or driving into the red ring on the deck) joins now or starts one. Everyone joining at about the same time goes into the same chase and the card shows how many have been found; someone joining while it's still getting ready takes a bot's place, and bots fill only the empty places and carry on for a player who leaves. 3-2-1-GO, and after a head start the police jet cruisers come along the course behind you, faster and faster, lights flashing, sirens louder as they close in. Whoever they reach is **BUSTED**. First to the Safehouse wins; whether you got away, how far you got and your place decide the pay. Four maps, one per world, by turns.
- **It grows with you**: seven chase tiers by level, from 4 stages and 2 cops at Level 1 to 12 stages and 6 cops at Level 30, harder obstacles, faster cops, bigger pay.
- **Spending**: 7 **cars** (each faster, with stronger jets and a bigger tank; the last one for Trophies), 4 **tune-ups** (Turbo Engine, Jet Thrusters, Fuel Tank, Nitro), 16 **paints** (solid, racing stripes, pursuit, hot-rod flames, rainbow), and **crates** of jet exhausts (16, Common to Mythic, each colouring your flames and smoke and adding to your Coins), opened with Coins or Keys. Bloxity's own avatar is your driver.
- **The rest of a session**: a chain of 29 **quests**; 3 **daily tasks**; a 7-day **daily reward**; **FREE gifts** at 2 / 5 / 9 / 14 / 20 / 30 / 45 minutes (the next one's countdown is always at the top); codes (`JETCAR`, `GETAWAY`, `NITRO`, `BLOXITY`, `LEGION`, `SIREN`); a **Teleport** to the start of any world you've reached; leaderboards for the furthest stage, chase wins and the fastest run.
- **Pacing** (`tests/economy.mjs`, a simulated first session; a simulation, not a person's session, and numbers move between runs): an upgrade in the first seconds, a new goal every minute or so (about 40 things in the first 30 minutes: buys, levels, quests, gifts, chases), the second car at about 11 minutes, a Police Chase every 4 minutes or so; after an hour Level 11, best stage about 55, 12 quests, 3 cars.
- **The server decides** rewards and progress: every move (a budget of how far you could have driven at your car's top speed with the nitro, how high a ramp and a full tank of jets could have lifted you above the last road you were on, whether there's road under you when you say you're on it), every checkpoint (only one you're on or just over, next in line or a couple ahead, once a run), every ring (the line between two moves crossing it), every key, every big air (timed by your own move stamps, paid only if you went somewhere), the Getaway Tower, the cops, the pay. Your own driving runs on your device. Everything that moves is a pure function of one clock, so the bots, your physics and what you see all agree with no messages at all.
- **Far from the servers** (300-400 ms round trip from Sri Lanka): the server's clock corrected for the round trip, others drawn a little in the past between snapshots stamped with server time (twenty a second, only to those who can see them), each one's delay following how late their own snapshots really arrive.
- **Phones, upright and sideways**: the HUD sizes itself by the screen's width when upright; the stage bar, the menu and your Coins sit clear of the Bloxity corner; the stick on the left, FLY, BOOST and FLIP on the right, clear of each other and the HUD; on a short landscape screen the menu packs three across and the gas gauge lies across over the speedometer; the camera widens and pulls back.

## Controls

| Action | Keyboard | Controller | Touch |
|---|---|---|---|
| Drive / brake | W / S or arrows | RT / LT | The stick, up / down |
| Steer | A D or arrows | Left stick | The stick, across |
| FLY (hold) | Space | A | FLY |
| Nitro | Shift | X | BOOST |
| Flip (in the air) | F | Y | FLIP |
| Look round | Drag, wheel to zoom | | Drag |
| Back to your checkpoint | R | B | |
| Police Chase | Enter, or the CHASE button | | The CHASE button |
| Quests / Garage / Teleport | Q / G / T | LB / RB | The buttons |

## Sound

- **The motor sounds**: your engine (its pitch follows your speed, a growl on the throttle), the jets' roar while you FLY, the wind at speed, and the police sirens getting louder as the cops close in. Each is one loop synthesised sample by sample while the game loads and played as one looping buffer; every frame only its rate and volume move, on the audio clock.
- **The little sounds** (landings, crashes, rings, keys, the nitro) are synthesised at load too; a sound in play is one buffer source and a gain.
- **Music**, all generated: an easy one on the Garage Deck, a driving one out on the road and in a chase. Each is rendered once into loops by an OfflineAudioContext and plays from memory; it is never played note by note.

## Graphics and performance

**The look.** Matte Lambert and unlit materials only: no reflections, no environment maps or PMREM, no bloom, no post-processing. The top games' light rig everywhere: hemisphere 1.1, ambient 0.45, sun 1.5, PCFShadowMap, NoToneMapping; a world only tints it. What makes it look expensive is geometry and colour: rounded road decks with their lane lines and red-and-white kerbs, painted window frames, glass and sandstone towers, a whole city of blocks far below with its streets, crossings and parks, glowing windows at night, and the cars' own lean, bob, wheel spin and folding wheels.

**How it stays fast.**

- **One draw for a whole stretch of course.** The near stages are slots of one BatchedMesh, built a little at a time with our own culling per stage, so it doesn't send its draw list again every frame. The rest of the course is one plain mesh a world; a world past the haze isn't drawn at all, and the stages drawn in detail are left out of the plain mesh in the vertex shader.
- **One draw for the city.** The towers are built a district (six blocks square) at a time as you come near, at most 1.2 to 2 ms a frame, into the slots of one BatchedMesh, each district culled on its own (frustum and haze). The streets are painted in the shader of one ground plane that follows you. Towers near the course are kept well below it.
- **What moves costs nothing per frame.** Trucks, sweeping bars, laser gates and crumbling roads are all moved in the vertex shader from one small table of numbers, on the same clock as the physics.
- **Cars.** A car's body is one draw (cached per car and paint); every wheel in the world is one instanced draw, every jet flame one, every police cruiser one, their lights two. Far cars lose their driver's animation (every other frame), name tag and smoke.
- **Weak devices.** Phones and weak PCs start on Low (4 cores or fewer, 4 GB or less, older Intel HD/UHD 6xx, small Radeons, software renderers): no shadow code at all, fewer parts, smaller tiles, fewer districts. Multisampling is decided before the WebGL context exists. Below about 54 FPS the resolution comes down first, then the quality.
- **The HUD** never reads layout or style in the frame loop, writes text only when a value changes and moves its bars with transforms.
- **No hitches.** Every shader (batched, instanced, shadow variants, the cars, the cops) and every HUD screen is warmed up behind the loading screen; the GPU's name is read once while loading; every emoji is drawn once before play.

**Measured** (`LOW_GPU=1 node tests/perf.mjs`, 2026-11-06) on this PC's integrated Intel UHD Graphics. The weak laptop and the phones are simulated: Chrome's CPU throttle at 4x and the screen size, on the same chip, not real devices. FPS is what the game drew; on a screen over 100 Hz a touch device draws every other refresh, so 67 to 77 there means it's keeping up. Work is the game's own time per frame on the main thread.

| Device | Where | FPS | Frame p95 | Work per frame | Draw calls | Triangles |
|---|---|---|---|---|---|---|
| Desktop 1600x900, Medium | Garage Deck | 144 | 7 ms | 0.87 ms | 28 | 121k |
|  | Driving | 144 | 7 ms | 1.11 ms | 22 | 100k |
|  | Police Chase, 6 cars + cops | 143 | 7.1 ms | 1.23 ms | 32 | 46k |
|  | Neon Nightway (Stage 63) | 144 | 7.1 ms | 0.89 ms | 17 | 77k |
| Weak laptop 1366x768, Low, CPU 4x | Garage Deck | 128 | 13.9 ms | 4.05 ms | 20 | 45k |
|  | Driving | 102 | 14 ms | 4.69 ms | 17 | 39k |
|  | Police Chase, 6 cars + cops | 111 | 13.9 ms | 5.59 ms | 16 | 27k |
|  | Neon Nightway (Stage 63) | 97 | 20.8 ms | 4.82 ms | 18 | 42k |
| Phone 844x390 @2x, Low, CPU 4x | Garage Deck | 77 | 13.9 ms | 7.06 ms | 20 | 45k |
|  | Driving | 68 | 7.1 ms | 5.3 ms | 17 | 39k |
|  | Police Chase, 6 cars + cops | 69 | 7.2 ms | 6.54 ms | 17 | 26k |
|  | Neon Nightway (Stage 63) | 70 | 7.1 ms | 5.18 ms | 17 | 40k |
| Phone 390x844 @2x, Low, CPU 4x | Garage Deck | 68 | 7.1 ms | 6.04 ms | 17 | 40k |
|  | Driving | 67 | 13.9 ms | 6.71 ms | 17 | 37k |
|  | Police Chase, 6 cars + cops | 69 | 7.1 ms | 7.18 ms | 16 | 21k |
|  | Neon Nightway (Stage 63) | 70 | 7.1 ms | 4.81 ms | 16 | 35k |

Load and join took 4.1 s on the desktop, 6.5 to 8.1 s at CPU 4x, with the page served by the test server. The numbers depend on what else the PC is doing (this one is shared with other work).

**Known pauses:** inside those stretches no frame took over 50 ms, except 2 on the weak laptop late in the run (worst 62 ms). Warping into a Police Chase or to another world costs one long frame at CPU 4x (300 to 440 ms, about 75 ms of it the game's own work) while the new course and the nearest city blocks are built. It happens as the chase card comes up or behind the teleport, not while you are driving. Nothing here has run on a real phone yet.

## Testing

Test tools install on their own: `npm --prefix tests install`. Browser runs need Chrome (`CHROME=<path>` chooses which) and run on a build with the QA hooks served by the test server (`DEV=1` uses the Vite dev server instead).

- **`tests/server.test.mjs`, a headless server test** (87 checks): a new player's start, ping and the clock, no bots outside a chase; the guards (too far, too high for a whole tank of jets, a speed hack, driving on thin air, over the line before GO); the run over the network from the shared physics (stages paying, not twice, a checkpoint far ahead, rings once a run, big air paid and faked big air not, a key once, Easy / Normal / Hard, a skip, the warps, a locked world, the Getaway Tower); the shops (upgrades, cars, a car above your level, paint for Coins and Trophies, crates for Coins and Keys, a crate above your level, an exhaust); codes once, the daily reward once a day, gifts on time, quests and tasks once; the queue (showing who's found, the same chase for everyone, bots filling the empty places, joining before it really starts); a bot taking over for a player who leaves; a whole Police Chase (one driving it for real, one standing still: who escapes, who's busted, who gets what); the save on rejoining.
- **`tests/courses.mjs`, every course can be beaten**: the pilot drives the long run and all 28 Police Chase maps (4 maps x 7 tiers) on the shared physics, headless, with the stock car on Normal, at full speed and at the slowest bot's speed, at 60 steps a second and the server's 20 (`HZ=20`). On a chase map the full-speed pilot (in a car upgraded about as far as a player at that tier) also has to stay ahead of the cops all the way.
- **`tests/economy.mjs`, a simulated first session**, for the pacing above.
- **`tests/autopilot.mjs`, browser runs with the autopilot**: the controls (W drives, FLY lifts and burns gas, D steers right); the first 14 stages of the run and of every world with the checkpoints paying and the server agreeing; a full Police Chase on every map, at a different tier each; no snaps, no console errors. `node tests/autopilot.mjs full` drives all 100 stages to the Getaway Tower and claims the Trophy.
- **`tests/latency.mjs`, a 350 ms round trip** through a relay, two real browser players pressing CHASE together: the round trip measured, the queue showing both, the same chase, seeing each other, the other player and a bot each smooth from far away, no snaps.
- **`tests/prod.mjs`, the production build with real input only** (no QA hooks; keyboard, mouse, touch; the game's words on screen as the only way to know what happened): the daily reward, holding W out through START with the jets held across the gaps to Stage 2 and on, the speedometer, the clock, the bar, every menu button, a typed code, a tune-up bought, the mode button, CHASE, the queue, the card, GO, BUSTED, the results, back to your run; `loadingEnd()` called once, after joining a server (with a stand-in for the SDK); then an upright and a sideways phone by touch: both thumbs at once (the stick held up, FLY with the other), CHASE, the queue, the chase.
- **`tests/screens.mjs`, screenshots of every screen** (the HUD, driving, stopped, the deck, every panel, a crate opening, the queue, the card, the countdown, the chase, the results) at 390x844, 360x800, 375x667, 844x390 and 1280x720, with the HUD's boxes and touch controls measured for overlaps, anything cut off and the Bloxity corner.
- **`tests/textfit.mjs`, every word on every screen** at 11 sizes; **`tests/perf.mjs`, frame rates** (`LOW_GPU=1` for the integrated chip; `profile` for a CPU profile of the unminified build; `watch` for the automatic drop in resolution and quality); **`tests/gallery.mjs`** (a picture of every stage), **`tests/covers.mjs`** (the two store covers), **`tests/look.mjs`** and **`tests/carshot.mjs`** (pictures to judge the look and the cars by).

**Last results** (2026-11-06, this PC):

- `server.test.mjs`: 87 of 87 passed.
- `courses.mjs`: the long run (100 stages) beaten at full speed and at the slowest bot's speed (x0.86), about 11.4 minutes of driving for the bot (12.1 at x0.86), 13 to 14 crashes; all 28 Police Chase maps beaten at both speeds, and at full speed ahead of the cops all the way. At the server's 20 steps a second (the rate bots drive at) every course is still finished, but on 3 of the 28 chase maps the bot crashes 2 or 3 times and the cops catch it: bots get busted now and then.
- `economy.mjs`: the first Police Chase at 5 min, the second car at 11 min; at 30 min Stage 34, Level 7, 2 cars, 13 quests; at 60 min Stage 55, Level 11, 14 chases (9 escapes), 3 cars, 11 upgrades, 13 crates, 78 things happened.
- `autopilot.mjs`: all good. W 15.2 studs in a second, FLY up 15.7 studs with the gas down to 79, D steers; the biggest stage 1784 of 12000 vertices; Stage 14 in 71 s with 3 crashes, the server agreeing; through stages 30, 55 and 80 in the other worlds; a Police Chase on every map got away (19, 39, 59 and 67 s); no snaps, no console errors.
- `latency.mjs` (353 ms round trip measured): the queue showed "1 / 6" then "2 / 6 drivers found", both in the same chase and seeing each other; the other player smooth from far away (largest step a frame 0.52 studs at 36.5 studs/s, drawn 494 ms in the past), a bot smooth too (1.69 studs on a 28 ms frame at 43.5 studs/s); 0 snaps, no console errors.
- `prod.mjs`: all good on the production build: load and join in 4.0 s, `loadingEnd()` once after joining, every menu button, a code, a tune-up, the mode, a whole Police Chase by keyboard; then an upright and a sideways phone by touch, both thumbs at once, out to Stage 3 and 4 at 112 km/h and into a chase; no console errors.
- `screens.mjs`: every screen clean at all five sizes (nothing overlapping, nothing cut off, the Bloxity corner free).
- `textfit.mjs`: every word fits at all 11 sizes (phones upright and sideways, a 768x1024 tablet, 1024x768 to 1920x1080), with the longest texts and biggest numbers the game can show.

## Hosting

See `bloxity-setup.html` (every field of Bloxity's Create New Game form, with copy buttons, and the two covers; `node tests/setup-page.mjs` writes it) and `.github/workflows/deploy.yml` (deploys to Legion on a push to `main`; prod at https://jetcar-getaway.play.bloxity.io once hosted). Play stats: `GET /api/stats?key=<stats key>&days=7` (the key is in `server/STATS_KEY.local.txt`, not in the repo): session length, time to the first chase, chases, wins, stages, levels gained, rings, big airs, frame rate by device, errors.
