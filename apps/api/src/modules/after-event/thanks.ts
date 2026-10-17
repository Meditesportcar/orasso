// Remerciement aux présents (lot 27, ARCHITECTURE-SUITE § 11.2) : un message groupé du segment « entrés » (lot 20) avec
// le lien d'avis propre à chaque présent. Une seule fois par événement (`events.thanks_sent_at` posé dans la
// transaction de l'envoi, écriture conditionnelle), après la fin et jusqu'à J+7 (fenêtre des avis). Chaque présent
// reçoit le message dans sa Boîte (push) et une ligne du Journal ; aucun e-mail, donc rien qui entame le budget Brevo.
import {
  afterEventLabels,
  ensureReviewLink,
  GROUP_MESSAGE_MAX_RECIPIENTS,
  renderTemplate,
  reviewLink,
  THANKS_FALLBACK_BODY,
  type ThanksInput,
  type ThanksResult,
  type ThanksState,
  thanksBlockedReason,
} from "@orasso/shared";
import { and, eq, isNull, or } from "drizzle-orm";

import { db } from "../../db/client";
import { events, messageTemplates, structures } from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { conflict, notFound, validation } from "../../lib/errors";
import { formatDateTime } from "../../lib/format";
import type { Viewer } from "../../lib/session";
import { groupMessagesService } from "../communication/group-messages";
import { requireEventSpeaker } from "../communication/guards";
import { segmentRecipients } from "../communication/segments";
import type { EventRow } from "../events/repo";

async function oraSsoTemplate() {
  const [t] = await db
    .select()
    .from(messageTemplates)
    .where(and(eq(messageTemplates.kind, "thanks"), isNull(messageTemplates.structureId)))
    .limit(1);
  return t ?? null;
}

async function recipientsCount(e: EventRow, structureId: string, authorId: string): Promise<number> {
  const ids = await segmentRecipients(db, {
    segment: "checked_in",
    structureId,
    event: e,
    authorId,
    limit: GROUP_MESSAGE_MAX_RECIPIENTS + 1,
  });
  return ids.length;
}

export const thanksService = {
  /** État du remerciement pour la page « Après l'événement » (modèle prérempli, aperçu, destinataires, raison d'un refus). */
  async state(v: Viewer, e: EventRow): Promise<ThanksState> {
    const [s] = await db
      .select({ id: structures.id, name: structures.name })
      .from(structures)
      .where(eq(structures.id, e.structureId));
    const template = await oraSsoTemplate();
    const body = template?.body ?? THANKS_FALLBACK_BODY;
    const preview = renderTemplate(body, {
      pseudo: v.profile.pseudo,
      "structure.name": s?.name ?? null,
      "event.title": e.title,
      "event.date": formatDateTime(e.startsAt),
      "event.city": e.city,
      review_link: reviewLink(env.PUBLIC_URL, "<ton lien personnel>"),
    });
    return {
      sentAt: e.thanksSentAt?.toISOString() ?? null,
      blockedReason: thanksBlockedReason(e, now(), Boolean(e.thanksSentAt)),
      recipients: await recipientsCount(e, e.structureId, v.user.id),
      closesAt: new Date(e.endsAt.getTime() + 7 * 86_400_000).toISOString(),
      template: { id: template?.id ?? null, subject: template?.subject ?? null, body },
      preview,
    };
  },

  /** `POST /events/:id/thanks` : organisateur (2FA, structure et compte non suspendus), une seule fois. */
  async send(v: Viewer, eventId: string, input: ThanksInput): Promise<ThanksResult> {
    const { e, s } = await requireEventSpeaker(v, eventId);
    const blocked = thanksBlockedReason(e, now(), Boolean(e.thanksSentAt));
    if (blocked) throw conflict("conflict", afterEventLabels.thanksBlocked[blocked], { reason: blocked });
    let body = input.body;
    let subject = input.subject ?? null;
    let templateId: string | null = null;
    if (!body) {
      const template = input.templateId
        ? (
            await db
              .select()
              .from(messageTemplates)
              .where(
                and(
                  eq(messageTemplates.id, input.templateId),
                  or(isNull(messageTemplates.structureId), eq(messageTemplates.structureId, s.id)),
                ),
              )
          )[0]
        : await oraSsoTemplate();
      if (input.templateId && !template) throw notFound("Modèle introuvable");
      body = template?.body ?? THANKS_FALLBACK_BODY;
      subject = subject ?? template?.subject ?? null;
      templateId = template?.id ?? null;
    }
    if (!(await recipientsCount(e, s.id, v.user.id))) throw validation(afterEventLabels.thanksNoPresent);
    // Un seul envoi par événement : le `clientId` est l'identifiant de l'événement (rejoué, c'est le même envoi), et
    // `thanks_sent_at` est posé dans la transaction de l'envoi par une écriture conditionnelle.
    const created = await groupMessagesService.create(
      v,
      s.id,
      { clientId: e.id, eventId: e.id, segment: "checked_in", templateId, subject, body: ensureReviewLink(body) },
      { thanks: true },
    );
    const [row] = await db.select({ at: events.thanksSentAt }).from(events).where(eq(events.id, e.id));
    return {
      groupMessageId: created.groupMessageId,
      recipientsCount: created.recipientsCount,
      sentAt: (row?.at ?? now()).toISOString(),
    };
  },
};
