/** Small seeded PRNG (mulberry32) so the court plays out the same way in tests. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, maxInclusive: number): number {
    return Math.floor(this.range(min, maxInclusive + 1));
  }
  pick<T>(list: readonly T[]): T {
    return list[Math.floor(this.next() * list.length)]!;
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  weighted<T>(list: readonly T[], weight: (item: T) => number): T {
    const total = list.reduce((n, item) => n + Math.max(0, weight(item)), 0);
    let r = this.next() * total;
    for (const item of list) {
      r -= Math.max(0, weight(item));
      if (r <= 0) return item;
    }
    return list[list.length - 1]!;
  }
}
