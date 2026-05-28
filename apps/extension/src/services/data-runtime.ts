import { worldCupMatches2026 } from "../data/worldcup-2026";
import { ensureDataPackageFiles } from "./data-package";
import type { PullDataPackageResult } from "./data-package";
import type { DataPackageStore } from "./data-store";
import { IndexedDbDataPackageStore } from "./data-store";
import type { SourceMetadata, WorldCupMatch } from "../shared/types";

interface PackageSource {
  sourceId: string;
  name: string;
  url: string;
  retrievedAt?: string;
}

interface PackageTeam {
  teamId: string;
  name: string;
  fifaCode?: string;
  aliases?: string[];
  isPlaceholder?: boolean;
}

interface PackageAlias {
  teamId: string;
  alias: string;
}

interface PackageVenue {
  venueId: string;
  displayName: string;
  city?: string;
}

interface PackageSchedule {
  matches: PackageScheduleMatch[];
}

interface PackageScheduleMatch {
  matchId: string;
  kickoffUtc: string;
  localDate?: string;
  localTime?: string;
  timezone?: string;
  homeTeamId: string;
  awayTeamId: string;
  stage: string;
  group?: string;
  venueId: string;
  city?: string;
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
}

interface PackageHeadToHead {
  allTime: {
    draws: number;
    matches: number;
    teamAWins: number;
    teamBWins: number;
  };
  splits?: Record<
    "worldCup" | "competitive" | "friendly" | "neutralVenue" | "nonNeutralVenue",
    {
      draws: number;
      matches: number;
      teamAWins: number;
      teamBWins: number;
    }
  >;
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
  teamAId: string;
  teamBId: string;
}

interface PackageForm {
  teamId: string;
  windows?: {
    last5?: {
      draws: number;
      goalsAgainst: number;
      goalsFor: number;
      losses: number;
      wins: number;
    };
  };
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
}

interface PackageTeamGoalscorers {
  teamId: string;
  topScorers?: Array<{
    scorer: string;
    goals: number;
    playerKey?: string;
  }>;
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
}

interface PackageTeamProfile {
  allTime?: {
    draws: number;
    losses: number;
    matches: number;
    wins: number;
  };
  form?: {
    last5?: {
      draws: number;
      goalsAgainst: number;
      goalsFor: number;
      losses: number;
      wins: number;
    };
  };
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
  teamId: string;
}

interface PackageRoster {
  players?: Array<{
    club?: string;
    name: string;
    playerKey: string;
    position?: string;
    shirtNumber?: number;
  }>;
  rosterStatus: "final" | "provisional" | "simulated" | string;
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
  teamId: string;
  teamName: string;
}

interface PackageCurrentKeyPlayerIndex {
  profiles?: Array<{
    historicalGoalCount?: number;
    name: string;
    playerKey: string;
    profilePath: string;
  }>;
  profileStatus: string;
  rosterStatus: string;
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
  teamId: string;
  teamName: string;
}

interface PackageCurrentKeyPlayerProfile {
  club?: string;
  historicalNationalTeamGoals?: number;
  identity?: {
    dateOfBirth?: string;
    position?: string;
  };
  name: string;
  playerKey: string;
  position?: string;
  profileStatus: string;
  recentHistoricalGoals?: Array<unknown>;
  roster?: {
    rosterStatus?: string;
  };
  rosterStatus?: string;
  shirtNumber?: number;
  sourceRefs?: Array<{ sourceId: string; path?: string }>;
  teamId: string;
}

interface PackageMarketMapping {
  matchQueries?: Record<string, string[]>;
  provider?: string;
  teamQueries?: Record<string, string[]>;
  tournamentQueries?: string[];
}

interface PackageIdentificationIndex {
  defaultWeights?: {
    teamAlias: number;
    placeholderTeamAlias: number;
    venueAlias: number;
    timeWindow: number;
    marketQuery: number;
  };
  matches?: PackageIdentificationMatch[];
}

interface PackageIdentificationMatch {
  matchId: string;
  hasPlaceholderTeam?: boolean;
  queryHints?: string[];
  teams?: Array<{
    side: "home" | "away";
    teamId: string;
    name: string;
    aliases?: string[];
    fifaCode?: string;
    identityConfidence?: string;
    isPlaceholder?: boolean;
  }>;
  venue?: {
    aliases?: string[];
  };
}

export interface DataPackageMatchContext {
  dataVersion?: string;
  downloadedBytes: number;
  downloadedFiles: number;
  sources: SourceMetadata[];
  recentEvents: string[];
  rosterNotes: string[];
}

export interface EnsureDataPackagePlayerContextOptions {
  store: DataPackageStore;
  teamIds?: string[];
  playerKeys?: string[];
  fetchFn?: typeof fetch;
}

export interface EnsureDataPackageMatchBundleOptions {
  store: DataPackageStore;
  match: WorldCupMatch;
  includeHistoricalScorers?: boolean;
  fetchFn?: typeof fetch;
}

export async function loadRuntimeWorldCupMatches(
  store: DataPackageStore = new IndexedDbDataPackageStore()
): Promise<WorldCupMatch[]> {
  const state = await store.readVersionState();
  if (!state.activeDataVersion) return worldCupMatches2026;

  try {
    const [sources, teams, aliases, schedule] = await Promise.all([
      readJson<PackageSource[]>(store, state.activeDataVersion, "data/sources/sources.json"),
      readJson<PackageTeam[]>(store, state.activeDataVersion, "data/taxonomy/teams.json"),
      readJson<PackageAlias[]>(store, state.activeDataVersion, "data/taxonomy/team-aliases.json"),
      readJson<PackageSchedule>(store, state.activeDataVersion, "data/schedule/worldcup-2026.json")
    ]);
    const [venues, marketMapping, identification] = await Promise.all([
      readOptionalJson<PackageVenue[]>(store, state.activeDataVersion, "data/taxonomy/venues.json"),
      readOptionalJson<PackageMarketMapping>(
        store,
        state.activeDataVersion,
        "data/market-mapping/polymarket-query-seeds.json"
      ),
      readOptionalJson<PackageIdentificationIndex>(
        store,
        state.activeDataVersion,
        "data/identification/matches.json"
      )
    ]);
    return toWorldCupMatches(schedule, teams, aliases, sources, venues ?? [], marketMapping, identification);
  } catch {
    return worldCupMatches2026;
  }
}

export async function buildDataPackageMatchContext(
  store: DataPackageStore,
  match: WorldCupMatch,
  fetchFn?: typeof fetch
): Promise<DataPackageMatchContext> {
  const state = await store.readVersionState();
  if (!state.activeDataVersion) return { sources: [], recentEvents: [], rosterNotes: [], downloadedBytes: 0, downloadedFiles: 0 };

  const teamIds = match.dataPackageTeamIds ?? (await resolveDataPackageTeamIds(store, state.activeDataVersion, match));
  if (!teamIds) {
    return {
      dataVersion: state.activeDataVersion,
      sources: [],
      recentEvents: [],
      rosterNotes: [],
      downloadedBytes: 0,
      downloadedFiles: 0
    };
  }
  const contextMatch = match.dataPackageTeamIds ? match : { ...match, dataPackageTeamIds: teamIds };

  const sources = await readJson<PackageSource[]>(store, state.activeDataVersion, "data/sources/sources.json");
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const recentEvents: string[] = [];
  const sourceRefs: Array<{ sourceId: string; path?: string }> = [];
  const pairKey = [teamIds.homeTeamId, teamIds.awayTeamId].sort().join("__");
  const matchBundleResult = await ensureDataPackageMatchBundle({
    store,
    match: contextMatch,
    fetchFn
  });

  const headToHead = await readOptionalJson<PackageHeadToHead>(
    store,
    state.activeDataVersion,
    `data/history/head-to-head/${pairKey}.json`
  );
  if (headToHead) {
    const teamAName = teamNameForId(contextMatch, headToHead.teamAId);
    const teamBName = teamNameForId(contextMatch, headToHead.teamBId);
    recentEvents.push(
      `Head-to-head: ${headToHead.allTime.matches} matches, ${teamAName} ${headToHead.allTime.teamAWins} wins, ${teamBName} ${headToHead.allTime.teamBWins} wins, ${headToHead.allTime.draws} draws.`
    );
    const worldCup = headToHead.splits?.worldCup;
    if (worldCup?.matches) {
      recentEvents.push(
        `World Cup head-to-head: ${worldCup.matches} matches, ${teamAName} ${worldCup.teamAWins} wins, ${teamBName} ${worldCup.teamBWins} wins, ${worldCup.draws} draws.`
      );
    }
    const competitive = headToHead.splits?.competitive;
    if (competitive?.matches && competitive.matches !== headToHead.allTime.matches) {
      recentEvents.push(
        `Competitive head-to-head: ${competitive.matches} matches, ${teamAName} ${competitive.teamAWins} wins, ${teamBName} ${competitive.teamBWins} wins, ${competitive.draws} draws.`
      );
    }
    sourceRefs.push(...(headToHead.sourceRefs ?? []));
  }

  for (const teamId of [teamIds.homeTeamId, teamIds.awayTeamId]) {
    const teamProfile = await readOptionalJson<PackageTeamProfile>(
      store,
      state.activeDataVersion,
      `data/profiles/teams/${teamId}.json`
    );
    if (teamProfile?.allTime?.matches) {
      recentEvents.push(
        `${teamNameForId(contextMatch, teamId)} historical profile: ${teamProfile.allTime.matches} matches, ${teamProfile.allTime.wins}W-${teamProfile.allTime.draws}D-${teamProfile.allTime.losses}L.`
      );
      sourceRefs.push(...(teamProfile.sourceRefs ?? []));
    }

    const form = await readOptionalJson<PackageForm>(store, state.activeDataVersion, `data/history/form/${teamId}.json`);
    const last5 = form?.windows?.last5;
    if (!form || !last5) continue;
    recentEvents.push(
      `${teamNameForId(contextMatch, teamId)} recent form: last5 ${last5.wins}W-${last5.draws}D-${last5.losses}L, goals ${last5.goalsFor}-${last5.goalsAgainst}.`
    );
    sourceRefs.push(...(form.sourceRefs ?? []));
  }

  const rosterNotes = [`External data version ${state.activeDataVersion} is active.`];
  for (const teamId of [teamIds.homeTeamId, teamIds.awayTeamId]) {
    const roster = await readOptionalJson<PackageRoster>(
      store,
      state.activeDataVersion,
      `data/rosters/worldcup-2026/${teamId}.json`
    );
    if (roster?.players?.length) {
      const names = roster.players.slice(0, 8).map(formatRosterPlayerHint).join(", ");
      rosterNotes.push(
        `${teamNameForId(contextMatch, teamId)} roster layer: ${roster.rosterStatus} list, ${roster.players.length} players loaded; sample ${names}.`
      );
      sourceRefs.push(...(roster.sourceRefs ?? []));
    }

    const currentPlayers = await readOptionalJson<PackageCurrentKeyPlayerIndex>(
      store,
      state.activeDataVersion,
      `data/profiles/key-players/current/${teamId}/index.json`
    );
    if (currentPlayers?.profiles?.length) {
      const names = currentPlayers.profiles
        .slice(0, 3)
        .map((profile) =>
          typeof profile.historicalGoalCount === "number"
            ? `${profile.name} (${profile.historicalGoalCount} historical goals)`
            : profile.name
        )
        .join(", ");
      rosterNotes.push(
        `${teamNameForId(contextMatch, teamId)} current key-player candidates: ${currentPlayers.profileStatus}/${currentPlayers.rosterStatus}; ${names}.`
      );
      sourceRefs.push(...(currentPlayers.sourceRefs ?? []));

      for (const profileRef of currentPlayers.profiles.slice(0, 3)) {
        const profile = await readOptionalJson<PackageCurrentKeyPlayerProfile>(
          store,
          state.activeDataVersion,
          profileRef.profilePath
        );
        if (!profile) continue;
        rosterNotes.push(formatCurrentKeyPlayerProfileNote(contextMatch, teamId, profile));
        sourceRefs.push(...(profile.sourceRefs ?? []));
      }
    }
  }

  for (const teamId of [teamIds.homeTeamId, teamIds.awayTeamId]) {
    const teamGoals = await readOptionalJson<PackageTeamGoalscorers>(
      store,
      state.activeDataVersion,
      `data/history/goalscorers/by-team/${teamId}.json`
    );
    if (!teamGoals?.topScorers?.length) continue;
    const topScorers = teamGoals.topScorers
      .slice(0, 3)
      .map((scorer) => `${scorer.scorer} (${scorer.goals} ${scorer.goals === 1 ? "goal" : "goals"})`)
      .join(", ");
    rosterNotes.push(`${teamNameForId(contextMatch, teamId)} scorer context: top historical scorers ${topScorers}.`);
    sourceRefs.push(...(teamGoals.sourceRefs ?? []));
  }

  return {
    dataVersion: state.activeDataVersion,
    downloadedBytes: matchBundleResult.totalBytes,
    downloadedFiles: matchBundleResult.downloadedFiles,
    sources: refsToSources(sourceRefs, sourceById),
    recentEvents,
    rosterNotes
  };
}

export async function ensureDataPackageMatchBundle(
  options: EnsureDataPackageMatchBundleOptions
): Promise<PullDataPackageResult> {
  const state = await options.store.readVersionState();
  const teamIds =
    options.match.dataPackageTeamIds ??
    (state.activeDataVersion
      ? await resolveDataPackageTeamIds(options.store, state.activeDataVersion, options.match)
      : undefined);
  if (!state.activeDataVersion || !teamIds) return { dataVersion: state.activeDataVersion ?? "", downloadedFiles: 0, totalBytes: 0 };

  const teamIdList = [teamIds.homeTeamId, teamIds.awayTeamId];
  const pairKey = [...teamIdList].sort().join("__");
  const basePaths = [
    `data/history/head-to-head/${pairKey}.json`,
    ...teamIdList.flatMap((teamId) => [
      `data/history/form/${teamId}.json`,
      `data/profiles/teams/${teamId}.json`,
      `data/rosters/worldcup-2026/${teamId}.json`,
      `data/profiles/key-players/current/${teamId}/index.json`
    ]),
    "data/rosters/worldcup-2026/index.json",
    "data/profiles/key-players/current/index.json"
  ];
  const baseResult = await ensureDataPackageFiles({
    paths: [...new Set(basePaths)],
    store: options.store,
    fetchFn: options.fetchFn
  });

  const profilePaths: string[] = [];
  for (const teamId of teamIdList) {
    const playerIndex = await readOptionalJson<PackageCurrentKeyPlayerIndex>(
      options.store,
      state.activeDataVersion,
      `data/profiles/key-players/current/${teamId}/index.json`
    );
    profilePaths.push(...(playerIndex?.profiles ?? []).map((profile) => profile.profilePath));
  }
  const profileResult = profilePaths.length
    ? await ensureDataPackageFiles({
        paths: [...new Set(profilePaths)],
        store: options.store,
        fetchFn: options.fetchFn
      })
    : { dataVersion: state.activeDataVersion, downloadedFiles: 0, totalBytes: 0 };

  const playerResult =
    options.includeHistoricalScorers === false
      ? { dataVersion: state.activeDataVersion, downloadedFiles: 0, totalBytes: 0 }
      : await ensureDataPackagePlayerContext({
          store: options.store,
          teamIds: teamIdList,
          fetchFn: options.fetchFn
        });

  return {
    dataVersion: state.activeDataVersion,
    downloadedFiles: baseResult.downloadedFiles + profileResult.downloadedFiles + playerResult.downloadedFiles,
    totalBytes: baseResult.totalBytes + profileResult.totalBytes + playerResult.totalBytes
  };
}

export async function ensureDataPackagePlayerContext(
  options: EnsureDataPackagePlayerContextOptions
): Promise<PullDataPackageResult> {
  const paths = [
    "data/history/goalscorers/index.json",
    "data/players/players-index.json",
    ...(options.teamIds ?? []).map((teamId) => `data/history/goalscorers/by-team/${teamId}.json`),
    ...(options.playerKeys ?? []).flatMap((playerKey) => [
      `data/history/goalscorers/by-player/${playerKey}.json`,
      `data/players/identities/${playerKey}.json`
    ])
  ];
  return ensureDataPackageFiles({
    paths: [...new Set(paths)],
    store: options.store,
    fetchFn: options.fetchFn
  });
}

function toWorldCupMatches(
  schedule: PackageSchedule,
  teams: PackageTeam[],
  aliases: PackageAlias[],
  sources: PackageSource[],
  venues: PackageVenue[],
  marketMapping?: PackageMarketMapping,
  identification?: PackageIdentificationIndex
): WorldCupMatch[] {
  const teamById = new Map(teams.map((team) => [team.teamId, team]));
  const aliasesByTeam = new Map<string, string[]>();
  for (const alias of aliases) {
    aliasesByTeam.set(alias.teamId, [...(aliasesByTeam.get(alias.teamId) ?? []), alias.alias]);
  }
  const sourceById = new Map(sources.map((source) => [source.sourceId, source]));
  const venueById = new Map(venues.map((venue) => [venue.venueId, venue]));
  const identificationByMatchId = new Map((identification?.matches ?? []).map((match) => [match.matchId, match]));

  return schedule.matches
    .map((match): WorldCupMatch | undefined => {
      const homeTeam = teamById.get(match.homeTeamId);
      const awayTeam = teamById.get(match.awayTeamId);
      if (!homeTeam || !awayTeam || homeTeam.isPlaceholder || awayTeam.isPlaceholder) return undefined;
      const source = sourceById.get(match.sourceRefs?.[0]?.sourceId ?? "") ?? sources[0];
      const teamAliases = {
        [homeTeam.name]: normalizeAliases([homeTeam.name, homeTeam.fifaCode, ...(homeTeam.aliases ?? []), ...(aliasesByTeam.get(homeTeam.teamId) ?? [])]),
        [awayTeam.name]: normalizeAliases([awayTeam.name, awayTeam.fifaCode, ...(awayTeam.aliases ?? []), ...(aliasesByTeam.get(awayTeam.teamId) ?? [])])
      };
      const worldCupMatch: WorldCupMatch = {
        id: match.matchId,
        kickoffUtc: match.kickoffUtc,
        localDate: match.localDate,
        localTime: match.localTime,
        timezone: match.timezone,
        team1: homeTeam.name,
        team2: awayTeam.name,
        teamAliases,
        group: match.group,
        stage: match.stage,
        venue: formatVenue(match, venueById.get(match.venueId)),
        source: toSourceMetadata(source),
        marketSearchQueries: buildMarketSearchQueries(match, marketMapping),
        identification: toIdentificationSignals(identificationByMatchId.get(match.matchId), identification?.defaultWeights),
        dataPackageTeamIds: {
          homeTeamId: homeTeam.teamId,
          awayTeamId: awayTeam.teamId
        }
      };
      return worldCupMatch;
    })
    .filter((match): match is WorldCupMatch => Boolean(match));
}

function toIdentificationSignals(
  match?: PackageIdentificationMatch,
  defaultWeights?: PackageIdentificationIndex["defaultWeights"]
): WorldCupMatch["identification"] | undefined {
  if (!match) return undefined;
  return {
    defaultWeights,
    hasPlaceholderTeam: match.hasPlaceholderTeam,
    queryHints: match.queryHints ?? [],
    teams: (match.teams ?? []).map((team) => ({
      side: team.side,
      teamId: team.teamId,
      name: team.name,
      aliases: team.aliases ?? [],
      fifaCode: team.fifaCode,
      identityConfidence: team.identityConfidence,
      isPlaceholder: team.isPlaceholder
    })),
    venueAliases: match.venue?.aliases ?? []
  };
}

function buildMarketSearchQueries(match: PackageScheduleMatch, marketMapping?: PackageMarketMapping): string[] | undefined {
  const queries = uniqueText([
    ...(marketMapping?.matchQueries?.[match.matchId] ?? []),
    ...(marketMapping?.teamQueries?.[match.homeTeamId] ?? []),
    ...(marketMapping?.teamQueries?.[match.awayTeamId] ?? []),
    ...(marketMapping?.tournamentQueries ?? [])
  ]);
  return queries.length ? queries : undefined;
}

function refsToSources(
  refs: Array<{ sourceId: string; path?: string }>,
  sourceById: Map<string, PackageSource>
): SourceMetadata[] {
  const sources = new Map<string, SourceMetadata>();
  for (const ref of refs) {
    const source = sourceById.get(ref.sourceId);
    if (source) sources.set(source.sourceId, toSourceMetadata(source));
  }
  return [...sources.values()];
}

function teamNameForId(match: WorldCupMatch, teamId: string): string {
  if (match.dataPackageTeamIds?.homeTeamId === teamId) return match.team1;
  if (match.dataPackageTeamIds?.awayTeamId === teamId) return match.team2;
  return teamId;
}

function formatCurrentKeyPlayerProfileNote(
  match: WorldCupMatch,
  teamId: string,
  profile: PackageCurrentKeyPlayerProfile
): string {
  const status = `${profile.profileStatus}/${profile.roster?.rosterStatus ?? profile.rosterStatus ?? "unknown"}`;
  const details = [
    typeof profile.shirtNumber === "number" ? `shirt #${profile.shirtNumber}` : undefined,
    profile.position ?? profile.identity?.position ? `position ${profile.position ?? profile.identity?.position}` : undefined,
    profile.club ? `club ${profile.club}` : undefined,
    profile.identity?.dateOfBirth ? `born ${profile.identity.dateOfBirth}` : undefined,
    typeof profile.historicalNationalTeamGoals === "number"
      ? `${profile.historicalNationalTeamGoals} historical national-team goals`
      : undefined,
    profile.recentHistoricalGoals?.length ? `${profile.recentHistoricalGoals.length} recent historical goal records` : undefined
  ].filter(Boolean);

  return `${teamNameForId(match, teamId)} key-player profile: ${profile.name}, ${status}${details.length ? `, ${details.join(", ")}` : ""}.`;
}

function formatRosterPlayerHint(player: NonNullable<PackageRoster["players"]>[number]): string {
  const details = [
    typeof player.shirtNumber === "number" ? `#${player.shirtNumber}` : undefined,
    player.position,
    player.club
  ].filter(Boolean);
  return details.length ? `${player.name} (${details.join(", ")})` : player.name;
}

async function resolveDataPackageTeamIds(
  store: DataPackageStore,
  dataVersion: string,
  match: WorldCupMatch
): Promise<WorldCupMatch["dataPackageTeamIds"] | undefined> {
  const [teams, aliases] = await Promise.all([
    readOptionalJson<PackageTeam[]>(store, dataVersion, "data/taxonomy/teams.json"),
    readOptionalJson<PackageAlias[]>(store, dataVersion, "data/taxonomy/team-aliases.json")
  ]);
  if (!teams?.length) return undefined;

  const aliasesByTeam = new Map<string, string[]>();
  for (const alias of aliases ?? []) {
    aliasesByTeam.set(alias.teamId, [...(aliasesByTeam.get(alias.teamId) ?? []), alias.alias]);
  }

  const homeTeamId = findPackageTeamId(match.team1, teams, aliasesByTeam);
  const awayTeamId = findPackageTeamId(match.team2, teams, aliasesByTeam);
  return homeTeamId && awayTeamId ? { homeTeamId, awayTeamId } : undefined;
}

function findPackageTeamId(
  teamName: string,
  teams: PackageTeam[],
  aliasesByTeam: Map<string, string[]>
): string | undefined {
  const expected = normalizeLookupValue(teamName);
  return teams.find((team) => {
    const values = [team.name, team.fifaCode, ...(team.aliases ?? []), ...(aliasesByTeam.get(team.teamId) ?? [])];
    return values.some((value) => normalizeLookupValue(value) === expected);
  })?.teamId;
}

function formatVenue(match: PackageScheduleMatch, venue?: PackageVenue): string {
  if (venue) {
    if (venue.city) return venue.displayName === venue.city ? venue.displayName : `${venue.displayName} (${venue.city})`;
    return venue.displayName;
  }
  if (match.city) return match.venueId === match.city ? match.city : `${titleCase(match.venueId)} (${match.city})`;
  return titleCase(match.venueId);
}

function titleCase(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toSourceMetadata(source: PackageSource): SourceMetadata {
  return {
    sourceName: source.name,
    sourceUrl: source.url,
    sourceTimestamp: source.retrievedAt ?? ""
  };
}

function normalizeAliases(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()))];
}

function normalizeLookupValue(value?: string): string {
  return (value ?? "").trim().toLowerCase();
}

function uniqueText(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const uniqueValues: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueValues.push(trimmed);
  }
  return uniqueValues;
}

async function readJson<T>(store: DataPackageStore, dataVersion: string, path: string): Promise<T> {
  const content = await store.readFile(dataVersion, path);
  if (!content) throw new Error(`Missing data package file ${path}`);
  return JSON.parse(content) as T;
}

async function readOptionalJson<T>(store: DataPackageStore, dataVersion: string, path: string): Promise<T | undefined> {
  const content = await store.readFile(dataVersion, path);
  return content ? (JSON.parse(content) as T) : undefined;
}
