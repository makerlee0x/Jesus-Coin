// Hands control to a multisig: sets it as the LayerZero delegate (DVN/library config) and as owner (peers, limits,
// unpause). Run on each network once wiring is final.
//   SAFE=0x... npx hardhat run scripts/handoff.js --network sepolia
const hre = require("hardhat");
const { load } = require("./lib");

async function main() {
  const safe = process.env.SAFE;
  if (!safe || !hre.ethers.isAddress(safe)) throw new Error("Set SAFE to the multisig address");
  const me = load(hre.network.name);
  const contract = await hre.ethers.getContractAt(me.side === "adapter" ? "JesusBridge" : "JesusOFT", me.address);
  console.log(`setDelegate(${safe})`);
  await (await contract.setDelegate(safe)).wait();
  console.log(`transferOwnership(${safe})`);
  await (await contract.transferOwnership(safe)).wait();
  console.log("Done. The deployer no longer controls this contract.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
