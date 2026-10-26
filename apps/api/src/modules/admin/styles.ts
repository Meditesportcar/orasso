// Catalogue des styles (lot R5a, maquette R5.3 ; remarque 5 de Damien : sur le site ET dans l'appli). Par type de
// véhicule, les styles rangés par famille : ajouter, renommer, icône (liste fermée), famille, âge minimal, masculin,
// pause, ordre. Et la file « Styles proposés », regroupée par nom normalisé : ajouter au catalogue, rattacher à un style
// existant, refuser. Ajouté ou rattaché : le style est posé sur le véhicule du proposant s'il en a donné un et si les
// règles l'acceptent ; chaque proposant est prévenu dans sa Boîte. Comme « Modèles proposés » (lot R4a) : transaction,
// verrous (véhicules, puis propositions, puis le style), 409 sur une file déjà traitée ou changée, journal d'audit,
// super admin seulement.
import {
  type AdminCategory,
  type AdminCategoryCreate,
  type AdminCategoryOrder,
  type AdminCategoryUpdate,
  type AdminStyleAccept,
  type AdminStyleDecline,
  type AdminStyleMerge,
  type AdminStyleProposalGroup,
  type CategoryIcon,
  categoryRefusal,
  styleFitsType,
  styleKey,
  type VehicleType,
  vehicleTypes,
} from "@orasso/shared";
import { and, asc, count, eq, inArray, max } from "drizzle-orm";

import { db } from "../../db/client";
import { categories, categoryProposals, profiles, vehicleCategories, vehicles } from "../../db/schema";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, notFound, validation } from "../../lib/errors";
import type { Viewer } from "../../lib/session";
import { slugify } from "../../lib/slug";
import { type Tx, withTx } from "../../lib/tx";
import { notificationsService } from "../notifications/service";
import { loadCategoryRules, loadVehicleFacts } from "../vehicles/categories";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";
import { audit } from "./audit";
import { proposalVersion } from "./vehicle-reference";

/** Groupes de la file par page. */
const PROPOSAL_PAGE = 50;
/** Une fiche porte 10 catégories au plus (schéma du véhicule). */
const MAX_VEHICLE_CATEGORIES = 10;

const isConcurrent = (error: unknown) => {
  const e = error as { code?: string; cause?: { code?: string } };
  const code = (e.cause ?? e).code;
  return code === "23505" || code === "40P01";
};

/** Course entre deux équipiers (unicité 23505, interblocage 40P01) : 409, jamais une erreur interne. */
async function concurrent<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isConcurrent(error))
      throw conflict("conflict", "Le catalogue vient de changer : recharge la page et recommence.");
    throw error;
  }
}

/** Chaque écriture et son nombre, la plus fréquente en tête ; à égalité, la première proposée (ordre des valeurs). */
function counted(values: readonly string[]): { text: string; count: number }[] {
  const n = new Map<string, number>();
  for (const v of values) n.set(v, (n.get(v) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([text, count]) => ({ text, count }));
}

const typeNames: Record<VehicleType, string> = { car: "voitures", moto: "motos", truck: "camions" };

function adminRow(c: typeof categories.$inferSelect, n: Map<string, Record<VehicleType, number>>): AdminCategory {
  return {
    id: c.id,
    slug: c.slug,
    label: c.label,
    labelM: c.labelM,
    family: c.family,
    icon: c.icon as CategoryIcon,
    minVehicleAge: c.minVehicleAge,
    allowedVehicleTypes: c.allowedVehicleTypes,
    allowedCountries: c.allowedCountries,
    makeMode: c.makeMode,
    active: c.active,
    position: c.position,
    vehicles: n.get(c.id) ?? { car: 0, moto: 0, truck: 0 },
  };
}

async function categoryOrThrow(tx: Tx, id: string) {
  const [row] = await tx.select().from(categories).where(eq(categories.id, id)).for("update");
  if (!row) throw notFound("Style introuvable");
  return row;
}

/** Les propositions en attente d'une clé : véhicules verrouillés d'abord, puis les propositions (ordre du code existant). */
async function lockGroup(tx: Tx, key: string, version: string) {
  const where = and(eq(categoryProposals.status, "pending"), eq(categoryProposals.key, key));
  const before = await tx.select({ vehicleId: categoryProposals.vehicleId }).from(categoryProposals).where(where);
  if (!before.length) throw conflict("conflict", "Cette proposition vient d'être traitée : recharge la page.");
  const vehicleIds = [...new Set(before.flatMap((r) => (r.vehicleId ? [r.vehicleId] : [])))].sort();
  if (vehicleIds.length) {
    await tx
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(inArray(vehicles.id, vehicleIds))
      .orderBy(asc(vehicles.id))
      .for("update");
  }
  const rows = await tx.select().from(categoryProposals).where(where).orderBy(asc(categoryProposals.id)).for("update");
  if (!rows.length) throw conflict("conflict", "Cette proposition vient d'être traitée : recharge la page.");
  if (proposalVersion(rows.map((r) => r.id)) !== version) {
    throw conflict("conflict", "Cette proposition a changé depuis l'affichage : recharge la page et vérifie-la.");
  }
  return rows;
}

/**
 * Pose le style sur le véhicule de chaque proposant qui en a donné un, si les règles l'acceptent (âge, type, pays,
 * marques) et s'il reste de la place (10 catégories) ; sinon rien. Renvoie, par proposition, le nom du véhicule servi.
 */
async function applyToVehicles(tx: Tx, rows: (typeof categoryProposals.$inferSelect)[], categoryId: string) {
  const [rule] = await loadCategoryRules(tx, [categoryId]);
  const served = new Map<string, string>();
  for (const r of rows) {
    if (!r.vehicleId || !rule) continue;
    const vehicle = await tx.query.vehicles.findFirst({ where: eq(vehicles.id, r.vehicleId) });
    if (!vehicle || vehicle.ownerId !== r.authorId) continue;
    const facts = await loadVehicleFacts(tx, vehicle);
    if (categoryRefusal(rule.rule, facts, now())) continue;
    const links = await tx
      .select({ id: vehicleCategories.categoryId })
      .from(vehicleCategories)
      .where(eq(vehicleCategories.vehicleId, vehicle.id));
    const has = links.some((l) => l.id === categoryId);
    if (!has && links.length >= MAX_VEHICLE_CATEGORIES) continue;
    if (!has) await tx.insert(vehicleCategories).values({ vehicleId: vehicle.id, categoryId }).onConflictDoNothing();
    const full = await vehiclesRepo.findFullById(vehicle.id, tx);
    served.set(r.id, full ? vehicleLabel(full) : "ton véhicule");
  }
  return served;
}

/** Une notification par proposition, dans la Boîte de son auteur (compte supprimé : rien). */
async function notifyAuthors(
  tx: Tx,
  rows: (typeof categoryProposals.$inferSelect)[],
  text: (r: typeof categoryProposals.$inferSelect) => { title: string; body: string },
  served: Map<string, string> = new Map(),
) {
  const authors = await tx
    .select({ userId: profiles.userId, deletedAt: profiles.deletedAt })
    .from(profiles)
    .where(
      inArray(
        profiles.userId,
        rows.map((r) => r.authorId),
      ),
    );
  const gone = new Set(authors.filter((a) => a.deletedAt).map((a) => a.userId));
  for (const r of rows) {
    if (gone.has(r.authorId)) continue;
    const t = text(r);
    const vehicle = served.get(r.id);
    await notificationsService.notify(tx, r.authorId, "style_proposal_decided", {
      title: t.title,
      body: vehicle ? `${t.body} Il est posé sur ${vehicle}.` : t.body,
      ...(vehicle && r.vehicleId
        ? { link: { label: "Voir mon véhicule", path: `/app/garage/${r.vehicleId}` }, data: { vehicleId: r.vehicleId } }
        : {}),
    });
  }
}

async function decide(
  tx: Tx,
  rows: (typeof categoryProposals.$inferSelect)[],
  status: "accepted" | "merged" | "declined",
  categoryId: string | null,
) {
  await tx
    .update(categoryProposals)
    .set({ status, categoryId, decidedAt: now() })
    .where(
      inArray(
        categoryProposals.id,
        rows.map((r) => r.id),
      ),
    );
}

export const stylesAdminService = {
  /** `GET /admin/categories` : tout le catalogue (styles, pays, en pause), avec le nombre de véhicules par type. */
  async list(v: Viewer): Promise<AdminCategory[]> {
    await requirePlatformRole(v, "super_admin");
    const [rows, counts] = await Promise.all([
      db.select().from(categories).orderBy(asc(categories.position), asc(categories.label)),
      db
        .select({ categoryId: vehicleCategories.categoryId, type: vehicles.vehicleType, n: count() })
        .from(vehicleCategories)
        .innerJoin(vehicles, eq(vehicles.id, vehicleCategories.vehicleId))
        .groupBy(vehicleCategories.categoryId, vehicles.vehicleType),
    ]);
    const n = new Map<string, Record<VehicleType, number>>();
    for (const c of counts) {
      const row = n.get(c.categoryId) ?? { car: 0, moto: 0, truck: 0 };
      row[c.type] = c.n;
      n.set(c.categoryId, row);
    }
    return rows.map((c) => adminRow(c, n));
  },

  /**
   * `POST /admin/categories` : un style pour le type de l'onglet. Un style de même nom qui ne vaut pas encore pour ce
   * type reçoit ce type (« Cabriolet » ajouté aux motos) ; s'il y vaut déjà : 409.
   */
  async create(v: Viewer, input: AdminCategoryCreate): Promise<{ id: string; created: boolean }> {
    await requirePlatformRole(v, "super_admin");
    const slug = slugify(input.label);
    if (slug === "x" && styleKey(input.label) !== "x") throw validation("Ce nom ne fait pas un style : des lettres ?");
    return concurrent(() =>
      withTx(async (tx) => {
        const [same] = await tx.select().from(categories).where(eq(categories.slug, slug)).for("update");
        if (same) {
          if (same.family === "pays")
            throw conflict("conflict", `« ${same.label} » est un pays : il se déduit de la marque.`);
          if (styleFitsType(same.allowedVehicleTypes, input.vehicleType)) {
            throw conflict("conflict", `« ${same.label} » existe déjà pour les ${typeNames[input.vehicleType]}.`);
          }
          await tx
            .update(categories)
            .set({ allowedVehicleTypes: [...(same.allowedVehicleTypes ?? []), input.vehicleType] })
            .where(eq(categories.id, same.id));
          await audit(tx, v, {
            action: "category.type_add",
            targetType: "category",
            targetId: same.id,
            reason: `${same.label} · ${typeNames[input.vehicleType]}`,
          });
          return { id: same.id, created: false };
        }
        const [{ last } = { last: -1 }] = await tx.select({ last: max(categories.position) }).from(categories);
        const [row] = await tx
          .insert(categories)
          .values({
            slug,
            label: input.label,
            labelM: input.labelM ?? null,
            family: input.family,
            icon: input.icon,
            minVehicleAge: input.minVehicleAge ?? null,
            allowedVehicleTypes: [input.vehicleType],
            position: (last ?? -1) + 1,
          })
          .returning();
        if (!row) throw new Error("Style non créé");
        await audit(tx, v, { action: "category.create", targetType: "category", targetId: row.id, reason: row.label });
        return { id: row.id, created: true };
      }),
    );
  },

  /** `PATCH /admin/categories/:id` : renommer, masculin, famille, icône, âge minimal, pause. */
  async update(v: Viewer, id: string, input: AdminCategoryUpdate): Promise<AdminCategory> {
    await requirePlatformRole(v, "super_admin");
    return concurrent(() =>
      withTx(async (tx) => {
        const row = await categoryOrThrow(tx, id);
        if (row.family === "pays" && input.family) throw validation("Un pays reste dans la ligne « Origine ».");
        const [updated] = await tx
          .update(categories)
          .set({
            ...(input.label !== undefined ? { label: input.label } : {}),
            ...(input.labelM !== undefined ? { labelM: input.labelM } : {}),
            ...(input.family !== undefined ? { family: input.family } : {}),
            ...(input.icon !== undefined ? { icon: input.icon } : {}),
            ...(input.minVehicleAge !== undefined ? { minVehicleAge: input.minVehicleAge } : {}),
            ...(input.active !== undefined ? { active: input.active } : {}),
          })
          .where(eq(categories.id, id))
          .returning();
        if (!updated) throw notFound("Style introuvable");
        const changed = Object.keys(input).join(", ");
        await audit(tx, v, {
          action:
            input.active === false ? "category.pause" : input.active === true ? "category.resume" : "category.update",
          targetType: "category",
          targetId: id,
          reason: `${updated.label} · ${changed}`,
        });
        return adminRow(updated, new Map());
      }),
    );
  },

  /**
   * `PATCH /admin/categories/order` : les styles d'un type dans le nouvel ordre. Ils reprennent entre eux leurs places
   * (positions triées), si bien que l'ordre des autres types ne bouge pas plus que nécessaire.
   */
  async order(v: Viewer, input: AdminCategoryOrder): Promise<{ count: number }> {
    await requirePlatformRole(v, "super_admin");
    const ids = [...new Set(input.ids)];
    if (ids.length !== input.ids.length) throw validation("Un style apparaît deux fois.");
    return concurrent(() =>
      withTx(async (tx) => {
        const rows = await tx
          .select()
          .from(categories)
          .where(inArray(categories.id, ids))
          .orderBy(asc(categories.id))
          .for("update");
        if (rows.length !== ids.length) throw notFound("Style introuvable");
        if (rows.some((r) => r.family === "pays" || !styleFitsType(r.allowedVehicleTypes, input.vehicleType))) {
          throw validation(`Seuls les styles des ${typeNames[input.vehicleType]} se rangent ici.`);
        }
        const slots = rows.map((r) => r.position).sort((a, b) => a - b);
        for (const [i, id] of ids.entries()) {
          await tx
            .update(categories)
            .set({ position: slots[i] ?? i })
            .where(eq(categories.id, id));
        }
        await audit(tx, v, {
          action: "category.reorder",
          targetType: "category",
          targetId: ids[0] ?? "",
          reason: `${typeNames[input.vehicleType]} · ${ids.length} styles`,
        });
        return { count: ids.length };
      }),
    );
  },

  /** `GET /admin/category-proposals` : la file, regroupée par nom normalisé, la plus grosse en tête, par pages. */
  async proposals(v: Viewer, cursor: number | null = null) {
    await requirePlatformRole(v, "super_admin");
    const rows = await db
      .select({ p: categoryProposals, pseudo: profiles.pseudo })
      .from(categoryProposals)
      .innerJoin(profiles, eq(profiles.userId, categoryProposals.authorId))
      .where(eq(categoryProposals.status, "pending"))
      .orderBy(asc(categoryProposals.createdAt), asc(categoryProposals.id));
    const groups = new Map<string, typeof rows>();
    for (const r of rows) groups.set(r.p.key, [...(groups.get(r.p.key) ?? []), r]);
    const catalog = await db.select({ id: categories.id, label: categories.label }).from(categories);
    const byKey = new Map(catalog.map((c) => [styleKey(c.label), c]));
    const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const from = cursor ?? 0;
    const items: AdminStyleProposalGroup[] = ordered.slice(from, from + PROPOSAL_PAGE).map(([key, list]) => {
      const variants = counted(list.map((r) => r.p.label));
      const first = list[0] as (typeof rows)[number];
      return {
        key,
        label: variants[0]?.text ?? first.p.label,
        variants,
        vehicleTypes: vehicleTypes.filter((t) => list.some((r) => r.p.vehicleType === t)),
        count: list.length,
        authors: [...new Set(list.map((r) => r.pseudo))].slice(0, 20),
        withVehicle: list.filter((r) => r.p.vehicleId).length,
        since: first.p.createdAt.toISOString(),
        version: proposalVersion(list.map((r) => r.p.id)),
        existing: byKey.get(key) ?? null,
      };
    });
    return {
      items,
      total: rows.length,
      nextCursor: from + PROPOSAL_PAGE < ordered.length ? String(from + PROPOSAL_PAGE) : null,
    };
  },

  /** « Ajouter au catalogue » : le style est créé pour les types proposés, posé, chaque proposant prévenu. */
  async accept(v: Viewer, key: string, input: AdminStyleAccept) {
    await requirePlatformRole(v, "super_admin");
    return concurrent(() =>
      withTx(async (tx, after) => {
        const rows = await lockGroup(tx, key, input.version);
        const slug = slugify(input.label);
        const [same] = await tx.select().from(categories).where(eq(categories.slug, slug)).for("update");
        if (same) throw conflict("conflict", `« ${same.label} » existe déjà : rattache la proposition à ce style.`);
        const types = vehicleTypes.filter((t) => rows.some((r) => r.vehicleType === t));
        const [{ last } = { last: -1 }] = await tx.select({ last: max(categories.position) }).from(categories);
        const [style] = await tx
          .insert(categories)
          .values({
            slug,
            label: input.label,
            labelM: input.labelM ?? null,
            family: input.family,
            icon: input.icon,
            minVehicleAge: input.minVehicleAge ?? null,
            allowedVehicleTypes: types,
            position: (last ?? -1) + 1,
          })
          .returning();
        if (!style) throw new Error("Style non créé");
        const served = await applyToVehicles(tx, rows, style.id);
        await decide(tx, rows, "accepted", style.id);
        await notifyAuthors(
          tx,
          rows,
          (r) => ({
            title: "Ton style est au catalogue",
            body: `L'équipe Orasso a ajouté « ${style.label} » aux styles des ${typeNames[r.vehicleType]}.`,
          }),
          served,
        );
        await audit(tx, v, {
          action: "category.proposal_accept",
          targetType: "category",
          targetId: style.id,
          reason: `${style.label} · ${rows.length} proposition${rows.length > 1 ? "s" : ""} (${key})`,
        });
        after(() => notificationsService.kick());
        return { categoryId: style.id, count: rows.length, applied: served.size };
      }),
    );
  },

  /** « Rattacher à… » un style existant (actif, pas un pays) : posé si les règles l'acceptent, proposants prévenus. */
  async merge(v: Viewer, key: string, input: AdminStyleMerge) {
    await requirePlatformRole(v, "super_admin");
    return concurrent(() =>
      withTx(async (tx, after) => {
        const rows = await lockGroup(tx, key, input.version);
        const style = await categoryOrThrow(tx, input.categoryId);
        if (style.family === "pays") throw validation("Un pays ne se rattache pas : il se déduit de la marque.");
        if (!style.active) throw validation(`« ${style.label} » est en pause : réactive-le d'abord.`);
        const served = await applyToVehicles(tx, rows, style.id);
        await decide(tx, rows, "merged", style.id);
        await notifyAuthors(
          tx,
          rows,
          (r) => ({
            title: "Ton style est au catalogue",
            body: `L'équipe Orasso a rattaché « ${r.label} » au style « ${style.label} ».`,
          }),
          served,
        );
        await audit(tx, v, {
          action: "category.proposal_merge",
          targetType: "category",
          targetId: style.id,
          reason: `${rows[0]?.label ?? key} → ${style.label} · ${rows.length} proposition${rows.length > 1 ? "s" : ""}`,
        });
        after(() => notificationsService.kick());
        return { categoryId: style.id, count: rows.length, applied: served.size };
      }),
    );
  },

  /** « Refuser » : chaque proposant est prévenu. */
  async decline(v: Viewer, key: string, input: AdminStyleDecline) {
    await requirePlatformRole(v, "super_admin");
    return concurrent(() =>
      withTx(async (tx, after) => {
        const rows = await lockGroup(tx, key, input.version);
        await decide(tx, rows, "declined", null);
        await notifyAuthors(tx, rows, (r) => ({
          title: "Style proposé",
          body: `L'équipe Orasso n'a pas retenu « ${r.label} » pour le catalogue des styles. Merci de l'avoir proposé.`,
        }));
        await audit(tx, v, {
          action: "category.proposal_decline",
          targetType: "category_proposal",
          targetId: rows[0]?.id ?? key,
          reason: `${rows[0]?.label ?? key} · ${rows.length} proposition${rows.length > 1 ? "s" : ""}`,
        });
        after(() => notificationsService.kick());
        return { count: rows.length };
      }),
    );
  },
};

/** Clé de groupe d'une adresse : la clé normalisée (`styleKey`), lettres et chiffres seulement. */
export function styleGroupKey(raw: string): string | null {
  return /^[\p{L}\p{N}]{1,80}$/u.test(raw) ? raw : null;
}
