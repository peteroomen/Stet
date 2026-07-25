import type { Dir, Vec } from './types';

/** The board is 5x5. Everything else in the game is tuned against that. */
export const SIZE = 5;

export const DIR_VEC: Record<Dir, Vec> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const DIRS: Dir[] = ['up', 'right', 'down', 'left'];

export const ORTHO: Vec[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

export const DIAG: Vec[] = [
  { x: 1, y: -1 },
  { x: 1, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: -1 },
];

export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const eq = (a: Vec, b: Vec): boolean => a.x === b.x && a.y === b.y;
export const key = (v: Vec): number => v.y * SIZE + v.x;
export const inBounds = (v: Vec): boolean => v.x >= 0 && v.y >= 0 && v.x < SIZE && v.y < SIZE;

/** Step distance for orthogonal movers. */
export const manhattan = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
/** Step distance for anything that can move diagonally. */
export const chebyshev = (a: Vec, b: Vec): number =>
  Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

export function allTiles(): Vec[] {
  const out: Vec[] = [];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) out.push({ x, y });
  return out;
}

/** The direction you'd have to swipe to get from `a` to the adjacent tile `b`. */
export function dirBetween(a: Vec, b: Vec): Dir {
  if (b.y < a.y) return 'up';
  if (b.y > a.y) return 'down';
  if (b.x < a.x) return 'left';
  return 'right';
}
