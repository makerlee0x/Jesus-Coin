# JESUS OFT bridge (Ethereum ⇄ Robinhood Chain)

LayerZero V2 bridge for JESUS (`0xba386A4Ca26B85FD057ab1Ef86e3DC7BdeB5ce70` on Ethereum).

| Contract | Chain | What it does |
|---|---|---|
| `JesusOFTAdapter` | Ethereum | Locks JESUS when it leaves Ethereum, releases it when it comes back |
| `JesusOFT` | Robinhood Chain | ERC-20 "JESUS" (18 decimals), minted on arrival, burned on departure |

The Ethereum token is not changed and needs no permission (its ownership is renounced). JESUS on Robinhood Chain can never exceed what is locked in the adapter.

## Why `sharedDecimals = 4`

OFT carries amounts as `uint64` in "shared decimals". JESUS has 777,777,777,777,777 supply at 18 decimals:

- default 6 shared decimals → 7.8 × 10²⁰, over `uint64.max` (1.8 × 10¹⁹), so large sends revert (`AmountSDOverflowed`);
- 4 shared decimals → 7.8 × 10¹⁸, fits. One message can carry up to ~1.84 quadrillion JESUS, more than the whole supply. Amounts below 0.0001 JESUS ("dust") stay with the sender.

The tests bridge the entire supply in one message and show the default adapter overflowing.

## Safety rails (`BridgeGuards`)

- **Outbound rate limit** per destination chain and **inbound rate limit** per source chain (linear refill over a window). The inbound limit on the adapter caps how fast the Ethereum lockbox can be emptied, even if a bad message were verified. A chain with no limit set is blocked.
- **Pause**: the owner or a separate `pauser` (e.g. a monitoring bot) can pause; only the owner can unpause. A paused or over-limit receive reverts inside `lzReceive`, so the message stays stored at the LayerZero endpoint and can be retried later. Nothing is lost.
- **Owner** sets peers, limits and the pauser, and unpauses. **Delegate** sets DVN/executor config on the endpoint. Hand both to a multisig with `scripts/handoff.js`.

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

## Before mainnet

- Set DVNs explicitly on both sides (at least two independent DVNs, e.g. LayerZero Labs + one more) with `endpoint.setConfig` from the delegate. The scripts leave LayerZero's defaults in place.
- Hand ownership and delegate to a multisig on both chains.
- Pick real rate limits (the script default is 10T JESUS per day each way).
- Bridge a small amount first. JESUS calls a PinkSale anti-bot hook on every transfer when enabled; it should not affect the adapter, but confirm with a real transfer.
- Get an independent review of `BridgeGuards` and the overrides.
