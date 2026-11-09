// L'étape « Détails » de la story, sans React ni réseau (lot R7f3, testé par `details.test.ts`) : la légende, le lieu, la
// voiture, l'événement, les personnes identifiées, et le public choisi. Changer de public retire ce qui ne vaut plus pour lui
// (`pruneForAudience` des règles partagées).
import { pruneForAudience, type StoryAudienceOption, type StoryTagPick } from "@orasso/shared";

export type DetailsState = {
  caption: string;
  place: string;
  vehicleId: string | null;
  eventId: string | null;
  tags: StoryTagPick[];
  /** `key` d'une `StoryAudienceOption`. */
  audienceKey: string;
};

export const initialDetails = (options: readonly StoryAudienceOption[]): DetailsState => ({
  caption: "",
  place: "",
  vehicleId: null,
  eventId: null,
  tags: [],
  audienceKey: options[0]?.key ?? "followers",
});

/** L'option choisie ; la première si la clé n'existe plus (un crew quitté entre-temps, une casquette changée). */
export function audienceOption(options: readonly StoryAudienceOption[], key: string): StoryAudienceOption | undefined {
  return options.find((o) => o.key === key) ?? options[0];
}

/** Choisit un public : les identifiés et l'événement qui n'y vaudraient plus sont retirés (`dropped` le dit). */
export function chooseAudience(
  state: DetailsState,
  options: readonly StoryAudienceOption[],
  key: string,
): { state: DetailsState; dropped: boolean } {
  const before = audienceOption(options, state.audienceKey);
  const next = audienceOption(options, key);
  if (!before || !next) return { state, dropped: false };
  const pruned = pruneForAudience(
    { audience: before.audience, crewId: before.crewId },
    { audience: next.audience, crewId: next.crewId },
    state,
  );
  return {
    state: { ...state, audienceKey: next.key, tags: pruned.tags, eventId: pruned.eventId },
    dropped: pruned.changed,
  };
}
