// Passeport, prix du public, récap (lot 50, routes du lot 49). Aucune règle ici : fenêtre de vote, conditions, points et
// tampons sont dans l'API.
import type {
  AudienceCandidates,
  AudiencePrizeBoard,
  AudiencePrizeMine,
  PassportView,
  RecapListItem,
  RecapView,
} from "@orasso/shared";

import { request } from "../http";
import { qs } from "./qs";

export const passportApi = {
  /** Mes tampons d'une saison (année) ; sans saison, la saison en cours. */
  passport: (season?: number) => request<PassportView>(`/api/me/passport${qs({ season })}`),
  /** Classement en direct, ou résultats figés après le règlement. */
  audienceBoard: (eventId: string) => request<AudiencePrizeBoard>(`/api/events/${eventId}/audience-prize`),
  /** Tous les véhicules pointés, sans les voix, par pages de 100 (la grille du vote). */
  audienceCandidates: (eventId: string, cursor = 0) =>
    request<AudienceCandidates>(
      `/api/events/${eventId}/audience-prize/candidates${qs({ cursor: cursor || undefined })}`,
    ),
  /** Puis-je voter, pour qui j'ai voté, mon heure d'entrée. */
  audienceMine: (eventId: string) => request<AudiencePrizeMine>(`/api/events/${eventId}/audience-prize/mine`),
  /** Une voix, modifiable jusqu'à la clôture. */
  audienceVote: (eventId: string, applicationId: string) =>
    request<AudiencePrizeMine>(`/api/events/${eventId}/audience-prize/vote`, {
      method: "PUT",
      body: { applicationId },
    }),
  recap: (eventId: string) => request<RecapView>(`/api/me/recaps/${eventId}`),
  recaps: () => request<RecapListItem[]>("/api/me/recaps"),
};
