// Inscription express à l'entrée (docs/01 « le jour J », ARCHITECTURE.md § 1.6, § 5.3) : un staff saisit l'e-mail
// du conducteur, qui reçoit un lien valable 24 h ; le formulaire (écran au lot 13) crée le compte, le véhicule, la
// candidature retenue, le QR et l'entrée, et connecte la session.
import { randomBytes } from "node:crypto";
import {
  dayFor,
  type ExpressInvitePublic,
  type ExpressSignup,
  formatPlate,
  isMultiDay,
  isStaffModeOpen,
  normalizePlate,
  vehicleCreateSchema,
} from "@orasso/shared";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";

import { auth } from "../../auth";
import { db } from "../../db/client";
import {
  applicationEvents,
  applications,
  checkins,
  emailOutbox,
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
import { announceCandidatesChanged } from "../audience-prize/service";
import { daysRepo } from "../events/days";
import { lineupService } from "../events/lineup";
import { eventsRepo } from "../events/repo";
import { passportService } from "../passport/service";
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

/** L'invitation déjà créée par cet auteur avec cet identifiant (même réponse que la première fois), ou `undefined`. */
async function replayed(userId: string, clientId: string, event: Awaited<ReturnType<typeof eventsRepo.byId>>) {
  const [row] = await db
    .select()
    .from(expressInvites)
    .where(and(eq(expressInvites.createdBy, userId), eq(expressInvites.clientId, clientId)));
  if (!row) return undefined;
  // Une panne entre l'invitation et l'e-mail laisse une invitation sans message : le rejeu le répare (une seule fois).
  await settleMail(row, event);
  return {
    id: row.id,
    email: row.email,
    expiresAt: row.expiresAt.toISOString(),
    url: `${env.PUBLIC_URL}/express/${row.token}`,
  };
}

/**
 * Une ligne « en attente » plus vieille que cela est restée en route (arrêt du processus) : l'e-mail est considéré non envoyé.
 * Une livraison saine finit en moins de 10 s (délai de Brevo) : deux minutes suffisent à écarter toute livraison en cours.
 */
const STALE_QUEUED_MS = 2 * 60_000;

/**
 * La dernière trace d'e-mail d'une invitation express. Le prédicat est celui, mot pour mot, de l'index partiel
 * `email_outbox_express_invite_idx` (nom du modèle écrit en littéral, jamais en paramètre : sinon le planificateur ne peut
 * pas le rapprocher de l'index). Exportée pour que le test lise le plan de la requête réelle.
 */
export const lastMailTraceQuery = (executor: Pick<typeof db, "select">, inviteId: string) =>
  executor
    .select({ status: emailOutbox.status, createdAt: emailOutbox.createdAt })
    .from(emailOutbox)
    .where(and(sql`${emailOutbox.template} = 'express_invite'`, sql`${emailOutbox.payload}->>'inviteId' = ${inviteId}`))
    .orderBy(desc(emailOutbox.createdAt))
    .limit(1);

/**
 * Envoie l'e-mail de l'invitation **sauf s'il est parti ou en route** : la dernière trace de la boîte d'envoi est « envoyé »,
 * « écarté par le budget » ou « en attente » depuis moins de 2 minutes (« en route » : `pending`). Pas de trace, un échec (`failed`) ou une attente
 * trop ancienne : il repart. Sous un verrou propre à l'invitation, la ligne d'envoi est écrite **dans la transaction** (donc
 * visible des autres dès le verrou relâché) ; la livraison se fait **après**, hors transaction : aucune connexion de la base
 * n'attend le transport (la réserve du pool est de 10).
 */
async function ensureMail(
  row: { id: string; eventId: string; email: string; token: string },
  event: { title: string; startsAt: Date },
): Promise<"ok" | "pending"> {
  const content = renderMail(
    `Inscription express · ${event.title}`,
    [
      `Tu es à l'entrée de « ${event.title} » (${formatDateTime(event.startsAt)}).`,
      "Crée ton compte Orasso et ton véhicule en une minute : ton QR d'accès s'affiche aussitôt.",
      "Lien valable 24 h.",
    ],
    { label: "M'inscrire", url: `${env.PUBLIC_URL}/express/${row.token}` },
    { footer: "invitation" },
  );
  const queued = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`express-mail:${row.id}`}))`);
    const [last] = await lastMailTraceQuery(tx, row.id);
    const onItsWay =
      last &&
      (last.status === "sent" ||
        last.status === "skipped_quota" ||
        (last.status === "queued" && now().getTime() - last.createdAt.getTime() < STALE_QUEUED_MS));
    if (onItsWay) return last.status === "queued" ? ("pending" as const) : undefined;
    return mail.enqueue(
      "express_invite",
      row.email,
      content,
      { eventId: row.eventId, inviteId: row.id },
      env.MAIL_TRANSPORT,
      tx,
    );
  });
  if (queued === "pending") return "pending";
  if (queued) await mail.deliver(queued, row.email, content);
  return "ok";
}

/**
 * Ne répond « envoyée » que si l'e-mail est parti (ou écarté). Une livraison en route donne **tout de suite** une réponse non
 * définitive (503 `mail_pending`), sans attente ni sondage : la file du téléphone envoie une demande après l'autre, une attente
 * ici retarderait tout ce qui est derrière (une alerte staff). La file réessaie ; une livraison arrêtée en route devient reprenable
 * au bout de 2 minutes.
 */
async function settleMail(
  row: { id: string; eventId: string; email: string; token: string },
  event: { title: string; startsAt: Date },
): Promise<void> {
  if ((await ensureMail(row, event)) === "ok") return;
  throw new AppError(503, "mail_pending", "L'e-mail de l'invitation est en cours d'envoi : réessaie dans un instant.");
}

export const expressService = {
  /** `POST /events/:id/express-invites` (staff ou organisateur, de la veille à J+1). */
  async invite(v: Viewer, eventId: string, email: string, clientId: string | null = null) {
    const event = await eventsRepo.byId(eventId);
    await staffService.requireEventStaff(v, event);
    if (event.status !== "published" || !isStaffModeOpen(event, now())) {
      throw new AppError(423, "locked", "Inscription express : de la veille à la fin de l'événement");
    }
    // Rejeu d'un envoi dont la réponse s'est perdue (R8p, tour 5) : la première invitation, aucun second e-mail.
    const replay = clientId ? await replayed(v.user.id, clientId, event) : undefined;
    if (replay) return replay;
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
      .values({
        eventId,
        email: email.toLowerCase(),
        token,
        createdBy: v.user.id,
        expiresAt,
        createdAt: now(),
        clientId,
      })
      .onConflictDoNothing()
      .returning();
    if (!row) {
      // Une autre requête avec le même identifiant vient d'insérer : c'est elle qui envoie l'e-mail.
      const again = clientId ? await replayed(v.user.id, clientId, event) : undefined;
      if (again) return again;
      throw new Error("Invitation non enregistrée");
    }
    const url = `${env.PUBLIC_URL}/express/${token}`;
    await settleMail(row, event);
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
        .set({ firstName: input.firstName, lastName: input.lastName, termsAcceptedAt: t })
        .where(eq(profiles.userId, created.id));
      const [v] = await tx
        .insert(vehicles)
        .values({
          ownerId: created.id,
          vehicleType: vehicle.vehicleType,
          makeId: vehicle.makeId,
          modelId: vehicle.modelId,
          generationId: vehicle.generationId ?? null,
          plate: vehicle.unregistered || !vehicle.plate ? null : formatPlate(vehicle.plate),
          plateNormalized,
          unregistered: vehicle.unregistered,
          status: "active",
        })
        .returning();
      if (!v) throw new Error("Véhicule non enregistré");
      // Plusieurs jours (lot 26) : une inscription express sur place vaut pour le jour même quand l'accès se fait par
      // jour (ou au choix) ; tout l'événement sinon, ou hors des jours déclarés.
      const days = await daysRepo.list(event.id, tx);
      const today = isMultiDay(days) && event.dayAccess !== "whole" ? dayFor(days, t, event.timezone) : null;
      const [app] = await tx
        .insert(applications)
        .values({
          eventId: event.id,
          userId: created.id,
          vehicleId: v.id,
          eventDayId: today?.id ?? null,
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
        createdAt: t,
      });
      await tx
        .update(expressInvites)
        .set({ usedAt: t, userId: created.id, applicationId: app.id })
        .where(eq(expressInvites.id, invite.id));
      // Lot 49 : tampon de participation, comme tout pointage.
      await passportService.stampCheckin(tx, { applicationId: app.id, eventId: event.id, at: t });
      after(() => realtime.publish(`event:${event.id}:access`, "access.changed", { applicationIds: [app.id] }));
      after(() => announceCandidatesChanged(event.id));
      // Lot R4b, tour 2 : une inscription express retient une voiture, elle rejoint le plateau.
      after(() => lineupService.changed(event.id));
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
