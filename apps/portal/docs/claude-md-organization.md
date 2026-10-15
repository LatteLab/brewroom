# CLAUDE.md Organization Guide

Reference for how to structure Claude Code configuration files as the Latte Lab codebase grows. Written March 2026.

## Current State

- `CLAUDE.md` (root) — ~141 lines, single file covering everything
- `.claude/settings.local.json` — local settings only
- `~/.claude/projects/.../memory/MEMORY.md` — personal auto-memory (cross-session)
- No `.claude/rules/` or `.claude/skills/` directories yet

This is fine for now. **Don't split prematurely.** The community consensus is to restructure only when specific triggers are hit (see "When to Split" below).

---

## The Three Layers

Claude Code reads instructions from three distinct sources with different scopes and behaviors.

### 1. `CLAUDE.md` (checked into git, shared with team)

Loaded at the start of **every** session. Can be placed at:
- **Repo root** — universal project context (this is what we have now)
- **Subdirectories** — loaded when Claude works in that directory (e.g. `app/actions/CLAUDE.md` would only load when working on server actions)
- **Parent directories** — for monorepo setups where a parent dir contains multiple projects

**What belongs here:** Tech stack, commands, project structure, key patterns, gotchas — the "map" of the codebase. Things that apply universally and that Claude needs to know at all times.

**Size target:** Under 200 lines per file. Everything here consumes context tokens at session start. Each line should pass the test: "Would removing this cause Claude to make mistakes?"

### 2. `.claude/rules/*.md` (checked into git, shared with team)

All `.md` files in `.claude/rules/` are **automatically discovered and loaded** alongside `CLAUDE.md`. Supports subdirectories. This is the modular alternative to a monolithic CLAUDE.md.

**Key feature — path-scoped rules:**

```yaml
# .claude/rules/database.md
---
paths:
  - "lib/db/**"
  - "app/actions/**"
---
Rules here only load when Claude is working on files matching these patterns.
```

Path-scoped rules get **high priority** only when relevant, and stay out of the way otherwise. This is the main advantage over putting everything in CLAUDE.md.

**What belongs here:** Domain-specific rules that would bloat the root CLAUDE.md. Database patterns, registration flow details, email system conventions, etc.

**Supports symlinks:** If you have shared rules across multiple projects, maintain them in one place and symlink into each project's `.claude/rules/`.

### 3. `~/.claude/projects/<project-path>/memory/` (local only, NOT in git)

Personal cross-session memory. `MEMORY.md` (first 200 lines) is loaded at every session start. Additional topic files (e.g. `debugging.md`, `patterns.md`) are read on-demand when Claude needs them.

**What belongs here:** Personal workflow preferences, session-to-session learnings, environment-specific notes. Things that are useful for continuity but shouldn't be shared with the team.

---

## When to Split

Keep the single `CLAUDE.md` until one or more of these triggers are hit:

1. **CLAUDE.md exceeds ~200 lines** — content starts getting ignored or truncated. Extract dense sections into `.claude/rules/`.

2. **Path-specific rules emerge** — you find yourself writing rules that only apply to certain files (e.g. "when working on database queries, always check for cascade behavior"). Path-scoped rules in `.claude/rules/` are the right tool for this.

3. **Multiple contributors editing CLAUDE.md** — a single file causes merge conflicts. Splitting into topic files (one per domain) reduces conflict surface.

4. **Context window pressure** — if sessions are hitting compaction frequently, moving rarely-needed rules into path-scoped files reduces baseline token usage.

---

## Recommended Target Structure

When the time comes to split, here's the layout that fits Latte Lab's architecture:

```
CLAUDE.md                              # Lean root: stack, commands, structure, auth patterns (~80 lines)
.claude/
├── rules/
│   ├── database.md                    # Schema, FK cascades, audit log patterns, Supabase RLS
│   ├── registration-flow.md           # Lottery, status transitions, priority scoring, +1 pairs
│   ├── error-handling.md              # Error boundaries, PostHog capture, instrumentation
│   ├── email.md                       # Blast system, Resend webhooks, audience filters
│   └── frontend.md                    # Component patterns, mobile-first, shadcn gotchas
```

### What goes where

**Keep in root `CLAUDE.md`:**
- Tech stack and versions
- CLI commands (dev, build, lint, db:push, db:studio)
- High-level project structure (the directory tree)
- Auth check patterns (used everywhere)
- Server actions pattern (used everywhere)
- Universal gotchas (redirect throws, zsh glob, mobile-first)

**Extract to `.claude/rules/database.md`:**
```yaml
---
paths:
  - "lib/db/**"
  - "app/actions/**"
---
```
- Database table descriptions
- Audit logging rules (FK cascade behavior, null registrationId pattern)
- Supabase Storage RLS gotchas
- Supabase Storage filename collision prevention
- Type derivation pattern ($inferSelect)

**Extract to `.claude/rules/registration-flow.md`:**
```yaml
---
paths:
  - "app/actions/events.ts"
  - "lib/db/event-queries.ts"
  - "components/admin/events/**"
  - "components/user/**"
---
```
- Registration status state machine
- Lottery draft/finalize flow
- Priority score formula
- closeEvent reconciliation
- +1 pair-aware operations

**Extract to `.claude/rules/error-handling.md`:**
```yaml
---
paths:
  - "app/**/error.tsx"
  - "app/global-error.tsx"
  - "app/not-found.tsx"
  - "instrumentation.ts"
  - "lib/posthog-server.ts"
  - "components/error-boundary-content.tsx"
---
```
- Error boundary architecture (route-group vs global)
- global-error.tsx must import globals.css and load Geist via link tag
- PostHog capture patterns (client vs server)
- posthog-node: captureException is void, must call flush() in serverless

**Extract to `.claude/rules/email.md`:**
```yaml
---
paths:
  - "app/actions/email.ts"
  - "lib/db/email-queries.ts"
  - "lib/emails/**"
  - "components/admin/email/**"
---
```
- Email blast lifecycle (draft/sending/sent/failed)
- Auto-save before send pattern
- Resend webhook delivery tracking

**Extract to `.claude/rules/frontend.md`:**
```yaml
---
paths:
  - "components/**"
  - "app/**/page.tsx"
  - "app/**/layout.tsx"
---
```
- Mobile-first requirement
- shadcn SheetContent padding/width gotchas
- compact prop pattern for constrained containers
- Branding: amber-50/40 background, Coffee icon with amber-600/orange-700 gradient
- cn() for conditional Tailwind classes

---

## How to Execute the Split

When you're ready, follow these steps:

1. **Create the directory:**
   ```bash
   mkdir -p .claude/rules
   ```

2. **Create topic files** with YAML frontmatter for path scoping. Copy the relevant sections from CLAUDE.md.

3. **Trim CLAUDE.md** to only the universal content (~80 lines). Don't duplicate — if it's in a rules file, remove it from CLAUDE.md.

4. **Test by running Claude Code** and working in different parts of the codebase. Verify that relevant rules load when expected by asking Claude what instructions it has.

5. **Commit `.claude/rules/`** — these files are meant to be shared with the team via git.

---

## Anti-Patterns to Avoid

- **Splitting too early** — file overhead without benefit. A clean 141-line file is better than 6 files totaling 141 lines.
- **Duplicating content** — if something is in `.claude/rules/database.md`, remove it from `CLAUDE.md`. Conflicting instructions between files cause unpredictable behavior.
- **Over-scoping paths** — don't path-scope rules that apply universally. Auth patterns should stay in root CLAUDE.md, not in a path-scoped file.
- **Forgetting to update** — when patterns change, update the relevant rule file. Stale rules are worse than no rules (Claude follows them even when wrong).
- **Massive rule files** — each rule file should also stay concise. If a single rule file exceeds ~100 lines, consider splitting it further.

---

## References

- [Official: How Claude remembers your project](https://code.claude.com/docs/en/memory)
- [Official: Best Practices for Claude Code](https://code.claude.com/docs/en/best-practices)
- [Official: Using CLAUDE.MD files](https://claude.com/blog/using-claude-md-files)
- [Claude Code Rules Directory: Modular Instructions That Scale](https://claudefa.st/blog/guide/mechanics/rules-directory)
- [How to Write a Good CLAUDE.md File (Builder.io)](https://www.builder.io/blog/claude-md-guide)
- [CLAUDE.md Files and Memory Hierarchy (DeepWiki)](https://deepwiki.com/FlorianBruniaux/claude-code-ultimate-guide/4.1-claude.md-files-and-memory-hierarchy)
