import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../services/cache";
import { runMatchAnalysis, testLLMConnection } from "../services/llm";
import type { AnalysisContext, UserSettings } from "../shared/types";

const baseSettings: UserSettings = {
  language: "en",
  theme: "white",
  llm: {
    provider: "openai",
    baseURL: "https://example.test/v1",
    apiKey: "test-key",
    model: "test-model"
  },
  sports: {},
  replay: {
    enabled: false,
    windowSeconds: 60,
    mode: "video-audio",
    uploadFramesToAI: false,
    uploadAudioToASR: false
  },
  transcription: {
    enabled: true,
    provider: "openai-transcribe",
    endpoint: "",
    apiKey: "",
    model: "gpt-4o-mini-transcribe",
    maxSeconds: 60
  },
  dataPackage: {
    manifestUrl: "https://example.test/manifest.json",
    autoCheck: false,
    selectedTiers: ["core"]
  }
};

describe("testLLMConnection", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearCache();
  });

  it("does not call the provider when required settings are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await testLLMConnection({
      ...baseSettings,
      llm: { ...baseSettings.llm, apiKey: "" }
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("API key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends a minimal hi prompt and reports the provider as available", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "hi" } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testLLMConnection(baseSettings);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("available");
    expect(result.reply).toBe("hi");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          authorization: "Bearer test-key"
        }),
        body: expect.stringContaining('"content":"hi"')
      })
    );
  });

  it("normalizes a numeric OpenAI-compatible UI path to the API v1 path", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testLLMConnection({
      ...baseSettings,
      llm: {
        ...baseSettings.llm,
        provider: "custom",
        baseURL: "https://example.test/1"
      }
    });

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/chat/completions",
      expect.any(Object)
    );
  });

  it("accepts compatible providers that return content parts or reasoning content", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: [{ type: "text", text: "part ok" }] } }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { reasoning_content: "reasoning ok" } }] }), {
          status: 200,
          headers: { "content-type": "application/json" }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const partResult = await testLLMConnection(baseSettings);
    const reasoningResult = await testLLMConnection(baseSettings);

    expect(partResult.ok).toBe(true);
    expect(partResult.reply).toBe("part ok");
    expect(reasoningResult.ok).toBe(true);
    expect(reasoningResult.reply).toBe("reasoning ok");
  });

  it("tests the configured vision model with a small image probe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "vision ok" } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await testLLMConnection(
      {
        ...baseSettings,
        llm: {
          ...baseSettings.llm,
          visionModel: "vision-test-model"
        }
      },
      { mode: "vision" }
    );

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(result.ok).toBe(true);
    expect(result.reply).toBe("vision ok");
    expect(body.model).toBe("vision-test-model");
    expect(body.messages[1].content).toEqual([
      { type: "text", text: expect.stringContaining("image") },
      expect.objectContaining({ type: "image_url" })
    ]);
    const imageUrl = body.messages[1].content[1].image_url.url;
    expect(imageUrl).toMatch(/^data:image\/png;base64,/);
    expect(readPngDimensions(imageUrl)).toEqual({ width: 64, height: 64 });
  });

  it("reports HTTP failures as unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { message: "bad key" } }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
    );

    const result = await testLLMConnection(baseSettings);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("unavailable");
    expect(result.httpStatus).toBe(401);
    expect(result.message).toContain("HTTP 401");
    expect(result.message).toContain("Provider response");
    expect(result.message).toContain("bad key");
  });

  it("reports non-JSON model responses as endpoint configuration errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<!doctype html><html><body>Not the API route</body></html>", {
          status: 200,
          headers: { "content-type": "text/html" }
        })
      )
    );

    const result = await testLLMConnection(baseSettings);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("unavailable");
    expect(result.message).toContain("non-JSON response");
    expect(result.message).toContain("/chat/completions");
    expect(result.message).toContain("<!doctype html>");
  });
});

function readPngDimensions(dataUrl: string): { width: number; height: number } {
  const encoded = dataUrl.replace(/^data:image\/png;base64,/, "");
  const png = Buffer.from(encoded, "base64");
  return {
    width: png.readUInt32BE(16),
    height: png.readUInt32BE(20)
  };
}

describe("runMatchAnalysis", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearCache();
  });

  it("streams assistant text when the provider supports SSE", async () => {
    const chunks: string[] = [];
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"hi"}}]}\n\n')
        );
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":" there"}}]}')
        );
        controller.close();
      }
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));

    const answer = await runMatchAnalysis({
      settings: baseSettings,
      context: baseContext,
      conversation: [{ role: "user", content: "hi" }],
      onDelta: (content) => chunks.push(content)
    });

    expect(answer).toBe("hi there");
    expect(chunks).toEqual(["hi", "hi there"]);
  });

  it("always asks the model again for repeated analysis questions", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "first answer" } }] }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "second answer" } }] }), {
          status: 200
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const first = await runMatchAnalysis({
      settings: baseSettings,
      context: baseContext,
      conversation: [{ role: "user", content: "what is happening?" }]
    });
    const second = await runMatchAnalysis({
      settings: baseSettings,
      context: baseContext,
      conversation: [
        { role: "user", content: "previous question" },
        { role: "assistant", content: "previous answer" },
        { role: "user", content: "what is happening?" }
      ]
    });

    expect(first).toBe("first answer");
    expect(second).toBe("second answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not reuse local answers when market IDs are returned in a different order", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "first market answer" } }] }), {
          status: 200
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "second market answer" } }] }), {
          status: 200
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const firstContext: AnalysisContext = {
      ...baseContext,
      marketSignals: [{ id: "market-b" }, { id: "market-a" }] as AnalysisContext["marketSignals"]
    };
    const secondContext: AnalysisContext = {
      ...baseContext,
      marketSignals: [{ id: "market-a" }, { id: "market-b" }] as AnalysisContext["marketSignals"]
    };

    const first = await runMatchAnalysis({
      settings: baseSettings,
      context: firstContext,
      conversation: [{ role: "user", content: "what is happening?" }]
    });
    const second = await runMatchAnalysis({
      settings: baseSettings,
      context: secondContext,
      conversation: [{ role: "user", content: "what is happening?" }]
    });

    expect(first).toBe("first market answer");
    expect(second).toBe("second market answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends updated market price signals to the model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "first market answer" } }]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "updated market answer" } }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const firstContext: AnalysisContext = {
      ...baseContext,
      marketSignals: [{ id: "mex-win", yesPrice: 0.62 }] as AnalysisContext["marketSignals"]
    };
    const secondContext: AnalysisContext = {
      ...baseContext,
      marketSignals: [{ id: "mex-win", yesPrice: 0.67 }] as AnalysisContext["marketSignals"]
    };

    const first = await runMatchAnalysis({
      settings: baseSettings,
      context: firstContext,
      conversation: [{ role: "user", content: "what is happening?" }]
    });
    const second = await runMatchAnalysis({
      settings: baseSettings,
      context: secondContext,
      conversation: [{ role: "user", content: "what is happening?" }]
    });

    expect(first).toBe("first market answer");
    expect(second).toBe("updated market answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends updated live sports API events to the model", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "pre match answer" } }]
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "live score answer" } }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const firstContext: AnalysisContext = {
      ...baseContext,
      liveSportsContext: {
        dataRole: "User-key sports API snapshot for live status, schedule, and score analysis.",
        snapshots: [
          {
            provider: "football-data.org",
            status: "loaded",
            message: "Loaded 1 football-data.org match item(s).",
            eventCount: 1,
            events: ["football-data.org: Mexico vs South Africa, status TIMED"],
            fixtures: []
          }
        ]
      }
    };
    const secondContext: AnalysisContext = {
      ...baseContext,
      liveSportsContext: {
        dataRole: "User-key sports API snapshot for live status, schedule, and score analysis.",
        snapshots: [
          {
            provider: "football-data.org",
            status: "loaded",
            message: "Loaded 1 football-data.org match item(s).",
            eventCount: 1,
            events: ["football-data.org: Mexico vs South Africa, status IN_PLAY, score 1-0"],
            fixtures: []
          }
        ]
      }
    };

    const first = await runMatchAnalysis({
      settings: baseSettings,
      context: firstContext,
      conversation: [{ role: "user", content: "what is happening?" }]
    });
    const second = await runMatchAnalysis({
      settings: baseSettings,
      context: secondContext,
      conversation: [{ role: "user", content: "what is happening?" }]
    });

    expect(first).toBe("pre match answer");
    expect(second).toBe("live score answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("sends replay frames to the configured vision model without replaying a local cached answer", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(
        JSON.stringify({
          choices: [{ message: { content: "vision answer" } }]
        }),
        { status: 200 }
      ))
    );
    vi.stubGlobal("fetch", fetchMock);

    const contextWithFrames: AnalysisContext = {
      ...baseContext,
      frames: [
        "data:image/jpeg;base64,frame-a",
        "data:image/jpeg;base64,frame-b"
      ],
      replayFrameTimeline: [
        { index: 1, capturedAt: "2026-06-12T03:00:10.000Z" },
        { index: 2, capturedAt: "2026-06-12T03:00:22.000Z" }
      ]
    };
    const settingsWithVision: UserSettings = {
      ...baseSettings,
      llm: {
        ...baseSettings.llm,
        visionModel: "vision-model"
      }
    };

    const first = await runMatchAnalysis({
      settings: settingsWithVision,
      context: contextWithFrames,
      conversation: [{ role: "user", content: "who was that player?" }]
    });
    const second = await runMatchAnalysis({
      settings: settingsWithVision,
      context: contextWithFrames,
      conversation: [{ role: "user", content: "who was that player?" }]
    });

    const firstBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const systemMessage = firstBody.messages[0];
    const userMessage = firstBody.messages[1];

    expect(first).toBe("vision answer");
    expect(second).toBe("vision answer");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(firstBody.model).toBe("vision-model");
    expect(systemMessage.content).toContain("probable identity hints");
    expect(systemMessage.content).toContain("prioritize visible evidence");
    expect(userMessage.content).toEqual([
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining("2026-06-12T03:00:10.000Z")
      }),
      {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,frame-a" }
      },
      {
        type: "image_url",
        image_url: { url: "data:image/jpeg;base64,frame-b" }
      }
    ]);
  });

  it("instructs the model not to infer speech when ASR returns no transcript", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "audio unavailable" } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await runMatchAnalysis({
      settings: baseSettings,
      context: {
        ...baseContext,
        userQuestion: "刚才在说什么？",
        recentEvents: [
          "Audio transcription reached the ASR provider, but the provider returned no usable speech text."
        ]
      },
      conversation: [{ role: "user", content: "刚才在说什么？" }]
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toContain("do not infer spoken words");
    expect(body.messages[0].content).toContain("visible subtitles");
    expect(body.messages[0].content).toContain("punctuation-only ASR output");
    expect(body.messages[0].content).toContain("raw provider payloads");
    expect(body.messages[1].content).toContain("no usable speech text");
  });

  it("tells the model to separate raw ASR transcript from its commentary summary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: "summary" } }]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await runMatchAnalysis({
      settings: baseSettings,
      context: {
        ...baseContext,
        userQuestion: "刚才解说说了什么？",
        transcript: "Raw ASR transcript by segment (chronological):\n[1] 阿根廷夺冠。\n[2] 梅西拿到金球奖。"
      }
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.messages[0].content).toContain("separate raw ASR transcript from your summary");
    expect(body.messages[1].content).toContain("Raw ASR transcript by segment");
  });
});

const baseContext: AnalysisContext = {
  userQuestion: "what is happening?",
  dataSources: [],
  recentEvents: [],
  rosterNotes: [],
  marketSignals: []
};
