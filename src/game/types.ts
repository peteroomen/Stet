/** Core value types for the STET rules engine. No DOM, no rendering, no audio. */

import type { Rules } from './rules';

export type Vec = { x: number; y: number };
export type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * What you can spend a turn on.
 *
 * `wait` holds your ground: you do not move, you do not swing, and the enemy
 * phase runs anyway. It is gated behind `Rules.allowWait` because standing still
 * is exactly the strategy the spill exists to punish — see rules.ts.
 */
export type Action = Dir | 'wait';

export type EnemyKind = 'rat' | 'stalker' | 'charger' | 'warden' | 'drollery';
export type ItemKind = 'vial' | 'nib' | 'gesso';

/**
 * What an enemy has committed to doing on the coming turn.
 *
 * This is the heart of the game's readability: intents are computed at the END
 * of a turn (against where the player stood then) and executed at the START of
 * the next one, unchanged. Enemies commit exactly like the player does, so a
 * telegraph is a promise, not a prediction — and a lunge can be baited into
 * empty paper.
 */
export type Intent =
  /** Walk this path, one tile at a time, stopping early if blocked. */
  | { kind: 'move'; path: Vec[] }
  /** Winding up. Will not move this turn; acts next turn. */
  | { kind: 'wind'; path: [] }
  /** Nowhere legal to go. */
  | { kind: 'hold'; path: [] };

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Vec;
  hp: number;
  maxHp: number;
  /** Slow units alternate: false = winding up, true = will act. */
  ready: boolean;
  /** Struck during this turn's player phase. Consumed by the enemy phase. */
  struck: boolean;
  /**
   * Whether a strike will break its stance.
   *
   * A landed stroke on a poised enemy CANCELS its committed action — which is
   * what makes aggression defensive. Without it, attacking could only ever cost
   * you safety: measured, depths 2 and 3 were the hardest floors in the game
   * (2.7 damage each, only 13% of them clean) because no move both progressed
   * the floor and prevented a blow.
   *
   * But an interrupt you can repeat forever is not a fight. Breaking poise
   * spends it; it returns only on a turn you leave the enemy alone. So a heavy
   * is a rhythm — strike, step away, strike — and never a lock. (Measured: with
   * unlimited stagger a 3-ply bot ran to median depth 53.)
   */
  poise: boolean;
  intent: Intent;
  /** Stable per-entity seed so the hand-drawn wobble doesn't reshuffle each frame. */
  seed: number;
}

export interface Item {
  id: number;
  kind: ItemKind;
  pos: Vec;
  seed: number;
}

export interface Player {
  pos: Vec;
  hp: number;
  maxHp: number;
  /** Base damage. Raised permanently by a NIB. */
  dmg: number;
  /**
   * Mid-swing. Set the instant you strike, consumed by the enemy phase of the
   * same turn (damage against you doubles), then held for display until you act
   * again. Striking again keeps it set — that is the whole risk of a combo.
   */
  exposed: boolean;
  /** Consecutive strikes. Each adds +1 damage, capped at MAX_COMBO. */
  combo: number;
  /**
   * Charged by stepping out of a committed strike; spent on the next one.
   *
   * Only ever set under a rule variant with `flowBonus > 0` — see rules.ts. The
   * shipped game leaves it permanently false.
   */
  flow: boolean;
  /**
   * Ink left before you fade off the page. See Rules.fadeMax; unused while the
   * fade is off, and reset on every descent.
   */
  ink: number;
  /**
   * GESSO — the ground laid over a page before anything is written on it.
   *
   * Takes blows before your health does, and **cannot be mended**: MEND, RALLY
   * and a vial all restore health and never this. So it is a resource you spend
   * once and only replace by finding more, which makes a spare layer worth
   * routing across a floor for in a way another heart never is.
   */
  ward: number;
  /**
   * Tiles the page still remembers you standing on, most recent first.
   *
   * Only used when `Rules.wearMemory > 0`. Cleared by a stroke — committing to a
   * fight is the opposite of the pacing this exists to charge for.
   */
  trail: Vec[];
  facing: Dir;
}

/**
 * `choosing` is a descent held open while three marginalia are on the page.
 *
 * A separate screen rather than a modal over `playing`, because every input path
 * — swipe, tap, key — has to stop meaning "take a turn" while the cards are up,
 * and one flag read in one place is safer than remembering that at each of them.
 */
export type Screen = 'title' | 'playing' | 'choosing' | 'dead';

export interface RunStats {
  kills: number;
  turns: number;
  damageTaken: number;
  nibs: number;
  vials: number;
  deepest: number;
}

export interface GameState {
  screen: Screen;
  depth: number;
  turn: number;
  /** Turns spent on the current floor. Drives the spill (see engine.ts). */
  floorTurns: number;
  /** Turns of quiet before the page starts filling. Scales with the floor's size. */
  grace: number;
  player: Player;
  enemies: Enemy[];
  items: Item[];
  blots: Vec[];
  stairs: Vec;
  /** Stairs are visible from the moment you arrive, but sealed until the floor is clear. */
  stairsOpen: boolean;
  rng: number;
  nextId: number;
  stats: RunStats;
  /** Which rule variant this run is being played under. See rules.ts. */
  rules: Rules;
  /** Extra actions already taken this turn under MOMENTUM. */
  chain: number;
  /** Health lost on the current floor — the ceiling on what RALLY can give back. */
  floorHpLost: number;
  /** Health RALLY has already given back on this floor. */
  floorHpRallied: number;
  /** Turns since the last spill. Reset on descent and on each spill. */
  spillClock: number;
  /** Holds spent on this floor. See Rules.waitsPerFloor. */
  floorWaits: number;
  /** Marginalia taken this run, in the order they were taken. */
  traits: string[];
  /** The three on offer while `screen` is 'choosing'. Empty otherwise. */
  offer: string[];
}

/** Which half of the turn an event belongs to — the renderer schedules from this. */
export type EvPhase = 'p' | 'e';

export type Ev =
  | { t: 'blocked'; phase: EvPhase; pos: Vec; dir: Dir }
  | { t: 'wait'; phase: EvPhase; pos: Vec }
  | { t: 'move'; phase: EvPhase; from: Vec; to: Vec; dir: Dir }
  | {
      t: 'bump';
      phase: EvPhase;
      from: Vec;
      to: Vec;
      dir: Dir;
      dmg: number;
      combo: number;
      killed: boolean;
      kind: EnemyKind;
      id: number;
      /** Did this stroke break the stance? False = it landed but was shrugged off. */
      broke: boolean;
    }
  | { t: 'kill'; phase: EvPhase; pos: Vec; kind: EnemyKind }
  | { t: 'emove'; phase: EvPhase; id: number; kind: EnemyKind; from: Vec; to: Vec }
  | { t: 'wind'; phase: EvPhase; id: number; kind: EnemyKind; pos: Vec }
  | {
      t: 'eattack';
      phase: EvPhase;
      id: number;
      kind: EnemyKind;
      from: Vec;
      at: Vec;
      dmg: number;
      exposed: boolean;
      hpAfter: number;
    }
  | { t: 'pickup'; phase: EvPhase; pos: Vec; kind: ItemKind; amount: number }
  | { t: 'stagger'; phase: EvPhase; id: number; kind: EnemyKind; pos: Vec; interrupted: boolean }
  | { t: 'spill'; phase: EvPhase; pos: Vec; kind: EnemyKind }
  | { t: 'unseal'; phase: EvPhase; pos: Vec }
  | { t: 'descend'; phase: EvPhase; depth: number }
  | { t: 'offer'; phase: EvPhase; ids: string[] }
  | { t: 'trait'; phase: EvPhase; id: string }
  | {
      t: 'death';
      phase: EvPhase;
      depth: number;
      /** What ended it. `fade` means the ink ran out, not that anything hit you. */
      cause: 'blow' | 'fade';
    };

export interface StepResult {
  state: GameState;
  events: Ev[];
  /** False when the input was rejected (a wall) — no turn passed, so no enemy phase. */
  spent: boolean;
}
