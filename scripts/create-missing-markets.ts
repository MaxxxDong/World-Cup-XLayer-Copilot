import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";
import { readDeployment, writeMarketDeployment } from "./deployment-files";

interface MarketSeed {
  matchId: string;
  officialMatchNumber: number;
  teamA: string;
  teamB: string;
  group: string;
  stage: string;
  closeTimeUtc: string;
  regularTimeOnly: boolean;
  settlementSource: string;
  polymarketQuery?: string;
  referenceProbabilities?: Record<string, number>;
  referenceOddsBps?: Record<string, number>;
  referenceOddsSource?: Record<string, unknown>;
}

interface CreatedMarket extends MarketSeed {
  marketId: string;
  contractAddress: string;
  closeTime: number;
  maxTotalPoolUsdt?: string;
  maxUserStakeUsdt?: string;
  txHash?: string;
  blockNumber?: number;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  if (process.env.CREATE_MISSING_MARKETS_CONFIRM !== "YES") {
    throw new Error("Set CREATE_MISSING_MARKETS_CONFIRM=YES to create new mainnet markets.");
  }

  const deployment = readDeployment("xlayer-mainnet") as { contractAddress?: string };
  const contractAddress = process.env.WORLD_CUP_TRI_MARKET_ADDRESS?.trim() || deployment.contractAddress;
  if (!contractAddress) throw new Error("Missing WORLD_CUP_TRI_MARKET_ADDRESS or deployments/xlayer-mainnet.json");

  const seedFile = process.env.MARKET_SEED_FILE?.trim() || "data/matches.initial-mainnet.json";
  const existingMarketsFile = path.join(process.cwd(), "deployments", "xlayer-mainnet.markets.json");
  if (!fs.existsSync(existingMarketsFile)) {
    throw new Error("Missing deployments/xlayer-mainnet.markets.json. Run the initial market creation first.");
  }

  const seeds = JSON.parse(fs.readFileSync(seedFile, "utf8")) as MarketSeed[];
  const existing = JSON.parse(fs.readFileSync(existingMarketsFile, "utf8")) as {
    network: string;
    chainId: number;
    contractAddress: string;
    markets: CreatedMarket[];
  };
  const existingPairs = new Set(existing.markets.map((market) => teamPairKey(market.teamA, market.teamB)));
  const missingSeeds = seeds.filter((seed) => !existingPairs.has(teamPairKey(seed.teamA, seed.teamB)));

  if (!missingSeeds.length) {
    console.log("No missing markets to create.");
    return;
  }

  const maxTotalPool = ethers.parseUnits(requireEnv("MAX_TOTAL_POOL_USDT"), 6);
  const maxUserStake = ethers.parseUnits(requireEnv("MAX_USER_STAKE_USDT"), 6);
  const market = await ethers.getContractAt("WorldCupTriMarket", contractAddress);
  const createdMarkets: CreatedMarket[] = [];

  for (const seed of missingSeeds) {
    const closeTime = Math.floor(Date.parse(seed.closeTimeUtc) / 1000);
    if (!Number.isFinite(closeTime)) throw new Error(`Invalid closeTimeUtc for ${seed.matchId}`);

    const tx = await market.createMarket(seed.matchId, seed.teamA, seed.teamB, closeTime, maxTotalPool, maxUserStake);
    const receipt = await tx.wait();
    const createdEvent = receipt?.logs
      .map((log: { topics: readonly string[]; data: string }) => {
        try {
          return market.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((event: { name: string } | null) => event?.name === "MarketCreated");
    const marketId = createdEvent?.args.marketId;
    if (!marketId) throw new Error(`Could not find MarketCreated event for ${seed.matchId}`);

    createdMarkets.push({
      ...seed,
      marketId: marketId.toString(),
      contractAddress,
      closeTime,
      maxTotalPoolUsdt: process.env.MAX_TOTAL_POOL_USDT,
      maxUserStakeUsdt: process.env.MAX_USER_STAKE_USDT,
      txHash: tx.hash,
      blockNumber: receipt?.blockNumber
    });
    console.log(`Created market ${marketId.toString()}: ${seed.teamA} vs ${seed.teamB}`);
  }

  writeMarketDeployment("xlayer-mainnet", {
    ...existing,
    contractAddress,
    seedFile,
    updatedAt: new Date().toISOString(),
    markets: [...existing.markets, ...createdMarkets].sort((a, b) => (a.officialMatchNumber ?? 0) - (b.officialMatchNumber ?? 0))
  });
}

function teamPairKey(teamA: string, teamB: string): string {
  return [normalizeComparableText(teamA), normalizeComparableText(teamB)].sort().join("|");
}

function normalizeComparableText(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  if (normalized === "usa" || normalized === "u s" || normalized === "u s a" || normalized === "usmnt") {
    return "united states";
  }
  return normalized;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
