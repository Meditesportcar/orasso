// L'étape « Détails » de la story, sans React ni réseau (lot R7f3, testé par `details.test.ts`) : la légende, le lieu, la
// voiture, l'événement, les personnes identifiées, et le public choisi. Changer de public retire ce qui ne vaut plus pour lui
// (`pruneForAudience` des règles partagées).
import {
  type CommercialDraft,
  noCommercialDraft,
  pruneForAudience,
  type StoryAudienceOption,
  type StoryTagPick,
} from "@orasso/shared";

export type DetailsState = {
  caption: string;
  place: string;
  vehicleId: string | null;
  eventId: string | null;
  tags: StoryTagPick[];
  /** `key` d'une `StoryAudienceOption`. */
  audienceKey: string;
  /** « Collaboration commerciale » posée à la main (lot R7m2) ; celle d'un partenaire cité est posée par l'API. */
  commercial: CommercialDraft;
};

/** `audienceKey` vide : rien n'est encore choisi, la première option du moment s'applique (`settleAudience`). */
export const initialDetails = (options: readonly StoryAudienceOption[]): DetailsState => ({
  caption: "",
  place: "",
  vehicleId: null,
  eventId: null,
  tags: [],
  audienceKey: options[0]?.key ?? "",
  commercial: noCommercialDraft,
});

/** Au tout début (aucun choix fait), la première option disponible est prise ; ensuite jamais plus, d'office. */
export const settleAudience = (state: DetailsState, options: readonly StoryAudienceOption[]): DetailsState =>
  state.audienceKey === "" && options[0] ? { ...state, audienceKey: options[0].key } : state;

/** L'option choisie, ou `undefined` si elle n'existe plus (crew quitté ou supprimé, casquette changée). */
export function audienceOption(options: readonly StoryAudienceOption[], key: string): StoryAudienceOption | undefined {
  return options.find((o) => o.key === key);
}

/**
 * Le public choisi a disparu (crew quitté ou supprimé, casquette changée) : il reste affiché comme invalide et l'envoi est
 * bloqué jusqu'à un nouveau choix. Jamais de bascule d'office vers « Mes abonnés » (la story serait plus large que voulu).
 */
export const audienceLost = (options: readonly StoryAudienceOption[], key: string): boolean =>
  key !== "" && !options.some((o) => o.key === key);

/**
 * Une option de public est inactive pendant l'envoi, ou quand elle est l'unique option ET déjà le choix valide (rien à
 * changer). Si le choix courant a disparu, l'unique option restante reste sélectionnable : sinon la personne ne peut plus
 * en sortir.
 */
export const audienceOptionDisabled = (
  options: readonly StoryAudienceOption[],
  key: string,
  locked: boolean,
): boolean => locked || (options.length === 1 && options[0]?.key === key);

/** « Ma ville » arrive : seul le lieu change, sur l'état d'aujourd'hui (jamais sur celui d'avant la lecture). */
export const withPlace =
  (place: string) =>
  (state: DetailsState): DetailsState =>
    state.place === place ? state : { ...state, place };

/** Choisit un public : les identifiés et l'événement qui n'y vaudraient plus sont retirés (`dropped` le dit). */
export function chooseAudience(
  state: DetailsState,
  options: readonly StoryAudienceOption[],
  key: string,
): { state: DetailsState; dropped: boolean } {
  const before = audienceOption(options, state.audienceKey);
  const next = audienceOption(options, key);
  if (!next) return { state, dropped: false };
  // Un public disparu ne garantit plus que les identifiés puissent voir la story : ils sont retirés.
  const pruned = before
    ? pruneForAudience(
        { audience: before.audience, crewId: before.crewId },
        { audience: next.audience, crewId: next.crewId },
        state,
      )
    : {
        tags: [],
        eventId: next.audience === "crew" ? null : state.eventId,
        changed: state.tags.length > 0 || (next.audience === "crew" && state.eventId !== null),
      };
  return {
    state: { ...state, audienceKey: next.key, tags: pruned.tags, eventId: pruned.eventId },
    dropped: pruned.changed,
  };
}
