/** Core value types for the STET rules engine. No DOM, no rendering, no audio. */

export type Vec = { x: number; y: number };
export type Dir = 'up' | 'down' | 'left' | 'right';

export type EnemyKind = 'rat' | 'stalker' | 'charger' | 'warden';
export type ItemKind = 'vial' | 'nib';

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
  facing: Dir;
}

export type Screen = 'title' | 'playing' | 'dead';

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
}

/** Which half of the turn an event belongs to — the renderer schedules from this. */
export type EvPhase = 'p' | 'e';

export type Ev =
  | { t: 'blocked'; phase: EvPhase; pos: Vec; dir: Dir }
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
  | { t: 'spill'; phase: EvPhase; pos: Vec; kind: EnemyKind }
  | { t: 'unseal'; phase: EvPhase; pos: Vec }
  | { t: 'descend'; phase: EvPhase; depth: number }
  | { t: 'death'; phase: EvPhase; depth: number };

export interface StepResult {
  state: GameState;
  events: Ev[];
  /** False when the input was rejected (a wall) — no turn passed, so no enemy phase. */
  spent: boolean;
}
