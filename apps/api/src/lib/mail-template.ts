// Gabarit unique des e-mails (lot 56, prototype `s-email`) : l'affiche de nuit en tête (image du site, texte de repli),
// le titre en Archivo (polices système en repli), un corps court, le bouton principal moutarde (lien `PUBLIC_URL` : App
// Link, il ouvre l'appli si elle est installée, lot 36), le code de secours en grand quand il y en a un, un pied sobre.
// Tout est en tables et en styles en ligne (les clients de messagerie ignorent les feuilles de style). Les couleurs sont
// celles des jetons Béton (`docs/design-system/tokens.json`) : un e-mail n'a pas de variables CSS.
import { mailLabels } from "@orasso/shared";

import { env } from "../env";

const NIGHT = "#0b0c0e";
const GROUND = "#131417";
const PAPER = "#f3ebdd";
const INK = "#131417";
const MUTED = "#5b554b";
const MUSTARD = "#e9b824";
const FONT = "Archivo,'Segoe UI',Helvetica,Arial,sans-serif";
const FONT_NARROW = "'Archivo Narrow',Archivo,'Arial Narrow',Arial,sans-serif";

export const escapeHtml = (s: string) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

/** Adresse de l'image d'en-tête : servie par le site (`apps/web/public/mail/affiche-nuit.jpg`). */
export const mailBannerUrl = () => `${env.PUBLIC_URL}/mail/affiche-nuit.jpg`;

export type MailShell = {
  title: string;
  /** Corps déjà échappé (paragraphes, listes). */
  bodyHtml: string;
  button?: { label: string; url: string };
  /** Code de secours (mot de passe provisoire, code de récupération…), affiché en grand. */
  code?: string;
  /** Pied supplémentaire déjà échappé (désinscription de la newsletter). */
  footerHtml?: string;
};

/** Le bouton moutarde : un lien en forme de bouton, avec un fond de repli pour Outlook. */
function buttonHtml(label: string, url: string): string {
  const href = escapeHtml(url);
  return [
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:28px 0 8px"><tr>`,
    `<td bgcolor="${MUSTARD}" style="background:${MUSTARD};border-radius:6px">`,
    `<a href="${href}" style="display:inline-block;padding:16px 28px;font-family:${FONT};font-size:14px;font-weight:900;`,
    `letter-spacing:.06em;text-transform:uppercase;text-decoration:none;color:${INK}">${escapeHtml(label)} &rarr;</a>`,
    `</td></tr></table>`,
  ].join("");
}

function codeHtml(code: string): string {
  return [
    `<div style="margin:24px 0 0;padding:18px 20px;border-radius:8px;background:${GROUND};text-align:center">`,
    `<div style="font-family:${FONT};font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:${MUSTARD}">`,
    `${escapeHtml(mailLabels.backupCode)}</div>`,
    `<div style="margin-top:8px;font-family:${FONT_NARROW};font-size:40px;font-weight:800;letter-spacing:.12em;color:${PAPER}">`,
    `${escapeHtml(code)}</div></div>`,
  ].join("");
}

/** La page complète d'un e-mail. */
export function renderShell({ title, bodyHtml, button, code, footerHtml }: MailShell): string {
  const fallback = button
    ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:1.5;color:${MUTED}">${escapeHtml(mailLabels.fallback)}<br>` +
      `<a href="${escapeHtml(button.url)}" style="color:${MUTED};word-break:break-all">${escapeHtml(button.url)}</a></p>`
    : "";
  return [
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<meta name="color-scheme" content="light"><title>${escapeHtml(title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${NIGHT}">`,
    `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${NIGHT}" style="background:${NIGHT}"><tr><td align="center" style="padding:24px 12px">`,
    `<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px">`,
    // L'affiche de nuit : le logotype est dans l'image ; le texte de repli garde le nom quand les images sont bloquées.
    `<tr><td style="background:${GROUND};border-radius:10px 10px 0 0;line-height:0">`,
    `<img src="${escapeHtml(mailBannerUrl())}" width="600" alt="Orasso" style="display:block;width:100%;max-width:600px;height:auto;border-radius:10px 10px 0 0;font-family:${FONT};font-size:28px;font-weight:900;color:${PAPER};line-height:1.2">`,
    `</td></tr>`,
    `<tr><td style="background:${PAPER};padding:32px 32px 28px;font-family:${FONT};color:${INK}">`,
    `<h1 style="margin:0 0 16px;font-family:${FONT};font-size:26px;line-height:1.1;font-weight:900;font-style:italic;text-transform:uppercase;color:${INK}">${escapeHtml(title)}</h1>`,
    bodyHtml,
    button ? buttonHtml(button.label, button.url) : "",
    fallback,
    code ? codeHtml(code) : "",
    `</td></tr>`,
    `<tr><td style="background:${GROUND};border-radius:0 0 10px 10px;padding:20px 32px;font-family:${FONT};font-size:12px;line-height:1.6;color:#a39d91">`,
    `<strong style="color:${PAPER}">Orasso</strong> &middot; ${escapeHtml(mailLabels.tagline)}<br>`,
    `${escapeHtml(mailLabels.footer)} ${escapeHtml(mailLabels.footerContact)}`,
    footerHtml ? `<br>${footerHtml}` : "",
    `</td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("\n");
}

/** Paragraphes de texte brut → HTML (échappé). */
export const paragraphsHtml = (paragraphs: string[]) =>
  paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 14px;font-family:${FONT};font-size:16px;line-height:1.55;color:${INK}">${escapeHtml(p)}</p>`,
    )
    .join("\n");

/** Version texte : titre, corps, lien, code, pied. */
export function renderShellText({
  title,
  paragraphs,
  button,
  code,
  extra,
}: {
  title: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  code?: string;
  extra?: string[];
}): string {
  return [
    title,
    "",
    ...paragraphs,
    button ? `${button.label} : ${button.url}` : "",
    code ? `${mailLabels.backupCode} : ${code}` : "",
    "",
    "Orasso",
    mailLabels.footer,
    mailLabels.footerContact,
    ...(extra ?? []),
  ]
    .filter((line, i, all) => line !== "" || all[i - 1] !== "")
    .join("\n");
}
