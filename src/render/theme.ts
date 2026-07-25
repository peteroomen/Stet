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
}

export type ThemeName = 'day' | 'night';

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
  },
};

/** Mirror the active theme into CSS custom properties for the React chrome. */
export function applyThemeVars(name: ThemeName): void {
  const t = THEMES[name];
  const root = document.documentElement;
  root.dataset.theme = name;
  for (const [k, v] of Object.entries(t)) root.style.setProperty(`--${k}`, v);
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', t.paper);
}
