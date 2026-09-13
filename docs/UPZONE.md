# UPZONE — a shape puzzle that builds a city

**Working title.** *Upzoning* is the planning term for raising the density a
parcel is allowed to carry, and raising density is this game's central verb — you
place a piece **on top of** what you already built. The name is the mechanic.
Alternates if it doesn't stick: SETBACK, PLAT, GRADE, ZONED.

This document is the argument for a game that doesn't exist yet. Every number in
it is a candidate until a bot harness says otherwise — same standing rule as
STET, and nothing below is exempt.

---

## The pitch

An 8×8 lot. A hand of three tetrominoes, colour-coded by zone. Drag one onto the
board with your thumb. Fill a row or a column and that strip **completes** — it
lifts off the board and rises into your skyline, banking population. What it's
worth depends on what you built next to what, and on how deep you built it.

Three demand bars climb every turn. Clearing a line feeds the zone it's made of.
Neglect a bar long enough and blight lands on your board and never leaves.

Three to eight minutes a run. One thumb. No timer, no gravity, no menus.

---

## The three rules

Everything else is detail.

**You place, you don't drop.** There is no gravity and no clock. A piece goes
exactly where you put it, and you can put it anywhere it fits. This is a
*planning* game about a *plan*, and adjacency can't matter if pieces fall.
Because nothing settles downward, **rows and columns both clear**.

**You can build on top of yourself.** A placement is legal if every cell it
covers is empty *or* the same zone with density below 3. Cover an empty cell and
it becomes density 1; cover a green 2 and it becomes a green 3. This is the one
rule that isn't in any block puzzle you've played, and it does three jobs at
once: it's the relief valve on a crowded board, it's how you multiply value, and
it's why a coherent district is worth building even though same-zone adjacency
pays nothing.

**Clearing is a harvest, not a demolition.** The board is the construction site.
The city is the skyline strip above it, which only ever grows. A completed line
leaves the board and gets *added* to the thing you're making. Without this the
game asks you to lovingly arrange a district and then bulldoze it for points,
which is a feel-bad no amount of tuning fixes.

---

## What I changed from the brief, and why

The brief said tetrominoes, zone colours, darkness for density, line clears,
adjacency synergy, a demand graph. All of that survives. Six things changed.

**Gravity is gone.** The brief implies Tetris. Tetris is a *dexterity* game
whose skill is placing a falling thing under time pressure; its adjacency is
accidental because you can't choose it. A city builder's whole pleasure is
choosing where things go. Drag-and-drop from a hand of three is also the proven
mobile-first form — 1010!, Woodoku — and it is *thumb* input rather than *thumb
plus reaction time*. Falling pieces on a phone is a port. This is native.

**Density became a placement rule, not a decoration.** "Darkness for density"
in the brief reads as a display of something. Make it the thing the player
*does* — overlap same-zone to upzone — and the game acquires a verb no
competitor has.

**Every adjacency pair got a sign.** The brief names one interaction:
industrial-next-to-residential is bad. A rules table of only penalties makes a
game of avoidance, where the optimal play is bland segregation. Every mixed pair
now scores, positive or negative, so the board rewards a *shape*, not a
sorting job.

**Same-zone adjacency pays nothing.** It pays in density instead. Coherence and
diversity are then two different strategies competing for the same cells, which
is the decision the whole game hangs on. If blobbing also scored, blobbing would
just win.

**Demand is not a second fail state.** It's a *pressure* — it steers your piece
supply, doubles your score when you serve it, and spawns blight when ignored.
One fail state (nothing in hand fits) is enough for an MVP; two life bars double
the tuning surface and halve the legibility.

**Density needs a second channel.** Three zone hues × three darkness levels is
nine colours a player must tell apart at arm's length, in sunlight, some of them
colourblind. Every cell also carries **pips** (1/2/3) and every zone carries a
**glyph**. Colour is the fast read; pips are the true read.

---

## The board

| | |
|---|---|
| Grid | **8 × 8** (64 cells) |
| Clears | full row **or** full column |
| Hand | **3** pieces, refilled only when all three are spent |
| Pieces | the seven tetrominoes (I O T S Z J L) |
| Rotation | tap a hand slot to rotate 90° |
| Terrain | 0–4 pre-placed **water** cells per run seed (permanent, unbuildable) |

8×8 is the first number to tune. It has to fit above a hand rail and a demand
readout in a portrait viewport without the board dropping under ~40 px a cell.

Refilling only when the hand empties — rather than one-in-one-out — forces you
to plan three placements deep and creates the "I have one terrible piece left"
moment that ends runs. That's the interesting version.

Water cells are nearly free to build and are the cheapest variety generator in
the design: they split the board, make certain rows harder, and give a run a
face. They cost one field on the seed and one branch in the legality check.

---

## Zones

MVP ships **three**. The classic SimCity mapping is right and players already
know it.

| Zone | Colour | Glyph | Fantasy |
|---|---|---|---|
| **Residential** | green | ⌂ | people live here |
| **Commercial** | blue | ▤ | people shop and work here |
| **Industrial** | amber | ▨ | things get made here, loudly |

The brief put commercial in yellow. I'd hold the line on blue-C / amber-I: it's
the mapping thirty years of the genre has taught, and amber-vs-green separates
better than yellow-vs-green at low density on a small screen. Not a hill worth
dying on — swap them if it looks better in the hand rail.

**Blight** is a fourth cell state, not a zone: grey, hatched, density 1, cannot
be overlapped, cannot be rotated away from. It counts as filled for the purpose
of completing a line, so it is clearable — but it scores nothing and poisons
everything it touches.

---

## Synergy

Evaluated **only at the moment a line clears**, and only for the cells in that
line, looking at their four orthogonal neighbours as they stand right then.

This matters. Continuous evaluation would mean a running total nobody can track
on a phone. Clear-time evaluation means the same physical district can be worth
wildly different amounts depending on *when* you close the row — which makes
timing a skill and gives the clear its drama.

| pair | value | why |
|---|---|---|
| **R – C** | **+5** | walkable amenity: shops near homes |
| **C – I** | **+5** | freight and jobs: warehouses near their factories |
| **R – I** | **−8** | pollution, noise, the reason zoning was invented |
| same zone | **0** | pays in density instead |
| any – blight | **−5** | |
| any – water | **0** | free edge; water is neither help nor harm at MVP |
| any – empty | **0** | |

**Synergy scales with the neighbour's density.** A residential cell beside a
density-3 factory takes **−24**; beside a density-3 high street it gains **+15**.
Density is therefore a double-edged commitment rather than a pure good, which
is exactly how it behaves in a real city and exactly what stops "always upzone"
from being the whole strategy.

---

## Scoring

Score is **population**. One number, and it's the one the fantasy wants.

```
cell   = max(0, 10 × own_density + Σ_neighbours pair_value × neighbour_density)
line   = Σ cell
run    = Σ line × multipliers
```

Multipliers, applied to the line:

- **×2 demand match** — the line's plurality zone is the zone whose demand bar is
  currently highest.
- **×N combo** — one placement completing N lines at once scores ×N.

The floor at 0 is deliberate and provisional. Letting cells go negative makes a
bad placement genuinely punishing; flooring makes it merely wasteful. It is
kinder, more legible, and possibly too kind — a model question, below.

### Worked example

A row of eight, closed by an L-piece. Four residential at density 2 on the left,
four commercial at density 1 on the right, meeting in the middle. Nothing above
or below except one density-3 industrial cell under the leftmost residential.

- Leftmost R: `10×2 + (−8 × 3)` = 20 − 24 → floored to **0**. One factory ruined
  that cell entirely.
- Two interior R: `10×2` = **20** each.
- R at the seam: `10×2 + (5 × 1)` = **25**.
- C at the seam: `10×1 + (5 × 2)` = **20**.
- Three remaining C: `10×1` = **10** each.

Line = 0 + 40 + 25 + 20 + 30 = **115**. Residential is the top demand bar, so
**230**. The same eight cells with the factory two tiles further away score 250 —
and if that factory had been commercial instead, 275. That spread is the game.

---

## Demand

Three bars, 0–100, shown as a compact stacked readout above the board. They are
the closest thing the game has to a difficulty clock.

| | |
|---|---|
| Start | R 30 · C 25 · I 20 |
| Growth | **+2 to every bar per placement** |
| Reduction | clearing a line reduces each zone's bar by `Σ density of that zone's cells in the line` |
| At 100 | **blight event** — one blight cell spawns on a random empty cell; the bar resets to 60 and its growth rate permanently increases by +1 |

Demand does three things:

**It steers the bag.** Piece colour is drawn with weight proportional to current
demand. Neglect industrial and your hand fills with amber. This is
self-correcting, thematically exact — the market builds what's wanted — and a
trap, because being handed what you need is not the same as having somewhere to
put it.

**It doubles your score when you serve it**, which is what makes a demand graph
a *mechanic* rather than a readout.

**It is unservable in full.** A line takes roughly four placements to close, so
closing one adds +8 to all three bars while removing perhaps 8–16 from one. You
can hold one bar flat. You cannot hold three. The run's arc is choosing which
zone to fail, and blight is the bill for that choice.

That asymmetry is the reason the demand graph earns its place. If it could be
satisfied it would just be a to-do list.

---

## Blight, and the ramp

Difficulty does not come from speed — there is no clock. It comes from the board
getting harder to work with.

Blight cells cannot be overlapped, so they are permanent holes in the density
economy: any row they sit in can never be worth much, and they only leave by
completing that row. Each blight event also permanently steepens the bar that
produced it, so a neglected zone compounds. Ten minutes in, a run is being played
around four or five grey scars.

This is the whole ramp for MVP. It is board-state escalation rather than a
tightening timer, which is the correct pressure for a game with no timer at all.

---

## The bulldozer, and why it's rationed

One charge to start. **+1 charge every 5 lines cleared, capped at 3.** Spend one
to erase a single cell to empty — usually blight, occasionally your own mistake.

The case for it: a placement game where one bad drag can quietly doom a run
teaches players to stop taking risks, and a phone game that punishes a fat-finger
misdrop gets deleted.

The case against: an unrationed escape hatch is the strategy that eats the
design. STET measured exactly this with its hold verb and the unlimited version
pulled reactive play *down* while pushing patient play up. Expect the same shape
here, and price it the same way — a small, refilling, obviously-finite budget.
The charge count sits next to the hand where it can't be missed.

This is a model question, not a taste question. It ships at 1/+1-per-5/cap-3 and
that is a guess.

---

## Failure, and session length

A run ends when **no piece in hand can be legally placed anywhere**. That's it.
No top-out line, no health, no time.

The board genuinely saturates: overlap caps at density 3, and a board of all-3s
and blight admits nothing. Blight accelerates it. Target median run: **3–8
minutes**, 40–70 placements, 8–20 lines cleared.

If runs come in long, the lever is blight frequency, not board size.

---

## Mobile input

The part that decides whether this is good.

- **Drag to place.** A piece lifts from the hand rail on touch-down and renders
  **offset above the finger** by roughly one cell, with a grid-snapped ghost
  showing the exact target and a per-cell tint for legal/illegal. A thumb covers
  four cells. The piece must not be under it.
- **Tap to rotate**, in the hand rail, before the drag. Rotating mid-drag is
  fiddly and nobody will find it.
- **Illegal drops return to the hand** with a short spring, never consume the
  piece, and never shake the whole board.
- **Hand rail at the bottom**, board above it, demand readout above that,
  skyline above that. Everything interactive is in the lower third. Everything
  informational is in the upper two.
- **Placement preview shows the score you'd get** *if a placement completes a
  line* — the number is the payoff and hiding it until commit is just a memory
  test. It does not show anything otherwise; the board would become arithmetic.
- **The clear animation is the game's one indulgence.** Cells pop their
  individual scores, the strip lifts, the skyline grows by that strip's
  buildings at heights equal to their density. Contrast is the mechanism: a
  1-line clear of density-1 cells should be over instantly; a triple of dense
  matched-demand cells should stop the screen.

Landscape is out of scope. Portrait, one thumb, 390 × 844 as the design target.

---

## What the model must answer

Same discipline as STET: a headless bot plays thousands of runs and the numbers
decide. Three bots — `greedy` (best immediate score), `reacting` (1 placement
lookahead), `thinking` (all 3 hand pieces, all rotations, all positions) — and
the gap between them is the skill curve.

| question | metric | what would falsify the design |
|---|---|---|
| Is 8×8 right? | median run length at 7/8/9 | runs under 2 min or over 12 |
| Does density pay? | mean cells cleared at each density | if density 3 is rare, the core verb is decoration |
| Is R–I avoidable? | frequency of R–I contact for `thinking` | near zero means the penalty is free to dodge and teaches nothing |
| Does synergy beat blobbing? | score of a synergy bot vs a same-zone bot | if blobbing wins, the whole adjacency table is theatre |
| Is the score floor too kind? | `thinking` score with floor-at-0 vs allowing negatives | if identical, negatives are noise; keep the kind version |
| Is the bulldozer the strategy? | `thinking` score and run length at 0 / 3 / unlimited charges | unlimited raising the reactive bot's score is the failure signature |
| Does demand-weighted bag help or hurt? | run length with weighted vs uniform bag | if weighting shortens runs, it's a punishment dressed as help |
| Is there a skill curve at all? | `greedy` vs `reacting` vs `thinking` score | if lookahead is worth under ~40%, the game is solitaire |

The honest limitation, stated up front: a bot cannot tell you whether dragging
a J-piece with your thumb feels good, and that is most of what a mobile puzzle
game is. Everything in the input section above is tuned by hand, on a phone.

---

## MVP scope

### In

1. 8×8 board, seven tetrominoes, hand of 3, tap-rotate, drag-place.
2. Three zones + water + blight.
3. Density 1–3 by same-zone overlap; pips and darkness.
4. Row and column clears; clear-time synergy scoring; population score.
5. Three demand bars: growth, reduction, demand-weighted bag, ×2 match bonus,
   blight event at 100.
6. Bulldozer, rationed.
7. The skyline strip.
8. Game over on no-legal-placement; high score persisted locally.
9. Bot harness + `npm run model` before any balance claim is believed.

### Out — deliberately, and named so nobody adds them by accident

- **Roads.** The best post-MVP mechanic in the design (below). Also a second
  placement system with its own legality rules and its own network solve. Not in
  a first build.
- **Utilities — water, power, fire, health.** These are a *second simulation*
  layered over the first: coverage radii, per-cell service state, a whole
  parallel failure mode. They are how a scoped project becomes an unscoped one.
  Phase 3 at the earliest, and only if the answer to "what does this add that
  synergy doesn't" is good.
- **Ordinance / draft cards.** The roguelike layer. Wants a stable, measured
  base game to modify — a modifier system built before the numbers it modifies
  are trustworthy is guesswork squared.
- **A fourth zone.** Three zones make three pairs. Four make six, and six
  relationships is past what anyone learns from a two-line tutorial.
- **Timers, combos across turns, daily challenges, accounts, ads, IAP.**
- **Landscape and tablet layouts.**

### Milestones

| | |
|---|---|
| **M0** | pure rules module + tests: placement legality, overlap, clears, scoring. No UI. |
| **M1** | playable canvas build: drag, rotate, clear. Ugly. Answers "is the verb fun". |
| **M2** | demand, bag weighting, blight, bulldozer. The full loop. |
| **M3** | bot harness, `npm run model`, first balance pass against the table above. |
| **M4** | feel: skyline, clear animation, audio, haptics, the input polish list. |
| **M5** | phone testing on real hardware, tune board size and blight rate, ship. |

M0 before M1 is not ceremony. Placement legality with overlap and density is the
one genuinely fiddly rule in the game and it wants to be pure and tested before
anything draws it.

---

## After the MVP

In the order I'd build them.

**Roads.** A fourth piece family: I-shaped only, no zone, scores nothing on its
own. What a road does is **conduct synergy** — two zones joined by an unbroken
road count as adjacent regardless of distance. This turns a local rules table
into a network, gives the board a second readable structure, and is the single
biggest depth increase available for the least new state. It also makes the
classic mistake — running a highway from the factories to the houses — a thing
you can do to yourself.

**Transit stops.** A 1×1 special. Its row and column count as one district for
synergy purposes. Perfectly shaped for a game that already clears rows and
columns, and it makes a stop's *placement* a spatial puzzle rather than a
purchase.

**Special buildings.** Earned, not drawn: clear N cells of one zone at density 3
and a stadium / park / campus piece appears in the hand. Rewards specialisation,
which currently nothing does, and gives long runs an escalation that isn't
punishment.

**Terrain beyond water.** Hills that cap density at 2. Existing rail that must be
built around. Same near-zero cost as water, same variety return.

**Ordinances — the roguelike layer.** Every 5 lines, pick 1 of 3 permanent
modifiers. This is a Balatro-shaped structure and it fits: the scoring formula
has plenty of exposed surfaces. *Zoning Variance* (R–I penalty halved),
*Green Belt* (same-zone adjacency finally pays +2), *Tax Abatement* (bag skews
commercial), *Eminent Domain* (bulldozer clears a 2×2), *Historic District*
(density-3 cells score ×1.5 but can't be bulldozed). Each is a delta on the rules
object, which means the bot harness can play any combination of them the day the
system exists — the same property that made STET's marginalia cheap.

**Utilities**, if ever, as *ordinance-scale* rules rather than a coverage
simulation: "density 3 requires an adjacent power cell" is a rule; a power grid
is a second game.

---

## What makes this not 1010!

The honest question, since the input model is borrowed wholesale.

1010! and Woodoku ask one question — *does it fit* — and the answer is spatial
and immediate. Five things here ask a second question, *is it worth it*:

- **Overlap** makes a cell you already own a legal target, which no block puzzle
  does. It is a different placement space.
- **Clear-time adjacency** means *where* and *when*, not just *whether*.
- **Demand-weighted supply** makes the bag a consequence of your play rather
  than a random feed.
- **Blight** makes the board degrade in ways you caused.
- **The skyline** makes the run produce an artifact instead of a number.

If M1 plays and none of that lands, the honest conclusion is that it's a reskin
and the design was wrong — not that it needs more systems.

---

## Open questions

- **Rotation, or not?** 1010! and Woodoku both refuse it, and their difficulty
  depends on that refusal. Tetrominoes without rotation may be too punishing;
  with it, may be too soft. It ships on and is a one-line experiment.
- **Should a 1×1 "infill" piece exist?** Enormous relief valve, obvious
  crutch. Perhaps as a rare bag entry, perhaps as an ordinance.
- **Does clearing a line score the cells' neighbours too?** Currently only the
  line's own cells score. Scoring the neighbouring cells' reaction as well would
  make a clear feel bigger and the arithmetic worse.
- **Where does this live in the repo?** Proposal: `src/upzone/`, its own entry
  point, sharing the existing Vite / TypeScript / vitest setup and the
  `npm run model` convention. It shares no game code with STET and shouldn't
  pretend to.

---

## Tech notes

Same stack as STET, for the same reasons: Vite + TypeScript + React shell +
canvas board, vitest for rules, `vite-node` scripts for the harness and for
screenshot checks.

The rules module must be **pure and cloneable** — `place(state, piece, at)`
returning a new state with no side effects. Every good thing in this document
depends on it: the bot harness, the placement preview, the ordinance system, and
the tests. STET's `preview.ts` works only because `step()` is pure, and the same
property buys the same things here.
