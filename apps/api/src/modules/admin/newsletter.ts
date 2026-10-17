// Newsletter Orasso gérée dans l'administration (lot 33, docs/01 « newsletter gérée dans l'admin Orasso »).
// Destinataires : `newsletter_opt_in`, adresse confirmée, compte ni supprimé ni banni, relus au moment de l'envoi. Envoi
// par lots (tâche `newsletter.send`, chaque minute) : chaque destinataire est réservé une seule fois
// (`newsletter_deliveries`), donc un second déclenchement ne renvoie jamais à une personne servie. Budget : la newsletter
// prend au plus la moitié du budget non réservé du jour et passe après les e-mails des événements ; plafond atteint →
// plus aucun passage avant minuit (Paris). Échecs du service d'e-mail : le destinataire est réessayé (3 fois au plus) ;
// 20 échecs de suite mettent l'envoi en pause (« Envoi interrompu »). Domaines réservés : jamais envoyés à Brevo.
import {
  markdownToHtml,
  markdownToText,
  NEWSLETTER_BATCH_SIZE,
  NEWSLETTER_FAILURE_PAUSE,
  NEWSLETTER_MAX_ATTEMPTS,
  NEWSLETTER_RETRY_MS,
  type NewsletterView,
  newsletterAllowance,
  newsletterTexts,
  unsubscribeTexts,
} from "@orasso/shared";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { emailOutbox, newsletterDeliveries, newsletters, profiles, user } from "../../db/schema";
import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, notFound, validation } from "../../lib/errors";
import { MAIL_PROTECTED_RESERVE, type MailContent, mail, startOfBusinessDay } from "../../lib/mail";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { unsubscribeOneClickUrl, unsubscribeUrl, verifyUnsubscribeToken } from "../../lib/unsubscribe";
import { audit } from "./audit";

type Row = typeof newsletters.$inferSelect;

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/**
 * E-mail de la newsletter : Markdown réduit (échappé), pied obligatoire avec le lien de désinscription (page du site),
 * en-têtes de désinscription en un clic (POST sur l'API, sans session).
 */
export function newsletterMail(
  subject: string,
  bodyMd: string,
  links: { page: string; oneClick: string },
): MailContent {
  const html = [
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${escapeHtml(subject)}</title>`,
    `<body style="font-family:Archivo,Arial,sans-serif;color:#17191C">`,
    markdownToHtml(bodyMd),
    `<hr><p style="color:#6B6F76;font-size:12px">${escapeHtml(newsletterTexts.footer)} `,
    `<a href="${escapeHtml(links.page)}">${escapeHtml(newsletterTexts.unsubscribeLink)}</a></p>`,
    `<p style="color:#6B6F76;font-size:12px">Orasso</p></body></html>`,
  ].join("\n");
  const text = [
    markdownToText(bodyMd),
    "",
    "—",
    newsletterTexts.footer,
    `${newsletterTexts.unsubscribeLink} : ${links.page}`,
  ].join("\n");
  return {
    subject,
    html,
    text,
    from: env.NEWSLETTER_FROM,
    headers: { "List-Unsubscribe": `<${links.oneClick}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

const linksFor = (userId: string) => ({ page: unsubscribeUrl(userId), oneClick: unsubscribeOneClickUrl(userId) });

/** Comptes qui peuvent recevoir la newsletter. */
const eligible = and(
  eq(profiles.newsletterOptIn, true),
  eq(user.emailVerified, true),
  isNull(profiles.deletedAt),
  isNull(profiles.bannedAt),
);

/** Même condition, en SQL brut sur `p` (profils) et `u` (comptes). */
const ELIGIBLE_SQL = sql`p.newsletter_opt_in and u.email_verified and p.deleted_at is null and p.banned_at is null`;

/** Minuit suivant, heure de Paris. */
function nextBusinessDay(at: Date): Date {
  return startOfBusinessDay(new Date(startOfBusinessDay(at).getTime() + 26 * 3_600_000));
}

async function counts(id: string) {
  const [r] = await db
    .select({
      delivered: sql<number>`count(*) filter (where ${newsletterDeliveries.sentAt} is not null)::int`,
      failed: sql<number>`count(*) filter (where ${newsletterDeliveries.sentAt} is null and ${newsletterDeliveries.failedAt} is not null)::int`,
    })
    .from(newsletterDeliveries)
    .where(eq(newsletterDeliveries.newsletterId, id));
  return { delivered: r?.delivered ?? 0, failed: r?.failed ?? 0 };
}

async function view(r: Row): Promise<NewsletterView> {
  const c = await counts(r.id);
  return {
    id: r.id,
    subject: r.subject,
    bodyMd: r.bodyMd,
    status: r.status,
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    recipientsCount: r.recipientsCount,
    delivered: c.delivered,
    failed: c.failed,
    consecutiveFailures: r.consecutiveFailures,
    pauseReason: r.pauseReason,
    resumeAfter: r.resumeAfter && r.resumeAfter > now() ? r.resumeAfter.toISOString() : null,
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

async function byId(id: string): Promise<Row> {
  const [r] = await db.select().from(newsletters).where(eq(newsletters.id, id));
  if (!r) throw notFound("Newsletter introuvable");
  return r;
}

async function audience(): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(profiles)
    .innerJoin(user, eq(user.id, profiles.userId))
    .where(eligible);
  return r?.n ?? 0;
}

export const newsletterService = {
  /**
   * Comptage du budget : seulement en transport `brevo` (le journal n'a pas de limite, comme `mail.send`). Modifiable
   * par les tests pour exercer le plafond sans rien envoyer.
   */
  budgetMode: env.MAIL_TRANSPORT as "journal" | "brevo",

  /** E-mails de newsletter encore permis aujourd'hui (`Infinity` hors Brevo). */
  async allowance(): Promise<number> {
    if (this.budgetMode !== "brevo") return Number.POSITIVE_INFINITY;
    const since = startOfBusinessDay(now());
    const [r] = await db
      .select({
        sent: sql<number>`count(*)::int`,
        newsletter: sql<number>`count(*) filter (where ${emailOutbox.template} = 'newsletter')::int`,
      })
      .from(emailOutbox)
      .where(
        and(
          eq(emailOutbox.transport, "brevo"),
          inArray(emailOutbox.status, ["queued", "sent"]),
          gte(emailOutbox.createdAt, since),
        ),
      );
    return newsletterAllowance({
      budget: env.MAIL_DAILY_BUDGET,
      reserve: MAIL_PROTECTED_RESERVE,
      sentToday: r?.sent ?? 0,
      newsletterToday: r?.newsletter ?? 0,
    });
  },

  async list(v: Viewer): Promise<NewsletterView[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db.select().from(newsletters).orderBy(desc(newsletters.createdAt)).limit(100);
    return Promise.all(rows.map(view));
  },

  async get(v: Viewer, id: string): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    return view(await byId(id));
  },

  /** Destinataires possibles en ce moment (affiché avant de planifier ou d'envoyer). */
  async audience(v: Viewer): Promise<{ recipients: number }> {
    await requirePlatformRole(v, "super_admin");
    return { recipients: await audience() };
  },

  async create(v: Viewer, input: { subject: string; bodyMd: string }): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db
      .insert(newsletters)
      .values({ ...input, createdBy: v.user.id, createdAt: now(), updatedAt: now() })
      .returning();
    if (!row) throw new Error("Newsletter non créée");
    await audit(db, v, {
      action: "newsletter.create",
      targetType: "newsletter",
      targetId: row.id,
      reason: row.subject,
    });
    return view(row);
  },

  /** Modifiable tant qu'elle n'est pas partie (brouillon ou planifiée). */
  async update(v: Viewer, id: string, input: { subject: string; bodyMd: string }): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db
      .update(newsletters)
      .set({ ...input, updatedAt: now() })
      .where(and(eq(newsletters.id, id), inArray(newsletters.status, ["draft", "scheduled"])))
      .returning();
    if (!row) throw conflict("conflict", "Cette newsletter est déjà partie : elle ne se modifie plus.");
    await audit(db, v, { action: "newsletter.update", targetType: "newsletter", targetId: id, reason: row.subject });
    return view(row);
  },

  /** Seul un brouillon se supprime. */
  async remove(v: Viewer, id: string) {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db
      .delete(newsletters)
      .where(and(eq(newsletters.id, id), eq(newsletters.status, "draft")))
      .returning({ id: newsletters.id, subject: newsletters.subject });
    if (!row) throw conflict("conflict", "Seul un brouillon se supprime.");
    await audit(db, v, { action: "newsletter.delete", targetType: "newsletter", targetId: id, reason: row.subject });
  },

  /** `POST /admin/newsletters/:id/test` : un exemplaire à sa propre adresse (objet préfixé « [Test] »). */
  async test(v: Viewer, id: string) {
    await requirePlatformRole(v, "super_admin");
    const r = await byId(id);
    const content = newsletterMail(`${newsletterTexts.testPrefix}${r.subject}`, r.bodyMd, linksFor(v.user.id));
    const outcome = await mail.send("newsletter_test", v.user.email, content, { newsletterId: id });
    await audit(db, v, { action: "newsletter.test", targetType: "newsletter", targetId: id, reason: outcome });
    return { outcome };
  },

  /** `POST /admin/newsletters/:id/schedule {at}` : date future obligatoire (« Envoyer maintenant » est distinct). */
  async schedule(v: Viewer, id: string, at: Date): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    if (at.getTime() <= now().getTime() + 60_000) {
      throw validation("Choisis une date à venir, ou utilise « Envoyer maintenant ».", {
        fields: { at: "Date passée" },
      });
    }
    const [row] = await db
      .update(newsletters)
      .set({ status: "scheduled", scheduledAt: at, pauseReason: null, updatedAt: now() })
      .where(and(eq(newsletters.id, id), inArray(newsletters.status, ["draft", "scheduled"])))
      .returning();
    if (!row) throw conflict("conflict", "Cette newsletter est déjà partie.");
    await audit(db, v, {
      action: "newsletter.schedule",
      targetType: "newsletter",
      targetId: id,
      reason: at.toISOString(),
    });
    return view(row);
  },

  /**
   * `POST /admin/newsletters/:id/send-now {confirmRecipients}` : envoi au prochain passage, confirmé avec le nombre de
   * destinataires affiché. Si ce nombre a changé depuis, 409 avec le nombre actuel (nouvelle confirmation).
   */
  async sendNow(v: Viewer, id: string, confirmRecipients: number): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    const recipients = await audience();
    if (recipients !== confirmRecipients) {
      throw conflict("conflict", `Le nombre de destinataires a changé : ${recipients}. Confirme de nouveau.`, {
        recipients,
      });
    }
    const [row] = await db
      .update(newsletters)
      .set({ status: "sending", scheduledAt: now(), pauseReason: null, updatedAt: now() })
      .where(and(eq(newsletters.id, id), inArray(newsletters.status, ["draft", "scheduled"])))
      .returning();
    if (!row) throw conflict("conflict", "Cette newsletter est déjà partie.");
    await audit(db, v, {
      action: "newsletter.send_now",
      targetType: "newsletter",
      targetId: id,
      reason: `${recipients} destinataires`,
    });
    return view(row);
  },

  /** Retour au brouillon d'une newsletter planifiée (avant le début de l'envoi). */
  async unschedule(v: Viewer, id: string): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db
      .update(newsletters)
      .set({ status: "draft", scheduledAt: null, updatedAt: now() })
      .where(and(eq(newsletters.id, id), eq(newsletters.status, "scheduled")))
      .returning();
    if (!row) throw conflict("conflict", "L'envoi a déjà commencé.");
    await audit(db, v, { action: "newsletter.unschedule", targetType: "newsletter", targetId: id });
    return view(row);
  },

  /** `POST /admin/newsletters/:id/pause` : planifiée ou en cours d'envoi → en pause (aucun lot ne part plus). */
  async pause(v: Viewer, id: string): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    const [row] = await db
      .update(newsletters)
      .set({ status: "paused", pauseReason: "admin", updatedAt: now() })
      .where(and(eq(newsletters.id, id), inArray(newsletters.status, ["scheduled", "sending"])))
      .returning();
    if (!row) throw conflict("conflict", "Seule une newsletter planifiée ou en cours d'envoi se met en pause.");
    await audit(db, v, { action: "newsletter.pause", targetType: "newsletter", targetId: id });
    return view(row);
  },

  /** `POST /admin/newsletters/:id/resume` : reprise (planifiée si sa date est à venir, sinon envoi), échecs remis à zéro. */
  async resume(v: Viewer, id: string): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    const current = await byId(id);
    const status = current.scheduledAt && current.scheduledAt > now() ? "scheduled" : "sending";
    const [row] = await db
      .update(newsletters)
      .set({ status, pauseReason: null, consecutiveFailures: 0, updatedAt: now() })
      .where(and(eq(newsletters.id, id), eq(newsletters.status, "paused")))
      .returning();
    if (!row) throw conflict("conflict", "Cette newsletter n'est pas en pause.");
    await audit(db, v, {
      action: "newsletter.resume",
      targetType: "newsletter",
      targetId: id,
      reason: current.pauseReason ?? undefined,
    });
    return view(row);
  },

  /** Tâche `newsletter.send` (chaque minute) : un lot pour chaque newsletter due, hors plafond du jour atteint. */
  async runDue(): Promise<number> {
    const t = now();
    const due = await db
      .select({ id: newsletters.id })
      .from(newsletters)
      .where(
        and(
          or(
            eq(newsletters.status, "sending"),
            and(eq(newsletters.status, "scheduled"), lte(newsletters.scheduledAt, t)),
          ),
          or(isNull(newsletters.resumeAfter), lte(newsletters.resumeAfter, t)),
        ),
      );
    let sent = 0;
    for (const n of due) sent += await this.runBatch(n.id);
    return sent;
  },

  /**
   * Un lot. Budget vérifié AVANT de réserver (plafond atteint : `resume_after` = minuit, rien n'est réservé ni écrit
   * dans la file des e-mails). Réservation et lecture de l'adresse et du consentement dans la même requête ; envoi un
   * par un ; succès → `sent_at` ; échec → `failed_at`, essai compté, réessai plus tard ; `skipped_quota` (budget pris
   * entre-temps par d'autres e-mails) → réservations rendues, reprise après minuit. Plus personne → `sent`.
   */
  async runBatch(id: string): Promise<number> {
    const t = now();
    const allowance = await this.allowance();
    const claimed = await withTx(async (tx) => {
      const [n] = await tx.select().from(newsletters).where(eq(newsletters.id, id)).for("update");
      if (!n) return null;
      if (n.resumeAfter && n.resumeAfter > t) return null;
      if (n.status === "scheduled" && n.scheduledAt && n.scheduledAt <= t) {
        await tx.update(newsletters).set({ status: "sending", updatedAt: t }).where(eq(newsletters.id, id));
      } else if (n.status !== "sending") {
        return null;
      }
      const size = Math.min(NEWSLETTER_BATCH_SIZE, allowance);
      if (size <= 0) {
        await tx
          .update(newsletters)
          .set({ resumeAfter: nextBusinessDay(t), updatedAt: t })
          .where(eq(newsletters.id, id));
        return { n, people: [] as { userId: string; email: string }[], paused: true };
      }
      // Désinscrits, supprimés ou bannis depuis leur réservation : oubliés (rien ne leur part).
      await tx.execute(sql`
        delete from newsletter_deliveries d using profiles p, "user" u
        where d.newsletter_id = ${id} and d.sent_at is null and p.user_id = d.user_id and u.id = d.user_id
          and not (${ELIGIBLE_SQL})`);
      const retryBefore = new Date(t.getTime() - NEWSLETTER_RETRY_MS).toISOString();
      // Reprises : réservations interrompues, ou échecs à réessayer ; consentement et adresse relus dans la requête.
      const again = await tx.execute<{ user_id: string; email: string }>(sql`
        update newsletter_deliveries d set created_at = ${t.toISOString()}, updated_at = ${t.toISOString()}
        from profiles p, "user" u
        where d.newsletter_id = ${id} and d.sent_at is null and d.attempts < ${NEWSLETTER_MAX_ATTEMPTS}
          and coalesce(d.failed_at, d.created_at) < ${retryBefore}
          and p.user_id = d.user_id and u.id = d.user_id and ${ELIGIBLE_SQL}
          and d.user_id in (select user_id from newsletter_deliveries x where x.newsletter_id = ${id}
            and x.sent_at is null and x.attempts < ${NEWSLETTER_MAX_ATTEMPTS}
            and coalesce(x.failed_at, x.created_at) < ${retryBefore} order by x.user_id limit ${size})
        returning d.user_id, u.email`);
      const room = size - again.rows.length;
      const fresh = room
        ? await tx.execute<{ user_id: string; email: string }>(sql`
            with ins as (
              insert into newsletter_deliveries (newsletter_id, user_id, created_at, updated_at)
              select ${id}, p.user_id, ${t.toISOString()}, ${t.toISOString()}
              from profiles p join "user" u on u.id = p.user_id
              where ${ELIGIBLE_SQL}
                and not exists (select 1 from newsletter_deliveries d where d.newsletter_id = ${id} and d.user_id = p.user_id)
              order by p.user_id
              limit ${room}
              on conflict do nothing
              returning user_id
            )
            select ins.user_id, u.email from ins join "user" u on u.id = ins.user_id`)
        : { rows: [] };
      const people = [...again.rows, ...fresh.rows].map((r) => ({ userId: r.user_id, email: r.email }));
      if (!people.length) {
        const [pending] = await tx
          .select({ n: count() })
          .from(newsletterDeliveries)
          .where(
            and(
              eq(newsletterDeliveries.newsletterId, id),
              isNull(newsletterDeliveries.sentAt),
              lt(newsletterDeliveries.attempts, NEWSLETTER_MAX_ATTEMPTS),
            ),
          );
        if ((pending?.n ?? 0) === 0) {
          const [done] = await tx
            .select({ n: count() })
            .from(newsletterDeliveries)
            .where(and(eq(newsletterDeliveries.newsletterId, id), isNotNull(newsletterDeliveries.sentAt)));
          await tx
            .update(newsletters)
            .set({ status: "sent", sentAt: t, recipientsCount: done?.n ?? 0, resumeAfter: null, updatedAt: t })
            .where(eq(newsletters.id, id));
        }
      }
      return { n, people, paused: false };
    });
    if (!claimed?.people.length) return 0;
    let sent = 0;
    let streak = claimed.n.consecutiveFailures;
    for (const [i, person] of claimed.people.entries()) {
      const outcome = await mail.send(
        "newsletter",
        person.email,
        newsletterMail(claimed.n.subject, claimed.n.bodyMd, linksFor(person.userId)),
        { newsletterId: id, userId: person.userId },
      );
      const key = and(eq(newsletterDeliveries.newsletterId, id), eq(newsletterDeliveries.userId, person.userId));
      if (outcome === "skipped_quota") {
        // Budget du jour pris par d'autres e-mails : on rend ce destinataire et les suivants, reprise après minuit.
        const rest = claimed.people.slice(i).map((p) => p.userId);
        await db
          .delete(newsletterDeliveries)
          .where(
            and(
              eq(newsletterDeliveries.newsletterId, id),
              inArray(newsletterDeliveries.userId, rest),
              isNull(newsletterDeliveries.sentAt),
              isNull(newsletterDeliveries.failedAt),
            ),
          );
        await db
          .update(newsletters)
          .set({ resumeAfter: nextBusinessDay(now()) })
          .where(eq(newsletters.id, id));
        break;
      }
      if (outcome === "sent") {
        sent++;
        streak = 0;
        await db.update(newsletterDeliveries).set({ sentAt: now(), updatedAt: now() }).where(key);
        continue;
      }
      // Échec (Brevo indisponible, clé refusée…) : jamais compté comme servi ; réessayé plus tard.
      streak++;
      await db
        .update(newsletterDeliveries)
        .set({ failedAt: now(), attempts: sql`${newsletterDeliveries.attempts} + 1`, updatedAt: now() })
        .where(key);
      if (streak >= NEWSLETTER_FAILURE_PAUSE) break;
    }
    const pause = streak >= NEWSLETTER_FAILURE_PAUSE;
    await db
      .update(newsletters)
      .set({
        consecutiveFailures: streak,
        ...(pause ? { status: "paused" as const, pauseReason: "errors" as const } : {}),
        recipientsCount: (await counts(id)).delivered,
        updatedAt: now(),
      })
      .where(and(eq(newsletters.id, id), eq(newsletters.status, "sending")));
    return sent;
  },

  /** `GET /desinscription/:token` (public) : le lien est-il valable ? Ne change rien (les aperçus de liens passent). */
  async checkUnsubscribe(token: string): Promise<{ valid: boolean; subscribed: boolean }> {
    const userId = verifyUnsubscribeToken(token);
    if (!userId) return { valid: false, subscribed: false };
    const p = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
      columns: { newsletterOptIn: true },
    });
    return p ? { valid: true, subscribed: p.newsletterOptIn } : { valid: false, subscribed: false };
  },

  /** `POST /desinscription/:token` (public, sans session) : désinscription idempotente. */
  async unsubscribe(token: string): Promise<{ unsubscribed: true; message: string }> {
    const userId = verifyUnsubscribeToken(token);
    if (!userId) throw notFound(unsubscribeTexts.invalid);
    const [p] = await db
      .update(profiles)
      .set({ newsletterOptIn: false })
      .where(eq(profiles.userId, userId))
      .returning({ id: profiles.userId });
    if (!p) throw notFound(unsubscribeTexts.invalid);
    return { unsubscribed: true, message: unsubscribeTexts.done };
  },
};
