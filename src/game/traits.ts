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
  /**
   * Seldom offered, and drawn differently when it is.
   *
   * Reserved for the cards that change what a stroke IS rather than how much it
   * carries — reach, breadth, a turn that does not end. A pool where every card
   * is equally likely has no shape to it: nothing is a find, and the run that
   * went well and the run that went badly differ only in arithmetic. Rarity is
   * what turns a hand into a moment.
   *
   * The compensating promise is that they are GUARANTEED on the hand you are
   * dealt as you arrive on a boss floor, so the power spike lands exactly where
   * the game asks the most of you rather than wherever the dice fell.
   */
  rare?: boolean;
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
  /*
   * Once, for the same reason Whetstone is.
   *
   * With damage capped it simply became the next thing to stack: measured, a
   * 3-ply greedy build took Vellum 75 times across 59 runs — two or three of a
   * six-mark margin spent on the same card. The margin holds six marks, and it
   * should have to hold six IDEAS.
   */
  {
    id: 'vellum',
    name: 'Vellum',
    line: 'One more heart.',
    axis: 'defence',
    once: true,
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
  /*
   * ONCE, and it used to stack.
   *
   * Stacking damage was the run's only real build, and it swallowed everything
   * else: a greedy chooser took this every offer it appeared in, and on top of
   * up to three NIBs off the board the ceiling simply stopped being reachable —
   * "I can get a bunch of nib and play forever". The nibs are gone from the
   * floors and this is now one mark like most of the others, so a six-mark
   * margin has to hold six different ideas.
   */
  {
    id: 'whetstone',
    name: 'Whetstone',
    line: 'Every stroke carries one more.',
    axis: 'offence',
    once: true,
    player: (p) => {
      p.dmg += 1;
    },
  },
  /*
   * THE LONG NIB and THE BROAD NIB — reach and breadth.
   *
   * Neither can break a stance; see engine.ts. They buy you tempo against a
   * crowd without buying you safety in one, which is the line these have to walk
   * — being surrounded should stay frightening and stop being hopeless.
   */
  {
    id: 'long-nib',
    rare: true,
    name: 'The Long Nib',
    line: 'Your stroke carries through to whatever stands behind.',
    axis: 'offence',
    once: true,
    rules: () => ({ strokeReach: 1 }),
  },
  {
    id: 'broad-nib',
    rare: true,
    name: 'The Broad Nib',
    line: 'Your stroke catches every foe you are touching.',
    axis: 'offence',
    once: true,
    rules: () => ({ strokeSplash: true }),
  },
  /*
   * MOMENTUM as a card rather than a rule of the game.
   *
   * The harness's favourite arcade lever and far too strong as a default — it
   * turns a crowd from a death sentence into a chain. As one mark of six it is a
   * build: it pairs obviously with the broad nib, and a glance kill deliberately
   * does NOT grant the action, so the pair clears faster without becoming an
   * engine that runs itself.
   */
  {
    id: 'momentum',
    rare: true,
    name: 'Momentum',
    line: 'A kill you aimed at does not end your turn.',
    axis: 'tempo',
    once: true,
    rules: () => ({ killGrantsActions: 1 }),
  },
  /*
   * Named for the thing it gives you rather than for the paper it was first
   * called after.
   *
   * "Foolscap" giving you "gesso" was two obscure words for one mechanic, and it
   * was reported exactly that way: "explain foolscap/gesso, it's a mystery to
   * me". Flavour is worth having; flavour you have to look up is a card the
   * player cannot evaluate, and a choice you cannot evaluate is not a choice.
   * The card is now called what the HUD calls the pip it adds, and the line says
   * the whole rule in plain words.
   */
  {
    id: 'foolscap',
    name: 'Gesso',
    line: 'A layer over the page. Takes a blow before your health does, and never heals back.',
    axis: 'defence',
    once: true,
    player: (p) => {
      p.ward += 1;
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
 * How often an ordinary hand is allowed to contain a rare at all.
 *
 * Rolled once for the whole hand rather than per card, so a rare arrives as an
 * event — "there is something good in this one" — instead of as a slot that
 * sometimes upgrades.
 *
 * Halved from 0.24 after play: "I see them all the time at the moment". The
 * roll was only ever half the story, though — see `offerTraits`, where the boss
 * guarantee turned out to be the larger source. Measured over 120 3-ply runs at
 * 0.24, of 1,648 hands dealt:
 *
 *   all hands     30% showed a rare
 *   boss hands    81%   <- the guarantee, and a quarter of all hands
 *   plain hands   13%   <- the roll, already under its nominal rate because
 *                          rares are `once` and leave the pool once taken
 *
 * So this constant alone could not have delivered what was asked for.
 */
export const RARE_CHANCE = 0.12;

/**
 * The three cards offered on a descent.
 *
 * Deliberately spread across axes where it can be: three offence cards in a row
 * is not a choice, it is a number going up. Traits already taken that cannot be
 * taken twice are dropped from the pool.
 *
 * `atBoss` makes the hand you are dealt on ARRIVING at a boss floor carry a rare
 * — but ONLY while the run does not already hold one.
 *
 * That condition is the whole point of the promise, and it was missing. What the
 * guarantee is for is "a boss is never lost to a run that simply never saw a
 * rare"; a run that already has one has not got that problem, so handing it
 * another is not keeping a promise, it is just a bigger pile. And it was the
 * bigger of the two sources: 81% of boss hands carried a rare, against 13% of
 * ordinary ones, on a quarter of all hands dealt.
 *
 * Conditioning it costs the promise nothing and is most of the reduction.
 */
export function offerTraits(
  taken: string[],
  pick: (n: number) => number,
  count = 3,
  hurt = false,
  maxTraits = 0,
  atBoss = false,
): Trait[] {
  // The margin is full: nothing further can be written, but a scribe can always
  // patch what is already there.
  if (maxTraits > 0 && taken.length >= maxTraits) return hurt ? [MEND] : [];

  const live = TRAITS.filter((t) => !(t.once && taken.includes(t.id)));
  const rares = live.filter((t) => t.rare);
  // Already carrying one? Then the boss's promise is already kept, and this hand
  // takes its chances like any other.
  const hasRare = taken.some((id) => TRAIT_BY_ID.get(id)?.rare);
  const promise = atBoss && !hasRare;
  // One roll for the hand, using the same `pick` the rest of the deal uses so a
  // seeded run stays reproducible.
  const allowRare = promise || pick(1000) < RARE_CHANCE * 1000;
  const pool = allowRare ? live : live.filter((t) => !t.rare);
  const out: Trait[] = [];
  const axes = new Set<TraitAxis>();

  // MEND takes a slot whenever there is damage to undo, and only then — a card
  // that does nothing is a hand of two, and the whole point of the slot is that
  // every hand contains a way to survive.
  if (hurt) {
    out.push(MEND);
    axes.add(MEND.axis);
  }

  // The boss's promise is kept first, before the axis-spreading has a chance to
  // fill the hand with commons.
  if (promise && rares.length > 0 && out.length < count) {
    const t = rares[pick(rares.length)];
    out.push(t);
    axes.add(t.axis);
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
