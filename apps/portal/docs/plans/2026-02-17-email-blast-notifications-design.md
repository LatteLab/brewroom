# Email Blast & Notification System Design

**Date:** 2026-02-17
**Status:** Approved

## Overview

Add two email capabilities to Latte Lab:

1. **Email Blasts** — Admins compose and send mass emails to org members or event-specific registrant groups, with a Gmail-like rich text editor supporting merge fields.
2. **Automated Notifications** — System-triggered emails for lottery results (selected/rejected), extensible to more event lifecycle triggers later.

**Infrastructure:** Resend for everything (transactional + batch sending + webhook tracking). Already installed as a dependency.

## Architecture: Resend-Centric (Approach 1)

- Direct Resend API calls via the Node.js SDK (`resend@6.5.2`, already installed)
- React Email templates for branded, type-safe email rendering
- `resend.batch.send()` for blasts (chunks of 100)
- `resend.emails.send()` for individual notifications
- Resend webhooks for delivery status tracking
- No queue layer — MIT org scale (<1000 users) doesn't require it. Can add Inngest/Trigger.dev later if needed.

## Database Schema

### `emailBlasts`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| subject | text, NOT NULL | Email subject line |
| body | text, NOT NULL | Rendered HTML content |
| bodyWithMergeFields | text | Raw template before merge field resolution |
| status | enum: `draft` \| `sending` \| `sent` \| `failed` | |
| audienceSegmentId | uuid, FK → audienceSegments.id, nullable | If sent to a saved segment |
| eventId | uuid, FK → events.id, nullable | If event-specific |
| sentBy | text, FK → users.id | Admin who sent it |
| sentAt | timestamp, nullable | |
| totalRecipients | integer | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

### `emailRecipients`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| blastId | uuid, FK → emailBlasts.id | |
| userId | text, FK → users.id | |
| email | text | Snapshot at send time |
| resendEmailId | text | Resend's email ID for tracking |
| status | enum: `queued` \| `sent` \| `delivered` \| `bounced` \| `failed` | |
| statusUpdatedAt | timestamp | |
| createdAt | timestamp | |

### `audienceSegments`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| name | text, NOT NULL | |
| description | text | |
| filters | jsonb, NOT NULL | Filter criteria (see below) |
| createdBy | text, FK → users.id | |
| createdAt | timestamp | |
| updatedAt | timestamp | |

**Filter schema (jsonb):**
```json
{
  "eventId": "uuid (optional)",
  "registrationStatus": "selected | rejected | waitlisted | ... (optional)",
  "classYear": "2026 (optional)",
  "major": "CS (optional)",
  "semesterStatus": "Spring 2026 Active (optional)"
}
```

Filters are AND-combined. Empty filters = all members.

### `emailNotifications`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid, PK | |
| type | enum: `lottery_selected` \| `lottery_rejected` | Extensible later |
| userId | text, FK → users.id | |
| eventId | uuid, FK → events.id | |
| resendEmailId | text | |
| status | enum: `sent` \| `delivered` \| `bounced` \| `failed` | |
| statusUpdatedAt | timestamp | |
| createdAt | timestamp | |

## Email Templates

```
lib/emails/
├── components/
│   ├── email-layout.tsx   # Base layout (header, footer, Latte Lab branding)
│   └── button.tsx         # CTA button component
├── lottery-selected.tsx   # "You got in!" with event details + CTA
├── lottery-rejected.tsx   # "Not this time" with priority boost info
└── blast-template.tsx     # Wraps admin HTML content in branded layout
```

- **Lottery templates:** React Email components with typed props (userName, eventName, eventDate, eventLocation)
- **Blast template:** Takes admin-authored HTML (from Tiptap) and wraps it in the branded layout. Merge fields are resolved via string replacement before rendering.

### Merge Fields

| Field | Resolves to |
|-------|------------|
| `{{firstName}}` | User's first name (fallback: "Member") |
| `{{lastName}}` | User's last name (fallback: empty string) |
| `{{eventName}}` | Event name (if event-specific blast) |
| `{{eventDate}}` | Event date (if event-specific blast) |

Unknown merge fields are stripped silently.

## Sending Architecture

### Blast Sending Flow

1. Admin clicks "Send" → server action creates `emailBlasts` row (status: `sending`)
2. Resolve audience segment → query DB with filters → get recipient list
3. Create `emailRecipients` rows (status: `queued`)
4. For each recipient, resolve merge fields in the template HTML
5. Send via `resend.batch.send()` in chunks of 100
6. Store Resend email IDs on `emailRecipients` rows, update status to `sent`
7. Update blast status to `sent` with `totalRecipients` count
8. If a chunk fails, mark affected recipients as `failed`, continue with remaining chunks

### Notification Sending Flow (Lottery Results)

1. Admin runs lottery draw (existing feature)
2. After draw, server action iterates selected/rejected users
3. Sends individual emails via `resend.emails.send()` with React Email template
4. Creates `emailNotifications` row per email with Resend email ID

### Delivery Tracking (Webhooks)

- API route: `/api/webhooks/resend` (POST)
- Subscribed events: `email.sent`, `email.delivered`, `email.bounced`
- On webhook receipt:
  1. Verify signature using Resend signing secret
  2. Look up `resendEmailId` in `emailRecipients` and `emailNotifications`
  3. Update `status` and `statusUpdatedAt`
- Handler is idempotent (safe to receive duplicate events)

## Admin UI

### New Routes

| Route | Purpose |
|-------|---------|
| `/admin/email` | Email blast hub — list past blasts with delivery stats |
| `/admin/email/compose` | Gmail-like composer with segment builder |
| `/admin/email/[id]` | Blast detail — content, delivery stats, recipient list |
| `/admin/email/segments` | Audience segment CRUD |

### Composer Page (`/admin/email/compose`)

- **To field:** Select saved segment OR build inline with filter dropdowns (event, status, class year, major). Live recipient count preview. "Save segment" toggle.
- **Subject:** Plain text input
- **Body:** Tiptap rich text editor (reuse existing component) with "Insert merge field" dropdown button
- **Preview pane:** Shows rendered email with sample data
- **Actions:** "Save as Draft", "Send Preview to Me", "Send Blast"
- **Confirmation modal** before sending with recipient count

### Event Integration

- Add "Email Registrants" button on `/admin/events/[id]`
- Navigates to `/admin/email/compose?eventId=...` with segment pre-filled

## Error Handling

- **Partial failures:** If a batch chunk fails, mark those recipients as `failed` but continue sending remaining. Admins can retry failed recipients from blast detail.
- **Duplicate prevention:** Send button disables on click. Server action rejects if blast already `sending`/`sent`. Resend idempotency keys per batch chunk.
- **Merge field fallbacks:** Missing name → "Member". Unknown fields → stripped.
- **Lottery notification failures:** Email is best-effort. Lottery result stands regardless. Failed sends are logged for admin visibility.
- **Webhook reliability:** Resend retries up to 3x. Handler is idempotent. If webhooks never arrive, status stays at `sent`.

## Infrastructure Requirements

- **Resend plan:** Pro ($20/mo for 50K emails/month) — free tier (100/day) is too small for blasts
- **Environment variables:** `RESEND_API_KEY` (existing `AUTH_RESEND_KEY` is for NextAuth only — use a separate key), `RESEND_WEBHOOK_SECRET`
- **Domain:** Verify your sending domain in Resend for deliverability (avoid `@resend.dev` in production)

## Future Extensions (Not in v1)

- More notification triggers: registration confirmation, waitlist promotion, event reminders, event cancellation
- Email scheduling (send at a future time)
- A/B testing for blast subject lines
- Unsubscribe preferences per user
- Mailchimp sync (already noted as deferred in MVP)
