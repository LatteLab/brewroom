@AGENTS.md

# Latte Lab public website

This workspace is the public social club website. The member portal lives in ../portal.
Next.js 16 App Router, React 19, TypeScript, Tailwind 4. Use the root Node/pnpm versions and commit the root pnpm-lock.yaml.

## Product direction

Keep the homepage short. Warm cream, forest green, espresso typography, original Drive beaver artwork, real club photography. Emphasize community, campus pop-ups, and shared coffee. No coffee-science section, member login, or contact form. Scrapbook is a physical page-turning book, per the October 28, 2026 user brief: related photos share designed pages, two-page spreads on desktop and single pages on smaller screens.

## Maintenance

- IMPLEMENTATION.md is the single active rebuild plan and progress log. Update it rather than adding duplicate plans.
- content/site.ts holds navigation, team, and links. Membership mailing list and internal team application use verified public Google Forms respondent URLs. Keep editing URLs and tracking parameters out of visitor-facing links.
- content/scrapbook.ts contains the original curated photos and captions. content/scrapbook-book.ts groups the original collection and 59 event photographs into seven chapters and 26 pages. Keep each photo represented once and every chapter aligned to a desktop spread. Each page declares its composition and contains two to four large prints, an event heading and a date. Preserve the page-specific print order and use the same mounts on resting and turning sheets. Detailed captions appear in the photo viewer. New local WebPs live in public/photos/events; source filenames are recorded beside their entries.
- Scrapbook chapters use paper binder tabs attached to the divider immediately before each chapter (the first mobile divider belongs to page index 0). On desktop, current/earlier chapter dividers show their reverse faces on the left; future dividers stay on the right. Mobile dividers disappear underneath once their sheet has passed, so page 3 has the first two tabs hidden. getChapterTabState in lib/book-motion.ts maps resting sides and moving sheets. Desktop tabs travel on the outermost PaperStrip hinge. Mobile tabs update when the destination settles. Hide the matching resting button during the turn. Large desktop labels are horizontal, compact desktop/mobile labels vertical. Reserve edge space and keep touch targets at least 44px. Small-screen compositions reserve space for the rings and keep the prints tappable.
- Divider depth is real CSS 3D geometry: keep preserve-3d on the chapter navigation, individual divider layers, and desktop book base. PAGE_LAYER_DEPTH in lib/book-motion.ts is the shared spacing for paper blocks, resting dividers, and turning sheet packets. Resting dividers include a thin full sheet and cardstock edges; older left dividers and later right dividers sit deeper in their stacks. Animate stationary divider depths and the receiving/departing illustrated pages on the shared turn clock so plain paper stays below photographs and moving tabs meet their resting levels.
- The About group photo is the user-supplied IMG_7876.jpeg, optimized as public/photos/about-group.webp. Its landscape CSS crop removes excess floor while preserving the full group.
- content/asset-sources.json records original Drive IDs, not expiring download URLs.
- content/press.json preserves earlier press records. Distinguish direct club coverage from wider MIT coffee stories.
- Team names and roles follow the handbook reviewed September 16, 2026. content/team-photos.ts maps roster names to local portraits with transparent beaver corners. Only Alan Duan, Allison Liu, Rozalen Adous, and Trinity Chen have individual framing overrides; all other portraits use base framing. Keep illustrations for people without a supplied portrait. content/asset-sources.json records the original headshot Drive files.
- Contact is mailto:lattelab-exec@mit.edu. Canonical metadata uses https://lattelab.org.
- Honor reduced motion, visible keyboard focus, semantic headings, and useful image alt text. Book turns focus the new page heading; native photo dialog supports previous/next photos, Escape, and focus restoration. Page turns have an instant reduced-motion alternative.
- The physical book uses CSS 3D cover boards and page-block edges. Desktop pages meet directly at the center, with rounded paper shoulders and subtle highlights; the user requested removing the exposed binding, stitches, and center gap. Below 900px it becomes a ring-bound book with punched pages, six brass loops, and folded paper underneath. On phones the outgoing page slides and fades over the destination in 340ms. Keep the destination mounted through completion, including on chapter jumps.
- Desktop single turns use 18 connected strips with clipped faces and a measured shared sheet width. Chapter jumps render every intervening sheet together with staggered curls, depth, and a lighter mesh per sheet; all share the same 1100ms duration. getTurnLeaves in lib/book-motion.ts maps reading order (two-page steps on desktop, individual pages on smaller screens). getTurnPose defines the desktop turn. Keep the strip chain in preserve-3d; clip only its flat faces. Prepare the sheets at rest, then start their hinges, lighting, and projected shadows on one shared clock. Remove all animation layers on completion and bypass them for reduced motion. Normalize in-flight page indexes when switching layouts, including when the destination becomes part of the current spread.

## Verification and release

From the repository root run `pnpm --filter @lattelab/cafe test`, `pnpm --filter @lattelab/cafe lint`, `pnpm --filter @lattelab/cafe typecheck`, and `pnpm --filter @lattelab/cafe build`. Check mobile navigation, scrapbook page turns, chapter navigation, the photo dialog, recipe selection, reduced motion, and page widths in a browser. Follow the current request's release scope and the [deployment guide](../../docs/deployment.md). Earlier deployment approvals and DNS observations are historical records, not approval for a new release.

## Signature footer

components/site-footer.tsx uses the original user-supplied sweater back.svg as public/brand/wordmark.svg. Keep its flourishes intact. Forest/cream palette, immediately visible inline SVG with an automatic drifting caramel glow on desktop and mobile; reduced motion disables animation. The footer is server-rendered with no hydration or external SVG fetch required. Geometry lives in components/footer-wordmark.tsx. Footer links remain ordinary keyboard-accessible anchors.

Vercel Web Analytics is installed via @vercel/analytics/next in the root layout. Dashboard enablement is managed in Vercel.

Vercel Speed Insights is installed via @vercel/speed-insights/next in the root layout. It requires project-side enablement; installing the package does not purchase a paid add-on.

The approved social preview is app/opengraph-image.png (1200×630), with accessible description in opengraph-image.alt.txt. Next.js file metadata supplies the OG and Twitter image; do not override it with the old /opengraph-image route.

## Homepage and Join

Homepage uses Young Serif with scoped styles in app/landing.css. About stays at /about; the homepage introduction links there. MemoryMotion fans three Polaroids out on desktop with GSAP; smaller screens and reduced motion keep normal scrolling. Join uses the supplied member wax-seal sticker and includes LinkedIn. Footer invitation links directly to the membership mailing list.
