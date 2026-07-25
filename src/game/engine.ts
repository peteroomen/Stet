import { ENEMY_STATS, makeEnemy, planIntent } from './enemies';
import { generateFloor } from './floors';
import { DIR_VEC, add, allTiles, chebyshev, eq, inBounds } from './grid';
import { Rng, randomSeed } from './rng';
import type { Dir, Enemy, Ev, GameState, StepResult, Vec } from './types';

/**
 * Measured, not guessed. Simulated runs at 6 / 7 / 8 HP, played by a bot with
 * three plies of lookahead (exact, because enemies commit to their telegraphs):
 *
 *   HP 6 → median depth  9   HP 7 → median depth 10   HP 8 → median depth 17
 *
 * 8 turns the run into a long session; 6 is tight enough that a mistake on floor
 * three ends it. 7 keeps a mindless bumper pinned at depth 2 while a player who
 * reads the board reaches 10 — see balance.test.ts.
 */
export const START_HP = 7;
export const START_DMG = 1;
/** Combo bonus ceiling. Four swings in and you're at +3; the risk stops scaling too. */
export const MAX_COMBO = 3;
export const VIAL_HEAL = 3;

/* ---------------------------------------------------------------------------
 * The spill.
 *
 * Without it the game has no answer to a patient player: a simulated bot that
 * read telegraphs and simply refused to engage kited three rats for 4000 turns
 * on floor one and never died. Every enemy moves at exactly your speed, so on an
 * open board you can weave indefinitely — which makes commitment optional, and
 * commitment is the entire game.
 *
 * So the page fills. After a floor's grace runs out, ink wells up and something
 * climbs out of it on a fixed cadence. Killing outpaces spilling comfortably, so
 * aggression clears a floor and timidity drowns in it — which is the lesson the
 * design wanted to teach in the first place.
 * ------------------------------------------------------------------------ */
export const SPILL_EVERY = 5;

/**
 * Bigger floors get more quiet; deeper ones get less. The depth term is the only
 * difficulty knob that keeps scaling forever — the threat budget and the enemy
 * cap both plateau, so without it a strong player faces the same four WARDENs
 * from depth 20 down.
 */
const spillGrace = (enemies: number, depth: number): number =>
  Math.max(6, 8 + enemies * 2 - Math.floor(depth / 4));

export function newGame(seed: number = randomSeed()): GameState {
  const s: GameState = {
    screen: 'playing',
    depth: 0,
    turn: 0,
    floorTurns: 0,
    grace: 0,
    player: {
      pos: { x: 2, y: 2 },
      hp: START_HP,
      maxHp: START_HP,
      dmg: START_DMG,
      exposed: false,
      combo: 0,
      facing: 'up',
    },
    enemies: [],
    items: [],
    blots: [],
    stairs: { x: 4, y: 4 },
    stairsOpen: false,
    rng: seed >>> 0,
    nextId: 1,
    stats: { kills: 0, turns: 0, damageTaken: 0, nibs: 0, vials: 0, deepest: 0 },
  };
  enterFloor(s, []);
  return s;
}

/** Recompute every enemy's telegraph against the board as it now stands. */
function replan(d: GameState): void {
  const rng = new Rng(d.rng);
  for (const e of d.enemies) e.intent = planIntent(e, d, rng);
  d.rng = rng.s;
}

function enterFloor(d: GameState, ev: Ev[]): void {
  d.depth += 1;
  const rng = new Rng(d.rng);
  const f = generateFloor(d.depth, rng, d);
  d.rng = rng.s;

  d.enemies = f.enemies;
  d.items = f.items;
  d.blots = f.blots;
  d.stairs = f.stairs;
  d.stairsOpen = f.enemies.length === 0;
  d.player.pos = f.playerStart;
  d.player.exposed = false;
  d.player.combo = 0;
  d.floorTurns = 0;
  d.grace = spillGrace(f.enemies.length, d.depth);
  d.stats.deepest = Math.max(d.stats.deepest, d.depth);

  replan(d);
  ev.push({ t: 'descend', phase: 'p', depth: d.depth });
}

const isBlot = (d: GameState, v: Vec) => d.blots.some((b) => eq(b, v));

/** Somewhere clear, and never right on top of you. */
function spillSite(d: GameState, rng: Rng): Vec | null {
  const free = allTiles().filter(
    (t) =>
      chebyshev(t, d.player.pos) >= 2 &&
      !isBlot(d, t) &&
      !eq(t, d.stairs) &&
      !d.enemies.some((e) => eq(e.pos, t)) &&
      !d.items.some((i) => eq(i.pos, t)),
  );
  return free.length ? rng.pick(rng.shuffle(free)) : null;
}

/** Does the page fill on this turn? */
function shouldSpill(d: GameState): boolean {
  const over = d.floorTurns - d.grace;
  return over > 0 && over % SPILL_EVERY === 0;
}

/**
 * Execute one enemy's committed intent.
 *
 * The intent was planned last turn against where you stood then, and it is NOT
 * re-aimed. An enemy walks its path until something stops it: the board edge, a
 * blot, another enemy, or you — and walking into you is the strike.
 */
function execIntent(e: Enemy, d: GameState, ev: Ev[]): void {
  const st = ENEMY_STATS[e.kind];
  const intent = e.intent;

  if (intent.kind === 'wind') {
    e.ready = true;
    ev.push({ t: 'wind', phase: 'e', id: e.id, kind: e.kind, pos: { ...e.pos } });
    return;
  }
  if (intent.kind === 'hold' || intent.path.length === 0) return;

  const from: Vec = { ...e.pos };
  let cur: Vec = { ...e.pos };

  for (const next of intent.path) {
    if (!inBounds(next)) break;
    if (isBlot(d, next)) break;

    if (eq(next, d.player.pos)) {
      // Doubled while you are mid-swing. This is the whole cost of committing.
      const dmg = st.dmg * (d.player.exposed ? 2 : 1);
      d.player.hp -= dmg;
      d.stats.damageTaken += dmg;
      ev.push({
        t: 'eattack',
        phase: 'e',
        id: e.id,
        kind: e.kind,
        from: { ...cur },
        at: { ...next },
        dmg,
        exposed: d.player.exposed,
        hpAfter: Math.max(0, d.player.hp),
      });
      break; // strikes from where it stands; never enters your tile
    }

    if (d.enemies.some((o) => o.id !== e.id && eq(o.pos, next))) break;
    cur = { ...next };
  }

  if (!eq(cur, from)) {
    e.pos = cur;
    ev.push({ t: 'emove', phase: 'e', id: e.id, kind: e.kind, from, to: { ...cur } });
  }
  if (st.slow) e.ready = false;
}

/**
 * Advance the game by one player input.
 *
 * Pure: `state` is never mutated. Returns the next state plus an ordered event
 * list that the renderer and the audio layer schedule against.
 *
 * Turn order — player acts, then every enemy executes the intent it committed to
 * last turn, then intents are recomputed for the next turn.
 */
export function step(state: GameState, dir: Dir): StepResult {
  if (state.screen !== 'playing') return { state, events: [], spent: false };

  const d: GameState = structuredClone(state);
  const ev: Ev[] = [];
  const p = d.player;
  p.facing = dir;

  const to = add(p.pos, DIR_VEC[dir]);

  // --- Player phase -------------------------------------------------------
  if (!inBounds(to) || isBlot(d, to)) {
    // A wall costs you nothing. Being killed by a mis-swipe into stone is not
    // the kind of commitment this game is about.
    ev.push({ t: 'blocked', phase: 'p', pos: { ...p.pos }, dir });
    return { state: d, events: ev, spent: false };
  }

  const target = d.enemies.find((e) => eq(e.pos, to));

  if (target) {
    const bonus = Math.min(p.combo, MAX_COMBO);
    const dmg = p.dmg + bonus;
    target.hp -= dmg;
    p.combo = Math.min(p.combo + 1, MAX_COMBO);
    p.exposed = true; // you are mid-swing until you do something else

    const killed = target.hp <= 0;
    ev.push({
      t: 'bump',
      phase: 'p',
      from: { ...p.pos },
      to: { ...to },
      dir,
      dmg,
      combo: bonus,
      killed,
      kind: target.kind,
      id: target.id,
    });

    if (killed) {
      d.enemies = d.enemies.filter((e) => e.id !== target.id);
      d.stats.kills += 1;
      ev.push({ t: 'kill', phase: 'p', pos: { ...to }, kind: target.kind });
    }
    // You do NOT advance into the tile. A bump attack is a swing, not a step.
  } else {
    p.exposed = false;
    p.combo = 0;
    p.pos = { ...to };
    ev.push({ t: 'move', phase: 'p', from: { ...state.player.pos }, to: { ...to }, dir });

    const item = d.items.find((i) => eq(i.pos, to));
    if (item) {
      d.items = d.items.filter((i) => i.id !== item.id);
      let amount = 0;
      if (item.kind === 'vial') {
        amount = Math.min(VIAL_HEAL, p.maxHp - p.hp);
        p.hp += amount;
        d.stats.vials += 1;
      } else {
        amount = 1;
        p.dmg += 1;
        d.stats.nibs += 1;
      }
      ev.push({ t: 'pickup', phase: 'p', pos: { ...to }, kind: item.kind, amount });
    }

    if (d.stairsOpen && eq(to, d.stairs)) {
      d.turn += 1;
      d.stats.turns += 1;
      enterFloor(d, ev);
      return { state: d, events: ev, spent: true };
    }
  }

  // --- Enemy phase --------------------------------------------------------
  for (const e of d.enemies) execIntent(e, d, ev);

  if (p.hp <= 0) {
    p.hp = 0;
    d.screen = 'dead';
    ev.push({ t: 'death', phase: 'e', depth: d.depth });
    d.turn += 1;
    d.stats.turns += 1;
    return { state: d, events: ev, spent: true };
  }

  d.floorTurns += 1;

  // The page fills. Checked before the clear-check so a spill on the very turn
  // you kill the last enemy keeps the floor honestly uncleared.
  if (shouldSpill(d)) {
    const rng = new Rng(d.rng);
    const site = spillSite(d, rng);
    d.rng = rng.s;
    if (site) {
      const e = makeEnemy(d.nextId++, 'rat', site, rng.int(1 << 20));
      d.enemies.push(e);
      ev.push({ t: 'spill', phase: 'e', pos: { ...site }, kind: 'rat' });
    }
  }

  if (d.enemies.length === 0 && !d.stairsOpen) {
    d.stairsOpen = true;
    ev.push({ t: 'unseal', phase: 'e', pos: { ...d.stairs } });
  }

  replan(d);
  d.turn += 1;
  d.stats.turns += 1;
  return { state: d, events: ev, spent: true };
}

/** Preview a floor without playing it — used by the title screen's idle board. */
export function demoState(seed: number = randomSeed()): GameState {
  const s = newGame(seed);
  s.screen = 'title';
  return s;
}
