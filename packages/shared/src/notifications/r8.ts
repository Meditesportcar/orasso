import type { R7NotificationSpec } from "./r7";

/**
 * Vague R8 (lot R8a1, ARCHITECTURE-R8 § 2.7) : tous les types de notification de la vague sont déclarés ici, d'un coup,
 * sur le modèle de `r7.ts` (même forme, `R7NotificationSpec`). R8a1 n'émet que `event_important` ; les autres sont émis par
 * R8k1 (commentaires), R8n1 (résumé des nouveautés), R8a2 (mentions) et R8o (co-auteur).
 * Aucun type de la vague ne lève les heures calmes.
 */
export const r8NotificationTable = {
  event_important: {
    family: "event",
    label: "Info importante d'un organisateur",
    title: "{name}",
    body: "{name} : une information importante vient d'être publiée.",
    push: true,
    email: false,
  },
  event_news_digest: {
    family: "event",
    label: "Résumé des nouveautés de mes sorties",
    title: "Du nouveau dans tes sorties",
    body: "{name}",
    push: true,
    email: false,
  },
  feed_comment: {
    family: "social",
    label: "Un commentaire sur ma publication",
    title: "{name} a commenté ta publication",
    body: "{name} a commenté ta publication.",
    push: true,
    email: false,
  },
  feed_comment_reply: {
    family: "social",
    label: "Une réponse à mon commentaire",
    title: "{name} a répondu à ton commentaire",
    body: "{name} a répondu à ton commentaire.",
    push: true,
    email: false,
  },
  feed_comment_like: {
    family: "social",
    label: "Une flamme sur mon commentaire",
    title: "{name} a aimé ton commentaire",
    body: "{name} a aimé ton commentaire.",
    push: false,
    email: false,
  },
  feed_comment_mention: {
    family: "social",
    label: "Cité dans un commentaire",
    title: "{name} t'a cité dans un commentaire",
    body: "{name} t'a cité dans un commentaire.",
    push: true,
    email: false,
  },
  feed_post_mention: {
    family: "social",
    label: "Cité dans une publication",
    title: "{name} te cite dans une publication",
    body: "{name} t'a cité dans une publication.",
    push: true,
    email: false,
  },
  coauthor_invited: {
    family: "social",
    label: "Invité à publier avec quelqu'un",
    title: "{name} t'invite à publier avec lui",
    body: "{name} t'invite à être co-auteur d'une publication.",
    push: true,
    email: false,
  },
  coauthor_accepted: {
    family: "social",
    label: "Un co-auteur a accepté",
    title: "{name} a accepté de publier avec toi",
    body: "{name} a accepté d'être co-auteur de ta publication.",
    push: true,
    email: false,
  },
  coauthor_withdrawn: {
    family: "social",
    label: "Un co-auteur s'est retiré",
    title: "{name} s'est retiré d'une publication",
    body: "{name} n'est plus co-auteur de ta publication.",
    push: false,
    email: false,
  },
} as const satisfies Record<string, R7NotificationSpec>;

type R8Table = typeof r8NotificationTable;

/** Type → famille, à répandre dans `notificationTypes`. */
export const r8NotificationTypes = Object.fromEntries(
  Object.entries(r8NotificationTable).map(([type, s]) => [type, s.family]),
) as { [K in keyof R8Table]: R8Table[K]["family"] };

/** Libellés des types (réglages des notifications). */
export const r8NotificationLabels = Object.fromEntries(
  Object.entries(r8NotificationTable).map(([type, s]) => [type, s.label]),
) as Record<keyof R8Table, string>;

const typesWhere = (keep: (s: R7NotificationSpec) => boolean): readonly string[] =>
  Object.entries(r8NotificationTable as Record<string, R7NotificationSpec>)
    .filter(([, s]) => keep(s))
    .map(([type]) => type);

/** Journal seul : ni push ni e-mail, livrés tout de suite. */
export const r8JournalOnlyTypes: readonly string[] = typesWhere((s) => !s.push);
/** Push et Journal, sans e-mail de repli. */
export const r8NoEmailTypes: readonly string[] = typesWhere((s) => s.push && !s.email);

/** Titre et corps par défaut d'un type R8, `{name}` remplacé par le nom du sujet. */
export function r8DefaultContent(type: keyof R8Table, name: string): { title: string; body: string } {
  const s: R7NotificationSpec = r8NotificationTable[type];
  const fill = (text: string) => text.replaceAll("{name}", name);
  return { title: fill(s.title), body: fill(s.body) };
}
