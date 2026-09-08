# Validation record

Validated 2026-09-08 with Node 22.20.0. This is a bounded educational/research-support tool, not certified statistical software.

## Automated suite

The npm test command passes 17 groups covering:

- Decimal bounds/canonicalization and rejection of coercion, exponents and excess precision.
- Exact-key schema validation, duplicate IDs, partial assignments, wrong counts and sparse-array regressions.
- Strict CSV quoting/headers/row widths, BOM/CRLF and byte limits.
- JSON, roster, assigned-data and outcome round trips; imported design remains unverified.
- Exact-ID outcome matching, reordered rows, missing values retained, omitted/duplicate IDs rejected.
- Rejection sampling, full uint32 bounds and recorded allocation replay.
- Official PCG seed 42/selector 54 vector and exact combinatorics.
- Asymmetric absolute-tail oracle p=1/3, not 2/3.
- Six matched pairs with differences 1…6: estimate 3.5 and closed 95% interval [1,6], including immediately adjacent six-decimal hypotheses.
- Five matched pairs: an unbounded 95% set; six all-zero pairs: [0,0], p(0)=1 but p(1)=2/64.
- 120 generated blocked designs against independent direct-mean/tail calculations.
- 10,000-draw reproducibility, observed correction, histogram accounting and interval invariance across null hypotheses.
- Maximum 200-unit/20-block decimal inputs, finite displays and JSON-safe rational results.
- Worker overlap rejection, cancellation, stale replies, disposal, startup/posting/malformed-response failure.
- Source-level presence checks for cleanup, revision/draft guards and Vite worker imports. These are not substitutes for browser execution.

## Independent numerical review

A separate read-only reviewer checked the actual implementation:

- 13 hand/exhaustive fixtures: 607 exact tail comparisons, 39 interval comparisons and 13 enumeration comparisons.
- 30 additional six-decimal fixtures: 120 tails, 90 intervals and 90 shift/scale/arm-flip invariants.
- 40,000 PCG words across four seeds against a separately implemented generator.
- Three independently recreated 10,000-draw banks, each checked at three null effects. Duplicate multiplicity and the added observed interval matched.
- 40 malformed inputs, the 50,000/50,388 branch boundary and maximum 200-unit configurations.

The reviewer found sparse array holes skipped by JavaScript map/every. The parser now spreads arrays before validating every entry, so holes become invalid undefined values. Regression tests cover unit/block/transcript holes. A tested 200-unit/20-block Monte Carlo case took roughly 1 second in Node on this development machine; this is not phone/browser benchmarking.

Before implementation, an independent exact-rational proof probe also checked 1,615 point-test/interval-count comparisons and 6,460 interval-membership comparisons across exhaustive and sampled banks. These were design checks, distinct from the actual-code review above.

## Independent workflow review

CSV/JSON round trips and cancellation ownership were reviewed. Findings fixed: a portaled confidence selector needed an explicit lock, stale cancelled-file errors needed operation ownership, complete user studies needed non-synthetic wording, and report-button JSX closures needed correction. Analysis tickets also prevent an older cancelled job from clearing a newer job's busy state. Follow-up review confirmed every finding closed; cancelled-read/restarted-import and cancelled-analysis/restarted-analysis probes passed.

## Focused live browser-tool check

All three optional tools registered with expected schemas and read/mutation annotations. A real Web Worker analysis on the synthetic reference produced estimate 5/6, p 5/27, 95% interval [0,2], 216 allocations and 40 extremes. The visible result and readback matched.

Unknown read fields, stale analysis revision, invalid study JSON and a visible unfinished null-effect edit failed without altering revision 1 or its committed result. A valid study replacement changed the visible title, cleared the result and advanced revision 2. The original reference was restored at revision 3 with no unfinished edits or active job.

## Build and release checks

Type checking and authored-code lint pass. Installed UI components/hooks are unmodified and excluded from the authored-code lint command; their upstream lint findings are not claimed resolved. Static build and release scanning verify the page, compiled worker, static configuration, and absence of high-confidence credential patterns. Public-mode scanning additionally checks private hosting metadata.

Pinned updates: React family 19.2.8, Vite 8.0.16, plugin-rsc 0.5.29, ws 8.21.0 and undici 7.29.1. The starter's automatic install reported 11 vulnerabilities before these targeted changes. A new dependency audit was not authorized, so this release does **not** claim an audit-clean dependency graph. The package update completed; a locked old native-binary cleanup warning during the then-running preview was nonfatal, and the preview was restarted afterward.

## Explicit exclusions

No broad screenshot/visual QA, physical-phone testing, screen-reader certification, clinical validation, empirical coverage simulation, authentication workflow, cross-browser matrix, long-running stress certification or independent security penetration test was performed. No claims of study authenticity, participant privacy compliance, calibration or general causal identification are made.
