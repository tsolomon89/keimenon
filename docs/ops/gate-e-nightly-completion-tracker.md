# Gate-E Nightly Completion Tracker

Use this file as the source content for the issue/comment stream titled:

`Gate-E nightly completion tracker`

## Daily Update Procedure

1. Download the `gate-e-evidence` artifact from the scheduled nightly run.
2. Place artifacts under `test-results/ops` and `test-results/perf`.
3. Validate nightly package:

```bash
npm run ops:gate-e:nightly:validate -- --require-streak
```

4. Generate tracker entry markdown:

```bash
npm run ops:gate-e:nightly:tracker -- --run-url "<workflow-run-url>" --append-to docs/ops/gate-e-nightly-completion-tracker.md
```

5. Paste the generated block into the tracking issue comment for the day.

## Tracker Entries
