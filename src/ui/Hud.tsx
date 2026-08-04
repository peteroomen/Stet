import type { Hud as HudData } from '../game/runtime';

/** HP as ink drops. Filled while you have them, hollow once they are spent. */
function Pips({ hp, maxHp, ward }: { hp: number; maxHp: number; ward: number }) {
  const critical = hp <= 2 && ward === 0;
  return (
    <div
      className={`pips${critical ? ' pips--critical' : ''}`}
      role="img"
      aria-label={`${hp} of ${maxHp} health${ward > 0 ? `, ${ward} gesso — a layer that takes a blow first and never heals back` : ''}`}
    >
      {Array.from({ length: maxHp }, (_, i) => (
        <span
          key={i}
          className={`pip${i >= hp ? ' pip--empty' : critical ? ' pip--low' : ''}`}
        />
      ))}
      {/*
        Gesso sits AFTER the hearts and is drawn gilded rather than inked,
        because it is not more health — it is something laid over the page, and
        nothing you do will ever put it back.
      */}
      {Array.from({ length: ward }, (_, i) => (
        <span
          key={`w${i}`}
          className="pip pip--ward"
          title="Gesso — takes a blow before your health, and never heals back"
        />
      ))}
    </div>
  );
}

export function Hud({ hud, onShowTraits }: { hud: HudData; onShowTraits: () => void }) {
  return (
    <header className="hud">
      <div className="hud__slot">
        <span className="hud__depth">
          Depth<em>{hud.depth}</em>
        </span>
      </div>

      <Pips hp={hud.hp} maxHp={hud.maxHp} ward={hud.ward} />

      {/*
        Retraces left. Counted rather than shown as a bar, because that is the
        unit actually spent — fresh paper is free and every revisit costs one.
      */}
      {hud.retraces !== null && (
        <span
          className={`retraces${hud.retraces <= 1 ? ' retraces--worn' : ''}`}
          title="Steps you can retrace before wearing through the page"
        >
          <span aria-hidden="true">≈</span>
          <b>{hud.retraces}</b>
        </span>
      )}

      <div className="hud__slot hud__slot--right">
        {/*
          What you have written in the margin, and a way back to reading it. An
          upgrade whose effect you cannot recall is an upgrade that is not in
          the game — so the count is always visible and one tap opens the list.
        */}
        <button
          className="hud__marks"
          onClick={onShowTraits}
          aria-label={`${hud.traits.length} marginalia — show what they do`}
          title="What you have taken"
        >
          <span aria-hidden="true">❧</span>
          <b>{hud.traits.length}</b>
        </button>
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
export function StateLine({ hud, taughtHold }: { hud: HudData; taughtHold: boolean }) {
  // Priority order is the order these matter in: what is happening to you right
  // now, then what is about to, then how to play.
  let body;
  if (hud.exposed) {
    // The board no longer draws exposure at all — the per-direction costs are
    // computed by running the turn, so a strike that would cost 3 simply reads
    // 6. This line is the only place the mechanism is named, and it goes quiet
    // when nothing is committed to reaching you, because then it is free.
    body = (
      <span className={hud.inDanger ? 'exposed' : 'exposed exposed--idle'}>
        <span>Mid-swing</span>
        {hud.inDanger && <span className="exposed__x2">×2</span>}
      </span>
    );
  } else if (hud.drowning) {
    // Above the ordinary spill line and above the grace countdown, because it
    // is the only one of the three that is costing you health this turn.
    body = <span className="spilling spilling--full">No room left · the ink is on you</span>;
  } else if (hud.spilling) {
    body = <span className="spilling">The page is filling</span>;
  } else if (hud.graceLeft <= 4 && hud.enemiesLeft > 0) {
    body = <span className="warning">The ink is rising · {hud.graceLeft}</span>;
  } else if (hud.canWait && !taughtHold && hud.waitsLeft > 0) {
    // Tapping to hold is the one input nothing on screen implies, so it is
    // taught until it has been used once — and then never shown again.
    body = <span className="hint hint--teach">Tap to hold</span>;
  } else if (hud.depth === 1) {
    // Only on the first floor. A permanent line of instruction is one more thing
    // on a screen that had too much on it.
    body = <span className="hint">Bump a foe to strike it</span>;
  } else {
    body = null;
  }

  return (
    <div className="state">
      <span aria-live="polite">{body}</span>
      {/*
        A readout, not a button. Tap, space and '.' all hold, so a fourth control
        was only ever furniture — but the BUDGET is real information and has to
        stay visible: two a floor is the whole reason holding is not a stall.
      */}
      {hud.canWait && Number.isFinite(hud.waitsLeft) && (
        <span className={`holds${hud.waitsLeft === 0 ? ' holds--spent' : ''}`}>
          Hold ×{hud.waitsLeft}
        </span>
      )}
    </div>
  );
}
