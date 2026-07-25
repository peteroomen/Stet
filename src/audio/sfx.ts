/**
 * All sound is synthesized at runtime — no samples, no network, no assets.
 *
 * The palette is built around the fiction: a nib on paper. Movement is a dry
 * scratch, a strike is a wet thud with a paper-tear transient, a kill is a crack
 * plus splash, and the floor drone is a bowed, detuned pair that drops a
 * semitone every two depths so the descent is audible before it is visible.
 *
 * Everything is created lazily on the first user gesture, because browsers will
 * not let an AudioContext start otherwise.
 */

const MASTER = 0.5;

export class Sfx {
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

  /** A step: a short dry nib scratch across the grain. */
  step(): void {
    this.burst({ dur: 0.055, type: 'bandpass', f0: 2400, f1: 1100, q: 1.4, gain: 0.075 });
    this.tone({ dur: 0.04, type: 'triangle', f0: 220, f1: 150, gain: 0.03 });
  }

  /** Nose into a wall: dull, unrewarding, and deliberately not a mistake sound. */
  blocked(): void {
    this.burst({ dur: 0.07, type: 'lowpass', f0: 500, f1: 180, q: 0.7, gain: 0.06 });
  }

  /**
   * Landing a strike. `combo` raises the pitch of the transient so a ladder of
   * swings is audibly a ladder — the fourth hit sounds like it is worth more.
   */
  strike(combo: number, killed: boolean): void {
    const c = Math.min(combo, 3);
    this.tone({ dur: 0.14, type: 'sine', f0: 190 + c * 26, f1: 58, gain: 0.34, attack: 0.002 });
    this.tone({
      dur: 0.09,
      type: 'square',
      f0: 150 + c * 30,
      f1: 70,
      gain: 0.09,
      filter: 900,
    });
    // Wet transient — the ink actually going down.
    this.burst({
      dur: 0.1,
      type: 'bandpass',
      f0: 1500 + c * 500,
      f1: 420,
      q: 0.9,
      gain: 0.16,
      attack: 0.001,
    });
    if (!killed && c > 0) {
      this.tone({ at: 0.035, dur: 0.07, type: 'triangle', f0: 520 + c * 120, gain: 0.05 });
    }
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

  /** The page filling — ink welling up and something climbing out of it. */
  spill(): void {
    this.burst({ dur: 0.34, type: 'lowpass', f0: 220, f1: 620, q: 1.6, gain: 0.15, attack: 0.12 });
    this.tone({ dur: 0.3, type: 'sine', f0: 70, f1: 130, gain: 0.16, attack: 0.08 });
    this.tone({ at: 0.22, dur: 0.14, type: 'triangle', f0: 340, f1: 190, gain: 0.09 });
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
      o.type = 'sawtooth';
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
