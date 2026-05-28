import { describe, expect, it } from "vitest";
import { selectPrimaryMarket, selectTopMarkets } from "../domain/market-selection";
import type { RankedMarket } from "../shared/types";

function market(input: Partial<RankedMarket> & Pick<RankedMarket, "id" | "group">): RankedMarket {
  return {
    title: input.id,
    active: true,
    closed: false,
    officialUrl: `https://polymarket.com/event/${input.id}`,
    relevanceScore: 0,
    scoreParts: {},
    relevanceReason: "",
    ...input
  };
}

describe("market selection", () => {
  it("keeps only the three strongest markets in a group", () => {
    const selected = selectTopMarkets(
      [
        market({ id: "low", group: "current-match", relevanceScore: 60, liquidity: 100 }),
        market({ id: "high", group: "current-match", relevanceScore: 90, liquidity: 20 }),
        market({ id: "mid", group: "current-match", relevanceScore: 70, liquidity: 500 }),
        market({ id: "fourth", group: "current-match", relevanceScore: 50, liquidity: 1000 })
      ],
      "current-match",
      3
    );

    expect(selected.map((item) => item.id)).toEqual(["high", "mid", "low"]);
  });

  it("prefers a current-match market as the primary preview", () => {
    const selected = selectPrimaryMarket([
      market({ id: "winner", group: "tournament", relevanceScore: 200, volume: 1_000_000 }),
      market({ id: "match", group: "current-match", relevanceScore: 80, volume: 1000 })
    ]);

    expect(selected?.id).toBe("match");
  });

  it("dedupes repeated markets from the same Polymarket event surface", () => {
    const selected = selectTopMarkets(
      [
        market({ id: "mex-yes", eventSlug: "mex-rsa", group: "current-match", relevanceScore: 90 }),
        market({ id: "rsa-yes", eventSlug: "mex-rsa", group: "current-match", relevanceScore: 80 }),
        market({ id: "draw", eventSlug: "mex-rsa-draw", group: "current-match", relevanceScore: 70 })
      ],
      "current-match",
      3
    );

    expect(selected.map((item) => item.id)).toEqual(["mex-yes", "draw"]);
  });
});
