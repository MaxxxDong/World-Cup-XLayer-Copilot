import { describe, expect, it } from "vitest";
import {
  buildReplayAudioUnavailableContext,
  formatReplayAudioClipsDiagnostic,
  formatReplayAudioDiagnostic,
  formatReplayTranscriptionStatus
} from "../domain/replay-audio-diagnostics";

describe("formatReplayAudioDiagnostic", () => {
  it("shows the actual captured audio size, duration, chunk count, and mime type", () => {
    expect(
      formatReplayAudioDiagnostic({
        capturedAt: "2026-06-12T03:01:00.000Z",
        dataUrl: "data:audio/webm;base64,audio",
        mimeType: "audio/webm",
        byteLength: 52_500,
        durationSeconds: 5,
        chunkCount: 1
      })
    ).toBe("~5s, 51 KB, 1 chunk, audio/webm");
  });

  it("includes decoded audio level diagnostics when available", () => {
    expect(
      formatReplayAudioDiagnostic({
        capturedAt: "2026-06-12T03:01:00.000Z",
        dataUrl: "data:audio/webm;base64,audio",
        mimeType: "audio/webm",
        byteLength: 101_000,
        durationSeconds: 6,
        chunkCount: 2,
        diagnostics: {
          decodeStatus: "ok",
          decodedDurationSeconds: 5.8,
          rms: 0.0142,
          peak: 0.21,
          silent: false
        }
      })
    ).toBe("~6s, 99 KB, 2 chunks, audio/webm, decoded 5.8s, rms 0.0142, peak 0.2100, audio level ok");
  });

  it("warns when the decoded audio appears silent", () => {
    expect(
      formatReplayAudioDiagnostic({
        capturedAt: "2026-06-12T03:01:00.000Z",
        dataUrl: "data:audio/webm;base64,audio",
        mimeType: "audio/webm",
        byteLength: 12_000,
        durationSeconds: 5,
        chunkCount: 1,
        diagnostics: {
          decodeStatus: "ok",
          decodedDurationSeconds: 4.9,
          rms: 0.0004,
          peak: 0.003,
          silent: true
        }
      })
    ).toContain("silence risk");
  });

  it("shows the latest chunk fallback reason when multi-chunk WebM decode fails", () => {
    expect(
      formatReplayAudioDiagnostic({
        capturedAt: "2026-06-12T03:01:00.000Z",
        dataUrl: "data:audio/webm;base64,audio",
        mimeType: "audio/webm",
        byteLength: 48_000,
        durationSeconds: 5,
        chunkCount: 1,
        diagnostics: {
          decodeStatus: "ok",
          decodedDurationSeconds: 4.8,
          rms: 0.02,
          peak: 0.3,
          silent: false,
          reason: "Latest chunk fallback after combined WebM decode failed."
        }
      })
    ).toContain("Latest chunk fallback after combined WebM decode failed.");
  });

  it("formats multiple replay audio segment diagnostics in order", () => {
    const diagnostic = formatReplayAudioClipsDiagnostic([
      {
        capturedAt: "2026-06-12T03:01:00.000Z",
        dataUrl: "data:audio/webm;base64,audio",
        mimeType: "audio/webm",
        byteLength: 51_000,
        durationSeconds: 5,
        chunkCount: 1
      },
      {
        capturedAt: "2026-06-12T03:01:05.000Z",
        dataUrl: "data:audio/webm;base64,audio",
        mimeType: "audio/webm",
        byteLength: 52_000,
        durationSeconds: 5,
        chunkCount: 1
      }
    ]);

    expect(diagnostic).toContain("segment 1: ~5s");
    expect(diagnostic).toContain("segment 2: ~5s");
  });

  it("builds an AI-safe no-transcript context without raw provider payloads", () => {
    const context = buildReplayAudioUnavailableContext("~6s, 101 KB, 2 chunks, audio/webm;codecs=opus");

    expect(context).toContain("no usable transcript text");
    expect(context).toContain("ASR transcript is unavailable");
    expect(context).toContain("punctuation-only output");
    expect(context).toContain("~6s, 101 KB, 2 chunks, audio/webm;codecs=opus");
    expect(context).not.toContain("choices");
    expect(context).not.toContain('"content":"."');
  });

  it("formats transcript attachment status with ASR segment success count", () => {
    const status = formatReplayTranscriptionStatus(
      {
        durationMs: 7921,
        segmentCount: 4,
        successfulSegmentCount: 4
      },
      "segment 1: ~5s; segment 2: ~5s"
    );

    expect(status).toContain("Audio transcript attached in 7921ms");
    expect(status).toContain("ASR success 4/4 segments");
    expect(status).toContain("segment 1: ~5s; segment 2: ~5s");
  });
});
