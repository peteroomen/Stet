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

  /**
   * Combo bonus ceiling. Four swings in and you are at +3; the risk stops
   * scaling too. A rule rather than a constant so the LONG MEMORY trait can
   * raise it, and so the harness can sweep it.
   */
  comboCap: number;

  /**
   * Marginalia offered on each descent. 0 = off, which is the game without any
   * roguelike layer at all and the baseline everything else is measured against.
   */
  traitsPerDescent: number;

  /**
   * How many marks the margin holds. 0 = no limit.
   *
   * There has to be a limit, and the reason is structural rather than a taste
   * for scarcity. `threatBudget` caps at 20 and the board holds seven bodies, so
   * difficulty PLATEAUS with depth — while an uncapped card every floor
   * compounds without end. Measured, a 3-ply bot with an unbounded build stopped
   * dying altogether: 7 runs in 60 were still descending at twelve thousand
   * turns, 12-21 inputs a floor at depth 20+, faster than they cleared depth 8.
   * They had simply out-scaled everything the generator can build.
   *
   * So the margin fills. Past this many marks a descent offers only MEND, power
   * plateaus where content already did, and the clock gets to win again.
   */
  maxTraits: number;

  /**
   * How many marginalia tighten the spill by one turn. 0 = off.
   *
   * This is what pays for the roguelike layer, and the threat ramp cannot do it:
   * measured, taking the slope from 1.45 to 2.10 moved a reactive player only
   * 6.2 to 5.4, because `threatBudget` caps at 20 and the board holds seven
   * bodies. Depth stops buying enemies long before it stops needing to.
   *
   * The spill is the one knob that scales without limit, so power is coupled
   * straight to it: every few cards you take, the page fills a turn sooner. It
   * is legible — you can feel the ink rising as your build grows — and it is the
   * right shape for the fiction. The more you have written in the margins, the
   * less page you have left.
   */
  spillPerTraits: number;

  /* --- THE FADE -----------------------------------------------------------
   *
   * You are written in ink, and every action you take spends some of it. Run
   * out and you are gone from the page.
   *
   * The problem it exists for: an enemy can be juked indefinitely. The spill is
   * the current answer, and it works, but it answers by putting more BODIES on
   * a 5x5 board — it buys pressure with legibility, on a game whose whole claim
   * is being readable a turn ahead. The fade buys the same pressure for nothing:
   * no new marks, no new rules to read, and the feedback lands on the one thing
   * the player is already watching.
   *
   * A kill gives ink back, which states the design's oldest thesis directly
   * rather than by implication: aggression sustains you, timidity fades. The
   * spill only ever said that in the negative.
   *
   * So it is modelled BOTH ways — beside the spill, and instead of it. If it can
   * replace the spill outright, the board gets quieter and the game gets a
   * better teacher at the same time.
   * --------------------------------------------------------------------- */

  /** Ink you arrive on a floor with. 0 = the fade is off entirely. */
  fadeMax: number;
  /** Ink spent per action taken. */
  fadePerAction: number;
  /** Ink a kill gives back, capped at `fadeMax`. */
  fadePerKill: number;

  /**
   * WEAR — how many recently-occupied tiles the page remembers. 0 = off.
   *
   * The flat fade failed for a reason worth writing down: it charged for TIME,
   * and time is exactly what separates skill here. A reactive player spends
   * 32-58 inputs a floor; a 3-ply one spends 12-21 at depth 20. So a flat ink
   * budget is a pace tax, it never touches the strong player at all, and it
   * amplifies the gap instead of closing it. Measured: reacting 5.8 to 2.7 while
   * thinking went UP.
   *
   * Halving hearts fails identically — reacting 5.3 to 4.2 and thinking 20.9 to
   * 20.8 — for the same underlying reason. Shrinking a buffer only costs the
   * player who was using it.
   *
   * So charge for the thing actually being complained about instead: JUKING.
   * Retracing your steps wears the page through. Step onto a tile you have just
   * left and it costs ink; fresh paper is free however long you take. A player
   * moving purposefully across the board pays nothing at any speed, and a player
   * pacing back and forth in a corner drains out.
   *
   * And a stroke CLEARS the memory — commit to a fight and the page forgets
   * where you have been. Fight and it forgives; run and it remembers.
   */
  wearMemory: number;
  /** Ink spent stepping onto a tile the page still remembers. */
  wearCost: number;

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
 *
 * On the marginalia: a card every descent, paid for by coupling the spill to how
 * many you have taken. Eight to ten permanent upgrades is a great deal of power
 * and the harness says so — the layer alone takes a reactive player 3.9 to 6.2
 * and a 3-ply one 17.8 to 26.6. Steepening the threat ramp cannot pay for it,
 * because the threat budget caps at 20 and the board holds seven bodies, so it
 * saturates: slope 2.10 only claws back 6.2 to 5.4. Tightening the spill every
 * four cards puts the ceiling back on its number exactly:
 *
 *   shipped        reacting 3.9  thinking 17.8
 *   marginalia     reacting 6.2  thinking 26.6
 *   ...every 2     reacting 5.1  thinking 12.2   (over-corrected)
 *   ...every 3     reacting 5.4  thinking 15.1
 *   ...every 4     reacting 5.6  thinking 17.8
 *
 * The floor stays raised, and that is the layer working rather than a failure to
 * pay for it: a build makes a reactive player more consistent without taking the
 * top of the game any higher. Note the bots pick with `chooseGreedy`, so these
 * are the numbers for someone who already knows every card.
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
  comboCap: 3,
  traitsPerDescent: 3,
  maxTraits: 6,
  fadeMax: 0,
  fadePerAction: 1,
  fadePerKill: 8,
  wearMemory: 0,
  wearCost: 4,
  spillPerTraits: 4,
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

/**
 * The roguelike layer, and the rebalance it forces.
 *
 * Eight to ten permanent upgrades over a run is a lot of power, and the point of
 * these is to find out how much: `traits` is the layer bolted onto the shipped
 * numbers, and the `-slope` variants steepen the threat ramp to pay for it. The
 * target is the depth the game reaches WITHOUT the layer — the marginalia are
 * meant to change how a run feels, not how far it gets.
 */
export const TRAITS_ON = variant({
  id: 'traits',
  label: 'M · Marginalia — a card every descent, shipped numbers',
  traitsPerDescent: 3,
});
/** Threat-slope sweep. Kept because its FAILURE is the finding: it saturates. */
export const TRAITS_S210 = variant({
  id: 'traits-s210',
  label: 'M · Marginalia, threat slope 2.10 (saturates — diagnostic)',
  traitsPerDescent: 3,
  threatSlope: 2.1,
});

/** The lever that actually scales: every N cards, the page fills a turn sooner. */
export const TRAITS_P2 = variant({
  id: 'traits-p2',
  label: 'MP2 · Marginalia — every 2 cards, the spill tightens',
  traitsPerDescent: 3,
  spillPerTraits: 2,
});
export const TRAITS_P3 = variant({
  id: 'traits-p3',
  label: 'MP3 · Marginalia — every 3 cards, the spill tightens',
  traitsPerDescent: 3,
  spillPerTraits: 3,
});
export const TRAITS_P4 = variant({
  id: 'traits-p4',
  label: 'MP4 · Marginalia — every 4 cards, the spill tightens',
  traitsPerDescent: 3,
  maxTraits: 6,
  fadeMax: 0,
  fadePerAction: 1,
  fadePerKill: 8,
  wearMemory: 0,
  wearCost: 4,
  spillPerTraits: 4,
});

/**
 * THE FADE, both ways.
 *
 * `fade` adds it beside the spill; `fade-only` swaps it in for the spill
 * entirely, which is the interesting one — if the numbers hold, the board loses
 * a mechanic that costs it bodies and keeps the pressure.
 */
/**
 * Halved hearts, with GESSO to make up the difference.
 *
 * Fewer base hearts makes every blow matter more; a ground layer you can find
 * but never mend makes finding one matter more. The pair is the point — halving
 * alone is just a harder game, and the harness has to price them together.
 *
 * 7 halves to 3.5, so both roundings get modelled.
 */
export const THIN_4 = variant({
  id: 'thin-4',
  label: 'T4 · Four hearts, gesso on the board',
  startHp: 4,
});
export const THIN_3 = variant({
  id: 'thin-3',
  label: 'T3 · Three hearts, gesso on the board',
  startHp: 3,
});

/**
 * The control I should have run the first time.
 *
 * `fade-only` removed the spill AND added the fade, so depth 126 could have been
 * either. This isolates it: no clock of any kind.
 */
export const NO_CLOCK = variant({
  id: 'no-clock',
  label: 'Control — no spill, no fade, nothing hurrying you at all',
  spillBase: 9999,
});

/** WEAR: fresh paper is free, retracing your steps is not. */
export const WEAR = variant({
  id: 'wear',
  label: 'W · Wear — revisiting a tile you just left costs ink',
  fadeMax: 40,
  fadePerAction: 0,
  wearMemory: 4,
  wearCost: 4,
});
export const WEAR_ONLY = variant({
  id: 'wear-only',
  label: 'W! · Wear INSTEAD of the spill',
  fadeMax: 40,
  fadePerAction: 0,
  wearMemory: 4,
  wearCost: 4,
  spillBase: 9999,
});
export const WEAR_ONLY_HARSH = variant({
  id: 'wear-harsh',
  label: 'W!! · Wear instead of the spill, longer memory and a steeper cost',
  fadeMax: 40,
  fadePerAction: 0,
  wearMemory: 6,
  wearCost: 8,
  spillBase: 9999,
});

/**
 * Harsh wear WITH the spill kept — and the one variant in this file that the
 * numbers actually endorse.
 *
 * It first measured as a disaster (reacting 5.3 to 3.6, a 3-ply bot unmoved),
 * which was a bug in the harness rather than the rule: `evaluate()` had no term
 * for ink, so every bot played as though wear did not exist and was then charged
 * for routing it had no reason to change. Once the bots could see their own ink:
 *
 *                  reacting   thinking   gap    stalled
 *   shipped            5.3       20.9    3.9x        0
 *   wear-pressed       6.0       22.3    3.7x        0
 *
 * The floor rises FASTER than the ceiling and the gap tightens, which is this
 * project's own stated definition of a good change. Pace improves with it — a
 * reactive player's inputs per floor go 33/42/35/30/46/51/57/32 to
 * 26/30/26/23/33/34/41/22 — and that is the problem the README has carried as
 * unsolved from the beginning, whose note says it "needs a lever that is not the
 * spill".
 *
 * Wear still cannot REPLACE the spill, and the corrected numbers say so far more
 * loudly than the buggy ones did: under `wear-only` a 3-ply bot reaches depth
 * 207 and 35 runs stall outright. A player good enough simply never revisits a
 * tile. The spill keeps guaranteeing runs end; wear sets the tempo.
 *
 * One honest caveat: the ink weight in `evaluate()` is a number I chose, and
 * these results are sensitive to it. The DIRECTION — floor up, gap tighter — is
 * a strong signal; the exact 6.0 is not a precise claim.
 */
export const WEAR_PRESSED = variant({
  id: 'wear-pressed',
  label: 'WP · Wear AND the spill — the spill still ends runs, wear sets the pace',
  fadeMax: 40,
  fadePerAction: 0,
  wearMemory: 6,
  wearCost: 8,
});

export const FADE = variant({
  id: 'fade',
  label: 'X · Fade — ink runs out as you act, kills give it back',
  fadeMax: 40,
});
export const FADE_ONLY = variant({
  id: 'fade-only',
  label: 'X! · Fade INSTEAD of the spill — the page stops filling',
  fadeMax: 40,
  spillBase: 9999,
});
export const FADE_ONLY_28 = variant({
  id: 'fade-only-28',
  label: 'X!28 · Fade instead of the spill, tighter ink (28)',
  fadeMax: 28,
  spillBase: 9999,
});
export const FADE_ONLY_55 = variant({
  id: 'fade-only-55',
  label: 'X!55 · Fade instead of the spill, looser ink (55)',
  fadeMax: 55,
  spillBase: 9999,
});

export const VARIANTS: Rules[] = [
  SHIPPED,
  NO_CLOCK,
  WEAR,
  WEAR_ONLY,
  WEAR_ONLY_HARSH,
  WEAR_PRESSED,
  THIN_4,
  THIN_3,
  FADE,
  FADE_ONLY,
  FADE_ONLY_28,
  FADE_ONLY_55,
  TRAITS_ON,
  TRAITS_S210,
  TRAITS_P2,
  TRAITS_P3,
  TRAITS_P4,
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
