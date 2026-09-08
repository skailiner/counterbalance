export const SCALE = 1000000n;
export const MAX_FILE_BYTES = 262144;
export type Unit = {
  id: string;
  block: string;
  arm: 'A' | 'B' | null;
  outcome: string | null;
};
export type Study = {
  version: 1;
  title: string;
  question: string;
  armA: string;
  armB: string;
  outcomeLabel: string;
  notes: string;
  blocks: { name: string; bCount: number }[];
  units: Unit[];
  assignment: {
    kind: 'none' | 'generated' | 'imported' | 'reference';
    algorithm: 'fy-u32-v1';
    words: number[];
  };
};
export type Settings = {
  nullEffect: string;
  confidence: 90 | 95 | 99;
  seed: number;
};
export const DEFAULT_SETTINGS: Settings = {
  nullEffect: '0',
  confidence: 95,
  seed: 104729,
};
export function object(
  value: unknown,
  keys: string[],
  label: string,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    throw new Error(label + ' must be an object.');
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(v, k))
  )
    throw new Error(label + ' has missing or unknown fields.');
  return v;
}
export function integer(
  v: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
    throw new Error(
      label + ' must be a whole number from ' + min + ' to ' + max + '.',
    );
  return v;
}
function label(v: unknown, max: number, name: string, empty = false): string {
  if (
    typeof v !== 'string' ||
    v.length > max ||
    v !== v.trim() ||
    (!empty && !v) ||
    Array.from(v).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    throw new Error(
      name +
        ' must be trimmed text, at most ' +
        max +
        ' characters, without control characters.',
    );
  return v;
}
export function decimal(v: unknown): string {
  if (typeof v !== 'string' || !/^-?(?:0|[1-9]\d{0,6})(?:\.\d{1,6})?$/u.test(v))
    throw new Error(
      'Use a decimal such as -2.5: up to six decimal places, no exponent or separators.',
    );
  const n = micro(v);
  if (n > 1000000n * SCALE || n < -1000000n * SCALE)
    throw new Error(
      'Outcomes and null effects must be between -1,000,000 and 1,000,000.',
    );
  if (n === 0n) return '0';
  const s = n < 0n ? '-' : '';
  const a = n < 0n ? -n : n;
  const f = (a % SCALE).toString().padStart(6, '0').replace(/0+$/u, '');
  return s + (a / SCALE).toString() + (f ? '.' + f : '');
}
export function micro(v: string): bigint {
  const neg = v.startsWith('-'),
    parts = (neg ? v.slice(1) : v).split('.');
  return (
    (BigInt(parts[0]) * SCALE + BigInt((parts[1] || '').padEnd(6, '0'))) *
    (neg ? -1n : 1n)
  );
}
export function validateSettings(value: unknown): Settings {
  const v = object(
    value,
    ['nullEffect', 'confidence', 'seed'],
    'Analysis settings',
  );
  if (![90, 95, 99].includes(v.confidence as number))
    throw new Error('Confidence must be 90, 95 or 99.');
  return {
    nullEffect: decimal(v.nullEffect),
    confidence: v.confidence as Settings['confidence'],
    seed: integer(v.seed, 0, 4294967295, 'Simulation seed'),
  };
}
export function bounded(next: () => number, bound: number): number {
  integer(bound, 1, 4294967296, 'Random bound');
  const limit = Math.floor(4294967296 / bound) * bound;
  for (let attempts = 0; attempts < 4096; attempts++) {
    const word = integer(next(), 0, 4294967295, 'Random word');
    if (word < limit) return word % bound;
  }
  throw new Error('Random source failed to provide an accepted word.');
}
export function sampleAllocation(
  study: Pick<Study, 'units' | 'blocks'>,
  next: () => number,
): boolean[] {
  const allocation = study.units.map(() => false);
  for (const b of study.blocks) {
    const positions = study.units.flatMap((u, i) =>
      u.block === b.name ? [i] : [],
    );
    for (let i = positions.length - 1; i > 0; i--) {
      const j = bounded(next, i + 1);
      [positions[i], positions[j]] = [positions[j], positions[i]];
    }
    positions.slice(0, b.bCount).forEach((i) => {
      allocation[i] = true;
    });
  }
  return allocation;
}
export function validateStudy(value: unknown): Study {
  const v = object(
    value,
    [
      'version',
      'title',
      'question',
      'armA',
      'armB',
      'outcomeLabel',
      'notes',
      'blocks',
      'units',
      'assignment',
    ],
    'Study',
  );
  if (v.version !== 1)
    throw new Error('Only study-file version 1 is supported.');
  if (!Array.isArray(v.blocks) || v.blocks.length < 1 || v.blocks.length > 20)
    throw new Error('Use 1 to 20 blocks.');
  if (!Array.isArray(v.units) || v.units.length < 2 || v.units.length > 200)
    throw new Error('Use 2 to 200 randomization units.');
  const names = new Set<string>(),
    ids = new Set<string>();
  const blocks = [...v.blocks].map((x) => {
    const b = object(x, ['name', 'bCount'], 'Block'),
      name = label(b.name, 60, 'Block name');
    if (!/^[\p{L}\p{N}]/u.test(name) || names.has(name))
      throw new Error(
        'Block names must be unique and start with a letter or number.',
      );
    names.add(name);
    return { name, bCount: integer(b.bCount, 1, 199, 'Group B count') };
  });
  const units = [...v.units].map((x) => {
    const u = object(x, ['id', 'block', 'arm', 'outcome'], 'Unit');
    if (
      typeof u.id !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/u.test(u.id) ||
      ids.has(u.id)
    )
      throw new Error(
        'Unit IDs must be unique, 1–40 ASCII letters/numbers/dots/dashes/underscores, starting with a letter or number.',
      );
    ids.add(u.id);
    if (typeof u.block !== 'string' || !names.has(u.block))
      throw new Error('Each unit must name a declared block.');
    if (u.arm !== null && u.arm !== 'A' && u.arm !== 'B')
      throw new Error('Group must be A, B or null.');
    return {
      id: u.id,
      block: u.block,
      arm: u.arm,
      outcome: u.outcome === null ? null : decimal(u.outcome),
    } as Unit;
  });
  const assigned = units.every((u) => u.arm !== null);
  if (!assigned && units.some((u) => u.arm !== null || u.outcome !== null))
    throw new Error(
      'An unassigned roster cannot contain partial assignments or outcomes.',
    );
  for (const b of blocks) {
    const members = units.filter((u) => u.block === b.name);
    if (members.length < 2 || b.bCount >= members.length)
      throw new Error('Every block needs at least one unit in each group.');
    if (assigned && members.filter((u) => u.arm === 'B').length !== b.bCount)
      throw new Error(
        'Recorded assignment does not match the fixed group count.',
      );
  }
  const a = object(
    v.assignment,
    ['kind', 'algorithm', 'words'],
    'Assignment record',
  );
  if (
    !['none', 'generated', 'imported', 'reference'].includes(
      a.kind as string,
    ) ||
    a.algorithm !== 'fy-u32-v1' ||
    !Array.isArray(a.words) ||
    a.words.length > 4096
  )
    throw new Error('Invalid assignment record.');
  if ((a.kind === 'none') === assigned)
    throw new Error('Assignment kind does not match the roster.');
  const words = [...a.words].map((w) =>
    integer(w, 0, 4294967295, 'Recorded random word'),
  );
  if (a.kind !== 'generated' && words.length)
    throw new Error(
      'Only generated assignments may contain a random-word record.',
    );
  const study: Study = {
    version: 1,
    title: label(v.title, 120, 'Title'),
    question: label(v.question, 400, 'Question'),
    armA: label(v.armA, 60, 'Group A name'),
    armB: label(v.armB, 60, 'Group B name'),
    outcomeLabel: label(v.outcomeLabel, 80, 'Outcome label'),
    notes: label(v.notes, 2000, 'Protocol note', true),
    blocks,
    units,
    assignment: {
      kind: a.kind as Study['assignment']['kind'],
      algorithm: 'fy-u32-v1',
      words,
    },
  };
  if (a.kind === 'generated') {
    let pos = 0;
    const replay = sampleAllocation(study, () => {
      if (pos >= words.length)
        throw new Error('Assignment random-word record is incomplete.');
      return words[pos++];
    });
    if (
      pos !== words.length ||
      replay.some((b, i) => b !== (units[i].arm === 'B'))
    )
      throw new Error(
        'Assignment record does not replay to the supplied groups.',
      );
  }
  return study;
}
export function allocate(value: unknown, source: () => number): Study {
  const study = validateStudy(value),
    words: number[] = [];
  if (study.assignment.kind !== 'none')
    throw new Error(
      'Reset to an unassigned roster before creating a new allocation.',
    );
  const chosen = sampleAllocation(study, () => {
    if (words.length >= 4096)
      throw new Error('Allocation random-word limit reached.');
    const w = integer(source(), 0, 4294967295, 'Random word');
    words.push(w);
    return w;
  });
  return validateStudy({
    ...study,
    units: study.units.map((u, i) => ({
      ...u,
      arm: chosen[i] ? 'B' : 'A',
      outcome: null,
    })),
    assignment: { kind: 'generated', algorithm: 'fy-u32-v1', words },
  });
}
export function resetRoster(study: Study): Study {
  return validateStudy({
    ...study,
    units: study.units.map((u) => ({ ...u, arm: null, outcome: null })),
    assignment: { kind: 'none', algorithm: 'fy-u32-v1', words: [] },
  });
}
export function ready(study: Study): string | null {
  if (study.units.some((u) => u.arm === null))
    return 'Assign the full roster before entering outcomes or running analysis.';
  const count = study.units.filter((u) => u.outcome === null).length;
  return count
    ? count +
        ' outcome(s) missing. Analysis is paused; no units have been removed.'
    : null;
}
export function referenceStudy(): Study {
  const names = ['Morning workshop', 'Afternoon workshop', 'Evening workshop'];
  const bases = [8, 11, 9, 10, 12, 13, 11, 15, 7, 9, 6, 8];
  return validateStudy({
    version: 1,
    title: 'Two ways to teach one idea.',
    question: 'Does a worked example help more than a second explanation?',
    armA: 'Second explanation',
    armB: 'Worked example',
    outcomeLabel: 'Score (points)',
    notes:
      'Synthetic teaching example only. Not an observed experiment or a preregistration.',
    blocks: names.map((name) => ({ name, bCount: 2 })),
    units: bases.map((n, i) => ({
      id: 'U' + String(i + 1).padStart(2, '0'),
      block: names[Math.floor(i / 4)],
      arm: i % 4 === 0 || i % 4 === 2 ? 'B' : 'A',
      outcome: String(n + (i % 4 === 0 || i % 4 === 2 ? 3 : 0)),
    })),
    assignment: { kind: 'reference', algorithm: 'fy-u32-v1', words: [] },
  });
}
