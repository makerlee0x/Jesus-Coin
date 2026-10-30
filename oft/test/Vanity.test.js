const { expect } = require("chai");
const { ethers, network } = require("hardhat");
const { FACTORY, create2Address } = require("../scripts/vanity-lib");

// Runtime code of the deterministic deployment proxy (github.com/Arachnid/deterministic-deployment-proxy).
const PROXY_RUNTIME =
  "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

describe("Vanity deploy through the CREATE2 factory", function () {
  it("deploys JesusOFT at the predicted address with a mined prefix/suffix, owned by OWNER", async function () {
    const [deployer, owner] = await ethers.getSigners();
    await network.provider.send("hardhat_setCode", [FACTORY, PROXY_RUNTIME]);
    const ep = await (await ethers.getContractFactory("LzEndpointMock")).deploy(30416);

    const tx = await (await ethers.getContractFactory("JesusOFT")).getDeployTransaction(
      "Jesus Coin", "JESUS", await ep.getAddress(), owner.address);
    const initCodeHash = ethers.keccak256(tx.data);

    // Mine a short pattern (0x7…a) so the test stays fast; the real run uses scripts/mine-salt.js.
    let salt, predicted;
    for (let i = 0n; ; i++) {
      salt = ethers.toBeHex(i, 32);
      predicted = create2Address(FACTORY, salt, initCodeHash);
      if (predicted.startsWith("0x7") && predicted.endsWith("a")) break;
    }

    await deployer.sendTransaction({ to: FACTORY, data: ethers.concat([salt, tx.data]) });
    expect(await ethers.provider.getCode(predicted)).to.not.equal("0x");
    const oft = await ethers.getContractAt("JesusOFT", predicted);
    expect(await oft.owner()).to.equal(owner.address);
    expect(await oft.symbol()).to.equal("JESUS");
    expect(await oft.sharedDecimals()).to.equal(4);
  });
});
