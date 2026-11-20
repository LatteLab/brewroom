# Latte Lab website rebuild

## Scrapbook compositions and digital-camera photos — 2026-11-20

- Reviewed all 52 additions in the Fall Fest and Concord prep digital-camera folder. Selected four Fall Fest images and five Concord prep images. All 69 earlier photos are retained. The album now contains 78 photos, 26 pages and seven chapters.
- Assigned each page a composition matched to its photographs. Two-print spreads, cascading instant prints, offset portraits, panorama arrangements and contact sheets use corner mounts, linen tape or pinstripes. Contact sheets use the album’s cream border and folded photo corners. The same print and frame appear on the resting page and the turning sheet.
- Verified navigation through all 13 desktop spreads and sampled mobile layouts at 320px and 390px. Tested a chapter jump and opened a layered Concord photo in the full-size viewer. All 23 tests, ESLint, the type check, and the Webpack production build using cached fonts passed.

## Photo-led event scrapbook — 2026-11-20

- Reviewed contact sheets of 312 supplied stills, compared them with the original archive, and selected 50 new photographs across 11 event folders. The 19 original photographs each appear once. New WebPs are orientation-corrected, up to 1600px on their longest edge, and total about 5.9 MB.
- Seven binder chapters organize 69 photographs across 22 pages. Event pages pair group scenes with process details, drinks, and candid portraits. Compact headings and dates leave room for three or four prints per page. Captions and complete uncropped images are available in the viewer.
- Source filenames and event information live in `content/scrapbook-book.ts`. Corrected the Korean Momma workshop semester using the original November 2025 folder and photo dates.
- Verified all 11 desktop spreads, mobile layouts at 320px and 390px, a long mobile chapter jump, and full-size photo navigation. Checked that every image decodes at its declared dimensions. Tests, lint and type checks passed. A Webpack production build using the existing cached fonts passed; the default Turbopack build stalled in this environment.

## Unified recipe collection — 2026-11-20

- Mixed all eight recipes across the two desktop rails and the single swipeable mobile rail. Removed the source headings, source lines, and illustration captions. Descriptive image alternatives remain, and source URLs are retained as content-file comments for maintenance.
- Verified all eight selections, mobile swiping, keyboard focus, reduced motion, and layouts from 320px to 1440px in Chromium. Mobile navigation and scrapbook smoke checks passed, along with all 23 tests, lint, type checking, and the production build.

## Expanded recipe rails — 2026-11-20

- Added illustrated adaptations of Ippodo Tea’s iced matcha latte, Hojicha Co.’s maple hojicha latte, Fever-Tree’s espresso tonic, and Breville’s affogato. Each recipe links to its publisher beside the description.
- Desktop shows two brass rails of four tickets each, grouped by source. At widths of 800px and below, the lists form one native horizontal scroll area. Swiping browses the tickets and tapping selects a recipe.
- Checked six browser widths from 320px to 1440px, all eight selections and illustrations, a simulated touch swipe through the final ticket, keyboard selection and focus, reduced motion, and page overflow. Also checked mobile navigation and the scrapbook’s page turn, chapter jump, and photo dialog. All 23 tests, lint, type checking, and the production build passed. Touch testing used Chromium emulation.

## Recipe page motion and tactile feedback — 2026-11-05

- Added a coordinated, finite motion sequence to the café rail: slips swing into view in 90ms staggers, the brass catches the light, and selection pulls a ticket up before it settles. Clips flex at the hinge and jaw, a highlight crosses the brass, the small drink illustration nods, and the selection check stamps into place. Fine-pointer hover lifts the paper and artwork; keyboard focus and pointer/Space presses have their own tactile responses.
- Added a set-down entrance for the large recipe illustration and a numbered “On the counter” stamp. A small IntersectionObserver waits until each slip or new illustration enters the viewport, so offscreen phone rows and the detail illustration don't spend their entrance before visitors reach them. Observers disconnect on selection changes/unmount; stable ticket buttons retain keyboard focus during rapid switching. All recipe text remains stationary.
- Kept CSS as the animation owner, with a single set of duration/easing tokens in `app/recipes/recipes.module.css`. All animated properties are transforms or opacity; all sequences end, and no new dependency or continuous page animation was added. Content stays visible without the observer. Reduced motion bypasses every animation/transition while preserving immediate recipe selection.
- Verification: all 23 tests, lint, type checking, production build, and diff checks pass. Browser-checked default/all selections, Enter/Space and Tab, rapid switching, focus outlines/retention, live status, jump link, illustration reveal, 320/390/768/1024/1440px layouts without horizontal overflow, and shared mobile navigation. Scrapbook smoke check covered a mobile page turn, chapter jump, photo viewer opening/Escape, and restored opener focus.
- Native Chromium reduced-motion emulation reported zero animated elements, 0s transitions, and auto scrolling; selecting a new recipe retained focus and updated immediately. A 1.8-second normal-motion sample captured 172 frames, with 65 active-motion frames averaging 11.5ms and one 98ms worst interval on this machine. Recipe heading position spread was 0px, no horizontal overflow occurred, and no main-content animations remained at the end. This is a local spot check, not a guarantee of frame rate on other hardware. Safari, physical devices, and screen-reader sessions remain untested. Saved an actual-interaction motion preview and screenshots outside the repository.
- Preserved recipe content, the scrapbook, and unrelated work. Local only; no commit, push, or deployment.

## Fall 2026 recipe-book content — 2026-11-04

- Replaced the three sample recipes with all four recipes in the user-supplied `Master Recipe Book _ F26.pdf`: KCA Misugaru Latte, Pour-Over Coffee, SAAS Syrup, and Caramel Cold Foam. Read all nine pages and visually reviewed the recipe tables. Omitted the blank template and duplicate original working notes.
- Preserved ingredient quantities and units, both syrup batch sizes (including 1 drop versus 1 g rose water), method sections, equipment, and source notes. Kept the pour-over kettle's 350 g separate from its 250 g documented pours, with the book's unresolved clarification visible. Kept the cold foam's 1,000 g batch and unresolved frothing/portion details. Preparation times and unlisted serving yields are omitted.
- Extended the dedicated content model and recipe display for ingredient groups, method sections, equipment, notes, and optional facts. Removed all visitor-facing sample wording and updated metadata. Added three simple local SVG recipe illustrations; retained the original pour-over artwork. No unrelated drink photographs or new dependencies.
- The rail now shows four tickets across on wide screens, two per row on intermediate/phone widths, and one per row below 360px. Preserved direct selection, keyboard focus, status announcements, and the existing reduced-motion CSS.
- Verification: all 23 tests, lint, type checking, production build, and diff checks passed. Browser-checked all four recipes, both syrup ingredient lists, pour-over schedule/clarification, cold-foam yield/notes, Enter/Space selection, Tab focus, retained focus, and image loading. Checked 320, 390, 768, 1024, 1060, and 1440px widths without horizontal overflow. No browser console errors observed. Safari, physical devices, and screen-reader sessions were not tested; reduced-motion behavior was verified during the initial page implementation and its rules are unchanged here. Recipes were transcribed, not kitchen-tested.
- Preserved unrelated working-tree changes. Local only; no commit, push, or deployment.

## Recipe ticket rail — 2026-11-04

- Added `/recipes` with page metadata, a canonical URL, the shared navigation entry, and sitemap inclusion. Reused the existing cream/forest/espresso palette, Fraunces/DM Sans/Caveat fonts, PageIntro, header/footer, and original drink artwork. No new dependencies.
- Cream order slips hang from a slim shaded brass rail with stationary clips, printed rules, and perforated edges. Native buttons select each recipe directly; selection lifts and straightens the ticket over 220ms and adds a checkmark, label, and border. The recipe text updates immediately without animation or focus movement. A polite status announces the change. Reduced motion removes transitions and smooth scrolling.
- The recipe area pairs a large original illustration with serving size, preparation time, ingredient quantities, numbered instructions, and optional substitutions. A working jump link has a 44px minimum touch target. Mobile wraps into two short rail rows, or individual rails below 360px; there is no carousel or dragging.
- No complete recipes were found in the repository. `content/recipes.ts` contains three explicitly labeled sample home-brewing recipes: iced latte, honey latte, and pour-over. The file documents their sample status and is the replacement point for club-approved recipes. Illustrations are labeled; no event-photo/recipe association, member quote, or serving history was invented. These recipes have not been kitchen-tested.
- Verification: all 23 existing tests, lint, type checking, production build, and diff checks passed. Browser-reviewed 320, 375, 390, 600, 768, 1024, and 1440px widths without horizontal overflow. Verified all ticket selections, default selection, Enter/Space activation, Tab focus outline, retained ticket focus, status text, jump link, image loading, metadata, and mobile-menu navigation. Chromium reduced-motion emulation confirmed the media query, zero-duration transitions, automatic scrolling, and immediate selection. Scrapbook smoke check covered a desktop page turn, chapter jump, photo viewer next/Escape, and opener focus restoration. No browser errors were observed; Fast Refresh produced a development-only reload warning. Safari, physical touch hardware, and screen-reader sessions remain untested.
- Preserved all pre-existing scrapbook and unrelated working-tree changes. Local implementation only; no commit, push, or deployment.

## Dimensional divider layering — 2026-11-04

- Removed the chapter navigation’s flattening plane. Each tab now belongs to a full divider sheet at a depth determined by the intervening pages: the newest left divider sits nearest the surface, and later right dividers sit deeper. Added thin paper edges and cardstock edge faces.
- Unified divider, page-block, and moving-sheet depths through PAGE_LAYER_DEPTH. Chapter fans start and land at their actual stack levels. Stationary dividers shift with the stacks during a turn, while receiving/departing illustrated pages rise/recede on the same clock. This keeps plain divider paper behind the photographs throughout the animation and prevents depth jumps when tabs settle.
- Preserved chapter ownership, mobile tuck-under behavior, focus handling, and instant reduced-motion navigation. No new dependency.
- Verification: all 23 tests, lint, type checking, production build, and diff checks pass. Four new depth regressions cover page ordering/stack bounds, exact desktop tab landing depths, receiving/departing paper levels, and stationary divider occlusion. Browser-reviewed 1440, 1024, 390, and 320px layouts; forward/reverse desktop fans; mobile forward fans/backward unfolding; heading focus; cleanup; and changing layouts mid-turn. Confirmed distinct rendered Z coordinates, preserve-3d ancestry, touch-target dimensions, no sampled horizontal overflow, and no browser console errors. Physical devices, Safari, and screen readers remain untested. Local changes only; no commit, push, or deployment.

## Tabs attached to turning dividers — 2026-11-04

- Attached chapter tabs to the physical sheet immediately before each chapter. Desktop shows the current and earlier dividers on the left with readable reverse faces; later tabs remain on the right. Mobile folds passed dividers underneath, removing their tabs from view and keyboard navigation. Page 3 now has the first two tabs on the left on desktop and hidden on mobile.
- Moving tabs are mounted once on each sheet’s outermost strip hinge, outside the clipped photo faces, so they follow the actual curl in both directions and during chapter fans. Matching resting buttons are hidden until landing. Mobile tabs tuck inside the page edge underneath and return with their sheet, using the existing shared animation clock. Active markers travel with their tabs.
- Reserved space on both desktop edges and used compact vertical labels on smaller desktops to preserve photo space. Kept reduced-motion navigation and normalized tab ownership when switching layouts during a turn.
- Verification: all 19 tests, lint, type checking, production build, and diff checks pass. Four new regression tests cover page-three placement, ownership through forward/back chapter jumps, adjacent-turn membership, and mobile tuck endpoints. Browser-reviewed 1440, 1024, 900, 390, and 320px layouts; desktop forward/back turns and chapter fans; mobile backward unfolding and forward fans; heading focus; animation cleanup; and resizing from mobile to desktop mid-turn. No sampled horizontal overflow or browser console errors. Physical touch devices, Safari, and screen readers were not tested. Local changes only; no commit, push, or deployment.

## Binder chapter tabs — 2026-11-04

- Replaced the separate chapter row and mobile dropdown with six paper tabs attached to the book’s right edge. Muted chapter colors, handwritten labels, inset edge shading, and a green active marker follow the existing paper-and-cloth design.
- Tabs share the book’s perspective and remain visible on every page. Desktop labels are horizontal; below 900px they run vertically in touch targets at least 44px wide. Reserved edge space prevents horizontal overflow.
- Kept existing chapter jumps, animation locking, heading focus, photo viewer, and reduced-motion navigation. Chapter-tab pointer gestures do not trigger book swipes, and keyboard activation uses native buttons.
- Adjusted phone compositions to keep captions and dates clear beside the new tab rail: alternating photo/caption rows for landscape pairs and fewer decorative keepsakes.
- Verification: all 15 tests, lint, type checking, production build, and diff checks pass. Browser-reviewed 1440, 1024, 800, 390, 375, and 320px layouts, chapter jumps in both directions, keyboard activation, active indicators, heading focus, animation cleanup, and photo-viewer navigation/Escape/focus restoration. Tab sizes are uniform within each layout and at least 49px wide; sampled layouts have no horizontal overflow. No browser console errors. Physical touch devices and screen readers were not tested. Changes remain local; no commit, push, or deployment.

## Approved direction

Rebuild lattelab-web as a Next.js 16 social club website. Warm cream, forest green, espresso type, real Drive artwork, restrained animation. Home stays short. The October 28, 2026 user brief supersedes the original collage direction: scrapbook is now a physical page-turning book. Preserve Git history; no backup copy.

## Pages

- /: concise hero, animated club artwork, join and scrapbook links, small photo strip.
- /about: who we are, what we do, and ethos as a connected story.
- /team: current leadership with verified names and roles.
- /scrapbook: six chapter jumps, 12 designed book pages, animated page turns, responsive spreads, and an accessible sequential photo viewer.
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


## Team headshots — 2026-10-29

- Added 33 supplied headshots as local optimized WebP assets with responsive next/image loading and blur placeholders. Missing portraits retain illustrations; roster names, roles, and order are unchanged.
- Alan Duan, Allison Liu, Rozalen Adous, and Trinity Chen have individual framing settings. Other portraits use base framing. Photos include a transparent beaver in the corner.
- content/team-photos.ts owns the portrait mappings and framing settings. content/asset-sources.json records original Drive IDs and filenames.
- Enlarged the transparent beaver across the photo edge and white card border, outside the clipped portrait frame. Portrait framing remains unchanged.
- Added Tori Park’s supplied portrait as the 34th team photo. Megan Huang and Michelle Su retain illustrations.

## Compact team layout — 2026-11-05

- Capped the team grid at 1,040px, with four columns from 1,024px, three on smaller tablets, and the existing two-column mobile layout. Reduced desktop gaps to 24px and name text to 22px; laptop and desktop portraits top out around 209px wide while retaining their framing and beaver corners.
- Updated responsive image sizes for the narrower cards and eager-loaded all four first-row portraits.

## Taste the Rainbow signup — 2026-11-10

- Added “Sign up for Taste the Rainbow: Moonwake Edition!” as the first /join button, linking to the supplied https://tinyurl.com/rainbowfall26 URL with the existing external-link styling.
- Added /rainbow as a temporary redirect directly to the public Google Form for "Taste the Rainbow: Moonwake Edition," verified by resolving the supplied TinyURL and reading the form title. The existing /contact redirect is unchanged.
- Renamed the redirect path to /rainbowfall26 at the user's request, superseding /rainbow. The Google Form destination is unchanged.

## Page-turning scrapbook — 2026-10-28

User requested a physical animated scrapbook, superseding the earlier continuous-collage direction. This work is confined to the disconnected local clone.

- Used UI UX Pro Max’s design-system search, tactile/paper/analog style catalog, accessibility guidance, and Next.js recommendations. Kept the existing forest/cream palette and Fraunces/DM Sans/Caveat typography; no new dependency or generated photograph.
- Reused all 19 original photos exactly once across 12 designed pages in six chapters: Fall ’26, On campus, Shared tables, Good company, Halloween, and Coffee notes. Related event photos stay together. Page content lives in content/scrapbook-book.ts; original photo entries and assets are preserved.
- Replaced the old grid and load-more flow with a cloth-bound book, paper edges and spine, original SVG doodles, handwritten annotations, tape, keepsake labels, visible captions, semesters, and responsive photo compositions that preserve original aspect ratios.
- Implemented front/back 3D page turns in both directions, page/corner buttons, keyboard arrows, touch swipe handlers, chapter jumps, page/photo counts, a double-activation lock, and an instant reduced-motion alternative. Desktop shows spreads; screens below 900px show individually reachable pages.
- New-page focus goes to its heading; Tab then reaches its photos. If the heading is offscreen, the book returns to a useful reading position. Mobile dates are 12px and the chapter selector is 16px with a 48px target. Supporting text colors meet 4.5:1 against their intended backgrounds.
- Expanded the native photo dialog with previous/next controls, arrow keys, photo counts, uncropped full images, failure/retry UI, Escape/backdrop dismissal, background scroll locking, and focus restoration to the opener.
- Verification: all six content/navigation tests, ESLint, TypeScript, production build, and git diff checks pass. Browser-reviewed all six desktop chapters, forward/back turns, chapter jumps, both book boundaries, viewer opening/arrow navigation/Escape/focus restoration, new-page Tab order, responsive state, and reduced motion. Captured/inspected page-turn video frames. Checked 375, 768, 1024, and 1440px widths without horizontal overflow. Touch handlers are implemented; physical iOS/Android hardware and screen-reader sessions were not tested. The existing header logo preload warning remains unrelated to this change.
- Updated CLAUDE.md and README for the new book structure. Removed only orphaned scrapbook grid/viewer styles and components. No commits, pushes, remote connections, or deployments.

## Physical book and flexible paper — 2026-10-28

- Added a tilted 3D book body, cloth cover boards with bottom/side faces, layered page-block edges, progress-dependent stack thickness, and a soft directional shadow below the book.
- Reworked paper material, gutter shading, rounded sheet edges, photo-print thickness, and handwritten page headings, dates, and notes. Original photos, groupings, captions, and navigation are preserved.
- Replaced the rigid plane with 18 connected hinges displaying precise portions of the same front/back page. A measured sheet width and clip overlaps prevent seams. The sheet curls ahead of its spine and relaxes as it lands; desktop and phone turns share the geometry.
- Added passing shadows on the revealed page and landing side and changing illumination on the sheet. All animated elements are removed on completion. The 1050ms CSS timing and fallback share one constant. Motion animates transforms/opacity, and reduced motion bypasses the sheet/shadows entirely.
- Verification: six content/navigation tests, lint, types, production build, and diff checks pass. Inspected recorded desktop and phone turns in both directions, shadow cleanup, page/focus restoration, reduced-motion navigation, and photo-viewer opening/Escape. One sampled desktop reverse turn produced 126 animation-frame samples averaging 8.9ms between frames with a 50ms worst interval; this is an observation on this machine, not a hardware-wide guarantee. Physical iOS/Android devices and Safari were not tested. Work remains local with no new dependency, commit, push, or deployment.

## Smooth turns and recessed binding — 2026-10-28

- Diagnosed five easing restarts within the existing turn despite generally good frame pacing. Replaced the waypoint animation with a continuous curve for hinge rotation and paper curl, sampled into linear Web Animations keyframes. The sheet rasterizes at rest before all hinges, lighting, and projected shadows start on the same clock. Measured sheet width is prepared on the book rather than recalculated after every turn mounts; lighting layers now occupy only their clipped strip faces.
- Added a real 12px center gap with angled 3D binding walls, a recessed stitched channel, softly rounded paper shoulders, and woven headbands. The turning sheet crosses the gutter as it lands. Smaller screens retain a subtle bound edge and single-page navigation.
- Added four motion regression tests covering uninterrupted hinge/edge movement, velocity through the old stop points, directional symmetry, and correct landing geometry on desktop and phone layouts. All 10 tests, lint, TypeScript, production build, and diff checks pass.
- Headed Chromium checks: desktop forward/back turns, 390px phone forward/back turns without horizontal overflow, cleanup of sheet/shadows, heading focus, reduced-motion navigation, and photo viewer opening/Escape/focus restoration. Inspected turn recordings. Post-change timing sampled 129 active frames, averaging 8.46ms with a 25.1ms worst interval, and no easing restarts. This measures this machine only; physical mobile hardware and Safari remain untested. No browser errors; existing development preload warnings remain.
- No new dependency, commit, push, or deployment. Official repository remains untouched.

## Joined paper center — 2026-10-28

- At the user's request, removed the exposed binding walls, stitched channel, woven headbands, and 12px center gap. The two desktop pages now meet directly in the middle. Kept the rounded paper shoulders and subtle highlights, sized to meet at the same seam; smooth page-turn timing is preserved.
- Verified the joined center, forward/backward turn landing and cleanup, and phone layout in headed Chromium. All 10 existing tests, lint, type checking, production build, and diff checks pass. Local clone only; no commit, push, or deployment.

## Chapter jumps with multiple sheets — 2026-10-28

- Chapter tabs and the phone chapter selector now turn all intervening pages together. Desktop jumps turn one physical sheet per skipped spread, displaying its actual front/back content; the single-page phone layout traverses each intervening page. Nearby jumps retain the regular single-sheet turn.
- Created an overlapping fan within the existing 1100ms animation clock. Sheets have slightly different curl amplitudes, staggered motion, thin paper edges, and changing depth order as they land. Lighting follows each sheet and the packet casts one broader shadow. There is no sequence of full-length animations. Mesh resolution scales down per sheet on longer jumps to control rendering cost; no new dependency.
- Added three regression tests for intervening page order, forward/back phone traversal, and concurrent motion with flat endpoints on one timeline. All 13 tests, lint, type checking, production build, and diff checks pass.
- Headed Chromium verification: first-to-last desktop jump rendered five sheets on matching 1100ms clocks; reverse jump and adjacent chapter navigation landed correctly. Phone selector jumps showed eight and ten intervening pages in the tested directions. Inspected recorded desktop/phone animation frames; verified heading focus, zero residual sheet/shadow nodes, and no phone overflow. Reduced-motion long jump mounted no animation layers and focused the destination heading.
- Sampled active animation frames averaged 9.03ms on the desktop jump and 8.76ms on the phone-sized reverse jump, with worst intervals around 58ms on this machine. These are local measurements, not guarantees on physical mobile hardware; actual iOS/Android devices and Safari remain untested. Browser console had no errors and only the existing logo-preload warnings. All changes remain in the disconnected clone, without commit, push, or deployment.

## Mobile ring binding and folded-back pages — 2026-10-28

- Replaced the small-screen binding with six metallic brass loops aligned to punched paper holes. Added a subtle folded paper block underneath and gave the phone layout more room beside the rings. Desktop retains its joined pages, paper shoulders, and 180-degree turns.
- Mobile sheets now make a continuous full wrap around the ring axis, moving from above the open page to a depth underneath it in the same footprint. Backward navigation brings the actual destination sheet forward from underneath. Reverse faces show textured paper. The curl, directional shadow, and page illumination follow the wrap; chapter jumps fan their intervening sheets together within the same 1100ms clock.
- Normalized in-flight page indexes when switching between single pages and spreads, including a turn whose destination is already in the newly visible spread. This prevents invalid page references or a missing animation completion handler during resize.
- Added two motion regression tests for monotonic full wraps and front/back depth on long chapter fans, and updated the phone endpoint expectations. All 15 tests, lint, TypeScript, production build, and diff checks pass.
- Reviewed recorded forward/backward turns and chapter jumps in headed Chromium with an iPhone 13 viewport. Verified destination heading focus, sheet/shadow cleanup, instant reduced-motion navigation, 375/390/768px layouts without horizontal overflow, and switching to the 1440px desktop layout during a turn. Confirmed desktop has two joined pages and no ring or punch markup. One mobile turn sampled 130 active frames averaging 8.46ms, with a 16.7ms worst interval on this machine. Physical iOS/Android devices and Safari remain untested; existing development warnings remain. No dependency, commit, push, or deployment was added.
