// Tuto rejoué (lot 42) : depuis Mon profil › Aide (« Revoir le tuto ») ou la tuile « Découvre ce qu'il y a de nouveau »
// de l'Accueil. « Passer » et « C'est parti » ramènent à l'écran précédent, sinon à l'Accueil de la casquette active.
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { parseTutoProfile, tutoSeenKey } from "@/features/tuto/model";
import { TutoScreen } from "@/features/tuto/TutoScreen";
import { kvSet } from "@/lib/kv";
import { usePersona } from "@/lib/persona";
import { homeOf } from "@/lib/personaModel";

export default function TutoRoute() {
  const router = useRouter();
  const { persona } = usePersona();
  const { profile: param } = useLocalSearchParams<{ profile?: string }>();
  const profile = parseTutoProfile(param);
  if (!profile) return <Redirect href={homeOf(persona) as never} />;
  const done = () => {
    void kvSet(tutoSeenKey(profile), "1");
    if (router.canGoBack()) router.back();
    else router.replace(homeOf(persona) as never);
  };
  return <TutoScreen key={profile} profile={profile} onDone={done} />;
}
