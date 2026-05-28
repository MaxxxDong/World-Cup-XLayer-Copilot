import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { worldCupMatches2026 } from "../data/worldcup-2026";
import {
  buildDataPackageMatchContext,
  ensureDataPackageMatchBundle,
  ensureDataPackagePlayerContext,
  loadRuntimeWorldCupMatches
} from "../services/data-runtime";
import { MemoryDataPackageStore } from "../services/data-store";
import type { DataPackageManifest } from "../shared/types";

const manifest: DataPackageManifest = {
  schemaVersion: "1.0.0",
  dataVersion: "2026.05.26+runtime-test",
  generatedAt: "2026-05-26T12:00:00.000Z",
  gitCommit: "runtime-test",
  minExtensionVersion: "0.1.0",
  recommendedExtensionVersion: "0.1.0",
  license: "mixed-source-attributed",
  files: [
    {
      path: "data/history/head-to-head/mex__rsa.json",
      category: "history",
      downloadTier: "match-context",
      required: false,
      sizeBytes: 717,
      sha256: "674f49e3f241ce4e9b46f3b3c8551a347761726b58a2be9772e8269b6a979564",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/history/form/mex.json",
      category: "history",
      downloadTier: "match-context",
      required: false,
      sizeBytes: 179,
      sha256: "0cefca3536bef16212f865b4ddf18608b9686ecac0557bcf10e81d7db959ac61",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/history/form/rsa.json",
      category: "history",
      downloadTier: "match-context",
      required: false,
      sizeBytes: 179,
      sha256: "5fa0dd3c7405c07d2e32ae216add66bc245455d01bdb5bf94581692a9e2d30bb",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/history/goalscorers/index.json",
      category: "history.goalscorers.index",
      downloadTier: "player-context",
      required: false,
      sizeBytes: 187,
      sha256: "439dd687f3ee0fc334d10b24f97d911e22d804c558f0263a5528fb5924bf0989",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/history/goalscorers/by-team/mex.json",
      category: "history.goalscorers.byTeam",
      downloadTier: "player-context",
      required: false,
      sizeBytes: 355,
      sha256: "9a1849636dc92179629a5a55ab5c3177c2b986d9e695676552f1891ee96786aa",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/history/goalscorers/by-team/rsa.json",
      category: "history.goalscorers.byTeam",
      downloadTier: "player-context",
      required: false,
      sizeBytes: 340,
      sha256: "401750eba9e23661ecb01d8e99a7d7af1c80bdde7e4558ff174ce922f20ece69",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/history/goalscorers/by-player/hirving-lozano.json",
      category: "history.goalscorers.byPlayer",
      downloadTier: "player-context",
      required: false,
      sizeBytes: 497,
      sha256: "172e9222e6e44758d173a86ef1b3a3878336957bdafac07d2afca15218ca947d",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/players/players-index.json",
      category: "players.index",
      downloadTier: "player-context",
      required: false,
      sizeBytes: 129,
      sha256: "d666715076dba49a27ca2d2586b12520eec2fb9daf1e31280caeebc4d79516e8",
      updatedAt: "2026-05-26T12:00:00.000Z"
    },
    {
      path: "data/players/identities/hirving-lozano.json",
      category: "players.identities",
      downloadTier: "player-context",
      required: false,
      sizeBytes: 375,
      sha256: "5f2d32330cbd43af617a46284a7681cb577b4a616e376fe1880b07f2c835bdae",
      updatedAt: "2026-05-26T12:00:00.000Z"
    }
  ]
};

describe("loadRuntimeWorldCupMatches", () => {
  it("falls back to bundled seed when no active data package exists", async () => {
    const matches = await loadRuntimeWorldCupMatches(new MemoryDataPackageStore());

    expect(matches).toEqual(worldCupMatches2026);
  });

  it("loads schedule, team names, aliases, and source metadata from active data package", async () => {
    const store = new MemoryDataPackageStore();
    await seedRuntimePackage(store);

    const matches = await loadRuntimeWorldCupMatches(store);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      id: "wc-2026-001-mex-rsa",
      team1: "Mexico",
      team2: "South Africa",
      localDate: "2026-06-11",
      localTime: "13:00",
      timezone: "UTC-6",
      venue: "Estadio Azteca (Mexico City)",
      source: {
        sourceName: "openfootball/worldcup.json",
        sourceUrl: "https://github.com/openfootball/worldcup.json",
        sourceTimestamp: "2026-05-26T12:00:00.000Z"
      }
    });
    expect(matches[0].teamAliases.Mexico).toContain("el tri");
    expect(matches[0].teamAliases["South Africa"]).toContain("bafana bafana");
    expect(matches[0].marketSearchQueries).toContain("Mexico South Africa 2026 World Cup");
    expect(matches[0].marketSearchQueries).toContain("2026 World Cup winner");
    expect(matches[0].identification?.defaultWeights?.teamAlias).toBe(0.45);
    expect(matches[0].identification?.teams?.[0].aliases).toContain("El Tri");
    expect(matches[0].identification?.venueAliases).toContain("Mexico City Stadium");
    expect(matches[0].identification?.queryHints).toContain("Mexico South Africa Group A");
  });
});

describe("buildDataPackageMatchContext", () => {
  it("loads head-to-head and form summaries for AI context", async () => {
    const store = new MemoryDataPackageStore();
    await seedRuntimePackage(store);
    const [match] = await loadRuntimeWorldCupMatches(store);

    const context = await buildDataPackageMatchContext(store, match);

    expect(context.dataVersion).toBe("2026.05.26+runtime-test");
    expect(context.downloadedFiles).toBe(0);
    expect(context.sources.map((source) => source.sourceName)).toContain("martj42/international_results");
    expect(context.recentEvents).toContain("Head-to-head: 3 matches, Mexico 1 wins, South Africa 1 wins, 1 draws.");
    expect(context.recentEvents).toContain("World Cup head-to-head: 1 matches, Mexico 1 wins, South Africa 0 wins, 0 draws.");
    expect(context.recentEvents).toContain("Competitive head-to-head: 2 matches, Mexico 1 wins, South Africa 0 wins, 1 draws.");
    expect(context.recentEvents).toContain("Mexico historical profile: 1000 matches, 511W-231D-258L.");
    expect(context.recentEvents).toContain("Mexico recent form: last5 1W-1D-1L, goals 4-4.");
    expect(context.rosterNotes).toContain("External data version 2026.05.26+runtime-test is active.");
    expect(context.rosterNotes).toContain("Mexico roster layer: simulated list, 2 players loaded; sample Hirving Lozano (#22, Forward, San Diego FC), Edson Álvarez (#4, Midfielder, West Ham).");
    expect(context.rosterNotes).toContain(
      "Mexico current key-player candidates: available-simulated/simulated; Hirving Lozano (18 historical goals)."
    );
    expect(context.rosterNotes).toContain(
      "Mexico key-player profile: Hirving Lozano, available-simulated/simulated, shirt #22, position Forward, club San Diego FC, 18 historical national-team goals."
    );
    expect(context.rosterNotes).toContain("Mexico scorer context: top historical scorers Hirving Lozano (2 goals).");
  });

  it("resolves data package team IDs for bundled seed matches before building AI context", async () => {
    const store = new MemoryDataPackageStore();
    await seedRuntimePackage(store);
    const [bundledMatch] = worldCupMatches2026;

    const context = await buildDataPackageMatchContext(store, bundledMatch);

    expect(bundledMatch.dataPackageTeamIds).toBeUndefined();
    expect(context.recentEvents).toContain("Head-to-head: 3 matches, Mexico 1 wins, South Africa 1 wins, 1 draws.");
    expect(context.rosterNotes).toContain("Mexico roster layer: simulated list, 2 players loaded; sample Hirving Lozano (#22, Forward, San Diego FC), Edson Álvarez (#4, Midfielder, West Ham).");
    expect(context.rosterNotes).toContain(
      "South Africa current key-player candidates: available-simulated/simulated; Percy Tau (12 historical goals)."
    );
    expect(context.rosterNotes).toContain(
      "South Africa key-player profile: Percy Tau, available-simulated/simulated, shirt #10, position Forward, club Qatar SC, 12 historical national-team goals."
    );
  });

  it("pulls missing match-context files from the active manifest before building context", async () => {
    const store = new MemoryDataPackageStore();
    await seedRuntimePackage(store, { skipMatchContext: true });
    const [match] = await loadRuntimeWorldCupMatches(store);
    const fetchMock = async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("data/history/head-to-head/mex__rsa.json")) {
        return new Response(JSON.stringify(headToHeadFixture), { status: 200 });
      }
      if (url.endsWith("data/history/form/mex.json")) {
        return new Response(JSON.stringify(formFixture("mex")), { status: 200 });
      }
      if (url.endsWith("data/history/form/rsa.json")) {
        return new Response(JSON.stringify(formFixture("rsa")), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const context = await buildDataPackageMatchContext(store, match, fetchMock);

    expect(context.downloadedFiles).toBeGreaterThan(0);
    expect(context.recentEvents).toContain("Head-to-head: 3 matches, Mexico 1 wins, South Africa 1 wins, 1 draws.");
    expect(context.recentEvents).toContain("Mexico recent form: last5 1W-1D-1L, goals 4-4.");
  });

  it("pulls missing player-context files by team and player keys from the active manifest", async () => {
    const store = new MemoryDataPackageStore();
    await seedRuntimePackage(store, { skipPlayerContext: true });
    const fetchMock = async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("data/history/goalscorers/index.json")) {
        return new Response(JSON.stringify(goalscorersIndexFixture), { status: 200 });
      }
      if (url.endsWith("data/history/goalscorers/by-team/mex.json")) {
        return new Response(JSON.stringify(teamGoalsFixture("mex", "Hirving Lozano")), { status: 200 });
      }
      if (url.endsWith("data/history/goalscorers/by-player/hirving-lozano.json")) {
        return new Response(JSON.stringify(playerGoalsFixture), { status: 200 });
      }
      if (url.endsWith("data/players/players-index.json")) {
        return new Response(JSON.stringify(playerIdentityIndexFixture), { status: 200 });
      }
      if (url.endsWith("data/players/identities/hirving-lozano.json")) {
        return new Response(JSON.stringify(playerIdentityFixture), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    };

    const result = await ensureDataPackagePlayerContext({
      store,
      teamIds: ["mex"],
      playerKeys: ["hirving-lozano"],
      fetchFn: fetchMock
    });

    expect(result.downloadedFiles).toBe(5);
    await expect(store.readFile(manifest.dataVersion, "data/history/goalscorers/by-team/mex.json")).resolves.toContain(
      "Hirving Lozano"
    );
    await expect(
      store.readFile(manifest.dataVersion, "data/history/goalscorers/by-player/hirving-lozano.json")
    ).resolves.toContain("Hirving Lozano");
    await expect(
      store.readFile(manifest.dataVersion, "data/players/identities/hirving-lozano.json")
    ).resolves.toContain("reep_p_lozano");
  });

  it("pulls exact match and tournament context without downloading the whole player tier", async () => {
    const store = new MemoryDataPackageStore();
    await seedRuntimePackage(store, { skipMatchContext: true, skipPlayerContext: true, skipTournamentContext: true });
    await store.writeManifest(manifest.dataVersion, {
      ...manifest,
      files: [...manifest.files, ...matchBundleManifestFiles()]
    });
    const [match] = await loadRuntimeWorldCupMatches(store);
    const fetchMock = async (input: RequestInfo | URL) => {
      const url = input.toString();
      if (url.endsWith("data/history/head-to-head/mex__rsa.json")) {
        return new Response(JSON.stringify(headToHeadFixture), { status: 200 });
      }
      if (url.endsWith("data/history/form/mex.json")) return new Response(JSON.stringify(formFixture("mex")), { status: 200 });
      if (url.endsWith("data/history/form/rsa.json")) return new Response(JSON.stringify(formFixture("rsa")), { status: 200 });
      if (url.endsWith("data/profiles/teams/mex.json")) return new Response(JSON.stringify(teamProfileFixture("mex")), { status: 200 });
      if (url.endsWith("data/profiles/teams/rsa.json")) return new Response(JSON.stringify(teamProfileFixture("rsa")), { status: 200 });
      if (url.endsWith("data/rosters/worldcup-2026/index.json")) return new Response(JSON.stringify(rosterIndexFixture), { status: 200 });
      if (url.endsWith("data/rosters/worldcup-2026/mex.json")) return new Response(JSON.stringify(rosterFixture("mex")), { status: 200 });
      if (url.endsWith("data/rosters/worldcup-2026/rsa.json")) return new Response(JSON.stringify(rosterFixture("rsa")), { status: 200 });
      if (url.endsWith("data/profiles/key-players/current/index.json")) return new Response(JSON.stringify(currentPlayersGlobalIndexFixture), { status: 200 });
      if (url.endsWith("data/profiles/key-players/current/mex/index.json")) return new Response(JSON.stringify(currentPlayersIndexFixture("mex")), { status: 200 });
      if (url.endsWith("data/profiles/key-players/current/rsa/index.json")) return new Response(JSON.stringify(currentPlayersIndexFixture("rsa")), { status: 200 });
      if (url.endsWith("data/profiles/key-players/current/mex/hirving-lozano.json")) return new Response(JSON.stringify(currentPlayerFixture("mex", "Hirving Lozano")), { status: 200 });
      if (url.endsWith("data/profiles/key-players/current/rsa/percy-tau.json")) return new Response(JSON.stringify(currentPlayerFixture("rsa", "Percy Tau")), { status: 200 });
      return new Response("not found", { status: 404 });
    };

    const result = await ensureDataPackageMatchBundle({
      store,
      match,
      includeHistoricalScorers: false,
      fetchFn: fetchMock
    });

    expect(result.downloadedFiles).toBe(13);
    await expect(store.readFile(manifest.dataVersion, "data/rosters/worldcup-2026/mex.json")).resolves.toContain(
      "Hirving Lozano"
    );
    await expect(
      store.readFile(manifest.dataVersion, "data/profiles/key-players/current/mex/hirving-lozano.json")
    ).resolves.toContain("available-simulated");
    await expect(store.readFile(manifest.dataVersion, "data/history/goalscorers/by-team/mex.json")).resolves.toBeUndefined();
  });
});

const headToHeadFixture = {
  allTime: {
    draws: 1,
    matches: 3,
    teamAGoals: 4,
    teamAWins: 1,
    teamBGoals: 4,
    teamBWins: 1
  },
  splits: {
    worldCup: {
      draws: 0,
      matches: 1,
      teamAGoals: 2,
      teamAWins: 1,
      teamBGoals: 0,
      teamBWins: 0
    },
    competitive: {
      draws: 1,
      matches: 2,
      teamAGoals: 3,
      teamAWins: 1,
      teamBGoals: 1,
      teamBWins: 0
    },
    friendly: {
      draws: 0,
      matches: 1,
      teamAGoals: 1,
      teamAWins: 0,
      teamBGoals: 3,
      teamBWins: 1
    },
    neutralVenue: {
      draws: 1,
      matches: 2,
      teamAGoals: 3,
      teamAWins: 1,
      teamBGoals: 1,
      teamBWins: 0
    },
    nonNeutralVenue: {
      draws: 0,
      matches: 1,
      teamAGoals: 1,
      teamAWins: 0,
      teamBGoals: 3,
      teamBWins: 1
    }
  },
  pairKey: "mex__rsa",
  sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }],
  teamAId: "mex",
  teamBId: "rsa"
};

function formFixture(teamId: string) {
  return {
    teamId,
    windows: { last5: { wins: 1, draws: 1, losses: 1, goalsFor: 4, goalsAgainst: 4 } },
    sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }]
  };
}

const goalscorersIndexFixture = {
  firstGoalDate: "2020-01-01",
  goalCount: 4,
  lastGoalDate: "2025-01-01",
  playerCount: 3,
  teamCount: 2,
  sourceRefs: [{ sourceId: "martj42-international-results", path: "goalscorers.csv" }]
};

function teamGoalsFixture(teamId: string, scorer: string) {
  return {
    teamId,
    goalCount: 2,
    topScorers: [{ playerKey: scorer.toLowerCase().replaceAll(" ", "-"), scorer, goals: 2 }],
    recentGoals: [
      {
        date: "2025-01-01",
        goalId: `goal-${teamId}-1`,
        matchKey: `2025-01-01-${teamId}`,
        minute: 23,
        ownGoal: false,
        penalty: false,
        scorer
      }
    ],
    sourceRefs: [{ sourceId: "martj42-international-results", path: "goalscorers.csv" }]
  };
}

const playerGoalsFixture = {
  playerKey: "hirving-lozano",
  scorer: "Hirving Lozano",
  normalizedScorer: "hirving lozano",
  goalCount: 2,
  teams: ["mex"],
  goals: [
    {
      goalId: "goal-mex-1",
      matchKey: "2025-01-01-mex",
      date: "2025-01-01",
      homeTeamId: "mex",
      awayTeamId: "rsa",
      teamId: "mex",
      scorer: "Hirving Lozano",
      minute: 23,
      ownGoal: false,
      penalty: false,
      sourceRefs: [{ sourceId: "martj42-international-results", path: "goalscorers.csv" }]
    }
  ],
  sourceRefs: [{ sourceId: "martj42-international-results", path: "goalscorers.csv" }]
};

const playerIdentityIndexFixture = {
  generatedAt: "2026-05-26T12:00:00.000Z",
  playerCount: 1,
  sourceRefs: [{ sourceId: "withqwerty-reep", path: "data/people.csv" }]
};

const playerIdentityFixture = {
  playerKey: "hirving-lozano",
  reepId: "reep_p_lozano",
  name: "Hirving Lozano",
  fullName: "Hirving Rodrigo Lozano Bahena",
  dateOfBirth: "1995-07-30",
  nationality: "Mexico",
  position: "left winger",
  providerIds: { wikidata: "Q2047110", transfermarkt: "316889", fbref: "examplefbref", api_football: "154" },
  sourceRefs: [{ sourceId: "withqwerty-reep", path: "data/people.csv" }]
};

function teamProfileFixture(teamId: string) {
  return {
    teamId,
    allTime: { matches: teamId === "mex" ? 1000 : 500, wins: teamId === "mex" ? 511 : 190, draws: teamId === "mex" ? 231 : 120, losses: teamId === "mex" ? 258 : 190 },
    form: { last5: { wins: 3, draws: 2, losses: 0, goalsFor: 7, goalsAgainst: 1 } },
    sourceRefs: [{ sourceId: "martj42-international-results", path: "results.csv" }]
  };
}

const rosterIndexFixture = {
  generatedAt: "2026-05-26T12:00:00.000Z",
  teamCount: 2,
  teams: [
    { teamId: "mex", teamName: "Mexico", rosterStatus: "simulated", playerCount: 2 },
    { teamId: "rsa", teamName: "South Africa", rosterStatus: "simulated", playerCount: 2 }
  ]
};

function rosterFixture(teamId: string) {
  const isMexico = teamId === "mex";
  return {
    teamId,
    teamName: isMexico ? "Mexico" : "South Africa",
    rosterStatus: "simulated",
    players: isMexico
      ? [
          { name: "Hirving Lozano", playerKey: "hirving-lozano", shirtNumber: 22, position: "Forward", club: "San Diego FC" },
          { name: "Edson Álvarez", playerKey: "edson-alvarez", shirtNumber: 4, position: "Midfielder", club: "West Ham" }
        ]
      : [
          { name: "Percy Tau", playerKey: "percy-tau", shirtNumber: 10, position: "Forward", club: "Qatar SC" },
          { name: "Ronwen Williams", playerKey: "ronwen-williams", shirtNumber: 1, position: "Goalkeeper", club: "Mamelodi Sundowns" }
        ],
    sourceRefs: [{ sourceId: "world-cup-copilot-simulated-squads", path: "generated:simulated-squads" }]
  };
}

const currentPlayersGlobalIndexFixture = {
  generatedAt: "2026-05-26T12:00:00.000Z",
  teamCount: 2,
  teams: [
    { teamId: "mex", teamName: "Mexico", profileCount: 1, rosterStatus: "simulated" },
    { teamId: "rsa", teamName: "South Africa", profileCount: 1, rosterStatus: "simulated" }
  ]
};

function currentPlayersIndexFixture(teamId: string) {
  const isMexico = teamId === "mex";
  return {
    teamId,
    teamName: isMexico ? "Mexico" : "South Africa",
    profileStatus: "available-simulated",
    rosterStatus: "simulated",
    profiles: [
      {
        name: isMexico ? "Hirving Lozano" : "Percy Tau",
        playerKey: isMexico ? "hirving-lozano" : "percy-tau",
        historicalGoalCount: isMexico ? 18 : 12,
        profilePath: isMexico
          ? "data/profiles/key-players/current/mex/hirving-lozano.json"
          : "data/profiles/key-players/current/rsa/percy-tau.json"
      }
    ],
    sourceRefs: [{ sourceId: "world-cup-copilot-simulated-squads", path: "generated:simulated-squads" }]
  };
}

function currentPlayerFixture(teamId: string, name: string) {
  return {
    teamId,
    name,
    playerKey: name.toLowerCase().replaceAll(" ", "-"),
    profileStatus: "available-simulated",
    rosterStatus: "simulated",
    shirtNumber: teamId === "mex" ? 22 : 10,
    position: teamId === "mex" ? "Forward" : "Forward",
    club: teamId === "mex" ? "San Diego FC" : "Qatar SC",
    historicalNationalTeamGoals: teamId === "mex" ? 18 : 12,
    sourceRefs: [{ sourceId: "world-cup-copilot-simulated-squads", path: "generated:simulated-squads" }]
  };
}

function matchBundleManifestFiles() {
  const files = new Map<string, { content: string; category: string; downloadTier: "match-context" | "tournament-context" }>();
  for (const teamId of ["mex", "rsa"]) {
    files.set(`data/profiles/teams/${teamId}.json`, {
      content: JSON.stringify(teamProfileFixture(teamId)),
      category: "profiles.teams",
      downloadTier: "match-context"
    });
    files.set(`data/rosters/worldcup-2026/${teamId}.json`, {
      content: JSON.stringify(rosterFixture(teamId)),
      category: "rosters.worldcup2026",
      downloadTier: "tournament-context"
    });
    files.set(`data/profiles/key-players/current/${teamId}/index.json`, {
      content: JSON.stringify(currentPlayersIndexFixture(teamId)),
      category: "profiles.keyPlayersCurrent.index",
      downloadTier: "tournament-context"
    });
  }
  files.set("data/rosters/worldcup-2026/index.json", {
    content: JSON.stringify(rosterIndexFixture),
    category: "rosters.worldcup2026.index",
    downloadTier: "tournament-context"
  });
  files.set("data/profiles/key-players/current/index.json", {
    content: JSON.stringify(currentPlayersGlobalIndexFixture),
    category: "profiles.keyPlayersCurrent.index",
    downloadTier: "tournament-context"
  });
  files.set("data/profiles/key-players/current/mex/hirving-lozano.json", {
    content: JSON.stringify(currentPlayerFixture("mex", "Hirving Lozano")),
    category: "profiles.keyPlayersCurrent",
    downloadTier: "tournament-context"
  });
  files.set("data/profiles/key-players/current/rsa/percy-tau.json", {
    content: JSON.stringify(currentPlayerFixture("rsa", "Percy Tau")),
    category: "profiles.keyPlayersCurrent",
    downloadTier: "tournament-context"
  });

  return [...files.entries()].map(([path, file]) => ({
    path,
    category: file.category,
    downloadTier: file.downloadTier,
    required: false,
    sizeBytes: new TextEncoder().encode(file.content).byteLength,
    sha256: createHash("sha256").update(file.content).digest("hex"),
    updatedAt: "2026-05-26T12:00:00.000Z"
  }));
}

async function seedRuntimePackage(
  store: MemoryDataPackageStore,
  options: { skipMatchContext?: boolean; skipPlayerContext?: boolean; skipTournamentContext?: boolean } = {}
): Promise<void> {
  await store.writeManifest(manifest.dataVersion, manifest);
  await store.writeFile(
    manifest.dataVersion,
    "data/sources/sources.json",
    JSON.stringify([
      {
        sourceId: "openfootball-worldcup-json",
        name: "openfootball/worldcup.json",
        url: "https://github.com/openfootball/worldcup.json",
        retrievedAt: "2026-05-26T12:00:00.000Z"
      },
      {
        sourceId: "martj42-international-results",
        name: "martj42/international_results",
        url: "https://github.com/martj42/international_results",
        retrievedAt: "2026-05-26T12:00:00.000Z"
      }
    ])
  );
  await store.writeFile(
    manifest.dataVersion,
    "data/taxonomy/teams.json",
    JSON.stringify([
      { teamId: "mex", name: "Mexico", fifaCode: "MEX", aliases: ["Mexico", "MEX", "El Tri"] },
      { teamId: "rsa", name: "South Africa", fifaCode: "RSA", aliases: ["South Africa", "RSA", "Bafana Bafana"] }
    ])
  );
  await store.writeFile(
    manifest.dataVersion,
    "data/taxonomy/team-aliases.json",
    JSON.stringify([
      { teamId: "mex", alias: "El Tri", normalizedAlias: "el tri" },
      { teamId: "rsa", alias: "Bafana Bafana", normalizedAlias: "bafana bafana" }
    ])
  );
  await store.writeFile(
    manifest.dataVersion,
    "data/taxonomy/venues.json",
    JSON.stringify([
      {
        venueId: "estadio-azteca",
        displayName: "Estadio Azteca",
        city: "Mexico City",
        country: "Mexico",
        aliases: ["Mexico City Stadium", "Estadio Azteca"]
      }
    ])
  );
  await store.writeFile(
    manifest.dataVersion,
    "data/schedule/worldcup-2026.json",
    JSON.stringify({
      matches: [
        {
          matchId: "wc-2026-001-mex-rsa",
          kickoffUtc: "2026-06-11T19:00:00.000Z",
          localDate: "2026-06-11",
          localTime: "13:00",
          timezone: "UTC-6",
          homeTeamId: "mex",
          awayTeamId: "rsa",
          stage: "Group Stage",
          group: "Group A",
          venueId: "estadio-azteca",
          city: "Mexico City",
          sourceRefs: [{ sourceId: "openfootball-worldcup-json", path: "worldcup.json" }]
        }
      ]
    })
  );
  await store.writeFile(
    manifest.dataVersion,
    "data/market-mapping/polymarket-query-seeds.json",
    JSON.stringify({
      generatedAt: "2026-05-26T12:00:00.000Z",
      provider: "polymarket",
      tournamentQueries: ["2026 World Cup winner"],
      matchQueries: {
        "wc-2026-001-mex-rsa": ["Mexico South Africa 2026 World Cup", "Mexico vs South Africa"]
      },
      teamQueries: {
        mex: ["Mexico to win World Cup"],
        rsa: ["South Africa World Cup"]
      }
    })
  );
  await store.writeFile(
    manifest.dataVersion,
    "data/identification/matches.json",
    JSON.stringify({
      generatedAt: "2026-05-26T12:00:00.000Z",
      defaultWeights: {
        teamAlias: 0.45,
        placeholderTeamAlias: 0.35,
        venueAlias: 0.2,
        timeWindow: 0.25,
        marketQuery: 0.1
      },
      matches: [
        {
          matchId: "wc-2026-001-mex-rsa",
          queryHints: ["Mexico South Africa Group A", "MEX RSA World Cup"],
          hasPlaceholderTeam: false,
          teams: [
            {
              side: "home",
              teamId: "mex",
              name: "Mexico",
              fifaCode: "MEX",
              aliases: ["Mexico", "MEX", "El Tri"],
              identityConfidence: "high",
              isPlaceholder: false
            },
            {
              side: "away",
              teamId: "rsa",
              name: "South Africa",
              fifaCode: "RSA",
              aliases: ["South Africa", "RSA", "Bafana Bafana"],
              identityConfidence: "high",
              isPlaceholder: false
            }
          ],
          venue: {
            aliases: ["estadio-azteca", "Mexico City Stadium", "Estadio Azteca"]
          }
        }
      ]
    })
  );
  if (!options.skipMatchContext) {
    await store.writeFile(manifest.dataVersion, "data/history/head-to-head/mex__rsa.json", JSON.stringify(headToHeadFixture));
    await store.writeFile(manifest.dataVersion, "data/history/form/mex.json", JSON.stringify(formFixture("mex")));
    await store.writeFile(manifest.dataVersion, "data/history/form/rsa.json", JSON.stringify(formFixture("rsa")));
    await store.writeFile(manifest.dataVersion, "data/profiles/teams/mex.json", JSON.stringify(teamProfileFixture("mex")));
    await store.writeFile(manifest.dataVersion, "data/profiles/teams/rsa.json", JSON.stringify(teamProfileFixture("rsa")));
  }
  if (!options.skipTournamentContext) {
    await store.writeFile(manifest.dataVersion, "data/rosters/worldcup-2026/index.json", JSON.stringify(rosterIndexFixture));
    await store.writeFile(manifest.dataVersion, "data/rosters/worldcup-2026/mex.json", JSON.stringify(rosterFixture("mex")));
    await store.writeFile(manifest.dataVersion, "data/rosters/worldcup-2026/rsa.json", JSON.stringify(rosterFixture("rsa")));
    await store.writeFile(
      manifest.dataVersion,
      "data/profiles/key-players/current/index.json",
      JSON.stringify(currentPlayersGlobalIndexFixture)
    );
    await store.writeFile(
      manifest.dataVersion,
      "data/profiles/key-players/current/mex/index.json",
      JSON.stringify(currentPlayersIndexFixture("mex"))
    );
    await store.writeFile(
      manifest.dataVersion,
      "data/profiles/key-players/current/rsa/index.json",
      JSON.stringify(currentPlayersIndexFixture("rsa"))
    );
    await store.writeFile(
      manifest.dataVersion,
      "data/profiles/key-players/current/mex/hirving-lozano.json",
      JSON.stringify(currentPlayerFixture("mex", "Hirving Lozano"))
    );
    await store.writeFile(
      manifest.dataVersion,
      "data/profiles/key-players/current/rsa/percy-tau.json",
      JSON.stringify(currentPlayerFixture("rsa", "Percy Tau"))
    );
  }
  if (!options.skipPlayerContext) {
    await store.writeFile(manifest.dataVersion, "data/history/goalscorers/index.json", JSON.stringify(goalscorersIndexFixture));
    await store.writeFile(manifest.dataVersion, "data/players/players-index.json", JSON.stringify(playerIdentityIndexFixture));
    await store.writeFile(
      manifest.dataVersion,
      "data/history/goalscorers/by-team/mex.json",
      JSON.stringify(teamGoalsFixture("mex", "Hirving Lozano"))
    );
    await store.writeFile(
      manifest.dataVersion,
      "data/history/goalscorers/by-team/rsa.json",
      JSON.stringify(teamGoalsFixture("rsa", "Percy Tau"))
    );
    await store.writeFile(
      manifest.dataVersion,
      "data/players/identities/hirving-lozano.json",
      JSON.stringify(playerIdentityFixture)
    );
  }
  await store.activateVersion(manifest.dataVersion, "https://example.test/manifest.json");
}
