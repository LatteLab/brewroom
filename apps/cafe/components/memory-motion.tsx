"use client";

import { useEffect, useRef, type ReactNode } from "react";

export function MemoryMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | undefined;
    // Keep the server-rendered photos visible even without animation support.
    void Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (disposed || !root.current) return;
        gsap.registerPlugin(ScrollTrigger);
        const media = gsap.matchMedia();
        media.add(
          "(min-width: 1000px) and (min-height: 750px) and (prefers-reduced-motion: no-preference)",
          () => {
            const cards = root.current!.querySelectorAll<HTMLElement>(
              ".landing-memory-card",
            );
            const timeline = gsap.timeline({
              scrollTrigger: {
                trigger: root.current,
                start: "top top",
                end: "+=550",
                pin: true,
                scrub: 0.7,
                invalidateOnRefresh: true,
              },
            });
            timeline.from(cards, {
              x: (i) => cards[1].offsetLeft - cards[i].offsetLeft,
              y: (i) => [12, 0, 22][i],
              rotation: (i) => [-7, 0, 8][i],
              scale: 0.94,
              stagger: 0.08,
              duration: 1,
              ease: "power1.out",
            });
          },
          root,
        );
        cleanup = () => media.revert();
      })
      .catch(() => {
        /* The static photo arrangement remains usable. */
      });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);
  return (
    <div ref={root} className="landing-memory-stage">
      {children}
    </div>
  );
}
