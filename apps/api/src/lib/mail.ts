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
import { type MailFooter, paragraphsHtml, renderShell, renderShellText } from "./mail-template";
import { dataDir } from "./storage";
import type { Executor } from "./tx";

/**
 * `from` : expéditeur propre à cet e-mail (newsletter, lot 33), sinon `MAIL_FROM`. `headers` : en-têtes ajoutés par
 * Brevo (ex. `List-Unsubscribe` de la newsletter).
 */
export type MailContent = {
  subject: string;
  html: string;
  text: string;
  from?: string;
  headers?: Record<string, string>;
};

/**
 * Gabarit commun à tous les e-mails (lot 56, `mail-template.ts`) : l'affiche de nuit, le titre, le corps, le bouton
 * principal (`link`, un lien de `PUBLIC_URL`), le code de secours (`options.code`) et le pied.
 */
export function renderMail(
  title: string,
  paragraphs: string[],
  link?: { label: string; url: string },
  options: { code?: string; footer?: MailFooter } = {},
): MailContent {
  const html = renderShell({
    title,
    bodyHtml: paragraphsHtml(paragraphs),
    button: link,
    code: options.code,
    footer: options.footer,
  });
  const text = renderShellText({ title, paragraphs, button: link, code: options.code, footer: options.footer });
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
    sender: parseMailbox(content.from ?? config.from),
    to: [{ email: to }],
    ...(config.replyTo ? { replyTo: parseMailbox(config.replyTo) } : {}),
    subject: content.subject,
    htmlContent: content.html,
    textContent: content.text,
    ...(content.headers ? { headers: content.headers } : {}),
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

export type MailOutcome = "sent" | "failed" | "skipped_quota";

/** Une ligne de la boîte d'envoi, écrite et pas encore livrée (R8p, tour 7 : l'écriture et la livraison se séparent). */
export type MailQueued = { id: string; status: "queued" | "skipped_quota"; transport: "journal" | "brevo" };

export const mail = {
  /**
   * Écrit la ligne de la boîte d'envoi (budget du jour compté sous verrou) **sans livrer** : à appeler dans la transaction de
   * l'appelant (`tx`), qui valide d'abord, puis livre (`deliver`) hors transaction : aucune connexion n'attend le transport.
   */
  async enqueue(
    template: string,
    to: string,
    content: MailContent,
    payload: Record<string, unknown> = {},
    configured: "journal" | "brevo" = env.MAIL_TRANSPORT,
    tx?: Executor,
  ): Promise<MailQueued | undefined> {
    const transport = transportFor(to, configured);
    const run = async (x: Executor) => {
      let skipped = false;
      if (transport === "brevo") {
        await x.execute(sql`select pg_advisory_xact_lock(hashtext('mail-daily-budget'))`);
        const [sent] = await x
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
      const [inserted] = await x
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
      return inserted ? { id: inserted.id, status: inserted.status as MailQueued["status"], transport } : undefined;
    };
    return tx ? run(tx) : db.transaction(run);
  },

  /** Livre une ligne écrite par `enqueue` (hors transaction) et note le résultat dans la boîte d'envoi. */
  async deliver(row: MailQueued, to: string, content: MailContent): Promise<MailOutcome> {
    if (row.status === "skipped_quota") return "skipped_quota";
    try {
      if (row.transport === "brevo") await deliverBrevo(to, content);
      else await deliverJournal(row.id, to, content);
      await db.update(emailOutbox).set({ status: "sent", sentAt: now() }).where(eq(emailOutbox.id, row.id));
      return "sent";
    } catch (error) {
      await db
        .update(emailOutbox)
        .set({ status: "failed", error: String(error) })
        .where(eq(emailOutbox.id, row.id));
      return "failed";
    }
  },

  /**
   * `configured` : transport de la configuration ; paramètre pour les tests seulement. Renvoie ce qui s'est passé
   * (lot 33 : la newsletter s'arrête au premier `skipped_quota` et reprend le lendemain).
   */
  async send(
    template: string,
    to: string,
    content: MailContent,
    payload: Record<string, unknown> = {},
    configured: "journal" | "brevo" = env.MAIL_TRANSPORT,
  ): Promise<MailOutcome> {
    const row = await mail.enqueue(template, to, content, payload, configured);
    if (!row) return "failed";
    return mail.deliver(row, to, content);
  },
};
