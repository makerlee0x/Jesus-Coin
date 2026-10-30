// Step 3 of a vanity deploy: deploys JesusOFT at the mined address through the CREATE2 factory.
// Run with the same network as TARGET from step 1. Then continue with wire.js as usual.
//   npx hardhat run scripts/deploy-vanity.js --network robinhood
const hre = require("hardhat");
const networks = require("./networks");
const { load, save } = require("./lib");
const { create2Address } = require("./vanity-lib");

async function main() {
  const name = hre.network.name;
  const cfg = networks[name];
  const job = load(`${process.env.TARGET || name}.vanity`);
  if (!job.salt) throw new Error("No salt yet. Run mine-salt.js first.");
  if (cfg && job.endpoint.toLowerCase() !== cfg.endpoint.toLowerCase()) throw new Error("Init code was built for another network");

  const predicted = hre.ethers.getAddress(create2Address(job.factory, job.salt, job.initCodeHash));
  if (hre.ethers.keccak256(job.initCode) !== job.initCodeHash) throw new Error("init code does not match its hash");
  if ((await hre.ethers.provider.getCode(job.factory)) === "0x") {
    throw new Error(`CREATE2 factory ${job.factory} is not deployed on ${name}. See README (Vanity address).`);
  }
  if ((await hre.ethers.provider.getCode(predicted)) !== "0x") throw new Error(`${predicted} already has code`);

  const [signer] = await hre.ethers.getSigners();
  console.log(`Deploying JesusOFT at ${predicted} (owner ${job.owner})`);
  const tx = await signer.sendTransaction({ to: job.factory, data: hre.ethers.concat([job.salt, job.initCode]) });
  await tx.wait();
  if ((await hre.ethers.provider.getCode(predicted)) === "0x") throw new Error("Deploy failed: no code at predicted address");

  const oft = await hre.ethers.getContractAt("JesusOFT", predicted);
  if ((await oft.owner()).toLowerCase() !== job.owner.toLowerCase()) throw new Error("Unexpected owner");
  save(name, { network: name, eid: cfg ? cfg.eid : null, endpoint: job.endpoint, side: "oft", address: predicted, token: predicted, salt: job.salt });
  console.log(`JesusOFT: ${predicted}  (tx ${tx.hash})`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
