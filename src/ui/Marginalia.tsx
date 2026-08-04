import { useEffect } from 'react';
import { TRAIT_BY_ID } from '../game/traits';

/**
 * The card hand, and the ledger of what you have already taken.
 *
 * Two screens, one idea: a run's build has to be readable without being
 * remembered. The hand explains each card in a line at the moment you choose it,
 * and the ledger lets you go back and read any of them again — an upgrade whose
 * effect you cannot recall is an upgrade that is not in the game.
 */

/** Pick one of three. Nothing on the board moves until you do. */
export function TraitOffer({
  ids,
  depth,
  onTake,
}: {
  ids: string[];
  depth: number;
  onTake: (id: string) => void;
}) {
  // 1 / 2 / 3 take a card, so the whole game stays keyboard operable.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const i = Number(e.key) - 1;
      if (i >= 0 && i < ids.length) {
        e.preventDefault();
        onTake(ids[i]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ids, onTake]);

  return (
    <div className="overlay overlay--cards">
      <div className="panel">
        <p className="cards__depth">Page {depth}</p>
        <h2 className="cards__title">The margin</h2>
        <div className="cards">
          {ids.map((id, i) => {
            const t = TRAIT_BY_ID.get(id);
            if (!t) return null;
            return (
              // A rare is drawn gilded, because the one thing a player must be
              // able to do with a scarce card is NOTICE it.
              <button
                key={id}
                className={`card${t.rare ? ' card--rare' : ''}`}
                onClick={() => onTake(id)}
              >
                <span className="card__key">{i + 1}</span>
                <span className="card__name">{t.name}</span>
                <span className="card__line">{t.line}</span>
                {t.rare && <span className="card__rare">rare</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/**
 * Everything taken this run, with what each one does.
 *
 * MEND never appears here — it heals and is gone, and a ledger of "you healed
 * four times" is not a build.
 */
export function TraitLedger({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Taken twice means twice as strong, so they are counted rather than listed
  // again — a ledger with "Whetstone" three times reads as a bug.
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  return (
    <div className="overlay" onClick={onClose}>
      <div className="panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="cards__title">The margin</h2>
        {ids.length === 0 ? (
          <p className="ledger__empty">Nothing written yet.</p>
        ) : (
          <ul className="ledger">
            {[...counts].map(([id, n]) => {
              const t = TRAIT_BY_ID.get(id);
              if (!t) return null;
              return (
                <li key={id} className={`ledger__row${t.rare ? ' ledger__row--rare' : ''}`}>
                  <span className="ledger__name">
                    {t.name}
                    {n > 1 && <em> ×{n}</em>}
                  </span>
                  <span className="ledger__line">{t.line}</span>
                </li>
              );
            })}
          </ul>
        )}
        <button className="btn btn--quiet" onClick={onClose}>
          Back
        </button>
      </div>
    </div>
  );
}
