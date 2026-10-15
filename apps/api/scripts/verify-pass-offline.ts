// Vérifie un QR d'inscription hors de l'API, avec les seules clés publiques (ce que fera l'appli du staff hors ligne).
// N'importe ni la base ni la configuration de l'API : seulement @orasso/shared et node:crypto.
// Usage : tsx scripts/verify-pass-offline.ts --keys <fichier.json | https://…/api/keys> [--event-no 42] <charge utile>
//   Le fichier de clés est la réponse de GET /api/keys ({"keys":[{"kid":0,"publicKey":"<base64url>"}]}).
//   Sortie : une ligne JSON ; code 0 si le QR est authentique (et du bon événement), 1 sinon, 2 si l'appel est faux.
import { createPublicKey, verify } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Ed25519Verify, verifyPassPayload } from "@orasso/shared";

const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

const ed25519: Ed25519Verify = (message, signature, publicKey) => {
  try {
    const key = createPublicKey({ key: Buffer.concat([SPKI_PREFIX, publicKey]), format: "der", type: "spki" });
    return verify(null, message, key, signature);
  } catch {
    return false;
  }
};

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

const source = arg("--keys");
const eventNo = arg("--event-no");
const payload = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && !all[i - 1]?.startsWith("--"))[0];
if (!source || !payload) {
  console.error("Usage : verify-pass-offline.ts --keys <fichier.json | URL> [--event-no N] <charge utile OR1…>");
  process.exit(2);
}

const raw = source.startsWith("http") ? await (await fetch(source)).text() : await readFile(source, "utf8");
const list = (JSON.parse(raw) as { keys: { kid: number; publicKey: string }[] }).keys;
const keys = new Map(list.map((k) => [k.kid, new Uint8Array(Buffer.from(k.publicKey, "base64url"))]));

const check = verifyPassPayload(payload, keys, ed25519);
if (!check.ok) {
  console.log(JSON.stringify({ valid: false, reason: check.reason }));
  process.exit(1);
}
const { kid, passId } = check.pass;
if (eventNo !== undefined && check.pass.eventNo !== Number(eventNo)) {
  console.log(JSON.stringify({ valid: false, reason: "other_event", eventNo: check.pass.eventNo }));
  process.exit(1);
}
console.log(JSON.stringify({ valid: true, kid, eventNo: check.pass.eventNo, passId }));
