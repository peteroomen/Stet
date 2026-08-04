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

import { TYPEWRITER, type EraPalette, type Mark } from '../render/theme';
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
  /**
   * The instrument every mark on the page is made with.
   *
   * A rendering concern living on a rules object on purpose: the era is the one
   * thing that knows a floor is somewhere else, and having the hand here means
   * the board, the page and the chrome all change together off a single source
   * rather than three of them agreeing by hand.
   */
  hand: Mark;
  /**
   * How the page itself reads. Layered over whichever of day/night is active, so
   * an era states only what it changes and both lightings keep working.
   */
  palette: EraPalette;
}

export const ERAS: Era[] = [
  {
    id: 'manuscript',
    name: 'The Manuscript',
    roster: ['rat', 'stalker', 'charger', 'warden'],
    boss: 'drollery',
    hand: 'brush',
    // The manuscript IS the base palette, so it changes nothing.
    palette: {},
  },
  /*
   * II · THE TYPEWRITER, depths 5–8.
   *
   * Struck rather than drawn, on ruled foolscap, in a bichrome ribbon — see
   * `TYPEWRITER` in render/theme.ts for the page and `strikeStroke` for the mark.
   * The four archetypes carry over redrawn in that hand; the era's own two are
   * native to the machine and threaten the two things a machine threatens.
   *
   * THE TYPEBAR reaches without moving and strikes your COLUMN. THE CARRIAGE
   * walks and strikes its own ROW. Between them era II asks a question era I
   * never does — not "which tile is safe" but "which LINE am I on" — and they
   * are answered by opposite steps, so learning one does not give you the other.
   *
   * The RAT is gone. Chaff belongs to the manuscript, and each era is supposed
   * to strip something away — though the spill still draws rats, which is the
   * one seam left to close (`Era.chaff`).
   */
  {
    id: 'typewriter',
    name: 'The Typewriter',
    roster: ['stalker', 'charger', 'warden', 'typebar', 'carriage'],
    boss: 'drollery',
    hand: 'type',
    palette: TYPEWRITER,
  },
  /*
   * III · The Terminal is designed and unbuilt.
   *
   * Past era II the descent repeats the typewriter, which is honest — the threat
   * budget and the marginalia still escalate, so a deep run is harder without
   * pretending to be somewhere new.
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
