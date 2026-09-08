# Public release — COUNTERBALANCE

Published and verified 2026-09-08.

- [Full free public app](https://skailiner-counterbalance.static.hf.space/index.html)
- [Public GitHub source](https://github.com/skailiner/counterbalance)
- [Hugging Face source and app](https://huggingface.co/spaces/skailiner/counterbalance)

This is the complete local-data app, not a landing page or limited practice sample. No account, study-data upload, AI key or new paid service is required. Browser-memory data must be exported before leaving.

## Functional release provenance

GitHub functional source: ce381614ced385978a8b820dc766c2b37321ac6b.

Hugging Face functional release: 5a208cf67dad8670c7e1fcd7e5eb1a95af07e941. Both remote branch heads were verified after push. Later documentation-only commits do not alter the app artifacts.

The public source snapshot was sanitized before its first public commit. Private hosting identifiers, private origins and source credentials are absent. Hugging Face retains its initial repository history. Its placeholder was replaced with the full app; the unused starter stylesheet was removed and remains recoverable from that initial history. Inherited large-file attribute rules were preserved with normalized line endings.

Hugging Face initially rejected an unsupported display-card color. It was changed to an allowed value in a follow-up commit; no application behavior changed.

## Public verification

- Anonymous HTTP 200 for the full app.
- Deployed HTML matched the public build after removing only the known platform-injected creator-ID script.
- Normalized HTML SHA256: 2a4d27406bc16191916e958f56a3b3c111656008c001da2599aee44d76707c2a.
- Three entry scripts and the analysis worker returned HTTP 200 and matched the public build byte-for-byte.
- All 19 static artifacts matched the local public build before upload; 109 tracked files were scanned for private metadata and credential-like material.
- Production browser tools registered on the public origin. A real worker calculation at null effect 1 produced estimate 5/6, p=1 and 95% interval [0,2]; visible values and readback agreed.
- Restoring null effect 0 produced p=5/27. The original reference and default settings were then restored at revision 3, with no result, unfinished draft or active operation.

## Validation and limits

17 automated groups pass, plus independent numerical and asynchronous-workflow reviews. See TESTING.md for exact coverage, fixes and exclusions. The method and interval assumptions are explicit in METHOD.md. No clean dependency-audit claim, physical-phone test, screen-reader certification or high-stakes statistical certification is made.

An additional owner-private Sites copy deployed successfully. Public Sites access was not enabled; use the free public app above for sharing. Private receipts are retained only in an ignored local file.

