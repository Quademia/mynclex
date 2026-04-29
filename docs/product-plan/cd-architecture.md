# MyNclex — CD Architecture

*Living document. Updates whenever the deploy pipeline changes.*
Last updated: 2026-04-29 (GHA-based CD landed; legacy CF Workers Builds disconnected)

---

## The Big Picture

Two Cloudflare accounts, by design:

- **Personal CF account** = the **dev** box. Hosts the `mynclex-dev`
  Worker. Connected to the dev Supabase database. This is what you
  test with.
- **Workspace CF account** (`qacademynurses`) = the **prod** box.
  Hosts the `mynclex` Worker. Connected to the prod Supabase database.
  This is what real users hit, at `mynclex.qacademynurses.workers.dev`.

The two boxes never share data. Dev experiments can't touch prod.

GitHub holds the **one** repo (`QAcademy-Nurses/mynclex`). One source
of truth, two deploy targets.

A neutral third place — **GitHub Actions** — does all the building and
deploying. CF accounts are just hosts; they don't build anything
themselves.

## How a Deploy Happens

### Dev path — push to `main`

```
git push origin main
        ↓
GitHub fires push event
        ↓
deploy-dev.yml workflow runs on a GitHub Actions runner
        ↓
  1. Checkout repo
  2. Install dependencies (npm clean-install)
  3. Build the OpenNext bundle (npm run cf:build)
  4. Deploy via wrangler-action using CLOUDFLARE_API_TOKEN_DEV
        ↓
mynclex-dev Worker on personal CF updates
        ↓
Dev URL serves the new code
```

### Prod path — push (or PR-merge) to `prod`

```
git push origin prod   (or merge a PR from main → prod via GitHub UI)
        ↓
GitHub fires push event
        ↓
TWO workflows run in parallel:
        ├── deploy-prod.yml         → builds, deploys via
        │                            CLOUDFLARE_API_TOKEN_PROD with
        │                            wrangler deploy --env prod
        │
        └── migrate-prod.yml        → applies any pending Supabase
                                     migrations via Supabase CLI
        ↓
mynclex Worker on workspace CF updates + prod Supabase migrations applied
        ↓
mynclex.qacademynurses.workers.dev serves the new code
```

Both paths run on a fresh GitHub Actions runner. No state persists
between deploys; every build is from a clean checkout of git.

## Where Each Piece Lives

This is the most important table. The whole reason we're on GHA is that
**everything below is in git** — no more dashboard config that can
drift silently.

| Piece | Lives in | Editable how |
|---|---|---|
| Worker name + env config | `wrangler.jsonc` | Edit + commit |
| Account ID pinning | `wrangler.jsonc` (`account_id`) | Edit + commit |
| Build command | `package.json` (`cf:build` script) | Edit + commit |
| Deploy command | `.github/workflows/deploy-*.yml` | Edit + commit |
| What branch triggers what | `.github/workflows/deploy-*.yml` (`on: push: branches:`) | Edit + commit |
| Public Supabase URL + anon key | `wrangler.jsonc` (per env) | Edit + commit |
| Supabase service role key | CF Worker secret (`wrangler secret put`) | CLI command |
| CF API tokens | GitHub Secrets (`CLOUDFLARE_API_TOKEN_DEV/PROD`) | GitHub UI → repo settings |
| Supabase access token (for migrations) | GitHub Secrets (`SUPABASE_ACCESS_TOKEN`) | GitHub UI → repo settings |

The only things NOT in git are secrets — by necessity. Everything else
is committed YAML/JSON.

## The Locks (Defence in Depth)

Three independent mechanisms guard against a wrong-account or
wrong-environment deploy:

**1. API token scope.** Each CF API token is created with "Account
Resources: this specific account" set explicitly. The token
**cannot** act on the other CF account, ever. This is the strongest
lock — it's enforced by Cloudflare's auth layer.

**2. Account ID pinning in `wrangler.jsonc`.** The file declares which
account each environment belongs to (top-level = personal,
`env.prod` = workspace). If wrangler is somehow given the wrong
token, the file refuses to deploy because the IDs don't match.

**3. Branch → workflow mapping.** Each workflow only fires for one
branch (`main` for dev, `prod` for prod). A push to `main` cannot
trigger the prod workflow even if everything else were misconfigured.

## Account & URL Reference

| | Personal CF (dev) | Workspace CF (prod) |
|---|---|---|
| Account ID | `e745e37017141bd5dfa1183b5dc1aa48` | `38efec172a6a35b1928ffbd96003c21d` |
| Worker name | `mynclex-dev` | `mynclex` |
| Live URL | `mynclex-dev.<personal>.workers.dev` | `mynclex.qacademynurses.workers.dev` |
| Branch | `main` | `prod` |
| GHA workflow | `deploy-dev.yml` | `deploy-prod.yml` |
| API token (GitHub Secret) | `CLOUDFLARE_API_TOKEN_DEV` | `CLOUDFLARE_API_TOKEN_PROD` |
| Supabase project | `xkqxfzfsllxyxpdtcrja` (dev) | `dehspjcfmhoshcdtsmjq` (prod) |

## Common Operations

### Deploy a code change to dev

```bash
git push origin main
```

That's it. GHA handles the rest. Watch progress at
`https://github.com/QAcademy-Nurses/mynclex/actions`.

### Deploy a code change to prod

Two equivalent options:

**Option A — direct push:**
```bash
git push origin main:prod   # or git push origin prod from a prod checkout
```

**Option B — PR merge (recommended for changelog):**
1. Open `https://github.com/QAcademy-Nurses/mynclex/compare/prod...main`
2. Create PR, then click "Merge pull request"

Either way, both `deploy-prod.yml` and `migrate-prod.yml` fire in
parallel.

### Rotate a CF API token

If a token leaks or you want to rotate periodically:

1. CF dashboard for the relevant account → Profile → API Tokens
2. Find the existing token, click **Roll** (creates a new value, same
   permissions, same scope) — or **Delete** and create a fresh one
3. Copy the new token
4. GitHub repo Settings → Secrets and variables → Actions
5. Find the matching secret (`CLOUDFLARE_API_TOKEN_DEV` or `_PROD`),
   click **Update**, paste the new value

Next deploy uses the new token automatically. No code change needed.

### Add a new environment (e.g., staging)

Pattern is reusable. To add a `staging` environment that auto-deploys
from a `staging` branch:

1. **CF side:** decide which account hosts staging (probably workspace
   for prod-like behaviour, or a third account if isolating further)
2. **`wrangler.jsonc`:** add `env.staging` with the staging Worker name
   + Supabase URL + `account_id` pinning
3. **CF dashboard:** create a CF API token scoped to that account, save
   as a new GitHub Secret (`CLOUDFLARE_API_TOKEN_STAGING`)
4. **New workflow:** copy `deploy-prod.yml` to `deploy-staging.yml`,
   change the trigger branch, the secret name, and the deploy command
   (`wrangler deploy --env staging`)
5. Push to `staging` branch — first deploy creates the new Worker

### Investigate a deploy that didn't fire

1. Check `https://github.com/QAcademy-Nurses/mynclex/actions` —
   was the workflow attempted? If not, did the push actually reach the
   right branch?
2. Check the workflow run's logs — failed step gives the reason
3. Common failures:
   - API token expired or rotated without updating secret → 401 from CF
   - `wrangler.jsonc` account_id changed without updating CF token's
     scope → wrangler refuses to deploy (pinning lock firing)
   - Build error (TypeScript, missing dep) → fix in code

### Investigate a deploy that succeeded but the URL still shows old code

Cloudflare propagates deploys near-instantly, but cache can mask it.
Hard-refresh the browser (Ctrl+Shift+R / Cmd+Shift+R). If still wrong,
check the workflow's deploy step log — it shows the deployed Version
ID, which can be cross-referenced in the CF dashboard.

## History

### Why we're on GHA, not CF Workers Builds

Pre-2026-04-29, both CF accounts had Cloudflare's native Workers
Builds GitHub integration enabled. Each watched its own branch and ran
build/deploy commands stored in the CF dashboard.

This produced two classes of bug we've now eliminated:

**1. The dashboard-drift bug.** The deploy command on workspace CF
silently changed from `npx wrangler deploy --env prod` to bare
`npx wrangler deploy` between 2026-04-28 and 2026-04-30 — cause
unknown, no audit trail. Without the account_id pinning catching it,
the broken command would have shipped dev Supabase config to the prod
Worker.

**2. The webhook-trigger asymmetry.** Direct `git push` to `prod` did
not fire workspace CF's auto-deploy reliably (only PR merges via
GitHub UI did). This meant prod was easy to forget about — the user
would push to prod, see no deploy, and resort to a manual
`wrangler deploy` from their laptop, which then routed to the wrong
account because of bug #1.

GHA fixes both: the deploy commands live in YAML in git (no drift
possible without a commit), and GHA listens to GitHub events directly
(no CF webhook quirk).

### What changed on 2026-04-29

- Added account_id pinning to `wrangler.jsonc` for both envs
- Created scoped CF API tokens, stored as GitHub Secrets
- Added `deploy-dev.yml` and `deploy-prod.yml` workflows
- Verified both workflows green (dev on push, prod on PR merge)
- Disconnected legacy CF Workers Builds connections on both accounts
- Deleted the phantom `mynclex` Worker on the personal account that
  was created by an accidental cross-account manual deploy
