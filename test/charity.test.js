import { expect } from "chai";
import hre from "hardhat";

describe("CharityCrowdfunding + RewardToken", function () {
  function eth(ethers, wei) {
    return `${ethers.formatEther(wei)} ETH`;
  }

  function log(title, obj) {
    console.log(`\n--- ${title} ---`);
    for (const [k, v] of Object.entries(obj)) console.log(`${k}:`, v);
  }

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

    log("DEPLOYED", {
      deployer: await deployer.getAddress(),
      alice: await alice.getAddress(),
      bob: await bob.getAddress(),
      token: await token.getAddress(),
      charity: await charity.getAddress(),
    });

    return { ethers, deployer, alice, bob, token, charity };
  }

  it("creates a campaign with correct params", async function () {
    const { ethers, charity } = await deployFixture();

    const goal = 1n * 10n ** 18n; // 1 ETH
    const duration = 3600;

    await (await charity.createCampaign("Save cats", goal, duration)).wait();

    const c = await charity.campaigns(0);

    log("CAMPAIGN CREATED", {
      id: 0,
      title: c.title,
      creator: c.creator,
      goalWei: c.goalWei.toString(),
      goalEth: eth(ethers, c.goalWei),
      deadline: c.deadline.toString(),
      raisedWei: c.raisedWei.toString(),
      raisedEth: eth(ethers, c.raisedWei),
      finalized: c.finalized,
    });

    expect(c.title).to.equal("Save cats");
    expect(c.goalWei).to.equal(goal);
    expect(c.finalized).to.equal(false);
    expect(c.raisedWei).to.equal(0n);
    expect(c.creator).to.not.equal("0x0000000000000000000000000000000000000000");
    expect(c.deadline).to.be.greaterThan(0n);
  });

  it("accepts contribution, tracks it, and mints reward tokens", async function () {
    const { ethers, alice, token, charity } = await deployFixture();

    const goal = 2n * 10n ** 18n; // 2 ETH
    const duration = 3600;

    await (await charity.createCampaign("Help kids", goal, duration)).wait();

    const donate = 5n * 10n ** 17n; // 0.5 ETH
    await (await charity.connect(alice).contribute(0, { value: donate })).wait();

    const aliceAddr = await alice.getAddress();
    const contributed = await charity.contributions(0, aliceAddr);
    const c = await charity.campaigns(0);

    const expectedReward = donate * 100n;
    const bal = await token.balanceOf(aliceAddr);

    log("CONTRIBUTION + REWARD", {
      donateWei: donate.toString(),
      donateEth: eth(ethers, donate),
      contributedWei: contributed.toString(),
      contributedEth: eth(ethers, contributed),
      raisedWei: c.raisedWei.toString(),
      raisedEth: eth(ethers, c.raisedWei),
      expectedRewardWei: expectedReward.toString(),
      actualRewardWei: bal.toString(),
    });

    expect(contributed).to.equal(donate);
    expect(c.raisedWei).to.equal(donate);
    expect(bal).to.equal(expectedReward);
  });

  it("does NOT allow contribution after deadline", async function () {
    const { ethers, alice, charity } = await deployFixture();

    const goal = 1n * 10n ** 18n;
    const duration = 2;

    await (await charity.createCampaign("Time limited", goal, duration)).wait();

    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);

    console.log("\n--- DEADLINE REACHED: trying to contribute should revert ---");

    await expect(charity.connect(alice).contribute(0, { value: 1n }))
      .to.be.revertedWith("Campaign ended");
  });

  it("finalize after deadline: if goal reached -> sends ETH to creator", async function () {
    const { ethers, deployer, alice, charity } = await deployFixture();

    const goal = 1n * 10n ** 18n; // 1 ETH
    const duration = 2;

    await (await charity.createCampaign("Goal test", goal, duration)).wait();
    await (await charity.connect(alice).contribute(0, { value: goal })).wait();

    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);

    const deployerAddr = await deployer.getAddress();
    const before = await ethers.provider.getBalance(deployerAddr);

    await (await charity.finalize(0)).wait();

    const after = await ethers.provider.getBalance(deployerAddr);
    const delta = after - before;

    const c = await charity.campaigns(0);
    const contractBal = await ethers.provider.getBalance(await charity.getAddress());

    log("FINALIZE SUCCESS", {
      creatorBeforeWei: before.toString(),
      creatorBeforeEth: eth(ethers, before),
      creatorAfterWei: after.toString(),
      creatorAfterEth: eth(ethers, after),
      creatorDeltaWei: delta.toString(),
      creatorDeltaEth: eth(ethers, delta),
      campaignFinalized: c.finalized,
      campaignRaisedEth: eth(ethers, c.raisedWei),
      contractBalanceAfterEth: eth(ethers, contractBal),
    });

    // creator should receive ~1 ETH (minus nothing here since sender paid gas)
    expect(after).to.be.greaterThan(before + (9n * 10n ** 17n));
    expect(contractBal).to.equal(0n);
  });

  it("finalize after deadline: if goal NOT reached -> contributor can withdraw refund", async function () {
    const { ethers, alice, charity } = await deployFixture();

    const goal = 2n * 10n ** 18n; // 2 ETH
    const duration = 2;

    await (await charity.createCampaign("Not reached", goal, duration)).wait();

    const donate = 5n * 10n ** 17n; // 0.5 ETH
    const aliceAddr = await alice.getAddress();

    await (await charity.connect(alice).contribute(0, { value: donate })).wait();

    await ethers.provider.send("evm_increaseTime", [3]);
    await ethers.provider.send("evm_mine", []);

    await (await charity.finalize(0)).wait();

    const beforeContract = await ethers.provider.getBalance(await charity.getAddress());
    const beforeContrib = await charity.contributions(0, aliceAddr);
    const refundable = await charity.refundableAmount(0, aliceAddr);

    log("BEFORE REFUND", {
      contractBalanceWei: beforeContract.toString(),
      contractBalanceEth: eth(ethers, beforeContract),
      aliceContributionWei: beforeContrib.toString(),
      aliceContributionEth: eth(ethers, beforeContrib),
      refundableWei: refundable.toString(),
      refundableEth: eth(ethers, refundable),
    });

    expect(refundable).to.equal(donate);

    await (await charity.connect(alice).withdrawRefund(0)).wait();

    const afterContract = await ethers.provider.getBalance(await charity.getAddress());
    const afterContrib = await charity.contributions(0, aliceAddr);

    log("AFTER REFUND", {
      contractBalanceWei: afterContract.toString(),
      contractBalanceEth: eth(ethers, afterContract),
      aliceContributionWei: afterContrib.toString(),
      aliceContributionEth: eth(ethers, afterContrib),
    });

    expect(afterContrib).to.equal(0n);
    expect(afterContract).to.equal(0n);
  });
});
