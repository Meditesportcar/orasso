// Les souvenirs (lot R7j) : la page d'un souvenir. Le bloc de l'Accueil et la carte du Fil arrivent avec leurs propres routes.
// Aucune règle ici : le jour, l'ancienneté et la visibilité sont dans l'API (`modules/memories`).
import type { MemoryDetail } from "@orasso/shared";

import { request } from "../http";

export const memoriesApi = {
  memoryDetail: (eventId: string) => request<MemoryDetail>(`/api/me/memories/${eventId}`),
};
