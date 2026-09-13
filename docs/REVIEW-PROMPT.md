# Design review request — an unnamed mobile shape-puzzle city builder

You are a senior game designer with shipped mobile puzzle titles and a working
knowledge of the city-builder genre. Below is a complete design for a mobile
game that has **not been built yet** — no code exists. I want an adversarial
review before a line is written.

**What I want from you**

1. **Find the exploit.** Assume a player who wants to break this. Is there a
   dominant strategy, a degenerate loop, or a way to play that makes the
   interesting decisions disappear? This is the most valuable thing you can give
   me.
2. **Find the rules ambiguity.** Anywhere two readings of a rule give different
   results is a bug I'll ship. Be pedantic.
3. **Answer the eight questions at the end.** They're the decisions I'm stuck on.
4. **Tell me what to cut.** The MVP grew. Assume it's 20% too big and name what
   goes.

**What not to spend time on:** monetisation, marketing, live-ops, art production
pipelines, or telling me to playtest (I know). Don't restate the design back to
me. Be blunt; I'd rather be wrong now than in six weeks.

---

# THE DESIGN

## One-paragraph pitch

A 10×10 board. A hand of three tetrominoes, colour-coded by city zone, plus a
fourth slot holding a road piece. Drag one onto the board with your thumb. Fill a
row or column and that strip **completes** — it leaves the board and rises into a
skyline strip above, banking population. What a line is worth depends on what you
built next to what, how dense you built it, and what your roads connect. Three
demand bars climb every turn; clearing a line feeds the zone it's made of; a bar
that fills drops permanent blight on your board. A run ends when nothing in your
hand fits anywhere. Four to ten minutes. Portrait, one thumb, no timer.

## The three core rules

**1. You place, you don't drop.** No gravity, no clock. A piece goes exactly
where you put it. (Reasoning: Tetris is a dexterity game whose adjacency is
accidental because you can't choose it; a city builder's pleasure is choosing.
Drag-and-drop from a hand is the proven mobile-first form — 1010!, Woodoku.)
Because nothing settles downward, **rows and columns both clear**.

**2. You can build on top of yourself.** A placement is legal if every cell it
covers is empty **or** the same zone at density below 3. Covering an empty cell
makes it density 1; covering a same-zone density-*n* cell makes it *n*+1. This is
the game's distinguishing verb — no block puzzle allows overlap.

**3. Clearing is a harvest, not a demolition.** The board is the construction
site; the city is the skyline strip above it, which only ever grows. (Reasoning:
otherwise the game asks you to arrange a district lovingly and then bulldoze it
for points.)

## Zones and cell states

Three zones: **Residential** (green), **Commercial** (blue), **Industrial**
(amber). Density 1–3, shown as darker colour **and** 1–3 pips (colour alone is
nine states to distinguish at ~35px, some players colourblind).

Other cell states:
- **Empty** — buildable.
- **Water** — 2–8 per run seed, permanent, unbuildable, never clears. Purely an
  obstacle and a variety generator.
- **Blight** — grey, density 1, cannot be overlapped, scores 0, gives −5 to every
  neighbour, but **counts as filled** for line completion. The only thing that
  makes the board permanently worse.
- **Road** — see below.

## Roads

A road cell has no zone and no density. It cannot be upzoned or built over. It
**scores nothing itself** and **counts as filled** for completing a line — so a
road is a cheap way to close a row that produces no population.

**What a road does: it makes adjacency see through it.** When scoring a cell,
look outward in each of the four directions and step through consecutive road
cells; the first non-road cell you reach is that direction's neighbour. So a
house three cells from a shop, with road between, scores the full R–C bonus.

*Why this formulation:* the obvious alternative — "cells connected to the same
road network count as adjacent" — is a graph problem with combinatorial blow-up,
no way to draw the answer, and no way for a player to estimate a placement.
Line-of-sight keeps **every cell at exactly four neighbours**; roads only change
*which* four. Range is **uncapped** at MVP (a long avenue reaches as far as it
runs).

**Supply:** the hand rail has 3 zone slots plus a **works slot** holding a road
piece (straight 1×2, 1×3, 1×4, or a 3-cell L-bend). The works slot refills **3
placements after it is spent**. Roads never enter the zone bag.

## Special buildings

Earned, never drawn. An earned special occupies the works slot until placed,
pausing road refills — so a special costs you a road.

| Special | Size | Earned by | Effect |
|---|---|---|---|
| **Park** | 1×1 | a single clear worth 300+ | scores 0; gives **+5 to every adjacent cell of any zone**; cannot be upzoned |
| **Transit Stop** | 1×1 | clearing a row and a column with one placement | its **entire row and column conduct adjacency** as if road |
| **Stadium** | 2×2 | clearing 8 density-3 commercial cells (cumulative) | all four cells score as density-3 commercial and give **+5 to all neighbours**; cannot be upzoned or bulldozed |
| **Power Plant** | 2×2 | your third blight event | scores as density-3 industrial **×1.5**, but **−8 to every neighbour**, every zone, no exception |

Each is earned by a different kind of play — one big clear, one precise clear,
one long specialisation, one accumulation of failure — so no single line
dominates. The Power Plant deliberately turns the punishment mechanic into a
tool, and creates the game's best placement problem: where do you put a thing
that ruins everything near it?

## Scoring

Evaluated **only at the moment a line clears**, for the cells in that line,
against their four neighbours (as resolved through roads) as they stand right
then. *Why clear-time only:* continuous evaluation means a running total nobody
can track on a phone, and clear-time evaluation makes *when* you close a row a
skill.

| Pair | Value |
|---|---|
| R – C | **+5** |
| C – I | **+5** |
| R – I | **−8** |
| same zone | **0** (it pays in density instead) |
| any – blight | **−5** |
| any – park / stadium | **+5** |
| any – power plant | **−8** |
| any – water / road / empty | **0** |

**Synergy scales with the neighbour's density.** A residential cell beside a
density-3 factory takes −24; beside a density-3 high street it gains +15.

```
cell = max(0, 10 × own_density + Σ pair_value × neighbour_density)
line = Σ cell
run  = Σ line × multipliers
```

Multipliers on the line: **×2** if its plurality zone is the currently highest
demand bar; **×N** if one placement completes N lines.

Score is **population** — one number.

**Worked example.** A row of eight residential/commercial cells (four R at
density 2, then four C at density 1), with one density-3 industrial cell directly
below the leftmost R:
- leftmost R: `10×2 + (−8 × 3)` = −4 → floors to **0** (one factory erases it)
- two interior R: **20** each
- R at the R/C seam: `10×2 + (5×1)` = **25**
- C at the seam: `10×1 + (5×2)` = **20**
- three remaining C: **10** each

Line = 115. Residential is top demand, so ×2 = **230**. Move the factory two
tiles away and the same eight cells score 250; make it commercial and 275.

*Note: the floor at 0 is provisional — allowing negatives makes a bad placement
genuinely punishing rather than merely wasteful.*

## Demand

Three bars, 0–100, above the board.

| | |
|---|---|
| Start | R 30 · C 25 · I 20 |
| Growth | **+2 to every bar, per placement** |
| Reduction | a clear drops each zone's bar by the **summed density of that zone's cells in the line** |
| At 100 | **blight event** — one blight cell spawns on a random empty cell; the bar resets to 60 and its growth rate rises permanently by +1 |

Demand does three jobs:
1. **It steers the piece bag** — zone colours are drawn with weight proportional
   to current demand, so neglecting industry fills your hand with amber.
2. **It doubles your score when served** (the ×2 above).
3. **It cannot be satisfied.** Closing a line adds +8 to +10 across all three bars
   while draining one. You can hold one bar flat, never three. The run's arc is
   choosing which zone to fail; blight is the bill.

## The bulldozer

One charge to start, **+1 every 4 lines cleared**, capped at 3. Erases one cell
to empty. Cannot touch a stadium.

*Tension:* a game where one bad drag quietly dooms a run teaches players to stop
taking risks; but an unrationed escape hatch becomes the whole strategy.

## Failure and pacing

A run ends when **no piece in hand can be legally placed anywhere** (works slot
included). The board genuinely saturates: overlap caps at 3, and a board of
all-3s, roads and blight admits nothing. Target: **4–10 minutes**, 70–110
placements, 10–22 lines cleared. Difficulty comes from board degradation
(blight), not from a tightening clock.

## Mobile input

- Drag to place; the piece renders **offset one cell above the finger** with a
  grid-snapped ghost and legal/illegal tint (a thumb covers four cells).
- Dragging a road **highlights the sightlines it would create** — this rule is
  invisible without help.
- Tap a rail slot to rotate before dragging. Illegal drops spring back, never
  consumed.
- Everything interactive in the lower third: rail at the bottom, board above,
  demand readout above that, skyline on top.
- The placement preview shows a score **only** when the placement completes a
  line; otherwise the board becomes arithmetic.
- Portrait only, 390×844 design target.

## MVP scope

**In:** 10×10 board · seven tetrominoes · 3 zone slots + works slot · rotate ·
drag-place · three zones + water + blight · density 1–3 via overlap · roads with
line-of-sight adjacency · four specials · row and column clears · clear-time
synergy · three demand bars with weighted bag, ×2 match and blight · rationed
bulldozer · skyline strip · game over on no-legal-placement · local high score ·
a headless bot harness for balance.

**Explicitly out:** utilities as a coverage simulation (water/power/fire/health
radii — the Power Plant is a *building*, not a grid, and that's the scope
boundary) · ordinance/draft cards (the roguelike layer, wants a measured base
first) · a fourth zone (three zones make three pairs; four make six) · timers ·
cross-turn combos · dailies · accounts · ads/IAP · landscape and tablet.

---

# THE NAME

Undecided. Shortlist, all real urban-planning vocabulary:

| Name | Meaning | Case | Cost |
|---|---|---|---|
| **INFILL** *(current pick)* | building on vacant lots between what exists | names the literal verb (fitting shapes into gaps) **and** the theme (density over sprawl) | slightly technical |
| **PLAT** | the surveyed subdivision drawing | four letters, hard consonants, great wordmark, unclaimed | obscure |
| **MIXED USE** | mixed-use zoning | states the game's thesis — mixing zones is what scores | two words |
| **BOROUGH** | a city division | warm, unmistakably urban, great icon word | says nothing about the puzzle |
| **RIGHT OF WAY** | the land strip a road occupies | apt now roads are in; *ROW* is both its abbreviation and what you clear | three words |
| **VARIANCE** | permission to break zoning rules | perfect for the later ordinance layer | cold, abstract |
| **SETBACK** | mandated gap from a lot line | strong double meaning | the other meaning is a reversal |
| **BUILDOUT** | developing a site to full capacity | exactly what density 3 is | generic |

Ruled out: SPRAWL and PARCEL (both taken by existing games), GRIDLOCK
(overused, negative), UPZONE (the previous working title — people read it as two
words and "up" sounds like a tutorial verb).

---

# THE ART DIRECTION

Three candidates. The constraint: at 390px wide a 10×10 board gives each cell
~35px, and that cell must communicate **zone** (3-way), **density** (3-way, and
it must survive colourblindness), **whether a road runs through it and which
way**, and **blight/water/special**. Most "cute city game" art fails exactly
there.

**A — "16-bit Planning Office."** Top-down pixel art, SNES SimCity lineage,
tight palette, dithered shadows, density as taller sprites. *Pro:* pixel art was
designed for legibility at small sizes; cheap to iterate; nostalgia. *Con:*
crowded shelf; most likely to read as an asset-store default.

**B — "Toybox."** Flat vector cartoon, bold rounded shapes, thick outlines,
saturated, one flat shadow; buildings like painted wooden blocks; density is
literally a taller stack. *Pro:* maximum legibility at 35px by a distance;
cheapest to produce and animate; best app icon. *Con:* it's what most casual
puzzle games look like, and least "real city" of the three.

**C — "Massing model" (my pick).** The board is a physical architectural model:
chipboard and basswood blocks on a drafting table, painted flat by zone, lit by a
low raking light, shot from directly above. **Density reads through block height
and shadow length.** Roads are white tape, water is frosted acrylic. The skyline
strip above is the opposite — a painted watercolour elevation panorama, the one
place with detailed "real city" art, where there's room to draw it properly.
*Pro:* shadow is a free third channel for density that colourblind players also
get; it stops asking a 35px tile to be a city and lets it be the *plan* of one,
which is what it is; nobody looks like this. *Con:* shadows + colour + pips can
get noisy; most expensive to keep coherent.

---

# THE EIGHT QUESTIONS

1. **Is the overlap/density rule actually enough differentiation** from 1010! and
   Woodoku, or is this a reskin with extra arithmetic? Be harsh.
2. **10×10, or 9×9 with 3×3 district clears?** The bigger board makes roads and
   2×2 specials meaningful, but clears get rarer — and clears are both the
   dopamine and the *only* demand valve. If clear frequency drops below ~1 per 6
   placements, every run becomes a blight spiral. Woodoku's 9×9-plus-boxes
   geometry exists precisely to solve this, and would make "district" literal.
   Which would you ship?
3. **Does road line-of-sight break?** Uncapped range on a 10-wide board — can a
   player build an avenue that trivialises scoring? Should it cap at 4 cells?
4. **Are the four specials reachable and balanced?** Especially: is "third blight
   event → Power Plant" rewarding failure in a way that inverts the difficulty
   curve?
5. **Is clear-time-only scoring a mistake?** It makes timing a skill, but it also
   means the board's value is invisible until you commit. Does that read as depth
   or as opacity?
6. **Is the demand-weighted bag help or punishment?** Flooding a player with the
   colour they're behind on is thematically right and possibly miserable.
7. **Is the score floor at 0 too kind?** Negatives make a bad placement genuinely
   punishing; the floor makes it merely wasteful.
8. **What's the one mechanic to cut, and the one thing missing?**

Then: **which name, and which art direction** — and say why in one line each.
