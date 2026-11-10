// Lecteur de conteneur MP4 / MOV (lot R7g) : la logique est dans `@orasso/shared` (`rules/mp4.ts`, pure : l'appli et le site
// s'en servent aussi pour savoir si une vidéo est en H.264 avant de l'envoyer). Ici seulement les sources de l'API : un
// fichier du disque (lu par petits morceaux, jamais chargé) ou un tampon (essais).
import { open } from "node:fs/promises";
import { Mp4Error, type Mp4Info, mp4BufferSource, readMp4, storyVideoLabels } from "@orasso/shared";

export { Mp4Error, type Mp4ErrorKind, type Mp4Info } from "@orasso/shared";

/** Message (415) d'un fichier que le lecteur refuse. */
export const mp4ErrorMessage = (error: Mp4Error): string =>
  error.kind === "no_video"
    ? storyVideoLabels.apiNoVideo
    : error.kind === "location_track"
      ? storyVideoLabels.apiLocationTrack
      : storyVideoLabels.apiUnreadable;

/** Lit un fichier du disque sans le charger (un descripteur, des lectures de quelques octets). */
export async function readMp4File(path: string): Promise<Mp4Info> {
  const handle = await open(path, "r");
  try {
    const { size } = await handle.stat();
    return await readMp4({
      size,
      read: async (offset, length) => {
        const buffer = Buffer.alloc(Math.min(length, Math.max(0, size - offset)));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
        return buffer.subarray(0, bytesRead);
      },
    });
  } finally {
    await handle.close();
  }
}

export const readMp4Buffer = (data: Uint8Array): Promise<Mp4Info> => readMp4(mp4BufferSource(data));

/** Plus gros `moov` parcouru (même borne que le lecteur). */
const STRIP_MOOV_MAX = 8 * 1024 * 1024;

/** Une boîte du tampon lu : `rel` est sa position dans le tampon, `offset` sa position dans le fichier. */
type RawBox = { type: string; offset: number; rel: number; header: number; size: number };

/**
 * Liste blanche (lot R7g, tour 5) : à chaque niveau, les boîtes dont le type est dans `keep` gardent leur contenu (et sont
 * parcourues à leur tour si `into` en parle) ; tout le reste devient `free` et son contenu est mis à zéro. On ne poursuit plus
 * les formats un par un (`udta`, `meta`, `uuid`, `gps `, blocs `free` des caméras de bord…) : ce qui n'est pas listé disparaît.
 */
type Level = { keep: ReadonlySet<string>; into?: Readonly<Record<string, Level>> };
const names = (...types: string[]): ReadonlySet<string> => new Set(types);
const STBL_LEVEL: Level = {
  keep: names(
    "stsd",
    "stts",
    "ctts",
    "cslg",
    "stss",
    "stps",
    "sdtp",
    "stsc",
    "stsz",
    "stz2",
    "stco",
    "co64",
    "padb",
    "stdp",
    "sbgp",
    "sgpd",
    "subs",
    "saiz",
    "saio",
  ),
};
const MINF_LEVEL: Level = {
  keep: names("vmhd", "smhd", "nmhd", "gmhd", "dinf", "stbl"),
  into: { dinf: { keep: names("dref") }, stbl: STBL_LEVEL },
};
const MDIA_LEVEL: Level = { keep: names("mdhd", "hdlr", "minf"), into: { minf: MINF_LEVEL } };
const TRAK_LEVEL: Level = {
  keep: names("tkhd", "edts", "mdia"),
  into: { edts: { keep: names("elst") }, mdia: MDIA_LEVEL },
};
const MOOV_LEVEL: Level = { keep: names("mvhd", "trak"), into: { trak: TRAK_LEVEL } };
/** Premier niveau : seules `ftyp`, `moov` et `mdat` gardent leur contenu. */
const TOP_KEEP = names("ftyp", "moov", "mdat");
/** Pistes dont les échantillons sont gardés ; ceux de toutes les autres (`meta`, `mebx`, `tmcd`, texte…) sont mis à zéro. */
const KEPT_HANDLERS = new Set(["vide", "soun"]);

const unreadable = (what: string) => new Mp4Error("unreadable", `Vidéo illisible (${what})`);

/**
 * Boîtes d'une plage du tampon, et les octets qui ne sont dans aucune boîte (boîte invalide, restes) : ils sont mis à zéro eux aussi.
 */
function rawBoxes(
  data: Buffer,
  from: number,
  to: number,
  base: number,
): { boxes: RawBox[]; rest: [number, number] | null } {
  const boxes: RawBox[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = data.readUInt32BE(o);
    let header = 8;
    if (size === 1) {
      if (o + 16 > to) break;
      const big = data.readBigUInt64BE(o + 8);
      if (big > BigInt(to)) break;
      size = Number(big);
      header = 16;
    } else if (size === 0) size = to - o;
    if (size < header || o + size > to) break;
    boxes.push({ type: data.toString("latin1", o + 4, o + 8), offset: base + o, rel: o, header, size });
    o += size;
  }
  return { boxes, rest: o < to ? [o, to] : null };
}

/** Ce que `moov` demande de faire au fichier (positions du fichier). */
type Plan = {
  /** Boîtes à changer en `free` avec un contenu à zéro. */
  freed: { offset: number; header: number; size: number }[];
  /** Plages à mettre à zéro (restes de `moov`, noms de gestionnaires, échantillons des pistes autres que vidéo et son). */
  zero: [number, number][];
  /** Début de chaque morceau de chaque piste (aucun ne doit sortir des boîtes gardées du fichier). */
  chunkStarts: number[];
  /** Plages des échantillons des pistes autres que vidéo et son (à mettre à zéro, dans `mdat`). */
  foreign: [number, number][];
};

const u32at = (data: Buffer, o: number, limit: number): number => {
  if (o + 4 > limit) throw unreadable("table tronquée");
  return data.readUInt32BE(o);
};

/**
 * Plages d'octets (dans le fichier) des échantillons d'une piste, par ses tables `stsc` + `stco`/`co64` + `stsz`/`stz2`.
 * Une piste sans table de morceaux n'a pas d'échantillon ; si elle en a, ses autres tables sont exigées (sinon on ne saurait
 * pas où ils sont : refus). `chunkStarts` reçoit le début de chaque morceau.
 */
function trackSampleRanges(
  moov: Buffer,
  stbl: RawBox,
  base: number,
  chunkStarts: number[],
  wantRanges: boolean,
): [number, number][] {
  const { boxes } = rawBoxes(moov, stbl.rel + stbl.header, stbl.rel + stbl.size, base);
  const pick = (type: string) => boxes.find((b) => b.type === type);
  const stco = pick("stco");
  const chunkBox = stco ?? pick("co64");
  if (!chunkBox) return [];
  const end = (b: RawBox) => b.rel + b.size;
  const dataAt = (b: RawBox) => b.rel + b.header;
  const chunkCount = u32at(moov, dataAt(chunkBox) + 4, end(chunkBox));
  const step = stco ? 4 : 8;
  if (dataAt(chunkBox) + 8 + chunkCount * step > end(chunkBox)) throw unreadable("table des morceaux tronquée");
  const offsets: number[] = [];
  for (let i = 0, o = dataAt(chunkBox) + 8; i < chunkCount; i++, o += step) {
    const at = stco ? moov.readUInt32BE(o) : Number(moov.readBigUInt64BE(o));
    if (!Number.isSafeInteger(at)) throw unreadable("morceau démesuré");
    offsets.push(at);
    chunkStarts.push(at);
  }
  if (!wantRanges) return [];

  const stsc = pick("stsc");
  const stsz = pick("stsz");
  const stz2 = stsz ? undefined : pick("stz2");
  const sizes = stsz ?? stz2;
  if (!stsc || !sizes) throw unreadable("tables des échantillons absentes");
  // `stsc` : premier morceau, échantillons par morceau, description.
  const runs = u32at(moov, dataAt(stsc) + 4, end(stsc));
  if (dataAt(stsc) + 8 + runs * 12 > end(stsc)) throw unreadable("stsc tronquée");
  const firstChunk: number[] = [];
  const perChunk: number[] = [];
  for (let i = 0, o = dataAt(stsc) + 8; i < runs; i++, o += 12) {
    firstChunk.push(moov.readUInt32BE(o));
    perChunk.push(moov.readUInt32BE(o + 4));
  }
  if (chunkCount > 0 && runs === 0) throw unreadable("stsc vide");
  // Taille des échantillons : constante (`stsz` à taille non nulle) ou table (`stsz` ou `stz2`).
  const at = dataAt(sizes);
  let constant = 0;
  let sampleCount: number;
  let sizeOf: (index: number) => number;
  if (stsz) {
    constant = u32at(moov, at + 4, end(sizes));
    sampleCount = u32at(moov, at + 8, end(sizes));
    if (constant === 0 && at + 12 + sampleCount * 4 > end(sizes)) throw unreadable("stsz tronquée");
    sizeOf = (index) => (constant > 0 ? constant : moov.readUInt32BE(at + 12 + index * 4));
  } else {
    const field = u32at(moov, at + 4, end(sizes)) & 0xff;
    sampleCount = u32at(moov, at + 8, end(sizes));
    if (field !== 4 && field !== 8 && field !== 16) throw unreadable("stz2 invalide");
    if (at + 12 + Math.ceil((sampleCount * field) / 8) > end(sizes)) throw unreadable("stz2 tronquée");
    sizeOf = (index) =>
      field === 8
        ? moov.readUInt8(at + 12 + index)
        : field === 16
          ? moov.readUInt16BE(at + 12 + index * 2)
          : (moov.readUInt8(at + 12 + (index >> 1)) >> (index % 2 === 0 ? 4 : 0)) & 0x0f;
  }
  const ranges: [number, number][] = [];
  let sample = 0;
  let run = 0;
  for (let chunk = 1; chunk <= chunkCount; chunk++) {
    while (run + 1 < runs && (firstChunk[run + 1] as number) <= chunk) run++;
    const count = perChunk[run] as number;
    if (sample + count > sampleCount) throw unreadable("plus d'échantillons que déclaré");
    let length = 0;
    if (constant > 0) length = count * constant;
    else for (let i = 0; i < count; i++) length += sizeOf(sample + i);
    sample += count;
    const start = offsets[chunk - 1] as number;
    if (length > 0) ranges.push([start, start + length]);
  }
  return ranges;
}

/** Piste gardée : son gestionnaire décide du sort de ses échantillons ; le nom du gestionnaire (texte libre) est mis à zéro. */
function planTrak(moov: Buffer, trak: RawBox, base: number, plan: Plan): void {
  const inside = (box: RawBox, type: string): RawBox | undefined =>
    rawBoxes(moov, box.rel + box.header, box.rel + box.size, base).boxes.find((b) => b.type === type);
  const mdia = inside(trak, "mdia");
  // Une piste sans `mdia` n'a ni gestionnaire ni échantillon : rien à effacer de plus.
  if (!mdia) return;
  const hdlr = inside(mdia, "hdlr");
  if (!hdlr || hdlr.header + 12 > hdlr.size) throw unreadable("piste sans gestionnaire");
  const handler = moov.toString("latin1", hdlr.rel + hdlr.header + 8, hdlr.rel + hdlr.header + 12);
  // Version/indicateurs (4), pré-définition (4), type (4), réservé (12), puis le nom : du texte libre, inutile à la lecture.
  if (hdlr.size > hdlr.header + 24) {
    plan.zero.push([hdlr.offset + hdlr.header + 24, hdlr.offset + hdlr.size]);
  }
  const minf = inside(mdia, "minf");
  const stbl = minf ? inside(minf, "stbl") : undefined;
  if (!stbl) return;
  const ranges = trackSampleRanges(moov, stbl, base, plan.chunkStarts, !KEPT_HANDLERS.has(handler));
  plan.foreign.push(...ranges);
}

/** Parcourt un niveau de `moov` selon la liste blanche. */
function planLevel(moov: Buffer, parent: RawBox, base: number, level: Level, plan: Plan): void {
  const { boxes, rest } = rawBoxes(moov, parent.rel + parent.header, parent.rel + parent.size, base);
  if (rest) plan.zero.push([base + rest[0], base + rest[1]]);
  for (const box of boxes) {
    if (!level.keep.has(box.type)) {
      plan.freed.push(box);
      continue;
    }
    const inner = level.into?.[box.type];
    if (inner) planLevel(moov, box, base, inner, plan);
    if (box.type === "trak") planTrak(moov, box, base, plan);
  }
}

/**
 * Nettoie une vidéo avant de la garder, **par liste blanche** (lot R7g, tour 5 ; tours 2 à 4 : on poursuivait les formats un
 * par un, et chaque caméra en avait un de plus). Seul ce qui sert à lire l'image et le son reste :
 * - premier niveau : `ftyp`, `moov` et `mdat` gardent leur contenu ; tout le reste (`free`, `skip`, `wide`, `uuid`, `meta`,
 *   inconnu) devient `free` avec un contenu à zéro ; les octets après la dernière boîte (bloc de fin Insta360, rembourrage)
 *   sont coupés du fichier ;
 * - `moov` : `mvhd` et `trak` seulement ; `trak` : `tkhd`, `edts`/`elst`, `mdia` (`mdhd`, `hdlr`, `minf` → `vmhd`/`smhd`/`nmhd`/
 *   `gmhd`, `dinf`/`dref`, `stbl` et ses tables) ; le reste (`udta`, `meta`, `gps `, inconnu) devient `free` à zéro ;
 * - pistes autres que `vide` et `soun` (`meta`/`mett`, `tmcd`, texte…) : leurs échantillons dans `mdat` sont mis à zéro, quel
 *   que soit leur type MIME (la piste reste dans la structure, les lecteurs l'ignorent).
 * Les tailles ne changent pas (les décalages `stco`/`co64` restent justes), sauf la coupure de fin. Un morceau d'une piste
 * qui pointe au-delà de la fin des boîtes est refusé (`Mp4Error`, 415). À appeler après la vérification du lecteur.
 * Rend le nombre de boîtes neutralisées.
 */
export async function stripMp4Metadata(path: string): Promise<number> {
  const handle = await open(path, "r+");
  try {
    const { size } = await handle.stat();
    const free = Buffer.from("free", "latin1");
    const zeros = Buffer.alloc(1024 * 1024);
    const zeroRange = async (from: number, to: number) => {
      for (let at = from; at < to; at += zeros.length) {
        await handle.write(zeros, 0, Math.min(zeros.length, to - at), at);
      }
    };
    // Premier niveau : seulement les en-têtes, `mdat` n'est jamais lu.
    const tops: RawBox[] = [];
    let offset = 0;
    while (offset + 8 <= size) {
      const head = Buffer.alloc(16);
      const { bytesRead } = await handle.read(head, 0, 16, offset);
      if (bytesRead < 8) break;
      let total = head.readUInt32BE(0);
      let header = 8;
      if (total === 1) {
        if (bytesRead < 16) break;
        total = Number(head.readBigUInt64BE(8));
        header = 16;
      } else if (total === 0) total = size - offset;
      if (total < header || offset + total > size) break;
      tops.push({ type: head.toString("latin1", 4, 8), offset, rel: offset, header, size: total });
      offset += total;
    }
    // `offset` est la fin de la dernière boîte : ce qui suit n'est dans aucune boîte.
    const end = offset;
    const plan: Plan = { freed: [], zero: [], chunkStarts: [], foreign: [] };
    for (const top of tops) {
      if (!TOP_KEEP.has(top.type)) plan.freed.push(top);
      else if (top.type === "moov") {
        if (top.size > STRIP_MOOV_MAX) throw unreadable("moov démesuré");
        const moov = Buffer.alloc(top.size);
        await handle.read(moov, 0, top.size, top.offset);
        planLevel(moov, { ...top, rel: 0 }, top.offset, MOOV_LEVEL, plan);
      }
    }
    // Aucun morceau ne doit pointer dans la partie coupée (ni au-delà du fichier), et les échantillons à effacer sont dans `mdat`.
    if (plan.chunkStarts.some((at) => at >= end)) throw unreadable("morceau hors des boîtes du fichier");
    const mdats = tops
      .filter((t) => t.type === "mdat")
      .map((t): [number, number] => [t.offset + t.header, t.offset + t.size]);
    for (const [from, to] of plan.foreign) {
      if (!mdats.some(([a, b]) => from >= a && to <= b)) throw unreadable("échantillons hors des données");
    }

    for (const box of plan.freed) {
      await handle.write(free, 0, 4, box.offset + 4);
      // Le contenu d'une boîte `free` est ignoré par tous les lecteurs : on l'efface aussi (le lieu ne reste pas dans le fichier).
      await zeroRange(box.offset + box.header, box.offset + box.size);
    }
    for (const [from, to] of plan.zero) await zeroRange(from, to);
    for (const [from, to] of plan.foreign) await zeroRange(from, to);
    if (end < size) await handle.truncate(end);
    return plan.freed.length;
  } finally {
    await handle.close();
  }
}
