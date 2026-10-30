const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "deployments");

function load(network) {
  const f = path.join(DIR, `${network}.json`);
  if (!fs.existsSync(f)) throw new Error(`No deployment for ${network}. Run deploy.js on it first.`);
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

function save(network, data) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${network}.json`), JSON.stringify(data, null, 2) + "\n");
}

module.exports = { load, save };
