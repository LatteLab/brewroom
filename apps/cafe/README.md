# Cafe

Latte Lab's public website at [lattelab.org](https://lattelab.org). It introduces the club, team, memories, and ways to join. The member app lives in [../portal](../portal/README.md).

## Run and check

Follow the [root setup guide](../../README.md), then run these from the repository root.

```sh
pnpm dev:cafe
pnpm --filter @lattelab/cafe test
pnpm --filter @lattelab/cafe lint
pnpm --filter @lattelab/cafe typecheck
pnpm --filter @lattelab/cafe build
```

Open http://localhost:3000. Cafe needs no application secrets or `.env.local` file. Its production deployment must not receive the portal's credentials.

## Edit content

Use `content/site.ts` for links and team information, `content/scrapbook.ts` for gallery entries, and `content/press.json` for press. The Join page's membership link uses a public Google Forms respondent URL configured in `content/site.ts`. Brand and photo provenance lives in `content/asset-sources.json`.

Keep photos and brand assets under `public/`. After UI changes, check mobile navigation, gallery filters, load-more, dialog close/focus behavior, reduced motion, and page widths.

See `CLAUDE.md` for maintenance guidance and `IMPLEMENTATION.md` for the public site rebuild log. Historical npm commands in that log describe earlier work; current commands are above. See the [deployment handoff](../../docs/deployment.md) for the Cafe Vercel project.
