// Lot R7m1 (maquette R7.19 `pp_profil`) : sur le profil d'un passionné, vu par un pro vérifié : le bouton « Proposer un
// partenariat » (secondaire : le bouton principal de l'écran reste « Suivre »), puis « Proposition envoyée » une fois partie.
// L'API décide si le bouton existe (`partnershipOffer`) : fiche vérifiée, avant la date de l'abonnement, pas déjà partenaires.
import { Button } from "@orasso/design-system/native";
import { partnershipLabels as L, type PartnershipOffer, type ProfileVehicle } from "@orasso/shared";
import { useState } from "react";

import { Muted } from "@/ui/Muted";
import { ProposeSheet } from "./ProposeSheet";

export function OfferButton({
  offer,
  pseudo,
  vehicles,
  onChanged,
}: {
  offer: PartnershipOffer;
  pseudo: string;
  /** Les voitures du profil : seules celles au détail visible se proposent. */
  vehicles: ProfileVehicle[];
  onChanged?: () => void;
}) {
  const [open, setOpen] = useState(false);
  if (offer.state === "pending") {
    return (
      <Muted variant="caption" testID="partnership-pending">
        {L.proposed}
      </Muted>
    );
  }
  return (
    <>
      <Button variant="secondary" icon="briefcase" fullWidth onPress={() => setOpen(true)} testID="partnership-propose">
        {L.propose}
      </Button>
      <ProposeSheet
        proId={offer.proId}
        proName={offer.proName}
        target={
          open
            ? { pseudo, vehicles: vehicles.filter((v) => v.detailed).map((v) => ({ id: v.id, label: v.label })) }
            : null
        }
        onClose={() => setOpen(false)}
        onSent={() => {
          setOpen(false);
          onChanged?.();
        }}
      />
    </>
  );
}
