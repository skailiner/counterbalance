'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  Table,
  TableHeader,
  TableHead,
  TableRow,
  TableBody,
  TableCell,
  TableCaption,
} from '@/components/ui/table';
import {
  rosterCsv,
  outcomesCsv,
  importRoster,
  importOutcomes,
} from '@/lib/files';
import {
  validateStudy,
  validateSettings,
  type Study,
  type Settings,
} from '@/lib/study';
import type { Result, Fraction } from '@/lib/inference';
export const numberText = (n: number) =>
  n === 0 ? '0' : Number(n.toPrecision(6)).toString();
export const fracText = (f: Fraction) => numberText(f.value);
type FormProps = {
  study: Study;
  locked: boolean;
  onDirty: () => void;
  onApply: (study: Study) => void;
  onError: (error: unknown) => void;
  onDiscard: () => void;
};
export function DesignForm({
  study,
  locked,
  onDirty,
  onApply,
  onError,
  onDiscard,
}: FormProps) {
  const [draft, setDraft] = useState(study);
  const [roster, setRoster] = useState(rosterCsv(study));
  const [mode, setMode] = useState<'protocol' | 'roster'>('protocol'),
    [changed, setChanged] = useState(false);
  const update = (key: string, value: string) => {
    setDraft({ ...draft, [key]: value });
    setChanged(true);
    onDirty();
  };
  return (
    <div className="design-forms">
      <div className="section-heading">
        <div>
          <p className="eyebrow">BEFORE THE COMPARISON</p>
          <h2>Write down the design.</h2>
        </div>
      </div>
      <div className="button-row">
        <Button
          variant={mode === 'protocol' ? 'default' : 'outline'}
          disabled={locked || changed}
          onClick={() => setMode('protocol')}
        >
          Protocol & counts
        </Button>
        <Button
          variant={mode === 'roster' ? 'default' : 'outline'}
          disabled={locked || changed}
          onClick={() => setMode('roster')}
        >
          Replace roster
        </Button>
      </div>
      {mode === 'protocol' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onApply(validateStudy(draft));
            } catch (err) {
              onError(err);
            }
          }}
        >
          <fieldset disabled={locked}>
            <div className="form-grid">
              {(
                [
                  ['title', 'Study title'],
                  ['question', 'Question'],
                  ['armA', 'Group A name'],
                  ['armB', 'Group B name'],
                  ['outcomeLabel', 'Outcome and unit'],
                ] as const
              ).map(([key, name]) => (
                <div className="field" key={key}>
                  <label htmlFor={key}>{name}</label>
                  <Input
                    id={key}
                    value={draft[key]}
                    onChange={(e) => update(key, e.target.value)}
                  />
                </div>
              ))}
            </div>
            <div className="field">
              <label htmlFor="notes">Protocol note (one paragraph)</label>
              <Textarea
                id="notes"
                value={draft.notes}
                onChange={(e) => update('notes', e.target.value)}
              />
            </div>
            <div className="count-editor">
              <h3>Fixed group B counts</h3>
              <p className="fine">
                Each remaining unit goes to A. Counts lock once groups are
                assigned.
              </p>
              {draft.blocks.map((b, i) => (
                <div className="count-row" key={b.name}>
                  <label htmlFor={'count-' + i}>{b.name}</label>
                  <Input
                    id={'count-' + i}
                    aria-label={'Group B count in ' + b.name}
                    type="number"
                    min={1}
                    max={
                      study.units.filter((u) => u.block === b.name).length - 1
                    }
                    disabled={study.assignment.kind !== 'none'}
                    value={b.bCount}
                    onChange={(e) => {
                      const blocks = draft.blocks.map((x, j) =>
                        i === j
                          ? {
                              ...x,
                              bCount:
                                e.target.value === ''
                                  ? 0
                                  : Number(e.target.value),
                            }
                          : x,
                      );
                      setDraft({ ...draft, blocks });
                      setChanged(true);
                      onDirty();
                    }}
                  />
                  <span className="fine">
                    of {study.units.filter((u) => u.block === b.name).length}
                  </span>
                </div>
              ))}
            </div>
            <div className="button-row">
              <Button type="submit" disabled={!changed}>
                Apply protocol
              </Button>
              <Button variant="outline" disabled={!changed} onClick={onDiscard}>
                Discard edits
              </Button>
            </div>
          </fieldset>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              onApply(importRoster(roster, study));
            } catch (err) {
              onError(err);
            }
          }}
        >
          <fieldset disabled={locked}>
            <div className="field">
              <label htmlFor="roster">Roster CSV — id,block</label>
              <Textarea
                id="roster"
                className="csv-input"
                spellCheck={false}
                value={roster}
                onChange={(e) => {
                  setRoster(e.target.value);
                  setChanged(true);
                  onDirty();
                }}
              />
            </div>
            <p className="fine">
              2–200 pseudonymous randomization units, 1–20 blocks. Each block
              needs at least two units. Replacing the roster clears all groups
              and outcomes; new counts initially split each block as evenly as
              possible.
            </p>
            <div className="button-row">
              <Button type="submit" disabled={!changed}>
                Review replacement roster
              </Button>
              <Button variant="outline" disabled={!changed} onClick={onDiscard}>
                Discard edits
              </Button>
            </div>
          </fieldset>
        </form>
      )}
    </div>
  );
}
export function OutcomesForm({
  study,
  locked,
  onDirty,
  onApply,
  onError,
  onDiscard,
}: FormProps) {
  const [text, setText] = useState(outcomesCsv(study)),
    [changed, setChanged] = useState(false);
  return (
    <div>
      <div className="section-heading">
        <div>
          <p className="eyebrow">COMPLETE ROSTER / NO SILENT DELETIONS</p>
          <h2>Record what happened.</h2>
        </div>
      </div>
      <p className="fine">
        One outcome for every original ID. Use decimals with at most six places,
        within ±1,000,000. An empty outcome is missing; 0 is a real value.
        Unknown, repeated or omitted IDs are rejected.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          try {
            onApply(importOutcomes(text, study));
          } catch (err) {
            onError(err);
          }
        }}
      >
        <fieldset disabled={locked || study.assignment.kind === 'none'}>
          <div className="field">
            <label htmlFor="outcomes">Outcomes CSV — id,outcome</label>
            <Textarea
              id="outcomes"
              className="csv-input"
              spellCheck={false}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setChanged(true);
                onDirty();
              }}
            />
          </div>
          <div className="button-row">
            <Button type="submit" disabled={!changed}>
              Apply outcomes
            </Button>
            <Button variant="outline" disabled={!changed} onClick={onDiscard}>
              Discard edits
            </Button>
          </div>
        </fieldset>
      </form>
      <UnitTable study={study} />
    </div>
  );
}
export function UnitTable({ study }: { study: Study }) {
  return (
    <Table>
      <TableCaption>
        Committed roster · {study.units.length} units · {study.outcomeLabel}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">ID</TableHead>
          <TableHead scope="col">Block</TableHead>
          <TableHead scope="col">Group</TableHead>
          <TableHead scope="col">Outcome</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {study.units.map((u) => (
          <TableRow key={u.id}>
            <TableCell>{u.id}</TableCell>
            <TableCell>{u.block}</TableCell>
            <TableCell className={u.arm === 'B' ? 'arm-b' : 'arm-a'}>
              {u.arm ?? 'Unassigned'}
            </TableCell>
            <TableCell>{u.outcome ?? 'Missing'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
export function SettingsForm({
  settings,
  locked,
  canRun,
  onRun,
  onDirty,
  onDiscard,
  onError,
}: {
  settings: Settings;
  locked: boolean;
  canRun: boolean;
  onRun: (settings: Settings) => void;
  onDirty: () => void;
  onDiscard: () => void;
  onError: (error: unknown) => void;
}) {
  const [effect, setEffect] = useState(settings.nullEffect),
    [confidence, setConfidence] = useState(settings.confidence),
    [seed, setSeed] = useState(String(settings.seed)),
    [changed, setChanged] = useState(false);
  const dirty = () => {
    setChanged(true);
    onDirty();
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (!/^(?:0|[1-9]\d{0,9})$/u.test(seed))
            throw new Error(
              'Use a whole simulation seed from 0 to 4294967295.',
            );
          onRun(
            validateSettings({
              nullEffect: effect,
              confidence,
              seed: Number(seed),
            }),
          );
        } catch (err) {
          onError(err);
        }
      }}
    >
      <fieldset disabled={locked}>
        <div className="field">
          <label htmlFor="null-effect">
            Common additive effect to test (B − A)
          </label>
          <Input
            id="null-effect"
            inputMode="decimal"
            value={effect}
            onChange={(e) => {
              setEffect(e.target.value);
              dirty();
            }}
          />
          <p className="fine">
            0 tests no effect on any unit. Positive values mean a higher outcome
            under B—not necessarily a better outcome.
          </p>
        </div>
        <div className="field">
          <label id="confidence-label" htmlFor="confidence-control">
            Confidence level
          </label>
          <Select
            disabled={locked}
            value={String(confidence)}
            onValueChange={(v) => {
              if (v && !locked) {
                setConfidence(Number(v) as Settings['confidence']);
                dirty();
              }
            }}
          >
            <SelectTrigger
              id="confidence-control"
              aria-labelledby="confidence-label"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[90, 95, 99].map((v) => (
                <SelectItem value={String(v)} key={v}>
                  {v}%
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="field">
          <label htmlFor="simulation-seed">Simulation seed</label>
          <Input
            id="simulation-seed"
            inputMode="numeric"
            value={seed}
            onChange={(e) => {
              setSeed(e.target.value);
              dirty();
            }}
          />
          <p className="fine">
            Used only above 50,000 legal allocations. Fix before analysis; do
            not search seeds for a preferred result.
          </p>
        </div>
        <Button type="submit" disabled={!canRun}>
          Run comparison
        </Button>
        {changed && (
          <Button
            variant="outline"
            className="discard-settings"
            onClick={onDiscard}
          >
            Discard setting edits
          </Button>
        )}
      </fieldset>
    </form>
  );
}
export function AllocationDiagram({ study }: { study: Study }) {
  return (
    <div className="assignment-main">
      <div className="section-heading">
        <div>
          <p className="eyebrow">FIXED COUNTS WITHIN EVERY BLOCK</p>
          <h2>Compare like with like.</h2>
        </div>
      </div>
      <div className="arm-headings">
        <span className="arm-a">A / {study.armA}</span>
        <span className="arm-b">B / {study.armB}</span>
      </div>
      {study.blocks.map((b, index) => (
        <article className="block-row" key={b.name}>
          <div className="block-name">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <h3>{b.name}</h3>
            <p className="fine">{b.bCount} assigned to B</p>
          </div>
          {study.assignment.kind === 'none' ? (
            <div className="unassigned-units">
              {study.units
                .filter((u) => u.block === b.name)
                .map((u) => (
                  <span key={u.id}>{u.id}</span>
                ))}
            </div>
          ) : (
            <div className="allocation-grid">
              {(['A', 'B'] as const).map((arm) => (
                <div className={'unit-group ' + arm.toLowerCase()} key={arm}>
                  {study.units
                    .filter((u) => u.block === b.name && u.arm === arm)
                    .map((u) => (
                      <div className="unit" key={u.id}>
                        <span>{u.id}</span>
                        <small>{u.outcome ?? '—'}</small>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          )}
        </article>
      ))}
      <p className="diagram-note">
        Unit IDs are labels, not identities. Each row must represent the actual
        unit of randomization. This design is not suitable for analyzing
        individual rows when entire clusters were assigned together.
      </p>
    </div>
  );
}
// oxlint-disable jsx-a11y/prefer-tag-over-role -- An inline SVG plot is an image, with a complete accessible textual summary.
export function Evidence({
  result: r,
  study,
}: {
  result: Result;
  study: Study;
}) {
  const { histogram: h } = r,
    obs = r.adjustedObserved.value,
    lo = Math.min(h.min, -Math.abs(obs)),
    hi = Math.max(h.max, Math.abs(obs)),
    span = hi - lo || 1;
  const x = (v: number) => 50 + ((v - lo) / span) * 660;
  const maxCount = Math.max(...h.counts);
  const interval =
    (r.interval.lower ? fracText(r.interval.lower) : '−∞') +
    ' to ' +
    (r.interval.upper ? fracText(r.interval.upper) : '+∞');
  return (
    <div className="evidence">
      <div className="metric-row">
        <div>
          <span className="eyebrow">OBSERVED B − A</span>
          <strong>{fracText(r.estimate)}</strong>
          <p>
            {study.outcomeLabel}
            <br />
            Block-size weighted
          </p>
        </div>
        <div>
          <span className="eyebrow">ABSOLUTE-TAIL P</span>
          <strong>{fracText(r.p)}</strong>
          <p>
            {r.p.numerator} / {r.p.denominator}
            <br />
            Ties included
          </p>
        </div>
        <div>
          <span className="eyebrow">
            {r.interval.confidence}% CONSTANT-EFFECT INTERVAL
          </span>
          <strong className="interval-number">{interval}</strong>
          <p>
            Closed bounds; unbounded ends allowed.
            <br />
            Not a heterogeneous average-effect interval.
          </p>
        </div>
      </div>
      <section className="distribution">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              {r.method === 'enumeration'
                ? 'EXHAUSTIVE REFERENCE DISTRIBUTION'
                : 'SEEDED MONTE CARLO REFERENCE DISTRIBUTION'}
            </p>
            <h2>How unusual is this comparison?</h2>
          </div>
        </div>
        <svg
          viewBox="0 0 760 290"
          role="img"
          aria-label={
            'Distribution of ' +
            r.evaluated +
            ' null-adjusted assignment statistics, from ' +
            numberText(h.min) +
            ' to ' +
            numberText(h.max) +
            '. Dashed lines mark ± the absolute observed statistic ' +
            numberText(Math.abs(obs)) +
            '. Exact tail counts, not histogram bins, determine p.'
          }
        >
          <line x1="50" x2="710" y1="220" y2="220" stroke="#8796b1" />
          {h.counts.map((count, i) => {
            const width =
                h.min === h.max
                  ? 10
                  : Math.max(
                      1,
                      (660 * (h.max - h.min)) / span / h.counts.length - 1,
                    ),
              left =
                h.min === h.max
                  ? x(h.min) - 5
                  : x(h.min + ((h.max - h.min) * i) / h.counts.length);
            return (
              <rect
                key={i}
                x={left}
                y={220 - (count / maxCount) * 166}
                width={width}
                height={(count / maxCount) * 166}
                fill="#244adc"
              >
                <title>
                  {count} allocations in bin {i + 1}
                </title>
              </rect>
            );
          })}
          {[-1, 1].map((sign) => (
            <line
              key={sign}
              x1={x(sign * Math.abs(obs))}
              x2={x(sign * Math.abs(obs))}
              y1="32"
              y2="220"
              stroke="#a3420d"
              strokeWidth="2"
              strokeDasharray="5 4"
            />
          ))}
          <text x="50" y="251" fill="#516079">
            {numberText(lo)}
          </text>
          <text x="710" y="251" textAnchor="end" fill="#516079">
            {numberText(hi)}
          </text>
          <text x="380" y="281" textAnchor="middle" fill="#516079">
            Null-adjusted block-weighted difference
          </text>
          <text x="50" y="22" fill="#516079">
            {maxCount} / peak bin
          </text>
        </svg>
        <p className="fine">
          Null effect τ = {r.settings.nullEffect}. Outcomes are adjusted by Y −
          τZ before reassignment. {r.extreme.toLocaleString('en-US')} of{' '}
          {r.evaluated.toLocaleString('en-US')}{' '}
          {r.method === 'enumeration'
            ? 'legal allocations'
            : 'simulated allocations'}{' '}
          are at least as extreme in absolute value.{' '}
          {r.method === 'monte-carlo'
            ? 'The reported p-value adds one observed allocation to numerator and denominator; duplicate draws are retained. The plot shows the 10,000 simulated draws only.'
            : 'The observed allocation is already included; no extra +1 is added.'}{' '}
          The plot is rounded; comparisons and interval endpoints use exact
          rational arithmetic on entered decimals.
        </p>
      </section>
      <Table>
        <TableCaption>
          Overall estimate = sum of each block difference × its share of all
          units. This is not a pooled group-mean comparison.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">Block</TableHead>
            <TableHead scope="col">A / B count</TableHead>
            <TableHead scope="col">A mean</TableHead>
            <TableHead scope="col">B mean</TableHead>
            <TableHead scope="col">B − A</TableHead>
            <TableHead scope="col">Weight</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {r.blocks.map((b) => (
            <TableRow key={b.name}>
              <TableCell>{b.name}</TableCell>
              <TableCell>
                {b.nA} / {b.nB}
              </TableCell>
              <TableCell>{fracText(b.meanA)}</TableCell>
              <TableCell>{fracText(b.meanB)}</TableCell>
              <TableCell>{fracText(b.difference)}</TableCell>
              <TableCell>
                {b.weight.numerator}/{b.weight.denominator}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="interpretation">
        <h3>What this does—and does not—support</h3>
        <p>
          A p-value describes compatibility with the specified sharp null under
          the declared assignment design. It is not the probability the null is
          true, the size of an effect, or a verdict on whether an intervention
          is worth doing.
        </p>
        <p>
          The interval inverts this same test under a constant additive effect
          on every unit. Actual randomized assignment, fixed counts, complete
          outcomes and no interference are assumptions, not things this file can
          certify. Repeated testing and selectively reported outcomes can
          invalidate a simple one-test interpretation.
        </p>
        {r.simulation && (
          <p>
            Monte Carlo: {r.simulation.draws.toLocaleString('en-US')} seeded,
            with-replacement simulated allocations; PCG-XSH-RR 64/32, stream
            selector 54, seed {r.simulation.seed}. This deterministic sequence
            approximates the ideal uniform reference design. Formal test
            guarantees assume the corresponding ideal sampling construction;
            this is not full enumeration.
          </p>
        )}
      </div>
    </div>
  );
}
