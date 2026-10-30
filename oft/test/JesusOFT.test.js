const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const ETH_EID = 1;
const RH_EID = 2;
const SUPPLY = ethers.parseEther("777777777777777");
const DAY = 24 * 60 * 60;

// Executor option: lzReceive with 200k gas (same bytes as OptionsBuilder.addExecutorLzReceiveOption(200000, 0)).
const OPTIONS = ethers.solidityPacked(["uint16", "uint8", "uint16", "uint8", "uint128"], [3, 1, 17, 1, 200000]);

const to32 = (addr) => ethers.zeroPadValue(addr, 32);

describe("JESUS OFT pair", function () {
  let owner, alice, bob, pauser;
  let jesus, adapter, oft, epEth, epRh;

  beforeEach(async function () {
    [owner, alice, bob, pauser] = await ethers.getSigners();

    const Endpoint = await ethers.getContractFactory("LzEndpointMock");
    epEth = await Endpoint.deploy(ETH_EID);
    epRh = await Endpoint.deploy(RH_EID);

    jesus = await (await ethers.getContractFactory("MockJesus")).deploy();
    adapter = await (await ethers.getContractFactory("JesusBridge")).deploy(
      await jesus.getAddress(), await epEth.getAddress(), owner.address);
    oft = await (await ethers.getContractFactory("JesusOFT")).deploy(
      "Jesus Coin", "JESUS", await epRh.getAddress(), owner.address);

    await epEth.setDestLzEndpoint(await oft.getAddress(), await epRh.getAddress());
    await epRh.setDestLzEndpoint(await adapter.getAddress(), await epEth.getAddress());
    await adapter.setPeer(RH_EID, to32(await oft.getAddress()));
    await oft.setPeer(ETH_EID, to32(await adapter.getAddress()));

    // Generous limits by default; individual tests tighten them.
    const open = (eid) => [{ dstEid: eid, limit: SUPPLY, window: DAY }];
    await adapter.setRateLimits(open(RH_EID));
    await adapter.setInboundRateLimits(open(RH_EID));
    await oft.setRateLimits(open(ETH_EID));
    await oft.setInboundRateLimits(open(ETH_EID));

    await jesus.transfer(alice.address, SUPPLY);
  });

  async function sendParams(dstEid, recipient, amount) {
    return { dstEid, to: to32(recipient), amountLD: amount, minAmountLD: amount, extraOptions: OPTIONS, composeMsg: "0x", oftCmd: "0x" };
  }

  async function bridge(from, contract, dstEid, recipient, amount) {
    const p = await sendParams(dstEid, recipient, amount);
    const fee = await contract.quoteSend(p, false);
    return contract.connect(from).send(p, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, from.address, { value: fee.nativeFee });
  }

  it("uses 18 local decimals and 4 shared decimals on both sides", async function () {
    expect(await oft.decimals()).to.equal(18);
    expect(await adapter.sharedDecimals()).to.equal(4);
    expect(await oft.sharedDecimals()).to.equal(4);
    expect(await adapter.decimalConversionRate()).to.equal(10n ** 14n);
  });

  it("bridges the ENTIRE 777.8T supply to Robinhood in one message and back", async function () {
    await jesus.connect(alice).approve(await adapter.getAddress(), SUPPLY);
    await bridge(alice, adapter, RH_EID, bob.address, SUPPLY);

    expect(await jesus.balanceOf(await adapter.getAddress())).to.equal(SUPPLY);
    expect(await oft.balanceOf(bob.address)).to.equal(SUPPLY);
    expect(await oft.totalSupply()).to.equal(SUPPLY);

    await bridge(bob, oft, ETH_EID, alice.address, SUPPLY);
    expect(await oft.totalSupply()).to.equal(0);
    expect(await jesus.balanceOf(alice.address)).to.equal(SUPPLY);
    expect(await jesus.balanceOf(await adapter.getAddress())).to.equal(0);
  });

  it("a default (sharedDecimals = 6) adapter overflows on the same amount", async function () {
    const plain = await (await ethers.getContractFactory("DefaultDecimalsAdapter")).deploy(
      await jesus.getAddress(), await epEth.getAddress(), owner.address);
    await plain.setPeer(RH_EID, to32(await oft.getAddress()));
    const p = await sendParams(RH_EID, bob.address, SUPPLY);
    await expect(plain.quoteSend(p, false)).to.be.revertedWithCustomError(plain, "AmountSDOverflowed");
  });

  it("strips dust below 0.0001 JESUS and leaves it with the sender", async function () {
    const amount = ethers.parseEther("1000") + 123n; // 123 wei of dust
    await jesus.connect(alice).approve(await adapter.getAddress(), amount);
    const p = await sendParams(RH_EID, bob.address, amount);
    p.minAmountLD = ethers.parseEther("1000");
    const fee = await adapter.quoteSend(p, false);
    await adapter.connect(alice).send(p, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, alice.address, { value: fee.nativeFee });
    expect(await oft.balanceOf(bob.address)).to.equal(ethers.parseEther("1000"));
    expect(await jesus.balanceOf(alice.address)).to.equal(SUPPLY - ethers.parseEther("1000"));
  });

  it("blocks traffic to a chain with no rate limit configured", async function () {
    await adapter.setRateLimits([{ dstEid: RH_EID, limit: 0, window: DAY }]);
    const amount = ethers.parseEther("1");
    await jesus.connect(alice).approve(await adapter.getAddress(), amount);
    const p = await sendParams(RH_EID, bob.address, amount);
    const fee = await adapter.quoteSend(p, false);
    await expect(adapter.connect(alice).send(p, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, alice.address, { value: fee.nativeFee }))
      .to.be.revertedWithCustomError(adapter, "RateLimitExceeded");
  });

  it("enforces the outbound limit and refills it over the window", async function () {
    const limit = ethers.parseEther("1000000000000"); // 1T per day
    await adapter.setRateLimits([{ dstEid: RH_EID, limit, window: DAY }]);
    await jesus.connect(alice).approve(await adapter.getAddress(), SUPPLY);

    await bridge(alice, adapter, RH_EID, bob.address, limit);
    // The limit decays linearly (~11.6M JESUS/second here), so probe with an amount well above a few seconds' refill.
    const p = await sendParams(RH_EID, bob.address, ethers.parseEther("1000000000"));
    const fee = await adapter.quoteSend(p, false);
    await expect(adapter.connect(alice).send(p, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, alice.address, { value: fee.nativeFee }))
      .to.be.revertedWithCustomError(adapter, "RateLimitExceeded");

    await time.increase(DAY / 2);
    const [, canSend] = await adapter.getAmountCanBeSent(RH_EID);
    expect(canSend).to.be.closeTo(limit / 2n, ethers.parseEther("100000000")); // ~half refilled
    await bridge(alice, adapter, RH_EID, bob.address, ethers.parseEther("400000000000"));
  });

  it("inbound limit on the adapter caps how fast the lockbox can be emptied", async function () {
    await jesus.connect(alice).approve(await adapter.getAddress(), SUPPLY);
    await bridge(alice, adapter, RH_EID, bob.address, SUPPLY);

    const cap = ethers.parseEther("1000000000000");
    await adapter.setInboundRateLimits([{ dstEid: RH_EID, limit: cap, window: DAY }]);
    expect((await adapter.getInboundAmountCanBeReceived(RH_EID))[1]).to.equal(cap);

    // Over the inbound cap: the burn on Robinhood happens, but the release on Ethereum reverts and stays retryable.
    await bridge(bob, oft, ETH_EID, alice.address, cap * 2n);
    expect(await jesus.balanceOf(alice.address)).to.equal(0);
    expect(await jesus.balanceOf(await adapter.getAddress())).to.equal(SUPPLY);

    // Within the cap it goes through.
    await bridge(bob, oft, ETH_EID, alice.address, cap);
    expect(await jesus.balanceOf(alice.address)).to.equal(cap);
  });

  it("pauser can pause, only the owner can unpause, and paused sends revert", async function () {
    await adapter.setPauser(pauser.address);
    await adapter.connect(pauser).pause();
    await expect(adapter.connect(pauser).unpause()).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    await expect(adapter.connect(alice).pause()).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");

    const amount = ethers.parseEther("1");
    await jesus.connect(alice).approve(await adapter.getAddress(), amount);
    const p = await sendParams(RH_EID, bob.address, amount);
    const fee = await adapter.quoteSend(p, false);
    await expect(adapter.connect(alice).send(p, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, alice.address, { value: fee.nativeFee }))
      .to.be.revertedWithCustomError(adapter, "EnforcedPause");

    await adapter.unpause();
    await adapter.connect(alice).send(p, { nativeFee: fee.nativeFee, lzTokenFee: 0 }, alice.address, { value: fee.nativeFee });
    expect(await oft.balanceOf(bob.address)).to.equal(amount);
  });

  it("an unlimited (uint192 max) limit lets everything through, as wire.js sets by default", async function () {
    const UNLIMITED = (1n << 192n) - 1n;
    await adapter.setRateLimits([{ dstEid: RH_EID, limit: UNLIMITED, window: DAY }]);
    await oft.setInboundRateLimits([{ dstEid: ETH_EID, limit: UNLIMITED, window: DAY }]);
    await jesus.connect(alice).approve(await adapter.getAddress(), SUPPLY);
    await bridge(alice, adapter, RH_EID, bob.address, SUPPLY / 2n);
    await bridge(alice, adapter, RH_EID, bob.address, SUPPLY / 2n);
    expect(await oft.balanceOf(bob.address)).to.equal(SUPPLY);
  });

  it("only the owner can change limits or peers", async function () {
    await expect(adapter.connect(alice).setRateLimits([])).to.be.revertedWithCustomError(adapter, "OwnableUnauthorizedAccount");
    await expect(oft.connect(alice).setInboundRateLimits([])).to.be.revertedWithCustomError(oft, "OwnableUnauthorizedAccount");
    await expect(oft.connect(alice).setPeer(ETH_EID, to32(alice.address))).to.be.revertedWithCustomError(oft, "OwnableUnauthorizedAccount");
  });
});
