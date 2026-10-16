import type { MessageSegment } from "../communication";

// Communication de l'organisateur (lot 20, ARCHITECTURE-SUITE § 5) : règles pures. L'API les applique ; le site et
// l'appli affichent le résultat sans le recalculer (l'aperçu d'un modèle utilise `renderTemplate`).

/** Annonce du fil (≤ 1000), message groupé (≤ 2000, comme un message), objet (≤ 120), nom d'un modèle (≤ 60). */
export const ANNOUNCEMENT_BODY_MAX = 1000;
export const GROUP_MESSAGE_BODY_MAX = 2000;
export const GROUP_MESSAGE_SUBJECT_MAX = 120;
export const TEMPLATE_NAME_MAX = 60;
/** Modèles personnels d'une structure (les modèles Orasso ne comptent pas). */
export const TEMPLATES_PER_STRUCTURE = 50;

/** S18 : messages groupés aux abonnés, par structure, sur 30 jours glissants (réglable par l'admin). */
export const FOLLOWER_QUOTA_DEFAULT = 4;
export const FOLLOWER_QUOTA_WINDOW_MS = 30 * 86_400_000;
/** Messages groupés par structure et par jour, tous segments confondus (anti-abus, compté en base). */
export const GROUP_MESSAGES_PER_DAY = 20;
/** Annonces par événement et par jour (anti-abus, compté en base). */
export const ANNOUNCEMENTS_PER_DAY = 20;
/** Destinataires d'un message groupé au plus, et taille d'un lot de la tâche `messaging.group-send`. */
export const GROUP_MESSAGE_MAX_RECIPIENTS = 5000;
export const GROUP_SEND_BATCH = 500;
/** Une entrée de fil a au plus une photo. */
export const ANNOUNCEMENT_IMAGES_MAX = 1;

/** Segments qui ne dépendent pas d'un événement (staff de la structure, abonnés). */
export const segmentsWithoutEvent: readonly MessageSegment[] = ["staff", "followers"];

export function segmentNeedsEvent(segment: MessageSegment): boolean {
  return !segmentsWithoutEvent.includes(segment);
}

/** Ce qui reste du quota d'envoi aux abonnés : `quota` moins les envois des 30 derniers jours (jamais négatif). */
export function followerQuotaRemaining(sentAt: readonly Date[], now: Date, quota = FOLLOWER_QUOTA_DEFAULT): number {
  const since = now.getTime() - FOLLOWER_QUOTA_WINDOW_MS;
  const used = sentAt.filter((d) => d.getTime() > since).length;
  return Math.max(0, quota - used);
}

/** Date à laquelle un envoi aux abonnés redevient possible (le plus ancien envoi de la fenêtre + 30 jours). */
export function followerQuotaResetsAt(sentAt: readonly Date[], now: Date, quota = FOLLOWER_QUOTA_DEFAULT): Date | null {
  if (followerQuotaRemaining(sentAt, now, quota) > 0) return null;
  const since = now.getTime() - FOLLOWER_QUOTA_WINDOW_MS;
  const inWindow = sentAt
    .map((d) => d.getTime())
    .filter((t) => t > since)
    .sort((a, b) => a - b);
  const oldest = inWindow[inWindow.length - quota] ?? inWindow[0];
  return oldest === undefined ? null : new Date(oldest + FOLLOWER_QUOTA_WINDOW_MS);
}

const DAY = 86_400_000;

/** Discussion du staff d'un événement : plus de nouveaux messages à J+1 (fin + 1 jour, comme le mode staff). */
export function staffChatClosesAt(event: { endsAt: Date }): Date {
  return new Date(event.endsAt.getTime() + DAY);
}

/** … et lisible par l'organisateur jusqu'à J+7 (docs/01), le staff perdant la lecture à la fermeture (S21). */
export function staffChatReadableUntil(event: { endsAt: Date }): Date {
  return new Date(event.endsAt.getTime() + 7 * DAY);
}

/** Messages de la discussion d'un événement supprimés un an après la fin (conservation alignée sur les signalements). */
export function staffChatPurgeAt(event: { endsAt: Date }): Date {
  return new Date(event.endsAt.getTime() + 365 * DAY);
}

/** Variables connues des modèles de messages (ARCHITECTURE-SUITE § 5.1). */
export const templateVariables = [
  "event.title",
  "event.date",
  "event.city",
  "structure.name",
  "pseudo",
  "review_link",
] as const;
export type TemplateVariable = (typeof templateVariables)[number];
export type TemplateValues = Partial<Record<TemplateVariable, string | null>>;

/**
 * Remplace `{{variable}}` (espaces tolérés) par sa valeur. Une variable inconnue, ou connue mais sans valeur, reste
 * telle quelle : l'organisateur voit ce qui manque dans l'aperçu au lieu d'un trou silencieux.
 */
export function renderTemplate(body: string, values: TemplateValues): string {
  return body.replace(/\{\{\s*([a-z_.]+)\s*\}\}/g, (whole, name: string) => {
    if (!(templateVariables as readonly string[]).includes(name)) return whole;
    const value = values[name as TemplateVariable];
    return value === undefined || value === null || value === "" ? whole : value;
  });
}

/** Variables d'un texte qui ne sont pas connues (aide à la saisie d'un modèle). */
export function unknownTemplateVariables(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) {
    const name = m[1] ?? "";
    if (!(templateVariables as readonly string[]).includes(name)) out.add(name);
  }
  return [...out];
}
