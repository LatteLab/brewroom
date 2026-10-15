# Email Blasts System Design

**Date:** 2026-02-22
**Status:** Approved
**Supersedes:** 2026-02-17-email-blast-notifications-design.md

## Overview

Add email blast capabilities to Latte Lab. Admins compose and send emails to org members or event-specific groups through a Gmail-like rich text editor with merge field support.

**Infrastructure:** Resend for sending + webhook delivery tracking. Already installed (`resend@6.5.2`).

**Explicitly deferred:** Automated notifications (lottery results, registration confirmation), saved audience segments, email scheduling, retry mechanism, A/B testing, unsubscribe preferences, Mailchimp sync.

## Architecture

- Direct Resend API calls via the Node.js SDK
- React Email template for branded layout wrapping admin-authored HTML
- `resend.batch.send()` for blasts (chunks of 100)
- Resend webhooks for delivery status tracking
- No queue layer — MIT org scale (<1000 users) doesn't require it

## Database Schema

### `email_blasts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| subject | text, NOT NULL | Email subject line |
| body | text, NOT NULL | Rendered HTML (merge fields resolved) |
| bodyTemplate | text | Raw HTML before merge field resolution |
| audienceType | enum: `all` \| `event` \| `semester_status` \| `manual` | |
| audienceFilters | jsonb | Type-specific criteria |
| status | enum: `draft` \| `sending` \| `sent` \| `failed` | |
| sentBy | text, FK → users.id | |
| sentAt | timestamp, nullable | |
| totalRecipients | integer, default 0 | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### `email_recipients`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| blastId | uuid, FK → email_blasts.id | |
| userId | text, FK → users.id | |
| email | text | Snapshot at send time |
| resendEmailId | text | For webhook tracking |
| status | enum: `queued` \| `sent` \| `delivered` \| `bounced` \| `failed` | |
| statusUpdatedAt | timestamp | |
| createdAt | timestamp | |

### `audienceFilters` JSON Shapes

```json
// All members
{ "type": "all" }

// Event-scoped (registrationStatus is optional — null means all registrants)
{ "type": "event", "eventId": "uuid", "registrationStatus": "selected" | null }

// Semester status
{ "type": "semester_status", "semesterStatus": "Spring 2026 Active" }

// Manual selection
{ "type": "manual", "userIds": ["id1", "id2"] }
```

## Email Templates

```
lib/emails/
├── components/
│   └── email-layout.tsx   # Base layout (header, footer, Latte Lab branding)
└── blast-template.tsx     # Wraps admin HTML in branded layout
```

One template: takes admin-authored Tiptap HTML and wraps it in a branded layout with header/footer.

### Merge Fields

| Field | Resolves to |
|-------|------------|
| `{{firstName}}` | User's first name (fallback: "Member") |
| `{{lastName}}` | User's last name (fallback: "") |
| `{{eventName}}` | Event name (event-scoped blasts only) |

Unknown merge fields are stripped silently. `{{eventName}}` only available in the merge field dropdown when the blast is event-scoped.

## Sending Architecture

### Blast Sending Flow

1. Admin clicks "Send" → confirmation modal shows recipient count
2. Server action creates/updates `email_blasts` row (status: `sending`)
3. Resolve audience based on `audienceType`:
   - `all` → query all users
   - `event` → query registrations for eventId, optionally filtered by status
   - `semester_status` → query users by semesterStatus field
   - `manual` → look up userIds from audienceFilters
4. Create `email_recipients` rows (status: `queued`)
5. For each recipient, resolve merge fields in the template HTML
6. Send via `resend.batch.send()` in chunks of 100
7. Store Resend email IDs on recipient rows, update status to `sent`
8. Update blast status to `sent`, set `totalRecipients` count
9. If a chunk fails, mark those recipients as `failed`, continue with remaining

### Duplicate Prevention

- Send button disables on click
- Server action rejects if blast is already `sending` or `sent`
- Resend idempotency keys per batch chunk

### Delivery Tracking (Webhooks)

- **Route:** `/api/webhooks/resend` (POST)
- **Events subscribed:** `email.sent`, `email.delivered`, `email.bounced`
- **Flow:** Verify Resend signing secret → look up `resendEmailId` in `email_recipients` → update `status` and `statusUpdatedAt`
- Handler is idempotent (safe for duplicate webhook deliveries)
- If webhooks never arrive, status stays at `sent`

## Admin UI

### Routes

| Route | Purpose |
|-------|---------|
| `/admin/email` | Email hub — list past blasts with status, recipient count, delivery stats |
| `/admin/email/compose` | Composer with audience picker, Tiptap editor, merge fields, preview |
| `/admin/email/[id]` | Blast detail — content preview, delivery stats, recipient list |

### Composer Page (`/admin/email/compose`)

- **Audience picker:** Radio group to select type, then type-specific controls:
  - **All Members:** No additional input, shows total member count
  - **Event:** Event dropdown + optional registration status dropdown
  - **Semester Status:** Dropdown of semester statuses
  - **Manual:** User search/select picker
- **Live recipient count** preview below the audience picker
- **Subject:** Plain text input
- **Body:** Tiptap editor (reuse existing component) with "Insert merge field" dropdown
- **Actions:** Save as Draft, Send Preview to Me, Send Blast (with confirmation modal)

### Contextual Entry Points

- **Event detail page** (`/admin/events/[id]`): "Email Registrants" button → links to `/admin/email/compose?audienceType=event&eventId=...`

### Email Hub List Page (`/admin/email`)

Each blast row shows: subject, audience type summary (e.g., "All Members" or "Event: Fall Formal — Selected"), status badge, sent date, delivery stats (sent/delivered/bounced/failed counts).

## Error Handling

- **Partial failures:** Failed batch chunks don't block remaining sends. Admins see failed recipients on blast detail page.
- **Duplicate prevention:** Send button disables on click. Server action rejects if blast already `sending`/`sent`. Resend idempotency keys per batch chunk.
- **Merge field fallbacks:** Missing name → "Member". Unknown fields → stripped.
- **Webhook reliability:** Resend retries up to 3x. Handler is idempotent. If webhooks never arrive, status stays at `sent`.

## Infrastructure Requirements

- **Resend Pro plan** ($20/mo for 50K emails/month) — free tier (100/day) is too small for blasts
- **Environment variables:**
  - `RESEND_API_KEY` — separate from existing `AUTH_RESEND_KEY` (NextAuth only)
  - `RESEND_WEBHOOK_SECRET` — for webhook signature verification
- **Domain verification** in Resend for deliverability (avoid `@resend.dev` in production)

## Future Extensions (Not in v1)

- Automated notifications: lottery results, registration confirmation, waitlist promotion, event reminders
- Saved audience segments (reusable filter presets)
- Email scheduling (send at future time)
- Retry failed recipients from blast detail page
- Users page "Send Email" entry point
- A/B testing for subject lines
- Unsubscribe preferences per user
- Mailchimp sync
