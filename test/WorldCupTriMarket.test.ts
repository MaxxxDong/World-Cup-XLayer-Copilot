import { expect } from "chai";
import { ethers, network } from "hardhat";
import type { MockERC20, WorldCupTriMarket } from "../typechain-types";

const Outcome = {
  None: 0,
  TeamA: 1,
  TeamB: 2,
  Draw: 3,
  Void: 4
} as const;

describe("WorldCupTriMarket", () => {
  async function deployFixture(feeBps = 0) {
    const [owner, alice, bob, carol, feeRecipient] = await ethers.getSigners();
    const token = (await ethers.deployContract("MockERC20", ["Tether USD", "USDT", 6])) as unknown as MockERC20;
    const market = (await ethers.deployContract("WorldCupTriMarket", [
      token.target,
      feeRecipient.address,
      feeBps
    ])) as unknown as WorldCupTriMarket;
    const unit = 1_000_000n;

    for (const user of [alice, bob, carol]) {
      await token.mint(user.address, 1_000n * unit);
      await token.connect(user).approve(market.target, 1_000n * unit);
    }

    const latest = await ethers.provider.getBlock("latest");
    const closeTime = BigInt(latest!.timestamp + 3600);
    await market.createMarket("group-a-001", "Mexico", "South Africa", closeTime, 100n * unit, 20n * unit);

    return { owner, alice, bob, carol, feeRecipient, token, market, unit };
  }

  it("creates a three-outcome market and derives odds from on-chain pools", async () => {
    const { alice, bob, carol, market, unit } = await deployFixture();

    await market.connect(alice).buy(1, Outcome.TeamA, 10n * unit);
    await market.connect(bob).buy(1, Outcome.TeamB, 5n * unit);
    await market.connect(carol).buy(1, Outcome.Draw, 5n * unit);

    expect(await market.getPools(1)).to.deep.equal([10n * unit, 5n * unit, 5n * unit, 20n * unit]);
    expect(await market.getOddsBps(1)).to.deep.equal([20_000n, 40_000n, 40_000n]);
  });

  it("enforces market and per-user stake limits", async () => {
    const { alice, bob, carol, market, unit } = await deployFixture();

    await expect(market.connect(alice).buy(1, Outcome.TeamA, 21n * unit)).to.be.revertedWithCustomError(
      market,
      "UserLimitExceeded"
    );

    await market.connect(alice).buy(1, Outcome.TeamA, 20n * unit);
    await market.connect(bob).buy(1, Outcome.TeamB, 20n * unit);
    await market.connect(carol).buy(1, Outcome.Draw, 20n * unit);

    await expect(market.connect(alice).buy(1, Outcome.TeamA, 1n * unit)).to.be.revertedWithCustomError(
      market,
      "UserLimitExceeded"
    );
  });

  it("enforces the total market pool limit", async () => {
    const { alice, bob, carol, market, unit } = await deployFixture();
    const latest = await ethers.provider.getBlock("latest");
    const closeTime = BigInt(latest!.timestamp + 3600);
    await market.createMarket("group-a-002", "Canada", "Bosnia", closeTime, 15n * unit, 15n * unit);

    await market.connect(alice).buy(2, Outcome.TeamA, 10n * unit);
    await market.connect(bob).buy(2, Outcome.TeamB, 5n * unit);

    await expect(market.connect(carol).buy(2, Outcome.Draw, 1n * unit)).to.be.revertedWithCustomError(
      market,
      "MarketLimitExceeded"
    );
  });

  it("restricts market administration to the owner", async () => {
    const { alice, market, unit } = await deployFixture();
    const latest = await ethers.provider.getBlock("latest");
    const closeTime = BigInt(latest!.timestamp + 3600);

    await expect(
      market.connect(alice).createMarket("group-a-003", "Spain", "Turkey", closeTime, 100n * unit, 20n * unit)
    )
      .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
    await expect(market.connect(alice).closeMarket(1))
      .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);

    await market.connect(alice).buy(1, Outcome.TeamA, 10n * unit);
    await market.closeMarket(1);
    await expect(market.connect(alice).resolveMarket(1, Outcome.TeamA))
      .to.be.revertedWithCustomError(market, "OwnableUnauthorizedAccount")
      .withArgs(alice.address);
  });

  it("pays winners from the full pool after manual resolution", async () => {
    const { alice, bob, carol, token, market, unit } = await deployFixture();

    await market.connect(alice).buy(1, Outcome.TeamA, 10n * unit);
    await market.connect(bob).buy(1, Outcome.TeamA, 10n * unit);
    await market.connect(carol).buy(1, Outcome.Draw, 20n * unit);
    await market.closeMarket(1);
    await market.resolveMarket(1, Outcome.TeamA);

    const aliceBefore = await token.balanceOf(alice.address);
    await market.connect(alice).claim(1);
    expect((await token.balanceOf(alice.address)) - aliceBefore).to.equal(20n * unit);

    await expect(market.connect(carol).claim(1)).to.be.revertedWithCustomError(market, "NothingToClaim");
  });

  it("prevents resolving to an outcome with no winning pool", async () => {
    const { alice, market, unit } = await deployFixture();

    await market.connect(alice).buy(1, Outcome.TeamA, 10n * unit);
    await market.closeMarket(1);

    await expect(market.resolveMarket(1, Outcome.TeamB)).to.be.revertedWithCustomError(market, "WinningPoolEmpty");
  });

  it("refunds all stakes when a market is voided", async () => {
    const { alice, bob, token, market, unit } = await deployFixture();

    await market.connect(alice).buy(1, Outcome.TeamA, 10n * unit);
    await market.connect(bob).buy(1, Outcome.TeamB, 5n * unit);
    await market.closeMarket(1);
    await market.resolveMarket(1, Outcome.Void);

    const aliceBefore = await token.balanceOf(alice.address);
    await market.connect(alice).claim(1);
    expect((await token.balanceOf(alice.address)) - aliceBefore).to.equal(10n * unit);
  });

  it("prevents claiming before resolution, resolving twice, and claiming twice", async () => {
    const { alice, market, unit } = await deployFixture();

    await market.connect(alice).buy(1, Outcome.TeamA, 10n * unit);
    await expect(market.connect(alice).claim(1)).to.be.revertedWithCustomError(market, "MarketNotResolved");

    await market.closeMarket(1);
    await market.resolveMarket(1, Outcome.TeamA);
    await expect(market.resolveMarket(1, Outcome.TeamA)).to.be.revertedWithCustomError(market, "MarketAlreadyResolved");

    await market.connect(alice).claim(1);
    await expect(market.connect(alice).claim(1)).to.be.revertedWithCustomError(market, "AlreadyClaimed");
  });

  it("deducts configured fees from winner payouts and sends them to the fee recipient", async () => {
    const { alice, bob, feeRecipient, token, market, unit } = await deployFixture(500);

    await market.connect(alice).buy(1, Outcome.TeamA, 10n * unit);
    await market.connect(bob).buy(1, Outcome.TeamB, 10n * unit);
    await market.closeMarket(1);
    await market.resolveMarket(1, Outcome.TeamA);

    const aliceBefore = await token.balanceOf(alice.address);
    await market.connect(alice).claim(1);
    expect((await token.balanceOf(alice.address)) - aliceBefore).to.equal(19n * unit);

    const feeRecipientBefore = await token.balanceOf(feeRecipient.address);
    await market.connect(bob).claimFees(1);
    expect((await token.balanceOf(feeRecipient.address)) - feeRecipientBefore).to.equal(1n * unit);
  });

  it("prevents buying after close time", async () => {
    const { alice, market, unit } = await deployFixture();

    await network.provider.send("evm_increaseTime", [3601]);
    await network.provider.send("evm_mine");

    await expect(market.connect(alice).buy(1, Outcome.TeamA, 1n * unit)).to.be.revertedWithCustomError(
      market,
      "MarketAlreadyClosed"
    );
  });
});
