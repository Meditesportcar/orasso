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
  /** Aperçu en direct de l'affiche d'un événement (lot 47) : un rendu d'image à chaque frappe débouncée. */
  posterPreview: { max: 60, windowMs: 60_000, message: "Trop d'aperçus : réessaie dans une minute." },
  /**
   * Lot 51 : photos de véhicule envoyées ou floutées (décodage d'image, CPU) ; plus large que `vehicleWrite` : un ajout
   * en cinq étapes envoie jusqu'à 8 photos, et un garage peut en compter plusieurs.
   */
  vehiclePhoto: { max: 60, windowMs: 3_600_000, message: "Trop de photos envoyées : réessaie plus tard." },
  /** Fiche Instagram d'un véhicule (rendu d'image, mis en cache une heure par véhicule). */
  shareImage: { max: 40, windowMs: 3_600_000, message: "Trop d'affiches générées : réessaie plus tard." },
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
  /** Galerie de 30 photos, avec de la marge pour remplacer les photos retirées du formulaire. */
  mediaFileUpload: { max: 60, windowMs: 3_600_000, message: "Trop de photos envoyées : réessaie plus tard." },
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
  /** Suppression du compte : essais de mot de passe et de code (lot 15). */
  accountDelete: { max: 5, windowMs: 15 * 60_000, message: "Trop d'essais : réessaie dans un quart d'heure." },
  /** Export des données personnelles (lot 35c) : chaque appel relit tout le compte. */
  accountExport: { max: 5, windowMs: 3_600_000, message: "Trop d'exports : réessaie dans une heure." },
  /** Codes TOTP ou de secours vérifiés depuis une session déjà ouverte (le plugin ne les compte pas, lot 15). */
  twoFactorVerify: { max: 5, windowMs: 15 * 60_000, message: "Trop d'essais : réessaie dans un quart d'heure." },
  emailVerificationResend: { max: 3, windowMs: 3_600_000, message: "Trop de relances : réessaie dans une heure." },
  /** Demandes d'ami (lot 17) : 20 par personne et par jour. */
  friendRequest: { max: 20, windowMs: 86_400_000, message: "Trop de demandes d'ami aujourd'hui : réessaie demain." },
  /** Recherche de personnes (lot 17). */
  peopleSearch: { max: 60, windowMs: 60_000, message: "Trop de recherches : réessaie dans une minute." },
  /** Recherche de premier niveau (lot 29) : par personne connectée, et par adresse pour un visiteur sans compte. */
  search: { max: 60, windowMs: 60_000, message: "Trop de recherches : réessaie dans une minute." },
  searchPublic: { max: 30, windowMs: 60_000, message: "Trop de recherches : réessaie dans une minute." },
  /**
   * Lot R3c, tour 2 : recherche « Marque ou modèle » de l'ajout de véhicule, une requête par frappe (avec anti-rebond
   * côté appli et site) : plus large que la recherche de premier niveau.
   */
  referenceSearch: { max: 120, windowMs: 60_000, message: "Trop de recherches : réessaie dans une minute." },
  referenceSearchPublic: { max: 120, windowMs: 60_000, message: "Trop de recherches : réessaie dans une minute." },
  /** QR ami : lectures par minute, et codes refusés (le code à 8 chiffres ne se devine pas par essais). */
  friendQr: { max: 30, windowMs: 60_000, message: "Trop de lectures : réessaie dans une minute." },
  friendQrFailure: { max: 10, windowMs: 600_000, message: "Trop de codes refusés : réessaie dans quelques minutes." },
  /** Ouverture d'une conversation (lot 18) : avec un ami, avec une structure. */
  conversationOpen: { max: 60, windowMs: 3_600_000, message: "Trop de conversations ouvertes : réessaie plus tard." },
  /** Crews (lot 19) : recherche, invitations envoyées par un chef, modifications et inscriptions à un événement. */
  crewSearch: { max: 60, windowMs: 60_000, message: "Trop de recherches : réessaie dans une minute." },
  crewInvite: { max: 50, windowMs: 86_400_000, message: "Trop d'invitations aujourd'hui : réessaie demain." },
  crewWrite: { max: 60, windowMs: 3_600_000, message: "Trop de modifications : réessaie plus tard." },
  /** Accueil (lot 30) : lecture agrégée, réglages (widgets, garage favori) et clics sur l'emplacement sponsorisé. */
  homeRead: { max: 60, windowMs: 60_000, message: "Trop de chargements : réessaie dans une minute." },
  homeWrite: { max: 60, windowMs: 3_600_000, message: "Trop de modifications : réessaie plus tard." },
  sponsoredClick: { max: 60, windowMs: 3_600_000, message: "Trop de clics : réessaie plus tard." },
  /** Export des participants d'un événement (lot 27) : chaque export est tracé, pas de rafale. */
  participantsExport: { max: 10, windowMs: 3_600_000, message: "Trop d'exports : réessaie dans une heure." },
  /** Notes internes (lot 27) : créations, modifications, suppressions. */
  noteWrite: { max: 60, windowMs: 3_600_000, message: "Trop de notes modifiées : réessaie plus tard." },
  /** Administration des badges (lot 27) : justificatifs téléversés par l'équipe. */
  adminUpload: { max: 30, windowMs: 3_600_000, message: "Trop d'envois : réessaie plus tard." },
  /** Staff (lot 24) : demandes pour rejoindre une structure, et invitations envoyées par une organisation. */
  staffRequest: { max: 10, windowMs: 86_400_000, message: "Trop de demandes de staff aujourd'hui : réessaie demain." },
  /** Boutique (lot 24) : billets et compteur séparés, plafond cohérent avec une entrée chargée (lots groupés côté appli). */
  shopScan: { max: 300, windowMs: 60_000, message: "Trop de lectures de billets : réessaie dans une minute." },
  shopVisitor: { max: 300, windowMs: 60_000, message: "Trop de touchers du compteur : réessaie dans une minute." },
  staffInvite: { max: 30, windowMs: 86_400_000, message: "Trop d'invitations aujourd'hui : réessaie demain." },
  /** Média (lot 45) : demandes d'accréditation, contenus publiés, écritures du profil. */
  mediaAccreditation: {
    max: 10,
    windowMs: 86_400_000,
    message: "Trop de demandes d'accréditation aujourd'hui : réessaie demain.",
  },
  mediaContent: { max: 20, windowMs: 86_400_000, message: "Trop de contenus publiés aujourd'hui : réessaie demain." },
  mediaWrite: { max: 60, windowMs: 3_600_000, message: "Trop de modifications : réessaie plus tard." },
  /** Vues d'un contenu média : par visiteur et par contenu, comme le compteur de la fiche pro. */
  mediaView: { max: 30, windowMs: 3_600_000, message: "Trop d'actions sur ce contenu." },
  /** Prix du public (lot 49) : une voix modifiable, pas un bouton qu'on martèle. */
  audienceVote: { max: 20, windowMs: 60_000, message: "Trop de votes : réessaie dans une minute." },
  /**
   * Lot M6, tour 4 : retrait d'un jeton push sans session (déconnexion hors ligne rejouée), par adresse. Un téléphone
   * le rejoue quelques fois ; 30 laisse passer plusieurs téléphones derrière une même adresse d'opérateur.
   */
  pushTokenForget: { max: 30, windowMs: 3_600_000, message: "Trop de retraits : réessaie dans une heure." },
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
