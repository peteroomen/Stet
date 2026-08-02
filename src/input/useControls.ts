import { useEffect } from 'react';
import type { Action, Dir } from '../game/types';

/** Pixels of travel before a drag counts as a swipe. */
const THRESHOLD = 22;

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
 * Time is the only signal that separates them. Distance cannot: a flick and the
 * first half of a deliberate drag cover exactly the same pixels, and at a 22 px
 * threshold — a quarter of a tile on a 390 px phone — every ordinary swipe
 * crossed it two or three times.
 */
const HOLD_MS = 260;

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
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;

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
