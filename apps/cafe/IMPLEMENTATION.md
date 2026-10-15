# Latte Lab website rebuild

## Approved direction

Rebuild lattelab-web as a Next.js 16 social club website. Warm cream, forest green, espresso type, real Drive artwork, restrained animation. Home stays short; scrapbook is a scrolling paper collage with no physical book. Preserve Git history; no backup copy.

## Pages

- /: concise hero, animated club artwork, join and scrapbook links, small photo strip.
- /about: who we are, what we do, and ethos as a connected story.
- /team: current leadership with verified names and roles.
- /scrapbook: All / Events / Drinks filters, Polaroids, accessible photo viewer and load more.
- /news: existing press, distinguishing Latte Lab coverage from broader MIT coffee stories.
- /join: membership form, separate club application, Instagram, email.
- Email links use mailto:lattelab-exec@mit.edu; no login or contact form.

## Tasks and acceptance

- [x] Inspect clean source tree; create codex/club-website-rebuild.
- [x] Preserve five press records and remove old application source.
- [x] Collect real brand assets and photo selections. User requested placeholder form links; both destinations remain intentionally unset.
- [x] Build Next.js 16 foundation, design tokens, navigation and footer.
- [x] Implement concise animated homepage.
- [x] Implement About, Team and Join.
- [x] Implement scrapbook filtering, viewer and pagination.
- [x] Implement News, metadata, sitemap, redirects and not-found page.
- [x] Verify build, lint, types, interactions, accessibility and responsive screenshots.
- [x] Document maintenance and report any outstanding content gaps.

## Technical decisions

Use App Router / React 19 / TypeScript / Tailwind 4, npm lockfile, optimized local images and fonts. Content lives in typed files. No database required. CSS animation and small client components; honor reduced motion and retain readable content without animation. No production deployment until preview review.

## Progress log

- 2026-09-16: Started from ef72b28, clean working tree. Branch created. Old UI removed after preserving press content. Existing Next.js configuration disabled image optimization and suppressed type errors; new configuration will remove those bypasses.

- Downloaded 9 original brand assets and optimized 15 photos locally. The gallery uses 12 curated entries from Blueprint, SAAS collaboration, and social/recipe-testing collections.
- All six pages implemented. Four gallery filtering tests passed after reproducing missing filtering behavior. Initial production build passed. Browser preview now works in the in-app browser.
- Form destinations intentionally remain placeholders at user request. Team uses verified handbook names/roles and illustrative brand cards; no unverified portrait identities.
- Dependency audit found the previous lockfile retained old Next.js packages; updating to patched Next.js 16 before final verification.

## Final verification — 2026-09-16

- Next.js 16.3.5 production build, ESLint, TypeScript, and all four gallery tests passed. npm audit reported zero vulnerabilities. git diff --check passed.
- Browser-reviewed Home, About, Team, Join, News, and Scrapbook. Mobile widths of 390px and 320px checked; sampled pages have no horizontal overflow. Mobile menu opens and closes after navigation.
- Verified Drinks filtering, load-more rendering all 12 entries, photo modal, Escape dismissal, and focus restoration. Motion has a reduced-motion stylesheet override. This is a focused manual check, not a full accessibility audit.
- HTTP smoke checks passed for all six pages, robots, sitemap, Open Graph image, contact redirect (308), and unknown page (404).
- Added README, canonical CLAUDE.md, formatted source, and Drive asset provenance.

## Deliberate content follow-ups

- Replace the two null form destinations in content/site.ts with public respondent URLs when ready. User explicitly requested placeholders for now.
- Replace illustrated team cards with verified portraits if desired.
- Review copy and photo selection in the local preview before production deployment. Changes remain local on codex/club-website-rebuild; no DNS, Vercel, remote Git, or production changes made.

## Release authorization

- 2026-09-16: User approved merging and production deployment. Tests, lint, types, production build and diff checks passed again before release.

## Join links — 2026-09-17

- Replaced both placeholder destinations with verified public Google Forms links. Resolved the membership editing URL to its canonical respondent URL.
- Clarified hyperlink labels and descriptions to distinguish the membership mailing list from the internal club team application. Both open in a new tab with accessible notice.

## About illustrations — 2026-09-17

- Enlarged the three activity illustrations to 180px on desktop, 130px on tablet, and a 90px-wide mobile column. Updated image sizing hints to retain sharp rendering.

## About group photo — 2026-09-17

- Replaced the About hero photo with user-supplied IMG_7876.jpeg, optimized to WebP. Used a landscape CSS frame and gentle zoom to trim empty floor without altering the original photo or cutting out members.

## Signature footer — 2026-09-17

- Approved forest/cream footer with original sweater wordmark, Join CTA, Instagram and email.
- Lightweight CSS SVG mask, once-per-mount viewport reveal, mouse-following caramel highlight, static reduced-motion fallback, responsive sizing. Original artwork preserved at public/brand/wordmark.svg.
- Verification: lint and production build passed; desktop reveal and complete wordmark visually checked, mobile layout reviewed at 390px.

## Automatic footer glow — 2026-09-17

- Replaced cursor-driven highlight with a continuous, slow caramel gradient sweep. Runs on mobile too; reduced motion retains the static cream wordmark. Removed pointer event handling.

## Footer load and analytics — 2026-09-17

- Live SVG measured 5,752 bytes and ~0.23s for one request; not a broad performance benchmark. Removed deliberate 1.1s reveal and client observer/hydration dependency.
- Original SVG paths are now inline in server-rendered HTML, eliminating the CSS-mask image fetch while retaining the automatic glow and reduced-motion fallback.
- Installed official Vercel Analytics and added its Next.js component once in the root layout.

## Speed Insights — 2026-09-18

- Added the official Next.js Speed Insights component once in the root layout alongside Web Analytics. No paid plan or subscription changes.

## Cream social preview — 2026-09-18

- Published the exact approved 1200×630 cream preview: original cup logo, Fraunces wordmark, and the selected MIT community description.
- Replaced the old generated image with a static PNG and descriptive alt metadata; removed the obsolete explicit image URL so Next.js supplies the file URL.

## Homepage title — 2026-09-18

- Simplified the default page title to Latte Lab, which supplies the homepage browser tab, Open Graph title, and Twitter title. Interior page titles retain their existing template.

## Footer LinkedIn — 2026-09-18

- Added the official LinkedIn company link beside Instagram and Email in the footer, opening in a new tab with an accessible notice.

## Local landing page exploration

- Branch: codex/landing-page-preview. Review locally only; do not push or deploy.
- Young Serif homepage headlines, centered beaver poster, short introduction linking to the existing /about page, three real photo Polaroids.
- Desktop memories use a short GSAP pin; mobile, short windows, and reduced motion show a normal static layout.
- Existing signature footer preserved; invitation links directly to the membership mailing list.

- Refined desktop memories into a centered photo stack that fans out over a short scroll pin; no pin on mobile or reduced motion.
- Added user-supplied IMG_5870.JPG to Events as Halloween 2025, optimized to WebP without altering the original. Source: /Users/datct/Downloads/IMG_5870.JPG.

- Added Halloween content filming photo from /Users/datct/Downloads/IMG_5847.JPG beside the Halloween group photo; optimized WebP with original orientation preserved.

- Added Latte Lab photoshoot shots from /Users/datct/Downloads/IMG_5431.jpeg to the scrapbook Events collection. Date omitted because none was supplied. Original preserved; optimized WebP used for the site.

- Added user-supplied IMG_9361.heic as passionfruit lemonade cold brew from the first event of fall 2026. Converted with macOS HEIC support and optimized to WebP; original unchanged. Replaced the landing page drink Polaroid with this photo.

- Replaced the landing “better together” photo with user-supplied DC0A2311.jpg. Rotated upright and fitted the full group into the Polaroid; source original unchanged. Local preview only.

- Swapped the landing “better together” image to 43900384_Unknown.JPG at the user’s request. Restored the standard full-bleed Polaroid crop for this landscape photo.

- Updated the landing “around campus” Polaroid with user-supplied 43636592_Unknown.JPG, optimized as around-campus-blueprint.webp. Local preview only.

- Replaced Join page CoffeeArt with the supplied wax_seal_sticker.png, optimized with transparency intact as member-wax-seal.webp. Local preview only.

- Added LinkedIn to Join page social links. Replaced header Join pill with a compact, softly rounded rectangle and smaller arrow; retained form-button styling. Local preview only.

- Simplified the second and third homepage headings to “About us” and “Brewing memories” to avoid repeating the coffee/company phrasing.

## Approved release

User approved merging all preview work to main without squashing and deploying. Removed the first-frame eyebrow. Final checks run before release; preserve the feature commit through a merge commit.

- Join copy refinement: removed eyebrow and “Pull up a chair”; “Find your way into Latte Lab.” is now the sole, modestly sized heading. Local review on codex/join-copy.

- Removed footer invitation text. A keyboard-accessible full-footer membership link now covers the main footer area; social/email links remain independently clickable above it.

- Added user-supplied 43901824_Unknown.JPG to scrapbook Events as “Matching sweaters, good company,” optimized to WebP. No date assumed.

- Added a user-supplied pasted photo to scrapbook Events as “A pourover lesson with Korean Momma” (id `korean-momma-pourover`), optimized to WebP. No date assumed; whiteboard in the photo reads “Korean Momma x Latte Lab pourover event.”

- Added a user-supplied pasted photo to scrapbook Events as “Brewing at the CSAIL R&D event” (id `csail-rd-event`), optimized to WebP. No date assumed; user identified it as a Latte Lab x CSAIL R&D event.

- Removed two scrapbook entries at user request: `blueprint-1` (“A cup to keep you going,” Hack Blueprint) and `saas-5` (“One more look at that pour,” SAAS collaboration). Deleted their WebP files; kept their Drive provenance in content/asset-sources.json.

- Added three user-supplied pasted photos to scrapbook Drinks, optimized to WebP: `halloween-ghost-2025` (ghost costume with a ghost-drawn iced coffee, October 2025), `salted-caramel-butter-pecan` (salted caramel cold foam butter pecan latte, seasonal menu, no date assumed), and `dubai-coffee-taste-test` (Dubai coffee taste test, no date assumed).

- Added a fourth user-supplied pasted photo, `figma-spring-2026` (iced matcha with Latte Lab member sticker, Latte Lab x Figma, Spring 2026), to scrapbook Drinks, optimized to WebP. Sent directly after the earlier Messages-attachment path proved unreadable.

- Reordered scrapbook entries per user request: `passionfruit-coldbrew-fall-2026`, `csail-rd-event`, `korean-momma-pourover`, `matching-sweaters`, `dubai-coffee-taste-test`, `photoshoot-polaroids` now lead the list, followed by `figma-spring-2026` and `halloween-ghost-2025`/`salted-caramel-butter-pecan`, then the rest unchanged.

- Filled in every scrapbook entry's bottom-right date as a semester (Fall/Spring + year), per user request. Month dates converted mechanically (October 2025 → Fall 2025, February 2026 → Spring 2026). User supplied the semester for entries that had no date: `dubai-coffee-taste-test`, `csail-rd-event`, `korean-momma-pourover`, `matching-sweaters`, `photoshoot-polaroids` → Spring 2026; `salted-caramel-butter-pecan` → Fall 2025.

- Renamed `passionfruit-coldbrew-fall-2026`'s collection text to “First semester event: Brew and Meet!” at user request (was “First event of fall 2026”).

- About page ethos section: removed the "THERE'S A PLACE FOR YOU HERE" eyebrow and the "espresso machine" paragraph, and renamed the "Pull up a chair" button to "Get involved," per user request. Removed the now-dead `.ethos > p` CSS rules.

- Added back a short ethos paragraph, "We'd love to have you at the next one! :)", under the "A good cup can make campus feel a little smaller." motto, after brainstorming language with the user. Restored the `.ethos > p` CSS rules for it.

- Diagnosed /team's low Vercel Speed Insights Real Experience Score (75, desktop): the LCP element is the H1 (verified via PerformanceObserver, not the team photos), and Fraunces/DM Sans/Caveat were loaded via plain `@fontsource` CSS imports with `font-display: swap` and no fallback-metric matching (fallback stack was `"Fraunces", Georgia, serif` — no `size-adjust`/`ascent-override`). /team has 10 heading elements (1 h1 + 9 team-member names), far more than any other page, so the Georgia→Fraunces reflow on font swap compounds into more CLS there than elsewhere.

- Fixed: migrated Fraunces, DM Sans, and Caveat from `@fontsource` imports to `next/font/google` in app/layout.tsx (CSS variables `--font-fraunces`, `--font-dm-sans`, `--font-caveat` applied via `<html>` className), which auto-generates a metrics-matched fallback (confirmed via computed style: `Fraunces, "Fraunces Fallback", Georgia, serif`) — eliminating the layout shift on font swap. Updated `--font-heading`/`--font-body` and all four `.handwritten`/Caveat rules in app/globals.css to reference the new variables, and removed the `@fontsource/fraunces`, `@fontsource/dm-sans`, `@fontsource/caveat` packages (kept `@fontsource/young-serif`, unrelated, homepage-only). Young Serif on the homepage was not touched — out of scope for this fix.

- Secondary cleanup on the same /team investigation: added `priority` to the first 3 (first-row) team member illustration images and a `sizes` prop matching the actual rendered widths at each breakpoint (85px/100px/125px), so Next requests appropriately-sized images instead of oversized ones and doesn't lazy-load above-the-fold content.

- Added Terry Kim ("Founder & Coffee Scientist") to the bottom of the /team grid, with a user-supplied illustration (public/brand/coffee-scientist.webp) matching the existing team-icon style.

- Added a third /join button, "Add events to your calendar," linking to the Latte Lab events Google Calendar subscribe URL (site.calendarUrl), styled like the primary "Join the membership mailing list" button per user request. No CSS changes needed — .join-links is an unbounded grid that stacks rows automatically.

- Simplified /join buttons per user request: removed all description text under each button and made every button filled (dropped the `secondary`/outline style from "Apply to the club team"). Simplified the FormLink component's props accordingly (dropped `description`/`secondary`), removed the now-dead `.join-link > p` CSS rule, and moved the "Link coming soon" fallback text inline into the button (still only used if a URL is ever unset).

- Changed the /join heading to "Find your way into Latte Lab!" (period → exclamation point) at user request.

- Rewrote the three /join button labels at user request: "Join the membership mailing list :DD", "Apply to Latte Lab Internal Team!!!", "Add Latte Lab Events to your GCal!!".

- Made all three /join buttons hollow by default (button-outline) with a green fill + cream text on hover, per user request. Scoped the hover-fill rule to `.join-link .button-outline` so the scrapbook "load more" button's existing sage-hover style is untouched. Adjusted `.coming-soon`'s color to `var(--muted)` since it's now shown against a hollow/transparent button instead of a filled dark one.

## Scrapbook — 2026-09-21

- Added user-supplied IMG_9206.JPG as the first scrapbook entry, optimized to WebP with EXIF orientation applied. Visible text is only “Fall 2026”; descriptive alt text remains available to screen readers.

- 2026-09-21: Removed the four repetitive final scrapbook entries shown by the user: blueprint-7, social-1, social-6, and saas-3.

- 2026-09-21: Added user-supplied IMG_9177.JPG as shared-cup-fall-2026.webp with only “Fall 2026” visible in the scrapbook and photo viewer.
