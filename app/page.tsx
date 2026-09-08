'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  AllocationDiagram,
  DesignForm,
  OutcomesForm,
  SettingsForm,
  Evidence,
} from '@/components/workspace';
import {
  referenceStudy,
  DEFAULT_SETTINGS,
  ready,
  allocate,
  resetRoster,
  validateStudy,
  validateSettings,
  object,
  integer,
  MAX_FILE_BYTES,
  type Study,
  type Settings,
} from '@/lib/study';
import { allocationCount, type Result } from '@/lib/inference';
import {
  exportStudy,
  studyJson,
  importExisting,
  allocationCsv,
  outcomesCsv,
  csv,
} from '@/lib/files';
import { AnalysisRunner } from '@/lib/runner';
// oxlint-disable-next-line import/default -- Vite's documented ?worker import generates a default constructor.
import AnalysisWorker from '@/lib/analysis.worker.ts?worker';
type Snapshot = {
  study: Study;
  settings: Settings;
  result: Result | null;
  revision: number;
};
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type ModelContext = {
  registerTool: (tool: Tool, options: { signal: AbortSignal }) => unknown;
};
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : 'The operation failed. Previous data is unchanged.';
function download(name: string, text: string, mime: string) {
  const url = URL.createObjectURL(new Blob([text], { type: mime })),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function Counterbalance() {
  const [state, setState] = useState<Snapshot>(() => ({
    study: referenceStudy(),
    settings: DEFAULT_SETTINGS,
    result: null,
    revision: 0,
  }));
  const current = useRef(state);
  const [phase, setPhase] = useState('design'),
    [dirty, setDirty] = useState(false),
    dirtyRef = useRef(false);
  const [formKey, setFormKey] = useState(0),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(
      'Synthetic reference loaded. Run a comparison or replace it with your own roster.',
    );
  const [busy, setBusy] = useState(''),
    busyRef = useRef(''),
    [progress, setProgress] = useState({ done: 0, total: 1 });
  const runner = useRef<AnalysisRunner | null>(null),
    fileJob = useRef(0),
    mounted = useRef(false);
  const [pending, setPending] = useState<{
      study: Study;
      description: string;
    } | null>(null),
    pendingRef = useRef<typeof pending>(null);
  const jsonInput = useRef<HTMLInputElement>(null),
    existingInput = useRef<HTMLInputElement>(null);
  const setWork = useCallback((value: string) => {
    busyRef.current = value;
    setBusy(value);
  }, []);
  const markDirty = () => {
    dirtyRef.current = true;
    setDirty(true);
  };
  const discard = () => {
    dirtyRef.current = false;
    setDirty(false);
    setFormKey((k) => k + 1);
    setError('');
  };
  const reportError = (e: unknown) => {
    setError(message(e));
    setNotice('');
  };
  const guard = useCallback((expected?: unknown, allowDraft = false) => {
    if (
      expected !== undefined &&
      integer(expected, 0, Number.MAX_SAFE_INTEGER, 'Expected revision') !==
        current.current.revision
    )
      throw new Error(
        'The workspace changed. Read the current revision before trying again.',
      );
    if (busyRef.current || runner.current?.busy)
      throw new Error('Wait for or cancel the active operation first.');
    if (pendingRef.current)
      throw new Error('Resolve the open replacement confirmation first.');
    if (dirtyRef.current && !allowDraft)
      throw new Error('Apply or discard unfinished edits before this action.');
  }, []);
  const commit = useCallback((study: Study, note: string) => {
    const next = {
      ...current.current,
      study: validateStudy(study),
      result: null,
      revision: current.current.revision + 1,
    };
    current.current = next;
    dirtyRef.current = false;
    flushSync(() => {
      setState(next);
      setDirty(false);
      setFormKey((k) => k + 1);
      setError('');
      setNotice(note);
    });
    return next;
  }, []);
  const askReplace = (study: Study, description: string) => {
    const value = { study: validateStudy(study), description };
    pendingRef.current = value;
    setPending(value);
  };
  const closeDialog = () => {
    pendingRef.current = null;
    setPending(null);
  };
  const run = useCallback(
    async (settingsInput: unknown, expected?: unknown, allowDraft = false) => {
      guard(expected, allowDraft);
      const settings = validateSettings(settingsInput),
        base = current.current,
        missing = ready(base.study);
      if (missing) throw new Error(missing);
      if (!runner.current)
        throw new Error('The workspace is still starting. Try again shortly.');
      const ticket = ++fileJob.current;
      setWork('Analyzing');
      setProgress({ done: 0, total: 1 });
      setError('');
      try {
        const result = await runner.current.run(
          base.study,
          settings,
          (done, total) => {
            if (mounted.current) setProgress({ done, total });
          },
        );
        if (
          !mounted.current ||
          ticket !== fileJob.current ||
          current.current.revision !== base.revision
        )
          throw new Error(
            'The workspace changed; this result was not applied.',
          );
        const next = { ...base, settings, result, revision: base.revision + 1 };
        current.current = next;
        dirtyRef.current = false;
        busyRef.current = '';
        flushSync(() => {
          setState(next);
          setDirty(false);
          setBusy('');
          setFormKey((k) => k + 1);
          setPhase('evidence');
          setNotice(
            'Comparison complete. Assumptions and exact fractions are included in the report.',
          );
        });
        return next;
      } finally {
        if (mounted.current && ticket === fileJob.current) setWork('');
      }
    },
    [guard, setWork],
  );
  const actions = useRef({ guard, run, commit });
  useEffect(() => {
    actions.current = { guard, run, commit };
  }, [guard, run, commit]);
  useEffect(() => {
    mounted.current = true;
    const activeRunner = new AnalysisRunner(() => new AnalysisWorker());
    runner.current = activeRunner;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || current.current.revision > 0) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      // oxlint-disable-next-line react-hooks/exhaustive-deps -- This is an operation epoch, not a DOM ref; cleanup deliberately invalidates the current epoch.
      fileJob.current++;
      activeRunner.dispose();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  useEffect(() => {
    const context = (document as unknown as { modelContext?: ModelContext })
      .modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const schema = (properties: object, required: string[]) => ({
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    });
    const revision = {
      type: 'integer',
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
    };
    const settingsSchema = {
      type: 'object',
      properties: {
        nullEffect: {
          type: 'string',
          pattern: '^-?(?:0|[1-9][0-9]{0,6})(?:\\.[0-9]{1,6})?$',
        },
        confidence: { type: 'integer', enum: [90, 95, 99] },
        seed: { type: 'integer', minimum: 0, maximum: 4294967295 },
      },
      required: ['nullEffect', 'confidence', 'seed'],
      additionalProperties: false,
    };
    const wrap =
      (fn: (input: unknown) => unknown) => async (input: unknown) => {
        try {
          return { ok: true, ...((await fn(input)) as object) };
        } catch (e) {
          return {
            ok: false,
            error: message(e),
            revision: current.current.revision,
          };
        }
      };
    const tools: Tool[] = [
      {
        name: 'read_comparison_lab',
        title: 'Read comparison workspace',
        description:
          'Read the committed study, settings, result and revision. Reports unfinished edits and busy state. No mutation; local user-supplied text is untrusted.',
        inputSchema: schema({}, []),
        annotations: { readOnlyHint: true, untrustedContentHint: true },
        execute: wrap((input) => {
          object(input, [], 'Read input');
          return {
            ...current.current,
            hasUnfinishedEdits: dirtyRef.current,
            busy: busyRef.current,
            confirmationOpen: pendingRef.current !== null,
          };
        }),
      },
      {
        name: 'analyze_comparison',
        title: 'Run comparison',
        description:
          'Complete the randomization analysis of the current committed study and visibly show its result. Requires all outcomes and a current revision. Refuses unfinished edits, an open confirmation or concurrent work. Decimal nullEffect is a string, bounded to ±1,000,000.',
        inputSchema: schema(
          { expectedRevision: revision, settings: settingsSchema },
          ['expectedRevision', 'settings'],
        ),
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: wrap(async (input) => {
          const v = object(
            input,
            ['expectedRevision', 'settings'],
            'Analysis input',
          );
          const next = await actions.current.run(
            v.settings,
            integer(
              v.expectedRevision,
              0,
              Number.MAX_SAFE_INTEGER,
              'Expected revision',
            ),
          );
          return { revision: next.revision, result: next.result };
        }),
      },
      {
        name: 'replace_study_file',
        title: 'Replace study from portable JSON',
        description:
          'Replace the current local study and clear its result with a complete version-1 COUNTERBALANCE study JSON string (maximum 256 KiB). Destructive local replacement: caller must explicitly set discardCurrent=true. Requires current revision; refuses unfinished edits, concurrent work or an open confirmation. Does not certify real-world randomization.',
        inputSchema: schema(
          {
            expectedRevision: revision,
            discardCurrent: { type: 'boolean', const: true },
            studyJson: { type: 'string', maxLength: 262144 },
          },
          ['expectedRevision', 'discardCurrent', 'studyJson'],
        ),
        annotations: { readOnlyHint: false, untrustedContentHint: true },
        execute: wrap((input) => {
          const v = object(
            input,
            ['expectedRevision', 'discardCurrent', 'studyJson'],
            'Replacement input',
          );
          actions.current.guard(
            integer(
              v.expectedRevision,
              0,
              Number.MAX_SAFE_INTEGER,
              'Expected revision',
            ),
          );
          if (v.discardCurrent !== true)
            throw new Error('Explicit discardCurrent=true is required.');
          const candidate = studyJson(v.studyJson),
            next = actions.current.commit(
              candidate,
              'Study file applied. Field randomization is not independently verified.',
            );
          return {
            revision: next.revision,
            title: next.study.title,
            units: next.study.units.length,
            assignment: next.study.assignment.kind,
          };
        }),
      },
    ];
    for (const tool of tools)
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: lifecycle.signal }),
        ).catch(() => {
          if (!lifecycle.signal.aborted)
            setNotice(
              'Browser tools could not register; all visible controls remain available.',
            );
        });
      } catch {
        queueMicrotask(() => {
          if (!lifecycle.signal.aborted)
            setNotice(
              'Browser tools are unavailable; use the visible workspace controls.',
            );
        });
      }
    return () => lifecycle.abort();
  }, []);
  async function importFile(file: File | undefined, kind: 'json' | 'existing') {
    if (!file) return;
    let ticket: number | null = null;
    try {
      guard();
      if (file.size > MAX_FILE_BYTES)
        throw new Error('Choose a file no larger than 256 KiB.');
      ticket = ++fileJob.current;
      setWork('Reading local file');
      setError('');
      try {
        const text = await file.text();
        if (!mounted.current || ticket !== fileJob.current) return;
        const candidate =
          kind === 'json'
            ? studyJson(text)
            : importExisting(text, current.current.study);
        askReplace(
          candidate,
          kind === 'json'
            ? 'This replaces the current study, allocation and outcomes. Download your current study first if you need to keep it.'
            : 'This replaces the current roster and outcomes. Group counts are inferred from the CSV, not verified against an original protocol. Imported labels do not establish random assignment.',
        );
      } finally {
        if (mounted.current && ticket === fileJob.current) setWork('');
      }
    } catch (e) {
      if (ticket === null || ticket === fileJob.current) reportError(e);
    }
  }
  const cancel = () => {
    fileJob.current++;
    runner.current?.cancel();
    setWork('');
    setNotice('Operation cancelled. Previous study and result are unchanged.');
  };
  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      reportError(e);
    }
  };
  const study = state.study,
    locked = Boolean(busy) || Boolean(pending),
    protectedActions = locked || dirty || Boolean(pending),
    missing = ready(study);
  const kindText = {
    none: 'UNASSIGNED ROSTER',
    generated: 'GENERATED ALLOCATION / REPLAY CONSISTENT',
    imported: 'IMPORTED ASSIGNMENT / DESIGN UNVERIFIED',
    reference: 'REFERENCE STUDY / SYNTHETIC DATA',
  }[study.assignment.kind];
  return (
    <main>
      <a className="skip-link" href="#workspace">
        Skip to workspace
      </a>
      <header className="masthead">
        <a className="brand" href="#study">
          counter<span>balance</span>
        </a>
        <span className="series-mark">
          A FIELD GUIDE TO FAIR COMPARISONS / 010
        </span>
        <span className="local-badge">LOCAL WORKSPACE</span>
      </header>
      <div className="study-bar">
        <div>
          <p className="eyebrow">{kindText}</p>
          <h1 id="study">{study.title}</h1>
          <p>{study.question}</p>
        </div>
        <div className="study-number">
          <strong>{study.units.length}</strong>
          <span>units · {study.blocks.length} blocks · 2 groups</span>
        </div>
      </div>
      <div className="workspace-toolbar">
        <p className="fine">
          Browser memory only. No upload, account or autosave. Download a study
          file before leaving.
        </p>
        <div className="button-row">
          <Button
            variant="outline"
            disabled={locked}
            onClick={() =>
              safe(() =>
                download(
                  'counterbalance-study.json',
                  exportStudy(study),
                  'application/json',
                ),
              )
            }
          >
            Download study
          </Button>
          <Button
            variant="outline"
            disabled={protectedActions}
            onClick={() => jsonInput.current?.click()}
          >
            Open study
          </Button>
          <Button
            variant="outline"
            disabled={protectedActions}
            onClick={() => existingInput.current?.click()}
          >
            Import assigned CSV
          </Button>
          <Button
            variant="ghost"
            disabled={protectedActions}
            onClick={() =>
              safe(() => {
                guard();
                askReplace(
                  referenceStudy(),
                  'Replace your current study with the original synthetic teaching example? Current outcomes and results will be cleared.',
                );
              })
            }
          >
            Reference example
          </Button>
        </div>
      </div>
      <input
        ref={jsonInput}
        type="file"
        accept=".json,application/json"
        className="sr-only"
        tabIndex={-1}
        aria-label="Open local study file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          void importFile(f, 'json');
        }}
      />
      <input
        ref={existingInput}
        type="file"
        accept=".csv,text/csv"
        className="sr-only"
        tabIndex={-1}
        aria-label="Import assigned CSV file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          void importFile(f, 'existing');
        }}
      />
      <div className="status-strip">
        <output>
          {busy
            ? busy +
              (busy === 'Analyzing'
                ? ' · ' + progress.done + ' / ' + progress.total
                : '')
            : dirty
              ? 'Unapplied edits. Apply or discard them before changing phases.'
              : notice}
        </output>
        <span className="fine">Revision {state.revision}</span>
        {busy && (
          <Button variant="outline" onClick={cancel}>
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <p role="alert" className="error error-banner">
          {error}
        </p>
      )}
      {study.assignment.kind === 'imported' && (
        <p className="warning">
          Imported group counts are inferred, not verified. Use this analysis
          only if the original design assigned units uniformly with these fixed
          counts within each block. Observational labels alone cannot justify
          causal conclusions.
        </p>
      )}
      <Tabs
        id="workspace"
        value={phase}
        onValueChange={(v) => {
          if (!dirtyRef.current && !busyRef.current) setPhase(String(v));
        }}
      >
        <TabsList
          variant="line"
          className="phase-nav"
          aria-label="Study phases"
        >
          {[
            ['design', '01 / Design & assign'],
            ['outcomes', '02 / Record outcomes'],
            ['evidence', '03 / Examine evidence'],
          ].map(([value, label]) => (
            <TabsTrigger
              key={value}
              value={value}
              disabled={(dirty || locked) && phase !== value}
            >
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="design">
          <section className="assignment-workspace">
            <AllocationDiagram study={study} />
            <aside className="protocol-card">
              <p className="eyebrow">DESIGN BEFORE DISCOVERY</p>
              <h2>The assignment matters.</h2>
              <p>
                {allocationCount(study).toString()} legal allocations under the
                declared fixed-count design.
              </p>
              {study.assignment.kind === 'none' ? (
                <Button
                  disabled={protectedActions}
                  onClick={() =>
                    safe(() => {
                      guard();
                      const next = allocate(
                        study,
                        () => crypto.getRandomValues(new Uint32Array(1))[0],
                      );
                      commit(
                        next,
                        'Groups assigned. Download the study and allocation record before recording outcomes.',
                      );
                    })
                  }
                >
                  Randomly assign groups
                </Button>
              ) : (
                <Button
                  variant="outline"
                  disabled={protectedActions}
                  onClick={() =>
                    safe(() => {
                      guard();
                      askReplace(
                        resetRoster(study),
                        'Reset this study to an unassigned roster? This clears every outcome, the current assignment record and the result. A new assignment is a new design record, not a way to improve an existing result.',
                      );
                    })
                  }
                >
                  Reset to unassigned roster
                </Button>
              )}
              <div className="rule-note">
                <strong>
                  {study.assignment.kind === 'generated'
                    ? 'Replay record available'
                    : 'Do not retrofit randomization'}
                </strong>
                <p>
                  {study.assignment.kind === 'generated'
                    ? study.assignment.words.length +
                      ' consumed random words are stored in your study file, including rejected words. Replay checks consistency, not authenticity, blinding or field compliance.'
                    : 'Specify the roster, block membership and group counts before assigning groups. This workspace is not a preregistration service.'}
                </p>
              </div>
              <Button
                variant="outline"
                disabled={locked || study.assignment.kind === 'none'}
                onClick={() =>
                  safe(() =>
                    download(
                      'counterbalance-allocation.csv',
                      allocationCsv(study),
                      'text/csv',
                    ),
                  )
                }
              >
                Download allocation CSV
              </Button>
              <p className="fine">
                CSV includes committed outcomes when present. The random-word
                record lives in the JSON study file.
              </p>
            </aside>
          </section>
          <DesignForm
            key={state.revision + ':' + formKey}
            study={study}
            locked={locked}
            onDirty={markDirty}
            onDiscard={discard}
            onError={reportError}
            onApply={(candidate) =>
              safe(() => {
                guard(undefined, true);
                if (
                  candidate.assignment.kind === 'none' &&
                  JSON.stringify(candidate.units) !==
                    JSON.stringify(study.units)
                )
                  askReplace(
                    candidate,
                    'Replace the roster and clear all prior groups, outcomes and results?',
                  );
                else
                  commit(
                    candidate,
                    'Protocol applied. This note is editable, not preregistered.',
                  );
              })
            }
          />
        </TabsContent>
        <TabsContent value="outcomes">
          <div className="assignment-workspace">
            <OutcomesForm
              key={state.revision + ':' + formKey}
              study={study}
              locked={locked}
              onDirty={markDirty}
              onDiscard={discard}
              onError={reportError}
              onApply={(candidate) =>
                safe(() => {
                  guard(undefined, true);
                  commit(
                    candidate,
                    'Outcomes applied to the exact original roster.',
                  );
                })
              }
            />
            <aside className="protocol-card">
              <p className="eyebrow">DATA INTEGRITY</p>
              <h2>Missing is not zero.</h2>
              <p>
                {missing ??
                  'Every unit has a recorded outcome. The comparison is ready to run.'}
              </p>
              <div className="rule-note">
                <strong>Keep the original units</strong>
                <p>
                  No automatic row deletion, imputation or post-outcome
                  reallocation. Missing outcomes need a separately justified
                  method outside this tool.
                </p>
              </div>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() =>
                  safe(() =>
                    download(
                      'counterbalance-outcomes.csv',
                      outcomesCsv(study),
                      'text/csv',
                    ),
                  )
                }
              >
                Download outcomes template
              </Button>
              <p className="fine">
                The template includes current values. Edit them locally, then
                paste the full CSV into the editor.
              </p>
            </aside>
          </div>
        </TabsContent>
        <TabsContent value="evidence">
          <div className="assignment-workspace">
            <div>
              {state.result ? (
                <Evidence result={state.result} study={study} />
              ) : (
                <section className="analysis-empty">
                  <p className="eyebrow">NO RESULT YET</p>
                  <h2>A comparison, not a verdict.</h2>
                  <p>
                    Run the declared assignment design against a sharp,
                    common-effect hypothesis. The result includes a
                    block-weighted estimate, an absolute-tail randomization test
                    and an algebraically inverted confidence interval.
                  </p>
                  <p className="warning">
                    {missing ??
                      (study.assignment.kind === 'reference'
                        ? 'All outcomes are present. The reference study is synthetic; its result is for learning only.'
                        : 'All outcomes are present. Check the design assumptions before running your comparison.')}
                  </p>
                </section>
              )}
            </div>
            <aside className="protocol-card">
              <p className="eyebrow">ANALYSIS SPECIFICATION</p>
              <h2>Make the null explicit.</h2>
              <SettingsForm
                key={state.revision + ':' + formKey}
                settings={state.settings}
                locked={locked}
                canRun={!missing}
                onDirty={markDirty}
                onDiscard={discard}
                onError={reportError}
                onRun={(s) => {
                  const expectedJob = fileJob.current + 1;
                  void run(s, undefined, true).catch((e) => {
                    if (fileJob.current <= expectedJob) reportError(e);
                  });
                }}
              />
              {state.result && (
                <div className="report-actions">
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      safe(() =>
                        download(
                          'counterbalance-report.json',
                          JSON.stringify(
                            {
                              format: 'counterbalance-report-v1',
                              study,
                              result: state.result,
                              assumptions: [
                                'Actual uniform fixed-count randomization within blocks',
                                'Rows are actual randomization units',
                                'Complete outcomes; no interference',
                                'Constant additive effect for test and interval',
                                'One prespecified comparison; no selective seed or outcome search',
                              ],
                            },
                            null,
                            2,
                          ) + '\n',
                          'application/json',
                        ),
                      )
                    }
                  >
                    Download full report
                  </Button>
                  <Button
                    variant="outline"
                    disabled={locked}
                    onClick={() =>
                      safe(() =>
                        download(
                          'counterbalance-histogram.csv',
                          csv(
                            ['bin', 'lower', 'upper', 'count'],
                            state.result!.histogram.counts.map((count, i) => {
                              const h = state.result!.histogram;
                              return [
                                String(i + 1),
                                String(
                                  h.min +
                                    ((h.max - h.min) * i) / h.counts.length,
                                ),
                                String(
                                  h.min +
                                    ((h.max - h.min) * (i + 1)) /
                                      h.counts.length,
                                ),
                                String(count),
                              ];
                            }),
                          ),
                          'text/csv',
                        ),
                      )
                    }
                  >
                    Download plot counts
                  </Button>
                </div>
              )}
              <div className="rule-note">
                <strong>No hidden normal approximation</strong>
                <p>
                  Enumerate up to 50,000 legal allocations; otherwise use 10,000
                  seeded simulated allocations with replacement. Exact
                  arithmetic describes the calculation, not proof that a real
                  study followed its design.
                </p>
              </div>
            </aside>
          </div>
        </TabsContent>
      </Tabs>
      <section className="framing">
        <h2>
          Random assignment is a design.
          <br />
          <em>Not a label to add afterward.</em>
        </h2>
        <p>
          Built for learning and transparent small studies—not clinical,
          regulatory or high-stakes decisions. No result proves
          representativeness or checks interference. See the{' '}
          <a
            href="https://arxiv.org/abs/1607.00698"
            target="_blank"
            rel="noreferrer"
          >
            design-based foundations
          </a>{' '}
          and{' '}
          <a
            href="https://link.springer.com/article/10.1007/s11749-017-0571-1"
            target="_blank"
            rel="noreferrer"
          >
            random-permutation testing principles
          </a>
          .
        </p>
      </section>
      <footer>
        <span>SKAI-LINE / WORLD BUILD 010</span>
        <span>COUNTERBALANCE · DESIGN BEFORE DISCOVERY.</span>
      </footer>
      <AlertDialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Replace current study data?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current study</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                safe(() => {
                  const value = pendingRef.current;
                  if (!value) return;
                  closeDialog();
                  commit(
                    value.study,
                    'Replacement applied. Previous data is no longer in this workspace.',
                  );
                })
              }
            >
              Replace data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
