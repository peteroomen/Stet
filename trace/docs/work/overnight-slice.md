# The overnight slice — plan

Goal: a playable game by morning. Wire through 4-bit adder, on a phone, with progression and
persistence. Compresses the handoff's Phases 1–4.

---

## 1. Stack

| choice | why |
|---|---|
| **Vite + React 19 + TypeScript** | Departure from the handoff, which specified Next.js 15 App Router static export. The game is one canvas and some chrome; there are no routes worth an App Router, share codes live in a URL fragment with no backend, and Vite's dev loop is materially faster to iterate a renderer against. Stet already uses Vite, so the shape is familiar. Reversible later — nothing here depends on the bundler. |
| **Canvas 2D**, two layers | Static layer (board, wires, component bodies) drawn to an offscreen canvas, repainted only on edit. Dynamic layer (lit nets, pulses, cursor, selection) per frame. DOM dies at a few hundred nodes on mobile; WebGL buys nothing at this size. |
| **Zustand** for UI state only | Tool, level id, run/pause, tick rate, unlocks, stars. **The grid, nets and components never enter React state** — they live in a module singleton behind the Phase 1 API. This is the single mistake that would make it unplayable on a phone. |
| **Tailwind v4** for chrome only | Menus, palette, modals. The play surface is one `<canvas>`. |
| **Vitest** | Sim truth tables, level solvability harness. |
| **localStorage** via `zustand/persist` | Progress, stars, blueprint library. No auth, no Supabase in this slice. |
| no game framework | The sim is a few hundred lines of typed-array code. Phaser would add ~1MB and solve nothing. |

PWA manifest and service worker are *not* in this slice — they are polish and they complicate
the dev loop. Phase 6, as planned.

---

## 2. Levels

Fourteen levels in four chapters, plus sandbox. Palette restriction per level is the difficulty
curve; solving a level grants its component.

### Chapter 1 — Wire
| # | title | teaches | palette | par |
|---|---|---|---|---|
| 1 | Continuity | drawing, nets, that a wire is a node | wire | 0 comp |
| 2 | Invert | components exist and cost a tick | wire, inverter | 1 comp / 1 tick |
| 3 | Fan-out | one net can drive many sinks | wire | 0 comp |
| 4 | Either | the junction; OR is free | wire, junction | 0 comp / 0 tick |
| 5 | Crossing | routing two signals past each other | wire, crossover | 0 comp |

### Chapter 2 — The gate set
Ordered by **ascending cost in this universe**, which is the chapter's actual lesson: NOR is
cheapest here, AND is dearest. That is inverted from CMOS intuition and it teaches that gate
cost is a property of the substrate, not of the truth table.

| # | title | is | build | par | unlocks |
|---|---|---|---|---|---|
| 6 | Neither | NOR | junction → inverter | 1 comp / 1 tick | NOR |
| 7 | Not both | NAND | ¬a ∨ ¬b — two inverters and a junction | 2 comp / 1 tick | NAND |
| 8 | Both | AND | ¬(¬a ∨ ¬b) — De Morgan, three inverters | 3 comp / 2 tick | AND |
| 9 | One or other | XOR | (a ∨ b) ∧ ¬(a ∧ b) | 3 comp / 4 tick | XOR |

Level 8 is the centrepiece of the first hour. De Morgan arrives as something the player finds
by fiddling with level 7's leftovers, not as a lecture.

### Chapter 3 — Arithmetic
| # | title | build | unlocks |
|---|---|---|---|
| 10 | Half adder | XOR for sum, AND for carry | half adder |
| 11 | Full adder | two half adders, carries joined | full adder |
| 12 | Four bits | four full adders chained; shows carry latency growing | adder-4 |

### Chapter 4 — Stretch, cut first if the night runs short
| # | title | build |
|---|---|---|
| 13 | Read-out | 2-bit input → seven-segment showing 0–3. First decoder, first display. |
| 14 | Hold | SR latch from two NORs. First feedback loop, first memory. |

### Sandbox
Unlocked from the start, stocked with everything earned. Free-running clock, toggle switches,
LEDs, seven-segment, nixie. This is where the LED/display hardware gets to be fun without a
puzzle attached.

### Level format and the solvability harness

```ts
interface Level {
  id: string; title: string; chapter: number; brief: string;
  grid: { w: number; h: number };
  locked: Uint8Array;          // cells the player may not edit
  prefab: Uint16Array;         // pre-placed wiring
  inputs: Pin[]; outputs: Pin[];
  palette: Kind[];
  test: { mode: 'settle'; vectors: { in: boolean[]; out: boolean[] }[] }
      | { mode: 'sequence'; steps: { in: boolean[]; out?: boolean[]; ticks: number }[] };
  par: { components: number; ticks: number };
  reference: SolutionBlob;     // used only by the harness, never shipped to the player
}
```

**`settle` mode** applies inputs and ticks until no net changes for a full tick, with a cap.
That handles every combinational level without hand-counting delays, and a circuit that never
settles fails with *"this oscillates"* rather than a wrong answer — which is the correct
diagnosis and a genuinely useful error message.

**`sequence` mode** is for anything with state, where the tick schedule is the point.

A Vitest suite loads every level, plays its reference solution headlessly, and asserts the
tests pass *and* that par is actually achievable. A level shipping unsolvable is the worst bug
available here, so this gets written before the levels, not after.

---

## 3. Controls

Pointer events only, `touch-action: none` on the canvas. No mouse/touch split, no hover
dependency, no right-click.

**Tools**, as a mode selector in the bottom bar: draw, erase, place (with the current component
selected from the palette), inspect.

- **Draw** — drag lays wire. Interpolate with Bresenham between `pointermove` samples; at speed
  the browser skips cells and an uninterpolated stroke leaves gaps. Wire masks are set from the
  actual path taken, so a bend is a bend because you drew a bend.
- **Erase** — drag removes. Non-negotiable on a phone; a fat finger will destroy a wire run
  within the first minute.
- **Place** — tap drops the selected component at the current rotation. The palette tile shows
  and cycles that rotation. **Long-press a placed component** to rotate it in situ.
- **Inspect** — tap a net to see its value and its drivers. Doubles as the debugging tool and it
  is how a stuck player gets unstuck without a hint system.
- **Two-finger pinch to zoom, two-finger pan.** One finger always means the current tool, so
  drawing never fights panning. Minimum cell size 24px at default zoom; the viewport clamps so a
  level's grid fits on first load.
- **Undo/redo** always visible in the bottom bar, 50 deep, stored as diffs.
- Tapping an **input pin** toggles it while running. That is the whole play-with-it loop.

Run controls: play/pause, single step, and a tick-rate slider (1–20/s). The sim runs on an
accumulator decoupled from `requestAnimationFrame` — ticks at the player's rate, renders at 60,
interpolates the pulse animation between them. Never tick once per frame.

---

## 4. Graphics

**Direction: traces on a dark board.** Near-black background, faint grid dots, wires as flat
inset traces with square joins — the Wireworld pixel look, cleaned up. Cheap on Canvas 2D,
distinctive, and it scales down to a 24px cell without turning to mush, which the schematic and
breadboard alternatives both do.

Palette:

| | |
|---|---|
| board | `#0a0c10`, grid dots `#161a22` |
| trace, low | `#2c3440` — visible but plainly dead |
| trace, high | `#ffb454` amber, with a soft additive glow |
| component body | `#1a2029` with a `#39414f` bevel |
| component glyph | `#8b96a8`, going amber when its output is high |
| locked cells | same board colour, 6px hatch overlay |
| selection / UI accent | `#4ec9e0` cyan |
| error, contention (`X`) | `#e05252` |

Amber for signal is deliberate: it is the nixie colour, so the endgame's display hardware and
the first level's lit wire are the same light. Cyan stays exclusively an interface colour, so it
never reads as signal.

Signal animation: a net resolves in one tick, but it *draws* as a pulse travelling from driver
to extremity over the tick interval. Pure feel, no simulation meaning — and it is most of why
the redstone comparison lands.

LEDs bloom. Seven-segments and nixies get real segment/glyph geometry rather than a font.
Nixie glyphs sit on staggered depth planes with the front ones brighter, because that is the
one detail that makes a nixie read as a nixie.

---

## 5. Order of work

1. Sim core + Vitest suite through the 4-bit adder (Phase 1 as planned).
2. Level format, `settle`/`sequence` runner, solvability harness.
3. Canvas renderer — static layer, dynamic layer, viewport transform.
4. Pointer input — draw, erase, place, pinch/pan, undo.
5. Shell — level select, palette, run controls, win modal, unlock flow.
6. The fourteen levels and their reference solutions.
7. Sandbox, displays, persistence.

**Cut order if the night runs short:** chapter 4 first, then the nixie, then the pulse
animation, then the inspect tool. The floor I will not ship below is chapters 1–3 playable end
to end with progression and persistence.

## 6. What I cannot verify

I can drive a headless Chromium at a 390px viewport and screenshot it, and I will. That catches
layout, contrast and gross touch-target errors. It does not catch *feel* — whether drawing a
wire at speed is satisfying, whether pinch-zoom fights the draw tool, whether 24px is actually
big enough for your thumb. Those need a real device and they are the first thing to check in
the morning.
