// Passer de « Publication » à « Story » (R9n, T18 ; tour 1, point 6) : la décision, pure et testée.
// - envoi en cours ou incertain : le segment est inactif (`locked`), le verrou de l'envoi incertain n'est jamais contourné ;
// - un brouillon (photos, légende, rattachement, offre R9c) : on demande avant de l'abandonner (`confirm`) ;
// - sinon on passe (`go`).
export type SwitchState = {
  photos: number;
  caption: string;
  eventId: string | null;
  offerOn: boolean;
  busy: boolean;
  uncertain: boolean;
};

export const hasDraft = (s: Pick<SwitchState, "photos" | "caption" | "eventId" | "offerOn">): boolean =>
  s.photos > 0 || s.caption.trim() !== "" || s.eventId !== null || s.offerOn;

export function switchToStory(s: SwitchState): "locked" | "confirm" | "go" {
  if (s.busy || s.uncertain) return "locked";
  return hasDraft(s) ? "confirm" : "go";
}

/** Quitter pour la story ? `confirmed` : la réponse à la confirmation (« Passer à la story » vrai, « Rester » faux). « Rester » garde le brouillon : rien ne bouge. */
export const shouldLeave = (rule: "locked" | "confirm" | "go", confirmed: boolean): boolean =>
  rule === "go" || (rule === "confirm" && confirmed);
