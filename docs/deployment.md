# Separate Vercel deployments

Keep the existing Cafe and Brewroom Vercel projects. Both will read `LatteLab/brewroom`, with different application roots. This migration does not change Vercel settings, domains, secrets, or databases.

## Settings to apply

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

## Cutover checklist

1. Record each project's current repository, root, commands, Node version, environment-variable names, and production deployment. Keep secret values in Vercel.
2. Coordinate settings changes with the merge. Do not build old main using new paths, or the monorepo using the old root. Pause automatic production deployments during the switch if needed; the existing deployment can continue serving.
3. Merge with **Create a merge commit**. Do not squash or rebase the migration PR, because Cafe's original ancestry must remain reachable.
4. Apply the settings above. Reconnect Cafe to `LatteLab/brewroom`. Keep both existing projects and domains.
5. Build previews for both apps. Use development services for the portal preview, including matching auth URLs and Google callbacks. Check mobile navigation and the gallery on Cafe; check sign-in, a member page, and an admin page on the portal.
6. Build production using each project's existing production variables. Verify the original domains, then resume automatic deployment.

The repository change does not require new production domains, OAuth callbacks, or Resend webhook URLs. Verify these still use the portal's existing production URL. No database migration is needed.

Detailed Vercel settings were inaccessible during preparation. Inspect existing overrides before applying this table. Git-triggered previews may fail with the old root until configuration is updated.

## Rollback

Restore the previous successful deployment for the affected project. If returning to pre-monorepo code, also restore its previous repository and root/build settings. Reverting Git alone does not restore Vercel configuration. Keep the original Cafe repository available until cutover is stable.

See [Vercel's monorepo documentation](https://vercel.com/docs/monorepos). Add Turbo after plain pnpm builds and both deployments are verified.
