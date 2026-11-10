// Lecteur de conteneur MP4 / MOV (lot R7g) : la logique est dans `@orasso/shared` (`rules/mp4.ts`, pure : l'appli et le site
// s'en servent aussi pour savoir si une vidéo est en H.264 avant de l'envoyer). Ici seulement les sources de l'API : un
// fichier du disque (lu par petits morceaux, jamais chargé) ou un tampon (essais).
import { type FileHandle, open } from "node:fs/promises";
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
/**
 * Extensions d'une description d'échantillon (`stsd/avc1`, `mp4a`, `sowt`…) nécessaires au décodage ; toute autre (`uuid`,
 * inconnue) devient `free` à zéro (tour 6). `wave` (son QuickTime) est parcourue à son tour.
 */
const WAVE_LEVEL: Level = { keep: names("frma", "enda", "mp4a", "esds", "\0\0\0\0") };
const ENTRY_LEVEL: Level = {
  keep: names(
    "avcC",
    "hvcC",
    "av1C",
    "vpcC",
    "dvcC",
    "dvvC",
    "pasp",
    "colr",
    "btrt",
    "clap",
    "fiel",
    "gama",
    "mdcv",
    "clli",
    "esds",
    "chan",
    "wave",
    "dac3",
    "dec3",
    "dfLa",
    "dOps",
    "alac",
    "damr",
  ),
  into: { wave: WAVE_LEVEL },
};
/** Premier niveau : seules `ftyp`, `moov` et `mdat` gardent leur contenu. */
const TOP_KEEP = names("ftyp", "moov", "mdat");
/** Pistes dont les échantillons sont gardés ; ceux de toutes les autres (`meta`, `mebx`, `tmcd`, texte…) sont mis à zéro. */
const KEPT_HANDLERS = new Set(["vide", "soun"]);

const unreadable = (what: string) => new Mp4Error("unreadable", `Vidéo illisible (${what})`);

/** Échantillons vidéo H.264/HEVC suivis un à un (SEI) : au plus 100 000 (31 s à 240 images par seconde ≈ 7 500). Pas pour le son. */
const SAMPLES_MAX = 100_000;
/** Plus de boîtes dans un niveau que le lecteur n'en tolère (2000) : refus. */
const LEVEL_BOXES_MAX = 2000;
/** Descriptions d'échantillons d'une piste vidéo ou son (`stsd`) : au plus 16. */
const STSD_ENTRIES_MAX = 16;

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
    // Même plafond que le lecteur (`TOP_LEVEL_MAX`) : un niveau de millions de boîtes vides ne bloque pas le serveur.
    if (boxes.length >= LEVEL_BOXES_MAX) throw unreadable("trop de boîtes");
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
  /** Plages à mettre à zéro (restes de `moov`, noms de gestionnaires). */
  zero: [number, number][];
  /** Début de chaque morceau de chaque piste (aucun ne doit sortir des boîtes gardées du fichier). */
  chunkStarts: number[];
  /** Plages des échantillons des pistes vidéo et son : tout le reste de `mdat` est mis à zéro (tour 6). */
  kept: [number, number][];
  /** Plages des échantillons des autres pistes (déjà dans le reste de `mdat` : seulement vérifiées, elles doivent y être). */
  foreign: [number, number][];
  /** Plages des échantillons vidéo H.264/HEVC dont les SEI sont remplacés (début, fin, indice dans `nalKinds`). */
  nal: { from: Float64Array; to: Float64Array; kind: Uint8Array; count: number };
  nalKinds: NalKind[];
  /** NAL SEI de la configuration `hvcC` (position dans le fichier, longueur, premier octet) : remplacés eux aussi. */
  configSei: [number, number, number][];
};

/** Codec à NAL préfixés par leur longueur (`avcC` / `hvcC`) : sert à retrouver les SEI des échantillons. */
type NalKind = { hevc: boolean; lengthSize: number };

const u32at = (data: Buffer, o: number, limit: number): number => {
  if (o + 4 > limit) throw unreadable("table tronquée");
  return data.readUInt32BE(o);
};

/** Formats de son non compressé de QuickTime (leurs « échantillons » sont des trames, un octet par unité dans `stsz`). */
const PCM_FORMATS = new Set(["sowt", "twos", "lpcm", "in24", "in32", "fl32", "fl64", "raw ", "NONE"]);

/** Bits par échantillon que le format fixe lui-même (le champ de la description doit être d'accord). */
const PCM_FORMAT_BITS: Readonly<Record<string, number>> = { in24: 24, in32: 32, fl32: 32, fl64: 64 };

/** Octets d'un morceau de son PCM de `frames` trames (calcul prêt, la description n'est lue qu'une fois). */
type PcmBytes = (frames: number) => number;

/**
 * Lit une description de son PCM (une fois par piste et par numéro d'entrée) : version 0, voies × bits / 8 par trame ; version 1,
 * trames / `samplesPerPacket` × `bytesPerFrame` ; version 2, trames / trames par paquet × octets par paquet. Tout ce qui ne permet pas
 * un calcul sûr est refusé (« illisible ») : mieux vaut refuser qu'abîmer le son. En version 0, les bits se déduisent du format
 * quand il les fixe (`in24` = 24, `in32`/`fl32` = 32, `fl64` = 64) ; un champ qui n'est pas d'accord est refusé.
 */
function pcmDescription(moov: Buffer, entry: RawBox | undefined): PcmBytes {
  if (!entry || !PCM_FORMATS.has(entry.type)) throw unreadable("son à taille 1 qui n'est pas du PCM");
  const c = entry.rel + entry.header;
  const limit = entry.rel + entry.size;
  const u16 = (o: number) => {
    if (o + 2 > limit) throw unreadable("description du son tronquée");
    return moov.readUInt16BE(o);
  };
  const u32 = (o: number) => u32at(moov, o, limit);
  const safe = (bytes: number) => {
    if (!Number.isSafeInteger(bytes) || bytes <= 0) throw unreadable("son PCM de taille inconnue");
    return bytes;
  };
  const version = u16(c + 8);
  if (version === 0) {
    let bits = u16(c + 18);
    const fixed = PCM_FORMAT_BITS[entry.type];
    if (fixed !== undefined) {
      if (bits !== fixed) throw unreadable("son PCM dont les bits ne sont pas ceux du format");
      bits = fixed;
    }
    if (bits === 0 || bits % 8 !== 0) throw unreadable("son PCM de taille inconnue");
    const perFrame = u16(c + 16) * (bits / 8);
    return (frames) => safe(frames * perFrame);
  }
  if (version === 1) {
    const perPacket = u32(c + 28);
    const perFrame = u32(c + 36);
    if (perPacket === 0 || perFrame === 0) throw unreadable("son PCM de taille inconnue");
    return (frames) => {
      if (frames % perPacket !== 0) throw unreadable("son PCM de taille inconnue");
      return safe((frames / perPacket) * perFrame);
    };
  }
  if (version === 2) {
    const perPacket = u32(c + 56);
    const framesPerPacket = u32(c + 60);
    if (perPacket === 0 || framesPerPacket === 0) throw unreadable("son PCM de taille inconnue");
    return (frames) => {
      if (frames % framesPerPacket !== 0) throw unreadable("son PCM de taille inconnue");
      return safe((frames / framesPerPacket) * perPacket);
    };
  }
  throw unreadable("version de description du son inconnue");
}

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
  audio: boolean,
  samples?: (from: number, to: number) => void,
  room = 0,
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
  const descOf: number[] = [];
  for (let i = 0, o = dataAt(stsc) + 8; i < runs; i++, o += 12) {
    firstChunk.push(moov.readUInt32BE(o));
    perChunk.push(moov.readUInt32BE(o + 4));
    descOf.push(moov.readUInt32BE(o + 8));
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
  let generated = 0;
  const pcmByDesc = new Map<number, PcmBytes>();
  let stsdEntries: RawBox[] | undefined;
  let sample = 0;
  let run = 0;
  for (let chunk = 1; chunk <= chunkCount; chunk++) {
    while (run + 1 < runs && (firstChunk[run + 1] as number) <= chunk) run++;
    const count = perChunk[run] as number;
    if (sample + count > sampleCount) throw unreadable("plus d'échantillons que déclaré");
    let length = 0;
    // Son PCM de QuickTime : `stsz` à taille 1, `stsc` compte des trames audio, la taille d'un morceau vient de `stsd`.
    if (constant === 1 && audio) {
      const desc = descOf[run] as number;
      let bytes = pcmByDesc.get(desc);
      if (!bytes) {
        // Les descriptions ne sont lues qu'une fois par piste (et une fois par numéro d'entrée utilisé).
        if (!stsdEntries) {
          const stsd = pick("stsd");
          if (!stsd) throw unreadable("son sans description");
          stsdEntries = rawBoxes(moov, stsd.rel + stsd.header + 8, stsd.rel + stsd.size, 0).boxes;
        }
        bytes = pcmDescription(moov, stsdEntries[desc - 1]);
        pcmByDesc.set(desc, bytes);
      }
      length = bytes(count);
    } else if (constant > 0) length = count * constant;
    else for (let i = 0; i < count; i++) length += sizeOf(sample + i);
    const start = offsets[chunk - 1] as number;
    if (samples) {
      // Limites de chaque échantillon (avant toute fusion) : les NAL ne peuvent pas les dépasser.
      generated += count;
      if (generated > room) throw unreadable("trop d'échantillons vidéo");
      let o = start;
      for (let i = 0; i < count; i++) {
        const size = sizeOf(sample + i);
        samples(o, o + size);
        o += size;
      }
    }
    sample += count;
    if (length > 0) ranges.push([start, start + length]);
  }
  return ranges;
}

/**
 * Les tableaux de NAL d'une configuration `hvcC` (VPS, SPS, PPS… et parfois un SEI, par exemple la ligne de x265) : les SEI (39, 40)
 * sont notés pour être remplacés comme ceux des échantillons. Un tableau qui sort de la boîte est refusé.
 */
function planConfigSei(moov: Buffer, config: RawBox, base: number, plan: Plan): void {
  const start = config.rel + config.header;
  const end = config.rel + config.size;
  let at = start + 22;
  if (at >= end) throw unreadable("configuration du codec tronquée");
  const arrays = moov.readUInt8(at++);
  for (let a = 0; a < arrays; a++) {
    if (at + 3 > end) throw unreadable("configuration du codec tronquée");
    const type = moov.readUInt8(at) & 0x3f;
    const count = moov.readUInt16BE(at + 1);
    at += 3;
    for (let n = 0; n < count; n++) {
      if (at + 2 > end) throw unreadable("configuration du codec tronquée");
      const length = moov.readUInt16BE(at);
      at += 2;
      if (at + length > end) throw unreadable("configuration du codec tronquée");
      if ((type === 39 || type === 40) && length >= 2) plan.configSei.push([base + at, length, moov.readUInt8(at)]);
      at += length;
    }
  }
}

/**
 * Descriptions d'échantillons d'une piste vidéo ou son : après leurs champs fixes (vidéo : 78 octets ; son : 28, 44 ou 64 selon la
 * version), seules les extensions de `ENTRY_LEVEL` gardent leur contenu ; les restes (boîte tronquée après les descriptions) sont mis
 * à zéro. Au plus `STSD_ENTRIES_MAX` descriptions. Rend, pour une piste vidéo H.264 ou HEVC, comment lire la longueur de ses NAL
 * (`avcC` / `hvcC`) ; `undefined` pour tout autre codec.
 */
function planEntries(moov: Buffer, stsd: RawBox, audio: boolean, base: number, plan: Plan): NalKind | undefined {
  const { boxes, rest } = rawBoxes(moov, stsd.rel + stsd.header + 8, stsd.rel + stsd.size, base);
  if (rest) plan.zero.push([base + rest[0], base + rest[1]]);
  if (boxes.length > STSD_ENTRIES_MAX) throw unreadable("trop de descriptions");
  let kind: NalKind | undefined;
  let plain = 0;
  for (const entry of boxes) {
    let skip = 78;
    if (audio) {
      if (entry.header + 10 > entry.size) throw unreadable("description du son tronquée");
      const version = moov.readUInt16BE(entry.rel + entry.header + 8);
      skip = version === 0 ? 28 : version === 1 ? 44 : version === 2 ? 64 : -1;
      if (skip < 0) throw unreadable("version de description du son inconnue");
    }
    if (entry.header + skip > entry.size) throw unreadable("description tronquée");
    planLevel(moov, entry, base, ENTRY_LEVEL, plan, skip);
    // Nom du compresseur d'une description vidéo (texte libre de 32 octets : « Lavc libx265 »…), inutile à la lecture.
    if (!audio) plan.zero.push([base + entry.rel + entry.header + 42, base + entry.rel + entry.header + 74]);
    const hevc = entry.type === "hvc1" || entry.type === "hev1";
    if (audio || !(hevc || entry.type === "avc1" || entry.type === "avc3")) {
      plain++;
      continue;
    }
    const config = rawBoxes(moov, entry.rel + entry.header + skip, entry.rel + entry.size, base).boxes.find(
      (b) => b.type === (hevc ? "hvcC" : "avcC"),
    );
    const need = hevc ? 22 : 5;
    if (!config || config.size - config.header < need) throw unreadable("configuration du codec absente");
    if (hevc) planConfigSei(moov, config, base, plan);
    const byte = moov.readUInt8(config.rel + config.header + (hevc ? 21 : 4));
    const next: NalKind = { hevc, lengthSize: (byte & 3) + 1 };
    if (kind && (kind.hevc !== next.hevc || kind.lengthSize !== next.lengthSize)) {
      throw unreadable("descriptions vidéo de formats différents");
    }
    kind = next;
  }
  if (kind && plain > 0) throw unreadable("descriptions vidéo de formats différents");
  return kind;
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
  const kept = KEPT_HANDLERS.has(handler);
  if (kept && minf) {
    // Les échantillons doivent être dans ce fichier : une référence vers un autre fichier (`dref` non autonome) est refusée.
    const dinf = inside(minf, "dinf");
    const dref = dinf ? inside(dinf, "dref") : undefined;
    if (dref) {
      const { boxes } = rawBoxes(moov, dref.rel + dref.header + 8, dref.rel + dref.size, base);
      if (boxes.length !== u32at(moov, dref.rel + dref.header + 4, dref.rel + dref.size))
        throw unreadable("dref tronquée");
      for (const entry of boxes) {
        if (entry.header + 4 > entry.size || (moov.readUInt32BE(entry.rel + entry.header) & 1) === 0) {
          throw unreadable("données dans un autre fichier");
        }
      }
    }
  }
  let kind: NalKind | undefined;
  if (kept) {
    const stsd = inside(stbl, "stsd");
    if (stsd) kind = planEntries(moov, stsd, handler === "soun", base, plan);
  }
  let index = -1;
  if (kind) {
    const wanted = kind;
    index = plan.nalKinds.findIndex((k) => k.hevc === wanted.hevc && k.lengthSize === wanted.lengthSize);
    if (index < 0) index = plan.nalKinds.push(wanted) - 1;
  }
  // Bornes des échantillons vidéo dans des tableaux typés (pas un petit tableau par échantillon).
  const samples = kind
    ? (from: number, to: number) => {
        if (to <= from) return;
        plan.nal.from[plan.nal.count] = from;
        plan.nal.to[plan.nal.count] = to;
        plan.nal.kind[plan.nal.count] = index;
        plan.nal.count++;
      }
    : undefined;
  const ranges = trackSampleRanges(
    moov,
    stbl,
    base,
    plan.chunkStarts,
    handler === "soun",
    samples,
    SAMPLES_MAX - plan.nal.count,
  );
  // Ajout par itération : un tableau de 150 000 plages ne passe pas en arguments de fonction (RangeError).
  const target = kept ? plan.kept : plan.foreign;
  for (const range of ranges) target.push(range);
}

/** Parcourt un niveau de `moov` selon la liste blanche. */
function planLevel(moov: Buffer, parent: RawBox, base: number, level: Level, plan: Plan, skip = 0): void {
  const { boxes, rest } = rawBoxes(moov, parent.rel + parent.header + skip, parent.rel + parent.size, base);
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
 * Met à zéro les trous de `mdat` par fenêtres de 1 Mo : une écriture par fenêtre touchée au plus (jamais une par trou), un tampon
 * réutilisé ; une fenêtre entièrement vide est écrite sans être lue. Le travail suit la taille du fichier.
 */
async function blankGaps(handle: FileHandle, gaps: [number, number][], size: number): Promise<void> {
  const WINDOW = 1024 * 1024;
  const work = Buffer.alloc(WINDOW);
  const todo = gaps.map((g): [number, number] => [g[0], g[1]]);
  let gi = 0;
  while (gi < todo.length) {
    const ws = Math.floor((todo[gi] as [number, number])[0] / WINDOW) * WINDOW;
    const we = Math.min(ws + WINDOW, size);
    const parts: [number, number][] = [];
    while (gi < todo.length && (todo[gi] as [number, number])[0] < we) {
      const gap = todo[gi] as [number, number];
      parts.push([gap[0], Math.min(gap[1], we)]);
      if (gap[1] > we) {
        gap[0] = we;
        break;
      }
      gi++;
    }
    const length = we - ws;
    const first = parts[0] as [number, number];
    if (parts.length === 1 && first[0] === ws && first[1] === we) work.fill(0, 0, length);
    else {
      const { bytesRead } = await handle.read(work, 0, length, ws);
      if (bytesRead < length) throw unreadable("fichier plus court que prévu");
      for (const [from, to] of parts) work.fill(0, from - ws, to - ws);
    }
    await handle.write(work, 0, length, ws);
  }
}

/**
 * Longueur du message SEI « filler payload » (payloadType 3) de `m` octets au total : type (1) + taille codée (`q` octets 0xFF puis
 * le reste, soit `q + 1` octets) + `payloadSize` octets. Rend `payloadSize` et `q`, ou `undefined` quand le codage saute cette valeur.
 */
function fillerMessage(m: number): { size: number; ff: number } | undefined {
  for (let ff = 0; ff <= m / 255 + 1; ff++) {
    const size = m - 2 - ff;
    if (size < 0) return undefined;
    if (Math.floor(size / 255) === ff) return { size, ff };
  }
  return undefined;
}

/**
 * Corps de SEI de `length` octets (après l'en-tête du NAL) : un ou deux messages « filler payload » (payloadType 3, `payloadSize`
 * octets à 0xFF) puis 0x80 (fin de RBSP). Aucun octet nul consécutif possible (pas d'octet d'échappement à gérer). Moins de 3
 * octets : refus. Deux messages quand le codage de la taille d'un seul ne tombe pas juste.
 */
function writeFiller(target: Buffer, at: number, length: number): void {
  if (length < 3) throw unreadable("SEI trop court pour être remplacé");
  const rest = length - 1;
  let first = rest;
  while (first >= 2 && !(fillerMessage(first) && (rest === first || fillerMessage(rest - first)))) first--;
  if (first < 2) throw unreadable("SEI de taille impossible à remplacer");
  let o = at;
  for (const m of rest === first ? [first] : [first, rest - first]) {
    const { size, ff } = fillerMessage(m) as { size: number; ff: number };
    target[o++] = 3;
    target.fill(0xff, o, o + ff);
    o += ff;
    target[o++] = size - 255 * ff;
    target.fill(0xff, o, o + size);
    o += size;
  }
  target[o] = 0x80;
}

/** SEI plus grand que cela : refusé (aucun encodeur réel n'en produit ; borne la mémoire d'une fenêtre). */
const SEI_MAX = 8 * 1024 * 1024;
/** Fenêtre de lecture et d'écriture des échantillons vidéo. */
const SEI_WINDOW = 1024 * 1024;

/**
 * Remplace le contenu de tout NAL SEI des échantillons vidéo par un message SEI « filler payload » de même longueur (tours 7 à 9) :
 * des caméras écrivent latitude et longitude dans les SEI de chaque image, et `x264` y met sa ligne de réglages. Le NAL **reste un
 * SEI** (H.264 : type 6 ; HEVC : 39/40, en-tête intact) : un NAL de remplissage (type 12) avant la première tranche n'est pas conforme
 * en H.264. La longueur des NAL vient de `avcC`/`hvcC` ; un NAL qui sort de son échantillon est refusé, un NAL de longueur 0 est sauté
 * (certains encodeurs matériels finissent l'échantillon par des zéros). **Une fenêtre commune de 1 Mo** couvre tous les échantillons qui y
 * tombent, trous et son compris (les échantillons sont triés) : les NAL sont parcourus et réécrits en mémoire, une écriture par fenêtre
 * touchée ; la fenêtre ne change que lorsqu'un NAL (en-tête ou SEI entier) n'y tient plus. Le travail suit la taille du fichier. Perte
 * connue : les métadonnées HDR portées par des SEI.
 */
async function replaceSei(
  handle: FileHandle,
  size: number,
  samples: { from: Float64Array; to: Float64Array; kind: Uint8Array; count: number },
  kinds: NalKind[],
  configSei: [number, number, number][],
): Promise<void> {
  for (const [start, length] of configSei) {
    const body = Buffer.alloc(length - 2);
    writeFiller(body, 0, body.length);
    await handle.write(body, 0, body.length, start + 2);
  }
  let window = Buffer.alloc(0);
  let windowAt = 0;
  let dirty = false;
  const flush = async () => {
    if (dirty) await handle.write(window, 0, window.length, windowAt);
    dirty = false;
  };
  // Rend la position de `abs` dans la fenêtre, après l'avoir déplacée si `length` octets depuis `abs` n'y tiennent pas.
  const ensure = async (abs: number, length: number): Promise<number> => {
    if (abs < windowAt || abs + length > windowAt + window.length) {
      await flush();
      const want = Math.min(Math.max(SEI_WINDOW, length), size - abs);
      if (want < length) throw unreadable("fichier plus court que prévu");
      window = Buffer.alloc(want);
      const { bytesRead } = await handle.read(window, 0, want, abs);
      if (bytesRead < want) throw unreadable("fichier plus court que prévu");
      windowAt = abs;
    }
    return abs - windowAt;
  };
  for (let n = 0; n < samples.count; n++) {
    const to = samples.to[n] as number;
    const { hevc, lengthSize } = kinds[samples.kind[n] as number] as NalKind;
    const header = hevc ? 2 : 1;
    let pos = samples.from[n] as number;
    while (pos < to) {
      if (pos + lengthSize > to) throw unreadable("NAL hors de son échantillon");
      let at = await ensure(pos, Math.min(lengthSize + header, to - pos));
      let length = 0;
      for (let k = 0; k < lengthSize; k++) length = length * 256 + (window[at + k] as number);
      if (length === 0) {
        pos += lengthSize;
        continue;
      }
      const end = pos + lengthSize + length;
      if (length < header || end > to) throw unreadable("NAL hors de son échantillon");
      at = await ensure(pos, lengthSize + header);
      const first = window[at + lengthSize] as number;
      const type = hevc ? (first >> 1) & 0x3f : first & 0x1f;
      if (hevc ? type === 39 || type === 40 : type === 6) {
        if (length > SEI_MAX) throw unreadable("SEI démesuré");
        at = await ensure(pos, lengthSize + length);
        writeFiller(window, at + lengthSize + header, length - header);
        dirty = true;
      }
      pos = end;
    }
  }
  await flush();
}

/**
 * Nettoie une vidéo avant de la garder, **par liste blanche** (lot R7g, tours 5 et 6 ; tours 2 à 4 : on poursuivait les formats un
 * par un, et chaque caméra en avait un de plus). Seul ce qui sert à lire l'image et le son reste :
 * - premier niveau : `ftyp`, `moov` et `mdat` gardent leur contenu ; tout le reste (`free`, `skip`, `wide`, `uuid`, `meta`,
 *   inconnu) devient `free` avec un contenu à zéro ; les octets après la dernière boîte (bloc de fin Insta360, rembourrage)
 *   sont coupés du fichier ;
 * - `moov` : `mvhd` et `trak` seulement ; `trak` : `tkhd`, `edts`/`elst`, `mdia` (`mdhd`, `hdlr`, `minf` → `vmhd`/`smhd`/`nmhd`/
 *   `gmhd`, `dinf`/`dref`, `stbl` et ses tables) ; le reste (`udta`, `meta`, `gps `, inconnu) devient `free` à zéro ;
 * - `mdat` (tour 6) : seuls les échantillons des pistes `vide` et `soun` (union exacte de leurs morceaux, par `stsc` + `stco`/
 *   `co64` + `stsz`/`stz2`, et pour le son PCM de QuickTime à `stsz` de taille 1 par `stsd`) gardent leur contenu ; tout autre
 *   octet de `mdat` est mis à zéro : échantillons des pistes `meta`/`mett`, `tmcd`, texte… quel que soit leur type MIME, mais
 *   aussi blocs « freeGPS » que les caméras Novatek (Viofo…) rangent entre les morceaux vidéo, sans piste qui les référence.
 *   Refus (`Mp4Error`) d'un échantillon vidéo ou son hors de tout `mdat`, d'un `dref` non autonome, d'un son à `stsz` de
 *   taille 1 dont la description ne permet pas un calcul sûr.
 * - échantillons vidéo H.264/HEVC (tour 7) : tout NAL SEI garde son type et son contenu devient un message « filler payload » de même longueur (les SEI de la
 *   configuration `hvcC` aussi) ; le nom du compresseur des descriptions vidéo est mis à zéro.
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
      if (tops.length >= LEVEL_BOXES_MAX) throw unreadable("trop de boîtes");
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
    const plan: Plan = {
      freed: [],
      zero: [],
      chunkStarts: [],
      kept: [],
      foreign: [],
      nal: {
        from: new Float64Array(SAMPLES_MAX),
        to: new Float64Array(SAMPLES_MAX),
        kind: new Uint8Array(SAMPLES_MAX),
        count: 0,
      },
      nalKinds: [],
      configSei: [],
    };
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
    // Plages triées et fusionnées (mille références au même bloc ne donnent qu'une plage) : le travail d'effacement suit la taille du
    // fichier, jamais le nombre de références. Chaque plage doit tenir dans un seul `mdat`.
    const merge = (ranges: [number, number][]): [number, number][] => {
      const sorted = ranges.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0] || x[1] - y[1]);
      const out: [number, number][] = [];
      for (const [from, to] of sorted) {
        const last = out.at(-1);
        if (last && from <= last[1]) last[1] = Math.max(last[1], to);
        else out.push([from, to]);
      }
      return out;
    };
    const mdatsSorted = [...mdats].sort((x, y) => x[0] - y[0]);
    const within = (ranges: [number, number][]) => {
      let m = 0;
      for (const [from, to] of ranges) {
        while (m < mdatsSorted.length && (mdatsSorted[m] as [number, number])[1] < to) m++;
        const mdat = mdatsSorted[m];
        if (!mdat || from < mdat[0]) throw unreadable("échantillons hors des données");
      }
    };
    const keptRanges = merge(plan.kept);
    within(keptRanges);
    within(merge(plan.foreign));
    // Tout octet de `mdat` qui n'est pas un échantillon d'image ou de son (blocs « freeGPS » des caméras Novatek…) est effacé.
    const blank: [number, number][] = [];
    let k = 0;
    for (const [a, b] of mdatsSorted) {
      let at = a;
      while (k < keptRanges.length && (keptRanges[k] as [number, number])[1] <= a) k++;
      for (let i = k; i < keptRanges.length && (keptRanges[i] as [number, number])[0] < b; i++) {
        const [from, to] = keptRanges[i] as [number, number];
        if (from > at) blank.push([at, from]);
        at = Math.max(at, to);
      }
      if (at < b) blank.push([at, b]);
    }

    // Échantillons vidéo H.264/HEVC, un par un (tableaux typés) : triés, les références répétées au même échantillon ne comptent
    // qu'une fois, deux échantillons différents qui se recouvrent sont refusés. Les NAL restent bornés par leur échantillon.
    const { from: rawFrom, to: rawTo, kind: rawKind } = plan.nal;
    const order = Uint32Array.from({ length: plan.nal.count }, (_, i) => i).sort(
      (x, y) =>
        (rawFrom[x] as number) - (rawFrom[y] as number) ||
        (rawTo[x] as number) - (rawTo[y] as number) ||
        (rawKind[x] as number) - (rawKind[y] as number),
    );
    const samples = {
      from: new Float64Array(order.length),
      to: new Float64Array(order.length),
      kind: new Uint8Array(order.length),
      count: 0,
    };
    for (const i of order) {
      const n = samples.count;
      if (
        n > 0 &&
        samples.from[n - 1] === rawFrom[i] &&
        samples.to[n - 1] === rawTo[i] &&
        samples.kind[n - 1] === rawKind[i]
      )
        continue;
      if (n > 0 && (rawFrom[i] as number) < (samples.to[n - 1] as number))
        throw unreadable("échantillons vidéo qui se recouvrent");
      samples.from[n] = rawFrom[i] as number;
      samples.to[n] = rawTo[i] as number;
      samples.kind[n] = rawKind[i] as number;
      samples.count++;
    }

    for (const box of plan.freed) {
      await handle.write(free, 0, 4, box.offset + 4);
      // Le contenu d'une boîte `free` est ignoré par tous les lecteurs : on l'efface aussi (le lieu ne reste pas dans le fichier).
      await zeroRange(box.offset + box.header, box.offset + box.size);
    }
    for (const [from, to] of plan.zero) await zeroRange(from, to);
    await blankGaps(handle, blank, size);
    await replaceSei(handle, size, samples, plan.nalKinds, plan.configSei);
    if (end < size) await handle.truncate(end);
    return plan.freed.length;
  } finally {
    await handle.close();
  }
}
