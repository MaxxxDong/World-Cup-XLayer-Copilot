import type { ReplayBufferSnapshot, ReplayFrame } from "../shared/types";

const TARGET_FPS = 5;
const MIN_FRAME_INTERVAL_MS = 1000 / TARGET_FPS;

export class ReplayFrameBuffer {
  private frames: ReplayFrame[] = [];
  private latestFrameMs = 0;
  private startedAt?: string;

  constructor(
    private settings: Pick<ReplayBufferSnapshot, "windowSeconds" | "mode"> = {
      windowSeconds: 60,
      mode: "video-audio"
    }
  ) {}

  configure(settings: Pick<ReplayBufferSnapshot, "windowSeconds" | "mode">): void {
    this.settings = settings;
    this.prune(Date.now());
  }

  start(now = new Date()): void {
    this.startedAt = now.toISOString();
    this.latestFrameMs = 0;
    this.prune(now.getTime());
  }

  push(frame: ReplayFrame, nowMs = Date.parse(frame.capturedAt)): boolean {
    if (Number.isFinite(this.latestFrameMs) && nowMs - this.latestFrameMs < MIN_FRAME_INTERVAL_MS) {
      return false;
    }

    this.frames.push(frame);
    this.latestFrameMs = nowMs;
    this.prune(nowMs);
    return true;
  }

  clear(): void {
    this.frames = [];
    this.latestFrameMs = 0;
    this.startedAt = undefined;
  }

  snapshot(options: {
    replayEnabled: boolean;
    capturing: boolean;
    includeFrames?: boolean;
    maxFrames?: number;
  }): ReplayBufferSnapshot {
    const latest = this.frames.at(-1);
    const frames = options.includeFrames
      ? selectReplayKeyframes(this.frames, options.maxFrames)
      : undefined;
    return {
      replayEnabled: options.replayEnabled,
      capturing: options.capturing,
      windowSeconds: this.settings.windowSeconds,
      mode: this.settings.mode,
      frameCount: this.frames.length,
      frameBytes: this.frames.reduce((total, frame) => total + byteSize(frame.dataUrl), 0),
      startedAt: this.startedAt,
      latestFrameAt: latest?.capturedAt,
      frames
    };
  }

  private prune(nowMs: number): void {
    const cutoff = nowMs - this.settings.windowSeconds * 1000;
    const maxFrames = this.settings.windowSeconds * TARGET_FPS;
    this.frames = this.frames.filter((frame) => Date.parse(frame.capturedAt) >= cutoff).slice(-maxFrames);
  }
}

function byteSize(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function selectReplayKeyframes(frames: ReplayFrame[], maxFrames = 6): ReplayFrame[] {
  if (frames.length === 0 || maxFrames <= 0) return [];
  if (frames.length <= maxFrames) return [...frames];
  if (maxFrames === 1) return [frames.at(-1)!];
  if (frames.some((frame) => typeof frame.motionScore === "number")) {
    return selectMotionKeyframes(frames, maxFrames);
  }

  const selected: ReplayFrame[] = [];
  const lastIndex = frames.length - 1;
  const denominator = maxFrames - 1;
  for (let index = 0; index < maxFrames; index += 1) {
    selected.push(frames[Math.round((index * lastIndex) / denominator)]);
  }
  return selected;
}

function selectMotionKeyframes(frames: ReplayFrame[], maxFrames: number): ReplayFrame[] {
  const selected = new Map<number, ReplayFrame>();
  const lastIndex = frames.length - 1;
  selected.set(0, frames[0]);
  selected.set(lastIndex, frames[lastIndex]);

  const middleSlots = Math.max(0, maxFrames - selected.size);
  const firstMiddle = 1;
  const lastMiddle = lastIndex - 1;
  const middleCount = lastMiddle - firstMiddle + 1;

  for (let slot = 0; slot < middleSlots && middleCount > 0; slot += 1) {
    const start = firstMiddle + Math.round((slot * middleCount) / middleSlots);
    const end = firstMiddle + Math.round(((slot + 1) * middleCount) / middleSlots) - 1;
    const boundedEnd = Math.max(start, Math.min(lastMiddle, end));
    let bestIndex = start;
    for (let index = start + 1; index <= boundedEnd; index += 1) {
      if (motionScore(frames[index]) > motionScore(frames[bestIndex])) {
        bestIndex = index;
      }
    }
    selected.set(bestIndex, frames[bestIndex]);
  }

  return [...selected.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, frame]) => frame)
    .slice(0, maxFrames);
}

function motionScore(frame: ReplayFrame): number {
  return typeof frame.motionScore === "number" ? frame.motionScore : 0;
}
