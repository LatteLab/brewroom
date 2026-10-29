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

The POS test commands below cover domain behavior and real database transactions. Other portal flows still need manual checks with development data, including sign-in, profile onboarding, registration and cancellation, and affected admin screens. A build does not verify database permissions, email delivery, or authentication providers. See the [verification follow-ups](docs/TODO.md#current-verification-follow-ups) for known checks still needed.

## Database work

Normal development uses the established development schema. Installation and builds do not change the database. After confirming the target and coordinating with the team lead:

```sh
pnpm --filter @lattelab/portal db:studio
# Applies schema changes to DATABASE_URL; do not run as a setup step.
pnpm --filter @lattelab/portal db:push
```

Filtering matters: Drizzle resolves environment and schema paths from the portal directory. The profile import under `scripts/` also writes data and is not ordinary onboarding.

See [CLAUDE.md](CLAUDE.md) for application rules, the [documentation index](docs/README.md) for current feature specs and historical design notes, and the [deployment guide](../../docs/deployment.md) for releases. [Event photos and mailing PR #5](https://github.com/LatteLab/brewroom/pull/5) was still open on October 22, 2026; check its current status before integrating its services or migrations.


## POS order logging and drink analytics

The new POS feature uses separate `pos_` tables. It does not replace event registration or track inventory. Admins create events and menus at `/admin/pos`. Designated staff use `/kiosk` to choose an event and log received orders. Set the comma-separated server-only `POS_STAFF_EMAILS` variable to grant kiosk access without admin access. Staff can view and correct only their own entries. Admins can view reports, export CSV, and correct any entry.

New events start with an empty menu; add each event's drinks manually. Existing menus are preserved. The main POS page combines drink totals and configuration breakdowns across all events and shows counts beside each event. Exact matching recorded drink names are combined; orders are counted separately for each event. Voided entries do not count, and corrections replace their originals.

The kiosk logs one selected drink directly, with no cart, quantity selector, or add-to-order step. Kerb remains optional and is kept on valid orders. Use **Remove entry** to void an accidental entry with one click; its kerb is cleared and it leaves analytics. Removed and superseded entries are hidden by default; select **Show removed entries** to inspect them. Corrections keep the kerb on the valid replacement and clear it from the superseded record. Technical IDs remain for reliable retries. The interface supports one drink per customer interaction; it does not verify customer identity or enforce a per-person redemption limit.

Expand a drink in the event menu and use **Remove drink** to archive it. It disappears from menu editing and the kiosk, while past orders and their analytics stay intact. Archived drinks cannot be ordered or restored by stale editors; add a new drink when needed. **Available to order** remains a separate control for temporarily taking a drink out of service.

Admins can permanently delete a POS event after typing its current name. Deletion removes that event's menu and all order history, including voids and corrections, and removes its totals from the overview. Kiosk links for deleted events return not found. This feature needs no additional database migration.

Event inputs and reports use Eastern time. Logged timestamps come from the server and measure recorded order activity, not preparation or handoff. Corrections preserve the original order timestamp and audit history. Inventory, payments, and offline queues remain outside this feature.

After reviewing the target database and the additive SQL file, apply `lib/db/migrations/20261029193831_pos_drink_analytics.sql` through the team's database change process. The SQL adds only the three POS tables and their constraints/indexes. It enables RLS and revokes direct anonymous/authenticated access; NextAuth-authorized server operations use the existing database connection. Installation and builds do not apply it. Do not run the SQL twice or apply it to an unknown target.

Menu archiving also requires `lib/db/migrations/20261029224324_pos_menu_removal.sql`, which adds a nullable `archived_at` column without removing existing menu items. Apply `lib/db/migrations/20261029225111_pos_removed_log_kerbs.sql` to clear kerbs on existing voided records; it does not change valid orders or report totals. Apply these reviewed migrations in timestamp order before releasing the corresponding code.

For a disposable local PostgreSQL server, `DATABASE_SSL=disable` is accepted only when `DATABASE_URL` has a loopback host. All non-loopback connections still require SSL.

From the repository root, run pure input/time/report tests with `pnpm --filter @lattelab/portal test:pos`. For real transaction tests, set `POS_TEST_DATABASE_URL` to a disposable loopback database named exactly `lattelab_pos_integration`, then run `pnpm --filter @lattelab/portal test:pos:db`. That suite resets its own four fixture tables and refuses other database names or remote hosts. It never reads production credentials or resets the normal development database.

See the [drink analytics design](docs/specs/2026-10-29-drink-analytics/design.md) and [implementation plan](docs/specs/2026-10-29-drink-analytics/implementation-plan.md) for the feature contract and verification record.
