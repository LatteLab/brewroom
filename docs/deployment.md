# Separate Vercel deployments

Cafe and Portal use separate Vercel projects connected to `LatteLab/brewroom`. Cafe uses `apps/cafe`; the Brewroom project serves Portal from `apps/portal`. Keep secrets and service configuration scoped to the app and environment that use them.

## Automatic deployments

Push application changes to `LatteLab/brewroom`. The standalone `LatteLab/cafe` repository is historical and is no longer connected to the production website.

- A push to Brewroom `main` triggers production deployments through Vercel's Git integration. After a successful build, Vercel assigns the project's production domains.
- Other branches create preview deployments. They do not replace the production site.
- Cafe deploys from `apps/cafe` to `lattelab.org`. The Vercel project named `brewroom` deploys Portal from `apps/portal` to `app.lattelab.org`.

One push can trigger both projects. Vercel can skip unaffected projects according to their monorepo and ignored-build settings. On November 10, 2026, both projects automatically deployed Brewroom commit `2f56a82` successfully. No manual Vercel deployment was needed.

GitHub's workspace checks and Vercel's builds run separately. A successful Git push confirms that GitHub received the commit. To confirm a release, check that the relevant Vercel deployment has the same commit SHA, is `READY`, and has its production domain assigned.

## Diagnose a missing or failed deployment

1. Run `git remote get-url origin` and confirm that it points to `LatteLab/brewroom`.
2. Run `git branch --show-current` and `git rev-parse HEAD`. Confirm that the intended commit reached remote `main` for production.
3. If Vercel has no matching deployment, inspect the project's connected repository, production branch, Git deployment settings, and ignored-build settings. Use the app's root directory from the table below.
4. If a deployment exists and failed, inspect that deployment's build logs. A local build error alone does not establish a Vercel failure.
5. If the deployment is `READY` but the site looks stale, check its domain assignments and test the affected production URL.

### Local build restrictions

Both apps use `next/font/google`. A build without cached fonts needs outbound access to Google Fonts. Next.js downloads and bundles the fonts during the build; visitors receive the fonts from the deployment. If a local build cannot fetch fonts, allow network access for the build or configure the environment's approved proxy. See [Next.js font optimization](https://nextjs.org/docs/app/getting-started/fonts).

If a restricted local environment reports a Turbopack `EPERM` error while binding a port, verify Cafe with `pnpm --filter @lattelab/cafe build --webpack`. This command uses webpack for that invocation. Keep the normal Vercel build command unless its own logs show a problem.

See [Vercel's Git deployment documentation](https://vercel.com/docs/git) for production and preview behavior.

## Configuration reference

These are the monorepo's intended settings. Inspect the current project before changing overrides; this guide is not a live Vercel snapshot.

| Setting | Cafe project | Brewroom project |
| --- | --- | --- |
| Git repository | `LatteLab/brewroom` | `LatteLab/brewroom` |
| Root Directory | `apps/cafe` | `apps/portal` |
| Framework Preset | Next.js | Next.js |
| Node.js version | 24.x | 24.x |
| Environment variable in Preview and Production | `ENABLE_EXPERIMENTAL_COREPACK=1` | `ENABLE_EXPERIMENTAL_COREPACK=1` |
| Install Command | `pnpm install --frozen-lockfile` | `pnpm install --frozen-lockfile` |
| Build Command | `pnpm build` | `pnpm build` |
| Output Directory | Next.js default | Next.js default |
| Include source files outside Root Directory in the Build Step | Enabled | Enabled |
| Production branch | `main` | `main` |

Build commands run in each app directory. Do not use the root recursive build as a project's build command. Enable Corepack so the root `packageManager` selects pnpm 10.24.0; without it, an explicit pnpm install override can select Vercel's oldest installed pnpm. Confirm version 10.24.0 in each preview build log. The root lockfile covers both apps. Clear old npm install overrides. Keep environment values scoped to the existing project and environment. See [Vercel's package-manager guidance](https://vercel.com/docs/package-managers) and [Corepack setup](https://vercel.com/docs/builds/configure-a-build#corepack).

## Release an application change

1. Run the affected app's checks from the repository root. Run the separate POS test commands when POS changes; root `pnpm test` covers Cafe only.
2. Check for schema dependencies. Follow the [Portal database migration guide](../apps/portal/docs/database-migrations.md) and apply reviewed compatible additions before releasing code that reads them. Builds do not migrate databases.
3. Publish the code using the requested review workflow. The production branch is `main`; preview checks establish build results, not complete service verification.
4. Within the requested verification scope, check the relevant production domain and affected flow. Use development data for writes unless production testing was explicitly authorized.
5. Report separately whether the code was merged, migrations were applied, deployment completed, and production behavior was tested. If deployment monitoring is excluded, leave that outcome unconfirmed.

Portal uses its existing production auth callbacks and Resend webhook URL. Do not change those for an ordinary code release. POS is admin-only and needs no cashier email configuration.

## Historical monorepo cutover

The initial cutover is complete. Keep this checklist for reference when restoring pre-monorepo code or investigating the import; do not repeat it during an ordinary release.

1. Record each project's current repository, root, commands, Node version, environment-variable names, and production deployment. Keep secret values in Vercel.
2. Coordinate settings changes with the merge. Do not build old main using new paths, or the monorepo using the old root. Pause automatic production deployments during the switch if needed; the existing deployment can continue serving.
3. Merge with **Create a merge commit**. Do not squash or rebase the migration PR, because Cafe's original ancestry must remain reachable.
4. Apply the settings above. Reconnect Cafe to `LatteLab/brewroom`. Keep both existing projects and domains.
5. Build previews for both apps. Use development services for the portal preview, including matching auth URLs and Google callbacks. Check mobile navigation and the gallery on Cafe; check sign-in, a member page, and an admin page on the portal.
6. Build production using each project's existing production variables. Verify the original domains, then resume automatic deployment.

The monorepo import itself required no database migration. Later application features, including POS, have their own reviewed SQL migrations.

Detailed Vercel settings were inaccessible when this cutover checklist was first prepared. That limitation describes preparation, not current project status.

## Rollback

Restore the previous successful deployment for the affected project. If returning to pre-monorepo code, also restore its previous repository and root/build settings. Reverting Git alone does not restore Vercel configuration. Keep the original Cafe repository available until cutover is stable.

See [Vercel's monorepo documentation](https://vercel.com/docs/monorepos). The workspace currently uses plain pnpm scripts without Turbo.
