// Limites de débit des routes sensibles de l'API métier (recette du lot 12) : sondage de plaque, vérification du QR
// de compte, recherche du staff. L'authentification (connexion, inscription, 2FA) est limitée par Better Auth.
// Compteurs en mémoire, par utilisateur connecté et par fenêtre fixe : une seule instance de l'API (dev.orasso.fr).
// Plusieurs instances demanderaient un stockage partagé (PostgreSQL ou Redis).
import { AppError } from "./errors";

export type RateRule = { max: number; windowMs: number; message: string };

export const rateRules = {
  /** Ajout ou modification d'un véhicule : « plaque déjà enregistrée » permet de savoir si une plaque existe. */
  vehicleWrite: {
    max: 20,
    windowMs: 3_600_000,
    message: "Trop de véhicules ajoutés ou modifiés : réessaie plus tard.",
  },
  /** Vérification d'un QR de compte : code de 8 chiffres deviné par essais successifs. */
  accountQrVerify: { max: 30, windowMs: 60_000, message: "Trop de vérifications : réessaie dans une minute." },
  /** Recherche du staff par début de plaque ou pseudo. */
  staffSearch: { max: 60, windowMs: 60_000, message: "Trop de recherches : réessaie dans une minute." },
  /** Contrôle SIRET / RNA : chaque appel interroge le registre public de l'État (lot 13). */
  registryCheck: { max: 10, windowMs: 3_600_000, message: "Trop de contrôles : réessaie dans une heure." },
  /** Recherche d'adresse de l'assistant d'événement (service de géocodage public). */
  geocode: { max: 60, windowMs: 60_000, message: "Trop de recherches d'adresse : réessaie dans une minute." },
  /** Envoi de justificatifs, logos et affiches. */
  fileUpload: { max: 30, windowMs: 3_600_000, message: "Trop d'envois de fichiers : réessaie plus tard." },
  /** Création d'une structure : n'importe quel utilisateur peut en créer, pas des dizaines. */
  structureCreate: { max: 5, windowMs: 86_400_000, message: "Trop de structures créées aujourd'hui." },
  /** Pointage rapide par plaques (jusqu'à 300 plaques par envoi). */
  plateCheckins: { max: 30, windowMs: 60_000, message: "Trop d'envois de plaques : réessaie dans une minute." },
  /** Codes de QR de compte refusés (expirés, inconnus, rejoués) par un même pro : chaque échec est un essai de devinette. */
  accountQrFailure: {
    max: 10,
    windowMs: 600_000,
    message: "Trop de codes refusés : réessaie dans quelques minutes.",
  },
  /** Vérifications de QR de compte par un pro dans la journée (un garage ne scanne pas mille clients par jour). */
  accountQrDaily: { max: 500, windowMs: 86_400_000, message: "Limite quotidienne de vérifications atteinte." },
  /** Compteurs de la fiche pro (vues, appels, itinéraires) : par visiteur et par fiche. */
  proTrack: { max: 30, windowMs: 3_600_000, message: "Trop d'actions sur cette fiche." },
  /** Création et modification de fiche pro, photos, publications. */
  proWrite: { max: 60, windowMs: 3_600_000, message: "Trop de modifications : réessaie plus tard." },
  /** Réservation de billets gratuits ou ouverture d'un paiement. */
  ticketOrder: { max: 20, windowMs: 3_600_000, message: "Trop de commandes de billets : réessaie plus tard." },
  /** Contrôle des billets à l'entrée (un lecteur enchaîne les lectures). */
  ticketCheck: { max: 120, windowMs: 60_000, message: "Trop de lectures : réessaie dans une minute." },
  /** Relance de l'e-mail de vérification (lot 15). */
  emailVerificationResend: { max: 3, windowMs: 3_600_000, message: "Trop de relances : réessaie dans une heure." },
} satisfies Record<string, RateRule>;

export type RateRuleName = keyof typeof rateRules;

const buckets = new Map<string, { count: number; resetAt: number }>();
let lastPrune = 0;

/** Compte un appel ; `429 rate_limited` (avec `retryAfter` en secondes) au-delà du maximum de la fenêtre. */
export function rateLimit(name: RateRuleName, subject: string, nowMs = Date.now()): void {
  const rule = rateRules[name];
  if (nowMs - lastPrune > 60_000) {
    for (const [k, b] of buckets) if (b.resetAt <= nowMs) buckets.delete(k);
    lastPrune = nowMs;
  }
  const key = `${name}|${subject}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) {
    buckets.set(key, { count: 1, resetAt: nowMs + rule.windowMs });
    return;
  }
  bucket.count++;
  if (bucket.count > rule.max) {
    throw new AppError(429, "rate_limited", rule.message, { retryAfter: Math.ceil((bucket.resetAt - nowMs) / 1000) });
  }
}

/** Compte un événement (un échec, par exemple) sans jamais lever : la limite se vérifie avant avec `rateAssertBelow`. */
export function rateRecord(name: RateRuleName, subject: string, nowMs = Date.now()): void {
  const rule = rateRules[name];
  const key = `${name}|${subject}`;
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= nowMs) buckets.set(key, { count: 1, resetAt: nowMs + rule.windowMs });
  else bucket.count++;
}

/** `429 rate_limited` si le maximum de la règle est déjà atteint, sans rien compter. */
export function rateAssertBelow(name: RateRuleName, subject: string, nowMs = Date.now()): void {
  const rule = rateRules[name];
  const bucket = buckets.get(`${name}|${subject}`);
  if (bucket && bucket.resetAt > nowMs && bucket.count >= rule.max) {
    throw new AppError(429, "rate_limited", rule.message, { retryAfter: Math.ceil((bucket.resetAt - nowMs) / 1000) });
  }
}

/** Tests : remet les compteurs à zéro. */
export function resetRateLimits(): void {
  buckets.clear();
}
