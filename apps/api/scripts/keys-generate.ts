// Génère une clé Ed25519 pour signer les QR d'inscription (ARCHITECTURE.md § 3.1).
// Usage : pnpm --filter @orasso/api keys:generate [--kid 2]
// Copier les deux lignes dans le .env (développement) ou dans /etc/orasso/dev.env (serveur). Rotation : ajouter la
// nouvelle clé à la liste existante, changer QR_SIGNING_ACTIVE_KID, garder l'ancienne pour vérifier les pass émis.
import { createPrivateKey, createPublicKey, randomBytes } from "node:crypto";

const i = process.argv.indexOf("--kid");
const kid = i > 0 ? Number(process.argv[i + 1]) : 1;
if (!Number.isInteger(kid) || kid < 0 || kid > 255) {
  console.error("--kid : entier de 0 à 255");
  process.exit(1);
}
const seed = randomBytes(32);
const pkcs8 = Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), seed]);
const publicKey = createPublicKey(createPrivateKey({ key: pkcs8, format: "der", type: "pkcs8" }))
  .export({ format: "der", type: "spki" })
  .subarray(-32);

console.log(`QR_SIGNING_KEYS=${JSON.stringify([{ kid, privateKey: seed.toString("base64") }])}`);
console.log(`QR_SIGNING_ACTIVE_KID=${kid}`);
console.error(
  `(clé publique ${kid} : ${publicKey.toString("base64url")} — la clé privée ne doit jamais être commitée)`,
);
