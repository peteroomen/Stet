# STET

**A 5×5 swipe-crawl. Every stroke stands.**

A turn-based micro-roguelite played entirely on a five-by-five grid, by swipe or
arrow keys. Ink on paper. No undo — the name is the proofreader's mark meaning
*let it stand*.

```
npm install
npm run dev      # play at localhost:5173
npm test         # rules + balance simulation
npm run build    # typecheck + production build
```

---

## The three rules

Everything else is detail.

**You commit.** Stepping into a foe *strikes* it — and you do not advance. You
are mid-swing. For the enemy phase that immediately follows you are `EXPOSED`,
and everything that hits you does **double**. Strike again and the combo builds
(+1 damage a stroke, capped at +3) but you stay exposed the whole time. Step
away and you are safe, but the ladder resets and they close in.

**A stroke is also a block.** A blow that lands *breaks* what that foe had
committed to — strike the one about to hit you and it simply never lands. But a
broken stance **braces**: it cannot be broken again until you leave it alone for
a turn, and a heavy shrugs off anything lighter than its poise. So a big enemy is
a rhythm — strike, step away, strike — never a lock.

**They commit too.** Every foe shows a ghost of exactly where it will be. That
telegraph is computed at the end of the previous turn and executed *unchanged* —
it is a promise, not a prediction. So a charger's two-tile lunge can be baited
into empty paper by stepping out of the line, and it will sail past you. A dashed
arrow can be broken; a solid one is coming whatever you do.

Together they make the board readable exactly one turn ahead, which is the whole
game: not "what will happen", but "what am I willing to pay for this".

## The floor

Clear every foe to break the wax seal on the stairs. The stairs are visible from
the moment you arrive so you can plan the floor around them.

**But the page fills.** Every foe moves at exactly your speed, so on an open
board you could weave away forever — and a game about commitment cannot have
patience as its optimal strategy. After a floor's grace runs out, ink wells up
and something climbs out of it, on a cadence. Killing outpaces spilling
comfortably. Aggression clears a floor; timidity drowns in one.

## The hands

| | | HP | Damage | Poise | Rule |
|---|---|---|---|---|---|
| `⋀` | **Rat** | 1 | 1 | 1 | One step toward you, every turn. Folds to a single stroke. |
| `◇` | **Stalker** | 2 | 1 | 1 | Closes on the diagonal, but must step square-on to strike. |
| `»` | **Charger** | 3 | 2 | 2 | Winds up, then lunges two tiles. Sidestep it, or break the coil. |
| `▥` | **Warden** | 5 | 3 | 3 | Shrugs off a light stroke. Only a heavy blow stops it. |

**Poise** is the damage a single stroke must carry to break that thing's stance.
Chaff folds to anything; interrupting a WARDEN costs a combo you can only build
by standing there and trading, which is why a heavy is frightening rather than
merely slow. Interrupting a CHARGER mid-coil also costs it the whole wind-up.

The stalker's asymmetry is deliberate: a diagonal-only *attacker* would be
unhittable, since you strike orthogonally. Forcing it to step square-on gives
you exactly one clearly telegraphed turn to hit it first.

Ink blots are cover, chokepoints, and something for a charger to crash into.
Vials restore health; a **nib** permanently raises your damage.

---

## How it is built

```
src/
  game/       the rules — pure, headless, zero DOM
    engine.ts     step(state, dir) → { state, events }, mutating nothing
    enemies.ts    per-kind movement rules and telegraph planning
    floors.ts     floor generation + the connectivity guarantee
    runtime.ts    binds engine → renderer → audio, owns the loop
  render/     canvas: brush and nib strokes, illumination, particles, themes
  audio/      every sound synthesized at runtime — no assets, no network
  input/      swipe (with drag-chaining) + arrows + WASD + vi keys
  ui/         React chrome — HUD, title, death. Never re-renders per frame.
```

**The engine is pure.** `step(state, dir)` returns a new state plus an ordered
event list and mutates nothing. The renderer and the audio layer both schedule
off that single event list, so what you see and what you hear cannot drift out
of step with what actually happened — and the whole game is testable headless.

**React never re-renders at frame rate.** The runtime owns the `requestAnimationFrame`
loop and pushes HUD data at most once per turn.

**The ink is deterministic.** Wobble is hashed from a stable per-entity seed, not
randomised per frame — random jitter reads as the board vibrating rather than as
something drawn by hand. Live actors add a 9fps animation *boil* on top; the
cached paper layer does not, because a shimmering grid reads as a fault.

## The look

An **illuminated page** with **brush-drawn characters**.

The page is gilded: a two-tone band, a vine of leaves growing off it, a scrolled
volute in each corner, and the depth set as a rubricated roman numeral in the
margin. All of it lives *outside* the play area — decoration that competes with
the board for attention is decoration that makes the game worse, and this board
has to stay readable a turn ahead.

The actors are drawn with a loaded brush rather than a nib. `brushStroke()`
builds a tapered polygon along a wobbled path whose half-width swells at the
belly and dries to a point, which a stroked polyline cannot do at any width. A
brush mark is wider than the same stroke from a nib, so anything with close
parallel detail merges — the WARDEN carries a redrawn `brushPaths` silhouette
for exactly that reason.

The variation lives in **pressure**, not in texture. The first version varied
width with a flat taper plus per-vertex jitter, which is a uniform ribbon with a
fuzzy edge — the same weight everywhere, wobbling. A real brush varies over the
*length* of the stroke, so the swell is now two low-frequency harmonics with a
per-stroke phase, and the high-frequency jitter is nearly gone. Weight came down
with it (1.85x a nib to 1.48x) and dry-brush breakup went 0.85 to 0.32: at the
old settings the marks were more ink than paper and the silhouettes stopped being
distinguishable at a glance, which is the one thing they have to do.

`node scripts/brush-shots.mjs` renders every glyph across a grid of settings with
the nib version on top, which is how those numbers were chosen. Picking them on a
live board does not work — the marks are small, half of them are moving, and a
silhouette that has stopped reading as itself is exactly what a busy screen
hides.

Landing a stroke throws a **flourish**: a swash cut through the target tile, ink
when the blow broke the stance and blood when it merely landed, so the most
important fact about a hit is legible from its colour alone. A kill gets a bigger
curl. Flourishes paint themselves on over their first third rather than
appearing whole — a mark that materialises is a shape; a mark that draws itself
is a brush.

Two things that cost real time to get right:

- Dry-brush texture is done by **skipping** spans of the body, not by erasing
  them. The obvious implementation — fill the shape, then scrub voids with
  `globalCompositeOperation = 'destination-out'` — works only on a canvas holding
  nothing else. On the shared board canvas it punched holes through the paper,
  the grid and every actor underneath. Removing it also took p95 frame time from
  32 ms to 25 ms.
- Everything in the glyph cache key must be **discrete**. The hero's animated
  squash and the telegraph's pulsing alpha were continuous values baked into the
  key, so every frame minted a fresh bitmap and blew the cache limit. Both are
  applied to the blit instead. Measured `renderer.draw()` on a busy depth-9 board
  at 3x DPR: nib 0.20 ms, brush uncached 0.40 ms, brush cached 0.30 ms.

## Balance is measured, not asserted

`src/game/balance.test.ts` plays hundreds of full runs with bots of increasing
lookahead. Because enemies commit to their telegraphs, the enemy phase is fully
determined — so N-ply search is *exact*, not heuristic, and its results are
genuinely available to a human reading the same board. The spread between bots
is therefore a real measurement of the skill ceiling:

| Bot | Median depth | Deepest |
|---|---|---|
| Mindless — walks at the nearest foe and bumps it | **3** | 5 |
| Reacting — one ply, sees only its own next move | **4** | 14 |
| Thinking — three plies, plans two moves ahead | **18** | 33 |

Thinking ahead is worth roughly four times the depth of bumping into things.
That gap is the design working.

The same harness diagnosed, and then verified the fix for, the game's worst
balance flaw. Before stagger existed, **depths 2 and 3 were the hardest floors in
the game** — harder than depth 8:

| | d1 | d2 | d3 | d4 | d5 | d8 |
|---|---|---|---|---|---|---|
| damage per floor, before | 0.90 | **2.71** | **2.72** | 1.35 | 1.07 | 1.18 |
| damage per floor, after | 0.90 | 1.65 | 1.34 | 1.16 | 0.96 | 1.74 |
| floors cleared clean, before | 33% | **13%** | **13%** | 43% | 48% | 44% |
| floors cleared clean, after | 33% | 25% | 33% | 40% | 53% | 32% |

The cause was structural: attacking could only ever *cost* you safety, so there
was no move that both progressed a floor and prevented a blow. A bot told to
avoid damage at almost any cost could clear 84% of floors without a scratch — and
reached a median depth of **3**, because refusing to trade meant never
progressing. The same bot now reaches **26**, deeper than the greedy one. Playing
well and playing safely stopped being opposites.

### Modelling a rule change before shipping it

`src/game/rules.ts` holds the game's numbers and a few optional mechanics in a
`Rules` object carried on the state, so a whole design direction can be played by
the bots without forking the engine. `npm run model` plays every variant on the
same seeds with the same bots and prints the comparison.

The number that matters is **reacting** — one ply, sees the consequence of its
own move and plans nothing further. That is the honest model of someone reading
the board in real time on a phone, and it is roughly how far the game feels
playable. `thinking` (three plies) is the ceiling. A good change raises the floor
faster than the ceiling; one that flattens the gap has removed the skill.

| variant | mindless | reacting | human\* | 2-ply | thinking | ceiling/floor |
|---|---|---|---|---|---|---|
| shipped | 3 | **4** | 3 | 7 | 18 | 4.5x |
| exposure removed (diagnostic) | 4 | 4 | 4 | 9 | 20 | 5.0x |
| A tuned — flatter ramp, +1 heart | 4 | 5 | 4 | 10 | 20 | 4.0x |
| B momentum — a kill frees an action | 4 | **1** | 2 | 16 | 31 | 31x |
| C flow — dodge charges the next strike | 3 | **6** | 4 | 12 | 23 | **3.8x** |
| D rally — a kill wins back lost health | 4 | 5 | 4 | 12 | 21 | 4.2x |
| F press — the spill accelerates | 3 | 2 | 2 | 4 | 9 | 4.5x |

\* `human` is 1-ply with a 12% misplay rate.

Four things that were not obvious until they were measured:

- **Exposure is not what is killing you.** Deleting the doubling outright — the
  scariest rule in the game — buys a reactive player *nothing* (4 → 4). What
  kills you is having no move that both progresses the floor and prevents a blow.
- **Momentum is a trap.** Letting a kill free an action reads as the obvious
  arcade lever, and a 3-ply bot loved it (18 → 31). A reactive one went to depth
  **1**: the free action's best use is *escape*, so aggression turns into
  sustainable kiting, and killing spilled rats became a renewable supply of free
  actions. It killed 72 things per run against 35 shipped, took *less* damage,
  and never left floor one.
- **Flow is the one that works.** Reacting 4 → 6, 2-ply 7 → 12, and the
  ceiling/floor ratio *tightens* to 3.8x — the floor rose faster than the top.
  Damage falls on every floor (d2 2.22 → 1.52) and clean clears rise on every
  floor (d2 23% → 30%).
- **Pace is a separate problem with no good answer yet.** A floor costs a
  reactive player **32–58 swipes**, which is attrition, not arcade. Accelerating
  the spill fixes the pace outright (32 → 15 inputs per floor) and is *still*
  wrong at every ramp tried (8/12/18/26): floors got faster **and** cleaner and
  median depth fell anyway, because you now die to the clock. It also stalls —
  the board caps at seven bodies, `spillSite` returns null, and the clock quietly
  stops. Pace needs a lever that is not the spill.

### The mechanics the harness produced

Two mechanics exist *because* of that harness, not because they seemed like good
ideas:

- **The spill.** A bot that read telegraphs and refused to engage kited three
  rats for 4000 turns on floor one and never died — 56% of runs never ended.
  Patience beat commitment, which is the opposite of the game. Hence the page
  filling.
- **Blot connectivity.** Two blots in an L can seal a corner. An enemy spawned
  inside it can never be reached, so the floor never clears, the stairs never
  unseal, and the run soft-locks with nothing on screen to explain why. Blots
  are now only kept if the board stays walkable end to end.

Starting health was swept the same way (6 / 7 / 8 → median depth 9 / 10 / 17
against the strongest bot) and set to **7**.

## Controls

Swipe, arrows, `WASD`, or `hjkl`. `Enter` to begin, `R` to go again. Fully
keyboard operable.

**One flick is one step. A held drag traces a path.** Those are different
gestures and only time can tell them apart — a flick and the first half of a
deliberate drag cover exactly the same pixels. The threshold is 22 px, a quarter
of a tile on a 390 px phone, so before there was a time gate an ordinary swipe
crossed it three or four times and asked for three or four turns.

`node scripts/swipe-check.mjs` dispatches pointer events at real speeds and
counts turns spent per gesture. Before / after:

| gesture | steps fired | turns spent |
|---|---|---|
| fast flick (110 px, 143 ms) | 4 → **1** | 2 → **1** |
| normal swipe (130 px, 250 ms) | 5 → **1** | 2 → **1** |
| held drag (260 px, ~1 s) | 10 → 6 | 2 → **4** |

It was wrong in both directions at once, and for the same reason: the runtime
buffers exactly one direction, so a gesture that fired ten silently became two.
Flicks over-fired and drags under-chained, and every gesture landed on the same
number.

Two turns per swipe is not a small feel problem on this board. The enemy phase
runs twice against a board you read once — and if the first step was a strike,
the second resolves while you are `EXPOSED` and everything hits at double. No bot
in `bots.ts` could ever have caught this: they submit exactly one direction per
turn, so the rules looked perfectly fair while the game ate your health.

## Debugging

`window.__stet` exposes the live runtime. `__stet.jumpTo(9)` rebuilds the run at
depth 9 (a warden takes seven floors to reach honestly, which is far too slow a
loop for tuning how one looks and sounds); `__stet.kill()` ends the run.

`node scripts/shots.mjs` drives the built game in a real browser and captures the
states worth looking at, failing on any console error.

## Not yet

Sound is synthesized but there is no music. There is no meta-progression, no
seed sharing, and no bestiary in-game (the per-enemy `tell` strings in
`enemies.ts` are written and waiting for one). Duplicate enemy kinds beyond the
four are the obvious next axis, along with a floor modifier or two.
