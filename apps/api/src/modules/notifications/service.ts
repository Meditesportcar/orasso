// Notifications : ligne `notifications` (le Journal de l'appli), puis livraison WebSocket + push + e-mail.
// Heures calmes 22:00–08:00 hors jour J (choix C15) : la livraison attend 08:00 (tâche `notifications.deliver`).
import {
  ACTIVITY_MAX_ACTORS,
  deliverAfter,
  emailAlwaysTypes,
  journalOnlyNotificationTypes,
  journalWindowStart,
  type NotificationType,
  notificationTypes,
  pushOnlyNotificationTypes,
  pushRecipientId,
  type QuietOverride,
  r7QuietOverride,
  shouldDeliver,
} from "@orasso/shared";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { type NotificationData, notifications, profiles, user } from "../../db/schema";
import { env } from "../../env";
import { now } from "../../lib/deps";
import { type MailContent, mail, renderMail } from "../../lib/mail";
import { decodeCursor, toPage } from "../../lib/pagination";
import { push } from "../../lib/push";
import { realtime } from "../../lib/realtime";
import { type Executor, withTx } from "../../lib/tx";
import { citedPeopleRemain, citedViews, textTemplate } from "./grouped";

export type NotificationRow = typeof notifications.$inferSelect;

export type NotifyInput = {
  title: string;
  body: string;
  data?: NotificationData;
  eventId?: string | null;
  /** Début de l'événement concerné : le jour J lève les heures calmes. */
  eventStartsAt?: Date | null;
  /** Lien dans l'e-mail (chemin du site, ex. `/e/nocturne-de-canet-2026`). */
  link?: { label: string; path: string };
  /** E-mail rédigé par l'appelant (sécurité du compte) à la place du gabarit titre + texte. */
  email?: MailContent;
  /** Faux : push seulement, absent du Journal (ex. message reçu, lot 18). */
  inJournal?: boolean;
  /**
   * Lot R6c, tour 2 : trace silencieuse, jamais envoyée ni montrée (ni Journal, ni push, ni e-mail, ni temps réel) ; elle
   * compte seulement pour les limites par paire. Sert à répondre à l'auteur d'une invitation comme si elle était partie
   * quand la personne a coupé ses invitations.
   */
  silent?: boolean;
  /**
   * Lot R7c1 : clé de regroupement (`story_like:<storyId>`). Une notification non lue du même compte et de la même clé,
   * de moins de 24 h, est complétée (`data.actors`, `data.count`, heure de livraison) au lieu d'en créer une autre.
   */
  groupKey?: string;
  /** Lot R7c1 : la personne à l'origine, citée dans `data.actors` d'une notification regroupée. */
  actor?: { userId: string; pseudo: string; avatarUrl: string | null };
  /** Lot R7c1 : levée des heures calmes ; par défaut, celle de la table du type (`r7QuietOverride`). */
  urgent?: QuietOverride;
};

/** Champs internes de `data` (clés commençant par `_`) jamais renvoyés aux clients. */
const stripInternal = (data: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(data).filter(([k]) => !k.startsWith("_")));

/**
 * Lot R7c1, tour 2 : comptes dont la Boîte a changé sans nouvelle livraison (occurrence ajoutée à une ligne regroupée déjà
 * livrée). Leurs appareils sont prévenus (`inbox.changed`) après la validation : par `kick()`, que les appelants lancent
 * une fois leur transaction validée, ou tout de suite quand `notify` ouvre sa propre transaction.
 */
const staleInboxes = new Set<string>();
function flushStaleInboxes() {
  for (const userId of staleInboxes) realtime.publish(`user:${userId}`, "inbox.changed", {});
  staleInboxes.clear();
}

/** Personnes gardées au plus dans une notification regroupée (de quoi compter, pas de quoi tenir une liste). */
const MAX_GROUPED_ACTORS = 500;

type GroupedData = { _actorIds?: string[]; actors?: { pseudo: string; avatarUrl: string | null }[]; count?: number };

/** Modèle des textes d'une notification regroupée : le pseudo de la personne remplacé par `{name}` (voir `grouped.ts`). */
const groupText = (input: NotifyInput, pseudo: string) => ({
  title: textTemplate(input.title, pseudo),
  body: textTemplate(input.body, pseudo),
});

let inflight: Promise<void> = Promise.resolve();

/**
 * Lot R5c1, tour 2 : contrôle d'une notification à sa livraison (`false` : supprimée sans être envoyée). Lot R6c, tour 2 :
 * le domaine peut aussi rendre la ligne recomposée (ex. invitation regroupée sans un auteur coupé entre-temps) : c'est
 * elle qui part.
 */
export type DeliveryGuard = (n: NotificationRow) => Promise<boolean | NotificationRow>;
const deliveryGuards = new Map<string, DeliveryGuard>();

/** Un domaine revérifie ses notifications au moment de les livrer (ex. : destinataire encore membre d'un crew). */
export function registerDeliveryGuard(types: readonly NotificationType[], guard: DeliveryGuard): void {
  for (const t of types) deliveryGuards.set(t, guard);
}

export const notificationsService = {
  /**
   * Enregistre une notification (dans la transaction de l'appelant). La livraison se fait après validation :
   * `kick()` (sans attendre, dans `after` côté services) et la tâche de chaque minute appellent `deliverDue()`.
   */
  async notify(ex: Executor, userId: string, type: NotificationType, input: NotifyInput): Promise<NotificationRow> {
    const at = now();
    // Alertes du staff et sécurité du compte (nouvelle connexion, mot de passe changé…) : jamais différées la nuit.
    // Items d'actualité du Journal (lot 17) : ni push ni heures calmes, visibles tout de suite.
    const immediate =
      type === "staff_alert" || notificationTypes[type] === "account" || journalOnlyNotificationTypes.includes(type);
    const due =
      immediate || input.silent || !env.NOTIFY_QUIET_HOURS
        ? at
        : deliverAfter(at, input.eventStartsAt ?? null, undefined, input.urgent ?? r7QuietOverride(type));
    const grouped = input.groupKey && !input.silent ? input.groupKey : null;
    // Le verrou du regroupement ne vaut que dans une transaction : appelée sur la base, `notify` ouvre la sienne.
    if (grouped && ex === db) {
      return withTx(async (tx, after) => {
        after(flushStaleInboxes);
        return notificationsService.notify(tx, userId, type, input);
      });
    }
    if (grouped) {
      // Deux occurrences simultanées de la même clé ne créent pas deux lignes (lecture puis écriture sérialisées).
      await ex.execute(sql`select pg_advisory_xact_lock(hashtext(${`notif-group:${userId}:${grouped}`}))`);
      // `created_at` est écrit par la base : la fenêtre de 24 h se lit à l'horloge de la base (comme « … te suit »).
      const [open] = await ex
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, userId),
            eq(notifications.groupKey, grouped),
            isNull(notifications.readAt),
            sql`${notifications.createdAt} > now() - interval '24 hours'`,
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(1)
        .for("update");
      if (open) {
        const previous = open.data as GroupedData;
        const known = previous._actorIds ?? [];
        // La même personne déjà citée remonte en tête sans compter deux fois ; sans personne, une occurrence de plus.
        const ids = input.actor
          ? [input.actor.userId, ...known.filter((id) => id !== input.actor?.userId)].slice(0, MAX_GROUPED_ACTORS)
          : known;
        const actors = input.actor
          ? [
              { pseudo: input.actor.pseudo, avatarUrl: input.actor.avatarUrl },
              ...(previous.actors ?? []).filter((a) => a.pseudo !== input.actor?.pseudo),
            ].slice(0, ACTIVITY_MAX_ACTORS)
          : (previous.actors ?? []);
        const [merged] = await ex
          .update(notifications)
          .set({
            title: input.title,
            body: input.body,
            data: {
              ...open.data,
              ...input.data,
              ...(input.link ? { link: input.link.path, linkLabel: input.link.label } : {}),
              ...(input.actor ? { _text: groupText(input, input.actor.pseudo) } : {}),
              _actorIds: ids,
              actors,
              count: input.actor ? Math.max(ids.length, 1) : (previous.count ?? 1) + 1,
            },
            // Déjà livrée : elle repasse en tête des « non vus » de la cloche ; pas encore livrée : l'échéance se recalcule.
            deliverAfter: due,
            ...(open.deliveredAt ? { deliveredAt: at } : {}),
          })
          .where(eq(notifications.id, open.id))
          .returning();
        if (!merged) throw new Error("Notification non mise à jour");
        // Déjà livrée : pas de nouvelle livraison (donc pas de nouveau push, règle des émetteurs) ; la cloche et la liste
        // ouvertes sont prévenues après la validation pour se recharger.
        if (open.deliveredAt) staleInboxes.add(userId);
        return merged;
      }
    }
    const [row] = await ex
      .insert(notifications)
      .values({
        userId,
        type,
        family: notificationTypes[type],
        title: input.title,
        body: input.body,
        data: {
          ...input.data,
          ...(input.link ? { link: input.link.path, linkLabel: input.link.label } : {}),
          ...(input.email ? { _email: input.email } : {}),
          ...(grouped && input.actor
            ? {
                _text: groupText(input, input.actor.pseudo),
                _actorIds: [input.actor.userId],
                actors: [{ pseudo: input.actor.pseudo, avatarUrl: input.actor.avatarUrl }],
                count: 1,
              }
            : {}),
        },
        inJournal: input.silent ? false : (input.inJournal ?? true),
        eventId: input.eventId ?? null,
        groupKey: grouped,
        deliverAfter: due,
        // Trace silencieuse : déjà « livrée » et lue, elle n'est jamais reprise par `deliverDue`.
        ...(input.silent ? { deliveredAt: at, readAt: at } : {}),
      })
      .returning();
    if (!row) throw new Error("Notification non enregistrée");
    return row;
  },

  /**
   * La même notification pour plusieurs personnes, en une requête par tranche de 1 000 (lot 20 : annonces et consignes
   * à des centaines d'inscrits sans boucle de requêtes dans la transaction de l'appelant).
   */
  async notifyMany(
    ex: Executor,
    userIds: readonly string[],
    type: NotificationType,
    input: NotifyInput,
  ): Promise<void> {
    if (!userIds.length) return;
    const at = now();
    const immediate =
      type === "staff_alert" || notificationTypes[type] === "account" || journalOnlyNotificationTypes.includes(type);
    const base = {
      type,
      family: notificationTypes[type],
      title: input.title,
      body: input.body,
      data: {
        ...input.data,
        ...(input.link ? { link: input.link.path, linkLabel: input.link.label } : {}),
        ...(input.email ? { _email: input.email } : {}),
      },
      inJournal: input.inJournal ?? true,
      eventId: input.eventId ?? null,
      groupKey: input.groupKey ?? null,
      deliverAfter:
        immediate || !env.NOTIFY_QUIET_HOURS
          ? at
          : deliverAfter(at, input.eventStartsAt ?? null, undefined, input.urgent ?? r7QuietOverride(type)),
    };
    const unique = [...new Set(userIds)];
    for (let i = 0; i < unique.length; i += 1000) {
      await ex.insert(notifications).values(unique.slice(i, i + 1000).map((userId) => ({ ...base, userId })));
    }
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
        const guard = deliveryGuards.get(n.type);
        const verdict = guard ? await guard(n) : true;
        if (verdict === false) {
          await db.delete(notifications).where(eq(notifications.id, n.id));
          continue;
        }
        await deliverOne(verdict === true ? n : verdict);
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
    flushStaleInboxes();
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
          eq(notifications.inJournal, true),
          // Les notifications différées (heures calmes) n'apparaissent qu'une fois livrées.
          isNotNull(notifications.deliveredAt),
          // Fenêtre du Journal (lot 17) : 7 jours en arrière, sauf les éléments non lus.
          or(isNull(notifications.readAt), gte(notifications.createdAt, journalWindowStart(now()))),
          // Lot R7c1, tour 2 : une ligne regroupée dont toutes les personnes sont parties (compte supprimé, suspendu ou banni)
          // ne s'affiche pas.
          citedPeopleRemain(now(), true),
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
    // Personnes d'une ligne regroupée relues à l'instant : pseudos, avatars, total et textes sans les comptes partis.
    const views = await citedViews(
      rows.filter((n) => Array.isArray((n.data as { _actorIds?: unknown })._actorIds)),
      db,
    );
    return toPage(rows, limit, (n) => {
      const view = views.get(n.id);
      return {
        id: n.id,
        type: n.type,
        family: n.family,
        title: view?.title ?? n.title,
        body: view?.body ?? n.body,
        data: view ? { ...stripInternal(n.data), actors: view.actors, count: view.count } : stripInternal(n.data),
        eventId: n.eventId,
        createdAt: n.createdAt.toISOString(),
        readAt: n.readAt?.toISOString() ?? null,
      };
    });
  },

  /** Pastille de la cloche : éléments non lus du Journal (livrés, hors push seul). */
  async unreadCount(userId: string, ex: Executor = db): Promise<number> {
    const [row] = await ex
      .select({ n: count() })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, userId),
          eq(notifications.inJournal, true),
          isNotNull(notifications.deliveredAt),
          isNull(notifications.readAt),
          citedPeopleRemain(now(), true),
        ),
      );
    return row?.n ?? 0;
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
  const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, n.userId) });
  const banned = Boolean(profile?.bannedAt);
  // Lot M6, tour 2 : le Journal garde toujours la notification, mais le bandeau en direct ne l'annonce que si elle est
  // livrée (`delivered`) : pas pour un type ou une famille coupés, un compte supprimé ou banni, une actualité du Journal.
  const delivered =
    !journalOnlyNotificationTypes.includes(n.type) &&
    !profile?.deletedAt &&
    !(banned && n.family !== "account") &&
    shouldDeliver(profile?.notificationPrefs, profile?.mutedTypes, n.type);
  realtime.publish(`user:${n.userId}`, "notification", {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    data: stripInternal(n.data),
    delivered,
  });
  // Actualité du Journal : jamais de push ni d'e-mail (lot 17).
  if (journalOnlyNotificationTypes.includes(n.type)) return;
  // Compte supprimé : plus rien n'est livré.
  if (profile?.deletedAt) return;
  // Compte banni (lot 32, relecture) : seulement la famille « Sécurité du compte », par e-mail (appareils révoqués).
  if (banned && n.family !== "account") return;
  // Chaque famille et chaque type peuvent être coupés, sauf `staff` et `account` ; la notification reste au Journal.
  if (!shouldDeliver(profile?.notificationPrefs, profile?.mutedTypes, n.type)) return;

  // Lot M6, tour 4 : seulement les appareils dont la session d'inscription vit encore (`push.tokensOf`).
  const tokens = banned ? [] : await push.tokensOf(n.userId);
  let pushed = 0;
  if (tokens.length) {
    // Lot M6, tour 2 : l'identifiant et le type voyagent avec le push, pour que l'appli ouverte l'annonce dans son bandeau
    // avec la même clé que le temps réel (`notification-<id>`, jamais deux fois).
    // Tour 3 : `recipient` = identifiant opaque du compte ; l'appli n'annonce rien si ce n'est pas le compte ouvert.
    const data = {
      ...stripInternal(n.data),
      notificationId: n.id,
      notificationType: n.type,
      recipient: pushRecipientId(n.userId),
    };
    // Compte suspendu (lot 32, relecture) : pas d'aperçu de message sur l'écran verrouillé, il lit dans sa Boîte.
    const suspended = Boolean(profile?.suspendedUntil && profile.suspendedUntil > now());
    const body = suspended && n.type === "message_received" ? "Nouveau message" : n.body;
    pushed = await push.send(tokens.map((to) => ({ to, title: n.title, body, data })));
    if (pushed) await db.update(notifications).set({ pushSentAt: now() }).where(eq(notifications.id, n.id));
  }
  // Push seulement (message reçu, lot 18) : pas d'e-mail de repli sans appareil.
  if (pushOnlyNotificationTypes.includes(n.type)) return;
  if (tokens.length === 0 || emailAlwaysTypes.includes(n.type as NotificationType)) {
    const account = await db.query.user.findFirst({ where: eq(user.id, n.userId), columns: { email: true } });
    if (!account) return;
    const data = n.data as { link?: string; linkLabel?: string; _email?: MailContent };
    const content =
      data._email ??
      renderMail(
        n.title,
        n.body.split("\n"),
        data.link ? { label: data.linkLabel ?? "Voir sur Orasso", url: `${env.PUBLIC_URL}${data.link}` } : undefined,
      );
    await mail.send(n.type, account.email, content, { notificationId: n.id });
    await db.update(notifications).set({ emailSentAt: now() }).where(eq(notifications.id, n.id));
  }
}
