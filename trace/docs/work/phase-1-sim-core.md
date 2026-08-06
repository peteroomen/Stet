# Phase 1 — simulation core, headless

Pure TypeScript. No rendering, no React, no DOM. Everything downstream depends on this being
right, so it is tested properly before anything is drawn.

Settled before this doc: inverter floor with a 4-state resolver, honest blueprint delay,
campaign ends with a player-built CPU driving a display. See `docs/decisions.md`.

---

## 1. The value model

Four states, one lattice, used by every net in the game:

```ts
const enum V { Z = 0, LO = 1, HI = 2, X = 3 }   // floating, 0, 1, contention
```

Drivers carry a **strength**: `STRONG` (a component actively driving) or `WEAK` (a net's
resting pull). Resolution of a net:

1. Gather strong drivers. Strong `LO` and strong `HI` both present → `X`.
2. Otherwise the single strong value wins.
3. No strong drivers → the net's weak pull.
4. No pull either → `Z`.

**Why this shape.** The Tier-1 inverter drives `HI` or nothing, never a strong `LO`, and every
net defaults to a weak pull-down. So wired-OR is not a special rule — it is what the resolver
does when no driver can pull low. Contention is unreachable, `X` and `Z` never surface, and the
player sees plain boolean logic.

When the optional transistor chapter lands, NMOS devices introduce strong `LO`, contention
becomes reachable, and `X` appears as the short circuit. No resolver change, no save migration.
This is the whole reason for paying the 4-state cost now.

Component inputs reading `Z` or `X` produce strong `X` on their output. `X` propagates; it does
not silently become a boolean.

---

## 2. Grid representation

```ts
interface Grid {
  w: number; h: number;
  cells: Uint16Array;   // kind:6 | rot:2 | mask:4 | flags:4
  netA: Int32Array;     // derived: primary net per cell,  -1 = none
  netB: Int32Array;     // derived: secondary net (crossover cells only), -1 = none
}
```

Departure from the handoff: net ids are **not** packed into the cell word. They are derived
data with a different lifetime (recomputed on edit, never authored), and crossover cells need
two of them. Keeping them in parallel arrays keeps the cell word purely authorial and makes
serialisation trivial — you save `cells`, never the nets.

### Wire-family kinds

| kind | meaning | nets |
|---|---|---|
| `wire` | a drawn segment, `mask` holds its N/E/S/W connections | 1 |
| `crossover` | two independent paths, N–S and E–W | 2 |
| `junction` | merges every wire-family neighbour touching it | 1 |

**Wire masks carry 0, 1 or 2 bits only** — a stub, a straight, or a bend. That constraint is
what makes extraction unambiguous, and it means the editor (Phase 2) must resolve every
higher-degree case at draw time:

- a stroke that would make a cell 3-way → insert a `junction` (ending a stroke on a wire
  reads as intent to join)
- a stroke that would make a cell 4-way → make it a `crossover` (crossing mid-drag is the
  common accident, so crossing is the safe default)

Those two lines are *editor policy* and belong to Phase 2 — they are written down here only
so Phase 1 knows which cell states it must be able to represent. The sim never infers; it
reads kinds and masks as authored.

Wires touching without a junction do not join. This inverts the handoff's bridge-to-cross
recommendation: on a phone, redrawing across existing wire is constant, so crossing is the
forgiving default and joining is the explicit act.

---

## 3. Net extraction

Runs on edit, never inside the tick loop.

Flood-fill the wire family. Two cells are connected when both face each other: cell A's mask
has the bit toward B, and B's mask has the bit toward A. `junction` behaves as mask `1111`.
`crossover` is two separate walks — N–S and E–W never meet.

Output is a `NetTable`:

```ts
interface Net {
  id: number;
  pull: V;                 // WEAK resting value; LO for every net in Tier 1
  drivers: number[];       // component indices whose output lands here
  value: V;                // resolved, updated each tick
}
```

Component pins bind to nets here too: for each component, for each pin, look at the adjacent
cell in the pin's facing direction and take the net whose axis matches. A pin facing an
unconnected cell binds to `-1` and reads `Z`.

The tick loop touches `Grid` never — only `Net[]` and `Component[]`.

---

## 4. Components

```ts
interface Component {
  idx: number; kind: Kind; x: number; y: number; rot: 0|1|2|3;
  inNets: number[]; outNets: number[];
  state: Uint8Array;        // sequential elements only; empty for combinational
  blueprintInstance: number; // -1 if placed directly
}
```

Pin geometry is a per-kind table of `{ dx, dy, dir, role }`, so a component is not assumed to
be one cell. v1 kinds are all 1×1, but RAM and the displays are not, and a table costs nothing
now versus a refactor in Phase 5.

**Tier 1 kinds:** `inverter`, `source`, `sink`, `clock`, `delay`, `latch`.
Junction is wire family, not a component — it is free and takes no tick.

### Evaluation

Per tick, strictly two-phase:

1. **Read** — every component samples its input nets' current resolved values.
2. **Commit** — every component writes its computed output, then all nets re-resolve.

Simultaneous commit, so evaluation order cannot matter and the result is deterministic by
construction. Active components take 1 tick. Junctions and wires take none.

Cost is O(components + nets) per tick with no allocation in the loop, comfortably under a
millisecond at the ~200 components the handoff expects.

---

## 5. Blueprints

Phase 1 owns the model even though the authoring UI is Phase 4.

```ts
interface Blueprint {
  id: string; name: string; w: number; h: number;
  cells: Uint16Array;
  components: PlacedComponent[];
  pins: { name: string; side: Dir; offset: number; role: 'in' | 'out' }[];
}
```

**Placement flattens.** Instantiating a blueprint appends its primitives to the live component
list, tagged with an `instanceId`, and rewrites their net bindings against the host grid. The
tick loop only ever sees primitives — no recursion, no nested state, no per-instance
scheduling. Hierarchy survives for rendering and editing only.

Consequences, both intended:

- **Delay is honest.** An AND built from three inverters settles in 2 ticks wherever it is
  placed. `par.ticks` therefore measures real logic depth, which is the point.
- **Re-implementation propagates.** Editing a blueprint re-flattens every instance, so a faster
  adder makes every circuit containing one faster. Already-solved levels keep their recorded
  solve; the sandbox updates.

Blueprints may nest at author time; flattening is recursive with a cycle check.

---

## 6. Public API

The stable surface Phase 2 draws against:

```ts
createWorld(w, h): World
setCell(world, x, y, kind, mask?, rot?): void
placeComponent(world, kind, x, y, rot): number
placeBlueprint(world, blueprintId, x, y, rot): number
removeAt(world, x, y): void
rebuildNets(world): void        // after any edit, before the next tick
tick(world): void
readNet(world, netId): V
snapshot(world): Patch          // undo, stored as diffs, 50 deep
restore(world, patch): void
```

`rebuildNets` is explicit rather than automatic so the editor can batch a whole drag stroke
into one extraction.

---

## 7. Tests

Vitest. This phase is done when these pass.

**Resolver** — the full join table across `{Z, LO, HI, X}` × strengths, including every
contention case that only the transistor chapter can currently reach.

**Extraction** — bends, straights, stubs; a crossover keeping its two axes disjoint; a junction
merging three and four ways; two nets that visually touch but do not join; a net with two
drivers; pins binding to `-1` when facing nothing.

**Logic, built not given** — this is the real proof of the Tier-1 floor:
- two inverters onto a junction ≡ NOR, full truth table
- `NOT(NOT a ∨ NOT b)` ≡ AND, full truth table, asserted to settle in exactly 2 ticks
- XOR from the above, truth table and settle time

**Arithmetic** — half adder, full adder, 4-bit ripple adder, each as a blueprint. Truth tables
plus an assertion that carry latency grows linearly with width, which is the fact the later
carry-lookahead level depends on.

**Sequential** — SR latch including the illegal input, D latch, edge-triggered D flip-flop
built from primitives, a 4-bit counter against a golden trace.

**Blueprint equivalence** — a circuit built inline and the same circuit built from a blueprint
produce identical net traces, tick for tick, for 100 ticks.

**Determinism** — the same world and input sequence run twice yields byte-identical traces.

---

## 8. Out of scope here

Rendering, canvas, React, touch, pan/zoom, levels, level format, persistence, PWA. Phase 1
ships as a library with a test suite and no way to look at it.

---

## 9. Layout

```
trace/
  package.json          vite + typescript + vitest, no runtime deps
  src/sim/
    values.ts           the 4-state lattice and resolver
    grid.ts             cell packing, kinds, masks
    nets.ts             extraction
    components.ts       pin tables, evaluation
    blueprint.ts        flattening
    world.ts            public API, tick loop, undo
  docs/work/            phase plans
  docs/decisions.md     settled design calls and their reasons
```

New project, kept in `trace/` so nothing of Stet's is disturbed. Trivially liftable into its
own repo later. "Trace" remains a placeholder name.
