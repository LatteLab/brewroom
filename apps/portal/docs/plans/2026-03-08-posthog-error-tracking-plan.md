# PostHog Error Tracking Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-capture client and server-side error exceptions in PostHog so we can see when errors happen and which users are affected.

**Architecture:** Client-side uses existing `posthog-js` initialization + `captureException` in error boundaries. Server-side uses `posthog-node` singleton + Next.js `onRequestError` instrumentation hook. Source maps uploaded via `@posthog/nextjs-config` wrapper around `next.config.ts`.

**Tech Stack:** posthog-js (existing), posthog-node, @posthog/nextjs-config, Next.js 16 instrumentation API

---

### Task 1: Install Dependencies

**Files:**
- Modify: `package.json`

**Step 1: Install posthog-node and @posthog/nextjs-config**

```bash
pnpm add posthog-node @posthog/nextjs-config
```

**Step 2: Verify installation**

```bash
pnpm list posthog-node @posthog/nextjs-config
```

Expected: Both packages listed with versions.

**Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add posthog-node and @posthog/nextjs-config for error tracking"
```

---

### Task 2: Copy Error Video Asset

**Files:**
- Create: `public/error.mp4`

**Step 1: Copy the video file**

```bash
cp ~/Downloads/591172322_24871458542536632_7920452112733965104_n.mp4 public/error.mp4
```

**Step 2: Verify the file exists**

```bash
ls -la public/error.mp4
```

Expected: File exists, ~490KB.

**Step 3: Commit**

```bash
git add public/error.mp4
git commit -m "chore: add error page video asset"
```

---

### Task 3: Create Server-Side PostHog Singleton

**Files:**
- Create: `lib/posthog-server.ts`

**Step 1: Create the singleton module**

```typescript
// lib/posthog-server.ts
import { PostHog } from 'posthog-node'

let instance: PostHog | null = null

export function getPostHogServer(): PostHog {
  if (!instance) {
    instance = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      flushAt: 1,
      flushInterval: 0,
    })
  }
  return instance
}
```

Key details:
- `flushAt: 1` and `flushInterval: 0` ensure events send immediately — required for Vercel serverless where functions are short-lived.
- Uses existing `NEXT_PUBLIC_POSTHOG_KEY` env var (same key works for both client and server SDKs).
- Singleton avoids creating multiple PostHog instances across requests.

**Step 2: Verify it compiles**

```bash
pnpm exec tsc --noEmit lib/posthog-server.ts 2>&1 || echo "Check errors above"
```

**Step 3: Commit**

```bash
git add lib/posthog-server.ts
git commit -m "feat: add PostHog server-side singleton for error tracking"
```

---

### Task 4: Create Server-Side Instrumentation

**Files:**
- Create: `instrumentation.ts` (project root)

**Step 1: Create the instrumentation file**

```typescript
// instrumentation.ts
import type { Instrumentation } from 'next'

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getPostHogServer } = await import('./lib/posthog-server')
    const posthog = getPostHogServer()

    let distinctId: string | undefined

    if (request.headers.cookie) {
      const cookieString = Array.isArray(request.headers.cookie)
        ? request.headers.cookie.join('; ')
        : request.headers.cookie

      const match = cookieString.match(/ph_phc_.*?_posthog=([^;]+)/)
      if (match?.[1]) {
        try {
          const decoded = decodeURIComponent(match[1])
          const data = JSON.parse(decoded)
          distinctId = data.distinct_id
        } catch {
          // Cookie parse failed — capture without distinct_id
        }
      }
    }

    await posthog.captureException(err, distinctId)
  }
}
```

Key details:
- Uses dynamic `import()` for `posthog-server` to avoid loading it in edge runtime.
- `onRequestError` is called for errors in server components, server actions, and API routes.
- Cookie regex `ph_phc_.*?_posthog` matches the PostHog cookie pattern to extract the user's `distinct_id`.
- If cookie parsing fails, we still capture the exception — just without a user link.
- The `Instrumentation.onRequestError` type comes from `next`.

**Step 2: Verify it compiles**

```bash
pnpm exec tsc --noEmit instrumentation.ts 2>&1 || echo "Check errors above"
```

**Step 3: Commit**

```bash
git add instrumentation.ts
git commit -m "feat: add server-side error instrumentation with PostHog"
```

---

### Task 5: Update Error Boundaries

**Files:**
- Modify: `app/(admin)/error.tsx`
- Modify: `app/(user)/error.tsx`

**Step 1: Update the admin error boundary**

Add `import posthog from 'posthog-js'` at the top, and add `posthog.captureException(error)` inside the existing `useEffect`:

```typescript
// app/(admin)/error.tsx
'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { Button } from '@/components/ui/button';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An unexpected error occurred. Please try again or contact support if the problem persists.
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
```

Changes from original:
- Added `import posthog from 'posthog-js'`
- Replaced `console.error(...)` with `posthog.captureException(error)`

**Step 2: Update the user error boundary**

Same pattern — add import and replace console.error:

```typescript
// app/(user)/error.tsx
'use client';

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { Button } from '@/components/ui/button';

export default function UserError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <h2 className="text-xl font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        An unexpected error occurred. Please try again or contact support if the problem persists.
      </p>
      <Button onClick={reset} variant="outline">
        Try again
      </Button>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add 'app/(admin)/error.tsx' 'app/(user)/error.tsx'
git commit -m "feat: report error boundary exceptions to PostHog"
```

---

### Task 6: Create Global Error Boundary

**Files:**
- Create: `app/global-error.tsx`

**Step 1: Create the global error page with video**

This file renders outside the root layout, so it must provide its own `<html>` and `<body>`. Tailwind is not available — use inline styles. The video plays as a fun error indicator.

```typescript
// app/global-error.tsx
'use client';

import posthog from 'posthog-js';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    posthog.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#09090b',
          color: '#fafafa',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          padding: '1rem',
        }}
      >
        <video
          src="/error.mp4"
          autoPlay
          loop
          muted
          playsInline
          style={{
            maxWidth: '320px',
            width: '100%',
            borderRadius: '12px',
            marginBottom: '2rem',
          }}
        />
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
          Something went wrong
        </h1>
        <p
          style={{
            fontSize: '0.875rem',
            color: '#a1a1aa',
            maxWidth: '24rem',
            textAlign: 'center',
            margin: '0 0 1.5rem',
            lineHeight: 1.5,
          }}
        >
          An unexpected error occurred. Please try again or contact support if
          the problem persists.
        </p>
        <button
          onClick={reset}
          style={{
            padding: '0.5rem 1.5rem',
            fontSize: '0.875rem',
            fontWeight: 500,
            color: '#fafafa',
            backgroundColor: 'transparent',
            border: '1px solid #27272a',
            borderRadius: '6px',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
```

Key details:
- Dark background matches the app's dark theme (`#09090b` is zinc-950).
- Video is `muted` + `playsInline` so it autoplays on mobile (browsers block autoplay with sound).
- Inline styles only — no Tailwind since this renders outside root layout.

**Step 2: Verify it compiles**

```bash
pnpm exec tsc --noEmit 'app/global-error.tsx' 2>&1 || echo "Check errors above"
```

**Step 3: Commit**

```bash
git add 'app/global-error.tsx'
git commit -m "feat: add global error boundary with PostHog capture and video"
```

---

### Task 7: Configure Source Map Upload

**Files:**
- Modify: `next.config.ts`

**Step 1: Update next.config.ts to wrap with withPostHogConfig**

```typescript
// next.config.ts
import type { NextConfig } from "next";
import { withPostHogConfig } from "@posthog/nextjs-config";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'rlmgbbqyokizudzhfydp.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
};

export default withPostHogConfig(nextConfig, {
  personalApiKey: process.env.POSTHOG_API_KEY,
  envId: process.env.POSTHOG_ENV_ID,
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
  sourcemaps: {
    enabled: true,
    deleteAfterUpload: true,
  },
});
```

Key details:
- `personalApiKey` and `envId` are server-only env vars (no `NEXT_PUBLIC_` prefix) — they're only used at build time.
- `deleteAfterUpload: true` removes source maps from the production bundle so they're not publicly accessible.
- `enabled: true` defaults to only uploading on production builds.
- These env vars don't need to be in `.env.local` for dev — source maps only matter in production. Add them to Vercel.

**Step 2: Verify the config compiles (dev server starts)**

```bash
pnpm dev &
sleep 5
kill %1
```

Expected: Dev server starts without errors. Source map upload will be skipped since `POSTHOG_API_KEY` isn't set locally (that's fine — it only runs in CI).

**Step 3: Commit**

```bash
git add next.config.ts
git commit -m "feat: configure PostHog source map upload for production builds"
```

---

### Task 8: Verify End-to-End

**Step 1: Run the build to check for errors**

```bash
pnpm build
```

Expected: Build succeeds. Source map upload may warn about missing `POSTHOG_API_KEY` — that's expected locally.

**Step 2: Run lint**

```bash
pnpm lint
```

Expected: No new lint errors.

**Step 3: Manual smoke test**

Start dev server and verify error tracking works:

```bash
pnpm dev
```

Then test client-side capture by temporarily adding `throw new Error('test error')` in a page component. Check PostHog's Activity feed for the exception event.

**Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: address any issues found during verification"
```

---

## Environment Variables Checklist (Vercel)

After merging, add these to Vercel environment variables:

| Variable | How to get it |
|---|---|
| `POSTHOG_API_KEY` | PostHog → Settings → User → Personal API Keys → Create (scopes: `organization:read`, `error_tracking:write`) |
| `POSTHOG_ENV_ID` | PostHog → Settings → Environment → Environment ID |

## PostHog Project Settings

Enable exception autocapture in PostHog:
- Go to PostHog → Settings → Error Tracking → Enable "Exception autocapture"
