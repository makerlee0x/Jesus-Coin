const { keccak_256 } = require("@noble/hashes/sha3");

// Deterministic deployment proxy (Arachnid), same address on every chain that has it.
// Calldata = salt (32 bytes) ++ init code; it CREATE2s and returns the new address.
const FACTORY = "0x4e59b44847b379578588920cA78FbF26c0B4956C";

const hexToBytes = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");

/// CREATE2 address: keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
function create2Address(factory, saltHex, initCodeHashHex) {
  const buf = Buffer.concat([Buffer.from([0xff]), hexToBytes(factory), hexToBytes(saltHex), hexToBytes(initCodeHashHex)]);
  return "0x" + Buffer.from(keccak_256(buf)).subarray(12).toString("hex");
}

module.exports = { FACTORY, create2Address, hexToBytes };
