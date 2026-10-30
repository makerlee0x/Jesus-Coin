// LayerZero V2 endpoint ids and EndpointV2 addresses, from @layerzerolabs/lz-definitions and
// @layerzerolabs/lz-evm-sdk-v2 deployments (v3.1.19).
module.exports = {
  // testnets
  sepolia: {
    eid: 40161,
    endpoint: "0x6EDCE65403992e310A62460808c4b910D972f10f",
    side: "adapter",
    peer: "robinhood-testnet",
    token: process.env.JESUS_TOKEN || "", // empty = deploy a MockJesus test token
  },
  "robinhood-testnet": {
    eid: 40451,
    endpoint: "0x3aCAAf60502791D199a5a5F0B173D78229eBFe32",
    side: "oft",
    peer: "sepolia",
  },
  // mainnets
  ethereum: {
    eid: 30101,
    endpoint: "0x1a44076050125825900e736c501f859c50fE728c",
    side: "adapter",
    peer: "robinhood",
    token: "0xba386A4Ca26B85FD057ab1Ef86e3DC7BdeB5ce70", // JESUS
  },
  robinhood: {
    eid: 30416,
    endpoint: "0x6F475642a6e85809B1c36Fa62763669b1b48DD5B",
    side: "oft",
    peer: "ethereum",
  },
};
