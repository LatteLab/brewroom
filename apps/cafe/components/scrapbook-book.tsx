"use client";

import Image from "next/image";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  bookPages,
  bookPhotos,
  chapters,
  type BookPhoto,
} from "@/content/scrapbook-book";
import { getPageStart, getPageTarget } from "@/lib/gallery";
import {
  getTurnFrames,
  getTurnLeaves,
  getTurnStripCount,
  getChapterTabState,
  getBookStackDepths,
  getStackDepthFrames,
  PAPER_STRIPS,
  TURN_DURATION,
} from "@/lib/book-motion";

function subscribeToLayout(callback: () => void) {
  const media = window.matchMedia("(min-width: 900px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}
const wideLayout = () => window.matchMedia("(min-width: 900px)").matches;
const serverLayout = () => true;
const number = (value: number) => String(value).padStart(2, "0");
const ringPositions = [10, 26, 42, 58, 74, 90];

function ChapterTabLabel({ index }: { index: number }) {
  return (
    <>
      <span className="book-chapter-number" aria-hidden="true">
        {number(index + 1)}
      </span>
      <span className="book-chapter-name">{chapters[index].label}</span>
    </>
  );
}

function TurningChapterTab({
  index,
  side,
  spread,
  active,
}: {
  index: number;
  side: "left" | "right";
  spread: boolean;
  active: boolean;
}) {
  const backSide = spread && side === "right" ? "left" : "right";
  return (
    <div
      className="book-leaf-tab"
      style={{ "--chapter-index": index } as CSSProperties}
      data-chapter={chapters[index].id}
    >
      <div
        className={`book-chapter-tab book-chapter-tab--${side} book-leaf-tab-front`}
        aria-current={active ? "step" : undefined}
      >
        <ChapterTabLabel index={index} />
      </div>
      <div
        className={`book-chapter-tab book-chapter-tab--${backSide} book-leaf-tab-back`}
        aria-current={active ? "step" : undefined}
      >
        <ChapterTabLabel index={index} />
      </div>
    </div>
  );
}

function PaperPunches() {
  return (
    <div className="book-punches" aria-hidden="true">
      {ringPositions.map((position) => (
        <span key={position} style={{ top: `${position}%` }} />
      ))}
    </div>
  );
}

function RingBinding() {
  const ring = useId();
  const arch =
    "M4.2 14.8C1.6 13.4 2.1 8.1 6.7 5.8C12.1 2.9 19.7 4.1 24.1 7.8C26.4 9.6 27.2 11.5 27.4 13";
  return (
    <div className="book-ring-binding" aria-hidden="true">
      <svg width="0" height="0">
        <defs>
          <linearGradient
            id={`${ring}-metal`}
            gradientUnits="userSpaceOnUse"
            x1="3"
            y1="14"
            x2="26"
            y2="6"
          >
            <stop stopColor="#77694d" />
            <stop offset=".19" stopColor="#d8cba6" />
            <stop offset=".35" stopColor="#a99870" />
            <stop offset=".57" stopColor="#f8efd4" />
            <stop offset=".79" stopColor="#cebd96" />
            <stop offset="1" stopColor="#7d7055" />
          </linearGradient>
          <g id={ring} fill="none" strokeLinecap="round">
            <path
              d="M4.2 14.8Q7.3 17.3 14.5 15.2"
              stroke="#827457"
              strokeWidth="2.3"
            />
            <path
              d="M15.5 8.6Q24.5 8.9 27.5 14"
              stroke="#6d5a36"
              strokeOpacity=".19"
              strokeWidth="3.2"
            />
            <path d={arch} stroke="#685d48" strokeWidth="3.4" />
            <path d={arch} stroke={`url(#${ring}-metal)`} strokeWidth="2.5" />
            <path
              d="M5.1 7.1C9.6 2.7 18.2 3.5 22.5 6.8"
              stroke="#fff8df"
              strokeOpacity=".85"
              strokeWidth=".7"
            />
          </g>
        </defs>
      </svg>
      {ringPositions.map((position) => (
        <svg
          key={position}
          className="book-ring"
          viewBox="0 0 32 26"
          style={{ top: `${position}%` }}
        >
          <use href={`#${ring}`} />
        </svg>
      ))}
    </div>
  );
}

// Connected hinges deform one continuous sheet; clipping happens only on its faces.
function PaperStrip({
  index = 0,
  strips = PAPER_STRIPS,
  front,
  back,
  chapterTab,
}: {
  index?: number;
  strips?: number;
  front: ReactNode;
  back: ReactNode;
  chapterTab?: ReactNode;
}) {
  return (
    <div
      className={`book-strip${index === 0 ? " book-strip--root" : ""}`}
      style={
        {
          "--strip-index": index,
          "--shade-strength": 0.08 + (index / (strips - 1)) * 0.1,
        } as CSSProperties
      }
    >
      <div className="book-strip-face book-strip-front">
        <div className="book-strip-copy">{front}</div>
        <span className="book-strip-shade" />
      </div>
      <div className="book-strip-face book-strip-back">
        <div className="book-strip-copy">{back}</div>
        <span className="book-strip-shade" />
      </div>
      {index === strips - 1 && chapterTab}
      {index < strips - 1 && (
        <PaperStrip
          index={index + 1}
          strips={strips}
          front={front}
          back={back}
          chapterTab={chapterTab}
        />
      )}
    </div>
  );
}

function Arrow({ left = false }: { left?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={left ? { transform: "rotate(180deg)" } : undefined}
    >
      <path
        d="M4 12h15m-6-6 6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Photo({
  photo,
  decorative,
  onOpen,
}: {
  photo: BookPhoto;
  decorative: boolean;
  onOpen: (photo: BookPhoto, button: HTMLButtonElement) => void;
}) {
  const [failed, setFailed] = useState(false);
  const print = failed ? (
    <span className="book-image-fallback">Open photo to retry</span>
  ) : (
    <Image
      src={photo.src}
      alt={decorative ? "" : photo.alt}
      fill
      sizes="(max-width: 600px) 68vw, (max-width: 899px) 470px, 420px"
      loading="eager"
      onError={() => setFailed(true)}
    />
  );
  // Turning strips only need the print face. Keep controls on the resting pages.
  return decorative ? (
    <div className="book-print">{print}</div>
  ) : (
    <button
      type="button"
      className="book-print"
      onClick={(event) => onOpen(photo, event.currentTarget)}
      aria-label={`Open photo: ${photo.alt}`}
    >
      {print}
    </button>
  );
}

function Page({
  index,
  side,
  decorative = false,
  canTurn,
  onTurn,
  onOpen,
}: {
  index: number;
  side: "left" | "right" | "single";
  decorative?: boolean;
  canTurn: boolean;
  onTurn: () => void;
  onOpen: (photo: BookPhoto, button: HTMLButtonElement) => void;
}) {
  const page = bookPages[index];
  return (
    <article
      className={`book-page book-page--${side} book-page--album`}
      aria-label={`Page ${index + 1}: ${page.title}`}
    >
      {side === "single" && <PaperPunches />}
      <div className="book-page-content" data-composition={page.composition}>
        <header className="book-story-heading">
          <p>
            {page.date}
            {page.event !== page.title && ` · ${page.event}`}
          </p>
          <h2
            tabIndex={decorative ? undefined : -1}
            data-page-heading={!decorative ? "" : undefined}
          >
            {page.title}
          </h2>
        </header>
        <div className="book-composition">
          {page.photos.map((photo) => (
            <Photo
              key={photo.id}
              photo={photo}
              decorative={decorative}
              onOpen={onOpen}
            />
          ))}
        </div>
        <div className="book-folio">{number(index + 1)}</div>
      </div>
      <button
        className="book-turn-target"
        onClick={onTurn}
        disabled={!canTurn || decorative}
        tabIndex={decorative ? -1 : undefined}
        aria-label={
          side === "left"
            ? "Turn to the previous pages"
            : "Turn to the next pages"
        }
      >
        {canTurn && (
          <span className="book-corner">
            <span>{side === "left" ? "Back" : "Turn page"}</span>
            <Arrow left={side === "left"} />
          </span>
        )}
      </button>
    </article>
  );
}

type Turn = { from: number; to: number; direction: -1 | 1 };

export function ScrapbookBook() {
  const spread = useSyncExternalStore(
    subscribeToLayout,
    wideLayout,
    serverLayout,
  );
  const [page, setPage] = useState(0);
  const [turn, setTurn] = useState<Turn | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [viewerFailed, setViewerFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const book = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement | null>(null);
  const shouldFocus = useRef(false);
  const locked = useRef(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const current = getPageStart(page, spread);
  const last = Math.min(current + (spread ? 1 : 0), bookPages.length - 1);
  const chapter = chapters.find(
    (item) => item.id === bookPages[current].chapter,
  )!;
  const selected = selectedIndex === null ? null : bookPhotos[selectedIndex];
  const viewerOpen = selected !== null;
  const photoStart =
    bookPages
      .slice(0, current)
      .reduce((sum, item) => sum + item.photos.length, 0) + 1;
  const photoEnd =
    photoStart +
    bookPages
      .slice(current, last + 1)
      .reduce((sum, item) => sum + item.photos.length, 0) -
    1;

  const finishTurn = useCallback(() => {
    if (!turn) return;
    shouldFocus.current = true;
    locked.current = false;
    setPage(turn.to);
    setTurn(null);
  }, [turn]);

  useEffect(() => {
    if (!turn || !spread) return;
    // Recovery if a background tab or interrupted animation delays completion.
    const timeout = window.setTimeout(finishTurn, TURN_DURATION + 900);
    return () => window.clearTimeout(timeout);
  }, [turn, finishTurn, spread]);

  useLayoutEffect(() => {
    const body = book.current!;
    const measure = () => {
      const style = getComputedStyle(body);
      const gutter = parseFloat(style.getPropertyValue("--gutter-gap")) || 0;
      body.style.setProperty(
        "--leaf-width",
        `${(parseFloat(style.width) - gutter) / (spread ? 2 : 1)}px`,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, [spread]);

  useLayoutEffect(() => {
    if (!turn) return;
    if (!spread) {
      const outgoing = book.current!.querySelector<HTMLElement>(
        ".book-phone-outgoing",
      );
      const incoming = book.current!.querySelector<HTMLElement>(
        ".book-phone-current",
      )!;
      if (!outgoing) {
        finishTurn();
        return;
      }

      // Keep the old page fully visible while the real destination prints decode.
      const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
      let active = true;
      const forward = turn.direction === 1;
      const sheet = forward ? outgoing : incoming;
      const duration = 560;
      const animation = sheet.animate(
        [
          { transform: "perspective(1500px) rotateY(0deg)" },
          { transform: "perspective(1500px) rotateY(-90deg)" },
        ],
        {
          duration,
          direction: forward ? "normal" : "reverse",
          easing: "cubic-bezier(.42, 0, .35, 1)",
          fill: "both",
        },
      );
      // Pose the reverse sheet edge-on before the first paint, even on a cold cache.
      animation.pause();
      animation.currentTime = 0;
      animation.onfinish = finishTurn;
      let started = false;
      let recovery: number;
      const play = () => {
        if (!active || started) return;
        if (motion.matches) return finishTurn();
        started = true;
        animation.play();
        recovery = window.setTimeout(finishTurn, duration + 400);
      };
      // A slow or failed request must not lock navigation.
      const deadline = window.setTimeout(play, 1500);
      Promise.allSettled(
        Array.from(incoming.querySelectorAll("img"), (img) => img.decode()),
      ).then(play);
      const onPreference = () => {
        if (motion.matches) finishTurn();
      };
      motion.addEventListener("change", onPreference);
      return () => {
        active = false;
        window.clearTimeout(deadline);
        window.clearTimeout(recovery);
        motion.removeEventListener("change", onPreference);
        animation.onfinish = null;
        animation.cancel();
      };
    }
    const sheets = book.current!.querySelectorAll(".book-leaf");
    // Resizing can put the phone turn's destination in the current spread.
    if (!sheets.length) {
      finishTurn();
      return;
    }
    const gutter =
      parseFloat(
        getComputedStyle(book.current!).getPropertyValue("--gutter-gap"),
      ) || 0;
    const animations: Animation[] = [];
    const add = (element: Element, keyframes: Keyframe[]) => {
      const animation = element.animate(keyframes, {
        duration: TURN_DURATION,
        easing: "linear",
        fill: "both",
      });
      animation.pause();
      animation.currentTime = 0;
      animations.push(animation);
      return animation;
    };
    sheets.forEach((sheet, index) => {
      const frames = getTurnFrames(
        turn.direction,
        spread,
        gutter,
        index,
        sheets.length,
      );
      add(sheet, frames.sheet);
      sheet
        .querySelectorAll(".book-strip:not(.book-strip--root)")
        .forEach((joint) => add(joint, frames.joints));
      sheet
        .querySelectorAll(".book-strip-shade")
        .forEach((shade) => add(shade, frames.light));
      sheet
        .querySelectorAll(".book-leaf-tab")
        .forEach((tab) => add(tab, frames.tab));
    });
    const frames = getTurnFrames(
      turn.direction,
      spread,
      gutter,
      0,
      sheets.length,
    );
    const base = book.current!.querySelector(".book-base")!;
    book
      .current!.querySelectorAll(".book-divider-layer:not([hidden])")
      .forEach((layer) => {
        const start = Number(layer.getAttribute("data-page-start"));
        const before = getChapterTabState(
          start,
          getPageStart(turn.from, spread),
          spread,
        );
        const after = getChapterTabState(
          start,
          getPageStart(turn.to, spread),
          spread,
        );
        add(layer, getStackDepthFrames(before.depth, after.depth));
      });
    add(
      base.querySelector(".book-page--left")!,
      turn.direction === 1 ? frames.baseDeparting : frames.baseReceiving,
    );
    add(
      base.querySelector(".book-page--right")!,
      turn.direction === 1 ? frames.baseReceiving : frames.baseDeparting,
    );
    const shadows = book.current!.querySelector(".book-turn-shadows")!;
    add(
      shadows.querySelector(".book-shadow-receiving > span")!,
      frames.receiving,
    );
    add(shadows.querySelector(".book-shadow-landing > span")!, frames.landing);
    const completion = animations[0];
    completion.onfinish = finishTurn;
    // Rasterize the assembled sheet at rest before starting a shared clock.
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const start = document.timeline.currentTime;
        animations.forEach((animation) => {
          animation.play();
          animation.startTime = start;
        });
      });
    });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onPreference = () => {
      if (preference.matches) finishTurn();
    };
    preference.addEventListener("change", onPreference);
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
      preference.removeEventListener("change", onPreference);
      completion.onfinish = null;
      animations.forEach((animation) => animation.cancel());
    };
  }, [turn, finishTurn, spread]);

  useEffect(() => {
    if (shouldFocus.current && !turn) {
      const heading = root.current?.querySelector<HTMLElement>(
        "[data-page-heading]",
      );
      heading?.focus({ preventScroll: true });
      const bounds = heading?.getBoundingClientRect();
      if (bounds && (bounds.top < 0 || bounds.bottom > window.innerHeight)) {
        root.current?.querySelector(".book-stage")?.scrollIntoView({
          block: "start",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "instant"
            : "smooth",
        });
      }
      shouldFocus.current = false;
    }
  }, [current, turn]);

  useEffect(() => {
    if (!viewerOpen) return;
    const modal = dialog.current!;
    modal.showModal();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      modal.close();
      document.body.style.overflow = previous;
      opener.current?.focus({ preventScroll: true });
    };
  }, [viewerOpen]);

  function navigate(target: number) {
    if (locked.current || target === current) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shouldFocus.current = true;
      setPage(target);
      return;
    }
    locked.current = true;
    setTurn({
      from: current,
      to: target,
      direction: target > current ? 1 : -1,
    });
  }

  function move(direction: -1 | 1) {
    navigate(getPageTarget(current, direction, spread, bookPages.length));
  }

  function openPhoto(photo: BookPhoto, button: HTMLButtonElement) {
    if (suppressClick.current || locked.current) return;
    opener.current = button;
    setViewerFailed(false);
    setSelectedIndex(bookPhotos.findIndex((item) => item.id === photo.id));
  }

  function movePhoto(direction: -1 | 1) {
    if (selectedIndex === null) return;
    setViewerFailed(false);
    setSelectedIndex(
      Math.max(0, Math.min(bookPhotos.length - 1, selectedIndex + direction)),
    );
  }

  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    if (viewerOpen || (event.target as HTMLElement).closest(".book-chapters"))
      return;
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      move(event.key === "ArrowRight" ? 1 : -1);
    }
  }

  function startTouch(event: PointerEvent<HTMLElement>) {
    suppressClick.current = false;
    if (event.pointerType === "touch") {
      touchStart.current = { x: event.clientX, y: event.clientY };
    }
  }

  function endTouch(event: PointerEvent<HTMLElement>, viewer = false) {
    if (!touchStart.current || event.pointerType !== "touch") return;
    const dx = event.clientX - touchStart.current.x;
    const dy = event.clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      suppressClick.current = true;
      if (viewer) movePhoto(dx < 0 ? 1 : -1);
      else move(dx < 0 ? 1 : -1);
    }
  }

  function renderPage(
    index: number,
    side: "left" | "right" | "single",
    decorative = false,
  ) {
    const direction = side === "left" ? -1 : 1;
    return (
      <Page
        index={index}
        side={side}
        decorative={decorative}
        canTurn={
          !turn &&
          getPageTarget(current, direction, spread, bookPages.length) !==
            current
        }
        onTurn={() => move(direction)}
        onOpen={openPhoto}
      />
    );
  }

  const turnFrom = turn ? getPageStart(turn.from, spread) : current;
  const turnTo = turn ? getPageStart(turn.to, spread) : current;
  const leftBase = turn && spread && turn.direction === -1 ? turnTo : current;
  const rightBase =
    turn && turn.direction === 1
      ? turnTo + (spread ? 1 : 0)
      : current + (spread ? 1 : 0);
  const leaves = turn && spread ? getTurnLeaves(turnFrom, turnTo, spread) : [];
  const strips = getTurnStripCount(leaves.length);
  const stack = getBookStackDepths(current, bookPages.length);
  const chapterTabs = chapters.map((item) => {
    const start = bookPages.findIndex((page) => page.chapter === item.id);
    return {
      ...item,
      start,
      ...getChapterTabState(start, current, spread, leaves),
    };
  });

  return (
    <div className="scrapbook-experience" ref={root} onKeyDown={handleKeys}>
      <div className="book-stage">
        <div
          className={`memory-book ${spread ? "memory-book--spread" : "memory-book--single"} ${turn ? "memory-book--turning" : ""}`}
          ref={book}
          style={
            {
              "--strip-count": PAPER_STRIPS,
              "--tab-count": chapters.length,
              "--left-stack": `${stack.left}px`,
              "--right-stack": `${stack.right}px`,
            } as CSSProperties
          }
          role="region"
          aria-roledescription="scrapbook"
          aria-label={`${chapter.label}, ${spread ? "pages" : "page"} ${current + 1}${spread ? ` and ${last + 1}` : ""} of ${bookPages.length}`}
          aria-busy={!!turn}
          onPointerDown={startTouch}
          onPointerUp={(event) => endTouch(event)}
          onPointerCancel={() => {
            touchStart.current = null;
          }}
        >
          <nav
            className="book-chapters"
            aria-label="Scrapbook chapters"
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
          >
            {chapterTabs.map((item, index) => (
              <div
                key={item.id}
                className={`book-divider-layer book-divider-layer--${item.side}`}
                data-chapter={item.id}
                data-page-start={item.start}
                style={
                  {
                    "--chapter-index": index,
                    "--divider-depth": `${item.depth}px`,
                  } as CSSProperties
                }
                hidden={item.side === "hidden" || item.leafIndex !== -1}
              >
                <button
                  className={`book-chapter-tab book-chapter-tab--${item.side}`}
                  type="button"
                  onClick={() => navigate(item.start)}
                  aria-current={chapter.id === item.id ? "step" : undefined}
                  disabled={!!turn}
                >
                  <ChapterTabLabel index={index} />
                </button>
              </div>
            ))}
          </nav>
          <div className="book-cover" aria-hidden="true">
            <span className="book-board-edge book-board-edge--bottom" />
            <span className="book-board-edge book-board-edge--right" />
          </div>
          {!spread && <div className="book-folded-pages" aria-hidden="true" />}
          <div
            className="book-page-block book-page-block--left"
            aria-hidden="true"
          >
            <span className="book-block-bottom" />
            <span className="book-block-foreedge" />
          </div>
          <div
            className="book-page-block book-page-block--right"
            aria-hidden="true"
          >
            <span className="book-block-bottom" />
            <span className="book-block-foreedge" />
          </div>
          <div className="book-base" inert={!!turn}>
            {spread ? (
              <>
                {renderPage(leftBase, "left")}
                {renderPage(rightBase, "right")}
              </>
            ) : (
              (turn && turnFrom !== turnTo ? [turnFrom, turnTo] : [turnTo]).map(
                (index) => (
                  <div
                    key={index}
                    className={
                      index === turnTo
                        ? "book-phone-current"
                        : "book-phone-outgoing"
                    }
                    data-turning-sheet={
                      turn &&
                      index === (turn.direction === 1 ? turnFrom : turnTo)
                        ? ""
                        : undefined
                    }
                  >
                    {renderPage(index, "single")}
                  </div>
                ),
              )
            )}
          </div>
          {spread ? (
            <div className="book-binding" aria-hidden="true">
              <span className="book-gutter-bank book-gutter-bank--left" />
              <span className="book-gutter-bank book-gutter-bank--right" />
            </div>
          ) : (
            <RingBinding />
          )}
          {turn && spread && (
            <div
              className={`book-turn-shadows book-turn-shadows--${turn.direction === 1 ? "forward" : "backward"}`}
              aria-hidden="true"
            >
              <div className="book-shadow-receiving">
                <span />
              </div>
              <div className="book-shadow-landing">
                <span />
              </div>
            </div>
          )}
          {turn &&
            leaves.map(({ front, back }, index) => (
              <div
                key={index}
                className={`book-leaf book-leaf--${turn.direction === 1 ? "forward" : "backward"}${leaves.length > 1 ? " book-leaf--bundle" : ""}`}
                style={{ "--strip-count": strips } as CSSProperties}
                data-front-page={front + 1}
                data-back-page={spread ? back + 1 : undefined}
                aria-hidden="true"
                inert
              >
                <PaperStrip
                  strips={strips}
                  chapterTab={chapterTabs.map((item, chapterIndex) =>
                    item.leafIndex === index ? (
                      <TurningChapterTab
                        key={item.id}
                        index={chapterIndex}
                        side={
                          spread && turn.direction === -1 ? "left" : "right"
                        }
                        spread={spread}
                        active={item.id === chapter.id}
                      />
                    ) : null,
                  )}
                  front={renderPage(
                    front,
                    turn.direction === 1 ? "right" : "left",
                    true,
                  )}
                  back={renderPage(
                    back,
                    turn.direction === 1 ? "left" : "right",
                    true,
                  )}
                />
              </div>
            ))}
        </div>
      </div>
      <div className="book-navigation">
        <button
          className="book-nav-button"
          onClick={() => move(-1)}
          disabled={current === 0 || !!turn}
          aria-label="Previous page"
        >
          <Arrow left />
          <span>Previous</span>
        </button>
        <div
          className="book-progress"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <strong>
            {spread ? "Pages" : "Page"} {number(current + 1)}
            {spread ? `–${number(last + 1)}` : ""}{" "}
            <span>/ {number(bookPages.length)}</span>
          </strong>
          <span>
            Photos {photoStart}
            {photoEnd !== photoStart ? `–${photoEnd}` : ""} of{" "}
            {bookPhotos.length}
          </span>
        </div>
        <button
          className="book-nav-button"
          onClick={() => move(1)}
          disabled={last === bookPages.length - 1 || !!turn}
          aria-label="Next page"
        >
          <span>Next</span>
          <Arrow />
        </button>
      </div>
      <p className="book-instructions">
        <span className="book-desktop-instruction">
          Click a page to turn it · Use your ← → keys
        </span>
        <span className="book-mobile-instruction">
          Swipe or use the arrows to turn the page
        </span>
        <span>Choose a photo to take a closer look.</span>
      </p>
      {selected && (
        <dialog
          ref={dialog}
          className="scrapbook-viewer"
          aria-labelledby="viewer-title"
          onCancel={() => setSelectedIndex(null)}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            if (
              event.target === event.currentTarget &&
              (event.clientX < bounds.left ||
                event.clientX > bounds.right ||
                event.clientY < bounds.top ||
                event.clientY > bounds.bottom)
            )
              setSelectedIndex(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.stopPropagation();
              event.preventDefault();
              movePhoto(event.key === "ArrowRight" ? 1 : -1);
            }
          }}
        >
          <div className="scrapbook-viewer-top">
            <span>THE LATTE LAB SCRAPBOOK</span>
            <button
              className="viewer-close"
              autoFocus
              onClick={() => setSelectedIndex(null)}
              aria-label="Close photo"
            >
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="m6 6 12 12M6 18 18 6"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </button>
          </div>
          <div
            className="scrapbook-viewer-image"
            onPointerDown={startTouch}
            onPointerUp={(event) => endTouch(event, true)}
            onPointerCancel={() => {
              touchStart.current = null;
            }}
          >
            {viewerFailed ? (
              <div className="viewer-error">
                <p>This photo couldn’t load.</p>
                <button onClick={() => setViewerFailed(false)}>
                  Try again
                </button>
              </div>
            ) : (
              <Image
                key={selected.id}
                src={selected.src}
                alt={selected.alt}
                width={selected.width}
                height={selected.height}
                sizes="(max-width: 700px) 92vw, 1000px"
                loading="eager"
                onError={() => setViewerFailed(true)}
              />
            )}
          </div>
          <div className="scrapbook-viewer-bottom">
            <button
              className="viewer-arrow"
              onClick={() => movePhoto(-1)}
              disabled={selectedIndex === 0}
              aria-label="Previous photo"
            >
              <Arrow left />
            </button>
            <div aria-live="polite" aria-atomic="true">
              <h2 id="viewer-title">{selected.caption}</h2>
              <p>
                {selected.collection ? `${selected.collection} · ` : ""}
                {selected.date}
              </p>
              <span>
                Photo {selectedIndex! + 1} of {bookPhotos.length}
              </span>
            </div>
            <button
              className="viewer-arrow"
              onClick={() => movePhoto(1)}
              disabled={selectedIndex === bookPhotos.length - 1}
              aria-label="Next photo"
            >
              <Arrow />
            </button>
          </div>
        </dialog>
      )}
    </div>
  );
}
