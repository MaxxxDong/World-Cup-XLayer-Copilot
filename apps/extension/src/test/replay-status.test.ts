import { describe, expect, it } from "vitest";
import {
  formatReplayStatusLine,
  REPLAY_STATUS_REFRESH_MS,
  shouldShowReplayAudioUploadStats,
  shouldShowReplayFrameUploadStats
} from "../domain/replay-status";
import { defaultSettings } from "../services/settings";
import type { ReplayBufferSnapshot, UserSettings } from "../shared/types";

const baseSettings: UserSettings = {
  ...defaultSettings,
  language: "en",
  llm: {
    ...defaultSettings.llm,
    visionModel: "vision-model"
  },
  replay: {
    ...defaultSettings.replay,
    enabled: false,
    mode: "video-audio"
  },
  transcription: {
    ...defaultSettings.transcription,
    enabled: true,
    endpoint: "https://asr.example.test/v1/audio/transcriptions",
    apiKey: "asr-key",
    model: "qwen3-asr-flash"
  }
};

const activeStatus: ReplayBufferSnapshot = {
  replayEnabled: true,
  capturing: true,
  windowSeconds: 30,
  mode: "video-audio",
  frameCount: 42,
  frameBytes: 2048,
  audioChunkCount: 7,
  audioBytes: 4096,
  audioDurationSeconds: 12
};

describe("replay status line", () => {
  it("refreshes the visible Instant Replay status every 5 seconds", () => {
    expect(REPLAY_STATUS_REFRESH_MS).toBe(5000);
  });

  it("shows audio upload stats without implying video upload is enabled", () => {
    const settings: UserSettings = {
      ...baseSettings,
      replay: {
        ...baseSettings.replay,
        uploadFramesToAI: false,
        uploadAudioToASR: true
      }
    };
    const status: ReplayBufferSnapshot = {
      ...activeStatus,
      captureVideo: false,
      captureAudio: true
    };

    expect(shouldShowReplayFrameUploadStats(settings, status)).toBe(false);
    expect(shouldShowReplayAudioUploadStats(settings, status)).toBe(true);

    const line = formatReplayStatusLine("en", settings, status);
    expect(line).toContain("Video: off");
    expect(line).toContain("Audio: ~12s, 7 chunks, 4.0 KB");
    expect(line).not.toContain("42 frames");
  });

  it("shows video upload stats without implying audio upload is enabled", () => {
    const settings: UserSettings = {
      ...baseSettings,
      replay: {
        ...baseSettings.replay,
        uploadFramesToAI: true,
        uploadAudioToASR: false
      }
    };
    const status: ReplayBufferSnapshot = {
      ...activeStatus,
      captureVideo: true,
      captureAudio: false
    };

    expect(shouldShowReplayFrameUploadStats(settings, status)).toBe(true);
    expect(shouldShowReplayAudioUploadStats(settings, status)).toBe(false);

    const line = formatReplayStatusLine("en", settings, status);
    expect(line).toContain("Video: 42 frames, 2.0 KB");
    expect(line).toContain("Audio: off");
    expect(line).not.toContain("7 chunks");
  });

  it("does not show video upload stats in audio-only mode", () => {
    const settings: UserSettings = {
      ...baseSettings,
      replay: {
        ...baseSettings.replay,
        mode: "audio-only",
        uploadFramesToAI: true,
        uploadAudioToASR: false
      }
    };
    const status: ReplayBufferSnapshot = {
      ...activeStatus,
      mode: "audio-only",
      captureVideo: false
    };

    expect(shouldShowReplayFrameUploadStats(settings, status)).toBe(false);
    expect(formatReplayStatusLine("en", settings, status)).toContain("Video: off");
  });

  it("does not show audio upload stats before ASR is configured", () => {
    const settings: UserSettings = {
      ...baseSettings,
      replay: {
        ...baseSettings.replay,
        uploadFramesToAI: false,
        uploadAudioToASR: true
      },
      transcription: {
        ...baseSettings.transcription,
        endpoint: ""
      }
    };

    expect(shouldShowReplayAudioUploadStats(settings)).toBe(false);
    expect(formatReplayStatusLine("en", settings, activeStatus)).toContain("Audio: off");
  });

  it("does not show video upload readiness before a vision model is configured", () => {
    const settings: UserSettings = {
      ...baseSettings,
      llm: {
        ...baseSettings.llm,
        visionModel: ""
      },
      replay: {
        ...baseSettings.replay,
        uploadFramesToAI: true,
        uploadAudioToASR: false
      }
    };

    expect(shouldShowReplayFrameUploadStats(settings)).toBe(false);
    expect(formatReplayStatusLine("en", settings, activeStatus)).toContain("Video: off");
  });

  it("shows enabled evidence switches while idle without stale capture stats", () => {
    const settings: UserSettings = {
      ...baseSettings,
      replay: {
        ...baseSettings.replay,
        uploadFramesToAI: true,
        uploadAudioToASR: true
      }
    };
    const stoppedStatus: ReplayBufferSnapshot = {
      ...activeStatus,
      capturing: false,
      captureVideo: false,
      captureAudio: false,
      frameCount: 0,
      frameBytes: 0,
      audioChunkCount: 0,
      audioBytes: 0,
      audioDurationSeconds: 0
    };

    const line = formatReplayStatusLine("en", settings, stoppedStatus);

    expect(line).toContain("Idle");
    expect(line).toContain("Video: On");
    expect(line).toContain("Audio: On");
    expect(line).not.toContain("42 frames");
    expect(line).not.toContain("7 chunks");
  });

  it("updates the idle line from settings when switches change before capture starts", () => {
    const stoppedStatus: ReplayBufferSnapshot = {
      ...activeStatus,
      capturing: false,
      captureVideo: false,
      captureAudio: false,
      frameCount: 0,
      frameBytes: 0,
      audioChunkCount: 0,
      audioBytes: 0,
      audioDurationSeconds: 0
    };

    const offLine = formatReplayStatusLine("en", {
      ...baseSettings,
      replay: {
        ...baseSettings.replay,
        uploadFramesToAI: false,
        uploadAudioToASR: false
      }
    }, stoppedStatus);
    const onLine = formatReplayStatusLine("en", {
      ...baseSettings,
      replay: {
        ...baseSettings.replay,
        uploadFramesToAI: true,
        uploadAudioToASR: true
      }
    }, stoppedStatus);

    expect(offLine).toContain("Idle · Video: off · Audio: off");
    expect(onLine).toContain("Idle · Video: On · Audio: On");
  });
});
