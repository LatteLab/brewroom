# Brewroom

Latte Lab's public website and member tools share one pnpm workspace. Each app has its own deployment and configuration.

| App | Purpose | Local URL | Production |
| --- | --- | --- | --- |
| [Cafe](apps/cafe/README.md) | Public website, team, scrapbook, and joining the club | http://localhost:3000 | https://lattelab.org |
| [Portal](apps/portal/README.md) | Profiles, events, registration, check-in, and admin tools | http://localhost:3001 | https://app.lattelab.org |

## First-time setup

Ask the team lead for access to the LatteLab GitHub organization. Install Node 24.10.0 from `.nvmrc` and pnpm 10.24.0 from `package.json`.

```sh
git clone https://github.com/LatteLab/brewroom.git
cd brewroom
# If you use nvm:
nvm install
nvm use
npm install --global pnpm@10.24.0
pnpm install --frozen-lockfile
pnpm dev:cafe
```

Cafe needs no credentials. To work on the portal, follow its [environment setup](apps/portal/README.md#environment), then run `pnpm dev:portal` in a second terminal. Both servers can run at once.

Environment files belong inside the relevant app directory. Obtain development credentials through the team's private channel, not an issue or pull request.

## Everyday commands

Run these from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev:cafe` | Start Cafe on port 3000 |
| `pnpm dev:portal` | Start the portal on port 3001 |
| `pnpm build` | Build both apps; portal environment configuration is required |
| `pnpm lint` | Lint both apps |
| `pnpm typecheck` | Generate Next route types and check both apps |
| `pnpm test` | Run Cafe's gallery tests; the portal has no automated test suite yet |
| `pnpm --filter @lattelab/cafe build` | Build only Cafe |
| `pnpm --filter @lattelab/portal build` | Build only the portal |

Add dependencies to the app that needs them, for example `pnpm --filter @lattelab/portal add <package>`. Commit the root `pnpm-lock.yaml` with dependency changes. Run `pnpm install --frozen-lockfile` after pulling updates. Do not create app-level lockfiles.

Both apps use Google fonts through Next.js. The first build needs network access to fetch fonts.

## Contributing

1. Create a branch from `main` and make a focused change in the relevant app.
2. Read the root and app-specific `CLAUDE.md` instructions.
3. Run the checks above. For UI changes, also check mobile layouts, keyboard navigation, and the affected flow in a browser.
4. Open a pull request explaining the behavior change and verification. Ask for help with auth, production data, or unfamiliar code.

Database changes and email sends are separate operations. Installation and builds do not perform them. Coordinate schema changes with the team lead and verify the database target before running migrations.

## Where to look

- `apps/cafe/content/` contains public site content.
- `apps/portal/app/` contains member and admin pages and server actions.
- `apps/portal/lib/db/` contains the schema and queries.
- [Deployment handoff](docs/deployment.md) covers both Vercel projects.
- [Migration record](docs/monorepo-migration.md) records source commits and existing feature work.

Start with plain pnpm scripts. Add Turbo after both deployments work from this layout. Add shared packages only for code the apps actually share.
