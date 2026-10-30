// Deploys this network's side of the pair. Owner = the deployer; hand off to a multisig with handoff.js.
//   npx hardhat run scripts/deploy.js --network sepolia
const hre = require("hardhat");
const networks = require("./networks");
const { save } = require("./lib");

async function main() {
  const name = hre.network.name;
  const cfg = networks[name];
  if (!cfg) throw new Error(`Unknown network ${name}`);
  const [deployer] = await hre.ethers.getSigners();
  console.log(`Deploying ${cfg.side} on ${name} (eid ${cfg.eid}) from ${deployer.address}`);

  const out = { network: name, eid: cfg.eid, endpoint: cfg.endpoint, side: cfg.side };

  if (cfg.side === "adapter") {
    let token = cfg.token;
    if (!token) {
      if (name === "ethereum") throw new Error("Refusing to deploy a mock token on mainnet");
      const mock = await (await hre.ethers.getContractFactory("MockJesus")).deploy();
      await mock.waitForDeployment();
      token = await mock.getAddress();
      console.log(`MockJesus test token: ${token}`);
    }
    const c = await (await hre.ethers.getContractFactory("JesusBridge")).deploy(token, cfg.endpoint, deployer.address);
    await c.waitForDeployment();
    out.token = token;
    out.address = await c.getAddress();
  } else {
    const c = await (await hre.ethers.getContractFactory("JesusOFT")).deploy("Jesus Coin", "JESUS", cfg.endpoint, deployer.address);
    await c.waitForDeployment();
    out.address = await c.getAddress();
    out.token = out.address;
  }

  save(name, out);
  console.log(`${cfg.side === "adapter" ? "JesusBridge" : "JesusOFT"}: ${out.address}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
