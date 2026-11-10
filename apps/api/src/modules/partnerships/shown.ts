// Fiche pro « montrable » (lot R7m1, tour 2, repris par R7m2) : non supprimée, publiée, vérifiée, titulaire en règle. Une seule
// règle pour afficher un partenaire, lire une demande, accepter, proposer et poser une mention commerciale à la main.
import { and, isNotNull, isNull, type SQL } from "drizzle-orm";

import { proProfiles } from "../../db/schema";
import { proOwnerActive } from "../pros/explore";

export const proShown = (at: Date): SQL =>
  and(
    isNull(proProfiles.deletedAt),
    isNotNull(proProfiles.publishedAt),
    isNotNull(proProfiles.verifiedAt),
    proOwnerActive(at),
  ) as SQL;
