import type { RequestItem } from "@orasso/shared";

/**
 * Props d'une carte de demande (lot R7c2) : une demande de `GET /me/requests`, et ce que la carte appelle après une
 * décision pour que l'écran relise sa liste et les pastilles. Une sorte de demande = un fichier de ce dossier et une ligne
 * du registre `index.ts` (le lot R7m1 y ajoute `partnership`).
 */
export type RequestCardProps = {
  item: RequestItem;
  onDone: () => void;
  /** Lot R7-fix-invite : ouvre le menu « ⋯ » d'une invitation de passionnés (couper chacun) ; l'écran porte la feuille. */
  onInviteMenu?: (from: { userId: string; pseudo: string }[]) => void;
};

/** Lit un champ texte de `payload` (liste blanche de l'API, propre à chaque sorte) sans le supposer. */
export function payloadString(item: RequestItem, key: string): string | null {
  const v = item.payload[key];
  return typeof v === "string" && v ? v : null;
}

export function payloadObject(item: RequestItem, key: string): Record<string, unknown> | null {
  const v = item.payload[key];
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Le texte d'une clé d'un objet de `payload` (`event.title`…), ou `null`. */
export function textOf(object: Record<string, unknown> | null, key: string): string | null {
  const v = object?.[key];
  return typeof v === "string" && v ? v : null;
}

/** Nom et image de qui demande : une personne ou une structure. */
export function fromOf(item: RequestItem): { name: string; imageUrl: string | null } {
  return item.from.type === "person"
    ? { name: item.from.pseudo, imageUrl: item.from.avatarUrl }
    : { name: item.from.name, imageUrl: item.from.logoUrl };
}
