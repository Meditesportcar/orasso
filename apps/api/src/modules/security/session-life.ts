// Durée des sessions (lot R3d, décision de Damien du 24/10 : « sessions comme Instagram »). Tout le monde garde une
// session glissante d'un an, prolongée au plus une fois par jour d'usage (`auth.ts`, bloc `session`). Les comptes à rôle
// de plateforme (modération, administration : ceux de `requirePlatformRole`) tombent après 30 jours sans usage : à la
// prolongation (la première lecture d'un nouveau jour), une session de ces comptes qui n'a pas été prolongée depuis plus
// de 30 jours est supprimée, et la personne se reconnecte. Tour 2 (relectures) : le contrôle ne se fait qu'à la
// prolongation, au plus une fois par jour comme pour tout le monde ; aucune lecture ni écriture de plus par requête.
// Changer son mot de passe déconnecte toujours les autres appareils, « Compte › Appareils » ferme une session, et la
// double authentification n'est demandée qu'à la connexion (la preuve reste sur la session).
import { eq } from "drizzle-orm";

import { db } from "../../db/client";
import { profiles } from "../../db/schema";

const DAY_S = 24 * 3600;

/** Session glissante d'un an pour tout le monde (secondes, unité de Better Auth). */
export const SESSION_EXPIRES_IN_S = 365 * DAY_S;
/** Prolongée au plus une fois par jour d'usage. */
export const SESSION_UPDATE_AGE_S = DAY_S;
/** Comptes à rôle de plateforme : 30 jours sans usage, puis reconnexion. */
export const PLATFORM_SESSION_IDLE_S = 30 * DAY_S;

/** Le compte a-t-il un rôle de plateforme (modérateur ou super administrateur) ? */
async function hasPlatformRole(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ role: profiles.platformRole })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);
  return Boolean(row && row.role !== "user");
}

type ReadSession = { id: string; userId: string; updatedAt: Date };

/** Session courante lue par Better Auth avant sa prolongation (`ctx.context.session`), si le contexte la porte. */
export function sessionReadOf(ctx: unknown): ReadSession | null {
  const s = (ctx as { context?: { session?: { session?: Partial<Record<keyof ReadSession, unknown>> } | null } } | null)
    ?.context?.session?.session;
  if (!s || typeof s.id !== "string" || typeof s.userId !== "string" || !s.updatedAt) return null;
  return { id: s.id, userId: s.userId, updatedAt: new Date(s.updatedAt as string | Date) };
}

/**
 * La session peut-elle être prolongée ? Non pour un compte à rôle de plateforme sans usage depuis plus de 30 jours,
 * même s'il a reçu son rôle après l'ouverture de la session. `updatedAt` (dernière prolongation, une par jour d'usage
 * au plus) date le dernier usage, à un jour près (journal des choix). L'horloge est celle de Better Auth (`Date`).
 */
export async function mayProlong(read: ReadSession): Promise<boolean> {
  if (Date.now() - read.updatedAt.getTime() <= PLATFORM_SESSION_IDLE_S * 1000) return true;
  return !(await hasPlatformRole(read.userId));
}

/**
 * Lecture de session pour l'API (requêtes, WebSocket, garde des routes d'authentification) : une session révoquée à la
 * lecture (Better Auth répond « non autorisé » quand la prolongation est refusée) vaut « pas de session ».
 */
export async function readSessionOrNull<T>(read: () => Promise<T | null>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if ((error as { status?: unknown; statusCode?: unknown })?.statusCode === 401) return null;
    if ((error as { status?: unknown })?.status === "UNAUTHORIZED") return null;
    throw error;
  }
}
