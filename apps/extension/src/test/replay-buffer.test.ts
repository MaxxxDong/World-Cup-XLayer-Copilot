import { describe, expect, it } from "vitest";
import { ReplayFrameBuffer, selectReplayKeyframes } from "../services/replay-buffer";

describe("ReplayFrameBuffer", () => {
  it("keeps a bounded rolling window at the target 5 fps", () => {
    const buffer = new ReplayFrameBuffer({ windowSeconds: 30, mode: "video-audio" });
    buffer.start(new Date("2026-06-12T00:00:00.000Z"));

    for (let index = 0; index < 260; index += 1) {
      const capturedAt = new Date(Date.parse("2026-06-12T00:00:00.000Z") + index * 200).toISOString();
      buffer.push({
        capturedAt,
        dataUrl: `data:image/jpeg;base64,${index}`,
        width: 1280,
        height: 720
      });
    }

    const snapshot = buffer.snapshot({ replayEnabled: true, capturing: true, includeFrames: true });

    expect(snapshot.frameCount).toBeLessThanOrEqual(150);
    expect(snapshot.frameBytes).toBeGreaterThan(0);
    expect(snapshot.frames?.[0].capturedAt).toBe("2026-06-12T00:00:22.000Z");
    expect(snapshot.latestFrameAt).toBe("2026-06-12T00:00:51.800Z");
  });

  it("drops frames above the target capture cadence", () => {
    const buffer = new ReplayFrameBuffer({ windowSeconds: 60, mode: "video-audio" });

    const firstAccepted = buffer.push({
      capturedAt: "2026-06-12T00:00:00.000Z",
      dataUrl: "data:image/jpeg;base64,first",
      width: 1280,
      height: 720
    });
    const secondAccepted = buffer.push({
      capturedAt: "2026-06-12T00:00:00.100Z",
      dataUrl: "data:image/jpeg;base64,second",
      width: 1280,
      height: 720
    });

    expect(firstAccepted).toBe(true);
    expect(secondAccepted).toBe(false);
    expect(buffer.snapshot({ replayEnabled: true, capturing: true }).frameCount).toBe(1);
  });

  it("selects a bounded timeline of replay keyframes for user-triggered analysis", () => {
    const frames = Array.from({ length: 20 }, (_, index) => ({
      capturedAt: new Date(Date.parse("2026-06-12T00:00:00.000Z") + index * 1000).toISOString(),
      dataUrl: `data:image/jpeg;base64,frame-${index}`,
      width: 1280,
      height: 720
    }));

    const selected = selectReplayKeyframes(frames, 6);

    expect(selected).toHaveLength(6);
    expect(selected.map((frame) => frame.dataUrl)).toEqual([
      "data:image/jpeg;base64,frame-0",
      "data:image/jpeg;base64,frame-4",
      "data:image/jpeg;base64,frame-8",
      "data:image/jpeg;base64,frame-11",
      "data:image/jpeg;base64,frame-15",
      "data:image/jpeg;base64,frame-19"
    ]);
  });

  it("prefers high-motion frames while preserving the first and latest frame", () => {
    const frames = Array.from({ length: 20 }, (_, index) => ({
      capturedAt: new Date(Date.parse("2026-06-12T00:00:00.000Z") + index * 1000).toISOString(),
      dataUrl: `data:image/jpeg;base64,frame-${index}`,
      width: 1280,
      height: 720,
      motionScore: [3, 9, 14, 18].includes(index) ? 100 - index : 1
    }));

    const selected = selectReplayKeyframes(frames, 6);

    expect(selected.map((frame) => frame.dataUrl)).toEqual([
      "data:image/jpeg;base64,frame-0",
      "data:image/jpeg;base64,frame-3",
      "data:image/jpeg;base64,frame-9",
      "data:image/jpeg;base64,frame-14",
      "data:image/jpeg;base64,frame-18",
      "data:image/jpeg;base64,frame-19"
    ]);
  });
});
