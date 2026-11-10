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

const u32Array = (values: number[]): Buffer => {
  const out = Buffer.alloc(values.length * 4);
  for (const [i, v] of values.entries()) out.writeUInt32BE(v, i * 4);
  return out;
};

const u32 = (...values: number[]): Buffer => {
  const out = Buffer.alloc(values.length * 4);
  for (const [i, v] of values.entries()) out.writeUInt32BE(v, i * 4);
  return out;
};

/** `mdhd` de version 0 : échelle de temps et durée (en ticks). */
export const mdhd = (timescale: number, duration: number): Buffer =>
  box("mdhd", u32(0, 0, 0, timescale, duration), Buffer.alloc(4));

/**
 * Une piste (`trak`) complète avec un seul morceau d'`length` octets à `offset` dans le fichier (tables `stsd`, `stts`, `stsc`,
 * `stsz`, `stco`) : de quoi tester l'effacement des échantillons. `ticks` : durée dite par `stts`, `declared` : durée de `mdhd`
 * (échelle de 1000 ticks par seconde).
 */
export function sampledTrack(
  handler: string,
  format: string,
  offset: number,
  length: number,
  ticks = 1000,
  declared = 1000,
) {
  const stsd = box("stsd", u32(0, 1), box(format, Buffer.alloc(8)));
  const stts = box("stts", u32(0, 1, 1, ticks));
  const stsc = box("stsc", u32(0, 1, 1, 1, 1));
  const stsz = box("stsz", u32(0, length, 1));
  const stco = box("stco", u32(0, 1, offset));
  const hdlr = box("hdlr", Buffer.alloc(8), Buffer.from(handler, "latin1"), Buffer.alloc(12), Buffer.from("Orasso\0"));
  return box("trak", box("mdia", mdhd(1000, declared), hdlr, box("minf", box("stbl", stsd, stts, stsc, stsz, stco))));
}

/**
 * La fixture (`moov` en tête, `mdat` en dernier) avec `payload` ajouté à la fin de `mdat` et une piste de plus qui le décrit
 * (`track(offset)`, `offset` = position de `payload` dans le fichier rendu). `moov` grossit : les `stco` des pistes
 * d'origine sont décalés d'autant, la vidéo reste lisible. Renvoie le fichier et la position de `payload`.
 */
export function withMdatTrack(
  data: Buffer,
  track: (offset: number) => Buffer,
  payload: Buffer,
): { file: Buffer; at: number } {
  const delta = track(0).length;
  const shifted = Buffer.from(data);
  for (let from = shifted.indexOf("stco"); from >= 0; from = shifted.indexOf("stco", from + 1)) {
    const count = shifted.readUInt32BE(from + 8);
    for (let i = 0; i < count; i++) {
      const o = from + 12 + i * 4;
      shifted.writeUInt32BE(shifted.readUInt32BE(o) + delta, o);
    }
  }
  const at = data.length + delta;
  const out = Buffer.concat([appendChild(shifted, ["moov"], track(at)), payload]);
  const [mdat] = locate(out, ["mdat"]) as [number];
  out.writeUInt32BE(out.readUInt32BE(mdat) + payload.length, mdat);
  return { file: out, at };
}

/**
 * La vidéo avec `block` glissé dans `mdat` **entre deux morceaux** (avant le deuxième morceau du fichier, toutes pistes
 * confondues), comme les blocs « freeGPS » des caméras Novatek : aucune piste ne le décrit. Les `stco` suivants et la taille de
 * `mdat` suivent ; `moov` ne change pas de taille. Renvoie le fichier et la position du bloc.
 */
export function withMdatGap(data: Buffer, block: Buffer): { file: Buffer; at: number } {
  const offsets: number[] = [];
  for (let from = data.indexOf("stco"); from >= 0; from = data.indexOf("stco", from + 1)) {
    for (let i = 0; i < data.readUInt32BE(from + 8); i++) offsets.push(data.readUInt32BE(from + 12 + i * 4));
  }
  const at = [...new Set(offsets)].sort((a, b) => a - b)[1] as number;
  const shifted = Buffer.from(data);
  for (let from = shifted.indexOf("stco"); from >= 0; from = shifted.indexOf("stco", from + 1)) {
    for (let i = 0; i < shifted.readUInt32BE(from + 8); i++) {
      const o = from + 12 + i * 4;
      const value = shifted.readUInt32BE(o);
      if (value >= at) shifted.writeUInt32BE(value + block.length, o);
    }
  }
  const out = Buffer.concat([shifted.subarray(0, at), block, shifted.subarray(at)]);
  const [mdat] = locate(out, ["mdat"]) as [number];
  out.writeUInt32BE(out.readUInt32BE(mdat) + block.length, mdat);
  return { file: out, at };
}

/**
 * Une piste son PCM façon QuickTime (`sowt` par défaut, 2 voies, 16 bits, 48 kHz) d'un seul morceau de `frames` trames à
 * `offset`, **`stsz` à taille 1** : `stsc` compte des trames. `version` : 0, 1 ou 2 de l'entrée `stsd` (`bytesPerFrame` 4).
 * `format` et `bits` permettent de fabriquer des cas refusés.
 */
export function pcmTrack(version: 0 | 1 | 2, offset: number, frames: number, format = "sowt", bits = 16): Buffer {
  const entry = Buffer.alloc(version === 0 ? 28 : version === 1 ? 44 : 64);
  entry.writeUInt16BE(1, 6);
  entry.writeUInt16BE(version, 8);
  if (version < 2) {
    entry.writeUInt16BE(2, 16);
    entry.writeUInt16BE(bits, 18);
    entry.writeUInt32BE(48000 * 65536, 24);
  }
  if (version === 1) {
    entry.writeUInt32BE(1, 28); // samplesPerPacket
    entry.writeUInt32BE(4, 32); // bytesPerPacket
    entry.writeUInt32BE(4, 36); // bytesPerFrame
    entry.writeUInt32BE(2, 40); // bytesPerSample
  }
  if (version === 2) {
    entry.writeUInt16BE(3, 16);
    entry.writeUInt16BE(16, 18);
    entry.writeUInt16BE(0xfffe, 20);
    entry.writeUInt32BE(72, 28);
    entry.writeUInt32BE(2, 40); // voies
    entry.writeUInt32BE(0x7f000000, 44);
    entry.writeUInt32BE(16, 48);
    entry.writeUInt32BE(4, 56); // constBytesPerAudioPacket
    entry.writeUInt32BE(1, 60); // constLPCMFramesPerAudioPacket
  }
  const stsd = box("stsd", u32(0, 1), box(format, entry));
  const stts = box("stts", u32(0, 1, frames, 1));
  const stsc = box("stsc", u32(0, 1, 1, frames, 1));
  const stsz = box("stsz", u32(0, 1, frames));
  const stco = box("stco", u32(0, 1, offset));
  const hdlr = box("hdlr", Buffer.alloc(8), Buffer.from("soun", "latin1"), Buffer.alloc(12), Buffer.from("Orasso\0"));
  return box("trak", box("mdia", mdhd(48000, frames), hdlr, box("minf", box("stbl", stsd, stts, stsc, stsz, stco))));
}

/**
 * Ajoute `child` à la fin de la première description d'échantillon de ce format (`avc1`, `mp4a`…) de la première piste : les
 * tailles de l'entrée, de `stsd` et de leurs parents suivent, les `stco` sont décalés (`moov` grossit, il est avant `mdat`).
 */
export function withEntryChild(data: Buffer, format: string, child: Buffer): Buffer {
  const shifted = Buffer.from(data);
  for (let from = shifted.indexOf("stco"); from >= 0; from = shifted.indexOf("stco", from + 1)) {
    for (let i = 0; i < shifted.readUInt32BE(from + 8); i++) {
      const o = from + 12 + i * 4;
      shifted.writeUInt32BE(shifted.readUInt32BE(o) + child.length, o);
    }
  }
  const entry = shifted.indexOf(format, shifted.indexOf("moov")) - 4;
  if (entry < 0) throw new Error(`description absente : ${format}`);
  const end = entry + shifted.readUInt32BE(entry);
  // Boîtes qui contiennent l'entrée, du haut vers le bas (`stsd` a 8 octets de plus avant ses entrées).
  const parents: number[] = [];
  let from = 0;
  let to = shifted.length;
  for (const type of ["moov", "trak", "mdia", "minf", "stbl", "stsd"]) {
    let o = from;
    while (o + 8 <= to) {
      const size = shifted.readUInt32BE(o);
      if (shifted.toString("latin1", o + 4, o + 8) === type && o < entry && entry < o + size) break;
      o += size;
    }
    parents.push(o);
    from = o + 8 + (type === "stsd" ? 8 : 0);
    to = o + shifted.readUInt32BE(o);
  }
  const out = Buffer.concat([shifted.subarray(0, end), child, shifted.subarray(end)]);
  for (const o of [...parents, entry]) out.writeUInt32BE(out.readUInt32BE(o) + child.length, o);
  return out;
}

/**
 * Une piste (`trak`) dont `offsets.length` morceaux d'un échantillon de `length` octets sont aux `offsets` (qui peuvent être
 * tous les mêmes : mille références au même bloc).
 */
export function chunksTrack(handler: string, format: string, offsets: number[], length: number): Buffer {
  const stsd = box("stsd", u32(0, 1), box(format, Buffer.alloc(handler === "vide" ? 78 : 8)));
  const stts = box("stts", u32(0, 1, offsets.length, 1));
  const stsc = box("stsc", u32(0, 1, 1, 1, 1));
  const stsz = box("stsz", u32(0, length, offsets.length));
  const stco = box("stco", u32(0, offsets.length), u32Array(offsets));
  const hdlr = box("hdlr", Buffer.alloc(8), Buffer.from(handler, "latin1"), Buffer.alloc(12), Buffer.from("Orasso\0"));
  const mdhdBox = mdhd(1000, offsets.length);
  return box("trak", box("mdia", mdhdBox, hdlr, box("minf", box("stbl", stsd, stts, stsc, stsz, stco))));
}

/** Entrée `stsd` d'un son PCM (`pcmTrack` en dérive) : version 0, 2 voies, `bits` bits. */
export function pcmEntry0(bits = 16): Buffer {
  const entry = Buffer.alloc(28);
  entry.writeUInt16BE(1, 6);
  entry.writeUInt16BE(2, 16);
  entry.writeUInt16BE(bits, 18);
  entry.writeUInt32BE(48000 * 65536, 24);
  return entry;
}

/**
 * Une piste son PCM (`stsz` à taille 1) de `offsets.length` morceaux d'`frames` trames, `entries` descriptions identiques dans `stsd`, tous les
 * morceaux avec la description numéro `desc` : de quoi mesurer le coût de la lecture de `stsd`.
 */
export function manyPcmTrack(entries: number, offsets: number[], frames: number, desc: number): Buffer {
  const stsd = box("stsd", u32(0, entries), ...Array.from({ length: entries }, () => box("sowt", pcmEntry0())));
  const stts = box("stts", u32(0, 1, offsets.length * frames, 1));
  const stsc = box("stsc", u32(0, 1, 1, frames, desc));
  const stsz = box("stsz", u32(0, 1, offsets.length * frames));
  const stco = box("stco", u32(0, offsets.length), u32Array(offsets));
  const hdlr = box("hdlr", Buffer.alloc(8), Buffer.from("soun", "latin1"), Buffer.alloc(12), Buffer.from("Orasso\0"));
  return box(
    "trak",
    box("mdia", mdhd(48000, offsets.length * frames), hdlr, box("minf", box("stbl", stsd, stts, stsc, stsz, stco))),
  );
}

/**
 * Une piste vidéo H.264 (`avc1` + `avcC`) ou HEVC (`hvc1` + `hvcC`) d'un seul échantillon de `length` octets à `offset`, NAL préfixés
 * par `lengthSize` octets : de quoi tester le remplacement des SEI.
 */
export function nalTrack(hevc: boolean, offset: number, length: number, lengthSize = 4): Buffer {
  const config = hevc
    ? (() => {
        const c = Buffer.alloc(23);
        c[0] = 1;
        c[21] = 0xfc | (lengthSize - 1);
        return box("hvcC", c);
      })()
    : box("avcC", Buffer.from([1, 66, 0, 30, 0xfc | (lengthSize - 1), 0xe0, 0]));
  const stsd = box("stsd", u32(0, 1), box(hevc ? "hvc1" : "avc1", Buffer.alloc(78), config));
  const stts = box("stts", u32(0, 1, 1, 1000));
  const stsc = box("stsc", u32(0, 1, 1, 1, 1));
  const stsz = box("stsz", u32(0, length, 1));
  const stco = box("stco", u32(0, 1, offset));
  const hdlr = box("hdlr", Buffer.alloc(8), Buffer.from("vide", "latin1"), Buffer.alloc(12), Buffer.from("Orasso\0"));
  return box("trak", box("mdia", mdhd(1000, 1000), hdlr, box("minf", box("stbl", stsd, stts, stsc, stsz, stco))));
}

/** Un NAL préfixé par sa longueur (`lengthSize` octets) : `header` (1 ou 2 octets) puis `payload`. */
export function nal(header: number[], payload: Buffer, lengthSize = 4): Buffer {
  const body = Buffer.concat([Buffer.from(header), payload]);
  const prefix = Buffer.alloc(lengthSize);
  prefix.writeUIntBE(body.length, 0, lengthSize);
  return Buffer.concat([prefix, body]);
}

/** Ajoute `tail` à la fin du contenu de `stsd` de la première piste (après ses descriptions) ; les `stco` suivent. */
export function withStsdTail(data: Buffer, tail: Buffer): Buffer {
  const shifted = Buffer.from(data);
  for (let from = shifted.indexOf("stco"); from >= 0; from = shifted.indexOf("stco", from + 1)) {
    for (let i = 0; i < shifted.readUInt32BE(from + 8); i++) {
      const o = from + 12 + i * 4;
      shifted.writeUInt32BE(shifted.readUInt32BE(o) + tail.length, o);
    }
  }
  const parents = locate(shifted, ["moov", "trak", "mdia", "minf", "stbl"]);
  const stsd = shifted.indexOf("stsd", parents.at(-1) as number) - 4;
  const end = stsd + shifted.readUInt32BE(stsd);
  const out = Buffer.concat([shifted.subarray(0, end), tail, shifted.subarray(end)]);
  for (const o of [...parents, stsd]) out.writeUInt32BE(out.readUInt32BE(o) + tail.length, o);
  return out;
}

/**
 * Une piste vidéo H.264 (`avc1` + `avcC`, NAL sur 4 octets) de plusieurs échantillons contigus à partir de `offset`, de tailles
 * `sizes` (table `stsz`), rangés `perChunk` par morceau : un seul morceau (`perChunk` = nombre d'échantillons) ou des morceaux
 * contigus (`perChunk` = 1).
 */
export function nalSamplesTrack(offset: number, sizes: number[], perChunk: number): Buffer {
  const config = box("avcC", Buffer.from([1, 66, 0, 30, 0xff, 0xe0, 0]));
  const stsd = box("stsd", u32(0, 1), box("avc1", Buffer.alloc(78), config));
  const stts = box("stts", u32(0, 1, sizes.length, 1));
  const stsc = box("stsc", u32(0, 1, 1, perChunk, 1));
  const stsz = box("stsz", u32(0, 0, sizes.length), u32Array(sizes));
  const starts: number[] = [];
  let o = offset;
  for (const [i, size] of sizes.entries()) {
    if (i % perChunk === 0) starts.push(o);
    o += size;
  }
  const stco = box("stco", u32(0, starts.length), u32Array(starts));
  const hdlr = box("hdlr", Buffer.alloc(8), Buffer.from("vide", "latin1"), Buffer.alloc(12), Buffer.from("Orasso\0"));
  return box(
    "trak",
    box("mdia", mdhd(1000, sizes.length), hdlr, box("minf", box("stbl", stsd, stts, stsc, stsz, stco))),
  );
}
