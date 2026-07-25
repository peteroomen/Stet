import type { Hud as HudData } from '../game/runtime';

/** HP as ink drops. Filled while you have them, hollow once they are spent. */
function Pips({ hp, maxHp }: { hp: number; maxHp: number }) {
  const critical = hp <= 2;
  return (
    <div
      className={`pips${critical ? ' pips--critical' : ''}`}
      role="img"
      aria-label={`${hp} of ${maxHp} health`}
    >
      {Array.from({ length: maxHp }, (_, i) => (
        <span
          key={i}
          className={`pip${i >= hp ? ' pip--empty' : critical ? ' pip--low' : ''}`}
        />
      ))}
    </div>
  );
}

export function Hud({ hud }: { hud: HudData }) {
  return (
    <header className="hud">
      <div className="hud__slot">
        <span className="hud__depth">
          Depth<em>{hud.depth}</em>
        </span>
      </div>

      <Pips hp={hud.hp} maxHp={hud.maxHp} />

      <div className="hud__slot hud__slot--right">
        {hud.dmg > 1 && (
          <span className="hud__stat" title="Damage per stroke">
            Nib <b>×{hud.dmg}</b>
          </span>
        )}
        {hud.stairsOpen ? (
          <span className="hud__open">Way down</span>
        ) : (
          <span className="hud__stat">
            <b>{hud.enemiesLeft}</b> left
          </span>
        )}
      </div>
    </header>
  );
}

/**
 * The commitment readout. EXPOSED is the single most important thing the player
 * needs to know, so it gets the loudest treatment the chrome has — set as the
 * proofreader's delete mark, struck through, which is also what it means.
 */
export function StateLine({ hud }: { hud: HudData }) {
  // Priority order is the order these matter in: what is happening to you right
  // now, then what is about to, then how to play.
  let body;
  if (hud.exposed) {
    body = (
      <span className="exposed">
        <span>Exposed</span>
        <span className="exposed__x2">×2</span>
        {hud.combo > 0 && (
          <span className="combo" aria-label={`combo ${hud.combo}`}>
            {Array.from({ length: hud.combo }, (_, i) => (
              <i key={i} />
            ))}
          </span>
        )}
      </span>
    );
  } else if (hud.spilling) {
    body = <span className="spilling">The page is filling</span>;
  } else if (hud.graceLeft <= 4 && hud.enemiesLeft > 0) {
    body = <span className="warning">The ink is rising · {hud.graceLeft}</span>;
  } else {
    body = <span className="hint">Swipe to step · into a foe to strike</span>;
  }

  return (
    <div className="state" aria-live="polite">
      {body}
    </div>
  );
}
