// Recherche de personnes (ARCHITECTURE-SUITE § 2.3) : pseudo (début), véhicule, département, centre d'intérêt, grade,
// et « autres propriétaires près de chez moi » (S8 : même génération, département commun avec mon secteur).
//
// Confidentialité : un compte privé n'est trouvable que par ce qu'il montre à tout le monde (pseudo, marque, modèle,
// grade). Sa génération, son département et ses centres d'intérêt ne servent à aucun filtre pour un inconnu : sinon
// la recherche les révélerait. Les amis voient tout, donc tout sert. Comptes supprimés et suspendus : jamais.
import {
  friendshipState,
  hasPeopleSearchCriteria,
  type PeopleSearchPage,
  type PeopleSearchQuery,
  type PeopleSuggestions,
  type PersonCard,
} from "@orasso/shared";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import { notFound, validation } from "../../lib/errors";
import { escapeLike } from "../../lib/pagination";
import type { Viewer } from "../../lib/session";
import { storage } from "../../lib/storage";
import { profilesRepo } from "../profiles/repo";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleBriefLabel, vehicleLabel } from "../vehicles/serializers";
import { socialProfile } from "./profile";
import { socialRepo } from "./repo";

/**
 * Condition SQL (alias `p` = profiles) : la fiche complète de la personne est visible de `viewerId` (compte public, ou ami).
 * Un compte privé non ami ne montre que pseudo, photo, grade, marque et modèle : tout filtre ou tri qui lirait autre chose
 * (génération, département, centres d'intérêt) doit passer par cette condition.
 */
export function detailVisibleSql(viewerId: string): SQL {
  return sql`(p.visibility = 'public' or exists (select 1 from friendships f where f.status = 'accepted' and ((f.requester_id = ${viewerId} and f.addressee_id = p.user_id) or (f.requester_id = p.user_id and f.addressee_id = ${viewerId}))))`;
}

type Row = {
  user_id: string;
  pseudo: string;
  avatar_key: string | null;
  grade: PersonCard["grade"];
  departments: string[];
  detail: boolean;
};

type Options = {
  /** Recherche de premier niveau (lot 29) : le texte ne cherche que dans les pseudos (les véhicules ont leur groupe). */
  pseudoOnly?: boolean;
  /** Départements dont l'un au moins doit être celui de la personne (propriétaires près de chez moi). */
  departmentsAny?: string[];
  exclude?: string[];
  /** Lot R2 (suggestions) : seulement les comptes publics, jamais mes amis. */
  publicStrangers?: boolean;
};

/** Lot R2 : des suggestions courtes (2 ou 3 lignes par section, maquette R2.6). */
export const SUGGESTIONS_LIMIT = 3;

const encodeCursor = (pseudo: string, id: string) => Buffer.from(`${pseudo.toLowerCase()}|${id}`).toString("base64url");
function decodeCursor(cursor: string | undefined): { pseudo: string; id: string } | null {
  if (!cursor) return null;
  const [pseudo, id] = Buffer.from(cursor, "base64url").toString().split("|");
  return pseudo && id ? { pseudo, id } : null;
}

async function run(
  viewer: Viewer,
  query: PeopleSearchQuery,
  options: Options,
): Promise<{ rows: Row[]; limit: number }> {
  const viewerId = viewer.user.id;
  const at = now();
  const limit = query.limit;
  const cursor = decodeCursor(query.cursor);
  const exclude = [viewerId, ...(options.exclude ?? [])];
  const q = query.q?.trim();

  // `d.detail` : la fiche complète de la personne est visible de moi (compte public ou ami).
  const detail = detailVisibleSql(viewerId);

  const where: SQL[] = [
    sql`p.deleted_at is null`,
    sql`(p.suspended_until is null or p.suspended_until <= ${at})`,
    sql`p.user_id not in (${sql.join(
      exclude.map((id) => sql`${id}`),
      sql`, `,
    )})`,
  ];
  const pseudoMatch = q ? sql`lower(p.pseudo) like ${`${escapeLike(q.toLowerCase())}%`} escape '\\'` : null;
  const vehicleExists = (cond: SQL) =>
    sql`exists (select 1 from vehicles v
      join vehicle_makes mk on mk.id = v.make_id
      join vehicle_models md on md.id = v.model_id
      left join vehicle_generations g on g.id = v.generation_id
      cross join lateral (select ${detail} as detail) d
      where v.owner_id = p.user_id and v.status = 'active' and ${cond})`;
  // Texte libre : le pseudo (début) OU un véhicule (marque, modèle, « marque modèle » ; la génération seulement si la
  // fiche complète est visible). Il se combine avec les filtres de véhicule ci-dessous.
  if (q && options.pseudoOnly) {
    where.push(sql`${pseudoMatch}`);
  } else if (q) {
    const pattern = `%${escapeLike(q)}%`;
    const text = vehicleExists(sql`(
      mk.name ilike ${pattern} escape '\\'
      or md.name ilike ${pattern} escape '\\'
      or (mk.name || ' ' || md.name) ilike ${pattern} escape '\\'
      or (d.detail and (g.name ilike ${pattern} escape '\\' or (mk.name || ' ' || md.name || ' ' || g.name) ilike ${pattern} escape '\\'))
    )`);
    where.push(sql`(${pseudoMatch} or ${text})`);
  }
  const filters: SQL[] = [];
  if (query.makeId) filters.push(sql`v.make_id = ${query.makeId}`);
  if (query.modelId) filters.push(sql`v.model_id = ${query.modelId}`);
  if (query.generationId) filters.push(sql`(d.detail and v.generation_id = ${query.generationId})`);
  if (filters.length) where.push(vehicleExists(sql.join(filters, sql` and `)));
  if (query.department) where.push(sql`(p.departments @> ARRAY[${query.department}]::text[] and ${detail})`);
  if (options.departmentsAny?.length) {
    where.push(
      sql`(p.departments && ARRAY[${sql.join(
        options.departmentsAny.map((d) => sql`${d}`),
        sql`, `,
      )}]::text[] and ${detail})`,
    );
  }
  if (query.categoryId) {
    where.push(
      sql`(exists (select 1 from profile_interests pi where pi.user_id = p.user_id and pi.category_id = ${query.categoryId}) and ${detail})`,
    );
  }
  if (query.grade) where.push(sql`p.grade >= ${query.grade}::grade`);
  if (options.publicStrangers) {
    where.push(sql`p.visibility = 'public'`);
    where.push(
      sql`not exists (select 1 from friendships f where f.status = 'accepted' and ((f.requester_id = ${viewerId} and f.addressee_id = p.user_id) or (f.requester_id = p.user_id and f.addressee_id = ${viewerId})))`,
    );
  }
  if (cursor) where.push(sql`(lower(p.pseudo), p.user_id) > (${cursor.pseudo}, ${cursor.id})`);

  const result = await db.execute<Row>(sql`
    select p.user_id, p.pseudo, p.avatar_key, p.grade, p.departments, ${detail} as detail
    from profiles p
    where ${sql.join(where, sql` and `)}
    order by lower(p.pseudo), p.user_id
    limit ${limit + 1}`);
  return { rows: result.rows, limit };
}

async function cards(viewer: Viewer, rows: Row[]): Promise<PersonCard[]> {
  const ids = rows.map((r) => r.user_id);
  const garage = ids.length
    ? await vehiclesRepo.findFull(and(inArray(vehicles.ownerId, ids), eq(vehicles.status, "active")))
    : [];
  const relations = await socialRepo.relationsWith(viewer.user.id, ids);
  return rows.map((r) => ({
    userId: r.user_id,
    pseudo: r.pseudo,
    avatarUrl: storage.url(r.avatar_key),
    grade: r.grade,
    departments: r.detail ? r.departments : null,
    vehicles: garage
      .filter((g) => g.ownerId === r.user_id)
      .slice(0, 3)
      .map((g) => ({ id: g.id, label: r.detail ? vehicleLabel(g) : vehicleBriefLabel(g) })),
    friendship: friendshipState(relations.get(r.user_id), viewer.user.id, now()),
    friendshipId: relations.get(r.user_id)?.status === "pending" ? (relations.get(r.user_id)?.id ?? null) : null,
  }));
}

function page(rows: Row[], limit: number, items: PersonCard[]): PeopleSearchPage {
  const last = rows[limit - 1];
  return {
    items: items.slice(0, limit),
    nextCursor: rows.length > limit && last ? encodeCursor(last.pseudo, last.user_id) : null,
  };
}

export const peopleSearch = {
  /**
   * Recherche de premier niveau (`GET /search`) : pseudos qui commencent par le texte, sans filtre ni curseur. Renvoie
   * jusqu'à `limit + 1` personnes : le dernier dit seulement qu'il y en a davantage.
   */
  async byPseudo(viewer: Viewer, q: string, limit: number): Promise<PersonCard[]> {
    const { rows } = await run(viewer, { q, limit } as PeopleSearchQuery, { pseudoOnly: true });
    return cards(viewer, rows);
  },

  /** `GET /users/search`. */
  async search(viewer: Viewer, query: PeopleSearchQuery): Promise<PeopleSearchPage> {
    if (!hasPeopleSearchCriteria(query)) {
      throw validation("Saisis au moins deux caractères ou choisis un filtre");
    }
    const { rows, limit } = await run(viewer, query, {});
    return page(rows, limit, await cards(viewer, rows));
  },

  /**
   * `GET /users/suggestions` (lot R2, Personnes et crews à l'ouverture) : « Même modèle que toi », tiré des garages
   * publics seulement. Le premier de mes véhicules dont le modèle a au moins un autre propriétaire public (ni moi ni mes
   * amis), trois au plus, dans le département choisi s'il y en a un. Rien d'autre : pas de liste d'amis, pas de sorties.
   */
  async suggestions(viewer: Viewer, department?: string): Promise<PeopleSuggestions> {
    const mine = await vehiclesRepo.findFull(and(eq(vehicles.ownerId, viewer.user.id), eq(vehicles.status, "active")));
    const seen = new Set<string>();
    for (const v of mine) {
      if (v.model.isOther || seen.has(v.modelId)) continue;
      seen.add(v.modelId);
      const query = { limit: SUGGESTIONS_LIMIT, modelId: v.modelId, department } as PeopleSearchQuery;
      const { rows, limit } = await run(viewer, query, { publicStrangers: true });
      if (!rows.length) continue;
      return {
        sameModel: {
          model: v.model.name,
          vehicle: vehicleLabel(v),
          items: (await cards(viewer, rows)).slice(0, limit),
        },
      };
    }
    return { sameModel: null };
  },

  /**
   * `GET /vehicles/:id/owners-nearby` : autres propriétaires de la même génération (ou du même modèle si la génération
   * est « Autre » ou inconnue) dans les départements de mon secteur. Le niveau de détail suit ce que je vois de la
   * voiture : un propriétaire privé que je ne connais pas ne livre pas sa génération, on cherche alors par modèle.
   */
  async ownersNearby(
    viewer: Viewer,
    vehicleId: string,
    paging: Pick<PeopleSearchQuery, "limit" | "cursor">,
  ): Promise<PeopleSearchPage & { sector: string[] }> {
    const vehicle = await vehiclesRepo.findFullById(vehicleId);
    if (!vehicle) throw notFound("Véhicule introuvable");
    const owner = await profilesRepo.byUserId(vehicle.ownerId);
    if (!owner || owner.deletedAt) throw notFound("Véhicule introuvable");
    if (vehicle.status !== "active" && vehicle.ownerId !== viewer.user.id) throw notFound("Véhicule introuvable");
    const sector = viewer.profile.departments;
    if (!sector.length) return { items: [], nextCursor: null, sector };
    const detailed = await socialProfile.vehicleDetailFor(viewer, owner);
    const byGeneration = detailed && vehicle.generationId && vehicle.generation && !vehicle.generation.isOther;
    const query = {
      ...paging,
      ...(byGeneration ? { generationId: vehicle.generationId as string } : { modelId: vehicle.modelId }),
    } as PeopleSearchQuery;
    const { rows, limit } = await run(viewer, query, { departmentsAny: sector, exclude: [vehicle.ownerId] });
    return { ...page(rows, limit, await cards(viewer, rows)), sector };
  },
};
