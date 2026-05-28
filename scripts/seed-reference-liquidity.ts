import fs from "node:fs";
import path from "node:path";
import { ethers } from "hardhat";
import { readDeployment } from "./deployment-files";

const erc20Abi = [
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function balanceOf(address owner) view returns (uint256)"
];

interface MarketSeed {
  matchId: string;
  teamA: string;
  teamB: string;
  referenceProbabilities?: {
    teamA?: number;
    draw?: number;
    teamB?: number;
  };
}

interface DeployedMarket {
  matchId: string;
  marketId: string;
  teamA: string;
  teamB: string;
}

async function main() {
  if (process.env.SEED_LIQUIDITY_CONFIRM !== "YES") {
    throw new Error("Set SEED_LIQUIDITY_CONFIRM=YES to spend real USDT0 and seed deployed market pools.");
  }

  const deployment = readDeployment("xlayer-mainnet") as { contractAddress?: string; stakeToken?: string };
  const contractAddress = process.env.WORLD_CUP_TRI_MARKET_ADDRESS?.trim() || deployment.contractAddress;
  const stakeToken = process.env.STAKE_TOKEN?.trim() || deployment.stakeToken;
  if (!contractAddress || !stakeToken) {
    throw new Error("Missing contractAddress or stakeToken in deployments/xlayer-mainnet.json.");
  }

  const seedTotalUsdt = Number(process.env.SEED_TOTAL_USDT ?? "1");
  if (!Number.isFinite(seedTotalUsdt) || seedTotalUsdt <= 0) throw new Error("SEED_TOTAL_USDT must be positive.");
  const limit = Number(process.env.SEED_MARKET_LIMIT ?? "0");

  const seedFile = process.env.MARKET_SEED_FILE?.trim() || "data/matches.initial-mainnet.json";
  const marketsFile = path.join(process.cwd(), "deployments", "xlayer-mainnet.markets.json");
  const seeds = JSON.parse(fs.readFileSync(seedFile, "utf8")) as MarketSeed[];
  const deployed = JSON.parse(fs.readFileSync(marketsFile, "utf8")) as { markets: DeployedMarket[] };
  const seedByPair = new Map(seeds.map((seed) => [teamPairKey(seed.teamA, seed.teamB), seed]));
  const markets = deployed.markets
    .filter((market) => seedByPair.has(teamPairKey(market.teamA, market.teamB)))
    .slice(0, limit > 0 ? limit : undefined);

  const [signer] = await ethers.getSigners();
  const marketContract = await ethers.getContractAt("WorldCupTriMarket", contractAddress);
  const token = await ethers.getContractAt(erc20Abi, stakeToken, signer);
  const seedAmount = ethers.parseUnits(seedTotalUsdt.toFixed(6), 6);
  const totalNeeded = seedAmount * BigInt(markets.length);
  const balance = await token.balanceOf(signer.address);
  if (balance < totalNeeded) {
    throw new Error(`Insufficient USDT0 balance. Need ${ethers.formatUnits(totalNeeded, 6)}, have ${ethers.formatUnits(balance, 6)}.`);
  }

  const allowance = await token.allowance(signer.address, contractAddress);
  if (allowance < totalNeeded) {
    const tx = await token.approve(contractAddress, totalNeeded);
    await tx.wait();
    console.log(`Approved ${ethers.formatUnits(totalNeeded, 6)} USDT0 for market contract.`);
  }

  for (const market of markets) {
    const seed = seedByPair.get(teamPairKey(market.teamA, market.teamB));
    if (!seed?.referenceProbabilities) continue;

    const pools = await marketContract.getPools(BigInt(market.marketId));
    if (pools[3] > 0n && process.env.SEED_EXISTING_POOLS !== "true") {
      console.log(`Skip market ${market.marketId}; pool already has ${ethers.formatUnits(pools[3], 6)} USDT0.`);
      continue;
    }

    const amounts = amountsFromProbabilities(seedAmount, seed.referenceProbabilities);
    for (const [outcome, amount] of amounts) {
      if (amount <= 0n) continue;
      const tx = await marketContract.buy(BigInt(market.marketId), outcome, amount);
      await tx.wait();
      console.log(`Seeded market ${market.marketId}, outcome ${outcome}, amount ${ethers.formatUnits(amount, 6)} USDT0.`);
    }
  }
}

function amountsFromProbabilities(
  total: bigint,
  probabilities: NonNullable<MarketSeed["referenceProbabilities"]>
): Array<[1 | 2 | 3, bigint]> {
  const teamA = probabilityAmount(total, probabilities.teamA ?? 0);
  const draw = probabilityAmount(total, probabilities.draw ?? 0);
  const teamB = total > teamA + draw ? total - teamA - draw : probabilityAmount(total, probabilities.teamB ?? 0);
  return [
    [1, teamA],
    [3, draw],
    [2, teamB]
  ];
}

function probabilityAmount(total: bigint, probability: number): bigint {
  if (!Number.isFinite(probability) || probability <= 0) return 0n;
  const scaled = BigInt(Math.max(1, Math.round(probability * 1_000_000)));
  return (total * scaled) / 1_000_000n;
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
