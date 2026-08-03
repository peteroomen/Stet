import { useEffect } from 'react';
import type { Action, Dir } from '../game/types';

/** Pixels of travel before a drag counts as a swipe. */
const THRESHOLD = 22;

/**
 * How far a HELD drag must travel to earn each step after the first, as a
 * fraction of a tile.
 *
 * This was the whole bug behind "one right swipe landed me five tiles away".
 * Chained steps used the same 22 px threshold as the first one — and 22 px is
 * about a third of a tile on a phone — so a drag walked roughly three tiles for
 * every tile of travel. A 200 px swipe, which is an ordinary thumb movement,
 * could spend five turns.
 *
 * "A held drag traces a path" has to mean the path your thumb actually drew. One
 * tile of travel, one tile of movement. The first step keeps the small threshold
 * because a flick has to stay responsive; nothing after it does.
 */
const CHAIN_TILES = 0.9;

/**
 * Minimum time between two steps fired by ONE continuous drag.
 *
 * Distance alone cannot tell a flick from a held drag: they cover the same
 * ground and differ only in how fast. Without a time gate, a 120 ms thumb flick
 * meant as a single step crossed the 22 px threshold three or four times and
 * asked the runtime for three or four turns.
 *
 * Measured with `scripts/swipe-check.mjs`, before: a fast flick fired 4
 * directions and spent 2 turns; a normal swipe fired 5 and spent 2; a
 * deliberate 900 ms drag fired 10 and also spent 2. The runtime buffers exactly
 * one direction, so the surplus was silently dropped — which is why the game
 * both over-fired on a flick AND under-chained on a drag, and why every gesture
 * landed on the same number.
 *
 * Two turns per swipe is not a small feel problem on this board: the enemy phase
 * runs twice against a board you read once, and if the first step was a strike,
 * the second resolves while you are EXPOSED and everything hits at double.
 *
 * Set just above the renderer's MOVE_MS (105 ms) so a chained drag steps at the
 * speed the animation can actually show.
 */
const STEP_MS = 130;

/**
 * How long the pointer must have been down before a drag is allowed to CHAIN a
 * second step.
 *
 * Below this, one gesture is one step, full stop — which is what a flick means
 * and what every grid-swipe game does. Above it, the drag is being held and
 * traced, so it walks tile by tile, which is the thing that makes this good in a
 * thumb and is worth keeping.
 *
 * Time is the first signal that separates them, and distance is the second: a
 * flick and the first half of a deliberate drag cover the same pixels, but a
 * drag that means to trace a path keeps going for a tile at a time. Raised from
 * 260 ms because 260 ms is an ordinary swipe, not a deliberate trace — together
 * with CHAIN_TILES this is what stops a normal thumb movement spending five
 * turns.
 */
const HOLD_MS = 420;

const KEY_MAP: Record<string, Dir> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  w: 'up',
  a: 'left',
  s: 'down',
  d: 'right',
  W: 'up',
  A: 'left',
  S: 'down',
  D: 'right',
  // vi keys, because this is a roguelike
  k: 'up',
  h: 'left',
  j: 'down',
  l: 'right',
};

export interface ControlHandlers {
  onDir: (act: Action) => void;
  onConfirm: () => void;
  onGesture?: () => void;
  enabled?: boolean;
}

/**
 * Swipe + keyboard.
 *
 * The swipe origin RESETS every time a direction fires, so holding a drag and
 * tracing a path walks the hero tile by tile instead of firing once. That single
 * detail is most of what makes the game feel good in a thumb.
 */
export function useControls(
  target: React.RefObject<HTMLElement>,
  { onDir, onConfirm, onGesture, enabled = true }: ControlHandlers,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const dir = KEY_MAP[e.key];
      if (dir) {
        e.preventDefault();
        onGesture?.();
        if (enabled) onDir(dir);
        return;
      }
      // Hold your ground. '.' is the roguelike convention; space is the one
      // people try first. Enter still confirms, so the title and death screens
      // are unaffected.
      if (enabled && (e.key === '.' || e.key === ' ')) {
        e.preventDefault();
        onGesture?.();
        onDir('wait');
        return;
      }
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        onGesture?.();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey, { passive: false });
    return () => window.removeEventListener('keydown', onKey);
  }, [onDir, onConfirm, onGesture, enabled]);

  useEffect(() => {
    const el = target.current;
    if (!el) return;

    let active = false;
    let ox = 0;
    let oy = 0;
    let moved = false;
    let pointerId = -1;
    let downAt = 0;
    let lastFire = 0;

    /**
     * One tile, in CSS pixels, mirroring `geometry()` in the renderer: the board
     * is the smaller of the stage's two dimensions, padded 7.8% a side for the
     * illuminated margin, divided into five.
     */
    const tilePx = () => {
      const size = Math.min(el.clientWidth, el.clientHeight);
      return (size - size * 0.156) / 5;
    };

    const down = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      active = true;
      moved = false;
      ox = e.clientX;
      oy = e.clientY;
      pointerId = e.pointerId;
      // A new gesture may fire immediately; only steps CHAINED off the same drag
      // are gated. Otherwise deliberate quick taps would feel sticky.
      downAt = e.timeStamp;
      lastFire = 0;
      el.setPointerCapture?.(e.pointerId);
      onGesture?.();
    };

    const move = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return;
      const dx = e.clientX - ox;
      const dy = e.clientY - oy;
      // The first step of a gesture is a flick and stays cheap. Every step after
      // it has to be dragged for, a tile at a time.
      const need = lastFire === 0 ? THRESHOLD : Math.max(THRESHOLD, tilePx() * CHAIN_TILES);
      if (Math.abs(dx) < need && Math.abs(dy) < need) return;

      // Already stepped on this drag. A second step has to be asked for: the
      // pointer must have been held past HOLD_MS, and STEP_MS must have passed
      // since the last one. Deliberately does NOT re-anchor when refused — the
      // drag has to keep travelling to earn the next step, so a flick that
      // overshoots cannot bank a second one by standing still.
      const now = e.timeStamp;
      if (lastFire !== 0 && (now - downAt < HOLD_MS || now - lastFire < STEP_MS)) return;

      const dir: Dir =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';

      moved = true;
      lastFire = now;
      // Re-anchor so a continued drag keeps stepping.
      ox = e.clientX;
      oy = e.clientY;
      if (enabled) onDir(dir);
    };

    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      active = false;
      pointerId = -1;
      el.releasePointerCapture?.(e.pointerId);
      // A clean tap (no drag) confirms — used by the title and death screens.
      if (!moved) onConfirm();
    };

    const cancel = () => {
      active = false;
      pointerId = -1;
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', cancel);
    };
  }, [target, onDir, onConfirm, onGesture, enabled]);
}
