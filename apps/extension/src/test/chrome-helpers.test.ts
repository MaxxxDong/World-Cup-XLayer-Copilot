import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildReplayCapturePlan,
  getActiveSidePanelTarget,
  getInstantReplaySnapshot,
  startInstantReplayCapture,
  openSidePanel
} from "../shared/chrome-helpers";
import { defaultSettings } from "../services/settings";
import type { UserSettings } from "../shared/types";

describe("openSidePanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("opens the Chrome side panel for the pre-resolved tab target", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      sidePanel: { open },
      windows: { WINDOW_ID_CURRENT: -2 }
    });

    const opened = await openSidePanel({ tabId: 123 });

    expect(opened).toBe(true);
    expect(open).toHaveBeenCalledWith({ tabId: 123 });
  });

  it("opens the X Layer dapp in a normal tab if the background popup route fails", async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error("background failed"));
    const create = vi.fn().mockResolvedValue(undefined);
    const { openXLayerDappPopup } = await import("../shared/chrome-helpers");
    vi.stubGlobal("chrome", {
      runtime: { sendMessage },
      tabs: { create }
    });

    await openXLayerDappPopup("http://kr.maxfugui.top/?matchId=1");

    expect(create).toHaveBeenCalledWith({ url: "http://kr.maxfugui.top/?matchId=1" });
  });

  it("does not open a full tab when the Side Panel API is unavailable", async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("chrome", {
      tabs: { create },
      runtime: { getURL: (path: string) => `chrome-extension://test/${path}` }
    });

    const opened = await openSidePanel({ tabId: 123 });

    expect(opened).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });

  it("catches Chrome user-gesture rejections without throwing", async () => {
    const open = vi.fn().mockRejectedValue(new Error("sidePanel.open() requires a user gesture"));
    vi.stubGlobal("chrome", {
      sidePanel: { open },
      windows: { WINDOW_ID_CURRENT: -2 }
    });

    const opened = await openSidePanel({ tabId: 123 });

    expect(opened).toBe(false);
    expect(open).toHaveBeenCalledWith({ tabId: 123 });
  });

  it("resolves the active tab before the user clicks the side-panel button", async () => {
    const query = vi.fn().mockResolvedValue([{ id: 123, windowId: 456 }]);
    vi.stubGlobal("chrome", {
      tabs: { query }
    });

    const target = await getActiveSidePanelTarget();

    expect(target).toEqual({ tabId: 123 });
    expect(query).toHaveBeenCalledWith({ active: true, lastFocusedWindow: true });
  });

  it("requests a bounded replay snapshot from the background worker", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      status: {
        replayEnabled: true,
        capturing: true,
        windowSeconds: 60,
        mode: "video-audio",
        frameCount: 10,
        frames: []
      }
    });
    vi.stubGlobal("chrome", {
      runtime: { sendMessage }
    });

    await getInstantReplaySnapshot(6, { includeAudio: true, maxAudioSeconds: 60 });

    expect(sendMessage).toHaveBeenCalledWith({
      type: "GET_REPLAY_SNAPSHOT",
      payload: { maxFrames: 6, includeAudio: true, maxAudioSeconds: 60 }
    });
  });

  it("starts replay capture with image-only evidence when only frame upload is enabled", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      status: {
        replayEnabled: true,
        capturing: true,
        windowSeconds: 60,
        mode: "video-audio",
        captureVideo: true,
        captureAudio: false,
        frameCount: 0
      }
    });
    vi.stubGlobal("chrome", {
      runtime: { sendMessage }
    });
    const settings: UserSettings = {
      ...defaultSettings,
      llm: {
        ...defaultSettings.llm,
        visionModel: "vision-model"
      },
      replay: {
        ...defaultSettings.replay,
        enabled: false,
        uploadFramesToAI: true,
        uploadAudioToASR: false
      }
    };

    await startInstantReplayCapture(settings, { tabId: 123 });

    expect(sendMessage).toHaveBeenCalledWith({
      type: "START_REPLAY_CAPTURE",
      payload: {
        tabId: 123,
        windowSeconds: 60,
        mode: "video-audio",
        captureVideo: true,
        captureAudio: false
      }
    });
  });

  it("starts replay capture with audio-only evidence when only ASR upload is configured", async () => {
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      status: {
        replayEnabled: true,
        capturing: true,
        windowSeconds: 60,
        mode: "video-audio",
        captureVideo: false,
        captureAudio: true,
        frameCount: 0
      }
    });
    vi.stubGlobal("chrome", {
      runtime: { sendMessage }
    });
    const settings: UserSettings = {
      ...defaultSettings,
      replay: {
        ...defaultSettings.replay,
        enabled: false,
        uploadFramesToAI: false,
        uploadAudioToASR: true
      },
      transcription: {
        ...defaultSettings.transcription,
        endpoint: "https://asr.example.test/v1/audio/transcriptions",
        apiKey: "asr-key",
        model: "qwen3-asr-flash"
      }
    };

    await startInstantReplayCapture(settings, { tabId: 123 });

    expect(sendMessage).toHaveBeenCalledWith({
      type: "START_REPLAY_CAPTURE",
      payload: {
        tabId: 123,
        windowSeconds: 60,
        mode: "video-audio",
        captureVideo: false,
        captureAudio: true
      }
    });
  });

  it("does not capture audio when ASR upload lacks a usable endpoint", () => {
    expect(
      buildReplayCapturePlan({
        ...defaultSettings,
        replay: {
          ...defaultSettings.replay,
          enabled: false,
          uploadFramesToAI: false,
          uploadAudioToASR: true
        },
        transcription: {
          ...defaultSettings.transcription,
          enabled: true,
          endpoint: "",
          apiKey: "asr-key",
          model: "qwen3-asr-flash"
        }
      })
    ).toEqual({ captureVideo: false, captureAudio: false });
  });

  it("does not capture video when frame upload lacks a vision model", () => {
    expect(
      buildReplayCapturePlan({
        ...defaultSettings,
        llm: {
          ...defaultSettings.llm,
          visionModel: ""
        },
        replay: {
          ...defaultSettings.replay,
          enabled: true,
          uploadFramesToAI: true,
          uploadAudioToASR: false
        }
      })
    ).toEqual({ captureVideo: false, captureAudio: false });
  });
});
