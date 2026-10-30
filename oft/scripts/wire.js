// Points this network's contract at its peer and sets rate limits. Run on BOTH networks after both deploys.
//   OUT_LIMIT / IN_LIMIT = whole JESUS per WINDOW_SECONDS. Unset = unlimited.
//   npx hardhat run scripts/wire.js --network sepolia
const hre = require("hardhat");
const networks = require("./networks");
const { load } = require("./lib");

async function main() {
  const name = hre.network.name;
  const cfg = networks[name];
  const me = load(name);
  const peer = load(cfg.peer);

  const contract = await hre.ethers.getContractAt(me.side === "adapter" ? "JesusOFTAdapter" : "JesusOFT", me.address);
  const window = BigInt(process.env.WINDOW_SECONDS || 86400);
  const UNLIMITED = (1n << 192n) - 1n; // uint192 max
  const outLimit = process.env.OUT_LIMIT ? hre.ethers.parseEther(process.env.OUT_LIMIT) : UNLIMITED;
  const inLimit = process.env.IN_LIMIT ? hre.ethers.parseEther(process.env.IN_LIMIT) : UNLIMITED;
  const fmt = (v) => (v === UNLIMITED ? "unlimited" : hre.ethers.formatEther(v));

  console.log(`setPeer(${peer.eid}, ${peer.address})`);
  await (await contract.setPeer(peer.eid, hre.ethers.zeroPadValue(peer.address, 32))).wait();

  console.log(`rate limits to/from eid ${peer.eid}: out ${fmt(outLimit)}, in ${fmt(inLimit)} per ${window}s`);
  await (await contract.setRateLimits([{ dstEid: peer.eid, limit: outLimit, window }])).wait();
  await (await contract.setInboundRateLimits([{ dstEid: peer.eid, limit: inLimit, window }])).wait();

  if (process.env.PAUSER) {
    console.log(`setPauser(${process.env.PAUSER})`);
    await (await contract.setPauser(process.env.PAUSER)).wait();
  }
  console.log("Wired. DVN/executor config uses LayerZero defaults until set via the endpoint (see README).");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
