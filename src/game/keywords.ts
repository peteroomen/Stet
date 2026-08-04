/**
 * The words the game is allowed to use as jargon.
 *
 * A card has one line to say what it does, and the honest way to fit a rule into
 * one line is a shared vocabulary — "your next STROKE always BREAKS" is shorter
 * and more exact than any plain-English paraphrase of the same two rules. What
 * makes that fair rather than obscure is that the set is CLOSED and every member
 * of it is defined in one place, so a word in bold is always a word you can find
 * out the meaning of by touching it.
 *
 * This is the FOOLSCAP lesson generalised. That card was called Foolscap and gave
 * you Gesso — two obscure words for one mechanic — and it was reported exactly
 * that way: *"explain foolscap/gesso, it's a mystery to me"*. Flavour you have to
 * look up is a card the player cannot evaluate, and a choice you cannot evaluate
 * is not a choice. The rule that came out of it: a card may use a jargon word
 * only if the word is in here.
 *
 * Written in copy as `*stroke*`, matched case-insensitively so a line can read
 * naturally — see `splitKeywords`. `traits.test.ts` asserts every marked word in
 * every card resolves, so a typo is a failing test rather than a bold word with
 * no meaning behind it.
 */

export interface Keyword {
  /** How it is set when it appears. Small caps in the chrome. */
  label: string;
  /** The whole rule, in plain words. Shown on touch and on hover. */
  means: string;
}

export const KEYWORDS: Record<string, Keyword> = {
  stroke: {
    label: 'stroke',
    means: 'Your attack. Swipe into a foe to strike it — you swing, you do not step onto its tile.',
  },
  break: {
    label: 'break',
    means:
      'A stroke heavy enough cancels what that foe had committed to doing. It only works on the foe you aimed at, and only once per turn.',
  },
  combo: {
    label: 'combo',
    means: 'Consecutive strokes each carry +1 damage. Moving or holding drops it back to nothing.',
  },
  'mid-swing': {
    label: 'mid-swing',
    means:
      'You are mid-swing from the moment you strike until you do something else. Damage against you is doubled while you are.',
  },
  hold: {
    label: 'hold',
    means:
      'Tap to stand your ground for a turn. It sheds mid-swing, and you get two a floor.',
  },
  gesso: {
    label: 'gesso',
    means:
      'A layer laid over the page. It takes a blow before your health does, and nothing ever heals it back.',
  },
  spill: {
    label: 'spill',
    means:
      'The page fills. Once a floor’s quiet runs out, something climbs onto the board every few turns — and faster the longer you linger.',
  },
  dodge: {
    label: 'dodge',
    means: 'Step off a tile something had already committed to striking, and take no damage that turn.',
  },
};

/**
 * Inflections, so copy can be written as English rather than as a lookup table.
 *
 * "Your next stroke always *breaks*" is the sentence anybody would write; making
 * the author reach for "always *break*s" to satisfy a matcher would put the
 * vocabulary ahead of the writing, and the whole reason for the vocabulary is
 * that the writing has to be clear.
 */
const ALIASES: Record<string, string> = {
  strokes: 'stroke',
  breaks: 'break',
  broken: 'break',
  combos: 'combo',
  holds: 'hold',
  spills: 'spill',
  spilling: 'spill',
  dodges: 'dodge',
  dodged: 'dodge',
};

/** Resolve a marked word, through its inflections. */
export function keywordFor(word: string): Keyword | undefined {
  const k = word.toLowerCase();
  return KEYWORDS[k] ?? KEYWORDS[ALIASES[k] ?? ''];
}

/** One run of card copy: either plain text or a keyword to set apart. */
export type CopyRun = { text: string; keyword?: Keyword };

/**
 * Split a line of copy into runs, resolving every `*marked*` word.
 *
 * Unknown words are returned as plain text rather than thrown away, so a typo
 * degrades to an unbolded word on the card instead of a blank. The test is what
 * stops one shipping.
 */
export function splitKeywords(line: string): CopyRun[] {
  const out: CopyRun[] = [];
  const re = /\*([^*]+)\*/g;
  let at = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > at) out.push({ text: line.slice(at, m.index) });
    const kw = keywordFor(m[1]);
    out.push(kw ? { text: m[1], keyword: kw } : { text: m[1] });
    at = m.index + m[0].length;
  }
  if (at < line.length) out.push({ text: line.slice(at) });
  return out;
}

/** Every `*marked*` word in a line, lowercased. Used by the test and nothing else. */
export function markedWords(line: string): string[] {
  return [...line.matchAll(/\*([^*]+)\*/g)].map((m) => m[1].toLowerCase());
}
