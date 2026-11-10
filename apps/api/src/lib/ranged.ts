// Service d'un fichier du disque par morceaux (lot R7g) : `Accept-Ranges`, `200` entier, `206` + `Content-Range`, `416` hors bornes.
// Le fichier n'est jamais chargé en mémoire (flux du morceau demandé). Utilisé par la lecture d'une story vidéo et par le
// dossier de modération d'un signalement : les droits sont contrôlés par l'appelant, avant.
import { Readable } from "node:stream";
import type { Context } from "hono";

import { parseByteRange } from "./range";
import { storage } from "./storage";

export function rangedFile(c: Context, key: string, size: number, headers: Record<string, string>): Response {
  const base = { ...headers, "accept-ranges": "bytes" };
  const range = parseByteRange(c.req.header("range"), size);
  if (range === "unsatisfiable") return c.body(null, 416, { ...base, "content-range": `bytes */${size}` });
  const { start, end } = range ?? { start: 0, end: size - 1 };
  const stream = Readable.toWeb(storage.stream(key, start, end)) as unknown as ReadableStream<Uint8Array>;
  return c.body(stream, range ? 206 : 200, {
    ...base,
    "content-length": String(end - start + 1),
    ...(range ? { "content-range": `bytes ${start}-${end}/${size}` } : {}),
  });
}
