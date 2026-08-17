/**
 * Seeded PRNG. Spec §7.2: "Runs must be exactly reproducible — a judge asking
 * 'run that again' and getting a different answer is fatal. Use a seeded
 * xorshift128+ or PCG32, not Math.random()." Validation: VAL-15.
 */

export class Rng {
  private s0: number
  private s1: number

  constructor(seed = 1) {
    // splitmix32 to expand the seed into two non-zero words
    let x = (seed >>> 0) || 0x9e3779b9
    const next = () => {
      x = (x + 0x9e3779b9) >>> 0
      let z = x
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
      return (z ^ (z >>> 15)) >>> 0
    }
    this.s0 = next() || 1
    this.s1 = next() || 2
  }

  /** xorshift128 -> uniform on [0,1) */
  uniform(): number {
    let s1 = this.s0
    const s0 = this.s1
    this.s0 = s0
    s1 ^= s1 << 23
    s1 ^= s1 >>> 17
    s1 ^= s0
    s1 ^= s0 >>> 26
    this.s1 = s1 >>> 0
    return ((this.s0 + this.s1) >>> 0) / 4294967296
  }

  /** Box–Muller standard normal. */
  normal(): number {
    let u = 0
    let v = 0
    while (u === 0) u = this.uniform()
    while (v === 0) v = this.uniform()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }

  /**
   * Log-normal multiplier with median 1 and the given coefficient of variation.
   * omega = sqrt(ln(1 + CV^2)) — spec §7.1. Keeps values positive and gives the
   * right right-skew, which is why Cmax/AUC histograms must come out skewed
   * (VAL-P06).
   */
  logNormalFactor(cvPercent: number): number {
    if (cvPercent <= 0) return 1
    const cv = cvPercent / 100
    const omega = Math.sqrt(Math.log(1 + cv * cv))
    return Math.exp(omega * this.normal())
  }

  /** Log-uniform on [lo, hi] — required for losartan's w_m (spec §3.4a). */
  logUniform(lo: number, hi: number): number {
    return lo * Math.pow(hi / lo, this.uniform())
  }

  /** Draw from a categorical distribution given cumulative-friendly weights. */
  categorical<T extends string>(weights: Record<T, number>): T {
    const keys = Object.keys(weights) as T[]
    let total = 0
    for (const k of keys) total += weights[k]
    let u = this.uniform() * total
    for (const k of keys) {
      u -= weights[k]
      if (u <= 0) return k
    }
    return keys[keys.length - 1]
  }
}

/**
 * Correlated pair via a 2x2 Cholesky factor. Spec §7.1: CL and Vd share
 * rho ~ 0.3 in most published models; drawing them independently generates
 * subjects with a huge Vd and a tiny CL, i.e. half-lives of days (VAL-P07).
 */
export function correlatedPair(rng: Rng, rho: number): [number, number] {
  const z1 = rng.normal()
  const z2 = rng.normal()
  return [z1, rho * z1 + Math.sqrt(1 - rho * rho) * z2]
}
