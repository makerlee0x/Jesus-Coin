// Builds frontend/deploy.html: the template with ethers and the compiled contracts inlined, so the page is one
// file that works offline (file://). Run after `npx hardhat compile`:  node frontend/build.js
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const art = (p) => {
  const a = JSON.parse(fs.readFileSync(path.join(root, "artifacts/contracts", p), "utf8"));
  return { abi: a.abi, bytecode: a.bytecode };
};
const contracts = {
  JesusOFTAdapter: art("JesusOFTAdapter.sol/JesusOFTAdapter.json"),
  JesusOFT: art("JesusOFT.sol/JesusOFT.json"),
  // Test token for testnet; its ERC-20 ABI is also used for approve/allowance/balanceOf on real JESUS.
  MockJesus: art("mocks/Mocks.sol/MockJesus.json"),
};
const ethersUmd = fs.readFileSync(path.join(root, "node_modules/ethers/dist/ethers.umd.min.js"), "utf8").replace(/<\/script/gi, "<\\/script");
const html = fs
  .readFileSync(path.join(__dirname, "deploy.template.html"), "utf8")
  .replace("/*__ETHERS__*/", () => ethersUmd)
  .replace("/*__CONTRACTS__*/", () => JSON.stringify(contracts));
fs.writeFileSync(path.join(__dirname, "deploy.html"), html);
console.log(`frontend/deploy.html (${(html.length / 1024).toFixed(0)} KB)`);
