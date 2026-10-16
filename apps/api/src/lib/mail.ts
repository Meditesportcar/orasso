// Envoi d'e-mails : tout passe par `email_outbox` (rejouable, lisible en dev), puis par un transport.
// « journal » (par défaut, H5) : fichier HTML dans DATA_DIR/mail + ligne en console. « brevo » : API Brevo.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BUSINESS_TIMEZONE, fromWallTime, wallTime } from "@orasso/shared";
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";

import { db } from "../db/client";
import { emailOutbox } from "../db/schema";
import { env } from "../env";
import { now } from "./deps";
import { dataDir } from "./storage";

export type MailContent = { subject: string; html: string; text: string };

const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Gabarit HTML minimal commun à tous les e-mails (le design des e-mails viendra avec le site). */
export function renderMail(title: string, paragraphs: string[], link?: { label: string; url: string }): MailContent {
  const html = [
    `<!doctype html><html lang="fr"><meta charset="utf-8"><title>${escapeHtml(title)}</title>`,
    `<body style="font-family:Archivo,Arial,sans-serif;color:#17191C">`,
    `<h1 style="font-size:20px">${escapeHtml(title)}</h1>`,
    ...paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`),
    link ? `<p><a href="${escapeHtml(link.url)}">${escapeHtml(link.label)}</a></p>` : "",
    `<p style="color:#6B6F76;font-size:12px">Orasso</p></body></html>`,
  ].join("\n");
  const text = [title, "", ...paragraphs, link ? `${link.label} : ${link.url}` : "", "", "Orasso"].join("\n");
  return { subject: title, html, text };
}

async function deliverJournal(id: string, to: string, content: MailContent) {
  if (env.NODE_ENV !== "test") console.log(`[e-mail] ${to} · ${content.subject}`);
  // Copie HTML lisible en dev ; facultative (dossier en lecture seule dans le conteneur du VPS) :
  // le contenu reste de toute façon dans `email_outbox`.
  try {
    const dir = join(dataDir, "mail");
    await mkdir(dir, { recursive: true });
    const stamp = now().toISOString().replaceAll(":", "-");
    await writeFile(join(dir, `${stamp}-${id}.html`), `<!-- À : ${to} -->\n${content.html}`);
  } catch {
    // Rien : l'e-mail est journalisé en console et en base.
  }
}

/** « Nom <adresse> » ou « adresse » → `{ name?, email }` (format attendu par Brevo). */
export function parseMailbox(value: string): { name?: string; email: string } {
  const match = /^(.*)<(.+)>$/.exec(value.trim());
  if (!match) return { email: value.trim() };
  // Les guillemets d'un nom (« "Orasso" <adresse> ») ne font pas partie du nom.
  const name = match[1]
    ?.trim()
    .replace(/^"(.*)"$/, "$1")
    .trim();
  return name ? { name, email: (match[2] ?? "").trim() } : { email: (match[2] ?? "").trim() };
}

/** Corps de la requête envoyée à l'API Brevo (expéditeur du sous-domaine dédié, réponses vers `MAIL_REPLY_TO`). */
export function brevoPayload(
  to: string,
  content: MailContent,
  config = { from: env.MAIL_FROM, replyTo: env.MAIL_REPLY_TO },
) {
  return {
    sender: parseMailbox(config.from),
    to: [{ email: to }],
    ...(config.replyTo ? { replyTo: parseMailbox(config.replyTo) } : {}),
    subject: content.subject,
    htmlContent: content.html,
    textContent: content.text,
  };
}

let brevoFetch: typeof fetch = (...args) => fetch(...args);
/** Tests : remplace l'appel réseau à Brevo. */
export function setBrevoFetch(f: typeof fetch) {
  brevoFetch = f;
}

export async function deliverBrevo(to: string, content: MailContent) {
  const res = await brevoFetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY ?? "", "content-type": "application/json" },
    body: JSON.stringify(brevoPayload(to, content)),
    // Brevo injoignable : l'envoi échoue au bout de 10 s (e-mail marqué « failed » dans la file), sans bloquer l'API.
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Brevo ${res.status} : ${await res.text()}`);
}

/**
 * Adresse qui ne peut pas recevoir d'e-mail (comptes de démonstration du seed, tests) : domaines réservés des
 * RFC 2606 / 6761 (`.local`, `.localhost`, `.test`, `.example`, `.invalid`, `example.com|net|org`). En transport
 * `brevo`, elle n'est jamais envoyée (rebond dur = réputation du compte abîmée) : elle passe par le journal.
 */
export function isReservedAddress(address: string): boolean {
  const domain = address.trim().toLowerCase().split("@").pop() ?? "";
  if (/(^|\.)(local|localhost|test|example|invalid)$/.test(domain)) return true;
  return /(^|\.)example\.(com|net|org)$/.test(domain);
}

/** Transport réellement utilisé pour une adresse. */
export function transportFor(to: string, configured: "journal" | "brevo"): "journal" | "brevo" {
  return configured === "brevo" && isReservedAddress(to) ? "journal" : configured;
}

/** E-mails réservés à la fin du budget du jour : compte et sécurité (jamais bloqués par une annonce de masse). */
export const MAIL_PROTECTED_RESERVE = 50;
const PROTECTED_TEMPLATES = new Set(["password_reset", "email_verification", "account_deleted"]);

export function isProtectedTemplate(template: string): boolean {
  return PROTECTED_TEMPLATES.has(template) || template.startsWith("security_");
}

/**
 * Un e-mail de plus peut-il partir aujourd'hui ? `sentToday` : envois Brevo déjà faits depuis minuit (Paris). Les
 * gabarits de compte et de sécurité vont jusqu'au budget ; les autres s'arrêtent `MAIL_PROTECTED_RESERVE` avant.
 */
export function withinMailBudget(template: string, sentToday: number, budget = env.MAIL_DAILY_BUDGET): boolean {
  const limit = isProtectedTemplate(template) ? budget : Math.max(0, budget - MAIL_PROTECTED_RESERVE);
  return sentToday < limit;
}

/** Minuit du jour, heure de Paris. */
export function startOfBusinessDay(at: Date): Date {
  const w = wallTime(at, BUSINESS_TIMEZONE);
  return fromWallTime({ year: w.year, month: w.month, day: w.day, hour: 0, minute: 0 }, BUSINESS_TIMEZONE);
}

export const mail = {
  /** `configured` : transport de la configuration ; paramètre pour les tests seulement. */
  async send(
    template: string,
    to: string,
    content: MailContent,
    payload: Record<string, unknown> = {},
    configured: "journal" | "brevo" = env.MAIL_TRANSPORT,
  ) {
    const transport = transportFor(to, configured);
    // Budget du jour (Brevo seulement) : compté et réservé sous un verrou, pour que deux envois simultanés ne le
    // dépassent pas. Au-delà, l'e-mail n'est pas envoyé (`skipped_quota`) : la notification reste au Journal.
    const row = await db.transaction(async (tx) => {
      let skipped = false;
      if (transport === "brevo") {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mail-daily-budget'))`);
        const [sent] = await tx
          .select({ n: count() })
          .from(emailOutbox)
          .where(
            and(
              eq(emailOutbox.transport, "brevo"),
              inArray(emailOutbox.status, ["queued", "sent"]),
              gte(emailOutbox.createdAt, startOfBusinessDay(now())),
            ),
          );
        skipped = !withinMailBudget(template, sent?.n ?? 0);
      }
      const [inserted] = await tx
        .insert(emailOutbox)
        .values({
          to,
          subject: content.subject,
          template,
          payload,
          transport,
          status: skipped ? "skipped_quota" : "queued",
          createdAt: now(),
          // Trace lisible de la déviation : adresse réservée, écrite dans le journal au lieu de Brevo.
          error: skipped
            ? `Budget d'e-mails du jour atteint (${env.MAIL_DAILY_BUDGET}) : non envoyé`
            : transport !== configured
              ? "Adresse non routable (domaine réservé) : journal au lieu de Brevo"
              : null,
        })
        .returning({ id: emailOutbox.id, status: emailOutbox.status });
      return inserted;
    });
    if (!row || row.status === "skipped_quota") return;
    try {
      if (transport === "brevo") await deliverBrevo(to, content);
      else await deliverJournal(row.id, to, content);
      await db.update(emailOutbox).set({ status: "sent", sentAt: now() }).where(eq(emailOutbox.id, row.id));
    } catch (error) {
      await db
        .update(emailOutbox)
        .set({ status: "failed", error: String(error) })
        .where(eq(emailOutbox.id, row.id));
    }
  },
};
