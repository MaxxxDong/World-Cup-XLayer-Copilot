import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractTranscript,
  testTranscriptionConnection,
  transcribeReplayAudio,
  transcribeReplayAudioSegments
} from "../services/transcription";
import type { ReplayAudioClip, UserSettings } from "../shared/types";

const settings: UserSettings = {
  language: "en",
  theme: "white",
  llm: {
    provider: "openai",
    baseURL: "https://example.test/v1",
    apiKey: "",
    model: ""
  },
  sports: {},
  replay: {
    enabled: true,
    windowSeconds: 60,
    mode: "video-audio",
    uploadFramesToAI: false,
    uploadAudioToASR: false
  },
  transcription: {
    enabled: true,
    provider: "openai-transcribe",
    endpoint: "https://asr.example.test/v1/audio/transcriptions",
    apiKey: "asr-key",
    model: "gpt-4o-mini-transcribe",
    maxSeconds: 60
  },
  dataPackage: {
    manifestUrl: "https://example.test/manifest.json",
    autoCheck: false,
    selectedTiers: ["core"]
  }
};

const audioClip: ReplayAudioClip = {
  capturedAt: "2026-06-12T03:01:00.000Z",
  dataUrl: `data:audio/webm;base64,${Buffer.from("audio").toString("base64")}`,
  mimeType: "audio/webm",
  byteLength: 5,
  durationSeconds: 60
};

describe("transcribeReplayAudio", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads replay audio to the configured ASR endpoint and returns transcript text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "Mexico number 14 scored." }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(settings, audioClip);

    expect(result).toMatchObject({
      status: "loaded",
      transcript: "Mexico number 14 scored."
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://asr.example.test/v1/audio/transcriptions",
      expect.objectContaining({
        method: "POST",
        headers: {
          authorization: "Bearer asr-key"
        },
        body: expect.any(FormData)
      })
    );
  });

  it("reports provider payload details when ASR returns no usable speech text", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ output: { choices: [{ message: { content: [{ text: "." }] } }] } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(settings, audioClip);

    expect(result.status).toBe("failed");
    expect(result.message).toContain("reached the ASR provider");
    expect(result.message).toContain("no usable speech text");
    expect(result.message).toContain("Provider response");
  });

  it("transcribes multiple replay audio segments and merges them in chronological order", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "first segment" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: "second segment" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudioSegments(settings, [
      { ...audioClip, capturedAt: "2026-06-12T03:01:00.000Z" },
      { ...audioClip, capturedAt: "2026-06-12T03:01:05.000Z" }
    ]);

    expect(result.status).toBe("loaded");
    expect(result.transcript).toBe("Raw ASR transcript by segment (chronological):\n[1] first segment\n[2] second segment");
    expect(result.message).toContain("ASR success 2/2 segments");
    expect(result.segmentCount).toBe(2);
    expect(result.successfulSegmentCount).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not send locally undecodable replay audio to the ASR provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(settings, {
      ...audioClip,
      diagnostics: {
        decodeStatus: "failed",
        reason: "Unable to decode audio data."
      }
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("could not be decoded locally");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not send silent replay audio to the ASR provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(settings, {
      ...audioClip,
      diagnostics: {
        decodeStatus: "ok",
        decodedDurationSeconds: 4.8,
        rms: 0.0002,
        peak: 0.001,
        silent: true
      }
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("appears silent");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps DashScope realtime websocket settings to the OpenAI-compatible Qwen ASR endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "欢迎与使用阿里云。"
              }
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(
      {
        ...settings,
        transcription: {
          ...settings.transcription,
          provider: "aliyun-dashscope-asr",
          endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
          model: "qwen3-asr-flash-realtime"
        }
      },
      audioClip
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(result.transcript).toBe("欢迎与使用阿里云。");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer asr-key",
          "content-type": "application/json"
        })
      })
    );
    expect(body.model).toBe("qwen3-asr-flash");
    expect(body.messages[0].content[0]).toEqual({
      type: "input_audio",
      input_audio: {
        data: expect.stringMatching(/^data:audio\/wav;base64,/)
      }
    });
    expect(body.asr_options.enable_itn).toBe(false);
  });

  it("uploads Deepgram replay audio with Token authentication and extracts the transcript", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          results: {
            channels: [
              {
                alternatives: [
                  {
                    transcript: "Deepgram heard the replay commentary."
                  }
                ]
              }
            ]
          }
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(
      {
        ...settings,
        transcription: {
          ...settings.transcription,
          provider: "deepgram-nova",
          endpoint: "https://api.deepgram.com/v1/listen",
          model: "nova-3"
        }
      },
      audioClip
    );

    expect(result.status).toBe("loaded");
    expect(result.transcript).toBe("Deepgram heard the replay commentary.");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&detect_language=true",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Token asr-key",
          "content-type": "audio/webm"
        }),
        body: expect.any(Blob)
      })
    );
  });

  it("does not call provider presets that require a server-side adapter", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(
      {
        ...settings,
        transcription: {
          ...settings.transcription,
          provider: "tencent-cloud-asr",
          endpoint: "https://asr.tencentcloudapi.com",
          model: "16k_zh"
        }
      },
      audioClip
    );

    expect(result.status).toBe("failed");
    expect(result.message).toContain("requires a server-side adapter");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported websocket transcription endpoints before fetch", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(
      {
        ...settings,
        transcription: {
          ...settings.transcription,
          provider: "custom",
          endpoint: "wss://example.test/realtime",
          model: "custom-realtime"
        }
      },
      audioClip
    );

    expect(result.status).toBe("failed");
    expect(result.message).toContain("WebSocket transcription endpoints are not supported");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not call the provider without an endpoint", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await transcribeReplayAudio(
      {
        ...settings,
        transcription: {
          ...settings.transcription,
          endpoint: ""
        }
      },
      audioClip
    );

    expect(result.status).toBe("skipped");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("testTranscriptionConnection", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tests the configured ASR endpoint with a tiny audio probe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "hi" }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testTranscriptionConnection(settings);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("available");
    expect(result.transcript).toBe("hi");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("tests DashScope ASR over the compatible endpoint when the configured URL is realtime websocket", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "嗯。" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testTranscriptionConnection({
      ...settings,
      transcription: {
        ...settings.transcription,
        provider: "aliyun-dashscope-asr",
        endpoint: "wss://dashscope.aliyuncs.com/api-ws/v1/realtime",
        model: "qwen3-asr-flash-realtime"
      }
    });

    expect(result.ok).toBe(true);
    expect(result.transcript).toBe("嗯。");
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).messages[0].content[0].input_audio.data).toMatch(
      /^data:audio\/wav;base64,/
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("reports HTTP error details from the ASR provider", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("invalid api key", {
          status: 401,
          statusText: "Unauthorized"
        })
      )
    );

    const result = await testTranscriptionConnection(settings);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("unavailable");
    expect(result.httpStatus).toBe(401);
    expect(result.message).toContain("HTTP 401");
    expect(result.message).toContain("invalid api key");
  });

  it("explains provider 404 responses as an endpoint path problem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><center><h1>404 Not Found</h1></center><center>openresty</center></html>", {
          status: 404,
          statusText: "Not Found",
          headers: { "content-type": "text/html" }
        })
      )
    );

    const result = await testTranscriptionConnection(settings);

    expect(result.ok).toBe(false);
    expect(result.message).toContain("Endpoint was reached, but this path was not found");
    expect(result.message).toContain("not the ASR upload API");
  });
});

describe("extractTranscript", () => {
  it("accepts common ASR response shapes", () => {
    expect(extractTranscript({ data: { text: "hello" } })).toBe("hello");
    expect(extractTranscript({ result: { transcript: "hola" } })).toBe("hola");
    expect(extractTranscript({ results: { channels: [{ alternatives: [{ transcript: "deepgram text" }] }] } })).toBe("deepgram text");
    expect(extractTranscript({ output: { choices: [{ message: { content: [{ text: "你好" }] } }] } })).toBe("你好");
    expect(extractTranscript({ choices: [{ message: { content: "hello from compat" } }] })).toBe("hello from compat");
    expect(extractTranscript("plain transcript")).toBe("plain transcript");
  });

  it("treats punctuation-only ASR output as no usable speech text", () => {
    expect(extractTranscript({ output: { choices: [{ message: { content: [{ text: "." }] } }] } })).toBeUndefined();
    expect(extractTranscript(".")).toBeUndefined();
  });
});
