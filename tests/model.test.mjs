import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  referenceStudy,
  validateStudy,
  validateSettings,
  decimal,
  allocate,
  resetRoster,
  bounded,
  ready,
} from '../lib/study.ts';
import {
  analyze,
  enumerate,
  allocationCount,
  pcg32,
  choose,
} from '../lib/inference.ts';
import {
  parseCsv,
  csv,
  studyJson,
  exportStudy,
  rosterCsv,
  outcomesCsv,
  allocationCsv,
  importRoster,
  importOutcomes,
  importExisting,
  boundedText,
} from '../lib/files.ts';
import { AnalysisRunner } from '../lib/runner.ts';
const settings = { nullEffect: '0', confidence: 95, seed: 104729 };
function fixture(sizes, counts, values) {
  const s = referenceStudy();
  s.blocks = sizes.map((n, b) => ({ name: 'Block' + b, bCount: counts[b] }));
  let offset = 0;
  s.units = sizes.flatMap((n, b) =>
    Array.from({ length: n }, (_, i) => ({
      id: 'U' + offset,
      block: 'Block' + b,
      arm: i < counts[b] ? 'B' : 'A',
      outcome: String(values[offset++]),
    })),
  );
  s.assignment = { kind: 'imported', algorithm: 'fy-u32-v1', words: [] };
  return validateStudy(s);
}
const frac = (f) => Number(f.numerator) / Number(f.denominator);
test('fixed decimals preserve zeros, reject coercion and enforce precision and bounds', () => {
  assert.equal(decimal('-0.000000'), '0');
  assert.equal(decimal('1.230000'), '1.23');
  assert.equal(decimal('-1000000'), '-1000000');
  for (const v of [
    '',
    0,
    null,
    {},
    new String('2'),
    '1e2',
    '+1',
    '.5',
    '1.',
    '01',
    ' 1',
    '1.0000001',
    '1000000.000001',
    'NaN',
    'Infinity',
  ])
    assert.throws(() => decimal(v));
  for (const v of [
    { ...settings, seed: '1' },
    { ...settings, seed: -1 },
    { ...settings, confidence: '95' },
    { ...settings, nullEffect: 0 },
    { ...settings, extra: 1 },
  ])
    assert.throws(() => validateSettings(v));
});
test('strict study schema rejects holes, partial arms, wrong counts, unknown fields and missing blocks', () => {
  const bad = [];
  let s = referenceStudy();
  s.units.length++;
  bad.push(s);
  s = referenceStudy();
  s.blocks.length++;
  bad.push(s);
  s = referenceStudy();
  s.units[0].arm = null;
  bad.push(s);
  s = referenceStudy();
  s.units[0].id = s.units[1].id;
  bad.push(s);
  s = referenceStudy();
  s.blocks[0].bCount = 3;
  bad.push(s);
  s = referenceStudy();
  s.units[0].block = 'Elsewhere';
  bad.push(s);
  s = referenceStudy();
  s.extra = true;
  bad.push(s);
  s = referenceStudy();
  s.assignment.words = [1];
  bad.push(s);
  s = referenceStudy();
  s.units[0].id = '=SUM(A1)';
  bad.push(s);
  s = referenceStudy();
  s.blocks[0].name = '@bad';
  bad.push(s);
  for (const value of bad) assert.throws(() => validateStudy(value));
});
test('CSV quoting, BOM, CRLF, strict headers and bounded files', () => {
  const rows = [
    ['U1', 'Block, one'],
    ['U2', 'Block, one'],
  ];
  assert.deepEqual(
    parseCsv('\uFEFF' + csv(['id', 'block'], rows), ['id', 'block']),
    rows,
  );
  for (const value of [
    'id,block\nU1,"unclosed\nU2,b',
    'id,block\nU1,"b"x\nU2,b',
    'id,block\nU1,b\n\nU2,b',
    'block,id\nb,U1\nb,U2',
    'id,block\nU1,b,extra\nU2,b',
    'id,block\nU1,ba"d\nU2,b',
  ])
    assert.throws(() => parseCsv(value, ['id', 'block']));
  assert.throws(() => boundedText('é'.repeat(131073)));
  assert.throws(() => boundedText('a\0b'));
});
test('all portable files roundtrip; imported assignment remains unverified', () => {
  const s = referenceStudy();
  assert.deepEqual(studyJson(exportStudy(s)), s);
  const imported = importExisting(allocationCsv(s), s);
  assert.equal(imported.assignment.kind, 'imported');
  assert.deepEqual(imported.units, s.units);
  const roster = importRoster(rosterCsv(s), s);
  assert.equal(roster.assignment.kind, 'none');
  assert.ok(roster.units.every((u) => u.arm === null && u.outcome === null));
  assert.throws(() => studyJson('{"version":999}'));
  assert.throws(() => studyJson('{oops'));
});
test('exact-ID outcomes: reorder accepted, missing values retained, deletions and duplicates rejected', () => {
  const s = referenceStudy(),
    rows = s.units.map((u) => [u.id, u.outcome]).reverse();
  rows[0][1] = '';
  const result = importOutcomes(csv(['id', 'outcome'], rows), s);
  assert.equal(result.units.at(-1).outcome, null);
  assert.match(ready(result), /missing/);
  assert.throws(() => analyze(result, settings));
  assert.deepEqual(s, referenceStudy());
  assert.throws(() => importOutcomes(csv(['id', 'outcome'], rows.slice(1)), s));
  rows[0][0] = rows[1][0];
  assert.throws(() => importOutcomes(csv(['id', 'outcome'], rows), s));
  assert.deepEqual(importOutcomes(outcomesCsv(s), s), s);
});
test('rejection sampling consumes rejected words and supports the complete u32 range', () => {
  const words = [4294967295, 5];
  assert.equal(
    bounded(() => words.shift(), 3),
    2,
  );
  assert.equal(words.length, 0);
  assert.equal(
    bounded(() => 4294967295, 4294967296),
    4294967295,
  );
  assert.throws(() => bounded(() => -1, 3));
  assert.throws(() => bounded(() => 4294967295, 3));
});
test('generated allocation replays exact consumed words; no reassignment without reset', () => {
  const roster = resetRoster(referenceStudy()),
    rng = pcg32(42),
    s = allocate(roster, rng);
  assert.deepEqual(validateStudy(s), s);
  assert.ok(s.units.every((u) => u.outcome === null));
  assert.equal(s.assignment.words.length, 9);
  for (const b of s.blocks)
    assert.equal(
      s.units.filter((u) => u.block === b.name && u.arm === 'B').length,
      b.bCount,
    );
  assert.throws(() => allocate(s, rng));
  const bad = structuredClone(s);
  bad.assignment.words.push(1);
  assert.throws(() => validateStudy(bad));
  const sparse = structuredClone(s);
  Reflect.deleteProperty(sparse.assignment.words, 0);
  assert.throws(() => validateStudy(sparse));
  assert.deepEqual(roster, resetRoster(referenceStudy()));
});
test('PCG32 matches official seed42 stream54 vector; combinatorics are exact', () => {
  const rng = pcg32(42);
  assert.deepEqual(
    Array.from({ length: 6 }, () => rng().toString(16)),
    ['a15c02b7', '7b47f409', 'ba1d3330', '83d2f293', 'bfa4784b', 'cbed606e'],
  );
  assert.equal(
    choose(200, 100),
    90548514656103281165404177077484163874504589675413336841320n,
  );
  assert.equal(allocationCount(referenceStudy()), 216n);
});
test('asymmetric absolute-tail oracle is 1/3, not a doubled one-tail result', () => {
  const r = analyze(fixture([3], [1], [1, 0, 0]), settings);
  assert.equal(frac(r.estimate), 1);
  assert.equal(r.p.numerator, '1');
  assert.equal(r.p.denominator, '3');
  assert.equal(r.evaluated, 3);
});
test('six paired effects1..6 give exact closed95% interval[1,6]', () => {
  const s = fixture(
    Array(6).fill(2),
    Array(6).fill(1),
    Array.from({ length: 6 }, (_, i) => [i + 1, 0]).flat(),
  );
  const r = analyze(s, settings);
  assert.equal(frac(r.estimate), 3.5);
  assert.equal(frac(r.interval.lower), 1);
  assert.equal(frac(r.interval.upper), 6);
  for (const tau of ['1', '6'])
    assert.ok(frac(analyze(s, { ...settings, nullEffect: tau }).p) > 0.05);
  for (const tau of ['0.999999', '6.000001'])
    assert.ok(frac(analyze(s, { ...settings, nullEffect: tau }).p) <= 0.05);
  const five = fixture(
    Array(5).fill(2),
    Array(5).fill(1),
    Array.from({ length: 5 }, (_, i) => [i + 1, 0]).flat(),
  );
  const q = analyze(five, settings);
  assert.equal(q.interval.lower, null);
  assert.equal(q.interval.upper, null);
});
test('all-zero outcomes are not a universal p=1 shortcut', () => {
  const s = fixture(Array(6).fill(2), Array(6).fill(1), Array(12).fill(0)),
    zero = analyze(s, settings),
    one = analyze(s, { ...settings, nullEffect: '1' });
  assert.equal(frac(zero.p), 1);
  assert.equal(frac(one.p), 2 / 64);
  assert.equal(frac(zero.interval.lower), 0);
  assert.equal(frac(zero.interval.upper), 0);
});
test('weighted statistic and exhaustive tails match independent direct means over120 generated designs', () => {
  for (let k = 0; k < 120; k++) {
    const sizes = [3 + (k % 2), 2 + (k % 3)],
      counts = [1 + (k % 2), 1],
      values = Array.from(
        { length: sizes.reduce((a, b) => a + b) },
        (_, i) => ((i * 7 + k * 3) % 17) - 8,
      );
    const s = fixture(sizes, counts, values),
      nullEffect = String((k % 5) - 2),
      r = analyze(s, { ...settings, nullEffect }),
      observed = s.units.map((u) => u.arm === 'B');
    const statistic = (z) =>
      s.blocks.reduce((sum, b) => {
        const indices = s.units.flatMap((u, i) =>
            u.block === b.name ? [i] : [],
          ),
          a = indices.filter((i) => !z[i]),
          bb = indices.filter((i) => z[i]);
        const y = (i) => values[i] - Number(nullEffect) * Number(observed[i]);
        return (
          sum +
          (indices.length / values.length) *
            (bb.reduce((x, i) => x + y(i), 0) / bb.length -
              a.reduce((x, i) => x + y(i), 0) / a.length)
        );
      }, 0);
    const t = statistic(observed),
      all = [...enumerate(s)],
      extreme = all.filter(
        (z) => Math.abs(statistic(z)) + 1e-10 >= Math.abs(t),
      ).length;
    assert.equal(all.length, Number(allocationCount(s)));
    assert.ok(Math.abs(frac(r.p) - extreme / all.length) < 1e-12);
    assert.ok(Math.abs(frac(r.adjustedObserved) - t) < 1e-12);
  }
});
test('Monte Carlo keeps10000 draws plus observed correction and reuses bank across hypotheses', () => {
  const s = fixture(
      [20],
      [10],
      Array.from({ length: 20 }, (_, i) => i),
    ),
    r = analyze(s, settings),
    same = analyze(s, settings),
    other = analyze(s, { ...settings, nullEffect: '2' });
  assert.equal(r.method, 'monte-carlo');
  assert.equal(r.evaluated, 10000);
  assert.equal(r.interval.denominator, 10001);
  assert.deepEqual(r, same);
  assert.deepEqual(r.interval, other.interval);
  assert.equal(frac(r.p), (r.extreme + 1) / 10001);
  assert.equal(
    r.histogram.counts.reduce((a, b) => a + b),
    10000,
  );
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(r)));
});
test('maximum-size decimal study remains finite and serializable', () => {
  const s = fixture(
    Array(20).fill(10),
    Array.from({ length: 20 }, (_, i) => (i % 9) + 1),
    Array.from({ length: 200 }, (_, i) =>
      i % 2 === 0 ? '1000000' : '-999999.999999',
    ),
  );
  const r = analyze(s, {
    ...settings,
    nullEffect: '-1000000',
    confidence: 99,
    seed: 4294967295,
  });
  for (const f of [
    r.p,
    r.estimate,
    r.adjustedObserved,
    r.interval.lower,
    r.interval.upper,
  ].filter(Boolean))
    assert.ok(Number.isFinite(f.value));
  assert.equal(
    r.blocks.reduce((n, b) => n + b.n, 0),
    200,
  );
  assert.doesNotThrow(() => JSON.stringify(r));
});
class FakeWorker {
  onmessage = null;
  onerror = null;
  terminated = false;
  input = null;
  postMessage(input) {
    this.input = input;
  }
  terminate() {
    this.terminated = true;
  }
  result(value) {
    this.onmessage?.({ data: { type: 'result', result: value } });
  }
}
test('worker controller rejects overlap, cancels, ignores stale messages and accepts only live results', async () => {
  const workers = [],
    runner = new AnalysisRunner(() => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    }),
    s = referenceStudy();
  const first = runner.run(s, settings, () => {}),
    firstReject = assert.rejects(first, /cancelled/);
  await assert.rejects(
    runner.run(s, settings, () => {}),
    /running/,
  );
  const stale = workers[0].onmessage;
  runner.cancel();
  await firstReject;
  assert.equal(runner.busy, false);
  assert.equal(workers[0].terminated, true);
  const second = runner.run(s, settings, () => {}),
    r = analyze(s, settings);
  stale({ data: { type: 'result', result: r } });
  assert.equal(runner.busy, true);
  workers[1].result(r);
  assert.deepEqual(await second, r);
  runner.dispose();
  await assert.rejects(
    runner.run(s, settings, () => {}),
    /closed/,
  );
});
test('worker startup, posting and malformed-response failures release the reservation', async () => {
  const s = referenceStudy(),
    fail = new AnalysisRunner(() => {
      throw new Error('x');
    });
  await assert.rejects(
    fail.run(s, settings, () => {}),
    /could not start/,
  );
  assert.equal(fail.busy, false);
  const w = new FakeWorker();
  w.postMessage = () => {
    throw new Error('x');
  };
  const post = new AnalysisRunner(() => w);
  await assert.rejects(
    post.run(s, settings, () => {}),
    /Could not send/,
  );
  assert.equal(post.busy, false);
  const bad = new FakeWorker(),
    r = new AnalysisRunner(() => bad),
    p = r.run(s, settings, () => {});
  bad.onmessage({ data: { type: 'oops' } });
  await assert.rejects(p, /Unexpected/);
  assert.equal(r.busy, false);
});
test('source includes browser-tool cleanup, draft protection, atomic revision guards and safe worker import', () => {
  const page = readFileSync(
    new URL('../app/page.tsx', import.meta.url),
    'utf8',
  );
  for (const text of [
    'read_comparison_lab',
    'analyze_comparison',
    'replace_study_file',
    'lifecycle.abort()',
    'dirtyRef.current',
    'pendingRef.current',
    'flushSync',
    '?worker',
  ])
    assert.ok(page.includes(text), text);
  assert.match(page, /ticket\s*!==\s*fileJob\.current/u);
  assert.ok(!page.includes('localStorage'));
  assert.ok(!page.includes('dangerouslySetInnerHTML'));
});
