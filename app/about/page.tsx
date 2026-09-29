import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Polaroid } from "@/components/polaroid";
export const metadata: Metadata = {
  title: "About us",
  description:
    "Meet Latte Lab, a student-run MIT coffee club built around shared cups, campus pop-ups, and good company.",
  alternates: { canonical: "/about" },
};
export default function About() {
  return (
    <main id="main" className="shell about-page">
      <section className="about-intro">
        <div>
          <p className="eyebrow">A LITTLE ABOUT US</p>
          <h1>
            Good coffee.
            <br />
            Even better
            <br />
            <em>company.</em>
          </h1>
          <p className="intro-copy">
            We’re a student-run coffee club at MIT, bringing people together
            over a shared love of coffee—and the conversations that come with
            it.
          </p>
        </div>
        <div className="about-photo">
          <span className="paper-tape" aria-hidden="true" />
          <Polaroid
            src="/photos/about-group.webp"
            alt="Latte Lab members in aprons gathered for a group photo"
            caption="#brewcrew"
            rotation={3}
            priority
          />
          <Image
            className="about-sticker"
            src="/brand/beaver-bean.webp"
            width={140}
            height={140}
            alt=""
          />
        </div>
      </section>
      <section className="about-activities">
        <div className="section-heading">
          <p className="eyebrow">OUR KIND OF COFFEE BREAK</p>
          <h2>Made for moments like these.</h2>
        </div>
        <div className="activity-grid">
          {[
            {
              art: "iced-latte",
              title: "Campus pop-ups",
              copy: "A reason to pause between classes. We bring the coffee; you bring yourself.",
            },
            {
              art: "portafilter",
              title: "Hands-on workshops",
              copy: "Try something new, ask questions, and learn to make a cup you love.",
            },
            {
              art: "latte",
              title: "Coffee & company",
              copy: "Casual socials, shared tables, and conversations that last longer than your drink.",
            },
          ].map((a) => (
            <article key={a.title}>
              <Image
                src={`/brand/${a.art}.webp`}
                width={180}
                height={180}
                sizes="(max-width: 480px) 90px, (max-width: 760px) 130px, 180px"
                alt=""
              />
              <h3>{a.title}</h3>
              <p>{a.copy}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="ethos">
        <h2>
          A good cup can make
          <br />
          campus feel a little smaller.
        </h2>
        <p>We&rsquo;d love to have you at the next one! :)</p>
        <div className="hero-actions">
          <Link className="button" href="/join">
            Get involved <span aria-hidden="true">↗</span>
          </Link>
          <Link className="text-link" href="/team">
            Meet the team <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
