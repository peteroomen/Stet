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

## The two rules

Everything else is detail.

**You commit.** Stepping into a foe *strikes* it — and you do not advance. You
are mid-swing. For the enemy phase that immediately follows you are `EXPOSED`,
and everything that hits you does **double**. Strike again and the combo builds
(+1 damage a stroke, capped at +3) but you stay exposed the whole time. Step
away and you are safe, but the ladder resets and they close in.

**They commit too.** Every foe shows a ghost of exactly where it will be. That
telegraph is computed at the end of the previous turn and executed *unchanged* —
it is a promise, not a prediction. So a charger's two-tile lunge can be baited
into empty paper by stepping out of the line, and it will sail past you.

Those two together make the board readable exactly one turn ahead, which is the
whole game: not "what will happen", but "what am I willing to pay for this".

## The floor

Clear every foe to break the wax seal on the stairs. The stairs are visible from
the moment you arrive so you can plan the floor around them.

**But the page fills.** Every foe moves at exactly your speed, so on an open
board you could weave away forever — and a game about commitment cannot have
patience as its optimal strategy. After a floor's grace runs out, ink wells up
and something climbs out of it, on a cadence. Killing outpaces spilling
comfortably. Aggression clears a floor; timidity drowns in one.

## The hands

| | | HP | Damage | Rule |
|---|---|---|---|---|
| `⋀` | **Rat** | 1 | 1 | One step toward you, every turn. Dies to a single stroke. |
| `◇` | **Stalker** | 2 | 1 | Closes on the diagonal, but must step square-on to strike. |
| `»` | **Charger** | 3 | 2 | Winds up, then lunges two tiles in a line. Sidestep it. |
| `▥` | **Warden** | 5 | 3 | Slow, heavy, does not stop. |

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
  render/     canvas: hand-inked strokes, particles, screenshake, themes
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

## Balance is measured, not asserted

`src/game/balance.test.ts` plays hundreds of full runs with bots of increasing
lookahead. Because enemies commit to their telegraphs, the enemy phase is fully
determined — so N-ply search is *exact*, not heuristic, and its results are
genuinely available to a human reading the same board. The spread between bots
is therefore a real measurement of the skill ceiling:

| Bot | Median depth | Deepest |
|---|---|---|
| Mindless — walks at the nearest foe and bumps it | **2** | 4 |
| Reacting — one ply, sees only its own next move | **3** | 10 |
| Thinking — three plies, plans two moves ahead | **8** | 83 |

Thinking ahead is worth roughly four times the depth of bumping into things.
That gap is the design working.

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

Swipe, arrows, `WASD`, or `hjkl`. Holding a drag and tracing a path walks tile
by tile — the swipe origin re-anchors each time a direction fires. `Enter` to
begin, `R` to go again. Fully keyboard operable.

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
