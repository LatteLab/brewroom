import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { team } from "@/content/site";
export const metadata: Metadata = {
  title: "The team",
  description:
    "Meet the students bringing Latte Lab’s coffee, creativity, and campus community to life.",
  alternates: { canonical: "/team" },
};
export default function Team() {
  return (
    <main id="main" className="shell team-page">
      <PageIntro
        eyebrow="THE PEOPLE BEHIND THE POUR · 2026"
        title="Brewed by us. Shared with you."
        description="A little planning, a lot of care, and a shared love of bringing people together."
      />
      <div className="team-grid">
        {team.map((person, i) => (
          <article className={`team-card team-tone-${i % 3}`} key={person.name}>
            <div className="team-illustration">
              <span className="team-initials" aria-hidden="true">
                {person.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")}
              </span>
              <Image
                src={`/brand/${person.art}.webp`}
                alt=""
                width={160}
                height={160}
                sizes="(max-width: 480px) 85px, (max-width: 760px) 100px, 125px"
                priority={i < 3}
              />
            </div>
            <div className="team-label">
              <h2>{person.name}</h2>
              <p>{person.role}</p>
            </div>
          </article>
        ))}
      </div>
      <aside className="team-invitation">
        <p className="handwritten">Your next favorite team?</p>
        <Link href="/join" className="text-link">
          Help make it happen <span aria-hidden="true">↗</span>
        </Link>
      </aside>
    </main>
  );
}
