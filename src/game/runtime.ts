import { sfx } from '../audio/sfx';
import { Effects } from '../render/effects';
import { EMPTY_ANIM, Renderer, buildAnim, strikeWeight, type TurnAnim } from '../render/renderer';
import { applyThemeVars, type ThemeName } from '../render/theme';
import { eraAt } from './eras';
import { chooseTrait, demoState, newGame, step } from './engine';
import { MAX_ENEMIES } from './grid';
import { previewMoves, underThreat, type MoveOutcome } from './preview';
import { randomSeed } from './rng';
import type { Action, Ev, GameState } from './types';

/**
 * Accept the next input once the turn is this far through. Buffering a swipe
 * feels responsive; letting it land slightly early makes held-drag movement flow
 * instead of stuttering between turns.
 */
const EARLY = 0.84;

const BEST_KEY = 'stet.best.v1';
const THEME_KEY = 'stet.theme.v1';
const MUTE_KEY = 'stet.mute.v1';
const HOLD_KEY = 'stet.taughtHold.v1';

export interface Hud {
  screen: GameState['screen'];
  depth: number;
  hp: number;
  maxHp: number;
  /** GESSO layers. Take blows first and can never be mended. */
  ward: number;
  /**
   * Retraces left before you wear through the page, or null when WEAR is off.
   *
   * Reported in RETRACES rather than raw ink, because that is the unit the
   * player actually spends: fresh paper is free, and every revisit costs exactly
   * one. A bar counting down in eights would be arithmetic; this is a count.
   */
  retraces: number | null;
  dmg: number;
  exposed: boolean;
  /** Whether HOLD is offered at all. See Rules.allowWait.  */
  canWait: boolean;
  /** Holds left on this floor; Infinity when the rules do not ration them. */
  waitsLeft: number;
  /**
   * Exposed AND something is committed to a blow that lands on you.
   *
   * Exposure doubles incoming damage, so it is frightening — but only when
   * something can actually reach you. Standing exposed on an empty board costs
   * nothing at all, and a readout that shouts equally loudly in both cases is
   * how a mechanic ends up feeling arbitrary instead of learnable.
   */
  inDanger: boolean;
  combo: number;
  enemiesLeft: number;
  stairsOpen: boolean;
  kills: number;
  turns: number;
  best: number;
  /** Ended by wearing through the page rather than by a blow. */
  faded: boolean;
  /** Turns of quiet left before the page starts filling; 0 once it has begun. */
  graceLeft: number;
  spilling: boolean;
  /**
   * The page is full and the ink has nowhere left to go but onto you.
   *
   * Worth its own line rather than folding into `spilling`, because the two say
   * opposite things about what to do: "the page is filling" is a reason to hurry,
   * and this is a reason to kill something RIGHT NOW. Without it the drown reads
   * as damage from nowhere.
   */
  drowning: boolean;
  /** Marginalia taken this run, in order. Drives the ledger and the HUD count. */
  traits: string[];
  /** The three on the page right now, while `screen` is 'choosing'. */
  offer: string[];
}

function hudOf(s: GameState, best: number): Hud {
  return {
    screen: s.screen,
    depth: s.depth,
    hp: s.player.hp,
    maxHp: s.player.maxHp,
    ward: s.player.ward,
    retraces:
      s.rules.fadeMax > 0 && s.rules.wearMemory > 0
        ? Math.max(0, Math.ceil(s.player.ink / Math.max(1, s.rules.wearCost)))
        : null,
    dmg: s.player.dmg,
    exposed: s.player.exposed,
    canWait: s.rules.allowWait,
    waitsLeft:
      s.rules.waitsPerFloor > 0 ? Math.max(0, s.rules.waitsPerFloor - s.floorWaits) : Infinity,
    inDanger: s.player.exposed && underThreat(s),
    combo: s.player.combo,
    enemiesLeft: s.enemies.length,
    stairsOpen: s.stairsOpen,
    kills: s.stats.kills,
    turns: s.stats.turns,
    best,
    faded: s.screen === 'dead' && s.player.hp > 0,
    graceLeft: Math.max(0, s.grace - s.floorTurns),
    spilling: s.floorTurns >= s.grace && s.enemies.length > 0,
    drowning: s.floorTurns >= s.grace && s.enemies.length >= MAX_ENEMIES,
    traits: [...s.traits],
    offer: [...s.offer],
  };
}

export class Runtime {
  state: GameState;
  anim: TurnAnim = EMPTY_ANIM;
  renderer: Renderer;
  effects = new Effects();

  /**
   * What each of the four directions would cost, recomputed once per turn.
   *
   * Deliberately NOT per frame: `previewMoves` runs `step()` four times and
   * `step()` deep-clones, which is nothing once a turn and real work at 60fps
   * against a board that has not changed.
   */
  moves: MoveOutcome[] = [];

  private clock = 0;
  private wall = 0;
  private last = 0;
  private raf = 0;
  private queued: Action | null = null;
  private size = 0;
  private running = false;

  best = 0;
  themeName: ThemeName = 'day';
  /** Era the chrome is currently wearing, so a descent only re-pushes on a change. */
  private chromeEra = '';

  /**
   * Whether this player has ever held their ground.
   *
   * Tapping to hold is the one input nothing on screen implies, so the hint
   * stays up until it has been used once — and then never again, on this device.
   */
  private _taughtHold = false;
  onHud: (h: Hud) => void = () => {};

  constructor(canvas: HTMLCanvasElement) {
    this.best = Number(localStorage.getItem(BEST_KEY) ?? 0) || 0;
    this.themeName = (localStorage.getItem(THEME_KEY) as ThemeName) ?? 'day';
    const muted = localStorage.getItem(MUTE_KEY) === '1';
    sfx.setMuted(muted);
    this._taughtHold = localStorage.getItem(HOLD_KEY) === '1';

    this.state = demoState(randomSeed());
    this.renderer = new Renderer(canvas, this.effects, this.themeName);
    this.syncChrome();
  }

  /**
   * Push the current lighting AND era into the CSS custom properties.
   *
   * The React chrome — HUD, cards, the state line — is styled entirely off these
   * vars, so it has to be re-pushed whenever either changes. Missing the era half
   * leaves the frame around the board in the manuscript's gold while the board
   * itself has gone to steel, which reads as a bug rather than as a place.
   */
  private syncChrome(depth = this.state.depth): void {
    const era = eraAt(depth);
    this.chromeEra = era.id;
    applyThemeVars(this.themeName, era.palette);
    // The synth speaks the era too — a nib on paper is the wrong fiction the
    // moment the page becomes a typed one.
    sfx.hand = era.hand;
    sfx.setDroneHand();
  }

  get muted(): boolean {
    return sfx.muted;
  }

  get taughtHold(): boolean {
    return this._taughtHold;
  }

  set taughtHold(v: boolean) {
    this._taughtHold = v;
    localStorage.setItem(HOLD_KEY, v ? '1' : '0');
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const tick = (ts: number) => {
      this.frame(ts);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  setTheme(name: ThemeName): void {
    this.themeName = name;
    this.renderer.themeName = name;
    this.renderer.invalidatePaper();
    this.renderer.invalidateGlyphs();
    this.syncChrome();
    localStorage.setItem(THEME_KEY, name);
    sfx.ui();
  }

  toggleMute(): void {
    const next = !sfx.muted;
    sfx.setMuted(next);
    localStorage.setItem(MUTE_KEY, next ? '1' : '0');
    if (!next) sfx.ui();
  }

  /** Any user gesture unlocks audio; browsers require it. */
  unlockAudio(): void {
    sfx.unlock();
  }

  newRun(): void {
    this.unlockAudio();
    this.state = newGame(randomSeed());
    this.anim = EMPTY_ANIM;
    this.clock = 0;
    this.queued = null;
    this.effects.reset();
    this.renderer.invalidatePaper();
    // Back to page one, so back to the first era's page AND its palette of
    // sounds — a new run started inside era II's synth would open wrong.
    this.syncChrome();
    sfx.startDrone(this.state.depth);
    sfx.setDroneDepth(this.state.depth);
    sfx.descend(this.state.depth);
    this.pushHud();
  }

  toTitle(): void {
    this.state = demoState(randomSeed());
    this.anim = EMPTY_ANIM;
    this.clock = 0;
    this.queued = null;
    this.effects.reset();
    this.renderer.invalidatePaper();
    sfx.stopDrone();
    this.pushHud();
  }

  /** Take one of the marginalia on offer. Not a turn — nothing on the board moves. */
  takeTrait(id: string): void {
    const r = chooseTrait(this.state, id);
    if (r.state === this.state) return;
    this.state = r.state;
    this.anim = EMPTY_ANIM;
    this.clock = 0;
    this.queued = null;
    for (const ev of r.events) this.fire(ev);
    this.pushHud();
  }

  /** Feed an action. Buffers if a turn is still resolving. */
  input(act: Action): void {
    if (this.state.screen !== 'playing') return;
    if (act === 'wait' && !this.state.rules.allowWait) return;
    if (this.clock < this.anim.total * EARLY) {
      this.queued = act;
      return;
    }
    this.resolve(act);
  }

  private resolve(act: Action): void {
    const before = this.state.depth;
    const r = step(this.state, act);
    this.state = r.state;
    this.anim = buildAnim(r.events);
    this.clock = 0;
    this.queued = null;

    if (this.state.depth !== before) {
      // New page: wipe the fight you had on the last one.
      this.effects.reset();
      this.renderer.invalidatePaper();
    }

    if (this.state.screen === 'dead' && this.state.stats.deepest > this.best) {
      this.best = this.state.stats.deepest;
      localStorage.setItem(BEST_KEY, String(this.best));
    }

    this.pushHud();
  }

  /**
   * Recompute what each direction would cost. Every path that changes the board
   * lands in `pushHud`, so this hangs off it rather than being remembered at six
   * separate call sites.
   */
  refreshPreview(): void {
    this.moves = this.state.screen === 'playing' ? previewMoves(this.state) : [];
  }

  private pushHud(): void {
    this.refreshPreview();
    this.onHud(hudOf(this.state, this.best));
  }

  /* ---------------------------------------------------------------------
   * Debug seams. Reaching a WARDEN honestly takes seven floors, which is far
   * too slow a loop for tuning how one looks and sounds. Exposed on
   * `window.__stet` so the screenshot script and a live console can both drive
   * the game to an exact board.
   * ------------------------------------------------------------------ */

  /** Rebuild the run at `depth` without playing the floors in between. */
  jumpTo(depth: number): void {
    this.unlockAudio();
    let s = newGame(randomSeed());
    let guard = 0;
    while (s.depth < depth && guard++ < 500) {
      // Clear the floor, stand NEXT TO the stairs, then walk onto them. Standing
      // on the stairs and stepping walks off them, which is how this silently
      // stalled at depth 2.
      const st = s.stairs;
      const above = st.y > 0;
      const from = { x: st.x, y: above ? st.y - 1 : st.y + 1 };
      s = {
        ...s,
        enemies: [],
        blots: [],
        stairsOpen: true,
        player: { ...s.player, pos: from },
      };
      const r = step(s, above ? 'down' : 'up');
      if (!r.events.some((e) => e.t === 'descend')) break;
      s = r.state;
      // A descent holds the run open on a card hand, and nothing resolves until
      // one is taken — so the jump stopped dead on the first offer and quietly
      // landed two floors short of wherever it was aimed.
      if (s.screen === 'choosing' && s.offer.length > 0) s = chooseTrait(s, s.offer[0]).state;
    }
    this.state = s;
    this.anim = EMPTY_ANIM;
    this.clock = 0;
    this.queued = null;
    this.effects.reset();
    this.renderer.invalidatePaper();
    // Back to page one, so back to the first era's page AND its palette of
    // sounds — a new run started inside era II's synth would open wrong.
    this.syncChrome();
    sfx.startDrone(this.state.depth);
    sfx.setDroneDepth(this.state.depth);
    this.pushHud();
  }

  /** End the run where it stands. */
  kill(): void {
    this.state = {
      ...this.state,
      screen: 'dead',
      player: { ...this.state.player, hp: 0 },
    };
    if (this.state.stats.deepest > this.best) {
      this.best = this.state.stats.deepest;
      localStorage.setItem(BEST_KEY, String(this.best));
    }
    this.anim = buildAnim([{ t: 'death', phase: 'e', depth: this.state.depth, cause: 'blow' }]);
    this.clock = 0;
    this.pushHud();
  }

  private frame(ts: number): void {
    const raw = Math.min(ts - this.last, 50);
    this.last = ts;
    this.wall += raw;

    // Hitstop: freeze the turn and its effects, but let the boil keep going —
    // a frozen frame that is still redrawing by hand reads as impact, not as a
    // dropped frame.
    let dt = raw;
    if (this.effects.freeze > 0) {
      const used = Math.min(this.effects.freeze, raw);
      this.effects.freeze -= used;
      dt = raw - used;
    }

    this.clock += dt;
    this.effects.update(dt);

    this.size = Math.min(
      this.renderer.canvas.clientWidth,
      this.renderer.canvas.clientHeight,
    );

    for (let i = 0; i < this.anim.cues.length; i++) {
      if (!this.anim.fired[i] && this.clock >= this.anim.cues[i].at) {
        this.anim.fired[i] = true;
        this.fire(this.anim.cues[i].ev);
      }
    }

    if (this.queued && this.clock >= this.anim.total * EARLY) {
      const d: Action = this.queued;
      this.queued = null;
      this.resolve(d);
    }

    this.renderer.draw(this.state, this.anim, this.clock, this.wall, this.moves);
  }

  /* ---------------------------------------------------------------------
   * Event → feel. Everything the player hears and every particle they see is
   * driven from the engine's event list, so the fiction can never drift out of
   * step with the rules.
   * ------------------------------------------------------------------ */
  private fire(ev: Ev): void {
    const g = this.size;
    const cell = g / 5;
    const fx = this.effects;
    const t = this.renderer.theme;
    const at = (v: { x: number; y: number }) => this.renderer.tileCenter(g, v);

    switch (ev.t) {
      case 'move':
        sfx.step();
        break;

      case 'wait': {
        sfx.wait();
        break;
      }

      // The margin. Gilded rather than bloody: this is the one moment in a run
      // that is not about being hit.
      case 'offer': {
        sfx.unseal();
        break;
      }

      case 'trait': {
        sfx.upgrade();
        fx.addFlash(0.1, t.gold);
        break;
      }

      case 'blocked': {
        sfx.blocked();
        fx.addShake(cell * 0.03);
        break;
      }

      case 'bump': {
        const [x, y] = at(ev.to);
        const [px, py] = at(ev.from);
        const ang = Math.atan2(y - py, x - px);
        // Weight, not damage, so shake / freeze / duration / reach all move
        // together and one blow reads as one event. The old numbers were flat —
        // a glancing tap froze for 40 ms and a killing blow for 72, which is not
        // enough spread for anything to feel explosive, because nothing was
        // quiet. A tap is now over before you notice; a real blow stops the page.
        const weight = strikeWeight(ev.dmg, ev.killed);
        sfx.strike({ combo: ev.combo, killed: ev.killed, weight, broke: ev.broke });
        fx.addShake(cell * (0.03 + weight * 0.1));
        fx.addFreeze(30 + weight * 90);
        // The stroke itself, as a brush arc through the target. Ink when it bit
        // deep enough to break the stance, blood when it merely landed — so the
        // most important fact about a hit is legible from its colour alone.
        fx.slash(x, y, ang, 0.5 + ev.combo * 0.28, ev.broke ? t.ink : t.blood, cell);
        fx.splatter(x, y, ang, 0.55 + ev.dmg * 0.16, t.blood, cell);
        fx.ring(x, y, cell * 0.12, cell * (0.42 + ev.combo * 0.06), t.blood, cell * 0.035, 380);
        fx.text(
          x,
          y - cell * 0.28,
          ev.combo > 0 ? `${ev.dmg}` : `${ev.dmg}`,
          t.blood,
          cell * (0.26 + ev.combo * 0.035),
          ev.combo > 1 ? 1.4 : 1,
        );
        break;
      }

      case 'kill': {
        const [x, y] = at(ev.pos);
        sfx.kill();
        // A full swash with a curl — the finishing mark, unmistakable for a hit.
        fx.swash(x, y, Math.random() * Math.PI * 2, t.ink, cell);
        fx.shatter(x, y, t.ink, cell);
        fx.splatter(x, y, Math.random() * Math.PI * 2, 1.1, t.blood, cell);
        fx.addShake(cell * 0.1);
        fx.addFreeze(48);
        fx.ring(x, y, cell * 0.1, cell * 0.8, t.ink, cell * 0.04, 480);
        break;
      }

      /*
       * The insertion: you were moved.
       *
       * No shake and no freeze — those belong to the blow that caused it, which
       * has already fired both, and stacking them would read as being hit twice.
       * What this needs instead is a sense of TRAVEL, so it is a run of marks
       * laid along the tile you were pushed into, in the page's own ink rather
       * than in blood: nothing is bleeding, something is being rearranged.
       */
      case 'shove': {
        const [x, y] = at(ev.to);
        const [fx0, fy0] = at(ev.from);
        sfx.shove();
        fx.swash(x, y, Math.atan2(y - fy0, x - fx0), t.inkSoft, cell * 0.75);
        break;
      }

      case 'emove': {
        // Only the two-tile lunge gets a sound; every enemy stepping every turn
        // would be noise.
        if (Math.abs(ev.to.x - ev.from.x) + Math.abs(ev.to.y - ev.from.y) > 1) {
          sfx.lunge();
          const [x, y] = at(ev.to);
          fx.addShake(cell * 0.03);
          fx.splatter(x, y, Math.random() * Math.PI * 2, 0.3, t.inkSoft, cell * 0.6, false);
        }
        break;
      }

      case 'wind': {
        sfx.wind();
        const [x, y] = at(ev.pos);
        fx.ring(x, y, cell * 0.6, cell * 0.3, t.blood, cell * 0.03, 520);
        break;
      }

      case 'eattack': {
        const [x, y] = at(ev.at);
        const [ex, ey] = at(ev.from);
        const ang = Math.atan2(y - ey, x - ex);
        sfx.hurt(ev.exposed);
        fx.addShake(cell * (0.06 + ev.dmg * 0.022));
        fx.addFreeze(ev.exposed ? 95 : 55);
        fx.splatter(x, y, ang, 0.7 + ev.dmg * 0.2, t.blood, cell);
        fx.text(x, y - cell * 0.3, `-${ev.dmg}`, t.blood, cell * (0.28 + ev.dmg * 0.02), 1.4);
        if (ev.exposed) {
          fx.addFlash(0.2, t.blood);
          fx.ring(x, y, cell * 0.2, cell * 1.1, t.blood, cell * 0.05, 520);
        }
        break;
      }

      case 'pickup': {
        const [x, y] = at(ev.pos);
        if (ev.kind === 'nib') {
          sfx.upgrade();
          fx.swash(x, y, -Math.PI / 2, t.leaf, cell * 0.9);
          fx.ring(x, y, cell * 0.1, cell * 1.2, t.leaf, cell * 0.05, 700);
          fx.addFlash(0.12, t.gold);
          fx.text(x, y - cell * 0.3, 'NIB  +1', t.gold, cell * 0.24, 1.4);
        } else {
          sfx.pickup();
          fx.ring(x, y, cell * 0.1, cell * 0.7, t.gold, cell * 0.035, 460);
          fx.text(x, y - cell * 0.3, `+${ev.amount}`, t.gold, cell * 0.26, 1.2);
        }
        break;
      }

      case 'stagger': {
        const [x, y] = at(ev.pos);
        sfx.stagger(ev.interrupted);
        fx.addShake(cell * (ev.interrupted ? 0.05 : 0.025));
        fx.addFreeze(ev.interrupted ? 60 : 30);
        // A hard ring snapping outward — the committed action breaking.
        fx.ring(x, y, cell * 0.5, cell * 0.16, t.ink, cell * 0.05, 300);
        if (ev.interrupted) {
          fx.text(x, y - cell * 0.42, 'BROKEN', t.ink, cell * 0.19, 1.4);
        }
        break;
      }

      case 'spill': {
        const [x, y] = at(ev.pos);
        sfx.spill();
        // Ink wells up and something climbs out — thrown outward, not splashed
        // by an impact, so it reads as arriving rather than as being hit.
        fx.splatter(x, y, Math.random() * Math.PI * 2, 0.8, t.ink, cell);
        fx.ring(x, y, cell * 0.7, cell * 0.16, t.ink, cell * 0.04, 460);
        fx.addShake(cell * 0.045);
        fx.text(x, y - cell * 0.42, 'THE PAGE FILLS', t.ink, cell * 0.17, 1);
        break;
      }

      /*
       * The page had no room left, so it filled over you.
       *
       * Drawn as the spill's own well — the ink closing IN on your tile rather
       * than a splash thrown outward — so it reads as the same mechanic finding
       * you rather than as an unexplained tick of damage. The ring collapses
       * inward, which is the one motion nothing else on the board makes.
       */
      case 'drown': {
        const [x, y] = at(ev.pos);
        sfx.drown();
        fx.addShake(cell * 0.05);
        fx.addFreeze(55);
        fx.ring(x, y, cell * 1.3, cell * 0.1, t.ink, cell * 0.05, 480);
        fx.addFlash(0.14, t.ink);
        // The numeral only. The state line already names it, and a caption
        // across three tiles of board is the kind of thing this HUD keeps
        // having to have removed from it.
        fx.text(x, y - cell * 0.3, `-${ev.dmg}`, t.ink, cell * 0.3, 1.4);
        break;
      }

      /*
       * The bell, and the whole reason it is an event: it has to TEACH. The
       * player must connect "I heard that" with "one fewer row is safe from
       * now on", or the fight reads as arbitrarily escalating rather than as
       * advancing. So it says the number outright.
       */
      case 'bell': {
        const [x, y] = at(ev.pos);
        sfx.bell();
        fx.addShake(cell * 0.07);
        fx.addFreeze(120);
        fx.addFlash(0.16, t.blood);
        fx.ring(x, y, cell * 0.2, cell * 2.6, t.blood, cell * 0.05, 900);
        fx.text(x, y - cell * 0.5, `${ev.width} ROWS`, t.blood, cell * 0.26, 1.6);
        break;
      }

      case 'unseal': {
        const [x, y] = at(ev.pos);
        sfx.unseal();
        // Two swashes opening the way, gilded.
        fx.swash(x, y, -Math.PI / 2, t.leaf, cell * 1.15);
        fx.swash(x, y, Math.PI / 2, t.leafDeep, cell * 0.95);
        fx.ring(x, y, cell * 0.1, cell * 1.6, t.leaf, cell * 0.05, 900);
        fx.ring(x, y, cell * 0.1, cell * 1.0, t.leaf, cell * 0.035, 620);
        fx.addFlash(0.1, t.leaf);
        fx.text(x, y - cell * 0.5, 'THE WAY DOWN', t.leaf, cell * 0.2, 1.2);
        break;
      }

      case 'descend': {
        // Era first: `descend` retunes the drone, and it should be retuned as
        // the thing the new era sounds like rather than the old one.
        if (eraAt(ev.depth).id !== this.chromeEra) this.syncChrome(ev.depth);
        sfx.descend(ev.depth);
        this.effects.clearStains();
        fx.addFlash(0.16, t.paper);

        break;
      }

      case 'death': {
        sfx.death();
        fx.addShake(this.size * 0.02);
        fx.addFreeze(180);
        fx.addFlash(0.34, t.blood);
        break;
      }
    }
  }
}
