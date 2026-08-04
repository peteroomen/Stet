import type { Hud } from '../game/runtime';

function Mark() {
  return (
    <div>
      <span className="mark">
        {/* The word carries the rule itself, so the strike lands through the
            letters rather than centring on the block that also holds the dots. */}
        <span className="mark__word">STET</span>
        <span className="mark__dots" aria-hidden="true">
          ····
        </span>
      </span>
    </div>
  );
}

export function TitleScreen({ best, onBegin }: { best: number; onBegin: () => void }) {
  return (
    <div className="overlay">
      <div className="panel">
        <Mark />
        <p className="tagline">Let it stand</p>

        <ul className="rules">
          <li>
            Swipe or use the arrow keys to <b>step</b>. One tile, one turn.
          </li>
          <li>
            Step into a foe to <b>strike</b> — you swing, you do not advance.
          </li>
          <li>
            Mid-swing you are <span className="warn">exposed</span>: everything
            that hits you does <span className="warn">double</span>.
          </li>
          <li>
            Keep striking and each stroke lands <b>harder</b> — but you stay
            exposed the whole time.
          </li>
          <li>
            A stroke that lands also <span className="good">breaks</span> what
            that foe had committed to — strike the one about to hit you and it
            never lands.
          </li>
          <li>
            But a broken stance <b>braces</b>: a solid arrow cannot be stopped.
            Step away a turn to break it again.
          </li>
          <li>
            Every foe shows you <b>exactly where it will be</b>. They commit too.
            Bait them.
          </li>
          <li>
            Clear the floor to break the <span className="good">seal</span> on
            the stairs.
          </li>
        </ul>

        {best > 0 && <p className="tagline">Deepest · {best}</p>}

        <button className="btn" onClick={onBegin} autoFocus>
          Begin
        </button>
        <p className="press">Tap, or press enter</p>
      </div>
    </div>
  );
}

export function DeathScreen({ hud, onAgain }: { hud: Hud; onAgain: () => void }) {
  const record = hud.depth >= hud.best && hud.best > 0;
  return (
    <div className="overlay">
      <div className="panel">
        <h1 className="epitaph">{hud.faded ? 'Worn through' : 'The ink is dry'}</h1>
        <p className="tagline">{hud.faded ? 'You retraced one step too many' : 'No corrections'}</p>

        <dl className="summary">
          <dt>Page</dt>
          <dd>{hud.depth}</dd>
          <dt>Felled</dt>
          <dd>{hud.kills}</dd>
          <dt>Turns</dt>
          <dd>{hud.turns}</dd>
          <div className="rule" />
          <dt>{record ? 'A new deepest' : 'Deepest'}</dt>
          <dd className={record ? 'best' : undefined}>{Math.max(hud.best, hud.depth)}</dd>
        </dl>

        <button className="btn" onClick={onAgain} autoFocus>
          Again
        </button>
        <p className="press">Tap, or press R</p>
      </div>
    </div>
  );
}
