// Compte dans l'appli (lot 35c) : export des données et clés d'accès. Calculs purs, sans React Native.
/** Nom du fichier d'export : daté du jour de Paris, sans caractère spécial. */
export function exportFileName(at: Date): string {
  const day = new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(at);
  return `orasso-mes-donnees-${day}.json`;
}

/** Contenu du fichier : JSON indenté, lisible par une personne. */
export const exportText = (data: unknown): string => JSON.stringify(data, null, 2);

export const PASSKEY_NAME_MAX = 60;

/** Nom donné à une clé : au moins une lettre, 60 caractères au plus. */
export function passkeyNameIssue(name: string): string | null {
  const clean = name.trim();
  if (!clean) return "Donne un nom à la clé.";
  if (clean.length > PASSKEY_NAME_MAX) return `Nom trop long (${PASSKEY_NAME_MAX} caractères au plus).`;
  return null;
}

export const passkeyTitle = (key: { name?: string | null }): string => key.name?.trim() || "Clé d'accès";

/** `deviceType` de Better Auth : `singleDevice` (reste sur son appareil) ou `multiDevice` (synchronisée). */
export const passkeyKind = (deviceType: string): string =>
  deviceType === "multiDevice" ? "Synchronisée entre tes appareils" : "Reste sur son appareil";

/** Supprimer une clé demande une session qui prouve la double authentification : sinon l'API répond 403. */
export const PASSKEY_SESSION_MESSAGE =
  "Cette session ne prouve pas ta double authentification : reconnecte-toi avec ta clé d'accès ou ton code, puis recommence.";

/** Forme d'une erreur de l'API (`ApiRequestError`), lue sans importer le client HTTP : testable hors React Native. */
type ApiLike = { status: number; message: string };
const isApiLike = (e: unknown): e is ApiLike =>
  e instanceof Error && typeof (e as { status?: unknown }).status === "number";

export function passkeyErrorMessage(error: unknown, fallback = "Clé introuvable."): string {
  if (isApiLike(error)) {
    if (error.status === 0) return error.message; // pas de réponse (hors ligne)
    if (error.status === 403) return PASSKEY_SESSION_MESSAGE;
    if (error.status === 404 || error.status === 400) return fallback;
  }
  return "Une erreur est survenue. Réessaie.";
}
