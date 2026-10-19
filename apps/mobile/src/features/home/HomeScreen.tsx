// Accueil par profil (lot 40 : coquille ; lot 43 : un fichier par profil, prototype `s-home`). Exposant et visiteur
// partagent `FanHome` (carte du prochain événement, blocs réglables) ; le pro, le prestataire et le média ont chacun
// le leur. Les fichiers d'onglet de chaque groupe de routes ne font que rendre `HomeScreen` avec leur profil.
import type { AppPersonaKind } from "@/lib/personaModel";
import { Soon } from "@/ui/Soon";

import { ExhibitorHome } from "./exhibitor";
import { MediaHome } from "./media";
import { ProHome } from "./pro";
import { ProviderHome } from "./provider";
import { VisitorHome } from "./visitor";

export function HomeScreen({ variant }: { variant: AppPersonaKind }) {
  switch (variant) {
    case "fan":
      return <ExhibitorHome />;
    case "visitor":
      return <VisitorHome />;
    case "pro":
      return <ProHome />;
    case "provider":
      return <ProviderHome />;
    case "media":
      return <MediaHome />;
    default:
      // L'organisateur a le Direct (lot 52) et l'administration son tableau : pas d'accueil par profil.
      return <Soon title="Accueil">Ton accueil arrive ici.</Soon>;
  }
}
