# Latte Lab Frontend - TODO

## Overview

This document tracks outstanding tasks for the Latte Lab frontend application.

---

## 1. MIT Credentials & Authentication

- [ ] Contact MIT IT to obtain proper OAuth credentials for production
- [ ] Configure Google OAuth with MIT domain restrictions (`hd=mit.edu`)
- [ ] Set up proper redirect URIs for production environment
- [ ] Verify authentication flow works with MIT email accounts

---

## 2. Upcoming Features

- [X] **Email notifications (Resend)** — Transactional emails for registration confirmations, lottery results, event reminders
  - [ ] Verify Resend Works after finding a solid domain
- [ ] **Mailchimp sync** — Sync member list with Mailchimp for newsletters and marketing emails
- [ ] **QR code check-in** — Generate QR codes for attendees, scan at door for faster check-in flow
- [ ] **Mutuals** — Show which friends/members have attended the same events (inspired by Partiful)
- [ ] **Sticky dates on timeline** — Sticky date headers that pin while scrolling through the event timeline
- [ ] **Cached results for data fetching** — Add `use cache` / `unstable_cache` for events and member queries (N+1 query already optimized, caching deferred until app-wide Suspense migration)

---

## 3. Production

- [ ] **Domain swapping for main site** — Point production domain to the deployed app
- [ ] **Landing page with login** — Create a public landing page, possibly mapping login to the existing auth flow
- [ ] **Preload Spring 2026 signups** — Import Spring 2026 Latte Lab signups into an interests form
- [ ] **Manual testing by Latte Lab team** — End-to-end testing by team members before production launch
- [ ] **Integrate web analytics tracker / error notifications** possibly --> posthog, sentry, maybe something simpler
