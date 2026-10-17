// Newsletter Orasso gérée dans l'administration (lot 33, docs/01 « newsletter gérée dans l'admin Orasso »).
// Destinataires : `newsletter_opt_in`, adresse confirmée, compte ni supprimé ni banni. Envoi par lots de 200 (tâche
// `newsletter.send`, chaque minute) : chaque destinataire est réservé une seule fois (`newsletter_deliveries`), donc un
// second déclenchement ne renvoie jamais. Gabarit `newsletter` : il s'arrête avant la réserve des e-mails de sécurité
// (budget de `mail.send`) et reprend au passage suivant ; les adresses des domaines réservés ne partent jamais à Brevo.
import {
  markdownToHtml,
  markdownToText,
  NEWSLETTER_BATCH_SIZE,
  NEWSLETTER_RETRY_MS,
  type NewsletterView,
  newsletterTexts,
  unsubscribeTexts,
} from "@orasso/shared";
import { and, count, desc, eq, inArray, isNotNull, isNull, lt, lte, or, sql } from "drizzle-orm";

import { db } from "../../db/client";
import { newsletterDeliveries, newsletters, profiles, user } from "../../db/schema";
import { env } from "../../env";
import { requirePlatformRole } from "../../lib/access";
import { now } from "../../lib/deps";
import { conflict, notFound } from "../../lib/errors";
import { type MailContent, mail } from "../../lib/mail";
import type { Viewer } from "../../lib/session";
import { withTx } from "../../lib/tx";
import { unsubscribeUrl, verifyUnsubscribeToken } from "../../lib/unsubscribe";
import { audit } from "./audit";

type Row = typeof newsletters.$inferSelect;

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** E-mail de la newsletter : Markdown réduit (échappé), pied obligatoire avec le lien de désinscription. */
export function newsletterMail(subject: string, bodyMd: string, unsubscribe: string): MailContent {
  const html = [
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${escapeHtml(subject)}</title>`,
    `<body style="font-family:Archivo,Arial,sans-serif;color:#17191C">`,
    markdownToHtml(bodyMd),
    `<hr><p style="color:#6B6F76;font-size:12px">${escapeHtml(newsletterTexts.footer)} `,
    `<a href="${escapeHtml(unsubscribe)}">${escapeHtml(newsletterTexts.unsubscribeLink)}</a></p>`,
    `<p style="color:#6B6F76;font-size:12px">Orasso</p></body></html>`,
  ].join("\n");
  const text = [
    markdownToText(bodyMd),
    "",
    "—",
    newsletterTexts.footer,
    `${newsletterTexts.unsubscribeLink} : ${unsubscribe}`,
  ].join("\n");
  return {
    subject,
    html,
    text,
    from: env.NEWSLETTER_FROM,
    headers: { "List-Unsubscribe": `<${unsubscribe}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
  };
}

/** Comptes qui peuvent recevoir la newsletter. */
const eligible = and(
  eq(profiles.newsletterOptIn, true),
  eq(user.emailVerified, true),
  isNull(profiles.deletedAt),
  isNull(profiles.bannedAt),
);

async function view(r: Row): Promise<NewsletterView> {
  const [d] = await db
    .select({ n: count() })
    .from(newsletterDeliveries)
    .where(and(eq(newsletterDeliveries.newsletterId, r.id), isNotNull(newsletterDeliveries.sentAt)));
  return {
    id: r.id,
    subject: r.subject,
    bodyMd: r.bodyMd,
    status: r.status,
    scheduledAt: r.scheduledAt?.toISOString() ?? null,
    sentAt: r.sentAt?.toISOString() ?? null,
    recipientsCount: r.recipientsCount,
    delivered: d?.n ?? 0,
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

export const newsletterService = {
  async list(v: Viewer): Promise<NewsletterView[]> {
    await requirePlatformRole(v, "super_admin");
    const rows = await db.select().from(newsletters).orderBy(desc(newsletters.createdAt)).limit(100);
    return Promise.all(rows.map(view));
  },

  async get(v: Viewer, id: string): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    return view(await byId(id));
  },

  /** Destinataires possibles en ce moment (affiché avant de planifier). */
  async audience(v: Viewer): Promise<{ recipients: number }> {
    await requirePlatformRole(v, "super_admin");
    const [r] = await db
      .select({ n: count() })
      .from(profiles)
      .innerJoin(user, eq(user.id, profiles.userId))
      .where(eligible);
    return { recipients: r?.n ?? 0 };
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
    const content = newsletterMail(`${newsletterTexts.testPrefix}${r.subject}`, r.bodyMd, unsubscribeUrl(v.user.id));
    const outcome = await mail.send("newsletter_test", v.user.email, content, { newsletterId: id });
    await audit(db, v, { action: "newsletter.test", targetType: "newsletter", targetId: id, reason: outcome });
    return { outcome };
  },

  /** `POST /admin/newsletters/:id/schedule {at}` : date passée = envoi au prochain passage de la tâche. */
  async schedule(v: Viewer, id: string, at: Date): Promise<NewsletterView> {
    await requirePlatformRole(v, "super_admin");
    const when = at < now() ? now() : at;
    const [row] = await db
      .update(newsletters)
      .set({ status: "scheduled", scheduledAt: when, updatedAt: now() })
      .where(and(eq(newsletters.id, id), inArray(newsletters.status, ["draft", "scheduled"])))
      .returning();
    if (!row) throw conflict("conflict", "Cette newsletter est déjà partie.");
    await audit(db, v, {
      action: "newsletter.schedule",
      targetType: "newsletter",
      targetId: id,
      reason: when.toISOString(),
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

  /** Tâche `newsletter.send` (chaque minute) : un lot pour chaque newsletter due ou en cours d'envoi. */
  async runDue(): Promise<number> {
    const due = await db
      .select({ id: newsletters.id })
      .from(newsletters)
      .where(
        or(
          eq(newsletters.status, "sending"),
          and(eq(newsletters.status, "scheduled"), lte(newsletters.scheduledAt, now())),
        ),
      );
    let sent = 0;
    for (const n of due) sent += await this.runBatch(n.id);
    return sent;
  },

  /**
   * Un lot d'au plus 200 destinataires. Réservation (insertion unique) puis envoi un par un ; au premier
   * `skipped_quota` (budget du jour atteint), les réservations non envoyées sont rendues et le lot s'arrête : la suite
   * part au passage suivant. Plus personne à servir → `sent`. Renvoie le nombre d'e-mails partis.
   */
  async runBatch(id: string): Promise<number> {
    const t = now();
    const claimed = await withTx(async (tx) => {
      const [n] = await tx.select().from(newsletters).where(eq(newsletters.id, id)).for("update");
      if (!n) return null;
      if (n.status === "scheduled" && n.scheduledAt && n.scheduledAt <= t) {
        await tx.update(newsletters).set({ status: "sending", updatedAt: t }).where(eq(newsletters.id, id));
      } else if (n.status !== "sending") {
        return null;
      }
      // Réservations d'un passage interrompu (arrêt brutal entre réservation et envoi) : reprises après 10 minutes.
      const stale = await tx
        .update(newsletterDeliveries)
        .set({ createdAt: t })
        .where(
          and(
            eq(newsletterDeliveries.newsletterId, id),
            isNull(newsletterDeliveries.sentAt),
            lt(newsletterDeliveries.createdAt, new Date(t.getTime() - NEWSLETTER_RETRY_MS)),
          ),
        )
        .returning({ userId: newsletterDeliveries.userId });
      const room = Math.max(0, NEWSLETTER_BATCH_SIZE - stale.length);
      const fresh = room
        ? await tx.execute<{ user_id: string }>(sql`
            insert into newsletter_deliveries (newsletter_id, user_id, created_at, updated_at)
            select ${id}, p.user_id, ${t.toISOString()}, ${t.toISOString()}
            from profiles p join "user" u on u.id = p.user_id
            where p.newsletter_opt_in and u.email_verified and p.deleted_at is null and p.banned_at is null
              and not exists (select 1 from newsletter_deliveries d where d.newsletter_id = ${id} and d.user_id = p.user_id)
            order by p.user_id
            limit ${room}
            on conflict do nothing
            returning user_id`)
        : { rows: [] };
      const ids = [...stale.map((s) => s.userId), ...fresh.rows.map((r) => r.user_id)];
      if (!ids.length) {
        const [pending] = await tx
          .select({ n: count() })
          .from(newsletterDeliveries)
          .where(and(eq(newsletterDeliveries.newsletterId, id), isNull(newsletterDeliveries.sentAt)));
        if ((pending?.n ?? 0) === 0) {
          const [done] = await tx
            .select({ n: count() })
            .from(newsletterDeliveries)
            .where(and(eq(newsletterDeliveries.newsletterId, id), isNotNull(newsletterDeliveries.sentAt)));
          await tx
            .update(newsletters)
            .set({ status: "sent", sentAt: t, recipientsCount: done?.n ?? 0, updatedAt: t })
            .where(eq(newsletters.id, id));
        }
      }
      return { n, ids };
    });
    if (!claimed?.ids.length) return 0;
    const people = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .innerJoin(profiles, eq(profiles.userId, user.id))
      .where(and(inArray(user.id, claimed.ids), eligible));
    const reachable = new Map(people.map((p) => [p.id, p.email]));
    let sent = 0;
    for (const [i, userId] of claimed.ids.entries()) {
      const email = reachable.get(userId);
      if (!email) {
        // Désinscrit entre la réservation et l'envoi : rien ne part, la ligne est oubliée.
        await db
          .delete(newsletterDeliveries)
          .where(and(eq(newsletterDeliveries.newsletterId, id), eq(newsletterDeliveries.userId, userId)));
        continue;
      }
      const outcome = await mail.send(
        "newsletter",
        email,
        newsletterMail(claimed.n.subject, claimed.n.bodyMd, unsubscribeUrl(userId)),
        { newsletterId: id, userId },
      );
      if (outcome === "skipped_quota") {
        // Budget du jour atteint (réserve des e-mails de sécurité intacte) : on rend ce destinataire et les suivants.
        await db
          .delete(newsletterDeliveries)
          .where(
            and(
              eq(newsletterDeliveries.newsletterId, id),
              inArray(newsletterDeliveries.userId, claimed.ids.slice(i)),
              isNull(newsletterDeliveries.sentAt),
            ),
          );
        break;
      }
      await db
        .update(newsletterDeliveries)
        .set({ sentAt: now(), updatedAt: now() })
        .where(and(eq(newsletterDeliveries.newsletterId, id), eq(newsletterDeliveries.userId, userId)));
      if (outcome === "sent") sent++;
    }
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
