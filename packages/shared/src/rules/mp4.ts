// Lecteur de conteneur MP4 / MOV (lot R7g, décision de Damien du 09/11 : plus de ffmpeg sur le serveur). Pur : il n'utilise que
// `Uint8Array` et `DataView`, donc il tourne dans l'API (Node), dans l'appli (Hermes) et dans le navigateur. Il lit seulement
// les en-têtes de boîtes (`ftyp`, `moov` et ce qu'elle contient) à travers une source à accès direct : un fichier de 60 Mo
// n'est jamais chargé en mémoire pour être vérifié. Il rend ce qu'il faut savoir d'une story vidéo : durée, dimensions
// (rotation comprise), codec de la première piste vidéo, présence d'un son. Il ne décode rien et ne prouve pas que les images
// sont lisibles ; il écarte les fichiers qui ne sont pas des vidéos MP4/MOV, tronqués ou illisibles.
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

export type Mp4ErrorKind = "unreadable" | "no_video";
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

type VideoTrack = { kind: "video"; codec: string; width: number; height: number; durationSeconds: number };

/** Parcourt `moov` et en tire ce qui compte. */
function parseMoov(moov: Uint8Array) {
  const dv = view(moov);
  let timescale = 0;
  let duration = 0;
  let fragmented = false;
  let fragmentDuration = 0;
  let video: VideoTrack | null = null;
  let hasAudio = false;

  for (const box of children(moov, dv, 8, moov.length)) {
    if (box.type === "mvhd") {
      const v = u8(dv, box.start + box.header);
      const o = box.start + box.header + 4;
      if (v === 1) {
        if (o + 28 > box.end) throw bad("mvhd");
        timescale = u32(dv, o + 16);
        duration = u64(dv, o + 20);
      } else {
        if (o + 16 > box.end) throw bad("mvhd");
        timescale = u32(dv, o + 8);
        duration = u32(dv, o + 12);
      }
    } else if (box.type === "mvex") {
      fragmented = true;
      const mehd = find(moov, dv, box, "mehd");
      if (mehd) {
        const v = u8(dv, mehd.start + mehd.header);
        const o = mehd.start + mehd.header + 4;
        fragmentDuration = v === 1 ? u64(dv, o) : u32(dv, o);
      }
    } else if (box.type === "trak") {
      const t = parseTrak(moov, dv, box);
      if (t.kind === "audio") hasAudio = true;
      else if (t.kind === "video" && !video) video = t;
    }
  }
  if (!timescale) throw bad("durée absente");
  if (!duration && fragmented) duration = fragmentDuration;
  return { timescale, duration, video, hasAudio };
}

function parseTrak(moov: Uint8Array, dv: DataView, trak: Box): { kind: "audio" | "other" } | VideoTrack {
  const tkhd = find(moov, dv, trak, "tkhd");
  const mdia = find(moov, dv, trak, "mdia");
  if (!tkhd || !mdia) return { kind: "other" };
  const hdlr = find(moov, dv, mdia, "hdlr");
  const handler = hdlr ? text(moov, hdlr.start + hdlr.header + 8, hdlr.start + hdlr.header + 12) : "";
  if (handler === "soun") return { kind: "audio" };
  if (handler !== "vide") return { kind: "other" };

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

  let durationSeconds = 0;
  const mdhd = find(moov, dv, mdia, "mdhd");
  if (mdhd) {
    const mv = u8(dv, mdhd.start + mdhd.header);
    const o = mdhd.start + mdhd.header + 4;
    const ts = mv === 1 ? u32(dv, o + 16) : u32(dv, o + 8);
    const dur = mv === 1 ? u64(dv, o + 20) : u32(dv, o + 12);
    if (ts > 0) durationSeconds = dur / ts;
  }

  const minf = find(moov, dv, mdia, "minf");
  const stbl = minf ? find(moov, dv, minf, "stbl") : null;
  const stsd = stbl ? find(moov, dv, stbl, "stsd") : null;
  if (!stsd) throw bad("description de la piste vidéo absente");
  // Version/indicateurs (4), nombre d'entrées (4), puis la première entrée : taille (4) et format (4).
  const entry = stsd.start + stsd.header + 8;
  if (entry + 8 > stsd.end) throw bad("stsd");
  return {
    kind: "video",
    codec: text(moov, entry + 4, entry + 8),
    width: Math.round(quarter ? rawHeight : rawWidth),
    height: Math.round(quarter ? rawWidth : rawHeight),
    durationSeconds,
  };
}

export async function readMp4(source: Mp4Source): Promise<Mp4Info> {
  if (source.size < 16) throw bad("fichier trop court");
  const head = await source.read(0, 16);
  if (head.length < 12 || text(head, 4, 8) !== "ftyp") throw bad("pas un fichier MP4 ou MOV");
  const ftypSize = u32(view(head), 0);
  if (ftypSize < 12 || ftypSize > 4096 || ftypSize > source.size) throw bad("ftyp");
  const ftyp = await source.read(0, ftypSize);
  const brand = text(ftyp, 8, 12);
  const compatible: string[] = [];
  for (let o = 16; o + 4 <= ftyp.length; o += 4) compatible.push(text(ftyp, o, o + 4));
  if (![brand, ...compatible].some((b) => BRANDS.test(b))) throw bad("format de conteneur non pris en charge");

  // Boîtes de premier niveau : les en-têtes seulement, `mdat` est sauté sans être lu.
  let offset = 0;
  let moov: Uint8Array | null = null;
  let sawMedia = false;
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
    if (type === "mdat" || type === "moof") sawMedia = true;
    if (type === "moov") {
      if (size > MOOV_MAX) throw bad("moov démesuré");
      moov = await source.read(offset, size);
      if (moov.length !== size) throw bad("moov tronqué");
    }
    offset += size;
  }
  if (!moov) throw bad("moov absent");
  if (!sawMedia) throw bad("aucune donnée de média");

  const info = parseMoov(moov);
  if (!info.video) throw new Mp4Error("no_video", "Ce fichier ne contient pas de piste vidéo");
  const seconds = info.duration > 0 ? info.duration / info.timescale : info.video.durationSeconds;
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
