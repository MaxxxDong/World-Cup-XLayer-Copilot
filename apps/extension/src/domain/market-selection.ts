import type { MarketGroup, RankedMarket } from "../shared/types";

export function selectTopMarkets(
  markets: RankedMarket[],
  group: MarketGroup,
  limit = 3
): RankedMarket[] {
  return markets
    .filter((market) => market.group === group)
    .sort(compareMarketValue)
    .filter(uniqueMarketSurface())
    .slice(0, limit);
}

export function selectPrimaryMarket(markets: RankedMarket[]): RankedMarket | undefined {
  return (
    selectTopMarkets(markets, "current-match", 1)[0] ??
    selectTopMarkets(markets, "tournament", 1)[0] ??
    [...markets].sort(compareMarketValue)[0]
  );
}

function compareMarketValue(a: RankedMarket, b: RankedMarket): number {
  return (
    b.relevanceScore - a.relevanceScore ||
    (b.liquidity ?? 0) - (a.liquidity ?? 0) ||
    (b.volume ?? 0) - (a.volume ?? 0)
  );
}

function uniqueMarketSurface(): (market: RankedMarket) => boolean {
  const seen = new Set<string>();
  return (market) => {
    const key = market.eventSlug || market.slug || market.officialUrl || market.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}
