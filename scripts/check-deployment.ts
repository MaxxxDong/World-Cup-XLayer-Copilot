import { ethers } from "hardhat";
import { readDeployment } from "./deployment-files";

const erc20MetadataAbi = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

function getContractAddress() {
  const deployment = readDeployment("xlayer-mainnet");
  const contractAddress = process.env.WORLD_CUP_TRI_MARKET_ADDRESS?.trim() || deployment.contractAddress;
  if (!contractAddress) throw new Error("Missing WORLD_CUP_TRI_MARKET_ADDRESS or deployments/xlayer-mainnet.json");
  return contractAddress;
}

async function main() {
  const contractAddress = getContractAddress();
  const market = await ethers.getContractAt("WorldCupTriMarket", contractAddress);
  const network = await ethers.provider.getNetwork();
  const stakeTokenAddress = await market.stakeToken();
  const token = new ethers.Contract(stakeTokenAddress, erc20MetadataAbi, ethers.provider);
  const configuredStakeToken = process.env.XLAYER_USDT_ADDRESS?.trim();

  const [owner, feeRecipient, feeBps, nextMarketId, tokenName, tokenSymbol, tokenDecimals] = await Promise.all([
    market.owner(),
    market.feeRecipient(),
    market.feeBps(),
    market.nextMarketId(),
    token.name(),
    token.symbol(),
    token.decimals()
  ]);

  if (Number(network.chainId) !== 196) {
    throw new Error(`Unexpected chain ID ${network.chainId.toString()}; expected X Layer mainnet 196`);
  }

  if (configuredStakeToken && configuredStakeToken.toLowerCase() !== stakeTokenAddress.toLowerCase()) {
    throw new Error(`Stake token mismatch: contract=${stakeTokenAddress}, env=${configuredStakeToken}`);
  }

  console.log("WorldCupTriMarket deployment sanity check");
  console.log(`Network chain ID: ${network.chainId.toString()}`);
  console.log(`Contract: ${contractAddress}`);
  console.log(`Owner: ${owner}`);
  console.log(`Stake token: ${stakeTokenAddress}`);
  console.log(`Stake token metadata: ${tokenName} / ${tokenSymbol} / decimals ${tokenDecimals.toString()}`);
  console.log(`Fee recipient: ${feeRecipient}`);
  console.log(`Fee bps: ${feeBps.toString()}`);
  console.log(`Next market ID: ${nextMarketId.toString()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
