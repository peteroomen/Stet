/**
 * Seeded RNG (mulberry32). Deterministic on purpose: the whole engine is a pure
 * function of (state, input), which makes floors reproducible from a seed and
 * makes the tests in engine.test.ts able to assert exact outcomes.
 *
 * The state is a single uint32 carried on GameState, so cloning the state
 * clones the random stream with it.
 */
export class Rng {
  constructor(public s: number) {
    this.s = s >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  /** Integer in [lo, hi] inclusive. */
  range(lo: number, hi: number): number {
    return lo + this.int(hi - lo + 1);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }

  /** In-place Fisher-Yates. Returns the same array for convenience. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

export const randomSeed = (): number => (Math.random() * 0x100000000) >>> 0;
