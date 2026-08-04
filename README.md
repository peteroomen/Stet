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

**You may hold.** Twice a floor, you can spend a turn standing still. It is
rationed because it has to be — see below — and it exists because the board can
genuinely box you in.

**They commit too.** Every foe shows a ghost of exactly where it will be. That
telegraph is computed at the end of the previous turn and executed *unchanged* —
it is a promise, not a prediction. So a charger's two-tile lunge can be baited
into empty paper by stepping out of the line, and it will sail past you. A dashed
arrow can be broken; a solid one is coming whatever you do.

Together they make the board readable exactly one turn ahead, which is the whole
game: not "what will happen", but "what am I willing to pay for this".

## The hold, and why it is rationed

Enemies commit to *tiles*. That means they can surround your tile without
covering it — every direction steps into a committed blow while the square you
are on is safe, and with only four moves available you are forced to walk into
one of them.

`npx vite-node scripts/forced.ts` measures how often that happens over 19,666
turns of bot play:

```
No direction avoids damage          545  (2.8% of turns)
  ...of those, holding is cheaper   58.9%
  ...of those, holding is FREE      56.0%
Every option ends the run           0.6%
```

About one moment per floor where the move set has no answer, and in more than
half of them standing still costs nothing while all four moves cost health.

But an *unlimited* hold is the strategy the spill was built to kill, handed a
first-class verb. Measured, it is unambiguous — and pricing it on the floor clock
does not save it either:

| | reacting | thinking | stalled runs |
|---|---|---|---|
| shipped | **4.2** | 18.0 | 0 |
| unlimited hold | **3.5** | 24.7 | **8** |
| hold, costs 2 floor-turns | 3.6 | 26.0 | 5 |
| hold, costs 3 floor-turns | 3.9 | 24.2 | 9 |
| **two holds a floor** | **3.9** | **17.8** | **0** |

Unlimited holding pulls a reactive player *down* and pushes a 3-ply one *up* —
patience beating commitment, which is the one thing this design cannot allow —
and stalls 8 runs of 150 against the turn cap outright. Rationed to two a floor
it lands inside the noise of shipped on both ends and stalls nothing. So it costs
nothing measurable and buys the fix for a real hole.

**Tap the page to hold.** Space and `.` also work. A tap is short and
deliberate by definition — a press over 260 ms is treated as a swipe that
thought better of itself, so a hesitant gesture cannot silently spend one of two
rationed holds. The hint that teaches it shows until the first time you use it
and never again.

## The price, stated in advance

That readability was a claim the board did not honour, for two structural
reasons rather than cosmetic ones.

**Telegraphs are coloured against the tile you are standing on.** So for the
three directions where you would *move*, the board was answering a different
question than the one being asked — a grey path can run straight through the
tile you are about to step into, and nothing said so.

**A stroke's outcome needed arithmetic over three numbers, one of which was
never shown.** `poiseBreak` — the damage a blow must carry to stop a given kind —
appeared only in `enemies.ts` and in the table above. Nothing in the game could
tell you a WARDEN shrugs off anything under 3.

So each of the four directions now carries its price. `previewMoves` in
`preview.ts` plays every direction on a throwaway copy of the state and reads off
what happened. These are not estimates: `step()` is pure, and because enemies
commit to their intents the phase that follows your move is **fully determined**.

- A blood numeral inside your own tile, against the edge you would leave by: the
  health that move costs. Ringed when it ends the run. Nothing at all when a
  direction is free.
- Blood pips on a foe's health row: what your next stroke takes off it. Every
  filled pip in blood means it dies.
- A telegraph is dashed when you can break it and **solid when you cannot**. That
  used to read the enemy's stance alone, so a WARDEN you could not dent still
  advertised itself as interruptible.

Worked example, from `npm run shots:strike`: a WARDEN committed to your tile, a
RAT beside you, a CHARGER lunging across the row below. Swiping into the rat
*kills it* — and costs **6 of your 7 health**, because you do not advance, you
are mid-swing, and the warden's blow doubles. There was previously no way to know
that before paying for it.

**Does this give the game away?** It hands you exactly what the `reacting` bot
has — one ply, the consequence of its own move, nothing further — and that bot
reaches median depth 4 against `thinking`'s 18. The entire remaining gap is
multi-turn planning, which a preview does not provide. It raises the floor
without touching the ceiling.

It is also the one change here the harness **cannot** measure, and that is worth
saying plainly rather than dressing up: bots already compute all of this
internally. What changed is the gap between what a bot knows and what a human can
see, and `npm run model` is blind to exactly that.

## The margin

On every descent past the first you are shown three **marginalia** and take one,
for the rest of the run. `❧` in the corner counts what you have written; tap it
to read any of them again.

**Three of them are rare**, drawn gilded, and offered on about one ordinary hand
in four: THE LONG NIB, THE BROAD NIB and MOMENTUM — the cards that change what a
stroke *is* rather than how much it carries. A pool where everything is equally
likely has no shape to it; nothing is a find, and a good run differs from a bad
one only in arithmetic.

Scarcity on its own would just be a tax, so it comes with a promise: **the hand
dealt as you arrive on a boss floor always contains one.** The spike lands where
the game asks the most, and a boss is never lost to a run that simply never saw a
rare. Raw damage is deliberately *not* rare — a run has to be able to find a way
to hurt things, or a boss stops being hard and starts being unwinnable.

A trait is a `Rules` delta and nothing more, which buys two things for free.
The **preview stays honest** — `previewMoves` plays each direction through the
real `step()`, so a card that raises your damage immediately changes a foe's
health pips and one that changes exposure changes the cost numerals. Traits
teach themselves. And the **harness can play them**, so every card and every
combination is measurable before it ships.

**Healing is a card, not an item.** The vial is gone from the board. MEND takes
a slot on any descent you are hurt — so every heal costs the permanent upgrade
you would otherwise have taken, and the choice becomes the run's own difficulty
regulator: a player taking damage spends their picks staying alive and does not
compound, while one clearing floors cleanly powers up.

### Paying for it

Eight to ten permanent upgrades is a great deal of power, and the harness says
so: the layer alone takes a reactive player from 3.9 to **6.2** and a 3-ply one
from 17.8 to **26.6**.

Steepening the threat ramp cannot pay for it. `threatBudget` caps at 20 and the
board holds seven bodies, so difficulty **saturates** — slope 1.45 → 2.10 claws
back only 6.2 → 5.4. Depth stops buying enemies long before it stops needing to.

The spill is the one knob that scales without limit, so power is coupled
straight to it: **every four marks, the page fills a turn sooner.**

| | reacting | thinking |
|---|---|---|
| shipped | 3.9 | 17.8 |
| marginalia, unpaid | 6.2 | 26.6 |
| ...tightening every 2 | 5.1 | 12.2 |
| ...every 3 | 5.4 | 15.1 |
| **...every 4** | 5.6 | **17.8** |

That puts the ceiling back on its number exactly. The floor stays raised, which
is the layer working rather than a failure to pay for it — a build makes a
reactive player more consistent without taking the top of the game any higher.

### And the margin fills

There has to be a cap, for the same structural reason. Content plateaus and an
uncapped card every floor does not, so a strong build eventually out-scales
everything the generator can build. Measured: with no cap, **7 runs in 60 stopped
dying altogether** — still descending at twelve thousand turns, 12–21 inputs a
floor at depth 20+, faster than they had cleared depth 8.

| marks | never died | median depth |
|---|---|---|
| no cap | 7/60 | 18 |
| 8 | 4/60 | 19 |
| **6** | **0/60** | 20 |
| 4 | 1/60 | 20 |

Six: the loosest cap under which every run still ends, which is the harness's
oldest invariant and the one the spill exists to protect. The cost is a flatter
back half — the margin fills around depth 7 and the floors after it are the
build being played out rather than assembled.

## Eras

The rules never change. The **medium** does. STET is a proofreader's mark, so the
descent is the history of how writing gets corrected — hand-scribed, then typed,
then rendered. Handmade warmth to mechanical precision to cold light, and each
era strips something away: era I has variable pressure, era II has none but keeps
physical misregistration, era III has neither.

| | I · The Manuscript | II · The Typewriter | III · The Terminal |
|---|---|---|---|
| Depths | 1–4 | 5–8 | 9–12 |
| Surface | cream vellum, gilded | foolscap, blue rule, steel margin | black, phosphor glow |
| Mark | loaded brush | struck typebar | raster glyph |
| Ink | iron gall + gold | bichrome ribbon, black / red | green or amber |
| Native kinds | — | TYPEBAR, CARRIAGE | — |
| Boss | THE DROLLERY | THE CARRIAGE RETURN | — |
| Threatens | tiles | **lines** | — |

**I and II are built.** III still needs a mark-making system of its own — that is
the bulk of that work, and it wants a render grid rather than a live board, the
same way the brush numbers were chosen (`npm run shots:type`). Past depth 8 the
descent repeats the typewriter; the threat budget and the marginalia still
escalate, so a deep run is harder without pretending to be somewhere new.

An era owns three things, and adding one is now a data change plus a mark mode:

- **`hand`** — which instrument every mark on the page is made with. The
  *silhouettes do not change between them*: a RAT is a RAT brushed or struck, so
  what you learned in the first four floors keeps paying, and only the instrument
  differs. That is the whole payoff of the system.
- **`palette`** — a **delta** over whichever of day/night is lit, so an era states
  only what its medium changes and both lightings keep working. This is where
  paper colour lives: cream vellum, cool foolscap, and whatever comes next.
- **`roster`** — what the floors can roll, and its boss.

The typed mark is `strikeStroke()`, and it is a sibling of `brushStroke()` rather
than a setting on it, because what makes type read as type is the *absence* of
everything the brush is made of. No taper, no pressure harmonics, no dry-brush
tail: one width, butt caps, mitred joins. What carries the impression instead is
**misregistration** — the whole glyph, not each stroke, landing a hair off its
place and off square, because a typed character is one strike of one bar — and
**ribbon fade**, uneven inking walked at a fixed *spatial* step so a worn patch is
a length of ribbon rather than a vertex of the letterform.

Both of those were tuned on the render grid and both were wrong first time. The
mottle stepped at the stroke width, which made every glyph a checkerboard and
merged the WARDEN's bars into a block; and it dropped to a quarter alpha, which
broke the marks into dashes. A worn ribbon *under-inks*, it does not punch holes.

The margin is era-owned too, and recolouring is not enough: a gilt vine in grey
is not a typed page, it is a manuscript with the lights off. The gilding's
elegance was never the foliage, it was a **bright rule over a shadowed one** —
which is what reads as metal — so era II keeps exactly that in steel and adds one
mark, the red margin stop. A first version added tab ticks across the head and
was correctly called crowded. Blots follow the same principle: a scribe spills
ink, a typist strikes a passage out, so era II blocks a tile with `xxxx`.

**This is structure, not decoration.** Every enemy kind used to unlock by depth
7, which meant depths 8 and beyond were the same game forever — exactly why the
threat budget saturating hurt so much when the marginalia arrived. Eras escalate
by *quality*, which is the axis a 5×5 board has room for.

### The boss

An era is four floors: three and a boss. **THE DROLLERY** — the grotesque a
scribe drew in the margin — waits on depth 4. HP 8, poise 3, and on the turn it
winds it draws another creature out of the margin instead of resting. So the
fight is a race you can read: every wind-up you fail to punish is one more body.

Poise 3 means a bare stroke will not stop it. Depth 4 is the first floor where
the marginalia are load-bearing rather than pleasant.

A boss floor is a **duel** — one thing, no cover, no items, and the page does not
fill while the boss lives. Surviving one widens the next hand to four cards.

Two rules make the duel terminate, and both were measured rather than guessed:

- **Once the page is full the DROLLERY stops winding** and simply advances every
  turn. Its wind-up is a summon, not a rest, so with nothing left to draw it has
  no reason to pause. Without this, 22% of 1-ply runs never died — kiting a
  capped-out boss around an open board until the turn budget ran out.
- **Kill the DROLLERY and everything it drew fades with it.** They are its
  scribbles, not creatures. Without this a single leftover rat had no clock
  behind it at all: a 1-ply bot kited one around a cleared boss floor for four
  thousand turns in 9 runs of 40. It also makes ignoring the adds and bursting
  the boss down a real strategy rather than a losing one.

Measured after both: **every bot dies 100% of the time**, and depth 4 is now
where 23% of reactive runs end — the boss working as a gate.

**THE CARRIAGE RETURN** waits on page 8, and it needs none of that, because its
clock *is* its attack. It strikes everything except a **shelter**, and the
shelter is two things at once: a lane that travels down the page and back up,
one row every other turn, ringing the bell at each margin — and a stretch of that
lane measured out from the machine's own column, closing by one every five turns.

So the safe ground converges **on the boss**. Late in the fight the only place to
stand is within reach of it, which is where you wanted to be anyway. Shelter
reaches zero at turn twenty-five and the only unstruck square is the one the boss
is standing on, so the deadline is intact and the fight still terminates by
arithmetic.

The first version was the other way round — a band of struck rows that *grew*
until it covered the page — and it was played and reported back as *"only ok
since it's just a damage race"*, which was exactly right. Once the band covers
everything there is no dodge, so the only strategy left is to have out-damaged
it, and a fight with one strategy is a stat check. Stated as a shelter instead,
every turn has a dodge in it until the very last one:

| | band | shelter |
|---|---|---|
| 2-ply runs that get past it | 27% | **52%** |
| 3-ply runs that get past it | 66% | **89%** |

Skill now beats it. That was the whole point.

The shelter is derived from the floor clock, not from the boss, and that is
load-bearing: breaking its stance cancels the blow you were about to eat, but it
does **not** stop the paper closing. A boss whose clock you can pause by hitting
it is a boss you can stall forever — the exact failure the drollery's two extra
rules exist to patch.

## The floor

Clear every foe to break the wax seal on the stairs. The stairs are visible from
the moment you arrive so you can plan the floor around them.

**But the page fills.** Every foe moves at exactly your speed, so on an open
board you could weave away forever — and a game about commitment cannot have
patience as its optimal strategy. After a floor's grace runs out, ink wells up
and something climbs out of it, on a cadence. Killing outpaces spilling
comfortably. Aggression clears a floor; timidity drowns in one.

**And a page with no room left fills over you.** The board holds seven bodies,
so past that the ink has nowhere else to go: one point a spill, flat, undodgeable
and never doubled by exposure, because it is not a blow. This is what makes the
cap safe. Simply switching the spill off at seven was tried and is worse than
having no cap at all — a 1-ply bot found the equilibrium at once, pinned the
board at seven on depth 13 and wove there for 3,614 turns, which is the exact
stall the spill was built to prevent.

## The hands

| | | HP | Damage | Poise | Rule |
|---|---|---|---|---|---|
| `⋀` | **Rat** | 1 | 1 | 1 | One step toward you, every turn. Folds to a single stroke. |
| `◇` | **Stalker** | 2 | 1 | 1 | Closes on the diagonal, but must step square-on to strike. |
| `»` | **Charger** | 3 | 2 | 2 | Winds up, then lunges two tiles. Sidestep it, or break the coil. |
| `▥` | **Warden** | 5 | 3 | 3 | Shrugs off a light stroke. Only a heavy blow stops it. |
| `⊥` | **Typebar** | 2 | 1 | 1 | Never moves. Strikes the column you stand in, a turn later. |
| `▤` | **Carriage** | 3 | 2 | 2 | Steps toward you, then sweeps its whole row. |

The first four are era I and carry into every era after it. The last two are era
II's own, and they are the reason it is a different place: era I threatens
**tiles**, so every dodge in it is a sidestep. A machine threatens **lines**.

They are a matched pair on opposite axes and are answered by opposite steps —
the typebar by moving sideways, the carriage by moving up or down — so learning
one does not hand you the other. What tells them apart at a glance is whether the
threat comes to you or you have to be somewhere when it arrives: the typebar
reaches from wherever it stands and never moves, the carriage walks into your row
and can be broken on the way.

Both were rewritten by the harness. The typebar first struck the column *it* stood
in and measured 0.0–0.4 damage a floor while adding ~25 turns to one — nothing
forces you into a fixed column when there are four others, so everyone left and
nobody was hit. The carriage first chased by plain distance, which parked it in
your column as often as your row, and a row sweep from your column misses:
measured at less than half the typebar's damage for the same time on the board.
It aligns its row before it closes now, which is what a carriage does anyway.

**Poise** is the damage a single stroke must carry to break that thing's stance.
Chaff folds to anything; interrupting a WARDEN costs a combo you can only build
by standing there and trading, which is why a heavy is frightening rather than
merely slow. Interrupting a CHARGER mid-coil also costs it the whole wind-up.

The stalker's asymmetry is deliberate: a diagonal-only *attacker* would be
unhittable, since you strike orthogonally. Forcing it to step square-on gives
you exactly one clearly telegraphed turn to hit it first.

Ink blots are cover, chokepoints, and something for a charger to crash into.
**Gesso** is a layer laid over the page that takes blows before your health does
and can never be mended; vials restore health under rule variants that have them.

**Damage is not on the floor.** The NIB used to lie around waiting to be walked
over — three a run, +1 each, on top of a Whetstone that stacked. It was the only
thing in the game that compounded against a threat budget which saturates, and it
was reported from play exactly that way: *"nib is OP… I can get a bunch of nib and
play forever."* Damage now costs a mark of margin like everything else, so taking
it means giving something else up. What stays on the board is what does **not**
compound: a layer is spent once, and a heal is spent at once.

The margin holds six marks, and nothing in the pool stacks except the combo
ladder — so six marks have to be six ideas rather than the same one six times.

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

### Three pigments, three kinds of thing

Everything on the board used to be drawn in the same ink, so you and the things
trying to kill you were told apart by silhouette alone — which is real work on a
busy floor, and the wrong kind of work for a game that has to be readable a turn
ahead.

The hero is now **ultramarine**: ground lapis, the most expensive pigment on a
medieval page and reserved by convention for the principal figure. Foes stay in
plain ink. Pickups keep the gilding, warmer and with a wider halo. Blood-red
belongs to danger alone — every cost numeral, every committed blow — and gold to
treasure, so no colour on the page means two things.

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

### The bug that made striking unreadable

`motionAt` returned a finished motion's *destination*. For a step that is right.
For a **bump** the destination is the tile you swung at — a tile you never
occupied — so the moment the swing animation ended, about a third of the way
through the turn, the hero teleported onto the foe it had just hit and stood
there until the next input.

The rules said "you do not advance" and the picture showed you standing on top of
the thing you had just hit, for most of every turn you spent attacking. A bump
now rests where it started.

Four corner ticks mark your true tile *during* a swing, fading out entirely at
rest — the body is only ever away from its tile mid-stroke, so an anchor drawn
the rest of the time is furniture. The lunge itself came down from 0.46 of a tile
to 0.22–0.34.

### Less on the page

`EXPOSED` carried **four** indicators at once: a pulsing blood ring on the tile, a
strike through the rune, three dots beneath it, and a struck-out line in the
chrome. For one boolean. Every one asked the player to learn a symbol and then do
the multiplication it implied.

The per-direction costs already carry the whole consequence — they are computed
by running the turn, so a strike that would cost 3 simply reads **6**. The
mechanism does not need a glyph when the outcome is on the board. All four went;
one short line in the chrome names it, and goes grey when nothing can reach you.
The combo tally went the same way: what a combo does is make your next stroke
heavier, and that already shows as more of a foe's pips turning to blood.

Two more marks were removed for cause. A ✗ beside a foe meant "your stroke stops
this one" and was read as **"this will damage me"** — the exact opposite. A cross
on a board means bad, or forbidden, or dead, and no amount of placement was going
to overrule that. And the guard bracket over a braced foe meant "a stroke will
not break this", which is now exactly what a solid telegraph says.

**Strokes are no longer all the same length.** Everything used to run 185 ms and
freeze for 40–72 ms, which is why nothing felt explosive: contrast is the whole
mechanism, and nothing was quiet. Duration, reach, shake and hitstop now scale
off one weight derived from the blow.

| | before | after |
|---|---|---|
| neutral step | 105 ms | 85 ms |
| light stroke | 185 ms, freeze 40 | **150 ms**, freeze 34 |
| heavy stroke or a kill | 185 ms, freeze 72 | **300 ms**, freeze 120 |

Impact also moved from 42% of the way through the stroke to 16% — full
extension, which is where the hitstop already fires, so the freeze now sustains
the pose instead of interrupting the travel.

`npm run shots:strike` photographs a stroke frame by frame at exact clock
offsets. None of this can be checked on a live board: the whole thing is over in
a sixth of a second and the question is what the page looks like *during* it.

The game has one input verb doing two categorically different things, and nothing
used to say which was which until the turn had already been spent. That is now
the per-direction price above, not a mark that merely says "a foe is here".

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
  median depth fell anyway, because you now die to the clock. It also stalled at
  the time — the board caps at seven bodies, `spillSite` returned null, and the
  clock quietly stopped. *(That last part is fixed: a spill with nowhere to go
  now lands on you. The rest of the finding stands — pace needs a lever that is
  not the spill.)*

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

`npm run check:cards` exists because of a bug no unit test could have found. The
card overlay is rendered *inside* the element that owns the swipe gestures, so a
tap aimed at a card was also a tap on the board underneath it — and a tap on the
board resolved to "confirm", which on any screen that was not `playing` started
a new run. **Choosing an upgrade dealt you a fresh run at depth 1.**

The engine was correct throughout. The bug lived entirely in which handler saw a
pointer event, which is the same place the swipe-chaining and the descent
animation bugs lived. So it is checked in a real browser: take a card by tap and
by key, tap the page with a hand up, press space with a hand up — the run you
were playing has to still be the run you are playing.

Fixing it surfaced a second fault immediately. `enabled` gated only the
direction handler, so disabling gestures still let the stage CAPTURE the
pointer — and a captured pointer never reaches the button on the overlay above
it. Taps on a card did nothing at all, which is worse than the bug the guard was
added for.

## Not yet

Sound is synthesized but there is no music. There is no meta-progression, no
seed sharing, and no bestiary in-game (the per-enemy `tell` strings in
`enemies.ts` are written and waiting for one). Duplicate enemy kinds beyond the
four are the obvious next axis, along with a floor modifier or two.

`DESIGN.md` carries the plan: shipping FLOW (a finished mechanic currently
sitting behind a zero), a second playable hand that draws and looses at range,
and scrolls and marginalia as a roguelike layer that never asks for an inventory.
