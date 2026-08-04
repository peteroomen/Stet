import { useEffect, useRef } from 'react';
import { sfx } from '../audio/sfx';
import { eraAt, eraNumeral } from '../game/eras';
import { hash3 } from '../render/ink';
import type { Mark } from '../render/theme';

/**
 * The era, named on its own page, written in its own hand.
 *
 * It used to be one line on the card hand, and that was the second place it had
 * been put: drawn on the BOARD it was never once visible, because the first
 * floor of an era is by definition the floor after a boss and the card hand is
 * always over it. On the hand it was visible and it was furniture — a subtitle
 * over three buttons.
 *
 * An era is the only thing in the game that changes what the game IS, so it is
 * the one moment that has earned a page to itself. And a page to itself makes
 * the obvious thing possible: the name is not set in a typeface, it is WRITTEN,
 * one letter at a time, by whatever is writing that era.
 *
 * ## Three hands, three ways of arriving on the page
 *
 * The letters are the same letters. What differs is what a letter DOES as it
 * lands, which is the same claim the board makes about its silhouettes:
 *
 *   - **brush** — each letter is laid down left to right under a wipe, so you
 *     watch the stroke travel. Slowest of the three, and it overlaps: a hand is
 *     already starting the next letter as it finishes this one.
 *   - **type** — no travel at all. A letter is not drawn, it is STRUCK: it
 *     arrives whole, a hair off its place and off square, at whatever weight the
 *     ribbon had left. Evenly spaced, because a machine has one speed.
 *   - **raster** — instant and exact, several letters a frame, with a block
 *     caret waiting at the end. Nothing lands off its place; there is nothing to
 *     land.
 *
 * Each letter also fires `sfx.step()`, which is already branched per era — a nib
 * scratch, a key, a membrane click. The writing sounds like the writing.
 */

/** How long one letter takes to arrive, per hand. */
const PACE: Record<Mark, number> = { brush: 105, nib: 95, type: 78, raster: 26 };
/** How long a letter spends being drawn, per hand. Zero means it simply appears. */
const DRAW: Record<Mark, number> = { brush: 150, nib: 120, type: 0, raster: 0 };
/** Held after the last letter before the page moves on. */
const HOLD_MS = 900;

const FACE: Record<Mark, string> = {
  brush: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  nib: '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif',
  type: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace',
  raster: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
};

export function EraCard({ depth, onDone }: { depth: number; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const era = eraAt(depth);
    const title = era.name.toUpperCase();
    const numeral = eraNumeral(depth);
    const pace = PACE[era.hand];
    const draw = DRAW[era.hand];
    const total = title.length * pace + draw + HOLD_MS;

    let raf = 0;
    const t0 = performance.now();
    let spoken = 0;

    const frame = (now: number) => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const t = now - t0;
      // One `step` per letter as it lands, which is the era's own instrument —
      // the writing sounds like the writing.
      const landed = Math.min(title.length, Math.floor(t / pace) + 1);
      while (spoken < landed) {
        spoken++;
        sfx.step();
      }

      const styles = getComputedStyle(document.documentElement);
      const ink = styles.getPropertyValue('--ink').trim() || '#1a1714';
      const soft = styles.getPropertyValue('--inkSoft').trim() || '#5e5348';
      const rubric = styles.getPropertyValue('--blood').trim() || '#8c2f1e';

      /*
       * Set to fit, not to a size.
       *
       * "The Word Processor" in a monospace at any fixed size runs off a phone,
       * and a title card whose title does not fit is worse than no title card.
       * So it is measured at a nominal size and scaled to the measure, exactly
       * as anything set to a column width would be.
       */
      const track = era.hand === 'brush' ? '0.08em' : '0.14em';
      const nominal = Math.min(w * 0.14, h * 0.09);
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = 'left';
      ctx.letterSpacing = track;
      ctx.font = `700 ${Math.round(nominal)}px ${FACE[era.hand]}`;
      const measure = ctx.measureText(title).width;
      const size = Math.max(12, Math.min(nominal, (nominal * (w * 0.84)) / measure));

      ctx.font = `700 ${Math.round(size)}px ${FACE[era.hand]}`;
      const widths = [...title].map((ch) => ctx.measureText(ch).width);
      const lineWidth = widths.reduce((a, b) => a + b, 0);
      let x = (w - lineWidth) / 2;
      const y = h * 0.52;

      // The numeral above, rubricated — the one mark a scribe puts in red, and
      // the one thing a page number is worth rolling a ribbon over for.
      ctx.save();
      ctx.globalAlpha = Math.min(1, t / 260);
      ctx.fillStyle = rubric;
      ctx.font = `700 ${Math.round(size * 0.62)}px ${FACE[era.hand]}`;
      ctx.textAlign = 'center';
      ctx.fillText(numeral, w / 2, y - size * 1.15);
      ctx.restore();

      ctx.textAlign = 'left';
      ctx.font = `700 ${Math.round(size)}px ${FACE[era.hand]}`;
      ctx.letterSpacing = track;

      [...title].forEach((ch, i) => {
        const at = t - i * pace;
        if (at < 0) return;
        const cw = widths[i];
        const seed = i * 131 + depth * 17;

        ctx.save();
        ctx.fillStyle = ink;

        if (era.hand === 'type') {
          /*
           * Struck. The whole character lands at once, off its place and off
           * square, at whatever the ribbon had left — the same misregistration
           * the board's glyphs carry, for the same reason.
           */
          ctx.globalAlpha = 0.78 + hash3(seed + 3, 0, 0) * 0.22;
          ctx.translate(
            x + (hash3(seed, 0, 0) - 0.5) * size * 0.06,
            y + (hash3(seed + 1, 0, 0) - 0.5) * size * 0.05,
          );
          ctx.rotate((hash3(seed + 2, 0, 0) - 0.5) * 0.05);
          ctx.fillText(ch, 0, 0);
        } else if (era.hand === 'raster') {
          // Exact, flat, and immediately. Nothing to land off its place.
          ctx.fillText(ch, x, y);
        } else {
          /*
           * Drawn. A wipe travelling left to right across the letter, so the
           * stroke is seen being made rather than appearing — and the ink is wet
           * at the leading edge, which is what the shadow is doing.
           */
          const p = Math.min(1, at / draw);
          ctx.beginPath();
          ctx.rect(x - size * 0.1, y - size * 1.2, (cw + size * 0.2) * p, size * 1.7);
          ctx.clip();
          ctx.shadowColor = ink;
          ctx.shadowBlur = size * 0.06 * (1 - p);
          ctx.fillText(ch, x, y);
        }
        ctx.restore();
        x += cw;
      });

      /*
       * The caret, era III only. A word processor's page is never finished — the
       * insertion point is always waiting at the end of what you have written,
       * and it is the one piece of chrome everybody recognises.
       */
      if (era.hand === 'raster' && t > title.length * pace) {
        const on = Math.floor((t - title.length * pace) / 500) % 2 === 0;
        if (on) {
          ctx.fillStyle = ink;
          ctx.fillRect(x + size * 0.08, y - size * 0.78, Math.max(2, size * 0.08), size * 0.86);
        }
      }

      // A rule under the title, drawn as it is written rather than before it.
      ctx.save();
      ctx.globalAlpha = 0.5 * Math.min(1, t / (title.length * pace + draw));
      ctx.strokeStyle = soft;
      ctx.lineWidth = 1;
      const half = (lineWidth + size * 0.4) / 2;
      ctx.beginPath();
      ctx.moveTo(w / 2 - half, y + size * 0.62);
      ctx.lineTo(w / 2 + half, y + size * 0.62);
      ctx.stroke();
      ctx.restore();

      if (t >= total) {
        doneRef.current();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [depth]);

  // Any input skips it. A ceremony you cannot get out of is a loading screen.
  useEffect(() => {
    const skip = () => doneRef.current();
    window.addEventListener('keydown', skip);
    return () => window.removeEventListener('keydown', skip);
  }, []);

  return (
    <div className="overlay overlay--era" onPointerDown={() => doneRef.current()}>
      <canvas className="eracard" ref={canvasRef} aria-label={`${eraAt(depth).name}`} />
    </div>
  );
}
