# Guest Detail Sheet Redesign

## Goal

Replace the generic `UserDetailModal` in the guest list with a purpose-built `GuestDetailSheet` that shows event-specific context, a Luma-style timeline of status changes, and fine-grained approval tracking (who approved, lottery vs manual, etc.).

## Key Decisions

- **Audit log table**: New `registration_audit_log` table tracks every status transition with actor, timestamp, and action type.
- **Panel type**: Right-side Sheet (same as current), standard `sm:max-w-lg` width.
- **Timeline scope**: Status changes + approval source. No email tracking or admin notes (future work).
- **Stats**: Keep the 2x2 member stats grid (Attended, No-Shows, Lottery W/L) alongside the event-specific timeline.
- **Inline actions**: Status badge is clickable (opens existing `StatusChangeDialog`). Footer has "Remove Guest" and "View Full Profile" link.
- **Separate component**: New `GuestDetailSheet` instead of extending `UserDetailModal`, to avoid complicating the shared member profile component.

## New Table: `registration_audit_log`

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | |
| `registrationId` | uuid FK → event_registrations | The affected registration |
| `eventId` | uuid FK → events | Denormalized for queries |
| `userId` | text FK → users | The guest |
| `oldStatus` | text (nullable) | Previous status (null for initial registration) |
| `newStatus` | text | New status |
| `action` | text | `registered`, `approved`, `denied`, `lottery_won`, `lottery_lost`, `checked_in`, `no_show`, `status_changed`, `removed` |
| `actorId` | text FK → users (nullable) | Admin who acted (null for self-registration or system) |
| `actorType` | text | `user`, `admin`, `system` |
| `createdAt` | timestamp | When this happened |

## Sheet Layout (top to bottom)

1. **Header**: Avatar + Name + Email + Class/Major + Bio. Clickable status badge (top-right) opens `StatusChangeDialog`.
2. **Registration Time**: Label + formatted timestamp (e.g., "Feb 16, 8:52 PM").
3. **Separator**
4. **Timeline**: Reverse-chronological audit log entries. Each entry has an icon, action description, actor name, and timestamp. Vertical connecting line between entries (Luma-style).
5. **Separator**
6. **Member Stats**: 2x2 grid — Attended, No-Shows, Semester Lottery Wins, Semester Lottery Losses.
7. **Separator**
8. **Event History**: List of user's other event registrations with event name, date, and status badge.
9. **Footer**: "View Full Profile" link + "Remove Guest" button.

## Timeline Icon Mapping

| Action | Icon | Color |
|--------|------|-------|
| Registered (pending) | UserPlus | amber |
| Registered (direct) | UserPlus | green |
| Approved | CheckCircle | green |
| Denied | XCircle | red |
| Lottery won | Trophy | green |
| Lottery lost | Trophy | red |
| Checked in | ClipboardCheck | green |
| No show | AlertTriangle | gray |
| Status changed | ArrowRight | blue |
| Removed | Trash2 | red |

## Data Flow

1. Click guest row → open `GuestDetailSheet` with registration + user + stats (already in client memory).
2. Sheet mounts → fetch `getRegistrationAuditLog(registrationId)` for timeline.
3. Sheet mounts → fetch event history (existing `getUserDetailForModal` pattern, or lighter query).
4. Click status badge → `StatusChangeDialog` → on success, refetch audit log to show new entry.
5. Click "Remove Guest" → confirmation dialog → `removeRegistration` → close sheet.

## Files to Create/Modify

- `lib/db/schema.ts` — add `registrationAuditLog` table
- `lib/db/event-queries.ts` — add `createAuditLogEntry`, `getRegistrationAuditLog` queries
- `app/actions/events.ts` — instrument all status-change actions to write audit entries
- `components/admin/events/guest-detail-sheet.tsx` — new component
- `components/admin/events/guest-list.tsx` — swap `UserDetailModal` for `GuestDetailSheet`
- Supabase migration for the new table

## Backfill

Existing registrations won't have audit log entries. The timeline will be empty for them — this is acceptable. New status changes going forward will populate the timeline.
