import type { MarketCandidate, RankedMarket, WorldCupMatch } from "../shared/types";

const tournamentTerms = ["world cup", "fifa world cup", "2026 world cup", "winner", "champion", "golden boot"];
const currentMatchTerms = ["win", "advance", "score", "goals", "penalty", "extra time"];

export function rankMarkets(match: WorldCupMatch, markets: MarketCandidate[]): RankedMarket[] {
  return markets
    .map((market) => rankMarket(match, market))
    .sort((a, b) => b.relevanceScore - a.relevanceScore);
}

function rankMarket(match: WorldCupMatch, market: MarketCandidate): RankedMarket {
  const text = normalizeComparableText(`${market.title} ${market.eventTitle ?? ""} ${market.description ?? ""}`);
  const team1 = includesTeam(match, match.team1, text);
  const team2 = includesTeam(match, match.team2, text);
  const tournament = tournamentTerms.some((term) => hasComparableText(term, text));
  const matchTerm = currentMatchTerms.some((term) => hasComparableText(term, text));
  const querySeed = hasMarketQuerySeed(match, text);

  const scoreParts: Record<string, number> = {
    exactTeams: team1 && team2 ? 55 : 0,
    oneTeam: team1 !== team2 ? 22 : 0,
    querySeed: querySeed ? 18 : 0,
    tournament: tournament ? 20 : 0,
    currentMatchTerm: matchTerm ? 12 : 0,
    liquidity: Math.min((market.liquidity ?? 0) / 1000, 12),
    volume: Math.min((market.volume ?? 0) / 5000, 12),
    active: market.active ? 8 : -20,
    closed: market.closed ? -60 : 0,
    acceptingOrders: market.acceptingOrders === false ? -18 : market.acceptingOrders ? 6 : 0,
    orderBook: market.enableOrderBook === false ? -10 : market.enableOrderBook ? 4 : 0
  };

  const relevanceScore = Math.round(
    Object.values(scoreParts).reduce((sum, value) => sum + value, 0)
  );

  const group =
    team1 && team2
      ? "current-match"
      : team1 || team2
        ? "team-related"
        : tournament
        ? "tournament"
        : "other";

  return {
    ...market,
    group,
    relevanceScore,
    scoreParts,
    relevanceReason: buildReason(match, team1, team2, tournament, querySeed, market.closed)
  };
}

function includesTeam(match: WorldCupMatch, team: string, text: string): boolean {
  return (match.teamAliases[team] ?? [team.toLowerCase()]).some((alias) =>
    hasComparableText(alias, text)
  );
}

function hasMarketQuerySeed(match: WorldCupMatch, text: string): boolean {
  return (match.marketSearchQueries ?? []).some((query) => {
    const tokens = normalizeComparableText(query)
      .split(" ")
      .filter((token) => token.length > 2 && !["the", "and", "cup", "world", "fifa", "2026"].includes(token));
    if (tokens.length < 2) return false;
    return tokens.filter((token) => hasComparableText(token, text)).length >= Math.min(3, tokens.length);
  });
}

function buildReason(
  match: WorldCupMatch,
  team1: boolean,
  team2: boolean,
  tournament: boolean,
  querySeed: boolean,
  closed: boolean
): string {
  if (closed) return "Closed market is de-ranked.";
  if (team1 && team2) return `Mentions both ${match.team1} and ${match.team2}.`;
  if (querySeed) return "Matches data package market query seeds.";
  if (team1) return `Mentions ${match.team1}, so it is tournament-related.`;
  if (team2) return `Mentions ${match.team2}, so it is tournament-related.`;
  if (tournament) return "Mentions the World Cup tournament context.";
  return "Low textual match to the current fixture.";
}

function hasComparableText(needle: string, haystack: string): boolean {
  const normalized = normalizeComparableText(needle);
  return normalized.length > 0 && ` ${haystack} `.includes(` ${normalized} `);
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
