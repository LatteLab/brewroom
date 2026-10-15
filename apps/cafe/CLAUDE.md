@AGENTS.md

# Latte Lab public website

This repository is the public social club website, not the member portal in brewroom.
Next.js 16 App Router, React 19, TypeScript, Tailwind 4. Node >=22.6; use npm and commit package-lock.json.

## Product direction

Keep the homepage short. Warm cream, forest green, espresso typography, original Drive beaver artwork, real club photography. Emphasize community, campus pop-ups, and shared coffee. No coffee-science section, member login, or contact form. Scrapbook is a scrolling paper collage, never a literal book.

## Maintenance

- IMPLEMENTATION.md is the single active rebuild plan and progress log. Update it rather than adding duplicate plans.
- content/site.ts holds navigation, team, and links. Membership mailing list and internal team application use verified public Google Forms respondent URLs. Keep editing URLs and tracking parameters out of visitor-facing links.
- content/scrapbook.ts contains curated photos and captions. Extend its typed entries to add memories. Assets are local optimized WebP files.
- The About group photo is the user-supplied IMG_7876.jpeg, optimized as public/photos/about-group.webp. Its landscape CSS crop removes excess floor while preserving the full group.
- content/asset-sources.json records original Drive IDs, not expiring download URLs.
- content/press.json preserves earlier press records. Distinguish direct club coverage from wider MIT coffee stories.
- Team names and roles follow the handbook reviewed September 16, 2026. Illustrations are intentional until individually verified portraits are available.
- Contact is mailto:lattelab-exec@mit.edu. Canonical metadata uses https://lattelab.org.
- Honor reduced motion, visible keyboard focus, semantic headings, and useful image alt text. Gallery uses a native dialog with Escape and focus restoration.

## Verification and release

Run npm test, npm run lint, npm run typecheck, npm run build. Check mobile navigation, gallery filters/load-more/dialog, and page widths in a browser. The user approved production deployment on September 16, 2026 after local preview. AWS apex DNS was previously pointed at CloudFront and must be separately verified before any domain cutover.

## Signature footer

components/site-footer.tsx uses the original user-supplied sweater back.svg as public/brand/wordmark.svg. Keep its flourishes intact. Forest/cream palette, immediately visible inline SVG with an automatic drifting caramel glow on desktop and mobile; reduced motion disables animation. The footer is server-rendered with no hydration or external SVG fetch required. Geometry lives in components/footer-wordmark.tsx. Footer links remain ordinary keyboard-accessible anchors.

Vercel Web Analytics is installed via @vercel/analytics/next in the root layout. Dashboard enablement is managed in Vercel.

Vercel Speed Insights is installed via @vercel/speed-insights/next in the root layout. It requires project-side enablement; installing the package does not purchase a paid add-on.

The approved social preview is app/opengraph-image.png (1200×630), with accessible description in opengraph-image.alt.txt. Next.js file metadata supplies the OG and Twitter image; do not override it with the old /opengraph-image route.

## Homepage and Join

Homepage uses Young Serif with scoped styles in app/landing.css. About stays at /about; the homepage introduction links there. MemoryMotion fans three Polaroids out on desktop with GSAP; smaller screens and reduced motion keep normal scrolling. Join uses the supplied member wax-seal sticker and includes LinkedIn. Footer invitation links directly to the membership mailing list.
