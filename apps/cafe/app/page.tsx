import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Polaroid } from "@/components/polaroid";
import { MemoryMotion } from "@/components/memory-motion";
import "@fontsource/young-serif/latin-400.css";
import "./landing.css";

export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Home() {
  return (
    <main id="main" className="landing">
      <section className="landing-hero shell" aria-labelledby="landing-title">
        <div className="landing-poster">
          <h1 id="landing-title">
            Coffee tastes
            <br />
            better together.
          </h1>
          <Image
            className="landing-mascot"
            src="/brand/beaver.webp"
            alt="Latte Lab’s beaver enjoying a cup of coffee"
            width={620}
            height={620}
            sizes="(max-width: 700px) 230px, 340px"
            preload
          />
        </div>
        <p className="landing-subtitle">MIT’s student-run coffee community.</p>
        <a className="landing-scroll" href="#our-story">
          A little about us <span aria-hidden="true">↓</span>
        </a>
        <span className="landing-location">STUDENT BREWED · CAMBRIDGE, MA</span>
      </section>

      <section
        id="our-story"
        className="landing-about shell"
        aria-labelledby="story-title"
      >
        <div className="landing-story">
          <p className="eyebrow">HELLO, WE’RE LATTE LAB</p>
          <h2 id="story-title">About us</h2>
          <p>
            We’re a student-run coffee community at MIT, bringing people
            together through campus pop-ups, workshops, and little breaks from
            busy days.
          </p>
          <p>
            We believe a good cup is an excuse to slow down, meet someone new,
            and make campus feel a little smaller.
          </p>
          <Link href="/about" className="text-link">
            More about us <span aria-hidden="true">↗</span>
          </Link>
        </div>
        <figure className="landing-group">
          <div className="landing-group-image">
            <Image
              src="/photos/about-group.webp"
              alt="Latte Lab members in aprons gathered around a couch"
              fill
              sizes="(max-width: 760px) 90vw, 45vw"
            />
          </div>
          <figcaption>A few cups, a lot of friends.</figcaption>
        </figure>
      </section>

      <section className="landing-memories" aria-labelledby="memories-title">
        <MemoryMotion>
          <div className="shell landing-memory-inner">
            <div className="landing-memory-heading">
              <div>
                <p className="eyebrow">A FEW MOMENTS WITH US</p>
                <h2 id="memories-title">Brewing memories</h2>
              </div>
              <p className="handwritten">
                Little breaks.
                <br />
                Lasting memories.
              </p>
            </div>
            <div className="landing-photo-row">
              <div className="landing-memory-card">
                <Polaroid
                  src="/photos/around-campus-blueprint.webp"
                  alt="Latte Lab volunteers serving drinks beside the colorful Blueprint chalkboard"
                  caption="around campus"
                  rotation={-4}
                />
              </div>
              <div className="landing-memory-card">
                <Polaroid
                  src="/photos/passionfruit-coldbrew-fall-2026.webp"
                  alt="Passionfruit lemonade cold brew in a sunlit Latte Lab cup"
                  caption="a bright start to fall"
                  rotation={3}
                />
              </div>
              <div className="landing-memory-card">
                <Polaroid
                  src="/photos/better-together-couch.webp"
                  alt="Three Latte Lab friends in aprons laughing together on a couch, one holding a kettle"
                  caption="better together"
                  rotation={-2}
                />
              </div>
            </div>
            <Link
              href="/scrapbook"
              className="text-link landing-scrapbook-link"
            >
              Explore the scrapbook <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </MemoryMotion>
      </section>
    </main>
  );
}
