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

  /**
   * WAIT. You may spend a turn holding your ground — no move, no swing, and the
   * enemy phase runs anyway.
   *
   * Gated rather than simply added, because standing still is precisely the
   * strategy the spill was built to punish: a bot that read telegraphs and
   * refused to engage once kited three rats for 4000 turns on floor one. A wait
   * action hands that strategy a first-class verb, so it goes in front of the
   * harness before it goes in the game.
   *
   * The honest case for it: waiting lets a CHARGER commit and sail past into
   * empty paper, and lets you shed exposure without stepping into something
   * worse. Both are reads, not stalls. The spill is what stops it being free.
   */
  allowWait: boolean;

  /**
   * What a hold costs on the floor clock, in turns.
   *
   * 1 makes holding exactly as cheap as acting, and the harness is unambiguous
   * about where that goes: a reactive player LOSES depth (4.2 to 3.5) while a
   * 3-ply one gains a lot (18 to 24.7), and eight runs stall out at the turn cap
   * entirely. That is the kiting failure mode the spill was built to kill,
   * handed a first-class verb — patience beating commitment again.
   *
   * Above 1, holding is still always available but never free: the page fills
   * faster for every turn you spend not acting.
   */
  waitCost: number;

  /**
   * How many holds a floor grants. 0 = unlimited.
   *
   * Unlimited is measurably wrong, and pricing the floor clock does not save it:
   * at cost 1, 2 and 3 a reactive player still LOSES depth (4.2 to 3.5 / 3.6 /
   * 3.9) while a 3-ply one gains a great deal (18 to 24.7 / 26.0 / 24.2), and
   * runs still stall out at the turn cap. A free-standing hold is a stall verb.
   *
   * But the hole it fixes is real and was measured too — `scripts/forced.ts`:
   * 2.8% of turns offer NO direction that avoids damage, and in 56% of those,
   * standing still costs nothing while every move costs health. Enemies commit
   * to tiles, so they can surround your tile without covering it, and you are
   * forced to walk into one of them.
   *
   * That is about one moment per floor. So the hold is rationed to roughly that
   * many: enough to answer a board that has genuinely boxed you in, never enough
   * to wait a floor out.
   */
  waitsPerFloor: number;

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

/**
 * What the game ships as today.
 *
 * On the hold: it is on, and rationed to two a floor, and both halves of that
 * were measured. Unlimited holding stalls runs outright (8 of 150 hit the turn
 * cap) and pulls a reactive player DOWN while pushing a 3-ply one up — patience
 * beating commitment, which is the one thing this design cannot allow. Rationed,
 * every variant stalls zero runs and lands inside the noise of shipped:
 *
 *   shipped  reacting 4.2  thinking 18.0   stalled 0
 *   wait     reacting 3.5  thinking 24.7   stalled 8
 *   r1       reacting 4.0  thinking 19.8   stalled 0
 *   r2       reacting 3.9  thinking 17.8   stalled 0
 *   r3       reacting 3.7  thinking 19.5   stalled 0
 *
 * So it costs nothing measurable, and it buys the fix for a real hole — see
 * `scripts/forced.ts`.
 */
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
  allowWait: true,
  waitCost: 1,
  waitsPerFloor: 2,
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

/** W: hold your ground as a first-class action. */
export const WAIT = variant({
  id: 'wait',
  label: 'W · Wait — hold your ground as an action',
  allowWait: true,
});

/**
 * W+: wait, plus the accelerating spill.
 *
 * If waiting turns out to be farmable, PRESS is the obvious brake — a flat
 * trickle is what makes standing still cheap, and the ramp is what makes
 * lingering cost more the longer it goes on.
 */
/** WR: the hold as a rationed resource, sized to the measured hole. */
export const WAIT_R1 = variant({
  id: 'wait-r1',
  label: 'WR1 · Wait — one hold per floor',
  allowWait: true,
  waitsPerFloor: 1,
});
export const WAIT_R2 = variant({
  id: 'wait-r2',
  label: 'WR2 · Wait — two holds per floor',
  allowWait: true,
  waitsPerFloor: 2,
});
export const WAIT_R3 = variant({
  id: 'wait-r3',
  label: 'WR3 · Wait — three holds per floor',
  allowWait: true,
  waitsPerFloor: 3,
});

/** W2 / W3: holding is available, but the page fills faster while you do it. */
export const WAIT_COST2 = variant({
  id: 'wait-c2',
  label: 'W2 · Wait, priced — a hold costs two turns of floor clock',
  allowWait: true,
  waitCost: 2,
});
export const WAIT_COST3 = variant({
  id: 'wait-c3',
  label: 'W3 · Wait, priced hard — a hold costs three turns of floor clock',
  allowWait: true,
  waitCost: 3,
});

export const WAIT_PRESS = variant({
  id: 'wait-press',
  label: 'W+ · Wait + Press — holding costs more the longer you linger',
  allowWait: true,
  spillRampTurns: 12,
});

export const VARIANTS: Rules[] = [
  SHIPPED,
  WAIT,
  WAIT_R1,
  WAIT_R2,
  WAIT_R3,
  WAIT_COST2,
  WAIT_COST3,
  WAIT_PRESS,
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
