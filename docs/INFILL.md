# INFILL

**A shape puzzle that builds a city.** v0.2 — revised after external review.

*Infill development* is building on the vacant lots between what is already
there. It names the literal verb — fitting shapes into gaps — and the theme,
density instead of sprawl. Name settled.

Every number here is a candidate until the harness says otherwise.

---

## What v0.2 changed, and why

An adversarial design review found two things that would have shipped as bugs and
several that would have shipped as ambiguities. The corrections are load-bearing,
so they come first.

### Water is cut

Water cells did not count as filled for line completion, so **every water cell
permanently disabled its entire row and column**. At the specified 2–8 cells, the
expected number of clearable lines drops from 20 to **8.3**. That is not eight
obstacles; it is a different board, and it would have made favourable-seed
fishing a rational high-score strategy.

| water cells | clearable lines, of 20 |
|---|---|
| 2 | 16.2 |
| 4 | 13.0 |
| 6 | 10.4 |
| 8 | **8.3** |

Making water count as filled doesn't save it either — it becomes permanent,
penalty-free filler, which is the blight exploit inverted. Cut entirely. Terrain
returns post-MVP, if at all, confined to board edges.

### Adjacency now scales by `min(own, neighbour)` density

The old formula scaled a bonus by the *neighbour's* density without requiring any
investment in the cell collecting it. Next to a density-3 shop:

| harvested cell | population | **per density unit invested** |
|---|---|---|
| density-1 house | 25 | **25.0** |
| density-2 house | 35 | 17.5 |
| density-3 house | 45 | 15.0 |

Cheap recipients were *more efficient* than dense ones — exactly backwards. And
because a donor is only scored when *it* is harvested, the optimal play was to
build dense commercial strips, deliberately leave their rows incomplete forever,
and farm cheap neighbours beside them. Scaling by `min(own, neighbour)` flattens
this to **15.0 per density unit at every density**: you cannot collect a big
neighbour's bonus without matching it.

It also improves the theme. The R–I penalty now scales with *your* density too,
so the harm is putting **many** people next to a factory, not any people.

### The multi-line multiplier was quadratic

`N lines × V each × N` is `VN²`. A vertical I-piece can complete four rows and
its own column — five lines, 25× a single line's value. That makes staging
awkward holes worth more than good adjacency, which is the thesis inverted. Now
**+25% per additional line, capped at ×2**.

### The demand bonus was launderable

"Plurality zone" counted cells; demand relief counted density. So four density-1
industrial cells out-voted three density-3 commercial and three density-3
residential, doubling the *whole* line for a token amount of the demanded zone.
The bonus now applies **per cell, only to cells of the highest-demand zone** —
the plurality rule is gone.

### Blight is clearable, and always was

The spec said "counts as filled" and "makes the board permanently worse", which
read as permanent. Under that reading a fully-blighted row is permanently
complete — an infinite clear loop — and partially-blighted rows become cheap
multiplier and charge farms. **Blight clears with its line.** That was always the
intent; the doc failed to say it. Bulldozer recharge also moves off line count
and onto population banked, so cheap lines stop being farmable.

### The demand economy was described wrongly

A tetromino always creates exactly four density units. Growth was +2 × 3 bars = 6
per placement. With `H = 4t − S`:

```
D_total = 75 + 6t − H = 75 + 2t + S
```

Demand rose by at least +2 per placement **under perfect play**. The system was
arithmetically doomed rather than pressured, and my claimed "one clear per six
placements" stability threshold did not exist. Growth is now **+1 per bar**, so
perfect efficiency is exactly break-even and the ramp comes from a decade clock
instead of from arithmetic. Roads no longer advance demand at all.

### Also corrected

Districts stay cut (box clears would repeatedly destroy the very clusters the
density system asks you to cultivate). Specials go from four to one. The
settlement order is now specified. **Concrete Jungle** is acknowledged as the
real nearest neighbour, not 1010!.

---

## The three rules

**You place, you don't drop.** No gravity, no clock. A piece goes exactly where
you put it — a planning game about a plan, and adjacency cannot matter if pieces
fall. Nothing settles downward, so **rows and columns both clear**.

**You can build on top of yourself.** A placement is legal if every cell it
covers is empty *or* the same zone below density 3. This is the game's verb, and
it is a *placement* rule, not a scoring rule: it changes which moves are legal,
letting a piece consume a smaller new footprint at the cost of future stacking
capacity. It must be a proactive choice, not emergency storage — which is what
the `min()` fix is for.

**Clearing is a harvest, not a demolition.** The board is the construction site;
the city is the skyline strip above it, which only ever grows.

---

## The board

| | |
|---|---|
| Grid | **10 × 10** |
| Clears | a full row **or** a full column. No districts. |
| Hand | **3 zone slots**, batch-refilled only when all three are spent, + **1 works slot** |
| Pieces | the seven tetrominoes |
| Terrain | **none** |
| Rotation | tap a slot to rotate 90°, before the drag |

**On districts.** 9×9 with 3×3 box clears was on the table to raise clear
frequency. It's the wrong fix: box clears would repeatedly remove the small
mixed-zone neighbourhoods the whole adjacency system exists to make you cultivate
— and the pacing problem it was meant to solve turned out to be a demand-accounting
error, now fixed. 10×10, rows and columns.

### The bag

Two independent draws, and they must stay independent. **Shape** comes from a
shuffled seven-bag, so there are no I-piece droughts. **Zone** is drawn
**75% uniform, 25% demand-weighted** — each zone stays between 25% and 50% of
draws, with an even split when all bars are zero.

Pure demand-proportional drawing was punishment dressed as help: a neglected zone
already threatens blight, and flooding your hand with it makes your existing
mixed geometry *harder* to use while its own overflow pressure keeps climbing.
Urgency should bias supply, not take it over. Demand must never alter *shape*
probability.

---

## Cell states

Three zones — **Residential** (green, ⌂), **Commercial** (blue, ▤),
**Industrial** (amber, ▨) — at density 1–3.

Density shows as darker colour **and** pips. Zone shows as colour **and a
distinct silhouette**: pips solve density recognition, not zone recognition, and
colour redundancy has to encode the *same* information, not a different attribute.

**Blight** — grey, hatched, density 1. Cannot be overlapped or built on. Scores 0.
Gives −5 to every neighbour. **Counts as filled for line completion, and clears
with its line.** So a blighted row is a cheap but low-value harvest, and
recovering it is a goal rather than a scar.

**Road** — see below.

---

## Roads

No zone, no density. Cannot be upzoned or built on. **Scores 0** and **counts as
filled**, so a road is a cheap way to close a row that produces no population.
That trade is the piece.

### Line of sight

**Roads make adjacency see through them.** When scoring a cell, look outward in
each of the four directions and step through consecutive road cells; the first
non-road cell is that direction's neighbour.

Explicitly: an **empty** cell stops the ray and is a neighbour worth 0. **Blight**
stops it. A **special** stops it. The **board edge** returns no neighbour. Range
is **uncapped** — a cell still has at most four neighbours, and a longer road
changes *which* four rather than adding any, so there is no range blow-up to cap.

**Rays do not turn corners.** Every road cell conducts independently along its own
row and column; an L-bend does not connect its two ends. This is a consequence of
the rule, not an oversight, and it has an art implication: **roads must not be
drawn with lane markings, arrows, or anything implying flow**, because they have
no direction. Plain paving. The drag-time sightline highlight teaches the real
rule.

Network-connectivity adjacency was rejected for *readability* — a player cannot
estimate a placement whose value depends on a whole graph — not for compute. A
100-cell connectivity pass is not anyone's bottleneck.

### Supply

The works slot holds a road piece — straight 1×2, 1×3, 1×4, or a 3-cell L-bend.
Spending it starts a counter of **three subsequent successful placements**, after
which it refills, before the next failure check. Roads never enter the zone bag,
never consume a zone slot, and never trigger a zone-hand refresh.

**Roads do not advance demand growth.** They create no density, and taxing them
with a full turn of demand made the works slot a trap.

---

## Special buildings

**One in MVP: the Park.** 1×1, earned **every 5 lines cleared**, and it occupies
the works slot until placed, pausing the road cooldown.

It scores 0 itself and gives **+5 to every adjacent zone cell, scaled by that
cell's own density** — the Park behaves as a neighbour of unlimited density, so
`min()` resolves to the recipient's. It cannot be upzoned or built on, and it
clears with its line like anything else.

**Why one and not four.** Stadium, Transit Stop and Power Plant are cut to
post-MVP. Their triggers were positively correlated — a dense commercial
multi-clear could serve all three at once, so "four different achievements" was
one strategy wearing four hats — and multi-cell specials drag in an entire second
spec: scoring identity versus placement identity, what happens when a line
crosses half a stadium, whether a building's own cells count as their own
neighbours, reward collisions when one placement earns two, queueing, and
rounding on a ×1.5.

The Power Plant in particular had a fatal flaw worth recording so it isn't
rebuilt the same way: its "hard placement problem" evaporates if you put it
beside cells you never intend to harvest and then harvest the plant. Pollution
costs nothing to a neighbour whose score is never collected. Any future hostile
building needs a downside that bites whether or not its neighbours are harvested.

The Park survives because it is 1×1 (no fragmentation), has no scoring identity
ambiguity (it scores nothing), and is earned on a fixed cadence (no threshold
definition, no collision).

---

## Scoring

Evaluated **only at the moment a line clears**, for the harvested cells, against
their neighbours as resolved through roads.

| pair | value |
|---|---|
| R – C | **+5** |
| C – I | **+5** |
| R – I | **−8** |
| same zone | **0** — it pays in density |
| any – blight | **−5** |
| any – park | **+5**, at the harvested cell's own density |
| any – road, empty, edge | **0** |

```
cell = max(0, 10 × own_density + Σ pair_value × min(own_density, neighbour_density))
line = Σ cell, with cells of the highest-demand zone counted twice
run  = Σ line × (1 + 0.25 × (lines_completed_this_placement − 1)), capped at ×2
```

Score is **population**. One number.

**The per-cell floor stays at 0.** Not out of kindness — allowing negatives would
make the demand bonus *double a penalty* and the multi-line bonus multiply it
again, turning both reward systems into traps. It also contradicts a skyline that
only grows. A bad building contributing nothing is punishment enough; the fix for
worthless buildings amplifying valuable ones was `min()`, not a negative bank.

### Worked example

A 10-wide row: four R at density 2, four C at density 1, two road cells at the
right end. One density-3 industrial cell sits directly below the leftmost R.
Residential is the highest-demand zone.

| cell | working | value |
|---|---|---|
| R d2 | `20 + (−8 × min(2,3))` = 20 − 16 | **4** |
| R d2 | `20` | **20** |
| R d2 | `20` | **20** |
| R d2 | `20 + (5 × min(2,1))` | **25** |
| C d1 | `10 + (5 × min(1,2))` | **15** |
| C d1 | `10` | **10** |
| C d1 | `10` | **10** |
| C d1 | ray runs through two roads to the edge — no neighbour | **10** |
| road | | **0** |
| road | | **0** |

Raw line 114. The four R cells count twice: `69 × 2 + 45` = **183**.

Move that factory out of contact and the same row scores **215**. Make it a
density-3 shop instead and it scores **235**. One neighbouring cell is worth a
quarter of the line.

---

## Demand

| | |
|---|---|
| Bars | three, 0–100 |
| Start | R 30 · C 25 · I 20 |
| Growth | **+1 to every bar per zone placement**, rising by +1 every **25 placements** |
| Roads | do not advance growth |
| Relief | each zone's bar drops by the summed density of that zone's **uniquely harvested** cells |
| Overflow | at 100 — blight spawns on a random empty cell, the bar resets to 60, its growth rate rises permanently by +1 |

A placement creates exactly four density units. At growth 1 that is 4 in against
3 out — perfect efficiency banks a buffer. Each decade tick costs 3 more per
placement, so by the third decade the economy is unsustainable no matter how well
you play. **The arc is a clock you can outrun early and cannot outrun late**,
which is what the old +2 flat rate was trying and failing to be.

Relief is computed per zone as `D' = max(0, D + growth − harvested)`, so a clear
can avert an overflow on the turn it would have happened. Overflow past 100 is
discarded on reset; the faster growth applies from the next placement. If several
bars overflow at once, each spawns one blight cell. If no empty cell exists, the
spawn is skipped — never retried.

---

## The bulldozer

One charge to start, **+1 per 1,500 population banked**, capped at 3. Erases one
cell to empty — blight, road, park or your own building alike.

It **consumes a charge but does not advance demand growth or the road cooldown**.
It is a rescue action, not another tax on a board that is already failing.

Recharge is on population rather than lines cleared because line count is
farmable: a mostly-blighted row is cheap to complete and worth almost nothing,
and paying charges for it would reward exactly the degenerate loop.

---

## Settlement order

This is a rules contract, not an implementation note. Every simultaneously
completed line must score against **one snapshot** of the board — resolve a row
first and you remove neighbours the column would have scored against, which makes
iteration order change the result.

```
1. commit placement
2. identify all completed lines
3. score the unique harvested cells against one pre-removal snapshot,
   against a demand priority frozen before the placement
4. remove all harvested cells simultaneously
5. apply demand growth, then relief
6. resolve overflows and blight spawns
7. resolve rewards (park), hand refill, road cooldown
8. check failure
```

**Newly spawned blight never triggers another clear check.** One settlement per
placement, always.

**A cell at a row–column intersection is one building.** It counts once for
population, once for demand relief, once for the skyline. Both lines count toward
the multi-line bonus. This is separate from adjacency accounting, where an R–C
pair legitimately pays both endpoints — at different values, since `min()`
resolves against each cell's own density.

### What counts as a placement

A successful placement, **including one that is entirely overlap**, is a turn.
Rotation, cancelled drags, illegal drops, previews and inspections are not, and
**none of them may advance the random state** — otherwise cancelling a drag
becomes a way to reroll the next piece or move the next blight.

### Failure

A run ends when no piece in hand fits anywhere **in any rotation, and no single
bulldoze would create a legal placement**, checked after refills and all other
settlement. If a charge remains that would open a move, the player is put into
bulldoze mode rather than being told the run is over. Confiscating the rescue
resource at the exact moment it is needed is not a difficulty curve.

---

## Interface

The design's richest decision — "this overlap preserves empty land and improves a
future harvest, but spends my last stacking capacity here and puts industry one
move from overflow" — currently happens with nothing on screen explaining any of
it. Clear-time *scoring* is right; clear-time-only *understanding* is not.

- **Hold any cell** to inspect it: its four resolved neighbours (through roads),
  and what it would be worth harvested right now. Not 100 numbers continuously —
  the consequences of the one decision being made.
- **The placement ghost** shows density changes, demand consequences, and the
  reason for any clear value it displays.
- **Dragging a road highlights the sightlines it would create**, including the
  harmful ones. This rule is invisible without it.
- **Drag offset** renders the piece about one cell from the finger, and **flips to
  render below the finger** when dragging near the top edge.
- **Illegal drops spring back**, never consumed, and are distinguished by
  something other than colour — a dashed versus solid ghost outline.
- **Controls** — the rail, the bulldozer, the works slot — live in the lower
  third. The board cannot: at ~35 px a cell it is ~350 px tall and the lower third
  of an 844 px screen is ~281 px. Board in the middle, demand readout above it,
  skyline on top.

Portrait only, 390 × 844.

---

## What this is, honestly

The nearest neighbour is not 1010! or Woodoku. It is **Concrete Jungle** — city
placement with neighbour effects and clearing developed areas. Zoning arithmetic
wrapped around a block puzzle is not new territory.

The differentiation has to live in **overlap** and in **harvest**: that a legal
move can consume no new ground, that density is a resource you spend rather than
a score you accrue, and that the city you are building leaves the board rather
than sitting on it. If overlap reads as "two extra places to hide a bad piece",
the design has failed and no amount of zoning theme will rescue it.

The claim that no block puzzle allows overlap is dropped. It isn't needed.

---

## MVP scope

**In:** 10×10 · seven tetrominoes · 3 zone slots with batch refill + works slot ·
rotate, drag, place · three zones · density 1–3 by overlap · blight · roads with
line-of-sight adjacency · the Park · row and column clears · `min()`-scaled
clear-time synergy · per-cell demand bonus · capped multi-line bonus · three
demand bars with decade growth and overflow · bulldozer on population recharge ·
the settlement contract · cell inspection · skyline strip · failure check with
bulldozer recovery · local high score · headless bot harness.

**Out:** terrain and water · Stadium, Transit Stop, Power Plant · district clears ·
utilities as a coverage simulation · ordinance cards · a fourth zone · timers ·
dailies · accounts · ads and IAP · landscape and tablet.

### Milestones

| | |
|---|---|
| **M0** | pure rules module + tests: legality, overlap, road rays, the settlement contract, scoring. No UI. |
| **M1** | playable canvas build. Answers "is overlap a real decision or a dumping ground". |
| **M2** | roads, the Park, cell inspection. Answers "is the second verb fun". |
| **M3** | demand, bag, blight, bulldozer — the full economy. |
| **M4** | harness, `npm run model`, first balance pass. |
| **M5** | art pass — direction C — skyline, clear animation, audio, haptics. |
| **M6** | real hardware, tune, ship. |

M0 is the settlement contract and the ray resolver. Both are pure functions and
both decide what game this is; neither should be discovered inside a renderer.

---

## What the harness must answer

| question | metric | falsifier |
|---|---|---|
| Is overlap proactive? | overlaps made with empty cells still available | overlap only happens when boxed in — it's storage, not a verb |
| Does `min()` kill donor farming? | mean lifetime of a density-3 cell before harvest | dense cells that never clear |
| Is clear frequency survivable? | clears per placement; runs ending in blight spiral | the spiral is the default outcome |
| Is the decade ramp right? | placement number at first overflow | first blight before ~40 or after ~80 |
| Do roads earn their cell? | road placements per run for `thinking` | near zero — the piece is a tax |
| Is the Park cadence right? | parks placed per run; score delta with and without | under two a run, or it dominates |
| Is the bulldozer the strategy? | score and length at 0 / 3 / unlimited | unlimited raises the reactive bot |
| Is there a skill curve? | greedy vs reacting vs thinking | lookahead worth under ~40% |

A bot cannot tell you whether dragging a J-piece with your thumb feels good, and
that is most of what a mobile puzzle game is.

---

## Still open

- **Rotation, or not?** Ships on; a one-line experiment.
- **A 1×1 infill piece?** Relief valve and crutch both. Rare bag entry, or later.
- **Do a clear's neighbours score too?** Currently only harvested cells do.
- **Is `min()` too harsh on the R–I penalty at low density?** A density-1 house
  beside a density-3 factory now takes −8 rather than −24. Intended, unverified.

Art direction is settled: **C, the massing model** — with zone silhouettes and
density pips authoritative, and shadow supporting them rather than carrying
information on its own. See `ART-DIRECTION.md`.

---

## Tech

Vite, TypeScript, React shell around a canvas board, vitest, `vite-node` for the
harness. `place(state, piece, at)` pure and cloneable — the harness, the ghost,
the inspection panel and the tests all depend on it.
