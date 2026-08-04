/**
 * Eras — the medium changes, the rules do not.
 *
 * STET is a proofreader's mark, so the descent is the history of how writing
 * gets corrected: a hand-scribed manuscript, then a typewriter, then a word
 * processor. Handmade warmth to mechanical precision to cold light, and each era
 * strips something away — era I has variable pressure, era II has none but keeps
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

import { TYPEWRITER, WORD_PROCESSOR, type EraPalette, type Mark } from '../render/theme';
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
   * What the page draws when it fills, and what a summoning boss pulls out.
   *
   * The spill used to spawn a RAT whatever era you were in, which put the
   * manuscript's vermin on a typed page — the one seam left open when era II
   * shipped. Chaff is per-era for the same reason the hand is: it is the thing
   * that appears MOST often, so it is the thing that most decides whether a
   * crowded floor still reads as somewhere.
   */
  chaff: EnemyKind;
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
    chaff: 'rat',
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
   * The RAT is gone, and its place is taken by THE SEMICOLON — because in a
   * typewriter's world the vermin are the punctuation. It is also what the page
   * draws when it fills here (`chaff`), which was the last thing in era II still
   * speaking era I.
   */
  {
    id: 'typewriter',
    name: 'The Typewriter',
    roster: ['semicolon', 'stalker', 'charger', 'warden', 'typebar', 'carriage'],
    boss: 'carriageReturn',
    chaff: 'semicolon',
    hand: 'type',
    palette: TYPEWRITER,
  },
  /*
   * III · THE WORD PROCESSOR, depths 9–12.
   *
   * Rendered rather than struck, on white bond, in the colours a screen has —
   * see `WORD_PROCESSOR` in render/theme.ts for the page and `rasterStroke` for
   * the mark. The ladder strips something at every step: era I has variable
   * pressure, era II has none but keeps physical misregistration, era III has
   * neither. A glyph here lands exactly where it is put, every time, and the
   * only irregularity left is the pixel grid it is quantised to.
   *
   * ## What it threatens
   *
   * Tiles, then lines, then AREAS. THE SELECTION marks the tile you stand on and
   * deletes the block around the mark a turn later, which is the first threat in
   * the game that one step cannot answer — from the middle of a three-by-three,
   * one step is still inside it. So the question stops being "which tile is
   * safe" or "which line am I on" and becomes "was I already leaving".
   *
   * THE AUTOCOMPLETE is its opposite half: it strikes the two tiles ahead of
   * your last step, so it punishes exactly the straight line that leaving
   * something fastest requires. Between them the era asks you to move and to
   * keep changing your mind.
   *
   * The chaff is THE CURSOR, and it inserts — its blow pushes you one tile
   * further along. It cannot kill you on its own; it can put you inside a
   * selection, which is the whole reason era III's vermin are worth their own
   * kind.
   */
  {
    id: 'wordprocessor',
    name: 'The Word Processor',
    roster: ['cursor', 'stalker', 'charger', 'warden', 'selection', 'autocomplete'],
    boss: 'selectAll',
    chaff: 'cursor',
    hand: 'raster',
    palette: WORD_PROCESSOR,
  },
];

export function eraAt(depth: number): Era {
  const i = Math.floor((Math.max(1, depth) - 1) / ERA_FLOORS);
  return ERAS[Math.min(i, ERAS.length - 1)];
}

/** The last floor of an era. One boss, an empty board, and no spill. */
export function isBossFloor(depth: number): boolean {
  return depth > 0 && depth % ERA_FLOORS === 0;
}

/** The first floor of an era — the one worth naming as you arrive on it. */
export function isEraOpening(depth: number): boolean {
  return depth > 1 && (depth - 1) % ERA_FLOORS === 0;
}

/** How an era numbers itself in the margin. */
export function eraNumeral(depth: number): string {
  const i = Math.floor((Math.max(1, depth) - 1) / ERA_FLOORS);
  return ['I', 'II', 'III', 'IV', 'V'][Math.min(i, 4)] ?? String(i + 1);
}

/** True on the floor you arrive at straight after beating a boss. */
export function isAfterBoss(depth: number): boolean {
  return depth > 1 && isBossFloor(depth - 1);
}
