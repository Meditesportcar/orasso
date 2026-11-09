// Bloc « Au spot » de l'Accueil : emplacement réservé au lot R7i (rendez-vous au spot). Tant que `GET /me/home` renvoie
// `spotMeetup: null`, il ne rend rien (la carte ne s'affiche que s'il y a un rendez-vous). R7i remplace ce fichier.
import type { HomeSpotMeetup } from "@orasso/shared";

export function SpotMeetup(_props: { data: HomeSpotMeetup | null }) {
  return null;
}
