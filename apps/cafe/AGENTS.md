# Agent guidance

- Read `CLAUDE.md` for project context before making changes.
- Keep the experience clean, welcoming, and consistent with Latte Lab’s identity.
- Make focused changes and preserve unrelated work.
- Prefer simple, accessible, maintainable solutions.
- Verify changes and clearly report any limitations.
- Follow the user’s requested scope for previews, commits, and deployment.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
