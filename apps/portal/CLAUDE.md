# CLAUDE.md

Latte Lab Frontend - Next.js app for MIT's Latte Lab organization management.

## Tech Stack

- Next.js 16 (App Router), TypeScript, Tailwind CSS v4, shadcn/ui
- Auth: NextAuth v5 (Google OAuth restricted to `mit.edu`)
- Database: PostgreSQL (Supabase) + Drizzle ORM
- Storage: Supabase Storage (`event-covers`, `profile-images` buckets) via `lib/supabase/client.ts`
- Rich text: Tiptap — event descriptions stored as HTML in `description` text column
- Package manager: pnpm

## Commands

```bash
pnpm dev          # Start dev server
pnpm build        # Production build
pnpm lint         # Run ESLint
pnpm db:push      # Push schema to database
pnpm db:studio    # Open Drizzle Studio
```

## Project Structure

```
app/
├── (admin)/admin/              # Admin section (protected)
│   ├── page.tsx                # Dashboard with user + event stats
│   ├── email/page.tsx          # Email blast hub
│   ├── email/compose/page.tsx  # Compose / edit draft
│   ├── email/[id]/page.tsx     # Blast detail & delivery tracking
│   ├── events/page.tsx         # Event management list
│   ├── events/new/page.tsx     # Create event
│   ├── events/[id]/page.tsx    # Event detail (registrations, lottery, edit)
│   ├── events/[id]/checkin/    # Mobile check-in mode
│   ├── users/page.tsx          # Team Directory
│   ├── users/[id]/page.tsx     # User detail with event history
│   └── settings/page.tsx       # Admin whitelist & semester config
├── (auth)/login/               # Login page
├── (user)/user/                # Member portal (protected)
│   ├── events/page.tsx         # Event catalog (upcoming/past)
│   ├── events/[id]/page.tsx    # Event detail + registration
│   ├── directory/page.tsx      # Member directory grid
│   ├── directory/[id]/page.tsx # Member profile view
│   ├── discover/page.tsx       # Discover events/content
│   └── settings/page.tsx       # Edit own profile & settings
├── actions/                    # Server actions (events.ts, email.ts, profile.ts)
└── api/                        # NextAuth routes + Resend webhook

components/
├── ui/                     # shadcn/ui components
├── admin/                  # Admin components, organized by domain:
│   ├── events/             # Event form, guest list, checkin, lottery, etc.
│   ├── email/              # Composer, audience picker, blast list/detail
│   ├── settings/           # Whitelist & semester managers
│   ├── users/              # Member search, user detail modal, users table
│   ├── admin-sidebar.tsx   # Shared sidebar (used in layout)
│   └── stat-card.tsx       # Shared dashboard stat card
├── user/                   # Member portal components (sidebar, event-card, profile-form)
└── auth/                   # Auth components

lib/
├── db/
│   ├── schema.ts           # Drizzle schema (users, events, registrations, lottery, email)
│   ├── queries.ts          # User/admin queries
│   ├── event-queries.ts    # Event, registration, lottery queries
│   └── email-queries.ts    # Email blast, recipient, audience queries
├── emails/                 # Email HTML templates (blast-template.ts)
├── types/                  # Shared TypeScript interfaces (event.ts, email.ts)
├── supabase/
│   ├── client.ts           # Browser Supabase client (anon key)
│   └── storage.ts          # Upload/delete helpers for event covers + profile images
├── gradients.ts            # Gradient generation/parsing for event covers
├── validations/            # Zod schemas (events.ts, email.ts, profile.ts)
├── utils.ts                # Utilities (cn helper)
└── utils/
    └── lottery.ts           # Seat-aware weighted lottery (buildLotteryPool, weightedSelectWithSeats)
```

## Database Tables

- `users`, `accounts`, `session`, `authenticator` — NextAuth tables (Drizzle pgTable names match)
- `admin_whitelist` — Admin email whitelist
- `events` — Event details (status: open/closed/completed, lotteryStatus: draft/finalized)
- `event_registrations` — User registrations with status tracking
- `lottery_history` — Lottery draw outcomes and priority scores (unique on `user_id, event_id`)
- `semesters` — Academic semester tracking (auto-detected or admin override)
- `email_blasts` — Email campaigns (draft/sending/sent/failed, audience filters as JSON)
- `email_recipients` — Per-recipient delivery tracking (status via Resend webhooks)
- `registration_audit_log` — Tracks every registration status change (actor, old/new status, action type)
- `event_plus_one_invites` — Pair invites (pending/accepted); both FK columns cascade on registration delete
- `events.questions` (JSON) — Per-event registration questionnaire definitions
- `event_registrations.questionnaire_answers` (JSON) — User responses keyed by question ID

## Key Patterns

**Lottery & registration flow:**
- Registration statuses: `pending_approval` → lottery/manual → `selected` (lottery) or `registered` (FCFS/approved) → `checked_in` or `no_show`. Lottery losers stay `pending_approval` (not `rejected`); `rejected` is only for manual admin rejection.
- `selected` status is lottery-specific (set only by `finalizeLottery`). `registered` is for FCFS/manual approval. This distinction matters for no-show reconciliation.
- `lotteryStatus` on events is a draft lock: only `'draft'` gates behavior. `'finalized'` allows re-running the lottery (multiple rounds supported). `claimLotteryDraftSlot` accepts both `null` and `finalized`.
- `lottery_history` has a unique constraint on `(user_id, event_id)` — one entry per user per event. `upsertLotteryHistoryEntries` handles updates (e.g., lost → won on subsequent rounds).
- `closeEvent()` is the reconciliation point: revokes lottery wins for no-shows (`selected` → `no_show`) and marks the event completed.
- `changeRegistrationStatus()` also revokes lottery wins when moving a `selected` registration to a non-going status.
- Priority score formula: `1.0 + losses*0.5 - wins*0.75 - noShows*1.5` — depends on accurate `lottery_history`, so wins must be revoked on no-show.

**Auth check pattern:**

```typescript
const session = await auth();
if (!session?.user) redirect("/login");
if (!session.user.isAdmin) redirect("/user");
```

**Server actions pattern:**

```typescript
"use server";
const session = await auth();
if (!session?.user) throw new Error("Unauthorized");
// validate with Zod, mutate with Drizzle, revalidatePath
```

**Every exported function in a `'use server'` file is a public HTTP endpoint.** Always add auth checks, even for read-only functions like `getSemesterData()`. Admin mutations must check `session.user.isAdmin`.

**Plus-one pairing:**
- Feature flag: `events.plusOneEnabled`. Pairs enter lottery as single `seats: 2` entry using inviter's score.
- `lib/utils/lottery.ts` — seat-aware weighted selection (`buildLotteryPool` + `weightedSelectWithSeats`)
- Declining/cancelling an invite deletes the row (no `declined` status). Cascade on both FK columns handles cleanup.
- `cancelRegistration(eventId, scope)` supports `'me'` (solo) or `'both'` (pair). Pair-awareness threads through lottery, waitlist promotion, and approval flows.

**Type derivation:** Derive shared types from Drizzle schema (`$inferSelect`) rather than manually redeclaring field subsets. See `lib/types/event.ts` for the `RegistrationRow`/`RegistrationWithStats`/`Registration` pattern.

**Component styling:** Use `cn()` for conditional Tailwind classes.

**Server vs Client:** Pages are server components; interactive parts use `'use client'`.

**Auto-save before send:** When a client action (Send, Preview) triggers a server action that reads state from DB, always save current form state first. Otherwise the server uses stale data.

**Audit logging:** Every server action that changes a registration status must call `createAuditLogEntry()` with the old/new status, action type, and actor info. For bulk operations, use `createAuditLogEntries()`. For deletions: create audit entry *before* `deleteRegistration` so the FK check passes. Note: `registrationId` has `onDelete: cascade`, so the entry will be cascade-deleted too. If the audit must survive (e.g. user-initiated cancellation), pass `registrationId: null` instead.

**Error boundaries:** Route-group `error.tsx` files (`(admin)`, `(user)`) use shared `components/error-boundary-content.tsx`. `app/global-error.tsx` replaces the root layout entirely — must import `globals.css` directly and load Geist font via `<link>` tag since `next/font` isn't available. All error boundaries report to PostHog via `posthog.captureException()`. Server-side errors captured in `instrumentation.ts` — use `posthog.flush()` (not await on `captureException`) to ensure delivery in serverless.

## Gotchas

- Supabase Storage RLS: client uses anon key, so policies must include `anon` role (not just `authenticated`). When creating new buckets or tables, always enable RLS and add explicit policies — Supabase disables RLS by default, which means public access to everything.
- Supabase Storage filenames: when filenames are derived from user data (e.g. userId), include a random token (`{userId}-{uuid}.ext`) to prevent other users from overwriting files via the anon key. For multi-step mutations (upload file + update DB), update the DB first — a broken DB reference is worse than an orphaned storage file.
- `redirect()` in server actions throws internally (NEXT_REDIRECT). Never wrap server action calls that use `redirect()` in try/catch — it catches the redirect as an error. If you need a toast + navigation after a mutation, skip `redirect()` in the action and use `router.push()` client-side instead.
- `pnpm db:push` may conflict when multiple worktrees target the same Supabase DB. For schema changes from a non-primary worktree, apply SQL directly via Supabase MCP (`apply_migration` or `execute_sql`).
- Mobile-first: most users access on mobile. Always test layouts in narrow viewports. When reusing components in constrained containers (Sheets, modals, popovers), pass a `compact` prop to adapt layout — don't assume the full-page grid will fit.
- Zsh glob: paths like `app/(admin)/` must be quoted in shell commands (`'app/(admin)/'`) or zsh interprets parens as glob patterns.
- shadcn `SheetContent` has zero padding on the content body (only `SheetHeader` has `p-4`) and defaults to `w-3/4` on mobile. For full-screen mobile sheets, add `w-full` to the className. Add explicit `px-6` to content areas.
- User portal background: `bg-amber-50/40 dark:bg-stone-950`. Latte Lab icon in nav: `Coffee` from lucide-react with `from-amber-600 to-orange-700` gradient. App icon files: `app/icon.svg` (raw), `app/apple-icon.png` (branded). Production URL: `https://app.lattelab.org`.
