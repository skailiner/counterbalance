import {
  SCALE,
  micro,
  ready,
  validateSettings,
  validateStudy,
  sampleAllocation,
  type Study,
  type Settings,
} from './study.ts';
export const EXACT_LIMIT = 50000;
export const MC_DRAWS = 10000;
export type Fraction = {
  numerator: string;
  denominator: string;
  value: number;
};
type Rational = { n: bigint; d: bigint };
export type Result = {
  engine: 'counterbalance-rational-v1';
  settings: Settings;
  method: 'enumeration' | 'monte-carlo';
  legalAllocations: string;
  evaluated: number;
  extreme: number;
  p: Fraction;
  estimate: Fraction;
  adjustedObserved: Fraction;
  interval: {
    lower: Fraction | null;
    upper: Fraction | null;
    rank: number;
    denominator: number;
    confidence: number;
  };
  blocks: {
    name: string;
    n: number;
    nA: number;
    nB: number;
    meanA: Fraction;
    meanB: Fraction;
    difference: Fraction;
    weight: Fraction;
  }[];
  histogram: { min: number; max: number; counts: number[] };
  simulation: { generator: string; seed: number; draws: number } | null;
};
const abs = (v: bigint) => (v < 0n ? -v : v);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}
function rational(n: bigint, d: bigint): Rational {
  if (d === 0n) throw new Error('Zero rational denominator.');
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}
const compare = (a: Rational, b: Rational) => {
  const v = a.n * b.d - b.n * a.d;
  return v < 0n ? -1 : v > 0n ? 1 : 0;
};
export function fraction(n: bigint, d: bigint): Fraction {
  const r = rational(n, d);
  return {
    numerator: r.n.toString(),
    denominator: r.d.toString(),
    value: Number(r.n) / Number(r.d),
  };
}
export function choose(n: number, k: number): bigint {
  let x = 1n;
  for (let i = 1; i <= Math.min(k, n - k); i++)
    x = (x * BigInt(n - i + 1)) / BigInt(i);
  return x;
}
export function allocationCount(study: Study): bigint {
  return study.blocks.reduce(
    (p, b) =>
      p *
      choose(study.units.filter((u) => u.block === b.name).length, b.bCount),
    1n,
  );
}
// PCG-XSH-RR 64/32. Stream selector 54 means increment 109. See METHOD.md.
export function pcg32(seed: number): () => number {
  const mask = (1n << 64n) - 1n;
  let state = 0n;
  const next = () => {
    const old = state;
    state = (old * 6364136223846793005n + 109n) & mask;
    const x = Number((((old >> 18n) ^ old) >> 27n) & 0xffffffffn),
      r = Number(old >> 59n);
    return ((x >>> r) | (x << (-r & 31))) >>> 0;
  };
  next();
  state = (state + BigInt(seed)) & mask;
  next();
  return next;
}
function* combinations(
  items: number[],
  k: number,
  start = 0,
  prefix: number[] = [],
): Generator<number[]> {
  if (k === 0) {
    yield prefix;
    return;
  }
  for (let i = start; i <= items.length - k; i++)
    yield* combinations(items, k - 1, i + 1, [...prefix, items[i]]);
}
export function* enumerate(study: Study): Generator<boolean[]> {
  const groups = study.blocks.map((b) => ({
    indices: study.units.flatMap((u, i) => (u.block === b.name ? [i] : [])),
    count: b.bCount,
  }));
  const a = study.units.map(() => false);
  function* walk(index: number): Generator<boolean[]> {
    if (index === groups.length) {
      yield [...a];
      return;
    }
    const g = groups[index];
    for (const selected of combinations(g.indices, g.count)) {
      selected.forEach((i) => {
        a[i] = true;
      });
      yield* walk(index + 1);
      selected.forEach((i) => {
        a[i] = false;
      });
    }
  }
  yield* walk(0);
}
export function analyze(
  studyInput: unknown,
  settingsInput: unknown,
  progress?: (done: number, total: number) => void,
): Result {
  const study = validateStudy(studyInput),
    settings = validateSettings(settingsInput),
    unready = ready(study);
  if (unready) throw new Error(unready);
  const y = study.units.map((u) => micro(u.outcome!)),
    z = study.units.map((u) => u.arm === 'B'),
    N = BigInt(y.length);
  const groups = study.blocks.map((b) => ({
    name: b.name,
    m: b.bCount,
    indices: study.units.flatMap((u, i) => (u.block === b.name ? [i] : [])),
  }));
  let L = 1n;
  for (const g of groups) {
    const d = BigInt(g.m * (g.indices.length - g.m));
    L = (L / gcd(L, d)) * d;
  }
  const D = N * L;
  const calcGroups = groups.map((g) => ({
    ...g,
    n: BigInt(g.indices.length),
    mBig: BigInt(g.m),
    q: (BigInt(g.indices.length) * L) / BigInt(g.m * (g.indices.length - g.m)),
    sum: g.indices.reduce((s, i) => s + y[i], 0n),
  }));
  function coefficients(a: boolean[]): { a: bigint; b: bigint } {
    let A = 0n,
      B = 0n;
    for (const g of calcGroups) {
      let sumB = 0n,
        overlap = 0n;
      for (const i of g.indices)
        if (a[i]) {
          sumB += y[i];
          if (z[i]) overlap++;
        }
      A += g.q * (g.n * sumB - g.mBig * g.sum);
      B += g.q * (g.n * overlap - g.mBig * g.mBig);
    }
    return { a: A, b: B };
  }
  const t = coefficients(z).a,
    tau = micro(settings.nullEffect),
    observed = t - D * tau,
    total = allocationCount(study),
    exact = total <= BigInt(EXACT_LIMIT);
  const count = exact ? Number(total) : MC_DRAWS,
    rng = pcg32(settings.seed),
    iterator = exact ? enumerate(study) : null;
  const lows: (Rational | null)[] = [],
    highs: (Rational | null)[] = [],
    values: number[] = [];
  let extreme = 0;
  for (let j = 0; j < count; j++) {
    const allocation = iterator
      ? iterator.next().value!
      : sampleAllocation(study, rng);
    const c = coefficients(allocation),
      v = c.a - c.b * tau;
    if (abs(v) >= abs(observed)) extreme++;
    values.push(Number(v) / Number(D * SCALE));
    if (c.b === D || c.b === -D) {
      if (c.a !== (c.b === D ? t : -t))
        throw new Error('Universal-allocation invariant failed.');
      lows.push(null);
      highs.push(null);
    } else {
      if (abs(c.b) > D)
        throw new Error('Assignment-coefficient invariant failed.');
      const r1 = rational(t - c.a, SCALE * (D - c.b)),
        r2 = rational(t + c.a, SCALE * (D + c.b));
      const ordered = compare(r1, r2) <= 0;
      lows.push(ordered ? r1 : r2);
      highs.push(ordered ? r2 : r1);
    }
    if (j % 250 === 0) progress?.(j, count);
  }
  // The added observed allocation supplies one universal interval and one extreme count.
  if (!exact) {
    lows.push(null);
    highs.push(null);
  }
  const K = count + (exact ? 0 : 1),
    rank = Math.floor(((100 - settings.confidence) * K) / 100) + 1;
  lows.sort((a, b) =>
    a === null ? (b === null ? 0 : -1) : b === null ? 1 : compare(a, b),
  );
  highs.sort((a, b) =>
    a === null ? (b === null ? 0 : -1) : b === null ? 1 : -compare(a, b),
  );
  const lo = lows[rank - 1],
    hi = highs[rank - 1];
  let min = values[0],
    max = values[0];
  for (const v of values) {
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  const counts = Array.from({ length: min === max ? 1 : 32 }, () => 0);
  for (const v of values) {
    const i =
      min === max
        ? 0
        : Math.min(31, Math.floor(((v - min) / (max - min)) * 32));
    counts[i]++;
  }
  const blocks = groups.map((g) => {
    const A = g.indices.filter((i) => !z[i]),
      B = g.indices.filter((i) => z[i]),
      a = A.reduce((s, i) => s + y[i], 0n),
      b = B.reduce((s, i) => s + y[i], 0n);
    return {
      name: g.name,
      n: g.indices.length,
      nA: A.length,
      nB: B.length,
      meanA: fraction(a, BigInt(A.length) * SCALE),
      meanB: fraction(b, BigInt(B.length) * SCALE),
      difference: fraction(
        b * BigInt(A.length) - a * BigInt(B.length),
        BigInt(A.length * B.length) * SCALE,
      ),
      weight: fraction(BigInt(g.indices.length), N),
    };
  });
  progress?.(count, count);
  return {
    engine: 'counterbalance-rational-v1',
    settings,
    method: exact ? 'enumeration' : 'monte-carlo',
    legalAllocations: total.toString(),
    evaluated: count,
    extreme,
    p: fraction(BigInt(extreme + (exact ? 0 : 1)), BigInt(K)),
    estimate: fraction(t, D * SCALE),
    adjustedObserved: fraction(observed, D * SCALE),
    interval: {
      lower: lo ? fraction(lo.n, lo.d) : null,
      upper: hi ? fraction(hi.n, hi.d) : null,
      rank,
      denominator: K,
      confidence: settings.confidence,
    },
    blocks,
    histogram: { min, max, counts },
    simulation: exact
      ? null
      : {
          generator:
            'PCG-XSH-RR 64/32; selector=54; increment=109; upper-tail rejection; Fisher-Yates v1',
          seed: settings.seed,
          draws: MC_DRAWS,
        },
  };
}
