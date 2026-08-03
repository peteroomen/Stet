import { ENEMY_STATS, makeEnemy } from './enemies';
import { eraAt, isBossFloor } from './eras';
import { MAX_ENEMIES, ORTHO, SIZE, add, allTiles, chebyshev, eq, inBounds, key, manhattan } from './grid';
import type { Rng } from './rng';
import { SHIPPED, type Rules } from './rules';
import type { Enemy, EnemyKind, GameState, Item, Vec } from './types';

/**
 * Is every non-blot tile reachable from `start` by orthogonal steps?
 *
 * This is not cosmetic. Two blots in an L can seal a corner; an enemy spawned
 * inside it can never be reached, the floor can never be cleared, the stairs
 * never unseal, and the run is soft-locked with no way to tell from looking at
 * the board. Blots are only kept if the board stays fully connected.
 */
export function fullyConnected(blots: Vec[], start: Vec): boolean {
  const blocked = new Set(blots.map(key));
  if (blocked.has(key(start))) return false;

  const seen = new Set<number>([key(start)]);
  const queue: Vec[] = [start];
  while (queue.length > 0) {
    const cur = queue.pop()!;
    for (const d of ORTHO) {
      const n = add(cur, d);
      if (!inBounds(n)) continue;
      const k = key(n);
      if (blocked.has(k) || seen.has(k)) continue;
      seen.add(k);
      queue.push(n);
    }
  }
  return seen.size === SIZE * SIZE - blocked.size;
}

// Re-exported from grid, where the board's own limits live.
export { MAX_ENEMIES } from './grid';
export const MAX_NIBS = 3;

export interface Floor {
  playerStart: Vec;
  enemies: Enemy[];
  items: Item[];
  blots: Vec[];
  stairs: Vec;
}

/**
 * Threat budget per depth. Enemies are bought from it by cost, so depth ramps in
 * quality (a WARDEN instead of five RATs) rather than only in quantity — a 5x5
 * board runs out of room long before it runs out of difficulty.
 */
export function threatBudget(depth: number, rules: Rules = SHIPPED): number {
  return Math.min(rules.threatBase + Math.round(depth * rules.threatSlope), 20);
}

export function blotCount(depth: number, rng: Rng): number {
  if (depth < 3) return 0;
  if (depth < 6) return rng.range(1, 2);
  return rng.range(1, 3);
}

/**
 * What this depth can roll.
 *
 * The era owns the roster now, filtered by the old `from` gate so an era's
 * heaviest kinds still arrive late within it rather than on its first floor.
 * Bosses are never in the pool — they are placed, not bought.
 */
function unlocked(depth: number): EnemyKind[] {
  const era = eraAt(depth);
  const pool = era.roster.filter((k) => depth >= ENEMY_STATS[k].from);
  return pool.length > 0 ? pool : ['rat'];
}

/** Buy a roster from the depth's budget, biased toward the heaviest thing affordable. */
export function rollRoster(depth: number, rng: Rng, rules: Rules = SHIPPED): EnemyKind[] {
  if (depth === 1) return ['rat', 'rat', 'rat']; // clean tutorial floor

  let budget = threatBudget(depth, rules);
  const pool = unlocked(depth);
  const out: EnemyKind[] = [];

  while (out.length < MAX_ENEMIES) {
    const affordable = pool.filter((k) => ENEMY_STATS[k].cost <= budget);
    if (affordable.length === 0) break;
    const sorted = [...affordable].sort((a, b) => ENEMY_STATS[b].cost - ENEMY_STATS[a].cost);
    // Mostly spend big; sometimes sprinkle chaff so floors don't all read the same.
    const pick = rng.chance(0.55) ? sorted[0] : rng.pick(affordable);
    out.push(pick);
    budget -= ENEMY_STATS[pick].cost;
  }

  while (out.length < 2) out.push('rat');
  return out;
}

export function generateFloor(depth: number, rng: Rng, s: GameState): Floor {
  const free = new Set(allTiles().map(key));
  const take = (v: Vec) => free.delete(key(v));
  const tiles = () => allTiles().filter((t) => free.has(key(t)));

  // Player starts somewhere off-centre so floors don't all open identically.
  const playerStart = rng.pick(
    allTiles().filter((t) => t.x === 0 || t.y === 0 || t.x === SIZE - 1 || t.y === SIZE - 1),
  );
  take(playerStart);

  // Stairs as far from the entry as the board allows — you always cross the floor.
  const byDistance = tiles().sort(
    (a, b) => manhattan(b, playerStart) - manhattan(a, playerStart),
  );
  const farthest = manhattan(byDistance[0], playerStart);
  const stairs = rng.pick(byDistance.filter((t) => manhattan(t, playerStart) >= farthest - 1));
  take(stairs);

  // Blots: impassable ink. Cover, chokepoints, and something for a charger to
  // crash into. Never adjacent to the entry, so you never open boxed in.
  const blots: Vec[] = [];
  // No cover on a boss floor. The fight is about reading one thing precisely,
  // and a blot the boss can hide a spawn behind is noise in that reading.
  const wanted = isBossFloor(depth) ? 0 : blotCount(depth, rng);
  const blotCands = rng.shuffle(tiles().filter((t) => manhattan(t, playerStart) > 1));
  for (const t of blotCands) {
    if (blots.length >= wanted) break;
    // Keep it only if the board stays walkable end to end — a sealed pocket with
    // an enemy in it is an unclearable floor.
    if (!fullyConnected([...blots, t], playerStart)) continue;
    blots.push(t);
    take(t);
  }

  // Enemies never spawn on top of you or in your face — minimum two tiles of air.
  const enemies: Enemy[] = [];
  // A boss floor is a duel: one thing, as far from you as the board allows, and
  // nothing else to read. See eras.ts.
  const roster = isBossFloor(depth) ? [eraAt(depth).boss] : rollRoster(depth, rng, s.rules);
  const spawnCands = rng.shuffle(tiles().filter((t) => chebyshev(t, playerStart) >= 2));
  let id = s.nextId;
  for (const kind of roster) {
    const spot = spawnCands.pop();
    if (!spot) break;
    enemies.push(makeEnemy(id++, kind, spot, rng.int(1 << 20)));
    take(spot);
  }

  /*
   * Items.
   *
   * The vial is gone from the board when the marginalia are on, because healing
   * moved into the card hand — and that is a better place for it. On the board a
   * heal was free if you could route to it; as a card it costs you the permanent
   * upgrade you would otherwise have taken, which makes every heal a decision and
   * turns the choice into the run's own difficulty regulator.
   *
   * Under a variant with no marginalia the vial stays, so the baseline the
   * harness measures against is still the game as it was.
   */
  const items: Item[] = [];
  const itemCands = rng.shuffle(tiles().filter((t) => !eq(t, stairs)));
  const hurt = s.player.hp <= s.player.maxHp - 2;
  const wantVial =
    !isBossFloor(depth) &&
    s.rules.traitsPerDescent === 0 &&
    depth >= 2 &&
    rng.chance(hurt ? 0.6 : 0.16);
  if (wantVial) {
    const spot = itemCands.pop();
    if (spot) {
      items.push({ id: id++, kind: 'vial', pos: spot, seed: rng.int(1 << 20) });
      take(spot);
    }
  }
  const wantNib =
    !isBossFloor(depth) && depth >= 3 && s.stats.nibs < MAX_NIBS && rng.chance(0.26);
  if (wantNib) {
    const spot = itemCands.pop();
    if (spot) {
      items.push({ id: id++, kind: 'nib', pos: spot, seed: rng.int(1 << 20) });
      take(spot);
    }
  }

  s.nextId = id;
  return { playerStart, enemies, items, blots, stairs };
}
