// Accueil par profil (lot 40 : coquille ; le lot 43 remplit `home/<profil>.tsx`, prototype `s-home`). L'exposant et le
// visiteur gardent l'Accueil actuel (il sert déjà un compte sans véhicule : incitation « Ajouter un véhicule ») ; les
// autres profils affichent « Bientôt » en attendant.
import type { AppPersonaKind } from "@/lib/personaModel";
import { Soon } from "@/ui/Soon";

import { FanHome } from "./FanHome";

const SOON: Partial<Record<AppPersonaKind, string>> = {
  visitor: "Ton prochain événement, ton billet et la météo du jour arrivent ici.",
  pro: "Tes remises de la semaine, les événements proches et les passionnés du coin arrivent ici.",
  provider: "Ta prochaine mission, ton emplacement et les messages des organisateurs arrivent ici.",
  media: "Ton prochain reportage, ton badge presse et les consignes arrivent ici.",
};

export function HomeScreen({ variant }: { variant: AppPersonaKind }) {
  if (variant === "fan" || variant === "visitor") return <FanHome />;
  return <Soon title="Accueil">{SOON[variant] ?? "Ton accueil arrive ici."}</Soon>;
}
