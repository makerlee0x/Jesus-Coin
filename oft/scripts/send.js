// Bridges AMOUNT whole JESUS from this network to its peer, to TO (default: the sender).
//   AMOUNT=1000000 npx hardhat run scripts/send.js --network sepolia
const hre = require("hardhat");
const networks = require("./networks");
const { load } = require("./lib");

// lzReceive with 200k gas on the destination
const OPTIONS = hre.ethers.solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, 200000]);

async function main() {
  const name = hre.network.name;
  const me = load(name);
  const peer = load(networks[name].peer);
  const [signer] = await hre.ethers.getSigners();
  const amount = hre.ethers.parseEther(process.env.AMOUNT || "1000000");
  const to = process.env.TO || signer.address;

  const contract = await hre.ethers.getContractAt(me.side === "adapter" ? "JesusBridge" : "JesusOFT", me.address);
  if (me.side === "adapter") {
    const token = await hre.ethers.getContractAt("@openzeppelin/contracts/token/ERC20/IERC20.sol:IERC20", me.token);
    if ((await token.allowance(signer.address, me.address)) < amount) {
      console.log("approve");
      await (await token.approve(me.address, amount)).wait();
    }
  }

  const params = {
    dstEid: peer.eid,
    to: hre.ethers.zeroPadValue(to, 32),
    amountLD: amount,
    minAmountLD: amount,
    extraOptions: OPTIONS,
    composeMsg: "0x",
    oftCmd: "0x",
  };
  const fee = await contract.quoteSend(params, false);
  console.log(`fee ${hre.ethers.formatEther(fee.nativeFee)} ETH`);
  const tx = await contract.send(params, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, signer.address, { value: fee.nativeFee });
  console.log(`sent: ${tx.hash}  (track it on https://layerzeroscan.com or testnet.layerzeroscan.com)`);
  await tx.wait();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
