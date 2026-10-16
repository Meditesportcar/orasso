// Envoi d'e-mails : tout passe par `email_outbox` (rejouable, lisible en dev), puis par un transport.
// « journal » (par défaut, H5) : fichier HTML dans DATA_DIR/mail + ligne en console. « brevo » : API Brevo.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";

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
  const name = match[1]?.trim();
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
  });
  if (!res.ok) throw new Error(`Brevo ${res.status} : ${await res.text()}`);
}

export const mail = {
  async send(template: string, to: string, content: MailContent, payload: Record<string, unknown> = {}) {
    const [row] = await db
      .insert(emailOutbox)
      .values({ to, subject: content.subject, template, payload, transport: env.MAIL_TRANSPORT })
      .returning({ id: emailOutbox.id });
    if (!row) return;
    try {
      if (env.MAIL_TRANSPORT === "brevo") await deliverBrevo(to, content);
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
