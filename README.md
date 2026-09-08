# COUNTERBALANCE

[Open the free public app](https://skailiner-counterbalance.static.hf.space/index.html) · [GitHub source](https://github.com/skailiner/counterbalance) · [Hugging Face](https://huggingface.co/spaces/skailiner/counterbalance)

A free, browser-local lab for designing fair comparisons and examining what their results support. World Build 010 by SKAI-LINE.

## Use it

1. Explore the explicitly synthetic teaching study, or replace its roster under **Design & assign**.
2. Specify the question, outcome unit, group names, blocks and fixed group B counts. Use pseudonymous IDs for actual randomization units.
3. Randomly assign an unassigned roster. Download the study file and allocation CSV before collecting outcomes.
4. Enter the complete id,outcome CSV. Blank outcomes remain missing and stop inference; zero is valid.
5. Run the comparison. Inspect the block-weighted estimate, absolute-tail test, constant-effect interval and assumptions.
6. Download the study JSON to continue later, or the full report JSON to retain inputs, exact fractions and settings.

Existing assigned data can be imported as id,block,group,outcome, with group values A/B. Its group counts are inferred, not verified against an original design. Importing labels does not establish randomized assignment.

## Data and limits

- No account, API key, AI call, study-data upload, paid compute, database or autosave. Data stays in browser memory; reloading loses unsaved work. Exported files contain the study's data.
- 2–200 units, 1–20 blocks, both groups represented within each block.
- Outcomes/null effects are decimal strings, at most six fractional places and magnitude ≤1,000,000. No exponents, separators, implicit numeric conversion or silent rounding.
- CSV/JSON files are limited to 256 KiB. Unit IDs and block names are validated; duplicates and unknown/missing IDs fail without changing committed data.
- Generated assignments include a replayable random-word transcript. It proves computational consistency only—not authenticity, blinding, concealment, preregistration or actual field compliance.
- Modern browser with BigInt, Web Workers and Web Crypto required. No offline-install/PWA claim.

## Interpretation

Inference assumes actual uniform fixed-count randomization within the declared blocks, appropriate randomization units, complete outcomes and no interference. The sharp null and interval assume the same additive effect on every unit. This is not a general heterogeneous average-effect confidence interval, a medical decision tool, or evidence of population representativeness.

At most 50,000 legal allocations are enumerated. Larger designs use 10,000 seeded, with-replacement simulated allocations with a +1 observed-allocation correction. Exact rational arithmetic on accepted decimals does not make the Monte Carlo bank full enumeration.

Read [METHOD.md](METHOD.md), [TESTING.md](TESTING.md) and [PROJECT.md](PROJECT.md).

## Run locally

Node ≥22.13 is required; validation used Node 22.20.0.

    npm ci --no-audit
    npm run dev -- --host 127.0.0.1 --port 4183

Checks:

    npm test
    npm run lint
    npx tsc --noEmit
    npm run build
    npm run check:release

The build produces a complete static app in dist/client. A public source snapshot has no private hosting project ID; add your own hosting registration only when deploying your own Site. The --public release-check option additionally rejects private hosting metadata.

The interface uses React, Vite/vinext and installed Base UI/shadcn primitives. The statistical engine, file validation, diagrams and tests are project-specific. Lint is scoped to authored code; installed UI components are not edited. Dependency scan limitations are documented in TESTING.md.

## Browser tools

When the browser supports WebMCP, three optional tools expose the same workspace: read_comparison_lab, analyze_comparison, replace_study_file. Mutations require the current revision and refuse unfinished edits, open confirmations and overlapping work. Replacing a study requires explicit discardCurrent=true. Unsupported browsers retain all visible controls.

## Credits

PCG-XSH-RR follows M. E. O'Neill's published algorithm and initialization convention; this project's TypeScript implementation is checked against the official reference sequence. Research sources and the custom interval derivation are documented in METHOD.md. The bundled teaching data is original synthetic data, not measurements of learners.
