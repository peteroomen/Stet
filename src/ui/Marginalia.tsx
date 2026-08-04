import { useEffect } from 'react';
import { splitKeywords } from '../game/keywords';
import { TRAIT_BY_ID } from '../game/traits';

/**
 * A line of card copy, with its jargon set apart.
 *
 * The rule these exist to serve is in `game/keywords.ts`: a card may use a
 * jargon word only if the word is defined in one place, and a word set apart
 * must be a word you can find the meaning of by touching it. So this is the only
 * place copy is rendered, and it carries the definition with it.
 */
export function Copy({ line }: { line: string }) {
  return (
    <>
      {splitKeywords(line).map((run, i) =>
        run.keyword ? (
          <b key={i} className="kw" title={run.keyword.means}>
            {run.text}
          </b>
        ) : (
          <span key={i}>{run.text}</span>
        ),
      )}
    </>
  );
}

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
        {/*
          The era used to be named here, and it has now moved to a page of its
          own — see `EraCard`. It was visible on the hand, which was already an
          improvement on being drawn under it, but a subtitle over three buttons
          is not a place arriving. What is left here is the folio, which is what
          the top of a page says.
        */}
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
                <span className="card__line">
                  <Copy line={t.line} />
                </span>
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
 * What you have taken, written in the margin of the page you are playing.
 *
 * This is the answer to *"I don't see the cards I picked anywhere"*, and the
 * answer was not a better modal. They were always in the game — behind an
 * unlabelled `❧ 2` in the corner — and a build you have to go and look up is a
 * build you play the whole run without. They are called marginalia; the page has
 * a margin; the margin was empty.
 *
 * Set as annotations rather than as a stat block: the name in the era's own
 * face, the rule after it in a lighter weight, a hairline between. It reads as
 * something written on the page because that is what it is.
 *
 * Two things keep it honest. Repeats are counted rather than repeated, because a
 * margin with Whetstone in it three times reads as a bug. And it is still a
 * button — the full text and the keyword glosses live in the ledger, and this is
 * the standing reminder rather than a replacement for it.
 */
export function MarginNotes({ ids, onOpen }: { ids: string[]; onOpen: () => void }) {
  if (ids.length === 0) return <div className="notes notes--empty" aria-hidden="true" />;

  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);

  return (
    <button className="notes" onClick={onOpen} aria-label="What you have taken">
      {[...counts].map(([id, n]) => {
        const t = TRAIT_BY_ID.get(id);
        if (!t) return null;
        return (
          <span key={id} className={`note${t.rare ? ' note--rare' : ''}`}>
            <span className="note__name">
              {t.name}
              {n > 1 && <em> ×{n}</em>}
            </span>
            <span className="note__line">
              <Copy line={t.line} />
            </span>
          </span>
        );
      })}
    </button>
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
                  <span className="ledger__line">
                    <Copy line={t.line} />
                  </span>
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
