// Recette du lot 48 : le code tournant OR2 refait ici avec node:crypto (indépendamment du paquet partagé), comme le
// fabriquerait le téléphone du participant, et quelques accès directs à la base de recette.
import { createHmac } from "node:crypto";
import pg from "pg";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32(bytes: Buffer): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const b of bytes) {
    buffer = (buffer << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(buffer >>> (bits - 5)) & 31];
      bits -= 5;
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) out += B32[(buffer << (5 - bits)) & 31];
  return out;
}

/** « OR2 » + base32(version 2 · event_no u32 · pass_id 16 · slot u32 ‖ HMAC-SHA256 tronqué à 16 octets). */
export function rotatingCode(secret: string, eventNo: number, passId: string, atMs: number): string {
  const msg = Buffer.alloc(25);
  msg.writeUInt8(2, 0);
  msg.writeUInt32BE(eventNo, 1);
  Buffer.from(passId.replaceAll("-", ""), "hex").copy(msg, 5);
  msg.writeUInt32BE(Math.floor(atMs / 20_000), 21);
  const mac = createHmac("sha256", Buffer.from(secret, "base64url")).update(msg).digest().subarray(0, 16);
  return `OR2${base32(Buffer.concat([msg, mac]))}`;
}

/** Requête SQL sur la base de recette (DATABASE_URL du .env). */
export async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}
