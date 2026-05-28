import { ethers } from "hardhat";
import { readDeployment } from "./deployment-files";

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
  const market = await ethers.getContractAt("WorldCupTriMarket", contractAddress);
  const tx = await market.closeMarket(marketId);
  const receipt = await tx.wait();

  console.log(`Closed market ${marketId.toString()}`);
  console.log(`Tx: ${tx.hash}`);
  console.log(`Block: ${receipt?.blockNumber ?? "unknown"}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
