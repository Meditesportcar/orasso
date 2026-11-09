// Carte « rendez-vous au spot » du Fil sur le site (lot R7i, maquette R7.6 et R7.9) : en tête pour les invités seulement
// (l'API ne la sert à personne d'autre). Le lieu, l'heure, le mot, « Qui vient ? » et les deux réponses, comme l'appli.
import { spotLabels as L } from "@orasso/shared";

import { PersonAvatar } from "../People";
import { SpotCard } from "../spot/SpotCard";
import { type CardProps, Shell } from "./Shell";

export function SpotMeetupCard({ card, onMenu, faded }: CardProps<"spot_meetup">) {
  const { meetup } = card.payload;
  return (
    <Shell
      card={card}
      head={<PersonAvatar url={meetup.author.avatarUrl} pseudo={meetup.author.pseudo} size={38} />}
      title={L.from(meetup.author.pseudo)}
      href={`/app/spot/${meetup.id}`}
      onMenu={onMenu}
      faded={faded}
    >
      <SpotCard meetup={meetup} bare testid="feed-spot" />
    </Shell>
  );
}
