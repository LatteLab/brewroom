# PostHog Analytics Integration Design

## Goal

Add analytics, error tracking, and session replay to Latte Lab using PostHog Cloud (free tier). Single dashboard for all observability needs.

## What PostHog provides automatically

- Page view tracking (all routes)
- Click/interaction tracking
- Session replay (recordings of user sessions)
- Error tracking (uncaught client exceptions)
- Web analytics dashboard (traffic, referrers, devices, top pages)
- Web vitals (LCP, FID, CLS)

## What we add manually

- User identification — link anonymous PostHog sessions to authenticated NextAuth users (email, name, admin role)

## What we are NOT doing (for now)

- Custom event tracking (registrations, lottery, check-ins, etc.)
- Server-side event capture (`posthog-node`)
- Feature flags
- A/B testing

## Architecture

### Integration method

Next.js 16 supports `instrumentation-client.ts` — a file that runs once on the client before the app hydrates. This is the lightest-weight approach: no React provider needed, no `useEffect` hacks.

### Files

| File | Action | Purpose |
|------|--------|---------|
| `instrumentation-client.ts` | Create | PostHog init with session replay + error tracking enabled |
| `components/providers/posthog-identifier.tsx` | Create | Client component that reads NextAuth session and calls `posthog.identify()` |
| `app/layout.tsx` | Modify | Add `<PostHogIdentifier />` inside `SessionProvider` |
| `.env.local` | Modify | Add `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` |

### `instrumentation-client.ts`

```typescript
import posthog from 'posthog-js'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
})
```

The `defaults` option auto-configures recommended settings including session replay and error tracking.

### `components/providers/posthog-identifier.tsx`

```typescript
'use client'

import { useSession } from 'next-auth/react'
import posthog from 'posthog-js'
import { useEffect } from 'react'

export function PostHogIdentifier() {
  const { data: session } = useSession()

  useEffect(() => {
    if (session?.user) {
      posthog.identify(session.user.id, {
        email: session.user.email,
        name: session.user.name,
        is_admin: session.user.isAdmin,
      })
    } else {
      posthog.reset()
    }
  }, [session])

  return null
}
```

### `app/layout.tsx` change

Add `<PostHogIdentifier />` inside the existing `<SessionProvider>`:

```tsx
<SessionProvider>
  <PostHogIdentifier />
  {children}
</SessionProvider>
```

## Environment variables

```
NEXT_PUBLIC_POSTHOG_KEY=<your PostHog project API key>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## Free tier limits

- 1M events/month (page views, clicks, custom events)
- 5K session recordings/month
- Error tracking included
- More than sufficient for a student org

## Future expansion

When ready for custom event tracking, two options:
- **Client-side**: `import posthog from 'posthog-js'` in any `'use client'` component and call `posthog.capture()`
- **Server-side**: Install `posthog-node`, create a singleton client in `lib/posthog.ts`, call from server actions
