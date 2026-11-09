// Partenariats pro ↔ passionné (lot R7m1, ARCHITECTURE-R7 § 2.10) : entrées et vues de l'API. Les règles (qui propose,
// qui voit quoi) sont dans `rules/partnerships.ts`. Aucun champ d'argent nulle part.
import { z } from "zod";

import type { Grade } from "../grades";
import { PARTNERSHIP_MESSAGE_MAX, type PartnershipRefusal, type PartnershipStatus } from "../rules/partnerships";

/** `POST /pros/:id/partnerships` : le pro propose à un passionné, avec un véhicule de lui au choix (facultatif). */
export const partnershipProposeSchema = z.object({
  userPseudo: z.string().trim().min(1).max(60),
  vehicleId: z.uuid().nullish(),
  message: z.string().trim().min(1, "Écris un mot court").max(PARTNERSHIP_MESSAGE_MAX),
});
export type PartnershipPropose = z.infer<typeof partnershipProposeSchema>;

/** Un véhicule cité par un partenariat : son nom, jamais la plaque ni la photo. */
export type PartnershipVehicle = { id: string; label: string };

/** Réponse d'une proposition ou d'une décision. */
export type PartnershipResult = {
  id: string;
  status: PartnershipStatus;
  proId: string;
  userPseudo: string;
  vehicleId: string | null;
  message: string;
  proposedAt: string;
  respondedAt: string | null;
  endedAt: string | null;
};

/** Une ligne de « Ses partenaires » (fiche d'un pro) : un passionné, vu selon son compte (privé : pseudo, photo et grade seulement). */
export type PartnerOfPro = {
  pseudo: string;
  avatarUrl: string | null;
  grade: Grade;
  /** Absente pour un compte privé que la personne qui regarde ne suit pas. */
  vehicle: PartnershipVehicle | null;
};

/** Une page de « Ses partenaires » : `total` compte tous les partenaires visibles, la page en montre `limit` au plus. */
export type ProPartnersPage = { items: PartnerOfPro[]; nextCursor: string | null; total: number };

/** Combien de partenaires la fiche d'un pro montre avant « Voir tout ». */
export const PARTNERS_ON_FICHE = 6;

/** Une ligne de « Partenaires » (profil) : un pro. */
export type PartnerLogo = { proId: string; name: string; logoUrl: string | null; slug: string };

/** « Partenaire : … » sur la carte d'un véhicule. */
export type VehiclePartner = { name: string; logoUrl: string | null; slug: string };

/** `GET /me/partnerships` : mes partenaires actifs (je suis le passionné). */
export type MyPartnership = {
  id: string;
  /** Faux quand la fiche du pro est dépubliée, non vérifiée ou son titulaire suspendu : le passionné peut y mettre fin. */
  available: boolean;
  pro: PartnerLogo & { city: string | null; activities: string[] };
  vehicle: PartnershipVehicle | null;
  since: string;
};
export type MyPartnerships = { items: MyPartnership[] };

/** Côté pro (`GET /pros/:id/partnerships`) : mes propositions en attente et mes partenaires actifs. */
export type ProPartnershipRow = {
  id: string;
  status: "pending" | "active";
  user: { pseudo: string; avatarUrl: string | null; grade: Grade };
  vehicle: PartnershipVehicle | null;
  message: string;
  since: string;
};
export type ProPartnerships = {
  /** `null` : je peux proposer ; sinon pourquoi pas (fiche non vérifiée, ou réservé à l'abonnement pro). */
  canPropose: PartnershipRefusal | null;
  subscriptionFrom: string;
  items: ProPartnershipRow[];
};

/**
 * Sur le profil d'un passionné, pour un pro vérifié qui regarde (`UserProfileView.partnershipOffer`) : le bouton « Proposer un
 * partenariat » (`available`), la proposition déjà envoyée (`pending`), ou rien. Absent pour tout autre regard.
 */
export type PartnershipOffer = { proId: string; proName: string; state: "available" | "pending" };

/** Contenu de la demande de `GET /me/requests` (`kind partnership`) : le pro, le texte, la voiture concernée. */
export type PartnershipRequestPayload = {
  message: string;
  vehicle: PartnershipVehicle | null;
  pro: { slug: string; city: string | null; activities: string[] };
};

/** Réglage `partnerships.subscription_from` : un jour `AAAA-MM-JJ`. */
export const partnershipSubscriptionFromSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Jour attendu : AAAA-MM-JJ")
  .refine((v) => {
    const [y = 0, m = 0, d = 0] = v.split("-").map(Number);
    const probe = new Date(Date.UTC(y, m - 1, d));
    return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
  }, "Ce jour n'existe pas");
