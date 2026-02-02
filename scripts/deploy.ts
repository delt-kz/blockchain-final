import hre from "hardhat";

async function main() {
  // Hardhat v3 style
  const { ethers } = await hre.network.connect();

  // 1) Deploy RewardToken
  const RewardToken = await ethers.getContractFactory("RewardToken");
  const rewardToken = await RewardToken.deploy();
  await rewardToken.waitForDeployment();

  const rewardTokenAddress = await rewardToken.getAddress();
  console.log("RewardToken deployed to:", rewardTokenAddress);

  // 2) Deploy CharityCrowdfunding(rewardTokenAddress)
  const CharityCrowdfunding = await ethers.getContractFactory("CharityCrowdfunding");
  const crowdfunding = await CharityCrowdfunding.deploy(rewardTokenAddress);
  await crowdfunding.waitForDeployment();

  const crowdfundingAddress = await crowdfunding.getAddress();
  console.log("CharityCrowdfunding deployed to:", crowdfundingAddress);

  // 3) Transfer ownership so crowdfunding can mint rewards
  const tx = await rewardToken.transferOwnership(crowdfundingAddress);
  await tx.wait();

  console.log("RewardToken ownership transferred to:", crowdfundingAddress);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
