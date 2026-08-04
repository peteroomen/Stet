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

export type EnemyKind =
  | 'rat'
  | 'stalker'
  | 'charger'
  | 'warden'
  | 'drollery'
  | 'typebar'
  | 'carriage'
  | 'carriageReturn'
  | 'semicolon';
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
  /**
   * Strike every one of these tiles at once, without moving.
   *
   * Era I threatens TILES: one tile, or a two-tile lunge, and every dodge in the
   * game is therefore a sidestep. A machine does not hit points, it hits LINES —
   * so a sweep is a set of tiles struck simultaneously by something that stays
   * where it is, and the counterplay is to be somewhere else entirely rather
   * than one tile over. Nothing blocks it: it is a bar coming down on the page,
   * not a body walking through it.
   *
   * `path` stays present and empty so every `intent.path` read in the renderer
   * and the engine keeps working; `tiles` is the payload.
   */
  | { kind: 'sweep'; path: []; tiles: Vec[] }
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

/**
 * A deep copy of a board, for `step()` to mutate freely.
 *
 * This is a hand-written `structuredClone`, and it is here because it is by far
 * the hottest thing in the project. `step()` is pure, so every call copies the
 * whole state — and the N-ply bots call `step()` exponentially, four times per
 * ply. Measured by `npm run bench` on a page-3 board with four foes:
 *
 *   structuredClone   24.56 µs
 *   cloneState         0.72 µs      34x faster
 *   step() total       3.06 µs      was ~27
 *
 * An eight-fold faster turn, which took the test suite from 122s to 15s with a
 * byte-identical curve. It is also what the previews pay four times over on
 * every real input, so this is not only a test-suite concern.
 *
 * Written out longhand rather than generically on purpose. A `for…in` copy would
 * be nearly as slow (the cost is the generic traversal, not the allocation), and
 * a shallow spread would silently alias the arrays — which in a mutating engine
 * is the worst possible bug: a bot's hypothetical move would edit the real board.
 * `cloneState.test.ts` checks this against `structuredClone` for deep equality
 * AND for non-aliasing across every field, so adding a field without adding it
 * here fails a test rather than corrupting a run.
 */
export function cloneState(s: GameState): GameState {
  const p = s.player;
  return {
    screen: s.screen,
    depth: s.depth,
    turn: s.turn,
    floorTurns: s.floorTurns,
    grace: s.grace,
    player: {
      pos: { x: p.pos.x, y: p.pos.y },
      hp: p.hp,
      maxHp: p.maxHp,
      dmg: p.dmg,
      exposed: p.exposed,
      combo: p.combo,
      flow: p.flow,
      ink: p.ink,
      ward: p.ward,
      trail: p.trail.map((v) => ({ x: v.x, y: v.y })),
      facing: p.facing,
    },
    enemies: s.enemies.map((e) => ({
      id: e.id,
      kind: e.kind,
      pos: { x: e.pos.x, y: e.pos.y },
      hp: e.hp,
      maxHp: e.maxHp,
      ready: e.ready,
      struck: e.struck,
      poise: e.poise,
      intent: cloneIntent(e.intent),
      seed: e.seed,
    })),
    items: s.items.map((i) => ({
      id: i.id,
      kind: i.kind,
      pos: { x: i.pos.x, y: i.pos.y },
      seed: i.seed,
    })),
    blots: s.blots.map((b) => ({ x: b.x, y: b.y })),
    stairs: { x: s.stairs.x, y: s.stairs.y },
    stairsOpen: s.stairsOpen,
    rng: s.rng,
    nextId: s.nextId,
    stats: { ...s.stats },
    // Rules are immutable by contract — a trait builds a NEW object rather than
    // editing one (see `applyTraitRules`), so this reference is safe to share and
    // copying it would be pure waste on the hottest path in the game.
    rules: s.rules,
    chain: s.chain,
    floorHpLost: s.floorHpLost,
    floorHpRallied: s.floorHpRallied,
    spillClock: s.spillClock,
    floorWaits: s.floorWaits,
    traits: s.traits.slice(),
    offer: s.offer.slice(),
  };
}

function cloneIntent(i: Intent): Intent {
  switch (i.kind) {
    case 'move':
      return { kind: 'move', path: i.path.map((v) => ({ x: v.x, y: v.y })) };
    case 'sweep':
      return { kind: 'sweep', path: [], tiles: i.tiles.map((v) => ({ x: v.x, y: v.y })) };
    case 'wind':
      return { kind: 'wind', path: [] };
    case 'hold':
      return { kind: 'hold', path: [] };
  }
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
      /**
       * A foe the stroke caught rather than one you aimed at — the reach card
       * carrying through, or the splash card catching what you were touching.
       *
       * The renderer must not take its player motion from one of these: the hero
       * lunges at the tile you swiped toward, and a glance can be in any
       * direction at all.
       */
      glance: boolean;
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
  /**
   * The carriage has run off the end of the page and come back.
   *
   * Its own event because it is the boss's one piece of teaching: the bell is
   * what tells you the band just got wider, and a player who never learns that
   * is a player who thinks the fight got unfair rather than that it advanced.
   */
  | { t: 'bell'; phase: EvPhase; pos: Vec; width: number }
  /**
   * The page filled with nowhere left to put it, so it filled over you.
   *
   * Not an `eattack`: nothing struck you, so it is never doubled by exposure and
   * no enemy is credited with it. It is what a spill becomes once the board is
   * at MAX_ENEMIES — see engine.ts.
   */
  | { t: 'drown'; phase: EvPhase; pos: Vec; dmg: number; hpAfter: number }
  | { t: 'unseal'; phase: EvPhase; pos: Vec }
  | { t: 'descend'; phase: EvPhase; depth: number }
  | { t: 'offer'; phase: EvPhase; ids: string[] }
  | { t: 'trait'; phase: EvPhase; id: string }
  | {
      t: 'death';
      phase: EvPhase;
      depth: number;
      /**
       * What ended it. `fade` means your own ink ran out; `drown` means the
       * page's did not — it filled with no room left and came through you.
       * Neither is a blow, and neither is credited to an enemy.
       */
      cause: 'blow' | 'fade' | 'drown';
    };

export interface StepResult {
  state: GameState;
  events: Ev[];
  /** False when the input was rejected (a wall) — no turn passed, so no enemy phase. */
  spent: boolean;
}
