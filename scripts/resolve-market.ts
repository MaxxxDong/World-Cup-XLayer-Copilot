import { ethers } from "hardhat";
import { readDeployment } from "./deployment-files";

const OUTCOME_INDEX: Record<string, number> = {
  "1": 1,
  teama: 1,
  team_a: 1,
  a: 1,
  "2": 2,
  teamb: 2,
  team_b: 2,
  b: 2,
  "3": 3,
  draw: 3,
  tie: 3,
  "4": 4,
  void: 4,
  refund: 4
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function getContractAddress() {
  const deployment = readDeployment("xlayer-mainnet");
  const contractAddress = process.env.WORLD_CUP_TRI_MARKET_ADDRESS?.trim() || deployment.contractAddress;
  if (!contractAddress) throw new Error("Missing WORLD_CUP_TRI_MARKET_ADDRESS or deployments/xlayer-mainnet.json");
  return contractAddress;
}

async function main() {
  const contractAddress = getContractAddress();
  const marketId = BigInt(requireEnv("MARKET_ID"));
  const rawOutcome = requireEnv("OUTCOME").toLowerCase();
  const outcome = OUTCOME_INDEX[rawOutcome];
  if (!outcome) {
    throw new Error("Invalid OUTCOME. Use TeamA, TeamB, Draw, Void, A, B, 1, 2, 3, or 4.");
  }

  const market = await ethers.getContractAt("WorldCupTriMarket", contractAddress);
  const tx = await market.resolveMarket(marketId, outcome);
  const receipt = await tx.wait();

  console.log(`Resolved market ${marketId.toString()} to outcome ${outcome}`);
  console.log(`Tx: ${tx.hash}`);
  console.log(`Block: ${receipt?.blockNumber ?? "unknown"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
