# Portal documentation

## Current guides

- [Workspace setup](../../../README.md) covers installation, app commands, and contributions.
- [Portal setup](../README.md) covers environment variables, local development, and database tools.
- [Portal instructions](../CLAUDE.md) describe the current application structure and code conventions.
- [Deployment guide](../../../docs/deployment.md) covers the two existing Vercel projects and normal releases.
- [Verification follow-ups](TODO.md#current-verification-follow-ups) records checks still needed after the monorepo review.

## Feature specs

Keep each feature's design and implementation plan together:

```text
docs/specs/YYYY-MM-DD-concise-topic/
    design.md
    implementation-plan.md
```

`design.md` explains the problem, scope, behavior, data model, and decisions. `implementation-plan.md` records ordered work, affected files, and verification. Add another document only when the feature needs it. Use the proposal's creation date and keep the folder stable as the plan evolves.

This layout is the repository convention. It works with poteto mode, which separates design from execution but does not require these exact directories. Older Superpowers records used separate `specs` and `plans` directories; they now follow this layout too. A saved plan does not mean its application changes are implemented or authorize a release.

### Current feature

| Feature | Design | Implementation plan |
| --- | --- | --- |
| Drink analytics, implemented locally | [Design](specs/2026-10-29-drink-analytics/design.md) | [Implementation plan](specs/2026-10-29-drink-analytics/implementation-plan.md) |

## Historical specs

These specs predate the monorepo migration. Each document retains its historical notice. Their proposed changes and completion status are not a current backlog.

| Original date and topic | Design | Implementation plan |
| --- | --- | --- |
| 2026-02-16-events-mvp | [Design](specs/2026-02-16-events-mvp/design.md) | [Implementation plan](specs/2026-02-16-events-mvp/implementation-plan.md) |
| 2026-02-17-email-blast-notifications | [Design](specs/2026-02-17-email-blast-notifications/design.md) | Not recorded |
| 2026-02-17-event-creation-redesign | [Design](specs/2026-02-17-event-creation-redesign/design.md) | [Implementation plan](specs/2026-02-17-event-creation-redesign/implementation-plan.md) |
| 2026-02-17-private-events-approval | [Design](specs/2026-02-17-private-events-approval/design.md) | [Implementation plan](specs/2026-02-17-private-events-approval/implementation-plan.md) |
| 2026-02-17-user-page-performance | [Design](specs/2026-02-17-user-page-performance/design.md) | [Implementation plan](specs/2026-02-17-user-page-performance/implementation-plan.md) |
| 2026-02-21-event-system-redesign | [Design](specs/2026-02-21-event-system-redesign/design.md) | [Implementation plan](specs/2026-02-21-event-system-redesign/implementation-plan.md) |
| 2026-02-22-email-blasts | [Design](specs/2026-02-22-email-blasts/design.md) | [Implementation plan](specs/2026-02-22-email-blasts/implementation-plan.md) |
| 2026-02-22-event-management-revamp | [Design](specs/2026-02-22-event-management-revamp/design.md) | [Implementation plan](specs/2026-02-22-event-management-revamp/implementation-plan.md) |
| 2026-02-22-lottery-semester-context | [Design](specs/2026-02-22-lottery-semester-context/design.md) | [Implementation plan](specs/2026-02-22-lottery-semester-context/implementation-plan.md) |
| 2026-02-22-registration-page-redesign | [Design](specs/2026-02-22-registration-page-redesign/design.md) | [Implementation plan](specs/2026-02-22-registration-page-redesign/implementation-plan.md) |
| 2026-02-25-guest-detail-redesign | [Design](specs/2026-02-25-guest-detail-redesign/design.md) | [Implementation plan](specs/2026-02-25-guest-detail-redesign/implementation-plan.md) |
| 2026-02-25-lottery-noshow-reconciliation | [Design](specs/2026-02-25-lottery-noshow-reconciliation/design.md) | Not recorded |
| 2026-02-25-profile-image-upload | [Design](specs/2026-02-25-profile-image-upload/design.md) | [Implementation plan](specs/2026-02-25-profile-image-upload/implementation-plan.md) |
| 2026-03-08-posthog-analytics | [Design](specs/2026-03-08-posthog-analytics/design.md) | [Implementation plan](specs/2026-03-08-posthog-analytics/implementation-plan.md) |
| 2026-03-08-posthog-error-tracking | [Design](specs/2026-03-08-posthog-error-tracking/design.md) | [Implementation plan](specs/2026-03-08-posthog-error-tracking/implementation-plan.md) |
| 2026-03-08-rich-text-rendering | Not recorded | [Implementation plan](specs/2026-03-08-rich-text-rendering/implementation-plan.md) |
| 2026-04-06-event-timezone-fix | [Design](specs/2026-04-06-event-timezone-fix/design.md) | [Implementation plan](specs/2026-04-06-event-timezone-fix/implementation-plan.md) |

In historical records, `app/`, `components/`, `lib/`, and references to the project root mean the old Portal root, now `apps/portal`. Old absolute checkout paths and port 3000 examples are obsolete. The current Portal port is 3001, and the only dependency lockfile is at the Brewroom root.

Use the current guides for commands. Do not rerun old schema migrations, email sends, or release instructions as setup steps. Keep `.env.local` and credentials untracked; use placeholder values in `.env.example`.

The [configuration organization proposal](archive/claude-md-organization.md) and [historical backlog](TODO.md#historical-backlog) also predate the workspace. Neither overrides the current root and app instructions.
