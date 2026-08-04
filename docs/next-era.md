# Handoff — building the next era

Written at the end of the session that shipped **II · The Typewriter**. Read this
before adding era III; most of it is things the harness overturned rather than
things anyone reasoned out in advance.

Branch: `claude/game-design-planning-7phipg`. 179 tests pass. The curve is
**4 / 5 / 12** (mindless / 1-ply / 3-ply median page), every bot dying 100%, no
stalled runs.

```
npm test              179 tests, ~12s
npm run model         rule variants against every bot
npm run bench         where the time in a turn goes
npm run shots:type    every glyph × every hand × every era's page
npm run shots:era     the same board in each era, plus the boss and an opening
npm run check:audio   fires every sound event in every era
```

---

## The one rule for adding an era

**An era must ask a different question, not wear a different coat.**

Era I threatens **tiles** — one tile, or a two-tile lunge — so every dodge in it
is a sidestep. Era II threatens **lines**, and the only answer to a line is to be
off it. That is what made era II a place rather than a reskin, and it is the
whole reason `threatBudget` saturating stopped mattering: the board escalates by
*quality* now, because a 5×5 board runs out of room long before it runs out of
difficulty.

So before writing any code, answer this: **what does era III threaten?** If the
answer is "the same things, but green", stop. The look is the cheap half.

---

## What already exists, so an era is now mostly data

| | where | note |
|---|---|---|
| `Era` | `game/eras.ts` | `id, name, roster, boss, chaff, hand, palette` |
| the hand | `render/glyphs.ts` | `Mark = 'brush' \| 'nib' \| 'type'` — **`nib` is unused by any era** |
| mark-making | `render/ink.ts` | `brushStroke`, `inkStroke`, `strikeStroke` |
| the page | `render/renderer.ts` | `makePaper` takes the era; `decorate()` branches to `illuminate` / `typeset` |
| the palette | `render/theme.ts` | `EraPalette` is a **delta** over day/night; `themeFor()` merges |
| the chrome | `game/runtime.ts` | `syncChrome(depth)` pushes palette → CSS vars, hand → `sfx` |
| effects | `render/effects.ts` | `effects.hand` branches splatter, flourishes, numerals |
| sound | `audio/sfx.ts` | `sfx.hand` branches step, strike, stagger, spill, drone |
| roster hygiene | `game/enemies.ts` | every kind declares `home`; `eras.test.ts` enforces it |

Adding an era is: one `ERAS` entry, one `EraPalette`, one `decorate` branch, its
native kinds, its boss, its chaff — and, if the medium needs one, a new mark
function beside `strikeStroke`.

**`Mark` already has an unused `nib` mode.** Every glyph was originally drawn in
it and it still renders correctly (see `npm run shots:type`, the `nib` row). If
an era wants a fine-line hand, it costs nothing.

---

## The decision you have been left: three eras or four

The original design was **manuscript → typewriter → terminal**. The idea of
re-cutting it as **brush/papyrus → nib → typewriter → word processor** came up
late and is unresolved. Both are defensible; here is the honest case for each.

### Recommended: era III · The Word Processor

Because it is the only candidate with an obvious **verb**, and the verb is the
natural next term in the sequence:

> tiles → lines → **rectangles**

A word processor threatens a **SELECTION**: a highlighted block, telegraphed a
turn ahead, that deletes what is inside it. That is a genuinely new question —
not "which tile" or "which line" but "get out of the box" — and a 5×5 board has
exactly enough room for it to be tense without being unfair.

It also has verbs nothing else in the game can express, if you want them:

- **The cursor**, blinking on a tile, *inserting* a body there on its beat — chaff
  generation with a position you can see coming and body-block.
- **Undo**, which reverts the board one turn. Terrifying and legible, and unlike
  anything era I or II does. (Careful: `step()` is pure, so an undo enemy means
  keeping one previous state. That is cheap now that `cloneState` exists.)
- **Autocorrect**, which moves *you* one tile in a direction of its choosing at
  the end of a turn. The only thing in the game that takes your position away.

Surface: white bond, a blinking caret, a selection highlight in the system blue.
Mark: `nib` will not do — a rendered glyph wants a fourth mode (`'raster'`),
which is the real cost of this era. Hard edges again, but aliased/stepped rather
than struck, and **no misregistration at all**: era I has variable pressure, era
II has none but keeps physical slop, era III has neither. That progression is
already documented in `eras.ts` and is worth keeping.

### The alternative: insert a nib era, making four

The appeal is real — the `nib` mark exists, the ladder strips something at each
step, and four eras is a longer descent.

The problem is the verb. **What does a nib era threaten that a brush era does
not?** If there is no answer, inserting it puts the *weakest* contrast in the
game right where a new player most needs to feel that they have gone somewhere —
between pages 4 and 5, immediately after the first boss.

The best verb I found for it is **range**: a nib flicks ink across the page, so
its kinds threaten single tiles *at a distance* rather than adjacent ones. That
is a real new question (distance, not adjacency) and it does sequence sensibly:
adjacency → distance → lines → areas. But note it collides with the parked
**Quill** (a ranged playable hero) — you would be spending the ranged idea on an
enemy era instead.

If you do insert it, know the cost: every depth past 4 shifts, era II's kinds are
tuned for pages 5–8 and would need re-measuring at 9–12, and `eras.test.ts`'s
depth arithmetic tests need updating. None of that is hard; it is just not free.

**My recommendation:** ship the word processor as era III. Revisit a nib era only
if you can name its verb in one sentence without using the word "looks".

---

## Things the harness overturned, so you do not rediscover them

Every one of these was built, measured, and rewritten. They are the expensive
part of what this session produced.

**A stationary threat that can be walked away from is a tax, not a threat.**
THE TYPEBAR first struck the column *it* stood in. Measured: 0.0–0.4 damage a
floor and about twenty-five extra turns on it. Nothing forces you into a fixed
column when there are four others, so everyone left, nobody was hit, and the only
thing it changed was how long a floor took. Aiming at the player's column made it
a read. *If a new kind can be ignored, it will be.*

**A chaser must chase on the axis it threatens.** THE CARRIAGE first chased by
plain distance, which parked it in your column as often as your row — and a row
sweep from your column misses entirely. It did less than half the typebar's
damage for the same time on the board while hitting twice as hard. It aligns its
row before closing now.

**Chaff has to be something which, ignored, kills you.** THE SEMICOLON first
alternated step and strike. A thing that never enters your tile and only threatens
on alternate beats can be ignored forever: four 3-ply runs in thirty stalled at
one health, farming spilled chaff for three and four thousand turns. That is the
spill's whole guarantee gone. A RAT walks *onto* you — that is the job.

**A boss whose only answer is damage is a stat check.** THE CARRIAGE RETURN first
struck a band of rows that grew until it covered the page. Once it covers
everything there is no dodge left, so the only strategy is to have out-damaged
it. Restated as a *shelter* — everything struck except a small safe place —
2-ply runs getting past went 27% → 52% and 3-ply 66% → 89%. **Skill should be
able to beat a boss without being hit.** Keep a hard deadline for the player who
cannot.

**A boss's clock must not be pausable by hitting it**, or the fight can be
stalled forever. Derive it from `floorTurns`, not from state on the boss.

**Every new intent kind must reach the bots.** `evaluate()` routes through
`intentThreatens` for exactly this reason. Open-coded pattern matching there is
what made the bots blind to the fade, and every number measured about that
mechanic was a measurement of the bot not knowing the rule.

**Recolouring an embellishment does not change its era.** A gilt vine in grey is
a manuscript with the lights off. Era I's margin is a *grown* thing (vine,
volutes); era II's is a *made* one (pinstripe, screw-heads). Change the shape, not
just the hex.

**Tune marks on a render grid, never on a live board.** `npm run shots:type` is
the reason the typed hand works: the test is not "does this look like a
typewriter" but "does the row still read left to right as the same creatures".
Two versions of `strikeStroke` failed that and looked fine in isolation.

**Screenshots catch what tests cannot.** The multi-row sweep telegraph rendered as
a *diagonal* — the engine was correct throughout and only the drawing lied. The
era title card was drawn on the board and was never once visible, because the
first floor of an era is by definition the floor after a boss and the card hand
is always over it.

**Write the comment, then write the test from it.** Two real bugs were found that
way this session: a carriage boxed in never reached its second beat, and
`carriageReturnPlan` claimed a shelter that did not exist.

---

## Build order that worked for era II

1. **The verb first, as an `Intent` if it needs one.** Era II added
   `{ kind: 'sweep'; path: []; tiles: Vec[] }`. Keeping the empty `path` meant
   every existing `intent.path` read stayed valid. Update `intentThreatens`,
   `execIntent`, the telegraph, and `evaluate` **in the same commit**.
2. **One kind that uses it**, so the balance delta is attributable to one thing.
3. **The second kind**, on the opposite axis if you can — a matched pair is
   legible against itself before either half is legible alone.
4. **The era entry**: roster, chaff, `home` on each kind, balance run.
5. **The boss.** Give it a dodge and a deadline.
6. **The hand**: a mark function, the palette, the page, the margin. Grid first.
7. **The effects and the sound.** Both have a `hand` field already.

Steps 1–5 are measurable; 6–7 are not, and need your eye.

---

## Acceptance criteria

Before calling an era done:

- `npm test` green, and **`cannot be stalled — every run ends` still passes.**
  That test is the oldest invariant in the project and every new kind has
  threatened it at least once.
- The curve has not collapsed. Baseline **4 / 5 / 12**; the reactive floor should
  barely move and the ceiling should come down by a gate's worth, not a wall's.
- `npm run check:audio` fires every event **in the new era** — add it to the
  `[era, depth]` loop in `scripts/audio-check.mjs`.
- `npm run shots:type` shows the new hand next to the others, and each row still
  reads as the same creatures.
- `npm run shots:era` shows the new page; add its depth to the list.
- The `home` test passes — no era rolls another's natives.

---

## Still parked, unrelated to eras

- **THE QUILL**, a ranged playable hero. THE LONG NIB and THE BROAD NIB were
  built as its prototype kit; play them before designing it.
- **Artifacts with randomly-paired boons and prices** (the Binding of Isaac
  curse-room idea). Never started.
- **Scroll tiles.** Never started.
