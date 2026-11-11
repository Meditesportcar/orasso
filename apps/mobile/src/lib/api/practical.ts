// Pratique (lot R8q) : la station-service et le lavage les plus proches. La position part arrondie à 0,1° (l'appelant l'arrondit
// avant), en corps de requête et jamais dans l'adresse ; l'API ne l'enregistre pas et ne la donne à aucune source.
import type { PracticalData, PracticalInput } from "@orasso/shared";

import { request } from "../http";

export const practicalApi = {
  practical: (input: PracticalInput) => request<PracticalData>("/api/practical", { method: "POST", body: input }),
};
