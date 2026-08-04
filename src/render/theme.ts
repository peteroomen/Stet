export interface Theme {
  paper: string;
  paperDeep: string;
  grain: string;
  rule: string;
  ink: string;
  inkSoft: string;
  blood: string;
  gold: string;
  ghost: string;
  /** Overlay tint used for the low-health vignette. */
  danger: string;
  /**
   * The hero, and only the hero.
   *
   * Ultramarine: ground lapis, the most expensive pigment on a medieval page and
   * reserved by convention for the principal figure. Everything on this board was
   * drawn in the same ink, so you and the things trying to kill you were told
   * apart by silhouette alone — which is real work on a busy floor. One pigment
   * fixes it, and it is the historically correct one rather than a palette swap.
   *
   * Deliberately not red (that is danger, and every cost numeral uses it) and not
   * gold (that is treasure).
   */
  hero: string;
  /** Bright face of the gilding on the illuminated border. */
  leaf: string;
  /** Shadowed side of the same gilding — the two together read as metal. */
  leafDeep: string;
}

export type ThemeName = 'day' | 'night';

/** Re-exported so `game/eras.ts` can name a hand without importing the glyph layer. */
export type { Mark } from './glyphs';

/**
 * What an era changes about the page, per lighting.
 *
 * A DELTA rather than a whole theme, and that is the point: an era says only
 * what is different about its medium, and both day and night keep working
 * without anyone maintaining four palettes by hand. An era that changes nothing
 * — the manuscript, which is the base — is `{}`.
 */
export interface EraPalette {
  day?: Partial<Theme>;
  night?: Partial<Theme>;
}

/**
 * II · THE TYPEWRITER.
 *
 * Foolscap rather than vellum: machine-made paper, younger, cooler and greyer
 * than a page someone scraped and stretched. The rule goes faint BLUE, which is
 * both what ruled foolscap actually is and a piece of teaching — the page's own
 * furniture is now horizontal lines, and lines are what this era's threats are
 * made of.
 *
 * The danger colour comes from the machine. A typewriter ribbon is bichrome,
 * black over red, so era II's red is not an overlay on the medium — it IS the
 * other half of the ribbon, and every telegraph is struck in it.
 *
 * The hero stays the only blue on the page, but changes pigment: ground lapis
 * belongs to an illuminator, and the blue a machine of this period puts on paper
 * is duplicating ink. Same rule, right chemistry.
 *
 * The gilding goes to BRASS, and the embellishment changes shape with it.
 *
 * Steel was tried first and reported as not popping and not beautiful next to
 * era I's gold, which is a chroma problem: grey has almost none, so it reads as
 * absence rather than as material. Brass keeps the warmth that made the gold
 * work and is exactly what a machine of this period had its fittings made of.
 *
 * But colour alone would have made it read as DIM GOLD, which is worse than
 * either. So the margin is drawn differently too — see `typeset` in the
 * renderer: a fine pinstripe pair and turned screw-heads at the corners, in
 * place of era I's vine and volutes. Same material family, an entirely
 * different hand.
 */
export const TYPEWRITER: EraPalette = {
  day: {
    paper: '#EFEDE4',
    paperDeep: '#CFCCBF',
    grain: '#6E6E64',
    rule: '#A9BBD0',
    ink: '#14161A',
    inkSoft: '#585C63',
    blood: '#B0242F',
    danger: '#B0242F',
    gold: '#9A7434',
    ghost: '#8E8E85',
    hero: '#2A4A9E',
    leaf: '#B98D4A',
    leafDeep: '#6B5327',
  },
  night: {
    paper: '#121315',
    paperDeep: '#06070A',
    grain: '#C6C6BC',
    rule: '#2E3A4A',
    ink: '#E6E4DA',
    inkSoft: '#94958E',
    blood: '#DA5147',
    danger: '#DA5147',
    gold: '#C9A263',
    ghost: '#67675F',
    hero: '#7FA6EA',
    leaf: '#CFA35D',
    leafDeep: '#6A5024',
  },
};

/** The theme a floor is actually drawn in: the lighting, with the era laid over it. */
export function themeFor(name: ThemeName, palette: EraPalette): Theme {
  return { ...THEMES[name], ...(palette[name] ?? {}) };
}

export const THEMES: Record<ThemeName, Theme> = {
  // Aged paper under a desk lamp.
  day: {
    paper: '#F3ECDE',
    paperDeep: '#DFD3B8',
    grain: '#7d6b49',
    rule: '#C6B896',
    ink: '#1A1714',
    inkSoft: '#5E5348',
    blood: '#8C2F1E',
    gold: '#A87B2C',
    ghost: '#7E7362',
    danger: '#8C2F1E',
    hero: '#243C7A',
    leaf: '#E0AE3E',
    leafDeep: '#8A6216',
  },
  // The same page, read by candle.
  night: {
    paper: '#15120D',
    paperDeep: '#080705',
    grain: '#d9c9a2',
    rule: '#3B3225',
    ink: '#EDE3C9',
    inkSoft: '#9E9078',
    blood: '#CE5740',
    gold: '#DCA94D',
    ghost: '#6E6455',
    danger: '#CE5740',
    hero: '#8FB0E8',
    leaf: '#EFC55F',
    leafDeep: '#7A5714',
  },
};

/**
 * Mirror the active theme into CSS custom properties for the React chrome.
 *
 * Takes the era's palette too, or the chrome keeps wearing era I while the board
 * has moved on — the HUD, the cards and the state line all read these vars.
 */
export function applyThemeVars(name: ThemeName, palette: EraPalette = {}): void {
  const t = themeFor(name, palette);
  const root = document.documentElement;
  root.dataset.theme = name;
  for (const [k, v] of Object.entries(t)) root.style.setProperty(`--${k}`, v);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', t.paper);
}
