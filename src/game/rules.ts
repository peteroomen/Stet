/**
 * Rule variants.
 *
 * The engine reads its numbers — and a small number of optional mechanics — from
 * a `Rules` object carried on the game state, so a whole design direction can be
 * simulated by the bot harness without forking the engine. `scripts/model.ts`
 * plays hundreds of runs per variant and prints the comparison.
 *
 * `SHIPPED` is what the game actually plays as. Everything else is a candidate,
 * and stays a candidate until the numbers say otherwise.
 */

export interface Rules {
  id: string;
  /** One line, for the model table. */
  label: string;

  startHp: number;

  /**
   * Damage multiplier applied while mid-swing. 1 disables exposure entirely,
   * which is the single biggest arcade lever available and is modelled on its
   * own so its price is known.
   */
  exposedMult: number;

  /** Threat budget per floor = base + round(depth * slope), capped. */
  threatBase: number;
  threatSlope: number;

  /**
   * MOMENTUM. A kill does not end your turn: the enemy phase is skipped and you
   * act again immediately, up to this many extra actions per turn. 0 = off.
   *
   * Enemies keep the intents they already committed to, so the telegraph is
   * still a promise — you are moving inside a frozen turn, not getting a new
   * board. This is the arcade lever: it turns a crowd from a death sentence into
   * a chain, and it is legible at one ply.
   */
  killGrantsActions: number;

  /**
   * FLOW. Stepping out of a tile something had committed to strike charges the
   * next stroke: +this much damage, and it breaks any stance regardless of
   * poise. Spent on your next strike, lost if you are hit. 0 = off.
   *
   * "Dodge, then punish" — the thing the player asked for that stagger only
   * half-delivered, and visible one ply ahead rather than three.
   */
  flowBonus: number;

  /**
   * RALLY. A kill gives back this much health, but only health lost on the
   * current floor, and never more than `rallyFloorCap` per floor. Bounded so
   * the spill cannot be farmed for infinite HP. 0 = off.
   */
  rallyPerKill: number;
  rallyFloorCap: number;

  /** Turns between spills once a floor's grace is spent. */
  spillBase: number;
  /**
   * PRESS. Every this-many turns past grace, the spill cadence tightens by one
   * more turn. 0 = off, which is a FLAT trickle — and a flat trickle is farmable:
   * any rule that makes killing cheap enough turns the spill from a clock into a
   * renewable supply of free actions. Measured under MOMENTUM, a reactive bot
   * killed 72 things per run (against 35 shipped), took less damage, and still
   * reached depth 1.1 — it simply never left floor one.
   */
  spillRampTurns: number;
}

/** What the game ships as today. */
export const SHIPPED: Rules = {
  id: 'shipped',
  label: 'Shipped — commit, stagger, spill',
  startHp: 7,
  exposedMult: 2,
  threatBase: 2,
  threatSlope: 1.45,
  killGrantsActions: 0,
  flowBonus: 0,
  rallyPerKill: 0,
  rallyFloorCap: 0,
  spillBase: 5,
  spillRampTurns: 0,
};

const variant = (over: Partial<Rules> & Pick<Rules, 'id' | 'label'>): Rules => ({
  ...SHIPPED,
  ...over,
});

/** Diagnostic, not a proposal: what is exposure actually worth? */
export const NO_EXPOSURE = variant({
  id: 'no-exposure',
  label: 'Diagnostic — exposure removed (x2 → x1)',
  exposedMult: 1,
});

/** A: same game, gentler numbers. No new mechanic to learn or explain. */
export const TUNED = variant({
  id: 'tuned',
  label: 'A · Tuned — flatter threat ramp, one more heart',
  startHp: 8,
  threatSlope: 1.05,
});

/** B: a kill buys you another action. */
export const MOMENTUM = variant({
  id: 'momentum',
  label: 'B · Momentum — a kill does not end your turn (max 2 chained)',
  killGrantsActions: 2,
});

/** C: dodge, then punish. */
export const FLOW = variant({
  id: 'flow',
  label: 'C · Flow — dodging a committed strike charges the next one (+2, unblockable)',
  flowBonus: 2,
});

/** D: aggression pays its own medical bills. */
export const RALLY = variant({
  id: 'rally',
  label: 'D · Rally — a kill wins back health lost on this floor (max 2/floor)',
  rallyPerKill: 1,
  rallyFloorCap: 2,
});

/** E: the two floor-raising levers together, on the shipped flat spill. */
export const ARCADE = variant({
  id: 'arcade',
  label: 'E · Arcade — momentum + flow + flatter ramp',
  killGrantsActions: 2,
  flowBonus: 2,
  threatSlope: 1.15,
});

/**
 * F: the page fills FASTER the longer you stay, instead of at a flat trickle.
 *
 * Independently useful — it is the only lever here that attacks pace rather than
 * survival — and it is the precondition for MOMENTUM being playable at all.
 */
export const PRESS = variant({
  id: 'press',
  label: 'F · Press — the spill accelerates the longer you linger',
  spillRampTurns: 8,
});

/** G: the actual proposal — flow + press, with momentum made safe by press. */
export const ARCADE2 = variant({
  id: 'arcade2',
  label: 'G · Arcade+ — momentum + flow + press + flatter ramp',
  killGrantsActions: 2,
  flowBonus: 2,
  threatSlope: 1.15,
  spillRampTurns: 8,
});

/** H: flow + press only — the same package without the momentum chain. */
export const POISE = variant({
  id: 'flow-press',
  label: 'H · Flow + Press — no chaining, just dodge-punish and a real clock',
  flowBonus: 2,
  spillRampTurns: 8,
});

/**
 * The ramp is a knob, not a constant, and at 8 it is a guillotine: measured, a
 * reactive player's floors got 2.2x faster AND cleaner, and their median depth
 * still halved — they were dying to the clock rather than to anything on the
 * board. These sweep it.
 */
export const FLOW_PRESS_12 = variant({
  id: 'flow-press-12',
  label: 'H12 · Flow + Press, ramp 12',
  flowBonus: 2,
  spillRampTurns: 12,
});
export const FLOW_PRESS_18 = variant({
  id: 'flow-press-18',
  label: 'H18 · Flow + Press, ramp 18',
  flowBonus: 2,
  spillRampTurns: 18,
});
export const FLOW_PRESS_26 = variant({
  id: 'flow-press-26',
  label: 'H26 · Flow + Press, ramp 26',
  flowBonus: 2,
  spillRampTurns: 26,
});

export const VARIANTS: Rules[] = [
  SHIPPED,
  NO_EXPOSURE,
  TUNED,
  MOMENTUM,
  FLOW,
  RALLY,
  ARCADE,
  PRESS,
  ARCADE2,
  POISE,
  FLOW_PRESS_12,
  FLOW_PRESS_18,
  FLOW_PRESS_26,
];
