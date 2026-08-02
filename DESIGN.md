# STET — where it goes next

The README documents the game that exists. This documents the game that doesn't
yet, and why each piece is shaped the way it is. Anything here that touches a
rule is a candidate until `npm run model` says otherwise — that is the standing
rule of this project and nothing below is exempt from it.

Four things are wanted, in this order:

1. **The board should be unambiguous.** Striking without advancing is rule one of
   three, and right now the picture contradicts it.
2. **Combat should be explosive.** Slow neutral, then a stroke that resolves a
   lot. The pacing of a fight, not the pacing of a queue.
3. **A ranged hand.** A second way to play, not a second enemy.
4. **Roguelike texture** — but without an inventory, a menu, or a second input
   verb.

---

## Phase 1 — the picture (no rules change)

### The confusion, diagnosed

`renderer.ts` lunged the hero **0.46 of a tile** into the target and back over
185 ms, and left *nothing behind on the tile it came from*. For a fifth of a
second there was no mark anywhere on the page saying where you actually stood.
The eye tracked the only hero-shaped thing on screen, which was the one that had
moved. Then the next swipe resolved from a tile the player had stopped believing
in.

Worse, the `EXPOSED` ring — the single most important piece of state on the
board — was drawn at the *animated* position, so it travelled with the lunge too.
The one thing anchoring you to a tile was itself unanchored.

None of that is the mechanic's fault. The mechanic is load-bearing: `EXPOSED`,
the combo ladder and stagger all hang off "a bump is a swing, not a step".
Deleting it deletes the game. So the fix is entirely in what gets drawn.

### What changed

- **An anchor.** Four corner ticks on your true tile, always drawn, brightening
  as the body leaves. During a strike there are now two marks — where you *are*,
  and what you are *doing*. This is the fix; everything else is refinement.
- **The `EXPOSED` ring and its stet-marks stay on the true tile.** Only the brush
  mark travels.
- **A shorter, heavier lunge.** Reach 0.46 → 0.22–0.34 by weight, and the
  envelope reshaped from a symmetric 42/58 out-and-back into *snap out (16%),
  hold at extension, settle slowly*. A symmetric out-and-back reads as a step you
  took back. A held extension reads as a swing.
- **Impact moved to the top of the stroke.** The bump cue fired at 42% of the
  animation; it now fires at 16%, at full extension — which is also where the
  hitstop already freezes the frame, so the freeze now holds the pose instead of
  interrupting the travel.

### Kinetics

Hitstop was already there (`effects.freeze`, applied in `runtime.ts`). What was
missing was **range**. Everything cost about the same: every strike ran 185 ms
and froze for 40–72 ms, so nothing could feel explosive because nothing was
quiet. Contrast is the whole mechanism.

| | before | after |
|---|---|---|
| neutral step | 105 ms | **85 ms** |
| light stroke (1 dmg) | 185 ms, freeze 40 | **150 ms**, freeze 34 |
| heavy stroke (4+ dmg, or a kill) | 185 ms, freeze 72 | **300 ms**, freeze 120 |

Duration, reach, shake and freeze all scale off one `weight` derived from the
blow. A tap is over before you notice; a real blow stops the page.

These are eyeball numbers, not measured ones — the bot harness cannot feel
anything, so this is the one part of the project that is tuned by looking at it.
`node scripts/shots.mjs` captures the states worth checking.

### And a tell before you commit

Adjacent enemies get a faint blood-tinted bracket on their tile: *swiping here is
a strike, not a step*. The one categorical difference in the game's single input
verb is now visible **before** you spend the turn on it.

---

## Phase 2 — ship FLOW

`flowBonus` is a finished mechanic sitting behind a zero. It is wired end to end
already — `types.ts`, `engine.ts:282`, `engine.ts:383` — with `SHIPPED.flowBonus
= 0` and no presentation layer whatsoever.

Step out of a tile something had committed to strike, take no damage, and your
next stroke lands +2 and breaks any stance regardless of poise.

That is "wait for the moment, then strike powerfully" stated as a rule, and the
harness already blessed it: reacting **4 → 6**, 2-ply **7 → 12**, damage down on
every floor, clean clears up on every floor, and the ceiling/floor ratio
*tightening* to 3.8x — the floor rose faster than the top, which is the shape of
a good change.

The work is mostly presentation, because it has none: a charged stroke wants the
heavy timing from Phase 1, its own flourish, and a visible charged state on the
hero between the dodge and the punish. Re-run `npm run model` first to confirm
the table still holds after the Phase 1 timing changes (it should — nothing in
Phase 1 touches a rule).

---

## Phase 3 — the second hand: THE QUILL

A ranged **hero**, not a ranged enemy.

The constraint is the input: one direction, no buttons, no inventory. The
temptation is "swipe toward an enemy in the line and fire at it", and that fails
immediately — with up to seven enemies on a 5x5, most directions would stop being
movement, and a hero who cannot walk is not a hero.

### Draw, then loose

- **Swipe is always a step.** Movement never gets taken away.
- **Every step sets your facing**, and facing becomes real for the first time —
  it is the line you are aimed down. (It is currently cosmetic: set in
  `engine.ts:258`, read only by the renderer to rotate a glyph. A hero visibly
  turning toward a direction that means nothing is itself part of the Phase 1
  confusion, and this is what redeems it.)
- **Tap — or space — draws.** You do not move. You are `EXPOSED`.
- **Tap again to loose**, down your facing, at the first enemy in the line.
- **Holding the draw deepens it.** Each held turn is +1 damage, capped at 3 —
  the existing `combo` field, the existing HUD tally, the existing cap.
- **Stepping cancels the draw.** So does taking a hit.

The user's instinct was right and it is worth stating plainly: **exposure works
better here than it does on the melee hand.** For the swordsman, exposure is the
price of one stroke, resolved in a single turn. For the archer it is a price with
a *duration you choose*. Hold your nerve while a WARDEN closes and the shot gets
lethal; flinch early and it is a scratch. That is a charge meter made out of
turns, and it is the closest this game has come to the thing being asked for.

So: keep exposure. The only knob I would put in front of the harness is whether
drawing should double damage the way swinging does, or something gentler —
holding it for four turns is a very different bargain from holding it for one.
That is a `Rules` field and the bots can answer it.

### What makes it a different game, not a reskin

The bestiary re-reads completely without changing a single enemy:

| | against the sword | against the quill |
|---|---|---|
| **RAT** | trivial | trivial |
| **STALKER** | one clean telegraphed window | **the nightmare** — it closes diagonally, and diagonals are exactly what you cannot shoot |
| **CHARGER** | sidestep the line | a pure duel: it lines up on your axis to lunge, which is the axis you fire down |
| **WARDEN** | a rhythm — strike, step away, strike | you have all the time you want, and it eats shots |

That STALKER inversion is the reason to build this hand. It costs nothing and it
makes an existing enemy mean something new.

### The costs, so it is not simply better

- 5 HP, not 7. Glass.
- Melee is a flat 1 with no combo ladder. Being cornered is real.
- **The shot is stopped by blots and by other enemies.** A crowd shields its own
  back rank, so the game becomes about managing lines rather than distance, and
  blots finally do something besides block.

### Real work, named honestly

`bots.ts` submits exactly one direction per turn. A hero with a hold action has
five, and until the harness can play it, nothing about this hand is measured —
including whether it is broken. That is the bulk of the phase, and it comes
before shipping, not after.

Input is smaller than it looks: `useControls.ts` already separates a flick from a
drag by time, so a tap is a pointer down/up under both thresholds. Keyboard gets
space, and `.` for the vi keys.

---

## Phase 4 — scrolls and marginalia

Roguelike texture, chosen against inventory. Two systems, both zero-UI, no
currency, no rerolls, and **no XP bar** — kills are farmable by design (the spill
is an infinite supply, and the README already documents momentum-farming doing
exactly this). Depth is the curve.

### Scrolls are tiles, not items

A scroll lies on the board like a nib and **fires the instant you step on it**.
No menu, no held item, no second input verb — the same contract the vial already
honours.

- **Erasure** — every enemy on the board loses its committed action. The game's
  own core verb, board-wide.
- **Blotting** — drops two blots, reshaping the floor mid-fight.
- **Haste** — your next two strokes do not expose you.

### Marginalia are the run's shape

On descending, three choices drawn as annotations in the gilded margin; take one.
One tap, no inventory, and thematically exact — marginalia are what scribes wrote
in the margins of an illuminated page.

- **Nib** (offence): +1 damage · +1 combo cap · charged strokes hit harder
- **Vellum** (defence): +1 heart · exposure x2 → x1.5 · the first hit each floor
  is free
- **Hand** (tempo): a dodge also staggers · a kill buys one step

Each is a `Rules` delta, which means the existing harness can play a run with any
combination of them without new machinery.

---

## What is deliberately not here

- **An XP bar.** See above. Farmable.
- **A ranged enemy.** The SCRIBE was designed and set aside when the ranged ask
  turned out to be about the hero. It remains the best answer to the pace problem
  the README flags as unsolved — a unit that punishes standing still, so patience
  costs something that isn't the spill clock. Worth revisiting after Phase 3,
  when the aim-line vocabulary already exists.
- **Accelerating the spill.** Measured, repeatedly, at four different ramps. It
  makes floors faster *and* cleaner and still halves median depth, because you
  stop dying to the board and start dying to the clock.
