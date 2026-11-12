import type { R7NotificationSpec } from "./r7";

/**
 * Vague R9 (lot R9a, ARCHITECTURE-R8 § 2.9) : les types de notification de la livraison 3 sont déclarés ici, sur le modèle
 * de `r8.ts` (même forme, `R7NotificationSpec`). R9a n'en émet aucun : la phrase et les destinataires de chacun sont fixés
 * par les fiches R9e (album publié) et R9f (identification dans un album). Famille `event`, push sans e-mail de repli, sans
 * levée des heures calmes ; ils ne font pas partie de la liste fermée de l'Essentiel (`rules/essentialTypes.ts`).
 * Les `structure_*` du plan (§ 2.7) ne créent aucun type : l'Activité de la structure marque les types existants.
 */
export const r9NotificationTable = {
  album_published: {
    family: "event",
    label: "Un album de photos est publié",
    title: "{name}",
    body: "{name} : un nouvel album de photos vient d'être publié.",
    push: true,
    email: false,
  },
  album_tagged: {
    family: "event",
    label: "Tu es identifié dans un album",
    title: "{name}",
    body: "{name} : tu es identifié sur des photos d'un album.",
    push: true,
    email: false,
  },
} as const satisfies Record<string, R7NotificationSpec>;

type R9Table = typeof r9NotificationTable;

/** Type → famille, à répandre dans `notificationTypes`. */
export const r9NotificationTypes = Object.fromEntries(
  Object.entries(r9NotificationTable).map(([type, s]) => [type, s.family]),
) as { [K in keyof R9Table]: R9Table[K]["family"] };

/** Libellés des types (réglages des notifications). */
export const r9NotificationLabels = Object.fromEntries(
  Object.entries(r9NotificationTable).map(([type, s]) => [type, s.label]),
) as Record<keyof R9Table, string>;

const typesWhere = (keep: (s: R7NotificationSpec) => boolean): readonly string[] =>
  Object.entries(r9NotificationTable as Record<string, R7NotificationSpec>)
    .filter(([, s]) => keep(s))
    .map(([type]) => type);

/** Journal seul : ni push ni e-mail, livrés tout de suite. */
export const r9JournalOnlyTypes: readonly string[] = typesWhere((s) => !s.push);
/** Push et Journal, sans e-mail de repli. */
export const r9NoEmailTypes: readonly string[] = typesWhere((s) => s.push && !s.email);

/** Titre et corps par défaut d'un type R9, `{name}` remplacé par le nom du sujet. */
export function r9DefaultContent(type: keyof R9Table, name: string): { title: string; body: string } {
  const s: R7NotificationSpec = r9NotificationTable[type];
  const fill = (text: string) => text.replaceAll("{name}", name);
  return { title: fill(s.title), body: fill(s.body) };
}
