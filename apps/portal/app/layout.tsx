import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { SessionProvider } from "@/components/providers/session-provider";
import { PostHogIdentifier } from "@/components/providers/posthog-identifier";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Latte Lab",
  description: "MIT's coffee science community — events, tastings, and more.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "https://app.lattelab.org",
  ),
  openGraph: {
    title: "Latte Lab",
    description: "MIT's coffee science community — events, tastings, and more.",
    type: "website",
    siteName: "Latte Lab",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Latte Lab — MIT coffee science",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Latte Lab",
    description: "MIT's coffee science community — events, tastings, and more.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <SessionProvider>
          <PostHogIdentifier />
          {children}
        </SessionProvider>
        <Toaster />
      </body>
    </html>
  );
}
