/**
 * Marginalia — the run's shape, chosen a floor at a time.
 *
 * Scribes wrote their notes in the margins of an illuminated page, which is
 * where these are drawn and what they are called. On every descent you are shown
 * three and take one, permanently, for the rest of the run.
 *
 * ## Why a trait is just a `Rules` delta
 *
 * `Rules` is a plain object carried on the state and `step()` is pure, so a
 * trait needs no machinery of its own — and two things fall out for free:
 *
 *   - **The preview stays honest.** `previewMoves` plays each direction through
 *     the real `step()`, so a trait that raises your damage immediately shows up
 *     in a foe's health pips and one that changes exposure shows up in the cost
 *     numerals. Traits teach themselves; there is no stat screen and nothing to
 *     read.
 *   - **The harness can play them.** `npm run model` already varies `Rules`, so
 *     any trait or combination of traits can be measured before it ships.
 *
 * Most of this pool costs no new engine surface at all, because the levers were
 * already built and modelled as rule variants — see rules.ts.
 *
 * ## On complexity
 *
 * The base game does not get harder to read because this file exists. Nothing
 * here is in a run until the player chose it, and a rule you chose is a rule you
 * decided to learn — which is a different thing from one the game imposed.
 */

import type { Rules } from './rules';
import type { Player } from './types';

/** What a trait touches. Used to keep a hand of them from reading as mush. */
export type TraitAxis = 'offence' | 'defence' | 'tempo';

export interface Trait {
  id: string;
  name: string;
  /** One line, shown on the card. Says what it does, not what it is called. */
  line: string;
  axis: TraitAxis;
  /** Rule changes. Applied to a copy; never mutates. */
  rules?: (r: Rules) => Partial<Rules>;
  /**
   * Changes to the player that a `Rules` field cannot express — an extra heart
   * has to raise the live maximum, not just what a new run would start with.
   */
  player?: (p: Player) => void;
  /** Cannot be taken twice. Most stack; a few would be silly or unbounded. */
  once?: boolean;
}

/**
 * MEND is offered on every descent you are hurt, and it is not a trait.
 *
 * Healing used to be a vial lying on the board. As a card instead, every heal
 * costs you a permanent upgrade — which turns the choice into the run's own
 * difficulty regulator: a player who is taking damage spends their picks staying
 * alive and does not compound, while a player clearing floors cleanly powers up.
 * That feedback loop is doing real balance work, and it is doing it in the one
 * place the player can see it.
 *
 * Not in `TRAITS`, because it is never rolled — it takes a slot outright, and
 * only when there is something to heal.
 */
export const MEND: Trait = {
  id: 'mend',
  name: 'Mend',
  line: 'Close three wounds.',
  axis: 'defence',
  player: (p) => {
    p.hp = Math.min(p.maxHp, p.hp + 3);
  },
};

export const TRAITS: Trait[] = [
  /*
   * FLOW, as an opt-in rather than a rule of the game.
   *
   * It has been finished and sitting behind a zero for a long time, and the
   * harness likes it — a reactive player goes 3.9 to 4.7 — but it is a fourth
   * rule for everybody, on a game that had already been called too complex
   * twice. As a card it costs nothing to a player who does not take it.
   */
  {
    id: 'riposte',
    name: 'Riposte',
    line: 'Step out of a committed blow and your next stroke lands +2, unblockable.',
    axis: 'offence',
    once: true,
    rules: () => ({ flowBonus: 2 }),
  },
  {
    id: 'vellum',
    name: 'Vellum',
    line: 'One more heart.',
    axis: 'defence',
    player: (p) => {
      p.maxHp += 1;
      p.hp += 1;
    },
  },
  {
    id: 'steady',
    name: 'Steady Hand',
    line: 'Mid-swing costs you half again, not double.',
    axis: 'defence',
    once: true,
    rules: () => ({ exposedMult: 1.5 }),
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    line: 'A third hold, every floor.',
    axis: 'tempo',
    once: true,
    rules: (r) => ({ waitsPerFloor: r.waitsPerFloor + 1 }),
  },
  {
    id: 'long-memory',
    name: 'Long Memory',
    line: 'The combo ladder climbs one rung higher.',
    axis: 'offence',
    rules: (r) => ({ comboCap: r.comboCap + 1 }),
  },
  {
    id: 'rally',
    name: 'Rally',
    line: 'A kill wins back a heart lost on this floor. Twice a floor at most.',
    axis: 'defence',
    once: true,
    rules: () => ({ rallyPerKill: 1, rallyFloorCap: 2 }),
  },
  {
    id: 'whetstone',
    name: 'Whetstone',
    line: 'Every stroke carries one more.',
    axis: 'offence',
    player: (p) => {
      p.dmg += 1;
    },
  },
  /*
   * The only trait that touches the spill, and therefore the only one that has
   * to be capped.
   *
   * The spill is what guarantees a run ends — without it a bot that refused to
   * engage kited three rats for 4000 turns and never died. Stackable, this card
   * takes the cadence from 5 to 9 and hands that strategy back: measured, 8% of
   * 3-ply runs stopped dying inside the turn budget, which broke the harness's
   * oldest invariant. Once only. You may buy a breath, not an escape.
   */
  {
    id: 'quick-page',
    name: 'Quick Page',
    line: 'The page fills more slowly. One more turn between spills.',
    axis: 'tempo',
    once: true,
    rules: (r) => ({ spillBase: r.spillBase + 1 }),
  },
];

export const TRAIT_BY_ID = new Map([...TRAITS, MEND].map((t) => [t.id, t]));

/**
 * The three cards offered on a descent.
 *
 * Deliberately spread across axes where it can be: three offence cards in a row
 * is not a choice, it is a number going up. Traits already taken that cannot be
 * taken twice are dropped from the pool.
 */
export function offerTraits(
  taken: string[],
  pick: (n: number) => number,
  count = 3,
  hurt = false,
  maxTraits = 0,
): Trait[] {
  // The margin is full: nothing further can be written, but a scribe can always
  // patch what is already there.
  if (maxTraits > 0 && taken.length >= maxTraits) return hurt ? [MEND] : [];

  const pool = TRAITS.filter((t) => !(t.once && taken.includes(t.id)));
  const out: Trait[] = [];
  const axes = new Set<TraitAxis>();

  // MEND takes a slot whenever there is damage to undo, and only then — a card
  // that does nothing is a hand of two, and the whole point of the slot is that
  // every hand contains a way to survive.
  if (hurt) {
    out.push(MEND);
    axes.add(MEND.axis);
  }

  // First pass takes one from each axis it can, so a hand of three reads as
  // three different questions rather than one question asked three ways.
  for (let guard = 0; guard < 40 && out.length < count; guard++) {
    const fresh = pool.filter((t) => !out.includes(t) && !axes.has(t.axis));
    if (fresh.length === 0) break;
    const t = fresh[pick(fresh.length)];
    out.push(t);
    axes.add(t.axis);
  }
  // Then fill from whatever is left.
  for (let guard = 0; guard < 40 && out.length < count; guard++) {
    const fresh = pool.filter((t) => !out.includes(t));
    if (fresh.length === 0) break;
    out.push(fresh[pick(fresh.length)]);
  }
  return out;
}

/** Fold a trait into a rule set. Returns a new object; mutates nothing. */
export function applyTraitRules(r: Rules, t: Trait): Rules {
  return t.rules ? { ...r, ...t.rules(r) } : r;
}
