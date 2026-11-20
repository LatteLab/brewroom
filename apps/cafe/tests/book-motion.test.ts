import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getTurnFrames,
  getTurnLeaves,
  getTurnPose,
  getRingTurnPose,
  getChapterTabState,
  getBookStackDepths,
  PAGE_LAYER_DEPTH,
  getStackDepthFrames,
} from "../lib/book-motion.ts";

const frameDepth = (frame: Keyframe) =>
  Number(/translateZ\(([-.\d]+)px\)/.exec(String(frame.transform))?.[1] ?? 0);

test("divider depths follow page order and remain inside their paper blocks", () => {
  for (const spread of [true, false]) {
    for (let current = 0; current < 12; current += spread ? 2 : 1) {
      const stack = getBookStackDepths(current, 12);
      assert.ok(
        Math.abs(stack.left + stack.right - (12 + 10 * PAGE_LAYER_DEPTH)) <
          1e-8,
      );
      for (const start of [0, 2, 4, 6, 8, 10]) {
        const tab = getChapterTabState(start, current, spread);
        if (tab.side === "hidden") continue;
        assert.ok(tab.depth < 0);
        assert.ok(-tab.depth < stack[tab.side]);
      }
    }
  }
  assert.equal(
    getChapterTabState(0, 4, true).depth,
    getChapterTabState(2, 4, true).depth - 2 * PAGE_LAYER_DEPTH,
  );
  assert.equal(
    getChapterTabState(8, 4, true).depth,
    getChapterTabState(6, 4, true).depth - 2 * PAGE_LAYER_DEPTH,
  );
});

test("turning desktop dividers meet the same depth on both resting stacks", () => {
  for (const [from, to] of [
    [0, 10],
    [10, 0],
    [2, 8],
    [8, 2],
  ]) {
    const leaves = getTurnLeaves(from, to, true);
    for (const start of [2, 4, 6, 8, 10]) {
      const before = getChapterTabState(start, from, true, leaves);
      if (before.leafIndex < 0) continue;
      const after = getChapterTabState(start, to, true);
      const frames = getTurnFrames(
        to > from ? 1 : -1,
        true,
        0,
        before.leafIndex,
        leaves.length,
      );
      assert.ok(
        Math.abs(frameDepth(frames.sheet[0]) - 0.5 - before.depth) < 1e-8,
      );
      assert.ok(
        Math.abs(frameDepth(frames.sheet.at(-1)!) - 0.5 - after.depth) < 1e-8,
      );
    }
  }
});

test("receiving paper rises from below the turning packet as the old stack recedes", () => {
  for (const spread of [true, false]) {
    const frames = getTurnFrames(1, spread, 0, 0, 5);
    const packetDepth = 5 * PAGE_LAYER_DEPTH * (spread ? 2 : 1);
    assert.equal(frameDepth(frames.baseReceiving[0]), -packetDepth);
    assert.equal(frameDepth(frames.baseReceiving.at(-1)!), 0);
    assert.equal(frameDepth(frames.baseDeparting[0]), 0);
    assert.equal(frameDepth(frames.baseDeparting.at(-1)!), -packetDepth);
  }
});

test("stationary dividers remain below their illustrated pages throughout a turn", () => {
  for (const [from, to] of [
    [0, 4],
    [4, 0],
    [2, 8],
    [8, 2],
  ]) {
    const leaves = getTurnLeaves(from, to, true);
    const frames = getTurnFrames(to > from ? 1 : -1, true, 0, 0, leaves.length);
    for (const start of [0, 2, 4, 6, 8, 10]) {
      const before = getChapterTabState(start, from, true, leaves);
      if (before.leafIndex >= 0) continue;
      const after = getChapterTabState(start, to, true);
      const divider = getStackDepthFrames(before.depth, after.depth);
      const departing = to > from === (before.side === "left");
      const page = departing ? frames.baseDeparting : frames.baseReceiving;
      divider.forEach((frame, index) => {
        assert.ok(frameDepth(frame) <= frameDepth(page[index]) - 0.49);
      });
    }
  }
});

test("page three has two reversed desktop dividers and two tucked mobile tabs", () => {
  const starts = [0, 2, 4, 6, 8, 10];
  assert.deepEqual(
    starts.map((start) => getChapterTabState(start, 2, true).side),
    ["left", "left", "right", "right", "right", "right"],
  );
  assert.deepEqual(
    starts.map((start) => getChapterTabState(start, 2, false).side),
    ["hidden", "hidden", "right", "right", "right", "right"],
  );
});

test("chapter dividers follow the same physical sheets forward and backward", () => {
  for (const spread of [true, false]) {
    const forward = getTurnLeaves(0, 10, spread);
    const backward = getTurnLeaves(10, 0, spread);
    for (const start of [0, 2, 4, 6, 8, 10]) {
      const next = getChapterTabState(start, 0, spread, forward);
      const previous = getChapterTabState(start, 10, spread, backward);
      if (spread && start === 0) {
        assert.equal(next.leafIndex, -1);
        assert.equal(previous.leafIndex, -1);
      } else {
        assert.ok(next.leafIndex >= 0);
        assert.equal(previous.leafIndex, forward.length - 1 - next.leafIndex);
      }
    }
  }
  assert.equal(
    getChapterTabState(4, 0, true, getTurnLeaves(0, 2, true)).leafIndex,
    -1,
  );
  assert.equal(
    getChapterTabState(2, 0, false, getTurnLeaves(0, 1, false)).leafIndex,
    -1,
  );
});

test("only dividers changing sides join an adjacent page turn", () => {
  for (const spread of [true, false]) {
    const step = spread ? 2 : 1;
    for (let from = 0; from < 12 - step; from += step) {
      for (const [origin, target] of [
        [from, from + step],
        [from + step, from],
      ]) {
        const leaves = getTurnLeaves(origin, target, spread);
        for (const start of [0, 2, 4, 6, 8, 10]) {
          const before = getChapterTabState(start, origin, spread, leaves);
          const after = getChapterTabState(start, target, spread);
          assert.equal(before.leafIndex >= 0, before.side !== after.side);
        }
      }
    }
  }
});

test("mobile divider tabs tuck under the book and reverse out on the sheet clock", () => {
  for (let index = 0; index < 10; index++) {
    const forward = getTurnFrames(1, false, 0, index, 10).tab;
    const backward = getTurnFrames(-1, false, 0, index, 10).tab;
    assert.equal(forward[0].transform, "translateX(0%)");
    assert.equal(forward.at(-1)?.transform, "translateX(-100%)");
    assert.equal(backward[0].transform, "translateX(-100%)");
    assert.equal(backward.at(-1)?.transform, "translateX(0%)");
  }
  assert.ok(
    getTurnFrames(1, true, 0).tab.every(
      (frame) => frame.transform === "translateX(0%)",
    ),
  );
});

test("the hinge and outer edge move forward continuously and settle flat", () => {
  assert.deepEqual(getTurnPose(0), { hinge: 0, bend: 0 });
  assert.deepEqual(getTurnPose(1), { hinge: 180, bend: 0 });
  let hinge = 0,
    edge = 0;
  for (let index = 1; index <= 1000; index++) {
    const pose = getTurnPose(index / 1000);
    assert.ok(pose.hinge >= hinge);
    assert.ok(pose.hinge + pose.bend >= edge);
    assert.ok(pose.hinge >= 0 && pose.hinge + pose.bend <= 180 + 1e-8);
    hinge = pose.hinge;
    edge = pose.hinge + pose.bend;
  }
});

test("chapter jumps turn every intervening physical sheet in reading order", () => {
  const forward = getTurnLeaves(0, 10, true);
  assert.deepEqual(forward, [
    { front: 1, back: 2 },
    { front: 3, back: 4 },
    { front: 5, back: 6 },
    { front: 7, back: 8 },
    { front: 9, back: 10 },
  ]);
  assert.deepEqual(
    getTurnLeaves(10, 0, true),
    forward
      .toReversed()
      .map(({ front, back }) => ({ front: back, back: front })),
  );
  assert.deepEqual(getTurnLeaves(4, 4, true), []);
  assert.equal(getTurnLeaves(2, 4, true).length, 1);
});

test("phone chapter jumps include each intervening page in both directions", () => {
  for (const [from, to] of [
    [0, 10],
    [11, 0],
    [3, 8],
    [4, 3],
  ]) {
    const leaves = getTurnLeaves(from, to, false);
    assert.equal(leaves.length, Math.abs(to - from));
    assert.equal(leaves[0].front, from);
    assert.equal(leaves.at(-1)?.back, to);
    leaves.slice(1).forEach((leaf, index) => {
      assert.equal(leaf.front, leaves[index].back);
    });
  }
});

test("jump sheets fan concurrently and all settle within one turn timeline", () => {
  for (const direction of [-1, 1] as const) {
    const turns = Array.from({ length: 5 }, (_, index) =>
      getTurnFrames(direction, true, 0, index, 5),
    );
    const angle = (frame: Keyframe) =>
      Math.abs(
        Number(/rotateY\(([-.\d]+)deg\)/.exec(String(frame.transform))![1]),
      );
    turns.forEach(({ sheet, joints, light }, index) => {
      assert.equal(sheet[0].offset, 0);
      assert.equal(sheet.at(-1)?.offset, 1);
      assert.equal(angle(sheet[0]), 0);
      assert.equal(angle(sheet.at(-1)!), 180);
      assert.equal(joints.at(-1)?.transform, "rotateY(0deg)");
      assert.equal(light[0].opacity, 0);
      assert.ok(Number(light.at(-1)?.opacity) < 1e-10);
      assert.ok(angle(sheet[40]) > 0 && angle(sheet[40]) < 180);
      if (index)
        assert.ok(angle(turns[index - 1].sheet[40]) > angle(sheet[40]));
    });
  }
});

test("there are no velocity resets at the previous stop-start waypoints", () => {
  const h = 0.0001;
  for (const t of [0.2, 0.45, 0.65, 0.82]) {
    const before = (getTurnPose(t).hinge - getTurnPose(t - h).hinge) / h;
    const after = (getTurnPose(t + h).hinge - getTurnPose(t).hinge) / h;
    assert.ok(before > 1 && after > 1);
    assert.ok(Math.abs(before - after) < 0.5);
  }
});

test("forward and reverse paper shapes are symmetric", () => {
  for (const t of [0.1, 0.25, 0.5, 0.75, 0.9]) {
    const front = getTurnPose(t),
      back = getTurnPose(1 - t);
    assert.ok(Math.abs(front.bend - back.bend) < 1e-8);
    assert.ok(Math.abs(front.hinge + back.hinge + front.bend - 180) < 1e-8);
  }
});

test("spread turns cross the binding and ring turns return behind the same page", () => {
  const next = getTurnFrames(1, true, 12),
    previous = getTurnFrames(-1, true, 12);
  assert.equal(
    next.sheet.at(-1)?.transform,
    "translateX(-12px) rotateY(-180deg)",
  );
  assert.equal(
    previous.sheet.at(-1)?.transform,
    "translateX(12px) rotateY(180deg)",
  );
  const phone = getTurnFrames(-1, false, 0);
  assert.match(String(phone.sheet[0].transform), /rotateY\(-360deg\)/);
  assert.match(String(phone.sheet.at(-1)?.transform), /rotateY\(0deg\)/);
  assert.equal(next.receiving[0].opacity, 0);
  assert.ok(Number(next.receiving.at(-1)?.opacity) < 1e-10);
});

test("mobile sheets wrap a full turn around the rings and settle underneath", () => {
  const initial = getRingTurnPose(0),
    final = getRingTurnPose(1);
  assert.equal(initial.hinge, 0);
  assert.equal(final.hinge, 360);
  assert.equal(initial.bend, 0);
  assert.equal(final.bend, 0);
  assert.ok(Math.abs(final.x) < 1e-10);
  assert.ok(initial.depth > 0 && final.depth < -20);
  let angle = 0,
    edge = 0;
  for (let index = 1; index <= 1000; index++) {
    const pose = getRingTurnPose(index / 1000);
    assert.ok(pose.hinge >= angle);
    assert.ok(pose.hinge + pose.bend >= edge);
    assert.ok(pose.x <= 0);
    angle = pose.hinge;
    edge = pose.hinge + pose.bend;
  }
});

test("mobile chapter fans all finish under the book and reverse back to its front", () => {
  for (const direction of [-1, 1] as const) {
    for (let index = 0; index < 10; index++) {
      const frames = getTurnFrames(direction, false, 0, index, 10);
      const tucked = direction === 1 ? frames.sheet.at(-1)! : frames.sheet[0];
      const visible = direction === 1 ? frames.sheet[0] : frames.sheet.at(-1)!;
      const depth = (frame: Keyframe) =>
        Number(/translateZ\(([-.\d]+)px\)/.exec(String(frame.transform))![1]);
      assert.ok(depth(tucked) < -20);
      const topLayer = direction === 1 ? index : 9 - index;
      assert.ok(Math.abs(depth(visible) + topLayer * PAGE_LAYER_DEPTH) < 1e-8);
      assert.match(String(tucked.transform), /rotateY\(-360deg\)/);
      assert.match(String(visible.transform), /rotateY\(0deg\)/);
      assert.equal(frames.sheet.at(-1)?.offset, 1);
    }
  }
});
