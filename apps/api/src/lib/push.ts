// Notifications Expo Push : lots de 100, jeton invalide → appareil révoqué. Inactif en test.
import { and, eq, gt, inArray, isNotNull, isNull, notExists, or } from "drizzle-orm";

import { db } from "../db/client";
import { devices, session } from "../db/schema";
import { env } from "../env";
import { now } from "./deps";

export type PushMessage = { to: string; title: string; body: string; data?: Record<string, unknown> };

/** Durée de vie d'un push chez Expo / Firebase / APNs : au-delà, non délivré (l'historique reste dans la Boîte). */
const PUSH_TTL_S = 6 * 3600;
type Ticket = { status: "ok" | "error"; details?: { error?: string } };

/** La session qui a inscrit l'appareil existe encore et n'a pas expiré (lot M6, tour 4). */
const sessionAlive = () =>
  db
    .select({ id: session.id })
    .from(session)
    .where(and(eq(session.id, devices.sessionId), gt(session.expiresAt, now())));

export const push = {
  /**
   * Lot M6, tour 4 (vie privée) : jetons à qui envoyer les push d'un compte. Seulement les appareils dont la session
   * d'inscription vit encore : déconnecté à distance, mot de passe changé, compte suspendu ou session expirée, le
   * téléphone ne reçoit plus rien, même appli fermée.
   */
  async tokensOf(userId: string): Promise<string[]> {
    await push.forgetStale(userId);
    const rows = await db
      .select({ token: devices.expoPushToken })
      .from(devices)
      .innerJoin(session, eq(session.id, devices.sessionId))
      .where(
        and(
          eq(devices.userId, userId),
          isNull(devices.revokedAt),
          isNotNull(devices.expoPushToken),
          gt(session.expiresAt, now()),
        ),
      );
    return rows.map((d) => d.token).filter((t): t is string => Boolean(t));
  },

  /**
   * Lot M6, tour 4 : l'inscription push d'un appareil dont la session n'existe plus (la clé est passée à `null` à sa
   * révocation) ou a expiré est supprimée : jeton effacé, appareil révoqué. Sans `userId`, pour tous les comptes. Un
   * appareil sans jeton (celui du staff) ne bouge pas : ses lectures du jour J restent rattachées.
   */
  async forgetStale(userId?: string): Promise<void> {
    await db
      .update(devices)
      .set({ revokedAt: now(), expoPushToken: null })
      .where(
        and(
          userId ? eq(devices.userId, userId) : undefined,
          isNotNull(devices.expoPushToken),
          or(isNull(devices.sessionId), notExists(sessionAlive())),
        ),
      );
  },

  /** Renvoie le nombre de messages acceptés par Expo. */
  async send(messages: PushMessage[]): Promise<number> {
    if (env.NODE_ENV === "test" || messages.length === 0) return 0;
    let accepted = 0;
    for (let i = 0; i < messages.length; i += 100) {
      const batch = messages.slice(i, i + 100);
      try {
        const res = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
          },
          // `ttl` : un push non délivré dans les 6 h est abandonné (un téléphone déconnecté hors ligne ne reçoit pas, au
          // retour du réseau, ceux restés en file ; relecture du lot M6, tour 4).
          body: JSON.stringify(batch.map((m) => ({ ttl: PUSH_TTL_S, ...m, sound: "default" }))),
        });
        const { data } = (await res.json()) as { data?: Ticket[] };
        const dead: string[] = [];
        data?.forEach((ticket, j) => {
          if (ticket.status === "ok") accepted++;
          else if (ticket.details?.error === "DeviceNotRegistered" && batch[j]) dead.push(batch[j].to);
        });
        if (dead.length) {
          // Lot M6, tour 4 : le jeton est aussi effacé (un téléphone déconnecté hors ligne s'est désinscrit chez Expo).
          await db
            .update(devices)
            .set({ revokedAt: now(), expoPushToken: null })
            .where(inArray(devices.expoPushToken, dead));
        }
      } catch (error) {
        console.error("Expo Push :", error);
      }
    }
    return accepted;
  },
};
