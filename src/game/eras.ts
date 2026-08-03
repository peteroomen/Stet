/**
 * Eras — the medium changes, the rules do not.
 *
 * STET is a proofreader's mark, so the descent is the history of how writing
 * gets corrected: a hand-scribed manuscript, then a typewriter, then a terminal.
 * Handmade warmth to mechanical precision to cold light, and each era strips
 * something away — era I has variable pressure, era II has none but keeps
 * physical misregistration, era III has neither.
 *
 * ## Why this is structure and not decoration
 *
 * Every enemy kind used to be unlocked by depth 7, which meant depths 8 and
 * beyond were the same game forever. That is exactly why `threatBudget`
 * saturating hurt so much when the marginalia were added: quantity was the only
 * escalation left, and a 5x5 board holds seven bodies. Eras escalate by QUALITY
 * — new kinds, new verbs — which is the axis this board has room for.
 *
 * The four archetypes persist across every era, redrawn in that era's hand. A
 * RAT is a RAT whether brushed, struck or rendered, so what a player learned in
 * the first four floors keeps paying. Each era then adds kinds native to its own
 * machine.
 */

import type { EnemyKind } from './types';

/** Floors per era. The last of them is the boss. */
export const ERA_FLOORS = 4;

export interface Era {
  id: string;
  /** Shown on the descent card and in the margin. */
  name: string;
  /** Kinds this era can roll, in addition to nothing else — this list is total. */
  roster: EnemyKind[];
  /** What waits on the era's last floor. */
  boss: EnemyKind;
}

export const ERAS: Era[] = [
  {
    id: 'manuscript',
    name: 'The Manuscript',
    roster: ['rat', 'stalker', 'charger', 'warden'],
    boss: 'drollery',
  },
  /*
   * II · The Typewriter and III · The Terminal are designed but unbuilt: each
   * needs a mark-making system of its own, which is the bulk of that work and
   * wants a render grid rather than a live board (see scripts/brush-shots.mjs).
   *
   * Until they exist the descent repeats the manuscript, which is honest — the
   * threat budget and the marginalia still escalate, so a deep run is harder
   * without pretending to be somewhere new.
   */
];

export function eraAt(depth: number): Era {
  const i = Math.floor((Math.max(1, depth) - 1) / ERA_FLOORS);
  return ERAS[Math.min(i, ERAS.length - 1)];
}

/** The last floor of an era. One boss, an empty board, and no spill. */
export function isBossFloor(depth: number): boolean {
  return depth > 0 && depth % ERA_FLOORS === 0;
}

/** True on the floor you arrive at straight after beating a boss. */
export function isAfterBoss(depth: number): boolean {
  return depth > 1 && isBossFloor(depth - 1);
}
