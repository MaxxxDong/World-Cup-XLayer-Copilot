import { ReplayFrameBuffer } from "./services/replay-buffer";
import type { ReplayAudioClipDiagnostics, ReplayBufferSnapshot, UserSettings } from "./shared/types";

let replayEnabled = false;
let captureStream: MediaStream | undefined;
let captureTimer: number | undefined;
let captureVideo: HTMLVideoElement | undefined;
let captureCanvas: HTMLCanvasElement | undefined;
let captureContext: CanvasRenderingContext2D | null | undefined;
let motionCanvas: HTMLCanvasElement | undefined;
let motionContext: CanvasRenderingContext2D | null | undefined;
let previousMotionSignature: Uint8ClampedArray | undefined;
let audioMonitor: HTMLAudioElement | undefined;
let mediaRecorder: MediaRecorder | undefined;
let mediaChunks: Array<{ capturedAt: string; blob: Blob; size: number }> = [];
let audioRecorder: MediaRecorder | undefined;
type AudioChunk = { capturedAt: string; blob: Blob; size: number };
let audioChunks: AudioChunk[] = [];
let audioSegmentTimer: number | undefined;
let audioRecorderRotation: Promise<void> | undefined;
let replayWindowSeconds: UserSettings["replay"]["windowSeconds"] = 60;
let captureVideoEnabled = false;
let captureAudioEnabled = false;
const replayBuffer = new ReplayFrameBuffer();
const MIN_PREFERRED_AUDIO_SEGMENT_BYTES = 40 * 1024;
const AUDIO_SEGMENT_SECONDS = 5;
const MAX_ASR_AUDIO_SEGMENTS = 6;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "REPLAY_STATUS") {
    sendResponse({ ok: true, status: replayStatus() });
    return false;
  }

  if (message?.type === "REPLAY_SNAPSHOT") {
    replaySnapshot({
      includeFrames: true,
      maxFrames: message.payload?.maxFrames,
      includeAudio: message.payload?.includeAudio,
      maxAudioSeconds: message.payload?.maxAudioSeconds
    })
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          status: replayStatus({ includeFrames: true, maxFrames: message.payload?.maxFrames })
        })
      );
    return true;
  }

  if (message?.type === "REPLAY_ENABLE_EXPERIMENTAL") {
    replayEnabled = true;
    sendResponse({
      ok: true,
      status: replayStatus()
    });
    return false;
  }

  if (message?.type === "REPLAY_START_CAPTURE") {
    startCapture(message.payload)
      .then((status) => sendResponse({ ok: true, status }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
          status: replayStatus()
        })
      );
    return true;
  }

  if (message?.type === "REPLAY_STOP_CAPTURE") {
    stopCapture();
    sendResponse({ ok: true, status: replayStatus() });
    return false;
  }

  if (message?.type === "REPLAY_DISABLE") {
    replayEnabled = false;
    stopCapture();
    replayBuffer.clear();
    mediaChunks = [];
    audioChunks = [];
    sendResponse({ ok: true, status: replayStatus() });
    return false;
  }

  return false;
});

async function startCapture(payload?: {
  streamId?: string;
  windowSeconds?: UserSettings["replay"]["windowSeconds"];
  mode?: UserSettings["replay"]["mode"];
  captureVideo?: boolean;
  captureAudio?: boolean;
}): Promise<ReplayBufferSnapshot> {
  if (!payload?.streamId) throw new Error("Missing tab capture stream id.");

  stopCapture();
  replayEnabled = true;
  replayWindowSeconds = payload.windowSeconds ?? 60;
  captureVideoEnabled = Boolean(payload.captureVideo);
  captureAudioEnabled = Boolean(payload.captureAudio);
  if (!captureVideoEnabled && !captureAudioEnabled) {
    throw new Error("Enable image or audio upload before starting the local replay buffer.");
  }
  replayBuffer.configure({
    windowSeconds: replayWindowSeconds,
    mode: payload.mode ?? "video-audio"
  });
  replayBuffer.start();

  captureStream = await navigator.mediaDevices.getUserMedia({
    audio: captureAudioEnabled ? chromeTabAudioConstraints(payload.streamId) : false,
    video: captureVideoEnabled ? chromeTabVideoConstraints(payload.streamId) : false
  });

  if (captureAudioEnabled) startAudioMonitor(captureStream);

  if (captureVideoEnabled) {
    captureVideo = document.createElement("video");
    captureVideo.muted = true;
    captureVideo.playsInline = true;
    captureVideo.srcObject = captureStream;
    await captureVideo.play();
    captureCanvas = document.createElement("canvas");
    captureContext = captureCanvas.getContext("2d");
    motionCanvas = document.createElement("canvas");
    motionCanvas.width = 32;
    motionCanvas.height = 18;
    motionContext = motionCanvas.getContext("2d", { willReadFrequently: true });
    captureTimer = window.setInterval(captureFrame, 200);
  }
  if (captureVideoEnabled) startMediaRecorder(replayWindowSeconds);
  if (captureAudioEnabled) startAudioRecorder(replayWindowSeconds);

  return replayStatus();
}

/*
 * Chrome's tabCapture stream id is passed through getUserMedia using Chromium-only
 * media constraints. Keep this isolated to the offscreen document so normal UI
 * code remains testable without DOM capture APIs.
 */
function chromeTabAudioConstraints(streamId: string): MediaTrackConstraints {
  return {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId
    }
  } as MediaTrackConstraints;
}

function chromeTabVideoConstraints(streamId: string): MediaTrackConstraints {
  return {
    mandatory: {
      chromeMediaSource: "tab",
      chromeMediaSourceId: streamId,
      maxWidth: 1280,
      maxHeight: 720,
      maxFrameRate: 5
    }
  } as MediaTrackConstraints;
}

function captureFrame(): void {
  if (!captureVideo || !captureCanvas || !captureContext || captureVideo.videoWidth === 0) return;
  const width = Math.min(1280, captureVideo.videoWidth);
  const height = Math.round((width / captureVideo.videoWidth) * captureVideo.videoHeight);
  captureCanvas.width = width;
  captureCanvas.height = height;
  captureContext.drawImage(captureVideo, 0, 0, width, height);
  replayBuffer.push({
    capturedAt: new Date().toISOString(),
    dataUrl: captureCanvas.toDataURL("image/jpeg", 0.72),
    width,
    height,
    motionScore: computeMotionScore()
  });
}

function stopCapture(): void {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.ondataavailable = null;
    mediaRecorder.stop();
  }
  mediaRecorder = undefined;
  if (audioRecorder && audioRecorder.state !== "inactive") {
    audioRecorder.ondataavailable = null;
    audioRecorder.stop();
  }
  audioRecorder = undefined;
  audioRecorderRotation = undefined;
  if (audioSegmentTimer !== undefined) {
    window.clearInterval(audioSegmentTimer);
    audioSegmentTimer = undefined;
  }
  if (captureTimer !== undefined) {
    window.clearInterval(captureTimer);
    captureTimer = undefined;
  }
  stopAudioMonitor();
  captureStream?.getTracks().forEach((track) => track.stop());
  captureStream = undefined;
  captureVideo = undefined;
  captureCanvas = undefined;
  captureContext = undefined;
  motionCanvas = undefined;
  motionContext = undefined;
  previousMotionSignature = undefined;
  replayBuffer.clear();
  mediaChunks = [];
  audioChunks = [];
  captureVideoEnabled = false;
  captureAudioEnabled = false;
}

function startAudioMonitor(stream: MediaStream): void {
  const audioTracks = stream.getAudioTracks();
  if (!audioTracks.length) return;
  audioMonitor = document.createElement("audio");
  audioMonitor.autoplay = true;
  audioMonitor.muted = false;
  audioMonitor.volume = 1;
  audioMonitor.srcObject = new MediaStream(audioTracks);
  void audioMonitor.play().catch(() => undefined);
}

function stopAudioMonitor(): void {
  if (!audioMonitor) return;
  audioMonitor.pause();
  audioMonitor.srcObject = null;
  audioMonitor = undefined;
}

function computeMotionScore(): number {
  if (!captureVideo || !motionCanvas || !motionContext || captureVideo.videoWidth === 0) return 0;
  motionContext.drawImage(captureVideo, 0, 0, motionCanvas.width, motionCanvas.height);
  const image = motionContext.getImageData(0, 0, motionCanvas.width, motionCanvas.height);
  const signature = new Uint8ClampedArray(motionCanvas.width * motionCanvas.height);
  let totalDiff = 0;

  for (let pixel = 0; pixel < signature.length; pixel += 1) {
    const offset = pixel * 4;
    const luminance = Math.round(
      image.data[offset] * 0.299 + image.data[offset + 1] * 0.587 + image.data[offset + 2] * 0.114
    );
    signature[pixel] = luminance;
    if (previousMotionSignature) {
      totalDiff += Math.abs(luminance - previousMotionSignature[pixel]);
    }
  }

  previousMotionSignature = signature;
  return signature.length ? totalDiff / signature.length : 0;
}

function replayStatus(options?: { includeFrames?: boolean; maxFrames?: number }): ReplayBufferSnapshot {
  const audioStats = currentAudioStats();
  return {
    ...replayBuffer.snapshot({
      replayEnabled,
      capturing: Boolean(captureStream?.active),
      includeFrames: options?.includeFrames,
      maxFrames: options?.maxFrames
    }),
    captureVideo: captureVideoEnabled,
    captureAudio: captureAudioEnabled,
    chunkCount: mediaChunks.length,
    audioChunkCount: audioStats.chunkCount,
    audioBytes: audioStats.bytes,
    audioDurationSeconds: audioStats.durationSeconds,
    chunkBytes:
      mediaChunks.reduce((total, chunk) => total + chunk.size, 0) +
      audioStats.bytes
  };
}

async function replaySnapshot(options?: {
  includeFrames?: boolean;
  maxFrames?: number;
  includeAudio?: boolean;
  maxAudioSeconds?: number;
}): Promise<ReplayBufferSnapshot> {
  const status = replayStatus({
    includeFrames: options?.includeFrames,
    maxFrames: options?.maxFrames
  });

  if (!options?.includeAudio) return status;

  const audioClips = await latestAudioClips(options.maxAudioSeconds ?? status.windowSeconds);
  return audioClips.length ? { ...status, audioClip: audioClips.at(-1), audioClips } : status;
}

function startMediaRecorder(windowSeconds: UserSettings["replay"]["windowSeconds"]): void {
  if (!captureStream || typeof MediaRecorder === "undefined") return;
  const mimeType = selectRecorderMimeType();
  mediaChunks = [];
  mediaRecorder = new MediaRecorder(captureStream, mimeType ? { mimeType } : undefined);
  mediaRecorder.ondataavailable = (event) => {
    if (!event.data.size) return;
    const capturedAt = new Date().toISOString();
    mediaChunks.push({ capturedAt, blob: event.data, size: event.data.size });
    pruneMediaChunks(Date.parse(capturedAt), windowSeconds);
  };
  mediaRecorder.start(5000);
}

function startAudioRecorder(windowSeconds: UserSettings["replay"]["windowSeconds"]): void {
  if (!captureStream || typeof MediaRecorder === "undefined") return;
  audioChunks = [];
  startNewAudioRecorder(windowSeconds);
  audioSegmentTimer = window.setInterval(() => {
    void rotateAudioRecorder(windowSeconds);
  }, AUDIO_SEGMENT_SECONDS * 1000);
}

function startNewAudioRecorder(windowSeconds: UserSettings["replay"]["windowSeconds"]): void {
  if (!captureStream || typeof MediaRecorder === "undefined") return;
  const audioTracks = captureStream.getAudioTracks();
  if (!audioTracks.length) return;
  const audioStream = new MediaStream(audioTracks);
  const mimeType = selectAudioRecorderMimeType();
  audioRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
  audioRecorder.ondataavailable = (event) => {
    if (!event.data.size) return;
    const capturedAt = new Date().toISOString();
    audioChunks.push({ capturedAt, blob: event.data, size: event.data.size });
    pruneAudioChunks(Date.parse(capturedAt), windowSeconds);
  };
  audioRecorder.start();
}

function rotateAudioRecorder(windowSeconds: UserSettings["replay"]["windowSeconds"]): Promise<void> {
  if (audioRecorderRotation) return audioRecorderRotation;
  audioRecorderRotation = (async () => {
    const recorder = audioRecorder;
    if (!recorder || recorder.state !== "recording") {
      startNewAudioRecorder(windowSeconds);
      return;
    }
    await stopAudioRecorderAndWait(recorder);
    if (captureStream?.active && captureAudioEnabled) {
      startNewAudioRecorder(windowSeconds);
    }
  })().finally(() => {
    audioRecorderRotation = undefined;
  });
  return audioRecorderRotation;
}

function stopAudioRecorderAndWait(recorder: MediaRecorder): Promise<void> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      recorder.removeEventListener("stop", finish);
      resolve();
    };
    recorder.addEventListener("stop", finish, { once: true });
    window.setTimeout(finish, 750);
    try {
      recorder.stop();
    } catch {
      finish();
    }
  });
}

function pruneMediaChunks(nowMs: number, windowSeconds: UserSettings["replay"]["windowSeconds"]): void {
  const cutoff = nowMs - windowSeconds * 1000;
  mediaChunks = mediaChunks.filter((chunk) => Date.parse(chunk.capturedAt) >= cutoff);
}

function pruneAudioChunks(nowMs: number, windowSeconds: UserSettings["replay"]["windowSeconds"]): void {
  const cutoff = nowMs - windowSeconds * 1000;
  audioChunks = audioChunks.filter((chunk) => Date.parse(chunk.capturedAt) >= cutoff);
}

function selectRecorderMimeType(): string | undefined {
  const mimeTypes = captureStream?.getVideoTracks().length
    ? ["video/webm;codecs=vp8,opus", "video/webm", "audio/webm;codecs=opus", "audio/webm"]
    : ["audio/webm;codecs=opus", "audio/webm", "video/webm"];
  for (const mimeType of mimeTypes) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return undefined;
}

function selectAudioRecorderMimeType(): string | undefined {
  for (const mimeType of ["audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(mimeType)) return mimeType;
  }
  return undefined;
}

async function latestAudioClips(maxSeconds: number) {
  if (!audioChunks.length) {
    await flushCurrentAudioChunk();
  }
  if (!audioChunks.length) return [];
  const latestMs = Math.max(...audioChunks.map((chunk) => Date.parse(chunk.capturedAt)));
  const cutoff = latestMs - Math.max(1, maxSeconds) * 1000;
  const candidates = audioChunks.filter((chunk) => Date.parse(chunk.capturedAt) > cutoff);
  const selectedChunks = selectPreferredAudioChunks(candidates.length ? candidates : audioChunks, maxSeconds);
  return Promise.all(selectedChunks.map((chunk) => buildAudioClipFromChunks([chunk], AUDIO_SEGMENT_SECONDS)));
}

function selectPreferredAudioChunks(chunks: AudioChunk[], maxSeconds: number): AudioChunk[] {
  const stableChunks = chunks.filter((chunk) => chunk.size >= MIN_PREFERRED_AUDIO_SEGMENT_BYTES);
  const source = stableChunks.length ? stableChunks : chunks;
  const segmentCount = Math.max(1, Math.min(MAX_ASR_AUDIO_SEGMENTS, Math.ceil(maxSeconds / AUDIO_SEGMENT_SECONDS)));
  return source.slice(-segmentCount);
}

async function buildAudioClipFromChunks(selected: AudioChunk[], maxSeconds: number) {
  const mimeType = selected[0]?.blob.type || "audio/webm";
  const firstMs = Date.parse(selected[0].capturedAt);
  const latestChunkMs = Date.parse(selected[selected.length - 1].capturedAt);
  const blob = new Blob(
    selected.map((chunk) => chunk.blob),
    { type: mimeType }
  );
  const diagnostics = await analyzeAudioBlob(blob);
  return {
    capturedAt: selected[selected.length - 1].capturedAt,
    dataUrl: await blobToDataUrl(blob),
    mimeType,
    byteLength: blob.size,
    durationSeconds: estimateAudioDurationSeconds(firstMs, latestChunkMs, selected.length, maxSeconds),
    chunkCount: selected.length,
    firstChunkAt: selected[0].capturedAt,
    latestChunkAt: selected[selected.length - 1].capturedAt,
    diagnostics
  };
}

async function analyzeAudioBlob(blob: Blob): Promise<ReplayAudioClipDiagnostics> {
  const AudioContextConstructor =
    globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) {
    return { decodeStatus: "unavailable", reason: "AudioContext is unavailable." };
  }

  const audioContext = new AudioContextConstructor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(await blob.arrayBuffer());
    let squareSum = 0;
    let sampleCount = 0;
    let peak = 0;
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
      const samples = audioBuffer.getChannelData(channel);
      sampleCount += samples.length;
      for (const sample of samples) {
        const absolute = Math.abs(sample);
        if (absolute > peak) peak = absolute;
        squareSum += sample * sample;
      }
    }
    const rms = sampleCount ? Math.sqrt(squareSum / sampleCount) : 0;
    return {
      decodeStatus: "ok",
      decodedDurationSeconds: Math.round(audioBuffer.duration * 10) / 10,
      rms: roundAudioLevel(rms),
      peak: roundAudioLevel(peak),
      silent: peak < 0.01 || rms < 0.002
    };
  } catch (error) {
    return {
      decodeStatus: "failed",
      reason: error instanceof Error ? error.message : String(error)
    };
  } finally {
    void audioContext.close();
  }
}

function roundAudioLevel(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function flushCurrentAudioChunk(): Promise<void> {
  return rotateAudioRecorder(replayWindowSeconds);
}

function estimateAudioDurationSeconds(
  firstMs: number,
  latestMs: number,
  chunkCount: number,
  maxSeconds: number
): number {
  if (!Number.isFinite(firstMs) || !Number.isFinite(latestMs) || chunkCount <= 0) return 0;
  if (chunkCount === 1) return Math.min(maxSeconds, 5);
  return Math.min(maxSeconds, Math.max(1, Math.round((latestMs - firstMs) / 1000) + 5));
}

function currentAudioStats(): { chunkCount: number; bytes: number; durationSeconds: number } {
  if (!audioChunks.length) return { chunkCount: 0, bytes: 0, durationSeconds: 0 };
  const firstMs = Date.parse(audioChunks[0].capturedAt);
  const latestMs = Date.parse(audioChunks[audioChunks.length - 1].capturedAt);
  return {
    chunkCount: audioChunks.length,
    bytes: audioChunks.reduce((total, chunk) => total + chunk.size, 0),
    durationSeconds: estimateAudioDurationSeconds(firstMs, latestMs, audioChunks.length, replayWindowSeconds)
  };
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read audio clip."));
    reader.readAsDataURL(blob);
  });
}
