// Bloc « Au spot » de l'Accueil du site (lot R7i, maquette R7.9) : le prochain rendez-vous reçu, sinon le mien, avec « Qui vient ? »,
// le lieu, l'heure et les deux réponses. `GET /me/home` ne le renvoie que s'il y en a un. Mêmes mots que l'appli.
import { type HomeSpotMeetup, spotLabels as L } from "@orasso/shared";
import { Block } from "../HomeWidgets";
import { SpotCard } from "../spot/SpotCard";

export function SpotMeetupBlock({ data }: { data: HomeSpotMeetup }) {
  return (
    <Block id="spot_meetup" title={L.block}>
      <SpotCard meetup={data.meetup} bare testid="home-spot-card" />
      {data.others > 0 ? (
        <a href="/app/fil" data-testid="home-spot-others">
          {L.homeOthers(data.others)}
        </a>
      ) : null}
    </Block>
  );
}
