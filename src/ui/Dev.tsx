import { useState } from 'react';
import { ERAS, ERA_FLOORS, eraNumeral } from '../game/eras';
import type { Runtime } from '../game/runtime';
import { TRAITS } from '../game/traits';

/**
 * The cheat panel, behind `?dev=1`.
 *
 * The debug seams already existed — `jumpTo` and `kill` are how the screenshot
 * scripts drive an exact board, and they have been on `window.__stet` for a long
 * time. What was missing was a way to reach them WHILE PLAYING, which is a
 * different job from driving a screenshot: tuning an era means arriving on it
 * with a real build, at a health you chose, and then playing it.
 *
 * Behind a query parameter rather than a keystroke or a build flag. A keystroke
 * is something a player finds by accident; a build flag means the thing you are
 * testing is not the thing you ship. A URL you have to type is neither.
 *
 * Everything here goes through the runtime rather than mutating state in place,
 * so a cheated board is still a board the engine agrees with — `pushHud` and
 * `refreshPreview` run exactly as they do on a real turn.
 */
export function DevPanel({ rt, depth }: { rt: Runtime; depth: number }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button className="dev dev--tab" onClick={() => setOpen(true)} title="Dev controls">
        dev
      </button>
    );
  }

  return (
    <div className="dev dev--open">
      <div className="dev__row">
        <b>dev</b>
        <button onClick={() => setOpen(false)} aria-label="Close">
          ×
        </button>
      </div>

      <div className="dev__row">
        <span className="dev__label">Era</span>
        {ERAS.map((era, i) => (
          <button
            key={era.id}
            className={Math.floor((depth - 1) / ERA_FLOORS) === i ? 'is-on' : ''}
            title={era.name}
            onClick={() => rt.jumpTo(i * ERA_FLOORS + 1)}
          >
            {eraNumeral(i * ERA_FLOORS + 1)}
          </button>
        ))}
        {/* The boss of whichever era you are standing in. */}
        <button
          title="This era's boss floor"
          onClick={() => rt.jumpTo((Math.floor((depth - 1) / ERA_FLOORS) + 1) * ERA_FLOORS)}
        >
          boss
        </button>
      </div>

      <div className="dev__row">
        <span className="dev__label">Page</span>
        <button onClick={() => rt.jumpTo(Math.max(1, depth - 1))}>−</button>
        <b className="dev__num">{depth}</b>
        <button onClick={() => rt.jumpTo(depth + 1)}>+</button>
        <button onClick={() => rt.devClearFloor()} title="Kill everything on this floor">
          clear
        </button>
      </div>

      <div className="dev__row">
        <span className="dev__label">Body</span>
        <button onClick={() => rt.devPlayer((p) => (p.hp = p.maxHp))}>full</button>
        <button onClick={() => rt.devPlayer((p) => (p.hp = Math.max(1, p.hp - 1)))}>−hp</button>
        <button
          onClick={() =>
            rt.devPlayer((p) => {
              p.maxHp += 1;
              p.hp += 1;
            })
          }
        >
          +heart
        </button>
        <button onClick={() => rt.devPlayer((p) => (p.ward += 1))}>+gesso</button>
        <button onClick={() => rt.devPlayer((p) => (p.dmg += 1))}>+dmg</button>
      </div>

      <div className="dev__row dev__row--wrap">
        <span className="dev__label">Take</span>
        {TRAITS.map((t) => (
          <button key={t.id} title={t.line} onClick={() => rt.devTrait(t.id)}>
            {t.name}
          </button>
        ))}
      </div>

      <div className="dev__row">
        <button onClick={() => rt.newRun()}>new run</button>
        <button onClick={() => rt.kill()}>die</button>
      </div>
    </div>
  );
}

/** `?dev=1`, and nothing else turns it on. */
export const devEnabled = (): boolean =>
  new URLSearchParams(window.location.search).get('dev') === '1';
