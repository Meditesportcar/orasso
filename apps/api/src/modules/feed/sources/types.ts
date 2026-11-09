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
};

export type FeedSource<K extends FeedCardKind = FeedCardKind> = {
  kind: K;
  load(input: SourceInput): Promise<LoadedCard<K>[]>;
};

const ts = (d: Date) => sql`${d.toISOString()}::timestamptz`;

/** Conditions `at` dans les bornes de la requête (`atExpr` : expression SQL de la date de la carte). */
export function atBounds(atExpr: SQL, input: Pick<SourceInput, "since" | "until">): SQL[] {
  const out = [sql`${atExpr} <= ${ts(input.until)}`];
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
