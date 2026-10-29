# Brewroom workspace

Latte Lab's public website and member portal share this repository and deploy separately.

- `apps/cafe` is the public website at lattelab.org. Read `apps/cafe/CLAUDE.md` and `AGENTS.md` for design and content guidance.
- `apps/portal` is the member and admin app at app.lattelab.org. Read `apps/portal/CLAUDE.md` for auth, data, and workflow rules.

Use Node from `.nvmrc` and pnpm from `package.json#packageManager`. Install once at the root with `pnpm install --frozen-lockfile`. Commit only the root `pnpm-lock.yaml`. Keep each app's framework versions, configuration, and dependencies independent.

Run `pnpm dev:cafe` on port 3000 or `pnpm dev:portal` on port 3001. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` for verification. The root test command covers Cafe's gallery tests. Run `pnpm --filter @lattelab/portal test:pos` for Portal's POS domain tests; its `test:pos:db` command requires the disposable loopback database described in the Portal README.

Environment files belong inside the app that uses them. Never copy portal credentials into Cafe or the workspace root. Database commands must run through `pnpm --filter @lattelab/portal` so Drizzle resolves the portal's environment and schema. Installation and builds must not run migrations or send email.

Keep contribution instructions in `README.md`, deployment instructions in `docs/deployment.md`, and migration provenance in `docs/monorepo-migration.md`. App-specific historical plans remain inside each app. Add shared packages only when existing code needs them. Turbo is deferred until the pnpm workspace and deployment cutover are verified.
