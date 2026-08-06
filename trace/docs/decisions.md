# Settled decisions

Each entry is a call that is expensive to reverse, with the reason it went that way. Add to
this file rather than relitigating in chat.

---

### The substrate is not a cellular automaton
Wires are drawn cell by cell and look like Wireworld, but connected wire cells form a net that
resolves **instantaneously**. All delay lives in placed components. A CA substrate charges a
clock for every AND, and that tax would land on the player in their first hour.

### The floor is the inverter, not NAND and not the transistor
Primitives are the **inverter** and the **junction**. NOT alone is not functionally complete —
inverters and wires get you inverter chains and nothing else — so the junction does the work:
it merges nets, and a net resolves as the OR of its drivers. NOT plus OR is NOR, which is
complete. The player's first real puzzle is `AND(a,b) = NOT(NOT a ∨ NOT b)`: three inverters
and a junction, with De Morgan arriving as a discovery rather than a lecture.

Rejected: a NAND floor, because the opening primitive would arrive unexplained. Rejected:
opening on transistors, because the first hour would go on floating nets and short circuits
before blueprints exist to tame the component count.

### Nets resolve on a 4-state lattice from day one
`{Z, LO, HI, X}` with strong and weak drivers, even though Tier 1 gameplay is pure boolean.
The inverter drives strong `HI` or nothing; every net has a weak pull-down. Wired-OR then falls
out of the resolver instead of being a special case, and contention is unreachable, so `X` and
`Z` stay invisible.

This is what keeps a transistor chapter possible. NMOS introduces strong `LO`, contention
becomes reachable, and the short circuit appears — with no resolver rewrite and no save
migration. Costs roughly forty lines now; costs a format migration and thirty levels of
regression if retrofitted later. Whether that chapter is ever built is undecided and does not
need deciding.

### Consequence: OR is free
A junction is zero components and zero ticks, so OR costs nothing and everything else costs
inverters. That is a coherent universe — it is roughly resistor-transistor logic — but it means
an "OR gate" unlock is cosmetic rather than earned. Accepted.

### Wires that touch do not join
Crossing is the default; joining requires an explicit `junction` cell. The handoff proposed the
inverse (explicit bridge to cross). Inverted because on a phone, redrawing across existing wire
is constant, so the forgiving default should be the common accident. Ending a stroke *on* a
wire is usually deliberate, so that case auto-inserts a junction.

### Blueprints flatten at placement, and delay is honest
Placing a blueprint appends its primitives to the flat component list; the tick loop never sees
hierarchy. An AND made of three inverters costs 2 ticks forever.

This makes `par.ticks` measure real logic depth, which is the point of scoring it, and it buys
the best late-game loop available: re-implementing a blueprint re-flattens every instance, so
improving your adder speeds up every circuit that contains one. Solved levels keep their
recorded solve; the sandbox updates.

### Unlocks are blueprints
Building a component is what grants it. The handoff's static `allowed: Kind[]` palette gating
still exists for level constraints, but progression proper is the player's own blueprint
library. This is the core mechanic, not a feature.

### The campaign ends at a program driving a display
ALU, register file, program counter, instruction decoder, then RAM, then output. The finish is
the player's own CPU driving the monitor or nixies.

### RAM becomes a primitive after you build one
Nobody hand-places 32,000 latches. The player builds a small register file by hand, proves the
idea, and then RAM unlocks as a primitive with a size dial. Same pattern as gates, one tier up.

### Buses are an editor affordance, not a sim feature
A bundle is one stroke that lays down N parallel wires. The simulation stays single-bit and
never learns what a bus is. Seven-segment decoding (7 lines) and nixie one-hot decoding
(10 lines, historically a 74141) are good puzzles precisely because the wires are individual —
the bundle only saves drawing time.

### Stack
Vite + TypeScript, Canvas 2D, Zustand for UI state only, Tailwind for chrome, PWA, localStorage
first. **The grid never enters React state.** No physics engine, no ECS, no game framework.
