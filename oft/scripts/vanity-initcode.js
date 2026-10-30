// Step 1 of a vanity deploy: builds the exact JesusOFT init code for TARGET and saves it with its hash.
// No RPC needed. The address depends on this code, so OWNER and TARGET must be final before mining.
//   TARGET=robinhood OWNER=0x... npx hardhat run scripts/vanity-initcode.js
const hre = require("hardhat");
const networks = require("./networks");
const { save } = require("./lib");
const { FACTORY } = require("./vanity-lib");

async function main() {
  const target = process.env.TARGET || "robinhood";
  const cfg = networks[target];
  if (!cfg || cfg.side !== "oft") throw new Error(`TARGET must be an OFT-side network, got ${target}`);
  const owner = process.env.OWNER;
  if (!owner || !hre.ethers.isAddress(owner)) throw new Error("Set OWNER to the wallet that will own the token");

  const factory = await hre.ethers.getContractFactory("JesusOFT");
  const tx = await factory.getDeployTransaction("Jesus Coin", "JESUS", cfg.endpoint, owner);
  const initCode = tx.data;
  const initCodeHash = hre.ethers.keccak256(initCode);

  save(`${target}.vanity`, { target, owner: hre.ethers.getAddress(owner), endpoint: cfg.endpoint, factory: FACTORY, initCodeHash, initCode });
  console.log(`Saved deployments/${target}.vanity.json`);
  console.log(`init code hash: ${initCodeHash}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
