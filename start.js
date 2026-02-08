import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import process from "node:process";

const RPC_HOST = "127.0.0.1";
const RPC_PORT = 8545;
const HTTP_PORT = 8000;

const CONTRACTS_PATH = path.join("frontend", "contracts.json");

let nodeProc = null;
let serverProc = null;

function cleanup(exitCode = 0) {
  if (serverProc?.pid) {
    serverProc.kill("SIGTERM");
  }
  if (nodeProc?.pid) {
    nodeProc.kill("SIGTERM");
  }
  process.exit(exitCode);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(host, port, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect(port, host);
        socket.once("connect", () => {
          socket.end();
          resolve();
        });
        socket.once("error", reject);
      });
      return true;
    } catch {
      await sleep(500);
    }
  }
  throw new Error(`RPC not available at http://${host}:${port}`);
}

function spawnProcess(command, args, options = {}) {
  const child = spawn(command, args, { shell: true, ...options });
  child.on("error", (err) => {
    console.error(`Failed to start ${command}:`, err);
  });
  return child;
}

async function deployContracts() {
  return new Promise((resolve, reject) => {
    const deploy = spawnProcess(
      "npx",
      ["hardhat", "run", "scripts/deploy.ts", "--network", "localhost"],
      { stdio: ["ignore", "pipe", "inherit"] }
    );

    let rewardTokenAddress = null;
    let crowdfundingAddress = null;

    deploy.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(text);

      const rewardMatch = text.match(/RewardToken deployed to:\s*(0x[a-fA-F0-9]{40})/);
      if (rewardMatch) {
        rewardTokenAddress = rewardMatch[1];
      }

      const crowdMatch = text.match(
        /CharityCrowdfunding deployed to:\s*(0x[a-fA-F0-9]{40})/
      );
      if (crowdMatch) {
        crowdfundingAddress = crowdMatch[1];
      }
    });

    deploy.on("exit", (code) => {
      if (code !== 0) {
        reject(new Error(`Deploy failed with exit code ${code}`));
        return;
      }
      if (!rewardTokenAddress || !crowdfundingAddress) {
        reject(new Error("Could not parse deployed contract addresses."));
        return;
      }
      resolve({ rewardTokenAddress, crowdfundingAddress });
    });
  });
}

async function writeContractsConfig({ rewardTokenAddress, crowdfundingAddress }) {
  const config = {
    network: "localhost",
    chainId: 31337,
    rewardToken: {
      address: rewardTokenAddress,
      artifactPath: "artifacts/contracts/RewardToken.sol/RewardToken.json",
    },
    crowdfunding: {
      address: crowdfundingAddress,
      artifactPath:
        "artifacts/contracts/CharityCrowdfunding.sol/CharityCrowdfunding.json",
    },
  };

  await fs.writeFile(CONTRACTS_PATH, JSON.stringify(config, null, 2));
}

async function main() {
  console.log("Starting Hardhat local node...");
  nodeProc = spawnProcess("npx", ["hardhat", "node"], {
    stdio: "inherit",
  });

  process.on("SIGINT", () => {
    cleanup(0);
  });

  process.on("SIGTERM", () => {
    cleanup(0);
  });

  nodeProc.on("exit", (code) => {
    if (code !== 0) {
      console.error(`Hardhat node exited with code ${code}`);
      cleanup(code ?? 1);
    }
  });

  await waitForPort(RPC_HOST, RPC_PORT);

  console.log("Deploying contracts...");
  const { rewardTokenAddress, crowdfundingAddress } = await deployContracts();
  await writeContractsConfig({ rewardTokenAddress, crowdfundingAddress });
  console.log("Updated frontend/contracts.json");

  console.log(`Starting frontend on http://localhost:${HTTP_PORT}`);
  serverProc = spawnProcess(
    "npx",
    ["http-server", "frontend", "-p", String(HTTP_PORT)],
    { stdio: "inherit" }
  );

  serverProc.on("exit", (code) => {
    if (code !== 0) {
      console.error(`http-server exited with code ${code}`);
      cleanup(code ?? 1);
    }
  });
}

main().catch((error) => {
  console.error(error);
  cleanup(1);
});
