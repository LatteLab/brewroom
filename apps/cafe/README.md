# cafe

Latte Lab’s public website — the front door to MIT’s student-run coffee community. Discover the club, meet the team, browse memories, and find out how to join.

**Why cafe?** It’s where people discover Latte Lab and get a feel for the community. Our companion repository, [brewroom](https://github.com/LatteLab/brewroom), houses the member app and internal tools: where things get made.

Visit [lattelab.org](https://www.lattelab.org). Built with Next.js 16, React 19, TypeScript, and locally hosted fonts and images.

## Run locally

Requires Node.js 22.6 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Pages: Home, About, Team, Scrapbook, News, and Join.

## Checks

```sh
npm test
npm run lint
npm run typecheck
npm run build
```

## Edit content

Use `content/site.ts` for links and team, `content/scrapbook.ts` for gallery entries, and `content/press.json` for press. Both Join links use public Google Forms respondent URLs configured in content/site.ts. Brand and photo provenance is recorded in `content/asset-sources.json`.

See `CLAUDE.md` for maintenance guidance and `IMPLEMENTATION.md` for the rebuild log and remaining content work.
