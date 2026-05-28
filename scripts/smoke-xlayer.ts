import { ethers } from "hardhat";
import { readDeployment, writeDeployment } from "./deployment-files";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

async function main() {
  const deployment = readDeployment("xlayer-mainnet");
  const contractAddress = process.env.WORLD_CUP_TRI_MARKET_ADDRESS?.trim() || deployment.contractAddress;
  if (!contractAddress) throw new Error("Missing WORLD_CUP_TRI_MARKET_ADDRESS or deployments/xlayer-mainnet.json");

  const stakeTokenAddress = requireEnv("XLAYER_USDT_ADDRESS");
  const [wallet] = await ethers.getSigners();
  const market = await ethers.getContractAt("WorldCupTriMarket", contractAddress);
  const token = await ethers.getContractAt("IERC20", stakeTokenAddress);
  const network = await ethers.provider.getNetwork();
  const unit = 1_000_000n;
  const amount = 100_000n;
  const marketCap = 1n * unit;
  const closeTime = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const smokeId = `smoke-${Date.now()}`;

  const createTx = await market.createMarket(smokeId, "Smoke A", "Smoke B", closeTime, marketCap, marketCap);
  const createReceipt = await createTx.wait();
  const createdEvent = createReceipt?.logs
    .map((log: { topics: readonly string[]; data: string }) => {
      try {
        return market.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((event: { name: string } | null) => event?.name === "MarketCreated");
  const marketId = createdEvent?.args.marketId;
  if (!marketId) throw new Error("Could not find MarketCreated event");

  const approveTx = await token.approve(contractAddress, amount);
  await approveTx.wait();
  const buyTx = await market.buy(marketId, 1, amount);
  await buyTx.wait();
  const closeTx = await market.closeMarket(marketId);
  await closeTx.wait();
  const resolveTx = await market.resolveMarket(marketId, 4);
  await resolveTx.wait();
  const beforeClaim = await token.balanceOf(wallet.address);
  const claimTx = await market.claim(marketId);
  await claimTx.wait();
  const afterClaim = await token.balanceOf(wallet.address);

  writeDeployment("xlayer-mainnet.smoke", {
    network: "xlayer-mainnet",
    chainId: Number(network.chainId),
    contractAddress,
    stakeToken: stakeTokenAddress,
    wallet: wallet.address,
    smokeId,
    marketId: marketId.toString(),
    amountUsdt0: "0.1",
    createTxHash: createTx.hash,
    approveTxHash: approveTx.hash,
    buyTxHash: buyTx.hash,
    closeTxHash: closeTx.hash,
    resolveTxHash: resolveTx.hash,
    claimTxHash: claimTx.hash,
    refundedAmount: (afterClaim - beforeClaim).toString(),
    completedAt: new Date().toISOString()
  });

  console.log(`Smoke market ${marketId.toString()} completed with Void refund.`);
  console.log(`Create: ${createTx.hash}`);
  console.log(`Approve: ${approveTx.hash}`);
  console.log(`Buy: ${buyTx.hash}`);
  console.log(`Close: ${closeTx.hash}`);
  console.log(`Resolve: ${resolveTx.hash}`);
  console.log(`Claim: ${claimTx.hash}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
