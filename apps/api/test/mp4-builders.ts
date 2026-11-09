// Outils des tests de vidéo (lot R7g) : fabriquer des fichiers MP4 abîmés ou chargés de métadonnées à partir de la fixture
// `story-2s.mp4` (une mire de 2 s, aucune plaque, aucune personne). Aucun vrai lieu : la position est factice.

/** Une boîte MP4 : taille, type, contenu. */
export function box(type: string, ...parts: Buffer[]): Buffer {
  const payload = Buffer.concat(parts);
  const out = Buffer.alloc(8 + payload.length);
  out.writeUInt32BE(out.length, 0);
  out.write(type, 4, "latin1");
  payload.copy(out, 8);
  return out;
}

/** Décalage de chaque boîte d'un chemin (`["moov", "trak", "mdia"]`), du haut vers le bas. */
export function locate(data: Buffer, path: string[]): number[] {
  const offsets: number[] = [];
  let from = 0;
  let to = data.length;
  for (const type of path) {
    let o = from;
    let found = -1;
    while (o + 8 <= to) {
      const size = data.readUInt32BE(o);
      if (data.toString("latin1", o + 4, o + 8) === type) {
        found = o;
        break;
      }
      o += size;
    }
    if (found < 0) throw new Error(`boîte absente : ${path.join("/")}`);
    offsets.push(found);
    from = found + 8;
    to = found + data.readUInt32BE(found);
  }
  return offsets;
}

/** Remplace la boîte du chemin par la même, réduite à `payloadLength` octets de contenu ; les tailles des parents suivent. */
export function shrinkBox(data: Buffer, path: string[], payloadLength: number): Buffer {
  const offsets = locate(data, path);
  const at = offsets.at(-1) as number;
  const size = data.readUInt32BE(at);
  const next = 8 + payloadLength;
  const out = Buffer.concat([
    data.subarray(0, at),
    Buffer.from(data.subarray(at, at + 8)),
    data.subarray(at + 8, at + 8 + payloadLength),
    data.subarray(at + size),
  ]);
  out.writeUInt32BE(next, at);
  for (const parent of offsets.slice(0, -1)) out.writeUInt32BE(out.readUInt32BE(parent) + next - size, parent);
  return out;
}

/** Ajoute une boîte à la fin du contenu de la boîte du chemin ; les tailles des parents suivent. */
export function appendChild(data: Buffer, path: string[], child: Buffer): Buffer {
  const offsets = locate(data, path);
  const parent = offsets.at(-1) as number;
  const end = parent + data.readUInt32BE(parent);
  const out = Buffer.concat([data.subarray(0, end), child, data.subarray(end)]);
  for (const o of offsets) out.writeUInt32BE(out.readUInt32BE(o) + child.length, o);
  return out;
}

/** Position factice (Perpignan, arrondie) : jamais un vrai lieu. */
export const FAKE_PLACE = "+42.6887+002.8948";

/** La vidéo de la fixture avec un lieu : `©xyz` dans le `udta` de `moov`, un `uuid` et un `meta` en fin de fichier. */
export function withLocation(data: Buffer): Buffer {
  const out = Buffer.from(data);
  const at = out.indexOf("udta") - 4;
  const size = out.readUInt32BE(at);
  if (out.toString("latin1", at + 4, at + 8) !== "udta") throw new Error("udta introuvable");
  out.fill(0, at + 8, at + size);
  const xyz = Buffer.alloc(size - 8);
  xyz.writeUInt32BE(size - 8, 0);
  xyz.write("©xyz", 4, "latin1");
  xyz.writeUInt16BE(FAKE_PLACE.length + 1, 8);
  xyz.writeUInt16BE(0x15c7, 10);
  xyz.write(`${FAKE_PLACE}/`, 12, "latin1");
  xyz.copy(out, at + 8);
  const uuid = box("uuid", Buffer.alloc(16, 7), Buffer.from(`GPS ${FAKE_PLACE} Perpignan`));
  const meta = box("meta", Buffer.alloc(4), Buffer.from(`com.apple.quicktime.location.ISO6709 ${FAKE_PLACE}`));
  return Buffer.concat([out, uuid, meta]);
}

/** Une piste (`trak`) sans image, avec ce gestionnaire (`vide`, `soun`, `tmcd`, `mebx`, `gpmd`…) et d'autres boîtes dans `mdia`. */
export function bareTrack(handler: string, ...inMdia: Buffer[]): Buffer {
  const hdlr = box("hdlr", Buffer.alloc(8), Buffer.from(handler, "latin1"), Buffer.alloc(12), Buffer.from("Orasso\0"));
  return box("trak", box("mdia", hdlr, ...inMdia));
}

/** Boîte `keys` d'une piste `mebx` (clés de métadonnées, espace de noms `mdta`). */
export function mebxKeys(...names: string[]): Buffer {
  const entries = names.map((name) => box("mdta", Buffer.from(name, "latin1")));
  const count = Buffer.alloc(8);
  count.writeUInt32BE(entries.length, 4);
  return box("minf", box("stbl", box("stsd", count, box("mebx", Buffer.alloc(8), box("keys", ...entries)))));
}

/** `minf/stbl/stsd` d'une piste de métadonnées avec une seule entrée de ce format (`gpmd`, `djmd`, `camm`, `mett`…), sans aucune clé. */
export function metaEntry(format: string): Buffer {
  const count = Buffer.alloc(8);
  count.writeUInt32BE(1, 4);
  return box("minf", box("stbl", box("stsd", count, box(format, Buffer.alloc(8)))));
}
