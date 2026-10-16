// Notifications : ligne `notifications` (le Journal de l'appli), puis livraison WebSocket + push + e-mail.
// Heures calmes 22:00–08:00 hors jour J (choix C15) : la livraison attend 08:00 (tâche `notifications.deliver`).
import {
  deliverAfter,
  emailAlwaysTypes,
  type NotificationFamily,
  type NotificationType,
  notificationTypes,
} from "@orasso/shared";
import { and, desc, eq, inArray, isNotNull, isNull, lt, lte, or } from "drizzle-orm";

import { db } from "../../db/client";
import { devices, notifications, profiles, user } from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { mail, renderMail } from "../../lib/mail";
import { decodeCursor, toPage } from "../../lib/pagination";
import { push } from "../../lib/push";
import { realtime } from "../../lib/realtime";
import type { Executor } from "../../lib/tx";

export type NotificationRow = typeof notifications.$inferSelect;

export type NotifyInput = {
  title: string;
  body: string;
  data?: { eventId?: string; applicationId?: string; screen?: string };
  eventId?: string | null;
  /** Début de l'événement concerné : le jour J lève les heures calmes. */
  eventStartsAt?: Date | null;
  /** Lien dans l'e-mail (chemin du site, ex. `/e/nocturne-de-canet-2026`). */
  link?: { label: string; path: string };
};

let inflight: Promise<void> = Promise.resolve();

export const notificationsService = {
  /**
   * Enregistre une notification (dans la transaction de l'appelant). La livraison se fait après validation :
   * `kick()` (sans attendre, dans `after` côté services) et la tâche de chaque minute appellent `deliverDue()`.
   */
  async notify(ex: Executor, userId: string, type: NotificationType, input: NotifyInput): Promise<NotificationRow> {
    const at = now();
    const immediate = type === "staff_alert";
    const [row] = await ex
      .insert(notifications)
      .values({
        userId,
        type,
        family: notificationTypes[type],
        title: input.title,
        body: input.body,
        data: { ...input.data, ...(input.link ? { link: input.link.path, linkLabel: input.link.label } : {}) },
        eventId: input.eventId ?? null,
        deliverAfter: immediate ? at : deliverAfter(at, input.eventStartsAt ?? null),
      })
      .returning();
    if (!row) throw new Error("Notification non enregistrée");
    return row;
  },

  /** Livre les notifications arrivées à échéance (idempotent : chaque ligne est réservée avant l'envoi). */
  async deliverDue(limit = 200): Promise<number> {
    const at = now();
    const due = await db
      .update(notifications)
      .set({ deliveredAt: at })
      .where(
        inArray(
          notifications.id,
          db
            .select({ id: notifications.id })
            .from(notifications)
            .where(and(isNull(notifications.deliveredAt), lte(notifications.deliverAfter, at)))
            .orderBy(notifications.deliverAfter)
            .limit(limit)
            // Deux livraisons simultanées (tâche + requête) ne réservent jamais la même ligne.
            .for("update", { skipLocked: true }),
        ),
      )
      .returning();
    for (const n of due) {
      try {
        await deliverOne(n);
      } catch (error) {
        // Réessayée à la prochaine minute.
        console.error("Livraison de notification :", error);
        await db.update(notifications).set({ deliveredAt: null }).where(eq(notifications.id, n.id));
      }
    }
    return due.length;
  },

  /** Lance une livraison sans la faire attendre à la requête (les envois s'enchaînent, jamais en parallèle). */
  kick(): void {
    inflight = inflight
      .then(() => this.deliverDue())
      .then(
        () => undefined,
        (error) => console.error("Livraison de notifications :", error),
      );
  },

  /** Attend la fin des livraisons lancées par `kick()` (tests, scripts). */
  flush(): Promise<void> {
    return inflight;
  },

  async list(userId: string, limit: number, cursor?: string) {
    const c = decodeCursor(cursor);
    const rows = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          // Les notifications différées (heures calmes) n'apparaissent qu'une fois livrées.
          isNotNull(notifications.deliveredAt),
          c
            ? or(
                lt(notifications.createdAt, c.createdAt),
                and(eq(notifications.createdAt, c.createdAt), lt(notifications.id, c.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(notifications.createdAt), desc(notifications.id))
      .limit(limit + 1);
    return toPage(rows, limit, (n) => ({
      id: n.id,
      type: n.type,
      family: n.family,
      title: n.title,
      body: n.body,
      data: n.data,
      eventId: n.eventId,
      createdAt: n.createdAt.toISOString(),
      readAt: n.readAt?.toISOString() ?? null,
    }));
  },

  async markRead(userId: string, ids: string[] | "all") {
    await db
      .update(notifications)
      .set({ readAt: now() })
      .where(
        and(
          eq(notifications.userId, userId),
          isNull(notifications.readAt),
          ids === "all"
            ? undefined
            : inArray(notifications.id, ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]),
        ),
      );
  },
};

async function deliverOne(n: NotificationRow) {
  realtime.publish(`user:${n.userId}`, "notification", {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: n.data,
  });
  const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, n.userId) });
  const family = n.family as NotificationFamily;
  // Chaque famille peut être coupée, sauf les relances du staff ; la notification reste dans le Journal.
  const allowed =
    family === "staff" || (profile?.notificationPrefs as Record<string, boolean> | undefined)?.[family] !== false;
  if (!allowed) return;

  const tokens = (
    await db
      .select({ token: devices.expoPushToken })
      .from(devices)
      .where(and(eq(devices.userId, n.userId), isNull(devices.revokedAt), isNotNull(devices.expoPushToken)))
  )
    .map((d) => d.token)
    .filter((t): t is string => Boolean(t));
  let pushed = 0;
  if (tokens.length) {
    pushed = await push.send(tokens.map((to) => ({ to, title: n.title, body: n.body, data: n.data })));
    if (pushed) await db.update(notifications).set({ pushSentAt: now() }).where(eq(notifications.id, n.id));
  }
  if (tokens.length === 0 || emailAlwaysTypes.includes(n.type as NotificationType)) {
    const account = await db.query.user.findFirst({ where: eq(user.id, n.userId), columns: { email: true } });
    if (!account) return;
    const data = n.data as { link?: string; linkLabel?: string };
    const content = renderMail(
      n.title,
      n.body.split("\n"),
      data.link ? { label: data.linkLabel ?? "Voir sur Orasso", url: `${env.PUBLIC_URL}${data.link}` } : undefined,
    );
    await mail.send(n.type, account.email, content, { notificationId: n.id });
    await db.update(notifications).set({ emailSentAt: now() }).where(eq(notifications.id, n.id));
  }
}
