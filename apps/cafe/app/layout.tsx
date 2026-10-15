import type { Metadata, Viewport } from "next";
import { Fraunces, DM_Sans, Caveat } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { site } from "@/content/site";
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});
const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
const caveat = Caveat({
  subsets: ["latin"],
  variable: "--font-caveat",
  display: "swap",
});
export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: "Latte Lab",
    template: "%s | Latte Lab",
  },
  description:
    "A student-run coffee club bringing people together across MIT. Campus pop-ups, hands-on workshops, and good company.",
  openGraph: {
    type: "website",
    siteName: "Latte Lab",
  },
  twitter: { card: "summary_large_image" },
  icons: { icon: "/brand/logo.svg" },
};
export const viewport: Viewport = { themeColor: "#f8f5ed" };
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${dmSans.variable} ${caveat.variable}`}
    >
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        {children}
        <SiteFooter />
        <Analytics />
        <SpeedInsights />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: site.name,
              url: site.url,
              email: site.email,
              sameAs: [site.instagram],
              logo: `${site.url}/brand/logo.svg`,
            }),
          }}
        />
      </body>
    </html>
  );
}
