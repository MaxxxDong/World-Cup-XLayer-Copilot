import { describe, expect, it } from "vitest";
import { defaultSettings } from "../services/settings";

describe("default settings", () => {
  it("uses the published GitHub data package manifest by default", () => {
    expect(defaultSettings.dataPackage.manifestUrl).toBe(
      "https://raw.githubusercontent.com/MaxxxDong/world-cup-copilot-data/main/manifest.json"
    );
    expect(defaultSettings.dataPackage.manifestUrl).not.toContain("your-org");
    expect(defaultSettings.dataPackage.autoCheck).toBe(true);
  });

  it("does not upload replay frames to AI by default", () => {
    expect((defaultSettings.replay as { uploadFramesToAI?: boolean }).uploadFramesToAI).toBe(false);
  });

  it("does not upload replay audio to ASR by default", () => {
    expect((defaultSettings.replay as { uploadAudioToASR?: boolean }).uploadAudioToASR).toBe(false);
  });

  it("keeps Instant Replay available by default while evidence upload switches stay off", () => {
    expect(defaultSettings.replay.enabled).toBe(true);
  });

  it("defaults replay ASR to the OpenAI transcription preset", () => {
    expect(defaultSettings.transcription).toEqual({
      enabled: true,
      provider: "openai-transcribe",
      endpoint: "https://api.openai.com/v1/audio/transcriptions",
      apiKey: "",
      model: "gpt-4o-mini-transcribe",
      maxSeconds: 10,
      providerProfiles: {}
    });
  });
});
