import { describe, expect, it } from "vitest";
import { worldCupMatches2026 } from "../data/worldcup-2026";
import { rankMarkets } from "../domain/market-ranking";
import type { MarketCandidate } from "../shared/types";

const match = worldCupMatches2026[0];

describe("rankMarkets", () => {
  it("ranks exact two-team markets first", () => {
    const markets: MarketCandidate[] = [
      {
        id: "winner",
        title: "Who will win the 2026 World Cup?",
        active: true,
        closed: false,
        officialUrl: "https://polymarket.com/event/world-cup-winner",
        volume: 100000
      },
      {
        id: "match",
        title: "Mexico vs South Africa: Mexico to win?",
        active: true,
        closed: false,
        officialUrl: "https://polymarket.com/event/mexico-south-africa",
        liquidity: 20000
      }
    ];

    const ranked = rankMarkets(match, markets);
    expect(ranked[0].id).toBe("match");
    expect(ranked[0].group).toBe("current-match");
  });

  it("groups one-team winner markets under team-related", () => {
    const ranked = rankMarkets(match, [
      {
        id: "winner",
        title: "Mexico to win the 2026 FIFA World Cup?",
        active: true,
        closed: false,
        officialUrl: "https://polymarket.com/event/world-cup-winner"
      }
    ]);

    expect(ranked[0].group).toBe("team-related");
    expect(ranked[0].relevanceReason).toContain("Mexico");
  });

  it("de-ranks closed markets", () => {
    const ranked = rankMarkets(match, [
      {
        id: "closed",
        title: "Mexico vs South Africa correct score",
        active: false,
        closed: true,
        officialUrl: "https://polymarket.com/event/closed"
      },
      {
        id: "open",
        title: "Mexico to win Group A",
        active: true,
        closed: false,
        officialUrl: "https://polymarket.com/event/open"
      }
    ]);

    expect(ranked[ranked.length - 1].id).toBe("closed");
  });

  it("de-ranks markets that are not accepting orders", () => {
    const ranked = rankMarkets(match, [
      {
        id: "paused",
        title: "Mexico vs South Africa: Mexico to win?",
        active: true,
        closed: false,
        acceptingOrders: false,
        enableOrderBook: true,
        officialUrl: "https://polymarket.com/event/paused"
      },
      {
        id: "tradable",
        title: "Mexico vs South Africa: Mexico to win?",
        active: true,
        closed: false,
        acceptingOrders: true,
        enableOrderBook: true,
        officialUrl: "https://polymarket.com/event/tradable"
      }
    ]);

    expect(ranked[0].id).toBe("tradable");
    expect(ranked[0].scoreParts.acceptingOrders).toBe(6);
    expect(ranked[1].scoreParts.acceptingOrders).toBe(-18);
  });

  it("treats one-outcome markets under a two-team event as current match markets", () => {
    const ranked = rankMarkets(match, [
      {
        id: "mex-win",
        title: "Will Mexico win on 2026-06-11?",
        eventTitle: "Mexico vs. South Africa",
        active: true,
        closed: false,
        officialUrl: "https://polymarket.com/event/fifwc-mex-rsa-2026-06-11"
      }
    ]);

    expect(ranked[0].group).toBe("current-match");
  });

  it("matches aliases with word boundaries and uses data package query seeds", () => {
    const ranked = rankMarkets(
      {
        ...match,
        teamAliases: {
          ...match.teamAliases,
          Mexico: ["MEX", "México"]
        },
        marketSearchQueries: ["México South Africa Group A"]
      },
      [
        {
          id: "seed",
          title: "Mexico City Group A market",
          eventTitle: "South Africa matchup",
          active: true,
          closed: false,
          officialUrl: "https://polymarket.com/event/group-a"
        },
        {
          id: "miss",
          title: "Mexicali local election",
          active: true,
          closed: false,
          officialUrl: "https://polymarket.com/event/mexicali"
        }
      ]
    );

    expect(ranked[0].id).toBe("seed");
    expect(ranked[0].scoreParts.querySeed).toBe(18);
    expect(ranked.find((market) => market.id === "miss")?.scoreParts.oneTeam).toBe(0);
  });
});
