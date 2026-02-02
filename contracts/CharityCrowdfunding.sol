// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "./RewardToken.sol";

contract CharityCrowdfunding {
    struct Campaign {
        string title;
        address payable creator;
        uint256 goalWei;
        uint256 deadline; // unix timestamp
        uint256 raisedWei;
        bool finalized;
    }

    RewardToken public rewardToken;
    uint256 public nextCampaignId;

    // campaignId => Campaign
    mapping(uint256 => Campaign) public campaigns;

    // campaignId => contributor => amountWei
    mapping(uint256 => mapping(address => uint256)) public contributions;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed creator,
        string title,
        uint256 goalWei,
        uint256 deadline
    );

    event Contributed(
        uint256 indexed campaignId,
        address indexed contributor,
        uint256 amountWei,
        uint256 rewardMinted
    );

    event Finalized(uint256 indexed campaignId, bool goalReached, uint256 totalRaisedWei);

    constructor(address rewardTokenAddress) {
        rewardToken = RewardToken(rewardTokenAddress);
    }

    function createCampaign(
        string calldata title,
        uint256 goalWei,
        uint256 durationSeconds
    ) external returns (uint256 campaignId) {
        require(bytes(title).length > 0, "Title required");
        require(goalWei > 0, "Goal must be > 0");
        require(durationSeconds > 0, "Duration must be > 0");

        campaignId = nextCampaignId;
        nextCampaignId++;

        uint256 deadline = block.timestamp + durationSeconds;

        campaigns[campaignId] = Campaign({
            title: title,
            creator: payable(msg.sender),
            goalWei: goalWei,
            deadline: deadline,
            raisedWei: 0,
            finalized: false
        });

        emit CampaignCreated(campaignId, msg.sender, title, goalWei, deadline);
    }

    function contribute(uint256 campaignId) external payable {
        Campaign storage c = campaigns[campaignId];

        require(c.creator != address(0), "Campaign not found");
        require(block.timestamp < c.deadline, "Campaign ended");
        require(!c.finalized, "Campaign finalized");
        require(msg.value > 0, "No ETH sent");

        c.raisedWei += msg.value;
        contributions[campaignId][msg.sender] += msg.value;

        // Reward rate: 100 tokens per 1 ETH donated
        // ERC20 has 18 decimals, so we mint: msg.value * 100
        uint256 reward = msg.value * 100;

        rewardToken.mint(msg.sender, reward);

        emit Contributed(campaignId, msg.sender, msg.value, reward);
    }

    function finalize(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];

        require(c.creator != address(0), "Campaign not found");
        require(!c.finalized, "Already finalized");
        require(block.timestamp >= c.deadline, "Too early");

        c.finalized = true;

        bool goalReached = c.raisedWei >= c.goalWei;

        if (goalReached) {
            // send funds to creator
            (bool ok, ) = c.creator.call{value: c.raisedWei}("");
            require(ok, "Transfer failed");
        }
        // if goal not reached: funds remain in contract (для простоты требований)
        // (если захотим, добавим refund позже)

        emit Finalized(campaignId, goalReached, c.raisedWei);
    }

    function getCampaign(uint256 campaignId)
        external
        view
        returns (
            string memory title,
            address creator,
            uint256 goalWei,
            uint256 deadline,
            uint256 raisedWei,
            bool finalized
        )
    {
        Campaign storage c = campaigns[campaignId];
        require(c.creator != address(0), "Campaign not found");
        return (c.title, c.creator, c.goalWei, c.deadline, c.raisedWei, c.finalized);
    }
}
