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
  polymarketQuery: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const deployment = readDeployment("xlayer-mainnet");
  const contractAddress = process.env.WORLD_CUP_TRI_MARKET_ADDRESS?.trim() || deployment.contractAddress;
  if (!contractAddress) throw new Error("Missing WORLD_CUP_TRI_MARKET_ADDRESS or deployments/xlayer-mainnet.json");

  const seedFile = process.env.MARKET_SEED_FILE?.trim() || "data/matches.initial-mainnet.json";
  const existingMarketsFile = path.join(process.cwd(), "deployments", "xlayer-mainnet.markets.json");
  if (fs.existsSync(existingMarketsFile) && process.env.ALLOW_MARKET_RECREATE !== "true") {
    const existing = JSON.parse(fs.readFileSync(existingMarketsFile, "utf8")) as { contractAddress?: string };
    if (existing.contractAddress?.toLowerCase() === contractAddress.toLowerCase()) {
      throw new Error("Market deployment file already exists for this contract. Set ALLOW_MARKET_RECREATE=true only if you intentionally want to create another batch.");
    }
  }

  const maxTotalPool = ethers.parseUnits(requireEnv("MAX_TOTAL_POOL_USDT"), 6);
  const maxUserStake = ethers.parseUnits(requireEnv("MAX_USER_STAKE_USDT"), 6);
  const seeds = JSON.parse(fs.readFileSync(seedFile, "utf8")) as MarketSeed[];
  const market = await ethers.getContractAt("WorldCupTriMarket", contractAddress);
  const network = await ethers.provider.getNetwork();
  const createdMarkets = [];

  for (const seed of seeds) {
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
    network: "xlayer-mainnet",
    chainId: Number(network.chainId),
    contractAddress,
    seedFile,
    createdAt: new Date().toISOString(),
    markets: createdMarkets
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
