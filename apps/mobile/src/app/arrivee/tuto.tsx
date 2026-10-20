// Tuto d'arrivée (lot 42) : le tuto du profil choisi, joué une fois le compte créé. « Passer » et « C'est parti » mènent à
// `arrivee/casquette` (créer sa casquette ou « Plus tard », lot 41), qui ouvre ensuite l'onglet central du profil.
import { useRouter } from "expo-router";

import { useArrivee } from "@/features/arrivee/model";
import { tutoKeysAfterArrival } from "@/features/tuto/model";
import { TutoScreen } from "@/features/tuto/TutoScreen";
import { kvSet } from "@/lib/kv";
import { useSession } from "@/lib/session";

export default function ArriveeTuto() {
  const router = useRouter();
  const { profile: chosen } = useArrivee();
  const { me } = useSession();
  // Le profil enregistré fait foi ; le choix de l'arrivée sert tant que le compte se charge.
  const profile = me?.profile.mainProfile ?? chosen ?? "visitor";
  const done = () => {
    // Le tuto du profil, et celui de la barre qu'il peut voir tout de suite (visiteur tant que la casquette n'existe pas).
    for (const key of tutoKeysAfterArrival(profile)) void kvSet(key, "1");
    router.replace("/arrivee/casquette");
  };
  return <TutoScreen key={profile} profile={profile} onDone={done} />;
}
