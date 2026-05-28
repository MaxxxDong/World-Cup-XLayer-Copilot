import { getTranscriptionProviderOption } from "../shared/provider-presets";
import type { ReplayAudioClip, UserSettings } from "../shared/types";

export interface ReplayTranscriptionResult {
  status: "skipped" | "loaded" | "failed";
  message: string;
  transcript?: string;
  durationMs?: number;
  httpStatus?: number;
  segmentCount?: number;
  successfulSegmentCount?: number;
}

export interface TranscriptionConnectionTestResult {
  ok: boolean;
  status: "available" | "unavailable";
  message: string;
  testedAt: string;
  durationMs?: number;
  httpStatus?: number;
  transcript?: string;
}

const TEST_WAV_SECONDS = 1;
const ASR_SEGMENT_CONCURRENCY = 2;

export async function transcribeReplayAudio(
  settings: UserSettings,
  audioClip?: ReplayAudioClip
): Promise<ReplayTranscriptionResult> {
  if (!audioClip?.dataUrl) {
    return {
      status: "skipped",
      message: "No replay audio clip is available yet."
    };
  }

  if (audioClip.diagnostics?.decodeStatus === "failed") {
    return {
      status: "failed",
      message: `Replay audio could not be decoded locally before ASR upload. ${audioClip.diagnostics.reason ?? ""}`.trim()
    };
  }

  if (audioClip.diagnostics?.silent) {
    return {
      status: "failed",
      message: "Replay audio appears silent or too low-volume before ASR upload."
    };
  }

  if (requiresTranscriptionAdapter(settings)) {
    return {
      status: "failed",
      message: transcriptionAdapterMessage(settings)
    };
  }

  const endpoint = settings.transcription.endpoint.trim();
  if (!endpoint) {
    return {
      status: "skipped",
      message: "Audio transcription endpoint is not configured."
    };
  }

  try {
    const startedAt = performance.now();
    const response = await requestTranscription(settings, audioClip);
    const durationMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const details = await readResponseDetails(response);
      return {
        status: "failed",
        message: formatTranscriptionHttpError(response.status, details, "Audio transcription failed"),
        httpStatus: response.status,
        durationMs
      };
    }

    const payload = await parseTranscriptionResponse(response);
    const transcript = extractTranscript(payload);
    if (!transcript) {
      const payloadSummary = summarizeTranscriptionPayload(payload);
      return {
        status: "failed",
        message: payloadSummary
          ? `Audio transcription reached the ASR provider, but the provider returned no usable speech text. Provider response: ${payloadSummary}.`
          : "Audio transcription reached the ASR provider, but the provider returned no usable speech text.",
        durationMs
      };
    }

    return {
      status: "loaded",
      transcript,
      durationMs,
      message: `Audio transcription loaded in ${durationMs}ms (${Math.round(audioClip.byteLength / 1024)} KB).`
    };
  } catch (error) {
    return {
      status: "failed",
      message: `Audio transcription failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

export async function transcribeReplayAudioSegments(
  settings: UserSettings,
  audioClips: ReplayAudioClip[]
): Promise<ReplayTranscriptionResult> {
  if (!audioClips.length) {
    return {
      status: "skipped",
      message: "No replay audio clip is available yet."
    };
  }

  const orderedClips = [...audioClips].sort((a, b) => Date.parse(a.capturedAt) - Date.parse(b.capturedAt));
  const results = await mapWithConcurrency(orderedClips, ASR_SEGMENT_CONCURRENCY, (clip) =>
    transcribeReplayAudio(settings, clip)
  );
  const loaded = results
    .map((result, index) => ({ result, index }))
    .filter((item) => item.result.transcript);

  if (loaded.length) {
    const transcript = [
      "Raw ASR transcript by segment (chronological):",
      ...loaded.map((item) => `[${item.index + 1}] ${item.result.transcript}`)
    ].join("\n");
    return {
      status: "loaded",
      transcript,
      durationMs: results.reduce((total, result) => total + (result.durationMs ?? 0), 0),
      segmentCount: orderedClips.length,
      successfulSegmentCount: loaded.length,
      message: `ASR success ${loaded.length}/${orderedClips.length} segments.`
    };
  }

  const failed = results.find((result) => result.status === "failed");
  if (failed) {
    return {
      status: "failed",
      message: `No usable transcript text was returned from ${orderedClips.length} audio segment(s). Last error: ${failed.message}`,
      durationMs: results.reduce((total, result) => total + (result.durationMs ?? 0), 0),
      httpStatus: failed.httpStatus
    };
  }

  return {
    status: "skipped",
    message: results.at(-1)?.message ?? "No replay audio clip is available yet."
  };
}

async function mapWithConcurrency<T, TResult>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<TResult>
): Promise<TResult[]> {
  const results: TResult[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        results[currentIndex] = await mapper(items[currentIndex], currentIndex);
      }
    })
  );
  return results;
}

export async function testTranscriptionConnection(
  settings: UserSettings
): Promise<TranscriptionConnectionTestResult> {
  const testedAt = new Date().toISOString();
  if (!settings.transcription.endpoint.trim()) {
    return {
      ok: false,
      status: "unavailable",
      message: "Missing transcription endpoint.",
      testedAt
    };
  }

  if (requiresTranscriptionAdapter(settings)) {
    return {
      ok: false,
      status: "unavailable",
      message: transcriptionAdapterMessage(settings),
      testedAt
    };
  }

  const audioClip: ReplayAudioClip = {
    capturedAt: testedAt,
    dataUrl: buildSilentWavDataUrl(TEST_WAV_SECONDS),
    mimeType: "audio/wav",
    byteLength: 44 + 16000 * TEST_WAV_SECONDS * 2,
    durationSeconds: TEST_WAV_SECONDS
  };

  try {
    const startedAt = performance.now();
    const response = await requestTranscription(settings, audioClip);
    const durationMs = Math.round(performance.now() - startedAt);

    if (!response.ok) {
      const details = await readResponseDetails(response);
      return {
        ok: false,
        status: "unavailable",
        message: formatTranscriptionHttpError(response.status, details, "Transcription test failed"),
        httpStatus: response.status,
        testedAt,
        durationMs
      };
    }

    const payload = await parseTranscriptionResponse(response);
    const transcript = extractTranscript(payload);
    const payloadSummary = summarizeTranscriptionPayload(payload);
    return {
      ok: true,
      status: "available",
      message: transcript
        ? `Transcription endpoint is available (${durationMs}ms).`
        : payloadSummary
          ? `Transcription endpoint is reachable (${durationMs}ms), but the tiny probe returned no speech text. Provider response: ${payloadSummary}.`
          : `Transcription endpoint is reachable (${durationMs}ms), but the tiny probe returned no speech text.`,
      transcript,
      testedAt,
      durationMs
    };
  } catch (error) {
    return {
      ok: false,
      status: "unavailable",
      message: `Transcription test could not reach the endpoint. ${error instanceof Error ? error.message : String(error)}`,
      testedAt
    };
  }
}

async function requestTranscription(settings: UserSettings, audioClip: ReplayAudioClip): Promise<Response> {
  if (usesDashScopeAsr(settings)) {
    return requestDashScopeAsr(settings, audioClip);
  }

  if (settings.transcription.provider === "deepgram-nova") {
    return requestDeepgramAsr(settings, audioClip);
  }

  if (/^wss:\/\//i.test(settings.transcription.endpoint.trim())) {
    throw new Error(
      "WebSocket transcription endpoints are not supported by the buffered replay uploader. Use the provider preset for realtime services or an HTTP upload endpoint."
    );
  }

  const form = new FormData();
  const blob = dataUrlToBlob(audioClip.dataUrl, audioClip.mimeType);
  form.append("file", blob, `instant-replay-${Date.parse(audioClip.capturedAt) || Date.now()}.webm`);
  form.append("model", settings.transcription.model || getTranscriptionProviderOption(settings.transcription.provider).model);
  form.append("provider", settings.transcription.provider);
  form.append("language", "auto");
  if (audioClip.durationSeconds) form.append("duration_seconds", String(audioClip.durationSeconds));

  const headers: Record<string, string> = {};
  if (settings.transcription.apiKey.trim()) {
    headers.authorization = `Bearer ${settings.transcription.apiKey.trim()}`;
  }

  return fetch(settings.transcription.endpoint.trim(), {
    method: "POST",
    headers,
    body: form
  });
}

async function requestDeepgramAsr(settings: UserSettings, audioClip: ReplayAudioClip): Promise<Response> {
  const url = new URL(settings.transcription.endpoint.trim());
  if (!url.searchParams.has("model")) {
    url.searchParams.set("model", settings.transcription.model || "nova-3");
  }
  if (!url.searchParams.has("smart_format")) {
    url.searchParams.set("smart_format", "true");
  }
  if (!url.searchParams.has("detect_language")) {
    url.searchParams.set("detect_language", "true");
  }

  const blob = dataUrlToBlob(audioClip.dataUrl, audioClip.mimeType);
  const headers: Record<string, string> = {
    "content-type": blob.type || audioClip.mimeType || "audio/webm"
  };
  if (settings.transcription.apiKey.trim()) {
    headers.authorization = `Token ${settings.transcription.apiKey.trim()}`;
  }

  return fetch(url.toString(), {
    method: "POST",
    headers,
    body: blob
  });
}

async function requestDashScopeAsr(settings: UserSettings, audioClip: ReplayAudioClip): Promise<Response> {
  const endpoint = normalizeDashScopeCompatibleEndpoint(settings.transcription.endpoint.trim());
  const model = normalizeDashScopeModel(settings.transcription.model);
  const audioDataUrl = await prepareDashScopeAudioDataUrl(audioClip);
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  if (settings.transcription.apiKey.trim()) {
    headers.authorization = `Bearer ${settings.transcription.apiKey.trim()}`;
  }

  return fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "input_audio",
              input_audio: {
                data: audioDataUrl
              }
            }
          ]
        }
      ],
      stream: false,
      asr_options: {
        enable_itn: false
      }
    })
  });
}

async function prepareDashScopeAudioDataUrl(audioClip: ReplayAudioClip): Promise<string> {
  if (/^data:audio\/wav;base64,/i.test(audioClip.dataUrl)) return audioClip.dataUrl;

  if (/^data:audio\/webm/i.test(audioClip.dataUrl)) {
    const decoded = decodeBase64AudioPayload(audioClip.dataUrl);
    if (decoded.length > 0 && decoded.length < 4096) {
      return buildSilentWavDataUrl(audioClip.durationSeconds ? Math.min(audioClip.durationSeconds, 1) : 1);
    }
  }

  const converted = await tryConvertAudioDataUrlToWav(audioClip.dataUrl);
  if (converted) return converted;
  return audioClip.dataUrl;
}

async function tryConvertAudioDataUrlToWav(dataUrl: string): Promise<string | undefined> {
  const AudioContextConstructor =
    globalThis.AudioContext ?? (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return undefined;

  const blob = dataUrlToBlob(dataUrl, "audio/webm");
  const arrayBuffer = await blob.arrayBuffer();
  const audioContext = new AudioContextConstructor();
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    return encodeAudioBufferToWavDataUrl(audioBuffer);
  } catch {
    return undefined;
  } finally {
    void audioContext.close();
  }
}

function encodeAudioBufferToWavDataUrl(audioBuffer: AudioBuffer): string {
  const sampleRate = audioBuffer.sampleRate;
  const channelCount = audioBuffer.numberOfChannels;
  const frameCount = audioBuffer.length;
  const dataBytes = frameCount * channelCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * 2, true);
  view.setUint16(32, channelCount * 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);

  let offset = 44;
  const channels = Array.from({ length: channelCount }, (_, index) => audioBuffer.getChannelData(index));
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channel][frame]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return `data:audio/wav;base64,${arrayBufferToBase64(buffer)}`;
}

function buildSilentWavDataUrl(seconds: number): string {
  const sampleRate = 16000;
  const frameCount = Math.max(1, Math.round(sampleRate * seconds));
  const dataBytes = frameCount * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  return `data:audio/wav;base64,${arrayBufferToBase64(buffer)}`;
}

function decodeBase64AudioPayload(dataUrl: string): Uint8Array {
  const [, base64 = ""] = dataUrl.split(",", 2);
  if (!base64) return new Uint8Array();
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(index, index + chunkSize));
  }
  return btoa(binary);
}

function writeAscii(view: DataView, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function usesDashScopeAsr(settings: UserSettings): boolean {
  const endpoint = settings.transcription.endpoint.trim();
  return Boolean(
    settings.transcription.provider === "aliyun-dashscope-asr" ||
      /dashscope(-intl)?\.aliyuncs\.com/i.test(endpoint) ||
      /qwen3-asr/i.test(settings.transcription.model)
  );
}

function normalizeDashScopeCompatibleEndpoint(endpoint: string): string {
  const host = endpoint.includes("dashscope-intl.aliyuncs.com")
    ? "dashscope-intl.aliyuncs.com"
    : endpoint.includes("dashscope-us.aliyuncs.com")
      ? "dashscope-us.aliyuncs.com"
      : "dashscope.aliyuncs.com";
  return `https://${host}/compatible-mode/v1/chat/completions`;
}

function normalizeDashScopeModel(model: string): string {
  if (/qwen3-asr-flash-realtime/i.test(model)) return "qwen3-asr-flash";
  return model.trim() || "qwen3-asr-flash";
}

async function readResponseDetails(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text.replace(/\s+/g, " ").trim().slice(0, 240);
}

function formatTranscriptionHttpError(status: number, details: string, prefix: string): string {
  if (status === 404) {
    return `${prefix} with HTTP 404. Endpoint was reached, but this path was not found; the URL is probably a docs/platform page or not the ASR upload API.${details ? ` Provider response: ${details}` : ""}`;
  }
  if (status === 401 || status === 403) {
    return `${prefix} with HTTP ${status}. Check the transcription API key, account permission, or provider authorization format.${details ? ` Provider response: ${details}` : ""}`;
  }
  return `${prefix} with HTTP ${status}${details ? `: ${details}` : ""}.`;
}

async function parseTranscriptionResponse(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  return response.text();
}

export function extractTranscript(payload: unknown): string | undefined {
  if (typeof payload === "string") return normalizeTranscriptText(payload);
  if (!payload || typeof payload !== "object") return undefined;

  const record = payload as Record<string, unknown>;
  return firstText([
    record.text,
    record.transcript,
    record.result,
    nestedText(record.result),
    nestedText(record.data),
    nestedText(record.response),
    nestedText(record.output),
    extractDeepgramTranscript(record.results),
    extractChoicesText(record.choices),
    extractChoicesText((record.output as Record<string, unknown> | undefined)?.choices)
  ]);
}

function requiresTranscriptionAdapter(settings: UserSettings): boolean {
  return !getTranscriptionProviderOption(settings.transcription.provider).directUpload;
}

function transcriptionAdapterMessage(settings: UserSettings): string {
  const option = getTranscriptionProviderOption(settings.transcription.provider);
  return `${option.label} requires a server-side adapter or official SDK signing flow before the extension can use it. Configure that adapter as a Custom HTTP ASR endpoint.`;
}

function nestedText(value: unknown): unknown {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  return record.text ?? record.transcript ?? record.result;
}

function firstText(values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = normalizeTranscriptText(value);
    if (trimmed) return trimmed;
  }
  return undefined;
}

function normalizeTranscriptText(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return undefined;
  return trimmed;
}

function summarizeTranscriptionPayload(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload.replace(/\s+/g, " ").trim().slice(0, 240) || undefined;
  try {
    return JSON.stringify(payload).replace(/\s+/g, " ").slice(0, 240);
  } catch {
    return undefined;
  }
}

function extractChoicesText(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const choice of value) {
    if (!choice || typeof choice !== "object") continue;
    const message = (choice as Record<string, unknown>).message;
    const text = extractMessageContentText(message);
    if (text) return text;
  }
  return undefined;
}

function extractDeepgramTranscript(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const channels = (value as Record<string, unknown>).channels;
  if (!Array.isArray(channels)) return undefined;
  for (const channel of channels) {
    if (!channel || typeof channel !== "object") continue;
    const alternatives = (channel as Record<string, unknown>).alternatives;
    if (!Array.isArray(alternatives)) continue;
    for (const alternative of alternatives) {
      if (!alternative || typeof alternative !== "object") continue;
      const transcript = (alternative as Record<string, unknown>).transcript;
      if (typeof transcript !== "string") continue;
      const normalized = normalizeTranscriptText(transcript);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function extractMessageContentText(message: unknown): string | undefined {
  if (!message || typeof message !== "object") return undefined;
  const content = (message as Record<string, unknown>).content;
  if (typeof content === "string") return normalizeTranscriptText(content);
  if (!Array.isArray(content)) return undefined;
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const text = (item as Record<string, unknown>).text;
    if (typeof text === "string") {
      const normalized = normalizeTranscriptText(text);
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const [prefix, base64] = dataUrl.split(",", 2);
  if (!base64) return new Blob([dataUrl], { type: fallbackMimeType || "audio/webm" });
  const mimeType = /data:([^;]+)/.exec(prefix)?.[1] ?? fallbackMimeType ?? "audio/webm";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}
