import {
  DIAG,
  DIR_VEC,
  MAX_ENEMIES,
  ORTHO,
  SIZE,
  add,
  chebyshev,
  eq,
  inBounds,
  manhattan,
} from './grid';
import type { Rng } from './rng';
import type { Enemy, EnemyKind, GameState, Intent, Vec } from './types';

export interface EnemyStat {
  hp: number;
  dmg: number;
  /** Slow units alternate wind-up / act, which is what makes them dodgeable. */
  slow: boolean;
  /**
   * Damage a single stroke must carry to break this thing's stance.
   *
   * Chaff folds to any hit. A WARDEN shrugs off a light tap, so interrupting one
   * costs a combo you can only build by standing there and trading — which is
   * the whole reason a heavy is frightening rather than merely slow.
   */
  poiseBreak: number;
  /** Threat budget cost used by the floor generator. */
  cost: number;
  /** First depth this kind can appear on. */
  from: number;
  name: string;
  /** One line shown in the bestiary card. */
  tell: string;
  /**
   * Which era this kind belongs to, or `'any'` for the shared archetypes.
   *
   * Declared rather than implied, because "what lives where" was previously kept
   * only in the rosters and therefore only in whoever was editing them. The
   * question that prompted this was the right one to ask: should a CARRIAGE turn
   * up in the word-processor era? No — it is a piece of a typewriter, and an era
   * whose threats are borrowed from the last one is a reskin.
   *
   * `eras.test.ts` asserts that no era rolls another era's natives, so a leak is
   * a failing test rather than something noticed in play three eras later.
   *
   * The three shared archetypes — STALKER, CHARGER, WARDEN — are `'any'` on
   * purpose: they are the game's grammar rather than any one machine's parts, so
   * what a player learned in the first four floors keeps paying wherever they
   * end up. Chaff is NOT shared, because chaff is the most common thing on a
   * board and therefore the thing that most decides where you feel you are.
   */
  home: 'any' | string;
}

export const ENEMY_STATS: Record<EnemyKind, EnemyStat> = {
  rat: {
    hp: 1,
    dmg: 1,
    poiseBreak: 1,
    slow: false,
    cost: 1,
    from: 1,
    name: 'RAT',
    tell: 'One step toward you, every turn. Folds to a single stroke.',
    home: 'manuscript',
  },
  stalker: {
    hp: 2,
    dmg: 1,
    poiseBreak: 1,
    slow: false,
    cost: 2,
    from: 2,
    name: 'STALKER',
    tell: 'Closes on the diagonal, but must step square-on to strike.',
    home: 'any',
  },
  charger: {
    hp: 3,
    dmg: 2,
    poiseBreak: 2,
    slow: true,
    cost: 3,
    from: 4,
    name: 'CHARGER',
    tell: 'Winds up, then lunges two tiles in a line. Sidestep it, or break the coil.',
    home: 'any',
  },
  warden: {
    hp: 5,
    dmg: 3,
    poiseBreak: 3,
    slow: true,
    cost: 5,
    from: 7,
    name: 'WARDEN',
    tell: 'Shrugs off a light stroke. Only a heavy blow stops it.',
    home: 'any',
  },
  /*
   * THE TYPEBAR — the first thing on the page that does not chase you.
   *
   * It never takes a step. It reaches instead: every other turn it strikes the
   * whole COLUMN you were standing in, committed a turn ahead like everything
   * else here. Era I threatens tiles, so every dodge in the game so far is a
   * sidestep; this threatens a line, and the only answer to a line is to be off
   * it. Moving up or down inside the struck column does nothing at all, which is
   * a genuinely new question on a board where any perpendicular step used to do.
   *
   * It is not a blot with a clock. A blot is permanent, total and immovable;
   * this denies a column only on its beat, any stroke silences it for a turn
   * (poise 1), and two kill it. What it changes is what standing still costs —
   * and standing still is how a combo ladder gets built, so it taxes precisely
   * the play the ceiling is made of.
   *
   * See `typebarPlan` for why it aims at your column rather than its own; the
   * first version aimed at its own and the harness took it apart.
   *
   * ONE damage, not two, and the harness picked that. Against a baseline of
   * 4 / 4 / 23 (mean 21.1 at the top, a 5.75x spread):
   *
   *   dmg 2   4 / 4 / 14   reacting mean 4.8   spread 3.5x
   *   dmg 1   4 / 4 / 17   reacting mean 4.9   spread 4.25x
   *
   * At two it cost the ceiling 39% and flattened the spread hard, which is the
   * shape the README warns about — skill mattering less. Its threat is
   * POSITIONAL: it takes a fifth of the board away, and something that wide does
   * not also need to hit hard. One damage keeps the gate and leaves the carriage
   * and the era's boss room to take their own bite out of the top later.
   */
  typebar: {
    hp: 2,
    dmg: 1,
    poiseBreak: 1,
    slow: true,
    cost: 3,
    from: 5,
    name: 'TYPEBAR',
    tell: 'Never moves. Strikes the column you stand in, a turn later. Step sideways.',
    home: 'typewriter',
  },
  /*
   * THE SEMICOLON — era II's chaff, and a punctuation mark with opinions.
   *
   * The RAT is the manuscript's vermin and had no business on a typed page, but
   * every era needs chaff: something cheap that folds to one stroke, fills the
   * board out, and gives the spill something to draw. What a machine's vermin
   * looks like is a stray mark, so this is one — the smallest thing on the page
   * that still has a verb.
   *
   * It walks at you like any chaff, and the turn it draws level and beside you
   * it PUNCTUATES: the two squares either side of it, the tiniest possible
   * version of the era's line. A semicolon separates two clauses, and so does
   * this — it catches you and whatever is on its other side in one mark.
   *
   * As dangerous as a RAT and no more: same health, same damage, same reach into
   * your tile. What differs is the shape of the moment it arrives in, which is
   * the whole job of era chaff — it is the most common thing on a board, so it
   * is the thing that most decides where you feel you are.
   */
  semicolon: {
    hp: 1,
    dmg: 1,
    poiseBreak: 1,
    // A strider, not a slow unit — it alternates STEP and strike. See `strides`.
    slow: false,
    cost: 1,
    from: 5,
    name: 'SEMICOLON',
    tell: 'Steps toward you, then strikes the squares either side of it.',
    home: 'typewriter',
  },
  /*
   * THE CARRIAGE — the line that walks.
   *
   * A TYPEBAR reaches: it never moves, and it strikes the column you are in. A
   * CARRIAGE is the other half of the machine, so it does the other thing — it
   * carries the paper to where it will be struck. It STEPS toward you on one
   * turn and sweeps the whole ROW it is standing in on the next, forever
   * alternating.
   *
   * That gives era II a matched pair on both axes. The typebar is answered by a
   * step sideways, the carriage by a step up or down, and they are told apart at
   * a glance by the one thing that matters: whether the threat comes to you or
   * you have to be somewhere when it arrives.
   *
   * It is not the typebar with legs, and the difference is the reason the
   * typebar's first design failed. A stationary sweeper can be walked away from
   * forever, so it only ever cost turns; this one FOLLOWS. Leaving its row buys
   * you exactly one beat, and then it is in your row again. It is also harder to
   * silence — poise 2, so a bare stroke will not stop it, and three health
   * rather than two.
   *
   * Two damage where the typebar has one, and it earns the difference by being
   * slower to bring to bear: the typebar reaches your column from wherever it
   * stands, while this has to walk into position first and can be broken on the
   * way. Measured against a 3-ply bot, with the aligning chase in `carriageStep`,
   * the two spend about the same time on the board (3861 tile-turns against
   * 4109) and split the damage 15.5% to 23.9% — the typebar still the more
   * dangerous of the pair, which is right for the one you cannot walk away from.
   *
   * Whole-run effect: 4 / 4 / 19 to 4 / 4 / 17, with the reactive floor
   * unmoved. A gate on the ceiling, paid for at the top and nowhere else.
   */
  carriage: {
    hp: 3,
    dmg: 2,
    poiseBreak: 2,
    // Not `slow`: a slow unit alternates WIND and act, and a slow chaser would
    // never take a step at all. This one alternates STEP and sweep — see
    // `strides` below, which is what the engine reads instead.
    slow: false,
    cost: 4,
    from: 6,
    name: 'CARRIAGE',
    tell: 'Steps toward you, then sweeps its whole row. Leave the row, or break it.',
    home: 'typewriter',
  },
  /*
   * THE CARRIAGE RETURN — era II's boss, and a clock made out of its own verb.
   *
   * It does not move and it does not chase. It advances the PAGE: every turn a
   * band of rows is struck, the band slides one row down, and when it runs off
   * the bottom the bell rings, it returns to the top — and comes back ONE ROW
   * WIDER. Five safe rows, then four, then three, until the page has run out.
   *
   * ## Why it is built this way
   *
   * A boss floor carries no spill, so the boss is the only clock on it — and the
   * DROLLERY needed two extra rules bolted on to guarantee its fight ever ended
   * (stop winding once the page is full; kill it and its scribbles fade). Both
   * were found by the harness after 1-ply bots kited a capped-out boss for four
   * thousand turns.
   *
   * This one needs none, because the clock IS the attack. By the fifth pass the
   * band covers every row on the board and there is nowhere to stand at all, so
   * the fight is over by roughly turn twenty-five whatever anyone does. That is
   * termination by arithmetic rather than by probability, which is what the
   * drollery's rules were trying to buy.
   *
   * ## The band is read off the floor clock, not off the boss
   *
   * `bandAt` derives everything from `floorTurns`, so the page turns whether or
   * not you interrupted the machine. Breaking its stance cancels the strike you
   * were about to eat — that is what poise is for — but it does not stop the
   * paper advancing, and it must not: a boss whose clock you can pause by
   * hitting it is a boss you can stall forever, which is the exact failure the
   * drollery's extra rules exist to patch.
   *
   * ## Its health barely matters, and that is the honest finding
   *
   * Measured over 80 runs of a 3-ply bot at 6, 8, 10 and 14 health, the number
   * that got past it went 49 / 48 / 47 / 43. Doubling its health moved the fight
   * by six runs in eighty, because the fight is decided by the clock and by
   * where you are standing, not by how long you hit it for. Ten, then, for the
   * weight it gives the thing rather than for any balance it buys.
   *
   * Poise 3, like the drollery: a bare stroke will not stop it, so the margin
   * has to be carrying something by the time you arrive.
   */
  carriageReturn: {
    hp: 10,
    dmg: 2,
    poiseBreak: 3,
    slow: false,
    cost: 99, // never bought from a threat budget; placed by the boss floor
    from: 8,
    name: 'CARRIAGE RETURN',
    tell: 'Strikes a band of rows, advances a line, and returns wider. Kill it before the page runs out.',
    home: 'typewriter',
  },
  /*
   * THE CURSOR — era III's chaff, and the first thing in the game that moves YOU.
   *
   * Every era's chaff is the same creature doing the same job: it walks onto you,
   * it folds to one stroke, and ignoring it kills you. What changes is the shape
   * of the moment it arrives in, because chaff is the most common thing on a
   * board and therefore the thing that most decides where you feel you are.
   *
   * A word processor's answer is INSERTION. Where it lands, it does not merely
   * mark the page — it pushes what was already there along the line, and what was
   * already there is you. One damage, exactly like a RAT, and then one tile down
   * the line you were struck along.
   *
   * That is a small thing on an empty board and a large one on a full page,
   * which is the right shape for chaff in an era whose real threats are areas:
   * the cursor cannot kill you, but it can put you inside a SELECTION. Nothing
   * moves if there is nowhere to insert — see `openPage` in engine.ts.
   */
  cursor: {
    hp: 1,
    dmg: 1,
    poiseBreak: 1,
    slow: false,
    cost: 1,
    from: 9,
    name: 'CURSOR',
    tell: 'Steps onto you, and its blow pushes you one tile further along.',
    home: 'wordprocessor',
  },
  /*
   * THE SELECTION — the era's verb, and the reason era III is a place.
   *
   * It never moves and it never chases. It MARKS the tile you are standing on,
   * and on the next beat the paragraph around that mark — three by three — is
   * deleted. Then it marks wherever you are now, and does it again.
   *
   * ## Why the mark and the blow are two turns
   *
   * Era I threatens tiles and era II threatens lines, and both are answered by
   * ONE step: sideways out of a column, or off a row. An area cannot be answered
   * by one step, and that is the point — from the middle of a three-by-three,
   * one step still leaves you inside it. So the mark is a turn of warning that a
   * line never needs, and the counterplay is not a dodge but a route: you have
   * to have been leaving already. It taxes exactly the play the ceiling is made
   * of, which is standing still to build a combo ladder.
   *
   * Deliberately anchored on where you WERE rather than on where you will be.
   * A threat that both takes a turn to land and re-aims while it lands has no
   * answer but killing it, and every telegraph in this game has a dodge in it.
   *
   * Breaking its stance loses the drag as well as the blow: it has to mark again
   * before it can delete anything, exactly as interrupting a CARRIAGE costs it
   * its row. See `selectionPlan`, which reads the drag off its own last intent
   * rather than off a field on every enemy in the game.
   */
  selection: {
    hp: 3,
    dmg: 2,
    poiseBreak: 2,
    // Not `slow`: a slow unit spends its wind-up standing still and doing
    // nothing, and this one's first beat is the mark — the telegraph IS the
    // wind-up. The two beats live in the intent instead. See `selectionPlan`.
    slow: false,
    cost: 4,
    from: 9,
    name: 'SELECTION',
    tell: 'Marks the tile you stand on, then deletes the block around it. Be two tiles away.',
    home: 'wordprocessor',
  },
  /*
   * THE AUTOCOMPLETE — it finishes what you started.
   *
   * Every other turn it strikes the two tiles ahead of you, in the direction you
   * last moved. Not where you are: where you were GOING. It is the only thing in
   * the game that reads your momentum, and the counterplay is the only one of
   * its kind — do not carry on the way you were carrying on.
   *
   * It is the SELECTION's opposite half, and the pair is what makes era III a
   * question rather than a place with new pictures. A selection says LEAVE, and
   * the fastest way to leave anything is a straight line; this punishes exactly
   * that line. Together they ask you to move and to keep changing your mind,
   * which is a dance nothing in eras I or II asks for.
   *
   * A reacher, like the TYPEBAR, and for the same reason: something that
   * anticipates you is not also something you can walk away from. One damage —
   * its threat is POSITIONAL, and the era's boss and its selections need room to
   * take their own bite out of the top.
   *
   * Not `slow`, and that is the one number the harness moved here. On alternate
   * beats it did 3.8% of the era's damage and was simply background: a rule
   * about how you may move is not a rule if it only applies half the time, which
   * is the SEMICOLON's lesson restated. Acting every turn it does 10% and, more
   * to the point, it means what it says — carrying straight on is always
   * punished, and the answer is always available.
   */
  autocomplete: {
    hp: 2,
    dmg: 1,
    poiseBreak: 1,
    slow: false,
    cost: 3,
    from: 10,
    name: 'AUTOCOMPLETE',
    tell: 'Strikes the two tiles ahead of your last step. Turn, or stop.',
    home: 'wordprocessor',
  },
  /*
   * THE SELECT ALL — era III's boss, and the era's own verb at the scale of the
   * whole document.
   *
   * It does not move and it does not chase. It DRAGS: every turn the selection
   * grows a few tiles further through the page in reading order, and when it has
   * taken all it means to take, everything inside it is deleted at once and the
   * drag starts again from a different corner. Nothing is struck while the block
   * is growing, so the early turns of a pass are yours to fight in — and the
   * clear paper shrinks under you the whole time.
   *
   * ## Why it is a drag and not a band
   *
   * Era II's boss is a travelling LANE: one row safe, and the answer is to be on
   * it. Restating that as an area would have been the same fight drawn square.
   * This one asks the era's question instead — not "which line is safe" but
   * "where will the block have got to, and can I still be outside it" — and the
   * answer is a route across the page rather than a step onto a row.
   *
   * The corner rotates every pass, so the clear paper is at the foot of the page
   * on one pass and at its head on the next. That is what stops a single good
   * tile from solving the fight: era II's shelter converged on the machine, and
   * this one makes you cross.
   *
   * ## It ends by arithmetic
   *
   * `dragAt` is read off `floorTurns` and nothing else, so interrupting the
   * machine cancels the blow you were about to eat and does NOT stop the page
   * being selected. A boss whose clock you can pause by hitting it is a boss you
   * can stall forever — that is the failure the DROLLERY needed two extra rules
   * to patch.
   *
   * Each pass keeps one row fewer and runs at twice the rate of the last, so by
   * the sixth the drag takes the whole page and there is nowhere at all. That is
   * about turn twenty-six, in the same country as the carriage return's
   * twenty-five, and it is a deadline rather than a probability.
   */
  selectAll: {
    hp: 12,
    dmg: 2,
    poiseBreak: 3,
    slow: false,
    cost: 99, // never bought from a threat budget; placed by the boss floor
    from: 12,
    name: 'SELECT ALL',
    tell: 'Drags a selection through the page and deletes it. Be in the paper it has not reached.',
    home: 'wordprocessor',
  },
  /*
   * THE DROLLERY — the grotesque a scribe drew in the margin, and the first
   * boss.
   *
   * Deliberately simple. A first boss only has to teach that bosses exist, so it
   * does one new thing and does it on a rhythm you can read: it is SLOW, and on
   * the turn it winds it draws another creature out of the margin instead of
   * standing still. So the fight is a race you can see — every wind-up you fail
   * to punish is one more body on the board.
   *
   * Poise 3 means a bare stroke will not stop it. You have to build a ladder or
   * take a card that carries one, which is the first floor where the marginalia
   * are load-bearing rather than pleasant.
   */
  drollery: {
    hp: 8,
    dmg: 2,
    poiseBreak: 3,
    slow: true,
    cost: 99, // never bought from a threat budget; placed by the boss floor
    from: 4,
    name: 'DROLLERY',
    tell: 'Draws another out of the margin each time it winds. Burst it, or drown.',
    home: 'manuscript',
  },
};

export const ENEMY_ORDER: EnemyKind[] = [
  'rat',
  'stalker',
  'charger',
  'warden',
  'typebar',
  'carriage',
  'semicolon',
  'cursor',
  'selection',
  'autocomplete',
  'drollery',
  'carriageReturn',
  'selectAll',
];

/**
 * Where the page is safe, on a given floor-turn.
 *
 * THE CARRIAGE RETURN strikes everything EXCEPT a shelter, and the shelter is
 * two things at once: a travelling lane, and a stretch of that lane near the
 * machine itself.
 *
 * ## Why it is a shelter and not a band
 *
 * The first version was the other way round — a band of struck rows that grew
 * until it covered the page — and it was played and reported as "only ok since
 * it's just a damage race", which was exactly right. Once the band covers
 * everything there is no dodge, so the only strategy left is to have out-damaged
 * it, and a fight with one strategy is a stat check.
 *
 * Stated as a SHELTER instead, every turn has a dodge in it until the very last
 * one, and the fight becomes what a boss ought to be: a thing you can beat
 * without being hit at all, if you read it well enough.
 *
 * ## The two clocks
 *
 * The LANE travels down the page and back up again, one row every two turns,
 * ringing the bell each time it turns around. Every other turn it does not move,
 * and that is your free turn — the one you spend striking instead of following.
 *
 * The SHELTER is how much of that lane is actually safe, measured out from the
 * machine's own column, and it closes by one every five turns. It starts as the
 * whole row and ends as a single square beside the machine. So the safe ground
 * converges ON the boss: late in the fight the only place to stand is within
 * reach of it, which is where you wanted to be anyway.
 *
 * ## It still ends
 *
 * Shelter reaches zero at turn twenty-five, and from then the only unstruck
 * square is the one the boss is standing on — which nobody can stand on. So the
 * deadline survives the redesign intact: a player who has not killed it by then
 * takes a blow every turn until they are gone, and the fight terminates by
 * arithmetic exactly as before. What changed is that the twenty-five turns
 * before it are now playable.
 */
export function pageAt(floorTurns: number): { lane: number; shelter: number; turning: boolean } {
  const t = Math.max(0, floorTurns);
  // One row every other turn: the odd turns are the free ones.
  const steps = Math.floor(t / 2);
  const period = 2 * (SIZE - 1);
  const p = steps % period;
  const lane = p < SIZE ? p : period - p;
  return {
    lane,
    shelter: Math.max(0, SIZE - 1 - Math.floor(t / 5)),
    // The carriage has reached a margin and is about to travel back.
    turning: (lane === 0 || lane === SIZE - 1) && t % 2 === 0,
  };
}

/* -------------------------------------------------------------------------
 * THE SELECT ALL's clock.
 *
 * Everything about the fight is a function of `floorTurns` and nothing else,
 * exactly like `pageAt`. Hitting the machine cancels a blow; it never pauses the
 * page.
 * ---------------------------------------------------------------------- */

/** How much clear paper a pass leaves behind: most of a row, then one less each time. */
const dragKeeps = (pass: number): number => Math.max(0, SIZE - 1 - pass);

/** Tiles taken per turn. Rising each pass is what turns the fight into a deadline. */
const dragRate = (pass: number): number => 3 + pass * 2;

/** How much of the page a pass takes before it deletes what it has. */
const dragTarget = (pass: number): number => SIZE * SIZE - dragKeeps(pass);

/**
 * Where the drag has got to, on a given floor-turn.
 *
 * `count` is how many tiles of the page are selected IN READING ORDER from this
 * pass's corner; `releasing` is true on the one turn of each pass when the block
 * is deleted. Passes get shorter and take more, so the clear paper runs out by
 * the sixth of them — around turn twenty-six, whatever anyone does.
 */
export function dragAt(floorTurns: number): { pass: number; count: number; releasing: boolean } {
  let turn = Math.max(0, Math.floor(floorTurns));
  for (let pass = 0; pass < 64; pass++) {
    const rate = dragRate(pass);
    const target = dragTarget(pass);
    const span = Math.ceil(target / rate);
    if (turn < span) {
      const count = Math.min(target, rate * (turn + 1));
      return { pass, count, releasing: count >= target };
    }
    turn -= span;
  }
  return { pass: 64, count: SIZE * SIZE, releasing: true };
}

/**
 * The page in reading order, from the corner this pass starts at.
 *
 * The corner rotates every pass, which is the thing that stops one good tile
 * from solving the fight. Era II's shelter converged on the machine; this one
 * makes you cross the page to meet it.
 */
export function documentOrder(pass: number): Vec[] {
  const flipX = pass % 2 === 1;
  const flipY = pass % 4 >= 2;
  const out: Vec[] = [];
  for (let i = 0; i < SIZE; i++) {
    const y = flipY ? SIZE - 1 - i : i;
    for (let j = 0; j < SIZE; j++) {
      out.push({ x: flipX ? SIZE - 1 - j : j, y });
    }
  }
  return out;
}

/** True on the turn the drag lets go and the page it has taken is deleted. */
export const releasesPage = (floorTurns: number): boolean => dragAt(floorTurns).releasing;

/** True on the turn the carriage reaches a margin and starts back. */
export const ringsBell = (floorTurns: number): boolean =>
  floorTurns > 0 && pageAt(floorTurns).turning && pageAt(floorTurns - 1).lane !== pageAt(floorTurns).lane;

/**
 * Does this kind alternate STEPPING and STRIKING, rather than winding and acting?
 *
 * `slow` means "wind up, then act", which is what makes a heavy dodgeable — and
 * it is wrong for a chaser that also strikes on a beat, because a slow unit does
 * not move on its wind turn and would therefore never move at all. A strider
 * spends one turn closing and the next striking, and `ready` alternates between
 * the two instead of counting a wind-up.
 *
 * A predicate rather than a field, matching `spawnsOnWind`: one kind does this,
 * and a boolean on every stat block to say "no" is noise.
 */
export const strides = (k: EnemyKind): boolean => k === 'carriage';

/** Does this kind pull another body onto the board when it winds? */
export const spawnsOnWind = (k: EnemyKind): boolean => k === 'drollery';

/**
 * Does a blow from this kind MOVE you?
 *
 * Era III edits the page rather than merely marking it, and a CURSOR inserts:
 * where it strikes, what was there is pushed one tile along. A predicate rather
 * than a field, matching `strides` and `spawnsOnWind` — one kind does this, and
 * a boolean on every stat block to say "no" is noise.
 *
 * The engine also runs displacers LAST in the enemy phase, so nothing can push
 * you into a blow that has already landed. See `step`.
 */
export const displaces = (k: EnemyKind): boolean => k === 'cursor';

/**
 * Can this enemy legally end a step on `v`?
 *
 * The player's tile counts as passable — moving onto it is how an enemy strikes.
 * Items are walked over freely; only blots, walls and other enemies block.
 */
function passable(s: GameState, v: Vec, selfId: number): boolean {
  if (!inBounds(v)) return false;
  if (s.blots.some((b) => eq(b, v))) return false;
  if (s.enemies.some((o) => o.id !== selfId && eq(o.pos, v))) return false;
  return true;
}

const HOLD: Intent = { kind: 'hold', path: [] };
const WIND: Intent = { kind: 'wind', path: [] };

/** Greedy orthogonal chase. Used by RAT and WARDEN. */
function orthoPlan(e: Enemy, s: GameState, rng: Rng): Intent {
  const goal = s.player.pos;
  const cands = ORTHO.map((v) => add(e.pos, v)).filter((v) => passable(s, v, e.id));
  if (cands.length === 0) return HOLD;

  const here = manhattan(e.pos, goal);
  const scored = cands.map((v) => ({ v, d: manhattan(v, goal) }));
  const best = Math.min(...scored.map((x) => x.d));

  if (best < here) {
    return { kind: 'move', path: [rng.pick(scored.filter((x) => x.d === best)).v] };
  }
  // Boxed in. Shuffle sideways rather than freeze, so a stuck enemy still feels
  // alive — but never when already adjacent, or it would dance out of reach.
  if (here <= 1) return HOLD;
  const lateral = scored.filter((x) => x.d === here);
  if (lateral.length === 0) return HOLD;
  return { kind: 'move', path: [rng.pick(lateral).v] };
}

/**
 * STALKER: closes fast on the diagonal, but can only strike orthogonally.
 *
 * That asymmetry is deliberate. A diagonal-only attacker would be unhittable —
 * the player attacks orthogonally, so a stalker sitting on a diagonal could
 * never be answered. Forcing it to step square-on to strike gives you exactly
 * one turn, clearly telegraphed, to hit it first.
 */
function stalkerPlan(e: Enemy, s: GameState, rng: Rng): Intent {
  const goal = s.player.pos;

  // Square-on already: strike.
  if (manhattan(e.pos, goal) === 1) return { kind: 'move', path: [{ ...goal }] };

  const here = chebyshev(e.pos, goal);
  const diags = DIAG.map((v) => add(e.pos, v))
    .filter((v) => !eq(v, goal)) // cannot strike diagonally
    .filter((v) => passable(s, v, e.id));

  const closing = diags.filter((v) => chebyshev(v, goal) < here);
  if (closing.length > 0) return { kind: 'move', path: [rng.pick(closing)] };

  // Cannot close diagonally (it is parity-locked away from you). Step orthogonally
  // to flip parity — this is the turn it lines up for a strike.
  const orthos = ORTHO.map((v) => add(e.pos, v))
    .filter((v) => !eq(v, goal))
    .filter((v) => passable(s, v, e.id));
  const useful = orthos.filter((v) => manhattan(v, goal) <= manhattan(e.pos, goal));
  if (useful.length > 0) return { kind: 'move', path: [rng.pick(useful)] };

  if (diags.length > 0) return { kind: 'move', path: [rng.pick(diags)] };
  return HOLD;
}

/**
 * CHARGER: a two-tile lunge along a single axis, every other turn.
 *
 * The lunge is committed a full turn ahead, so the counterplay is a sidestep out
 * of the line — the charger commits to the tiles, not to you, and rockets past
 * into empty paper. This is the game's best "dodge" moment.
 */
function chargerPlan(e: Enemy, s: GameState, _rng: Rng): Intent {
  const goal = s.player.pos;
  const dx = goal.x - e.pos.x;
  const dy = goal.y - e.pos.y;

  let axis: Vec;
  if (dy === 0 && dx !== 0) axis = { x: Math.sign(dx), y: 0 };
  else if (dx === 0 && dy !== 0) axis = { x: 0, y: Math.sign(dy) };
  else if (Math.abs(dx) >= Math.abs(dy)) axis = { x: Math.sign(dx), y: 0 };
  else axis = { x: 0, y: Math.sign(dy) };

  const path: Vec[] = [];
  let cur = e.pos;
  for (let i = 0; i < 2; i++) {
    const next = add(cur, axis);
    if (!passable(s, next, e.id) && !eq(next, goal)) break;
    if (!inBounds(next)) break;
    path.push(next);
    if (eq(next, goal)) break; // connects — stop here
    cur = next;
  }

  if (path.length === 0) return HOLD;
  return { kind: 'move', path };
}

/**
 * THE CARRIAGE RETURN: everything except the shelter.
 *
 * Stated as the complement of `pageAt` — what is SAFE is the small thing and
 * what is struck is the rest, which is the whole point of the redesign and is
 * also how it reads on the board: a page almost entirely red, with one short
 * stretch of clear paper beside the machine.
 *
 * Its own tile is excluded like every other sweep, because the machine is what
 * strikes and not what is struck. That is bookkeeping, not mercy: nobody can
 * stand there.
 */
function carriageReturnPlan(e: Enemy, s: GameState): Intent {
  const { lane, shelter } = pageAt(s.floorTurns);
  const tiles: Vec[] = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (x === e.pos.x && y === e.pos.y) continue;
      // Safe: in the travelling lane, and within the shelter of the machine's
      // own column. Everything else takes the blow.
      if (y === lane && Math.abs(x - e.pos.x) <= shelter) continue;
      tiles.push({ x, y });
    }
  }
  return { kind: 'sweep', path: [], tiles };
}

/**
 * SEMICOLON: the two squares either side of it, and nothing more.
 *
 * The smallest line in the game. It does not aim — like the CARRIAGE it strikes
 * out from where it stands — so the counterplay is simply not to be beside it on
 * the beat, which is a lesson in the era's grammar that costs one health to
 * learn rather than three.
 */
function semicolonPlan(e: Enemy): Intent {
  const tiles: Vec[] = [];
  for (const dx of [-1, 1]) {
    const x = e.pos.x + dx;
    if (x >= 0 && x < SIZE) tiles.push({ x, y: e.pos.y });
  }
  return { kind: 'sweep', path: [], tiles };
}

/**
 * CARRIAGE: closes by LINING UP, not by getting nearer.
 *
 * A plain orthogonal chase is wrong for something that strikes a row, and the
 * harness put a number on how wrong: measured against a 3-ply bot, the carriage
 * and the typebar spent almost exactly the same time on the board (3952 against
 * 3936 tile-turns) and the carriage did 9.5% of the damage to the typebar's 23%
 * — less than half, while hitting twice as hard. The reason is geometry. A chase
 * that only shortens the distance parks it in your COLUMN about as often as your
 * row, and a row sweep from your column misses entirely.
 *
 * So it matches your row first and only then closes along it, which is both the
 * fix and what the machine actually does: a carriage travels to put the paper
 * where the strike will land. Being in front of it is not the danger; being
 * level with it is.
 */
function carriageStep(e: Enemy, s: GameState, rng: Rng): Intent {
  const goal = s.player.pos;
  const cands = ORTHO.map((v) => add(e.pos, v)).filter((v) => passable(s, v, e.id));
  if (cands.length === 0) return HOLD;

  // Getting level is worth more than getting near, so rank on |dy| first and use
  // distance only to break ties between two moves that align equally well.
  const score = (v: Vec) => Math.abs(v.y - goal.y) * 100 + manhattan(v, goal);
  const here = score(e.pos);
  const best = Math.min(...cands.map(score));
  if (best < here) return { kind: 'move', path: [rng.pick(cands.filter((v) => score(v) === best))] };

  // Already as level and as close as it can get. Hold rather than shuffle: a
  // carriage that danced sideways would leave the row it just took up.
  return HOLD;
}

/**
 * The whole of the row it is standing in, on the beat after it steps.
 *
 * Its OWN row, unlike the typebar's aim at yours — because it walks. A threat
 * that both follows you and re-aims would leave no answer but killing it, and
 * the whole contract here is that every telegraph has a dodge in it.
 */
function carriagePlan(e: Enemy): Intent {
  const tiles: Vec[] = [];
  for (let x = 0; x < SIZE; x++) {
    if (x === e.pos.x) continue; // the carriage is what strikes, not what is struck
    tiles.push({ x, y: e.pos.y });
  }
  return { kind: 'sweep', path: [], tiles };
}

/**
 * TYPEBAR: strikes the whole of the column you were standing in, one turn later.
 *
 * It aims at YOUR column, not at its own, and that is the whole design. The
 * first version struck the column it stood in, and the harness was blunt about
 * it: 0.0–0.4 damage a floor and about twenty-five extra turns on it. Nothing
 * ever forces you into a fixed column on a board with four others, so everyone
 * simply left, nobody was ever hit, and the only thing it changed was how long
 * a floor took — difficulty by attrition, which is what the spill already does
 * better.
 *
 * Aiming at you makes it a read instead. The column is committed a full turn
 * ahead like everything else here, and the counterplay is one step SIDEWAYS —
 * moving up or down inside the column does nothing, which is a genuinely
 * different question from every dodge in era I, where any perpendicular step
 * works. And it is what the machine actually does: the bar strikes wherever the
 * paper has been carried to.
 *
 * Its own tile is excluded — the bar is what strikes, not what is struck — and
 * blots are not: a bar comes down on the page rather than walking across it, so
 * there is no cover from it, no occlusion to work out, and the read stays
 * exactly "this column is lethal".
 */
function typebarPlan(e: Enemy, s: GameState): Intent {
  const tiles: Vec[] = [];
  const x = s.player.pos.x;
  for (let y = 0; y < SIZE; y++) {
    if (x === e.pos.x && y === e.pos.y) continue;
    tiles.push({ x, y });
  }
  return { kind: 'sweep', path: [], tiles };
}

/**
 * SELECTION: mark where you stand, open the block out, then delete it.
 *
 * The beats live in the intent rather than in a field on the enemy, and that is
 * worth saying plainly: the drag IS the telegraph, so the thing that has to be
 * remembered between turns is exactly the thing already being drawn. A one-tile
 * select is a mark; a nine-tile one is the shape; a nine-tile one that has
 * released is the blow.
 *
 * ## Three beats, not two, and the harness insisted
 *
 * It first went mark → delete, which gives you one move to get two tiles clear
 * of the anchor. That is possible on an empty board and rarely possible on a
 * real one, and it showed: measured over forty 3-ply runs past depth 9, this one
 * kind did 54% of all the damage in the era on a sixth of the board-time of a
 * WARDEN — about twelve times the damage per turn on the page of anything else
 * in the game. Not a threat, a tax with a picture on it.
 *
 * The extra beat fixes both halves at once. It halves the rate, and it makes the
 * dodge honest: two moves to leave a three-by-three is a route you can actually
 * take. It also reads better, because the turn it buys is the turn the SHAPE is
 * on the page — before, all you ever saw in advance was a dot.
 *
 * `e.poise` is false for precisely one plan — the one straight after a stance
 * was broken — which is what makes an interrupt cost the drag as well as the
 * blow. It has to start over from a fresh mark, so a stroke buys you two turns
 * rather than one.
 */
function selectionPlan(e: Enemy, s: GameState): Intent {
  const prev = e.intent;
  const held = e.poise && prev.kind === 'select' && !prev.release;
  // Beat two: the mark opens out into the block it is going to take. Drawn, not
  // struck — this is the turn the shape itself becomes readable.
  if (held && prev.tiles.length === 1) {
    return { kind: 'select', path: [], tiles: blockAround(prev.tiles[0]), release: false };
  }
  // Beat three: the same block, deleted. The tiles do not change between the
  // last two beats, or the telegraph would be a different promise on the turn it
  // was kept.
  if (held) return { kind: 'select', path: [], tiles: prev.tiles.map((t) => ({ ...t })), release: true };
  return { kind: 'select', path: [], tiles: [{ ...s.player.pos }], release: false };
}

/** The paragraph around a mark: three by three, clipped to the page. */
function blockAround(v: Vec): Vec[] {
  const out: Vec[] = [];
  for (let y = v.y - 1; y <= v.y + 1; y++) {
    for (let x = v.x - 1; x <= v.x + 1; x++) {
      if (inBounds({ x, y })) out.push({ x, y });
    }
  }
  return out;
}

/**
 * AUTOCOMPLETE: the two tiles ahead of your last step.
 *
 * Aimed at your MOMENTUM rather than at your position, which is the one thing on
 * the board that no other kind reads. `facing` is set by every step and every
 * stroke, so it is always the direction you actually last committed to.
 *
 * Off the edge of the page it simply comes up short, and against a player who
 * has been holding their ground it may have nothing at all to strike. That is
 * correct rather than a hole: you did not start anything, so there is nothing to
 * finish.
 */
function autocompletePlan(e: Enemy, s: GameState): Intent {
  const step = DIR_VEC[s.player.facing];
  const tiles: Vec[] = [];
  let cur = s.player.pos;
  for (let i = 0; i < 2; i++) {
    cur = add(cur, step);
    if (!inBounds(cur)) break;
    if (eq(cur, e.pos)) continue; // the suggestion is what strikes, not what is struck
    tiles.push({ ...cur });
  }
  return { kind: 'sweep', path: [], tiles };
}

/**
 * THE SELECT ALL: as much of the page as the drag has reached.
 *
 * Read straight off the floor clock, so the page keeps being taken whether or
 * not the machine was interrupted — and `releasing` is what turns a block that
 * is merely drawn into one that is deleted.
 */
function selectAllPlan(e: Enemy, s: GameState): Intent {
  const { pass, count, releasing } = dragAt(s.floorTurns);
  const tiles = documentOrder(pass)
    .slice(0, count)
    // Its own tile is excluded like every other sweep: the machine is what
    // selects, not what is selected. Bookkeeping, not mercy — nobody can stand
    // there anyway.
    .filter((t) => !eq(t, e.pos));
  return { kind: 'select', path: [], tiles, release: releasing };
}

/** Compute (and thereby telegraph) what this enemy will do on the coming turn. */
export function planIntent(e: Enemy, s: GameState, rng: Rng): Intent {
  const st = ENEMY_STATS[e.kind];

  /*
   * A DROLLERY is slow only while it still has margin to draw in.
   *
   * Its wind-up is not a rest, it is a summon — so once the page is full the
   * wind-up has nothing left to do, and it simply comes for you every turn
   * instead. "It has drawn all it can, so now it advances."
   *
   * This is also what guarantees a boss fight ENDS. A boss floor has no spill by
   * design, so the boss is the only clock on it — and a clock that stops once
   * the board fills is not a clock. Measured before this rule existed: 22% of
   * 1-ply runs never died, kiting a capped-out boss around an open board until
   * the turn budget ran out.
   */
  if (spawnsOnWind(e.kind) && s.enemies.length >= MAX_ENEMIES) {
    return orthoPlan(e, s, rng);
  }

  if (st.slow && !e.ready) return WIND;

  switch (e.kind) {
    case 'rat':
    case 'warden':
    // A DROLLERY closes exactly like a heavy: straight at you, one tile at a
    // time. Everything that makes it a boss happens on the wind-up.
    case 'drollery':
      return orthoPlan(e, s, rng);
    case 'stalker':
      return stalkerPlan(e, s, rng);
    case 'charger':
      return chargerPlan(e, s, rng);
    case 'typebar':
      return typebarPlan(e, s);
    // Steps on one beat, sweeps on the next. `ready` is the beat.
    case 'carriage':
      return e.ready ? carriagePlan(e) : carriageStep(e, s, rng);
    case 'carriageReturn':
      return carriageReturnPlan(e, s);
    case 'selection':
      return selectionPlan(e, s);
    case 'autocomplete':
      return autocompletePlan(e, s);
    case 'selectAll':
      return selectAllPlan(e, s);
    /*
     * A CURSOR walks onto you exactly like any chaff. Everything that makes it
     * era III's chaff rather than era I's happens when the blow LANDS — see
     * `displaces` and `insert` in engine.ts.
     */
    case 'cursor':
      return orthoPlan(e, s, rng);
    /*
     * Walks at you like any chaff, and PUNCTUATES once it is level and beside
     * you — which is the only turn its little line is worth anything.
     *
     * It first alternated step and strike like the CARRIAGE, and the harness
     * killed that outright: a thing which never enters your tile and only
     * threatens on alternate beats can be ignored forever. Four 3-ply runs in
     * thirty stalled at one health, farming spilled semicolons for three or four
     * thousand turns, because killing one was optional and safe. That breaks the
     * spill's whole guarantee — chaff has to be something which, IGNORED, kills
     * you. Acting every turn and closing into contact restores that; the row
     * attack survives as what it does when it arrives.
     */
    case 'semicolon': {
      const p = s.player.pos;
      const beside = p.y === e.pos.y && Math.abs(p.x - e.pos.x) === 1;
      return beside ? semicolonPlan(e) : orthoPlan(e, s, rng);
    }
  }
}

/**
 * Does this intent, as planned, land on the player? Drives the red telegraph.
 *
 * Everything downstream of readability runs through this one function — the
 * telegraph colour, `preview.underThreat`, and FLOW's "you stepped out of
 * something committed" — so a new intent kind is only really in the game once it
 * is answered here.
 */
export function intentThreatens(intent: Intent, playerPos: Vec): boolean {
  if (intent.kind === 'move') return intent.path.some((v) => eq(v, playerPos));
  if (intent.kind === 'sweep') return intent.tiles.some((v) => eq(v, playerPos));
  /*
   * A block that is still being held down threatens nothing YET, and saying
   * otherwise would be the more dangerous mistake: the telegraph would go red a
   * turn early, `underThreat` would shout on a turn where standing still is
   * free, and FLOW would pay out for leaving a mark that was never a blow. The
   * shape is a warning; `release` is the promise.
   */
  if (intent.kind === 'select') return intent.release && intent.tiles.some((v) => eq(v, playerPos));
  return false;
}

export function makeEnemy(id: number, kind: EnemyKind, pos: Vec, seed: number): Enemy {
  const st = ENEMY_STATS[kind];
  return {
    id,
    kind,
    pos,
    hp: st.hp,
    maxHp: st.hp,
    // Slow units arrive winding up, so you always get a turn of warning.
    ready: false,
    struck: false,
    poise: true,
    intent: HOLD,
    seed,
  };
}
