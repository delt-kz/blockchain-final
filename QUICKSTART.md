## Quick Start
##!!This is not the part of documentation. It's just a fast guide for developers

## Prerequisites
- Node.js (v18+)
- MetaMask browser extension

## Run Everything (Local Node + Contracts + Frontend)

```bash
npm install && npm start
```

That's it! This single command will:
1. Install dependencies (first time only)
2. Start Hardhat local blockchain
3. Deploy smart contracts
4. Configure frontend with contract addresses
5. Start web server on http://localhost:8000

## Usage

1. Open http://localhost:8000 in your browser
2. In MetaMask, add network:
   - **Network Name**: Hardhat Local
   - **RPC URL**: http://127.0.0.1:8545
   - **Chain ID**: 31337
   - **Currency**: ETH
3. Import a Hardhat test account (check terminal for private keys)
4. Connect wallet and start using the app!

Press `Ctrl+C` to stop all servers.

---

## Sepolia Quick Start (Testnet)

Use this mode for the official test network demo (no local node).

```bash
# 1) Deploy to Sepolia
npm run deploy:sepolia

# 2) Update frontend/contracts.json with the printed addresses

# 3) Serve the frontend
npm run start:sepolia
```

Important:
- Do NOT use `npm start` for Sepolia (it launches a local Hardhat node).
- You need Sepolia test ETH in MetaMask to send transactions.

## Get Sepolia Test ETH (Faucet)

Use one of these faucets to get test ETH:

```
https://www.alchemy.com/faucets          (choose Ethereum Sepolia)
https://faucets.chain.link/sepolia       (Chainlink)
https://faucet.quicknode.com/ethereum/sepolia
```

---

## Manual Commands (Optional)

If you prefer to run services separately:

```bash
# Terminal 1: Start blockchain
npx hardhat node

# Terminal 2: Deploy contracts
npx hardhat run scripts/deploy.ts --network sepolia

# Terminal 3: Update frontend/contracts.json with addresses, then:
npx http-server frontend -p 8000
```

## Test Contracts

```bash
npm test
```
