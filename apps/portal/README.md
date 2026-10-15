# Member portal

Latte Lab's member and admin app at [app.lattelab.org](https://app.lattelab.org). It handles profiles, events, registration, lotteries, check-in, and email blasts. The public site lives in [../cafe](../cafe/README.md).

## Environment

After the [root installation steps](../../README.md), copy the template from the repository root.

```sh
cp apps/portal/.env.example apps/portal/.env.local
```

Ask the team lead for development database, authentication, storage, and email configuration. Fill in `.env.local` before running the app. The empty template is a checklist, not a working build configuration.

| Variables | Purpose |
| --- | --- |
| `DATABASE_URL` | Development PostgreSQL connection used by Drizzle |
| `AUTH_SECRET` | Local Auth.js signing secret; generate with `openssl rand -base64 32` |
| `AUTH_URL`, `NEXT_PUBLIC_APP_URL` | Use `http://localhost:3001` locally |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google OAuth; register `http://localhost:3001/api/auth/callback/google` as a development callback |
| `AUTH_RESEND_KEY`, `EMAIL_FROM` | Resend magic-link login and verified sender |
| `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` | Email blasts and delivery-event verification |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Development storage project and browser-safe anon key |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | Development analytics project and host |
| `POSTHOG_API_KEY`, `POSTHOG_PROJECT_ID` | Optional source-map upload credentials for CI; leave unset locally |

`AUTH_RESEND_KEY` and `RESEND_API_KEY` serve different code paths, even when the same development key is used for both. Use only test recipients when exercising email. Never put a Supabase service-role key in a `NEXT_PUBLIC_` variable.

Storage expects `event-covers` and `profile-images` buckets with the team's existing policies. The image allowlist in `next.config.ts` must include the development storage hostname. Ask the team lead for a test member and admin access before testing protected workflows.

## Run and check

From the repository root:

```sh
pnpm dev:portal
pnpm --filter @lattelab/portal lint
pnpm --filter @lattelab/portal typecheck
pnpm --filter @lattelab/portal build
```

Open http://localhost:3001. Use `pnpm --filter @lattelab/portal start` to serve a production build locally on the same port.

The portal has no automated test suite yet. Before releasing behavior changes, test sign-in, profile onboarding, registration and cancellation, and affected admin flows with development data. A build does not verify database permissions, email delivery, or authentication providers.

## Database work

Normal development uses the established development schema. Installation and builds do not change the database. After confirming the target and coordinating with the team lead:

```sh
pnpm --filter @lattelab/portal db:studio
# Applies schema changes to DATABASE_URL; do not run as a setup step.
pnpm --filter @lattelab/portal db:push
```

Filtering matters: Drizzle resolves environment and schema paths from the portal directory. The profile import under `scripts/` also writes data and is not ordinary onboarding.

See `CLAUDE.md` for application rules, `docs/` for historical design notes, and the [deployment handoff](../../docs/deployment.md). [Event photos and mailing PR #5](https://github.com/LatteLab/brewroom/pull/5) remains separate; its additional services and migrations need their own rollout.
