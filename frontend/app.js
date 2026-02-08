import { ethers } from "https://cdn.jsdelivr.net/npm/ethers@6.12.1/dist/ethers.min.js";

const CONFIG_PATH = "./contracts.json";

const CROWDFUNDING_ABI = [
  "function createCampaign(string title, uint256 goalWei, uint256 durationSeconds) returns (uint256)",
  "function contribute(uint256 campaignId) payable",
  "function finalize(uint256 campaignId)",
  "function getCampaign(uint256 campaignId) view returns (string title, address creator, uint256 goalWei, uint256 deadline, uint256 raisedWei, bool finalized)",
  "function nextCampaignId() view returns (uint256)",
  "function contributions(uint256 campaignId, address user) view returns (uint256)",
  "event CampaignCreated(uint256 indexed campaignId, address indexed creator, string title, uint256 goalWei, uint256 deadline)",
  "event Contributed(uint256 indexed campaignId, address indexed contributor, uint256 amountWei, uint256 rewardMinted)",
  "event Finalized(uint256 indexed campaignId, bool goalReached, uint256 totalRaisedWei)",
];

const TOKEN_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

const NETWORKS = {
  11155111: "Sepolia",
  31337: "Hardhat Local",
};

const state = {
  provider: null,
  signer: null,
  account: null,
  chainId: null,
  networkOk: false,
  config: null,
  contracts: {},
  tokenMeta: {
    decimals: 18,
    symbol: "CRWD",
  },
};

const elements = {
  connectBtn: document.getElementById("connectBtn"),
  createForm: document.getElementById("createForm"),
  refreshBtn: document.getElementById("refreshBtn"),
  titleInput: document.getElementById("titleInput"),
  goalInput: document.getElementById("goalInput"),
  durationInput: document.getElementById("durationInput"),
  campaigns: document.getElementById("campaigns"),
  status: document.getElementById("status"),
  networkName: document.getElementById("networkName"),
  walletAddress: document.getElementById("walletAddress"),
  ethBalance: document.getElementById("ethBalance"),
  tokenBalance: document.getElementById("tokenBalance"),
  walletNote: document.getElementById("walletNote"),
  networkCopy: document.getElementById("networkCopy"),
  crowdfundingAddress: document.getElementById("crowdfundingAddress"),
  tokenAddress: document.getElementById("tokenAddress"),
};

function setStatus(message, type = "info") {
  elements.status.textContent = message;
  elements.status.className = `status ${type === "info" ? "" : type}`.trim();
}

function clearStatus() {
  elements.status.textContent = "";
  elements.status.className = "status";
}

function shortenAddress(address) {
  if (!address) return "-";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatEth(value) {
  try {
    return Number.parseFloat(ethers.formatEther(value)).toFixed(4);
  } catch {
    return "0.0000";
  }
}

function formatToken(value) {
  try {
    const formatted = ethers.formatUnits(value, state.tokenMeta.decimals);
    return `${Number.parseFloat(formatted).toFixed(2)} ${state.tokenMeta.symbol}`;
  } catch {
    return `0.00 ${state.tokenMeta.symbol}`;
  }
}

function formatDeadline(seconds) {
  const date = new Date(Number(seconds) * 1000);
  return date.toLocaleString();
}

async function loadConfig() {
  const response = await fetch(CONFIG_PATH);
  if (!response.ok) {
    throw new Error("Unable to load contracts.json");
  }
  return response.json();
}

async function ensureProvider() {
  if (!window.ethereum) {
    setStatus("MetaMask not detected. Please install or enable it.", "error");
    return false;
  }
  state.provider = new ethers.BrowserProvider(window.ethereum);
  return true;
}

function getExpectedNetworkLabel() {
  if (!state.config?.chainId) return "the configured test network";
  return NETWORKS[state.config.chainId] || `Chain ${state.config.chainId}`;
}

function updateNetworkCopy() {
  if (!elements.networkCopy) return;
  const expected = getExpectedNetworkLabel();
  elements.networkCopy.textContent =
    "Create campaigns, fund meaningful goals, and earn CRWD reward tokens " +
    `for every contribution. Built for ${expected}.`;
}

function isSupportedNetwork(chainId) {
  if (!state.config?.chainId) return false;
  return Number(chainId) === Number(state.config.chainId);
}

async function connectWallet() {
  try {
    const accounts = await window.ethereum.request({
      method: "eth_requestAccounts",
    });
    if (accounts.length) {
      state.account = accounts[0];
      state.signer = await state.provider.getSigner();
      await refreshNetwork();
      await hydrateContracts();
      await refreshWallet();
      await loadCampaigns();
      if (state.networkOk) {
        clearStatus();
      }
    }
  } catch (error) {
    handleError(error, "Connection rejected.");
  }
}

async function refreshNetwork() {
  const network = await state.provider.getNetwork();
  const chainId = Number(network.chainId);
  state.chainId = chainId;
  const label = NETWORKS[chainId] || `Chain ${chainId}`;
  elements.networkName.textContent = label;

  if (!isSupportedNetwork(chainId)) {
    const expected = getExpectedNetworkLabel();
    setStatus(`Wrong network. Please switch to ${expected}.`, "warning");
    elements.walletNote.textContent = `Switch MetaMask to ${expected} to use this DApp.`;
    state.networkOk = false;
    toggleActions(false);
    return false;
  }

  elements.walletNote.textContent = `Connected to ${getExpectedNetworkLabel()}. Ready to create and fund campaigns.`;
  state.networkOk = true;
  toggleActions(true);
  return true;
}

function toggleActions(enabled) {
  const buttons = document.querySelectorAll(
    "#createForm button, .campaign-card button, #refreshBtn"
  );
  buttons.forEach((btn) => {
    btn.disabled = !enabled;
  });
}

async function hydrateContracts() {
  const { rewardToken, crowdfunding } = state.config;
  elements.crowdfundingAddress.textContent = crowdfunding.address;
  elements.tokenAddress.textContent = rewardToken.address;

  const signerOrProvider = state.signer ?? state.provider;
  state.contracts.crowdfunding = new ethers.Contract(
    crowdfunding.address,
    CROWDFUNDING_ABI,
    signerOrProvider
  );
  state.contracts.token = new ethers.Contract(
    rewardToken.address,
    TOKEN_ABI,
    signerOrProvider
  );

  try {
    const [decimals, symbol] = await Promise.all([
      state.contracts.token.decimals(),
      state.contracts.token.symbol(),
    ]);
    state.tokenMeta = { decimals: Number(decimals), symbol };
  } catch {
    state.tokenMeta = { decimals: 18, symbol: "CRWD" };
  }
}

async function refreshWallet() {
  if (!state.account) {
    elements.walletAddress.textContent = "-";
    elements.ethBalance.textContent = "-";
    elements.tokenBalance.textContent = "-";
    return;
  }

  elements.walletAddress.textContent = shortenAddress(state.account);
  if (!state.networkOk) {
    elements.ethBalance.textContent = "-";
    elements.tokenBalance.textContent = "-";
    return;
  }
  const [ethBalance, tokenBalance] = await Promise.all([
    state.provider.getBalance(state.account),
    state.contracts.token.balanceOf(state.account),
  ]);
  elements.ethBalance.textContent = `${formatEth(ethBalance)} ETH`;
  elements.tokenBalance.textContent = formatToken(tokenBalance);
}

async function createCampaign(event) {
  event.preventDefault();
  if (!state.contracts.crowdfunding || !state.signer) {
    setStatus("Connect your wallet first.", "warning");
    return;
  }

  const title = elements.titleInput.value.trim();
  const goalEth = Number(elements.goalInput.value);
  const durationHours = Number(elements.durationInput.value);

  if (!title || !goalEth || !durationHours) {
    setStatus("Fill in all campaign fields.", "warning");
    return;
  }

  try {
    const goalWei = ethers.parseEther(goalEth.toString());
    const durationSeconds = Math.floor(durationHours * 3600);
    setStatus("Submitting campaign transaction...", "info");
    const tx = await state.contracts.crowdfunding.createCampaign(
      title,
      goalWei,
      durationSeconds
    );
    await tx.wait();
    setStatus("Campaign created successfully.", "success");
    elements.createForm.reset();
    await loadCampaigns();
  } catch (error) {
    handleError(error, "Failed to create campaign.");
  }
}

async function contributeToCampaign(campaignId, amountEth) {
  if (!state.signer) {
    setStatus("Connect your wallet first.", "warning");
    return;
  }

  if (!amountEth || Number(amountEth) <= 0) {
    setStatus("Enter a valid contribution amount.", "warning");
    return;
  }

  try {
    const value = ethers.parseEther(amountEth.toString());
    setStatus("Sending contribution...", "info");
    const tx = await state.contracts.crowdfunding.contribute(campaignId, {
      value,
    });
    await tx.wait();
    setStatus("Contribution confirmed.", "success");
    await refreshWallet();
    await loadCampaigns();
  } catch (error) {
    handleError(error, "Contribution failed.");
  }
}

async function finalizeCampaign(campaignId) {
  if (!state.signer) {
    setStatus("Connect your wallet first.", "warning");
    return;
  }

  try {
    setStatus("Finalizing campaign...", "info");
    const tx = await state.contracts.crowdfunding.finalize(campaignId);
    await tx.wait();
    setStatus("Campaign finalized.", "success");
    await refreshWallet();
    await loadCampaigns();
  } catch (error) {
    handleError(error, "Finalize failed.");
  }
}

async function loadCampaigns() {
  if (!state.contracts.crowdfunding) return;
  elements.campaigns.innerHTML = "";

  try {
    if (!state.networkOk) {
      const expected = getExpectedNetworkLabel();
      elements.campaigns.innerHTML = `<p class="mono">Switch MetaMask to ${expected} to view campaigns.</p>`;
      return;
    }
    const total = await state.contracts.crowdfunding.nextCampaignId();
    const count = Number(total);
    if (count === 0) {
      elements.campaigns.innerHTML =
        '<p class="mono">No campaigns yet. Create the first one.</p>';
      return;
    }

    const campaignPromises = Array.from({ length: count }, (_, index) =>
      state.contracts.crowdfunding.getCampaign(index)
    );
    const campaigns = await Promise.all(campaignPromises);

    const contributionPromises = campaigns.map((_, index) => {
      if (!state.account) return Promise.resolve(0n);
      return state.contracts.crowdfunding.contributions(index, state.account);
    });
    const contributions = await Promise.all(contributionPromises);

    campaigns.forEach((campaign, index) => {
      const [title, creator, goalWei, deadline, raisedWei, finalized] =
        campaign;
      const contribution = contributions[index];
      const progress =
        Number(ethers.formatEther(raisedWei)) /
        Number(ethers.formatEther(goalWei));
      const progressPct = Math.min(progress * 100, 100);
      const nowSeconds = Math.floor(Date.now() / 1000);
      const ended = Number(deadline) <= nowSeconds;

      const card = document.createElement("div");
      card.className = "campaign-card";
      card.innerHTML = `
        <div class="campaign-title">${title}</div>
        <div class="campaign-meta">
          <div><strong>Creator:</strong> ${shortenAddress(creator)}</div>
          <div><strong>Goal:</strong> ${formatEth(goalWei)} ETH</div>
          <div><strong>Raised:</strong> ${formatEth(raisedWei)} ETH</div>
          <div><strong>Deadline:</strong> ${formatDeadline(deadline)}</div>
          <div><strong>Status:</strong> ${finalized ? "Finalized" : ended ? "Ended" : "Active"}</div>
          <div><strong>Your contribution:</strong> ${formatEth(contribution)} ETH</div>
        </div>
        <div class="progress"><span style="width: ${progressPct}%;"></span></div>
        <div class="campaign-actions">
          <label class="field">
            <span>Contribute (ETH)</span>
            <input type="number" min="0.001" step="0.001" placeholder="0.05" />
          </label>
          <button class="btn primary">Contribute</button>
          <button class="btn ghost">Finalize</button>
        </div>
      `;

      const amountInput = card.querySelector("input");
      const contributeBtn = card.querySelector(".btn.primary");
      const finalizeBtn = card.querySelector(".btn.ghost");

      contributeBtn.addEventListener("click", () =>
        contributeToCampaign(index, amountInput.value)
      );
      finalizeBtn.addEventListener("click", () => finalizeCampaign(index));

      if (!state.account || !state.networkOk || finalized || ended) {
        contributeBtn.disabled = true;
      }
      if (!state.account || !state.networkOk || finalized || !ended) {
        finalizeBtn.disabled = true;
      }

      elements.campaigns.appendChild(card);
    });
  } catch (error) {
    handleError(error, "Unable to load campaigns.");
  }
}

function handleError(error, fallbackMessage) {
  if (error?.code === 4001) {
    setStatus("Transaction rejected in MetaMask.", "warning");
    return;
  }
  const message =
    error?.shortMessage || error?.message || fallbackMessage || "Error";
  setStatus(message, "error");
}

async function init() {
  try {
    const providerReady = await ensureProvider();
    if (!providerReady) return;

    state.config = await loadConfig();
    updateNetworkCopy();
    await refreshNetwork();
    await hydrateContracts();

    const accounts = await window.ethereum.request({
      method: "eth_accounts",
    });
    if (accounts.length) {
      state.account = accounts[0];
      state.signer = await state.provider.getSigner();
      await refreshWallet();
    }

    await loadCampaigns();

    elements.connectBtn.addEventListener("click", connectWallet);
    elements.createForm.addEventListener("submit", createCampaign);
    elements.refreshBtn.addEventListener("click", loadCampaigns);

    window.ethereum.on("accountsChanged", async (accounts) => {
      state.account = accounts[0] || null;
      state.signer = state.account ? await state.provider.getSigner() : null;
      await hydrateContracts();
      await refreshWallet();
      await loadCampaigns();
    });

    window.ethereum.on("chainChanged", async () => {
      await refreshNetwork();
      await hydrateContracts();
      await refreshWallet();
      await loadCampaigns();
    });
  } catch (error) {
    handleError(error, "Initialization failed.");
  }
}

init();
