import type {
  LiveFixtureStatus,
  LiveSportsFixture,
  LiveSportsScoreSide,
  SourceMetadata,
  SportsDataSnapshot,
  UserSettings,
  WorldCupMatch
} from "../shared/types";
import { readCache, writeCache } from "./cache";

export type { SportsDataSnapshot };

export async function loadSportsDataForMatch(
  settings: UserSettings,
  match: WorldCupMatch
): Promise<SportsDataSnapshot[]> {
  const snapshots: SportsDataSnapshot[] = [];

  if (settings.sports.footballDataKey) {
    const footballData = await loadFootballData(settings, match);
    snapshots.push(footballData);
    if (footballData.status === "loaded") return snapshots;
  } else {
    snapshots.push(notConfigured("football-data.org"));
  }

  if (settings.sports.apiFootballKey) {
    snapshots.push(await loadApiFootball(settings, match));
  } else {
    snapshots.push(notConfigured("API-Football"));
  }

  return snapshots;
}

export function sportsSnapshotsToEvents(snapshots: SportsDataSnapshot[]): string[] {
  return snapshots.flatMap((snapshot) => snapshot.events);
}

export function sportsSnapshotsToSources(snapshots: SportsDataSnapshot[]): SourceMetadata[] {
  return snapshots
    .map((snapshot) => snapshot.source)
    .filter((source): source is SourceMetadata => Boolean(source));
}

async function loadFootballData(
  settings: UserSettings,
  match: WorldCupMatch
): Promise<SportsDataSnapshot> {
  if (!settings.sports.footballDataKey) {
    return {
      provider: "football-data.org",
      status: "not-configured",
      message: "football-data.org key not configured.",
      events: []
    };
  }

  const date = match.kickoffUtc.slice(0, 10);
  const cacheKey = `sports:football-data:${date}`;
  const cached = await readCache<SportsDataSnapshot>(cacheKey);
  if (cached) return markCached(cached);

  const allowed = await reserveProviderRequest("football-data", 10, 60 * 1000);
  if (!allowed) return rateLimited("football-data.org", "Local 10 requests/minute guard is active.");

  const url = new URL("https://api.football-data.org/v4/matches");
  url.searchParams.set("dateFrom", date);
  url.searchParams.set("dateTo", date);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "X-Auth-Token": settings.sports.footballDataKey
      }
    });
    if (!response.ok) throw new HttpStatusError(response.status);

    const payload = (await response.json()) as { matches?: unknown[] };
    const fixtures = (payload.matches ?? [])
      .map(normalizeFootballDataMatch)
      .filter((fixture): fixture is LiveSportsFixture => Boolean(fixture));
    const events = fixtures.map(formatLiveSportsFixture);

    const snapshot: SportsDataSnapshot = {
      provider: "football-data.org",
      status: events.length ? "loaded" : "empty",
      message: events.length
        ? `Loaded ${events.length} football-data.org match item(s) for ${date}.`
        : `No football-data.org match data available yet for ${date}.`,
      events,
      fixtures,
      source: {
        sourceName: "football-data.org",
        sourceUrl: url.toString(),
        sourceTimestamp: new Date().toISOString()
      }
    };
    await writeCache(cacheKey, snapshot, sportsDataTtlMs(match));
    return snapshot;
  } catch (error) {
    const stale = await readCache<SportsDataSnapshot>(cacheKey, { allowExpired: true });
    if (stale) return markCached(stale, true);
    if (isRateLimitError(error)) return rateLimited("football-data.org", formatError(error));
    return {
      provider: "football-data.org",
      status: "error",
      message: `football-data.org request failed: ${formatError(error)}`,
      events: []
    };
  }
}

async function loadApiFootball(
  settings: UserSettings,
  match: WorldCupMatch
): Promise<SportsDataSnapshot> {
  if (!settings.sports.apiFootballKey) {
    return {
      provider: "API-Football",
      status: "not-configured",
      message: "API-Football key not configured.",
      events: []
    };
  }

  const date = match.kickoffUtc.slice(0, 10);
  const cacheKey = `sports:api-football:${date}`;
  const cached = await readCache<SportsDataSnapshot>(cacheKey);
  if (cached) return markCached(cached);

  const allowed = await reserveProviderRequest("api-football", 95, 24 * 60 * 60 * 1000);
  if (!allowed) return rateLimited("API-Football", "Local 95 requests/day guard is active.");

  const url = new URL("https://v3.football.api-sports.io/fixtures");
  url.searchParams.set("date", date);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "x-apisports-key": settings.sports.apiFootballKey
      }
    });
    if (!response.ok) throw new HttpStatusError(response.status);

    const payload = (await response.json()) as { response?: unknown[]; errors?: unknown };
    const apiError = extractApiFootballError(payload);
    if (apiError) throw new Error(apiError);
    const fixtures = (payload.response ?? [])
      .map(normalizeApiFootballFixture)
      .filter((fixture): fixture is LiveSportsFixture => Boolean(fixture));
    const events = fixtures.map(formatLiveSportsFixture);

    const snapshot: SportsDataSnapshot = {
      provider: "API-Football",
      status: events.length ? "loaded" : "empty",
      message: events.length
        ? `Loaded ${events.length} API-Football fixture item(s) for ${date}.`
        : `No API-Football fixtures available yet for ${date}.`,
      events,
      fixtures,
      source: {
        sourceName: "API-Football",
        sourceUrl: url.toString(),
        sourceTimestamp: new Date().toISOString()
      }
    };
    await writeCache(cacheKey, snapshot, sportsDataTtlMs(match));
    return snapshot;
  } catch (error) {
    const stale = await readCache<SportsDataSnapshot>(cacheKey, { allowExpired: true });
    if (stale) return markCached(stale, true);
    if (isRateLimitError(error)) return rateLimited("API-Football", formatError(error));
    return {
      provider: "API-Football",
      status: "error",
      message: `API-Football request failed: ${formatError(error)}`,
      events: []
    };
  }
}

function normalizeFootballDataMatch(match: unknown): LiveSportsFixture | undefined {
  const record = match as {
    id?: number | string;
    utcDate?: string;
    status?: string;
    minute?: number | null;
    venue?: string | null;
    stage?: string | null;
    group?: string | null;
    matchday?: number | null;
    lastUpdated?: string | null;
    competition?: { id?: number | string; name?: string; code?: string | null };
    homeTeam?: { name?: string };
    awayTeam?: { name?: string };
    score?: {
      halfTime?: { home?: number | null; away?: number | null };
      fullTime?: { home?: number | null; away?: number | null };
    };
  };
  if (!record.homeTeam?.name || !record.awayTeam?.name) return undefined;

  const fullTime = normalizeScore(record.score?.fullTime);
  const halfTime = normalizeScore(record.score?.halfTime);
  const fixtureId = String(
    record.id ?? `${record.competition?.id ?? "match"}:${record.utcDate ?? "unknown"}:${record.homeTeam.name}:${record.awayTeam.name}`
  );

  return {
    provider: "football-data.org",
    fixtureId,
    kickoffUtc: record.utcDate,
    status: {
      code: record.status,
      label: record.status,
      normalized: normalizeFootballDataStatus(record.status),
      elapsed: numberOrUndefined(record.minute)
    },
    teams: {
      home: { name: record.homeTeam.name },
      away: { name: record.awayTeam.name }
    },
    score: {
      home: fullTime?.home,
      away: fullTime?.away,
      halfTime,
      fullTime
    },
    venue: record.venue ? { name: record.venue } : undefined,
    competition: {
      providerCompetitionId: stringOrUndefined(record.competition?.id),
      name: record.competition?.name,
      code: record.competition?.code ?? undefined,
      stage: record.stage ?? undefined,
      group: record.group ?? undefined,
      matchday: numberOrUndefined(record.matchday)
    },
    providerUpdatedAt: record.lastUpdated ?? undefined
  };
}

function normalizeApiFootballFixture(fixture: unknown): LiveSportsFixture | undefined {
  const record = fixture as {
    fixture?: {
      id?: number | string;
      date?: string;
      timestamp?: number;
      venue?: { name?: string; city?: string };
      status?: { short?: string; long?: string; elapsed?: number | null; extra?: number | null };
    };
    league?: { id?: number | string; name?: string; season?: number; round?: string };
    teams?: {
      home?: { id?: number | string; name?: string; winner?: boolean | null };
      away?: { id?: number | string; name?: string; winner?: boolean | null };
    };
    goals?: { home?: number | null; away?: number | null };
    score?: {
      halftime?: { home?: number | null; away?: number | null };
      fulltime?: { home?: number | null; away?: number | null };
      extratime?: { home?: number | null; away?: number | null };
      penalty?: { home?: number | null; away?: number | null };
    };
  };
  if (!record.teams?.home?.name || !record.teams?.away?.name) return undefined;

  return {
    provider: "API-Football",
    fixtureId: String(record.fixture?.id ?? `${record.fixture?.date ?? "unknown"}:${record.teams.home.name}:${record.teams.away.name}`),
    kickoffUtc: record.fixture?.date,
    status: {
      code: record.fixture?.status?.short,
      label: record.fixture?.status?.long ?? record.fixture?.status?.short,
      normalized: normalizeApiFootballStatus(record.fixture?.status?.short),
      elapsed: numberOrUndefined(record.fixture?.status?.elapsed),
      extra: numberOrUndefined(record.fixture?.status?.extra)
    },
    teams: {
      home: {
        providerTeamId: stringOrUndefined(record.teams.home.id),
        name: record.teams.home.name,
        winner: booleanOrUndefined(record.teams.home.winner)
      },
      away: {
        providerTeamId: stringOrUndefined(record.teams.away.id),
        name: record.teams.away.name,
        winner: booleanOrUndefined(record.teams.away.winner)
      }
    },
    score: {
      home: numberOrUndefined(record.goals?.home),
      away: numberOrUndefined(record.goals?.away),
      halfTime: normalizeScore(record.score?.halftime),
      fullTime: normalizeScore(record.score?.fulltime),
      extraTime: normalizeScore(record.score?.extratime),
      penalties: normalizeScore(record.score?.penalty)
    },
    venue: record.fixture?.venue
      ? {
          name: record.fixture.venue.name,
          city: record.fixture.venue.city
        }
      : undefined,
    competition: {
      providerCompetitionId: stringOrUndefined(record.league?.id),
      name: record.league?.name,
      season: numberOrUndefined(record.league?.season),
      round: record.league?.round
    }
  };
}

function formatLiveSportsFixture(fixture: LiveSportsFixture): string {
  const elapsed = typeof fixture.status.elapsed === "number" ? `, elapsed ${fixture.status.elapsed}'` : "";
  const score = formatScore(fixture.score?.home, fixture.score?.away);
  return `${fixture.provider}: ${fixture.teams.home.name} vs ${fixture.teams.away.name}, status ${fixture.status.code ?? "unknown"}${elapsed}, kickoff ${fixture.kickoffUtc ?? "unknown"}${score}`;
}

function normalizeScore(value?: { home?: number | null; away?: number | null }): LiveSportsScoreSide | undefined {
  const home = numberOrUndefined(value?.home);
  const away = numberOrUndefined(value?.away);
  return typeof home === "number" || typeof away === "number" ? { home, away } : undefined;
}

function formatScore(home?: number, away?: number): string {
  return typeof home === "number" && typeof away === "number" ? `, score ${home}-${away}` : "";
}

function normalizeFootballDataStatus(status?: string): LiveFixtureStatus {
  switch (status) {
    case "SCHEDULED":
    case "TIMED":
      return "scheduled";
    case "LIVE":
    case "IN_PLAY":
      return "live";
    case "PAUSED":
      return "paused";
    case "FINISHED":
      return "finished";
    case "POSTPONED":
      return "postponed";
    case "CANCELLED":
      return "cancelled";
    case "SUSPENDED":
      return "suspended";
    default:
      return "unknown";
  }
}

function normalizeApiFootballStatus(status?: string): LiveFixtureStatus {
  switch (status) {
    case "TBD":
    case "NS":
      return "scheduled";
    case "1H":
    case "2H":
    case "ET":
    case "P":
    case "BT":
    case "LIVE":
      return "live";
    case "HT":
    case "BREAK":
    case "INT":
      return "paused";
    case "FT":
    case "AET":
    case "PEN":
      return "finished";
    case "PST":
      return "postponed";
    case "CANC":
    case "ABD":
    case "AWD":
    case "WO":
      return "cancelled";
    case "SUSP":
      return "suspended";
    default:
      return "unknown";
  }
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : typeof value === "number" ? String(value) : undefined;
}

function booleanOrUndefined(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notConfigured(provider: SportsDataSnapshot["provider"]): SportsDataSnapshot {
  return {
    provider,
    status: "not-configured",
    message: `${provider} key not configured.`,
    events: []
  };
}

function rateLimited(provider: SportsDataSnapshot["provider"], reason: string): SportsDataSnapshot {
  return {
    provider,
    status: "rate-limited",
    message: `${provider} skipped: ${reason}`,
    events: []
  };
}

async function reserveProviderRequest(provider: string, maxRequests: number, windowMs: number): Promise<boolean> {
  const key = `sports-quota:${provider}`;
  const now = Date.now();
  const recent = ((await readCache<number[]>(key, { allowExpired: true })) ?? []).filter(
    (timestamp) => now - timestamp < windowMs
  );

  if (recent.length >= maxRequests) return false;

  await writeCache(key, [...recent, now], windowMs);
  return true;
}

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof HttpStatusError) return error.status === 429;
  return /rate.?limit|quota|daily number of requests/i.test(formatError(error));
}

function extractApiFootballError(payload: { errors?: unknown }): string | undefined {
  const errors = payload.errors;
  if (!errors) return undefined;
  if (Array.isArray(errors) && errors.length > 0) return errors.join(" ");
  if (typeof errors === "object" && Object.keys(errors).length > 0) return JSON.stringify(errors);
  if (typeof errors === "string" && errors) return errors;
  return undefined;
}

function sportsDataTtlMs(match: WorldCupMatch): number {
  const now = Date.now();
  const kickoff = new Date(match.kickoffUtc).getTime();
  const liveWindowStart = kickoff - 90 * 60 * 1000;
  const liveWindowEnd = kickoff + 150 * 60 * 1000;

  if (now >= liveWindowStart && now <= liveWindowEnd) return 5 * 60 * 1000;
  if (kickoff - now > 24 * 60 * 60 * 1000) return 6 * 60 * 60 * 1000;
  return 30 * 60 * 1000;
}

function markCached(snapshot: SportsDataSnapshot, stale = false): SportsDataSnapshot {
  const prefix = snapshot.status === "empty"
    ? "Cached empty result"
    : stale
      ? "Using stale cached data"
      : "Using cached data";

  return {
    ...snapshot,
    message: `${prefix}: ${snapshot.message}`
  };
}
