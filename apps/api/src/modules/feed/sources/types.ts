// Le Fil (lot R7e1, ARCHITECTURE-R7 § 2.4) : une source = un fichier `sources/<source>.ts` qui exporte `source`. Elle rend
// des candidats (jamais le score) : le classement, la diversité et la pagination sont à `service.ts`. Les fichiers
// `spotMeetup.ts` (R7i), `memory.ts` (R7j) et `sponsored.ts` (R7k1) sont réservés : `export const source = null`.
import type { FeedCandidate, FeedCardKind, FeedFilter, FeedPayloads, FeedViewerContext } from "@orasso/shared";
import { type SQL, sql } from "drizzle-orm";

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
};

export type LoadedCard<K extends FeedCardKind = FeedCardKind> = FeedCandidate<K> & {
  payload: FeedPayloads[K];
  /** Pseudo de l'auteur (« Tu suis Kenji_66 »). */
  authorPseudo?: string | null;
  /** Contenu produit par Orasso (seed de départ) : raison « Proposé par Orasso ». */
  official?: boolean;
  /** Tous les départements que la carte couvre (pro mobile : adresse et zone d'intervention) ; sinon son `department`. */
  areaDepartments?: readonly string[];
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
  input: Pick<SourceInput, "since" | "until" | "before" | "floor">,
): SQL[] {
  const out = [sql`${atExpr} <= ${ts(input.until)}`, ...beforeKeys(atExpr, idExpr, kind, input.before)];
  // La borne figée est incluse : tout sauf « strictement après elle ».
  for (const c of input.floor ? beforeKeys(atExpr, idExpr, kind, [input.floor]) : []) out.push(sql`not (${c})`);
  if (input.since) out.push(sql`${atExpr} >= ${ts(input.since)}`);
  return out;
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
