export const TURN_DURATION = 1100;
export const PAPER_STRIPS = 18;
// Paper layers fit between the open page and the back cover.
export const PAGE_LAYER_DEPTH = 1;

export function getBookStackDepths(current: number, total: number) {
  const page = Math.min(current, total - 2);
  return {
    left: 6 + page * PAGE_LAYER_DEPTH,
    right: 6 + (total - 2 - page) * PAGE_LAYER_DEPTH,
  };
}

export function getTurnLeaves(from: number, to: number, spread: boolean) {
  const direction = to > from ? 1 : -1;
  const step = spread ? 2 : 1;
  return Array.from({ length: Math.abs(to - from) / step }, (_, index) => {
    const page = from + direction * step * index;
    return {
      front: page + (spread && direction === 1 ? 1 : 0),
      back: page + direction * step + (spread && direction === -1 ? 1 : 0),
    };
  });
}

// A divider is the sheet immediately before its chapter's opening page.
export function getChapterTabState(
  chapterStart: number,
  current: number,
  spread: boolean,
  leaves: { front: number; back: number }[] = [],
): { side: "left" | "right" | "hidden"; leafIndex: number; depth: number } {
  const divider = Math.max(0, chapterStart - 1);
  const side = spread
    ? chapterStart <= current
      ? "left"
      : "right"
    : divider < current
      ? "hidden"
      : "right";
  const leafIndex = leaves.findIndex(({ front, back }) =>
    spread
      ? front === chapterStart || back === chapterStart
      : Math.min(front, back) === divider,
  );
  const pagesBehind = spread
    ? side === "left"
      ? current - chapterStart
      : chapterStart - current - 2
    : Math.max(0, divider - current);
  const depth = -0.5 - pagesBehind * PAGE_LAYER_DEPTH;
  return { side, leafIndex, depth };
}

// A fan exposes less of each sheet, so keep its total mesh cost bounded.
export function getTurnStripCount(count: number) {
  return count <= 1
    ? PAPER_STRIPS
    : Math.max(6, Math.floor(24 / Math.sqrt(count)));
}

function ease(progress: number) {
  return progress ** 3 * (progress * (progress * 6 - 15) + 10);
}

export function getStackDepthFrames(from: number, to: number): Keyframe[] {
  return Array.from({ length: 81 }, (_, index) => {
    const offset = index / 80;
    return {
      offset,
      transform: `translateZ(${from + (to - from) * ease(offset)}px)`,
    };
  });
}

// Continuous velocity and acceleration, with a flexible outer edge that leads
// the hinge. Ease the whole turn, rather than restarting easing at waypoints.
export function getTurnPose(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const bend = t === 0 || t === 1 ? 0 : 80 * Math.sin(Math.PI * t) ** 4;
  return { hinge: 180 * ease(t) - bend / 2, bend };
}

// The punched edge travels around the rings while the flexible sheet makes a
// complete wrap, returning to the same footprint underneath the open page.
export function getRingTurnPose(progress: number) {
  const t = Math.max(0, Math.min(1, progress));
  const bend = t === 0 || t === 1 ? 0 : 96 * Math.sin(Math.PI * t) ** 4;
  return {
    hinge: 360 * ease(t) - bend / 2,
    bend,
    x: -16 * Math.sin(Math.PI * t) ** 2,
    depth: 0.6 - 25.6 * ease(t),
  };
}

export function getTurnFrames(
  direction: -1 | 1,
  spread: boolean,
  gutter: number,
  leafIndex = 0,
  leafCount = 1,
) {
  const sheet: Keyframe[] = [];
  const joints: Keyframe[] = [];
  const receiving: Keyframe[] = [];
  const landing: Keyframe[] = [];
  const light: Keyframe[] = [];
  const tab: Keyframe[] = [];
  const strips = getTurnStripCount(leafCount);
  const fan = leafCount > 1;
  const lag = fan ? (0.24 * leafIndex) / (leafCount - 1) : 0;
  const sign = direction === 1 || !spread ? -1 : 1;
  for (let index = 0; index <= 80; index++) {
    const offset = index / 80;
    // All leaves overlap within the same 1100ms clock; none queue a full turn.
    const progress = fan
      ? Math.max(0, Math.min(1, (offset - lag) / 0.76))
      : offset;
    const t = !spread && direction === -1 ? 1 - progress : progress;
    const ring = getRingTurnPose(t);
    const pose = spread ? getTurnPose(t) : ring;
    const bend =
      pose.bend *
      (fan
        ? 0.84 + 0.16 * Math.sin((Math.PI * (leafIndex + 0.5)) / leafCount)
        : 1);
    const hinge = pose.hinge + (pose.bend - bend) / 2;
    const sheetSpacing = PAGE_LAYER_DEPTH * (spread ? 2 : 1);
    const startLayer = leafIndex;
    const endLayer = leafCount - 1 - leafIndex;
    const stackDepth = spread
      ? -sheetSpacing *
        (startLayer * (1 - ease(progress)) + endLayer * ease(progress))
      : -sheetSpacing *
        (direction === 1 ? startLayer : endLayer) *
        (1 - ease(t));
    // Start level with the open paper; the raw ring pose includes clearance.
    const ringDepth = ring.depth - 0.6 * (1 - ease(t));
    const depth =
      fan || !spread
        ? ` translateZ(${stackDepth + (spread ? 0 : ringDepth)}px)`
        : "";
    const shadowProgress = Math.min(
      1,
      (direction === 1 ? offset : 1 - offset) / 0.62,
    );
    const pulse = Math.sin(Math.PI * (spread ? offset : shadowProgress));
    const shadowTravel = spread ? offset : shadowProgress;
    const settle = Math.max(0, (offset - 0.35) / 0.65);
    sheet.push({
      offset,
      transform: `translateX(${spread ? -direction * gutter * ease(progress) : ring.x}px)${depth} rotateY(${sign * hinge}deg)`,
    });
    joints.push({
      offset,
      transform: `rotateY(${(sign * bend) / (strips - 1)}deg)`,
    });
    light.push({ offset, opacity: Math.sin(Math.PI * progress) ** 1.6 });
    // The mobile divider's outer tab tucks inside the page edge underneath.
    const tuck = spread ? 0 : ease(Math.max(0, Math.min(1, (t - 0.55) / 0.4)));
    tab.push({ offset, transform: `translateX(${-100 * tuck}%)` });
    receiving.push({
      offset,
      opacity: (fan ? 0.85 : 0.75) * pulse ** 2,
      transform: `translateX(${82 - 172 * ease(shadowTravel)}%) scaleX(${0.45 + (fan ? 0.7 : 0.55) * pulse})`,
    });
    landing.push({
      offset,
      opacity: 0.4 * Math.sin(Math.PI * settle) ** 2,
      transform: `translateX(${90 - 120 * ease(settle)}%) scaleX(${0.35 + 0.65 * Math.sin(Math.PI * settle)})`,
    });
  }
  const packetDepth = leafCount * PAGE_LAYER_DEPTH * (spread ? 2 : 1);
  return {
    sheet,
    joints,
    receiving,
    landing,
    light,
    tab,
    baseReceiving: getStackDepthFrames(-packetDepth, 0),
    baseDeparting: getStackDepthFrames(0, -packetDepth),
  };
}
