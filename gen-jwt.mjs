import { generateKeyPairSync } from "crypto";
import { readFileSync, writeFileSync } from "fs";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const path = "apps/api/.env";
const lines = readFileSync(path, "utf8")
  .split(/\r?\n/)
  .filter((l) => l.trim() !== "JWT_PRIVATE_KEY=" && l.trim() !== "JWT_PUBLIC_KEY=");
writeFileSync(
  path,
  lines.join("\n").trimEnd() +
    "\nJWT_PRIVATE_KEY=\"" + privateKey.trim() + "\"\n" +
    "JWT_PUBLIC_KEY=\"" + publicKey.trim() + "\"\n"
);
console.log("JWT keys written to apps/api/.env");
