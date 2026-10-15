import type { Metadata } from "next";
import { PageIntro } from "@/components/page-intro";
import { ScrapbookGallery } from "@/components/scrapbook-gallery";
export const metadata: Metadata = {
  title: "Our scrapbook",
  description:
    "Campus coffee pop-ups, drinks we’ve made, and moments we’ve shared. Browse the Latte Lab scrapbook.",
  alternates: { canonical: "/scrapbook" },
};
export default function Scrapbook() {
  return (
    <main id="main" className="scrapbook-page">
      <div className="shell">
        <PageIntro
          eyebrow="SAVED YOU A LITTLE MEMORY"
          title="Our scrapbook."
          description="Little moments, freshly brewed."
        />
        <ScrapbookGallery />
      </div>
    </main>
  );
}
