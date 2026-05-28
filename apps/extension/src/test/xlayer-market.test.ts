import { afterEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "../services/cache";
import {
  buildXLayerDappUrl,
  searchXLayerMarketsForMatch
} from "../services/xlayer-market";
import { worldCupMatches2026 } from "../data/worldcup-2026";

describe("X Layer market service", () => {
  afterEach(async () => {
    vi.unstubAllGlobals();
    await clearCache();
  });

  it("loads the matching X Layer registry item and emits three outcome candidates", async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/markets.json")) {
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                matchId: "wc-2026-001-mex-rsa",
                marketId: "1",
                officialMatchNumber: 1,
                teamA: "Mexico",
                teamB: "South Africa",
                group: "Group A",
                stage: "Matchday 1",
                closeTimeUtc: "2026-06-11T19:00:00.000Z",
                regularTimeOnly: true,
                settlementSource: "FIFA official result",
                contractAddress: "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
                chainId: 196
              }
            ]),
            { status: 200 }
          )
        );
      }
      if (url.includes("/champion-odds.json") || url.includes("/xlayer-champion.json")) {
        return Promise.resolve(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
      }

      const body = JSON.parse(String(init?.body)) as { params: [{ data: string }] };
      if (body.params[0].data.startsWith("0x62d26ed7")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              result: encodeWords([10_000_000n, 5_000_000n, 5_000_000n, 20_000_000n])
            }),
            { status: 200 }
          )
        );
      }

      if (body.params[0].data.startsWith("0xfb8a4d33")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 2,
              result: encodeWords([20_000n, 40_000n, 40_000n])
            }),
            { status: 200 }
          )
        );
      }

      throw new Error(`Unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const markets = await searchXLayerMarketsForMatch(worldCupMatches2026[0]);

    expect(markets.map((market) => market.outcomeIntent)).toEqual(["teamA", "draw", "teamB"]);
    expect(markets[0]).toMatchObject({
      id: "xlayer:1:teamA",
      title: "Mexico wins in regular time",
      eventTitle: "Mexico vs South Africa",
      provider: "XLayer",
      marketId: "1",
      contractAddress: "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
      chainId: 196,
      poolAmountUsdt: 10,
      totalPoolUsdt: 20,
      payoutMultiple: 2,
      officialUrl: "http://kr.maxfugui.top/?matchId=wc-2026-001-mex-rsa&outcome=teamA&source=world-cup-copilot"
    });
    expect(markets[1]).toMatchObject({
      title: "Draw in regular time",
      poolAmountUsdt: 5,
      payoutMultiple: 4
    });
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining("polymarket"), expect.anything());
  });

  it("still returns dapp intent candidates when RPC odds are unavailable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/markets.json")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  matchId: "wc-2026-001-mex-rsa",
                  marketId: "1",
                  teamA: "Mexico",
                  teamB: "South Africa",
                  contractAddress: "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
                  chainId: 196
                }
              ]),
              { status: 200 }
            )
          );
        }
        if (url.includes("/champion-odds.json") || url.includes("/xlayer-champion.json")) {
          return Promise.resolve(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
        }
        return Promise.reject(new Error("RPC unavailable"));
      })
    );

    const markets = await searchXLayerMarketsForMatch(worldCupMatches2026[0]);

    expect(markets).toHaveLength(3);
    expect(markets[0].title).toBe("Mexico wins in regular time");
    expect(markets[0].payoutMultiple).toBeUndefined();
    expect(markets[0].officialUrl).toContain("outcome=teamA");
  });

  it("uses reference odds when a deployed market has no on-chain liquidity yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/markets.json")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  matchId: "wc-2026-001-mex-rsa",
                  marketId: "1",
                  teamA: "Mexico",
                  teamB: "South Africa",
                  referenceProbabilities: { teamA: 0.66, draw: 0.22, teamB: 0.12 },
                  referenceOddsBps: { teamA: 15152, draw: 45455, teamB: 83333 },
                  contractAddress: "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
                  chainId: 196
                }
              ]),
              { status: 200 }
            )
          );
        }
        if (url.includes("/champion-odds.json") || url.includes("/xlayer-champion.json")) {
          return Promise.resolve(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
        }

        const body = JSON.parse(String(init?.body)) as { params: [{ data: string }] };
        if (body.params[0].data.startsWith("0x62d26ed7")) {
          return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: encodeWords([0n, 0n, 0n, 0n]) }), { status: 200 }));
        }
        if (body.params[0].data.startsWith("0xfb8a4d33")) {
          return Promise.resolve(new Response(JSON.stringify({ jsonrpc: "2.0", id: 2, result: encodeWords([0n, 0n, 0n]) }), { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      })
    );

    const markets = await searchXLayerMarketsForMatch(worldCupMatches2026[0]);

    expect(markets).toHaveLength(3);
    expect(markets[0]).toMatchObject({
      oddsSource: "reference",
      payoutMultiple: 1.5152,
      yesPrice: 0.66,
      acceptingOrders: true
    });
    expect(markets[1]).toMatchObject({
      outcomeIntent: "draw",
      payoutMultiple: 4.5455
    });
  });

  it("returns planned reference candidates for fixtures that are not deployed yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/markets.json")) {
          return Promise.resolve(
            new Response(
              JSON.stringify([
                {
                  matchId: "wc-2026-001-mex-rsa",
                  teamA: "Mexico",
                  teamB: "South Africa",
                  referenceProbabilities: { teamA: 0.66, draw: 0.22, teamB: 0.12 },
                  referenceOddsBps: { teamA: 15152, draw: 45455, teamB: 83333 },
                  contractAddress: "0xA486558db7f0d0e0C9F018e64Ecc737EFA12ade3",
                  chainId: 196
                }
              ]),
              { status: 200 }
            )
          );
        }
        if (url.includes("/champion-odds.json") || url.includes("/xlayer-champion.json")) {
          return Promise.resolve(new Response(JSON.stringify({ entries: [] }), { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      })
    );

    const markets = await searchXLayerMarketsForMatch(worldCupMatches2026[0]);

    expect(markets).toHaveLength(3);
    expect(markets[0]).toMatchObject({
      marketId: undefined,
      oddsSource: "reference",
      acceptingOrders: false,
      enableOrderBook: false
    });
  });

  it("adds champion reference candidates for tournament analysis", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/markets.json")) {
          return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
        }
        if (url.includes("/champion-odds.json") || url.includes("/xlayer-champion.json")) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                entries: [
                  { team: "Spain", probability: 0.17, oddsBps: 58824 },
                  { team: "Mexico", probability: 0.08, oddsBps: 125000 }
                ]
              }),
              { status: 200 }
            )
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      })
    );

    const markets = await searchXLayerMarketsForMatch(worldCupMatches2026[0]);

    expect(markets.some((market) => market.title === "Spain wins 2026 World Cup")).toBe(true);
    expect(markets.find((market) => market.title === "Mexico wins 2026 World Cup")).toMatchObject({
      oddsSource: "reference",
      acceptingOrders: false,
      payoutMultiple: 12.5
    });
  });

  it("builds a dapp fallback URL from the detected fixture", () => {
    expect(buildXLayerDappUrl(worldCupMatches2026[0])).toBe(
      "http://kr.maxfugui.top/?matchId=2026-group-a-mexico-south-africa&source=world-cup-copilot"
    );
  });
});

function encodeWords(values: bigint[]): string {
  return `0x${values.map((value) => value.toString(16).padStart(64, "0")).join("")}`;
}
