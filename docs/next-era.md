# Handoff — building the next era

Written at the end of the session that shipped **III · The Word Processor**. Read
this before adding era IV; most of it is things the harness overturned rather
than things anyone reasoned out in advance.

Branch: `claude/pr-merge-handoff-v5bp1y`. 198 tests pass. The curve is
**4 / 5 / 12** (mindless / 1-ply / 3-ply median page), every bot dying 100%, no
stalled runs — unmoved by era III, which is a finding in itself and is dealt with
below.

```
npm test              198 tests, ~24s
npm run model         rule variants against every bot
npm run bench         where the time in a turn goes
npm run shots:type    every glyph × every hand × every era's page
npm run shots:era     the same board in each era, plus both bosses and an opening
npm run check:audio   fires every sound event in every era
```

---

## The one rule for adding an era

**An era must ask a different question, not wear a different coat.**

Era I threatens **tiles** — one tile, or a two-tile lunge — so every dodge in it
is a sidestep. Era II threatens **lines**, and the only answer to a line is to be
off it. Era III threatens **areas**, and an area is the first thing in the game
that one step cannot answer: from the middle of a three-by-three, one step is
still inside it. So its counterplay is not a dodge but a route — you have to have
been leaving already.

That progression is the whole reason `threatBudget` saturating stopped mattering:
the board escalates by *quality*, because a 5×5 board runs out of room long
before it runs out of difficulty.

So before writing any code, answer this: **what does era IV threaten?** If the
answer is "the same things, but green", stop. The look is the cheap half.

---

## What already exists, so an era is now mostly data

| | where | note |
|---|---|---|
| `Era` | `game/eras.ts` | `id, name, roster, boss, chaff, hand, palette` |
| the hand | `render/glyphs.ts` | `Mark = 'brush' \| 'nib' \| 'type' \| 'raster'` — **`nib` is still unused by any era** |
| mark-making | `render/ink.ts` | `brushStroke`, `inkStroke`, `strikeStroke`, `rasterStroke` |
| the page | `render/renderer.ts` | `makePaper` takes the era; `decorate()` branches to `illuminate` / `typeset` / `chrome` |
| the palette | `render/theme.ts` | `EraPalette` is a **delta** over day/night; `themeFor()` merges |
| the chrome | `game/runtime.ts` | `syncChrome(depth)` pushes palette → CSS vars, hand → `sfx` |
| effects | `render/effects.ts` | `effects.hand` branches splatter, flourishes, numerals |
| sound | `audio/sfx.ts` | `sfx.hand` branches step, strike, stagger, spill, drone |
| roster hygiene | `game/enemies.ts` | every kind declares `home`; `eras.test.ts` enforces it |
| verbs | `game/types.ts` | `Intent` is `move` \| `sweep` \| `select` \| `wind` \| `hold` |

Adding an era is: one `ERAS` entry, one `EraPalette`, one `decorate` branch, its
native kinds, its boss, its chaff — and, if the medium needs one, a new mark
function beside `rasterStroke`.

**`Mark` still has an unused `nib` mode.** Every glyph was originally drawn in it
and it still renders correctly (see `npm run shots:type`, the `nib` row). If an
era wants a fine-line hand, it costs nothing.

---

## The decision you have been left: what is left to threaten

Three eras are built and the geometric ladder is finished. Tiles, lines, areas —
a 5×5 board has no fourth shape worth having. So era IV cannot be another
geometry, and that is the actual problem to solve rather than a detail of it.

Three candidates survive that constraint.

### The page itself

Era III already edits the page — THE CURSOR pushes you one tile along the line it
struck, and it is the first thing in the game that moves you. That verb is barely
used, and it is the most promising unspent idea here: an era whose threats
**rearrange the board** rather than damage it. Tiles that swap, bodies pulled
into line, a floor that reflows under you. The damage would come from where you
end up, which is a different kind of pressure from anything in the first three.

Costed: the machinery exists (`displaces`, `insert`, `openPage`, the `shove`
event, and the rule that displacers act last). It would be extended, not
invented.

### Time, not space

Nothing in the game threatens a *turn*. Every kind commits one turn ahead and
resolves; an era whose threats are about **when** rather than **where** would be
genuinely new — something that acts twice in a turn, or on a beat you do not get
to see, or that takes the turn itself.

The warning: this game's readability contract is "a telegraph is a promise, not a
prediction". A threat you cannot see coming breaks it outright, and every rule in
this project that broke it measured as unfair rather than hard. A threat that
arrives *sooner* than you expected is the version that survives the contract.

### Insert a nib era, making four

Still the appeal it always had — the `nib` mark exists, the ladder strips
something at each step — and it is a worse idea now than it was one era ago. It
belongs between eras I and II, so **every depth past 4 shifts**: era II's kinds
are tuned for 5–8 and era III's for 9–12, and both would need re-measuring one
era deeper. Not hard; no longer nearly free.

Its best verb was **range** — a nib flicks ink across the page, so its kinds
threaten single tiles at a distance rather than adjacent ones. Real, and it
sequences (adjacency → distance → lines → areas), but it collides with the parked
**QUILL** (a ranged playable hero) and spends the ranged idea on an enemy era.

**My recommendation:** the page itself. It is the only candidate whose verb is
already proven in play, it does not fight the readability contract, and it is the
natural next term after "an area of the page is deleted" — an area of the page is
*moved*.

---

## Things the harness overturned, so you do not rediscover them

Every one of these was built, measured and rewritten. They are the expensive part
of what these sessions produced. The first block is standing; the second is what
era III added.

### Standing findings

**A stationary threat that can be walked away from is a tax, not a threat.**
THE TYPEBAR first struck the column *it* stood in: 0.0–0.4 damage a floor and
about twenty-five extra turns on it. *If a new kind can be ignored, it will be.*

**A chaser must chase on the axis it threatens.** THE CARRIAGE first chased by
plain distance, which parked it in your column as often as your row — and a row
sweep from your column misses entirely.

**Chaff has to be something which, ignored, kills you.** THE SEMICOLON first
alternated step and strike, and four 3-ply runs in thirty stalled at one health
farming it for thousands of turns. A RAT walks *onto* you — that is the job.

**A boss whose only answer is damage is a stat check.** Restated as a *shelter*,
THE CARRIAGE RETURN took 2-ply runs past it from 27% → 52% and 3-ply from 66% →
89%. **Skill should be able to beat a boss without being hit.** Keep a hard
deadline for the player who cannot.

**A boss's clock must not be pausable by hitting it.** Derive it from
`floorTurns`, not from state on the boss.

**Every new intent kind must reach the bots.** `evaluate()` routes through
`intentThreatens` for exactly this reason. Open-coded pattern matching there is
what made the bots blind to the fade.

**Recolouring an embellishment does not change its era.** A gilt vine in grey is
a manuscript with the lights off. Change the shape, not just the hex.

**Tune marks on a render grid, never on a live board.** The test is not "does
this look like a word processor", it is "does the row still read left to right as
the same creatures".

**Screenshots catch what tests cannot.** Each of the last two eras has shipped a
bug that no assertion could see.

**Write the comment, then write the test from it.**

### What era III added

**An area needs a beat that a line does not.** THE SELECTION first went mark →
delete, one move of warning, and the numbers were brutal: over forty 3-ply runs
past depth 9 it did **54% of the entire era's damage** on a sixth of the
board-time of a WARDEN — about twelve times the damage per turn on the page of
anything else in the game. One move is enough to leave a row and is not enough to
leave a three-by-three. Three beats halves the rate and makes the dodge honest,
and it reads better, because the turn it buys is the turn the *shape* is on the
page rather than just a dot.

**Damage is not the lever for a threat a good player dodges.** Raising the
selection from 2 to 3 moved the whole-run curve not at all — the 3-ply median
stayed at 12 and its own damage share went *down*, because the bots avoided it
harder. A dodgeable kind's damage number only ever lands on weaker players, so it
raises the floor's difficulty rather than the ceiling's. To gate a thinking
player, **deny them space**; do not hit them harder.

**A rule about how you may move is not a rule if it applies half the time.**
THE AUTOCOMPLETE was `slow` at first — aiming at your momentum every other turn,
3.8% of the era's damage, pure background. Acting every turn it does 10% and,
more to the point, it *means what it says*: carrying straight on is always
punished, and the answer is always available. The SEMICOLON's lesson in another
shape.

**A boss's health barely matters; its clock is the whole fight.** Confirmed for
the second time. THE SELECT ALL was tuned entirely on its rate and on how much
clear paper each pass keeps — from `2 + 2·pass` tiles a turn keeping a whole row,
to `3 + 2·pass` keeping one row less — which took its damage share from 6.0% to
11.7% while the whole-run curve did not move. Its health was never touched.

**Anything that displaces you must act last in the enemy phase.** Otherwise a
CURSOR can push you into a block a SELECTION was about to delete, or out of one,
purely on array order — and nothing on the board could tell you which. Displacers
last states the fair rule once: you can be pushed into a shape that has not gone
off yet, never into one that already has. A stable partition, so eras with
nothing that displaces run in exactly the order they always did.

**The page was drawn one era stale, and had been since era II shipped.**
`renderer.draw()` read `this.theme` *before* updating `this.palette` from the
era, so the first frame of a new era used the previous era's colours — and
`makePaper` then baked that page and cached it under the *new* era's key, where
nothing would ever rebuild it. Every era II floor has been played on era I's
paper. Found by looking at `npm run shots:era` and seeing blue foolscap rules on
a white bond page. No test could have caught it and none does now. **If you add
an era, look at the screenshot.**

**A quantised mark merges close parallel detail exactly like a wet one.**
`rasterStroke` takes `brushPaths` where they exist, which looks wrong and is not:
at full width the WARDEN's three body bars closed into a solid rectangle and it
stopped reading as barred. And quantising *finer* than the stroke width thins the
whole hand — at two thirds, era III's actors read a third lighter than era II's
on the same page, which is a weight difference masquerading as an era difference.

**Two kinds that read alike at a glance is the one failure a silhouette cannot
have.** THE SELECTION was first a solid box with bars in it, which is very nearly
the WARDEN. Marching ants — eight short runs with gaps between them — says
selection and cannot be mistaken for a body.

---

## The honest finding about era III, which is era IV's problem

**Era III did not cost the ceiling anything.** Measured on the same seeds and the
same bots, with era III present and with it removed (with it gone, the descent
past depth 8 simply repeats era II):

| | 3-ply median | mean | deepest | die in 5–8 | reach 13+ |
|---|---|---|---|---|---|
| era III removed | 12 | 14.5 | 32 | 16 / 60 | 27 / 60 |
| era III | 12 | 14.7 | 33 | 16 / 60 | 29 / 60 |

The reactive floor did not move either — mindless 4, 1-ply 5, both unchanged. So
era III is a **lateral swap**: as hard as the typewriter repeated, in a new
idiom, with the deaths inside it very slightly redistributed toward its own
opening floor.

Whether that is a success depends on what you think an era is for. It satisfies
"the curve has not collapsed" and it changes what the deep game *is*. It does not
satisfy "the ceiling should come down by a gate's worth", and the reason is worth
stating plainly, because it will be true of era IV as well:

**every threat in era III is dodgeable by a player who reads the board, by
design** — and a 3-ply bot is exactly that player. Its selections are answered by
two correct steps, its autocomplete by one change of direction, its boss by a
route it can see several turns ahead. What actually ends deep runs is the spill
cadence, which no era touches.

So if the next era is meant to be a gate rather than a place, the lever is not
another kind. It is either the era-scale pressure that already ends runs (the
spill, `spillEvery`, the drown) or a threat that is dodgeable but **costs you
something to dodge** — the one thing none of the three eras has.

---

## Build order that worked, twice

1. **The verb first, as an `Intent` if it needs one.** Era II added `sweep`; era
   III added `select` — the same tile-set idea plus a `release` flag, so a shape
   can be drawn for turns before it is a blow. Keeping the empty `path` meant
   every existing `intent.path` read stayed valid both times. Update
   `intentThreatens`, `execIntent`, the telegraph and `evaluate` **in the same
   commit**.
2. **One kind that uses it**, so the balance delta is attributable to one thing.
3. **The second kind**, opposed to the first — era II's pair is two axes, era
   III's is "leave" against "do not carry on in a straight line". A matched pair
   is legible against itself before either half is legible alone.
4. **The era entry**: roster, chaff, `home` on each kind, balance run.
5. **The boss.** Give it a dodge and a deadline, both off `floorTurns`.
6. **The hand**: a mark function, the palette, the page, the margin. Grid first,
   then `npm run shots:era`, and *look at it*.
7. **The effects and the sound.** Both have a `hand` field already.

Steps 1–5 are measurable; 6–7 are not, and need your eye.

---

## Acceptance criteria

Before calling an era done:

- `npm test` green, and **`cannot be stalled — every run ends` still passes.**
  That test is the oldest invariant in the project and every new kind has
  threatened it at least once.
- The curve has not collapsed. Baseline **4 / 5 / 12**; the reactive floor should
  barely move, and if the ceiling moves it should be by a gate's worth rather
  than a wall's. Report the number either way — era III's is above.
- `npm run check:audio` fires every event **in the new era** — add it to the
  `[era, depth]` loop in `scripts/audio-check.mjs`.
- `npm run shots:type` shows the new hand next to the others, and each row still
  reads as the same creatures.
- `npm run shots:era` shows the new page and its boss; add both depths to the
  list — and look at the result rather than at the exit code.
- The `home` test passes — no era rolls another's natives.

---

## Still parked, unrelated to eras

- **THE QUILL**, a ranged playable hero. THE LONG NIB and THE BROAD NIB were
  built as its prototype kit; play them before designing it.
- **Artifacts with randomly-paired boons and prices** (the Binding of Isaac
  curse-room idea). Never started.
- **Scroll tiles.** Never started.
