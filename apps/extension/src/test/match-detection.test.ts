import { describe, expect, it } from "vitest";
import { worldCupMatches2026 } from "../data/worldcup-2026";
import type { WorldCupMatch } from "../shared/types";
import {
  detectCurrentMatch,
  explainMatchDetection,
  selectBestMatchDetection,
  summarizeMatchCandidates
} from "../domain/match-detection";

describe("detectCurrentMatch", () => {
  it("detects a match by live time window", () => {
    const results = detectCurrentMatch({
      nowUtc: "2026-06-11T19:30:00.000Z",
      matches: worldCupMatches2026
    });

    expect(results[0].match.id).toBe("2026-group-a-mexico-south-africa");
    expect(results[0].confidence).toBeGreaterThanOrEqual(45);
  });

  it("increases confidence when page text mentions both teams", () => {
    const results = detectCurrentMatch({
      nowUtc: "2026-06-11T18:30:00.000Z",
      pageContext: {
        title: "Mexico vs South Africa live stream",
        visibleText: "Mexico faces South Africa in Group A from Mexico City."
      },
      matches: worldCupMatches2026
    });

    expect(results[0].match.team1).toBe("Mexico");
    expect(results[0].confidence).toBeGreaterThanOrEqual(90);
    expect(results[0].evidence).toContain("Page mentions both teams.");
  });

  it("returns multiple candidates when text evidence is ambiguous", () => {
    const results = detectCurrentMatch({
      nowUtc: "2026-06-12T18:40:00.000Z",
      pageContext: {
        title: "Canada World Cup preview",
        visibleText: "Canada match coverage"
      },
      matches: worldCupMatches2026
    });

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].sourceFields).toContain("pageContext.visibleText");
  });

  it("explains confidence as match identification rather than win probability", () => {
    const [result] = detectCurrentMatch({
      nowUtc: "2026-05-26T08:00:00.000Z",
      pageContext: {
        title: "Mexico World Cup 2026 fixtures",
        visibleText: "Mexico vs South Africa Group A Mexico City"
      },
      matches: worldCupMatches2026
    });

    const explanation = explainMatchDetection(result);

    expect(result.confidence).toBeGreaterThanOrEqual(75);
    expect(explanation).toContain("match identification confidence");
    expect(explanation).toContain("not a win probability");
    expect(explanation).toContain("Page mentions both teams.");
  });

  it("does not promote one-team evidence into a confident detected match", () => {
    const results = detectCurrentMatch({
      nowUtc: "2026-05-26T08:00:00.000Z",
      pageContext: {
        title: "Mexico World Cup 2026 fixtures",
        visibleText: "Mexico fixtures and stadiums"
      },
      matches: worldCupMatches2026
    });

    expect(results[0].confidence).toBe(25);
    expect(selectBestMatchDetection(results)).toBeUndefined();
  });

  it("uses data package identification aliases and query hints when available", () => {
    const packageMatch: WorldCupMatch = {
      id: "wc-2026-001-mex-rsa",
      kickoffUtc: "2026-06-11T19:00:00.000Z",
      team1: "Mexico",
      team2: "South Africa",
      teamAliases: {
        Mexico: ["mexico"],
        "South Africa": ["south africa"]
      },
      group: "Group A",
      stage: "Group Stage",
      venue: "Estadio Azteca (Mexico City)",
      source: {
        sourceName: "openfootball/worldcup.json",
        sourceUrl: "https://github.com/openfootball/worldcup.json",
        sourceTimestamp: "2026-05-26T12:00:00.000Z"
      },
      identification: {
        defaultWeights: {
          teamAlias: 0.45,
          placeholderTeamAlias: 0.35,
          venueAlias: 0.2,
          timeWindow: 0.25,
          marketQuery: 0.1
        },
        queryHints: ["MEX RSA World Cup", "Mexico South Africa Group A"],
        teams: [
          {
            side: "home",
            teamId: "mex",
            name: "Mexico",
            aliases: ["El Tri"],
            identityConfidence: "high"
          },
          {
            side: "away",
            teamId: "rsa",
            name: "South Africa",
            aliases: ["Bafana Bafana"],
            identityConfidence: "high"
          }
        ],
        venueAliases: ["Mexico City Stadium"]
      }
    };

    const [result] = detectCurrentMatch({
      nowUtc: "2026-05-26T08:00:00.000Z",
      pageContext: {
        title: "MEX RSA World Cup preview",
        visibleText: "El Tri will face Bafana Bafana at Mexico City Stadium."
      },
      matches: [packageMatch]
    });

    expect(result.confidence).toBe(100);
    expect(result.sourceFields).toContain("identification.teams.aliases");
    expect(result.sourceFields).toContain("identification.venueAliases");
    expect(result.sourceFields).toContain("identification.queryHints");
    expect(result.reasons).toEqual(expect.arrayContaining(["team", "venue", "query"]));
    expect(result.evidence).toContain("Page matches data package query hints.");
  });

  it("matches data package aliases with word boundaries and diacritics", () => {
    const packageMatch: WorldCupMatch = {
      id: "wc-2026-001-mex-rsa",
      kickoffUtc: "2026-06-11T19:00:00.000Z",
      team1: "Mexico",
      team2: "South Africa",
      teamAliases: {
        Mexico: ["mexico"],
        "South Africa": ["south africa"]
      },
      group: "Group A",
      stage: "Group Stage",
      venue: "Estadio Azteca",
      source: {
        sourceName: "openfootball/worldcup.json",
        sourceUrl: "https://github.com/openfootball/worldcup.json",
        sourceTimestamp: "2026-05-26T12:00:00.000Z"
      },
      identification: {
        defaultWeights: {
          teamAlias: 0.45,
          placeholderTeamAlias: 0.35,
          venueAlias: 0.2,
          timeWindow: 0.25,
          marketQuery: 0.1
        },
        queryHints: ["México South Africa Group A"],
        teams: [
          {
            side: "home",
            teamId: "mex",
            name: "Mexico",
            aliases: ["MEX", "México"],
            identityConfidence: "high"
          },
          {
            side: "away",
            teamId: "rsa",
            name: "South Africa",
            aliases: ["RSA", "Bafana Bafana"],
            identityConfidence: "high"
          }
        ]
      }
    };

    const [miss] = detectCurrentMatch({
      nowUtc: "2026-05-26T08:00:00.000Z",
      pageContext: {
        title: "Causal analysis from Mexicali",
        visibleText: "No match page here."
      },
      matches: [packageMatch]
    });
    const [hit] = detectCurrentMatch({
      nowUtc: "2026-05-26T08:00:00.000Z",
      pageContext: {
        title: "México South Africa Group A",
        visibleText: "MEX vs RSA preview"
      },
      matches: [packageMatch]
    });

    expect(miss).toBeUndefined();
    expect(hit.confidence).toBeGreaterThanOrEqual(100);
    expect(hit.sourceFields).toContain("identification.teams.aliases");
    expect(hit.sourceFields).toContain("identification.queryHints");
  });

  it("does not let data package weights weaken live-window detection", () => {
    const packageMatch: WorldCupMatch = {
      id: "wc-2026-001-mex-rsa",
      kickoffUtc: "2026-06-11T19:00:00.000Z",
      team1: "Mexico",
      team2: "South Africa",
      teamAliases: {
        Mexico: ["mexico"],
        "South Africa": ["south africa"]
      },
      stage: "Group Stage",
      venue: "Mexico City",
      source: {
        sourceName: "openfootball/worldcup.json",
        sourceUrl: "https://github.com/openfootball/worldcup.json",
        sourceTimestamp: "2026-05-26T12:00:00.000Z"
      },
      identification: {
        defaultWeights: {
          teamAlias: 0.45,
          placeholderTeamAlias: 0.35,
          venueAlias: 0.2,
          timeWindow: 0.25,
          marketQuery: 0.1
        }
      }
    };

    const [result] = detectCurrentMatch({
      nowUtc: "2026-06-11T19:30:00.000Z",
      matches: [packageMatch]
    });

    expect(result.confidence).toBeGreaterThanOrEqual(45);
    expect(result.reasons).toContain("time");
    expect(selectBestMatchDetection([result])?.match.id).toBe("wc-2026-001-mex-rsa");
  });

  it("summarizes top candidates for agent and debug routing", () => {
    const results = detectCurrentMatch({
      nowUtc: "2026-06-12T18:40:00.000Z",
      pageContext: {
        title: "Canada World Cup preview",
        visibleText: "Canada match coverage"
      },
      matches: worldCupMatches2026
    });

    const report = summarizeMatchCandidates(results, 3);

    expect(report.length).toBeGreaterThan(0);
    expect(report[0]).toMatchObject({
      matchId: expect.any(String),
      label: expect.stringContaining("Canada"),
      confidence: expect.any(Number)
    });
    expect(report[0].reasons).toContain("team");
    expect(report[0].sourceFields.length).toBeGreaterThan(0);
  });
});
