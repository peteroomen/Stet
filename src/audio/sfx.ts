/**
 * All sound is synthesized at runtime — no samples, no network, no assets.
 *
 * The palette is built around the fiction: a nib on paper. Movement is a dry
 * scratch, a strike is a wet thud with a paper-tear transient, a kill is a crack
 * plus splash, and the floor drone is a bowed, detuned pair that drops a
 * semitone every two depths so the descent is audible before it is visible.
 *
 * ## Except that the fiction changes
 *
 * The moment the page becomes a typed one, "a nib on paper" is the wrong sound
 * for everything — so four of these branch on the era's hand and the drone
 * changes timbre with them. A brush is wet and a little slow; a typebar is dry,
 * hard, and arrives all at once, so the typed versions are shorter, higher and
 * carry a metallic ring the brushed ones have no reason to.
 *
 * Only four branch, deliberately: the step, the strike, the interrupt and the
 * spill. Pickups, the bell, death and the chrome blips stay put, because a
 * palette where nothing is constant stops being a palette.
 *
 * `npm run check:audio` fires every event in every era. It cannot tell you
 * whether any of it sounds good — only a person can — but it proves each node
 * graph builds and each envelope is legal, and an illegal one throws in the
 * middle of a turn rather than in a test.
 *
 * Everything is created lazily on the first user gesture, because browsers will
 * not let an AudioContext start otherwise.
 */

import type { Mark } from '../render/glyphs';

const MASTER = 0.5;

export class Sfx {
  /**
   * The era's instrument, pushed in by the runtime.
   *
   * The whole palette is built around one fiction — a nib on paper — and that
   * fiction is wrong the moment the page becomes a typed one. A brush is wet and
   * a little slow; a typebar is dry, hard, and arrives all at once. So the four
   * sounds that carry the most character branch on this, and the floor drone
   * changes timbre with them: an era you can hear before you look at it.
   *
   * Only four, deliberately. Pickups, the bell, death and the chrome blips are
   * shared, because a palette where NOTHING is constant stops being a palette.
   */
  hand: Mark = 'brush';
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  // Persistent floor drone.
  private droneGain: GainNode | null = null;
  private droneOscs: OscillatorNode[] = [];
  private droneFilter: BiquadFilterNode | null = null;

  private _muted = false;

  get muted(): boolean {
    return this._muted;
  }

  /** Safe to call on every gesture; only the first does anything. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = this._muted ? 0 : MASTER;
      this.master.connect(this.ctx.destination);
      this.noise = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this._muted = m;
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setTargetAtTime(m ? 0 : MASTER, this.ctx.currentTime, 0.04);
    }
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * 1.2);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  private get t(): number {
    return this.ctx?.currentTime ?? 0;
  }

  /** A noise burst through a swept filter — the workhorse for anything textural. */
  private burst(o: {
    at?: number;
    dur: number;
    type: BiquadFilterType;
    f0: number;
    f1: number;
    q: number;
    gain: number;
    attack?: number;
    curve?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noise) return;
    const t0 = this.t + (o.at ?? 0);

    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;

    const filt = ctx.createBiquadFilter();
    filt.type = o.type;
    filt.Q.value = o.q;
    filt.frequency.setValueAtTime(o.f0, t0);
    filt.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t0 + o.dur);

    const g = ctx.createGain();
    const a = o.attack ?? 0.003;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    src.connect(filt).connect(g).connect(this.master);
    src.start(t0);
    src.stop(t0 + o.dur + 0.02);
  }

  /** A pitched tone with an exponential sweep. */
  private tone(o: {
    at?: number;
    dur: number;
    type: OscillatorType;
    f0: number;
    f1?: number;
    gain: number;
    attack?: number;
    detune?: number;
    filter?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = this.t + (o.at ?? 0);

    const osc = ctx.createOscillator();
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + o.dur);
    }
    if (o.detune) osc.detune.value = o.detune;

    const g = ctx.createGain();
    const a = o.attack ?? 0.004;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    let node: AudioNode = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.filter;
      node = osc.connect(f);
    }
    node.connect(g).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.02);
  }

  // --- The palette -------------------------------------------------------

  /**
   * A step.
   *
   * Era I is a nib dragged across the grain — a short dry scratch that SWEEPS,
   * because a pen is still moving while it makes its mark. Era II is a key going
   * down: higher, harder, over before the sweep would have started, with the
   * mechanism's thunk under it. The difference is mostly duration, and that is
   * the honest difference between the two instruments.
   */
  step(): void {
    if (this.hand === 'type') {
      this.burst({ dur: 0.028, type: 'bandpass', f0: 3300, f1: 2100, q: 2.2, gain: 0.085, attack: 0.0008 });
      this.tone({ dur: 0.05, type: 'square', f0: 186, f1: 120, gain: 0.05, filter: 520 });
      return;
    }
    this.burst({ dur: 0.055, type: 'bandpass', f0: 2400, f1: 1100, q: 1.4, gain: 0.075 });
    this.tone({ dur: 0.04, type: 'triangle', f0: 220, f1: 150, gain: 0.03 });
  }

  /** Nose into a wall: dull, unrewarding, and deliberately not a mistake sound. */
  blocked(): void {
    this.burst({ dur: 0.07, type: 'lowpass', f0: 500, f1: 180, q: 0.7, gain: 0.06 });
  }

  /**
   * Landing a strike.
   *
   * `combo` raises the pitch of the transient so a ladder of swings is audibly a
   * ladder. `weight` is the same 0..1 figure the renderer derives from the blow
   * (see `strikeWeight`), and it drives body, length and bite — everything
   * visible about a stroke scales with it, and a sound that did not was the last
   * flat thing about hitting something.
   *
   * `broke: false` is the SHRUG, and it is a different sound rather than a
   * quieter one. A blow that lands and fails to stop what it hit is the most
   * surprising outcome in the game, and it used to be indistinguishable by ear
   * from one that worked.
   */
  strike(o: { combo: number; killed: boolean; weight: number; broke: boolean }): void {
    const c = Math.min(o.combo, 3);
    const w = Math.max(0, Math.min(1, o.weight));

    /*
     * Era II: a slug driven into a platen.
     *
     * The manuscript's strike is WET — a paper-tear transient over a sine body,
     * ink actually going down. A typebar has no ink to speak of and no give: it
     * is a hard slap, a short metallic ring off the slug, and a thud through the
     * roller behind it. Everything is faster, and the ring is the part that says
     * "metal" — take it out and this is just a quieter version of the brush.
     *
     * The SHRUG keeps its meaning and changes its cause: not a blow absorbed by
     * something too heavy, but a key that jammed before it reached the page.
     */
    if (this.hand === 'type') {
      if (!o.broke) {
        this.burst({ dur: 0.07, type: 'lowpass', f0: 700, f1: 190, q: 1.1, gain: 0.19, attack: 0.001 });
        this.tone({ dur: 0.1, type: 'square', f0: 128, f1: 74, gain: 0.2, filter: 420, attack: 0.003 });
        return;
      }
      // The slap.
      this.burst({
        dur: 0.035 + w * 0.03,
        type: 'highpass',
        f0: 5200,
        f1: 1900,
        q: 0.8,
        gain: 0.24 + w * 0.14,
        attack: 0.0006,
      });
      // The slug's own note — inharmonic and short, the way struck metal is.
      this.tone({
        dur: 0.13 + w * 0.12,
        type: 'sine',
        f0: 2050 + c * 170,
        gain: 0.05 + w * 0.05,
        attack: 0.001,
      });
      this.tone({
        dur: 0.06 + w * 0.04,
        type: 'square',
        f0: 330 + c * 44,
        f1: 150,
        gain: 0.13 + w * 0.09,
        filter: 1900,
      });
      // The platen taking it.
      this.tone({
        dur: 0.1 + w * 0.09,
        type: 'sine',
        f0: 96,
        f1: 54,
        gain: 0.22 + w * 0.14,
        attack: 0.002,
      });
      return;
    }

    if (!o.broke) {
      // Damped and dull: no bite, no tail, and a low knock underneath. This is a
      // stroke absorbed by something too heavy to care.
      this.burst({ dur: 0.09, type: 'lowpass', f0: 900, f1: 220, q: 0.9, gain: 0.2, attack: 0.001 });
      this.tone({ dur: 0.13, type: 'sine', f0: 110, f1: 62, gain: 0.26, attack: 0.003 });
      this.tone({ at: 0.02, dur: 0.1, type: 'triangle', f0: 88, f1: 60, gain: 0.1, filter: 400 });
      return;
    }

    this.tone({
      dur: 0.12 + w * 0.14,
      type: 'sine',
      f0: 190 + c * 26,
      f1: 58 - w * 12,
      gain: 0.28 + w * 0.16,
      attack: 0.002,
    });
    this.tone({
      dur: 0.09 + w * 0.06,
      type: 'square',
      f0: 150 + c * 30,
      f1: 70,
      gain: 0.07 + w * 0.07,
      filter: 900 + w * 500,
    });
    // Wet transient — the ink actually going down.
    this.burst({
      dur: 0.1 + w * 0.06,
      type: 'bandpass',
      f0: 1500 + c * 500 + w * 900,
      f1: 420,
      q: 0.9,
      gain: 0.14 + w * 0.12,
      attack: 0.001,
    });
    if (!o.killed && c > 0) {
      this.tone({ at: 0.035, dur: 0.07, type: 'triangle', f0: 520 + c * 120, gain: 0.05 });
    }
  }

  /**
   * Holding your ground.
   *
   * Nothing moved, so it cannot be a step — but silence reads as a dropped
   * input, and it was borrowing the menu blip, which reads as chrome rather than
   * as a turn. A slow breath in: air, no transient, and a low settle under it.
   */
  wait(): void {
    this.burst({ dur: 0.26, type: 'bandpass', f0: 320, f1: 900, q: 0.8, gain: 0.055, attack: 0.09 });
    this.tone({ dur: 0.3, type: 'sine', f0: 98, f1: 74, gain: 0.075, attack: 0.05 });
  }

  /** Something dies: a dry crack, then the splash. */
  kill(): void {
    this.burst({
      dur: 0.055,
      type: 'highpass',
      f0: 3600,
      f1: 900,
      q: 0.8,
      gain: 0.3,
      attack: 0.0008,
    });
    this.tone({ dur: 0.26, type: 'sine', f0: 130, f1: 42, gain: 0.3, attack: 0.002 });
    this.burst({ at: 0.02, dur: 0.3, type: 'bandpass', f0: 900, f1: 240, q: 0.6, gain: 0.12 });
  }

  /**
   * Taking a hit. When exposed it is a different sound, not just a louder one —
   * a detuned second voice and a torn-paper tail, so the doubling is legible
   * with your eyes shut.
   */
  hurt(exposed: boolean): void {
    const g = exposed ? 0.4 : 0.24;
    this.tone({ dur: 0.3, type: 'square', f0: 150, f1: 58, gain: g, filter: 620, attack: 0.002 });
    if (exposed) {
      this.tone({
        dur: 0.34,
        type: 'sawtooth',
        f0: 159,
        f1: 61,
        gain: 0.16,
        filter: 500,
        detune: 22,
      });
      this.burst({ at: 0.01, dur: 0.34, type: 'bandpass', f0: 2600, f1: 300, q: 0.5, gain: 0.2 });
    } else {
      this.burst({ dur: 0.14, type: 'bandpass', f0: 1400, f1: 400, q: 0.7, gain: 0.09 });
    }
  }

  /** A charger committing to its lunge — a low intake of breath. */
  wind(): void {
    this.burst({ dur: 0.28, type: 'bandpass', f0: 260, f1: 900, q: 2.2, gain: 0.07, attack: 0.09 });
  }

  /** A charger actually going. */
  lunge(): void {
    this.burst({ dur: 0.16, type: 'bandpass', f0: 1800, f1: 300, q: 0.8, gain: 0.13 });
    this.tone({ dur: 0.14, type: 'sawtooth', f0: 200, f1: 90, gain: 0.08, filter: 700 });
  }

  /**
   * An interrupt. A hard, bright clack that cuts across the strike sound —
   * deliberately the most percussive thing in the palette, because landing one
   * is the best thing you can do in a turn and it should feel like it.
   */
  stagger(interrupted: boolean): void {
    /*
     * Era II: the keys jam.
     *
     * Same job — the most percussive thing in the palette, because landing one is
     * the best thing you can do in a turn. Different cause: a rattle of typebars
     * fouling each other rather than a single clean crack.
     */
    if (this.hand === 'type') {
      const g = interrupted ? 0.22 : 0.11;
      for (let i = 0; i < (interrupted ? 3 : 2); i++) {
        this.burst({
          at: i * 0.026,
          dur: 0.03,
          type: 'bandpass',
          f0: 4200 - i * 700,
          f1: 1900,
          q: 2.4,
          gain: g * (1 - i * 0.28),
          attack: 0.0006,
        });
      }
      if (interrupted) {
        this.tone({ at: 0.05, dur: 0.11, type: 'square', f0: 300, f1: 128, gain: 0.09, filter: 1400 });
      }
      return;
    }
    this.burst({
      dur: 0.06,
      type: 'bandpass',
      f0: 4200,
      f1: 1400,
      q: 1.1,
      gain: interrupted ? 0.28 : 0.14,
      attack: 0.0006,
    });
    this.tone({ dur: 0.09, type: 'square', f0: 780, f1: 300, gain: 0.08, filter: 2400 });
    if (interrupted) {
      // The enemy's own committed swing, cut off mid-air.
      this.tone({ at: 0.02, dur: 0.13, type: 'triangle', f0: 420, f1: 140, gain: 0.1 });
    }
  }

  /** The page filling — ink welling up and something climbing out of it. */
  spill(): void {
    /*
     * Era II: the machine types by itself.
     *
     * A run of keystrokes nobody asked for, quickening — which is exactly what
     * the spill IS, and far more alarming on a typed page than a wet gurgle.
     */
    if (this.hand === 'type') {
      for (let i = 0; i < 5; i++) {
        this.burst({
          at: i * (0.055 - i * 0.006),
          dur: 0.03,
          type: 'bandpass',
          f0: 3100 + i * 180,
          f1: 2000,
          q: 2.2,
          gain: 0.075 + i * 0.012,
          attack: 0.0008,
        });
      }
      this.tone({ at: 0.02, dur: 0.28, type: 'square', f0: 150, f1: 88, gain: 0.1, filter: 460, attack: 0.05 });
      return;
    }
    this.burst({ dur: 0.34, type: 'lowpass', f0: 220, f1: 620, q: 1.6, gain: 0.15, attack: 0.12 });
    this.tone({ dur: 0.3, type: 'sine', f0: 70, f1: 130, gain: 0.16, attack: 0.08 });
    this.tone({ at: 0.22, dur: 0.14, type: 'triangle', f0: 340, f1: 190, gain: 0.09 });
  }

  /**
   * The same well, with nowhere left to rise but through you.
   *
   * Deliberately the spill's own voice rather than the hurt sting: the sweep
   * runs DOWN instead of up and there is no impact transient, because nothing
   * struck you — the page simply closed over. It has to be recognisable as the
   * spill or the player learns it as a random tick of damage.
   */
  drown(): void {
    this.burst({ dur: 0.42, type: 'lowpass', f0: 520, f1: 140, q: 1.4, gain: 0.17, attack: 0.14 });
    this.tone({ dur: 0.4, type: 'sine', f0: 120, f1: 52, gain: 0.18, attack: 0.1 });
  }

  /**
   * The carriage bell. The one sound in the game that is good news and bad news
   * at once — you survived a pass, and the next one is wider.
   *
   * A struck bell rather than a tone: two inharmonic partials over a fundamental,
   * because a harmonic stack reads as a chime and a bell is not a chime. Long
   * decay, so it rings over the top of whatever else the turn is doing.
   */
  bell(): void {
    this.tone({ dur: 1.1, type: 'sine', f0: 1180, gain: 0.13, attack: 0.002 });
    this.tone({ at: 0.004, dur: 0.9, type: 'sine', f0: 1767, gain: 0.07, attack: 0.002 });
    this.tone({ at: 0.008, dur: 0.55, type: 'sine', f0: 2840, gain: 0.045, attack: 0.002 });
    this.tone({ at: 0, dur: 0.09, type: 'square', f0: 3400, f1: 900, gain: 0.05 });
  }

  pickup(): void {
    this.tone({ dur: 0.1, type: 'triangle', f0: 660, f1: 990, gain: 0.16 });
    this.tone({ at: 0.06, dur: 0.16, type: 'sine', f0: 1320, gain: 0.1 });
  }

  /** A nib: worth its own fanfare, because it changes the run. */
  upgrade(): void {
    this.tone({ dur: 0.16, type: 'triangle', f0: 523, gain: 0.16 });
    this.tone({ at: 0.08, dur: 0.18, type: 'triangle', f0: 784, gain: 0.15 });
    this.tone({ at: 0.16, dur: 0.4, type: 'sine', f0: 1046, gain: 0.14 });
  }

  /** The stairs unsealing — a bell over the empty floor. */
  unseal(): void {
    this.tone({ dur: 0.7, type: 'sine', f0: 880, gain: 0.16, attack: 0.006 });
    this.tone({ at: 0.005, dur: 0.9, type: 'sine', f0: 1320, gain: 0.09 });
    this.tone({ at: 0.01, dur: 1.1, type: 'sine', f0: 1760, gain: 0.045 });
    this.burst({ dur: 0.5, type: 'highpass', f0: 2000, f1: 6000, q: 0.5, gain: 0.05, attack: 0.1 });
  }

  /** Descending a floor: a page turning, and the room getting bigger. */
  descend(depth: number): void {
    this.burst({ dur: 0.42, type: 'bandpass', f0: 500, f1: 3200, q: 0.6, gain: 0.16, attack: 0.05 });
    this.burst({ at: 0.2, dur: 0.4, type: 'bandpass', f0: 2600, f1: 380, q: 0.5, gain: 0.13 });
    this.tone({ at: 0.1, dur: 0.7, type: 'sine', f0: 160, f1: 55, gain: 0.2 });
    this.setDroneDepth(depth);
  }

  /** The run ending. Long, low, and it does not resolve. */
  death(): void {
    this.tone({ dur: 1.9, type: 'sawtooth', f0: 120, f1: 34, gain: 0.24, filter: 420 });
    this.tone({ at: 0.02, dur: 2.0, type: 'sawtooth', f0: 121.4, f1: 34.6, gain: 0.2, filter: 380 });
    this.tone({ at: 0.06, dur: 1.2, type: 'sine', f0: 300, f1: 90, gain: 0.1 });
    this.burst({ dur: 1.2, type: 'lowpass', f0: 900, f1: 120, q: 0.5, gain: 0.1, attack: 0.02 });
    this.stopDrone(1.4);
  }

  ui(): void {
    this.tone({ dur: 0.05, type: 'triangle', f0: 880, gain: 0.07 });
  }

  // --- Floor drone --------------------------------------------------------

  /** Two detuned saws under a low lowpass — felt more than heard. */
  startDrone(depth: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.droneGain) return;

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 260;
    this.droneFilter.Q.value = 0.6;

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0.0001;
    this.droneGain.gain.setTargetAtTime(0.05, this.t, 1.4);

    for (const detune of [-7, 6]) {
      const o = ctx.createOscillator();
      // A bowed pair under a manuscript; a motor under a machine.
      o.type = this.hand === 'type' ? 'square' : 'sawtooth';
      o.detune.value = detune;
      o.frequency.value = this.droneHz(depth);
      o.connect(this.droneFilter);
      o.start();
      this.droneOscs.push(o);
    }
    this.droneFilter.connect(this.droneGain).connect(this.master);
  }

  private droneHz(depth: number): number {
    // Down a semitone every two floors — the descent, made audible.
    return 55 * Math.pow(2, -Math.floor((depth - 1) / 2) / 12);
  }

  setDroneDepth(depth: number): void {
    const hz = this.droneHz(depth);
    for (const o of this.droneOscs) o.frequency.setTargetAtTime(hz, this.t, 0.6);
  }

  /**
   * Change the drone's timbre when the era does.
   *
   * The oscillators outlive a descent, so this is set live rather than at
   * `startDrone` — otherwise the floor under era II would keep the manuscript's
   * bowed pair for the whole run, which is the one sound you never stop hearing.
   */
  setDroneHand(): void {
    const type: OscillatorType = this.hand === 'type' ? 'square' : 'sawtooth';
    for (const o of this.droneOscs) o.type = type;
    // A machine hums tighter than a bowed string sings.
    if (this.droneFilter) {
      this.droneFilter.frequency.setTargetAtTime(this.hand === 'type' ? 180 : 260, this.t, 0.8);
    }
  }

  stopDrone(fade = 0.6): void {
    if (!this.droneGain) return;
    const g = this.droneGain;
    const oscs = this.droneOscs;
    g.gain.setTargetAtTime(0.0001, this.t, fade / 3);
    const stopAt = this.t + fade + 0.4;
    for (const o of oscs) o.stop(stopAt);
    this.droneGain = null;
    this.droneOscs = [];
    this.droneFilter = null;
  }
}

export const sfx = new Sfx();
