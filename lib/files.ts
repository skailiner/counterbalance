import { MAX_FILE_BYTES, decimal, validateStudy, type Study } from './study.ts';
export function boundedText(value: unknown): string {
  if (
    typeof value !== 'string' ||
    new TextEncoder().encode(value).byteLength > MAX_FILE_BYTES
  )
    throw new Error('Use a UTF-8 file no larger than 256 KiB.');
  if (value.includes('\u0000'))
    throw new Error('NUL characters are not supported.');
  return value.replace(/^\uFEFF/u, '');
}
export function parseCsv(input: unknown, headers: string[]): string[][] {
  const text = boundedText(input),
    rows: string[][] = [];
  let row: string[] = [],
    cell = '',
    quoted = false,
    closed = false,
    started = false;
  const finishCell = () => {
    row.push(cell);
    cell = '';
    closed = false;
    started = false;
  };
  const finishRow = () => {
    finishCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else cell += c;
      continue;
    }
    if (c === ',') {
      finishCell();
      continue;
    }
    if (c === '\r' || c === '\n') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      finishRow();
      continue;
    }
    if (closed) throw new Error('Unexpected text after a closing CSV quote.');
    if (c === '"') {
      if (started || cell)
        throw new Error('CSV quotes must begin at the start of a field.');
      quoted = true;
      started = true;
      continue;
    }
    started = true;
    cell += c;
  }
  if (quoted) throw new Error('CSV has an unclosed quoted field.');
  if (cell || row.length || started || closed) finishRow();
  if (!rows.length || rows[0].join('\u0000') !== headers.join('\u0000'))
    throw new Error('Expected CSV header exactly: ' + headers.join(','));
  if (rows.length < 3 || rows.length > 201)
    throw new Error('Supply 2 to 200 data rows; do not add blank rows.');
  const data = rows.slice(1);
  if (data.some((r) => r.length !== headers.length))
    throw new Error(
      'Every CSV row must have exactly ' + headers.length + ' fields.',
    );
  return data;
}
const escapeCell = (text: string) => '"' + text.replaceAll('"', '""') + '"';
export const csv = (headers: string[], rows: string[][]) =>
  [headers, ...rows].map((r) => r.map(escapeCell).join(',')).join('\r\n') +
  '\r\n';
export const rosterCsv = (study: Study) =>
  csv(
    ['id', 'block'],
    study.units.map((u) => [u.id, u.block]),
  );
export const outcomesCsv = (study: Study) =>
  csv(
    ['id', 'outcome'],
    study.units.map((u) => [u.id, u.outcome ?? '']),
  );
export const allocationCsv = (study: Study) =>
  csv(
    ['id', 'block', 'group', 'outcome'],
    study.units.map((u) => [u.id, u.block, u.arm ?? '', u.outcome ?? '']),
  );
export function importRoster(input: unknown, base: Study): Study {
  const rows = parseCsv(input, ['id', 'block']),
    names = [...new Set(rows.map((r) => r[1]))];
  return validateStudy({
    ...base,
    blocks: names.map((name) => ({
      name,
      bCount: Math.floor(rows.filter((r) => r[1] === name).length / 2),
    })),
    units: rows.map(([id, block]) => ({ id, block, arm: null, outcome: null })),
    assignment: { kind: 'none', algorithm: 'fy-u32-v1', words: [] },
  });
}
export function importOutcomes(input: unknown, base: Study): Study {
  if (base.assignment.kind === 'none')
    throw new Error('Assign groups before recording outcomes.');
  const rows = parseCsv(input, ['id', 'outcome']),
    values = new Map<string, string | null>();
  for (const [id, outcome] of rows) {
    if (values.has(id))
      throw new Error('Each outcome ID must appear exactly once.');
    values.set(id, outcome === '' ? null : decimal(outcome));
  }
  if (
    values.size !== base.units.length ||
    base.units.some((u) => !values.has(u.id))
  )
    throw new Error(
      'Outcome IDs must exactly match the full assigned roster. No extra or missing IDs.',
    );
  return validateStudy({
    ...base,
    units: base.units.map((u) => ({ ...u, outcome: values.get(u.id)! })),
  });
}
export function importExisting(input: unknown, base: Study): Study {
  const rows = parseCsv(input, ['id', 'block', 'group', 'outcome']),
    names = [...new Set(rows.map((r) => r[1]))];
  return validateStudy({
    ...base,
    blocks: names.map((name) => ({
      name,
      bCount: rows.filter((r) => r[1] === name && r[2] === 'B').length,
    })),
    units: rows.map(([id, block, arm, outcome]) => ({
      id,
      block,
      arm,
      outcome: outcome === '' ? null : outcome,
    })),
    assignment: { kind: 'imported', algorithm: 'fy-u32-v1', words: [] },
  });
}
export function studyJson(input: unknown): Study {
  const value = boundedText(input);
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(
      'This is not valid JSON. Choose an exported COUNTERBALANCE study file.',
    );
  }
  return validateStudy(parsed);
}
export const exportStudy = (study: Study) =>
  JSON.stringify(validateStudy(study), null, 2) + '\n';
