// Partenariats pro ↔ passionné (lot R7m1, ARCHITECTURE-R7 § 2.10, décision D38). Un pro vérifié propose depuis le profil
// d'un passionné ; le passionné accepte ou refuse ; l'un ou l'autre met fin quand il veut. Un seul partenariat en
// attente ou actif par couple. Les règles de visibilité sont ici (jamais dans l'écran) : une liste publique ne montre
// que ce que la personne montrerait déjà sur son profil. Aucune rémunération ne passe par Orasso : aucun champ d'argent.
import {
  canPropose,
  partnershipLabels as L,
  type MyPartnerships,
  PARTNERSHIP_MAX_PER_PERIOD,
  PARTNERSHIP_RETRY_DAYS,
  type PartnerLogo,
  type PartnershipOffer,
  type PartnershipPropose,
  type PartnershipRefusal,
  type PartnershipResult,
  type PartnershipStatus,
  type PartnershipVehicle,
  type ProPartnerships,
  type ProPartnersPage,
  partnershipSince,
  partnershipVisibleTo,
  type VehiclePartner,
} from "@orasso/shared";
import { and, asc, desc, eq, inArray, isNotNull, isNull, or, type SQL, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { partnerships, profiles, proProfiles, vehicles } from "../../db/schema";
import { now } from "../../lib/deps";
import { AppError, conflict, forbidden, invalidTransition, notFound, validation } from "../../lib/errors";
import { rateLimit } from "../../lib/rateLimit";
import type { Viewer } from "../../lib/session";
import { settingsStore } from "../../lib/settings";
import { storage } from "../../lib/storage";
import { type Executor, type Tx, withTx } from "../../lib/tx";
import { inboxService } from "../messaging/inbox";
import { notificationsService } from "../notifications/service";
import { profilesRepo } from "../profiles/repo";
import { proOwnerActive } from "../pros/explore";
import { proOfUser } from "../pros/service";
import { followsService } from "../social/follows";
import { socialProfile } from "../social/profile";
import { vehiclesRepo } from "../vehicles/repo";
import { vehicleLabel } from "../vehicles/serializers";

type PartnershipRow = typeof partnerships.$inferSelect;
type ProRow = typeof proProfiles.$inferSelect;

const DAY = 86_400_000;
const REQUESTS_LINK = { label: "Voir la demande", path: "/app/activite/demandes" } as const;

const err = (
  status: 403 | 409,
  code: "not_verified" | "not_published" | "subscription_required" | "partnership_exists" | "partnership_cooldown",
  message: string,
) => new AppError(status, code, message);

/** Compte en règle : ni supprimé, ni banni, ni suspendu. */
const profileActive = (at: Date) =>
  sql`${profiles.deletedAt} is null and ${profiles.bannedAt} is null and (${profiles.suspendedUntil} is null or ${profiles.suspendedUntil} <= ${at})`;

/**
 * Fiche pro avec laquelle un partenariat existe aux yeux des autres : non supprimée, **publiée, vérifiée** et titulaire en
 * règle. Une seule règle pour l'afficher comme partenaire, lire une demande, accepter et proposer (lot R7m1, tour 2).
 */
const proShown = (at: Date): SQL =>
  and(
    isNull(proProfiles.deletedAt),
    isNotNull(proProfiles.publishedAt),
    isNotNull(proProfiles.verifiedAt),
    proOwnerActive(at),
  ) as SQL;

const toResult = (p: PartnershipRow, userPseudo: string): PartnershipResult => ({
  id: p.id,
  status: p.status,
  proId: p.proId,
  userPseudo,
  vehicleId: p.vehicleId,
  message: p.message,
  proposedAt: p.proposedAt.toISOString(),
  respondedAt: p.respondedAt?.toISOString() ?? null,
  endedAt: p.endedAt?.toISOString() ?? null,
});

/** Véhicules actifs de leur propriétaire (la ligne d'un véhicule vendu ou passé à un autre ne sort pas), par identifiant. */
async function vehicleLabels(
  rows: readonly { vehicleId: string | null; userId: string }[],
  ex: Executor = db,
): Promise<Map<string, PartnershipVehicle>> {
  const ids = [...new Set(rows.flatMap((r) => (r.vehicleId ? [r.vehicleId] : [])))];
  const out = new Map<string, PartnershipVehicle>();
  if (!ids.length) return out;
  const owner = new Map(rows.flatMap((r) => (r.vehicleId ? [[r.vehicleId, r.userId] as const] : [])));
  for (const v of await vehiclesRepo.findFullByIds(ids, ex)) {
    if (v.status === "active" && owner.get(v.id) === v.ownerId) out.set(v.id, { id: v.id, label: vehicleLabel(v) });
  }
  return out;
}

/** Le partenariat (ligne verrouillée jusqu'à la fin de la transaction), ou 404 s'il n'est pas le mien (jamais de 403). */
async function ownPartnership(tx: Tx, userId: string, id: string): Promise<PartnershipRow> {
  const [row] = await tx
    .select()
    .from(partnerships)
    .where(and(eq(partnerships.id, id), eq(partnerships.userId, userId)))
    .for("update");
  if (!row) throw notFound(L.errors.gone);
  return row;
}

/** Jour de début de la contrainte « après le refus » : le plus récent de la réponse ou de la fin. */
const cooldownSince = sql`coalesce(${partnerships.endedAt}, ${partnerships.respondedAt})`;

/**
 * Un refus récent, une fin décidée par la personne, ou une proposition retirée par le pro avant réponse : le même pro ne
 * revient pas avant 30 jours (sinon un pro pourrait reproposer en boucle et noyer la personne de notifications).
 */
async function inCooldown(proId: string, userId: string, at: Date, ex: Executor = db): Promise<boolean> {
  const [row] = await ex
    .select({ id: partnerships.id })
    .from(partnerships)
    .where(
      and(
        eq(partnerships.proId, proId),
        eq(partnerships.userId, userId),
        or(
          eq(partnerships.status, "declined"),
          and(eq(partnerships.status, "ended"), or(eq(partnerships.endedBy, userId), isNull(partnerships.respondedAt))),
        ),
        sql`${cooldownSince} > ${new Date(at.getTime() - PARTNERSHIP_RETRY_DAYS * DAY)}`,
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Nombre de propositions de ce pro à cette personne sur les 30 derniers jours, toutes causes confondues. */
async function recentProposals(proId: string, userId: string, at: Date, ex: Executor = db): Promise<number> {
  const [row] = await ex
    .select({ n: sql<number>`count(*)::int` })
    .from(partnerships)
    .where(
      and(
        eq(partnerships.proId, proId),
        eq(partnerships.userId, userId),
        sql`${partnerships.proposedAt} > ${new Date(at.getTime() - PARTNERSHIP_RETRY_DAYS * DAY)}`,
      ),
    );
  return row?.n ?? 0;
}

/** Prévient les appareils des deux parties que leurs Demandes ont changé, après la validation (jamais sur une annulation). */
function syncInbox(after: (cb: () => unknown) => void, ...userIds: string[]) {
  after(() => {
    for (const id of new Set(userIds)) inboxService.publish(id);
  });
}

async function notifyParty(
  tx: Tx,
  after: (cb: () => unknown) => void,
  to: string,
  type: "partnership_proposed" | "partnership_accepted" | "partnership_declined" | "partnership_ended",
  input: { title: string; body: string; partnershipId: string; proId: string; link: { label: string; path: string } },
) {
  await notificationsService.notify(tx, to, type, {
    title: input.title,
    body: input.body,
    data: { partnershipId: input.partnershipId, proId: input.proId, link: input.link.path },
    link: input.link,
  });
  after(() => notificationsService.kick());
}

export const partnershipsService = {
  /** Réglage : jour (Paris) à partir duquel il faut l'abonnement pro. */
  subscriptionFrom: () => settingsStore.get("partnerships.subscription_from"),

  /**
   * `POST /pros/:id/partnerships` : le pro (titulaire de la fiche, vérifiée) propose un partenariat à un passionné, avec
   * un texte court et, au choix, un de ses véhicules visibles. 403 `not_verified` ou `subscription_required`, 404 si la
   * personne est introuvable, 409 s'il y a déjà une proposition ou un partenariat, ou un refus trop récent.
   */
  async propose(v: Viewer, proId: string, input: PartnershipPropose): Promise<PartnershipResult> {
    rateLimit("partnershipWrite", v.user.id);
    const pro = await ownedPro(v, proId);
    const at = now();
    const refusal = canPropose(pro, { subscriptionFrom: await this.subscriptionFrom() }, at);
    if (refusal) throw err(403, refusal, L.errors[refusal]);
    const target = await profilesRepo.byPseudo(input.userPseudo);
    const gone =
      !target || target.deletedAt || target.bannedAt || (target.suspendedUntil && target.suspendedUntil > at);
    if (!target || gone) throw notFound("Profil introuvable");
    if (target.userId === v.user.id) throw validation(L.errors.self);
    // Seul un véhicule que la personne montre déjà sur son profil, à ce pro, peut être cité.
    let vehicleId: string | null = null;
    if (input.vehicleId) {
      const [car] = await vehiclesRepo.findFullByIds([input.vehicleId]);
      const mine = car?.ownerId === target.userId && car.status === "active";
      if (!car || !mine || !(await socialProfile.vehicleDetailFor(v, target))) throw validation(L.errors.vehicle);
      vehicleId = car.id;
    }
    return withTx(async (tx, after) => {
      // Un pro ne propose pas deux fois en même temps au même passionné : le verrou ordonne les essais simultanés.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`partnership:${pro.id}:${target.userId}`}))`);
      if (await inCooldown(pro.id, target.userId, at, tx)) throw err(409, "partnership_cooldown", L.errors.cooldown);
      if ((await recentProposals(pro.id, target.userId, at, tx)) >= PARTNERSHIP_MAX_PER_PERIOD)
        throw err(409, "partnership_cooldown", L.errors.limit);
      const [open] = await tx
        .select({ id: partnerships.id })
        .from(partnerships)
        .where(
          and(
            eq(partnerships.proId, pro.id),
            eq(partnerships.userId, target.userId),
            inArray(partnerships.status, ["pending", "active"]),
          ),
        );
      if (open) throw err(409, "partnership_exists", L.errors.exists);
      let row: PartnershipRow | undefined;
      try {
        [row] = await tx
          .insert(partnerships)
          .values({ proId: pro.id, userId: target.userId, vehicleId, message: input.message, proposedAt: at })
          .returning();
      } catch (error) {
        // Deux propositions simultanées : l'index unique partiel tranche.
        const e = error as { code?: string; cause?: { code?: string } };
        if ((e.cause ?? e).code === "23505") throw err(409, "partnership_exists", L.errors.exists);
        throw error;
      }
      if (!row) throw new Error("Partenariat non enregistré");
      await notifyParty(tx, after, target.userId, "partnership_proposed", {
        title: L.notifications.proposedTitle(pro.name),
        body: L.notifications.proposedBody(pro.name),
        partnershipId: row.id,
        proId: pro.id,
        link: REQUESTS_LINK,
      });
      syncInbox(after, target.userId, v.user.id);
      return toResult(row, target.pseudo);
    });
  },

  /** `GET /pros/:id/partnerships` : mes propositions en attente et mes partenaires actifs (titulaire de la fiche seulement). */
  async ofPro(v: Viewer, proId: string): Promise<ProPartnerships> {
    const pro = await ownedPro(v, proId);
    const at = now();
    const subscriptionFrom = await this.subscriptionFrom();
    const rows = await db
      .select({
        p: partnerships,
        pseudo: profiles.pseudo,
        avatarKey: profiles.avatarKey,
        grade: profiles.grade,
        visibility: profiles.visibility,
      })
      .from(partnerships)
      .innerJoin(profiles, eq(profiles.userId, partnerships.userId))
      .where(
        and(eq(partnerships.proId, pro.id), inArray(partnerships.status, ["pending", "active"]), profileActive(at)),
      )
      .orderBy(asc(partnerships.status), desc(partnerships.proposedAt));
    // Même règle de regard que la liste publique : la voiture d'un compte privé que je ne suis pas ne sort pas.
    const rel = await followsService.relationsWith(v.user.id, [...new Set(rows.map((r) => r.p.userId))]);
    const labels = await vehicleLabels(rows.map((r) => r.p));
    return {
      canPropose: canPropose(pro, { subscriptionFrom }, at),
      subscriptionFrom,
      items: rows.map(({ p, pseudo, avatarKey, grade, visibility }) => {
        const view = partnershipVisibleTo(
          { userId: v.user.id },
          {
            status: p.status,
            userId: p.userId,
            proOwnerId: pro.ownerUserId,
            userVisibility: visibility,
          },
          { followAccepted: rel.get(p.userId)?.mine === "accepted" },
        );
        return {
          id: p.id,
          status: p.status as "pending" | "active",
          user: { pseudo, avatarUrl: storage.url(avatarKey), grade },
          vehicle: view === "full" && p.vehicleId ? (labels.get(p.vehicleId) ?? null) : null,
          message: p.message,
          since: partnershipSince(p).toISOString(),
        };
      }),
    };
  },

  /** `POST /pros/:id/partnerships/:pid/end` : le pro met fin à un partenariat actif ou retire sa proposition. */
  async endByPro(
    v: Viewer,
    proId: string,
    id: string,
    expectedStatus: "pending" | "active",
  ): Promise<PartnershipResult> {
    rateLimit("partnershipWrite", v.user.id);
    const pro = await ownedPro(v, proId);
    return withTx(async (tx, after) => {
      const [row] = await tx
        .select()
        .from(partnerships)
        .where(and(eq(partnerships.id, id), eq(partnerships.proId, pro.id)))
        .for("update");
      if (!row) throw notFound(L.errors.gone);
      // Le retrait d'une proposition ne termine jamais un partenariat que la personne vient d'accepter (et inversement) :
      // l'écran dit ce qu'il croit défaire (intention obligatoire), la ligne verrouillée dit ce qui est vrai.
      if (row.status !== expectedStatus) throw invalidTransition(row.status, "ended");
      const ended = await endRow(tx, row, v.user.id);
      const user = await tx.query.profiles.findFirst({
        where: eq(profiles.userId, row.userId),
        columns: { pseudo: true },
      });
      // Une proposition retirée avant réponse ne prévient personne de plus : seule la fin d'un partenariat actif le fait.
      if (row.status === "active") {
        await notifyParty(tx, after, row.userId, "partnership_ended", {
          title: L.notifications.endedTitle,
          body: L.notifications.endedBody(pro.name),
          partnershipId: row.id,
          proId: pro.id,
          link: { label: "Voir la fiche", path: `/p/${pro.slug}` },
        });
      }
      syncInbox(after, row.userId, v.user.id);
      return toResult(ended, user?.pseudo ?? "");
    });
  },

  /** `POST /me/partnerships/:id/accept` : le passionné accepte une proposition en attente. */
  async accept(v: Viewer, id: string): Promise<PartnershipResult> {
    rateLimit("partnershipWrite", v.user.id);
    return withTx(async (tx, after) => {
      const row = await ownPartnership(tx, v.user.id, id);
      if (row.status !== "pending") throw invalidTransition(row.status, "active");
      const at = now();
      const [pro] = await tx
        .select()
        .from(proProfiles)
        .where(and(eq(proProfiles.id, row.proId), proShown(at)));
      // Un pro qui n'est plus vérifié (ou dont la fiche a disparu) ne peut plus devenir partenaire.
      if (!pro) throw conflict("conflict", L.errors.notVerifiedAnymore);
      const [done] = await tx
        .update(partnerships)
        .set({ status: "active", respondedAt: at })
        .where(and(eq(partnerships.id, row.id), eq(partnerships.status, "pending")))
        .returning();
      if (!done) throw invalidTransition(row.status, "active");
      const me = await tx.query.profiles.findFirst({
        where: eq(profiles.userId, v.user.id),
        columns: { pseudo: true },
      });
      await notifyParty(tx, after, pro.ownerUserId, "partnership_accepted", {
        title: L.notifications.acceptedTitle,
        body: L.notifications.acceptedBody(me?.pseudo ?? ""),
        partnershipId: row.id,
        proId: pro.id,
        link: { label: "Voir ma fiche", path: `/p/${pro.slug}` },
      });
      syncInbox(after, v.user.id, pro.ownerUserId);
      return toResult(done, me?.pseudo ?? "");
    });
  },

  /** `POST /me/partnerships/:id/decline` : le passionné refuse une proposition en attente. */
  async decline(v: Viewer, id: string): Promise<PartnershipResult> {
    rateLimit("partnershipWrite", v.user.id);
    return withTx(async (tx, after) => {
      const row = await ownPartnership(tx, v.user.id, id);
      if (row.status !== "pending") throw invalidTransition(row.status, "declined");
      const at = now();
      const [done] = await tx
        .update(partnerships)
        .set({ status: "declined", respondedAt: at })
        .where(and(eq(partnerships.id, row.id), eq(partnerships.status, "pending")))
        .returning();
      if (!done) throw invalidTransition(row.status, "declined");
      const [pro] = await tx.select().from(proProfiles).where(eq(proProfiles.id, row.proId));
      const me = await tx.query.profiles.findFirst({
        where: eq(profiles.userId, v.user.id),
        columns: { pseudo: true },
      });
      if (pro) {
        await notifyParty(tx, after, pro.ownerUserId, "partnership_declined", {
          title: L.notifications.declinedTitle,
          body: L.notifications.declinedBody(me?.pseudo ?? ""),
          partnershipId: row.id,
          proId: pro.id,
          link: { label: "Voir ma fiche", path: `/p/${pro.slug}` },
        });
        syncInbox(after, v.user.id, pro.ownerUserId);
      } else syncInbox(after, v.user.id);
      return toResult(done, me?.pseudo ?? "");
    });
  },

  /** `POST /me/partnerships/:id/end` : le passionné met fin à un partenariat actif. */
  async endByUser(v: Viewer, id: string): Promise<PartnershipResult> {
    rateLimit("partnershipWrite", v.user.id);
    return withTx(async (tx, after) => {
      const row = await ownPartnership(tx, v.user.id, id);
      if (row.status !== "active") throw invalidTransition(row.status, "ended");
      const ended = await endRow(tx, row, v.user.id);
      const [pro] = await tx.select().from(proProfiles).where(eq(proProfiles.id, row.proId));
      const me = await tx.query.profiles.findFirst({
        where: eq(profiles.userId, v.user.id),
        columns: { pseudo: true },
      });
      if (pro) {
        await notifyParty(tx, after, pro.ownerUserId, "partnership_ended", {
          title: L.notifications.endedTitle,
          body: L.notifications.endedBody(me?.pseudo ?? ""),
          partnershipId: row.id,
          proId: pro.id,
          link: { label: "Voir ma fiche", path: `/p/${pro.slug}` },
        });
        syncInbox(after, v.user.id, pro.ownerUserId);
      } else syncInbox(after, v.user.id);
      return toResult(ended, me?.pseudo ?? "");
    });
  },

  /** `GET /me/partnerships` : mes partenaires actifs (je suis le passionné), pour la ligne « Partenaires » et « Mettre fin ». */
  async mine(v: Viewer): Promise<MyPartnerships> {
    const at = now();
    const rows = await db
      .select({ p: partnerships, pro: proProfiles, available: sql<boolean>`(${proShown(at)})` })
      .from(partnerships)
      .innerJoin(proProfiles, eq(proProfiles.id, partnerships.proId))
      // Côté passionné, un partenariat actif reste lisible et on peut y mettre fin même quand la fiche du pro est
      // dépubliée, non vérifiée ou son titulaire suspendu : `available` le dit à l'écran (jamais caché).
      .where(and(eq(partnerships.userId, v.user.id), eq(partnerships.status, "active"), isNull(proProfiles.deletedAt)))
      .orderBy(desc(partnerships.respondedAt), desc(partnerships.id));
    const labels = await vehicleLabels(rows.map((r) => r.p));
    return {
      items: rows.map(({ p, pro, available }) => ({
        id: p.id,
        available,
        pro: {
          proId: pro.id,
          name: pro.name,
          logoUrl: storage.url(pro.logoKey),
          slug: pro.slug,
          city: pro.city,
          activities: pro.activities,
        },
        vehicle: p.vehicleId ? (labels.get(p.vehicleId) ?? null) : null,
        since: partnershipSince(p).toISOString(),
      })),
    };
  },

  /**
   * « Ses partenaires » d'une fiche pro : les passionnés actifs, vus par `viewer`, une page à la fois (`limit`, `cursor`) avec
   * le nombre total. Sans compte connecté : aucun (jamais un identifié montré à un visiteur). Un compte privé que `viewer`
   * ne suit pas : pseudo, photo et grade seulement, sans voiture ; son pseudo reste dans la liste et dans le total (comme
   * ses nombres d'abonnés, visibles de tout membre), alors que son profil cache ses partenaires.
   */
  async partnersOfPro(
    proId: string,
    viewer: Viewer | null,
    page: { limit: number; cursor?: string } = { limit: 20 },
  ): Promise<ProPartnersPage> {
    const empty = { items: [], nextCursor: null, total: 0 };
    if (!viewer) return empty;
    const at = now();
    const [owner] = await db
      .select({ id: proProfiles.ownerUserId })
      .from(proProfiles)
      .where(and(eq(proProfiles.id, proId), proShown(at)));
    if (!owner) return empty;
    const ownerId = owner.id;
    const since = sql<Date>`coalesce(${partnerships.respondedAt}, ${partnerships.proposedAt})`;
    const base = and(eq(partnerships.proId, proId), eq(partnerships.status, "active"), profileActive(at));
    const [{ n: total = 0 } = { n: 0 }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(partnerships)
      .innerJoin(profiles, eq(profiles.userId, partnerships.userId))
      .where(base);
    // Curseur opaque : l'identifiant du dernier partenariat seulement, jamais sa date d'acceptation (relue en base).
    const cursorId = decodePartnerCursor(page.cursor);
    const rows = await db
      .select({
        p: partnerships,
        since,
        pseudo: profiles.pseudo,
        avatarKey: profiles.avatarKey,
        grade: profiles.grade,
        visibility: profiles.visibility,
      })
      .from(partnerships)
      .innerJoin(profiles, eq(profiles.userId, partnerships.userId))
      .where(
        and(
          base,
          cursorId
            ? sql`(${since}, ${partnerships.id}) < (select coalesce(c.responded_at, c.proposed_at), c.id from partnerships c where c.id = ${cursorId})`
            : undefined,
        ),
      )
      .orderBy(desc(since), desc(partnerships.id))
      .limit(page.limit + 1);
    const pageRows = rows.slice(0, page.limit);
    const last = pageRows.at(-1);
    const nextCursor = rows.length > page.limit && last ? encodePartnerCursor(last.p.id) : null;
    if (!pageRows.length) return { items: [], nextCursor, total };
    const rel = await followsService.relationsWith(viewer.user.id, [...new Set(pageRows.map((r) => r.p.userId))]);
    const withView = pageRows.map((r) => ({
      ...r,
      view: partnershipVisibleTo(
        { userId: viewer.user.id },
        { status: r.p.status, userId: r.p.userId, proOwnerId: ownerId, userVisibility: r.visibility },
        { followAccepted: rel.get(r.p.userId)?.mine === "accepted" },
      ),
    }));
    const labels = await vehicleLabels(withView.filter((r) => r.view === "full").map((r) => r.p));
    return {
      total,
      nextCursor,
      items: withView.flatMap(({ p, pseudo, avatarKey, grade, view }) =>
        view === "none"
          ? []
          : [
              {
                pseudo,
                avatarUrl: storage.url(avatarKey),
                grade,
                vehicle: view === "full" && p.vehicleId ? (labels.get(p.vehicleId) ?? null) : null,
              },
            ],
      ),
    };
  },

  /** « Partenaires » d'un profil : les pros actifs de la personne (le regard vide pour un compte privé est décidé par l'appelant). */
  async partnersOfUser(userId: string): Promise<PartnerLogo[]> {
    const at = now();
    const rows = await db
      .select({ pro: proProfiles })
      .from(partnerships)
      .innerJoin(proProfiles, eq(proProfiles.id, partnerships.proId))
      .where(and(eq(partnerships.userId, userId), eq(partnerships.status, "active"), proShown(at)))
      .orderBy(desc(partnerships.respondedAt), desc(partnerships.id));
    return rows.map(({ pro }) => ({
      proId: pro.id,
      name: pro.name,
      logoUrl: storage.url(pro.logoKey),
      slug: pro.slug,
    }));
  },

  /**
   * « Partenaire : … » sur la carte d'un véhicule : le pro d'un partenariat actif qui cite ce véhicule, tant que le
   * véhicule est encore à la personne et la fiche du pro visible. Par identifiant de véhicule.
   */
  async partnersOfVehicles(vehicleIds: readonly string[]): Promise<Map<string, VehiclePartner>> {
    const out = new Map<string, VehiclePartner>();
    if (!vehicleIds.length) return out;
    const at = now();
    const rows = await db
      .select({ vehicleId: partnerships.vehicleId, pro: proProfiles })
      .from(partnerships)
      .innerJoin(proProfiles, eq(proProfiles.id, partnerships.proId))
      .innerJoin(vehicles, and(eq(vehicles.id, partnerships.vehicleId), eq(vehicles.ownerId, partnerships.userId)))
      .where(and(inArray(partnerships.vehicleId, [...vehicleIds]), eq(partnerships.status, "active"), proShown(at)))
      .orderBy(asc(partnerships.respondedAt), asc(partnerships.id));
    // La plus récente l'emporte quand deux pros citent la même voiture (l'ordre croissant écrase).
    for (const r of rows) {
      if (r.vehicleId)
        out.set(r.vehicleId, { name: r.pro.name, logoUrl: storage.url(r.pro.logoKey), slug: r.pro.slug });
    }
    return out;
  },

  async partnerOfVehicle(vehicleId: string): Promise<VehiclePartner | null> {
    return (await this.partnersOfVehicles([vehicleId])).get(vehicleId) ?? null;
  },

  /**
   * Propositions reçues en attente (`GET /me/requests`, `kind partnership`) : le pro (toujours vérifié, en règle), son texte
   * et la voiture concernée. Une proposition d'un pro qui n'existe plus ou n'est plus vérifié n'apparaît pas.
   */
  async requestRows(userId: string, ex: Executor = db) {
    const at = now();
    const rows = await ex
      .select({ p: partnerships, pro: proProfiles })
      .from(partnerships)
      .innerJoin(proProfiles, eq(proProfiles.id, partnerships.proId))
      .where(and(eq(partnerships.userId, userId), eq(partnerships.status, "pending"), proShown(at)))
      .orderBy(desc(partnerships.proposedAt), desc(partnerships.id));
    const labels = await vehicleLabels(
      rows.map((r) => r.p),
      ex,
    );
    return rows.map(({ p, pro }) => ({
      id: p.id,
      at: p.proposedAt,
      message: p.message,
      vehicle: p.vehicleId ? (labels.get(p.vehicleId) ?? null) : null,
      pro: {
        name: pro.name,
        logoUrl: storage.url(pro.logoKey),
        slug: pro.slug,
        city: pro.city,
        activities: pro.activities,
      },
    }));
  },

  /** Nombre de propositions reçues en attente (pastille « Demandes » : mêmes lignes que la liste). */
  async pendingCount(userId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ n: sql<number>`count(*)::int` })
      .from(partnerships)
      .innerJoin(proProfiles, eq(proProfiles.id, partnerships.proId))
      .where(and(eq(partnerships.userId, userId), eq(partnerships.status, "pending"), proShown(now())));
    return row?.n ?? 0;
  },

  /**
   * Sur le profil d'un passionné, pour un pro vérifié qui regarde : le bouton « Proposer » (`available`) ou la proposition
   * déjà envoyée (`pending`). Rien (`null`) pour tout autre regard : pas de fiche, fiche non vérifiée, après la date
   * sans abonnement, déjà partenaires, refus récent, ou son propre profil.
   */
  async offerFor(viewer: Viewer, targetId: string): Promise<PartnershipOffer | null> {
    if (viewer.user.id === targetId) return null;
    const pro = await proOfUser(viewer.user.id);
    if (!pro) return null;
    const at = now();
    if (canPropose(pro, { subscriptionFrom: await this.subscriptionFrom() }, at)) return null;
    const [open] = await db
      .select({ status: partnerships.status })
      .from(partnerships)
      .where(
        and(
          eq(partnerships.proId, pro.id),
          eq(partnerships.userId, targetId),
          inArray(partnerships.status, ["pending", "active"]),
        ),
      );
    if (open?.status === "active") return null;
    if (open) return { proId: pro.id, proName: pro.name, state: "pending" };
    if (await inCooldown(pro.id, targetId, at)) return null;
    // Même limite que l'envoi : pas de bouton « Proposer » pour une proposition qui serait refusée.
    if ((await recentProposals(pro.id, targetId, at)) >= PARTNERSHIP_MAX_PER_PERIOD) return null;
    return { proId: pro.id, proName: pro.name, state: "available" };
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function encodePartnerCursor(id: string): string {
  return Buffer.from(id).toString("base64url");
}
function decodePartnerCursor(cursor: string | undefined): string | null {
  if (!cursor) return null;
  const id = Buffer.from(cursor, "base64url").toString();
  return UUID.test(id) ? id : null;
}

/** Fin d'un partenariat en attente ou actif (une proposition retirée comme un partenariat fini). */
async function endRow(tx: Tx, row: PartnershipRow, by: string): Promise<PartnershipRow> {
  if (row.status !== "pending" && row.status !== "active")
    throw invalidTransition(row.status as PartnershipStatus, "ended");
  const [done] = await tx
    .update(partnerships)
    .set({ status: "ended", endedAt: now(), endedBy: by })
    .where(and(eq(partnerships.id, row.id), inArray(partnerships.status, ["pending", "active"])))
    .returning();
  if (!done) throw invalidTransition(row.status, "ended");
  return done;
}

/** Fiche pro du viewer, ou refus : 403 si ce n'est pas la sienne. */
async function ownedPro(v: Viewer, id: string): Promise<ProRow> {
  const [pro] = await db
    .select()
    .from(proProfiles)
    .where(and(eq(proProfiles.id, id), isNull(proProfiles.deletedAt)));
  if (!pro) throw notFound("Fiche pro introuvable");
  if (pro.ownerUserId !== v.user.id) throw forbidden("Cette fiche n'est pas la tienne");
  return pro;
}

export type { PartnershipRefusal };
