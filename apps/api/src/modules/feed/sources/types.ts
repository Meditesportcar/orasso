// Le Fil (lot R7e1, ARCHITECTURE-R7 § 2.4) : une source = un fichier `sources/<source>.ts` qui exporte `source`. Elle rend
// des candidats (jamais le score) : le classement, la diversité et la pagination sont à `service.ts`. Les fichiers
// `spotMeetup.ts` (R7i), `memory.ts` (R7j) et `sponsored.ts` (R7k1) sont réservés : `export const source = null`.

import type { FeedCandidate, FeedCardKind, FeedFilter, FeedPayloads, FeedViewerContext } from "@orasso/shared";
import { FEED_SEEN_TTL_MS } from "@orasso/shared";
import { type SQL, sql } from "drizzle-orm";

import type { Actor } from "../../../lib/actor";
import type { Viewer } from "../../../lib/session";

export type SourceInput = {
  viewer: Viewer;
  userId: string;
  /** Instant figé du parcours (première page) : rien de plus récent ne doit entrer, pour des pages stables. */
  ref: Date;
  /** Bornes de la date de la carte : `since` inclus (ou aucune), `until` inclus. */
  since: Date | null;
  until: Date;
  /**
   * Clés exclusives (parcours par date, phase 2) : la source ne rend que les cartes strictement « après » chacune d'elles
   * dans l'ordre (date décroissante, identifiant décroissant), **dans le SQL, avant le LIMIT**. Vide en phase 1.
   */
  before: Key[];
  /**
   * Borne figée à la première page (phase 1) : la source dépassait le plafond, et ne rend que les cartes au moins aussi
   * « récentes » que cette clé (elle comprise), **dans le SQL**. Ce qui est au-delà passe en phase 2 pour tout le parcours,
   * même si des cartes disparaissent entre deux pages. `null` : pas de borne.
   */
  floor: Key | null;
  /** Nombre de cartes demandées ; la source lit `limit + 1` lignes pour savoir s'il y en a d'autres (`more`). */
  limit: number;
  filter: FeedFilter;
  ctx: FeedViewerContext;
  /** Départements de la personne et leurs voisins (filtre « Autour de moi »). */
  nearby: string[];
  /**
   * Zone du parcours (R8c1) : `A` = les cartes pas encore vues (ou vues puis ouvertes, partagées, aimées), `B` = les cartes
   * vues sans interaction, à l'instant `ref`. La zone se joue **dans le SQL**, avant le LIMIT (`atBounds` / `seenSql`).
   */
  zone: Zone;
  /** `GET /fil/fresh` : ne lit pas mes publications (exclues **avant** le LIMIT). */
  excludeMine?: boolean;
  /** Genres que la lecture ne lit pas du tout (`GET /fil/fresh` : « Moins de ce genre »). */
  skipKinds?: ReadonlySet<string>;
  /**
   * La page au nom de laquelle on lit le Fil (lot R9a, `X-Orasso-Actor`), ou `null` : la personne. Une page ne lit que du
   * contenu public (aucun compte privé, même suivi par la personne derrière elle), ses abonnements sont ceux de `ctx`
   * (`page_follows`), et les sources qui lisent des liens personnels (rendez-vous, souvenir, crews) ne rendent rien.
   */
  page?: Actor | null;
  /** Borne de rognage du compte (`feed_seen_floor`) : toute carte datée au plus de cette date est « déjà vue » (zone B). */
  seenFloor?: Date | null;
};

export type Zone = "A" | "B";

export type LoadedCard<K extends FeedCardKind = FeedCardKind> = FeedCandidate<K> & {
  payload: FeedPayloads[K];
  /** Pseudo de l'auteur (« Tu suis Kenji_66 »). */
  authorPseudo?: string | null;
  /** Contenu produit par Orasso (seed de départ) : raison « Proposé par Orasso ». */
  official?: boolean;
  /** Tous les départements que la carte couvre (pro mobile : adresse et zone d'intervention) ; sinon son `department`. */
  areaDepartments?: readonly string[];
  /** Publiée par la personne qui lit (y compris au nom d'une page) : `GET /fil/fresh` ne la compte jamais. */
  mine?: boolean;
};

/** Clé d'une carte dans le parcours par date : sa date (à la milliseconde) et son identifiant de carte (`genre:uuid`). */
export type Key = { at: Date; id: string };

/**
 * Ce que rend une source : les cartes, `more` (il reste des lignes au-delà de `limit`) et `tail` (clé de la dernière
 * ligne lue, même si la carte a été écartée ensuite ; `null` sans ligne). Toutes les lignes plus récentes que `tail` ont
 * été lues : c'est ce qui permet de ne jamais sauter de carte entre deux pages.
 */
export type SourceResult<K extends FeedCardKind = FeedCardKind> = {
  cards: LoadedCard<K>[];
  more: boolean;
  tail: Key | null;
};

export type FeedSource<K extends FeedCardKind = FeedCardKind> = {
  kind: K;
  load(input: SourceInput): Promise<SourceResult<K>>;
};

/** `limit + 1` lignes lues : garde `limit` lignes, dit s'il y en avait d'autres, et la clé de la dernière gardée. */
export function sliceRows<R>(
  raw: R[],
  limit: number,
  keyOf: (row: R) => Key,
): { rows: R[]; more: boolean; tail: Key | null } {
  const rows = raw.slice(0, limit);
  const last = rows.at(-1);
  return { rows, more: raw.length > limit, tail: last ? keyOf(last) : null };
}

/** Date de carte à la milliseconde (comme en JavaScript) : le tri SQL et les clés du curseur parlent la même précision. */
export const atMs = (expr: SQL): SQL => sql`date_trunc('milliseconds', ${expr})`;

/**
 * Conditions « strictement après la clé » (ordre : date décroissante, identifiant de carte décroissant) pour la source
 * `kind`, dont l'identifiant de carte est `kind:` + `idExpr` (uuid). Une clé sans identifiant (`id` vide) exclut sa date.
 */
export function beforeKeys(atExpr: SQL, idExpr: SQL, kind: string, keys: readonly Key[]): SQL[] {
  return keys.map((k) => {
    const at = ts(k.at);
    const sep = k.id.indexOf(":");
    if (sep < 0) return sql`${atExpr} < ${at}`;
    const otherKind = k.id.slice(0, sep);
    if (otherKind === kind) {
      return sql`(${atExpr} < ${at} or (${atExpr} = ${at} and ${idExpr} < ${k.id.slice(sep + 1)}::uuid))`;
    }
    // Autre genre à la même date : l'ordre des identifiants de carte est celui des noms de genre.
    return kind < otherKind ? sql`${atExpr} <= ${at}` : sql`${atExpr} < ${at}`;
  });
}

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/**
 * Conditions sur la date de la carte : bornes de la requête et clés exclusives (`atExpr` : expression SQL de la date de
 * la carte, à la milliseconde ; `idExpr` : l'uuid de la ligne, dont l'identifiant de carte est `kind:uuid`).
 */
export function atBounds(
  atExpr: SQL,
  idExpr: SQL,
  kind: FeedCardKind,
  input: Pick<SourceInput, "since" | "until" | "before" | "floor" | "zone" | "userId" | "ref" | "seenFloor">,
): SQL[] {
  const seen = seenSql(kind, idExpr, input);
  // Plus ancienne que ref − 30 jours (durée de vie du « vu ») : toujours zone B, la purge ne la fait pas revenir en haut.
  const cutoff = Math.max(input.ref.getTime() - FEED_SEEN_TTL_MS, input.seenFloor?.getTime() ?? 0);
  const old = sql`${atExpr} <= ${ts(new Date(cutoff))}`;
  const out = [
    sql`${atExpr} <= ${ts(input.until)}`,
    input.zone === "B" ? sql`(${seen} or ${old})` : sql`(not ${seen} and not ${old})`,
    ...beforeKeys(atExpr, idExpr, kind, input.before),
  ];
  // La borne figée est incluse : tout sauf « strictement après elle ».
  for (const c of input.floor ? beforeKeys(atExpr, idExpr, kind, [input.floor]) : []) out.push(sql`not (${c})`);
  if (input.since) out.push(sql`${atExpr} >= ${ts(input.since)}`);
  return out;
}

/**
 * « Vue sans interaction à l'instant `ref` » (R8c1), en SQL : une ligne `feed_seen` de la personne vue avant `ref`, sans
 * ouverture ni partage avant `ref`, et — pour une publication — sans flamme de sa part avant `ref`. Ce qui arrive après
 * `ref` (une carte vue, aimée pendant qu'on fait défiler) ne change pas la zone d'une carte : le parcours reste stable.
 */
export function seenSql(kind: FeedCardKind, idExpr: SQL, input: Pick<SourceInput, "userId" | "ref">): SQL {
  const at = ts(input.ref);
  const seen = sql`exists (select 1 from feed_seen fs where fs.user_id = ${input.userId}
    and fs.card_id = (${`${kind}:`}::text || ${idExpr}::text) and fs.seen_at <= ${at}
    and (fs.interacted_at is null or fs.interacted_at > ${at}))`;
  if (kind !== "feed_post") return seen;
  return sql`(${seen} and not exists (select 1 from feed_post_reactions fr
    where fr.post_id = ${idExpr} and fr.user_id = ${input.userId} and fr.created_at <= ${at}))`;
}

export const tsParam = ts;

/** `column = any(...)` sur la liste des départements voisins ; faux sans département (rien « autour de moi »). */
export function inDepartments(column: SQL, departments: readonly string[]): SQL {
  if (!departments.length) return sql`false`;
  return sql`${column} in (${sql.join(
    departments.map((d) => sql`${d}`),
    sql`, `,
  )})`;
}

export const uuidList = (ids: readonly string[]): SQL =>
  sql.join(
    ids.map((i) => sql`${i}::uuid`),
    sql`, `,
  );

/** `col = any(...)` sur un ensemble d'identifiants ; faux s'il est vide. */
const idsIn = (col: SQL, ids: ReadonlySet<string> | undefined, type: "uuid" | "text"): SQL =>
  ids?.size ? sql`${col} = any(${sql.param([...ids])}::${sql.raw(type)}[])` : sql`false`;

/** « La personne (ou la page qui lit) suit cette structure », en SQL. Une page : son ensemble `ctx`, lu à la lecture. */
export function structureFollowedSql(input: Pick<SourceInput, "page" | "userId" | "ctx">, col: SQL): SQL {
  if (input.page) return idsIn(col, input.ctx.followedStructures, "uuid");
  return sql`exists (select 1 from structure_follows sf where sf.structure_id = ${col} and sf.user_id = ${input.userId})`;
}

export function proFollowedSql(input: Pick<SourceInput, "page" | "userId" | "ctx">, col: SQL): SQL {
  if (input.page) return idsIn(col, input.ctx.followedPros, "uuid");
  return sql`exists (select 1 from pro_follows pf where pf.pro_id = ${col} and pf.user_id = ${input.userId})`;
}

/** Un compte suivi (abonnement accepté ; pour une page, un compte public suivi par `page_follows`). */
export function userFollowedSql(input: Pick<SourceInput, "page" | "userId" | "ctx">, col: SQL): SQL {
  if (input.page) return idsIn(col, input.ctx.followedUsers, "text");
  return sql`exists (select 1 from user_follows uf where uf.follower_id = ${input.userId} and uf.followed_id = ${col} and uf.status = 'accepted')`;
}

/** Le regard « personne » d'une page (aucun lien) : jamais l'identifiant du compte derrière elle. */
export const PAGE_VIEWER_ID = "__page-sans-lien__";
