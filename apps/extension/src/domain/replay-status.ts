import { t } from "../i18n/messages";
import { hasReplayAudioModel, hasReplayVisionModel } from "./replay-upload";
import type { ReplayBufferSnapshot, UserSettings } from "../shared/types";

export const REPLAY_STATUS_REFRESH_MS = 5000;

export function shouldShowReplayFrameUploadStats(
  settings?: UserSettings,
  status?: ReplayBufferSnapshot
): boolean {
  if (!status?.capturing) return isReplayFrameUploadReady(settings);
  const mode = status?.mode ?? settings?.replay.mode ?? "video-audio";
  if (typeof status?.captureVideo === "boolean") return status.captureVideo;
  return Boolean(isReplayFrameUploadReady(settings) && mode !== "audio-only");
}

export function shouldShowReplayAudioUploadStats(settings?: UserSettings, status?: ReplayBufferSnapshot): boolean {
  if (!status?.capturing) return isReplayAudioUploadReady(settings);
  if (typeof status?.captureAudio === "boolean") return status.captureAudio;
  return isReplayAudioUploadReady(settings);
}

export function isReplayFrameUploadReady(settings?: UserSettings): boolean {
  return Boolean(
      hasReplayVisionModel(settings) &&
      settings?.replay.mode !== "audio-only" &&
      settings?.replay.uploadFramesToAI
  );
}

export function isReplayAudioUploadReady(settings?: UserSettings): boolean {
  return Boolean(
    settings?.replay.uploadAudioToASR &&
      hasReplayAudioModel(settings)
  );
}

export function formatReplayStatusLine(
  lang: UserSettings["language"],
  settings?: UserSettings,
  status?: ReplayBufferSnapshot
): string {
  const state = status?.capturing ? t(lang, "replayCapturing") : t(lang, "replayIdle");
  const video = formatReplayVideoStatus(lang, settings, status);
  const audio = formatReplayAudioStatus(lang, settings, status);

  return `${state} · ${t(lang, "replayVideo")}: ${video} · ${t(lang, "replayAudio")}: ${audio}`;
}

function formatReplayVideoStatus(
  lang: UserSettings["language"],
  settings?: UserSettings,
  status?: ReplayBufferSnapshot
): string {
  if (!shouldShowReplayFrameUploadStats(settings, status)) return t(lang, "replayOffShort");
  if (!status?.capturing) return t(lang, "replayToggleOn");
  return `${status.frameCount ?? 0} ${t(lang, "replayFramesUnit")}, ${formatBytes(status.frameBytes ?? 0)}`;
}

function formatReplayAudioStatus(
  lang: UserSettings["language"],
  settings?: UserSettings,
  status?: ReplayBufferSnapshot
): string {
  if (!shouldShowReplayAudioUploadStats(settings, status)) return t(lang, "replayOffShort");
  if (!status?.capturing) return t(lang, "replayToggleOn");
  const audioSeconds = status?.audioDurationSeconds ?? 0;
  const audioPrefix = lang === "zh" && audioSeconds > 0 ? "约 " : audioSeconds > 0 ? "~" : "";
  return `${audioPrefix}${audioSeconds}s, ${status?.audioChunkCount ?? 0} ${t(lang, "replayChunksUnit")}, ${formatBytes(status?.audioBytes ?? 0)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
