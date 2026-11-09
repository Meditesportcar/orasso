// Demande de transfert de plaque reçue (lot 31, S36 ; carte sur `GET /me/requests`, `kind plate_transfer`, lot R7c2) : un
// visiteur n'a plus d'onglet Garage, la demande l'attend ici aussi. Mêmes actions que dans le Garage (confirmer, « ce
// n'est pas le cas »). L'API ne sert ni la plaque ni le véhicule du demandeur : la carte dit le véhicule de l'ancien
// propriétaire (le sien) et l'échéance, rien de plus.
import { plateTransferLabels } from "@orasso/shared";

import { api } from "@/lib/api";
import { formatDayHour } from "@/lib/format";

import { RequestCard } from "../RequestCard";
import { fromOf, payloadString, type RequestCardProps } from "./types";

export function PlateTransferRequest({ item, onDone }: RequestCardProps) {
  const { name, imageUrl } = fromOf(item);
  const vehicle = payloadString(item, "vehicleLabel");
  const answerBy = payloadString(item, "answerBy");
  return (
    <RequestCard
      testID="request-plate-transfer"
      avatarUrl={imageUrl}
      pseudo={name}
      title={`${plateTransferLabels.requestTitle}${vehicle ? ` · ${vehicle}` : ""}`}
      detail={answerBy ? `Réponse attendue avant le ${formatDayHour(answerBy)}.` : null}
      message={`${name} a saisi la plaque de ${vehicle ?? "ton véhicule"} pour son véhicule. Si tu l'as vendu, confirme : ton véhicule passe « Vendu » et la plaque change de main. Sinon, l'équipe Orasso tranchera.`}
      acceptLabel={plateTransferLabels.accept}
      declineLabel={plateTransferLabels.decline}
      onAccept={async () => {
        await api.acceptPlateTransfer(item.id);
        onDone();
      }}
      onDecline={async () => {
        await api.declinePlateTransfer(item.id);
        onDone();
      }}
    />
  );
}
