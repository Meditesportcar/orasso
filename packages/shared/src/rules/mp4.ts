// Lecteur de conteneur MP4 / MOV (lot R7g, décision de Damien du 09/11 : plus de ffmpeg sur le serveur). Pur : il n'utilise que
// `Uint8Array` et `DataView`, donc il tourne dans l'API (Node), dans l'appli (Hermes) et dans le navigateur. Il lit seulement
// les en-têtes de boîtes (`ftyp`, `moov` et ce qu'elle contient) à travers une source à accès direct : un fichier de 60 Mo
// n'est jamais chargé en mémoire pour être vérifié. Il rend ce qu'il faut savoir d'une story vidéo : durée, dimensions
// (rotation comprise), codec de la première piste vidéo, présence d'un son. Il ne décode rien et ne prouve pas que les images
// sont lisibles ; il écarte les fichiers qui ne sont pas des vidéos MP4/MOV, tronqués ou illisibles, fragmentés (`mvex`, `moof` :
// les téléphones n'en produisent pas) ou portant une piste de position (tour 3).
// Qui s'en sert : l'API (vérification de l'envoi, source = fichier du disque), l'appli (« cette vidéo de la galerie est-elle en
// H.264 ? », source = fichier du téléphone) et le site (même question avant l'envoi, source = `File.slice`).

export type Mp4Source = {
  size: number;
  /** Lit `length` octets à partir de `offset` (moins si le fichier se termine avant). */
  read(offset: number, length: number): Promise<Uint8Array>;
};

export type Mp4Info = {
  /** Marque majeure de `ftyp` (quatre caractères). */
  brand: string;
  durationMs: number;
  /** Dimensions affichées (rotation de la piste appliquée : une prise de vue verticale d'iPhone est 1080 × 1920). */
  width: number;
  height: number;
  /** Quatre caractères de la description d'échantillon (`avc1`, `hvc1`…). */
  codec: string;
  /** Vrai pour H.264 (`avc1` ou `avc3`). */
  h264: boolean;
  hasAudio: boolean;
};

/** `location_track` : une piste qui n'est ni image, ni son, ni code temporel, ou qui annonce un lieu (télémétrie, GPS). */
export type Mp4ErrorKind = "unreadable" | "no_video" | "location_track";
export class Mp4Error extends Error {
  constructor(
    readonly kind: Mp4ErrorKind,
    message: string,
  ) {
    super(message);
  }
}

/** `moov` plus gros que ceci : refusé (aucune vidéo de 30 s n'en a besoin ; évite de lire une bombe en mémoire). */
const MOOV_MAX = 8 * 1024 * 1024;
/** Boîtes de premier niveau lues avant d'abandonner la recherche de `moov`. */
const TOP_LEVEL_MAX = 2000;
/** Marques de `ftyp` acceptées : ISO base media, MP4, MOV (QuickTime) et les marques H.264 courantes des téléphones. */
const BRANDS = /^(isom|iso[2-9a-z]|mp41|mp42|mp71|avc1|avc[2-9]|M4V |M4VH|M4VP|qt {2}|dash|msdh|MSNV|f4v )/;

/** Source en mémoire (essais, petits fichiers). */
export const mp4BufferSource = (data: Uint8Array): Mp4Source => ({
  size: data.length,
  read: async (offset, length) => data.subarray(offset, Math.min(data.length, offset + length)),
});

/** Source d'un `Blob` ou d'un `File` du navigateur (`slice` : seuls les octets lus sont chargés). */
export const mp4BlobSource = (blob: { size: number; slice(start: number, end: number): Blob }): Mp4Source => ({
  size: blob.size,
  read: async (offset, length) =>
    new Uint8Array(await blob.slice(offset, Math.min(blob.size, offset + length)).arrayBuffer()),
});

type Box = { type: string; start: number; header: number; end: number };

const bad = (what: string) => new Mp4Error("unreadable", `Vidéo illisible (${what})`);

const view = (data: Uint8Array) => new DataView(data.buffer, data.byteOffset, data.byteLength);
const u8 = (dv: DataView, o: number) => dv.getUint8(o);
const u32 = (dv: DataView, o: number) => dv.getUint32(o);
const i32 = (dv: DataView, o: number) => dv.getInt32(o);
const text = (data: Uint8Array, from: number, to: number) => {
  let s = "";
  for (let i = from; i < to && i < data.length; i++) s += String.fromCharCode(data[i] as number);
  return s;
};
/** Entier de 64 bits, refusé s'il dépasse ce qu'un nombre représente exactement. */
function u64(dv: DataView, o: number): number {
  const big = dv.getBigUint64(o);
  if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw bad("boîte démesurée");
  return Number(big);
}

/** En-tête d'une boîte à `offset` dans `data` (boîtes déjà lues en mémoire). */
function boxAt(data: Uint8Array, dv: DataView, offset: number, limit: number): Box {
  if (offset + 8 > limit) throw bad("boîte tronquée");
  let size = u32(dv, offset);
  const type = text(data, offset + 4, offset + 8);
  let header = 8;
  if (size === 1) {
    if (offset + 16 > limit) throw bad("boîte tronquée");
    size = u64(dv, offset + 8);
    header = 16;
  } else if (size === 0) size = limit - offset;
  if (size < header || offset + size > limit) throw bad("taille de boîte invalide");
  return { type, start: offset, header, end: offset + size };
}

function* children(data: Uint8Array, dv: DataView, from: number, to: number): Generator<Box> {
  let offset = from;
  let count = 0;
  while (offset + 8 <= to) {
    if (++count > TOP_LEVEL_MAX) throw bad("trop de boîtes");
    const box = boxAt(data, dv, offset, to);
    yield box;
    offset = box.end;
  }
}

const find = (data: Uint8Array, dv: DataView, parent: Box, type: string): Box | null => {
  for (const b of children(data, dv, parent.start + parent.header, parent.end)) if (b.type === type) return b;
  return null;
};

/** Lit `bytes` octets de données de la boîte (après son en-tête) : une boîte trop courte est refusée, jamais lue au-delà. */
function need(box: Box, bytes: number): void {
  if (box.start + box.header + bytes > box.end) throw bad(`boîte ${box.type} tronquée`);
}

type Chunks = { box: Box; wide: boolean };
type TrackInfo = {
  kind: "video" | "audio" | "other";
  /** Durée du média de la piste (`mdhd`), en secondes ; 0 si absente. */
  durationSeconds: number;
  codec: string;
  width: number;
  height: number;
  /** Configuration AVC (`avcC`) présente et plausible, ou codec qui n'est pas H.264. */
  configured: boolean;
  /** Nombre d'échantillons (`stsz`/`stz2`), `null` si la table est absente. */
  samples: number | null;
  chunks: Chunks | null;
};

/** Plages d'octets des `mdat` (données seulement) : ce que le fichier contient vraiment. */
type FileContext = { mdats: [number, number][] };

/** Parcourt `moov` et en tire ce qui compte. */
function parseMoov(moov: Uint8Array, ctx: FileContext) {
  const dv = view(moov);
  let timescale = 0;
  let duration = 0;
  let video: TrackInfo | null = null;
  let hasAudio = false;
  let longestTrack = 0;

  for (const box of children(moov, dv, 8, moov.length)) {
    if (box.type === "mvhd") {
      need(box, 4);
      const v = u8(dv, box.start + box.header);
      const o = box.start + box.header + 4;
      if (v === 1) {
        need(box, 4 + 28);
        timescale = u32(dv, o + 16);
        duration = u64(dv, o + 20);
      } else {
        need(box, 4 + 16);
        timescale = u32(dv, o + 8);
        duration = u32(dv, o + 12);
      }
    } else if (box.type === "mvex") {
      // Fichier fragmenté : les échantillons sont dans des fragments qu'on ne vérifie pas ; les téléphones n'en produisent pas.
      throw bad("fichier fragmenté");
    } else if (box.type === "trak") {
      const t = parseTrak(moov, dv, box);
      longestTrack = Math.max(longestTrack, t.durationSeconds);
      if (t.kind === "audio") hasAudio = true;
      else if (t.kind === "video" && !video) video = t;
    }
  }
  if (!timescale) throw bad("durée absente");
  if (video) checkVideoTrack(dv, video, ctx);
  return { timescale, duration, video, hasAudio, longestTrack };
}

/** La piste vidéo contient-elle de quoi s'afficher ? (configuration, échantillons, morceaux dans le fichier) ; sans décodage. */
function checkVideoTrack(dv: DataView, video: TrackInfo, ctx: FileContext): void {
  if (!video.configured) throw bad("configuration du codec absente");
  if (!video.samples) throw bad("aucun échantillon vidéo");
  if (!video.chunks) throw bad("table des morceaux absente");
  const { box, wide } = video.chunks;
  need(box, 8);
  const count = u32(dv, box.start + box.header + 4);
  if (count === 0) throw bad("aucun morceau vidéo");
  const step = wide ? 8 : 4;
  need(box, 8 + count * step);
  let o = box.start + box.header + 8;
  for (let i = 0; i < count; i++, o += step) {
    const at = wide ? u64(dv, o) : u32(dv, o);
    if (!ctx.mdats.some(([from, to]) => at >= from && at < to)) throw bad("morceau hors des données");
  }
}

/** Les octets `from`..`to` contiennent-ils ce texte ASCII, sans tenir compte de la casse ? `needle` est en minuscules. */
function hasAscii(data: Uint8Array, from: number, to: number, needle: string): boolean {
  const n = needle.length;
  for (let i = from; i + n <= to; i++) {
    let j = 0;
    for (; j < n; j++) {
      let c = data[i + j] as number;
      if (c >= 65 && c <= 90) c += 32;
      if (c !== needle.charCodeAt(j)) break;
    }
    if (j === n) return true;
  }
  return false;
}

/** Une piste de métadonnées dont un octet parle d'un lieu (clés comprises) : « location » ou « ISO6709 ». */
const mentionsLocation = (moov: Uint8Array, trak: Box) =>
  hasAscii(moov, trak.start, trak.end, "location") || hasAscii(moov, trak.start, trak.end, "iso6709");

/**
 * Configuration H.264 (`avcC`) utilisable, sans rien décoder : version 1, taille des longueurs de NAL valide (1, 2 ou 4),
 * au moins un SPS **et** un PPS, chacun non vide, dans les bornes de la boîte, dont le premier octet est bien un NAL du bon type
 * (7 pour un SPS, 8 pour un PPS ; un SPS porte au moins son en-tête et profil, compatibilité, niveau).
 */
function avcConfigured(data: Uint8Array, dv: DataView, box: Box): boolean {
  let o = box.start + box.header;
  // Version, profil, compatibilité, niveau, longueurs de NAL (6 bits réservés à 1), nombre de SPS (3 bits réservés + 5).
  if (o + 6 > box.end) return false;
  if (u8(dv, o) !== 1) return false;
  if ((u8(dv, o + 4) & 0x03) === 2) return false;
  const spsCount = u8(dv, o + 5) & 0x1f;
  o += 6;
  if (spsCount < 1) return false;
  for (let i = 0; i < spsCount; i++) {
    if (o + 2 > box.end) return false;
    const length = dv.getUint16(o);
    o += 2;
    if (length < 4 || o + length > box.end) return false;
    if (((data[o] as number) & 0x1f) !== 7) return false;
    o += length;
  }
  if (o + 1 > box.end) return false;
  const ppsCount = u8(dv, o);
  o += 1;
  if (ppsCount < 1) return false;
  for (let i = 0; i < ppsCount; i++) {
    if (o + 2 > box.end) return false;
    const length = dv.getUint16(o);
    o += 2;
    if (length < 1 || o + length > box.end) return false;
    if (((data[o] as number) & 0x1f) !== 8) return false;
    o += length;
  }
  return true;
}

/** Somme des durées (en ticks) et nombre d'échantillons déclarés par `stts` ; `null` si la boîte manque. */
function sttsTotals(moov: Uint8Array, dv: DataView, stbl: Box): { ticks: number; count: number } | null {
  const stts = find(moov, dv, stbl, "stts");
  if (!stts) return null;
  need(stts, 8);
  const entries = u32(dv, stts.start + stts.header + 4);
  need(stts, 8 + entries * 8);
  let ticks = 0;
  let count = 0;
  for (let i = 0, o = stts.start + stts.header + 8; i < entries; i++, o += 8) {
    count += u32(dv, o);
    ticks += u32(dv, o) * u32(dv, o + 4);
  }
  return { ticks, count };
}

/** Durée maximale d'une piste par la somme de ses échantillons, avec une seconde de marge sur les 30 s d'une story. */
const TRACK_MAX_SECONDS = 31;

/** Entrées de description (`stsd`) acceptées pour une piste de métadonnées : sans lieu (`mebx`, vérifié par ses clés) ou photo animée (`mett`). */
const SAFE_META_ENTRIES = new Set(["mebx", "mett"]);

/** Une piste de métadonnées ne passe que si toutes ses entrées de `stsd` sont connues et sans lieu : `gpmd` (GoPro), `djmd` (DJI), `camm`… sont refusées. */
function metaEntriesSafe(moov: Uint8Array, dv: DataView, mdia: Box): boolean {
  const minf = find(moov, dv, mdia, "minf");
  const stbl = minf ? find(moov, dv, minf, "stbl") : null;
  const stsd = stbl ? find(moov, dv, stbl, "stsd") : null;
  if (!stsd) return false;
  // Version/indicateurs (4) et nombre d'entrées (4), puis les entrées (des boîtes).
  const entries = children(moov, dv, stsd.start + stsd.header + 8, stsd.end);
  let seen = 0;
  for (const entry of entries) {
    if (!SAFE_META_ENTRIES.has(entry.type)) return false;
    seen++;
  }
  return seen > 0;
}

function parseTrak(moov: Uint8Array, dv: DataView, trak: Box): TrackInfo {
  const other: TrackInfo = {
    kind: "other",
    durationSeconds: 0,
    codec: "",
    width: 0,
    height: 0,
    configured: false,
    samples: null,
    chunks: null,
  };
  const mdia = find(moov, dv, trak, "mdia");
  if (!mdia) return other;
  const mdhd = find(moov, dv, mdia, "mdhd");
  let mediaTimescale = 0;
  if (mdhd) {
    need(mdhd, 4);
    const mv = u8(dv, mdhd.start + mdhd.header);
    const o = mdhd.start + mdhd.header + 4;
    need(mdhd, 4 + (mv === 1 ? 28 : 16));
    const ts = mv === 1 ? u32(dv, o + 16) : u32(dv, o + 8);
    const dur = mv === 1 ? u64(dv, o + 20) : u32(dv, o + 12);
    mediaTimescale = ts;
    if (ts > 0) other.durationSeconds = dur / ts;
  }
  // Le gestionnaire se lit AVANT toute autre chose : une piste de position ne passe pas parce qu'elle n'a pas de `tkhd`.
  const hdlr = find(moov, dv, mdia, "hdlr");
  if (!hdlr) throw new Mp4Error("location_track", "Piste sans gestionnaire");
  need(hdlr, 12);
  const handler = text(moov, hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12);
  if (handler === "soun") {
    // Piste son : la somme des échantillons ne cache pas une durée plus longue que celle annoncée (refus au-delà de 31 s).
    const audioMinf = find(moov, dv, mdia, "minf");
    const audioStbl = audioMinf ? find(moov, dv, audioMinf, "stbl") : null;
    const totals = audioStbl ? sttsTotals(moov, dv, audioStbl) : null;
    if (totals && mediaTimescale > 0) {
      const fromSamples = totals.ticks / mediaTimescale;
      if (fromSamples > TRACK_MAX_SECONDS) throw bad("durée de la piste son incohérente");
      other.durationSeconds = Math.max(other.durationSeconds, fromSamples);
    }
    return { ...other, kind: "audio" };
  }
  // Code temporel (`tmcd`) : sans position. Pistes de métadonnées (`meta`, `mebx`) : acceptées seulement si leurs clés
  // ne parlent ni de lieu (« location ») ni de position (« ISO6709 »). Toute autre piste (`gpmd`, texte…) est refusée.
  if (handler === "tmcd") return other;
  if (handler === "meta" || handler === "mebx") {
    if (mentionsLocation(moov, trak)) throw new Mp4Error("location_track", "Piste de métadonnées avec un lieu");
    // Les vraies télémétries (GoPro `gpmd`, DJI `djmd`, `camm`) se déclarent en `meta` : c'est l'entrée de `stsd` qui les trahit.
    if (!metaEntriesSafe(moov, dv, mdia))
      throw new Mp4Error("location_track", "Piste de métadonnées d'un type inconnu");
    return other;
  }
  if (handler !== "vide") throw new Mp4Error("location_track", `Piste de type « ${handler} »`);
  const tkhd = find(moov, dv, trak, "tkhd");
  if (!tkhd) return other;

  need(tkhd, 4);
  const v = u8(dv, tkhd.start + tkhd.header);
  const base = tkhd.start + tkhd.header + 4;
  // Après version/indicateurs : créée, modifiée, identifiant, réservé, durée (4 ou 8 octets selon la version), puis
  // 8 réservés, couche, groupe, volume, réservé (2 chacun) et la matrice (36 octets) ; largeur et hauteur en 16.16.
  const matrixAt = base + (v === 1 ? 8 + 8 + 4 + 4 + 8 : 4 + 4 + 4 + 4 + 4) + 8 + 2 + 2 + 2 + 2;
  if (matrixAt + 36 + 8 > tkhd.end) throw bad("tkhd");
  const a = i32(dv, matrixAt);
  const b = i32(dv, matrixAt + 4);
  const rawWidth = u32(dv, matrixAt + 36) / 65536;
  const rawHeight = u32(dv, matrixAt + 40) / 65536;
  // Rotation à 90° ou 270° (a = d = 0, b et c non nuls) : la largeur affichée est la hauteur stockée.
  const quarter = a === 0 && b !== 0;

  const minf = find(moov, dv, mdia, "minf");
  const stbl = minf ? find(moov, dv, minf, "stbl") : null;
  const stsd = stbl ? find(moov, dv, stbl, "stsd") : null;
  if (!stbl || !stsd) throw bad("description de la piste vidéo absente");
  // Version/indicateurs (4), nombre d'entrées (4), puis la première entrée : taille (4) et format (4).
  const entry = stsd.start + stsd.header + 8;
  if (entry + 8 > stsd.end) throw bad("stsd");
  const entrySize = u32(dv, entry);
  if (entrySize < 8 || entry + entrySize > stsd.end) throw bad("stsd");
  const codec = text(moov, entry + 4, entry + 8);

  let configured = true;
  if (codec === "avc1" || codec === "avc3") {
    // Entrée vidéo : 8 d'en-tête + 78 de champs fixes, puis ses boîtes (dont `avcC`, la configuration H.264).
    const childrenAt = entry + 8 + 78;
    configured = false;
    if (childrenAt <= entry + entrySize) {
      for (const child of children(moov, dv, childrenAt, entry + entrySize)) {
        if (child.type !== "avcC") continue;
        configured = avcConfigured(moov, dv, child);
        break;
      }
    }
  }

  let samples: number | null = null;
  const stsz = find(moov, dv, stbl, "stsz");
  const stz2 = stsz ? null : find(moov, dv, stbl, "stz2");
  const sizes = stsz ?? stz2;
  if (sizes) {
    need(sizes, 12);
    samples = u32(dv, sizes.start + sizes.header + 8);
    // Tailles individuelles (sample_size à 0) : la table doit tenir dans la boîte.
    if (sizes === stsz && u32(dv, sizes.start + sizes.header + 4) === 0) need(sizes, 12 + samples * 4);
  }
  // Durée de la piste vidéo par la somme des durées d'échantillon (`stts`) : elle doit concorder avec `mdhd` (à 1 s près), sinon
  // le fichier annonce une durée et en cache une autre. La plus longue des deux est retenue. Un fichier non fragmenté sans
  // `mdhd` (échelle de temps nulle) ou sans `stts` n'a pas les informations de temps nécessaires à la lecture : refusé.
  if (!mdhd || mediaTimescale <= 0) throw bad("échelle de temps absente");
  const totals = sttsTotals(moov, dv, stbl);
  if (!totals) throw bad("table des durées absente");
  if (samples !== null && totals.count !== samples) throw bad("durées et échantillons incohérents");
  const fromSamples = totals.ticks / mediaTimescale;
  if (Math.abs(fromSamples - other.durationSeconds) > 1) throw bad("durée de la piste incohérente");
  const durationSeconds = Math.max(other.durationSeconds, fromSamples);
  const stco = find(moov, dv, stbl, "stco");
  const co64 = stco ? null : find(moov, dv, stbl, "co64");
  const chunks: Chunks | null = stco ? { box: stco, wide: false } : co64 ? { box: co64, wide: true } : null;

  return {
    kind: "video",
    durationSeconds,
    codec,
    width: Math.round(quarter ? rawHeight : rawWidth),
    height: Math.round(quarter ? rawWidth : rawHeight),
    configured,
    samples,
    chunks,
  };
}

export async function readMp4(source: Mp4Source): Promise<Mp4Info> {
  try {
    return await readMp4Unchecked(source);
  } catch (error) {
    // Toute lecture hors bornes d'un fichier corrompu (RangeError…) est un fichier illisible, jamais une erreur interne.
    if (error instanceof Mp4Error) throw error;
    throw bad("lecture impossible");
  }
}

async function readMp4Unchecked(source: Mp4Source): Promise<Mp4Info> {
  if (source.size < 16) throw bad("fichier trop court");
  const head = await source.read(0, 16);
  if (head.length < 12 || text(head, 4, 8) !== "ftyp") throw bad("pas un fichier MP4 ou MOV");
  const ftypSize = u32(view(head), 0);
  if (ftypSize < 12 || ftypSize > 4096 || ftypSize > source.size) throw bad("ftyp");
  const ftyp = await source.read(0, ftypSize);
  if (ftyp.length !== ftypSize) throw bad("ftyp");
  const brand = text(ftyp, 8, 12);
  const compatible: string[] = [];
  for (let o = 16; o + 4 <= ftyp.length; o += 4) compatible.push(text(ftyp, o, o + 4));
  if (![brand, ...compatible].some((b) => BRANDS.test(b))) throw bad("format de conteneur non pris en charge");

  // Boîtes de premier niveau : les en-têtes seulement, `mdat` est sauté sans être lu.
  let offset = 0;
  let moov: Uint8Array | null = null;
  const ctx: FileContext = { mdats: [] };
  for (let n = 0; offset + 8 <= source.size; n++) {
    if (n > TOP_LEVEL_MAX) throw bad("trop de boîtes");
    const h = await source.read(offset, 16);
    if (h.length < 8) throw bad("boîte tronquée");
    const hv = view(h);
    let size = u32(hv, 0);
    const type = text(h, 4, 8);
    let header = 8;
    if (size === 1) {
      if (h.length < 16) throw bad("boîte tronquée");
      size = u64(hv, 8);
      header = 16;
    } else if (size === 0) size = source.size - offset;
    // Une boîte qui dépasse la fin du fichier : envoi incomplet.
    if (size < header || offset + size > source.size) throw bad("fichier tronqué");
    if (type === "mdat" && size > header) ctx.mdats.push([offset + header, offset + size]);
    if (type === "moof") throw bad("fichier fragmenté");
    if (type === "moov") {
      if (size > MOOV_MAX) throw bad("moov démesuré");
      moov = await source.read(offset, size);
      if (moov.length !== size) throw bad("moov tronqué");
    }
    offset += size;
  }
  if (!moov) throw bad("moov absent");
  if (ctx.mdats.length === 0) throw bad("aucune donnée de média");

  const info = parseMoov(moov, ctx);
  if (!info.video) throw new Mp4Error("no_video", "Ce fichier ne contient pas de piste vidéo");
  // Durée retenue : la plus longue de l'en-tête du film et du média de chaque piste (un fichier ne peut pas annoncer 10 s
  // dans `mvhd` et cacher une piste plus longue).
  const headerSeconds = info.duration > 0 ? info.duration / info.timescale : 0;
  const seconds = Math.max(headerSeconds, info.longestTrack);
  if (!Number.isFinite(seconds) || seconds <= 0) throw bad("durée nulle");
  if (!info.video.width || !info.video.height) throw bad("dimensions absentes");
  return {
    brand,
    durationMs: Math.round(seconds * 1000),
    width: info.video.width,
    height: info.video.height,
    codec: info.video.codec,
    h264: info.video.codec === "avc1" || info.video.codec === "avc3",
    hasAudio: info.hasAudio,
  };
}
