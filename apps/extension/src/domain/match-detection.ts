import type {
  MatchDetectionInput,
  MatchDetectionReason,
  MatchDetectionResult,
  MatchCandidateReport,
  PageContext,
  WorldCupMatch
} from "../shared/types";

const LIVE_WINDOW_BEFORE_MS = 90 * 60 * 1000;
const LIVE_WINDOW_AFTER_MS = 150 * 60 * 1000;
const UPCOMING_WINDOW_MS = 24 * 60 * 60 * 1000;
const MIN_CONFIDENT_MATCH_SCORE = 45;
const FALLBACK_WEIGHTS = {
  teamAlias: 25,
  placeholderTeamAlias: 16,
  venueAlias: 8,
  timeWindow: 45,
  marketQuery: 10
};

export function detectCurrentMatch(input: MatchDetectionInput): MatchDetectionResult[] {
  const now = new Date(input.nowUtc).getTime();
  const pageHaystack = normalizePage(input.pageContext);

  return input.matches
    .map((match) => scoreMatch(match, now, pageHaystack, input.nowUtc))
    .filter((result) => result.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

export function explainMatchDetection(result: MatchDetectionResult): string {
  const evidence = result.evidence.length ? ` Evidence: ${result.evidence.join(" ")}` : "";
  return `${result.confidence}% is match identification confidence, not a win probability. It estimates how likely this page and time point refer to ${result.match.team1} vs ${result.match.team2}.${evidence}`;
}

export function selectBestMatchDetection(
  results: MatchDetectionResult[],
  minConfidence = MIN_CONFIDENT_MATCH_SCORE
): MatchDetectionResult | undefined {
  const best = results[0];
  return best && best.confidence >= minConfidence ? best : undefined;
}

export function summarizeMatchCandidates(
  results: MatchDetectionResult[],
  limit = 3
): MatchCandidateReport[] {
  return results.slice(0, limit).map((result) => ({
    confidence: result.confidence,
    label: `${result.match.team1} vs ${result.match.team2}`,
    matchId: result.match.id,
    reasons: result.reasons ?? [],
    sourceFields: result.sourceFields,
  }));
}

function scoreMatch(
  match: WorldCupMatch,
  now: number,
  pageHaystack: string,
  detectedAt: string
): MatchDetectionResult {
  const kickoff = new Date(match.kickoffUtc).getTime();
  const evidence: string[] = [];
  const reasons = new Set<MatchDetectionReason>();
  const sourceFields: string[] = [];
  let score = 0;
  const weights = match.identification?.defaultWeights;
  const liveWindowScore = toScoreWeight(weights?.timeWindow, FALLBACK_WEIGHTS.timeWindow);
  const upcomingWindowScore = Math.round(liveWindowScore * 0.4);

  if (now >= kickoff - LIVE_WINDOW_BEFORE_MS && now <= kickoff + LIVE_WINDOW_AFTER_MS) {
    score += liveWindowScore;
    evidence.push("Current time is inside live match window.");
    reasons.add("time");
    sourceFields.push("kickoffUtc");
  } else if (now < kickoff && kickoff - now <= UPCOMING_WINDOW_MS) {
    score += upcomingWindowScore;
    evidence.push("Match starts within the next 24 hours.");
    reasons.add("time");
    sourceFields.push("kickoffUtc");
  }

  const team1Hit = hasTeamEvidence(match, match.team1, "home", pageHaystack);
  const team2Hit = hasTeamEvidence(match, match.team2, "away", pageHaystack);
  const teamScore = toScoreWeight(
    match.identification?.hasPlaceholderTeam ? weights?.placeholderTeamAlias : weights?.teamAlias,
    match.identification?.hasPlaceholderTeam ? FALLBACK_WEIGHTS.placeholderTeamAlias : FALLBACK_WEIGHTS.teamAlias
  );

  if (team1Hit) {
    score += teamScore;
    evidence.push(`Page mentions ${match.team1}.`);
    reasons.add("team");
    sourceFields.push(team1Hit === "identification" ? "identification.teams.aliases" : "pageContext.visibleText");
  }

  if (team2Hit) {
    score += teamScore;
    evidence.push(`Page mentions ${match.team2}.`);
    reasons.add("team");
    sourceFields.push(team2Hit === "identification" ? "identification.teams.aliases" : "pageContext.visibleText");
  }

  if (team1Hit && team2Hit) {
    score += 20;
    evidence.push("Page mentions both teams.");
  }

  if (match.group && pageHaystack.includes(match.group.toLowerCase())) {
    score += 8;
    evidence.push(`Page mentions ${match.group}.`);
    reasons.add("group");
    sourceFields.push("group");
  }

  if (hasTextEvidence(venueAliases(match), pageHaystack)) {
    score += toScoreWeight(weights?.venueAlias, FALLBACK_WEIGHTS.venueAlias);
    evidence.push(`Page mentions venue ${match.venue}.`);
    reasons.add("venue");
    sourceFields.push(match.identification?.venueAliases?.length ? "identification.venueAliases" : "venue");
  }

  if (hasTextEvidence(match.identification?.queryHints ?? [], pageHaystack)) {
    score += toScoreWeight(weights?.marketQuery, FALLBACK_WEIGHTS.marketQuery);
    evidence.push("Page matches data package query hints.");
    reasons.add("query");
    sourceFields.push("identification.queryHints");
  }

  return {
    match,
    confidence: Math.min(score, 100),
    evidence,
    reasons: [...reasons],
    sourceFields: Array.from(new Set(sourceFields)),
    detectedAt
  };
}

function normalizePage(pageContext?: Partial<PageContext>): string {
  return normalizeComparableText([
    pageContext?.url ?? "",
    pageContext?.title ?? "",
    pageContext?.visibleText ?? ""
  ].join(" "));
}

function hasTeamEvidence(
  match: WorldCupMatch,
  team: string,
  side: "home" | "away",
  haystack: string
): "identification" | "legacy" | undefined {
  const identificationTeam = match.identification?.teams?.find((candidate) => candidate.side === side);
  if (hasTextEvidence(identificationTeam?.aliases ?? [], haystack)) return "identification";
  if (hasTextEvidence(match.teamAliases[team] ?? [team.toLowerCase()], haystack)) return "legacy";
  return undefined;
}

function venueAliases(match: WorldCupMatch): string[] {
  return [match.venue, ...(match.identification?.venueAliases ?? [])];
}

function hasTextEvidence(values: string[], haystack: string): boolean {
  return values.some((value) => {
    const normalized = normalizeComparableText(value);
    return normalized.length > 0 && ` ${haystack} `.includes(` ${normalized} `);
  });
}

function normalizeComparableText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function toScoreWeight(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  const score = value <= 1 ? Math.round(value * 100) : Math.round(value);
  return Math.max(score, fallback);
}
