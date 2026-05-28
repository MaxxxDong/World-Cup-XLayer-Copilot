chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "OPEN_XLAYER_DAPP_POPUP") {
    const url = String(message.payload?.url ?? "http://kr.maxfugui.top/");
    openRightPopup(url).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "OPEN_XLAYER_DAPP_TAB") {
    const url = String(message.payload?.url ?? "http://kr.maxfugui.top/");
    chrome.tabs.create({ url }).then(() => sendResponse({ ok: true }));
    return true;
  }

  if (message?.type === "START_REPLAY_CAPTURE") {
    startReplayCapture(message.payload)
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  if (message?.type === "STOP_REPLAY_CAPTURE") {
    sendReplayMessage({ type: "REPLAY_STOP_CAPTURE" })
      .then((result) => sendResponse(result))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        })
      );
    return true;
  }

  if (message?.type === "GET_REPLAY_STATUS") {
    sendReplayMessage({ type: "REPLAY_STATUS" })
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({
          ok: true,
          status: {
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
          }
        })
      );
    return true;
  }

  if (message?.type === "GET_REPLAY_SNAPSHOT") {
    sendReplayMessage({
      type: "REPLAY_SNAPSHOT",
      payload: {
        maxFrames: message.payload?.maxFrames,
        includeAudio: message.payload?.includeAudio,
        maxAudioSeconds: message.payload?.maxAudioSeconds
      }
    })
      .then((result) => sendResponse(result))
      .catch(() =>
        sendResponse({
          ok: true,
          status: {
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
            audioDurationSeconds: 0,
            frames: []
          }
        })
      );
    return true;
  }

  return false;
});

async function openRightPopup(url: string): Promise<void> {
  const current = await chrome.windows.getCurrent();
  const width = 520;
  const height = current.height ?? 900;
  const left = Math.max(0, (current.left ?? 0) + (current.width ?? 1440) - width);
  const top = current.top ?? 0;

  await chrome.windows.create({
    url,
    type: "popup",
    width,
    height,
    left,
    top,
    focused: true
  });
}

async function startReplayCapture(payload?: {
  tabId?: number;
  windowSeconds?: 30 | 60 | 120;
  mode?: "audio-only" | "video-audio";
  captureVideo?: boolean;
  captureAudio?: boolean;
}): Promise<unknown> {
  await ensureOffscreenDocument();
  const tabId = payload?.tabId ?? (await getActiveTabId());
  if (typeof tabId !== "number") throw new Error("No active tab available for Instant Replay capture.");
  await assertTabCanBeCaptured(tabId);
  let streamId: string;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (error) {
    throw new Error(formatReplayCaptureError(error));
  }
  return sendReplayMessage({
    type: "REPLAY_START_CAPTURE",
    payload: {
      streamId,
      windowSeconds: payload?.windowSeconds ?? 60,
      mode: payload?.mode ?? "video-audio",
      captureVideo: Boolean(payload?.captureVideo),
      captureAudio: Boolean(payload?.captureAudio)
    }
  });
}

async function assertTabCanBeCaptured(tabId: number): Promise<void> {
  const tab = await chrome.tabs.get(tabId);
  const url = tab.url ?? "";
  if (/^(chrome|chrome-extension|edge|about):/i.test(url)) {
    throw new Error("Instant Replay can capture normal web pages only. Chrome, extension, and browser-internal pages cannot be captured.");
  }
}

function formatReplayCaptureError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/activeTab|has not been invoked/i.test(message)) {
    return "Instant Replay needs one-time access to this page. Open the page you want to capture, click the extension icon on that tab, then start the local buffer again. Chrome internal pages still cannot be captured.";
  }
  if (/chrome pages cannot be captured|cannot be captured/i.test(message)) {
    return "Instant Replay can capture normal web pages only. Chrome, extension, and browser-internal pages cannot be captured.";
  }
  return message;
}

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: "offscreen.html",
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: "Capture an explicitly enabled local Instant Replay buffer for the current tab."
  });
}

async function sendReplayMessage(message: unknown): Promise<unknown> {
  return chrome.runtime.sendMessage(message);
}
