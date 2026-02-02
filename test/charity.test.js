import { expect } from "chai";
import hre from "hardhat";

describe("CharityCrowdfunding + RewardToken", function () {
  async function deployFixture() {
    const { ethers } = await hre.network.connect();
    const [deployer, alice, bob] = await ethers.getSigners();

    const RewardToken = await ethers.getContractFactory("RewardToken", deployer);
    const token = await RewardToken.deploy();
    await token.waitForDeployment();

    const Charity = await ethers.getContractFactory("CharityCrowdfunding", deployer);
    const charity = await Charity.deploy(await token.getAddress());
    await charity.waitForDeployment();

    await (await token.transferOwnership(await charity.getAddress())).wait();

    return { ethers, deployer, alice, bob, token, charity };
  }

  it("creates a campaign with correct params", async function () {
    const { charity } = await deployFixture();

    const goal = 1n * 10n ** 18n; // 1 ETH
    const duration = 3600;

    await (await charity.createCampaign("Save cats", goal, duration)).wait();

    const c = await charity.campaigns(0);
    expect(c.title).to.equal("Save cats");
    expect(c.goalWei).to.equal(goal);
    expect(c.finalized).to.equal(false);
    expect(c.raisedWei).to.equal(0n);
    expect(c.creator).to.not.equal("0x0000000000000000000000000000000000000000");
    expect(c.deadline).to.be.greaterThan(0n);
  });

  it("accepts contribution, tracks it, and mints reward tokens", async function () {
    const { alice, token, charity } = await deployFixture();

    const goal = 2n * 10n ** 18n;
    const duration = 3600;

    await (await charity.createCampaign("Help kids", goal, duration)).wait();

    const donate = 5n * 10n ** 17n; // 0.5 ETH
    await (await charity.connect(alice).contribute(0, { value: donate })).wait();

    const contributed = await charity.contributions(0, await alice.getAddress());
    expect(contributed).to.equal(donate);

    const c = await charity.campaigns(0);
    expect(c.raisedWei).to.equal(donate);

    const expectedReward = donate * 100n;
    const bal = await token.balanceOf(await alice.getAddress());
    expect(bal).to.equal(expectedReward);
  });

  it("does NOT allow contribution after deadline", async function () {
    const { ethers, alice, charity } = await deployFixture();

    const goal = 1n * 10n ** 18n;
    const duration = 2;

    await (await charity.createCampaign("Time limited", goal, duration)).wait();

    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);

    await expect(charity.connect(alice).contribute(0, { value: 1n }))
      .to.be.revertedWith("Campaign ended");
  });

  it("finalize after deadline: if goal reached -> sends ETH to creator", async function () {
    const { ethers, deployer, alice, charity } = await deployFixture();

    const goal = 1n * 10n ** 18n;
    const duration = 2;

    await (await charity.createCampaign("Goal test", goal, duration)).wait();
    await (await charity.connect(alice).contribute(0, { value: goal })).wait();

    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);

    const before = await ethers.provider.getBalance(await deployer.getAddress());

    await (await charity.finalize(0)).wait();

    const after = await ethers.provider.getBalance(await deployer.getAddress());
    expect(after).to.be.greaterThan(before + (9n * 10n ** 17n));
  });

  it("finalize after deadline: if goal NOT reached -> finalized and funds stay in contract", async function () {
    const { ethers, alice, charity } = await deployFixture();

    const goal = 2n * 10n ** 18n;
    const duration = 2;

    await (await charity.createCampaign("Not reached", goal, duration)).wait();

    const donate = 5n * 10n ** 17n;
    await (await charity.connect(alice).contribute(0, { value: donate })).wait();

    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);

    await (await charity.finalize(0)).wait();

    const c = await charity.campaigns(0);
    expect(c.finalized).to.equal(true);

    const contractBal = await ethers.provider.getBalance(await charity.getAddress());
    expect(contractBal).to.equal(donate);
  });
});
