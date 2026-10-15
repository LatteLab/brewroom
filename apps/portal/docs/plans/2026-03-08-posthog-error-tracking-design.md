# PostHog Error Tracking Integration

## Goal

Auto-capture error exceptions on both client and server so we can see when errors happen and which users are affected, via PostHog's error tracking dashboard.

## Existing Foundation

- `posthog-js@^1.359.1` installed, initialized in `instrumentation-client.ts` with `defaults: '2026-01-30'` (enables client-side exception autocapture)
- PostHog env vars configured: `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`
- User identification working via `PostHogIdentifier` component
- Error boundaries exist at `app/(admin)/error.tsx` and `app/(user)/error.tsx` but only log to console

## Gaps

1. Error boundaries don't report to PostHog
2. No `global-error.tsx` for root layout crashes
3. No server-side error tracking (`posthog-node` not installed, no `instrumentation.ts`)
4. No source map upload — stack traces will show minified code

## Design

### 1. Client-Side Error Boundaries

**Update `app/(admin)/error.tsx` and `app/(user)/error.tsx`:**
- Add `posthog.captureException(error)` in the existing `useEffect`
- Import `posthog` from `posthog-js` (already initialized via `instrumentation-client.ts`)

**Create `app/global-error.tsx`:**
- Catches errors in the root layout (above route group boundaries)
- Renders its own `<html>/<body>` (required by Next.js for global-error)
- Uses inline styles (no Tailwind available since it's outside root layout)
- Plays `/error.mp4` (muted, looping, autoplay) as a fun error indicator
- Calls `posthog.captureException(error)` in a `useEffect`
- Includes a "Try again" button that calls `reset()`

**Video asset:** Copy `591172322_24871458542536632_7920452112733965104_n.mp4` from Downloads to `public/error.mp4` (~490KB)

### 2. Server-Side Error Capture

**Install `posthog-node`:**
- Server-side SDK for capturing exceptions from server components, server actions, and API routes

**Create `lib/posthog-server.ts`:**
- Singleton pattern returning a `PostHog` instance
- `flushAt: 1`, `flushInterval: 0` for serverless environments (Vercel)
- Reusable — can be imported in server actions for manual `captureException` calls

**Create `instrumentation.ts`:**
- Exports `onRequestError` hook (Next.js 16 stable API)
- Checks `process.env.NEXT_RUNTIME === 'nodejs'`
- Extracts `distinct_id` from the PostHog cookie (`ph_phc_..._posthog`) to link errors to users
- Calls `posthog.captureException(err, distinctId)` with the extracted user ID

### 3. Source Maps

**Install `@posthog/nextjs-config`:**
- Wraps `next.config.ts` with `withPostHogConfig`
- Auto-uploads source maps during production builds
- Deletes source maps from bundle after upload (`deleteAfterUpload: true`)

**Update `next.config.ts`:**
- Wrap existing config with `withPostHogConfig(nextConfig, { ... })`
- Requires two new env vars (not `NEXT_PUBLIC_`, server-only):
  - `POSTHOG_API_KEY` — personal API key (scopes: `organization:read`, `error_tracking:write`)
  - `POSTHOG_ENV_ID` — environment ID from PostHog project settings

**Vercel:** Add `POSTHOG_API_KEY` and `POSTHOG_ENV_ID` to environment variables so source maps upload during CI builds.

## Files Changed

| File | Action | Purpose |
|---|---|---|
| `posthog-node` | Install | Server-side SDK |
| `@posthog/nextjs-config` | Install | Source map upload |
| `public/error.mp4` | Create (copy) | Fun error page video |
| `lib/posthog-server.ts` | Create | Singleton server PostHog client |
| `instrumentation.ts` | Create | `onRequestError` server hook |
| `next.config.ts` | Update | Wrap with `withPostHogConfig` |
| `app/global-error.tsx` | Create | Root error boundary with video |
| `app/(admin)/error.tsx` | Update | Add `captureException` |
| `app/(user)/error.tsx` | Update | Add `captureException` |

## New Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `POSTHOG_API_KEY` | Vercel only | Personal API key for source map upload |
| `POSTHOG_PROJECT_ID` | Vercel only | PostHog project ID |

## References

- [PostHog Next.js error tracking installation](https://posthog.com/docs/error-tracking/installation/nextjs)
- [PostHog Next.js source maps](https://posthog.com/docs/error-tracking/upload-source-maps/nextjs)
- [PostHog Next.js SDK docs](https://posthog.com/docs/libraries/next-js)
