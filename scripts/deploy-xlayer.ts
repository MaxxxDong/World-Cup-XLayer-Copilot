import { ethers } from "hardhat";
import { writeDeployment } from "./deployment-files";

async function main() {
  const stakeToken = process.env.XLAYER_USDT_ADDRESS;
  const feeRecipient = process.env.FEE_RECIPIENT;
  const ownerAddress = process.env.OWNER_ADDRESS;
  const feeBps = Number(process.env.FEE_BPS ?? "0");

  if (!stakeToken) throw new Error("Missing XLAYER_USDT_ADDRESS");
  if (!feeRecipient) throw new Error("Missing FEE_RECIPIENT");
  if (!ownerAddress) throw new Error("Missing OWNER_ADDRESS");

  const [deployer] = await ethers.getSigners();
  const network = await ethers.provider.getNetwork();
  const market = await ethers.deployContract("WorldCupTriMarket", [stakeToken, feeRecipient, feeBps]);
  await market.waitForDeployment();
  const deploymentTx = market.deploymentTransaction();
  const deploymentReceipt = deploymentTx ? await deploymentTx.wait() : undefined;

  let ownershipTransferTxHash: string | undefined;
  if (ownerAddress.toLowerCase() !== deployer.address.toLowerCase()) {
    const transferTx = await market.transferOwnership(ownerAddress);
    await transferTx.wait();
    ownershipTransferTxHash = transferTx.hash;
  }

  console.log(`WorldCupTriMarket deployed to ${market.target}`);
  console.log(`Stake token: ${stakeToken}`);
  console.log(`Fee recipient: ${feeRecipient}`);
  console.log(`Fee bps: ${feeBps}`);
  console.log(`Owner: ${ownerAddress}`);

  writeDeployment("xlayer-mainnet", {
    project: "world-cup-xlayer-copilot",
    network: "xlayer-mainnet",
    chainId: Number(network.chainId),
    contractName: "WorldCupTriMarket",
    contractAddress: market.target,
    stakeToken,
    feeRecipient,
    feeBps,
    deployer: deployer.address,
    owner: ownerAddress,
    deploymentTxHash: deploymentTx?.hash,
    deploymentBlockNumber: deploymentReceipt?.blockNumber,
    ownershipTransferTxHash,
    deployedAt: new Date().toISOString()
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
