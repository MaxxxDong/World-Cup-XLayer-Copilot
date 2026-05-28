import { afterEach, describe, expect, it, vi } from "vitest";
import { runSportsDiagnostics } from "../services/sports-diagnostics";
import type { UserSettings } from "../shared/types";

const baseSettings: UserSettings = {
  language: "en",
  theme: "white",
  llm: {
    provider: "openai",
    baseURL: "https://example.test/v1",
    apiKey: "",
    model: ""
  },
  sports: {
    apiFootballKey: "",
    footballDataKey: ""
  },
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

describe("runSportsDiagnostics", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("skips all probes when sports keys are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await runSportsDiagnostics(baseSettings);

    expect(result.concurrency).toBe(0);
    expect(result.probes).toHaveLength(2);
    expect(result.probes.every((probe) => probe.status === "skipped")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("runs one low-quota probe per configured provider and summarizes response fields", async () => {
    const fetchMock = vi.fn((url: string) => {
      if (url.includes("api-sports")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              response: [
                {
                  fixture: { id: 1, date: "2026-06-11T19:00:00Z" },
                  teams: { home: { name: "Mexico" }, away: { name: "South Africa" } }
                }
              ]
            }),
            {
              status: 200,
              headers: { "x-ratelimit-requests-remaining": "98" }
            }
          )
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            matches: [
              {
                id: 1,
                utcDate: "2026-06-11T19:00:00Z",
                homeTeam: { name: "Mexico" }
              }
            ]
          }),
          {
            status: 200,
            headers: { "x-requests-available-minute": "9" }
          }
        )
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runSportsDiagnostics({
      ...baseSettings,
      sports: {
        apiFootballKey: "api-secret",
        footballDataKey: "football-secret"
      }
    });

    expect(result.concurrency).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.probes.every((probe) => probe.status === "ok")).toBe(true);
    expect(result.probes.find((probe) => probe.provider === "API-Football")?.label).toBe("Account status");
    expect(result.probes.find((probe) => probe.provider === "football-data.org")?.label).toBe("World Cup access");
    expect(JSON.stringify(result)).not.toContain("api-secret");
    expect(JSON.stringify(result)).not.toContain("football-secret");
  });

  it("reports HTTP failures without losing fields and headers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ errorCode: 429, message: "Too many requests" }), {
          status: 429,
          headers: { "retry-after": "60" }
        })
      )
    );

    const result = await runSportsDiagnostics({
      ...baseSettings,
      sports: { apiFootballKey: "api-secret" }
    });
    const failed = result.probes.find((probe) => probe.status === "http-error");

    expect(failed?.httpStatus).toBe(429);
    expect(failed?.rateLimitHeaders["retry-after"]).toBe("60");
    expect(failed?.topLevelFields).toContain("errorCode");
  });
});
