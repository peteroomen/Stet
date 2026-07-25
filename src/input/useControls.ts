import { useEffect } from 'react';
import type { Dir } from '../game/types';

/** Pixels of travel before a drag counts as a swipe. */
const THRESHOLD = 22;

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
  onDir: (dir: Dir) => void;
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

    const down = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      active = true;
      moved = false;
      ox = e.clientX;
      oy = e.clientY;
      pointerId = e.pointerId;
      el.setPointerCapture?.(e.pointerId);
      onGesture?.();
    };

    const move = (e: PointerEvent) => {
      if (!active || e.pointerId !== pointerId) return;
      const dx = e.clientX - ox;
      const dy = e.clientY - oy;
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;

      const dir: Dir =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';

      moved = true;
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
