// Inscription express à l'entrée (docs/01 « le jour J », ARCHITECTURE.md § 1.6, § 5.3) : un staff saisit l'e-mail
// du conducteur, qui reçoit un lien valable 24 h ; le formulaire (écran au lot 13) crée le compte, le véhicule, la
// candidature retenue, le QR et l'entrée, et connecte la session.
import { randomBytes } from "node:crypto";
import {
  type ExpressInvitePublic,
  type ExpressSignup,
  isStaffModeOpen,
  normalizePlate,
  vehicleCreateSchema,
} from "@orasso/shared";
import { and, count, eq, gte, sql } from "drizzle-orm";

import { auth } from "../../auth";
import { db } from "../../db/client";
import {
  applicationEvents,
  applications,
  checkins,
  expressInvites,
  profiles,
  user,
  vehicleModels,
  vehicles,
} from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { AppError, conflict, notFound } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import { lockEventCheckins } from "../../lib/locks";
import { mail, renderMail } from "../../lib/mail";
import { realtime } from "../../lib/realtime";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { accessService, passPayload } from "../access/service";
import { eventsRepo } from "../events/repo";
import { staffService } from "../staff/service";
import { checkReference } from "../vehicles/service";

const HOUR_MS = 3_600_000;
const VALIDITY_MS = 24 * HOUR_MS;
const MAX_INVITES_PER_HOUR = 30;

async function usableInvite(token: string) {
  const invite = await db.query.expressInvites.findFirst({ where: eq(expressInvites.token, token) });
  if (!invite) throw notFound("Lien d'inscription introuvable");
  if (invite.usedAt) throw conflict("conflict", "Lien déjà utilisé : connecte-toi pour retrouver ton accès");
  if (now() >= invite.expiresAt) throw conflict("conflict", "Lien expiré : demande-en un nouveau à l'entrée");
  const event = await eventsRepo.byId(invite.eventId);
  if (event.status !== "published") throw conflict("conflict", "Événement annulé");
  return { invite, event };
}

export const expressService = {
  /** `POST /events/:id/express-invites` (staff ou organisateur, de la veille à J+1). */
  async invite(v: Viewer, eventId: string, email: string) {
    const event = await eventsRepo.byId(eventId);
    await staffService.requireEventStaff(v, event);
    if (event.status !== "published" || !isStaffModeOpen(event, now())) {
      throw new AppError(423, "locked", "Inscription express : de la veille à la fin de l'événement");
    }
    // Limite d'envoi : un compte staff ne peut pas servir à arroser des adresses (anti-abus du formulaire).
    const [sent] = await db
      .select({ n: count() })
      .from(expressInvites)
      .where(
        and(
          eq(expressInvites.createdBy, v.user.id),
          gte(expressInvites.createdAt, new Date(now().getTime() - HOUR_MS)),
        ),
      );
    if ((sent?.n ?? 0) >= MAX_INVITES_PER_HOUR) {
      throw new AppError(429, "rate_limited", `Au plus ${MAX_INVITES_PER_HOUR} inscriptions express par heure`);
    }
    const token = randomBytes(24).toString("base64url");
    const expiresAt = new Date(now().getTime() + VALIDITY_MS);
    const [row] = await db
      .insert(expressInvites)
      .values({ eventId, email: email.toLowerCase(), token, createdBy: v.user.id, expiresAt, createdAt: now() })
      .returning();
    if (!row) throw new Error("Invitation non enregistrée");
    const url = `${env.PUBLIC_URL}/express/${token}`;
    await mail.send(
      "express_invite",
      row.email,
      renderMail(
        `Inscription express · ${event.title}`,
        [
          `Tu es à l'entrée de « ${event.title} » (${formatDateTime(event.startsAt)}).`,
          "Crée ton compte Orasso et ton véhicule en une minute : ton QR d'accès s'affiche aussitôt.",
          "Lien valable 24 h.",
        ],
        { label: "M'inscrire", url },
      ),
      { eventId, inviteId: row.id },
    );
    // Le lien est aussi rendu au staff : il peut le montrer en QR si l'e-mail tarde.
    return { id: row.id, email: row.email, expiresAt: row.expiresAt.toISOString(), url };
  },

  /** `GET /express/:token` (public) : de quoi afficher le formulaire. */
  async get(token: string): Promise<ExpressInvitePublic> {
    const invite = await db.query.expressInvites.findFirst({ where: eq(expressInvites.token, token) });
    if (!invite) throw notFound("Lien d'inscription introuvable");
    const event = await eventsRepo.byId(invite.eventId);
    return {
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        startsAt: event.startsAt.toISOString(),
        city: event.city,
      },
      email: invite.email,
      expiresAt: invite.expiresAt.toISOString(),
      used: Boolean(invite.usedAt),
    };
  },

  /**
   * `POST /express/:token` (public) : compte + véhicule (sans photo, à ajouter ensuite dans le garage) + candidature
   * retenue d'office par le staff (hors capacité : la personne est à l'entrée) + QR + entrée « express ».
   * Renvoie la réponse de Better Auth (cookie de session) enrichie du QR.
   */
  async complete(token: string, input: ExpressSignup) {
    const { invite, event } = await usableInvite(token);
    if (!isStaffModeOpen(event, now())) throw new AppError(423, "locked", "Événement terminé");
    // Tout ce qui peut échouer est vérifié avant de créer le compte.
    const exists = await db.query.user.findFirst({ where: sql`lower(${user.email}) = ${invite.email}` });
    if (exists) throw conflict("conflict", "Un compte existe déjà pour cette adresse : connecte-toi");
    const model = await db.query.vehicleModels.findFirst({ where: eq(vehicleModels.id, input.modelId) });
    const vehicleType = model?.vehicleType ?? "car";
    await checkReference(db, { ...input, vehicleType });
    const plateNormalized = !input.unregistered && input.plate ? normalizePlate(input.plate) : null;
    if (plateNormalized) {
      const taken = await db.query.vehicles.findFirst({
        where: and(eq(vehicles.plateNormalized, plateNormalized), eq(vehicles.status, "active")),
      });
      if (taken) throw conflict("plate_taken", "Cette plaque est déjà enregistrée : connecte-toi à ton compte");
    }
    const vehicle = vehicleCreateSchema.parse({
      vehicleType,
      makeId: input.makeId,
      modelId: input.modelId,
      generationId: input.generationId ?? null,
      plate: input.unregistered ? null : input.plate,
      unregistered: input.unregistered,
    });

    const signUp = await auth.api.signUpEmail({
      body: { email: invite.email, password: input.password, name: input.pseudo },
      asResponse: true,
    });
    if (!signUp.ok) throw new AppError(400, "validation_error", "Inscription impossible : vérifie le mot de passe");
    const { user: created } = (await signUp.json()) as { user: { id: string } };

    const result = await withTx(async (tx, after) => {
      await lockEventCheckins(tx, event.id);
      const [locked] = await tx.select().from(expressInvites).where(eq(expressInvites.id, invite.id)).for("update");
      if (!locked || locked.usedAt) throw conflict("conflict", "Lien déjà utilisé");
      const t = now();
      // L'adresse n'est pas marquée vérifiée : le lien a pu être montré par le staff au lieu d'être reçu par e-mail.
      // L'e-mail de vérification part à l'inscription (lot 15) ; un compte express ne compte jamais pour le parrainage.
      await tx
        .update(profiles)
        .set({ firstName: input.firstName, lastName: input.lastName })
        .where(eq(profiles.userId, created.id));
      const [v] = await tx
        .insert(vehicles)
        .values({
          ownerId: created.id,
          vehicleType: vehicle.vehicleType,
          makeId: vehicle.makeId,
          modelId: vehicle.modelId,
          generationId: vehicle.generationId ?? null,
          plate: vehicle.unregistered ? null : vehicle.plate,
          plateNormalized,
          unregistered: vehicle.unregistered,
          status: "active",
        })
        .returning();
      if (!v) throw new Error("Véhicule non enregistré");
      const [app] = await tx
        .insert(applications)
        .values({
          eventId: event.id,
          userId: created.id,
          vehicleId: v.id,
          status: "accepted",
          source: "express",
          rulesAcceptedAt: t,
          followStructure: false,
          decidedAt: t,
          decidedBy: invite.createdBy,
        })
        .returning();
      if (!app) throw new Error("Candidature non enregistrée");
      await tx.insert(applicationEvents).values({
        applicationId: app.id,
        fromStatus: null,
        toStatus: "accepted",
        actor: "staff",
        actorUserId: invite.createdBy,
        reason: "express",
        at: t,
      });
      const pass = await accessService.issue(tx, app);
      // La personne est à l'entrée, avec le staff qui l'a inscrite : elle est pointée « express ».
      await tx.insert(checkins).values({
        applicationId: app.id,
        eventId: event.id,
        method: "express",
        checkedInAt: t,
        staffUserId: invite.createdBy,
      });
      await tx
        .update(expressInvites)
        .set({ usedAt: t, userId: created.id, applicationId: app.id })
        .where(eq(expressInvites.id, invite.id));
      after(() => realtime.publish(`event:${event.id}:access`, "access.changed", { applicationIds: [app.id] }));
      return { applicationId: app.id, pass };
    });
    return {
      response: signUp,
      body: {
        applicationId: result.applicationId,
        eventId: event.id,
        passPayload: passPayload(result.pass, event.eventNo),
      },
    };
  },
};
