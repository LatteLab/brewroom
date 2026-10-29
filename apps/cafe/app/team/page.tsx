import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PageIntro } from "@/components/page-intro";
import { team } from "@/content/site";
import { teamPhotos } from "@/content/team-photos";
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
        {team.map((person, i) => {
          const photo = teamPhotos[person.name];
          const imageScale = photo?.crop?.scale ?? 1;
          return (
            <article
              className={`team-card team-tone-${i % 3}`}
              key={person.name}
            >
              <div className={photo ? "team-portrait" : "team-illustration"}>
                {photo ? (
                  <>
                    <Image
                      src={photo.image}
                      alt={`Portrait of ${person.name}`}
                      fill
                      placeholder="blur"
                      sizes={`(max-width: 480px) calc(${50 * imageScale}vw - ${47 * imageScale}px), (max-width: 760px) calc(${50 * imageScale}vw - ${56 * imageScale}px), (max-width: 1050px) calc(${33.333 * imageScale}vw - ${80 * imageScale}px), (max-width: 1352px) calc(${33.333 * imageScale}vw - ${96 * imageScale}px), ${356 * imageScale}px`}
                      loading={i < 3 ? "eager" : "lazy"}
                      style={{
                        objectPosition: photo.objectPosition,
                        transform: photo.crop
                          ? `scale(${photo.crop.scale})`
                          : undefined,
                        transformOrigin: photo.crop?.origin,
                      }}
                    />
                    <span className="team-sticker" aria-hidden="true">
                      <Image
                        src="/brand/beaver.webp"
                        alt=""
                        width={80}
                        height={80}
                        sizes="70px"
                        loading={i < 3 ? "eager" : "lazy"}
                      />
                    </span>
                  </>
                ) : (
                  <>
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
                      loading={i < 3 ? "eager" : "lazy"}
                    />
                  </>
                )}
              </div>
              <div className="team-label">
                <h2>{person.name}</h2>
                <p>{person.role}</p>
              </div>
            </article>
          );
        })}
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
