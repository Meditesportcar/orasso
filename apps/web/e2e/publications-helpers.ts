import { crc32, deflateSync } from "node:zlib";
import { apiCall } from "./helpers";

// Lot R8b2 : une publication de recette faite par l'API (comme le ferait l'écran « Publier »). La photo est un aplat de couleur
// (jamais une photo réelle) au format 4:5 que l'API exige pour un portrait.
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

export function portraitPhoto(rgb: [number, number, number] = [138, 74, 42]): Buffer {
  const width = 240;
  const height = 300;
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = rgb[0];
    row[2 + x * 3] = rgb[1];
    row[3 + x * 3] = rgb[2];
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  const chunk = (type: string, body: Buffer) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(body.length);
    const tag = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([tag, body])));
    return Buffer.concat([head, tag, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** Publie une photo avec une légende ; rend l'identifiant de la publication. */
export async function publishApi(cookie: string, caption: string): Promise<string> {
  const form = new FormData();
  form.append("purpose", "feed_post");
  form.append("file", new Blob([new Uint8Array(portraitPhoto())], { type: "image/png" }), "photo.png");
  const up = await fetch(`${API}/api/me/uploads`, { method: "POST", headers: { origin: WEB, cookie }, body: form });
  const { key } = (await up.json()) as { key: string };
  const res = await apiCall<{ id: string }>(cookie, "POST", "/me/feed-posts", {
    caption,
    aspect: "portrait_4_5",
    clientId: crypto.randomUUID(),
    photos: [{ uploadKey: key, noPlateConfirmed: true }],
  });
  if (res.status !== 201) throw new Error(`publication : ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.id;
}
