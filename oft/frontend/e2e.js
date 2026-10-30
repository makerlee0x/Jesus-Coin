// End-to-end check of deploy.html against a local `npx hardhat node`, with two mock LayerZero endpoints and an
// injected wallet. Needs Playwright.  npx hardhat node &  then  node frontend/e2e.js
const path = require("path").join(__dirname, "..");
const { chromium } = require("playwright");
const { ethers } = require(path + "/node_modules/ethers");
const { create2Address, FACTORY } = require(path + "/scripts/vanity-lib");
const art = (p) => require(path + "/artifacts/contracts/" + p);
const PROXY = "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffe03601600081602082378035828234f58015156039578182fd5b8082525050506014600cf3";

(async () => {
  const prov = new ethers.JsonRpcProvider("http://127.0.0.1:8545");
  const signer = await prov.getSigner(0);
  const acct = await signer.getAddress();
  await prov.send("hardhat_setCode", [FACTORY, PROXY]);
  const EP = art("mocks/Mocks.sol/LzEndpointMock.json");
  const epF = new ethers.ContractFactory(EP.abi, EP.bytecode, signer);
  const epEth = await (await epF.deploy(1)).waitForDeployment();
  const epRh = await (await epF.deploy(2)).waitForDeployment();
  const epEthA = await epEth.getAddress(), epRhA = await epRh.getAddress();

  // mine a short vanity salt for owner=acct on the rh endpoint
  const O = art("JesusOFT.sol/JesusOFT.json");
  const init = (await new ethers.ContractFactory(O.abi, O.bytecode).getDeployTransaction("Jesus Coin", "JESUS", epRhA, acct)).data;
  const h = ethers.keccak256(init);
  let salt; for (let i = 0n; ; i++) { salt = ethers.toBeHex(i, 32); const a = create2Address(FACTORY, salt, h); if (a.startsWith("0x77") && a.endsWith("ab")) break; }

  const b = await chromium.launch();
  const page = await b.newPage();
  const errs = []; page.on("pageerror", (e) => errs.push(String(e)));
  page.on("dialog", (d) => d.accept());
  await page.exposeFunction("__rpc", async (method, params) => {
    if (method === "eth_requestAccounts") method = "eth_accounts";
    return prov.send(method, params || []);
  });
  await page.addInitScript(() => { window.ethereum = { request: ({ method, params }) => window.__rpc(method, params), on() {} }; });
  await page.goto(`file://${path}/frontend/deploy.html?dev=1&epEth=${epEthA}&epRh=${epRhA}`);
  const waitText = async (id, re) => { try { await page.waitForFunction(([i, r]) => new RegExp(r).test(document.getElementById(i).textContent), [id, re], { timeout: 20000 }); } catch (e) { console.log("LOG:", await page.textContent("#log"), "ERRS:", errs); throw e; } };

  await page.click("#wallet"); await waitText("sAcct", "^0x");
  await page.click("#go1"); await waitText("a1", "^0x");
  await page.fill("#salt", salt); await waitText("predicted", "Will deploy at 0x77");
  await page.click("#go2"); await waitText("a2", "^0x77");
  const adapter = await page.textContent("#a1"), oft = await page.textContent("#a2");
  const token = await page.inputValue("#eToken");
  await (await epEth.setDestLzEndpoint(oft, epRhA)).wait();
  await (await epRh.setDestLzEndpoint(adapter, epEthA)).wait();
  await page.click("#go3a"); await waitText("go3a", "Connected");
  await page.click("#go3b"); await waitText("go3b", "Connected");
  await page.fill("#amt", "1000000"); await page.click("#go4"); await waitText("r4t", "Sent");
  const T = new ethers.Contract(oft, O.abi, prov);
  console.log("oft balance after out:", ethers.formatEther(await T.balanceOf(acct)));
  await page.selectOption("#dir", "back"); await page.click("#go4");
  await page.waitForFunction(() => (document.getElementById("log").textContent.match(/JESUS done/g) || []).length >= 2, null, { timeout: 20000 });
  await page.waitForTimeout(2000);
  const raw = async (to, who) => ethers.formatEther(BigInt(await prov.send("eth_call", [{ to, data: new ethers.Interface(O.abi).encodeFunctionData("balanceOf", [who]) }, "latest"])));
  console.log("RAW oft bal:", await raw(oft, acct), "RAW adapter locked:", await raw(token, adapter), "oft supply:", ethers.formatEther(await new ethers.Contract(oft, O.abi, prov).totalSupply()));
  console.log("oft balance after back:", ethers.formatEther(await T.balanceOf(acct)));
  const J = new ethers.Contract(token, O.abi, prov);
  console.log("adapter locked:", ethers.formatEther(await J.balanceOf(adapter)));
  await page.click("#refresh"); await page.waitForTimeout(1500);
  console.log(await page.textContent("#bal"));
  await page.click("#diag"); await page.waitForFunction(() => /Diagnose: done/.test(document.getElementById("log").textContent), null, { timeout: 20000 });
  console.log("DIAG:", (await page.$$eval("#log div", (e) => e.map((x) => x.textContent).filter((t) => t.includes("Diagnose")))).reverse().join("\n"));
  console.log("steps:", await page.$$eval(".pill", (e) => e.map((x) => x.textContent)));
  const errLog = await page.$$eval("#log .err", (e) => e.map((x) => x.textContent));
  console.log("log errors:", errLog, "page errors:", errs);
  await page.screenshot({ path: path + "/frontend/e2e.png", fullPage: true });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
