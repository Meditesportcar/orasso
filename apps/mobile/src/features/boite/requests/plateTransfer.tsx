// Demandes de transfert de plaque reçues (lot 31, S36) dans Boîte > Demandes (lot 40) : un visiteur n'a plus d'onglet
// Garage, la demande doit l'attendre ici aussi. Mêmes actions que dans le Garage (accepter, refuser).

import { PlateTransferCard } from "@/features/garage/PlateTransferCard";
import { api } from "@/lib/api";
import { useApi } from "@/lib/useApi";

import type { RequestSectionProps } from "./types";

export function PlateTransferRequests({ onChanged, refreshKey }: RequestSectionProps) {
  const transfers = useApi(() => api.plateTransfers(), [refreshKey]);
  return (
    <>
      {(transfers.data?.incoming ?? []).map((tr) => (
        <PlateTransferCard
          key={tr.id}
          transfer={tr}
          onDone={async () => {
            await transfers.reload();
            onChanged();
          }}
        />
      ))}
    </>
  );
}
