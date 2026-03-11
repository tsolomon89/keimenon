# Branch Protection Required Checks (Gate-E)

Scope: `main` branch protection policy.

The following status checks are the canonical Gate-E merge gate and must be required on `main`:

1. `Full E2E (Chromium)`
2. `LOD Burn-in (10k/50k)`
3. `Rollout/Rollback Drill`

## Rationale

These checks collectively enforce:

1. End-to-end product path reliability.
2. LOD performance budget gates at 10k/50k tiers.
3. Rollout/rollback and kill-switch regression safety.

## Verification Checklist

1. Branch protection is enabled on `main`.
2. All three checks above are marked as required.
3. Merge is blocked when any required Gate-E check fails.

## Apply From CLI

Use a GitHub token with repository admin permissions:

```bash
export GH_TOKEN=<admin_token>
npm run ops:branch-protection:apply
npm run ops:branch-protection:verify
```

Optional flags:

1. `--repo owner/repo`
2. `--branch main`
3. `--checks "Full E2E (Chromium),LOD Burn-in (10k/50k),Rollout/Rollback Drill"`
