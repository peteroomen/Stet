import { DIAG, MAX_ENEMIES, ORTHO, SIZE, add, chebyshev, eq, inBounds, manhattan } from './grid';
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
  },
};

export const ENEMY_ORDER: EnemyKind[] = [
  'rat',
  'stalker',
  'charger',
  'warden',
  'typebar',
  'carriage',
  'drollery',
  'carriageReturn',
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
