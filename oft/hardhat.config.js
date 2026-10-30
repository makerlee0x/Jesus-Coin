require("@nomicfoundation/hardhat-ethers");
require("@nomicfoundation/hardhat-chai-matchers");
const path = require("path");
const { subtask } = require("hardhat/config");
const { TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD } = require("hardhat/builtin-tasks/task-names");

const SOLC_VERSION = "0.8.22";

// Use the solc-js build from npm (pinned in package.json) instead of downloading a compiler at compile time.
subtask(TASK_COMPILE_SOLIDITY_GET_SOLC_BUILD, async ({ solcVersion }, hre, runSuper) => {
  if (solcVersion !== SOLC_VERSION) return runSuper();
  return {
    compilerPath: path.join(__dirname, "node_modules", "solc", "soljson.js"),
    isSolcJs: true,
    version: solcVersion,
    longVersion: require("solc/package.json").version,
  };
});

const accounts = process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [];

module.exports = {
  solidity: {
    version: SOLC_VERSION,
    settings: { optimizer: { enabled: true, runs: 200 } },
  },
  networks: {
    sepolia: { url: process.env.SEPOLIA_RPC_URL || "", accounts },
    "robinhood-testnet": { url: process.env.ROBINHOOD_TESTNET_RPC_URL || "", chainId: 46630, accounts },
    ethereum: { url: process.env.ETHEREUM_RPC_URL || "", accounts },
    robinhood: { url: process.env.ROBINHOOD_RPC_URL || "", chainId: 4663, accounts },
  },
};
