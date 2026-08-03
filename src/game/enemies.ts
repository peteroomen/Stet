import { DIAG, MAX_ENEMIES, ORTHO, add, chebyshev, eq, inBounds, manhattan } from './grid';
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

export const ENEMY_ORDER: EnemyKind[] = ['rat', 'stalker', 'charger', 'warden', 'drollery'];

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
  }
}

/** Does this intent, as planned, land on the player? Drives the red telegraph. */
export function intentThreatens(intent: Intent, playerPos: Vec): boolean {
  return intent.kind === 'move' && intent.path.some((v) => eq(v, playerPos));
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
