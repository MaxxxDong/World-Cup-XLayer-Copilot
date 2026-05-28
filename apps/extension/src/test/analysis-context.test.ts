import { describe, expect, it } from "vitest";
import { buildAnalysisContext } from "../domain/analysis-context";

describe("buildAnalysisContext", () => {
  it("includes compact match candidate reports for agent routing", () => {
    const context = buildAnalysisContext({
      question: "Which match is this?",
      markets: [],
      matchCandidates: [
        {
          confidence: 86,
          label: "Mexico vs South Africa",
          matchId: "wc-2026-001-mex-rsa",
          reasons: ["team", "venue", "query"],
          sourceFields: ["identification.teams.aliases", "identification.venueAliases", "identification.queryHints"]
        },
        {
          confidence: 25,
          label: "Canada vs Bosnia & Herzegovina",
          matchId: "wc-2026-013-can-bih",
          reasons: ["team"],
          sourceFields: ["pageContext.visibleText"]
        }
      ]
    });

    expect(context.matchCandidates).toHaveLength(2);
    expect(context.matchCandidates?.[0]).toEqual({
      confidence: 86,
      label: "Mexico vs South Africa",
      matchId: "wc-2026-001-mex-rsa",
      reasons: ["team", "venue", "query"],
      sourceFields: ["identification.teams.aliases", "identification.venueAliases", "identification.queryHints"]
    });
    expect(context.matchSelection).toEqual({
      matchId: undefined,
      mode: "none"
    });
  });

  it("marks manual match selection as runtime context", () => {
    const context = buildAnalysisContext({
      question: "Analyze this match",
      markets: [],
      manualMatchId: "wc-2026-001-mex-rsa",
      detection: {
        confidence: 100,
        detectedAt: "2026-05-27T00:00:00.000Z",
        evidence: ["Selected from schedule."],
        match: {
          id: "wc-2026-001-mex-rsa",
          kickoffUtc: "2026-06-11T19:00:00.000Z",
          team1: "Mexico",
          team2: "South Africa",
          teamAliases: {},
          stage: "Group Stage",
          venue: "Mexico City",
          source: {
            sourceName: "openfootball/worldcup.json",
            sourceUrl: "https://github.com/openfootball/worldcup.json",
            sourceTimestamp: "2026-05-26T12:00:00.000Z"
          }
        },
        reasons: ["manual"],
        sourceFields: ["schedule"]
      }
    });

    expect(context.matchSelection).toEqual({
      matchId: "wc-2026-001-mex-rsa",
      mode: "manual"
    });
  });

  it("exposes X Layer contract odds as model analysis context", () => {
    const context = buildAnalysisContext({
      question: "How does the market see this match?",
      markets: [
        {
          id: "mex-win",
          provider: "XLayer",
          marketId: "1",
          outcomeIntent: "teamA",
          contractAddress: "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
          chainId: 196,
          slug: "wc-2026-001-mex-rsa",
          eventSlug: "wc-2026-001-mex-rsa:teamA",
          eventTitle: "Mexico vs South Africa",
          title: "Mexico wins in regular time",
          active: true,
          closed: false,
          acceptingOrders: true,
          enableOrderBook: true,
          liquidity: 20,
          volume: 20,
          poolAmountUsdt: 10,
          totalPoolUsdt: 20,
          payoutMultiple: 2,
          officialUrl: "http://kr.maxfugui.top/?matchId=wc-2026-001-mex-rsa&outcome=teamA&source=world-cup-copilot",
          group: "current-match",
          relevanceScore: 93,
          scoreParts: { exactTeams: 55 },
          relevanceReason: "Mentions both Mexico and South Africa."
        }
      ]
    });

    expect(context.predictionMarketContext).toEqual({
      provider: "XLayer",
      sourceName: "X Layer WorldCupTriMarket contract",
      sourceUrl: "https://www.okx.com/web3/explorer/xlayer/address/0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
      dataRole: "X Layer USDT0 pool-implied odds and liquidity signal for analysis, not betting instructions.",
      marketCount: 1,
      topSignals: [
        {
          id: "mex-win",
          provider: "XLayer",
          marketId: "1",
          outcomeIntent: "teamA",
          contractAddress: "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
          chainId: 196,
          title: "Mexico wins in regular time",
          eventTitle: "Mexico vs South Africa",
          group: "current-match",
          relevanceScore: 93,
          relevanceReason: "Mentions both Mexico and South Africa.",
          liquidity: 20,
          volume: 20,
          poolAmountUsdt: 10,
          totalPoolUsdt: 20,
          payoutMultiple: 2,
          acceptingOrders: true,
          officialUrl: "http://kr.maxfugui.top/?matchId=wc-2026-001-mex-rsa&outcome=teamA&source=world-cup-copilot"
        }
      ]
    });
  });

  it("exposes user-key sports API snapshots as structured live sports context", () => {
    const context = buildAnalysisContext({
      question: "What is the live match state?",
      markets: [],
      sportsSnapshots: [
        {
          provider: "football-data.org",
          status: "loaded",
          message: "Loaded 1 football-data.org match item(s) for 2026-06-11.",
          events: [
            "football-data.org: Mexico vs South Africa, status IN_PLAY, kickoff 2026-06-11T19:00:00Z, score 1-0"
          ],
          fixtures: [
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
              score: { home: 1, away: 0 },
              venue: { name: "Mexico City Stadium" },
              providerUpdatedAt: "2026-06-11T19:37:30Z"
            }
          ],
          source: {
            sourceName: "football-data.org",
            sourceUrl: "https://api.football-data.org/v4/matches?dateFrom=2026-06-11&dateTo=2026-06-11",
            sourceTimestamp: "2026-06-11T19:15:00.000Z"
          }
        },
        {
          provider: "API-Football",
          status: "rate-limited",
          message: "API-Football skipped: Local 95 requests/day guard is active.",
          events: []
        }
      ]
    });

    expect(context.liveSportsContext).toEqual({
      dataRole: "User-key sports API snapshot for live status, schedule, and score analysis.",
      snapshots: [
        {
          provider: "football-data.org",
          status: "loaded",
          message: "Loaded 1 football-data.org match item(s) for 2026-06-11.",
          eventCount: 1,
          events: [
            "football-data.org: Mexico vs South Africa, status IN_PLAY, kickoff 2026-06-11T19:00:00Z, score 1-0"
          ],
          fixtures: [
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
              score: { home: 1, away: 0 },
              venue: { name: "Mexico City Stadium" },
              providerUpdatedAt: "2026-06-11T19:37:30Z"
            }
          ],
          sourceName: "football-data.org",
          sourceUrl: "https://api.football-data.org/v4/matches?dateFrom=2026-06-11&dateTo=2026-06-11"
        },
        {
          provider: "API-Football",
          status: "rate-limited",
          message: "API-Football skipped: Local 95 requests/day guard is active.",
          eventCount: 0,
          events: [],
          fixtures: []
        }
      ]
    });
    expect(context.dataSources).toContainEqual({
      sourceName: "football-data.org",
      sourceUrl: "https://api.football-data.org/v4/matches?dateFrom=2026-06-11&dateTo=2026-06-11",
      sourceTimestamp: "2026-06-11T19:15:00.000Z"
    });
  });

  it("keeps replay frame timestamps with the sampled images for vision analysis", () => {
    const context = buildAnalysisContext({
      question: "刚才那个人是谁？",
      markets: [],
      frames: ["data:image/jpeg;base64,frame-a", "data:image/jpeg;base64,frame-b"],
      replayFrameTimeline: [
        { index: 1, capturedAt: "2026-06-12T03:00:10.000Z" },
        { index: 2, capturedAt: "2026-06-12T03:00:22.000Z" }
      ]
    });

    expect(context.frames).toEqual(["data:image/jpeg;base64,frame-a", "data:image/jpeg;base64,frame-b"]);
    expect(context.replayFrameTimeline).toEqual([
      { index: 1, capturedAt: "2026-06-12T03:00:10.000Z" },
      { index: 2, capturedAt: "2026-06-12T03:00:22.000Z" }
    ]);
  });

  it("adds replay audio transcript as auxiliary model context", () => {
    const context = buildAnalysisContext({
      question: "刚才谁进了球？",
      markets: [],
      transcript: "Commentary says Mexico number 14 scored after a through ball."
    });

    expect(context.transcript).toBe("Commentary says Mexico number 14 scored after a through ball.");
  });
});
