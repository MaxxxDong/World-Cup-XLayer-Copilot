import type { ReplayAudioClip } from "../shared/types";

interface ReplayTranscriptionStatusInput {
  durationMs?: number;
  segmentCount?: number;
  successfulSegmentCount?: number;
}

export function formatReplayAudioDiagnostic(audioClip?: ReplayAudioClip): string {
  if (!audioClip) return "no audio clip";
  return [
    audioClip.durationSeconds ? `~${audioClip.durationSeconds}s` : undefined,
    formatBytes(audioClip.byteLength),
    audioClip.chunkCount ? `${audioClip.chunkCount} chunk${audioClip.chunkCount === 1 ? "" : "s"}` : undefined,
    audioClip.mimeType || undefined,
    formatAudioLevelDiagnostic(audioClip.diagnostics)
  ]
    .filter(Boolean)
    .join(", ");
}

export function formatReplayAudioClipsDiagnostic(audioClips: ReplayAudioClip[]): string {
  if (!audioClips.length) return "no audio clip";
  if (audioClips.length === 1) return formatReplayAudioDiagnostic(audioClips[0]);
  return audioClips.map((clip, index) => `segment ${index + 1}: ${formatReplayAudioDiagnostic(clip)}`).join("; ");
}

export function buildReplayAudioUnavailableContext(audioDiagnostic: string): string {
  return [
    "Instant Replay audio was sent to the user's configured ASR provider, but no usable transcript text was returned.",
    `Captured audio: ${audioDiagnostic}.`,
    "The provider returned no valid speech transcript for this request.",
    "If the user asked about speech, commentary, narration, or announcer audio, say the ASR transcript is unavailable.",
    "Do not quote, translate, summarize, or infer spoken words from provider raw payloads, punctuation-only output, page context, prior conversation, visible subtitles, or replay frames."
  ].join(" ");
}

export function formatReplayTranscriptionStatus(
  result: ReplayTranscriptionStatusInput,
  audioDiagnostic: string
): string {
  const timing = typeof result.durationMs === "number" ? ` in ${result.durationMs}ms` : "";
  const segmentStatus =
    typeof result.successfulSegmentCount === "number" && typeof result.segmentCount === "number"
      ? `; ASR success ${result.successfulSegmentCount}/${result.segmentCount} segments`
      : "";
  return `Audio transcript attached${timing}${segmentStatus} (${audioDiagnostic}).`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAudioLevelDiagnostic(diagnostics: ReplayAudioClip["diagnostics"]): string | undefined {
  if (!diagnostics) return undefined;
  if (diagnostics.decodeStatus === "ok") {
    return [
      `decoded ${diagnostics.decodedDurationSeconds ?? "?"}s`,
      `rms ${formatLevel(diagnostics.rms)}`,
      `peak ${formatLevel(diagnostics.peak)}`,
      diagnostics.silent ? "silence risk" : "audio level ok",
      diagnostics.reason
    ].filter(Boolean).join(", ");
  }
  return `audio decode ${diagnostics.decodeStatus}${diagnostics.reason ? `: ${diagnostics.reason}` : ""}`;
}

function formatLevel(value?: number): string {
  return typeof value === "number" ? value.toFixed(4) : "?";
}
