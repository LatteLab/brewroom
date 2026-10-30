# Change the Portal database

Portal declares its schema in `lib/db/schema.ts` and keeps reviewed SQL in `lib/db/migrations/`, relative to `apps/portal`. Installation, builds, and GitHub Actions do not apply migrations. Shared changes have been applied through the Supabase MCP migration tool. There is no configured automatic migration runner or paired up/down workflow.

## Prepare and test a change

1. Confirm the target and coordinate with the team lead. A Git worktree does not isolate its configured database. Keep connection strings private.
2. Update the Drizzle schema when the table structure changes. Create a timestamped SQL migration with the Supabase CLI's `migration new` command and place it in the existing Portal migration directory.
3. Review the exact SQL. Keep RLS enabled on private tables and preserve their existing role restrictions. Identify any destructive operations before applying them.
4. Apply the SQL to a disposable local database. Verify both schema and application behavior. Do not edit a migration already applied to a shared database; add a follow-up file.
5. Commit the schema, SQL, affected callers, and verification together.

`pnpm --filter @lattelab/portal db:push` changes the connected schema directly. Reserve it for coordinated disposable local experiments. It does not replace reviewed shared-database migrations. Studio can also write data.

## Run POS transaction tests

Run from the repository root against a disposable loopback database named exactly `lattelab_pos_integration`:

```sh
POS_TEST_DATABASE_URL='postgresql://user:password@127.0.0.1:55439/lattelab_pos_integration' \
  pnpm --filter @lattelab/portal test:pos:db
```

This suite drops and recreates its four fixture tables, including a minimal `users` table, and applies the committed SQL files. It refuses remote hosts and other database names. It is a POS fixture, not a bootstrap for the complete Portal database. Coordinate a full development database baseline separately.

The application accepts `DATABASE_SSL=disable` only for loopback connections. Do not disable SSL for a shared database.

## Apply a shared migration

1. Confirm the Supabase project and environment independently of the local checkout. Inspect the relevant tables and migration history before changing anything.
2. Compare the committed SQL with the target's applied migrations. Stop if the schema or history differs from the expected starting point.
3. Apply the reviewed file once through the agreed migration process. For MCP, use `apply_migration` with the confirmed project ID, migration name, and exact SQL.
4. Run targeted readback queries. Verify the changed column, constraints, permissions, or affected record counts without exposing customer information.
5. Record the file, target, applied migration version, and verification in the release record. Apply compatible database additions before releasing code that reads them.

For incompatible changes, plan the code and database sequence together. Reverting an app deployment does not undo a database migration. Do not automatically execute destructive reverse SQL.

## Existing POS migrations

Applied to the production `latte-lab` project on October 29, 2026. Migration history was read back on October 30. This records database application, not a fresh production UI check.

| Committed SQL file | Migration name | Production history version | Effect |
| --- | --- | --- | --- |
| [20261029193831_pos_drink_analytics.sql](../lib/db/migrations/20261029193831_pos_drink_analytics.sql) | `pos_drink_analytics` | `20261029213826` | Adds the three POS tables, constraints, indexes, RLS, and browser-role access restrictions |
| [20261029224324_pos_menu_removal.sql](../lib/db/migrations/20261029224324_pos_menu_removal.sql) | `pos_menu_removal` | `20261029225540` | Adds nullable `archived_at` without archiving existing menu items |
| [20261029225111_pos_removed_log_kerbs.sql](../lib/db/migrations/20261029225111_pos_removed_log_kerbs.sql) | `pos_removed_log_kerbs` | `20261029225542` | Clears kerbs on existing voided logs, preserving valid orders and analytics totals |

The MCP tool assigned history versions different from the committed filename timestamps. The target also has migrations predating these files. Do not blindly run `supabase db push`, repair history, or replay these files against an existing shared database. Reconcile the baseline and history explicitly before introducing automated migration deployment.
