import { describe, expect, it } from "vitest";
import {
  getReplayAudioUploadWindowSeconds,
  shouldUploadReplayAudio,
  shouldUploadReplayFrames
} from "../domain/replay-upload";
import { defaultSettings } from "../services/settings";
import type { UserSettings } from "../shared/types";

const replayEnabledSettings: UserSettings = {
  ...defaultSettings,
  llm: {
    ...defaultSettings.llm,
    visionModel: "vision-model"
  },
  replay: {
    ...defaultSettings.replay,
    enabled: false,
    mode: "video-audio",
    uploadFramesToAI: true,
    uploadAudioToASR: true
  }
};

describe("shouldUploadReplayFrames", () => {
  it("never uploads replay images when the explicit AI image evidence switch is off", () => {
    expect(
      shouldUploadReplayFrames({
        ...replayEnabledSettings,
        replay: {
          ...replayEnabledSettings.replay,
          uploadFramesToAI: false
        }
      }, "刚才谁进了球？")
    ).toBe(false);
  });

  it("uploads replay images only for vision-oriented questions when the switch is on", () => {
    expect(shouldUploadReplayFrames(replayEnabledSettings, "这个视频里场上都有谁，谁进了球？")).toBe(true);
    expect(shouldUploadReplayFrames(replayEnabledSettings, "刚才发生了什么？")).toBe(true);
    expect(shouldUploadReplayFrames(replayEnabledSettings, "分析一下这场比赛的历史走势")).toBe(false);
  });

  it("requires a configured vision model before replay images can be uploaded", () => {
    expect(
      shouldUploadReplayFrames({
        ...replayEnabledSettings,
        llm: {
          ...replayEnabledSettings.llm,
          visionModel: ""
        }
      }, "这个视频里场上都有谁？")
    ).toBe(false);
  });

  it("does not upload replay images for audio-only commentary questions", () => {
    expect(shouldUploadReplayFrames(replayEnabledSettings, "刚才语音里解说在说什么？")).toBe(false);
    expect(shouldUploadReplayFrames(replayEnabledSettings, "what did the commentator just say?")).toBe(false);
  });

  it("does not upload replay images in audio-only mode", () => {
    expect(
      shouldUploadReplayFrames({
        ...replayEnabledSettings,
        replay: {
          ...replayEnabledSettings.replay,
          mode: "audio-only"
        }
      }, "who scored in the video?")
    ).toBe(false);
  });
});

describe("shouldUploadReplayAudio", () => {
  it("requires the explicit replay audio upload switch", () => {
    expect(
      shouldUploadReplayAudio({
        ...replayEnabledSettings,
        replay: {
          ...replayEnabledSettings.replay,
          uploadAudioToASR: false
        },
        transcription: {
          ...replayEnabledSettings.transcription,
          endpoint: "https://asr.example.test/v1/audio/transcriptions",
          apiKey: "asr-key",
          model: "qwen3-asr-flash"
        }
      }, "刚才发生了什么？")
    ).toBe(false);
  });

  it("is independent from replay image upload", () => {
    expect(
      shouldUploadReplayAudio({
        ...replayEnabledSettings,
        replay: {
          ...replayEnabledSettings.replay,
          uploadFramesToAI: false,
          uploadAudioToASR: true
        },
        transcription: {
          ...replayEnabledSettings.transcription,
          endpoint: "https://asr.example.test/v1/audio/transcriptions",
          apiKey: "asr-key",
          model: "qwen3-asr-flash"
        }
      }, "刚才语音里解说在说什么？")
    ).toBe(true);
  });

  it("uses the side-panel audio upload switch as the runtime gate", () => {
    expect(
      shouldUploadReplayAudio({
        ...replayEnabledSettings,
        transcription: {
          ...replayEnabledSettings.transcription,
          enabled: false,
          endpoint: "https://asr.example.test/v1/audio/transcriptions",
          apiKey: "asr-key",
          model: "qwen3-asr-flash"
        }
      }, "刚才解说在说什么？")
    ).toBe(true);
  });

  it("uploads audio for general and visual replay questions when audio evidence is enabled", () => {
    const settings: UserSettings = {
      ...replayEnabledSettings,
      transcription: {
        ...replayEnabledSettings.transcription,
        endpoint: "https://asr.example.test/v1/audio/transcriptions",
        apiKey: "asr-key",
        model: "qwen3-asr-flash"
      }
    };

    expect(shouldUploadReplayAudio(settings, "刚才发生了什么？")).toBe(true);
    expect(shouldUploadReplayAudio(settings, "这个视频里谁进了球？")).toBe(true);
    expect(shouldUploadReplayAudio(settings, "分析一下这场比赛的历史走势")).toBe(false);
  });

  it("requires a configured ASR model before replay audio can be uploaded", () => {
    expect(
      shouldUploadReplayAudio({
        ...replayEnabledSettings,
        transcription: {
          ...replayEnabledSettings.transcription,
          endpoint: "https://asr.example.test/v1/audio/transcriptions",
          apiKey: "asr-key",
          model: ""
        }
      }, "刚才解说在说什么？")
    ).toBe(false);
  });
});

describe("getReplayAudioUploadWindowSeconds", () => {
  it("caps replay ASR uploads to a short speech window", () => {
    expect(
      getReplayAudioUploadWindowSeconds({
        ...replayEnabledSettings,
        transcription: {
          ...replayEnabledSettings.transcription,
          maxSeconds: 30
        }
      })
    ).toBe(30);
  });

  it("keeps explicitly shorter windows", () => {
    expect(
      getReplayAudioUploadWindowSeconds({
        ...replayEnabledSettings,
        transcription: {
          ...replayEnabledSettings.transcription,
          maxSeconds: 5
        }
      })
    ).toBe(5);
  });
});
