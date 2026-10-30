// Step 2 of a vanity deploy: searches for a CREATE2 salt whose address starts with PREFIX and ends with SUFFIX.
// Uses every CPU core. Each hex character makes the search ~16x longer (777 + abba = 7 chars, ~268M tries average).
//   node scripts/mine-salt.js deployments/robinhood.vanity.json 777 abba
const fs = require("fs");
const os = require("os");
const crypto = require("crypto");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { keccak_256 } = require("@noble/hashes/sha3");

if (isMainThread) {
  const [file, prefix = "", suffix = ""] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node scripts/mine-salt.js <vanity.json> <prefix> <suffix>");
    process.exit(1);
  }
  const p = prefix.toLowerCase().replace(/^0x/, "");
  const s = suffix.toLowerCase();
  if (!/^[0-9a-f]*$/.test(p + s)) throw new Error("prefix/suffix must be hex (0-9, a-f)");
  const job = JSON.parse(fs.readFileSync(file, "utf8"));
  const { create2Address } = require("./vanity-lib");

  const threads = Number(process.env.THREADS || os.cpus().length);
  const expected = 16 ** (p.length + s.length);
  console.log(`Mining 0x${p}…${s} on ${threads} threads (≈${expected.toLocaleString()} tries on average)`);
  const start = Date.now();
  let total = 0;
  const workers = [];
  for (let i = 0; i < threads; i++) {
    const w = new Worker(__filename, { workerData: { factory: job.factory, initCodeHash: job.initCodeHash, prefix: p, suffix: s } });
    w.on("message", (m) => {
      if (m.progress) {
        total += m.progress;
        const secs = (Date.now() - start) / 1000;
        process.stdout.write(`\r${total.toLocaleString()} tries · ${Math.round(total / secs).toLocaleString()}/s   `);
        return;
      }
      const addr = create2Address(job.factory, m.salt, job.initCodeHash);
      if (!addr.startsWith("0x" + p) || !addr.endsWith(s)) throw new Error("internal check failed");
      job.salt = m.salt;
      job.address = addr;
      fs.writeFileSync(file, JSON.stringify(job, null, 2) + "\n");
      console.log(`\nFound ${addr}\nsalt ${m.salt}\nSaved to ${file}`);
      workers.forEach((x) => x.terminate());
    });
    workers.push(w);
  }
} else {
  const { factory, initCodeHash, prefix, suffix } = workerData;
  const buf = Buffer.alloc(85);
  buf[0] = 0xff;
  Buffer.from(factory.slice(2), "hex").copy(buf, 1);
  crypto.randomBytes(24).copy(buf, 21); // random salt head per worker, counter in the last 8 bytes
  Buffer.from(initCodeHash.slice(2), "hex").copy(buf, 53);
  let n = 0n;
  let batch = 0;
  for (;;) {
    buf.writeBigUInt64BE(n++, 45);
    const hex = Buffer.from(keccak_256(buf)).subarray(12).toString("hex");
    if (hex.startsWith(prefix) && hex.endsWith(suffix)) {
      parentPort.postMessage({ salt: "0x" + buf.subarray(21, 53).toString("hex") });
      return;
    }
    if (++batch === 200000) {
      parentPort.postMessage({ progress: batch });
      batch = 0;
    }
  }
}
