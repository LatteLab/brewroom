# PostHog Analytics Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add PostHog analytics (auto page views, session replay, error tracking, user identification) with minimal code.

**Architecture:** Use Next.js 16's `instrumentation-client.ts` for PostHog init (no React provider needed). A small identifier component links PostHog sessions to NextAuth users.

**Tech Stack:** posthog-js, Next.js 16 instrumentation API, NextAuth session

---

### Task 1: Install posthog-js and add env vars

**Files:**
- Modify: `package.json`
- Modify: `.env.local`

**Step 1: Install the package**

Run: `pnpm add posthog-js`

**Step 2: Add PostHog env vars to `.env.local`**

Append to the end of `.env.local`:

```
# PostHog Analytics
NEXT_PUBLIC_POSTHOG_KEY=<your PostHog project API key>
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml .env.local
git commit -m "feat: add posthog-js dependency and env vars"
```

---

### Task 2: Create instrumentation-client.ts

**Files:**
- Create: `instrumentation-client.ts` (project root, next to `next.config.ts`)

**Step 1: Create the file**

```typescript
import posthog from 'posthog-js'

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  defaults: '2026-01-30',
})
```

This runs once on the client before hydration. The `defaults` option enables session replay, error tracking, and recommended settings automatically.

**Step 2: Verify dev server starts**

Run: `pnpm dev`
Expected: Dev server starts without errors. Check browser console — you should see PostHog network requests to `us.i.posthog.com`.

**Step 3: Commit**

```bash
git add instrumentation-client.ts
git commit -m "feat: initialize PostHog via instrumentation-client"
```

---

### Task 3: Create PostHogIdentifier component

**Files:**
- Create: `components/providers/posthog-identifier.tsx`

**Step 1: Create the identifier component**

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

This component renders nothing. It watches the NextAuth session and syncs identity to PostHog. When a user logs out, `posthog.reset()` clears the identity so subsequent anonymous sessions aren't attributed to the previous user.

**Step 2: Commit**

```bash
git add components/providers/posthog-identifier.tsx
git commit -m "feat: add PostHogIdentifier component for user identification"
```

---

### Task 4: Wire PostHogIdentifier into root layout

**Files:**
- Modify: `app/layout.tsx`

**Step 1: Add import**

Add to the imports in `app/layout.tsx`:

```typescript
import { PostHogIdentifier } from "@/components/providers/posthog-identifier";
```

**Step 2: Add component inside SessionProvider**

Change the SessionProvider block from:

```tsx
<SessionProvider>
  {children}
</SessionProvider>
```

To:

```tsx
<SessionProvider>
  <PostHogIdentifier />
  {children}
</SessionProvider>
```

**Step 3: Verify end-to-end**

Run: `pnpm dev`

1. Open the app in browser, navigate a few pages — confirm PostHog network requests in DevTools Network tab (requests to `us.i.posthog.com`)
2. Log in — confirm `posthog.identify` fires (check PostHog dashboard > Activity for your user)
3. Check PostHog dashboard > Web Analytics for page view data
4. Check PostHog dashboard > Session Replay for recorded sessions

**Step 4: Build check**

Run: `pnpm build`
Expected: Build succeeds with no errors.

**Step 5: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: wire PostHogIdentifier into root layout"
```

---

### Task 5: Add env vars to Vercel

**Step 1: Add environment variables in Vercel dashboard**

Go to Vercel project settings > Environment Variables and add:

- `NEXT_PUBLIC_POSTHOG_KEY` = `<your PostHog project API key>`
- `NEXT_PUBLIC_POSTHOG_HOST` = `https://us.i.posthog.com`

Enable for Production, Preview, and Development environments.

**Step 2: Redeploy**

Trigger a new deployment so the env vars take effect.
