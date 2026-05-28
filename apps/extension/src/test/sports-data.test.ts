import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../services/cache";
import { loadSportsDataForMatch } from "../services/sports-data";
import type { UserSettings, WorldCupMatch } from "../shared/types";

const match: WorldCupMatch = {
  id: "mex-rsa",
  kickoffUtc: "2026-06-11T19:00:00.000Z",
  team1: "Mexico",
  team2: "South Africa",
  teamAliases: {
    Mexico: ["mexico"],
    "South Africa": ["south africa"]
  },
  group: "Group A",
  stage: "Group Stage",
  venue: "Mexico City",
  source: {
    sourceName: "test",
    sourceUrl: "https://example.test",
    sourceTimestamp: "2026-05-26"
  }
};

const settings: UserSettings = {
  language: "en",
  theme: "white",
  llm: {
    provider: "openai",
    baseURL: "https://example.test/v1",
    apiKey: "",
    model: ""
  },
  sports: {
    footballDataKey: "football-data-key",
    apiFootballKey: "api-football-key"
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

describe("loadSportsDataForMatch", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearCache();
  });

  it("uses the primary sports provider after a match is detected", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            matches: [
              {
                utcDate: "2026-06-11T19:00:00Z",
                status: "IN_PLAY",
                minute: 37,
                venue: "Mexico City Stadium",
                stage: "GROUP_STAGE",
                group: "Group A",
                matchday: 1,
                lastUpdated: "2026-06-11T19:37:30Z",
                competition: { id: 2000, name: "FIFA World Cup", code: "WC" },
                homeTeam: { name: "Mexico" },
                awayTeam: { name: "South Africa" },
                score: {
                  halfTime: { home: 1, away: 0 },
                  fullTime: { home: 1, away: 0 }
                }
              }
            ]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const snapshots = await loadSportsDataForMatch(settings, match);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("https://api.football-data.org/v4/matches?"),
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Auth-Token": "football-data-key" })
      })
    );
    expect(snapshots[0].fixtures).toEqual([
      {
        provider: "football-data.org",
        fixtureId: "2000:2026-06-11T19:00:00Z:Mexico:South Africa",
        kickoffUtc: "2026-06-11T19:00:00Z",
        status: {
          code: "IN_PLAY",
          label: "IN_PLAY",
          normalized: "live",
          elapsed: 37
        },
        teams: {
          home: { name: "Mexico" },
          away: { name: "South Africa" }
        },
        score: {
          home: 1,
          away: 0,
          halfTime: { home: 1, away: 0 },
          fullTime: { home: 1, away: 0 }
        },
        venue: { name: "Mexico City Stadium" },
        competition: {
          providerCompetitionId: "2000",
          name: "FIFA World Cup",
          code: "WC",
          stage: "GROUP_STAGE",
          group: "Group A",
          matchday: 1
        },
        providerUpdatedAt: "2026-06-11T19:37:30Z"
      }
    ]);
    expect(snapshots.flatMap((snapshot) => snapshot.events)).toContain(
      "football-data.org: Mexico vs South Africa, status IN_PLAY, elapsed 37', kickoff 2026-06-11T19:00:00Z, score 1-0"
    );
  });

  it("falls back to API-Football when the primary provider has no useful data", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            matches: []
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            response: [
              {
                fixture: {
                  id: 12345,
                  date: "2026-06-11T19:00:00+00:00",
                  timestamp: 1781204400,
                  venue: { name: "Mexico City Stadium", city: "Mexico City" },
                  status: { short: "2H", long: "Second Half", elapsed: 63, extra: null }
                },
                league: {
                  id: 1,
                  name: "World Cup",
                  season: 2026,
                  round: "Group A - 1"
                },
                teams: {
                  home: { id: 16, name: "Mexico", winner: true },
                  away: { id: 1118, name: "South Africa", winner: false }
                },
                goals: { home: 2, away: 1 },
                score: {
                  halftime: { home: 1, away: 1 },
                  fulltime: { home: null, away: null },
                  extratime: { home: null, away: null },
                  penalty: { home: null, away: null }
                }
              }
            ]
          }),
          { status: 200 }
        )
    );
    vi.stubGlobal("fetch", fetchMock);

    const snapshots = await loadSportsDataForMatch(settings, match);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(snapshots.map((snapshot) => snapshot.provider)).toEqual(["football-data.org", "API-Football"]);
    expect(snapshots[1].fixtures).toEqual([
      {
        provider: "API-Football",
        fixtureId: "12345",
        kickoffUtc: "2026-06-11T19:00:00+00:00",
        status: {
          code: "2H",
          label: "Second Half",
          normalized: "live",
          elapsed: 63
        },
        teams: {
          home: { providerTeamId: "16", name: "Mexico", winner: true },
          away: { providerTeamId: "1118", name: "South Africa", winner: false }
        },
        score: {
          home: 2,
          away: 1,
          halfTime: { home: 1, away: 1 },
          fullTime: undefined,
          extraTime: undefined,
          penalties: undefined
        },
        venue: { name: "Mexico City Stadium", city: "Mexico City" },
        competition: {
          providerCompetitionId: "1",
          name: "World Cup",
          season: 2026,
          round: "Group A - 1"
        }
      }
    ]);
    expect(snapshots.flatMap((snapshot) => snapshot.events)).toContain(
      "API-Football: Mexico vs South Africa, status 2H, elapsed 63', kickoff 2026-06-11T19:00:00+00:00, score 2-1"
    );
  });

  it("caches sports provider responses by match date", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          matches: [
            {
              utcDate: "2026-06-11T19:00:00Z",
              status: "TIMED",
              homeTeam: { name: "Mexico" },
              awayTeam: { name: "South Africa" },
              score: { fullTime: { home: null, away: null } }
            }
          ]
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadSportsDataForMatch(settings, match);
    const cached = await loadSportsDataForMatch(settings, match);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cached.every((snapshot) => snapshot.message.startsWith("Using cached data"))).toBe(true);
  });
});
