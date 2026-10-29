# Portal follow-ups and historical backlog

## Current verification follow-ups

Reviewed October 22, 2026. Both apps are deployed from Brewroom. Portal already contains PostHog analytics and error reporting code; successful telemetry delivery still requires service-level verification.

- [ ] Verify real sign-in, profile onboarding, registration, and affected admin flows with development data. Builds and unauthenticated page checks do not establish these outcomes.
- [ ] Investigate the Resend webhook login redirect. A production GET to `/api/webhooks/resend` redirected to login during the monorepo review. Verify a signed delivery event after addressing routing; no webhook POST or email send was tested in that review.

Use the [Portal setup guide](../README.md) and [deployment guide](../../../docs/deployment.md) for current operations.

## Historical backlog

The original pre-monorepo backlog is preserved below. Its checkboxes have not been re-triaged and do not state current completion or priorities. In particular, the old domain and analytics setup tasks predate the deployments and code noted above. Recheck requirements and existing behavior before starting any item.

---

### MIT credentials and authentication

- [ ] Contact MIT IT to obtain proper OAuth credentials for production
- [ ] Configure Google OAuth with MIT domain restrictions (`hd=mit.edu`)
- [ ] Set up proper redirect URIs for production environment
- [ ] Verify authentication flow works with MIT email accounts

---

### Proposed features

- [X] **Email notifications (Resend)** — Transactional emails for registration confirmations, lottery results, event reminders
  - [ ] Verify Resend Works after finding a solid domain
- [ ] **Mailchimp sync** — Sync member list with Mailchimp for newsletters and marketing emails
- [ ] **QR code check-in** — Generate QR codes for attendees, scan at door for faster check-in flow
- [ ] **Mutuals** — Show which friends/members have attended the same events (inspired by Partiful)
- [ ] **Sticky dates on timeline** — Sticky date headers that pin while scrolling through the event timeline
- [ ] **Cached results for data fetching** — Add `use cache` / `unstable_cache` for events and member queries (N+1 query already optimized, caching deferred until app-wide Suspense migration)

---

### Production tasks recorded before the migration

- [ ] **Domain swapping for main site** — Point production domain to the deployed app
- [ ] **Landing page with login** — Create a public landing page, possibly mapping login to the existing auth flow
- [ ] **Preload Spring 2026 signups** — Import Spring 2026 Latte Lab signups into an interests form
- [ ] **Manual testing by Latte Lab team** — End-to-end testing by team members before production launch
- [ ] **Integrate web analytics tracker / error notifications** possibly --> posthog, sentry, maybe something simpler
