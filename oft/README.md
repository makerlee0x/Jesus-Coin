# JESUS OFT bridge (Ethereum ⇄ Robinhood Chain)

LayerZero V2 bridge for JESUS (`0xba386A4Ca26B85FD057ab1Ef86e3DC7BdeB5ce70` on Ethereum).

| Contract | Chain | What it does |
|---|---|---|
| `JesusBridge` | Ethereum | Locks JESUS when it leaves Ethereum, releases it when it comes back |
| `JesusOFT` | Robinhood Chain | ERC-20 "JESUS" (18 decimals), minted on arrival, burned on departure |

The Ethereum token is not changed and needs no permission (its ownership is renounced). JESUS on Robinhood Chain can never exceed what is locked in the adapter.

## Why `sharedDecimals = 4`

OFT carries amounts as `uint64` in "shared decimals". JESUS has 777,777,777,777,777 supply at 18 decimals:

- default 6 shared decimals → 7.8 × 10²⁰, over `uint64.max` (1.8 × 10¹⁹), so large sends revert (`AmountSDOverflowed`);
- 4 shared decimals → 7.8 × 10¹⁸, fits. One message can carry up to ~1.84 quadrillion JESUS, more than the whole supply. Amounts below 0.0001 JESUS ("dust") stay with the sender.

The tests bridge the entire supply in one message and show the default adapter overflowing.

## Safety rails (`BridgeGuards`)

- **Outbound rate limit** per destination chain and **inbound rate limit** per source chain (linear refill over a window). The inbound limit on the adapter caps how fast the Ethereum lockbox can be emptied, even if a bad message were verified. A chain with no limit set is blocked. `wire.js` sets the limits to unlimited unless `OUT_LIMIT` / `IN_LIMIT` are given, so they can be tightened later without a redeploy.
- **Pause**: the owner or a separate `pauser` (e.g. a monitoring bot) can pause; only the owner can unpause. A paused or over-limit receive reverts inside `lzReceive`, so the message stays stored at the LayerZero endpoint and can be retried later. Nothing is lost.
- **Bridge fee**: `feeBps` of every send, both directions, goes to `feeRecipient` as JESUS on the sending chain (on Ethereum it never enters the lockbox; on Robinhood it stays as fully backed OFT JESUS). Deploys at 1% (100 bps) to the owner; `setFee(bps, recipient)` changes it, capped at 5% (`MAX_FEE_BPS`). The amount that arrives is `quoteOFT(...).amountReceivedLD`; pass that as `minAmountLD` (the full amount reverts with `SlippageExceeded`).
- **Owner** sets peers, limits, the fee and the pauser, and unpauses. **Delegate** sets DVN/executor config on the endpoint. Both start as the deployer wallet; `scripts/handoff.js` moves them to a multisig (or any other address) later.

## Use

```bash
npm install --legacy-peer-deps
npm test
```

Compiles with the npm `solc` 0.8.22 build (no compiler download needed).

Deploy (env: `PRIVATE_KEY`, `SEPOLIA_RPC_URL`, `ROBINHOOD_TESTNET_RPC_URL`; mainnet: `ETHEREUM_RPC_URL`, `ROBINHOOD_RPC_URL`):

```bash
npx hardhat run scripts/deploy.js --network sepolia            # adapter (+ MockJesus test token unless JESUS_TOKEN is set)
npx hardhat run scripts/deploy.js --network robinhood-testnet  # OFT
npx hardhat run scripts/wire.js --network sepolia              # peer + rate limits (OUT_LIMIT, IN_LIMIT, WINDOW_SECONDS, PAUSER)
npx hardhat run scripts/wire.js --network robinhood-testnet
AMOUNT=1000000 npx hardhat run scripts/send.js --network sepolia
SAFE=0x... npx hardhat run scripts/handoff.js --network sepolia   # then the same on the other side
```

Deployments are written to `deployments/<network>.json`.

| Network | LayerZero eid | EndpointV2 |
|---|---|---|
| Ethereum | 30101 | `0x1a44076050125825900e736c501f859c50fE728c` |
| Robinhood Chain | 30416 | `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B` |
| Sepolia | 40161 | `0x6EDCE65403992e310A62460808c4b910D972f10f` |
| Robinhood testnet | 40451 | `0x3aCAAf60502791D199a5a5F0B173D78229eBFe32` |

(From `@layerzerolabs/lz-definitions` and `@layerzerolabs/lz-evm-sdk-v2` 3.1.19.)

## Deploy page (no command line)

`frontend/deploy.html` is a single self-contained page (ethers and the compiled contracts are built in). Open it in a
desktop browser with a wallet (MetaMask, Rabby or Phantom; any EIP-6963 wallet) and follow the four steps:

1. Deploy the Ethereum adapter (on testnet it first creates a test JESUS with the full supply, sent to you).
2. Deploy JESUS on Robinhood Chain, optionally at a vanity address from a salt mined with `scripts/mine-salt.js`.
3. Connect the two sides (peer + unlimited limits, skipping anything already set).
4. Bridge a test amount there and back, with a LayerZero Scan link.

Testnet and mainnet are separate modes; addresses are saved in the browser and can be downloaded as JSON. Rebuild
after changing the contracts: `npx hardhat compile && node frontend/build.js`. `frontend/e2e.js` runs the whole
flow against a local Hardhat node.

## Vanity address (e.g. `0x777…abba`)

The Robinhood token can be deployed at a chosen-pattern address through the standard CREATE2 factory
(deterministic deployment proxy, `0x4e59b44847b379578588920cA78FbF26c0B4956C`). The address depends on the init code,
which includes the endpoint and the owner, so both must be final before mining. Use this instead of `deploy.js` on
the Robinhood side:

```bash
TARGET=robinhood OWNER=0xYourWallet npx hardhat run scripts/vanity-initcode.js   # writes deployments/robinhood.vanity.json
node scripts/mine-salt.js deployments/robinhood.vanity.json 777 abba               # all CPU cores; ~370k tries/s on 4 cores
npx hardhat run scripts/deploy-vanity.js --network robinhood                       # deploys at the mined address
```

`0x777…abba` is 7 hex characters: about 268M tries on average, roughly 10 to 15 minutes on a 4-core machine. Each
extra character is ~16x more. Testnet and mainnet need separate mining (different endpoint). Copying the salt gets
anyone only the identical contract owned by `OWNER`, so front-running cannot take the address. `deploy-vanity.js`
stops if the factory is not deployed on the chain; it can be deployed by anyone with its standard presigned
transaction (see the proxy's repository). `wire.js` must then be run from the `OWNER` wallet.

## Before mainnet

- Set DVNs explicitly on both sides. LayerZero's default for Ethereum ⇄ Robinhood is a placeholder DeadDVN, so every quote reverts until this is done. The deploy page's step 3 sets two required DVNs (LayerZero Labs + Nethermind, from lz-address-book) on the send and receive libraries of both sides, and has a Diagnose button. LayerZero Labs will not verify a mainnet message whose config has only one DVN. The CLI scripts leave the defaults in place.
- The owner key can repoint peers and so control everything in the lockbox. Until it moves to a multisig, keep it on a hardware wallet and use it only for this.
- Rate limits default to unlimited; set `OUT_LIMIT` / `IN_LIMIT` if you want a cap.
- Bridge a small amount first. JESUS calls a PinkSale anti-bot hook on every transfer when enabled; it should not affect the adapter, but confirm with a real transfer.
- Get an independent review of `BridgeGuards` and the overrides.
