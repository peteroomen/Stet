# A shape puzzle that builds a city

**Working title: unresolved.** Shortlist and argument below. `UPZONE` was the
first pass and is now the fallback, not the front-runner.

Every number here is a candidate until a bot harness says otherwise — same
standing rule as STET, and nothing below is exempt.

---

## The name

`UPZONE` was accurate and slightly flat: people hear it as two words, and "up"
reads like a tutorial verb. Eight alternates, ranked, all real planning
vocabulary — which is the right well to draw from, because the terms are
concrete, unclaimed, and carry the theme without explaining it.

### Front-runners

**INFILL** — *infill development* is building on the vacant lots between what is
already there. It names the literal verb (fitting shapes into gaps) and the whole
theme (density instead of sprawl) in one word. Short, unusual, clean set large,
and it means something true about the game rather than something true about
cities generally. **This is my pick.**

**PLAT** — the surveyed subdivision drawing; the document that says where the
lots are. Four letters, two hard consonants, superb as a wordmark, and it reads
as a placement sound as much as a word. Obscure enough to own outright, guessable
enough not to feel arbitrary.

**MIXED USE** — mixed-use zoning is precisely what the synergy table rewards, so
the title states the game's thesis. The only cost is that two words punch less
hard in a store listing.

### Also strong

| name | what it means | the case | the cost |
|---|---|---|---|
| **BOROUGH** | an administrative city division | warm, unmistakably urban, easy to say, a great icon word | says nothing about the puzzle |
| **RIGHT OF WAY** | the land strip a road occupies | apt now that roads are in — and *ROW* is both its abbreviation and what you clear | three words |
| **VARIANCE** | official permission to break the zoning rules | perfect for the ordinance layer later | cold, slightly abstract |
| **SETBACK** | the mandated gap from a lot line | strong double meaning, good mouthfeel | the other meaning is a reversal, in a game about momentum |
| **BUILDOUT** | developing a site to full capacity | exactly what density 3 is | a touch generic |

### Ruled out

**SPRAWL** (a 2022 cyberpunk FPS), **PARCEL** (an existing Steam puzzle game),
**GRIDLOCK** (overused and negative), **UPZONE** (the incumbent).

A web search turned up no direct collision for INFILL, PLAT or BOROUGH as puzzle
or city-builder titles, but that is not a clearance — a proper App Store, Steam
and trademark check is owed before anything gets committed to.

---

## The pitch

A 10×10 lot. A hand of three tetrominoes, colour-coded by zone, plus a works
slot holding a road. Drag one onto the board with your thumb. Fill a row or a
column and that strip **completes** — it lifts off the board and rises into your
skyline, banking population.

What it's worth depends on what you built next to what, on how deep you built it,
and on what your roads connect. Three demand bars climb every turn. Clearing a
line feeds the zone it's made of. Neglect a bar long enough and blight lands on
your board and never leaves.

Four to ten minutes a run. Portrait, one thumb, no menus.

---

## The three rules

**You place, you don't drop.** No gravity, no clock. A piece goes exactly where
you put it. This is a planning game about a plan, and adjacency cannot matter if
pieces fall. Because nothing settles downward, **rows and columns both clear**.

**You can build on top of yourself.** A placement is legal if every cell it
covers is empty *or* the same zone below density 3. The one rule that is in no
block puzzle you have played. It is the relief valve on a crowded board, the way
you multiply value, and the reason to build a coherent district even though
same-zone adjacency pays nothing.

**Clearing is a harvest, not a demolition.** The board is the construction site.
The city is the skyline strip above it, which only ever grows.

---

## The board — now 10×10

| | |
|---|---|
| Grid | **10 × 10** — 100 cells |
| Clears | a full row **or** a full column |
| Hand | **3 zone slots** + **1 works slot** |
| Pieces | the seven tetrominoes, plus the road family and earned specials |
| Rotation | tap a hand slot to rotate 90° |
| Terrain | 2–8 water cells per seed — permanent, unbuildable |

10×10 is the size 1010! ships on phones, so the ergonomics are proven: at 390 px
wide with a 16 px gutter, cells land near 35 px. That is under the 44 px tap
target, which would matter if you tapped cells — you don't. You drag a piece and
it snaps, so the target is the whole board.

**The bigger board is what makes roads worth having.** On 8×8, a road that
conducts adjacency across distance has almost no distance to cross; two or three
cells is already the whole board. At 10×10 a road network has room to be a
structure you can look at. The same goes for 2×2 specials, which eat a
sixteenth of an 8×8 board and a twenty-fifth of this one.

### What the extra 36 cells cost

**Clears get rarer**, and clears are both the dopamine and the only demand
valve. A 10-wide row needs roughly five placements' worth of contribution rather
than four. If clear frequency drops below about one per six placements, demand
runs away and every run becomes a blight spiral. This is the single biggest risk
the bigger board introduces, and the first thing the harness should measure.

Levers, in the order I'd pull them: seed each run with a few pre-filled cells;
add trominoes and a rare 1×1 to the bag; drop demand growth from +2 to +1.

### The 9×9 argument <!-- worth reading before committing to 10 -->

The version I'd actually argue for is **9×9 with 3×3 district clears** — fill any
row, any column, *or* any of the nine 3×3 boxes and it completes.

This is Woodoku's exact geometry, and it exists because it solves precisely the
problem above: on a big board, box clears keep the reward rate up without
shrinking the board or cheapening the row. It also makes **district** literal —
a 3×3 box *is* a city block, the specials have an obvious home, and "fill the
district" becomes a goal you can state in four words. Roads and 2×2 specials
still have all the room they need.

The cost is one more thing to scan for, and a board that is no longer square in
the "chess" sense. The spec below assumes 10×10 as asked; switching to 9×9 is a
one-constant change plus a box check, and I'd take the trade.

---

## Zones, density, blight

Three zones ship: **Residential** (green, ⌂), **Commercial** (blue, ▤),
**Industrial** (amber, ▨). Density 1–3, shown as darkness **and** pips — three
hues times three darknesses is nine colours to tell apart at arm's length, in
sunlight, some of them colourblind. Colour is the fast read; pips are the true
read.

**Blight** is a cell state, not a zone: grey, hatched, density 1, unoverlappable,
scores nothing, −5 to everything it touches, and counts as filled for line
completion. It is the only thing that makes the board permanently worse.

---

## Roads

New in this revision, and the largest single addition.

### What a road is

A cell with no zone and no density, drawn as asphalt. It cannot be upzoned or
built over. It **scores nothing itself**, and it **counts as filled** for
completing a row or column — so a road is a cheap way to close a line that
produces no population. That trade is the whole tension of the piece.

### What a road does

**Roads make adjacency see through them.** When scoring a cell, look outward in
each of the four directions; step through consecutive road cells; the first
non-road cell you reach is that direction's neighbour.

That's it. A house three cells from a high street, with road in between, scores
the full R–C bonus. A factory at the end of an avenue poisons whatever is at the
other end of it.

This formulation matters, and it is why roads are affordable. The obvious
alternative — "cells connected to the same road network count as adjacent" —
turns scoring into a graph problem with combinatorial blow-up, no way to draw the
answer, and no way for a player to estimate a placement. Line-of-sight keeps
**every cell at exactly four neighbours**; roads only change *which four*. It
computes in a loop, it draws as a highlighted sightline, and a player can read it
off the board in a second.

Range is **uncapped** at MVP — a long avenue reaches as far as it runs. Simpler
to state, simpler to learn, and if it proves too strong a cap of 4 road cells is
a one-line change. <!-- model question -->

### Where roads come from

The hand rail gets a fourth slot: the **works slot**. It holds a road piece —
straight 1×2, 1×3, 1×4, or a 3-cell L-bend — and **refills three placements
after it is spent**. Roads therefore never pollute the zone bag and are never
unavailable for long; the decision is *when*, not *whether*.

---

## Special buildings

Earned, never drawn. When you earn one it occupies the works slot until placed,
pausing road refills — so a special genuinely costs you a road.

| special | size | earned by | effect |
|---|---|---|---|
| **Park** | 1×1 | a single clear worth 300+ | scores 0 itself; gives **+5 to every adjacent cell of any zone**. The universal good neighbour. Cannot be upzoned. |
| **Transit Stop** | 1×1 | clearing a row and a column with one placement | its **entire row and column conduct adjacency** as if they were road |
| **Stadium** | 2×2 | clearing 8 density-3 commercial cells, cumulative | all four cells score as density-3 commercial and give **+5 to all neighbours**; cannot be upzoned or bulldozed |
| **Power Plant** | 2×2 | your third blight event | scores as density-3 industrial **×1.5**, but **−8 to every neighbour**, every zone, no exceptions |

Two notes on why these four.

**Each is earned by a different kind of play** — one big clear, one precise
clear, one long specialisation, one accumulation of failure. They pull in four
directions, which is what stops a single dominant line from emerging.

**The Power Plant turns the punishment mechanic into a tool.** Blight is the only
thing in the game that is purely bad; making the third one hand you a
high-scoring, actively hostile building gives a losing run something to do, and
creates the best placement problem in the game: where do you put a thing that
ruins everything near it, on a board where everything is near something?

---

## Synergy and scoring

Evaluated **only at the moment a line clears**, for the cells in that line,
against their four neighbours — as resolved through roads — as they stand right
then. Continuous evaluation means a running total nobody can track on a phone.

| pair | value |
|---|---|
| R – C | **+5** |
| C – I | **+5** |
| R – I | **−8** |
| same zone | **0** — it pays in density instead |
| any – blight | **−5** |
| any – park / stadium | **+5** |
| any – power plant | **−8** |
| any – water, road, empty | **0** |

**Synergy scales with the neighbour's density.** A residential cell beside a
density-3 factory takes −24; beside a density-3 high street it gains +15. Density
is a double-edged commitment, not a pure good, which is what stops "always
upzone" from being the whole strategy.

```
cell = max(0, 10 × own_density + Σ pair_value × neighbour_density)
line = Σ cell
run  = Σ line × multipliers
```

Multipliers on the line: **×2** when its plurality zone is the currently highest
demand bar, **×N** when one placement completes N lines.

Score is **population**. One number.

---

## Demand

| | |
|---|---|
| Bars | three, 0–100 |
| Start | R 30 · C 25 · I 20 |
| Growth | +2 to every bar, per placement |
| Reduction | a clear drops each zone's bar by the summed density of that zone's cells in the line |
| At 100 | **blight event** — one blight cell on a random empty cell; the bar resets to 60 and its growth rate rises permanently by +1 |

The reduction formula **scales itself with board width**: a 10-wide line holds up
to 30 density-units against an 8-wide line's 24, which roughly offsets the extra
placement per line. That is luck rather than design, and the harness should
confirm it rather than trust it.

Demand steers the bag — piece colour is weighted by current demand, so neglecting
industry fills your hand with amber. It doubles your score when served. And it
**cannot be satisfied**: closing a line adds +8 to +10 across all three bars
while draining one. You can hold one bar flat. Not three. The run's arc is
choosing which zone to fail, and blight is the bill.

---

## The bulldozer

One charge to start, **+1 every 4 lines cleared** (was 5 — lines are rarer now),
capped at 3. Erases a single cell to empty. Cannot touch a stadium.

For: one bad drag should not quietly doom a run. Against: an unrationed escape
hatch is the strategy that eats the design — STET measured exactly this with its
hold verb, and unlimited pulled reactive play *down* while pushing patient play
up. Price it the same way and let the harness argue. <!-- model question -->

---

## Failure and pacing

A run ends when **no piece in hand can be legally placed anywhere** — the works
slot counts. The board genuinely saturates: overlap caps at 3, and a board of
all-3s, roads and blight admits nothing.

Target: **4–10 minutes**, 70–110 placements, 10–22 lines cleared. If runs come in
long, the lever is blight frequency, not board size.

---

## Mobile input

- **Drag to place.** The piece lifts on touch-down and renders **offset above the
  finger** by about one cell, with a grid-snapped ghost and per-cell legal/illegal
  tint. A thumb covers four cells; the piece must not be under it.
- **Roads show their sightlines.** While dragging a road piece, highlight the
  adjacencies it would create. This is the one rule that is invisible without
  help, and it is the whole reason the piece exists.
- **Tap to rotate**, in the rail, before the drag.
- **Illegal drops spring back** and are never consumed.
- **Everything interactive in the lower third.** Rail at the bottom (three zone
  slots, then the works slot, visually separated), board above, demand readout
  above that, skyline on top.
- **The preview shows the score** only when a placement completes a line.
- **The clear animation is the one indulgence.** Cells pop their scores, the strip
  lifts, the skyline grows by buildings at heights equal to their density. A thin
  single clear is over instantly; a dense matched-demand triple stops the screen.

Portrait only, 390 × 844 as the design target.

---

## What the model must answer

Three bots — `greedy`, `reacting` (one placement of lookahead), `thinking` (all
slots, rotations and positions) — and the gap between them is the skill curve.

| question | metric | what would falsify it |
|---|---|---|
| **Is 10×10 too big?** | clears per placement; runs that end in blight spiral | under one clear per six placements |
| **Does 9×9 + box clears beat it?** | same metrics, both geometries | if 9×9 wins on both pacing and run length, take it |
| Is uncapped road sightline too strong? | `thinking` score with cap ∞ / 6 / 4 | uncapped dominating every other strategy |
| Are roads ever worth a cell? | road placements per run for `thinking` | near zero — the piece is a tax, not a tool |
| Do specials arrive? | % of runs earning each of the four | any special under ~25% is decoration |
| Does density pay? | mean cells cleared at each density | density 3 rare — the core verb is decoration |
| Does synergy beat blobbing? | synergy bot vs same-zone bot | blobbing wins — the adjacency table is theatre |
| Is the bulldozer the strategy? | score and length at 0 / 3 / unlimited | unlimited raises the reactive bot |
| Is there a skill curve? | greedy vs reacting vs thinking | lookahead worth under ~40% — it's solitaire |

A bot cannot tell you whether dragging a J-piece with your thumb feels good, and
that is most of what a mobile puzzle game is. The input section is tuned by hand.

---

## MVP scope

### In

1. 10×10 board, seven tetrominoes, 3 zone slots + works slot, tap-rotate, drag-place
2. Three zones, water, blight
3. Density 1–3 by same-zone overlap; pips and darkness
4. **Roads: line-of-sight adjacency, works slot, 3-placement refill**
5. **Four special buildings, each on its own earn condition**
6. Row and column clears; clear-time synergy; population score
7. Three demand bars: growth, reduction, weighted bag, ×2 match, blight at 100
8. Rationed bulldozer
9. The skyline strip
10. Game over on no-legal-placement; local high score
11. Bot harness and `npm run model` before any balance claim is believed

### Out

- **Utilities — water, power, fire, health.** A second simulation over the first:
  coverage radii, per-cell service state, a parallel failure mode. The Power Plant
  is a *building*, not a grid, and that distinction is the whole scope boundary.
- **Ordinance / draft cards.** The roguelike layer wants a measured base to modify.
- **A fourth zone.** Three zones make three pairs; four make six.
- **Timers, cross-turn combos, dailies, accounts, ads, IAP.**
- **Landscape and tablet.**

### Milestones

| | |
|---|---|
| **M0** | pure rules module + tests: legality, overlap, road sightlines, clears, scoring. No UI. |
| **M1** | playable canvas build — drag, rotate, clear. Ugly. Answers "is the verb fun". |
| **M2** | roads and specials. Answers "is the second verb fun". |
| **M3** | demand, bag weighting, blight, bulldozer. The full loop. |
| **M4** | bot harness, `npm run model`, first balance pass, the 9×9 comparison. |
| **M5** | art pass against the chosen direction; skyline, clear animation, audio, haptics. |
| **M6** | real hardware, tune board size and blight rate, ship. |

M0 before M1 is not ceremony. Placement legality with overlap, plus road
sightline resolution, is the genuinely fiddly part and it wants to be pure and
tested before anything draws it.

---

## Still open

- **Rotation, or not?** 1010! and Woodoku both refuse it and their difficulty
  depends on the refusal. Ships on; a one-line experiment.
- **A 1×1 infill piece?** Enormous relief valve, obvious crutch. Perhaps rare in
  the bag, perhaps an ordinance later.
- **Do a clear's neighbours score too?** Currently only the line's own cells do.
- **Where does it live?** Its own repo, per the plan to hand one over. It shares
  no game code with STET and shouldn't pretend to.

---

## Tech

Vite, TypeScript, a React shell around a canvas board, vitest for rules,
`vite-node` scripts for the harness and screenshot checks.

The rules module must be **pure and cloneable** — `place(state, piece, at)`
returning a new state with no side effects. The bot harness, the placement
preview, the road sightline highlight and the tests all depend on it. STET's
`preview.ts` works only because `step()` is pure, and the same property buys the
same things here.

See `ART-DIRECTION.md` for the three visual directions and the image-generation
prompts.
