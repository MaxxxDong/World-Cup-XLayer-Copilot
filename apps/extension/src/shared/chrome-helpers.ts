import type { PageContext, ReplayBufferSnapshot, UserSettings } from "./types";
import { hasReplayAudioModel, hasReplayVisionModel } from "../domain/replay-upload";

export interface SidePanelOpenTarget {
  tabId?: number;
  windowId?: number;
}

type SidePanelOpenOptions = { tabId: number } | { windowId: number };

export async function getActivePageContext(): Promise<Partial<PageContext>> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) {
    return {
      title: document.title,
      url: location.href,
      visibleText: document.body?.innerText ?? "",
      capturedAt: new Date().toISOString()
    };
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return {
      title: tab?.title ?? "",
      url: tab?.url ?? "",
      visibleText: "",
      capturedAt: new Date().toISOString()
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_CONTEXT" });
    if (response?.ok && response.pageContext) return response.pageContext;
  } catch {
    // Some pages, including Chrome Web Store and chrome:// URLs, cannot run content scripts.
  }

  return {
    title: tab.title ?? "",
    url: tab.url ?? "",
    visibleText: "",
    capturedAt: new Date().toISOString()
  };
}

export async function getActiveSidePanelTarget(): Promise<SidePanelOpenTarget | undefined> {
  if (typeof chrome === "undefined" || !chrome.tabs?.query) return undefined;

  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (typeof tab?.id === "number") return { tabId: tab.id };
  if (typeof tab?.windowId === "number") return { windowId: tab.windowId };
  return undefined;
}

export async function openSidePanel(target?: SidePanelOpenTarget): Promise<boolean> {
  if (typeof chrome === "undefined" || !chrome.sidePanel?.open) return false;

  const openTarget = buildSidePanelOpenTarget(target);
  if (!openTarget) return false;

  try {
    await chrome.sidePanel.open(openTarget);
    return true;
  } catch {
    return false;
  }
}

export async function openXLayerDappPopup(url: string): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    try {
      await chrome.runtime.sendMessage({
        type: "OPEN_XLAYER_DAPP_POPUP",
        payload: { url }
      });
      return;
    } catch {
      await openXLayerDappTab(url);
      return;
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function buildSidePanelOpenTarget(target?: SidePanelOpenTarget): SidePanelOpenOptions | undefined {
  if (typeof target?.tabId === "number") return { tabId: target.tabId };
  if (typeof target?.windowId === "number") return { windowId: target.windowId };
  if (typeof chrome !== "undefined" && typeof chrome.windows?.WINDOW_ID_CURRENT === "number") {
    return { windowId: chrome.windows.WINDOW_ID_CURRENT };
  }
  return undefined;
}

export async function openXLayerDappTab(url: string): Promise<void> {
  if (typeof chrome !== "undefined" && chrome.runtime?.sendMessage) {
    try {
      await chrome.runtime.sendMessage({
        type: "OPEN_XLAYER_DAPP_TAB",
        payload: { url }
      });
      return;
    } catch {
      if (chrome.tabs?.create) {
        await chrome.tabs.create({ url });
        return;
      }
    }
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function startInstantReplayCapture(
  settings: UserSettings,
  target?: SidePanelOpenTarget
): Promise<ReplayBufferSnapshot> {
  const capturePlan = buildReplayCapturePlan(settings);
  return sendReplayControlMessage("START_REPLAY_CAPTURE", {
    tabId: target?.tabId,
    windowSeconds: settings.replay.windowSeconds,
    mode: settings.replay.mode,
    ...capturePlan
  });
}

export function buildReplayCapturePlan(settings: UserSettings): { captureVideo: boolean; captureAudio: boolean } {
  return {
    captureVideo: settings.replay.mode !== "audio-only" && settings.replay.uploadFramesToAI && hasReplayVisionModel(settings),
    captureAudio: Boolean(
      settings.replay.uploadAudioToASR &&
        hasReplayAudioModel(settings)
    )
  };
}

export async function stopInstantReplayCapture(): Promise<ReplayBufferSnapshot> {
  return sendReplayControlMessage("STOP_REPLAY_CAPTURE");
}

export async function getInstantReplayStatus(): Promise<ReplayBufferSnapshot> {
  return sendReplayControlMessage("GET_REPLAY_STATUS");
}

export async function getInstantReplaySnapshot(
  maxFrames = 6,
  options?: { includeAudio?: boolean; maxAudioSeconds?: number }
): Promise<ReplayBufferSnapshot> {
  return sendReplayControlMessage("GET_REPLAY_SNAPSHOT", {
    maxFrames,
    includeAudio: options?.includeAudio,
    maxAudioSeconds: options?.maxAudioSeconds
  });
}

async function sendReplayControlMessage(type: string, payload?: unknown): Promise<ReplayBufferSnapshot> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    return {
      replayEnabled: false,
      capturing: false,
      windowSeconds: 60,
      mode: "video-audio",
      captureVideo: false,
      captureAudio: false,
      frameCount: 0,
      frameBytes: 0,
      chunkBytes: 0,
      chunkCount: 0,
      audioChunkCount: 0,
      audioBytes: 0,
      audioDurationSeconds: 0
    };
  }

  const response = await chrome.runtime.sendMessage({ type, payload });
  if (!response?.ok) throw new Error(response?.error ?? "Instant Replay request failed.");
  return response.status;
}
