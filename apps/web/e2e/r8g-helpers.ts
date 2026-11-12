import { crc32, deflateSync } from "node:zlib";
import { apiCall } from "./helpers";

// Lot R8g, tour 3 : une publication de structure à plusieurs photos de format paysage (1,25), pour la vue sans session.
const API = `http://localhost:${process.env.API_PORT ?? 3001}`;
const WEB = `http://localhost:${process.env.WEB_PORT ?? 5173}`;

export function landscapePhoto(rgb: [number, number, number] = [140, 60, 40]): Buffer {
  const width = 300;
  const height = 240;
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

/** Une publication de la structure, sans événement, avec `n` photos paysage. Rend son identifiant. */
export async function publishLandscapeAsStructure(
  cookie: string,
  structureId: string,
  caption: string,
  n = 2,
): Promise<string> {
  const photos: { uploadKey: string; noPlateConfirmed: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const form = new FormData();
    form.append("purpose", "feed_post");
    form.append(
      "file",
      new Blob([new Uint8Array(landscapePhoto([140 - i * 40, 60, 40 + i * 50]))], { type: "image/png" }),
      "photo.png",
    );
    const up = await fetch(`${API}/api/me/uploads`, { method: "POST", headers: { origin: WEB, cookie }, body: form });
    photos.push({ uploadKey: ((await up.json()) as { key: string }).key, noPlateConfirmed: true });
  }
  const res = await apiCall<{ id: string }>(cookie, "POST", "/me/feed-posts", {
    caption,
    aspect: "landscape",
    clientId: crypto.randomUUID(),
    persona: "organizer",
    structureId,
    placeLabel: "Perpignan",
    photos,
  });
  if (res.status !== 201) throw new Error(`publication paysage : ${res.status} ${JSON.stringify(res.data)}`);
  return res.data.id;
}
