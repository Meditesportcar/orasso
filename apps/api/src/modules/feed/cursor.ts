// Curseur du Fil (lot R7e1, tour 3) : un format binaire compact, en base64url. Il porte tout ce qui rend un parcours
// stable du début à la fin :
// - l'instant du parcours (`ref`) : rien de créé après n'entre avant une actualisation ;
// - l'empreinte du contexte de la personne (`fp` : abonnements, crews, intérêts, départements) : si elle change en
//   cours de route, l'API repart de la première page (`reset`) ;
// - les genres « Moins de ce genre » figés à la première page (`less`, un bit par genre) ;
// - les bornes de coupure des sources qui dépassent le plafond (`x`), calculées à la première page ;
// - la phase 1 : la clé de la dernière carte consommée du classement (`score`, `frontier`), les deux derniers genres
//   affichés (`kinds`) et les cartes vues mais non servies (`deferred`, 20 au plus) ;
// - la phase 2 : la dernière clé servie (`anchor`) ;
// - la zone (R8c1) : `A` les cartes pas encore vues, `B` les cartes vues sans interaction (rangées après, par date). La zone B
//   n'a que la phase 2 (parcours par date).
//
// Version 3 (R8c1) : un curseur de la version 2 (APK en ligne en plein parcours) n'est jamais une erreur : `isPreviousCursor`,
// et le Fil repart de la première page avec `reset: true`.
//
// Une clé de carte est `genre:uuid` ; elle tient sur 17 octets (1 de genre, 16 d'uuid). Plus grand curseur produit :
// 21 octets d'en-tête + 1 + 16 × 23 (sources) + 8 + 17 + 1 + 2 + 1 + 20 × 17 (phase 1) + 6 de borne = 765 octets = 1020 caractères.
import { FEED_POOL, type FeedCardKind, feedCardKinds } from "@orasso/shared";

import { validation } from "../../lib/errors";
import type { Key } from "./sources/types";

const VERSION = 3;
const PREVIOUS_VERSION = 2;
/** 9999-12-31T23:59:59.999Z : la plus grande date qu'un curseur peut porter. */
const MAX_DATE_MS = 253_402_300_799_999;
export const MAX_SOURCES = 16;
export const MAX_DEFERRED = FEED_POOL / 2;
/** Cartes servies au plus dans un parcours : au-delà, le curseur est forgé (400). */
export const MAX_OFFSET = 100_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type Cursor = {
  /** Instant du parcours. */
  ref: Date;
  /** Empreinte du contexte de la personne (6 octets, en hexadécimal). */
  fp: string;
  /** Genres « Moins de ce genre » figés à la première page. */
  less: ReadonlySet<FeedCardKind>;
  /** Zone du parcours : `A` les cartes pas encore vues, `B` les cartes vues sans interaction. */
  zone: "A" | "B";
  /** Cartes déjà servies avant la page (positions du Sponsorisé). */
  offset: number;
  /** Bornes de coupure des sources qui dépassent le plafond : la dernière ligne lue de chacune, à la première page. */
  x: Key[];
} & (
  | {
      phase: 1;
      /** Score et identifiant de la dernière carte consommée du classement. */
      score: number;
      frontier: string;
      /** Genres des deux dernières cartes affichées (diversité d'une page à l'autre). */
      kinds: FeedCardKind[];
      /** Cartes consommées (au-dessus de la frontière) mais non servies : elles passent en premier à la page suivante. */
      deferred: string[];
      /** Borne de rognage des vues (ms, 0 = aucune) figée à la première page : le classement de la phase 1 ne change pas si le plafond rogne en route. */
      floorAt: number;
    }
  | { phase: 2; anchor: Key | null }
);

const kindIndex = (kind: string) => feedCardKinds.indexOf(kind as FeedCardKind);

function invalid(): never {
  throw validation("Curseur invalide : recharge le Fil.");
}

class Writer {
  private parts: Buffer[] = [];
  u8(n: number) {
    this.parts.push(Buffer.from([n]));
  }
  u16(n: number) {
    const b = Buffer.alloc(2);
    b.writeUInt16BE(n);
    this.parts.push(b);
  }
  u32(n: number) {
    const b = Buffer.alloc(4);
    b.writeUInt32BE(n);
    this.parts.push(b);
  }
  u48(n: number) {
    const b = Buffer.alloc(6);
    b.writeUIntBE(n, 0, 6);
    this.parts.push(b);
  }
  f64(n: number) {
    const b = Buffer.alloc(8);
    b.writeDoubleBE(n);
    this.parts.push(b);
  }
  bytes(b: Buffer) {
    this.parts.push(b);
  }
  /** Clé de carte `genre:uuid` : 17 octets. */
  cardId(id: string) {
    const sep = id.indexOf(":");
    const kind = kindIndex(id.slice(0, sep));
    const uuid = id.slice(sep + 1);
    if (sep < 0 || kind < 0 || !UUID.test(uuid)) throw new Error(`Identifiant de carte inattendu : ${id}`);
    this.u8(kind);
    this.bytes(Buffer.from(uuid.replaceAll("-", ""), "hex"));
  }
  key(k: Key) {
    this.u48(k.at.getTime());
    this.cardId(k.id);
  }
  done() {
    return Buffer.concat(this.parts);
  }
}

class Reader {
  private at = 0;
  constructor(private readonly buf: Buffer) {}
  private take(n: number) {
    if (this.at + n > this.buf.length) invalid();
    const out = this.buf.subarray(this.at, this.at + n);
    this.at += n;
    return out;
  }
  u8() {
    return (this.take(1)[0] as number) >>> 0;
  }
  u16() {
    return this.take(2).readUInt16BE();
  }
  u32() {
    return this.take(4).readUInt32BE();
  }
  u48() {
    return this.take(6).readUIntBE(0, 6);
  }
  f64() {
    return this.take(8).readDoubleBE();
  }
  bytes(n: number) {
    return Buffer.from(this.take(n));
  }
  cardId() {
    const kind = feedCardKinds[this.u8()];
    if (!kind) invalid();
    const hex = this.bytes(16).toString("hex");
    return `${kind}:${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  date() {
    const d = new Date(this.u48());
    // Au-delà de l'an 9999, PostgreSQL refuse la date ISO (500) : curseur forgé, 400.
    if (Number.isNaN(d.getTime()) || d.getTime() > MAX_DATE_MS) invalid();
    return d;
  }
  key(): Key {
    const at = this.date();
    return { at, id: this.cardId() };
  }
  end() {
    if (this.at !== this.buf.length) invalid();
  }
}

export function encodeCursor(c: Cursor): string {
  const w = new Writer();
  w.u8(VERSION);
  w.u8(c.phase);
  w.u8(c.zone === "B" ? 1 : 0);
  w.u48(c.ref.getTime());
  w.bytes(Buffer.from(c.fp, "hex"));
  w.u16([...c.less].reduce((mask, k) => mask | (1 << kindIndex(k)), 0));
  w.u32(c.offset);
  if (c.x.length > MAX_SOURCES) throw new Error("Trop de sources dans le curseur");
  w.u8(c.x.length);
  for (const k of c.x) w.key(k);
  if (c.phase === 1) {
    if (c.deferred.length > MAX_DEFERRED) throw new Error("Trop de cartes différées dans le curseur");
    w.u48(c.floorAt);
    w.f64(c.score);
    w.cardId(c.frontier);
    w.u8(c.kinds.length);
    for (const k of c.kinds) w.u8(kindIndex(k));
    w.u8(c.deferred.length);
    for (const id of c.deferred) w.cardId(id);
  } else {
    w.u8(c.anchor ? 1 : 0);
    if (c.anchor) w.key(c.anchor);
  }
  return w.done().toString("base64url");
}

/** Lit un curseur ; 400 `Curseur invalide` s'il est mal formé, tronqué, trop long ou d'une autre version. */
export function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(raw)) invalid();
  const r = new Reader(Buffer.from(raw, "base64url"));
  if (r.u8() !== VERSION) invalid();
  const phase = r.u8();
  if (phase !== 1 && phase !== 2) invalid();
  const zoneByte = r.u8();
  if (zoneByte > 1) invalid();
  // La zone B se parcourt par date seulement : une phase 1 dans la zone B est un curseur forgé.
  if (zoneByte === 1 && phase === 1) invalid();
  const zone = zoneByte === 1 ? "B" : "A";
  const ref = r.date();
  const fp = r.bytes(6).toString("hex");
  const mask = r.u16();
  const less = new Set(feedCardKinds.filter((_, i) => mask & (1 << i)));
  const offset = r.u32();
  if (offset > MAX_OFFSET) invalid();
  const nx = r.u8();
  if (nx > MAX_SOURCES) invalid();
  const x: Key[] = [];
  for (let i = 0; i < nx; i++) x.push(r.key());
  const head = { ref, fp, zone, less, offset, x } as const;
  if (phase === 2) {
    const flag = r.u8();
    if (flag > 1) invalid();
    const anchor = flag ? r.key() : null;
    r.end();
    return { ...head, phase: 2, anchor };
  }
  // Borne de rognage : jamais dans le futur du parcours (ramenée entre 0 et `ref`).
  const floorAt = Math.min(r.u48(), ref.getTime());
  const score = r.f64();
  if (!Number.isFinite(score)) invalid();
  const frontier = r.cardId();
  const nk = r.u8();
  if (nk > 2) invalid();
  const kinds: FeedCardKind[] = [];
  for (let i = 0; i < nk; i++) {
    const k = feedCardKinds[r.u8()];
    if (!k) invalid();
    kinds.push(k);
  }
  const nd = r.u8();
  if (nd > MAX_DEFERRED) invalid();
  const deferred: string[] = [];
  for (let i = 0; i < nd; i++) deferred.push(r.cardId());
  r.end();
  return { ...head, phase: 1, floorAt, score, frontier, kinds, deferred };
}

/**
 * Le curseur est-il bien formé mais d'une version antérieure (2) ? C'est l'APK en ligne, en plein parcours : jamais un 400,
 * le Fil repart de la première page (`reset`).
 */
export function isPreviousCursor(raw: string | undefined): boolean {
  if (!raw || !/^[A-Za-z0-9_-]+$/.test(raw)) return false;
  return Buffer.from(raw, "base64url")[0] === PREVIOUS_VERSION;
}

/** Identifiant de la carte-clé d'un curseur (frontière en phase 1, dernière clé servie en phase 2) : pour les tests. */
export function cursorCardId(raw: string): string | null {
  const c = decodeCursor(raw);
  if (!c) return null;
  return c.phase === 1 ? c.frontier : (c.anchor?.id ?? null);
}
