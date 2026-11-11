// Notifications d'un événement (vague R8, lot R8n1, ARCHITECTURE-R8 § 2.7) : trois niveaux, règle pure.
// - Essentiel : liste FERMÉE ci-dessous. Livré quelles que soient la famille et les types coupés, tant que la personne a une
//   place à l'événement (les décisions sur sa propre candidature n'ont pas cette condition). Les heures calmes s'appliquent.
// - Nouveautés : `event_news_digest`, un résumé par jour au plus, coupable (réglage `eventNews`, ou par événement).
// - Social et tout le reste : règle ordinaire (`shouldDeliver`).
import { z } from "zod";

import { type NotificationType, notificationTypes } from "../enums";
import type { QuietOverride } from "../notifications/r7";
import { applicationDecisionTypes, essentialNotificationTypes } from "./essentialTypes";
import { shouldDeliver } from "./notifications";

export { applicationDecisionTypes, essentialNotificationTypes };

/** Le résumé quotidien des nouveautés. */
export const newsDigestType = "event_news_digest" as const satisfies NotificationType;

export type NotificationLevel = "essential" | "news" | "other";

export function notificationLevel(type: string): NotificationLevel {
  if ((essentialNotificationTypes as readonly string[]).includes(type)) return "essential";
  return type === newsDigestType ? "news" : "other";
}

/**
 * Types livrés sans condition de place : les décisions sur la candidature, et l'annulation (les places et billets sont
 * annulés avant la livraison : le destinataire a été choisi par l'émetteur, quand il avait encore une place).
 */
const placeFreeTypes: readonly string[] = [...applicationDecisionTypes, "event_cancelled"];
const isDecision = (type: string) => placeFreeTypes.includes(type);

/** Un changement important ou une annulation passe outre les heures calmes quand l'événement commence dans moins de 12 h. */
export const ESSENTIAL_URGENT_WITHIN_MS = 12 * 3_600_000;
export function essentialQuietOverride(type: string): QuietOverride | undefined {
  return type === "event_cancelled" || type === "event_updated" ? { within: ESSENTIAL_URGENT_WITHIN_MS } : undefined;
}

/**
 * La livraison de cette notification dépend-elle d'une place à l'événement ? Oui pour un type Essentiel rattaché à un
 * événement, sauf les décisions sur la candidature. Sert à ne lire la place que si `shouldDeliver` a refusé.
 */
export function essentialNeedsPlace(type: string, hasEventId: boolean): boolean {
  return hasEventId && notificationLevel(type) === "essential" && !isDecision(type);
}

/**
 * Livrée ou non (hors heures calmes, compte banni ou supprimé : traités ailleurs). La règle ordinaire (`shouldDeliver`)
 * d'abord ; l'Essentiel d'un événement la dépasse quand la personne a une place, les décisions sur sa candidature toujours.
 */
export function deliversNotification(input: {
  prefs: Partial<Record<string, boolean>> | null | undefined;
  mutedTypes: readonly string[] | null | undefined;
  type: string;
  hasEventId: boolean;
  hasPlace: boolean;
}): boolean {
  if (shouldDeliver(input.prefs, input.mutedTypes, input.type)) return true;
  if (notificationLevel(input.type) !== "essential" || !input.hasEventId) return false;
  return isDecision(input.type) || input.hasPlace;
}

/** Les types Essentiel sont des types déclarés (garde de compilation et de test). */
export const essentialTypesAreDeclared = (essentialNotificationTypes as readonly string[]).every(
  (t) => t in notificationTypes,
);

/** `PUT /me/events/:id/notification-prefs` : seules les Nouveautés se règlent (l'Essentiel n'a pas d'interrupteur). */
export const eventNotificationPrefsSchema = z.object({ news: z.boolean() });
export type EventNotificationPrefsUpdate = z.infer<typeof eventNotificationPrefsSchema>;

/** `GET|PUT /me/events/:id/notification-prefs` : les Nouveautés de l'événement et la place de la personne. */
export type EventNotificationPrefsView = { news: boolean; hasPlace: boolean };

/** `GET /events/:id/notify-preview` : combien de personnes un changement important prévient. */
export type NotifyPreview = { recipients: number };
